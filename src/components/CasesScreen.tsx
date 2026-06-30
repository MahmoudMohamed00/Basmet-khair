// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, Search, MapPin, Phone, User, Tag, Info, X, Calendar, Upload, FileCheck, Users, Heart, Loader2, Printer, FileText, Trash2, FileOutput, ShieldAlert, Mail, Star, ExternalLink, MessageCircle, Map, ArrowUpDown, Edit, DollarSign, MessageSquare, Stethoscope, ChevronDown, ClipboardList, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';
import UnifiedTransferModal from './UnifiedTransferModal';
import { db, storage, auth, handleFirestoreError, OperationType, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, writeBatch, getDocs, limit, updateDoc } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import MedicalModal from './MedicalModal';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';
import Logo from './Logo';
import { checkDuplicateCase } from '../lib/duplicateRegistry';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface FamilyMember {
  name: string;
  relationship: string;
  relationshipOther?: string;
  nationalId?: string;
  age: string;
  workOrSchool: string;
}

interface Case {
  id: string;
  caseCode?: string;
  name: string;
  nationalId: string;
  phone: string;
  address: string;
  village?: string;
  category?: string; // Keep for backward compatibility if any
  categories: string[];
  status: 'pending' | 'active' | 'completed' | 'rejected';
  description: string;
  familyCount: number;
  spouseName: string;
  requestDate: string;
  addedBy?: string;
  rating?: number;
  researcherNotes?: string;
  isPermanent?: boolean;
  registeredIn?: string[];
  monthlyAmount?: number;
  attachments?: Record<string, FileAttachment[]>;
  children?: { name: string; birthDate?: string; age?: string; gender?: string; education?: string; schoolYear?: string }[];
  familyMembers?: FamilyMember[];
  incomeSource?: 'pension' | 'insurance' | 'salary' | 'other' | 'none';
  incomeSourceOther?: string;
  monthlyIncome?: number;
}

const RELATIONSHIP_OPTIONS = [
  'الزوج/ه',
  'اخ',
  'اخت',
  'الام',
  'الاب',
  'العم',
  'العمه',
  'الخال',
  'الخالة',
  'جده',
  'جد',
  'آخر'
];

const EDUCATIONAL_STAGES = [
  'رياض أطفال / حضانة',
  'ابتدائي',
  'إعدادي',
  'ثانوي عام',
  'ثانوي أزهري',
  'ثانوي فني',
  'تعليم فني متطور',
  'معهد متوسط',
  'جامعي',
  'خريج',
  'غير مقيد بالتعليم',
  'أخرى'
];

const SCHOOL_YEARS = [
  'الصف الأول',
  'الصف الثاني',
  'الصف الثالث',
  'الصف الرابع',
  'الصف الخامس',
  'الصف السادس',
  'لا ينطبق'
];

