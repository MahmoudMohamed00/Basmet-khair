// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, MapPin, Phone, User, FileText, Printer, Download, Trash2, Edit, X, Save, CheckCircle2, AlertCircle, FileCheck, ClipboardList, Users, Clock, DollarSign, Briefcase, GraduationCap, ArrowRightLeft, FileUp, Filter, Loader2, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, writeBatch, getDocs, limit } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import ConfirmModal from './ConfirmModal';
import UnifiedTransferModal from './UnifiedTransferModal';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';
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

interface Child {
  name: string;
  birthDate?: string;
  age: string;
  gender: string;
  education: string;
  schoolYear?: string;
}

interface ReceptionCase {
  id: string;
  serialNumber: number;
  caseCode?: string;
  name: string;
  nationalId: string;
  phone: string;
  address: string;
  village: string;
  familyCount: number;
  spouseName: string;
  caseType: 'orphan' | 'widow' | 'sick' | 'divorced' | 'needing' | 'marriage' | 'other';
  researchResult: 'accepted' | 'rejected' | 'in_progress';
  incomeSource: 'pension' | 'insurance' | 'salary' | 'other' | 'none';
  incomeSourceOther?: string;
  monthlyIncome: number;
  monthlyExpenses: {
    living: number;
    school: number;
    medical: number;
    other: number;
  };
  familyMembers: FamilyMember[];
  children: Child[];
  notes: string;
  receptionistEvaluation: number;
  status: 'pending' | 'referred';
  attachments?: Record<string, FileAttachment[]>;
  createdAt: any;
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
  'الفرقة الأولى',
  'الفرقة الثانية',
  'الفرقة الثالثة',
  'الفرقة الرابعة',
  'الفرقة الخامسة',
  'الفرقة السادسة',
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

const RECEPTION_COLUMNS_INFO = [
  { key: 'code', label: 'كود الحالة/المسلسل' },
  { key: 'name', label: 'الاسم' },
  { key: 'nationalId', label: 'الرقم القومي' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'address', label: 'العنوان بالتفصيل' },
  { key: 'village', label: 'القرية' },
  { key: 'familyCount', label: 'عدد أفراد الأسرة' },
  { key: 'spouseName', label: 'اسم الزوج/الزوجة' },
  { key: 'caseType', label: 'نوع الحالة' },
  { key: 'researchResult', label: 'نتيجة البحث' },
  { key: 'incomeSource', label: 'مصدر الدخل' },
  { key: 'monthlyIncome', label: 'الدخل الشهري' },
  { key: 'receptionistEvaluation', label: 'التقييم' },
  { key: 'notes', label: 'ملاحظات' }
];

export default function ReceptionScreen() {
  const [cases, setCases] = useState<ReceptionCase[]>([]);
  const [showPrintColsModal, setShowPrintColsModal] = useState(false);
  const [printCols, setPrintCols] = useState<string[]>(['code', 'name', 'nationalId', 'phone', 'village', 'caseType', 'researchResult']);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCaseType, setFilterCaseType] = useState<string>('all');
  const [filterResearchResult, setFilterResearchResult] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCase, setEditingCase] = useState<ReceptionCase | null>(null);
  const [unifiedTransferCase, setUnifiedTransferCase] = useState<any>(null);
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const initialForm = {
    name: '',
    caseCode: '',
    nationalId: '',
    phone: '',
    address: '',
    village: '',
    familyCount: 1,
    spouseName: '',
    caseType: 'needing' as const,
    researchResult: 'in_progress' as const,
    applicationDate: new Date().toISOString().split('T')[0],
    incomeSource: 'none' as const,
    incomeSourceOther: '',
    monthlyIncome: 0,
    monthlyExpenses: {
      living: 0,
      school: 0,
      medical: 0,
      other: 0,
    },
    familyMembers: [] as FamilyMember[],
    children: [] as Child[],
    notes: '',
    receptionistEvaluation: 5,
    attachments: {
      nationalId: [],
      birthCert: [],
      personalPhotos: [],
      socialSearch: [],
      deathCert: [],
      insurancePrint: [],
      medicalReport: [],
      schoolCerts: []
    } as Record<string, FileAttachment[]>,
    status: 'pending' as const
  };

  const [formData, setFormData] = useState(initialForm);

  const getSafeAttachments = (attInput: any): Record<string, FileAttachment[]> => {
    const defaultAtts = {
      nationalId: [],
      birthCert: [],
      personalPhotos: [],
      socialSearch: [],
      deathCert: [],
      insurancePrint: [],
      medicalReport: [],
      schoolCerts: []
    };
    if (!attInput) return defaultAtts;
    if (Array.isArray(attInput)) {
      return {
        ...defaultAtts,
        nationalId: attInput
      };
    }
    return {
      nationalId: attInput.nationalId || [],
      birthCert: attInput.birthCert || [],
      personalPhotos: attInput.personalPhotos || [],
      socialSearch: attInput.socialSearch || [],
      deathCert: attInput.deathCert || [],
      insurancePrint: attInput.insurancePrint || [],
      medicalReport: attInput.medicalReport || [],
      schoolCerts: attInput.schoolCerts || []
    };
  };

  const handleEditClick = (c: ReceptionCase) => {
    setEditingCase(c);
    setFormData({
      ...initialForm,
      ...c,
      attachments: getSafeAttachments(c.attachments)
    });
    setShowAddForm(true);
  };

  useEffect(() => {
    const q = query(collection(db, 'reception_cases'), orderBy('serialNumber', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReceptionCase));
      setCases(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reception_cases'));

    return () => unsubscribe();
  }, []);

  const getNextSerialNumber = () => {
    if (cases.length === 0) return 1;
    return Math.max(...cases.map(c => c.serialNumber)) + 1;
  };

  const generateCaseCode = (list: ReceptionCase[]) => {
    const lastNum = list
      .map(c => c.caseCode)
      .filter(c => c?.startsWith('M'))
      .map(c => {
        const numPart = c?.substring(1);
        return numPart ? parseInt(numPart) : 0;
      })
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a)[0] || 0;
    return `M${lastNum + 1}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isEdit = editingCase;

    const performSave = async () => {
      try {
        setLoading(true);
        if (isEdit) {
          await updateDoc(doc(db, 'reception_cases', editingCase.id), {
            ...formData,
            updatedAt: serverTimestamp()
          });
          alert('تم تحديث البيانات بنجاح');
        } else {
          const serial = getNextSerialNumber();
          const code = formData.caseCode || generateCaseCode(cases);
          await addDoc(collection(db, 'reception_cases'), {
            ...formData,
            caseCode: code,
            serialNumber: serial,
            createdAt: serverTimestamp()
          });
          
          // Also add to global cases collection as requested
          await addDoc(collection(db, 'cases'), {
             name: formData.name,
             caseCode: code,
             nationalId: formData.nationalId,
             phone: formData.phone,
             address: formData.address,
             familyCount: formData.familyCount,
             spouseName: formData.spouseName,
             description: `تم الإضافة من قسم الاستقبال. ${formData.notes}`,
             status: 'pending',
             categories: ['أخرى'],
             children: formData.children,
             attachments: getSafeAttachments(formData.attachments),
             createdAt: serverTimestamp()
          });

          alert('تم تسجيل الحالة بنجاح وإضافتها لكشف الحالات العام');
        }
        setFormData(initialForm);
        setShowAddForm(false);
        setEditingCase(null);
      } catch (err) {
        console.error(err);
        handleFirestoreError(err, OperationType.WRITE, isEdit ? `reception_cases/${editingCase.id}` : 'reception_cases');
      } finally {
        setLoading(false);
      }
    };

    if (!isEdit) {
      setLoading(true);
      let duplicateWarnings: string[] = [];
      try {
        duplicateWarnings = await checkDuplicateCase(formData.name, formData.nationalId);
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

  const handleDelete = async (id: string, name: string) => {
    const caseData = cases.find(c => c.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف حالة رقمية',
      message: `هل أنت متأكد من حذف بيانات الحالة: ${name}؟ سيتم حذفها نهائياً.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'reception_cases', id));
          if (caseData) {
            await logSystemAction('delete', 'reception_cases', id, caseData, `حذف حالة استقبال: ${name}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `reception_cases/${id}`);
        }
      }
    });
  };



  const addFamilyMember = () => {
    setFormData(prev => ({
      ...prev,
      familyMembers: [...prev.familyMembers, { name: '', relationship: 'الزوج/ه', relationshipOther: '', nationalId: '', age: '', workOrSchool: '' }]
    }));
  };

  const removeFamilyMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      familyMembers: prev.familyMembers.filter((_, i) => i !== index)
    }));
  };

  const updateFamilyMember = (index: number, field: string, value: string) => {
    setFormData(prev => {
      const newMembers = [...prev.familyMembers];
      newMembers[index] = { ...newMembers[index], [field]: value };
      if (field === 'nationalId') {
        const calculated = calculateAgeFromNationalId(value);
        if (calculated) {
          newMembers[index].age = calculated;
        }
      }
      return { ...prev, familyMembers: newMembers };
    });
  };

  const addChild = () => {
    setFormData(prev => ({
      ...prev,
      children: [...prev.children, { name: '', birthDate: '', age: '', gender: 'ذكر', education: 'رياض أطفال / حضانة', schoolYear: 'لا ينطبق' }]
    }));
  };

  const removeChild = (index: number) => {
    setFormData(prev => ({
      ...prev,
      children: prev.children.filter((_, i) => i !== index)
    }));
  };

  const updateChild = (index: number, field: string, value: string) => {
    setFormData(prev => {
      const newChildren = [...prev.children];
      newChildren[index] = { ...newChildren[index], [field]: value };
      if (field === 'birthDate') {
        const calculated = calculateAgeFromBirthDate(value);
        if (calculated) {
          newChildren[index].age = calculated;
        }
      }
      return { ...prev, children: newChildren };
    });
  };

  const exportToExcel = () => {
    const data = cases.map(c => ({
      'الكود': c.caseCode || c.serialNumber,
      'الاسم': c.name,
      'الرقم القومي': c.nationalId,
      'الهاتف': c.phone,
      'القرية': c.village,
      'العنوان': c.address,
      'نوع الحالة': c.caseType,
      'نتيجة البحث': c.researchResult,
      'الدخل الشهري': c.monthlyIncome,
      'مصدر الدخل': c.incomeSource === 'other' ? c.incomeSourceOther : c.incomeSource,
      'مصاريف المعيشة': c.monthlyExpenses.living,
      'مصاريف الدراسة': c.monthlyExpenses.school,
      'الحالة': c.status === 'pending' ? 'قيد الانتظار' : 'تم التحويل',
      'عدد الأطفال': c.children.length,
      'ملاحظات': c.notes
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reception");
    XLSX.writeFile(wb, "سجل_الاستقبال.xlsx");
  };

  const handlePrintWithSelectedCols = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const headerHtml = RECEPTION_COLUMNS_INFO
      .filter((col) => printCols.includes(col.key))
      .map((col) => `<th>${col.label}</th>`)
      .join('');

    const rowsHtml = filteredCases.map((c, i) => {
      const cellsHtml = RECEPTION_COLUMNS_INFO
        .filter((col) => printCols.includes(col.key))
        .map((col) => {
          let val = '';
          if (col.key === 'code') {
            val = c.caseCode || String(c.serialNumber);
          } else if (col.key === 'name') {
            val = c.name;
          } else if (col.key === 'nationalId') {
            val = c.nationalId || '-';
          } else if (col.key === 'phone') {
            val = c.phone || '-';
          } else if (col.key === 'address') {
            val = c.address || '-';
          } else if (col.key === 'village') {
            val = c.village || '-';
          } else if (col.key === 'familyCount') {
            val = String(c.familyCount || 0);
          } else if (col.key === 'spouseName') {
            val = c.spouseName || '-';
          } else if (col.key === 'caseType') {
            val = c.caseType === 'orphan' ? 'يتيم' : c.caseType === 'widow' ? 'أرملة' : c.caseType === 'sick' ? 'مريض' : c.caseType === 'divorced' ? 'مطلقة' : c.caseType === 'needing' ? 'محتاج' : c.caseType === 'marriage' ? 'زواج' : 'أخرى';
          } else if (col.key === 'researchResult') {
            val = c.researchResult === 'accepted' ? 'قبول' : c.researchResult === 'rejected' ? 'رفض' : 'جاري البحث';
          } else if (col.key === 'incomeSource') {
            val = c.incomeSource === 'pension' ? 'معاش' : c.incomeSource === 'insurance' ? 'تأمين' : c.incomeSource === 'salary' ? 'مرتب' : c.incomeSource === 'none' ? 'لا يوجد' : 'أخرى';
          } else if (col.key === 'monthlyIncome') {
            val = `${c.monthlyIncome || 0} ج.م`;
          } else if (col.key === 'receptionistEvaluation') {
            val = `${c.receptionistEvaluation ?? 5} / 10`;
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
          <title>كشف سجل حالات الاستقبال</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: center; font-size: 14px; }
            th { background-color: #f8fafc; font-weight: bold; }
            h1 { text-align: center; color: #065f46; }
          </style>
        </head>
        <body>
          <h1>كشف سجل حالات الاستقبال</h1>
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
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const printCase = (c: ReceptionCase) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = `
      <html>
        <head>
          <title>استمارة استقبال - ${c.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 2px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
            .section { margin-bottom: 25px; border: 1px solid #eee; padding: 15px; border-radius: 10px; }
            .section-title { font-weight: bold; color: #059669; border-bottom: 1px solid #eee; margin-bottom: 15px; padding-bottom: 5px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 13px; }
            th { background: #f9f9f9; }
            .case-badge { display: inline-block; padding: 5px 15px; border-radius: 5px; background: #f0fdf4; color: #166534; font-weight: bold; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>استمارة استقبال حالة جديدة</h1>
            <p><strong>كود الحالة: ${c.caseCode || '---'}</strong></p>
            <div class="case-badge">نوع الحالة: ${c.caseType} - نتيجة البحث: ${c.researchResult}</div>
          </div>
          <div class="section">
            <div class="section-title">البيانات الأساسية</div>
            <div class="grid">
              <p><strong>الاسم:</strong> ${c.name}</p>
              <p><strong>الرقم القومي:</strong> ${c.nationalId}</p>
              <p><strong>الهاتف:</strong> ${c.phone}</p>
              <p><strong>القرية:</strong> ${c.village}</p>
              <p><strong>العنوان:</strong> ${c.address}</p>
              <p><strong>اسم الزوج/الزوجة:</strong> ${c.spouseName}</p>
              <p><strong>عدد أفراد الأسرة:</strong> ${c.familyCount}</p>
            </div>
          </div>
          <div class="section">
            <div class="section-title">أفراد الأسرة</div>
            ${c.familyMembers.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>صلة القرابة</th>
                    <th>الرقم القومي</th>
                    <th>العمر</th>
                    <th>العمل/المدرسة</th>
                  </tr>
                </thead>
                <tbody>
                  ${c.familyMembers.map(m => `
                    <tr>
                      <td>${m.name}</td>
                      <td>${m.relationship === 'آخر' ? (m.relationshipOther || 'آخر') : (m.relationship || '---')}</td>
                      <td>${m.nationalId || '---'}</td>
                      <td>${m.age}</td>
                      <td>${m.workOrSchool}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p>لا يوجد أفراد أسرة مسجلين</p>'}
          </div>
          <div class="section">
            <div class="section-title">الوضع المالي (شهرياً)</div>
            <div class="grid">
              <p><strong>مصدر الدخل:</strong> ${c.incomeSource === 'other' ? c.incomeSourceOther : c.incomeSource}</p>
              <p><strong>القيمة:</strong> ${c.monthlyIncome} ج.م</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>معيشة</th>
                  <th>دراسة</th>
                  <th>علاج</th>
                  <th>أخرى</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${c.monthlyExpenses.living}</td>
                  <td>${c.monthlyExpenses.school}</td>
                  <td>${c.monthlyExpenses.medical}</td>
                  <td>${c.monthlyExpenses.other}</td>
                  <td>${Object.values(c.monthlyExpenses).reduce((a, b) => a + b, 0)} ج.م</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="section">
            <div class="section-title">الأبناء</div>
            ${c.children.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>تاريخ الميلاد</th>
                    <th>العمر</th>
                    <th>الجنس</th>
                    <th>المرحلة التعليمية</th>
                    <th>السنة الدراسية</th>
                  </tr>
                </thead>
                <tbody>
                  ${c.children.map(child => `
                    <tr>
                      <td>${child.name}</td>
                      <td>${child.birthDate || '---'}</td>
                      <td>${child.age}</td>
                      <td>${child.gender}</td>
                      <td>${child.education}</td>
                      <td>${child.schoolYear || '---'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p>لا يوجد أبناء مسجلين</p>'}
          </div>
          <div class="section">
            <div class="section-title">ملاحظات إضافية</div>
            <p>${c.notes || 'لا يوجد'}</p>
          </div>
          <div style="margin-top: 50px; display: flex; justify-content: space-between;">
            <p>توقيع موظف الاستقبال: ...........................</p>
            <p>توقيع الباحث: ...........................</p>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = c.name.includes(searchQuery) || 
      c.nationalId.includes(searchQuery) || 
      c.phone.includes(searchQuery) ||
      (c.caseCode && c.caseCode.includes(searchQuery)) ||
      String(c.serialNumber).includes(searchQuery);
    
    const matchesType = filterCaseType === 'all' || c.caseType === filterCaseType;
    const matchesResult = filterResearchResult === 'all' || c.researchResult === filterResearchResult;

    return matchesSearch && matchesType && matchesResult;
  });

  return (
    <div className="p-6 space-y-6 text-right font-sans" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-emerald-50">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-600 p-4 rounded-2xl shadow-lg">
            <Users className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-emerald-950">قسم الاستقبال</h1>
            <p className="text-emerald-600 font-bold text-sm">تسجيل ومتابعة الحالات الجديدة</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="p-3 bg-white border border-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-50">
            <Download className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setEditingCase(null); setFormData(initialForm); setShowAddForm(true); }}
            className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>تسجيل حالة جديدة</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm flex items-center justify-between">
          <div className="text-right">
            <p className="text-xs font-bold text-stone-400 mb-1">إجمالي المسجلين</p>
            <p className="text-2xl font-black text-emerald-900">{cases.length}</p>
          </div>
          <Users className="w-8 h-8 text-emerald-100" />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm flex items-center justify-between">
          <div className="text-right">
            <p className="text-xs font-bold text-stone-400 mb-1">حالات قيد الانتظار</p>
            <p className="text-2xl font-black text-amber-600">{cases.filter(c => c.status === 'pending').length}</p>
          </div>
          <Clock className="w-8 h-8 text-amber-100" />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm flex items-center justify-between">
          <div className="text-right">
            <p className="text-xs font-bold text-stone-400 mb-1">متوسط الدخل</p>
            <p className="text-2xl font-black text-emerald-900">
              {cases.length > 0 ? Math.round(cases.reduce((acc, c) => acc + c.monthlyIncome, 0) / cases.length) : 0} ج.م
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-emerald-100" />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-6 rounded-3xl border border-emerald-50 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-300 w-5 h-5" />
            <input 
              type="text" 
              placeholder="ابحث بالاسم، الرقم القومي، الهاتف أو الكود..."
              className="w-full bg-stone-50 border border-emerald-50 pr-12 pl-6 py-4 rounded-2xl outline-none focus:border-emerald-500 font-bold"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="bg-stone-50 border border-emerald-50 px-6 py-4 rounded-2xl font-bold outline-none focus:border-emerald-500 text-right"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
          >
            <option value="desc">الأحدث أولاً</option>
            <option value="asc">الأقدم أولاً</option>
          </select>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-2xl border border-stone-100">
            <Filter className="w-5 h-5 text-emerald-600 mr-2" />
            <select 
              className="bg-transparent font-bold outline-none flex-grow text-right"
              value={filterCaseType}
              onChange={(e) => setFilterCaseType(e.target.value)}
            >
              <option value="all">كل أنواع الحالات</option>
              <option value="needing">محتاج</option>
              <option value="orphan">يتيم</option>
              <option value="widow">أرملة</option>
              <option value="sick">مريض</option>
              <option value="divorced">مطلقة</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-2xl border border-stone-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mr-2" />
            <select 
              className="bg-transparent font-bold outline-none flex-grow text-right"
              value={filterResearchResult}
              onChange={(e) => setFilterResearchResult(e.target.value)}
            >
              <option value="all">كل نتائج البحث</option>
              <option value="in_progress">جاري البحث</option>
              <option value="accepted">قبول</option>
              <option value="rejected">رفض</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cases List - Table View */}
      <div className="bg-white rounded-3xl border border-emerald-50 shadow-sm overflow-hidden list-container">
        <div className="p-6 border-b border-emerald-50 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-emerald-950 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-emerald-600" />
            سجل الحالات بالتفصيل
          </h2>
          <div className="flex gap-2">
             <button 
              onClick={() => setShowPrintColsModal(true)}
              className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-100"
             >
               <Printer className="w-4 h-4" />
               طباعة الكشف الحالي
             </button>
             <button onClick={exportToExcel} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700">
               <Download className="w-4 h-4" />
               تصدير Excel
             </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50/50 border-b border-emerald-50">
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50 w-24 text-center">الكود</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50">اسم الحالة</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50">الرقم القومي</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50">الهاتف</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50">القرية</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50">نوع الحالة</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50">نتيجة البحث</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50 text-center">التقييم</th>
                <th className="p-4 text-sm font-black text-emerald-900 border-l border-emerald-50">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode='popLayout'>
                {filteredCases.map((c, index) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={c.id}
                    className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors group"
                  >
                    <td className="p-4 font-black text-emerald-600 text-center border-l border-gray-50">{c.caseCode || c.serialNumber}</td>
                    <td className="p-4 border-l border-gray-50">
                      <div className="font-black text-emerald-950">{c.name}</div>
                      <div className="text-[10px] text-stone-400 font-bold">{c.address}</div>
                    </td>
                    <td className="p-4 font-bold text-stone-600 border-l border-gray-50">{c.nationalId}</td>
                    <td className="p-4 font-bold text-stone-600 border-l border-gray-50">{c.phone}</td>
                    <td className="p-4 font-bold text-stone-600 border-l border-gray-50">{c.village}</td>
                    <td className="p-4 border-l border-gray-50">
                       <span className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-full font-bold">
                         {c.caseType === 'orphan' ? 'يتيم' : c.caseType === 'widow' ? 'أرملة' : c.caseType === 'sick' ? 'مريض' : c.caseType === 'divorced' ? 'مطلقة' : c.caseType === 'needing' ? 'محتاج' : 'أخرى'}
                       </span>
                    </td>
                    <td className="p-4 border-l border-gray-50 text-center">
                       <span className={cn(
                         "text-xs px-3 py-1 rounded-full font-bold",
                         c.researchResult === 'accepted' ? "bg-emerald-100 text-emerald-700" :
                         c.researchResult === 'rejected' ? "bg-rose-100 text-rose-700" :
                         "bg-amber-100 text-amber-700"
                       )}>
                         {c.researchResult === 'accepted' ? 'قبول' : c.researchResult === 'rejected' ? 'رفض' : 'جاري البحث'}
                       </span>
                    </td>
                    <td className="p-4 border-l border-gray-50 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={cn(
                          "font-black",
                          c.receptionistEvaluation >= 8 ? 'text-emerald-600' :
                          c.receptionistEvaluation >= 5 ? 'text-amber-600' :
                          'text-rose-600'
                        )}>{c.receptionistEvaluation ?? 5}</span>
                        <span className="text-stone-300 text-xs text-center">/10</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => handleEditClick(c)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل"><Edit className="w-4 h-4"/></button>
                        <button onClick={() => printCase(c)} className="p-2 text-stone-500 hover:bg-stone-50 rounded-lg transition-colors" title="طباعة الاستمارة"><FileText className="w-4 h-4"/></button>
                        <button 
                          onClick={() => setUnifiedTransferCase({
                            id: c.id,
                            name: c.name,
                            nationalId: c.nationalId,
                            phone: c.phone || '',
                            address: c.address || '',
                            village: c.village || '',
                            familyCount: Number(c.familyCount) || 1,
                            sourceSection: 'reception',
                            sourceSectionLabel: 'الاستقبال',
                            sourceCollection: 'reception_cases'
                          })} 
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" 
                          title="الربط والنقل بين الأقسام"
                        >
                          <ArrowRightLeft className="w-4 h-4"/>
                        </button>
                        <button onClick={() => handleDelete(c.id, c.name)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="حذف"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-20 text-center text-stone-400 font-bold">
                    لا توجد حالات تطابق البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-8 custom-scrollbar scroll-smooth"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10">
                <button onClick={() => setShowAddForm(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950">{editingCase ? 'تعديل بيانات الحالة' : 'تسجيل حالة استقبال جديدة'}</h2>
                  <p className="text-stone-400 font-bold">يرجى ملء كافة البيانات المطلوبة لتقييم الحالة</p>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-10">
                {/* Basic Info */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 justify-end border-r-4 border-emerald-500 pr-3">
                    <h3 className="text-lg font-black text-emerald-950">البيانات الشخصية</h3>
                    <User className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">كود الحالة (اختياري)</label>
                       <input 
                         type="text"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                         value={formData.caseCode || ''}
                         onChange={(e) => setFormData({...formData, caseCode: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">الاسم رباعي</label>
                       <input 
                         required
                         type="text"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                         value={formData.name || ''}
                         onChange={(e) => setFormData({...formData, name: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">الرقم القومي (١٤ رقم)</label>
                       <input 
                         required
                         type="text"
                         maxLength={14}
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                         value={formData.nationalId || ''}
                         onChange={(e) => setFormData({...formData, nationalId: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">رقم الهاتف</label>
                       <input 
                         required
                         type="tel"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                         value={formData.phone || ''}
                         onChange={(e) => setFormData({...formData, phone: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">القرية</label>
                       <input 
                         required
                         type="text"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                         value={formData.village || ''}
                         onChange={(e) => setFormData({...formData, village: e.target.value})}
                       />
                    </div>
                    <div className="col-span-full md:col-span-2 space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">العنوان بالتفصيل</label>
                       <input 
                         required
                         type="text"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                         value={formData.address || ''}
                         onChange={(e) => setFormData({...formData, address: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">نوع الحالة</label>
                       <select 
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                         value={formData.caseType}
                         onChange={(e) => setFormData({...formData, caseType: e.target.value as any})}
                       >
                         <option value="needing">محتاج</option>
                         <option value="orphan">يتيم</option>
                         <option value="widow">أرملة</option>
                         <option value="sick">مريض</option>
                         <option value="divorced">مطلقة</option>
                         <option value="marriage">زواج</option>
                         <option value="other">أخرى</option>
                       </select>
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">نتيجة البحث</label>
                       <select 
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                         value={formData.researchResult}
                         onChange={(e) => setFormData({...formData, researchResult: e.target.value as any})}
                       >
                         <option value="in_progress">جاري البحث</option>
                         <option value="accepted">قبول</option>
                         <option value="rejected">رفض</option>
                       </select>
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">تاريخ التقديم</label>
                        <input 
                          type="date"
                          className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right text-stone-800"
                          value={formData.applicationDate || ''}
                          onChange={(e) => setFormData({...formData, applicationDate: e.target.value})}
                        />
                     </div>
                     <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">تقييم موظف الاستقبال (0-10)</label>
                       <div className="flex items-center gap-4 bg-stone-50 p-3 rounded-2xl border border-stone-100">
                          <input 
                            type="range"
                            min="0"
                            max="10"
                            step="1"
                            className="flex-grow accent-emerald-600 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                            value={formData.receptionistEvaluation ?? 5}
                            onChange={(e) => setFormData({...formData, receptionistEvaluation: Number(e.target.value)})}
                          />
                          <span className="w-10 h-10 flex items-center justify-center bg-white border border-emerald-100 rounded-xl font-black text-emerald-900 shadow-sm">
                            {formData.receptionistEvaluation}
                          </span>
                       </div>
                    </div>
                  </div>
                </div>

                {/* Financial Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 justify-end border-r-4 border-amber-500 pr-3">
                    <h3 className="text-lg font-black text-emerald-950">الوضع المالي</h3>
                    <DollarSign className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">مصدر الدخل الأساسي</label>
                       <select 
                         className="w-full bg-white border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                         value={formData.incomeSource}
                         onChange={(e) => setFormData({...formData, incomeSource: e.target.value as any})}
                       >
                         <option value="none">لا يوجد</option>
                         <option value="pension">معاش</option>
                         <option value="insurance">تأمين</option>
                         <option value="salary">راتب/عمل</option>
                         <option value="other">أخرى</option>
                       </select>
                    </div>
                    {formData.incomeSource === 'other' && (
                      <div className="space-y-2">
                         <label className="text-xs font-bold text-stone-500 pr-2">حدد المصدر</label>
                         <input 
                           type="text"
                           className="w-full bg-white border border-stone-100 p-4 rounded-2xl outline-none font-bold"
                           value={formData.incomeSourceOther || ''}
                           onChange={(e) => setFormData({...formData, incomeSourceOther: e.target.value})}
                         />
                      </div>
                    )}
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">قيمة الدخل الشهري (ج.م)</label>
                       <input 
                         type="number"
                         className="w-full bg-white border border-stone-100 p-4 rounded-2xl outline-none font-bold"
                         value={formData.monthlyIncome ?? 0}
                         onChange={(e) => setFormData({...formData, monthlyIncome: Number(e.target.value)})}
                       />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف معيشة</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.living ?? 0}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, living: Number(e.target.value)}})}
                       />
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف دراسة</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.school ?? 0}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, school: Number(e.target.value)}})}
                       />
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف علاج</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.medical ?? 0}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, medical: Number(e.target.value)}})}
                       />
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف أخرى</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.other ?? 0}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, other: Number(e.target.value)}})}
                       />
                    </div>
                  </div>
                </div>

                {/* Family Members Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-r-4 border-emerald-500 pr-3">
                    <button 
                      type="button" 
                      onClick={addFamilyMember}
                      className="text-xs bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100"
                    >
                      + إضافة فرد
                    </button>
                    <div className="flex items-center gap-2">
                       <h3 className="text-lg font-black text-emerald-950">بيانات أفراد الأسرة</h3>
                       <Users className="w-5 h-5 text-emerald-600" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {formData.familyMembers.map((member, idx) => (
                      <div key={idx} className="bg-stone-50 p-6 rounded-3xl border border-stone-100 relative group">
                        <button 
                          type="button" 
                          onClick={() => removeFamilyMember(idx)}
                          className="absolute -top-3 -left-3 bg-white text-rose-500 p-2 rounded-full shadow-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-right">
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2 block">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-stone-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={member.name || ''}
                                onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)}
                                placeholder="الاسم الكامل للفرد"
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2 block">صلة القرابة</label>
                              <select 
                                className="w-full bg-white border border-stone-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
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
                                  className="w-full mt-1.5 bg-white border border-stone-100 p-2 rounded-lg outline-none font-bold text-right text-stone-800 text-xs"
                                  value={member.relationshipOther || ''}
                                  onChange={(e) => updateFamilyMember(idx, 'relationshipOther', e.target.value)}
                                  placeholder="صلة القرابة الأخرى..."
                                />
                              )}
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2 block">الرقم القومي (١٤ رقم)</label>
                              <input 
                                type="text"
                                maxLength={14}
                                className="w-full bg-white border border-stone-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm tabular-nums"
                                value={member.nationalId || ''}
                                onChange={(e) => updateFamilyMember(idx, 'nationalId', e.target.value)}
                                placeholder="٢٩٩٠١٠١..."
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2 block">العمر (تلقائي)</label>
                              <input 
                                type="text"
                                className="w-full bg-slate-50 border border-stone-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={member.age || ''}
                                onChange={(e) => updateFamilyMember(idx, 'age', e.target.value)}
                                placeholder="سيحدد تلقائياً"
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2 block">العمل / المدرسة</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-stone-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={member.workOrSchool || ''}
                                onChange={(e) => updateFamilyMember(idx, 'workOrSchool', e.target.value)}
                                placeholder="ما يعمله أو يدرسه"
                              />
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Children Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-r-4 border-blue-500 pr-3">
                    <button 
                      type="button" 
                      onClick={addChild}
                      className="text-xs bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold hover:bg-blue-100"
                    >
                      + إضافة ابن
                    </button>
                    <div className="flex items-center gap-2">
                       <h3 className="text-lg font-black text-emerald-950">بيانات الأبناء</h3>
                       <Users className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {formData.children.map((child, idx) => (
                      <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 relative group animate-in slide-in-from-right duration-300">
                        <button 
                          type="button" 
                          onClick={() => removeChild(idx)}
                          className="absolute -top-3 -left-3 bg-white text-rose-500 p-2 rounded-full shadow-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2 block">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={child.name || ''}
                                onChange={(e) => updateChild(idx, 'name', e.target.value)}
                                placeholder="اسم الابن"
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2 block">تاريخ الميلاد</label>
                              <input 
                                type="date"
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={child.birthDate || ''}
                                onChange={(e) => updateChild(idx, 'birthDate', e.target.value)}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2 block">العمر (تلقائي)</label>
                              <input 
                                type="text"
                                className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={child.age || ''}
                                onChange={(e) => updateChild(idx, 'age', e.target.value)}
                                placeholder="سيحدد تلقائياً"
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2 block">المرحلة الدراسية</label>
                              <select 
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={child.education || 'رياض أطفال / حضانة'}
                                onChange={(e) => updateChild(idx, 'education', e.target.value)}
                              >
                                {EDUCATIONAL_STAGES.map(stage => (
                                  <option key={stage} value={stage}>{stage}</option>
                                ))}
                              </select>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2 block">السنة الدراسية</label>
                              <select 
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
                                value={child.schoolYear || 'لا ينطبق'}
                                onChange={(e) => updateChild(idx, 'schoolYear', e.target.value)}
                              >
                                {SCHOOL_YEARS.map(yr => (
                                  <option key={yr} value={yr}>{yr}</option>
                                ))}
                              </select>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2 block">الجنس</label>
                              <select 
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right text-stone-800 text-sm"
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
                    {formData.children.length === 0 && (
                      <div className="text-center py-8 bg-stone-50 rounded-3xl border-2 border-dashed border-stone-100 text-stone-400 font-bold">
                        لم يتم إضافة أبناء لهذه الحالة بعد
                      </div>
                    )}
                  </div>
                </div>

                {/* Documents Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 justify-end border-r-4 border-emerald-500 pr-3">
                    <h3 className="text-lg font-black text-emerald-950">الأوراق المطلوبة (تحميل الملفات)</h3>
                    <UploadCloud className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <FileUploadSlot 
                      label="البطاقة الشخصية" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.nationalId || []) : updater;
                        return { ...prev, attachments: { ...att, nationalId: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).nationalId}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                    <FileUploadSlot 
                      label="شهادات الميلاد" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.birthCert || []) : updater;
                        return { ...prev, attachments: { ...att, birthCert: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).birthCert}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                    <FileUploadSlot 
                      label="صور شخصية" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.personalPhotos || []) : updater;
                        return { ...prev, attachments: { ...att, personalPhotos: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).personalPhotos}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                    <FileUploadSlot 
                      label="بحث اجتماعي" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.socialSearch || []) : updater;
                        return { ...prev, attachments: { ...att, socialSearch: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).socialSearch}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                    <FileUploadSlot 
                      label="شهادة وفاة" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.deathCert || []) : updater;
                        return { ...prev, attachments: { ...att, deathCert: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).deathCert}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                    <FileUploadSlot 
                      label="برينت تأميني" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.insurancePrint || []) : updater;
                        return { ...prev, attachments: { ...att, insurancePrint: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).insurancePrint}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                    <FileUploadSlot 
                      label="تقرير طبي" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.medicalReport || []) : updater;
                        return { ...prev, attachments: { ...att, medicalReport: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).medicalReport}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                    <FileUploadSlot 
                      label="افادات مدرسية" 
                      onUpload={(updater) => setFormData(prev => {
                        const att = getSafeAttachments(prev.attachments);
                        const next = typeof updater === 'function' ? updater(att.schoolCerts || []) : updater;
                        return { ...prev, attachments: { ...att, schoolCerts: next } };
                      })} 
                      values={getSafeAttachments(formData.attachments).schoolCerts}
                      caseName={formData.name || 'حالة_استقبال'}
                      storagePath="reception/docs"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-4">
                  <label className="text-sm font-black text-emerald-900 block text-right pr-2">ملاحظات موظف الاستقبال</label>
                  <textarea 
                    className="w-full bg-stone-50 border border-stone-100 p-6 rounded-[2rem] min-h-[150px] outline-none focus:border-emerald-500 font-bold text-right"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="اكتب أي معلومات إضافية عن الحالة والبحث السريع..."
                  />
                </div>

                {/* Footer Actions */}
                <div className="flex flex-row-reverse gap-4 pt-8">
                   <button 
                    type="submit"
                    className="flex-grow bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all"
                   >
                     {editingCase ? 'حفظ التعديلات' : 'تأكيد وحفظ بيانات الحالة'}
                   </button>
                   <button 
                    type="button"
                    onClick={() => setShowAddForm(false)}
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
                  تخصيص أعمدة الطباعة للكشف
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
                قم بتحديد الخانات التي تود أن تظهر في الكشف المطبوع. يمكنك اختيار أي عدد من الخانات لعرضها في جدول الطباعة:
              </p>

              <div className="flex gap-4 mb-4">
                <button 
                  type="button"
                  onClick={() => setPrintCols(RECEPTION_COLUMNS_INFO.map(c => c.key))}
                  className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs hover:bg-emerald-100 transition-colors"
                >
                  اختيار الكل
                </button>
                <button 
                  type="button"
                  onClick={() => setPrintCols(['code', 'name'])}
                  className="px-4 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl text-xs hover:bg-stone-200 transition-colors"
                >
                  إلغاء تحديد الكل
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-80 overflow-y-auto p-2 border border-stone-100 rounded-2xl bg-stone-50">
                {RECEPTION_COLUMNS_INFO.map((col) => {
                  const isChecked = printCols.includes(col.key);
                  return (
                    <label 
                      key={col.key}
                      className={cn(
                        "flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all font-bold text-sm",
                        isChecked 
                          ? "bg-white border-emerald-500 text-emerald-950 shadow-sm"
                          : "bg-white/70 border-stone-200 text-stone-500 hover:border-stone-300"
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
                    handlePrintWithSelectedCols();
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