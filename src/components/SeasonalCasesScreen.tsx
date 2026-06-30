// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, MapPin, Phone, Trash2, Edit, X, Download, Filter, Calendar, Utensils, Gift, Box, Heart, Printer, CheckCircle2, ChevronDown, ListFilter, Users, ClipboardList, Info, ArrowRight, Save, Clock, Loader2, FileCheck, UploadCloud, RefreshCw, Copy, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmModal from './ConfirmModal';
import UnifiedTransferModal from './UnifiedTransferModal';
import { useRef } from 'react';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';
import { checkDuplicateCase } from '../lib/duplicateRegistry';

function FormField({ label, icon, placeholder, value, onChange, type = "text", required = false }: { 
  label: string; icon: React.ReactNode; placeholder: string; value: string; onChange: (val: string) => void; type?: string; required?: boolean 
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-bold text-emerald-800 px-1 text-right block">
        {label}
        {required && <span className="text-rose-500 mr-1 text-xs">*</span>}
      </label>
      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20 transition-all">
        {icon}
        <input 
          type={type}
          required={required}
          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none placeholder-emerald-300 font-bold text-right py-2"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

const ORGANIZATIONS = [
  'هيئة الاعمال الخيرية',
  'رابطة العالم الاسلامي',
  'مؤسسة مصر الخير',
  'بنك الطعام',
  'كرتونة/ شنطة الجمعية',
  'مؤسسة اكرام',
  'مؤسسة العناني',
  'شركة عمان',
  'آخر'
];

const DISTRIBUTION_TYPES = [
  'إطعام',
  'أضاحي',
  'شنط رمضان',
  'كراتين رمضان',
  'آخر'
];

const SOCIAL_STATUS_OPTIONS = [
  'أرملة',
  'متزوجة',
  'متزوج',
  'مطلقة',
  'مسن',
  'مسنة',
  'أسرة مريض',
  'مريضة',
  'أسرة فقيرة',
  'أخرى'
];

interface SeasonalDistribution {
  id: string;
  title: string;
  organization: string;
  otherOrgName?: string;
  distType: string;
  otherDistType?: string;
  date: string;
  notes: string;
  createdAt: any;
  beneficiaryCount?: number;
}

interface SeasonalBeneficiary {
  id: string;
  caseCode?: string;
  name: string;
  nationalId: string;
  phone: string;
  village: string;
  familyCount: number;
  address: string;
  quantity: number;
  collected: boolean;
  notes: string;
  socialStatus?: string;
  otherSocialStatus?: string;
  createdAt: any;
  distributionId: string;
}

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

interface SeasonalCase {
  id: string;
  name: string;
  [key: string]: any;
}

export default function SeasonalCasesScreen() {
  const [distributions, setDistributions] = useState<SeasonalDistribution[]>([]);
  const [activeDistId, setActiveDistId] = useState<string | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<SeasonalBeneficiary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);
  const [showDistForm, setShowDistForm] = useState(false);
  const [showBeneficiaryForm, setShowBeneficiaryForm] = useState(false);
  const [editingDist, setEditingDist] = useState<SeasonalDistribution | null>(null);
  const [editingBeneficiary, setEditingBeneficiary] = useState<SeasonalBeneficiary | null>(null);
  const [unifiedTransferCase, setUnifiedTransferCase] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterOrg, setFilterOrg] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Research State
  const [researchCase, setResearchCase] = useState<SeasonalCase | null>(null);
  const [showResearchModal, setShowResearchModal] = useState(false);
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

  const initialDistForm = {
    title: '',
    organization: ORGANIZATIONS[0],
    otherOrgName: '',
    distType: DISTRIBUTION_TYPES[0],
    otherDistType: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  };

  const initialBeneficiaryForm = {
    name: '',
    caseCode: '',
    nationalId: '',
    phone: '',
    village: '',
    address: '',
    familyCount: 1,
    quantity: 1,
    collected: false,
    notes: '',
    socialStatus: 'أخرى',
    otherSocialStatus: ''
  };

  const [distFormData, setDistFormData] = useState(initialDistForm);
  const [beneficiaryFormData, setBeneficiaryFormData] = useState({
    ...initialBeneficiaryForm,
    socialStatus: SOCIAL_STATUS_OPTIONS[0],
    otherSocialStatus: ''
  });

  const [beneficiarySort, setBeneficiarySort] = useState<{
    key: 'name' | 'nationalId' | 'socialStatus' | 'village' | 'caseCode';
    direction: 'asc' | 'desc';
  }>({
    key: 'name',
    direction: 'asc'
  });

  const [beneficiaryFilter, setBeneficiaryFilter] = useState({
    village: 'all',
    status: 'all',
    socialStatus: 'all'
  });

  const handleReorderCodes = async () => {
    if (!activeDistId || !filteredBeneficiaries.length) return;
    
    if (!confirm('هل أنت متأكد من إعادة ترقيم الحالات لتصبح مسلسلة من A1 فصاعداً حسب الترتيب الحالي للكشف؟')) return;

    try {
      setLoading(true);

      const batchLimit = 450;
      let currentBatch = writeBatch(db);
      let count = 0;
      let totalUpdated = 0;

      for (let i = 0; i < filteredBeneficiaries.length; i++) {
        const b = filteredBeneficiaries[i];
        const newCode = `A${i + 1}`;
        
        if (b.caseCode !== newCode) {
          const docRef = doc(db, 'seasonal_distributions', activeDistId, 'beneficiaries', b.id);
          currentBatch.update(docRef, {
            caseCode: newCode,
            updatedAt: serverTimestamp()
          });
          count++;
          totalUpdated++;

          if (count === batchLimit) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            count = 0;
          }
        }
      }

      if (count > 0) {
        await currentBatch.commit();
      }

      if (totalUpdated === 0) {
        alert('الأكواد مرتبة بالفعل');
      } else {
        alert(`تم إعادة ترقيم ${totalUpdated} حالة بنجاح من A1 إلى A${filteredBeneficiaries.length}`);
      }
    } catch (error) {
      console.error('Error reordering codes:', error);
      alert('حدث خطأ أثناء إعادة الترقيم');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllBeneficiaries = () => {
    if (!activeDistId || !beneficiaries.length) return;
    
    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع الحالات',
      message: `هل أنت متأكد من حذف جميع الحالات (${beneficiaries.length} حالة) من ملف التوزيع الحالي؟ لا يمكن التراجع عن هذا الإجراء.`,
      onConfirm: async () => {
        try {
          setLoading(true);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          
          const batchLimit = 450;
          let currentBatch = writeBatch(db);
          let count = 0;
          
          for (const b of beneficiaries) {
            currentBatch.delete(doc(db, 'seasonal_distributions', activeDistId, 'beneficiaries', b.id));
            count++;
            if (count === batchLimit) {
              await currentBatch.commit();
              currentBatch = writeBatch(db);
              count = 0;
            }
          }
          
          if (count > 0) {
            await currentBatch.commit();
          }
          
          await updateDoc(doc(db, 'seasonal_distributions', activeDistId), {
            beneficiaryCount: 0
          });
          
          alert('تم حذف جميع الحالات بنجاح');
        } catch (error) {
          console.error('Error deleting all beneficiaries:', error);
          alert('حدث خطأ أثناء حذف الحالات');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Listen to distributions
  useEffect(() => {
    const q = query(collection(db, 'seasonal_distributions'), orderBy('createdAt', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDistributions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SeasonalDistribution)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'seasonal_distributions'));
    return () => unsubscribe();
  }, [sortOrder]);

  // Listen to beneficiaries if a distribution is active
  useEffect(() => {
    setFilterDuplicatesOnly(false);
    if (activeDistId) {
      const q = query(
        collection(db, 'seasonal_distributions', activeDistId, 'beneficiaries'),
        orderBy('createdAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setBeneficiaries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SeasonalBeneficiary)));
      }, (error) => handleFirestoreError(error, OperationType.LIST, `seasonal_distributions/${activeDistId}/beneficiaries`));
      return () => unsubscribe();
    } else {
      setBeneficiaries([]);
    }
  }, [activeDistId]);

  // Find duplicates in current distribution beneficiaries
  const duplicatesMap = useMemo(() => {
    const nameCounts: Record<string, number> = {};
    const nationalIdCounts: Record<string, number> = {};
    const phoneCounts: Record<string, number> = {};

    beneficiaries.forEach(b => {
      const name = String(b.name || '').trim();
      const nationalId = String(b.nationalId || '').trim();
      const phone = String(b.phone || '').trim();

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
  }, [beneficiaries]);

  const getIsDuplicate = useCallback((b: SeasonalBeneficiary) => {
    const name = String(b.name || '').trim();
    const nationalId = String(b.nationalId || '').trim();
    const phone = String(b.phone || '').trim();

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

  const duplicateBeneficiariesCount = useMemo(() => {
    return beneficiaries.filter(b => getIsDuplicate(b).isDuplicate).length;
  }, [beneficiaries, getIsDuplicate]);

  const filteredDistributions = distributions.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOrg = filterOrg === 'all' || d.organization === filterOrg;
    const matchesType = filterType === 'all' || d.distType === filterType;
    return matchesSearch && matchesOrg && matchesType;
  });

  const filteredBeneficiaries = beneficiaries
    .filter(b => {
      const bName = String(b.name || '').toLowerCase();
      const bNationalId = String(b.nationalId || '');
      const bCaseCode = String(b.caseCode || '').toLowerCase();
      
      const matchesSearch = bName.includes(searchQuery.toLowerCase()) || 
                          bNationalId.includes(searchQuery) ||
                          bCaseCode.includes(searchQuery.toLowerCase());
      
      const matchesVillage = beneficiaryFilter.village === 'all' || b.village === beneficiaryFilter.village;
      const matchesStatus = beneficiaryFilter.status === 'all' || 
                            (beneficiaryFilter.status === 'collected' ? b.collected : !b.collected);
      const matchesSocialStatus = beneficiaryFilter.socialStatus === 'all' || b.socialStatus === beneficiaryFilter.socialStatus;

      const matchesDup = !filterDuplicatesOnly || getIsDuplicate(b).isDuplicate;

      return matchesSearch && matchesVillage && matchesStatus && matchesSocialStatus && matchesDup;
    })
    .sort((a, b) => {
      const { key, direction } = beneficiarySort;
      let valA = (a[key] || '').toString();
      let valB = (b[key] || '').toString();
      
      // Special handling for caseCode to sort numerically if possible
      if (key === 'caseCode') {
        const numA = parseInt(valA.replace(/\D/g, '')) || 0;
        const numB = parseInt(valB.replace(/\D/g, '')) || 0;
        return direction === 'asc' ? numA - numB : numB - numA;
      }

      const comparison = valA.localeCompare(valB, 'ar');
      return direction === 'asc' ? comparison : -comparison;
    });

  const handleDownloadPDF = async (title: string, elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${title}.pdf`);
    } catch (err) {
      console.error('PDF error', err);
    }
  };

  const exportToExcel = () => {
    const data = activeDistId ? beneficiaries : distributions;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeDistId ? "Beneficiaries" : "Distributions");
    XLSX.writeFile(workbook, activeDistId ? `Beneficiaries_${activeDist?.title || 'list'}.xlsx` : "Distributions.xlsx");
  };

  const printVouchers = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>طباعة البونات - ${activeDist?.title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
          body { font-family: 'Cairo', sans-serif; margin: 0; padding: 20px; }
          .vouchers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .voucher { 
            border: 2px dashed #000; 
            padding: 20px; 
            border-radius: 15px; 
            position: relative;
            overflow: hidden;
            page-break-inside: avoid;
          }
          .header { border-bottom: 2px solid #eee; margin-bottom: 15px; padding-bottom: 10px; }
          .org-name { font-weight: 900; font-size: 18px; color: #064e3b; }
          .dist-title { font-size: 14px; color: #d97706; font-weight: bold; }
          .beneficiary-name { font-size: 20px; font-weight: 900; margin: 10px 0; }
          .details { font-size: 14px; color: #444; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .code { font-family: monospace; font-weight: bold; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; }
          .quantity { font-size: 24px; font-weight: 900; color: #d97706; text-align: left; }
          .footer { margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
          .stamp { width: 60px; height: 60px; border: 2px dotted #ccc; border-radius: 50%; display: flex; items-center justify-content: center; opacity: 0.3; transform: rotate(-15deg); position: absolute; bottom: 10px; left: 10px; }
          @media print {
            .no-print { display: none; }
            body { padding: 0; }
            .vouchers-grid { gap: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="vouchers-grid">
          ${filteredBeneficiaries.map(b => `
            <div class="voucher">
              <div class="header">
                <div class="org-name">جمعية بصمة خير نبروه</div>
                <div class="dist-title">${activeDist?.title}</div>
              </div>
              <div class="beneficiary-name">${b.name}</div>
              <div class="details">
                <div>كود الحالة: <span class="code">${b.caseCode}</span></div>
                <div>القرية: <b>${b.village}</b></div>
                <div>التاريخ: <b>${activeDist?.date}</b></div>
                <div class="quantity">الكمية: ${b.quantity}</div>
              </div>
              <div class="stamp">ختم الجمعية</div>
              <div class="footer">
                <span>رقم الهاتف: ${b.phone || '---'}</span>
                <span>توقيع المستلم: ............................</span>
              </div>
            </div>
          `).join('')}
        </div>
        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const activeDist = distributions.find(d => d.id === activeDistId) || null;

  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importSocialStatusOption, setImportSocialStatusOption] = useState<'fixed' | 'mapping'>('fixed');
  const [fixedImportSocialStatus, setFixedImportSocialStatus] = useState<string>('أخرى');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    name: '',
    nationalId: '',
    phone: '',
    village: '',
    address: '',
    familyCount: '',
    quantity: '',
    socialStatus: '',
  });

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      if (data.length > 0) {
        setImportHeaders(data[0] as string[]);
        setImportData(data.slice(1));
        setShowImportModal(true);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processImport = async () => {
    if (!activeDistId) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      let count = 0;

      // Calculate starting number for codes
      const lastNum = beneficiaries
        .map(b => b.caseCode)
        .filter(c => c?.startsWith('A'))
        .map(c => {
          const numPart = c?.substring(1);
          return numPart ? parseInt(numPart) : 0;
        })
        .filter(n => !isNaN(n))
        .sort((a, b) => b - a)[0] || 0;

      let currentCodeNum = lastNum + 1;

      for (const row of importData) {
        const beneficiary: any = {
          distributionId: activeDistId,
          collected: false,
          createdAt: serverTimestamp(),
          socialStatus: importSocialStatusOption === 'fixed' ? fixedImportSocialStatus : 'أخرى',
        };

        Object.entries(columnMapping).forEach(([field, header]) => {
          if (!header) return;
          const index = importHeaders.indexOf(header);
          if (index !== -1) {
            let val = row[index];
            if (field === 'familyCount' || field === 'quantity') val = Number(val) || 1;
            beneficiary[field] = val || '';
          }
        });

        if (importSocialStatusOption === 'fixed' || !beneficiary.socialStatus) {
          beneficiary.socialStatus = fixedImportSocialStatus;
        }

        if (!beneficiary.name) continue; // Skip if no name
        
        beneficiary.caseCode = `A${currentCodeNum++}`;

        const newDocRef = doc(collection(db, 'seasonal_distributions', activeDistId, 'beneficiaries'));
        batch.set(newDocRef, beneficiary);
        count++;
      }

      await batch.commit();
      
      // Update count in parent
      await updateDoc(doc(db, 'seasonal_distributions', activeDistId), {
        beneficiaryCount: (activeDist?.beneficiaryCount || 0) + count
      });

      setShowImportModal(false);
      setImportData([]);
      alert(`تم استيراد ${count} حالة بنجاح`);
    } catch (err) {
      console.error('Import error:', err);
      alert('حدث خطأ أثناء الاستيراد');
    } finally {
      setLoading(false);
    }
  };

  const [showCommitteeModal, setShowCommitteeModal] = useState(false);
  const [committeeMembers, setCommitteeMembers] = useState(['', '', '']);
  const [chairmanName, setChairmanName] = useState('');
  const [printSettings, setPrintSettings] = useState({
    showIndex: true,
    showCaseCode: false,
    showName: true,
    showNationalId: true,
    showPhone: true,
    showVillage: true,
    showFamilyCount: false,
    showAddress: false,
    showQuantity: true,
    showSignature: true,
  });

  const toArabicNumerals = (num: number | string) => {
    const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return num.toString().split('').map(d => isNaN(parseInt(d)) ? d : arabicNumbers[parseInt(d)]).join('');
  };

  const printDistributionList = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const logoUrl = localStorage.getItem('app_logo_url') || 'https://i.ibb.co/L6V2yq9/logo.png';

    const columns = [
      { id: 'index', title: 'م', show: printSettings.showIndex, class: 'col-m' },
      { id: 'caseCode', title: 'الكود', show: printSettings.showCaseCode, class: 'col-code' },
      { id: 'name', title: 'الاسم', show: printSettings.showName, class: 'col-name' },
      { id: 'nationalId', title: 'الرقم القومي', show: printSettings.showNationalId, class: 'col-national' },
      { id: 'phone', title: 'رقم الهاتف', show: printSettings.showPhone, class: 'col-phone' },
      { id: 'village', title: 'القرية', show: printSettings.showVillage, class: 'col-village' },
      { id: 'familyCount', title: 'عدد الأسرة', show: printSettings.showFamilyCount, class: 'col-family' },
      { id: 'address', title: 'العنوان', show: printSettings.showAddress, class: 'col-address' },
      { id: 'quantity', title: 'الكمية', show: printSettings.showQuantity, class: 'col-qty' },
      { id: 'signature', title: 'التوقيع / البصمة', show: printSettings.showSignature, class: 'col-sign' },
    ].filter(c => c.show);

    const activeColCount = columns.length;

    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>كشف توزيع - ${activeDist?.title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
          body { font-family: 'Cairo', sans-serif; margin: 0; padding: 0; color: #000; -webkit-print-color-adjust: exact; }
          @page { size: A4; margin: 12mm 10mm; }
          
          .report-container { width: 100%; margin: 0 auto; line-height: 1.2; }
          
          .header-wrapper { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 3.5px solid #000; padding-bottom: 10px; }
          .header-right { text-align: right; width: 60%; }
          .header-left { text-align: left; width: 40%; }
          
          .org-details { font-size: 15px; font-weight: 700; line-height: 1.6; color: #000; }
          .org-main-name { font-weight: 900; font-size: 26px; color: #000; margin: 5px 0; }
          
          .logo-img { width: 120px; height: 120px; object-fit: contain; filter: contrast(1.1); }
          
          .report-title-box { text-align: center; margin-bottom: 20px; }
          .report-title { font-size: 26px; font-weight: 900; color: #000; text-decoration: underline; margin-bottom: 5px; }
          
          table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 2.5px solid #000; }
          th, td { border: 2px solid #000; padding: 10px 4px; text-align: center; font-size: 14px; font-weight: 700; word-wrap: break-word; overflow: hidden; height: 45px; }
          th { background: #e5e7eb !important; font-weight: 900; font-size: 13px; color: #000; height: auto; vertical-align: middle; }
          
          .col-m { width: 25px; }
          .col-code { width: 55px; }
          .col-name { width: auto; text-align: right; padding-right: 10px; font-weight: 900; font-size: 15px; }
          .col-national { width: 105px; }
          .col-phone { width: 85px; }
          .col-village { width: 65px; }
          .col-family { width: 45px; }
          .col-address { width: auto; }
          .col-qty { width: 40px; }
          .col-sign { width: 130px; }
          
          .footer-section { padding-top: 15px; page-break-inside: avoid; }
          .committee-section { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 10px; }
          .committee-member { text-align: center; font-size: 14px; font-weight: 900; }
          .signature-line { margin-top: 15px; border-bottom: 1.5px solid #000; height: 1px; width: 85%; margin-left: auto; margin-right: auto; }
          
          .final-footer { display: flex; justify-content: space-between; margin-top: 20px; align-items: flex-end; }
          .chairman { text-align: center; font-weight: 900; width: 220px; font-size: 15px; }
          .chairman .signature-line { width: 95%; border-bottom-width: 2.5px; margin-top: 20px; }
          .stamp-area { width: 100px; height: 100px; border: 2px dashed #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #000; }
          
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          
          @media print {
            .no-print { display: none; }
            body { padding: 0 !important; }
            .report-container { max-width: 100%; }
            th { -webkit-print-color-adjust: exact; background-color: #e5e7eb !important; }
          }
        </style>
      </head>
      <body>
        <div class="report-container">
          <div class="header-wrapper">
            <div class="header-right">
              <div class="org-details">
                مديرية الشئون الاجتماعية بالدقهلية<br/>
                ادارة الشئون الاجتماعية بنبروه<br/>
                <div class="org-main-name">جمعية بصمة خير</div>
                المشهرة برقم ${toArabicNumerals('2510')} لسنة ${toArabicNumerals('2015')}
              </div>
            </div>
            <div class="header-left">
              <img src="${logoUrl}" class="logo-img" alt="logo" />
            </div>
          </div>
          
          <div class="report-title-box">
            <div class="report-title">كشف توزيع: ${activeDist?.title}</div>
          </div>

          <table>
            <thead>
              <tr>
                ${columns.map(c => `<th class="${c.class}">${c.title}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${filteredBeneficiaries.map((b, i) => `
                <tr>
                  ${columns.map(c => {
                    if (c.id === 'index') return `<td>${toArabicNumerals(i + 1)}</td>`;
                    if (c.id === 'caseCode') return `<td>${b.caseCode || '---'}</td>`;
                    if (c.id === 'name') return `<td class="col-name">${b.name}</td>`;
                    if (c.id === 'nationalId') return `<td>${toArabicNumerals(b.nationalId)}</td>`;
                    if (c.id === 'phone') return `<td>${toArabicNumerals(b.phone || '---')}</td>`;
                    if (c.id === 'village') return `<td>${b.village}</td>`;
                    if (c.id === 'familyCount') return `<td>${toArabicNumerals(b.familyCount || 0)}</td>`;
                    if (c.id === 'address') return `<td>${b.address || '---'}</td>`;
                    if (c.id === 'quantity') return `<td>${toArabicNumerals(b.quantity)}</td>`;
                    if (c.id === 'signature') return `<td></td>`;
                    return `<td></td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="${activeColCount}" style="border: none; padding: 0;">
                  <div class="footer-section">
                    <div style="font-weight: 900; font-size: 15px; text-decoration: underline; margin-bottom: 5px; text-align: center;">لجنة التوزيع:</div>
                    <div class="committee-section">
                      ${committeeMembers.map(name => `
                        <div class="committee-member">
                          <div>${name || '................................'}</div>
                          <div class="signature-line"></div>
                        </div>
                      `).join('')}
                    </div>
                    
                    <div class="final-footer">
                      <div class="stamp-area">ختم الجمعية</div>
                      <div class="chairman">
                        <div>يعتمد،،</div>
                        <div style="margin-top: 5px;">رئيس مجلس الإدارة</div>
                        <div style="margin-top: 10px;">${chairmanName || '................................'}</div>
                        <div class="signature-line"></div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleSaveDist = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDist) {
        await updateDoc(doc(db, 'seasonal_distributions', editingDist.id), {
          ...distFormData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'seasonal_distributions'), {
          ...distFormData,
          createdAt: serverTimestamp()
        });
      }
      setShowDistForm(false);
      setDistFormData(initialDistForm);
      setEditingDist(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'seasonal_distributions');
    }
  };

  const generateBeneficiaryCode = (list: SeasonalBeneficiary[]) => {
    const lastNum = list
      .map(b => {
        const code = b.caseCode || '';
        const numPart = code.replace('A', '');
        return parseInt(numPart);
      })
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a)[0] || 0;
    return `A${lastNum + 1}`;
  };

  const handleSaveBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDistId) return;

    const dataToSave = {
      ...beneficiaryFormData,
      socialStatus: beneficiaryFormData.socialStatus === 'أخرى' 
        ? beneficiaryFormData.otherSocialStatus 
        : beneficiaryFormData.socialStatus
    };

    const performSave = async () => {
      try {
        setLoading(true);
        if (editingBeneficiary) {
          await updateDoc(doc(db, 'seasonal_distributions', activeDistId, 'beneficiaries', editingBeneficiary.id), {
            ...dataToSave,
            updatedAt: serverTimestamp()
          });
        } else {
          const code = beneficiaryFormData.caseCode || generateBeneficiaryCode(beneficiaries);
          await addDoc(collection(db, 'seasonal_distributions', activeDistId, 'beneficiaries'), {
            ...dataToSave,
            caseCode: code,
            distributionId: activeDistId,
            createdAt: serverTimestamp()
          });
          // Also update beneficiary count in parent
          await updateDoc(doc(db, 'seasonal_distributions', activeDistId), {
            beneficiaryCount: (activeDist?.beneficiaryCount || 0) + 1
          });
        }
        setShowBeneficiaryForm(false);
        setBeneficiaryFormData(initialBeneficiaryForm);
        setEditingBeneficiary(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `seasonal_distributions/${activeDistId}/beneficiaries`);
      } finally {
        setLoading(false);
      }
    };

    if (!editingBeneficiary) {
      setLoading(true);
      let duplicateWarnings: string[] = [];
      try {
        duplicateWarnings = await checkDuplicateCase(beneficiaryFormData.name, beneficiaryFormData.nationalId);
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

  const handleDuplicateDist = (dist: SeasonalDistribution) => {
    setConfirmConfig({
      isOpen: true,
      title: 'نسخ ملف التوزيع',
      message: `هل أنت متأكد من إنشاء نسخة جديدة من ملف التوزيع "${dist.title}" وجميع الحالات المقيدة فيه؟`,
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          // 1. Create duplicate distribution doc
          const newTitle = `${dist.title} - نسخة`;
          const newDistData = {
            title: newTitle,
            organization: dist.organization || '',
            otherOrgName: dist.otherOrgName || '',
            distType: dist.distType || '',
            otherDistType: dist.otherDistType || '',
            date: dist.date || '',
            notes: dist.notes || 'نسخة مكررة',
            createdAt: serverTimestamp(),
            beneficiaryCount: dist.beneficiaryCount || 0
          };
          
          const newDocRef = await addDoc(collection(db, 'seasonal_distributions'), newDistData);
          const newDistId = newDocRef.id;

          // 2. Fetch all beneficiaries of original distribution
          const beneficiariesQuery = query(
            collection(db, 'seasonal_distributions', dist.id, 'beneficiaries'),
            orderBy('createdAt', 'asc')
          );
          const snap = await getDocs(beneficiariesQuery);
          
          // 3. Write in batch
          if (snap.docs.length > 0) {
            const batchLimit = 450;
            let currentBatch = writeBatch(db);
            let opCount = 0;

            for (const docSnap of snap.docs) {
              const bData = docSnap.data();
              const newBeneficiaryRef = doc(collection(db, 'seasonal_distributions', newDistId, 'beneficiaries'));
              
              currentBatch.set(newBeneficiaryRef, {
                ...bData,
                distributionId: newDistId,
                createdAt: serverTimestamp(),
                collected: false // new copy is not yet paid/collected
              });

              opCount++;
              if (opCount >= batchLimit) {
                await currentBatch.commit();
                currentBatch = writeBatch(db);
                opCount = 0;
              }
            }

            if (opCount > 0) {
              await currentBatch.commit();
            }
          }

          alert(`تم نسخ ملف التوزيع "${dist.title}" وحالاته بنجاح`);
        } catch (error) {
          console.error('Error duplicating distribution: ', error);
          alert('حدث خطأ أثناء نسخ ملف التوزيع');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteDist = (id: string, title: string) => {
    const distData = distributions.find(d => d.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف ملف توزيع',
      message: `هل أنت متأكد من حذف ملف التوزيع "${title}"؟ سيتم حذف جميع الحالات التابعة له أيضاً.`,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'seasonal_distributions', id));
        if (distData) {
          await logSystemAction('delete', 'seasonal_distributions', id, distData, `حذف ملف التوزيع الموسمي: ${title}`);
        }
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        if (activeDistId === id) setActiveDistId(null);
      }
    });
  };

  const handleDeleteBeneficiary = (id: string, name: string) => {
    if (!activeDistId) return;
    const beneficiaryData = beneficiaries.find(b => b.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف مستفيد',
      message: `هل أنت متأكد من حذف المستفيد "${name}" من هذا التوزيع؟`,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'seasonal_distributions', activeDistId, 'beneficiaries', id));
        if (beneficiaryData) {
          await logSystemAction('delete', `seasonal_distributions/${activeDistId}/beneficiaries`, id, beneficiaryData, `حذف مستفيد من التوزيع الموسمي: ${name}`);
        }
        // Update count
        if (activeDist) {
          await updateDoc(doc(db, 'seasonal_distributions', activeDistId), {
            beneficiaryCount: Math.max(0, (activeDist.beneficiaryCount || 1) - 1)
          });
        }
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  useEffect(() => {
    if (researchCase && showResearchModal) {
      const q = query(
        collection(db, 'seasonal_cases', researchCase.id, 'periodic_research'), 
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snap) => {
        setResearchRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResearchRecord)));
      }, (error) => handleFirestoreError(error, OperationType.LIST, `seasonal_cases/${researchCase.id}/periodic_research`));

      return () => unsubscribe();
    }
  }, [researchCase, showResearchModal]);

  const openResearch = (item: SeasonalCase) => {
    setResearchCase(item);
    setShowResearchModal(true);
    setResearchRecords([]);
  };

  const handleAddResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!researchCase) return;

    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد حفظ بحث الحالة الموسمية',
      message: `هل أنت متأكد من حفظ التحديث الدوري لبيانات الحالة: ${researchCase.name}؟`,
      onConfirm: async () => {
        try {
          await addDoc(collection(db, 'seasonal_cases', researchCase.id, 'periodic_research'), {
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
          handleFirestoreError(error, OperationType.CREATE, `seasonal_cases/${researchCase.id}/periodic_research`);
        }
      }
    });
  };

  return (
    <div className="p-6 space-y-6 text-right font-sans" dir="rtl">
      {/* Visual Section Header Banner */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-emerald-900 h-48 flex items-center p-8 text-white shadow-lg border border-emerald-800">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&q=80&w=1200" 
            alt="Seasonal Distributions" 
            className="w-full h-full object-cover opacity-20 select-none"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-900/90 to-emerald-950/40" />
        </div>
        <div className="relative z-10 w-full text-right">
          <h1 className="text-3xl font-black mb-2">المساعدات الموسمية وحملات الإطعام</h1>
          <p className="text-emerald-200 text-xs md:text-sm font-semibold max-w-2xl leading-relaxed">
            المشاريع الموسمية بجمعية بصمة خير - توزيع شنط رمضان الغذائية، لحوم الأضاحي، كفارات الإطعام وكسوة الشتاء لدعم الأسر وتأمين الاحتياجات الأساسية في المواسم والنفحات المباركة.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-emerald-50">
        <div className="flex items-center gap-4">
          <div className="bg-amber-500 p-4 rounded-2xl shadow-lg cursor-pointer" onClick={() => setActiveDistId(null)}>
            <Gift className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-emerald-950">
              {activeDist ? `توزيع: ${activeDist.title}` : 'الحالات الموسمية'}
            </h1>
            <p className="text-amber-600 font-bold text-sm">
              {activeDist ? `${activeDist.distType} - ${activeDist.organization}` : 'إدارة توزيعات الإطعام والأضاحي وشنط رمضان'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {activeDist && (
            <button 
              onClick={() => setActiveDistId(null)}
              className="p-3 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-all flex items-center gap-2"
            >
              <ArrowRight className="w-5 h-5 ml-1" />
              <span className="text-xs font-bold">رجوع للملفات</span>
            </button>
          )}
          <button 
            onClick={() => handleDownloadPDF(activeDist ? `توزيع_${activeDist.title}` : 'كشف_التوزيعات_الموسمية', activeDist ? 'beneficiaries-table' : 'distributions-table')}
            className="p-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2"
          >
            <FileText className="w-5 h-5" />
            <span className="text-xs font-bold">تحميل PDF</span>
          </button>
          <button onClick={exportToExcel} className="p-3 bg-white border border-amber-100 text-amber-600 rounded-xl hover:bg-amber-50">
            <Download className="w-5 h-5" />
          </button>
          {activeDist && (
            <button onClick={() => setShowCommitteeModal(true)} className="p-3 bg-white border border-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-50 flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              <span className="text-xs font-bold">كشف توزيع</span>
            </button>
          )}
          {activeDist && (
            <button onClick={printVouchers} className="p-3 bg-white border border-amber-100 text-amber-600 rounded-xl hover:bg-amber-50 flex items-center gap-2">
              <Printer className="w-5 h-5" />
              <span className="text-xs font-bold">طباعة البونات</span>
            </button>
          )}
          {activeDist && (
            <div className="relative">
              <input 
                type="file" 
                id="excel-import" 
                className="hidden" 
                accept=".xlsx, .xls" 
                onChange={handleExcelImport}
              />
              <button 
                onClick={() => document.getElementById('excel-import')?.click()}
                className="p-3 bg-white border border-blue-100 text-blue-600 rounded-xl hover:bg-blue-50 flex items-center gap-2"
              >
                <UploadCloud className="w-5 h-5" />
                <span className="text-xs font-bold">استيراد من Excel</span>
              </button>
            </div>
          )}
          <button 
            onClick={() => {
              if (activeDist) {
                setEditingBeneficiary(null);
                setBeneficiaryFormData(initialBeneficiaryForm);
                setShowBeneficiaryForm(true);
              } else {
                setEditingDist(null);
                setDistFormData(initialDistForm);
                setShowDistForm(true);
              }
            }}
            className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-700 transition-all shadow-lg shadow-amber-200"
          >
            <Plus className="w-5 h-5" />
            <span>{activeDist ? 'إضافة مستفيد' : 'إضافة ملف توزيع جديد'}</span>
          </button>
        </div>
      </div>

      {!activeDistId ? (
        <>
          {/* Filters for Distributions */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <div className="md:col-span-2 relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-300 w-5 h-5" />
              <input 
                type="text" 
                placeholder="ابحث عن اسم كشف توزيع..."
                className="w-full bg-stone-50 border border-stone-100 pr-12 pl-6 py-3 rounded-xl outline-none focus:border-amber-500 font-bold"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
               <select 
                className="w-full bg-stone-50 border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
               >
                 <option value="desc">الأحدث أولاً</option>
                 <option value="asc">الأقدم أولاً</option>
               </select>
            </div>
            <div>
               <select 
                className="w-full bg-stone-50 border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
               >
                 <option value="all">كل أنواع التوزيع</option>
                 {DISTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
               </select>
            </div>
            <div>
               <select 
                className="w-full bg-stone-50 border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
                value={filterOrg}
                onChange={(e) => setFilterOrg(e.target.value)}
               >
                 <option value="all">كل الهيئات</option>
                 {ORGANIZATIONS.map(o => <option key={o} value={o}>{o}</option>)}
               </select>
            </div>
          </div>

          {/* Distributions Folders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredDistributions.map((dist) => (
                <motion.div
                  layout
                  key={dist.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white p-6 rounded-[2rem] border border-emerald-50 shadow-sm hover:shadow-xl hover:border-amber-200 transition-all cursor-pointer group relative"
                  onClick={() => setActiveDistId(dist.id)}
                >
                  <div className="absolute top-4 left-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDuplicateDist(dist); }}
                      className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                      title="نسخ الكشف بالكامل"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingDist(dist); setDistFormData(dist); setShowDistForm(true); }}
                      className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteDist(dist.id, dist.title); }}
                      className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-amber-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Box className="w-8 h-8 text-amber-600" />
                  </div>
                  
                  <h3 className="text-xl font-black text-emerald-950 mb-1">{dist.title}</h3>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-bold text-stone-400">{dist.distType}</span>
                    <span className="w-1 h-1 bg-stone-300 rounded-full" />
                    <span className="text-xs font-bold text-amber-600">{dist.date}</span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-stone-50">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-black text-emerald-900">{dist.beneficiaryCount || 0} حالة</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-stone-300 group-hover:text-amber-500 group-hover:translate-x-[-4px] transition-all" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {filteredDistributions.length === 0 && (
              <div className="col-span-full py-20 text-center bg-stone-50 rounded-3xl border-2 border-dashed border-stone-200">
                <Box className="w-16 h-16 mx-auto mb-4 opacity-20 text-emerald-900" />
                <p className="text-stone-400 font-bold">لا توجد كشوفات توزيع موسمي مسجلة حالياً</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Beneficiaries View inside a Distribution */}
          <div className="space-y-4 bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-300 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="ابحث بالاسم أو الرقم القومي داخل هذا الكشف..."
                  className="w-full bg-stone-50 border border-stone-100 pr-12 pl-6 py-3 rounded-xl outline-none focus:border-emerald-500 font-bold"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl flex items-center justify-between border border-emerald-100">
                <span className="text-xs font-black text-emerald-900">إجمالي الحالات:</span>
                <span className="bg-white px-3 py-1 rounded-lg text-emerald-700 font-black text-sm">{beneficiaries.length}</span>
              </div>
              <div className="bg-stone-50 p-3 rounded-xl flex flex-col justify-center gap-1 border border-stone-100">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-emerald-700">تم الاستلام:</span>
                  <span className="bg-emerald-100/50 px-2 py-0.5 rounded text-emerald-700 font-black text-[10px]">{beneficiaries.filter(b => b.collected).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-rose-600">لم يستلم:</span>
                  <span className="bg-rose-100/50 px-2 py-0.5 rounded text-rose-600 font-black text-[10px]">{beneficiaries.filter(b => !b.collected).length}</span>
                </div>
              </div>
            </div>

            {duplicateBeneficiariesCount > 0 && (
              <div 
                onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
                className={cn(
                  "p-4 rounded-2xl flex flex-row-reverse items-center justify-between cursor-pointer border transition-all text-right",
                  filterDuplicatesOnly 
                    ? "bg-rose-100 border-rose-300 text-rose-950 shadow-md scale-[1.01]" 
                    : "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100"
                )}
              >
                <div className="flex items-center gap-3 flex-row-reverse">
                  <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce" />
                  <div>
                    <span className="font-extrabold text-sm block">تم كشف {duplicateBeneficiariesCount} حالة تكرار في الاسم أو الهوية أو الهاتف!</span>
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-stone-50">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-stone-400 pr-2">فلترة بالقرية:</label>
                <select 
                  className="bg-stone-50 border border-stone-100 p-2 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                  value={beneficiaryFilter.village}
                  onChange={(e) => setBeneficiaryFilter(prev => ({ ...prev, village: e.target.value }))}
                >
                  <option value="all">كل القرى</option>
                  {[...new Set(beneficiaries.map(b => b.village))].filter(Boolean).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-stone-400 pr-2">فلترة بالاستلام:</label>
                <select 
                  className="bg-stone-50 border border-stone-100 p-2 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                  value={beneficiaryFilter.status}
                  onChange={(e) => setBeneficiaryFilter(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="all">كل الحالات</option>
                  <option value="collected">تم الاستلام</option>
                  <option value="not_collected">لم يتم الاستلام</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-stone-400 pr-2">فلترة بالحالة الاجتماعية:</label>
                <select 
                  className="bg-stone-50 border border-stone-100 p-2 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                  value={beneficiaryFilter.socialStatus}
                  onChange={(e) => setBeneficiaryFilter(prev => ({ ...prev, socialStatus: e.target.value }))}
                >
                  <option value="all">كل الحالات الاجتماعية</option>
                  {SOCIAL_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-stone-400 pr-2">ترتيب الكشف حسب:</label>
                <div className="flex gap-2">
                  <select 
                    className="flex-grow bg-stone-50 border border-stone-100 p-2 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                    value={beneficiarySort.key}
                    onChange={(e) => setBeneficiarySort(prev => ({ ...prev, key: e.target.value as any }))}
                  >
                    <option value="name">الاسم</option>
                    <option value="nationalId">الرقم القومي</option>
                    <option value="socialStatus">الحالة الاجتماعية</option>
                    <option value="village">القرية</option>
                    <option value="caseCode">الكود</option>
                  </select>
                  <button 
                    onClick={() => setBeneficiarySort(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100"
                  >
                    {beneficiarySort.direction === 'asc' ? '⬆️' : '⬇️'}
                  </button>
                  <button 
                    onClick={handleReorderCodes}
                    className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 flex items-center gap-1 group"
                    title="إعادة ترقيم الكود حسب الترتيب الحالي"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform'}`} />
                    <span className="text-[10px] font-black">ترقيم</span>
                  </button>
                  <button 
                    onClick={handleDeleteAllBeneficiaries}
                    disabled={!beneficiaries.length}
                    className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="حذف جميع الحالات التابعة لهذا التوزيع"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span className="text-[10px] font-black">حذف الكل</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-emerald-50 shadow-xl overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
              <table id="beneficiaries-table" className="w-full text-right border-collapse min-w-[1000px] bg-white" dir="rtl">
                <thead>
                  <tr className="bg-emerald-50/50">
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-center">الكود</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-right">اسم المستفيد</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-right">الحالة الاجتماعية</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-right">الرقم القومي</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-right">الهاتف</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-right">القرية</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-center">الكمية</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-center">الحالة</th>
                    <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50 text-right">
                  {filteredBeneficiaries.map((b, index) => (
                    <tr key={b.id} className="hover:bg-emerald-50/20 transition-colors group">
                      <td className="p-5 text-emerald-600 font-black text-xs tabular-nums text-center border-l border-emerald-50/30">{b.caseCode || index + 1}</td>
                      <td className="p-5 text-right">
                        {(() => {
                          const dupInfo = getIsDuplicate(b);
                          return (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-3">
                                <Users className="w-4 h-4 text-emerald-600" />
                                <span className={cn(
                                  "font-black text-sm",
                                  dupInfo.isDuplicate ? "text-rose-700 font-extrabold" : "text-emerald-950"
                                )}>{b.name}</span>
                              </div>
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
                      <td className="p-5 text-right font-bold text-stone-600 text-xs">
                        <span className="px-2 py-1 bg-stone-100 rounded-lg">{b.socialStatus}</span>
                      </td>
                      <td className="p-5 text-stone-600 font-bold text-xs tabular-nums text-right">{b.nationalId}</td>
                      <td className="p-5 text-right">
                        <a href={`tel:${b.phone}`} className="text-xs font-black text-emerald-600 tabular-nums hover:underline">{b.phone}</a>
                      </td>
                      <td className="p-5 text-right font-bold text-stone-600 text-xs">{b.village}</td>
                      <td className="p-5 text-right">
                        <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black">{b.quantity}</span>
                      </td>
                      <td className="p-5 text-right">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            await updateDoc(doc(db, 'seasonal_distributions', activeDistId, 'beneficiaries', b.id), { collected: !b.collected });
                          }}
                          className={cn(
                            "text-[10px] font-black px-3 py-1.5 rounded-xl transition-all flex items-center gap-1",
                            b.collected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          )}
                        >
                          {b.collected && <CheckCircle2 className="w-3 h-3" />}
                          {b.collected ? 'تم الاستلام' : 'تأكيد الاستلام'}
                        </button>
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex justify-center gap-1">
                            <button 
                              onClick={() => setUnifiedTransferCase({
                                id: b.id,
                                name: b.name,
                                nationalId: b.nationalId,
                                phone: b.phone || '',
                                address: b.address || '',
                                village: b.village || '',
                                familyCount: Number(b.familyCount) || 1,
                                sourceSection: 'seasonal',
                                sourceSectionLabel: 'الحالات الموسمية',
                                sourceCollection: 'seasonal_cases',
                                parentDistId: activeDistId
                              })}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                              title="الربط والنقل بين الأقسام"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => { setEditingBeneficiary(b); setBeneficiaryFormData(b); setShowBeneficiaryForm(true); }}
                              className="p-2 text-stone-600 hover:bg-stone-50 rounded-xl transition-all"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteBeneficiary(b.id, b.name)}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
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
        </>
      )}

      {/* Distribution Form Modal */}
      <AnimatePresence>
        {showDistForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10">
                <button onClick={() => setShowDistForm(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950">{editingDist ? 'تعديل ملف التوزيع' : 'إضافة ملف توزيع جديد'}</h2>
                  <p className="text-stone-400 font-bold">يرجى تسجيل بيانات التوزيع الأساسية</p>
                </div>
              </div>

              <form onSubmit={handleSaveDist} className="space-y-6">
                <div className="space-y-1">
                  <label className="text-xs font-black text-stone-500 pr-2">اسم الكشف (مثلاً: كرتونة رمضان 2024)</label>
                  <input 
                    required type="text"
                    className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                    value={distFormData.title}
                    onChange={(e) => setDistFormData({...distFormData, title: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">الهيئة المانحة</label>
                      <select 
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                        value={distFormData.organization}
                        onChange={(e) => setDistFormData({...distFormData, organization: e.target.value})}
                      >
                        {ORGANIZATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                   </div>
                   {distFormData.organization === 'آخر' && (
                     <div className="space-y-1">
                        <label className="text-xs font-black text-stone-500 pr-2">اسم الهيئة</label>
                        <input 
                          type="text"
                          className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-amber-500 outline-none font-bold text-right"
                          value={distFormData.otherOrgName}
                          onChange={(e) => setDistFormData({...distFormData, otherOrgName: e.target.value})}
                        />
                     </div>
                   )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">نوع التوزيع</label>
                      <select 
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                        value={distFormData.distType}
                        onChange={(e) => setDistFormData({...distFormData, distType: e.target.value})}
                      >
                        {DISTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                   </div>
                   {distFormData.distType === 'آخر' && (
                     <div className="space-y-1">
                        <label className="text-xs font-black text-stone-500 pr-2">حدد النوع</label>
                        <input 
                          type="text"
                          className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-amber-500 outline-none font-bold text-right"
                          value={distFormData.otherDistType}
                          onChange={(e) => setDistFormData({...distFormData, otherDistType: e.target.value})}
                        />
                     </div>
                   )}
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">تاريخ التوزيع</label>
                      <input 
                        type="date"
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                        value={distFormData.date}
                        onChange={(e) => setDistFormData({...distFormData, date: e.target.value})}
                      />
                   </div>
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-black text-stone-500 pr-2">ملاحظات عامة</label>
                   <textarea 
                     className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl h-24 outline-none focus:border-amber-500 font-bold text-right"
                     value={distFormData.notes}
                     onChange={(e) => setDistFormData({...distFormData, notes: e.target.value})}
                   />
                </div>

                <div className="pt-8">
                   <button type="submit" className="w-full bg-amber-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-amber-700 shadow-xl shadow-amber-200 transition-all">
                     {editingDist ? 'حفظ التعديلات' : 'تأكيد إنشاء ملف التوزيع'}
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Beneficiary Form Modal */}
      <AnimatePresence>
        {showBeneficiaryForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10">
                <button onClick={() => setShowBeneficiaryForm(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950">{editingBeneficiary ? 'تعديل بيانات المستفيد' : 'إضافة مستفيد جديد'}</h2>
                  <p className="text-stone-400 font-bold">يرجى تسجيل بيانات المستفيد لهذا التوزيع</p>
                </div>
              </div>

              <form onSubmit={handleSaveBeneficiary} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <FormField 
                    label="كود الحالة (اختياري)" 
                    icon={<ClipboardList className="w-5 h-5 text-amber-400" />} 
                    placeholder="سيتم التوليد تلقائياً إذا ترك فارغاً" 
                    value={beneficiaryFormData.caseCode || ''}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, caseCode: val})}
                   />
                   <FormField 
                    label="اسم المستفيد الكامل" 
                    icon={<Users className="w-5 h-5 text-emerald-400" />} 
                    placeholder="أدخل الاسم رباعي" 
                    required
                    value={beneficiaryFormData.name}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, name: val})}
                   />
                   <FormField 
                    label="الرقم القومي (14 رقم)" 
                    icon={<Info className="w-5 h-5 text-emerald-400" />} 
                    placeholder="00000000000000" 
                    required
                    value={beneficiaryFormData.nationalId}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, nationalId: val})}
                   />
                   <FormField 
                    label="رقم الهاتف" 
                    icon={<Phone className="w-5 h-5 text-emerald-400" />} 
                    placeholder="01xxxxxxxxx" 
                    value={beneficiaryFormData.phone}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, phone: val})}
                   />
                   <FormField 
                    label="القرية" 
                    icon={<MapPin className="w-5 h-5 text-emerald-400" />} 
                    placeholder="اسم القرية" 
                    value={beneficiaryFormData.village}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, village: val})}
                   />
                   <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800 px-1 text-right block">الحالة الاجتماعية</label>
                      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20 transition-all">
                        <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
                          <Info className="w-5 h-5" />
                        </div>
                        <select 
                          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold text-right py-2"
                          value={beneficiaryFormData.socialStatus}
                          onChange={(e) => setBeneficiaryFormData({...beneficiaryFormData, socialStatus: e.target.value})}
                        >
                          {SOCIAL_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                   </div>
                   {beneficiaryFormData.socialStatus === 'أخرى' && (
                     <FormField 
                       label="حدد الحالة الأخرى" 
                       icon={<Info className="w-5 h-5 text-amber-400" />} 
                       placeholder="أدخل الحالة الاجتماعية" 
                       value={beneficiaryFormData.otherSocialStatus || ''}
                       onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, otherSocialStatus: val})}
                     />
                   )}
                   <FormField 
                    label="العنوان بالتفصيل" 
                    icon={<MapPin className="w-5 h-5 text-emerald-400" />} 
                    placeholder="الشارع / علامة مميزة" 
                    value={beneficiaryFormData.address || ''}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, address: val})}
                   />
                   <FormField 
                    label="عدد أفراد الأسرة" 
                    type="number"
                    icon={<Users className="w-5 h-5 text-amber-400" />} 
                    placeholder="1" 
                    value={String(beneficiaryFormData?.familyCount ?? 1)}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, familyCount: Number(val)})}
                   />
                   <FormField 
                    label="الكمية" 
                    type="number"
                    icon={<Utensils className="w-5 h-5 text-amber-400" />} 
                    placeholder="1" 
                    value={String(beneficiaryFormData?.quantity ?? 1)}
                    onChange={(val) => setBeneficiaryFormData({...beneficiaryFormData, quantity: Number(val)})}
                   />
                   <div className="flex items-end pb-1 pr-2">
                     <label className="flex items-center gap-3 cursor-pointer select-none">
                       <input 
                         type="checkbox" 
                         className="w-5 h-5 rounded-lg text-emerald-600 focus:ring-emerald-500 border-stone-300"
                         checked={beneficiaryFormData.collected}
                         onChange={(e) => setBeneficiaryFormData({...beneficiaryFormData, collected: e.target.checked})}
                       />
                       <span className="text-sm font-black text-emerald-900">تم الاستلام / التسليم</span>
                     </label>
                   </div>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-black text-emerald-900 block text-right pr-2">ملاحظات إضافية</label>
                  <textarea 
                    className="w-full bg-stone-50 border border-stone-100 p-6 rounded-[2rem] min-h-[120px] outline-none focus:border-amber-500 font-bold text-right"
                    value={beneficiaryFormData.notes || ''}
                    onChange={(e) => setBeneficiaryFormData({...beneficiaryFormData, notes: e.target.value})}
                    placeholder="اكتب أي ملاحظات خاصة بهذا المستفيد..."
                  />
                </div>

                <div className="flex flex-row-reverse gap-4 pt-4 border-t border-stone-50">
                   <button 
                    type="submit"
                    className="flex-grow bg-amber-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-amber-700 shadow-xl shadow-amber-200 transition-all flex items-center justify-center gap-2"
                   >
                     <Save className="w-6 h-6" />
                     {editingBeneficiary ? 'حفظ التعديلات' : 'تأكيد الحفظ والإضافة'}
                   </button>
                   <button 
                    type="button"
                    onClick={() => setShowBeneficiaryForm(false)}
                    className="px-12 bg-stone-100 text-stone-500 py-5 rounded-[2rem] font-bold hover:bg-stone-200"
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
        {showResearchModal && researchCase && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10">
                <button onClick={() => setShowResearchModal(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950">البحث الدوري - {researchCase.name}</h2>
                  <p className="text-stone-400 font-bold text-sm">متابعة الدخل والمصاريف وتغير الحالة</p>
                </div>
              </div>

              {!showAddResearch ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-emerald-50 p-6 rounded-3xl border border-emerald-100 shadow-sm">
                    <div className="text-right">
                      <p className="text-emerald-900 font-black text-lg">سجل الزيارات والبحث</p>
                      <p className="text-emerald-600 text-xs font-bold">إجمالي الأبحاث المسجلة: {researchRecords.length}</p>
                    </div>
                    <button 
                      onClick={() => setShowAddResearch(true)}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة بحث جديد</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {researchRecords.map((record) => (
                      <div key={record.id} className="bg-stone-50 p-6 rounded-3xl border border-stone-100 hover:border-emerald-200 transition-all">
                        <div className="flex justify-between items-start mb-4">
                           <div className="flex items-center gap-2">
                             <button 
                               onClick={() => {
                                 setConfirmConfig({
                                   isOpen: true,
                                   title: 'حذف التحديث الدوري',
                                   message: 'هل أنت متأكد من حذف هذا التحديث الدوري نهائياً؟',
                                   onConfirm: async () => {
                                     try {
                                       await deleteDoc(doc(db, 'seasonal_cases', researchCase.id, 'periodic_research', record.id));
                                       setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                                       alert('تم حذف التحديث بنجاح');
                                     } catch (err) {
                                       alert('فشل في حذف التحديث');
                                     }
                                   }
                                 });
                               }}
                               className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                               title="حذف التحديث"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                             <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-stone-100">
                               <Calendar className="w-3 h-3 text-emerald-600" />
                               <span className="text-[10px] font-bold text-stone-600">{record.date}</span>
                             </div>
                           </div>
                           {record.hasChanged && (
                             <div className="flex items-center gap-1 bg-rose-50 text-rose-600 px-3 py-1 rounded-full border border-rose-100 text-[10px] font-bold">
                               <Info className="w-3 h-3" />
                               حدث تغير في الحالة
                             </div>
                           )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                             <p className="text-[10px] font-black text-stone-400 text-right pr-2">المصاريف الشهرية</p>
                             <div className="bg-white p-3 rounded-2xl flex flex-col gap-1 text-right">
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-bold text-emerald-700">{record.schoolExpenses} ج.م</span>
                                 <span className="text-stone-500">تعليم:</span>
                                </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-bold text-emerald-700">{record.livingExpenses} ج.م</span>
                                 <span className="text-stone-500">معيشة:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-bold text-emerald-700">{record.otherExpenses} ج.م</span>
                                 <span className="text-stone-500">أخرى:</span>
                               </div>
                               <div className="border-t border-emerald-50 mt-1 pt-1 flex justify-between text-xs">
                                 <span className="font-black text-emerald-950">{(record.schoolExpenses || 0) + (record.livingExpenses || 0) + (record.otherExpenses || 0)} ج.م</span>
                                 <span className="font-black text-stone-700">الإجمالي:</span>
                               </div>
                             </div>
                          </div>

                          <div className="space-y-2">
                             <p className="text-[10px] font-black text-stone-400 text-right pr-2">مصادر الدخل</p>
                             <div className="bg-white p-3 rounded-2xl flex flex-col gap-1 text-right">
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomePension} ج.م</span>
                                 <span className="text-stone-500">معاش:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomeInsurance} ج.م</span>
                                 <span className="text-stone-500">تأمين:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomeSalary} ج.م</span>
                                 <span className="text-stone-500">راتب:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomeOther} ج.م</span>
                                 <span className="text-stone-500">أخرى:</span>
                               </div>
                               <div className="border-t border-emerald-50 mt-1 pt-1 flex justify-between text-xs">
                                 <span className="font-black text-emerald-950">{(record.incomePension || 0) + (record.incomeInsurance || 0) + (record.incomeSalary || 0) + (record.incomeOther || 0)} ج.م</span>
                                 <span className="font-black text-stone-700">الإجمالي:</span>
                               </div>
                             </div>
                          </div>
                        </div>

                        {record.notes && (
                          <div className="mt-4 bg-white p-4 rounded-2xl border border-stone-100">
                             <p className="text-[10px] font-black text-emerald-800 text-right mb-1">ملاحظات البحث:</p>
                             <p className="text-xs text-stone-600 text-right leading-relaxed">{record.notes}</p>
                          </div>
                        )}
                      </div>
                    ))}

                    {researchRecords.length === 0 && (
                      <div className="text-center py-20 bg-stone-50 rounded-3xl border-2 border-dashed border-stone-200">
                        <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-20 text-emerald-900" />
                        <p className="text-stone-400 font-bold">لا توجد سجلات بحث دوري لهذه الحالة حتى الآن</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddResearch} className="space-y-8 animate-in slide-in-from-left duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-4">
                        <h4 className="text-sm font-black text-rose-600 text-right pr-2">بيانات المصاريف (ج.م)</h4>
                        <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100 space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مصاريف مدارس/جامعات</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.schoolExpenses}
                              onChange={(e) => setResearchFormData({...researchFormData, schoolExpenses: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مصاريف معيشة</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.livingExpenses}
                              onChange={(e) => setResearchFormData({...researchFormData, livingExpenses: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مصاريف أخرى</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.otherExpenses}
                              onChange={(e) => setResearchFormData({...researchFormData, otherExpenses: Number(e.target.value)})}
                            />
                          </div>
                        </div>
                     </div>

                     <div className="space-y-4">
                        <h4 className="text-sm font-black text-emerald-700 text-right pr-2">بيانات الدخل (ج.م)</h4>
                        <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100 space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">معاش (تضامن/تكافل..)</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomePension}
                              onChange={(e) => setResearchFormData({...researchFormData, incomePension: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">تأمينات</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomeInsurance}
                              onChange={(e) => setResearchFormData({...researchFormData, incomeInsurance: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مرتب/دخل عمل</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomeSalary}
                              onChange={(e) => setResearchFormData({...researchFormData, incomeSalary: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">دخل إضافي</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomeOther}
                              onChange={(e) => setResearchFormData({...researchFormData, incomeOther: Number(e.target.value)})}
                            />
                          </div>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <input 
                            type="date"
                            className="bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs font-bold outline-none"
                            value={researchFormData.date}
                            onChange={(e) => setResearchFormData({...researchFormData, date: e.target.value})}
                          />
                          <label className="text-xs font-bold text-stone-500">تاريخ الزيارة:</label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setResearchFormData({...researchFormData, hasChanged: !researchFormData.hasChanged})}>
                           <span className="text-xs font-black text-rose-600">هل حدث تغير في الحالة؟</span>
                           <div className={`w-10 h-6 rounded-full p-1 transition-all ${researchFormData.hasChanged ? 'bg-rose-500' : 'bg-stone-200'}`}>
                              <div className={`w-4 h-4 bg-white rounded-full transition-all ${researchFormData.hasChanged ? 'mr-4' : 'mr-0'}`} />
                           </div>
                        </div>
                     </div>

                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">ملاحظات إضافية وتفاصيل البحث</label>
                        <textarea 
                          className="w-full p-4 bg-stone-50 border border-stone-100 rounded-[2rem] h-32 outline-none focus:border-emerald-500 font-bold text-right"
                          placeholder="اكتب هنا كافة تفاصيل الحالة وما استجد من ظروف..."
                          value={researchFormData.notes}
                          onChange={(e) => setResearchFormData({...researchFormData, notes: e.target.value})}
                        />
                     </div>
                  </div>

                  <div className="flex gap-4 pt-4 sticky bottom-0 bg-white py-4 border-t border-stone-50">
                     <button 
                       type="button"
                       onClick={() => setShowAddResearch(false)}
                       className="flex-1 bg-stone-100 text-stone-600 py-4 rounded-2xl font-black hover:bg-stone-200 transition-all"
                     >
                       إلغاء وتراجع
                     </button>
                     <button 
                       type="submit"
                       className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all"
                     >
                       <Save className="w-5 h-5" />
                       حفظ البحث في ملف الحالة
                     </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Import Excel Mapping Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10 text-right">
                <button onClick={() => setShowImportModal(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="text-2xl font-black text-emerald-950">استيراد بيانات من Excel</h2>
                  <p className="text-stone-400 font-bold">يرجى ربط أعمدة ملف Excel بالحقول المطلوبة</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 mb-6 text-right">
                  <p className="text-amber-800 text-sm font-bold leading-relaxed">
                    تم اكتشاف {importData.length} صف في الملف. يرجى اختيار العمود المقابل لكل حقل من القائمة أدناه. الحقول المميزة بـ (*) ضرورية.
                  </p>
                </div>

                {/* Social Status Configuration Section */}
                <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 text-right space-y-4">
                  <span className="text-emerald-950 font-black text-sm block">الحالة الاجتماعية للحالات المستوردة:</span>
                  <div className="flex flex-row-reverse gap-6 justify-start">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-900 text-sm">
                      <input 
                        type="radio" 
                        name="importSocialStatusOption" 
                        value="fixed" 
                        checked={importSocialStatusOption === 'fixed'} 
                        onChange={() => setImportSocialStatusOption('fixed')}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-stone-300"
                      />
                      <span>تحديد حالة موحدة للجميع</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-900 text-sm">
                      <input 
                        type="radio" 
                        name="importSocialStatusOption" 
                        value="mapping" 
                        checked={importSocialStatusOption === 'mapping'} 
                        onChange={() => setImportSocialStatusOption('mapping')}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-stone-300"
                      />
                      <span>ربطها بعمود في ملف الـ Excel</span>
                    </label>
                  </div>

                  {importSocialStatusOption === 'fixed' ? (
                    <div className="pt-2">
                      <label className="text-xs font-black text-emerald-800 block mb-1">اختر الحالة الاجتماعية الموحدة:</label>
                      <select 
                        className="w-full bg-white border border-emerald-200 p-4 rounded-2xl outline-none font-bold text-right focus:border-emerald-500"
                        value={fixedImportSocialStatus}
                        onChange={(e) => setFixedImportSocialStatus(e.target.value)}
                      >
                        {SOCIAL_STATUS_OPTIONS.map((status, idx) => (
                          <option key={idx} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-emerald-700 text-xs font-bold leading-relaxed">
                      يرجى ربط حقل "الحالة الاجتماعية" بالعمود المقابل له في ملف Excel من القائمة أدناه.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(() => {
                    const fields = [
                      { id: 'name', label: 'اسم المستفيد', required: true },
                      { id: 'nationalId', label: 'الرقم القومي', required: true },
                      { id: 'phone', label: 'رقم الهاتف', required: false },
                      { id: 'village', label: 'القرية', required: false },
                      { id: 'address', label: 'العنوان', required: false },
                      { id: 'familyCount', label: 'عدد أفراد الأسرة', required: false },
                      { id: 'quantity', label: 'الكمية', required: true },
                    ];
                    if (importSocialStatusOption === 'mapping') {
                      fields.push({ id: 'socialStatus', label: 'الحالة الاجتماعية', required: true });
                    }
                    return fields;
                  })().map((field) => (
                    <div key={field.id} className="space-y-1 text-right">
                      <label className="text-xs font-black text-stone-500 pr-2">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </label>
                      <select 
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right focus:border-blue-500"
                        value={columnMapping[field.id]}
                        status={columnMapping[field.id] ? 'success' : 'default'}
                        onChange={(e) => setColumnMapping({...columnMapping, [field.id]: e.target.value})}
                      >
                        <option value="">-- اختر العمود --</option>
                        {importHeaders.map((header, idx) => (
                          <option key={idx} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="pt-8">
                  <button 
                    disabled={
                      loading || 
                      !columnMapping.name || 
                      !columnMapping.nationalId || 
                      !columnMapping.quantity || 
                      (importSocialStatusOption === 'mapping' && !columnMapping.socialStatus)
                    }
                    onClick={processImport}
                    className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 disabled:bg-stone-300 disabled:shadow-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>جاري الاستيراد...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-6 h-6" />
                        <span>بدء عملية الاستيراد</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Committee Names Modal */}
      <AnimatePresence>
        {showCommitteeModal && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 text-right"
            >
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-stone-100">
                <button onClick={() => setShowCommitteeModal(false)} className="p-2 bg-stone-50 text-stone-400 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-black text-emerald-950">بيانات لجنة التوزيع</h2>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <p className="text-sm font-bold text-stone-500">أعضاء اللجنة (٣ أسماء):</p>
                  {committeeMembers.map((name, idx) => (
                    <div key={idx}>
                      <FormField 
                        label={`عضو اللجنة ${idx + 1}`}
                        icon={<Users className="w-5 h-5 text-emerald-400" />}
                        placeholder="اكتب الاسم هنا"
                        value={name}
                        onChange={(val) => {
                          const newMembers = [...committeeMembers];
                          newMembers[idx] = val;
                          setCommitteeMembers(newMembers);
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-stone-100">
                  <FormField 
                    label="رئيس مجلس الإدارة"
                    icon={<Heart className="w-5 h-5 text-rose-400" />}
                    placeholder="اكتب الاسم هنا"
                    value={chairmanName}
                    onChange={(val) => setChairmanName(val)}
                  />
                </div>

                <div className="pt-4 border-t border-stone-100 space-y-4">
                  <p className="text-sm font-bold text-stone-500">تخصيص أعمدة الكشف:</p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {[
                      { key: 'showIndex', label: 'م (التسلسل)' },
                      { key: 'showCaseCode', label: 'كود الحالة' },
                      { key: 'showName', label: 'الاسم' },
                      { key: 'showNationalId', label: 'الرقم القومي' },
                      { key: 'showPhone', label: 'رقم الهاتف' },
                      { key: 'showVillage', label: 'القرية' },
                      { key: 'showFamilyCount', label: 'عدد الأسرة' },
                      { key: 'showAddress', label: 'العنوان' },
                      { key: 'showQuantity', label: 'الكمية' },
                      { key: 'showSignature', label: 'خانة التوقيع' },
                    ].map((col) => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${printSettings[col.key as keyof typeof printSettings] ? 'bg-emerald-600 border-emerald-600' : 'border-stone-200 group-hover:border-emerald-300'}`}>
                          {printSettings[col.key as keyof typeof printSettings] && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={printSettings[col.key as keyof typeof printSettings]}
                          onChange={(e) => setPrintSettings(prev => ({ ...prev, [col.key]: e.target.checked }))}
                        />
                        <span className={`text-xs font-bold ${printSettings[col.key as keyof typeof printSettings] ? 'text-emerald-900' : 'text-stone-500'}`}>
                          {col.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <button 
                    onClick={() => {
                      printDistributionList();
                      setShowCommitteeModal(false);
                    }}
                    className="flex-grow bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                  >
                    <Printer className="w-5 h-5" />
                    <span>طباعة الكشف</span>
                  </button>
                  <button 
                    onClick={() => setShowCommitteeModal(false)}
                    className="px-6 bg-stone-100 text-stone-600 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
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
    </div>
  );
}