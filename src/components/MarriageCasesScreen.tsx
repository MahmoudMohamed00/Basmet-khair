// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, Search, MapPin, Phone, User, Tag, Info, X, Calendar, Upload, FileCheck, Users, Heart, Loader2, Printer, FileText, Trash2, FileOutput, FileUp, ShieldAlert, Mail, Star, ExternalLink, MessageCircle, Map, ArrowUpDown, Edit, DollarSign, MessageSquare, PartyPopper, ClipboardList, CheckCircle2, Clock, FileDown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { db, storage, auth, handleFirestoreError, OperationType, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, writeBatch, getDocs, limit, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as XLSX from 'xlsx';
import ConfirmModal from './ConfirmModal';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';
import { checkDuplicateCase } from '../lib/duplicateRegistry';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface MarriageCase {
  id: string;
  brideName: string;
  brideNationalId: string;
  guardianName: string;
  guardianNationalId: string;
  motherName: string;
  motherNationalId: string;
  phone1: string;
  phone2: string;
  address: string;
  marriageType: 'official' | 'unofficial' | 'none';
  weddingDate: string;
  requiredHelp: string[];
  contractDate: string;
  notes: string;
  status: 'completed' | 'in_progress' | 'not_started';
  providedHelpType?: 'monetary' | 'inkind' | 'none';
  monetaryAmount?: string;
  inkindItems?: string;
  attachments?: FileAttachment[] | Record<string, FileAttachment[]>;
  caseCode?: string;
  requestDate?: string;
  aidDate?: string;
  createdAt: any;
}

const MARRIAGE_COLUMNS_INFO = [
  { key: 'index', label: 'مسلسل' },
  { key: 'caseCode', label: 'كود الحالة' },
  { key: 'brideName', label: 'اسم العروسة' },
  { key: 'brideNationalId', label: 'الرقم القومي للعروسة' },
  { key: 'brideGroomName', label: 'اسم العريس' },
  { key: 'brideGroomNationalId', label: 'الرقم القومي للعريس' },
  { key: 'guardianName', label: 'اسم ولي الأمر' },
  { key: 'guardianNationalId', label: 'الرقم القومي لولي الأمر' },
  { key: 'motherName', label: 'اسم الأم' },
  { key: 'motherNationalId', label: 'الرقم القومي للأم' },
  { key: 'phone', label: 'التليفون' },
  { key: 'village', label: 'القرية' },
  { key: 'address', label: 'العنوان بالتفصيل' },
  { key: 'marriageType', label: 'نوع الزواج' },
  { key: 'requestDate', label: 'تاريخ تقديم الطلب' },
  { key: 'aidDate', label: 'تاريخ تقديم المساعدة' },
  { key: 'isAided', label: 'هل تم تقديم المساعدة؟' },
  { key: 'aidType', label: 'نوع المساعدة' },
  { key: 'aidDetails', label: 'تفاصيل المساعدة' },
  { key: 'status', label: 'حالة الطلب' },
  { key: 'notes', label: 'ملاحظات' }
];

  const generateCaseCode = (existing: MarriageCase[]) => {
    const lastNum = existing
      .map(c => c.caseCode)
      .filter(num => num?.startsWith('W'))
      .map(num => {
        const numPart = num?.substring(1);
        return numPart ? parseInt(numPart) : 0;
      })
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a)[0] || 0;
    return `W${lastNum + 1}`;
  };

const MARRIAGE_HELP_TYPES = [
  'أجهزة كهربائية',
  'مفروشات',
  'أدوات مطبخ',
  'مساعدة مالية',
  'خشب وتجهيز',
  'شنطة عرايس',
  'أخرى'
];

const ATTACHMENT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'brideId', label: 'بطاقة العروسة' },
  { key: 'fatherId', label: 'بطاقة الأب' },
  { key: 'motherId', label: 'بطاقة الأم' },
  { key: 'marriageContract', label: 'قسيمة الزواج' },
  { key: 'socialResearch', label: 'بحث اجتماعي' },
  { key: 'insurancePrint', label: 'برينت تأميني' },
  { key: 'other', label: 'مرفقات أخرى' },
];

const emptyAttachments = (): Record<string, FileAttachment[]> =>
  Object.fromEntries(ATTACHMENT_CATEGORIES.map(c => [c.key, []]));

const normalizeAttachments = (raw: any): Record<string, FileAttachment[]> => {
  const base = emptyAttachments();
  if (!raw) return base;
  if (Array.isArray(raw)) {
    return { ...base, other: raw };
  }
  if (typeof raw === 'object') {
    for (const c of ATTACHMENT_CATEGORIES) {
      if (Array.isArray(raw[c.key])) base[c.key] = raw[c.key];
    }
  }
  return base;
};

