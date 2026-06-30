// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, Search, Phone, User, FileText, MapPin, Printer, Download, Trash2, Edit, X, Save, CheckCircle2, AlertCircle, FileCheck, ClipboardList, ListChecks, Heart, Share2, Users, Clock, Shield, UploadCloud, ArrowRightLeft, Loader2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ConfirmModal from './ConfirmModal';
import UnifiedTransferModal from './UnifiedTransferModal';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';
import { checkDuplicateCase } from '../lib/duplicateRegistry';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface OrphanCase {
  id: string;
  caseCode?: string;
  guardianName: string;
  guardianId: string;
  orphans: {
    name: string;
    id: string;
    birthDate?: string;
    schoolStage?: string;
    schoolGrade?: string;
    orphanCode?: string;
  }[];
  isSponsored: boolean;
  sponsorshipAmount?: number;
  phone1: string;
  phone2: string;
  markaz: string;
  village: string;
  address: string;
  filesStatus: 'registered' | 'not_registered';
  researchFormStatus: 'registered' | 'not_registered';
  submissionStatus: 'done' | 'processing';
  registrationPlace: 'council' | 'hayatem' | 'medical' | 'none';
  attachments?: FileAttachment[];
  createdAt: any;
  docFiles?: Record<string, FileAttachment[]>;
}

// Agency display names + case-code prefixes per registrationPlace
const AGENCY_NAMES: Record<string, string> = {
  council: 'المجلس الإسلامي للدعوة والإغاثة',
  hayatem: 'هيئة الأعمال الخيرية',
  medical: 'قسم الحالات المرضية - هيئة الأعمال الخيرية',
  none: 'هيئة الأعمال الخيرية',
};
const AGENCY_PREFIX: Record<string, string> = {
  council: 'MID',
  hayatem: 'HAY',
  medical: 'MED',
  none: 'GEN',
};

const MISSING_DOCS_OPTIONS = [
  'بطاقة المعيل',
  'شهادات ميلاد اليتيم',
  'شهادة الوفاة',
  'صورة الام',
  'صورة اليتيم',
  'إفادة مدرسية',
  'برينت تأميني',
  'بحث اجتماعي',
  'رقم الهاتف',
  'العنوان',
  'لا يوجد'
];

const SENDING_AUTHORITIES = [
  'الهياتم',
  'المجلس الإسلامي',
  'ا/ عصام',
  'لم يتم الارسال'
];

interface NewOrphanRegistration {
  id: string;
  guardianName: string;
  guardianId: string;
  orphanName: string;
  orphanId: string;
  phone1: string;
  phone2: string;
  markaz: string;
  village: string;
  address: string;
  isFilesRegistered: boolean;
  isFormDone: boolean;
  isSent: boolean;
  missingFiles: string[];
  sendingAuthority: string;
  registrationDate?: string;
  notes?: string;
  createdAt: any;
  updatedAt?: any;
}

const generateCaseCode = (place: string, existing: OrphanCase[]) => {
  const prefix = AGENCY_PREFIX[place] || 'GEN';
  const year = new Date().getFullYear();
  const sameYear = existing.filter((o) => (o.caseCode || '').startsWith(`${prefix}-${year}-`));
  const next = String(sameYear.length + 1).padStart(4, '0');
  return `${prefix}-${year}-${next}`;
};

const REQUIRED_DOCS_LIST = [
  'بطاقة المعيل',
  'شهادة الوفاة',
  'شهادات الميلاد',
  'صورة المعيل',
  'صور الايتام',
  'إفادات مدرسية',
  'برينت تأميني',
  'بحث اجتماعي معتمد من الشؤون الاجتماعية'
];

const PERIODIC_RESEARCH_DOCS = [
  'صورة لليتيم',
  'صورة للمنزل',
  'اثبات قيد',
  'صورة للأم',
  'عقد ايجار',
  'تقرير طبي',
  'استمارة البحث'
];