function calculateAgeFromNationalId(nationalId: string): string {
  if (!nationalId || nationalId.length !== 14 || !/^\d+$/.test(nationalId)) {
    return '';
  }
  const centuryDigit = nationalId.charAt(0);
  let century = '';
  if (centuryDigit === '2') {
    century = '19';
  } else if (centuryDigit === '3') {
    century = '20';
  } else {
    return '';
  }
  const year = century + nationalId.substring(1, 3);
  const month = nationalId.substring(3, 5);
  const day = nationalId.substring(5, 7);
  const birthDate = new Date(`${year}-${month}-${day}`);
  if (isNaN(birthDate.getTime())) {
    return '';
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '';
}

function calculateAgeFromBirthDate(birthDateStr: string): string {
  if (!birthDateStr) return '';
  const birthDate = new Date(birthDateStr);
  if (isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '';
}

const CASE_CATEGORIES = [
  'حالات موسمية',
  'مساعدة شهرية',
  'حالات مرضية',
  'مطلقات',
  'أسرة مريض',
  'متزوجين',
  'أسرة سجين',
  'غارمين',
  'أخرى'
];

const CASES_COLUMNS_INFO = [
  { key: 'index', label: 'مسلسل' },
  { key: 'caseCode', label: 'كود الحالة' },
  { key: 'name', label: 'الاسم' },
  { key: 'nationalId', label: 'الرقم القومي' },
  { key: 'category', label: 'التصنيف' },
  { key: 'registeredIn', label: 'مسجلة في' },
  { key: 'familyCount', label: 'أفراد الأسرة' },
  { key: 'spouseName', label: 'اسم الزوج/الزوجة' },
  { key: 'phone', label: 'رقم الهاتف' },
  { key: 'address', label: 'العنوان' },
  { key: 'village', label: 'القرية' },
  { key: 'monthlyIncome', label: 'الدخل الشهري' },
  { key: 'monthlyAmount', label: 'قيمة المساعدة الشهرية' },
  { key: 'isPermanent', label: 'نوع المساعدة (دائمة/مؤقتة)' },
  { key: 'description', label: 'الوصف/ملاحظات' },
  { key: 'signature', label: 'التوقيع (خانة فارغة)' }
];

interface ResearchRecord {
  id: string;
  date: string;
  hasChanged: boolean;
  schoolExpenses: number;
  livingExpenses: number;
  otherExpenses: number;
  incomePension: number;
  incomeInsurance: number;
  incomeSalary: number;
  incomeOther: number;
  notes: string;
  createdAt: any;
}

export default function CasesScreen() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [unifiedTransferCase, setUnifiedTransferCase] = useState<any>(null);
  const [showMedicalModal, setShowMedicalModal] = useState(false);
  const [medicalCase, setMedicalCase] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFilter, setPrintFilter] = useState('all');
  const [printCols, setPrintCols] = useState<string[]>(['index', 'name', 'nationalId', 'category', 'registeredIn', 'familyCount', 'address', 'signature']);
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'rating' | 'status'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Find duplicates in cases
  const duplicatesMap = useMemo(() => {
    const nameCounts: Record<string, number> = {};
    const nationalIdCounts: Record<string, number> = {};
    const phoneCounts: Record<string, number> = {};

    cases.forEach(c => {
      const name = String(c.name || '').trim();
      const nationalId = String(c.nationalId || '').trim();
      const phone = String(c.phone || '').trim();

      if (name && name.length > 2) {
        nameCounts[name] = (nameCounts[name] || 0) + 1;
      }
      if (nationalId && nationalId.length > 3 && nationalId !== '-' && !nationalId.includes('لا يوجد')) {
        nationalIdCounts[nationalId] = (nationalIdCounts[nationalId] || 0) + 1;
      }
      if (phone && phone.length > 4 && phone !== '-' && !phone.includes('لا يوجد')) {
        phoneCounts[phone] = (phoneCounts[phone] || 0) + 1;
      }
    });

    return { nameCounts, nationalIdCounts, phoneCounts };
  }, [cases]);

  const getIsDuplicate = useCallback((c: Case) => {
    const name = String(c.name || '').trim();
    const nationalId = String(c.nationalId || '').trim();
    const phone = String(c.phone || '').trim();

    const isNameDup = name ? ((duplicatesMap.nameCounts[name] || 0) > 1) : false;
    const isNidDup = (nationalId && nationalId !== '-') ? ((duplicatesMap.nationalIdCounts[nationalId] || 0) > 1) : false;
    const isPhoneDup = (phone && phone !== '-') ? ((duplicatesMap.phoneCounts[phone] || 0) > 1) : false;

    return {
      isDuplicate: isNameDup || isNidDup || isPhoneDup,
      reasons: {
        name: isNameDup,
        nationalId: isNidDup,
        phone: isPhoneDup
      }
    };
  }, [duplicatesMap]);

  const duplicateCasesCount = useMemo(() => {
    return cases.filter(c => getIsDuplicate(c).isDuplicate).length;
  }, [cases, getIsDuplicate]);
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const fileInputRefForExcel = useRef<HTMLInputElement>(null);

  // Periodic Research State
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [researchCase, setResearchCase] = useState<Case | null>(null);
  const [researchRecords, setResearchRecords] = useState<ResearchRecord[]>([]);
  const [showAddResearch, setShowAddResearch] = useState(false);
  const [researchFormData, setResearchFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    hasChanged: false,
    schoolExpenses: 0,
    livingExpenses: 0,
    otherExpenses: 0,
    incomePension: 0,
    incomeInsurance: 0,
    incomeSalary: 0,
    incomeOther: 0,
    notes: ''
  });

  const getPreviewValue = (excelHeader: string) => {
    if (!importData || !excelHeader) return '';
    return String(importData.rows[0]?.[excelHeader] || '');
  };

  const [columnFilters, setColumnFilters] = useState({
    name: '',
    nationalId: '',
    category: '',
    phone: ''
  });

  const handleDownloadPDF = async (title: string, elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.direction = 'rtl';
    container.style.padding = '20px';
    container.style.background = '#ffffff';
    container.style.fontFamily = "'Amiri', serif";
    
    const clone = element.cloneNode(true) as HTMLElement;
    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${title}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      document.body.removeChild(container);
    }
  };

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Form State
  const [attachments, setAttachments] = useState<Record<string, FileAttachment[]>>({});
  const initialForm = {
    name: '',
    caseCode: '',
    nationalId: '',
    phone: '',
    address: '',
    village: '',
    categories: ['أخرى'] as string[],
    status: 'pending',
    description: '',
    familyCount: 1,
    spouseName: '',
    requestDate: new Date().toISOString().split('T')[0],
    rating: 1,
    researcherNotes: '',
    isPermanent: false,
    registeredIn: [] as string[],
    monthlyAmount: 0,
    incomeSource: 'none' as any,
    incomeSourceOther: '',
    monthlyIncome: 0,
    familyMembers: [] as FamilyMember[],
    children: [] as any[]
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    const q = query(collection(db, 'cases'), orderBy(sortBy, sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case));
      setCases(casesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    return () => unsubscribe();
  }, [sortBy, sortOrder]);

  const generateCaseCode = (existing: Case[]) => {
    const lastNum = existing
      .map(c => c.caseCode)
      .filter(num => num?.startsWith('C'))
      .map(num => {
        const numPart = num?.substring(1);
        return numPart ? parseInt(numPart) : 0;
      })
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a)[0] || 0;
    return `C${lastNum + 1}`;
  };

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.nationalId.length !== 14) {
      alert('رقم الهوية يجب أن يكون 14 رقماً');
      return;
    }

    setLoading(true);
    let duplicateWarnings: string[] = [];
    try {
      duplicateWarnings = await checkDuplicateCase(formData.name, formData.nationalId);
    } catch (err) {
      console.error('Error checking duplicates:', err);
    } finally {
      setLoading(false);
    }

    let warningMessage = '';
    if (duplicateWarnings.length > 0) {
      warningMessage = `\n\n⚠️ تنبيه: تم كشف تكرار في القوائم التالية:\n- ${duplicateWarnings.join('\n- ')}\n\nهل تريد الاستمرار وإضافة الحالة على أي حال؟`;
    }

    setConfirmConfig({
      isOpen: true,
      title: duplicateWarnings.length > 0 ? '⚠️ تنبيه: حالة مكررة مسجلة مسبقاً' : 'تأكيد إضافة حالة',
      message: `هل أنت متأكد من رغبتك في إضافة الحالة "${formData.name}" إلى النظام؟` + warningMessage,
      onConfirm: async () => {
        try {
          const code = formData.caseCode || generateCaseCode(cases);
          await addDoc(collection(db, 'cases'), {
            ...formData,
            caseCode: code,
            familyCount: Number(formData.familyCount),
            rating: Number(formData.rating),
            monthlyAmount: formData.categories.includes('مساعدة شهرية') ? Number(formData.monthlyAmount) : 0,
            attachments,
            addedBy: auth.currentUser?.email || 'Unknown',
            createdAt: serverTimestamp(),
          });
          setShowAddForm(false);
          setAttachments({});
          setFormData(initialForm);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert('تم إضافة الحالة بنجاح وبدء تتبعها في النظام');
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'cases');
        }
      }
    });
  };

  const handleEditCase = (c: Case) => {
    setEditingCase(c);
    setFormData({
      name: c.name || '',
      caseCode: c.caseCode || '',
      nationalId: c.nationalId || '',
      phone: c.phone || '',
      address: c.address || '',
      village: c.village || '',
      categories: c.categories || (c.category ? [c.category] : ['أخرى']),
      status: c.status || 'pending',
      description: c.description || '',
      familyCount: c.familyCount || 1,
      spouseName: c.spouseName || '',
      requestDate: c.requestDate || new Date().toISOString().split('T')[0],
      rating: c.rating || 1,
      researcherNotes: c.researcherNotes || '',
      isPermanent: c.isPermanent || false,
      registeredIn: Array.isArray(c.registeredIn) ? c.registeredIn : [],
      monthlyAmount: c.monthlyAmount || 0,
      incomeSource: c.incomeSource || 'none',
      incomeSourceOther: c.incomeSourceOther || '',
      monthlyIncome: c.monthlyIncome || 0,
      familyMembers: c.familyMembers || [],
      children: c.children || []
    });
    setAttachments(c.attachments || {});
    setShowEditForm(true);
  };

  const handleUpdateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCase) return;

    if (formData.nationalId.length !== 14) {
      alert('رقم الهوية يجب أن يكون 14 رقماً');
      return;
    }

    try {
      const code = formData.caseCode || editingCase.caseCode || generateCaseCode(cases);
      await updateDoc(doc(db, 'cases', editingCase.id), {
        ...formData,
        caseCode: code,
        familyCount: Number(formData.familyCount),
        rating: Number(formData.rating),
        monthlyAmount: formData.categories.includes('مساعدة شهرية') ? Number(formData.monthlyAmount) : 0,
        attachments,
        updatedAt: serverTimestamp(),
      });
      setShowEditForm(false);
      setEditingCase(null);
      setAttachments({});
      alert('تم تحديث بيانات الحالة بنجاح');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${editingCase.id}`);
    }
  };

  const addFamilyMember = () => {
    setFormData(prev => ({
      ...prev,
      familyMembers: [...(prev.familyMembers || []), { name: '', relationship: 'الزوج/ه', relationshipOther: '', nationalId: '', age: '', workOrSchool: '' }]
    }));
  };

  const removeFamilyMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      familyMembers: (prev.familyMembers || []).filter((_, i) => i !== index)
    }));
  };

  const updateFamilyMember = (index: number, field: keyof FamilyMember, value: string) => {
    setFormData(prev => {
      const newMembers = [...(prev.familyMembers || [])];
      newMembers[index] = { ...newMembers[index], [field]: value };
      if (field === 'nationalId' && value.length === 14) {
        newMembers[index].age = calculateAgeFromNationalId(value) || newMembers[index].age;
      }
      return { ...prev, familyMembers: newMembers };
    });
  };

  const addChild = () => {
    setFormData(prev => ({
      ...prev,
      children: [...(prev.children || []), { name: '', birthDate: '', age: '', gender: 'ذكر', education: 'رياض أطفال / حضانة', schoolYear: 'لا ينطبق' }]
    }));
  };

  const removeChild = (index: number) => {
    setFormData(prev => ({
      ...prev,
      children: (prev.children || []).filter((_, i) => i !== index)
    }));
  };

  const updateChild = (index: number, field: string, value: string) => {
    setFormData(prev => {
      const newChildren = [...(prev.children || [])];
      newChildren[index] = { ...newChildren[index], [field]: value };
      if (field === 'birthDate') {
        newChildren[index].age = calculateAgeFromBirthDate(value) || newChildren[index].age;
      }
      return { ...prev, children: newChildren };
    });
  };

  const handleDeleteCase = (id: string, name: string) => {
    const caseData = cases.find(c => c.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف حالة',
      message: `هل أنت متأكد من حذف الحالة "${name}" نهائياً؟`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'cases', id));
          if (caseData) {
            await logSystemAction('delete', 'cases', id, caseData, `حذف حالة: ${name}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `cases/${id}`);
        }
      }
    });
  };

  const handleDeleteAllCases = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع الحالات',
      message: 'تحذير خطير: هل أنت متأكد من مسح جميع بيانات الحالات من النظام بالكامل؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        try {
          const q = query(collection(db, 'cases'));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'cases');
        }
      }
    });
  };

  const MAPPING_FIELDS = [
    { id: 'name', label: 'الاسم رباعي' },
    { id: 'nationalId', label: 'الرقم القومي' },
    { id: 'phone', label: 'رقم الهاتف' },
    { id: 'address', label: 'العنوان بالتفصيل' },
    { id: 'category', label: 'التصنيف (أيتام، مرضى..)' },
    { id: 'registeredIn', label: 'مسجل في (دائم، موسم..)' },
    { id: 'familyCount', label: 'عدد أفراد الأسرة' },
    { id: 'spouseName', label: 'اسم الزوج / الزوجة' }
  ];

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length > 0) {
          const headers = Object.keys(data[0] as any);
          setImportData({ headers, rows: data });
          
          // Initial semi-smart mapping
          const initialMap: Record<string, string> = {
            name: headers.find(h => h.includes('الاسم') || h.includes('name')) || '',
            nationalId: headers.find(h => h.includes('رقم الهوية') || h.includes('قومي') || h.includes('national')) || '',
            phone: headers.find(h => h.includes('هاتف') || h.includes('تليفون') || h.includes('phone')) || '',
            address: headers.find(h => h.includes('عنوان') || h.includes('address')) || '',
            category: headers.find(h => h.includes('تصنيف') || h.includes('نوع') || h.includes('category')) || '',
            registeredIn: headers.find(h => h.includes('مسجل في') || h.includes('نوع الحالة')) || '',
            familyCount: headers.find(h => h.includes('أفراد') || h.includes('عدد')) || '',
            spouseName: headers.find(h => h.includes('زوج')) || ''
          };
          setFieldMapping(initialMap);
        }
      } catch (error) {
        console.error('Excel Read Error:', error);
        alert('خطأ في قراءة ملف الإكسل');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const processMappingImport = async () => {
    if (!importData) return;
    setImporting(true);
    try {
      let count = 0;
      const getVal = (row: any, fieldId: string) => fieldMapping[fieldId] ? String(row[fieldMapping[fieldId]]) : '';
      
      for (const row of importData.rows) {
        const name = getVal(row, 'name');
        const nationalId = getVal(row, 'nationalId');
        
        if (name && nationalId) {
          const cat = getVal(row, 'category');
          await addDoc(collection(db, 'cases'), {
            name,
            nationalId,
            phone: getVal(row, 'phone'),
            address: getVal(row, 'address'),
            categories: cat ? [cat] : ['أخرى'],
            registeredIn: getVal(row, 'registeredIn') ? [getVal(row, 'registeredIn')] : [],
            status: 'pending',
            description: '',
            familyCount: Number(getVal(row, 'familyCount')) || 1,
            spouseName: getVal(row, 'spouseName'),
            requestDate: new Date().toISOString().split('T')[0],
            children: [],
            addedBy: auth.currentUser?.email || 'Imported',
            createdAt: serverTimestamp(),
          });
          count++;
        }
      }
      alert(`تم استيراد ${count} حالة بنجاح`);
      setImportData(null);
    } catch (error) {
      console.error('Import Error:', error);
      alert('حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = searchQuery === '' || 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.categories || []).some(cat => cat.toLowerCase().includes(searchQuery.toLowerCase())) ||
      c.nationalId.includes(searchQuery) ||
      (c.registeredIn && c.registeredIn.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || (c.categories || []).includes(categoryFilter);
    
    // Only show active cases for regular users, pending/rejected only if explicitly searched
    const matchesStatus = c.status === 'active' || c.status === 'pending' || searchQuery !== '';

    const matchesColumnName = c.name.toLowerCase().includes(columnFilters.name.toLowerCase());
    const matchesColumnId = c.nationalId.includes(columnFilters.nationalId);
    const matchesColumnCategory = (c.categories || []).join(', ').toLowerCase().includes(columnFilters.category.toLowerCase());
    const matchesColumnPhone = c.phone.includes(columnFilters.phone);

    const matchesDup = !filterDuplicatesOnly || getIsDuplicate(c).isDuplicate;

    return matchesSearch && matchesCategory && matchesStatus && matchesColumnName && matchesColumnId && matchesColumnCategory && matchesColumnPhone && matchesDup;
  });

  useEffect(() => {
    if (researchCase && showResearchModal) {
      const q = query(
        collection(db, 'cases', researchCase.id, 'periodic_research'), 
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snap) => {
        setResearchRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResearchRecord)));
      }, (error) => handleFirestoreError(error, OperationType.LIST, `cases/${researchCase.id}/periodic_research`));

      return () => unsubscribe();
    }
  }, [researchCase, showResearchModal]);

  const openResearch = (c: Case) => {
    setResearchCase(c);
    setShowResearchModal(true);
    setResearchRecords([]);
  };

  const handleAddResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!researchCase) return;

    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد حفظ البحث الدوري',
      message: `هل أنت متأكد من حفظ التحديث الدوري لبيانات الحالة: ${researchCase.name}؟`,
      onConfirm: async () => {
        try {
          await addDoc(collection(db, 'cases', researchCase.id, 'periodic_research'), {
            ...researchFormData,
            createdAt: serverTimestamp()
          });
          setShowAddResearch(false);
          setResearchFormData({
            date: new Date().toISOString().split('T')[0],
            hasChanged: false,
            schoolExpenses: 0,
            livingExpenses: 0,
            otherExpenses: 0,
            incomePension: 0,
            incomeInsurance: 0,
            incomeSalary: 0,
            incomeOther: 0,
            notes: ''
          });
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert('تم إضافة التحديث الدوري لبيانات الحالة');
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `cases/${researchCase.id}/periodic_research`);
        }
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedCaseIds.length === filteredCases.length) {
      setSelectedCaseIds([]);
    } else {
      setSelectedCaseIds(filteredCases.map(c => c.id));
    }
  };

  const toggleSelectCase = (id: string) => {
    setSelectedCaseIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handlePrintAllCoupons = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const casesToPrint = selectedCaseIds.length > 0 
      ? filteredCases.filter(c => selectedCaseIds.includes(c.id))
      : filteredCases;

    const couponsHtml = casesToPrint.map(c => `
      <div class="coupon">
        <div class="header">
          <span>بصمة خير - بون مساعدة</span>
        </div>
        <div class="info">
          <p><strong>الاسم:</strong> ${c.name}</p>
          <p><strong>الرقم القومي:</strong> ${c.nationalId}</p>
          <p><strong>التصنيف:</strong> ${(c.categories || []).join(', ')}</p>
          <p><strong>أفراد الأسرة:</strong> ${c.familyCount}</p>
          <p><strong>تاريخ الطلب:</strong> ${c.requestDate}</p>
        </div>
        <div class="footer">يُرجى إحضار البون والبطاقة</div>
      </div>
    `).join('');

    const content = `
      <html>
        <head>
          <title>طباعة البونات - بصمة خير</title>
          <style>
            body { font-family: sans-serif; direction: rtl; margin: 0; padding: 10mm; }
            .grid { 
              display: grid; 
              grid-template-columns: repeat(2, 1fr); 
              gap: 10mm;
            }
            .coupon { 
              border: 1px solid #000; 
              padding: 5mm; 
              height: 45mm; 
              position: relative; 
              page-break-inside: avoid;
              box-sizing: border-box;
              font-size: 10px;
            }
            .header { font-weight: bold; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 2mm; margin-bottom: 2mm; text-align: center; }
            .info p { margin: 1mm 0; line-height: 1.2; }
            .footer { position: absolute; bottom: 2mm; right: 2mm; left: 2mm; font-size: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 1mm; }
            @media print {
              .grid { gap: 5mm; }
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${couponsHtml}
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printDate = new Date().toLocaleDateString('ar-EG');
    let filteredForPrint = printFilter === 'all' 
      ? filteredCases 
      : filteredCases.filter(c => c.category === printFilter);

    if (selectedCaseIds.length > 0) {
      filteredForPrint = filteredCases.filter(c => selectedCaseIds.includes(c.id));
    }

    const headerHtml = CASES_COLUMNS_INFO
      .filter((col) => printCols.includes(col.key))
      .map((col) => {
        let style = '';
        if (col.key === 'index') style = 'style="width: 40px;"';
        if (col.key === 'signature') style = 'style="width: 120px;"';
        return `<th ${style}>${col.label}</th>`;
      })
      .join('');

    const rowsHtml = filteredForPrint.map((c, i) => {
      const cellsHtml = CASES_COLUMNS_INFO
        .filter((col) => printCols.includes(col.key))
        .map((col) => {
          let val = '';
          let style = '';
          if (col.key === 'index') {
            val = String(i + 1);
          } else if (col.key === 'caseCode') {
            val = c.caseCode || '-';
          } else if (col.key === 'name') {
            val = c.name;
            style = 'style="text-align: right; font-weight: bold;"';
          } else if (col.key === 'nationalId') {
            val = c.nationalId || '-';
          } else if (col.key === 'category') {
            val = c.category || (c.categories && c.categories.join('، ')) || '-';
          } else if (col.key === 'registeredIn') {
            val = (c.registeredIn && c.registeredIn.join('، ')) || 'غير محدد';
            style = 'style="font-size: 11px;"';
          } else if (col.key === 'familyCount') {
            val = String(c.familyCount || 0);
          } else if (col.key === 'spouseName') {
            val = c.spouseName || '-';
          } else if (col.key === 'phone') {
            val = c.phone || '-';
          } else if (col.key === 'address') {
            val = c.address || '-';
            style = 'style="font-size: 11px;"';
          } else if (col.key === 'village') {
            val = c.village || '-';
          } else if (col.key === 'monthlyIncome') {
            val = `${c.monthlyIncome || 0} ج.م`;
          } else if (col.key === 'monthlyAmount') {
            val = `${c.monthlyAmount || 0} ج.م`;
          } else if (col.key === 'isPermanent') {
            val = c.isPermanent ? 'دائمة' : 'مؤقتة';
          } else if (col.key === 'description') {
            val = c.description || '-';
          } else if (col.key === 'signature') {
            val = '';
          }
          return `<td ${style}>${val}</td>`;
        })
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');

    const content = `
      <html>
        <head>
          <title>كشف الحالات - بصمة خير</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 20px; color: #333; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #065f46; padding-bottom: 15px; }
            .society-details { text-align: right; }
            .society-details p { margin: 2px 0; font-size: 14px; font-weight: bold; }
            .report-title { text-align: center; margin: 20px 0; }
            .report-title h1 { color: #065f46; font-size: 24px; margin-bottom: 5px; }
            .report-title p { color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #065f46; padding: 8px; text-align: center; font-size: 13px; }
            th { background-color: #f0fdf4; color: #065f46; }
            .footer-sign { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 40px; }
            .sign-box { text-align: center; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header-info">
            <div class="society-details">
              <p>مديرية التضامن الاجتماعي بالدقهلية</p>
              <p>ادارة التضامن الاجتماعي بنبروه</p>
              <p>جمعية بصمة خير بنبروه</p>
              <p>المشهرة برقم ٢٥١٠ لسنة ٢٠١٥</p>
            </div>
            <div style="text-align: center;">
              <p style="font-size: 10px; color: #065f46; margin: 0; font-weight: bold;">بصمة خير</p>
            </div>
            <div style="text-align: left;">
              <p>التاريخ: ${printDate}</p>
              <p>نوع الكشف: ${printFilter === 'all' ? 'عام' : printFilter}</p>
            </div>
          </div>

          <div class="report-title">
            <h1>كشف توزيع المساعدات</h1>
            <p>سجل الحالات المستهدفة بالنظام</p>
          </div>

          <table>
            <thead>
              <tr>
                ${headerHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer-sign">
            <div class="sign-box">
              <p>أمين الصندوق</p>
              <p>....................</p>
            </div>
            <div class="sign-box">
              <p>سكرتير الجمعية</p>
              <p>....................</p>
            </div>
            <div class="sign-box">
              <p>رئيس مجلس الإدارة</p>
              <p>....................</p>
            </div>
          </div>
          
          <div style="margin-top: 50px; text-align: center; font-size: 10px; color: #999;">
            تم استخراج هذا الكشف بواسطة نظام بصمة خير - تطوير محمود جاويش (Mahmoud Gawish)
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      setShowPrintModal(false);
    }, 500);
  };

  const handleDownloadCasePDF = async (c: Case) => {
    const reportElement = document.createElement('div');
    reportElement.style.padding = '40px';
    reportElement.style.direction = 'rtl';
    reportElement.style.fontFamily = 'Amiri, serif';
    reportElement.style.backgroundColor = '#ffffff';
    reportElement.style.width = '210mm';
    reportElement.style.position = 'fixed';
    reportElement.style.left = '-9999px';

    reportElement.innerHTML = `
      <div style="border: 4px solid #065f46; padding: 30px; border-radius: 20px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #065f46; padding-bottom: 20px; margin-bottom: 30px;">
          <div style="text-align: right;">
            <h1 style="color: #065f46; margin: 0; font-size: 28px;">جمعية بصمة خير</h1>
            <p style="margin: 5px 0; font-weight: bold;">تقرير حالة اجتماعية شامل</p>
          </div>
          <div style="text-align: left;">
            <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
            <p>ID: ${c.id.substring(0, 8)}</p>
          </div>
        </div>

        <div style="grid-template-columns: 1fr 1fr; display: grid; gap: 20px; text-align: right; margin-bottom: 30px;">
          <div style="padding: 15px; background: #f0fdf4; border-radius: 12px;">
            <p style="color: #065f46; margin-bottom: 5px; font-weight: bold;">الاسم الكامل:</p>
            <p style="font-size: 18px; font-weight: 800;">${c.name}</p>
          </div>
          <div style="padding: 15px; background: #f0fdf4; border-radius: 12px;">
            <p style="color: #065f46; margin-bottom: 5px; font-weight: bold;">الرقم القومي:</p>
            <p style="font-size: 18px; font-weight: 800;">${c.nationalId}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">رقم الهاتف:</p>
            <p style="font-weight: bold;">${c.phone}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">عدد أفراد الأسرة:</p>
            <p style="font-weight: bold;">${c.familyCount} أفراد</p>
          </div>
        </div>

        <div style="text-align: right; margin-bottom: 30px;">
          <h3 style="color: #065f46; border-bottom: 1px solid #f0fdf4; padding-bottom: 10px;">التصنيفات المسجلة:</h3>
          <p style="font-weight: bold; padding: 10px;">${(c.categories || []).join(' - ')}</p>
        </div>

        <div style="text-align: right; margin-bottom: 30px;">
          <h3 style="color: #065f46; border-bottom: 1px solid #f0fdf4; padding-bottom: 10px;">ملاحظات الباحث الاجتماعي:</h3>
          <p style="line-height: 1.8; padding: 10px; background: #f8fafc; border-radius: 12px;">${c.researcherNotes || 'لا توجد ملاحظات بحث حالية'}</p>
        </div>

        <div style="margin-top: 50px; display: flex; justify-content: space-around; text-align: center;">
          <div>
            <p>توقيع الباحث</p>
            <p>....................</p>
          </div>
          <div>
            <p>ختم الجمعية</p>
            <div style="width: 80px; height: 80px; border: 2px dashed #065f46; border-radius: 50%; margin: 10px auto; opacity: 0.3;"></div>
          </div>
          <div>
            <p>اعتماد رئيس مجلس الإدارة</p>
            <p>....................</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(reportElement);
    try {
      const canvas = await html2canvas(reportElement, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Report-${c.name}.pdf`);
    } finally {
      document.body.removeChild(reportElement);
    }
  };

  const handlePrintCoupon = (c: Case) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>بون استلام - ${c.name}</title>
          <style>
            body { font-family: sans-serif; direction: rtl; display: flex; justify-content: center; padding: 20px; }
            .coupon { border: 4px dashed #065f46; padding: 40px; width: 400px; text-align: center; border-radius: 20px; }
            h1 { color: #065f46; margin-bottom: 20px; }
            .info { text-align: right; margin-top: 20px; }
            .footer { margin-top: 40px; font-size: 12px; opacity: 0.6; }
          </style>
        </head>
        <body>
          <div class="coupon">
            <h1>بصمة خير</h1>
            <h2>بون استلام مساعدة</h2>
            <div class="info">
              <p><strong>الاسم:</strong> ${c.name}</p>
              <p><strong>الرقم القومي:</strong> ${c.nationalId}</p>
              <p><strong>العنوان:</strong> ${c.address}</p>
              <p><strong>الهاتف:</strong> ${c.phone}</p>
              <p><strong>التصنيف:</strong> ${(c.categories || []).join(', ')}</p>
              <p><strong>أفراد الأسرة:</strong> ${c.familyCount}</p>
              <p><strong>تاريخ الطلب:</strong> ${c.requestDate}</p>
            </div>
            <div class="footer">يُرجى إحضار هذا البون والبطاقة الشخصية عند الاستلام</div>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };



  const handleExcelExport = () => {
    const dataToExport = filteredCases.map((c, index) => ({
      'مسلسل': index + 1,
      'اسم الحالة': c.name,
      'الرقم القومي': c.nationalId,
      'رقم الهاتف': c.phone,
      'العنوان الكامل': c.address,
      'التصنيفات الملحقة': (c.categories || []).join(' - '),
      'جهة التسجيل': c.registeredIn || 'جهة عامة',
      'عدد أفراد الأسرة': c.familyCount,
      'الزوج / الزوجة': c.spouseName,
      'تاريخ تسجيل الطلب': c.requestDate,
      'المبلغ الشهري': c.monthlyAmount || 0,
      'المسؤول عن الإضافة': c.addedBy || 'نظام بصمة خير',
      'الحالة الحالية': c.status === 'active' ? 'نشط' : c.status === 'completed' ? 'تمت المساعدة' : c.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار',
      'تقرير الباحث': c.researcherNotes || 'لا يوجد ملاحظات',
      'حالة الكفالة': c.isPermanent ? 'كفالة دائمة' : 'مساعدة مقطوعة',
      'عدد الأبناء في المدرسة': (c.children || []).filter(ch => ch.education).length
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحالات");
    XLSX.writeFile(wb, `كشف_الحالات_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="p-6 font-sans">
      {/* Visual Section Header Banner */}
      <div className="relative overflow-hidden rounded-[2rem] bg-emerald-900 h-48 flex items-center p-8 mb-8 text-white shadow-lg border border-emerald-800">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&q=80&w=1200" 
            alt="Cases Management" 
            className="w-full h-full object-cover opacity-20 select-none"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-900/90 to-emerald-950/40" />
        </div>
        <div className="relative z-10 w-full text-right">
          <h1 className="text-3xl font-black mb-2">إدارة الحالات العامة</h1>
          <p className="text-emerald-200 text-xs md:text-sm font-semibold max-w-2xl leading-relaxed">
            رعاية وتتبع الأسر المتعففة وتوفير الدعم الاجتماعي والمالي المستدام لإحداث بصمة حقيقية في حياتهم. يتيح لك هذا القسم إضافة الحالات العامة وبحث احتياجها وتصنيف استحقاقها بدقة.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-right">
        <div>
          <h2 className="text-xl font-black text-emerald-950">قائمة المستفيدين</h2>
          <p className="text-emerald-700/60 text-xs mt-1">سجل بجميع الحالات المعتمدة والمستفيدة من خدمات الجمعية</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDownloadPDF('كشف_الحالات', 'cases-table-full')}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold shadow-sm whitespace-nowrap"
          >
            <FileText className="w-5 h-5" />
            <span>تحميل PDF</span>
          </button>
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRefForExcel} 
            onChange={handleExcelImport}
            accept=".xlsx, .xls"
          />
          <button 
            onClick={handleDeleteAllCases}
            className="flex items-center gap-2 bg-rose-50 border-2 border-rose-100 text-rose-700 px-6 py-3 rounded-xl hover:bg-rose-100 transition-all font-bold"
            title="حذف جميع الحالات"
          >
            <Trash2 className="w-5 h-5" />
            <span>حذف الكل</span>
          </button>
          <button 
            onClick={handlePrintAllCoupons}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold"
          >
            <FileText className="w-5 h-5" />
            <span>طباعة بونات الكل</span>
          </button>
          <button 
            onClick={handleExcelExport}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold"
          >
            <FileText className="w-5 h-5" />
            <span>تصدير Excel</span>
          </button>
          <button 
            onClick={() => fileInputRefForExcel.current?.click()}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold"
          >
            <FileOutput className="w-5 h-5" />
            <span>استيراد Excel</span>
          </button>
          <button 
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold"
          >
            <Printer className="w-5 h-5" />
            <span>طباعة الكشف</span>
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all font-bold whitespace-nowrap justify-center"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة حالة جديدة</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
        {duplicateCasesCount > 0 && (
          <div 
            onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
            className={cn(
              "p-4 flex flex-row-reverse items-center justify-between cursor-pointer border-b transition-all text-right select-none",
              filterDuplicatesOnly 
                ? "bg-rose-100 border-rose-300 text-rose-950 shadow-inner" 
                : "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100"
            )}
          >
            <div className="flex items-center gap-3 flex-row-reverse">
              <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce shrink-0" />
              <div>
                <span className="font-extrabold text-sm block">تم كشف {duplicateCasesCount} حالة تكرار في الاسم أو الرقم القومي أو الهاتف!</span>
                <span className="text-xs font-bold text-rose-600">انقر هنا لعرض الحالات المكررة فقط وتصفيتها لتدقيقها والتحقق منها</span>
              </div>
            </div>
            <span className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all",
              filterDuplicatesOnly ? "bg-rose-600 text-white" : "bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
            )}>
              {filterDuplicatesOnly ? "عرض كل الحالات" : "عرض الحالات المكررة"}
            </span>
          </div>
        )}
        <div className="p-4 border-b border-emerald-50 bg-emerald-50/20 overflow-x-auto">
          <div className="flex gap-2 items-center min-w-max">
            <button 
              onClick={() => setCategoryFilter('all')}
              className={`px-6 py-2.5 rounded-xl font-bold transition-all border-2 whitespace-nowrap ${
                categoryFilter === 'all' 
                ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200" 
                : "bg-white border-emerald-50 text-emerald-700 hover:border-emerald-200"
              }`}
            >
              الكل
            </button>
            {CASE_CATEGORIES.map(cat => (
              <button 
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-6 py-2.5 rounded-xl font-bold transition-all border-2 whitespace-nowrap ${
                  categoryFilter === cat 
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200" 
                  : "bg-white border-emerald-50 text-emerald-700 hover:border-emerald-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-b border-emerald-50 bg-emerald-50/30 flex flex-col md:flex-row items-center gap-4 text-right dir-rtl">
          <div className="flex items-center gap-2 flex-grow w-full">
            <Search className="w-5 h-5 text-emerald-400 shrink-0" />
            <input 
              type="text" 
              placeholder="بحث سريع شامل (اسم، رقم قومي، تصنيف)..."
              className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-900 placeholder-emerald-300 outline-none text-right"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto border-r border-emerald-100 pr-4 flex-row-reverse">
            <button 
              onClick={handleDeleteAllCases}
              className="flex items-center gap-2 bg-rose-50 text-rose-700 px-4 py-2 rounded-xl hover:bg-rose-100 transition-all font-bold text-xs border border-rose-100"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف الكل</span>
            </button>
            <div className="flex items-center gap-2 text-stone-400 font-bold text-sm border-r border-emerald-100 pr-4">
               <span>الحالات:</span>
               <span className="text-emerald-600 font-mono">{filteredCases.length}</span>
            </div>
            {selectedCaseIds.length > 0 && (
              <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                <span className="text-emerald-700 text-xs font-bold">المحدد: {selectedCaseIds.length}</span>
                <button 
                  onClick={() => setSelectedCaseIds([])}
                  className="text-rose-500 hover:text-rose-700 p-0.5"
                  title="إلغاء التحديد"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 border-r border-emerald-100 pr-4">
              <ArrowUpDown className="w-4 h-4 text-emerald-500" />
              <label className="text-xs font-bold text-emerald-700 whitespace-nowrap">ترتيب:</label>
              <select 
                className="bg-white border border-emerald-100 text-emerald-800 text-xs rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="createdAt">تاريخ الإضافة</option>
                <option value="name">الاسم</option>
                <option value="rating">الاحتياج</option>
                <option value="status">الحالة</option>
              </select>
              <select 
                 className="bg-white border border-emerald-100 text-emerald-800 text-xs rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                 value={sortOrder}
                 onChange={(e) => setSortOrder(e.target.value as any)}
              >
                 <option value="desc">تنازلي</option>
                 <option value="asc">تصاعدي</option>
              </select>
            </div>
          </div>
        </div>

        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          {loading ? (
            <div className="p-12 text-center text-emerald-600 font-medium">جاري التحميل...</div>
          ) : (
            <table id="cases-table-full" className="w-full text-right min-w-[1200px] bg-white" dir="rtl">
              <thead>
                <tr className="bg-stone-50 text-emerald-800 text-sm font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      checked={filteredCases.length > 0 && selectedCaseIds.length === filteredCases.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">الكود</th>
                  <th className="px-6 py-4">الاسم / رقم الهوية</th>
                  <th className="px-6 py-4">التصنيف</th>
                  <th className="px-6 py-4">التواصل</th>
                  <th className="px-10 py-4">الاحتياج</th>
                  <th className="px-6 py-4">العمليات</th>
                  <th className="px-6 py-4">الحالة</th>
                </tr>
                <tr className="bg-emerald-50/50 border-b border-emerald-100">
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2">
                    <input 
                      type="text" 
                      placeholder="كود..."
                      className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                      value={columnFilters.caseCode || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, caseCode: e.target.value }))}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <div className="flex flex-col gap-1">
                      <input 
                        type="text" 
                        placeholder="فلترة بالاسم..."
                        className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                        value={columnFilters.name}
                        onChange={(e) => setColumnFilters(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <input 
                        type="text" 
                        placeholder="فلترة بالرقم القومي..."
                        className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal tabular-nums"
                        value={columnFilters.nationalId}
                        onChange={(e) => setColumnFilters(prev => ({ ...prev, nationalId: e.target.value }))}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="فلترة بالتصنيف..."
                      className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                      value={columnFilters.category}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, category: e.target.value }))}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="فلترة بالهاتف..."
                      className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal tabular-nums"
                      value={columnFilters.phone}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </td>
                  <td className="px-10 py-2"></td>
                  <td className="px-6 py-2"></td>
                  <td className="px-6 py-2"></td>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {filteredCases.length > 0 ? filteredCases.map((c, index) => (
                  <tr key={c.id} className={cn(
                    "hover:bg-emerald-50/20 transition-colors",
                    selectedCaseIds.includes(c.id) && "bg-emerald-50/40"
                  )}>
                    <td className="px-6 py-4 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                        checked={selectedCaseIds.includes(c.id)}
                        onChange={() => toggleSelectCase(c.id)}
                      />
                    </td>
                    <td className="px-6 py-4 text-emerald-600 font-black text-xs tabular-nums">{c.caseCode || index + 1}</td>
                    <td className="px-6 py-4">
                      {(() => {
                        const dupInfo = getIsDuplicate(c);
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="font-bold text-emerald-950 flex items-center gap-2">
                              <span className={cn(
                                "font-bold text-sm",
                                dupInfo.isDuplicate ? "text-rose-700 font-extrabold" : "text-emerald-950"
                              )}>{c.name}</span>
                              {c.isPermanent && <span className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.5 rounded-md">دائم</span>}
                            </div>
                            <div className="text-xs text-emerald-600/70 tabular-nums">رقم قومي: {c.nationalId}</div>
                            {dupInfo.isDuplicate && (
                              <div className="flex items-center gap-1.5 text-[9px] font-black bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.5 rounded-lg w-max select-none">
                                <AlertTriangle className="w-3 h-3 text-rose-500 animate-pulse" />
                                <span>تكرار في: </span>
                                {dupInfo.reasons.name && <span className="bg-rose-100 text-rose-800 px-1 rounded">الاسم</span>}
                                {dupInfo.reasons.nationalId && <span className="bg-rose-100 text-rose-800 px-1 rounded">الرقم القومي</span>}
                                {dupInfo.reasons.phone && <span className="bg-rose-100 text-rose-800 px-1 rounded">الهاتف</span>}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(c.categories || []).map(cat => (
                          <span key={cat} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold">
                            {cat}
                          </span>
                        ))}
                        {(c.categories || []).includes('مساعدة شهرية') && c.monthlyAmount && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 w-fit">
                            <DollarSign className="w-3 h-3" />
                            {c.monthlyAmount} ج.م
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <a href={`tel:${c.phone}`} className="text-emerald-800 text-sm tabular-nums hover:text-emerald-600 transition-colors flex items-center gap-1 font-bold">
                          <Phone className="w-3 h-3" />
                          {c.phone}
                        </a>
                        <a 
                          href={`https://wa.me/+2${c.phone.startsWith('0') ? c.phone.substring(1) : c.phone}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1 font-bold text-emerald-600 hover:text-emerald-700 text-[10px] bg-emerald-50 px-2 py-0.5 rounded-lg w-fit"
                        >
                          <MessageSquare className="w-3 h-3" />
                          واتساب
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {[...Array(10)].map((_, i) => (
                          <div 
                            key={i} 
                            className={cn(
                              "w-1.5 h-4 rounded-full transition-all",
                              i < (c.rating || 0) ? "bg-amber-400" : "bg-stone-100"
                            )} 
                          />
                        ))}
                        <span className="text-xs font-bold text-amber-700 mr-2">{c.rating}/10</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setMedicalCase({ id: c.id, name: c.name });
                            setShowMedicalModal(true);
                          }}
                          className="p-3 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-blue-100 shadow-sm"
                          title="الملف الطبي"
                        >
                          <Stethoscope className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDownloadCasePDF(c)}
                          className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="تحميل تقرير الحالة PDF"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleEditCase(c)}
                          className="p-3 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="تعديل الحالة"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => setSelectedCase(c)}
                          className="p-3 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="عرض التقرير التفصيلي"
                        >
                          <FileOutput className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handlePrintCoupon(c)}
                          className="p-3 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="طباعة بون"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => setUnifiedTransferCase({
                            id: c.id,
                            name: c.name,
                            nationalId: c.nationalId,
                            phone: c.phone || '',
                            address: c.address || '',
                            village: c.village || '',
                            familyCount: Number(c.familyCount) || 1,
                            sourceSection: 'cases',
                            sourceSectionLabel: 'الحالات العامة',
                            sourceCollection: 'cases'
                          })}
                          className="p-3 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="الربط والنقل بين الأقسام"
                        >
                          <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                        </button>
                        <button 
                          onClick={() => openResearch(c)}
                          className="p-3 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="البحث الدوري"
                        >
                          <ClipboardList className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCase(c.id, c.name);
                          }}
                          className="p-3 text-rose-600 hover:bg-rose-50 rounded-xl transition-all shadow-sm border border-rose-200 hover:border-rose-300 hover:bg-rose-100"
                          title="حذف نهائي"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold",
                        c.status === 'active' ? "bg-emerald-100 text-emerald-700" : 
                        c.status === 'completed' ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      )}>
                        {c.status === 'active' ? 'قيد التنفيذ' : 
                         c.status === 'completed' ? 'تمت المساعدة' : 'انتظار'}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-emerald-400">لا توجد حالات مسجلة حالياً</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedCase(null)}
              className="absolute inset-0 bg-emerald-950/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden relative z-10 font-sans flex flex-col md:flex-row custom-scrollbar" dir="rtl"
            >
              {/* Sidebar/Profile Info */}
              <div className="w-full md:w-1/3 bg-emerald-900 p-8 text-white flex flex-col items-center">
                <div className="w-32 h-32 bg-white p-2 rounded-3xl shadow-xl mb-6 flex items-center justify-center">
                  <Heart className="w-16 h-16 text-emerald-600" fill="currentColor" />
                </div>
                <h2 className="text-2xl font-bold mb-2 text-center">{selectedCase.name}</h2>
                <div className="flex flex-wrap gap-2 mb-6 justify-center">
                  {(selectedCase.categories || []).map(cat => (
                    <span key={cat} className="bg-emerald-800 px-3 py-1 rounded-full text-[10px] font-bold border border-emerald-700 whitespace-nowrap">{cat}</span>
                  ))}
                  {selectedCase.isPermanent && <span className="bg-rose-500 px-3 py-1 rounded-full text-[10px] font-bold">دائم</span>}
                </div>

                <div className="w-full space-y-4">
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium tabular-nums">{selectedCase.phone}</span>
                    <a 
                      href={`https://wa.me/${selectedCase.phone.startsWith('0') ? '2'+selectedCase.phone : selectedCase.phone}`} 
                      target="_blank" 
                      className="mr-auto p-2 bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs opacity-80 truncate">{selectedCase.addedBy || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs opacity-80 leading-relaxed">{selectedCase.address}</span>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedCase.address)}`} 
                      target="_blank" 
                      className="mr-auto p-2 bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <Map className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="pt-6 border-t border-emerald-800 w-full flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        setMedicalCase({ id: selectedCase.id, name: selectedCase.name });
                        setShowMedicalModal(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600 py-3 rounded-xl border border-blue-500/30 text-blue-100 hover:text-white transition-all text-sm font-bold mb-3"
                    >
                      <Stethoscope className="w-4 h-4" />
                      فتح الملف الطبي
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedCase(null);
                        handleDeleteCase(selectedCase.id, selectedCase.name);
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-rose-600/20 hover:bg-rose-600 py-3 rounded-xl border border-rose-500/30 text-rose-100 hover:text-white transition-all text-sm font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                      حذف هذه الحالة
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-grow p-8 overflow-y-auto bg-stone-50">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-900/40 uppercase tracking-widest mb-1">تفاصيل الحالة</h3>
                    <h4 className="text-xl font-bold text-emerald-950">السجل الشامل</h4>
                  </div>
                  <button onClick={() => setSelectedCase(null)} className="p-2 hover:bg-emerald-100 rounded-full transition-colors">
                    <X className="w-6 h-6 text-emerald-900" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                    <p className="text-xs text-emerald-600 mb-1 font-bold">الرقم القومي</p>
                    <p className="font-bold text-emerald-950 tabular-nums">{selectedCase.nationalId}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                    <p className="text-xs text-emerald-600 mb-1 font-bold">عدد أفراد الأسرة</p>
                    <p className="font-bold text-emerald-950">{selectedCase.familyCount} أفراد</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                    <p className="text-xs text-emerald-600 mb-1 font-bold">تاريخ الطلب</p>
                    <p className="font-bold text-emerald-950 tabular-nums">{selectedCase.requestDate}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                    <p className="text-xs text-emerald-600 mb-1 font-bold">اسم الشريك</p>
                    <p className="font-bold text-emerald-950">{selectedCase.spouseName || 'غير متوفر'}</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 shadow-sm">
                    <p className="text-xs text-emerald-700 mb-1 font-bold">الحالة مسجلة في</p>
                    <p className="font-bold text-emerald-900">{(selectedCase.registeredIn || []).join(' - ') || 'غير محدد'}</p>
                  </div>
                  {selectedCase.categories.includes('مساعدة شهرية') && (
                    <div className="bg-emerald-600 p-4 rounded-2xl border border-emerald-500 shadow-lg col-span-1 text-white">
                      <p className="text-xs text-emerald-100 mb-1 font-bold">المبلغ الشهري</p>
                      <div className="flex items-center gap-2 font-bold text-xl tabular-nums">
                        <DollarSign className="w-6 h-6" />
                        <span>{selectedCase.monthlyAmount || 0} ج.م</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm">
                    <h5 className="flex items-center gap-2 text-emerald-900 font-bold mb-3 border-b border-emerald-50 pb-2">
                       <Info className="w-4 h-4" />
                       وصف الحالة
                    </h5>
                    <p className="text-emerald-900/80 leading-relaxed">{selectedCase.description || 'لا يوجد وصف مضاف'}</p>
                  </div>

                  <div className="bg-emerald-900 p-6 rounded-2xl shadow-xl text-white">
                    <h5 className="flex items-center gap-2 font-bold mb-3 border-b border-emerald-800 pb-2 text-emerald-400">
                       <Users className="w-4 h-4" />
                       رؤية الباحث الاجتماعي
                    </h5>
                    <p className="text-emerald-50/90 leading-relaxed font-medium">"{selectedCase.researcherNotes || 'لا توجد ملاحظات بحث بعد'}"</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm">
                    <h5 className="flex items-center gap-2 text-emerald-900 font-bold mb-4 border-b border-emerald-50 pb-2">
                       <FileCheck className="w-4 h-4" />
                       المرفقات والمستندات
                    </h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(Object.entries(selectedCase.attachments || {}) as [string, FileAttachment[]][]).map(([key, files]) => (
                        files.map((f, idx) => (
                          <a 
                            key={`${key}-${idx}`} 
                            href={f.url} 
                            target="_blank" 
                            className="group relative h-24 bg-stone-50 rounded-xl overflow-hidden border border-emerald-50 hover:border-emerald-500 transition-all"
                          >
                             {f.url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                               <img src={f.url} alt={f.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                             ) : f.url.match(/\.(mp4|webm|ogg)$/i) ? (
                               <video src={f.url} className="w-full h-full object-cover" />
                             ) : (
                               <div className="w-full h-full flex flex-col items-center justify-center p-2">
                                  <FileText className="w-8 h-8 text-emerald-300" />
                                  <span className="text-[8px] text-center truncate w-full mt-1">{f.name}</span>
                               </div>
                             )}
                             <div className="absolute inset-0 bg-emerald-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <ExternalLink className="w-6 h-6 text-white" />
                             </div>
                          </a>
                        ))
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditForm && editingCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => {
                setShowEditForm(false);
                setEditingCase(null);
              }}
              className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 font-sans" dir="rtl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-emerald-900">تعديل بيانات الحالة</h2>
                  <button onClick={() => {
                    setShowEditForm(false);
                    setEditingCase(null);
                  }} className="p-2 hover:bg-emerald-50 rounded-full">
                    <X className="w-6 h-6 text-emerald-400" />
                  </button>
                </div>

                <form className="space-y-6 max-h-[70vh] overflow-y-auto px-2 custom-scrollbar" onSubmit={handleUpdateCase}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <FormField 
                      label="الاسم الكامل" 
                      icon={<User className="w-5 h-5 text-emerald-400" />} 
                      placeholder="أدخل اسم الحالة" 
                      value={formData.name}
                      onChange={(val) => setFormData({...formData, name: val})}
                    />
                    <FormField 
                      label="رقم الهوية (14 رقم)" 
                      icon={<Info className="w-5 h-5 text-emerald-400" />} 
                      placeholder="رقم القومي" 
                      value={formData.nationalId}
                      onChange={(val) => setFormData({...formData, nationalId: val})}
                    />
                    <FormField 
                      label="القرية" 
                      icon={<MapPin className="w-5 h-5 text-emerald-400" />} 
                      placeholder="اسم القرية" 
                      value={formData.village || ''}
                      onChange={(val) => setFormData({...formData, village: val})}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <FormField 
                      label="اسم الزوج/الزوجة" 
                      icon={<Heart className="w-5 h-5 text-emerald-400" />} 
                      placeholder="اسم الشريك" 
                      value={formData.spouseName}
                      onChange={(val) => setFormData({...formData, spouseName: val})}
                    />
                    <FormField 
                      label="عدد أفراد الأسرة" 
                      icon={<Users className="w-5 h-5 text-emerald-400" />} 
                      placeholder="مثال: 4" 
                      value={formData.familyCount.toString()}
                      onChange={(val) => setFormData({...formData, familyCount: parseInt(val) || 0})}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <FormField 
                      label="تاريخ التقديم" 
                      icon={<Calendar className="w-5 h-5 text-emerald-400" />} 
                      type="date"
                      placeholder="" 
                      value={formData.requestDate}
                      onChange={(val) => setFormData({...formData, requestDate: val})}
                    />
                    <FormField 
                      label="رقم الهاتف" 
                      icon={<Phone className="w-5 h-5 text-emerald-400" />} 
                      placeholder="01xxxxxxxxx" 
                      value={formData.phone}
                      onChange={(val) => setFormData({...formData, phone: val})}
                    />
                  </div>

                  <FormField 
                    label="العنوان بالتفصيل" 
                    icon={<MapPin className="w-5 h-5 text-emerald-400" />} 
                    placeholder="عنوان السكن" 
                    value={formData.address}
                    onChange={(val) => setFormData({...formData, address: val})}
                  />

                  <div className="space-y-1">
                    <label className="text-sm font-bold text-emerald-800 px-1">التصنيف (يمكن اختيار أكثر من واحد)</label>
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {CASE_CATEGORIES.map(cat => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            checked={formData.categories.includes(cat)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormData(prev => ({
                                ...prev,
                                categories: checked 
                                  ? [...prev.categories, cat]
                                  : prev.categories.filter(c => c !== cat)
                              }));
                            }}
                          />
                          <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-600 transition-colors">{cat}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {formData.categories.includes('مساعدة شهرية') && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                      <FormField 
                        label="المبلغ الشهري" 
                        icon={<DollarSign className="w-5 h-5 text-emerald-600" />} 
                        placeholder="أدخل المبلغ الشهري المحدد" 
                        value={formData.monthlyAmount?.toString() || ''}
                        onChange={(val) => setFormData({...formData, monthlyAmount: Number(val) || 0})}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800 px-1">حالة الطلب</label>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                        <Info className="w-5 h-5 text-emerald-400" />
                        <select 
                          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold"
                          value={formData.status}
                          onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                        >
                          <option value="pending">انتظار</option>
                          <option value="active">قيد التنفيذ</option>
                          <option value="completed">تمت المساعدة</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">الحالة مسجلة في (يمكن اختيار أكثر من مؤسسة)</label>
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        'بنك الطعام', 'مصر الخير', 'هيئة الاعمال الخيرية', 
                        'هيئة الإغاثة', 'الحالات الموسمية', 'المساعدات الشهرية', 'أخرى'
                      ].map(org => (
                        <label key={org} className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            checked={Array.isArray(formData.registeredIn) && formData.registeredIn.includes(org)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const current = Array.isArray(formData.registeredIn) ? formData.registeredIn : [];
                              setFormData(prev => ({
                                ...prev,
                                registeredIn: checked 
                                  ? [...current, org]
                                  : current.filter(o => o !== org)
                              }));
                            }}
                          />
                          <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-600 transition-colors">{org}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800 px-1">درجة الاحتياج (1-10)</label>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                        <Star className="w-5 h-5 text-amber-400" />
                        <input 
                          type="range" min="1" max="10"
                          className="flex-grow accent-emerald-500"
                          value={formData.rating}
                          onChange={(e) => setFormData({...formData, rating: parseInt(e.target.value)})}
                        />
                        <span className="font-bold text-emerald-800 w-8">{formData.rating}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800 px-1">نوع المساعدة</label>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                        <Info className="w-5 h-5 text-emerald-400" />
                        <select 
                          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold"
                          value={formData.isPermanent ? 'true' : 'false'}
                          onChange={(e) => setFormData({...formData, isPermanent: e.target.value === 'true'})}
                        >
                          <option value="false">مؤقتة</option>
                          <option value="true">مستمرة (كفالة)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">ملاحظات الباحث</label>
                    <textarea 
                      rows={2}
                      className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 placeholder-emerald-300 font-medium"
                      placeholder="سجل ملاحظات البحث الاجتماعي هنا..."
                      value={formData.researcherNotes}
                      onChange={(e) => setFormData({...formData, researcherNotes: e.target.value})}
                    />
                  </div>

                  {/* File Upload Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-emerald-900 border-b border-emerald-100 pb-2">الأوراق المطلوبة (تحميل الملفات)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <FileUploadSlot 
                        label="البطاقة الشخصية" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, nationalId: typeof updater === 'function' ? updater(prev.nationalId || []) : updater }))} 
                        values={attachments.nationalId}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="شهادات الميلاد" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, birthCert: typeof updater === 'function' ? updater(prev.birthCert || []) : updater }))} 
                        values={attachments.birthCert}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="صور شخصية" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, personalPhotos: typeof updater === 'function' ? updater(prev.personalPhotos || []) : updater }))} 
                        values={attachments.personalPhotos}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="بحث اجتماعي" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, socialSearch: typeof updater === 'function' ? updater(prev.socialSearch || []) : updater }))} 
                        values={attachments.socialSearch}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="شهادة وفاة" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, deathCert: typeof updater === 'function' ? updater(prev.deathCert || []) : updater }))} 
                        values={attachments.deathCert}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="برينت تأميني" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, insurancePrint: typeof updater === 'function' ? updater(prev.insurancePrint || []) : updater }))} 
                        values={attachments.insurancePrint}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="تقرير طبي" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, medicalReport: typeof updater === 'function' ? updater(prev.medicalReport || []) : updater }))} 
                        values={attachments.medicalReport}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="افادات مدرسية" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, schoolCerts: typeof updater === 'function' ? updater(prev.schoolCerts || []) : updater }))} 
                        values={attachments.schoolCerts}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                    </div>
                  </div>

                  {/* Financial Details Section */}
                  <div className="space-y-4 border-t border-emerald-50 pt-4 text-right" dir="rtl">
                    <h3 className="text-md font-bold text-emerald-950 pr-1">تفاصيل الدخل الشهري</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-emerald-800 px-1">مصادر الدخل الشهري</label>
                        <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                          <DollarSign className="w-5 h-5 text-emerald-400 shrink-0" />
                          <select 
                            className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold"
                            value={formData.incomeSource || 'none'}
                            onChange={(e) => setFormData({...formData, incomeSource: e.target.value as any})}
                          >
                            <option value="none">بدون دخل</option>
                            <option value="pension">معاش حكومي / تكافل وكرامة</option>
                            <option value="insurance">تأمين اجتماعي</option>
                            <option value="salary">راتب وظيفة</option>
                            <option value="other">أخرى (اذكر السبب)</option>
                          </select>
                        </div>
                      </div>
                      
                      <FormField 
                        label="قيمة الدخل الشهري (بالجنيه)" 
                        icon={<DollarSign className="w-5 h-5 text-emerald-600" />} 
                        placeholder="مثال: 1500" 
                        value={formData.monthlyIncome?.toString() || ''}
                        onChange={(val) => setFormData({...formData, monthlyIncome: Number(val) || 0})}
                      />
                    </div>
                    {formData.incomeSource === 'other' && (
                      <FormField 
                        label="تفاصيل مصدر الدخل الآخر" 
                        icon={<Info className="w-5 h-5 text-emerald-400" />} 
                        placeholder="أدخل تفاصيل مصدر الدخل" 
                        value={formData.incomeSourceOther || ''}
                        onChange={(val) => setFormData({...formData, incomeSourceOther: val})}
                      />
                    )}
                  </div>

                  {/* Family Members Detail Section */}
                  <div className="space-y-4 border-t border-emerald-50 pt-4 text-right" dir="rtl">
                    <div className="flex items-center justify-between border-r-4 border-emerald-500 pr-3 mb-2">
                      <button 
                        type="button" 
                        onClick={addFamilyMember}
                        className="text-xs bg-emerald-50 hover:bg-emerald-100/80 text-emerald-600 px-4 py-2.5 rounded-xl font-bold transition-all"
                      >
                        + إضافة فرد للأسرة
                      </button>
                      <div className="flex items-center gap-2">
                         <h3 className="text-md font-bold text-emerald-900 font-extrabold">بيانات أفراد الأسرة</h3>
                         <Users className="w-5 h-5 text-emerald-600" />
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {(formData.familyMembers || []).map((member, idx) => (
                        <div key={idx} className="bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100 relative group text-right">
                          <button 
                            type="button" 
                            onClick={() => removeFamilyMember(idx)}
                            className="absolute top-2 left-2 bg-white text-rose-500 p-1.5 rounded-full shadow-sm hover:bg-rose-50 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-850 text-xs"
                                value={member.name || ''}
                                onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)}
                                placeholder="الاسم الكامل"
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">صلة القرابة</label>
                              <select 
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={member.relationship || 'الزوج/ه'}
                                onChange={(e) => updateFamilyMember(idx, 'relationship', e.target.value)}
                              >
                                {RELATIONSHIP_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                              {member.relationship === 'آخر' && (
                                <input 
                                  type="text"
                                  className="w-full mt-1 bg-white border border-emerald-100 p-2 rounded-lg outline-none font-bold text-right text-stone-850 text-xs"
                                  value={member.relationshipOther || ''}
                                  onChange={(e) => updateFamilyMember(idx, 'relationshipOther', e.target.value)}
                                  placeholder="صلة قرابة أخرى..."
                                />
                              )}
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">الرقم القومي (14 رقم)</label>
                              <input 
                                type="text"
                                maxLength={14}
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-850 text-xs tabular-nums"
                                value={member.nationalId || ''}
                                onChange={(e) => updateFamilyMember(idx, 'nationalId', e.target.value)}
                                placeholder="2990101..."
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">العمر (تلقائي)</label>
                              <input 
                                type="text"
                                readOnly
                                className="w-full bg-stone-100 border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-600 text-xs cursor-not-allowed"
                                value={member.age || ''}
                                placeholder="تلقائي"
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">العمل / المدرسة</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-850 text-xs"
                                value={member.workOrSchool || ''}
                                onChange={(e) => updateFamilyMember(idx, 'workOrSchool', e.target.value)}
                                placeholder="العمل الحالي أو المدرسة"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {(formData.familyMembers || []).length === 0 && (
                        <div className="text-center py-4 bg-emerald-50/20 rounded-2xl border-2 border-dashed border-emerald-100 text-emerald-700/60 text-xs font-bold">
                          لم يتم إضافة أفراد للأسرة بعد
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Children Detail Section */}
                  <div className="space-y-4 border-t border-emerald-50 pt-4 text-right animate-in fade-in" dir="rtl">
                    <div className="flex items-center justify-between border-r-4 border-blue-500 pr-3 mb-2">
                      <button 
                        type="button" 
                        onClick={addChild}
                        className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-4 py-2.5 rounded-xl font-bold transition-all"
                      >
                        + إضافة ابن
                      </button>
                      <div className="flex items-center gap-2">
                         <h3 className="text-md font-bold text-blue-900 font-extrabold">بيانات الأبناء</h3>
                         <Users className="w-5 h-5 text-blue-600" />
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {(formData.children || []).map((child, idx) => (
                        <div key={idx} className="bg-blue-50/20 p-4 rounded-2xl border border-blue-100 relative group text-right">
                          <button 
                            type="button" 
                            onClick={() => removeChild(idx)}
                            className="absolute top-2 left-2 bg-white text-rose-500 p-1.5 rounded-full shadow-sm hover:bg-rose-50 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.name || ''}
                                onChange={(e) => updateChild(idx, 'name', e.target.value)}
                                placeholder="اسم ابنك/ابنتك"
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">تاريخ الميلاد</label>
                              <input 
                                type="date"
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.birthDate || ''}
                                onChange={(e) => updateChild(idx, 'birthDate', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">العمر (تلقائي)</label>
                              <input 
                                type="text"
                                readOnly
                                className="w-full bg-stone-100 border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-600 text-xs cursor-not-allowed"
                                value={child.age || ''}
                                placeholder="تلقائي"
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">المرحلة الدراسية</label>
                              <select 
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.education || 'رياض أطفال / حضانة'}
                                onChange={(e) => updateChild(idx, 'education', e.target.value)}
                              >
                                {EDUCATIONAL_STAGES.map(stage => (
                                  <option key={stage} value={stage}>{stage}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">السنة الدراسية</label>
                              <select 
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.schoolYear || 'لا ينطبق'}
                                onChange={(e) => updateChild(idx, 'schoolYear', e.target.value)}
                              >
                                {SCHOOL_YEARS.map(yr => (
                                  <option key={yr} value={yr}>{yr}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">الجنس</label>
                              <select 
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.gender || 'ذكر'}
                                onChange={(e) => updateChild(idx, 'gender', e.target.value)}
                              >
                                <option value="ذكر">ذكر</option>
                                <option value="أنثى">أنثى</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(formData.children || []).length === 0 && (
                        <div className="text-center py-4 bg-blue-50/20 rounded-2xl border-2 border-dashed border-blue-100 text-blue-800/60 text-xs font-bold">
                          لم يتم إضافة أبناء لهذه الحالة بعد
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">وصف الحالة</label>
                    <textarea 
                      rows={3}
                      className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 placeholder-emerald-300 font-medium"
                      placeholder="اشرح حالة المساعدة المطلوبة هنا..."
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                  
                  <div className="pt-4 flex gap-3 flex-row-reverse pb-4">
                    <button type="submit" className="flex-grow bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all">حفظ التعديلات</button>
                    <button type="button" onClick={() => {
                      setShowEditForm(false);
                      setEditingCase(null);
                    }} className="px-8 py-4 text-emerald-600 font-bold hover:bg-emerald-50 rounded-xl transition-all">إلغاء</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddForm(false)}
              className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 font-sans" dir="rtl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-emerald-900">إضافة حالة جديدة</h2>
                  <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-emerald-50 rounded-full">
                    <X className="w-6 h-6 text-emerald-400" />
                  </button>
                </div>

                <form className="space-y-6 max-h-[70vh] overflow-y-auto px-2 custom-scrollbar" onSubmit={handleAddCase}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <FormField 
                      label="كود الحالة (اختياري)" 
                      icon={<ClipboardList className="w-5 h-5 text-amber-500" />} 
                      placeholder="سيولد تلقائياً" 
                      value={formData.caseCode || ''}
                      onChange={(val) => setFormData({...formData, caseCode: val})}
                    />
                    <FormField 
                      label="الاسم الكامل" 
                      icon={<User className="w-5 h-5 text-emerald-400" />} 
                      placeholder="أدخل اسم الحالة" 
                      value={formData.name}
                      onChange={(val) => setFormData({...formData, name: val})}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <FormField 
                      label="رقم الهوية (14 رقم)" 
                      icon={<Info className="w-5 h-5 text-emerald-400" />} 
                      placeholder="رقم القومي" 
                      value={formData.nationalId}
                      onChange={(val) => setFormData({...formData, nationalId: val})}
                    />
                    <FormField 
                      label="القرية" 
                      icon={<MapPin className="w-5 h-5 text-emerald-400" />} 
                      placeholder="اسم القرية" 
                      value={formData.village || ''}
                      onChange={(val) => setFormData({...formData, village: val})}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <FormField 
                      label="اسم الزوج/الزوجة" 
                      icon={<Heart className="w-5 h-5 text-emerald-400" />} 
                      placeholder="اسم الشريك" 
                      value={formData.spouseName}
                      onChange={(val) => setFormData({...formData, spouseName: val})}
                    />
                    <FormField 
                      label="عدد أفراد الأسرة" 
                      icon={<Users className="w-5 h-5 text-emerald-400" />} 
                      placeholder="مثال: 4" 
                      value={formData.familyCount.toString()}
                      onChange={(val) => setFormData({...formData, familyCount: parseInt(val) || 0})}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <FormField 
                      label="تاريخ التقديم" 
                      icon={<Calendar className="w-5 h-5 text-emerald-400" />} 
                      type="date"
                      placeholder="" 
                      value={formData.requestDate}
                      onChange={(val) => setFormData({...formData, requestDate: val})}
                    />
                    <FormField 
                      label="رقم الهاتف" 
                      icon={<Phone className="w-5 h-5 text-emerald-400" />} 
                      placeholder="01xxxxxxxxx" 
                      value={formData.phone}
                      onChange={(val) => setFormData({...formData, phone: val})}
                    />
                  </div>

                  <FormField 
                    label="العنوان بالتفصيل" 
                    icon={<MapPin className="w-5 h-5 text-emerald-400" />} 
                    placeholder="عنوان السكن" 
                    value={formData.address}
                    onChange={(val) => setFormData({...formData, address: val})}
                  />

                  <div className="space-y-1">
                    <label className="text-sm font-bold text-emerald-800 px-1">التصنيف (يمكن اختيار أكثر من واحد)</label>
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {CASE_CATEGORIES.map(cat => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            checked={formData.categories.includes(cat)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormData(prev => ({
                                ...prev,
                                categories: checked 
                                  ? [...prev.categories, cat]
                                  : prev.categories.filter(c => c !== cat)
                              }));
                            }}
                          />
                          <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-600 transition-colors">{cat}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {formData.categories.includes('مساعدة شهرية') && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                      <FormField 
                        label="المبلغ الشهري" 
                        icon={<DollarSign className="w-5 h-5 text-emerald-600" />} 
                        placeholder="أدخل المبلغ الشهري المحدد" 
                        value={formData.monthlyAmount?.toString() || ''}
                        onChange={(val) => setFormData({...formData, monthlyAmount: Number(val) || 0})}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800 px-1">حالة الطلب</label>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                        <Info className="w-5 h-5 text-emerald-400" />
                        <select 
                          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold"
                          value={formData.status}
                          onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                        >
                          <option value="pending">انتظار</option>
                          <option value="active">قيد التنفيذ</option>
                          <option value="completed">تمت المساعدة</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">الحالة مسجلة في (يمكن اختيار أكثر من مؤسسة)</label>
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        'بنك الطعام', 'مصر الخير', 'هيئة الاعمال الخيرية', 
                        'هيئة الإغاثة', 'الحالات الموسمية', 'المساعدات الشهرية', 'أخرى'
                      ].map(org => (
                        <label key={org} className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            checked={Array.isArray(formData.registeredIn) && formData.registeredIn.includes(org)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const current = Array.isArray(formData.registeredIn) ? formData.registeredIn : [];
                              setFormData(prev => ({
                                ...prev,
                                registeredIn: checked 
                                  ? [...current, org]
                                  : current.filter(o => o !== org)
                              }));
                            }}
                          />
                          <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-600 transition-colors">{org}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800 px-1">درجة الاحتياج (1-10)</label>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                        <Star className="w-5 h-5 text-amber-400" />
                        <input 
                          type="range" min="1" max="10"
                          className="flex-grow accent-emerald-500"
                          value={formData.rating}
                          onChange={(e) => setFormData({...formData, rating: parseInt(e.target.value)})}
                        />
                        <span className="font-bold text-emerald-800 w-8">{formData.rating}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800 px-1">نوع المساعدة</label>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                        <Info className="w-5 h-5 text-emerald-400" />
                        <select 
                          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold"
                          value={formData.isPermanent ? 'true' : 'false'}
                          onChange={(e) => setFormData({...formData, isPermanent: e.target.value === 'true'})}
                        >
                          <option value="false">مؤقتة</option>
                          <option value="true">مستمرة (كفالة)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">ملاحظات الباحث</label>
                    <textarea 
                      rows={2}
                      className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 placeholder-emerald-300 font-medium"
                      placeholder="سجل ملاحظات البحث الاجتماعي هنا..."
                      value={formData.researcherNotes}
                      onChange={(e) => setFormData({...formData, researcherNotes: e.target.value})}
                    />
                  </div>

                  {/* File Upload Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-emerald-900 border-b border-emerald-100 pb-2">الأوراق المطلوبة (تحميل الملفات)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <FileUploadSlot 
                        label="البطاقة الشخصية" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, nationalId: typeof updater === 'function' ? updater(prev.nationalId || []) : updater }))} 
                        values={attachments.nationalId}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="شهادات الميلاد" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, birthCert: typeof updater === 'function' ? updater(prev.birthCert || []) : updater }))} 
                        values={attachments.birthCert}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="صور شخصية" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, personalPhotos: typeof updater === 'function' ? updater(prev.personalPhotos || []) : updater }))} 
                        values={attachments.personalPhotos}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="بحث اجتماعي" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, socialSearch: typeof updater === 'function' ? updater(prev.socialSearch || []) : updater }))} 
                        values={attachments.socialSearch}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="شهادة وفاة" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, deathCert: typeof updater === 'function' ? updater(prev.deathCert || []) : updater }))} 
                        values={attachments.deathCert}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="برينت تأميني" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, insurancePrint: typeof updater === 'function' ? updater(prev.insurancePrint || []) : updater }))} 
                        values={attachments.insurancePrint}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="تقرير طبي" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, medicalReport: typeof updater === 'function' ? updater(prev.medicalReport || []) : updater }))} 
                        values={attachments.medicalReport}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                      <FileUploadSlot 
                        label="افادات مدرسية" 
                        onUpload={(updater) => setAttachments(prev => ({ ...prev, schoolCerts: typeof updater === 'function' ? updater(prev.schoolCerts || []) : updater }))} 
                        values={attachments.schoolCerts}
                        caseName={formData.name}
                        storagePath="cases/docs"
                      />
                    </div>
                  </div>

                  {/* Financial Details Section */}
                  <div className="space-y-4 border-t border-emerald-50 pt-4 text-right" dir="rtl">
                    <h3 className="text-md font-bold text-emerald-950 pr-1">تفاصيل الدخل الشهري</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-emerald-800 px-1">مصادر الدخل الشهري</label>
                        <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                          <DollarSign className="w-5 h-5 text-emerald-400 shrink-0" />
                          <select 
                            className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold"
                            value={formData.incomeSource || 'none'}
                            onChange={(e) => setFormData({...formData, incomeSource: e.target.value as any})}
                          >
                            <option value="none">بدون دخل</option>
                            <option value="pension">معاش حكومي / تكافل وكرامة</option>
                            <option value="insurance">تأمين اجتماعي</option>
                            <option value="salary">راتب وظيفة</option>
                            <option value="other">أخرى (اذكر السبب)</option>
                          </select>
                        </div>
                      </div>
                      
                      <FormField 
                        label="قيمة الدخل الشهري (بالجنيه)" 
                        icon={<DollarSign className="w-5 h-5 text-emerald-600" />} 
                        placeholder="مثال: 1500" 
                        value={formData.monthlyIncome?.toString() || ''}
                        onChange={(val) => setFormData({...formData, monthlyIncome: Number(val) || 0})}
                      />
                    </div>
                    {formData.incomeSource === 'other' && (
                      <FormField 
                        label="تفاصيل مصدر الدخل الآخر" 
                        icon={<Info className="w-5 h-5 text-emerald-400" />} 
                        placeholder="أدخل تفاصيل مصدر الدخل" 
                        value={formData.incomeSourceOther || ''}
                        onChange={(val) => setFormData({...formData, incomeSourceOther: val})}
                      />
                    )}
                  </div>

                  {/* Family Members Detail Section */}
                  <div className="space-y-4 border-t border-emerald-50 pt-4 text-right" dir="rtl">
                    <div className="flex items-center justify-between border-r-4 border-emerald-500 pr-3 mb-2">
                      <button 
                        type="button" 
                        onClick={addFamilyMember}
                        className="text-xs bg-emerald-50 hover:bg-emerald-100/80 text-emerald-600 px-4 py-2.5 rounded-xl font-bold transition-all"
                      >
                        + إضافة فرد للأسرة
                      </button>
                      <div className="flex items-center gap-2">
                         <h3 className="text-md font-bold text-emerald-900 font-extrabold">بيانات أفراد الأسرة</h3>
                         <Users className="w-5 h-5 text-emerald-600" />
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {(formData.familyMembers || []).map((member, idx) => (
                        <div key={idx} className="bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100 relative group text-right">
                          <button 
                            type="button" 
                            onClick={() => removeFamilyMember(idx)}
                            className="absolute top-2 left-2 bg-white text-rose-500 p-1.5 rounded-full shadow-sm hover:bg-rose-50 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-850 text-xs"
                                value={member.name || ''}
                                onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)}
                                placeholder="الاسم الكامل"
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">صلة القرابة</label>
                              <select 
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={member.relationship || 'الزوج/ه'}
                                onChange={(e) => updateFamilyMember(idx, 'relationship', e.target.value)}
                              >
                                {RELATIONSHIP_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                              {member.relationship === 'آخر' && (
                                <input 
                                  type="text"
                                  className="w-full mt-1 bg-white border border-emerald-100 p-2 rounded-lg outline-none font-bold text-right text-stone-850 text-xs"
                                  value={member.relationshipOther || ''}
                                  onChange={(e) => updateFamilyMember(idx, 'relationshipOther', e.target.value)}
                                  placeholder="صلة قرابة أخرى..."
                                />
                              )}
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">الرقم القومي (14 رقم)</label>
                              <input 
                                type="text"
                                maxLength={14}
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-850 text-xs tabular-nums"
                                value={member.nationalId || ''}
                                onChange={(e) => updateFamilyMember(idx, 'nationalId', e.target.value)}
                                placeholder="2990101..."
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">العمر (تلقائي)</label>
                              <input 
                                type="text"
                                readOnly
                                className="w-full bg-stone-100 border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-600 text-xs cursor-not-allowed"
                                value={member.age || ''}
                                placeholder="تلقائي"
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2 text-right">
                              <label className="text-[10px] font-bold text-emerald-800 pr-1 block">العمل / المدرسة</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-emerald-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-850 text-xs"
                                value={member.workOrSchool || ''}
                                onChange={(e) => updateFamilyMember(idx, 'workOrSchool', e.target.value)}
                                placeholder="العمل الحالي أو المدرسة"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {(formData.familyMembers || []).length === 0 && (
                        <div className="text-center py-4 bg-emerald-50/20 rounded-2xl border-2 border-dashed border-emerald-100 text-emerald-700/60 text-xs font-bold">
                          لم يتم إضافة أفراد للأسرة بعد
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Children Detail Section */}
                  <div className="space-y-4 border-t border-emerald-50 pt-4 text-right animate-in fade-in" dir="rtl">
                    <div className="flex items-center justify-between border-r-4 border-blue-500 pr-3 mb-2">
                      <button 
                        type="button" 
                        onClick={addChild}
                        className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-4 py-2.5 rounded-xl font-bold transition-all"
                      >
                        + إضافة ابن
                      </button>
                      <div className="flex items-center gap-2">
                         <h3 className="text-md font-bold text-blue-900 font-extrabold">بيانات الأبناء</h3>
                         <Users className="w-5 h-5 text-blue-600" />
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {(formData.children || []).map((child, idx) => (
                        <div key={idx} className="bg-blue-50/20 p-4 rounded-2xl border border-blue-100 relative group text-right">
                          <button 
                            type="button" 
                            onClick={() => removeChild(idx)}
                            className="absolute top-2 left-2 bg-white text-rose-500 p-1.5 rounded-full shadow-sm hover:bg-rose-50 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.name || ''}
                                onChange={(e) => updateChild(idx, 'name', e.target.value)}
                                placeholder="اسم ابنك/ابنتك"
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">تاريخ الميلاد</label>
                              <input 
                                type="date"
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.birthDate || ''}
                                onChange={(e) => updateChild(idx, 'birthDate', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">العمر (تلقائي)</label>
                              <input 
                                type="text"
                                readOnly
                                className="w-full bg-stone-100 border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-600 text-xs cursor-not-allowed"
                                value={child.age || ''}
                                placeholder="تلقائي"
                              />
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">المرحلة الدراسية</label>
                              <select 
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.education || 'رياض أطفال / حضانة'}
                                onChange={(e) => updateChild(idx, 'education', e.target.value)}
                              >
                                {EDUCATIONAL_STAGES.map(stage => (
                                  <option key={stage} value={stage}>{stage}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">السنة الدراسية</label>
                              <select 
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.schoolYear || 'لا ينطبق'}
                                onChange={(e) => updateChild(idx, 'schoolYear', e.target.value)}
                              >
                                {SCHOOL_YEARS.map(yr => (
                                  <option key={yr} value={yr}>{yr}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1 text-right">
                              <label className="text-[10px] font-bold text-blue-800 pr-1 block">الجنس</label>
                              <select 
                                className="w-full bg-white border border-blue-100 p-2.5 rounded-lg outline-none font-bold text-right text-stone-855 text-xs"
                                value={child.gender || 'ذكر'}
                                onChange={(e) => updateChild(idx, 'gender', e.target.value)}
                              >
                                <option value="ذكر">ذكر</option>
                                <option value="أنثى">أنثى</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(formData.children || []).length === 0 && (
                        <div className="text-center py-4 bg-blue-50/20 rounded-2xl border-2 border-dashed border-blue-100 text-blue-800/60 text-xs font-bold">
                          لم يتم إضافة أبناء لهذه الحالة بعد
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">وصف الحالة</label>
                    <textarea 
                      rows={3}
                      className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 placeholder-emerald-300 font-medium"
                      placeholder="اشرح حالة المساعدة المطلوبة هنا..."
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                  
                  <div className="pt-4 flex gap-3 flex-row-reverse pb-4">
                    <button type="submit" className="flex-grow bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all">حفظ البيانات</button>
                    <button type="button" onClick={() => setShowAddForm(false)} className="px-8 py-4 text-emerald-600 font-bold hover:bg-emerald-50 rounded-xl transition-all">إلغاء</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPrintModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowPrintModal(false)}
              className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 p-6 text-right" dir="rtl"
            >
              <h3 className="text-xl font-bold text-emerald-900 mb-4">إعدادات الطباعة</h3>
              <p className="text-sm text-emerald-600 mb-6">اختر نوع الكشف وحدد الأعمدة التي ترغب في طباعتها حالياً:</p>
              
              <div className="space-y-4 mb-6">
                <label className="block text-sm font-bold text-emerald-800">اختر التصنيف المُراد طباعته:</label>
                <select 
                  className="w-full bg-stone-50 border-2 border-emerald-100 rounded-xl p-4 outline-none focus:border-emerald-500 font-bold"
                  value={printFilter}
                  onChange={(e) => setPrintFilter(e.target.value)}
                >
                  <option value="all">طباعة كل الحالات (كشف عام)</option>
                  {CASE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>كشف {cat}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-4 mb-8 border-t pt-4 border-gray-150">
                <label className="block text-sm font-bold text-emerald-800">تخصيص أعمدة الطباعة للكشف:</label>
                
                <div className="flex gap-2 mb-2">
                  <button 
                    type="button"
                    onClick={() => setPrintCols(CASES_COLUMNS_INFO.map(c => c.key))}
                    className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg text-xs hover:bg-emerald-100 transition-colors"
                  >
                    اختيار الكل
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPrintCols(['index', 'name'])}
                    className="px-3 py-1 bg-stone-100 text-stone-600 font-bold rounded-lg text-xs hover:bg-stone-200 transition-colors"
                  >
                    إلغاء تحديد الكل
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 border border-stone-100 rounded-xl bg-stone-50">
                  {CASES_COLUMNS_INFO.map((col) => {
                    const isChecked = printCols.includes(col.key);
                    return (
                      <label 
                        key={col.key}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-all font-bold text-xs bg-white",
                          isChecked 
                            ? "border-emerald-500 text-emerald-950 shadow-sm"
                            : "border-stone-200 text-stone-500 hover:border-stone-300"
                        )}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setPrintCols(printCols.filter(k => k !== col.key));
                            } else {
                              setPrintCols([...printCols, col.key]);
                            }
                          }}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handlePrintReport}
                  disabled={printCols.length === 0}
                  className="flex-grow bg-emerald-800 text-white font-bold py-3 rounded-xl hover:bg-emerald-900 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Printer className="w-5 h-5" />
                  تأكيد وطباعة
                </button>
                <button 
                  onClick={() => setShowPrintModal(false)}
                  className="flex-grow bg-stone-100 text-stone-600 font-bold py-3 rounded-xl hover:bg-stone-200"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Excel Mapping Modal */}
      <AnimatePresence>
        {importData && (
          <div className="fixed inset-0 bg-emerald-950/80 backdrop-blur-md z-[70] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-5xl w-full p-8 my-8"
            >
              <div className="flex items-center justify-between mb-8 border-b border-stone-100 pb-6">
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">تخصيص البيانات من الملف</h2>
                  <p className="text-stone-500 font-bold">اربط أعمدة ملف الإكسل بالخانات المطلوبة للموقع</p>
                </div>
                <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center">
                  <Upload className="w-10 h-10 text-emerald-600" />
                </div>
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-10">
                {MAPPING_FIELDS.map(field => (
                  <div key={field.id} className="group text-right">
                    <label className="text-sm font-black text-stone-700 block mb-2 pr-2">
                        {field.label}
                        {['name', 'nationalId'].includes(field.id) && <span className="text-rose-500 mr-1">*</span>}
                    </label>
                    <div className="relative">
                        <select 
                        value={fieldMapping[field.id] || ''}
                        onChange={(e) => setFieldMapping({...fieldMapping, [field.id]: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right appearance-none cursor-pointer pr-4 pl-10"
                        >
                        <option value="">-- اختر من الملف --</option>
                        {importData.headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                        </select>
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronDown className="w-5 h-5 text-emerald-200" />
                        </div>
                    </div>
                    {fieldMapping[field.id] && (
                        <div className="mt-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg flex items-center justify-end gap-2 border border-emerald-100/50">
                            <span>{getPreviewValue(fieldMapping[field.id])}</span>
                            <span className="text-emerald-400">مثال من الملف:</span>
                        </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 mb-8 flex items-start gap-4 text-right">
                <div className="flex-grow">
                  <h4 className="font-black text-amber-900 text-lg mb-1">بيانات التقرير</h4>
                  <p className="text-sm text-amber-800 font-bold">
                    سيتم استيراد <span className="text-xl font-black">{importData.rows.length}</span> حالة. 
                    تأكد من مطابقة خانة "الاسم" و"الرقم القومي" بشكل صحيح.
                  </p>
                </div>
                <Users className="w-8 h-8 text-amber-600 shrink-0" />
              </div>

              <div className="flex flex-row-reverse gap-4">
                <button 
                  onClick={processMappingImport}
                  disabled={importing || !fieldMapping.name || !fieldMapping.nationalId}
                  className="flex-grow bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-4 disabled:bg-stone-300 disabled:shadow-none"
                >
                  {importing ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : (
                    <FileCheck className="w-7 h-7" />
                  )}
                  {importing ? 'جاري الاستيراد الآن...' : 'بدء عملية الاستيراد'}
                </button>
                <button 
                  onClick={() => setImportData(null)}
                  className="px-12 bg-stone-100 text-stone-500 py-5 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  إلغاء العملية
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Research Modal */}
      <AnimatePresence>
        {showResearchModal && researchCase && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl p-8 custom-scrollbar"
            >
               <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100">
                  <button onClick={() => setShowResearchModal(false)} className="p-2 hover:bg-rose-50 text-stone-400 hover:text-rose-500 rounded-xl transition-all">
                    <X className="w-6 h-6" />
                  </button>
                  <div className="text-right">
                    <h2 className="text-2xl font-black text-emerald-950">البحث الدوري - {researchCase.name}</h2>
                    <p className="text-stone-400 font-bold">متابعة التغيرات في الدخل والمصروفات</p>
                  </div>
               </div>

               {showAddResearch ? (
                 <form onSubmit={handleAddResearch} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-stone-500 pr-2">تاريخ البحث</label>
                          <input 
                            type="date"
                            className="w-full bg-stone-50 border border-stone-100 p-4 rounded-xl outline-none font-bold text-right"
                            value={researchFormData.date}
                            onChange={(e) => setResearchFormData({...researchFormData, date: e.target.value})}
                          />
                       </div>
                       <div className="flex items-center justify-end gap-3 h-full pt-6">
                          <label className="font-bold text-emerald-950">حدث تغير في الحالة؟</label>
                          <input 
                            type="checkbox"
                            className="w-6 h-6 accent-emerald-600 cursor-pointer"
                            checked={researchFormData.hasChanged}
                            onChange={(e) => setResearchFormData({...researchFormData, hasChanged: e.target.checked})}
                          />
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h3 className="font-black text-emerald-900 border-r-4 border-emerald-500 pr-2">المصروفات الشهرية</h3>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="bg-stone-50 p-4 rounded-xl">
                             <label className="text-[10px] text-stone-400 font-bold block mb-1">مصاريف مدرسية</label>
                             <input type="number" className="w-full bg-transparent font-black outline-none text-right" 
                               value={researchFormData.schoolExpenses} onChange={(e) => setResearchFormData({...researchFormData, schoolExpenses: Number(e.target.value)})} />
                          </div>
                          <div className="bg-stone-50 p-4 rounded-xl">
                             <label className="text-[10px] text-stone-400 font-bold block mb-1">مصاريف معيشية</label>
                             <input type="number" className="w-full bg-transparent font-black outline-none text-right" 
                               value={researchFormData.livingExpenses} onChange={(e) => setResearchFormData({...researchFormData, livingExpenses: Number(e.target.value)})} />
                          </div>
                          <div className="bg-stone-100 p-4 rounded-xl">
                             <label className="text-[10px] text-stone-400 font-bold block mb-1">مصاريف أخرى</label>
                             <input type="number" className="w-full bg-transparent font-black outline-none text-right" 
                               value={researchFormData.otherExpenses} onChange={(e) => setResearchFormData({...researchFormData, otherExpenses: Number(e.target.value)})} />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h3 className="font-black text-amber-900 border-r-4 border-amber-500 pr-2">مصادر الدخل</h3>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100">
                             <label className="text-[10px] text-amber-600 font-bold block mb-1">معاش</label>
                             <input type="number" className="w-full bg-transparent font-black outline-none text-right" 
                               value={researchFormData.incomePension} onChange={(e) => setResearchFormData({...researchFormData, incomePension: Number(e.target.value)})} />
                          </div>
                          <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100">
                             <label className="text-[10px] text-amber-600 font-bold block mb-1">تأمين</label>
                             <input type="number" className="w-full bg-transparent font-black outline-none text-right" 
                               value={researchFormData.incomeInsurance} onChange={(e) => setResearchFormData({...researchFormData, incomeInsurance: Number(e.target.value)})} />
                          </div>
                          <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100">
                             <label className="text-[10px] text-amber-600 font-bold block mb-1">راتب/يومية</label>
                             <input type="number" className="w-full bg-transparent font-black outline-none text-right" 
                               value={researchFormData.incomeSalary} onChange={(e) => setResearchFormData({...researchFormData, incomeSalary: Number(e.target.value)})} />
                          </div>
                          <div className="bg-stone-50 p-4 rounded-xl">
                             <label className="text-[10px] text-stone-400 font-bold block mb-1">أخرى</label>
                             <input type="number" className="w-full bg-transparent font-black outline-none text-right" 
                               value={researchFormData.incomeOther} onChange={(e) => setResearchFormData({...researchFormData, incomeOther: Number(e.target.value)})} />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-1">
                       <label className="text-xs font-bold text-stone-500 pr-2">ملاحظات التحديث</label>
                       <textarea 
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-xl min-h-[100px] outline-none font-bold text-right"
                        value={researchFormData.notes}
                        onChange={(e) => setResearchFormData({...researchFormData, notes: e.target.value})}
                       />
                    </div>

                    <div className="flex gap-4">
                       <button type="submit" className="flex-grow bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-emerald-700">حفظ التحديث</button>
                       <button type="button" onClick={() => setShowAddResearch(false)} className="px-8 bg-stone-100 text-stone-500 rounded-2xl font-bold">إلغاء</button>
                    </div>
                 </form>
               ) : (
                 <div className="space-y-6">
                    <button 
                      onClick={() => setShowAddResearch(true)}
                      className="w-full py-4 border-2 border-dashed border-emerald-200 text-emerald-600 rounded-2xl font-black hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      إضافة تحديث دوري جديد
                    </button>

                    <div className="space-y-4">
                       {researchRecords.length > 0 ? researchRecords.map(record => (
                         <div key={record.id} className="bg-stone-50 p-6 rounded-2xl border border-stone-100 flex flex-col md:flex-row justify-between gap-6 hover:shadow-sm transition-all">
                            <div className="flex-grow text-right space-y-4">
                               <div className="flex items-center justify-end gap-3">
                                  {record.hasChanged ? (
                                    <span className="bg-rose-100 text-rose-600 text-[10px] px-2 py-0.5 rounded-full font-black">حدث تغير</span>
                                  ) : (
                                    <span className="bg-emerald-100 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-black">لا يوجد تغير</span>
                                  )}
                                  <span className="font-black text-emerald-950 tabular-nums">{record.date}</span>
                               </div>
                               
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="text-xs">
                                     <p className="text-stone-400 mb-1 font-bold">إجمالي المصروفات</p>
                                     <p className="font-black text-rose-600 tabular-nums">
                                        {(record.schoolExpenses || 0) + (record.livingExpenses || 0) + (record.otherExpenses || 0)} ج.م
                                     </p>
                                  </div>
                                  <div className="text-xs">
                                     <p className="text-stone-400 mb-1 font-bold">إجمالي الدخل</p>
                                     <p className="font-black text-emerald-600 tabular-nums">
                                        {(record.incomePension || 0) + (record.incomeInsurance || 0) + (record.incomeSalary || 0) + (record.incomeOther || 0)} ج.م
                                     </p>
                                  </div>
                               </div>

                               {record.notes && (
                                 <p className="text-xs text-stone-500 bg-white p-3 rounded-lg border border-stone-100">{record.notes}</p>
                               )}
                            </div>
                            <div className="flex items-start">
                               <button 
                                onClick={() => {
                                  setConfirmConfig({
                                    isOpen: true,
                                    title: 'حذف التحديث الدوري',
                                    message: 'هل أنت متأكد من حذف هذا التحديث الدوري نهائياً؟',
                                    onConfirm: async () => {
                                      try {
                                        await deleteDoc(doc(db, 'cases', researchCase.id, 'periodic_research', record.id));
                                        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                                      } catch (error) {
                                        handleFirestoreError(error, OperationType.DELETE, `cases/${researchCase.id}/periodic_research/${record.id}`);
                                      }
                                    }
                                  });
                                }} 
                                className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </div>
                         </div>
                       )) : (
                         <div className="text-center py-10 text-stone-400 font-bold">لا توجد سجلات بحث دوري بعد</div>
                       )}
                    </div>
                 </div>
               )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Unified N/C Case Modal */}
      {unifiedTransferCase && (
        <UnifiedTransferModal
          isOpen={!!unifiedTransferCase}
          onClose={() => setUnifiedTransferCase(null)}
          caseData={unifiedTransferCase}
          onSuccess={() => setUnifiedTransferCase(null)}
        />
      )}

      {medicalCase && (
        <MedicalModal 
          isOpen={showMedicalModal}
          onClose={() => {
            setShowMedicalModal(false);
            setMedicalCase(null);
          }}
          caseId={medicalCase.id}
          caseName={medicalCase.name}
        />
      )}

      <footer className="mt-12 py-8 border-t border-emerald-100 text-center">
        <p className="text-emerald-700/40 text-xs font-medium tracking-wide">
          نظام الإدارة الإلكتروني لجمعية بصمة خير نبروه
        </p>
        <p className="text-emerald-800/60 mt-1 text-sm font-bold">
          تم التطوير بواسطة م/ محمود جاويش (Mahmoud Gawish) © {new Date().getFullYear()}
        </p>
      </footer>

    </div>
  );
}

function FormField({ label, icon, placeholder, value, onChange, type = "text", required = false }: { 
  label: string; icon: React.ReactNode; placeholder: string; value: string; onChange: (val: string) => void; type?: string; required?: boolean 
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-bold text-emerald-800 px-1">
        {label}
        {required && <span className="text-rose-500 mr-1 text-xs">*</span>}
      </label>
      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
        {icon}
        <input 
          type={type}
          required={required}
          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none placeholder-emerald-300 font-bold"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}