export default function MarriageCasesScreen() {
  const [showPrintColsModal, setShowPrintColsModal] = useState(false);
  const [printCols, setPrintCols] = useState<string[]>(['index', 'caseCode', 'brideName', 'brideNationalId', 'phone', 'requestDate', 'aidDate', 'isAided', 'aidType', 'aidDetails', 'status']);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingCase, setEditingCase] = useState<MarriageCase | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cases, setCases] = useState<MarriageCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'createdAt' | 'brideName' | 'weddingDate' | 'status' | 'requestDate' | 'aidDate' | 'address' | 'guardianName' | 'motherName' | 'isAided'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);

  // Find duplicates in marriage cases
  const duplicatesMap = useMemo(() => {
    const nameCounts: Record<string, number> = {};
    const nationalIdCounts: Record<string, number> = {};
    const phoneCounts: Record<string, number> = {};

    cases.forEach(c => {
      const name = String(c.brideName || '').trim();
      const nationalId = String(c.brideNationalId || '').trim();
      const phone1 = String(c.phone1 || '').trim();
      const phone2 = String(c.phone2 || '').trim();

      if (name && name.length > 2) {
        nameCounts[name] = (nameCounts[name] || 0) + 1;
      }
      if (nationalId && nationalId.length > 3 && nationalId !== '-' && !nationalId.includes('لا يوجد')) {
        nationalIdCounts[nationalId] = (nationalIdCounts[nationalId] || 0) + 1;
      }
      if (phone1 && phone1.length > 4 && phone1 !== '-' && !phone1.includes('لا يوجد')) {
        phoneCounts[phone1] = (phoneCounts[phone1] || 0) + 1;
      }
      if (phone2 && phone2.length > 4 && phone2 !== '-' && !phone2.includes('لا يوجد')) {
        phoneCounts[phone2] = (phoneCounts[phone2] || 0) + 1;
      }
    });

    return { nameCounts, nationalIdCounts, phoneCounts };
  }, [cases]);

  const getIsDuplicate = useCallback((c: MarriageCase) => {
    const name = String(c.brideName || '').trim();
    const nationalId = String(c.brideNationalId || '').trim();
    const phone1 = String(c.phone1 || '').trim();
    const phone2 = String(c.phone2 || '').trim();

    const isNameDup = name ? ((duplicatesMap.nameCounts[name] || 0) > 1) : false;
    const isNidDup = (nationalId && nationalId !== '-') ? ((duplicatesMap.nationalIdCounts[nationalId] || 0) > 1) : false;
    const isPhoneDup = (phone1 && phone1 !== '-') ? ((duplicatesMap.phoneCounts[phone1] || 0) > 1) : false || 
                      (phone2 && phone2 !== '-') ? ((duplicatesMap.phoneCounts[phone2] || 0) > 1) : false;

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
  
  // Tab filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'not_started'>('all');

  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger' as 'danger' | 'warning'
  });

  const [formData, setFormData] = useState({
    brideName: '',
    brideNationalId: '',
    guardianName: '',
    guardianNationalId: '',
    motherName: '',
    motherNationalId: '',
    phone1: '',
    phone2: '',
    address: '',
    marriageType: 'official' as 'official' | 'unofficial' | 'none',
    weddingDate: '',
    requiredHelp: [] as string[],
    contractDate: '',
    notes: '',
    providedHelpType: 'none' as 'monetary' | 'inkind' | 'none',
    monetaryAmount: '',
    inkindItems: '',
    attachments: emptyAttachments(),
    status: 'not_started' as 'completed' | 'in_progress' | 'not_started',
    caseCode: '',
    requestDate: new Date().toISOString().split('T')[0],
    aidDate: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'marriageCases'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarriageCase)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'marriageCases');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.brideNationalId.length !== 14) {
      alert('الرقم القومي يجب أن يكون 14 رقماً');
      return;
    }

    const isEdit = showEditForm && editingCase;

    const performSave = async () => {
      setLoading(true);
      try {
        const code = formData.caseCode || generateCaseCode(cases);
        if (isEdit) {
          await updateDoc(doc(db, 'marriageCases', editingCase.id), {
            ...formData,
            caseCode: code,
            updatedAt: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'marriageCases'), {
            ...formData,
            caseCode: code,
            createdAt: serverTimestamp()
          });
        }
        setShowAddForm(false);
        setShowEditForm(false);
        setEditingCase(null);
        resetForm();
      } catch (error) {
        handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, 'marriageCases');
      } finally {
        setLoading(false);
      }
    };

    if (!isEdit) {
      setLoading(true);
      let duplicateWarnings: string[] = [];
      try {
        duplicateWarnings = await checkDuplicateCase(formData.brideName, formData.brideNationalId);
      } catch (err) {
        console.error('Error checking duplicates:', err);
      } finally {
        setLoading(false);
      }

      if (duplicateWarnings.length > 0) {
        setConfirmConfig({
          isOpen: true,
          title: '⚠️ تنبيه: حالة مكررة مسجلة مسبقاً',
          message: `تنبيه: تم العثور على تكرار للاسم أو الرقم الرقم القومي في القوائم التالية:\n- ${duplicateWarnings.join('\n- ')}\n\nهل أنت متأكد من رغبتك في إضافة هذه الحالة على أي حال؟`,
          onConfirm: async () => {
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
            await performSave();
          }
        });
        return;
      }
    }

    await performSave();
  };

  const resetForm = () => {
    setFormData({
      brideName: '',
      brideNationalId: '',
      guardianName: '',
      guardianNationalId: '',
      motherName: '',
      motherNationalId: '',
      phone1: '',
      phone2: '',
      address: '',
      marriageType: 'official',
      weddingDate: '',
      requiredHelp: '',
      contractDate: '',
      notes: '',
      providedHelpType: 'none',
      monetaryAmount: '',
      inkindItems: '',
      attachments: emptyAttachments(),
      status: 'not_started',
      caseCode: '',
      requestDate: new Date().toISOString().split('T')[0],
      aidDate: ''
    });
  };

  const handleEdit = (c: MarriageCase) => {
    setEditingCase(c);
    setFormData({
      brideName: c.brideName || '',
      brideNationalId: c.brideNationalId || '',
      guardianName: c.guardianName || '',
      guardianNationalId: c.guardianNationalId || '',
      motherName: c.motherName || '',
      motherNationalId: c.motherNationalId || '',
      phone1: c.phone1 || '',
      phone2: c.phone2 || '',
      address: c.address || '',
      marriageType: c.marriageType || 'official',
      weddingDate: c.weddingDate || '',
      requiredHelp: c.requiredHelp || '',
      contractDate: c.contractDate || '',
      notes: c.notes || '',
      providedHelpType: c.providedHelpType || 'none',
      monetaryAmount: c.monetaryAmount || '',
      inkindItems: c.inkindItems || '',
      attachments: normalizeAttachments(c.attachments),
      status: c.status || 'not_started',
      caseCode: c.caseCode || '',
      requestDate: c.requestDate || '',
      aidDate: c.aidDate || ''
    });
    setShowEditForm(true);
  };

  const handleDelete = (id: string, name: string) => {
    const caseData = cases.find(c => c.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف حالة زواج',
      message: `هل أنت متأكد من حذف بيانات العروسة "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'marriageCases', id));
          if (caseData) {
            await logSystemAction('delete', 'marriageCases', id, caseData, `حذف حالة زواج: ${name}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `marriageCases/${id}`);
        }
      }
    });
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = 
      (c.brideName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.brideNationalId || '').includes(searchQuery) ||
      (c.guardianName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.guardianNationalId || '').includes(searchQuery) ||
      (c.motherName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.motherNationalId || '').includes(searchQuery) ||
      (c.phone1 || '').includes(searchQuery) ||
      (c.phone2 || '').includes(searchQuery) ||
      (c.address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.caseCode || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    
    const matchesDup = !filterDuplicatesOnly || getIsDuplicate(c).isDuplicate;

    return matchesSearch && matchesStatus && matchesDup;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'createdAt') {
      const dateA = (a.createdAt as any)?.seconds ? (a.createdAt as any).seconds : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const dateB = (b.createdAt as any)?.seconds ? (b.createdAt as any).seconds : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      comparison = dateA - dateB;
    } else if (sortBy === 'brideName') {
      comparison = (a.brideName || '').localeCompare(b.brideName || '', 'ar');
    } else if (sortBy === 'weddingDate') {
      comparison = (a.weddingDate || '').localeCompare(b.weddingDate || '');
    } else if (sortBy === 'status') {
      const statusOrder: Record<string, number> = { completed: 3, in_progress: 2, not_started: 1 };
      const valA = statusOrder[a.status] || 0;
      const valB = statusOrder[b.status] || 0;
      comparison = valA - valB;
    } else if (sortBy === 'requestDate') {
      comparison = (a.requestDate || '').localeCompare(b.requestDate || '');
    } else if (sortBy === 'aidDate') {
      comparison = (a.aidDate || '').localeCompare(b.aidDate || '');
    } else if (sortBy === 'address') {
      comparison = (a.address || '').localeCompare(b.address || '', 'ar');
    } else if (sortBy === 'guardianName') {
      comparison = (a.guardianName || '').localeCompare(b.guardianName || '', 'ar');
    } else if (sortBy === 'motherName') {
      comparison = (a.motherName || '').localeCompare(b.motherName || '', 'ar');
    } else if (sortBy === 'isAided') {
      const aidedA = (a.providedHelpType && a.providedHelpType !== 'none') ? 1 : 0;
      const aidedB = (b.providedHelpType && b.providedHelpType !== 'none') ? 1 : 0;
      comparison = aidedA - aidedB;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const casesToPrint = selectedCaseIds.length > 0 
      ? cases.filter(c => selectedCaseIds.includes(c.id))
      : filteredCases;

    const headerHtml = MARRIAGE_COLUMNS_INFO
      .filter((col) => printCols.includes(col.key))
      .map((col) => `<th>${col.label}</th>`)
      .join('');

    const rowsHtml = casesToPrint.map((c, i) => {
      const cellsHtml = MARRIAGE_COLUMNS_INFO
        .filter((col) => printCols.includes(col.key))
        .map((col) => {
          let val = '';
          if (col.key === 'index') {
            val = String(i + 1);
          } else if (col.key === 'caseCode') {
            val = c.caseCode || '-';
          } else if (col.key === 'brideName') {
            val = c.brideName;
          } else if (col.key === 'brideNationalId') {
            val = c.brideNationalId || '-';
          } else if (col.key === 'brideGroomName') {
            val = c.brideGroomName || '-';
          } else if (col.key === 'brideGroomNationalId') {
            val = c.brideGroomNationalId || '-';
          } else if (col.key === 'guardianName') {
            val = c.guardianName || '-';
          } else if (col.key === 'guardianNationalId') {
            val = c.guardianNationalId || '-';
          } else if (col.key === 'motherName') {
            val = c.motherName || '-';
          } else if (col.key === 'motherNationalId') {
            val = c.motherNationalId || '-';
          } else if (col.key === 'phone') {
            val = c.phone1 || '-';
          } else if (col.key === 'village') {
            val = c.village || '-';
          } else if (col.key === 'address') {
            val = c.address || '-';
          } else if (col.key === 'marriageType') {
            val = c.marriageType === 'official' ? 'رسمي' : c.marriageType === 'unofficial' ? 'غير رسمي (عرفي)' : c.marriageType === 'none' ? 'لا يوجد' : '-';
          } else if (col.key === 'requestDate') {
            val = c.requestDate || '-';
          } else if (col.key === 'aidDate') {
            val = c.aidDate || '-';
          } else if (col.key === 'isAided') {
            val = c.providedHelpType && c.providedHelpType !== 'none' ? 'نعم' : 'لا';
          } else if (col.key === 'aidType') {
            val = c.providedHelpType === 'monetary' ? 'مادية' : c.providedHelpType === 'inkind' ? 'عينية' : '-';
          } else if (col.key === 'aidDetails') {
            val = c.providedHelpType === 'monetary' ? `${c.monetaryAmount || ''} ج.م` : c.providedHelpType === 'inkind' ? (c.inkindItems || '') : '-';
          } else if (col.key === 'status') {
            val = c.status === 'completed' ? 'تم تقديم الخدمة' : c.status === 'in_progress' ? 'جاري التنفيذ' : 'لم تبدأ';
          } else if (col.key === 'notes') {
            val = c.notes || '-';
          }
          return `<td>${val}</td>`;
        })
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');

    const content = `
      <html>
        <head>
          <title>تقرير حالات الزواج</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 30px; }
            .footer { margin-top: 30px; text-align: left; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>جمعية بصمة خير نبروه</h1>
            <h2>تقرير حالات الزواج - ${new Date().toLocaleDateString('ar-EG')}</h2>
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
          <div class="footer">طبع بواسطة: ${auth.currentUser?.email || 'النظام'}</div>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrintSingleCase = (c: MarriageCase) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>تقرير_حالة_${c.brideName.replace(/\s+/g, '_')}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 40px; color: #111; line-height: 1.6; }
            .header { border-bottom: 3px double #059669; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
            .society-info { text-align: right; }
            .society-info p { margin: 0; font-size: 14px; font-weight: bold; }
            .society-logo { text-align: center; color: #059669; }
            .report-title { text-align: center; margin-bottom: 40px; background: #f0fdf4; padding: 15px; border-radius: 15px; border: 1px solid #d1fae5; }
            .report-title h1 { margin: 0; color: #065f46; font-size: 28px; }
            
            .section { margin-bottom: 30px; }
            .section-title { font-size: 20px; color: #065f46; border-right: 5px solid #059669; padding-right: 15px; margin-bottom: 20px; font-weight: bold; }
            
            .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .data-item { padding: 12px; background: #f9fafb; border-radius: 10px; border: 1px solid #f3f4f6; }
            .label { font-size: 12px; color: #6b7280; font-weight: bold; margin-bottom: 4px; display: block; }
            .value { font-size: 16px; color: #111827; font-weight: bold; }
            
            .full-width { grid-column: span 2; }
            
            .notes-box { padding: 20px; border: 1px solid #e5e7eb; border-radius: 15px; min-height: 100px; background: #fff; }
            
            .footer { margin-top: 60px; display: flex; justify-content: space-between; text-align: center; }
            .signature { width: 200px; border-top: 1px solid #ccc; padding-top: 10px; margin-top: 40px; font-weight: bold; }
            
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="society-info">
              <p>مديرية التضامن الاجتماعي بالدقهلية</p>
              <p>جمعية بصمة خير نبروه</p>
              <p>المشهرة برقم ٢٥١٠ لسنة ٢٠١٥</p>
            </div>
            <div class="society-logo">
              <h2 style="margin:0">بصمة خير</h2>
              <p style="margin:0; font-size: 10px;">نبروه</p>
            </div>
            <div style="text-align: left;">
              <p>كود الحالة: ${c.caseCode || c.id.substring(0, 8)}</p>
              <p>تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
            </div>
          </div>

          <div class="report-title">
            <h1>استمارة بيانات حالة زواج</h1>
            <p>سجل بيانات العروسة وتفاصيل المساعدة المقدمة</p>
          </div>

          <div class="section">
            <div class="section-title">بيانات العروسة الشخصية</div>
            <div class="data-grid">
              <div class="data-item"><span class="label">اسم العروسة</span><div class="value">${c.brideName}</div></div>
              <div class="data-item"><span class="label">الرقم القومي</span><div class="value">${c.brideNationalId}</div></div>
              <div class="data-item"><span class="label">تليفون (1)</span><div class="value">${c.phone1}</div></div>
              <div class="data-item"><span class="label">تليفون (2)</span><div class="value">${c.phone2 || '-'}</div></div>
              <div class="data-item"><span class="label">اسم الأم</span><div class="value">${c.motherName || '-'}</div></div>
              <div class="data-item"><span class="label">الرقم القومي للأم</span><div class="value">${c.motherNationalId || '-'}</div></div>
              <div class="data-item full-width"><span class="label">العنوان</span><div class="value">${c.address || '-'}</div></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">بيانات ولي الأمر والزواج</div>
            <div class="data-grid">
              <div class="data-item"><span class="label">اسم ولي الأمر</span><div class="value">${c.guardianName || '-'}</div></div>
              <div class="data-item"><span class="label">الرقم القومي لولي الأمر</span><div class="value">${c.guardianNationalId || '-'}</div></div>
              <div class="data-item"><span class="label">نوع الزواج</span><div class="value">${c.marriageType === 'official' ? 'رسمي' : c.marriageType === 'unofficial' ? 'عرفي' : 'لا يوجد'}</div></div>
              <div class="data-item"><span class="label">ميعاد الفرح</span><div class="value">${c.weddingDate || '-'}</div></div>
             <div class="data-item"><span class="label">تاريخ عقد الزواج</span><div class="value">${c.contractDate || '-'}</div></div>
              <div class="data-item"><span class="label">تاريخ تقديم الطلب</span><div class="value">${c.requestDate || '-'}</div></div>
              <div class="data-item full-width"><span class="label">تاريخ تقديم المساعدة</span><div class="value">${c.aidDate || '-'}</div></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">تفاصيل المساعدة</div>
            <div class="data-grid">
              <div class="data-item full-width">
                <span class="label">المساعدة المطلوبة</span>
                <div class="value">${(Array.isArray(c.requiredHelp) ? c.requiredHelp : []).join(' - ') || '-'}</div>
              </div>
              <div class="data-item">
                <span class="label">نوع المساعدة المقدمة</span>
                <div class="value">${c.providedHelpType === 'monetary' ? 'مالية' : c.providedHelpType === 'inkind' ? 'عينية (أجهزة)' : 'لم تقدم بعد'}</div>
              </div>
              <div class="data-item">
                <span class="label">المبلغ / الأصناف المستلمة</span>
                <div class="value">${c.providedHelpType === 'monetary' ? c.monetaryAmount + ' ج.م' : c.providedHelpType === 'inkind' ? c.inkindItems : '-'}</div>
              </div>
              <div class="data-item">
                <span class="label">حالة الطلب</span>
                <div class="value">${c.status === 'completed' ? 'تم التنفيذ' : c.status === 'in_progress' ? 'جاري التنفيذ' : 'لم يبدأ'}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">ملاحظات إضافية</div>
            <div class="notes-box">
              ${c.notes || 'لا توجد ملاحظات إضافية'}
            </div>
          </div>

          <div class="footer">
            <div class="signature">توقيع الباحث الاجتماعي</div>
            <div class="signature">توقيع أمين الصندوق</div>
            <div class="signature">رئيس مجلس الإدارة</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.document.title = `تقرير_حالة_${c.brideName.replace(/\s+/g, '_')}`;
    printWindow.print();
  };

  const handleDownloadPDF = async (c: MarriageCase) => {
    const content = `
      <div style="font-family: 'Amiri', serif; direction: rtl; padding: 20px; color: #111; line-height: 1.6; background: #fff; width: 210mm;">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
          .header { border-bottom: 3px double #059669; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .society-info { text-align: right; }
          .society-info p { margin: 0; font-size: 12px; font-weight: bold; }
          .society-logo { text-align: center; color: #059669; }
          .report-title { text-align: center; margin-bottom: 30px; background: #f0fdf4; padding: 12px; border-radius: 12px; border: 1px solid #d1fae5; }
          .report-title h1 { margin: 0; color: #065f46; font-size: 24px; }
          
          .section { margin-bottom: 25px; }
          .section-title { font-size: 18px; color: #065f46; border-right: 5px solid #059669; padding-right: 12px; margin-bottom: 15px; font-weight: bold; }
          
          .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .data-item { padding: 10px; background: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6; }
          .label { font-size: 11px; color: #6b7280; font-weight: bold; margin-bottom: 3px; display: block; }
          .value { font-size: 14px; color: #111827; font-weight: bold; }
          
          .full-width { grid-column: span 2; }
          .notes-box { padding: 15px; border: 1px solid #e5e7eb; border-radius: 12px; min-height: 80px; background: #fff; }
          
          .footer { margin-top: 50px; display: flex; justify-content: space-between; text-align: center; }
          .signature { width: 150px; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 30px; font-weight: bold; font-size: 12px; }
        </style>
        
        <div class="header">
          <div class="society-info">
            <p>مديرية التضامن الاجتماعي بالدقهلية</p>
            <p>جمعية بصمة خير نبروه</p>
            <p>المشهرة برقم ٢٥١٠ لسنة ٢٠١٥</p>
          </div>
          <div class="society-logo">
            <h2 style="margin:0; font-size: 20px;">بصمة خير</h2>
            <p style="margin:0; font-size: 10px;">نبروه</p>
          </div>
          <div style="text-align: left;">
            <p style="font-size: 11px; margin:0;">كود الحالة: ${c.caseCode || c.id.substring(0, 8)}</p>
            <p style="font-size: 11px; margin:0;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>

        <div class="report-title">
          <h1>استمارة بيانات حالة زواج</h1>
          <p style="font-size: 12px; margin: 4px 0 0 0;">سجل بيانات العروسة وتفاصيل المساعدة المقدمة</p>
        </div>

        <div class="section">
          <div class="section-title">بيانات العروسة الشخصية</div>
          <div class="data-grid">
            <div class="data-item"><span class="label">اسم العروسة</span><div class="value">${c.brideName}</div></div>
            <div class="data-item"><span class="label">الرقم القومي</span><div class="value">${c.brideNationalId}</div></div>
            <div class="data-item"><span class="label">تليفون (1)</span><div class="value">${c.phone1}</div></div>
            <div class="data-item"><span class="label">تليفون (2)</span><div class="value">${c.phone2 || '-'}</div></div>
            <div class="data-item"><span class="label">اسم الأم</span><div class="value">${c.motherName || '-'}</div></div>
            <div class="data-item"><span class="label">الرقم القومي للأم</span><div class="value">${c.motherNationalId || '-'}</div></div>
            <div class="data-item full-width"><span class="label">العنوان</span><div class="value">${c.address || '-'}</div></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">بيانات ولي الأمر والزواج</div>
          <div class="data-grid">
            <div class="data-item"><span class="label">اسم ولي الأمر</span><div class="value">${c.guardianName || '-'}</div></div>
            <div class="data-item"><span class="label">الرقم القومي لولي الأمر</span><div class="value">${c.guardianNationalId || '-'}</div></div>
            <div class="data-item"><span class="label">نوع الزواج</span><div class="value">${c.marriageType === 'official' ? 'رسمي' : c.marriageType === 'unofficial' ? 'عرفي' : 'لا يوجد'}</div></div>
            <div class="data-item"><span class="label">ميعاد الفرح</span><div class="value">${c.weddingDate || '-'}</div></div>
            <div class="data-item"><span class="label">تاريخ عقد الزواج</span><div class="value">${c.contractDate || '-'}</div></div>
            <div class="data-item"><span class="label">تاريخ تقديم الطلب</span><div class="value">${c.requestDate || '-'}</div></div>
            <div class="data-item full-width"><span class="label">تاريخ تقديم المساعدة</span><div class="value">${c.aidDate || '-'}</div></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">تفاصيل المساعدة</div>
          <div class="data-grid">
            <div class="data-item full-width">
              <span class="label">المساعدة المطلوبة</span>
              <div class="value">${(Array.isArray(c.requiredHelp) ? c.requiredHelp : []).join(' - ') || '-'}</div>
            </div>
            <div class="data-item">
              <span class="label">نوع المساعدة المقدمة</span>
              <div class="value">${c.providedHelpType === 'monetary' ? 'مالية' : c.providedHelpType === 'inkind' ? 'عينية (أجهزة)' : 'لم تقدم بعد'}</div>
            </div>
            <div class="data-item">
              <span class="label">المبلغ / الأصناف المستلمة</span>
              <div class="value">${c.providedHelpType === 'monetary' ? c.monetaryAmount + ' ج.م' : c.providedHelpType === 'inkind' ? c.inkindItems : '-'}</div>
            </div>
            <div class="data-item">
              <span class="label">حالة الطلب</span>
              <div class="value">${c.status === 'completed' ? 'تم التنفيذ' : c.status === 'in_progress' ? 'جاري التنفيذ' : 'لم يبدأ'}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">ملاحظات إضافية</div>
          <div class="notes-box">
            ${c.notes || 'لا توجد ملاحظات إضافية'}
          </div>
        </div>

        <div class="footer">
          <div class="signature">توقيع الباحث الاجتماعي</div>
          <div class="signature">توقيع أمين الصندوق</div>
          <div class="signature">رئيس مجلس الإدارة</div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.innerHTML = content;
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
      pdf.save(`تقرير_حالة_${c.brideName.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      document.body.removeChild(container);
    }
  };

  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const MARRIAGE_MAPPING_FIELDS = [
    { id: 'brideName', label: 'اسم العروسة' },
    { id: 'brideNationalId', label: 'الرقم القومي للعروسة' },
    { id: 'guardianName', label: 'ولي الأمر' },
    { id: 'guardianNationalId', label: 'الرقم القومي لولي الأمر' },
    { id: 'phone1', label: 'تليفون 1' },
    { id: 'phone2', label: 'تليفون 2' },
    { id: 'address', label: 'العنوان' },
    { id: 'weddingDate', label: 'ميعاد الفرح' }
  ];

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length > 0) {
          const headers = Object.keys(json[0] as any);
          setImportData({ headers, rows: json });

          const initialMap: Record<string, string> = {
            brideName: headers.find(h => h.includes('عروسة') || h.includes('الاسم')) || '',
            brideNationalId: headers.find(h => h.includes('الرقم القومي للعروسة')) || '',
            guardianName: headers.find(h => h.includes('ولي الأمر')) || '',
            phone1: headers.find(h => h.includes('تليفون') || h.includes('هاتف')) || '',
            address: headers.find(h => h.includes('عنوان')) || '',
            weddingDate: headers.find(h => h.includes('فرح') || h.includes('زفاف')) || ''
          };
          setFieldMapping(initialMap);
        }
      } catch (error) {
        alert('خطأ في قراءة ملف الإكسل');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const processMappingImport = async () => {
    if (!importData) return;
    setImporting(true);
    try {
      let count = 0;
      const getVal = (row: any, fieldId: string) => fieldMapping[fieldId] ? String(row[fieldMapping[fieldId]]) : '';
      
      for (const row of importData.rows) {
        const brideName = getVal(row, 'brideName');
        const brideNationalId = getVal(row, 'brideNationalId');
        
        if (brideName && brideNationalId.length === 14) {
          await addDoc(collection(db, 'marriageCases'), {
            brideName,
            brideNationalId,
            guardianName: getVal(row, 'guardianName'),
            guardianNationalId: getVal(row, 'guardianNationalId'),
            phone1: getVal(row, 'phone1'),
            phone2: getVal(row, 'phone2'),
            address: getVal(row, 'address'),
            weddingDate: getVal(row, 'weddingDate'),
            status: 'not_started',
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      alert(`تم استيراد ${count} حالة بنجاح`);
      setImportData(null);
    } catch (error) {
      alert('حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  const exportToExcel = () => {
    const data = filteredCases.map((c, i) => ({
      'م': i + 1,
      'كود الحالة': c.caseCode || '',
      'اسم العروسة': c.brideName,
      'الرقم القومي للعروسة': c.brideNationalId,
      'ولي الأمر': c.guardianName,
      'الرقم القومي لولي الأمر': c.guardianNationalId,
      'اسم الأم': c.motherName,
      'الرقم القومي للأم': c.motherNationalId,
      'تليفون 1': c.phone1,
      'تليفون 2': c.phone2,
      'العنوان': c.address,
      'نوع الزواج': c.marriageType === 'official' ? 'رسمي' : c.marriageType === 'unofficial' ? 'عرفي' : 'لا يوجد',
      'ميعاد الفرح': c.weddingDate,
      'تاريخ عقد الزواج': c.contractDate,
      'تاريخ تقديم الطلب': c.requestDate || '',
      'تاريخ تقديم المساعدة': c.aidDate || '',
      'هل تم تقديم المساعدة؟': c.providedHelpType && c.providedHelpType !== 'none' ? 'نعم' : 'لا',
      'المساعدة المطلوبة': (Array.isArray(c.requiredHelp) ? c.requiredHelp : []).join(', '),
      'نوع المساعدة المستلمة': c.providedHelpType === 'monetary' ? 'نقدية' : c.providedHelpType === 'inkind' ? 'عينية' : 'لا يوجد',
      'المبلغ المستلم': c.monetaryAmount || '',
      'الأجهزة المستلمة': c.inkindItems || '',
      'الحالة': c.status === 'completed' ? 'تم' : c.status === 'in_progress' ? 'جاري' : 'لا',
      'ملاحظات': c.notes
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "حالات الزواج");
    XLSX.writeFile(wb, `حالات_الزواج_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Visual Section Header Banner */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-emerald-900 h-48 flex items-center p-8 text-white shadow-lg border border-emerald-800">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=1200" 
            alt="Marriage Support" 
            className="w-full h-full object-cover opacity-20 select-none"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-900/90 to-emerald-950/40" />
        </div>
        <div className="relative z-10 w-full text-right">
          <h1 className="text-3xl font-black mb-2">تيسير زواج الفتيات واليتيمات</h1>
          <p className="text-emerald-200 text-xs md:text-sm font-semibold max-w-2xl leading-relaxed">
            مبادرة بصمة خير لتيسير وتجهيز الفتيات المقبلات على الزواج من مستفيدي الجمعية والأيتام، وتأمين الأجهزة الكهربائية والمستلزمات العينية الأساسية لبناء حياة مستقرة جديدة.
          </p>
        </div>
      </div>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-emerald-50">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-600 p-3 rounded-2xl shadow-lg shadow-emerald-200">
            <PartyPopper className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-emerald-900">حالات الزواج</h1>
            <p className="text-emerald-600/60 font-medium">إدارة ومتابعة طلبات المساعدة للزواج</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all cursor-pointer" title="استيراد Excel">
            <FileUp className="w-6 h-6" />
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          </label>
          <button 
            onClick={exportToExcel}
            className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"
            title="تصدير Excel"
          >
            <FileOutput className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setShowPrintColsModal(true)}
            className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"
            title="طباعة"
          >
            <Printer className="w-6 h-6" />
          </button>
          <button 
            onClick={() => { resetForm(); setShowAddForm(true); }}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-200"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة حالة</span>
          </button>
        </div>
      </div>

      {/* Stats and Filter Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <StatCard label="إجمالي الحالات" value={cases.length} icon={<Users className="w-5 h-5" />} color="emerald" />
         <StatCard label="تمت المساعدة" value={cases.filter(c => c.status === 'completed').length} icon={<CheckCircle2 className="w-5 h-5" />} color="blue" />
         <StatCard label="قيد المتابعة" value={cases.filter(c => c.status === 'in_progress').length} icon={<Clock className="w-5 h-5" />} color="amber" />
         <StatCard label="طلب جديد" value={cases.filter(c => c.status === 'not_started').length} icon={<Plus className="w-5 h-5" />} color="rose" />
      </div>

      {duplicateCasesCount > 0 && (
        <div 
          onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
          className={cn(
            "p-5 rounded-[2.5rem] flex flex-row-reverse items-center justify-between cursor-pointer border transition-all text-right select-none",
            filterDuplicatesOnly 
              ? "bg-rose-100 border-rose-300 text-rose-950 shadow-md scale-[1.01]" 
              : "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100"
          )}
        >
          <div className="flex items-center gap-3 flex-row-reverse">
            <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce shrink-0" />
            <div>
              <span className="font-extrabold text-sm block">تم كشف {duplicateCasesCount} حالة تكرار في الاسم أو الهوية أو الهاتف للعرائس!</span>
              <span className="text-xs font-bold text-rose-600">انقر هنا لعرض الحالات المكررة فقط وتصفيتها لتدقيقها والتحقق منها</span>
            </div>
          </div>
          <span className={cn(
            "px-4 py-2 rounded-2xl text-xs font-black transition-all",
            filterDuplicatesOnly ? "bg-rose-600 text-white" : "bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
          )}>
            {filterDuplicatesOnly ? "عرض كل الحالات" : "عرض الحالات المكررة"}
          </span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-emerald-50 space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="بحث باسم العروسة أو الرقم القومي أو التليفون..." 
              className="w-full pr-12 pl-4 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 ring-emerald-500/20 text-emerald-900 font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex bg-stone-50 p-1.5 rounded-2xl">
             <FilterBtn active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="الكل" />
             <FilterBtn active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} label="تمت" />
             <FilterBtn active={statusFilter === 'in_progress'} onClick={() => setStatusFilter('in_progress')} label="جاري" />
             <FilterBtn active={statusFilter === 'not_started'} onClick={() => setStatusFilter('not_started')} label="لا" />
          </div>
        </div>

        {/* Sorting and Summary */}
        <div className="flex items-center justify-between border-t border-emerald-50 pt-4">
            <div className="flex items-center gap-4 text-sm font-bold text-emerald-800">
               <span>الحالات:</span>
               <span className="text-emerald-600 font-mono">{filteredCases.length}</span>
            </div>
            <div className="flex items-center gap-2 text-right">
              <ArrowUpDown className="w-4 h-4 text-emerald-500" />
              <select 
                className="bg-transparent border-none text-xs font-bold text-emerald-700 outline-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="createdAt">تاريخ الإضافة</option>
                <option value="brideName">اسم العروسة</option>
                <option value="weddingDate">تاريخ الفرح</option>
                <option value="requestDate">تاريخ تقديم الطلب</option>
                <option value="aidDate">تاريخ تقديم المساعدة</option>
                <option value="address">العنوان</option>
                <option value="guardianName">اسم ولي الأمر</option>
                <option value="motherName">اسم الأم</option>
                <option value="isAided">حالة المساعدة</option>
                <option value="status">حالة الطلب العامة</option>
              </select>
              <select 
                className="bg-transparent border-none text-xs font-bold text-emerald-700 outline-none"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
              >
                <option value="desc">تنازلي</option>
                <option value="asc">تصاعدي</option>
              </select>
            </div>
        </div>

        {/* Table */}
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          <table className="w-full text-right min-w-[2000px]" dir="rtl">
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
                <th className="px-6 py-4">اسم العروسة / الرقم القومي</th>
                <th className="px-6 py-4">ولي الأمر / الرقم القومي</th>
                <th className="px-6 py-4">الأم / الرقم القومي</th>
                <th className="px-6 py-4">العنوان</th>
                <th className="px-6 py-4">نوع الزواج</th>
                <th className="px-6 py-4">تاريخ الطلب</th>
                <th className="px-6 py-4">تاريخ المساعدة</th>
                <th className="px-6 py-4">المساعدة المسلمة</th>
                <th className="px-6 py-4">تليفون</th>
                <th className="px-6 py-4">ميعاد الفرح</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4 text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {loading ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-emerald-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-emerald-300 font-bold">لاتوجد حالات مطابقة للبحث</td>
                </tr>
              ) : filteredCases.map((c, index) => (
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
                  <td className="px-6 py-4">
                    {(() => {
                      const dupInfo = getIsDuplicate(c);
                      return (
                        <div className="flex flex-col gap-1">
                          <div className={cn(
                            "font-bold text-sm",
                            dupInfo.isDuplicate ? "text-rose-700 font-extrabold" : "text-emerald-950"
                          )}>{c.brideName}</div>
                          <div className="text-xs text-emerald-600/60 font-mono">رقم قومي: {c.brideNationalId}</div>
                          {dupInfo.isDuplicate && (
                            <div className="flex items-center gap-1.5 text-[9px] font-black bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.5 rounded-lg w-max select-none mt-1">
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
                    <div className="mt-2 flex flex-wrap gap-1 justify-start">
                      {(Array.isArray(c.requiredHelp) ? c.requiredHelp : []).map((help, idx) => (
                        <span key={idx} className="bg-emerald-100/50 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 border border-emerald-100">
                          {help}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-sm text-emerald-950">{c.guardianName || '-'}</div>
                    <div className="text-xs text-emerald-600/60 font-mono">{c.guardianNationalId ? `رقم قومي: ${c.guardianNationalId}` : '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-sm text-emerald-950">{c.motherName || '-'}</div>
                    <div className="text-xs text-emerald-600/60 font-mono">{c.motherNationalId ? `رقم قومي: ${c.motherNationalId}` : '-'}</div>
                  </td>
                  <td className="px-6 py-4 max-w-xs">
                    <div className="text-sm font-medium text-emerald-900 truncate" title={c.address}>{c.address || '-'}</div>
                    <div className="text-xs text-emerald-600/60">{c.village || ''}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-bold",
                      c.marriageType === 'official' ? "bg-cyan-50 text-cyan-700 border border-cyan-100" :
                      c.marriageType === 'unofficial' ? "bg-amber-50 text-amber-700 border border-amber-100" :
                      "bg-stone-50 text-stone-500 border border-stone-100"
                    )}>
                      {c.marriageType === 'official' ? 'رسمي' : c.marriageType === 'unofficial' ? 'عرفي' : 'لا يوجد'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-bold text-stone-600 font-mono">{c.requestDate || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-bold text-emerald-600 font-mono">{c.aidDate || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {c.providedHelpType === 'monetary' ? (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-emerald-500 uppercase">نقدية</span>
                        <span className="text-sm font-black text-emerald-900 tabular-nums">{c.monetaryAmount} ج.م</span>
                      </div>
                    ) : c.providedHelpType === 'inkind' ? (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-blue-500 uppercase">عينية</span>
                        <span className="text-xs font-bold text-emerald-800 line-clamp-1" title={c.inkindItems}>{c.inkindItems}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-emerald-800 tabular-nums">{c.phone1}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-emerald-700">{c.weddingDate || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold",
                      c.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                      c.status === 'in_progress' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                    )}>
                      {c.status === 'completed' ? 'تم' : c.status === 'in_progress' ? 'جاري' : 'لا'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-left">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handlePrintSingleCase(c)} title="طباعة تفصيلية" className="p-2 text-emerald-950 hover:bg-emerald-100 rounded-lg transition-all">
                        <Printer className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleDownloadPDF(c)} title="حفظ بصيغة PDF" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <FileDown className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleEdit(c)} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg"><Edit className="w-5 h-5" /></button>
                      <button onClick={() => handleDelete(c.id, c.brideName)} className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Form Modal */}
      <AnimatePresence>
        {importData && (
          <div className="fixed inset-0 bg-emerald-950/80 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full p-8"
            >
              <div className="flex items-center justify-between mb-8 border-b pb-6">
                <h2 className="text-3xl font-black text-emerald-950 text-right w-full">استيراد حالات الزواج من إكسل</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {MARRIAGE_MAPPING_FIELDS.map(field => (
                  <div key={field.id} className="text-right">
                    <label className="text-sm font-black text-emerald-800 block mb-2">{field.label}</label>
                    <select 
                      value={fieldMapping[field.id] || ''}
                      onChange={(e) => setFieldMapping({...fieldMapping, [field.id]: e.target.value})}
                      className="w-full bg-emerald-50 border-2 border-emerald-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                    >
                      <option value="">-- اختر العمود --</option>
                      {importData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex flex-row-reverse gap-4">
                <button 
                  onClick={processMappingImport}
                  disabled={importing || !fieldMapping.brideName}
                  className="flex-grow bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 disabled:bg-stone-300"
                >
                  {importing ? 'جاري الاستيراد...' : 'بدء الاستيراد'}
                </button>
                <button onClick={() => setImportData(null)} className="px-12 bg-stone-100 text-stone-500 py-5 rounded-2xl font-bold">إلغاء</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(showAddForm || showEditForm) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowAddForm(false); setShowEditForm(false); }}
              className="absolute inset-0 bg-emerald-950/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden relative z-10 flex flex-col"
            >
              <div className="bg-emerald-900 p-6 text-white flex items-center justify-between">
                <h2 className="text-xl font-bold">{showEditForm ? 'تعديل بيانات العروسة' : 'إضافة حالة زواج جديدة'}</h2>
                <button onClick={() => { setShowAddForm(false); setShowEditForm(false); }} className="hover:bg-white/10 p-2 rounded-full"><X className="w-6 h-6" /></button>
              </div>

              <div className="overflow-y-auto p-8 bg-stone-50 custom-scrollbar">
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Section 1: Bride Info */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-black text-emerald-800 border-r-4 border-emerald-500 pr-3">بيانات العروسة</h3>
                      <FormInput label="اسم العروسة بالكامل" value={formData.brideName} onChange={val => setFormData({...formData, brideName: val})} required />
                      <FormInput label="الرقم القومي (14 رقم)" value={formData.brideNationalId} onChange={val => setFormData({...formData, brideNationalId: val})} maxLength={14} required />
                      <div className="grid grid-cols-2 gap-4">
                        <FormInput label="تليفون 1" value={formData.phone1} onChange={val => setFormData({...formData, phone1: val})} required />
                        <FormInput label="تليفون 2" value={formData.phone2} onChange={val => setFormData({...formData, phone2: val})} />
                      </div>
                      <FormInput label="العنوان" value={formData.address} onChange={val => setFormData({...formData, address: val})} />
                      <FormInput label="اسم الأم" value={formData.motherName} onChange={val => setFormData({...formData, motherName: val})} />
                      <FormInput label="الرقم القومي للأم" value={formData.motherNationalId} onChange={val => setFormData({...formData, motherNationalId: val})} maxLength={14} />
                    </div>

                    {/* Section 2: Guardian & Wedding Info */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-black text-emerald-800 border-r-4 border-amber-500 pr-3">بيانات ولي الأمر والزواج</h3>
                      <FormInput label="اسم ولي الأمر" value={formData.guardianName} onChange={val => setFormData({...formData, guardianName: val})} />
                      <FormInput label="الرقم القومي لولي الأمر" value={formData.guardianNationalId} onChange={val => setFormData({...formData, guardianNationalId: val})} maxLength={14} />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-emerald-800 mr-1">نوع الزواج</label>
                          <select 
                            className="w-full bg-white p-4 rounded-2xl border border-emerald-100 font-bold focus:ring-2 ring-emerald-500/20"
                            value={formData.marriageType}
                            onChange={e => setFormData({...formData, marriageType: e.target.value as any})}
                          >
                            <option value="official">رسمي</option>
                            <option value="unofficial">عرفي</option>
                            <option value="none">لا يوجد</option>
                          </select>
                        </div>
                        <FormInput label="ميعاد الفرح" placeholder="مثال: 2024-05-20" value={formData.weddingDate} onChange={val => setFormData({...formData, weddingDate: val})} />
                      </div>
                      <FormInput label="تاريخ عقد الزواج" value={formData.contractDate} onChange={val => setFormData({...formData, contractDate: val})} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormInput label="تاريخ تقديم الطلب" type="date" value={formData.requestDate} onChange={val => setFormData({...formData, requestDate: val})} />
                        <FormInput label="تاريخ تقديم المساعدة" type="date" value={formData.aidDate} onChange={val => setFormData({...formData, aidDate: val})} />
                      </div>
                      <FormInput label="كود الحالة (يُولَّد تلقائيًا إن تُرك فارغًا)" placeholder="MAR-2026-0001" value={formData.caseCode} onChange={val => setFormData({...formData, caseCode: val})} />
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-emerald-800 pr-2 block text-right">المساعدة المطلوبة (يمكن اختيار أكثر من نوع)</label>
                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {MARRIAGE_HELP_TYPES.map(type => (
                            <label key={type} className="flex items-center gap-2 cursor-pointer group justify-end">
                              <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-600 transition-colors">{type}</span>
                              <input 
                                type="checkbox"
                                className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                                checked={Array.isArray(formData.requiredHelp) && formData.requiredHelp.includes(type)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const current = Array.isArray(formData.requiredHelp) ? formData.requiredHelp : [];
                                  setFormData(prev => ({
                                    ...prev,
                                    requiredHelp: checked 
                                      ? [...current, type]
                                      : current.filter(t => t !== type)
                                  }));
                                }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-emerald-800 mr-1">حالة المساعدة</label>
                        <select 
                          className="w-full bg-white p-4 rounded-2xl border border-emerald-100 font-bold focus:ring-2 ring-emerald-500/20"
                          value={formData.status}
                          onChange={e => setFormData({...formData, status: e.target.value as any})}
                        >
                          <option value="not_started">لا (طلب جديد)</option>
                          <option value="in_progress">جاري</option>
                          <option value="completed">تمت المساعدة</option>
                        </select>
                      </div>

                      {/* New Section: Provided Help Details */}
                      <div className="space-y-4 pt-4 border-t border-emerald-100">
                        <h3 className="text-sm font-black text-emerald-800 border-r-4 border-emerald-500 pr-3">تفاصيل المساعدة المقدمة</h3>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-emerald-800 mr-1">نوع المساعدة المقدمة</label>
                            <div className="flex gap-4">
                              {[
                                { id: 'none', label: 'لم تقدم بعد' },
                                { id: 'monetary', label: 'نقدية' },
                                { id: 'inkind', label: 'عينية (أجهزة)' }
                              ].map(type => (
                                <label key={type.id} className="flex items-center gap-2 cursor-pointer bg-white p-3 rounded-xl border border-emerald-100 flex-grow hover:border-emerald-500 transition-all">
                                  <input 
                                    type="radio" 
                                    name="providedHelpType" 
                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" 
                                    checked={formData.providedHelpType === type.id}
                                    onChange={() => setFormData({...formData, providedHelpType: type.id as any})}
                                  />
                                  <span className="text-xs font-bold text-emerald-900">{type.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {formData.providedHelpType === 'monetary' && (
                            <FormInput label="المبلغ المستلم (جنيه)" value={formData.monetaryAmount || ''} onChange={val => setFormData({...formData, monetaryAmount: val})} type="number" />
                          )}

                          {formData.providedHelpType === 'inkind' && (
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-emerald-800 mr-1">الأجهزة / الأصناف المستلمة</label>
                              <textarea 
                                rows={3}
                                placeholder="مثال: غسالة توشيبا، ثلاجة شارب..."
                                className="w-full bg-white p-4 rounded-2xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 font-bold"
                                value={formData.inkindItems}
                                onChange={e => setFormData({...formData, inkindItems: e.target.value})}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-emerald-800 mr-1">ملاحظات ووثائق</label>
                    <textarea 
                      rows={3}
                      className="w-full bg-white p-4 rounded-2xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 font-bold mb-4"
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {ATTACHMENT_CATEGORIES.map(cat => (
                        <FileUploadSlot
                          key={cat.key}
                          label={cat.label}
                          caseName={formData.brideName || 'حالة_زواج'}
                          values={(formData.attachments as any)?.[cat.key] || []}
                          storagePath={`marriage/docs/${cat.key}`}
                          onUpload={(updater) => {
                            setFormData(prev => {
                              const current = (prev.attachments as any) || emptyAttachments();
                              const prevList = current[cat.key] || [];
                              const next = typeof updater === 'function' ? (updater as any)(prevList) : updater;
                              return { ...prev, attachments: { ...current, [cat.key]: next } };
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button type="submit" className="flex-grow bg-emerald-600 text-white font-bold py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200">
                      {showEditForm ? 'تحديث البيانات' : 'حفظ البيانات'}
                    </button>
                    <button type="button" onClick={() => { setShowAddForm(false); setShowEditForm(false); }} className="px-8 bg-stone-200 text-stone-600 font-bold py-4 rounded-2xl hover:bg-stone-300 transition-all">إلغاء</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Columns Selection Modal */}
      <AnimatePresence>
        {showPrintColsModal && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-2xl w-full border border-emerald-50 text-right"
              dir="rtl"
            >
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                <h3 className="text-xl font-black text-emerald-950 flex items-center gap-2">
                  <Printer className="w-6 h-6 text-emerald-600" />
                  تخصيص أعمدة الطباعة لحالات الزواج
                </h3>
                <button 
                  type="button" 
                  onClick={() => setShowPrintColsModal(false)}
                  className="p-2 text-stone-400 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm font-bold text-stone-500 mb-4 leading-relaxed">
                قم بتحديد الخانات التي تود أن تظهر في الكشف المطبوع لحالات الزواج. يمكنك اختيار أي عدد من الخانات لعرضها في جدول الطباعة:
              </p>

              <div className="flex gap-4 mb-4">
                <button 
                  type="button"
                  onClick={() => setPrintCols(MARRIAGE_COLUMNS_INFO.map(c => c.key))}
                  className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs hover:bg-emerald-100 transition-colors"
                >
                  اختيار الكل
                </button>
                <button 
                  type="button"
                  onClick={() => setPrintCols(['index', 'brideName'])}
                  className="px-4 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl text-xs hover:bg-stone-200 transition-colors"
                >
                  إلغاء تحديد الكل
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-80 overflow-y-auto p-2 border border-stone-100 rounded-2xl bg-stone-50">
                {MARRIAGE_COLUMNS_INFO.map((col) => {
                  const isChecked = printCols.includes(col.key);
                  return (
                    <label 
                      key={col.key}
                      className={cn(
                        "flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all font-bold text-sm bg-white",
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

              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => {
                    setShowPrintColsModal(false);
                    handlePrint();
                  }}
                  disabled={printCols.length === 0}
                  className="flex-1 bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  تأكيد وبدء الطباعة
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowPrintColsModal(false)}
                  className="px-6 bg-stone-100 text-stone-500 font-bold py-4 rounded-2xl hover:bg-stone-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        variant={confirmConfig.type}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const colors: any = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100"
  };
  return (
    <div className={cn("p-4 rounded-3xl border flex items-center justify-between", colors[color])}>
      <div>
        <p className="text-[10px] font-black uppercase opacity-60 mb-1">{label}</p>
        <p className="text-2xl font-black tabular-nums">{value}</p>
      </div>
      <div className={cn("p-3 rounded-2xl", color === 'emerald' ? "bg-emerald-100" : color === 'blue' ? "bg-blue-100" : color === 'amber' ? "bg-amber-100" : "bg-rose-100")}>
        {icon}
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-6 py-2 rounded-xl text-sm font-bold transition-all",
        active ? "bg-white text-emerald-700 shadow-sm" : "text-emerald-400 hover:text-emerald-600"
      )}
    >
      {label}
    </button>
  );
}

function FormInput({ label, value, onChange, required = false, type = "text", maxLength, placeholder }: { label: string; value: string; onChange: (val: string) => void; required?: boolean; type?: string; maxLength?: number; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-emerald-800 mr-1">{label} {required && <span className="text-rose-500">*</span>}</label>
      <input 
        type={type}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full bg-white p-4 rounded-2xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 font-bold text-sm"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}