const TRANSFER_CASE_CATEGORIES = [
  'أيتام',
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

interface PeriodicResearch {
  id: string;
  date?: any;
  createdAt?: any;
  researchNumber?: string;
  researchDate?: string;
  targetOrphanIndex?: number; // which orphan in the case this research is for
  targetOrphanName?: string;
  targetSchoolStage?: string;
  targetSchoolGrade?: string; // grade at time of research
  isAlive: boolean;
  housingType: 'owned' | 'rent';
  rentAmount?: number;
  hasChanged: boolean;
  expenses: {
    school: number;
    living: number;
    other: number;
  };
  income: {
    pension: number;
    insurance: number;
    salary: number;
    other: number;
  };
  notes: string;
  docFiles?: Record<string, FileAttachment[]>;
}

const SCHOOL_STAGES = [
  'رياض الأطفال',
  'الابتدائي',
  'الاعدادي',
  'الثانوي',
  'الثانوي الفني',
  'الجامعة',
  'أنهى الدراسة',
  'معهد فني',
  'دراسات عليا',
  'متسرب من التعليم'
];

const SEMESTERS = [
  'الفصل الدراسي الأول',
  'الفصل الدراسي الثاني'
];

const GRADE_MAPPING: Record<string, string[]> = {
  'رياض الأطفال': ['المستوى الأول', 'المستوى الثاني'],
  'الابتدائي': ['الصف الأول', 'الصف الثاني', 'الصف الثالث', 'الصف الرابع', 'الصف الخامس', 'الصف السادس'],
  'الاعدادي': ['الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي'],
  'الثانوي': ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي'],
  'الثانوي الفني': ['الصف الأول', 'الصف الثاني', 'الصف الثالث', 'الصف الرابع', 'الصف الخامس'],
  'الجامعة': ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة', 'الفرقة الخامسة', 'الفرقة السادسة'],
  'معهد فني': ['الفرقة الأولى', 'الفرقة الثانية'],
  'دراسات عليا': ['سنة أولى تمهيدي', 'سنة ثانية تمهيدي', 'ماجستير', 'دكتوراه'],
  'أنهى الدراسة': ['متخرج'],
  'متسرب من التعليم': ['ترك التعليم']
};

export default function OrphansScreen() {
  const [activeTab, setActiveTab] = useState<'database' | 'new_registrations'>('database');
  const [orphans, setOrphans] = useState<OrphanCase[]>([]);
  const [newRegistrations, setNewRegistrations] = useState<NewOrphanRegistration[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [placeFilter, setPlaceFilter] = useState<'all' | 'council' | 'hayatem' | 'medical'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCase, setEditingCase] = useState<OrphanCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPeriodicResearch, setShowPeriodicResearch] = useState<OrphanCase | null>(null);
  const [researchList, setResearchList] = useState<PeriodicResearch[]>([]);
  const [showAddResearch, setShowAddResearch] = useState(false);
  const [editingResearch, setEditingResearch] = useState<PeriodicResearch | null>(null);
  const [viewingResearch, setViewingResearch] = useState<PeriodicResearch | null>(null);
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);

  // Find duplicates in orphans (by guardian/caregiver metadata)
  const duplicatesMap = useMemo(() => {
    const nameCounts: Record<string, number> = {};
    const nationalIdCounts: Record<string, number> = {};
    const phoneCounts: Record<string, number> = {};

    orphans.forEach(o => {
      const name = String(o.guardianName || '').trim();
      const nationalId = String(o.guardianId || '').trim();
      const phone1 = String(o.phone1 || '').trim();
      const phone2 = String(o.phone2 || '').trim();

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
  }, [orphans]);

  const getIsDuplicate = useCallback((o: OrphanCase) => {
    const name = String(o.guardianName || '').trim();
    const nationalId = String(o.guardianId || '').trim();
    const phone1 = String(o.phone1 || '').trim();
    const phone2 = String(o.phone2 || '').trim();

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

  const duplicateOrphansCount = useMemo(() => {
    return orphans.filter(o => getIsDuplicate(o).isDuplicate).length;
  }, [orphans, getIsDuplicate]);

  const initialForm = {
    guardianName: '',
    guardianId: '',
    orphans: [{ name: '', id: '', birthDate: '', schoolStage: '', schoolGrade: '', orphanCode: '' }],
    isSponsored: false,
    sponsorshipAmount: 0,
    phone1: '',
    phone2: '',
    markaz: 'نبروه',
    village: '',
    address: '',
    filesStatus: 'not_registered' as const,
    researchFormStatus: 'not_registered' as const,
    submissionStatus: 'processing' as const,
    registrationPlace: 'none' as const,
    docFiles: {} as Record<string, FileAttachment[]>,
    attachments: [] as FileAttachment[]
  };

  const initialNewRegistrationForm = {
    guardianName: '',
    guardianId: '',
    orphanName: '',
    orphanId: '',
    phone1: '',
    phone2: '',
    markaz: 'نبروه',
    village: '',
    address: '',
    isFilesRegistered: false,
    isFormDone: false,
    isSent: false,
    missingFiles: [] as string[],
    sendingAuthority: SENDING_AUTHORITIES[0],
    registrationDate: new Date().toISOString().split('T')[0],
    notes: ''
  };

  const [newRegFilters, setNewRegFilters] = useState({
    search: '',
    guardianName: '',
    guardianId: '',
    orphanName: '',
    village: '',
    sendingAuthority: 'all',
    status: 'all'
  });
  const [newRegSortBy, setNewRegSortBy] = useState<string>('registrationDate');
  const [newRegSortOrder, setNewRegSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedNewRegIds, setSelectedNewRegIds] = useState<string[]>([]);
  const [showNewRegPrintModal, setShowNewRegPrintModal] = useState(false);
  const [printColumns, setPrintColumns] = useState<Record<string, boolean>>({
    index: true,
    registrationDate: true,
    guardianName: true,
    guardianId: true,
    orphanName: true,
    orphanId: true,
    phone1: true,
    phone2: false,
    markaz: false,
    village: true,
    address: true,
    isFilesRegistered: true,
    isFormDone: true,
    isSent: true,
    missingFiles: true,
    sendingAuthority: true,
  });

  const ALL_PRINT_COLUMNS = [
    { key: 'index', label: 'مسلسل' },
    { key: 'registrationDate', label: 'تاريخ التسجيل' },
    { key: 'guardianName', label: 'اسم الأم / المعيل' },
    { key: 'guardianId', label: 'الرقم القومي للمعيل' },
    { key: 'orphanName', label: 'اسم اليتيم' },
    { key: 'orphanId', label: 'الرقم القومي لليتيم' },
    { key: 'phone1', label: 'رقم الهاتف 1' },
    { key: 'phone2', label: 'رقم الهاتف 2' },
    { key: 'markaz', label: 'المركز' },
    { key: 'village', label: 'القرية' },
    { key: 'address', label: 'العنوان بالتفصيل' },
    { key: 'isFilesRegistered', label: 'تسجيل الملفات' },
    { key: 'isFormDone', label: 'عمل الاستمارة' },
    { key: 'isSent', label: 'تم الإرسال' },
    { key: 'missingFiles', label: 'الملفات الناقصة' },
    { key: 'sendingAuthority', label: 'الهيئة المرسل إليها' },
  ];

  const [researchForm, setResearchForm] = useState({
    researchNumber: '',
    researchDate: new Date().toISOString().split('T')[0],
    targetOrphanIndex: 0,
    targetOrphanName: '',
    targetSchoolStage: '',
    targetSchoolGrade: '',
    isAlive: true,
    housingType: 'owned' as const,
    rentAmount: 0,
    hasChanged: false,
    expenses: { school: 0, living: 0, other: 0 },
    income: { pension: 0, insurance: 0, salary: 0, other: 0 },
    notes: '',
    docFiles: {} as Record<string, FileAttachment[]>
  });

  const [unifiedTransferCase, setUnifiedTransferCase] = useState<any>(null);

  const [formData, setFormData] = useState(initialForm);
  const [newRegFormData, setNewRegFormData] = useState(initialNewRegistrationForm);
  const [showNewRegForm, setShowNewRegForm] = useState(false);
  const [editingNewReg, setEditingNewReg] = useState<NewOrphanRegistration | null>(null);
  const [excelImportData, setExcelImportData] = useState<{
    headers: string[];
    rows: any[];
  } | null>(null);
  const [selectedExtraColumns, setSelectedExtraColumns] = useState<string[]>([]);

  const [excelMapping, setExcelMapping] = useState({
    guardianName: '',
    guardianId: '',
    orphanName: '',
    orphanId: '',
    phone1: '',
    phone2: '',
    markaz: '',
    village: '',
    address: '',
    missingFiles: '',
    notes: '',

    dateType: 'file' as 'file' | 'uniform',
    uniformDate: new Date().toISOString().split('T')[0],
    fileDateColumn: '',

    sendingAuthType: 'uniform' as 'file' | 'uniform',
    uniformSendingAuth: SENDING_AUTHORITIES[0],
    fileSendingAuthColumn: '',

    isFilesType: 'uniform' as 'file' | 'uniform',
    uniformIsFiles: false,
    fileIsFilesColumn: '',

    isFormType: 'uniform' as 'file' | 'uniform',
    uniformIsForm: false,
    fileIsFormColumn: '',

    isSentType: 'uniform' as 'file' | 'uniform',
    uniformIsSent: false,
    fileIsSentColumn: ''
  });

  const [sortBy, setSortBy] = useState<'orphanName' | 'guardianName' | 'village' | 'address'>('orphanName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [orphanDupWarnings, setOrphanDupWarnings] = useState<string[]>([]);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [importing, setImporting] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    orphanName: '',
    orphanId: '',
    guardianName: '',
    village: ''
  });
  const [selectedOrphanIds, setSelectedOrphanIds] = useState<string[]>([]);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

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

  const getPreviewValue = (excelHeader: string) => {
    if (!importData || !excelHeader) return '';
    return String(importData.rows[0]?.[excelHeader] || '');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length > 0) {
          setImporting(true);
          const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          const headers = (sheetRows[0] || []).map(h => String(h || '').trim()).filter(Boolean);
          
          const mapping = {
            orphanName: headers.find(h => h.includes('اسم اليتيم') || h.includes('اليتيم')) || '',
            orphanId: headers.find(h => h.includes('الرقم القومي لليتيم') || h.includes('قومي اليتيم') || h.includes('بطاقة اليتيم') || h.includes('رقم قومي يتيم')) || headers.find(h => h.includes('الرقم القومي') || h.includes('القومي')) || '',
            guardianName: headers.find(h => h.includes('المعيل') || h.includes('اسم الام') || h.includes('اسم الأم') || h.includes('الحاضن')) || '',
            guardianId: headers.find(h => h.includes('الرقم القومي للمعيل') || h.includes('قومي المعيل') || h.includes('بطاقة المعيل') || h.includes('رقم قومي معيل')) || '',
            phone1: headers.find(h => h.includes('رقم الهاتف 1') || h.includes('الهاتف 1') || h.includes('تليفون 1') || h.includes('هاتف 1') || h.includes('موبايل 1') || 
                                     h.includes('رقم الهاتف ١') || h.includes('الهاتف ١') || h.includes('تليفون ١') || h.includes('هاتف ١') || h.includes('موبايل ١')) || 
                    headers.find(h => (h.includes('تليفون') || h.includes('موبايل') || h.includes('هاتف') || h.includes('تواصل')) && !h.includes('2') && !h.includes('٢') && !h.includes('بديل')) || '',
            phone2: headers.find(h => h.includes('رقم الهاتف 2') || h.includes('الهاتف 2') || h.includes('تليفون 2') || h.includes('هاتف 2') || h.includes('موبايل 2') || 
                                     h.includes('رقم الهاتف ٢') || h.includes('الهاتف ٢') || h.includes('تليفون ٢') || h.includes('هاتف ٢') || h.includes('موبايل ٢') || 
                                     h.includes('بديل') || h.includes('ثاني') || h.includes('آخر') || h.includes('اخري') || h.includes('أخرى')) || '',
            markaz: headers.find(h => h.includes('المركز')) || '',
            village: headers.find(h => h.includes('القرية') || h.includes('قرية')) || '',
            address: headers.find(h => h.includes('العنوان بالتفصيل') || h.includes('العنوان') || h.includes('عنوان')) || ''
          };

          if (!mapping.orphanName || !mapping.orphanId) {
            alert('يجب أن يحتوي ملف الإكسل على أعمدة "اسم اليتيم" و"الرقم القومي لليتيم" فضلًا');
            setImporting(false);
            return;
          }

          let count = 0;
          const batchSize = 50;
          for (let i = 0; i < data.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = data.slice(i, i + batchSize);
            
          chunk.forEach((row: any) => {
            const orphanName = String(row[mapping.orphanName] || '').trim();
            const orphanId = String(row[mapping.orphanId] || '').trim();
            
            if (orphanName && orphanId.length === 14) {
               const docRef = doc(collection(db, 'orphans'));
               batch.set(docRef, {
                  orphans: [{
                    name: orphanName,
                    id: orphanId
                  }],
                  isSponsored: false,
                  sponsorshipAmount: 0,
                  registrationPlace: 'none',
                  guardianName: String(row[mapping.guardianName] || ''),
                  guardianId: String(row[mapping.guardianId] || '00000000000000').substring(0, 14),
                  phone1: String(row[mapping.phone1] || ''),
                  phone2: mapping.phone2 ? String(row[mapping.phone2] || '') : '',
                  markaz: String(row[mapping.markaz] || 'نبروه'),
                  village: String(row[mapping.village] || ''),
                  address: String(row[mapping.address] || ''),
                    filesStatus: 'not_registered',
                    researchFormStatus: 'not_registered',
                    submissionStatus: 'processing',
                    requiredDocs: [],
                    createdAt: serverTimestamp()
                 });
                 count++;
              }
            });
            await batch.commit();
          }
          alert(`تم استيراد ${count} حالة بنجاح`);
        }
      } catch (err) {
        console.error(err);
        alert('خطأ في قراءة ملف الإكسل');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  useEffect(() => {
    const q = query(collection(db, 'orphans'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrphanCase));
      setOrphans(data);
      setLoading(false);
    });

    const qNewReg = query(collection(db, 'new_orphan_registrations'), orderBy('createdAt', 'desc'));
    const unsubscribeNewReg = onSnapshot(qNewReg, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewOrphanRegistration));
      setNewRegistrations(data);
    });

    return () => {
      unsubscribe();
      unsubscribeNewReg();
    };
  }, []);

  useEffect(() => {
    if (showPeriodicResearch) {
      const q = query(
        collection(db, 'orphans', showPeriodicResearch.id, 'periodic_research'),
        orderBy('createdAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setResearchList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PeriodicResearch)));
      });
      return () => unsubscribe();
    }
  }, [showPeriodicResearch]);

  const handleEdit = (o: OrphanCase) => {
    setEditingCase(o);
    setFormData({
      guardianName: o.guardianName,
      guardianId: o.guardianId,
      orphans: (o.orphans || []).map(child => ({
        name: child.name || '',
        id: child.id || '',
        birthDate: child.birthDate || '',
        schoolStage: child.schoolStage || '',
        schoolGrade: child.schoolGrade || '',
        semester: child.semester || '',
        orphanCode: child.orphanCode || ''
      })),
      isSponsored: o.isSponsored || false,
      sponsorshipAmount: o.sponsorshipAmount || 0,
      registrationPlace: o.registrationPlace || 'none',
      phone1: o.phone1,
      phone2: o.phone2,
      markaz: o.markaz,
      village: o.village,
      address: o.address,
      filesStatus: o.filesStatus,
      researchFormStatus: o.researchFormStatus,
      submissionStatus: o.submissionStatus,
      requiredDocs: o.requiredDocs || [],
      attachments: o.attachments || []
    });
    setShowAddForm(true);
  };

  const handleToggleAddResearch = () => {
    if (!showAddResearch && researchList.length > 0) {
      const last = researchList[0];
      setResearchForm({
        researchNumber: '',
        researchDate: new Date().toISOString().split('T')[0],
        targetOrphanIndex: last.targetOrphanIndex ?? 0,
        targetOrphanName: '',
        targetSchoolStage: '',
        targetSchoolGrade: '',
        isAlive: last.isAlive ?? true,
        housingType: last.housingType || 'owned',
        rentAmount: last.rentAmount || 0,
        hasChanged: false,
        expenses: { ...last.expenses },
        income: { ...last.income },
        notes: '',
        docFiles: last.docFiles || {}
      });
    } else {
      setResearchForm({
        researchNumber: '',
        researchDate: new Date().toISOString().split('T')[0],
        targetOrphanIndex: 0,
        targetOrphanName: '',
        targetSchoolStage: '',
        targetSchoolGrade: '',
        isAlive: true,
        housingType: 'owned',
        rentAmount: 0,
        hasChanged: false,
        expenses: { school: 0, living: 0, other: 0 },
        income: { pension: 0, insurance: 0, salary: 0, other: 0 },
        notes: '',
        docFiles: {}
      });
    }
    setShowAddResearch(!showAddResearch);
    if (showAddResearch) {
      setEditingResearch(null);
    }
  };

  const handleEditResearch = (res: PeriodicResearch) => {
    setEditingResearch(res);
    setResearchForm({
      researchNumber: res.researchNumber || '',
      researchDate: res.researchDate || (res.createdAt?.toDate() ? new Date(res.createdAt.toDate()).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      targetOrphanIndex: res.targetOrphanIndex ?? 0,
      targetOrphanName: res.targetOrphanName || '',
      targetSchoolStage: res.targetSchoolStage || '',
      targetSchoolGrade: res.targetSchoolGrade || '',
      isAlive: res.isAlive ?? true,
      housingType: res.housingType || 'owned',
      rentAmount: res.rentAmount || 0,
      hasChanged: res.hasChanged || false,
      expenses: { ...res.expenses },
      income: { ...res.income },
      notes: res.notes || '',
      docFiles: res.docFiles || {}
    });
    setShowAddResearch(true);
  };

  const handleAddResearch = async () => {
    if (!showPeriodicResearch) return;
    
    setConfirmConfig({
      isOpen: true,
      title: editingResearch ? 'تأكيد تعديل البحث الدوري' : 'تأكيد حفظ البحث الدوري للأيتام',
      message: editingResearch 
        ? `هل أنت متأكد من حفظ التعديلات على البحث رقم: ${editingResearch.researchNumber || 'الحالي'}؟`
        : `هل أنت متأكد من حفظ التحديث الدوري لبيانات اليتيم: ${showPeriodicResearch.orphans?.[0]?.name || 'بيانات اليتيم'}؟`,
      onConfirm: async () => {
        try {
          const targetIdx = researchForm.targetOrphanIndex ?? 0;
          const targetName = showPeriodicResearch.orphans?.[targetIdx]?.name || researchForm.targetOrphanName || '';
          const payload = { ...researchForm, targetOrphanIndex: targetIdx, targetOrphanName: targetName };
          if (editingResearch) {
            await updateDoc(doc(db, 'orphans', showPeriodicResearch.id, 'periodic_research', editingResearch.id), {
              ...payload,
              updatedAt: serverTimestamp()
            });
            setEditingResearch(null);
          } else {
            await addDoc(collection(db, 'orphans', showPeriodicResearch.id, 'periodic_research'), {
              ...payload,
              createdAt: serverTimestamp()
            });
          }
          setShowAddResearch(false);
          setResearchForm({
            researchNumber: '',
            researchDate: new Date().toISOString().split('T')[0],
            targetOrphanIndex: 0,
            targetOrphanName: '',
            targetSchoolStage: '',
            targetSchoolGrade: '',
            isAlive: true,
            housingType: 'owned',
            rentAmount: 0,
            hasChanged: false,
            expenses: { school: 0, living: 0, other: 0 },
            income: { pension: 0, insurance: 0, salary: 0, other: 0 },
            notes: '',
            docFiles: {}
          });
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert(editingResearch ? 'تمت عملية التعديل بنجاح' : 'تم حفظ البحث الدوري بنجاح');
        } catch (err) {
          alert('فشل في حفظ البحث الدوري');
        }
      }
    });
  };

  const handleTrySaveOrphan = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrphanDupWarnings([]);
    
    // Only check duplicates if creating a new entry
    if (!editingCase) {
      try {
        const warnings = await checkDuplicateCase(formData.guardianName, formData.guardianId);
        setOrphanDupWarnings(warnings);
      } catch (err) {
        console.error('Error checking duplicates:', err);
      }
    }
    setShowConfirmSave(true);
  };

  const handleConfirmSave = async () => {
    try {
      if (editingCase) {
        const patch: any = { ...formData, updatedAt: serverTimestamp() };
        // Generate caseCode if missing or registrationPlace changed
        if (!editingCase.caseCode || (editingCase.registrationPlace !== formData.registrationPlace)) {
          patch.caseCode = generateCaseCode(formData.registrationPlace, orphans);
        }
        await updateDoc(doc(db, 'orphans', editingCase.id), patch);
        setEditingCase(null);
      } else {
        const caseCode = generateCaseCode(formData.registrationPlace, orphans);
        const docRef = await addDoc(collection(db, 'orphans'), {
          ...formData,
          caseCode,
          createdAt: serverTimestamp()
        });
        await logSystemAction('add', 'orphans', docRef.id, formData, `إضافة يتيم جديد: ${formData.guardianName} - اليتيم: ${formData.orphanName}`);
        setShowAddForm(false);
      }
      setFormData(initialForm);
      setShowConfirmSave(false);
      alert('تم حفظ البيانات بنجاح');
    } catch (err) {
      console.error("Save Error:", err);
      alert('حدث خطأ أثناء الحفظ. يرجى التأكد من اتصال الإنترنت.');
    }
  };

  const handleDownloadOrphanPDF = async (o: OrphanCase) => {
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
            <p style="margin: 5px 0; font-weight: bold;">تقرير بيانات يتيم وشامل</p>
          </div>
          <div style="text-align: left;">
            <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>

        <div style="grid-template-columns: 1fr 1fr; display: grid; gap: 20px; text-align: right; margin-bottom: 30px;">
          <div style="padding: 15px; background: #f0fdf4; border-radius: 12px; grid-column: span 2;">
            <p style="color: #065f46; margin-bottom: 5px; font-weight: bold;">أسماء الأيتام:</p>
            <p style="font-size: 20px; font-weight: 800;">${o.orphans.map(c => c.name).join(' - ') || 'غير مسجل'}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">ولي الأمر:</p>
            <p style="font-weight: bold;">${o.guardianName}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">رقم تليفون 1:</p>
            <p style="font-weight: bold;">${o.phone1}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">العنوان:</p>
            <p style="font-weight: bold;">${o.village} - ${o.address}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">حالة الكفالة:</p>
            <p style="font-weight: bold;">${o.isSponsored ? `مكفول بمبلغ ${o.sponsorshipAmount} ج.م` : 'غير مكفول'}</p>
          </div>
        </div>

        <div style="text-align: right; margin-bottom: 30px;">
          <h3 style="color: #065f46; border-bottom: 1px solid #f0fdf4; padding-bottom: 10px;">ملاحظات إضافية:</h3>
          <p style="line-height: 1.8; padding: 10px; background: #f8fafc; border-radius: 12px;">تقرير شامل لبيانات الأسرة المسجلة في المركز.</p>
        </div>

        <div style="margin-top: 50px; display: flex; justify-content: space-around; text-align: center;">
          <div>
            <p>توقيع المسؤول</p>
            <p>....................</p>
          </div>
          <div>
            <p>ختم الجمعية</p>
            <div style="width: 80px; height: 80px; border: 2px dashed #065f46; border-radius: 50%; margin: 10px auto; opacity: 0.3;"></div>
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
      pdf.save(`Orphan-${o.guardianName}.pdf`);
    } finally {
      document.body.removeChild(reportElement);
    }
  };

  const handleDelete = async () => {
    if (!showConfirmDelete) return;
    try {
      const orphanData = orphans.find(o => o.id === showConfirmDelete);
      await deleteDoc(doc(db, 'orphans', showConfirmDelete));
      if (orphanData) {
        await logSystemAction('delete', 'orphans', showConfirmDelete, orphanData, `حذف يتيم: ${orphanData.guardianName} - اليتيم: ${orphanData.orphanName}`);
      }
      setShowConfirmDelete(null);
    } catch (err) {
      alert('حدث خطأ أثناء الحذف');
    }
  };

  const handleDeleteAll = async () => {
    try {
      const batch = writeBatch(db);
      orphans.forEach(o => {
        batch.delete(doc(db, 'orphans', o.id));
      });
      await batch.commit();
      setShowConfirmDeleteAll(false);
      alert('تم حذف جميع الحالات بنجاح');
    } catch (err) {
      alert('حدث خطأ أثناء الحذف الجماعي');
    }
  };

  const handleSaveNewReg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!editingNewReg) {
        const dupList = await checkDuplicateCase(newRegFormData.guardianName, newRegFormData.guardianId);
        if (dupList.length > 0) {
          const confirmMsg = `⚠️ تنبيه تكرار: الاسم أو الرقم القومي مسجل بالفعل مسبقاً في:\n- ${dupList.join('\n- ')}\n\nهل أنت متأكد من رغبتك في حفظ التسجيل الجديد على أي حال؟`;
          if (!window.confirm(confirmMsg)) {
            return;
          }
        }
      }

      if (editingNewReg) {
        await updateDoc(doc(db, 'new_orphan_registrations', editingNewReg.id), {
          ...newRegFormData,
          updatedAt: serverTimestamp()
        });
        setEditingNewReg(null);
      } else {
        const docRef = await addDoc(collection(db, 'new_orphan_registrations'), {
          ...newRegFormData,
          createdAt: serverTimestamp()
        });
        await logSystemAction('add', 'new_orphan_registrations', docRef.id, newRegFormData, `إضافة تسجيل حالة جديدة: لليتيم ${newRegFormData.orphanName}`);
        setShowNewRegForm(false);
      }
      setNewRegFormData(initialNewRegistrationForm);
      alert('تم حفظ البيانات بنجاح');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء الحفظ');
    }
  };

  const handleEditNewReg = (reg: NewOrphanRegistration) => {
    setEditingNewReg(reg);
    setNewRegFormData({
      guardianName: reg.guardianName,
      guardianId: reg.guardianId,
      orphanName: reg.orphanName,
      orphanId: reg.orphanId,
      phone1: reg.phone1,
      phone2: reg.phone2,
      markaz: reg.markaz,
      village: reg.village,
      address: reg.address,
      isFilesRegistered: reg.isFilesRegistered,
      isFormDone: reg.isFormDone,
      isSent: reg.isSent,
      missingFiles: reg.missingFiles || [],
      sendingAuthority: reg.sendingAuthority,
      registrationDate: reg.registrationDate || new Date().toISOString().split('T')[0],
      notes: reg.notes || ''
    });
    setShowNewRegForm(true);
  };

  const filteredNewRegistrations = newRegistrations
    .filter(reg => {
      const matchSearch = !newRegFilters.search || 
        (reg.guardianName || '').includes(newRegFilters.search) ||
        (reg.orphanName || '').includes(newRegFilters.search) ||
        (reg.guardianId || '').includes(newRegFilters.search) ||
        (reg.orphanId || '').includes(newRegFilters.search);
        
      const matchGuardianName = !newRegFilters.guardianName || (reg.guardianName || '').includes(newRegFilters.guardianName);
      const matchGuardianId = !newRegFilters.guardianId || (reg.guardianId || '').includes(newRegFilters.guardianId);
      const matchOrphanName = !newRegFilters.orphanName || (reg.orphanName || '').includes(newRegFilters.orphanName);
      const matchVillage = !newRegFilters.village || (reg.village || '').includes(newRegFilters.village);
      
      const matchSendingAuthority = newRegFilters.sendingAuthority === 'all' || reg.sendingAuthority === newRegFilters.sendingAuthority;
      
      let matchStatus = true;
      if (newRegFilters.status === 'files') matchStatus = !!reg.isFilesRegistered;
      else if (newRegFilters.status === 'form') matchStatus = !!reg.isFormDone;
      else if (newRegFilters.status === 'sent') matchStatus = !!reg.isSent;
      else if (newRegFilters.status === 'missing') matchStatus = reg.missingFiles && reg.missingFiles.length > 0 && !reg.missingFiles.includes('لا يوجد');
      
      return matchSearch && matchGuardianName && matchGuardianId && matchOrphanName && matchVillage && matchSendingAuthority && matchStatus;
    })
    .sort((a, b) => {
      let valA: any = a[newRegSortBy as keyof NewOrphanRegistration];
      let valB: any = b[newRegSortBy as keyof NewOrphanRegistration];
      
      if (newRegSortBy === 'missingFiles') {
        valA = a.missingFiles?.length || 0;
        valB = b.missingFiles?.length || 0;
      }
      
      if (valA === undefined) valA = '';
      if (valB === undefined) valB = '';
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return newRegSortOrder === 'asc' 
          ? valA.localeCompare(valB, 'ar') 
          : valB.localeCompare(valA, 'ar');
      } else {
        if (valA < valB) return newRegSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return newRegSortOrder === 'asc' ? 1 : -1;
        return 0;
      }
    });

  const handleSelectAllNewReg = () => {
    if (selectedNewRegIds.length === filteredNewRegistrations.length) {
      setSelectedNewRegIds([]);
    } else {
      setSelectedNewRegIds(filteredNewRegistrations.map(r => r.id));
    }
  };

  const handleToggleSelectNewReg = (id: string) => {
    setSelectedNewRegIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const exportNewRegToExcel = () => {
    const dataToExport = selectedNewRegIds.length > 0 
      ? newRegistrations.filter(r => selectedNewRegIds.includes(r.id))
      : filteredNewRegistrations;

    if (dataToExport.length === 0) {
      alert('لا توجد حالات لتصديرها');
      return;
    }

    const data = dataToExport.map((reg, idx) => ({
      'مسلسل': idx + 1,
      'تاريخ التسجيل': reg.registrationDate || '',
      'اسم الأم / المعيل': reg.guardianName || '',
      'الرقم القومي للمعيل': reg.guardianId || '',
      'اسم اليتيم': reg.orphanName || '',
      'الرقم القومي لليتيم': reg.orphanId || '',
      'رقم الهاتف 1': reg.phone1 || '',
      'رقم الهاتف 2': reg.phone2 || '',
      'المركز': reg.markaz || '',
      'القرية': reg.village || '',
      'العنوان بالتفصيل': reg.address || '',
      'تسجيل الملفات': reg.isFilesRegistered ? 'نعم' : 'لا',
      'عمل الاستمارة': reg.isFormDone ? 'نعم' : 'لا',
      'تم الإرسال': reg.isSent ? 'نعم' : 'لا',
      'الملفات الناقصة': (reg.missingFiles || []).join(' - '),
      'الهيئة المرسل إليها': reg.sendingAuthority || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحالات الجديدة");
    XLSX.writeFile(wb, `كشف_الحالات_الجديدة_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportNewRegExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawRows = XLSX.utils.sheet_to_json(ws);
        
        if (rawRows.length > 0) {
          const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          const headers = (sheetRows[0] || []).map(h => String(h || '').trim()).filter(Boolean);
          
          const prefilled = {
            guardianName: headers.find(h => h.includes('اسم الأم') || h.includes('المعيل') || h.includes('اسم المعيل') || h.includes('الحاضن')) || '',
            guardianId: headers.find(h => h.includes('الرقم القومي للمعيل') || h.includes('قومي المعيل') || h.includes('بطاقة المعيل') || h.includes('رقم قومي معيل')) || '',
            orphanName: headers.find(h => h.includes('اسم اليتيم') || h.includes('اليتيم')) || '',
            orphanId: headers.find(h => h.includes('الرقم القومي لليتيم') || h.includes('قومي اليتيم') || h.includes('بطاقة اليتيم') || h.includes('رقم قومي يتيم')) || '',
            phone1: headers.find(h => h.includes('رقم الهاتف 1') || h.includes('الهاتف 1') || h.includes('تليفون 1') || h.includes('هاتف 1') || h.includes('موبايل 1') || 
                                     h.includes('رقم الهاتف ١') || h.includes('الهاتف ١') || h.includes('تليفون ١') || h.includes('هاتف ١') || h.includes('موبايل ١')) || 
                    headers.find(h => (h.includes('تليفون') || h.includes('موبايل') || h.includes('هاتف') || h.includes('تواصل')) && !h.includes('2') && !h.includes('٢') && !h.includes('بديل')) || '',
            phone2: headers.find(h => h.includes('رقم الهاتف 2') || h.includes('الهاتف 2') || h.includes('تليفون 2') || h.includes('هاتف 2') || h.includes('موبايل 2') || 
                                     h.includes('رقم الهاتف ٢') || h.includes('الهاتف ٢') || h.includes('تليفون ٢') || h.includes('هاتف ٢') || h.includes('موبايل ٢') || 
                                     h.includes('بديل') || h.includes('ثاني') || h.includes('آخر') || h.includes('اخري') || h.includes('أخرى')) || '',
            markaz: headers.find(h => h.includes('المركز')) || '',
            village: headers.find(h => h.includes('القرية') || h.includes('قرية')) || '',
            address: headers.find(h => h.includes('العنوان بالتفصيل') || h.includes('العنوان') || h.includes('عنوان')) || '',
            missingFiles: headers.find(h => h.includes('الملفات الناقصة') || h.includes('نواقص') || h.includes('الأوراق الناقصة')) || '',
            notes: headers.find(h => h.includes('ملاحظات') || h.includes('الملاحظات') || h.includes('ملاحظة') || h.includes('بيان')) || '',
            
            dateType: 'file' as const,
            uniformDate: new Date().toISOString().split('T')[0],
            fileDateColumn: headers.find(h => h.includes('تاريخ التسجيل') || h.includes('التاريخ') || h.includes('تاريخ تسجيل') || h.includes('تاريخ')) || '',

            sendingAuthType: 'uniform' as const,
            uniformSendingAuth: SENDING_AUTHORITIES[0],
            fileSendingAuthColumn: headers.find(h => h.includes('الهيئة') || h.includes('مرسل إليها') || h.includes('الهيئة المرسل إليها')) || '',

            isFilesType: 'uniform' as const,
            uniformIsFiles: false,
            fileIsFilesColumn: headers.find(h => h.includes('تسجيل الملفات') || h.includes('الملفات سجلت') || h.includes('تم تسجيل الملفات')) || '',

            isFormType: 'uniform' as const,
            uniformIsForm: false,
            fileIsFormColumn: headers.find(h => h.includes('عمل الاستمارة') || h.includes('الاستمارة') || h.includes('تم عمل استمارة')) || '',

            isSentType: 'uniform' as const,
            uniformIsSent: false,
            fileIsSentColumn: headers.find(h => h.includes('الإرسال') || h.includes('تم الإرسال') || h.includes('تم الإرسال للهيئة')) || ''
          };

          setExcelMapping(prefilled);
          setSelectedExtraColumns(headers);
          setExcelImportData({ headers, rows: rawRows });
        } else {
          alert('ملف الإكسل فارغ!');
        }
      } catch (err) {
        console.error(err);
        alert('خطأ في قراءة ملف الإكسل للحالات الجديدة');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const executeExcelImport = async () => {
    if (!excelImportData) return;
    try {
      setImporting(true);
      const { rows } = excelImportData;

      if (!excelMapping.guardianName || !excelMapping.orphanName) {
        alert('يجب تحديد عمود "اسم الأم / المعيل" و "اسم اليتيم" على الأقل فضلًا');
        setImporting(false);
        return;
      }

      let count = 0;
      const batchSize = 50;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = rows.slice(i, i + batchSize);

        chunk.forEach((row: any) => {
          const guardianName = String(row[excelMapping.guardianName] || '').trim();
          const orphanName = String(row[excelMapping.orphanName] || '').trim();

          if (guardianName && orphanName) {
            const docRef = doc(collection(db, 'new_orphan_registrations'));

            let missing: string[] = [];
            if (excelMapping.missingFiles && row[excelMapping.missingFiles]) {
              const mStr = String(row[excelMapping.missingFiles]);
              missing = mStr.split(/[-ـ,|/;\n]+/).map(s => s.trim()).filter(s => s && MISSING_DOCS_OPTIONS.includes(s));
              if (missing.length === 0 && mStr) {
                missing = mStr.split(/[-ـ,|/;\n]+/).map(s => s.trim()).filter(Boolean);
              }
            }
            if (missing.length === 0) missing = ['لا يوجد'];

            // Sending Authority
            let auth = SENDING_AUTHORITIES[0];
            if (excelMapping.sendingAuthType === 'file') {
              if (excelMapping.fileSendingAuthColumn && row[excelMapping.fileSendingAuthColumn]) {
                const aVal = String(row[excelMapping.fileSendingAuthColumn]).trim();
                const found = SENDING_AUTHORITIES.find(x => x.includes(aVal) || aVal.includes(x));
                if (found) auth = found;
              }
            } else {
              auth = excelMapping.uniformSendingAuth;
            }

            // Date
            let regDate = new Date().toISOString().split('T')[0];
            if (excelMapping.dateType === 'file') {
              if (excelMapping.fileDateColumn && row[excelMapping.fileDateColumn]) {
                regDate = String(row[excelMapping.fileDateColumn]).trim();
              }
            } else {
              regDate = excelMapping.uniformDate;
            }

            // isFilesRegistered
            let isFiles = false;
            if (excelMapping.isFilesType === 'file') {
              if (excelMapping.fileIsFilesColumn && row[excelMapping.fileIsFilesColumn]) {
                isFiles = ['نعم', 'مكتمل', 'مكتملة', 'تم', 'true', '1'].includes(String(row[excelMapping.fileIsFilesColumn]).trim().toLowerCase());
              }
            } else {
              isFiles = excelMapping.uniformIsFiles;
            }

            // isFormDone
            let isForm = false;
            if (excelMapping.isFormType === 'file') {
              if (excelMapping.fileIsFormColumn && row[excelMapping.fileIsFormColumn]) {
                isForm = ['نعم', 'تم', 'تم العمل', 'true', '1'].includes(String(row[excelMapping.fileIsFormColumn]).trim().toLowerCase());
              }
            } else {
              isForm = excelMapping.uniformIsForm;
            }

            // isSent
            let isSentVal = false;
            if (excelMapping.isSentType === 'file') {
              if (excelMapping.fileIsSentColumn && row[excelMapping.fileIsSentColumn]) {
                isSentVal = ['نعم', 'تم', 'تم الارسال', 'true', '1'].includes(String(row[excelMapping.fileIsSentColumn]).trim().toLowerCase());
              }
            } else {
              isSentVal = excelMapping.uniformIsSent;
            }

            let extraNotesArr: string[] = [];
            selectedExtraColumns.forEach(col => {
              if (col === excelMapping.guardianName ||
                  col === excelMapping.orphanName ||
                  col === excelMapping.guardianId ||
                  col === excelMapping.orphanId ||
                  col === excelMapping.phone1 ||
                  col === excelMapping.phone2 ||
                  col === excelMapping.markaz ||
                  col === excelMapping.village ||
                  col === excelMapping.address ||
                  col === excelMapping.notes) {
                return;
              }
              if (row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
                extraNotesArr.push(`${col}: ${String(row[col]).trim()}`);
              }
            });

            const baseNotes = excelMapping.notes && row[excelMapping.notes] ? String(row[excelMapping.notes]).trim() : '';
            const fullNotesCombined = [
              baseNotes,
              extraNotesArr.join(' | ')
            ].filter(Boolean).join('\n---\n');

            batch.set(docRef, {
              guardianName,
              guardianId: String(row[excelMapping.guardianId] || '').trim(),
              orphanName,
              orphanId: String(row[excelMapping.orphanId] || '').trim(),
              phone1: String(row[excelMapping.phone1] || '').trim(),
              phone2: String(row[excelMapping.phone2] || '').trim(),
              markaz: String(row[excelMapping.markaz] || 'نبروه').trim(),
              village: String(row[excelMapping.village] || '').trim(),
              address: String(row[excelMapping.address] || '').trim(),
              isFilesRegistered: isFiles,
              isFormDone: isForm,
              isSent: isSentVal,
              missingFiles: missing,
              sendingAuthority: auth,
              registrationDate: regDate,
              notes: fullNotesCombined,
              createdAt: serverTimestamp()
            });
            count++;
          }
        });
        await batch.commit();
      }

      setExcelImportData(null);
      alert(`تم استيراد ${count} حالة جديدة بنجاح`);
    } catch (err) {
      console.error(err);
      alert('خطأ في استيراد ملف الإكسل للحالات الجديدة');
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAllNewRegistrations = async () => {
    const listToDelete = filteredNewRegistrations;
    if (listToDelete.length === 0) {
      alert('لا توجد حالات للحذف');
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع الحالات الجديدة',
      message: `⚠️ تحذير مهم جداً: هل أنت متأكد تماماً من رغبتك في حذف جميع الحالات الموجودة بالكشف حالياً؟ عملية الحذف هذه نهائية وغير قابلة للتراجع. عدد الحالات التي سيتم حذفها: ${listToDelete.length}`,
      onConfirm: async () => {
        try {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          setImporting(true);
          const batchSize = 100;
          for (let i = 0; i < listToDelete.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = listToDelete.slice(i, i + batchSize);
            chunk.forEach(item => {
              batch.delete(doc(db, 'new_orphan_registrations', item.id));
            });
            await batch.commit();
          }
          setSelectedNewRegIds([]);
          alert(`تم حذف ${listToDelete.length} حالة بنجاح من الكشف`);
        } catch (err) {
          console.error(err);
          alert('حدث خطأ أثناء حذف جميع الحالات');
        } finally {
          setImporting(false);
        }
      }
    });
  };

  const printNewRegSelected = () => {
    const listToPrint = selectedNewRegIds.length > 0 
      ? newRegistrations.filter(r => selectedNewRegIds.includes(r.id))
      : filteredNewRegistrations;

    if (listToPrint.length === 0) {
      alert('لا توجد حالات محددة للطباعة');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const columnsToPrint = ALL_PRINT_COLUMNS.filter(col => printColumns[col.key]);

    const headersHtml = columnsToPrint.map(col => `<th style="padding: 10px; border: 1px solid #ddd; background-color: #f2f2f2; text-align: right; font-size: 11px;">${col.label}</th>`).join('');

    const rowsHtml = listToPrint.map((reg, idx) => {
      const cellsHtml = columnsToPrint.map(col => {
        let val = '';
        if (col.key === 'index') {
          val = (idx + 1).toString();
        } else if (col.key === 'registrationDate') {
          val = reg.registrationDate || '';
        } else if (col.key === 'guardianName') {
          val = reg.guardianName || '';
        } else if (col.key === 'guardianId') {
          val = reg.guardianId || '';
        } else if (col.key === 'orphanName') {
          val = reg.orphanName || '';
        } else if (col.key === 'orphanId') {
          val = reg.orphanId || '';
        } else if (col.key === 'phone1') {
          val = reg.phone1 || '';
        } else if (col.key === 'phone2') {
          val = reg.phone2 || '';
        } else if (col.key === 'markaz') {
          val = reg.markaz || '';
        } else if (col.key === 'village') {
          val = reg.village || '';
        } else if (col.key === 'address') {
          val = reg.address || '';
        } else if (col.key === 'isFilesRegistered') {
          val = reg.isFilesRegistered ? 'نعم' : 'لا';
        } else if (col.key === 'isFormDone') {
          val = reg.isFormDone ? 'نعم' : 'لا';
        } else if (col.key === 'isSent') {
          val = reg.isSent ? 'نعم' : 'لا';
        } else if (col.key === 'missingFiles') {
          val = (reg.missingFiles || []).join(' - ');
        } else if (col.key === 'sendingAuthority') {
          val = reg.sendingAuthority || '';
        }
        return `<td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${val}</td>`;
      }).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('');

    const html = `
      <html dir="rtl">
        <head>
          <title>كشف الحالات الجديدة - هيئة الأعمال الخيرية</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap');
            body { 
              font-family: 'Tajawal', sans-serif; 
              padding: 20px; 
              color: #111827; 
              line-height: 1.5; 
              background: #fff; 
            }
            .header { 
              text-align: center; 
              border-bottom: 3px solid #059669; 
              padding-bottom: 12px; 
              margin-bottom: 20px; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 18px; 
              font-weight: 900; 
              color: #064e3b; 
            }
            .header p { 
              margin: 5px 0 0; 
              font-size: 11px; 
              color: #4b5563; 
              font-weight: bold;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 15px; 
            }
            th, td { 
              text-align: right; 
              border: 1px solid #ddd;
              padding: 8px;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>كشف الحالات الجديدة - هيئة الأعمال الخيرية</h1>
            <p>تاريخ الكشف: ${new Date().toLocaleDateString('ar-EG')} | عدد الحالات: ${listToPrint.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                ${headersHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setShowNewRegPrintModal(false);
  };

  const handleDeleteNewReg = (id: string) => {
    const regData = newRegistrations.find(r => r.id === id);
    const orphanName = regData ? regData.orphanName : '';
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد الحذف',
      message: `هل أنت متأكد من رغبتك في حذف تسجيل هذه الحالة لليتيم: ${orphanName || 'هذه الحالة'}؟`,
      onConfirm: async () => {
        try {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          await deleteDoc(doc(db, 'new_orphan_registrations', id));
          if (regData) {
            await logSystemAction('delete', 'new_orphan_registrations', id, regData, `حذف تسجيل حالة جديدة: لليتيم ${regData.orphanName}`);
          }
        } catch (err) {
          console.error(err);
          alert('حدث خطأ أثناء الحذف');
        }
      }
    });
  };

  const toggleMissingFile = (file: string) => {
    setNewRegFormData(prev => ({
      ...prev,
      missingFiles: prev.missingFiles.includes(file)
        ? prev.missingFiles.filter(f => f !== file)
        : [...prev.missingFiles, file]
    }));
  };

  const toggleDoc = (docName: string) => {
    setFormData(prev => ({
      ...prev,
      requiredDocs: prev.requiredDocs.includes(docName)
        ? prev.requiredDocs.filter(d => d !== docName)
        : [...prev.requiredDocs, docName]
    }));
  };

  const filteredOrphans = orphans
    .filter(o => placeFilter === 'all' || (o.registrationPlace || 'none') === placeFilter)
    .filter(o => !filterDuplicatesOnly || getIsDuplicate(o).isDuplicate)
    .filter(o => 
      (o.orphans?.some(child => child.name.includes(searchQuery) || child.id.includes(searchQuery)) || 
      o.guardianName.includes(searchQuery) ||
      o.village.includes(searchQuery) ||
      o.address.includes(searchQuery) ||
      (o.caseCode || '').toLowerCase().includes(searchQuery.toLowerCase())) &&
      (o.orphans?.some(child => child.name.toLowerCase().includes(columnFilters.orphanName.toLowerCase())) || columnFilters.orphanName === '') &&
      (o.orphans?.some(child => child.id.includes(columnFilters.orphanId)) || columnFilters.orphanId === '') &&
      o.guardianName.toLowerCase().includes(columnFilters.guardianName.toLowerCase()) &&
      o.village.toLowerCase().includes(columnFilters.village.toLowerCase())
    )
    .sort((a, b) => {
      let result = 0;
      if (sortBy === 'orphanName') {
        const nameA = a.orphans?.[0]?.name || a.orphanName || '';
        const nameB = b.orphans?.[0]?.name || b.orphanName || '';
        result = nameA.localeCompare(nameB, 'ar');
      }
      else if (sortBy === 'guardianName') result = (a.guardianName || '').localeCompare(b.guardianName || '', 'ar');
      else if (sortBy === 'village') result = (a.village || '').localeCompare(b.village || '', 'ar');
      else if (sortBy === 'address') result = (a.address || '').localeCompare(b.address || '', 'ar');
      
      return sortOrder === 'desc' ? -result : result;
    });

  const toggleSelectAll = () => {
    if (selectedOrphanIds.length === filteredOrphans.length) {
      setSelectedOrphanIds([]);
    } else {
      setSelectedOrphanIds(filteredOrphans.map(o => o.id));
    }
  };

  const toggleSelectOrphan = (id: string) => {
    setSelectedOrphanIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const exportToExcel = () => {
    const data = filteredOrphans.map((o, idx) => ({
      'مسلسل': idx + 1,
      'أسماء الأيتام': o.orphans?.map(child => child.name).join(' - '),
      'الأرقام القومية للأيتام': o.orphans?.map(child => child.id).join(' - '),
      'المرحلة الدراسية': o.orphans?.map(child => `${child.name}: ${child.schoolStage || 'غير محدد'}`).join(' | '),
      'الصف الدراسي': o.orphans?.map(child => `${child.name}: ${child.schoolGrade || 'غير محدد'}`).join(' | '),
      'اسم الأم / القائم بالرعاية': o.guardianName,
      'مكان التسجيل': o.registrationPlace === 'council' ? 'المجلس الإسلامي للدعوة' : o.registrationPlace === 'hayatem' ? 'الهياتم' : 'ليست مسجلة',
      'الرقم القومي للمعيل': o.guardianId,
      'هل تم الكفالة؟': o.isSponsored ? 'نعم' : 'لا',
      'قيمة الكفالة': o.isSponsored ? o.sponsorshipAmount : 0,
      'رقم التواصل الرئيسي': o.phone1,
      'رقم التواصل البديل': o.phone2,
      'المركز': o.markaz,
      'القرية / المنطقة': o.village,
      'العنوان بالتفصيل': o.address,
      'اكتمال ملف الأوراق': o.filesStatus === 'registered' ? 'مكتمل' : 'نقص بالملف',
      'الحالة الإدارية': o.submissionStatus === 'done' ? 'تم الإرسال للهيئة' : 'جاري التجهيز'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل الأيتام");
    XLSX.writeFile(wb, `كشف_الأيتام_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const printSingleResearch = (res: PeriodicResearch, orphanCase: OrphanCase) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>بحث دوري - ${orphanCase.guardianName}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
            body { font-family: 'Tajawal', sans-serif; padding: 30px; color: #111827; line-height: 1.5; background: #fff; }
            .header { text-align: center; border-bottom: 3px solid #059669; padding-bottom: 15px; margin-bottom: 25px; }
            .header h1 { margin: 0; font-size: 20px; font-weight: 900; color: #064e3b; }
            .section { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
            .section-title { background: #f0fdf4; padding: 8px 15px; font-weight: 900; color: #065f46; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; }
            .item { padding: 10px 15px; border-bottom: 1px solid #f3f4f6; border-left: 1px solid #f3f4f6; }
            .label { font-weight: bold; color: #6b7280; font-size: 12px; display: block; margin-bottom: 2px; }
            .value { font-weight: 800; color: #111827; }
            .full { grid-column: span 2; border-left: none; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: right; font-size: 13px; }
            th { background: #f9fafb; font-weight: 800; }
            .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #eee; padding-top: 15px; }
            @media print { .no-print { display: none; } }
            .print-btn { background: #059669; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 900; font-family: 'Tajawal'; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>استمارة البحث الدوري للأيتام</h1>
            <p style="margin: 5px 0; color: #059669; font-weight: bold;">${AGENCY_NAMES[orphanCase.registrationPlace || 'none']}</p>
            ${orphanCase.caseCode ? `<p style="margin: 4px 0; color: #6b7280; font-weight: bold; font-size: 12px;">كود الحالة: ${orphanCase.caseCode}</p>` : ''}
          </div>

          <div class="section">
            <div class="section-title">بيانات أساسية</div>
            <div class="grid">
              <div class="item"><span class="label">اسم اليتيم (التقرير):</span> <span class="value">${res.targetOrphanName || orphanCase.orphans?.[res.targetOrphanIndex ?? 0]?.name || '—'}</span></div>
              <div class="item"><span class="label">الصف الدراسي:</span> <span class="value">${res.targetSchoolGrade || orphanCase.orphans?.[res.targetOrphanIndex ?? 0]?.schoolGrade || '—'}</span></div>
              <div class="item"><span class="label">اسم المعيل:</span> <span class="value">${orphanCase.guardianName}</span></div>
              <div class="item"><span class="label">رقم البحث:</span> <span class="value">${res.researchNumber || 'غير مسجل'}</span></div>
              <div class="item"><span class="label">تاريخ البحث:</span> <span class="value">${res.researchDate || 'غير مسجل'}</span></div>
              <div class="item"><span class="label">حالة الحياة:</span> <span class="value">${res.isAlive ? 'على قيد الحياة' : 'متوفى'}</span></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">الحالة المعيشية</div>
            <div class="grid">
              <div class="item"><span class="label">نوع السكن:</span> <span class="value">${res.housingType === 'rent' ? 'إيجار' : 'ملك / سكن'}</span></div>
              <div class="item"><span class="label">قيمة الإيجار:</span> <span class="value">${res.rentAmount || 0} ج.م</span></div>
              <div class="item"><span class="label">تغيرات الحالة:</span> <span class="value">${res.hasChanged ? 'نعم، حدث تغيير' : 'مستقرة'}</span></div>
               <div class="item"><span class="label">كود اليتيم:</span> <span class="value">${orphanCase.id.slice(0, 8)}</span></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="section">
              <div class="section-title">المصروفات الشهرية</div>
              <table>
                <tr><td>شئون تعليمية</td><td>${res.expenses.school} ج.م</td></tr>
                <tr><td>متطلبات معيشية</td><td>${res.expenses.living} ج.م</td></tr>
                <tr><td>مصروفات أخرى</td><td>${res.expenses.other} ج.م</td></tr>
                <tr style="font-weight: 800; background: #fefce8;"><td>الإجمالي</td><td>${Object.values(res.expenses).reduce((a, b) => a + b, 0) + (res.rentAmount || 0)} ج.م</td></tr>
              </table>
            </div>
            <div class="section">
              <div class="section-title">مصادر الدخل</div>
              <table>
                <tr><td>المعاش</td><td>${res.income.pension} ج.م</td></tr>
                <tr><td>تأمين اجتماعي</td><td>${res.income.insurance} ج.م</td></tr>
                <tr><td>راتب / عمل</td><td>${res.income.salary} ج.م</td></tr>
                <tr><td>أخرى</td><td>${res.income.other} ج.م</td></tr>
                <tr style="font-weight: 800; background: #f0fdfa;"><td>الإجمالي</td><td>${Object.values(res.income).reduce((a, b) => a + b, 0)} ج.م</td></tr>
              </table>
            </div>
          </div>

          <div class="section">
            <div class="section-title">ملاحظات والتوصيات</div>
            <div style="padding: 15px; font-size: 13px; min-height: 60px;">${res.notes || 'لا توجد ملاحظات إضافية مسجلة.'}</div>
          </div>

          <div class="footer">
            جميع البيانات تم جمعها بواسطة الباحث الميداني المختص وتعتبر سرية<br>
            نظام إدارة بصمة خير &copy; ${new Date().getFullYear()}
          </div>

          <div class="no-print" style="text-align: center;">
            <button class="print-btn" onclick="window.print()">طباعة الآن</button>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };



  const printVouchers = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>بونات هيئة الأعمال الخيرية</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 10px; }
            .voucher-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .voucher { border: 2px dashed #059669; padding: 15px; border-radius: 10px; position: relative; height: 220px; box-sizing: border-box; }
            .v-header { text-align: center; border-bottom: 1px solid #eee; margin-bottom: 10px; padding-bottom: 5px; }
            .v-header h2 { margin: 0; font-size: 16px; color: #059669; }
            .v-body p { margin: 5px 0; font-size: 14px; font-weight: bold; }
            .v-footer { margin-top: 15px; display: flex; justify-content: space-between; font-size: 11px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="voucher-grid">
            ${filteredOrphans.map(o => `
              <div class="voucher">
                <div class="v-header">
                  <h2>بصمة خير - هيئة الأعمال الخيرية</h2>
                  <p style="font-size: 10px;">بون استلام اليتيم</p>
                </div>
                <div class="v-body">
                  <p>المعيل: ${o.guardianName}</p>
                  <p>عدد الأيتام: ${o.orphans?.length || 0}</p>
                  <p>أسماء الأيتام: ${o.orphans?.map(child => child.name).join(' - ')}</p>
                  <p>العنوان: ${o.markaz} - ${o.village}</p>
                  <p>الحالة: ${o.isSponsored ? 'مكفول ' + o.sponsorshipAmount + ' ج.م' : 'غير مكفول'}</p>
                  <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                </div>
                <div class="v-footer">
                  <span>توقيع اللجنة: ............</span>
                  <span style="font-size: 8px;">ID: ${o.id.slice(0, 8)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = `
      <html>
        <head>
          <title>كشف هيئة الأعمال الخيرية</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 12px; }
            th { background-color: #f4f4f4; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #059669; padding-bottom: 10px; }
          </style>
        </head>
        <body>
        <div class="header">
            <h1 style="margin: 0; color: #059669;">كشف حالات هيئة الأعمال الخيرية</h1>
            <p style="margin: 5px 0;">جمعية بصمة خير نبروه</p>
            <p style="font-size: 12px; color: #666;">التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>أسماء الأيتام</th>
                <th>الأرقام القومية</th>
                <th>المرحلة الدراسية</th>
                <th>الصف الدراسي</th>
                <th>اسم المعيل</th>
                <th>جهة التسجيل</th>
                <th>المركز / القرية</th>
                <th>التليفون</th>
                <th>حالة الكفالة</th>
              </tr>
            </thead>
            <tbody>
              ${filteredOrphans.map(o => `
                <tr>
                  <td>${o.orphans?.map(child => child.name).join('<br>')}</td>
                  <td>${o.orphans?.map(child => child.id).join('<br>')}</td>
                  <td>${o.orphans?.map(child => child.schoolStage || '-').join('<br>')}</td>
                  <td>${o.orphans?.map(child => child.schoolGrade || '-').join('<br>')}</td>
                  <td>${o.guardianName}</td>
                  <td>${o.registrationPlace === 'council' ? 'المجلس الإسلامي' : o.registrationPlace === 'hayatem' ? 'الهياتم' : o.registrationPlace === 'medical' ? 'الحالات المرضية' : 'غير مسجلة'}</td>
                  <td>${o.markaz} - ${o.village}</td>
                  <td>${o.phone1}</td>
                  <td>${o.isSponsored ? 'مكفول (' + o.sponsorshipAmount + ' ج.م)' : 'غير مكفول'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Visual Section Header Banner */}
      <div className="relative overflow-hidden rounded-[2rem] bg-emerald-900 h-48 flex items-center p-8 text-white shadow-lg border border-emerald-800">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&q=80&w=1200" 
            alt="Orphans Sponsorship" 
            className="w-full h-full object-cover opacity-20 select-none"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-900/90 to-emerald-950/40" />
        </div>
        <div className="relative z-10 w-full text-right">
          <h1 className="text-3xl font-black mb-2">هيئة الأعمال الخيرية ورعاية الأيتام</h1>
          <p className="text-emerald-200 text-xs md:text-sm font-semibold max-w-2xl leading-relaxed">
            كفالة ورعاية الأيتام - نوفر لهم كفالات شهرية، دعماً تعليمياً وصحياً متكاملاً لضمان مستقبلهم الكريم والتحقق المستمر من حالتهم المعيشية والدراسية.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-emerald-50/50">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-black text-emerald-950">هيئة الأعمال الخيرية</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-emerald-600 font-bold text-sm tracking-wide">إدارة شؤون الأيتام والمطالبات</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="bg-stone-100 p-1.5 rounded-2xl flex gap-1 w-full sm:w-auto">
            <button 
              onClick={() => setActiveTab('database')}
              className={`flex-1 sm:px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'database' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
            >
              قاعدة البيانات
            </button>
            <button 
              onClick={() => setActiveTab('new_registrations')}
              className={`flex-1 sm:px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'new_registrations' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
            >
              تسجيل الحالات الجديدة
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-2 sm:pb-0">
          {activeTab === 'database' ? (
            <>
              <button 
                onClick={() => handleDownloadPDF('كشف_الأيتام', 'orphans-table-full')}
                className="group relative p-3.5 bg-stone-50 text-stone-600 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-stone-100"
                title="تحميل PDF"
              >
                <Download className="w-6 h-6" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">تحميل PDF</span>
              </button>
              <button 
                onClick={printReport}
                className="group relative p-3.5 bg-stone-50 text-stone-600 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-stone-100"
                title="طباعة الكشف"
              >
                <Printer className="w-6 h-6" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">طباعة الكشف</span>
              </button>
              <label 
                className="group relative p-3.5 bg-stone-50 text-stone-600 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-stone-100 cursor-pointer"
                title="استيراد اكسل"
              >
                <UploadCloud className="w-6 h-6" />
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">استيراد اكسل</span>
              </label>
              <button 
                onClick={exportToExcel}
                className="group relative p-3.5 bg-stone-50 text-stone-600 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-stone-100"
                title="تصدير اكسل"
              >
                <Download className="w-6 h-6" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">تصدير اكسل</span>
              </button>
              <button 
                onClick={() => setShowConfirmDeleteAll(true)}
                className="group relative p-3.5 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 hover:text-rose-700 transition-all border border-rose-100"
                title="حذف جميع الحالات"
              >
                <Trash2 className="w-6 h-6" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">حذف الكل</span>
              </button>
              <button 
                onClick={() => { setShowAddForm(true); setEditingCase(null); setFormData(initialForm); }}
                className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200/50"
              >
                <Plus className="w-6 h-6" />
                <span>إضافة حالة</span>
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setShowNewRegPrintModal(true)}
                className="group relative p-3.5 bg-stone-50 text-stone-600 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-stone-100"
                title="طباعة الكشف المحدد"
              >
                <Printer className="w-6 h-6" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">طباعة الكشف المحدد</span>
              </button>
              <label 
                className="group relative p-3.5 bg-stone-50 text-stone-600 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-stone-100 cursor-pointer"
                title="استيراد اكسل"
              >
                <UploadCloud className="w-6 h-6" />
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImportNewRegExcel} />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">استيراد اكسل</span>
              </label>
              <button 
                onClick={exportNewRegToExcel}
                className="group relative p-3.5 bg-stone-50 text-stone-600 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-stone-100"
                title="تصدير اكسل"
              >
                <Download className="w-6 h-6" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">تصدير اكسل</span>
              </button>
              <button 
                onClick={handleDeleteAllNewRegistrations}
                className="group relative p-3.5 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 hover:text-rose-700 transition-all border border-rose-100"
                title="حذف جميع الحالات"
              >
                <Trash2 className="w-6 h-6" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">حذف الكل</span>
              </button>
              <button 
                onClick={() => { setShowNewRegForm(true); setEditingNewReg(null); setNewRegFormData(initialNewRegistrationForm); }}
                className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200/50"
              >
                <Plus className="w-6 h-6" />
                <span>تسجيل حالة جديدة</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Database View */}
      {activeTab === 'database' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          {/* Agency Tabs */}
          <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-emerald-100 shadow-sm">
        {([
          { id: 'all', label: 'كل الحالات', active: 'bg-emerald-600 text-white shadow-md', idle: 'text-emerald-700 hover:bg-emerald-50' },
          { id: 'council', label: 'المجلس الإسلامي للدعوة والإغاثة', active: 'bg-blue-600 text-white shadow-md', idle: 'text-blue-700 hover:bg-blue-50' },
          { id: 'hayatem', label: 'الهياتم', active: 'bg-sky-600 text-white shadow-md', idle: 'text-sky-700 hover:bg-sky-50' },
          { id: 'medical', label: 'الحالات المرضية', active: 'bg-rose-600 text-white shadow-md', idle: 'text-rose-700 hover:bg-rose-50' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setPlaceFilter(t.id as any)}
            className={`flex-1 min-w-[140px] px-4 py-3 rounded-xl text-sm font-black transition-all ${placeFilter === t.id ? t.active : t.idle}`}
          >
            {t.label}
            <span className="mr-2 text-xs opacity-70">({t.id === 'all' ? orphans.length : orphans.filter(o => (o.registrationPlace || 'none') === t.id).length})</span>
          </button>
        ))}
      </div>

      {/* Stats Quick View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50 p-6 rounded-3xl border-2 border-emerald-100 flex items-center justify-between">
            <div className="text-right">
              <p className="text-emerald-600 font-bold text-xs mb-1">إجمالي الحالات</p>
              <p className="text-2xl font-black text-emerald-900">{orphans.length}</p>
            </div>
            <Users className="w-8 h-8 text-emerald-200" />
        </div>
        <div className="bg-blue-50 p-6 rounded-3xl border-2 border-blue-100 flex items-center justify-between">
            <div className="text-right">
              <p className="text-blue-600 font-bold text-xs mb-1">تم الإرسال</p>
              <p className="text-2xl font-black text-blue-900">{orphans.filter(o => o.submissionStatus === 'done').length}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-blue-200" />
        </div>
        <div className="bg-amber-50 p-6 rounded-3xl border-2 border-amber-100 flex items-center justify-between">
            <div className="text-right">
              <p className="text-amber-600 font-bold text-xs mb-1">جاري التسجيل</p>
              <p className="text-2xl font-black text-amber-900">{orphans.filter(o => o.submissionStatus === 'processing').length}</p>
            </div>
            <Clock className="w-8 h-8 text-amber-200" />
        </div>
      </div>

      {duplicateOrphansCount > 0 && (
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
              <span className="font-extrabold text-sm block">تم كشف {duplicateOrphansCount} حالة تكرار في بيانات الحاضن/المعيل (الاسم أو الرقم القومي أو الهاتف)!</span>
              <span className="text-xs font-bold text-rose-600">انقر هنا لعرض الحالات المكررة لتدقيقها والتحقق منها</span>
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
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-3xl border border-emerald-50 relative">
        <div className="relative flex-grow">
          <Search className="w-5 h-5 text-emerald-300 absolute right-4 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="ابحث باسم اليتيم أو الرقم القومي أو اسم المعيل أو القرية..."
            className="w-full bg-stone-50 border-2 border-emerald-50 pr-12 pl-6 py-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-emerald-50/50 p-1.5 rounded-2xl border border-emerald-100 flex-wrap">
           <span className="text-[10px] font-bold text-emerald-600 px-3">ترتيب حسب:</span>
           {[
             { id: 'orphanName', label: 'اسم اليتيم' },
             { id: 'guardianName', label: 'المعيل' },
             { id: 'village', label: 'القرية' },
             { id: 'address', label: 'العنوان' }
           ].map(btn => (
             <button 
               key={btn.id}
               onClick={() => setSortBy(btn.id as any)}
               className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${sortBy === btn.id ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-700 hover:bg-white'}`}
             >
               {btn.label}
             </button>
           ))}
        </div>
      </div>

      {/* Orphans Table */}
      <div className="bg-white rounded-[2.5rem] border border-emerald-50 shadow-xl overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          <table id="orphans-table-full" className="w-full text-right border-collapse min-w-[1200px] bg-white" dir="rtl">
            <thead>
              <tr className="bg-emerald-50/50">
                <th className="px-6 py-4 text-center border-b border-emerald-100">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                    checked={filteredOrphans.length > 0 && selectedOrphanIds.length === filteredOrphans.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">مسلسل</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">أسماء الأيتام</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">المعيل (الأم)</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">جهة التسجيل</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">حالة الكفالة</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">الهاتف</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">القرية</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-center">الإجراءات</th>
              </tr>
              <tr className="bg-stone-50/50 border-b border-emerald-100">
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2"></td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="فلترة بالاسم..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                    value={columnFilters.orphanName}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, orphanName: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="فلترة بالرقم القومي..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal tabular-nums"
                    value={columnFilters.orphanId}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, orphanId: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="فلترة بالمعيل..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                    value={columnFilters.guardianName}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, guardianName: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2"></td>
                <td className="px-6 py-2">
                   <input 
                    type="text" 
                    placeholder="فلترة بالقرية..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                    value={columnFilters.village}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, village: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2"></td>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {filteredOrphans.map((o, index) => (
                <tr key={o.id} className="hover:bg-emerald-50/20 transition-colors group">
                  <td className="px-6 py-4 text-center border-l border-emerald-50/50">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      checked={selectedOrphanIds.includes(o.id)}
                      onChange={() => toggleSelectOrphan(o.id)}
                    />
                  </td>
                  <td className="p-5 text-stone-400 font-bold text-xs tabular-nums">
                    <div>{index + 1}</div>
                    {o.caseCode && <div className="mt-1 text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{o.caseCode}</div>}
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      {o.orphans?.map((child, idx) => (
                        <div key={idx} className="flex flex-col border-b border-stone-50 last:border-0 pb-1">
                          <span className="font-black text-emerald-950 text-sm">
                            {child.name}
                            {child.orphanCode && <span className="mr-2 text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">كود: {child.orphanCode}</span>}
                          </span>
                          <span className="text-[9px] text-stone-400 tabular-nums">{child.id}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-5">
                    {(() => {
                      const dupInfo = getIsDuplicate(o);
                      return (
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "text-sm font-bold",
                            0, // dummy to allow cn
                            dupInfo.isDuplicate ? "text-rose-700 font-extrabold animate-pulse" : "text-emerald-800"
                          )}>{o.guardianName}</span>
                          {dupInfo.isDuplicate && (
                            <div className="flex items-center gap-1 text-[8px] font-black bg-rose-50 border border-rose-100 text-rose-600 px-1.5 py-0.5 rounded-lg w-max select-none mt-1">
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-500" />
                              <span>تكرار في: </span>
                              {dupInfo.reasons.name && <span className="bg-rose-100 text-rose-800 px-0.5 rounded">الاسم</span>}
                              {dupInfo.reasons.nationalId && <span className="bg-rose-100 text-rose-800 px-0.5 rounded">الهوية</span>}
                              {dupInfo.reasons.phone && <span className="bg-rose-100 text-rose-800 px-0.5 rounded">الهاتف</span>}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-5">
                    <div className={`px-3 py-1 rounded-full inline-flex items-center gap-1.5 ${o.registrationPlace !== 'none' ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-500'}`}>
                      {o.registrationPlace !== 'none' ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      <span className="text-[10px] font-black">
                        {o.registrationPlace === 'council' ? 'المجلس الإسلامي' : o.registrationPlace === 'hayatem' ? 'الهياتم' : o.registrationPlace === 'medical' ? 'الحالات المرضية' : 'غير مسجلة'}
                      </span>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className={`px-3 py-1 rounded-full inline-flex flex-col items-center gap-0.5 ${o.isSponsored ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      <span className="text-[10px] font-black">{o.isSponsored ? 'مكفول' : 'غير مكفول'}</span>
                      {o.isSponsored && <span className="text-[9px] font-bold tabular-nums">{o.sponsorshipAmount} ج.م</span>}
                    </div>
                  </td>
                  <td className="p-5">
                    <a href={`tel:${o.phone1}`} className="text-xs font-black text-emerald-600 tabular-nums hover:underline">{o.phone1}</a>
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-emerald-900">{o.village}</span>
                      <span className="text-[9px] text-stone-400 font-bold truncate max-w-[150px]">{o.address}</span>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => setUnifiedTransferCase({
                            id: o.id,
                            name: o.guardianName || o.orphans?.[0]?.name || '',
                            nationalId: o.guardianId || o.orphans?.[0]?.id || '',
                            phone: o.phone1 || o.phone2 || '',
                            address: o.address || '',
                            village: o.village || '',
                            familyCount: o.orphans?.length || 1,
                            sourceSection: 'orphans',
                            sourceSectionLabel: 'كفالة الأيتام',
                            sourceCollection: 'orphans'
                          })}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="الربط والنقل بين الأقسام"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setShowPeriodicResearch(o)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="البحث الدوري"
                        >
                          <ClipboardList className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDownloadOrphanPDF(o)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="تحميل كارت اليتيم PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(o)}
                          className="p-2 text-stone-600 hover:bg-stone-50 rounded-xl transition-all"
                          title="تعديل"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            const printWindow = window.open('', '_blank');
                            if (printWindow) {
                              const html = `
                                <html dir="rtl">
                                  <head>
                                    <title>تقرير حالة - ${o.guardianName}</title>
                                    <style>
                                      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
                                      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
                                      body { font-family: 'Tajawal', sans-serif; padding: 40px; color: #1a2e05; line-height: 1.6; background: #fff; }
                                      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
                                      .header-title { text-align: center; flex-grow: 1; }
                                      .header-title h1 { margin: 0; font-size: 24px; font-weight: 900; color: #065f46; }
                                      .header-title p { margin: 5px 0 0; color: #059669; font-weight: bold; }
                                      .section { margin-bottom: 30px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
                                      .section-header { background-color: #f0fdf4; padding: 10px 20px; border-bottom: 1px solid #e5e7eb; font-weight: 900; color: #065f46; border-right: 6px solid #059669; font-size: 16px; }
                                      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
                                      .grid-item { padding: 12px 20px; border-bottom: 1px solid #f3f4f6; border-left: 1px solid #f3f4f6; display: flex; justify-content: space-between; }
                                      .grid-item:nth-last-child(1), .grid-item:nth-last-child(2) { border-bottom: none; }
                                      .label { font-weight: bold; color: #6b7280; font-size: 14px; }
                                      .value { font-weight: 900; color: #111827; }
                                      table { width: 100%; border-collapse: collapse; }
                                      th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: right; }
                                      th { background: #f9fafb; font-weight: 900; font-size: 13px; color: #374151; }
                                      td { font-size: 14px; color: #111827; }
                                      .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
                                      .no-print { display: flex; gap: 10px; justify-content: center; margin-top: 30px; }
                                      .print-btn { background: #059669; color: white; border: none; padding: 12px 30px; border-radius: 10px; cursor: pointer; font-weight: 900; font-family: 'Tajawal'; font-size: 16px; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                                      .print-btn:hover { background: #047857; transform: translateY(-1px); }
                                      @media print { .no-print { display: none; } body { padding: 20px; } }
                                    </style>
                                  </head>
                                  <body>
                                    <div class="header">
                                      <div class="header-title">
                                        <h1>تقرير شامل لبيانات حالة</h1>
                                        <p>${AGENCY_NAMES[o.registrationPlace || 'none']}</p>
                                      </div>
                                      <div style="font-size:12px; font-weight:bold; text-align: left;">
                                        تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}<br>
                                        كود الملف: ${o.id.substring(0, 8)}
                                      </div>
                                    </div>

                                    <div class="section">
                                      <div class="section-header">بيانات الأسرة والضامن</div>
                                      <div class="grid">
                                        <div class="grid-item"><span class="label">اسم الأم / المعيل:</span> <span class="value">${o.guardianName}</span></div>
                                        <div class="grid-item"><span class="label">الرقم القومي:</span> <span class="value">${o.guardianId}</span></div>
                                        <div class="grid-item"><span class="label">جهة التسجيل:</span> <span class="value">${o.registrationPlace === 'council' ? 'المجلس الإسلامي للدعوة' : o.registrationPlace === 'hayatem' ? 'الهياتم' : 'ليست مسجلة'}</span></div>
                                        <div class="grid-item"><span class="label">حالة الكفالة:</span> <span class="value">${o.isSponsored ? `مكفول (${o.sponsorshipAmount} ج.م)` : 'غير مكفول'}</span></div>
                                        <div class="grid-item"><span class="label">رقم الهاتف:</span> <span class="value">${o.phone1}</span></div>
                                        <div class="grid-item"><span class="label">العنوان المنزلي:</span> <span class="value">${o.markaz} - ${o.village}</span></div>
                                        <div class="grid-item" style="grid-column: span 2; border-left: none;"><span class="label">العنوان بالتفصيل:</span> <span class="value">${o.address}</span></div>
                                      </div>
                                    </div>

                                    <div class="section">
                                      <div class="section-header">بيانات الأيتام المسجلين</div>
                                      <table>
                                        <thead>
                                          <tr>
                                            <th>م</th>
                                            <th style="width: 35%">الاسم الكامل</th>
                                            <th>الرقم القومي</th>
                                            <th>المرحلة الدراسية</th>
                                            <th>الصف الدراسي</th>
                                            <th>الفصل</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          ${o.orphans?.map((c, i) => `
                                            <tr>
                                              <td style="text-align:center;">${i + 1}</td>
                                              <td style="font-weight: 900">${c.name}</td>
                                              <td>${c.id}</td>
                                              <td>${c.schoolStage || '-'}</td>
                                              <td>${c.schoolGrade || '-'}</td>
                                              <td>${c.semester || '-'}</td>
                                            </tr>
                                          `).join('')}
                                        </tbody>
                                      </table>
                                    </div>

                                    ${o.researchList?.length ? `
                                      <div class="section">
                                        <div class="section-header">آخر نتائج البحث الميداني</div>
                                        <div class="grid">
                                          <div class="grid-item"><span class="label">تاريخ آخر بحث:</span> <span class="value font-sans">${new Date(o.researchList[0].researchDate || o.researchList[0].createdAt?.toDate()).toLocaleDateString('ar-EG')}</span></div>
                                          <div class="grid-item"><span class="label">رقم البحث:</span> <span class="value">${o.researchList[0].researchNumber || '-'}</span></div>
                                          <div class="grid-item"><span class="label">سلامة الحالة:</span> <span class="value">${o.researchList[0].isAlive ? 'على قيد الحياة' : 'متوفى'}</span></div>
                                          <div class="grid-item"><span class="label">نظام السكن:</span> <span class="value">${o.researchList[0].housingType === 'rent' ? `إيجار شهري (${o.researchList[0].rentAmount} ج.م)` : 'سكن / ملك'}</span></div>
                                          <div class="grid-item"><span class="label">إجمالي الدخل الشهري:</span> <span class="value">${Object.values(o.researchList[0].income).reduce((a, b) => (a as number) + (b as number), 0)} ج.م</span></div>
                                          <div class="grid-item"><span class="label">إجمالي المصروفات:</span> <span class="value">${Object.values(o.researchList[0].expenses).reduce((a, b) => (a as number) + (b as number), 0) + (o.researchList[0].rentAmount || 0)} ج.م</span></div>
                                          <div class="grid-item" style="grid-column: span 2; border-left: none; border-bottom: none;"><span class="label">التوصيات والملحوظات:</span> <span class="value">${o.researchList[0].notes || 'لا يوجد'}</span></div>
                                        </div>
                                      </div>
                                    ` : `
                                      <div class="section" style="padding: 20px; text-align: center; color: #9ca3af; font-weight: bold;">
                                        لا توجد أبحاث دورية مسجلة لهذه الحالة بعد.
                                      </div>
                                    `}

                                    <div class="footer">
                                      تم استخراج هذا التقرير آلياً عبر نظام إدارة ${AGENCY_NAMES[o.registrationPlace || 'none']}<br>
                                      جميع البيانات المسجلة هي عهدة الباحث المختص &copy; ${new Date().getFullYear()}
                                    </div>
                                    
                                    <div class="no-print">
                                      <button class="print-btn" onclick="window.print()">طباعة التقرير</button>
                                      <button class="print-btn" style="background: #6b7280;" onclick="window.close()">إغلاق</button>
                                    </div>
                                  </body>
                                </html>
                              `;
                              printWindow.document.write(html);
                              printWindow.document.close();
                            }
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all shadow-sm"
                          title="تقرير الحالة"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setShowConfirmDelete(o.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}

      {/* New Registrations View */}
      {activeTab === 'new_registrations' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-inner">
                <Users className="w-7 h-7" />
              </div>
              <div className="text-right flex-grow">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">إجمالي الحالات الجديدة</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black text-emerald-950">{newRegistrations.length}</p>
                  <span className="text-xs text-emerald-500 font-bold">حالة</span>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-blue-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-inner">
                <ArrowRightLeft className="w-7 h-7" />
              </div>
              <div className="text-right flex-grow">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">تم الإرسال للهيئات</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black text-blue-950">{newRegistrations.filter(r => r.isSent).length}</p>
                  <span className="text-xs text-blue-500 font-bold">حالة</span>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-rose-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 shadow-inner">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="text-right flex-grow">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">حالات بها أوراق ناقصة</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black text-rose-950">{newRegistrations.filter(r => r.missingFiles && r.missingFiles.length > 0 && !r.missingFiles.includes('لا يوجد')).length}</p>
                  <span className="text-xs text-rose-500 font-bold">تنبيه</span>
                </div>
              </div>
            </div>
          </div>

          {/* Search, Filters & Sorting for New Registrations */}
          <div className="bg-white p-6 rounded-[2rem] border border-emerald-50/50 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="w-5 h-5 text-emerald-300 absolute right-4 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="ابحث باسم اليتيم أو المعيل أو الأرقام القومية..."
                  className="w-full bg-stone-50 border-2 border-emerald-50 pr-12 pl-6 py-3.5 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right text-sm text-emerald-950"
                  value={newRegFilters.search}
                  onChange={(e) => setNewRegFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <select
                  className="bg-stone-50 border-2 border-emerald-50 px-4 py-3 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-sm text-right cursor-pointer text-emerald-900"
                  value={newRegFilters.sendingAuthority}
                  onChange={(e) => setNewRegFilters(prev => ({ ...prev, sendingAuthority: e.target.value }))}
                >
                  <option value="all">كل الهيئات المرسل إليها</option>
                  {SENDING_AUTHORITIES.map(auth => (
                    <option key={auth} value={auth}>{auth}</option>
                  ))}
                </select>
                <select
                  className="bg-stone-50 border-2 border-emerald-50 px-4 py-3 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-sm text-right cursor-pointer text-emerald-900"
                  value={newRegFilters.status}
                  onChange={(e) => setNewRegFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="all">كل الحالات (الفلترة بالحالة)</option>
                  <option value="files">تم تسجيل الملفات</option>
                  <option value="form">تم عمل الاستمارة</option>
                  <option value="sent">تم الإرسال</option>
                  <option value="missing">أوراق ناقصة</option>
                </select>
                <input
                  type="text"
                  placeholder="فلترة بالقرية..."
                  className="bg-stone-50 border-2 border-emerald-50 px-4 py-3 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-sm text-right text-emerald-950"
                  value={newRegFilters.village}
                  onChange={(e) => setNewRegFilters(prev => ({ ...prev, village: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setNewRegFilters({ search: '', guardianName: '', guardianId: '', orphanName: '', village: '', sendingAuthority: 'all', status: 'all' })}
                  className="bg-stone-50 hover:bg-stone-100 text-stone-600 px-4 py-3 rounded-2xl font-bold text-sm transition-all border border-stone-200"
                >
                  إعادة تعيين
                </button>
              </div>
            </div>

            {/* Sorter Controls */}
            <div className="flex flex-wrap items-center gap-3 bg-emerald-50/20 p-2 rounded-2xl border border-emerald-50">
              <span className="text-xs font-bold text-emerald-800 px-2">الترتيب حسب:</span>
              {[
                { id: 'registrationDate', label: 'تاريخ التسجيل' },
                { id: 'orphanName', label: 'اسم اليتيم' },
                { id: 'guardianName', label: 'المعيل' },
                { id: 'village', label: 'القرية' },
                { id: 'sendingAuthority', label: 'الهيئة المرسل إليها' }
              ].map(btn => (
                <button 
                  key={btn.id}
                  onClick={() => {
                    if (newRegSortBy === btn.id) {
                      setNewRegSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setNewRegSortBy(btn.id);
                      setNewRegSortOrder('desc');
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${newRegSortBy === btn.id ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-700 hover:bg-white'}`}
                >
                  <span>{btn.label}</span>
                  {newRegSortBy === btn.id && (
                    newRegSortOrder === 'asc' ? <span>↑</span> : <span>↓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* New Registrations Table */}
          <div className="bg-white rounded-[2.5rem] shadow-xl shadow-emerald-900/5 border border-emerald-50 overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-right border-collapse min-w-[1500px]">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-emerald-100">
                    <th className="p-6 text-center border-l border-emerald-50/50 w-16">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        checked={filteredNewRegistrations.length > 0 && selectedNewRegIds.length === filteredNewRegistrations.length}
                        onChange={handleSelectAllNewReg}
                      />
                    </th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50 w-24">مسلسل</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50 col-span-2">بيانات الأسرة</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50 w-52">الرقم القومي للمعيل</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50">بيانات اليتيم</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50 text-center">أوراق التسجيل</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50 text-center">التفاصيل والتواصل</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50 text-center">حالة الاستمارة</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50 text-center">حالة الإرسال</th>
                    <th className="p-6 font-black text-emerald-950 border-l border-emerald-50/50">الأوراق الناقصة</th>
                    <th className="p-6 font-black text-emerald-950 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredNewRegistrations.map((reg, index) => (
                    <tr key={reg.id} className="hover:bg-emerald-50/30 transition-all group">
                      <td className="p-6 text-center border-l border-emerald-50/50">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          checked={selectedNewRegIds.includes(reg.id)}
                          onChange={() => handleToggleSelectNewReg(reg.id)}
                        />
                      </td>
                      <td className="p-6 border-l border-emerald-50/50 text-stone-400 font-bold text-xs tabular-nums">
                        {index + 1}
                      </td>
                      <td className="p-6 border-l border-emerald-50/50">
                        <div className="flex flex-col">
                          <span className="font-black text-emerald-950">{reg.guardianName}</span>
                          <span className="text-[10px] text-stone-400 font-bold">الأم / المعيل</span>
                        </div>
                      </td>
                      <td className="p-6 border-l border-emerald-50/50">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-stone-600 tabular-nums">{reg.guardianId}</span>
                        </div>
                      </td>
                      <td className="p-6 border-l border-emerald-50/50">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                             <span className="font-black text-emerald-900">{reg.orphanName}</span>
                          </div>
                          <span className="text-xs font-bold text-stone-500 tabular-nums pr-3.5">{reg.orphanId}</span>
                        </div>
                      </td>
                      <td className="p-6 border-l border-emerald-50/50 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black ${reg.isFilesRegistered ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>
                            {reg.isFilesRegistered ? 'تم تسجيل الملفات' : 'لم تسجل بعد'}
                          </span>
                        </div>
                      </td>
                      <td className="p-6 border-l border-emerald-50/50">
                        <div className="flex flex-col gap-1 text-xs font-bold text-stone-600">
                           <div className="flex items-center gap-2">
                             <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                             <span>{reg.markaz} - {reg.village}</span>
                           </div>
                           <div className="flex items-center gap-2 tabular-nums">
                             <Phone className="w-3.5 h-3.5 text-blue-500" />
                             <span className="ltr">{reg.phone1} {reg.phone2 && `/ ${reg.phone2}`}</span>
                           </div>
                           {/* Show Registration Date */}
                           {reg.registrationDate && (
                             <div className="text-[10px] text-stone-400 font-bold bg-stone-50 px-2 py-1 rounded-lg mt-1 w-fit">
                               تاريخ التسجيل: {reg.registrationDate}
                             </div>
                           )}
                           {reg.notes && (
                             <div className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2.5 py-1.5 rounded-lg mt-1 border border-amber-100 max-w-[200px] whitespace-pre-wrap">
                               ملاحظات: {reg.notes}
                             </div>
                           )}
                        </div>
                      </td>
                      <td className="p-6 border-l border-emerald-50/50 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black inline-flex items-center gap-2 ${reg.isFormDone ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>
                            {reg.isFormDone ? <FileCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {reg.isFormDone ? 'تم عمل الاستمارة' : 'قيد الانتظار'}
                          </span>
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{reg.sendingAuthority}</span>
                        </div>
                      </td>
                      <td className="p-6 border-l border-emerald-50/50 text-center">
                        <span className={`px-4 py-2 rounded-2xl text-[10px] font-black inline-flex items-center gap-2 ${reg.isSent ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-amber-100 text-amber-700'}`}>
                          {reg.isSent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {reg.isSent ? 'تم الإرسال' : 'بانتظار الإرسال'}
                        </span>
                      </td>
                      <td className="p-6 border-l border-emerald-50/50 min-w-[200px]">
                        <div className="flex flex-wrap gap-1.5">
                          {(!reg.missingFiles || reg.missingFiles.length === 0 || reg.missingFiles.includes('لا يوجد')) ? (
                            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="text-[11px] font-black">كاملة ومستوفاة</span>
                            </div>
                          ) : (
                            reg.missingFiles.map(f => (
                              <span key={f} className="bg-rose-50 text-rose-600 px-2 py-1 rounded-lg text-[10px] font-bold border border-rose-100">
                                {f}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center justify-center gap-3">
                          <button 
                            onClick={() => handleEditNewReg(reg)}
                            className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center justify-center"
                            title="تعديل"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteNewReg(reg.id)}
                            className="w-10 h-10 bg-rose-50 text-rose-400 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center justify-center"
                            title="حذف"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredNewRegistrations.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-32 text-center">
                        <div className="flex flex-col items-center gap-6 text-stone-300">
                           <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center">
                             <ClipboardList className="w-12 h-12 opacity-30" />
                           </div>
                           <div className="space-y-2">
                              <p className="text-xl font-black text-stone-400">لا توجد سجلات مطابقة للرغبة</p>
                              <p className="text-sm font-bold">يرجى تعديل الفلترة أو الضغط على إعادة التعيين</p>
                           </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-8 custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-emerald-50 sticky top-0 bg-white z-10">
                <button onClick={() => setShowAddForm(false)} className="p-3 hover:bg-rose-50 text-rose-500 rounded-2xl transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">بيانات كفالة اليتيم</h2>
                  <p className="text-emerald-600 font-bold">يرجى استيفاء كافة البيانات بدقة</p>
                </div>
              </div>

              <form onSubmit={handleTrySaveOrphan} className="space-y-10">
                {/* Guardian Section */}
                <div className="space-y-6">
                  <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                    <span>بيانات الام / المعيل</span>
                    <Shield className="w-5 h-5" />
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">اسم الام / المعيل</label>
                      <input 
                        type="text" required
                        value={formData.guardianName || ''}
                        onChange={(e) => setFormData({...formData, guardianName: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">الرقم القومي للمعيل</label>
                      <input 
                        type="text" required maxLength={14}
                        value={formData.guardianId || ''}
                        onChange={(e) => setFormData({...formData, guardianId: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* Orphan Section */}
                <div className="space-y-6">
                   <div className="flex items-center justify-between border-b border-emerald-50 pb-4">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, orphans: [...formData.orphans, { name: '', id: '', birthDate: '', schoolStage: '' }]})}
                      className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100 transition-all text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة يتيم للأسرة</span>
                    </button>
                    <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2">
                      <span>بيانات الأيتام</span>
                      <Heart className="w-5 h-5" />
                    </h3>
                  </div>
                  
                  <div className="space-y-6">
                    {formData.orphans.map((orphan, index) => (
                      <div key={index} className="p-6 bg-stone-50 rounded-3xl border-2 border-stone-100 relative group space-y-4">
                        {formData.orphans.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, orphans: formData.orphans.filter((_, i) => i !== index)})}
                            className="absolute -left-2 -top-2 w-8 h-8 bg-white border-2 border-rose-100 text-rose-500 rounded-full flex items-center justify-center hover:bg-rose-50 transition-all shadow-sm"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">اسم اليتيم ({index + 1})</label>
                            <input 
                              type="text" required
                              value={orphan.name || ''}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].name = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                            />
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">كود اليتيم (اختياري)</label>
                            <input 
                              type="text"
                              value={orphan.orphanCode || ''}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].orphanCode = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                            />
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">الرقم القومي لليتيم</label>
                            <input 
                              type="text" required maxLength={14}
                              value={orphan.id || ''}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].id = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right tabular-nums"
                            />
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">المرحلة الدراسية</label>
                            <select 
                              value={orphan.schoolStage}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].schoolStage = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                            >
                              <option value="">اختار المرحلة</option>
                              {SCHOOL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>

                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">الصف الدراسي</label>
                            <select 
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                              value={orphan.schoolGrade}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].schoolGrade = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                            >
                              <option value="">اختر الصف</option>
                              {(GRADE_MAPPING[orphan.schoolStage] || []).map(grade => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">تاريخ الميلاد (اختياري)</label>
                            <input 
                              type="date"
                              value={orphan.birthDate || ''}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].birthDate = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right font-sans"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sponsorship and Council Section */}
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    {/* Registration Status */}
                    <div className="p-8 bg-blue-50/50 rounded-3xl border-2 border-blue-100 space-y-6">
                      <h3 className="text-lg font-black text-blue-800 flex items-center gap-2 justify-end">
                        <span>الحالة مسجلة في؟</span>
                        <Shield className="w-5 h-5" />
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, registrationPlace: 'council'})}
                          className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-black ${formData.registrationPlace === 'council' ? 'bg-white border-blue-600 text-blue-700 shadow-lg scale-[1.02]' : 'bg-white/50 border-stone-100 text-stone-400 hover:bg-white'}`}
                        >
                          <CheckCircle2 className={`w-6 h-6 ${formData.registrationPlace === 'council' ? 'text-blue-600' : 'text-stone-300'}`} />
                          <span className="text-base">المجلس الإسلامي للدعوة والإغاثة</span>
                        </button>

                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, registrationPlace: 'hayatem'})}
                          className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-black ${formData.registrationPlace === 'hayatem' ? 'bg-white border-sky-600 text-sky-700 shadow-lg scale-[1.02]' : 'bg-white/50 border-stone-100 text-stone-400 hover:bg-white'}`}
                        >
                          <CheckCircle2 className={`w-6 h-6 ${formData.registrationPlace === 'hayatem' ? 'text-sky-600' : 'text-stone-300'}`} />
                          <span className="text-base">الهياتم</span>
                        </button>

                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, registrationPlace: 'medical'})}
                          className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-black ${formData.registrationPlace === 'medical' ? 'bg-white border-rose-500 text-rose-600 shadow-lg scale-[1.02]' : 'bg-white/50 border-stone-100 text-stone-400 hover:bg-white'}`}
                        >
                          <Heart className={`w-6 h-6 ${formData.registrationPlace === 'medical' ? 'text-rose-500' : 'text-stone-300'}`} />
                          <span className="text-base">الحالات المرضية</span>
                        </button>

                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, registrationPlace: 'none'})}
                          className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-black ${formData.registrationPlace === 'none' ? 'bg-white border-stone-500 text-stone-600 shadow-sm' : 'bg-white/50 border-stone-100 text-stone-400 hover:bg-white'}`}
                        >
                          <X className={`w-6 h-6 ${formData.registrationPlace === 'none' ? 'text-stone-500' : 'text-stone-300'}`} />
                          <span className="text-base">ليست مسجلة</span>
                        </button>
                      </div>
                    </div>

                    {/* Sponsorship Status */}
                    <div className="p-8 bg-emerald-50/50 rounded-3xl border-2 border-emerald-100 space-y-4">
                      <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                        <span>حالة الكفالة</span>
                        <Clock className="w-5 h-5" />
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-end gap-4 p-4 bg-white rounded-2xl border-2 border-stone-50">
                           <span className={`text-sm font-black ${formData.isSponsored ? 'text-emerald-600' : 'text-stone-400'}`}>
                             {formData.isSponsored ? 'تم الكفالة' : 'غير مكفول حالياً'}
                           </span>
                           <button 
                             type="button"
                             onClick={() => setFormData({...formData, isSponsored: !formData.isSponsored})}
                             className={`w-14 h-8 rounded-full transition-all relative ${formData.isSponsored ? 'bg-emerald-500' : 'bg-stone-200'}`}
                           >
                             <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${formData.isSponsored ? 'right-7' : 'right-1'}`} />
                           </button>
                        </div>
                        {formData.isSponsored && (
                          <div className="space-y-2 text-right animate-in slide-in-from-right duration-300">
                            <label className="text-xs font-bold text-stone-500 pr-2">قيمة الكفالة الشهرية (ج.م)</label>
                            <input 
                              type="number" required
                              value={formData.sponsorshipAmount}
                              onChange={(e) => setFormData({...formData, sponsorshipAmount: Number(e.target.value)})}
                              className="w-full bg-white border-2 border-emerald-100 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-black text-center text-lg text-emerald-700"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact and Address */}
                <div className="space-y-6">
                  <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                    <span>التواصل والعنوان</span>
                    <MapPin className="w-5 h-5" />
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">رقم التليفون ١</label>
                      <input 
                        type="tel" required
                        value={formData.phone1}
                        onChange={(e) => setFormData({...formData, phone1: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">رقم التليفون ٢ (اختياري)</label>
                      <input 
                        type="tel"
                        value={formData.phone2}
                        onChange={(e) => setFormData({...formData, phone2: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">المركز</label>
                      <input 
                        type="text" required
                        value={formData.markaz}
                        onChange={(e) => setFormData({...formData, markaz: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">القرية</label>
                      <input 
                        type="text" required
                        value={formData.village}
                        onChange={(e) => setFormData({...formData, village: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">العنوان بالتفصيل</label>
                      <input 
                        type="text" required
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* Status Checks */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8 bg-emerald-50 rounded-3xl border-2 border-emerald-100">
                   <div className="space-y-3 text-right">
                      <label className="text-sm font-black text-emerald-900 block">الملفات</label>
                      <select 
                        value={formData.filesStatus}
                        onChange={(e) => setFormData({...formData, filesStatus: e.target.value as any})}
                        className="w-full p-4 rounded-2xl bg-white border-2 border-emerald-100 font-bold outline-none"
                      >
                         <option value="not_registered">لم تسجل</option>
                         <option value="registered">تم التسجيل</option>
                      </select>
                   </div>
                   <div className="space-y-3 text-right">
                      <label className="text-sm font-black text-emerald-900 block">استمارة البحث</label>
                      <select 
                        value={formData.researchFormStatus}
                        onChange={(e) => setFormData({...formData, researchFormStatus: e.target.value as any})}
                        className="w-full p-4 rounded-2xl bg-white border-2 border-emerald-100 font-bold outline-none"
                      >
                         <option value="not_registered">لم تسجل</option>
                         <option value="registered">تم التسجيل</option>
                      </select>
                   </div>
                   <div className="space-y-3 text-right">
                      <label className="text-sm font-black text-emerald-900 block">إرسال الحالة</label>
                      <select 
                        value={formData.submissionStatus}
                        onChange={(e) => setFormData({...formData, submissionStatus: e.target.value as any})}
                        className="w-full p-4 rounded-2xl bg-white border-2 border-emerald-100 font-bold outline-none"
                      >
                         <option value="processing">جاري التسجيل</option>
                         <option value="done">تم</option>
                      </select>
                   </div>
                </div>

                {/* Required Documents Uploads */}
                <div className="space-y-6">
                  <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                    <span>تحميل الأوراق المطلوبة</span>
                    <UploadCloud className="w-5 h-5" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                     {REQUIRED_DOCS_LIST.map((docName) => (
                       <FileUploadSlot 
                         key={docName}
                         label={docName}
                         caseName={`${formData.orphans?.[0]?.name || 'يتيم'}_${docName}`}
                         storagePath="orphans/required_docs"
                         values={formData.docFiles?.[docName] || []}
                         onUpload={(updater) => {
                           setFormData(prev => {
                             const currentFiles = prev.docFiles?.[docName] || [];
                             const newFiles = typeof updater === 'function' ? updater(currentFiles) : updater;
                             return {
                               ...prev,
                               docFiles: {
                                 ...(prev.docFiles || {}),
                                 [docName]: newFiles
                               }
                             };
                           });
                         }}
                       />
                     ))}
                  </div>
                </div>

                <div className="pt-8 flex items-center gap-4">
                  <button type="submit" className="flex-grow bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3">
                    <Save className="w-6 h-6" />
                    <span>حفظ بيانات الحالة</span>
                  </button>
                  <button type="button" onClick={() => setShowAddForm(false)} className="px-10 py-5 text-rose-500 font-bold hover:bg-rose-50 rounded-[2rem] transition-all">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Registration Modal */}
      <AnimatePresence>
        {showNewRegForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-8 custom-scrollbar border border-emerald-100 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-emerald-50 sticky top-0 bg-white z-10">
                <button 
                  onClick={() => { setShowNewRegForm(false); setEditingNewReg(null); setNewRegFormData(initialNewRegistrationForm); }} 
                  className="p-3 hover:bg-rose-50 text-rose-500 rounded-2xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">
                    {editingNewReg ? 'تعديل بيانات الحالة الجديدة' : 'تسجيل حالة جديدة'}
                  </h2>
                  <p className="text-emerald-600 font-bold">يرجى تسجيل كافة البيانات الأولية للحالة</p>
                </div>
              </div>

              <form onSubmit={handleSaveNewReg} className="space-y-10">
                {/* Family Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">اسم الأم / المعيل</label>
                      <input 
                        type="text" required
                        value={newRegFormData.guardianName}
                        onChange={(e) => setNewRegFormData({...newRegFormData, guardianName: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                        placeholder="الاسم الثلاثي أو الرباعي"
                      />
                   </div>
                   <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">الرقم القومي للمعيل</label>
                      <input 
                        type="text" required maxLength={14}
                        value={newRegFormData.guardianId}
                        onChange={(e) => setNewRegFormData({...newRegFormData, guardianId: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right tabular-nums"
                        placeholder="١٤ رقم قومي"
                      />
                   </div>
                   <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">اسم اليتيم</label>
                      <input 
                        type="text" required
                        value={newRegFormData.orphanName}
                        onChange={(e) => setNewRegFormData({...newRegFormData, orphanName: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                        placeholder="الاسم الكامل لليتيم"
                      />
                   </div>
                   <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">الرقم القومي لليتيم</label>
                      <input 
                        type="text" required maxLength={14}
                        value={newRegFormData.orphanId}
                        onChange={(e) => setNewRegFormData({...newRegFormData, orphanId: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right tabular-nums"
                        placeholder="١٤ رقم قومي"
                      />
                   </div>
                   <div className="space-y-2 text-right col-span-1 md:col-span-2">
                      <label className="text-sm font-bold text-stone-500 pr-2">تاريخ تسجيل الحالة</label>
                      <input 
                        type="date" required
                        value={newRegFormData.registrationDate || ''}
                        onChange={(e) => setNewRegFormData({...newRegFormData, registrationDate: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right cursor-pointer"
                      />
                   </div>
                </div>

                {/* Contact and Location */}
                <div className="bg-emerald-50/30 p-8 rounded-[2rem] border border-emerald-100 flex flex-col gap-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2 text-right">
                       <label className="text-sm font-bold text-stone-500 pr-2">رقم الهاتف (١)</label>
                       <input 
                         type="tel" required
                         value={newRegFormData.phone1}
                         onChange={(e) => setNewRegFormData({...newRegFormData, phone1: e.target.value})}
                         className="w-full bg-white border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right tabular-nums"
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-sm font-bold text-stone-500 pr-2">رقم الهاتف (٢)</label>
                       <input 
                         type="tel"
                         value={newRegFormData.phone2}
                         onChange={(e) => setNewRegFormData({...newRegFormData, phone2: e.target.value})}
                         className="w-full bg-white border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right tabular-nums"
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-sm font-bold text-stone-500 pr-2">المركز</label>
                       <input 
                         type="text" required
                         value={newRegFormData.markaz}
                         onChange={(e) => setNewRegFormData({...newRegFormData, markaz: e.target.value})}
                         className="w-full bg-white border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-sm font-bold text-stone-500 pr-2">القرية</label>
                       <input 
                         type="text" required
                         value={newRegFormData.village}
                         onChange={(e) => setNewRegFormData({...newRegFormData, village: e.target.value})}
                         className="w-full bg-white border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                       />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                     <label className="text-sm font-bold text-stone-500 pr-2">العنوان بالتفصيل</label>
                     <textarea 
                       rows={2}
                       value={newRegFormData.address}
                       onChange={(e) => setNewRegFormData({...newRegFormData, address: e.target.value})}
                       className="w-full bg-white border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right resize-none"
                       placeholder="وصف دقيق لمكان السكن"
                     />
                  </div>
                </div>

                {/* Status Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <button 
                    type="button"
                    onClick={() => setNewRegFormData({...newRegFormData, isFilesRegistered: !newRegFormData.isFilesRegistered})}
                    className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${newRegFormData.isFilesRegistered ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border-stone-100 text-stone-400'}`}
                  >
                    {newRegFormData.isFilesRegistered ? <FileCheck className="w-8 h-8" /> : <Loader2 className="w-8 h-8 text-stone-200" />}
                    <span className="font-black text-sm">تم تسجيل الملفات</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewRegFormData({...newRegFormData, isFormDone: !newRegFormData.isFormDone})}
                    className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${newRegFormData.isFormDone ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border-stone-100 text-stone-400'}`}
                  >
                    {newRegFormData.isFormDone ? <ClipboardList className="w-8 h-8" /> : <Loader2 className="w-8 h-8 text-stone-200" />}
                    <span className="font-black text-sm">تم عمل استمارة البحث</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewRegFormData({...newRegFormData, isSent: !newRegFormData.isSent})}
                    className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${newRegFormData.isSent ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border-stone-100 text-stone-400'}`}
                  >
                    {newRegFormData.isSent ? <ArrowRightLeft className="w-8 h-8" /> : <Loader2 className="w-8 h-8 text-stone-200" />}
                    <span className="font-black text-sm">تم الإرسال للهيئة</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Missing Files Checklist */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-md font-black text-emerald-900 border-r-4 border-rose-500 pr-3">الملفات الناقصة</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-rose-50/50 p-4 rounded-3xl border border-rose-100">
                       {MISSING_DOCS_OPTIONS.map(opt => (
                         <button
                           key={opt}
                           type="button"
                           onClick={() => toggleMissingFile(opt)}
                           className={`px-3 py-2 rounded-xl text-xs font-bold text-right flex items-center justify-between gap-2 border transition-all ${newRegFormData.missingFiles.includes(opt) ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-stone-500 border-stone-200 hover:border-rose-300'}`}
                         >
                           <span>{opt}</span>
                           {newRegFormData.missingFiles.includes(opt) && <X className="w-3 h-3" />}
                         </button>
                       ))}
                    </div>
                  </div>

                  {/* Sending Authority */}
                  <div className="space-y-4">
                    <h3 className="text-md font-black text-emerald-900 border-r-4 border-blue-500 pr-3">الهيئة المرسل إليها</h3>
                    <div className="flex flex-col gap-3">
                       {SENDING_AUTHORITIES.map(opt => (
                         <button
                           key={opt}
                           type="button"
                           onClick={() => setNewRegFormData({...newRegFormData, sendingAuthority: opt})}
                           className={`p-4 rounded-2xl flex items-center justify-between border transition-all ${newRegFormData.sendingAuthority === opt ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-stone-500 border-stone-200'}`}
                         >
                            <span className="font-black">{opt}</span>
                            {newRegFormData.sendingAuthority === opt && <CheckCircle2 className="w-5 h-5" />}
                         </button>
                       ))}
                    </div>
                  </div>

                  {/* Notes Field */}
                  <div className="space-y-4 col-span-1 sm:col-span-2">
                    <h3 className="text-md font-black text-emerald-950 border-r-4 border-amber-500 pr-3">الملاحظات</h3>
                    <textarea
                      value={newRegFormData.notes || ''}
                      onChange={(e) => setNewRegFormData({ ...newRegFormData, notes: e.target.value })}
                      className="w-full h-24 p-4 rounded-2xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-stone-50/50 resize-y text-sm text-stone-700 placeholder-stone-400 font-bold"
                      placeholder="أدخل أي ملاحظات إضافية بخصوص هذه الحالة هنا..."
                    />
                  </div>
                </div>

                <div className="pt-8 flex items-center gap-4">
                   <button type="submit" className="flex-grow bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3">
                     <Save className="w-6 h-6" />
                     <span>{editingNewReg ? 'تحديث البيانات' : 'حفظ وتسجيل الحالة'}</span>
                   </button>
                   <button 
                    type="button" 
                    onClick={() => { setShowNewRegForm(false); setEditingNewReg(null); setNewRegFormData(initialNewRegistrationForm); }} 
                    className="px-10 py-5 text-rose-500 font-bold hover:bg-rose-50 rounded-[2rem] transition-all"
                  >
                    إلغاء
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Periodic Research Modal */}
      <AnimatePresence>
        {showPeriodicResearch && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10 font-sans">
                <button onClick={() => setShowPeriodicResearch(null)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all font-sans">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950 font-sans">البحث الدوري للحالة</h2>
                  <p className="text-stone-400 font-bold font-sans">{showPeriodicResearch.orphanName}</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-2xl">
                   <button 
                    onClick={handleToggleAddResearch}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2"
                   >
                     {showAddResearch ? 'إلغاء' : 'إضافة تحديث جديد'}
                   </button>
                   <p className="text-emerald-900 font-black">{editingResearch ? `تعديل البحث رقم: ${editingResearch.researchNumber || 'الحالي'}` : 'سجل التحديثات الدورية'}</p>
                </div>

                {showAddResearch && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="bg-stone-50 p-6 rounded-3xl border-2 border-dashed border-emerald-200 space-y-6"
                  >
                    {/* Per-orphan selector + school grade */}
                    <div className="bg-amber-50/60 border-2 border-amber-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-black text-amber-700 pr-2">يخص اليتيم *</label>
                        <select
                          value={researchForm.targetOrphanIndex}
                          onChange={(e) => setResearchForm({ ...researchForm, targetOrphanIndex: parseInt(e.target.value) || 0 })}
                          className="w-full p-4 rounded-xl border border-amber-200 outline-none font-bold text-right bg-white"
                        >
                          {(showPeriodicResearch?.orphans || []).map((ch, idx) => (
                            <option key={idx} value={idx}>{ch.name || `يتيم ${idx + 1}`}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2 text-right">
                         <label className="text-xs font-black text-amber-700 pr-2">المرحلة الدراسية</label>
                         <select 
                           value={researchForm.targetSchoolStage}
                           onChange={(e) => setResearchForm({...researchForm, targetSchoolStage: e.target.value})}
                           className="w-full p-4 rounded-xl border border-amber-200 outline-none font-bold text-right bg-white"
                         >
                           <option value="">اختار المرحلة</option>
                           {SCHOOL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                         </select>
                      </div>
                      <div className="space-y-2 text-right">
                         <label className="text-xs font-black text-amber-700 pr-2">الصف الدراسي</label>
                         <select 
                           value={researchForm.targetSchoolGrade}
                           onChange={(e) => setResearchForm({...researchForm, targetSchoolGrade: e.target.value})}
                           className="w-full p-4 rounded-xl border border-amber-200 outline-none font-bold text-right bg-white"
                         >
                           <option value="">اختر الصف</option>
                           {(GRADE_MAPPING[researchForm.targetSchoolStage] || []).map(grade => (
                             <option key={grade} value={grade}>{grade}</option>
                           ))}
                         </select>
                      </div>
                    </div>

                    {/* Basic Meta Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">رقم البحث</label>
                        <input 
                          type="text"
                          value={researchForm.researchNumber}
                          onChange={(e) => setResearchForm({...researchForm, researchNumber: e.target.value})}
                          className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-right"
                          placeholder="مثال: 123/2024"
                        />
                      </div>
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">تاريخ البحث</label>
                        <input 
                          type="date"
                          value={researchForm.researchDate}
                          onChange={(e) => setResearchForm({...researchForm, researchDate: e.target.value})}
                          className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-center font-sans"
                        />
                      </div>
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">هل الحالة على قيد الحياة؟</label>
                        <button 
                          onClick={() => setResearchForm({...researchForm, isAlive: !researchForm.isAlive})}
                          className={`w-full p-4 rounded-xl border-2 transition-all font-black flex items-center justify-center gap-2 ${researchForm.isAlive ? 'border-emerald-500 bg-white text-emerald-600' : 'border-rose-500 bg-rose-50 text-rose-600'}`}
                        >
                          {researchForm.isAlive ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
                          <span>{researchForm.isAlive ? 'نعم، على قيد الحياة' : 'لا (متوفى)'}</span>
                        </button>
                      </div>
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">تغير في الحالة؟</label>
                        <select 
                          className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-right"
                          value={researchForm.hasChanged ? 'yes' : 'no'}
                          onChange={(e) => setResearchForm({...researchForm, hasChanged: e.target.value === 'yes'})}
                        >
                          <option value="no">لا يوجد تغيير</option>
                          <option value="yes">نعم، حدث تغيير</option>
                        </select>
                      </div>
                    </div>

                    {/* Housing Info */}
                    <div className="p-6 bg-white rounded-2xl border border-stone-100 space-y-4">
                       <h4 className="text-sm font-black text-blue-900 border-r-4 border-blue-500 pr-2">بيانات السكن</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="flex bg-stone-50 p-1 rounded-xl gap-1">
                            <button 
                              onClick={() => setResearchForm({...researchForm, housingType: 'rent'})}
                              className={`flex-grow py-3 rounded-lg font-bold transition-all ${researchForm.housingType === 'rent' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-400'}`}
                            >إيجار</button>
                            <button 
                              onClick={() => setResearchForm({...researchForm, housingType: 'owned'})}
                              className={`flex-grow py-3 rounded-lg font-bold transition-all ${researchForm.housingType === 'owned' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-400'}`}
                            >ملك / سكن</button>
                         </div>
                         {researchForm.housingType === 'rent' && (
                           <div className="space-y-1 animate-in zoom-in-95 duration-200">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">قيمة الإيجار الشهري</label>
                             <input 
                               type="number" className="w-full p-4 rounded-xl border-2 border-blue-50 outline-none font-bold text-center text-blue-600 text-lg"
                               value={researchForm.rentAmount}
                               onChange={(e) => setResearchForm({...researchForm, rentAmount: Number(e.target.value)})}
                             />
                           </div>
                         )}
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h4 className="text-sm font-black text-emerald-900 border-r-4 border-emerald-500 pr-2">المصاريف الشهرية</h4>
                       <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">دراسة</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.expenses.school}
                               onChange={(e) => setResearchForm({...researchForm, expenses: {...researchForm.expenses, school: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">معيشة</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.expenses.living}
                               onChange={(e) => setResearchForm({...researchForm, expenses: {...researchForm.expenses, living: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">أخرى</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.expenses.other}
                               onChange={(e) => setResearchForm({...researchForm, expenses: {...researchForm.expenses, other: Number(e.target.value)}})}
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h4 className="text-sm font-black text-amber-900 border-r-4 border-amber-500 pr-2">مصادر الدخل الشهري</h4>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">معاش</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.pension}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, pension: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">تأمين</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.insurance}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, insurance: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">راتب</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.salary}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, salary: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">أخرى</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.other}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, other: Number(e.target.value)}})}
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">ملاحظات البحث</label>
                       <textarea 
                        className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-right min-h-[100px]"
                        value={researchForm.notes}
                        onChange={(e) => setResearchForm({...researchForm, notes: e.target.value})}
                       />
                    </div>

                    {/* مرفقات البحث الدوري المطلوبة */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-black text-emerald-800 flex items-center gap-2 justify-end border-r-4 border-emerald-500 pr-2">
                        <span>مرفقات البحث الدوري المطلوبة</span>
                        <UploadCloud className="w-5 h-5 animate-bounce" />
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-right">
                         {PERIODIC_RESEARCH_DOCS.map((docName) => (
                           <FileUploadSlot 
                             key={docName}
                             label={docName}
                             caseName={`${researchForm.targetOrphanName || showPeriodicResearch.orphanName || 'يتيم'}_${docName}`}
                             storagePath={`periodic_research/${showPeriodicResearch.id}/${docName}`}
                             values={researchForm.docFiles?.[docName] || []}
                             onUpload={(updater) => {
                               setResearchForm(prev => {
                                 const currentFiles = prev.docFiles?.[docName] || [];
                                 const newFiles = typeof updater === 'function' ? updater(currentFiles) : updater;
                                 return {
                                   ...prev,
                                   docFiles: {
                                     ...(prev.docFiles || {}),
                                     [docName]: newFiles
                                   }
                                 };
                               });
                             }}
                           />
                         ))}
                      </div>
                    </div>

                    <button 
                      onClick={handleAddResearch}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-emerald-100"
                    >
                      حفظ البحث الدوري
                    </button>
                  </motion.div>
                )}

                <div className="space-y-4">
                   {researchList.map((res) => (
                     <div key={res.id} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm text-right space-y-4">
                        <div className="flex justify-between items-center border-b border-stone-50 pb-3">
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => {
                                  setConfirmConfig({
                                    isOpen: true,
                                    title: 'حذف البحث الدوري',
                                    message: 'هل أنت متأكد من حذف هذا البحث الدوري للأيتام نهائياً؟',
                                    onConfirm: async () => {
                                      try {
                                        await deleteDoc(doc(db, 'orphans', showPeriodicResearch.id, 'periodic_research', res.id));
                                        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                                        alert('تم حذف البحث الدوري بنجاح');
                                      } catch (err) {
                                        alert('فشل في حذف البحث الدوري');
                                      }
                                    }
                                  });
                                }}
                                className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleEditResearch(res)}
                                className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="تعديل"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => printSingleResearch(res, showPeriodicResearch)}
                                className="p-2 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="طباعة"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setViewingResearch(res)}
                                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-all"
                                title="معاينة"
                              >
                                <Search className="w-4 h-4" />
                              </button>
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-black mr-2 ${res.hasChanged ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {res.hasChanged ? 'حدث تغيير' : 'مستقرة'}
                              </span>
                             {res.isAlive === false && (
                               <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-rose-100 text-rose-600">
                                 الحالة متوفية
                               </span>
                             )}
                           </div>
                           <div className="text-left">
                             <p className="text-[10px] font-bold text-emerald-600">{res.researchNumber ? `بحث رقم: ${res.researchNumber}` : 'بدون رقم بحث'}</p>
                             <span className="text-xs font-bold text-stone-400 font-sans">
                               {res.researchDate 
                                 ? new Date(res.researchDate).toLocaleDateString('ar-EG')
                                 : res.createdAt?.toDate() 
                                   ? new Date(res.createdAt.toDate()).toLocaleDateString('ar-EG') 
                                   : res.date?.toDate() 
                                     ? new Date(res.date.toDate()).toLocaleDateString('ar-EG') 
                                     : 'تاريخ غير متوفر'}
                             </span>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                           <div className="space-y-2">
                              <p className="text-[10px] font-black text-rose-600">إجمالي المصاريف</p>
                              <p className="font-black text-emerald-950 text-xl tabular-nums">{(Object.values(res.expenses) as number[]).reduce((a, b) => a + b, 0) + (res.rentAmount || 0)} ج.م</p>
                              <div className="flex gap-2 text-[8px] font-bold text-stone-400">
                                 <span>دراسة: {res.expenses.school}</span>
                                 <span>معيشة: {res.expenses.living}</span>
                                 {res.rentAmount! > 0 && <span>إيجار: {res.rentAmount}</span>}
                              </div>
                           </div>
                           <div className="space-y-2">
                              <p className="text-[10px] font-black text-emerald-600">إجمالي الدخل</p>
                              <p className="font-black text-emerald-950 text-xl tabular-nums">{(Object.values(res.income) as number[]).reduce((a, b) => a + b, 0)} ج.م</p>
                              <div className="flex gap-2 text-[8px] font-bold text-stone-400">
                                 <span>معاش: {res.income.pension}</span>
                                 <span>راتب: {res.income.salary}</span>
                              </div>
                           </div>
                           <div className="space-y-2">
                              <p className="text-[10px] font-black text-blue-600">بيانات السكن</p>
                              <p className="font-black text-emerald-950 text-lg">
                                {res.housingType === 'rent' ? 'إيجار' : 'ملك / سكن'}
                              </p>
                              {res.rentAmount! > 0 && <span className="text-[10px] font-bold text-stone-400">قيمة الإيجار: {res.rentAmount} ج.م</span>}
                           </div>
                        </div>
                        {res.notes && (
                          <p className="text-xs text-stone-500 bg-stone-50 p-3 rounded-xl border border-stone-100 font-medium">
                            {res.notes}
                          </p>
                        )}
                        {res.docFiles && Object.keys(res.docFiles).some(k => (res.docFiles?.[k] || []).length > 0) && (
                          <div className="flex flex-wrap gap-2 pt-2 justify-end">
                            {Object.entries(res.docFiles).map(([docName, files]) => {
                              if (!files || files.length === 0) return null;
                              return (
                                <span key={docName} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-lg border border-emerald-100">
                                  <FileCheck className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>{docName} ({files.length})</span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                     </div>
                   ))}
                   {researchList.length === 0 && !showAddResearch && (
                     <div className="py-20 text-center text-stone-400 font-bold">
                        لا توجد أبحاث دورية مسجلة لهذه الحالة بعد
                     </div>
                   )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Viewing Research Modal (Preview) */}
      <AnimatePresence>
        {viewingResearch && (
          <div className="fixed inset-0 bg-emerald-950/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden text-right"
            >
              <div className="bg-emerald-600 p-6 text-white flex justify-between items-center">
                 <button onClick={() => setViewingResearch(null)} className="p-2 hover:bg-emerald-700 rounded-lg"><X /></button>
                 <h3 className="text-xl font-black">معاينة تفاصيل البحث الدوري</h3>
              </div>
              
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-6 text-right">
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">رقم البحث</p>
                    <p className="font-black text-emerald-900">{viewingResearch.researchNumber || 'غير مسجل'}</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">تاريخ البحث</p>
                    <p className="font-black text-emerald-900 font-sans">{viewingResearch.researchDate || 'غير مسجل'}</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">حالة الحياة</p>
                    <p className="font-black text-emerald-900">{viewingResearch.isAlive ? 'على قيد الحياة' : 'متوفى'}</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">نوع السكن</p>
                    <p className="font-black text-emerald-900">
                      {viewingResearch.housingType === 'rent' ? `إيجار (${viewingResearch.rentAmount} ج.م)` : 'ملك / سكن'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-black text-emerald-800 border-r-4 border-emerald-500 pr-2">المصاريف والدخل</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-emerald-100 p-4 rounded-xl">
                      <p className="text-xs font-bold text-emerald-600 mb-2">إجمالي المصروفات</p>
                      <p className="text-2xl font-black tabular-nums">
                        {Object.values(viewingResearch.expenses).reduce((a, b) => (a as number) + (b as number), 0) + (viewingResearch.rentAmount || 0)} ج.م
                      </p>
                    </div>
                    <div className="border border-amber-100 p-4 rounded-xl">
                      <p className="text-xs font-bold text-amber-600 mb-2">إجمالي الدخل</p>
                      <p className="text-2xl font-black tabular-nums">
                        {Object.values(viewingResearch.income).reduce((a, b) => (a as number) + (b as number), 0)} ج.م
                      </p>
                    </div>
                  </div>
                </div>

                {viewingResearch.notes && (
                  <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
                    <p className="text-xs font-black text-stone-400 mb-2">ملاحظات البحث</p>
                    <p className="font-bold text-stone-700 leading-relaxed">"{viewingResearch.notes}"</p>
                  </div>
                )}

                {/* مرفقات البحث الدوري في المعاينة */}
                {viewingResearch.docFiles && Object.keys(viewingResearch.docFiles).some(k => (viewingResearch.docFiles?.[k] || []).length > 0) && (
                  <div className="space-y-4">
                    <h4 className="font-black text-emerald-800 border-r-4 border-emerald-500 pr-2">مرفقات البحث الدوري</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.entries(viewingResearch.docFiles).map(([docName, files]) => {
                        if (!files || files.length === 0) return null;
                        return (
                          <div key={docName} className="border border-stone-100 p-4 rounded-xl bg-stone-50 text-right">
                            <p className="text-xs font-bold text-stone-500 mb-2">{docName}</p>
                            <div className="flex flex-wrap gap-2 justify-end">
                              {files.map((file, idx) => (
                                <a
                                  key={idx}
                                  href={file.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 bg-white border border-emerald-100 hover:border-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-600 hover:text-emerald-700 transition"
                                >
                                  <FileCheck className="w-4 h-4 text-emerald-500" />
                                  <span className="truncate max-w-[120px]">{file.name}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-4">
                 <button 
                  onClick={() => {
                    if (showPeriodicResearch) printSingleResearch(viewingResearch, showPeriodicResearch);
                  }}
                  className="flex-grow bg-emerald-600 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2"
                 >
                   <Printer className="w-5 h-5" />
                   <span>طباعة التقرير</span>
                 </button>
                 <button 
                  onClick={() => setViewingResearch(null)}
                  className="px-8 bg-white border border-stone-200 text-stone-500 py-3 rounded-xl font-bold"
                 >إغلاق</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmSave && (
          <div className="fixed inset-0 bg-emerald-950/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-black text-emerald-950 mb-3">تأكيد الحفظ</h3>
              {orphanDupWarnings && orphanDupWarnings.length > 0 ? (
                <div className="mb-6 p-4 text-rose-600 bg-rose-50 border border-rose-100 rounded-2xl text-right text-xs leading-relaxed font-bold">
                  <div className="font-extrabold flex items-center gap-1.5 justify-end mb-2 text-[13px] text-rose-700">
                    <span>تنبيه: تم العثور على تكرار!</span>
                    <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce" />
                  </div>
                  <ul className="list-disc pr-4 space-y-1">
                    {orphanDupWarnings.map((w, index) => <li key={index}>{w}</li>)}
                  </ul>
                  <div className="mt-4 font-black text-center text-stone-700">هل تريد الاستمرار وحفظ اليتيم على أي حال؟</div>
                </div>
              ) : (
                <p className="text-stone-500 font-bold mb-8">هل أنت متأكد من رغبتك في حفظ بيانات هذه الحالة في الكشف؟</p>
              )}
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleConfirmSave}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  نعم، تأكيد الحفظ
                </button>
                <button 
                  onClick={() => setShowConfirmSave(false)}
                  className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  لا، مراجعة البيانات
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Single Confirmation */}
      <AnimatePresence>
        {showConfirmDelete && (
          <div className="fixed inset-0 bg-rose-950/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center"
            >
              <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-rose-600" />
              </div>
              <h3 className="text-2xl font-black text-stone-900 mb-3">حذف الحالة</h3>
              <p className="text-stone-500 font-bold mb-8">هل أنت متأكد من حذف هذه الحالة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDelete}
                  className="w-full bg-rose-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                >
                  نعم، احذف نهائياً
                </button>
                <button 
                  onClick={() => setShowConfirmDelete(null)}
                  className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete All Confirmation */}
      <AnimatePresence>
        {showConfirmDeleteAll && (
          <div className="fixed inset-0 bg-rose-950/60 backdrop-blur-lg z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-md w-full text-center"
            >
              <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-12 h-12 text-rose-600" />
              </div>
              <h3 className="text-3xl font-black text-rose-950 mb-3">حذف الكشف بالكامل!</h3>
              <p className="text-stone-500 font-bold mb-8 text-lg">
                أنت على وشك مسح <span className="text-rose-600">{orphans.length}</span> حالة من الكشف.
                <br />
                هل أنت متأكد تماماً من هذا القرار؟
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDeleteAll}
                  className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-rose-700 transition-all shadow-xl shadow-rose-200"
                >
                  نعم، امسح كل الحالات
                </button>
                <button 
                  onClick={() => setShowConfirmDeleteAll(false)}
                  className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  تراجع، لا تحذف
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Preferences Modal specifically for New Registrations */}
      <AnimatePresence>
        {showNewRegPrintModal && (
          <div className="fixed inset-0 bg-emerald-950/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-2xl w-full text-right"
            >
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-emerald-50">
                <button 
                  onClick={() => setShowNewRegPrintModal(false)}
                  className="p-2 hover:bg-stone-100 rounded-xl text-stone-400 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-black text-emerald-950">إعدادات طباعة كشف الحالات الجديدة</h3>
              </div>

              <div className="mb-6 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 text-sm">
                <p className="font-bold text-emerald-800">
                  ⚠️ سيتم طباعة <span className="font-black text-emerald-950">{selectedNewRegIds.length > 0 ? selectedNewRegIds.length : filteredNewRegistrations.length}</span> حالة جديدة.
                </p>
                {selectedNewRegIds.length > 0 ? (
                  <p className="text-xs text-emerald-600 mt-1">طباعة الحالات التي قمت بتحديدها يدويًا من الجدول.</p>
                ) : (
                  <p className="text-xs text-emerald-600 mt-1">طباعة كافة الحالات الظاهرة حاليًا بناءً على الفلاتر النشطة.</p>
                )}
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-400">اختر الأعمدة/الخانات التي ترغب بظهورها في الكشف المطبوع:</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setPrintColumns(Object.keys(printColumns).reduce((acc, k) => ({ ...acc, [k]: true }), {}))}
                      className="text-[10px] font-black text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded"
                    >
                      تحديد الكل
                    </button>
                    <button 
                      onClick={() => setPrintColumns(Object.keys(printColumns).reduce((acc, k) => ({ ...acc, [k]: k === 'index' }), {}))}
                      className="text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[250px] overflow-y-auto p-2 border border-stone-100 rounded-2xl custom-scrollbar bg-stone-50/30">
                  {ALL_PRINT_COLUMNS.map(col => (
                    <label 
                      key={col.key} 
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${printColumns[col.key] ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold' : 'bg-white border-stone-100 text-stone-500'}`}
                    >
                      <input 
                        type="checkbox"
                        checked={!!printColumns[col.key]}
                        onChange={(e) => setPrintColumns(prev => ({ ...prev, [col.key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        disabled={col.key === 'index'}
                      />
                      <span className="text-xs select-none">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={printNewRegSelected}
                  className="flex-grow bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200/50 flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  <span>بدء الطباعة الآن</span>
                </button>
                <button 
                  onClick={() => setShowNewRegPrintModal(false)}
                  className="px-6 py-4 bg-stone-100 text-stone-500 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Excel Custom Mapping Modal */}
      <AnimatePresence>
        {excelImportData && (
          <div className="fixed inset-0 bg-emerald-950/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-4xl w-full text-right flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-emerald-50 shrink-0">
                <button 
                  onClick={() => setExcelImportData(null)}
                  className="p-2 hover:bg-stone-100 rounded-xl text-stone-400 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
                <div>
                  <h3 className="text-2xl font-black text-emerald-950">إعدادات استيراد مطابقة كشف الإكسل</h3>
                  <p className="text-xs text-stone-400 font-bold mt-1">يرجى مطابقة أعمدة ملف الإكسل بالخانات المتوفرة بقاعدة البيانات لدينا وتخصيص الخيارات الموحدة</p>
                </div>
              </div>

              <div className="overflow-y-auto py-2 px-1 flex-grow space-y-6 text-sm custom-scrollbar">
                
                {/* Section 1: Standard Fields */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-emerald-900 border-r-4 border-emerald-500 pr-2 pb-0.5">مطابقة بيانات المعيل واليتيم والقيم الأساسية</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-50/50 p-5 rounded-3xl border border-stone-100">
                    
                    {/* Guardian Name */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">اسم الأم / المعيل <span className="text-rose-500">*</span></label>
                      <select 
                        value={excelMapping.guardianName}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, guardianName: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- اختر عمود الإكسل --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Orphan Name */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">اسم اليتيم <span className="text-rose-500">*</span></label>
                      <select 
                        value={excelMapping.orphanName}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, orphanName: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- اختر عمود الإكسل --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Guardian ID */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">الرقم القومي للمعيل</label>
                      <select 
                        value={excelMapping.guardianId}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, guardianId: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / لا يوجد --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Orphan ID */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">الرقم القومي لليتيم</label>
                      <select 
                        value={excelMapping.orphanId}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, orphanId: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / لا يوجد --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Phone 1 */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">رقم الهاتف 1</label>
                      <select 
                        value={excelMapping.phone1}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, phone1: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / لا يوجد --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Phone 2 */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">رقم الهاتف 2</label>
                      <select 
                        value={excelMapping.phone2}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, phone2: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / لا يوجد --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Markaz */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">المركز</label>
                      <select 
                        value={excelMapping.markaz}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, markaz: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / "نبروه" افتراضياً --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Village */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-stone-600 block">القرية</label>
                      <select 
                        value={excelMapping.village}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, village: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / لا يوجد --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Address */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-stone-600 block">العنوان بالتفصيل</label>
                      <select 
                        value={excelMapping.address}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / لا يوجد --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Missing files */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-stone-600 block">الملفات الناقصة (النواقص)</label>
                      <select 
                        value={excelMapping.missingFiles}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, missingFiles: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / "لا يوجد" افتراضياً --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Notes Field mapping */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-stone-600 block">الملاحظات</label>
                      <select 
                        value={excelMapping.notes}
                        onChange={(e) => setExcelMapping(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- تجاهل / فارغ --</option>
                        {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                  </div>
                </div>

                {/* Section 1.5: Excel Columns Selection Checklist */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-emerald-900 border-r-4 border-emerald-500 pr-2 pb-0.5">اختيار الأعمدة الإضافية للحالات (الاستيراد للملاحظات)</h4>
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={() => setSelectedExtraColumns(excelImportData.headers)} 
                        className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black transition-all border border-emerald-200"
                      >
                        تحديد الكل
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setSelectedExtraColumns([])} 
                        className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl text-[10px] font-black transition-all border border-stone-200"
                      >
                        إلغاء تحديد الكل
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 font-bold leading-relaxed">
                    يرجى اختيار جميع الأعمدة التي تريد استيرادها وحفظ قيمها مع الحالة. أي عمود محدد سيتم حفظ بياناته تلقائياً وتضمينه في خانة "الملاحظات" لليتيم (الأعمدة غير المحددة سيتم تجاهل بياناتها).
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 bg-stone-50/50 p-5 rounded-3xl border border-stone-100 max-h-48 overflow-y-auto custom-scrollbar">
                    {excelImportData.headers.map(h => {
                      const isChecked = selectedExtraColumns.includes(h);
                      return (
                        <label 
                          key={h} 
                          className={`flex items-start gap-2 p-2.5 rounded-xl border text-right cursor-pointer select-none transition-all ${
                            isChecked 
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-black shadow-sm' 
                              : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50 font-bold'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedExtraColumns(prev => [...prev, h]);
                              } else {
                                setSelectedExtraColumns(prev => prev.filter(x => x !== h));
                              }
                            }}
                            className="mt-0.5 accent-emerald-600 rounded"
                          />
                          <span className="text-[11px] break-all leading-snug">{h}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Date & Sending Authority Mapping (Unified or Column Extract) */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-emerald-900 border-r-4 border-blue-500 pr-2 pb-0.5">خيارات استيراد التاريخ والهيئة المرسل إليها</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/20 p-5 rounded-3xl border border-blue-100/50">
                    
                    {/* Date Type Select */}
                    <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-100">
                      <span className="text-xs font-black text-stone-700 block">تاريخ تسجيل الحالة</span>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setExcelMapping(prev => ({ ...prev, dateType: 'file' }))}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all border ${excelMapping.dateType === 'file' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'}`}
                        >
                          استخراج من الملف
                        </button>
                        <button 
                          type="button"
                          onClick={() => setExcelMapping(prev => ({ ...prev, dateType: 'uniform' }))}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all border ${excelMapping.dateType === 'uniform' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'}`}
                        >
                          تاريخ موحد للكل
                        </button>
                      </div>

                      {excelMapping.dateType === 'file' ? (
                        <div className="space-y-1 animate-in fade-in duration-300">
                          <label className="text-[10px] font-bold text-stone-400">حدد عمود تاريخ التسجيل بالكشف:</label>
                          <select 
                            value={excelMapping.fileDateColumn}
                            onChange={(e) => setExcelMapping(prev => ({ ...prev, fileDateColumn: e.target.value }))}
                            className="w-full p-2.5 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- اختر عمود التاريخ --</option>
                            {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1 animate-in fade-in duration-300">
                          <label className="text-[10px] font-bold text-stone-400">أدخل التاريخ الموحد لجميع الحالات:</label>
                          <input 
                            type="date"
                            value={excelMapping.uniformDate}
                            onChange={(e) => setExcelMapping(prev => ({ ...prev, uniformDate: e.target.value }))}
                            className="w-full p-2.5 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>

                    {/* Sending Authority Select */}
                    <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-100">
                      <span className="text-xs font-black text-stone-700 block">الهيئة المرسل إليها</span>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setExcelMapping(prev => ({ ...prev, sendingAuthType: 'file' }))}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all border ${excelMapping.sendingAuthType === 'file' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'}`}
                        >
                          استخراج من الملف
                        </button>
                        <button 
                          type="button"
                          onClick={() => setExcelMapping(prev => ({ ...prev, sendingAuthType: 'uniform' }))}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all border ${excelMapping.sendingAuthType === 'uniform' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'}`}
                        >
                          هيئة موحدة للكل
                        </button>
                      </div>

                      {excelMapping.sendingAuthType === 'file' ? (
                        <div className="space-y-1 animate-in fade-in duration-300">
                          <label className="text-[10px] font-bold text-stone-400">حدد عمود الهيئة بالكشف:</label>
                          <select 
                            value={excelMapping.fileSendingAuthColumn}
                            onChange={(e) => setExcelMapping(prev => ({ ...prev, fileSendingAuthColumn: e.target.value }))}
                            className="w-full p-2.5 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- اختر عمود الهيئة --</option>
                            {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1 animate-in fade-in duration-300">
                          <label className="text-[10px] font-bold text-stone-400">اختر الهيئة الموحدة لجميع الحالات:</label>
                          <select 
                            value={excelMapping.uniformSendingAuth}
                            onChange={(e) => setExcelMapping(prev => ({ ...prev, uniformSendingAuth: e.target.value }))}
                            className="w-full p-2.5 rounded-xl border border-stone-200 bg-white font-bold text-stone-700 text-xs focus:ring-2 focus:ring-blue-500"
                          >
                            {SENDING_AUTHORITIES.map(auth => <option key={auth} value={auth}>{auth}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Section 3: Checkboxes (Status Flags) */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-emerald-900 border-r-4 border-amber-500 pr-2 pb-0.5">خيارات استيراد ملفات واستمارات البحث الموحدة</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50/10 p-5 rounded-3xl border border-amber-100/50">
                    
                    {/* isFilesRegistered Box */}
                    <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-stone-700 block">تم تسجيل الملفات</span>
                        <div className="flex gap-1.5 mt-2">
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, isFilesType: 'file' }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all border ${excelMapping.isFilesType === 'file' ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-500 border-stone-200'}`}
                          >
                            استخراج
                          </button>
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, isFilesType: 'uniform' }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all border ${excelMapping.isFilesType === 'uniform' ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-500 border-stone-200'}`}
                          >
                            موحد
                          </button>
                        </div>
                      </div>

                      {excelMapping.isFilesType === 'file' ? (
                        <div className="mt-2 animate-in fade-in duration-300">
                          <select 
                            value={excelMapping.fileIsFilesColumn}
                            onChange={(e) => setExcelMapping(prev => ({ ...prev, fileIsFilesColumn: e.target.value }))}
                            className="w-full p-2 rounded-lg border border-stone-200 bg-white font-bold text-stone-700 text-[10px]"
                          >
                            <option value="">-- عمود الملفات --</option>
                            {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-1.5 animate-in fade-in duration-300">
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, uniformIsFiles: true }))}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border ${excelMapping.uniformIsFiles ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-stone-50 text-stone-400 border-stone-200'}`}
                          >
                            نعم
                          </button>
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, uniformIsFiles: false }))}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border ${!excelMapping.uniformIsFiles ? 'bg-rose-500 text-white border-rose-500' : 'bg-stone-50 text-stone-400 border-stone-200'}`}
                          >
                            لا
                          </button>
                        </div>
                      )}
                    </div>

                    {/* isFormDone Box */}
                    <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-stone-700 block">تم عمل استمارة البحث</span>
                        <div className="flex gap-1.5 mt-2">
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, isFormType: 'file' }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all border ${excelMapping.isFormType === 'file' ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-500 border-stone-200'}`}
                          >
                            استخراج
                          </button>
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, isFormType: 'uniform' }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all border ${excelMapping.isFormType === 'uniform' ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-500 border-stone-200'}`}
                          >
                            موحد
                          </button>
                        </div>
                      </div>

                      {excelMapping.isFormType === 'file' ? (
                        <div className="mt-2 animate-in fade-in duration-300">
                          <select 
                            value={excelMapping.fileIsFormColumn}
                            onChange={(e) => setExcelMapping(prev => ({ ...prev, fileIsFormColumn: e.target.value }))}
                            className="w-full p-2 rounded-lg border border-stone-200 bg-white font-bold text-stone-700 text-[10px]"
                          >
                            <option value="">-- عمود الاستمارة --</option>
                            {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-1.5 animate-in fade-in duration-300">
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, uniformIsForm: true }))}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border ${excelMapping.uniformIsForm ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-stone-50 text-stone-400 border-stone-200'}`}
                          >
                            نعم
                          </button>
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, uniformIsForm: false }))}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border ${!excelMapping.uniformIsForm ? 'bg-rose-500 text-white border-rose-500' : 'bg-stone-50 text-stone-400 border-stone-200'}`}
                          >
                            لا
                          </button>
                        </div>
                      )}
                    </div>

                    {/* isSent Box */}
                    <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-stone-700 block">تم الإرسال للهيئة</span>
                        <div className="flex gap-1.5 mt-2">
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, isSentType: 'file' }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all border ${excelMapping.isSentType === 'file' ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-500 border-stone-200'}`}
                          >
                            استخراج
                          </button>
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, isSentType: 'uniform' }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all border ${excelMapping.isSentType === 'uniform' ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-500 border-stone-200'}`}
                          >
                            موحد
                          </button>
                        </div>
                      </div>

                      {excelMapping.isSentType === 'file' ? (
                        <div className="mt-2 animate-in fade-in duration-300">
                          <select 
                            value={excelMapping.fileIsSentColumn}
                            onChange={(e) => setExcelMapping(prev => ({ ...prev, fileIsSentColumn: e.target.value }))}
                            className="w-full p-2 rounded-lg border border-stone-200 bg-white font-bold text-stone-700 text-[10px]"
                          >
                            <option value="">-- عمود الإرسال --</option>
                            {excelImportData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-1.5 animate-in fade-in duration-300">
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, uniformIsSent: true }))}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border ${excelMapping.uniformIsSent ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-stone-50 text-stone-400 border-stone-200'}`}
                          >
                            نعم
                          </button>
                          <button 
                            type="button"
                            onClick={() => setExcelMapping(prev => ({ ...prev, uniformIsSent: false }))}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border ${!excelMapping.uniformIsSent ? 'bg-rose-500 text-white border-rose-500' : 'bg-stone-50 text-stone-400 border-stone-200'}`}
                          >
                            لا
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Row count summary banner */}
                <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-100 flex items-center justify-between font-black text-xs">
                  <span>📊 عدد الحالات المكتشفة بالملف للمطابقة:</span>
                  <span className="bg-emerald-200 text-emerald-950 px-3 py-1 rounded-lg text-sm">{excelImportData.rows.length} حالة</span>
                </div>

              </div>

              <div className="pt-4 border-t border-emerald-50 flex gap-3 shrink-0">
                <button 
                  onClick={executeExcelImport}
                  className="flex-grow bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200/50 flex items-center justify-center gap-2"
                >
                  <UploadCloud className="w-5 h-5" />
                  <span>استيراد كشف الحالات الآن</span>
                </button>
                <button 
                  onClick={() => setExcelImportData(null)}
                  className="px-6 py-4 bg-stone-100 text-stone-500 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  إلغاء الاستيراد
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unified N/C Case Modal */}
      {unifiedTransferCase && (
        <UnifiedTransferModal
          isOpen={!!unifiedTransferCase}
          onClose={() => setUnifiedTransferCase(null)}
          caseData={unifiedTransferCase}
          onSuccess={() => setUnifiedTransferCase(null)}
        />
      )}

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}