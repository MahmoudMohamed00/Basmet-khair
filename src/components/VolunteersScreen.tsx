// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Plus, Search, Phone, User, Tag, Info, X, Users, Heart, Loader2, Trash2, Mail, Briefcase, Clock, Calendar, UploadCloud, Download, CheckCircle2, AlertCircle, FileCheck, FileText, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ConfirmModal from './ConfirmModal';
import * as XLSX from 'xlsx';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface Volunteer {
  id: string;
  volunteerCode?: string;
  name: string;
  phone: string;
  age: number;
  skills: string[];
  types: string[];
  availability: {
    day: string;
    from: string;
    to: string;
  }[];
  profilePhoto?: FileAttachment;
  attachments?: FileAttachment[];
  createdAt: any;
}

import Logo from './Logo';

const SKILLS_LIST = ['تصوير', 'مونتاج', 'كتابة محتوى', 'إدارة سوشيال ميديا', 'تنظيم فعاليات', 'قيادة سيارات', 'توزيع مساعدات', 'بحث ميداني', 'صيانة كمبيوتر', 'تصميم جرافيك', 'صناعة فيديوهات', 'إلقاء وقراءة', 'خياطة وأشغال يدوية', 'صيانة منزلية', 'ترجمة', 'طبخ', 'أخرى'];
const DAYS_LIST = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const InputField = ({ label, value, onChange, icon, type = "text", required = false }: any) => (
  <div className="space-y-1 text-right">
    <label className="text-sm font-bold text-emerald-800">{label}</label>
    <div className="relative">
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-emerald-50 p-3 pr-10 rounded-xl border border-emerald-100 outline-none focus:border-emerald-500 transition-all font-bold"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
        {icon}
      </div>
    </div>
  </div>
);

export default function VolunteersScreen() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const generateVolunteerCode = (list: Volunteer[]) => {
    const lastCode = list
      .map(v => v.volunteerCode)
      .filter(c => c?.startsWith('VOL-'))
      .map(c => parseInt(c?.split('-')[1] || '0'))
      .sort((a, b) => b - a)[0] || 0;
    return `VOL-${(lastCode + 1).toString().padStart(4, '0')}`;
  };

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

  const VOLUNTEER_MAPPING_FIELDS = [
    { id: 'name', label: 'الاسم الكامل' },
    { id: 'phone', label: 'رقم الهاتف' },
    { id: 'age', label: 'العمر' },
    { id: 'skills', label: 'المهارات' },
    { id: 'availability', label: 'مواعيد التفرغ' }
  ];

  const getPreviewValue = (excelHeader: string) => {
    if (!importData || !excelHeader) return '';
    return String(importData.rows[0]?.[excelHeader] || '');
  };

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

          // Smart Mapping
          const initialMapping: Record<string, string> = {};
          VOLUNTEER_MAPPING_FIELDS.forEach(field => {
            const match = headers.find(h => 
              h.includes(field.label) || 
              field.label.includes(h) ||
              (field.id === 'name' && (h.includes('الاسم') || h.includes('المتطوع'))) ||
              (field.id === 'phone' && (h.includes('الهاتف') || h.includes('الموبايل') || h.includes('تليفون')))
            );
            if (match) initialMapping[field.id] = match;
          });
          setFieldMapping(initialMapping);
        }
      } catch (error) {
        alert('فشل قراءة ملف الإكسل');
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
      for (const row of importData.rows) {
        const getVal = (fieldId: string) => fieldMapping[fieldId] ? String(row[fieldMapping[fieldId]] || '') : '';
        const name = getVal('name').trim();
        if (name) {
          await addDoc(collection(db, 'volunteers'), {
            name,
            phone: getVal('phone'),
            age: Number(getVal('age')) || 20,
            skills: getVal('skills'),
            availability: getVal('availability'),
            types: ['field'],
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      alert(`تم استيراد ${count} متطوع بنجاح`);
      setImportData(null);
    } catch (error) {
      alert('حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
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

  const [formData, setFormData] = useState({
    volunteerCode: '',
    name: '',
    phone: '',
    age: 20,
    skills: [] as string[],
    types: ['field'] as string[],
    availability: [{ day: '', from: '', to: '' }],
    profilePhoto: null as FileAttachment | null,
    attachments: [] as FileAttachment[]
  });

  useEffect(() => {
    const q = query(collection(db, 'volunteers'), orderBy('createdAt', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Volunteer));
      setVolunteers(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'volunteers');
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (v: Volunteer) => {
    setEditingId(v.id);
    setFormData({
      volunteerCode: v.volunteerCode || '',
      name: v.name || '',
      phone: v.phone || '',
      age: v.age || 20,
      skills: v.skills || [],
      types: v.types || ['field'],
      availability: v.availability || [{ day: '', from: '', to: '' }],
      profilePhoto: v.profilePhoto || null,
      attachments: v.attachments || []
    });
    setShowAddForm(true);
  };

  const handleExportExcel = () => {
    const dataToExport = filteredVolunteers.map((v, index) => {
      const availStr = (v.availability || []).map(a => `${a.day}: ${a.from} - ${a.to}`).join(' | ');
      return {
        'م': index + 1,
        'الكود': v.volunteerCode || '',
        'الاسم': v.name || '',
        'الهاتف': v.phone || '',
        'العمر': v.age || '',
        'المهارات': (v.skills || []).join('، '),
        'نوع التطوع': (v.types || []).map(t => 
          t === 'field' ? 'ميداني' : t === 'admin' ? 'إداري' : t === 'design' ? 'تصميم' : t === 'marketing' ? 'تسويق' : t === 'medical' ? 'طبي' : 'لوجستي'
        ).join('، '),
        'التفرغ': availStr,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'المتطوعون');
    XLSX.utils.writeFile(workbook, `كشف_المتطوعين_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleAddVolunteer = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      setConfirmConfig({
        isOpen: true,
        title: 'تعديل بيانات متطوع',
        message: `هل أنت متأكد من حفظ تعديلات المتطوع "${formData.name}"؟`,
        onConfirm: async () => {
          try {
            await updateDoc(doc(db, 'volunteers', editingId), {
              ...formData,
              age: Number(formData.age),
            });
            setShowAddForm(false);
            setEditingId(null);
            setFormData({ volunteerCode: '', name: '', phone: '', age: 20, skills: [], types: ['field'], availability: [{ day: '', from: '', to: '' }], profilePhoto: null, attachments: [] });
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `volunteers/${editingId}`);
          }
        }
      });
    } else {
      setConfirmConfig({
        isOpen: true,
        title: 'إضافة متطوع',
        message: `هل أنت متأكد من إضافة المتطوع "${formData.name}"؟`,
        onConfirm: async () => {
          try {
            const finalCode = formData.volunteerCode || generateVolunteerCode(volunteers);
            await addDoc(collection(db, 'volunteers'), {
              ...formData,
              volunteerCode: finalCode,
              age: Number(formData.age),
              createdAt: serverTimestamp(),
            });
            setShowAddForm(false);
            setFormData({ volunteerCode: '', name: '', phone: '', age: 20, skills: [], types: ['field'], availability: [{ day: '', from: '', to: '' }], profilePhoto: null, attachments: [] });
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'volunteers');
          }
        }
      });
    }
  };

  const handleDownloadVolunteerPDF = async (v: Volunteer) => {
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
            <p style="margin: 5px 0; font-weight: bold;">بطاقة بيانات متطوع</p>
          </div>
          <div style="text-align: left;">
            <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>

        <div style="grid-template-columns: 1fr; display: grid; gap: 20px; text-align: right; margin-bottom: 30px;">
          <div style="padding: 15px; background: #f0fdf4; border-radius: 12px;">
            <p style="color: #065f46; margin-bottom: 5px; font-weight: bold;">الاسم الكامل:</p>
            <p style="font-size: 20px; font-weight: 800;">${v.name}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">رقم الهاتف:</p>
            <p style="font-size: 18px; font-weight: bold;">${v.phone}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">المهارات والخبرات:</p>
            <p style="font-weight: bold;">${v.skills}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">السن:</p>
            <p style="font-weight: bold;">${v.age} سنة</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">التوافر:</p>
            <p style="font-weight: bold;">${v.availability}</p>
          </div>
        </div>

        <div style="margin-top: 100px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          <p style="font-size: 12px; color: #64748b;">توقيع المتطوع: ....................</p>
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
      pdf.save(`Volunteer-${v.name}.pdf`);
    } finally {
      document.body.removeChild(reportElement);
    }
  };

  const handleDelete = (id: string, name: string) => {
    const volunteerData = volunteers.find(v => v.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف متطوع',
      message: `هل أنت متأكد من حذف المتطوع "${name}"؟`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'volunteers', id));
          if (volunteerData) {
            await logSystemAction('delete', 'volunteers', id, volunteerData, `حذف متطوع: ${name}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `volunteers/${id}`);
        }
      }
    });
  };

  const handleDeleteAllVolunteers = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع المتطوعين',
      message: 'هل أنت متأكد من حذف جميع المتطوعين نهائياً؟',
      onConfirm: async () => {
        try {
          const q = query(collection(db, 'volunteers'));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'volunteers');
        }
      }
    });
  };

  const filteredVolunteers = volunteers.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.skills.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-right">
        <div>
          <h1 className="text-3xl font-bold text-emerald-900">قسم المتطوعين</h1>
          <p className="text-emerald-700/60 mt-1">إدارة فريق العمل التطوعي والمهارات المتاحة</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDownloadPDF('كشف_المتطوعين', 'volunteers-table-full')}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold shadow-sm whitespace-nowrap"
          >
            <FileText className="w-5 h-5" />
            <span>تحميل PDF</span>
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-50 border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-100 transition-all font-bold shadow-sm whitespace-nowrap"
            title="استخراج كشف إكسل"
          >
            <Download className="w-5 h-5" />
            <span>تصدير Excel</span>
          </button>
          <button 
            onClick={handleDeleteAllVolunteers}
            className="flex items-center gap-2 bg-rose-50 border-2 border-rose-100 text-rose-700 px-6 py-3 rounded-xl hover:bg-rose-100 transition-all font-bold shadow-sm"
          >
            <Trash2 className="w-5 h-5" />
            <span>حذف الكل</span>
          </button>
          <label className="flex items-center justify-center p-3 bg-white border-2 border-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-50 transition-all shadow-sm cursor-pointer" title="استيراد متطوعين">
            <UploadCloud className={`w-6 h-6 ${importing ? 'animate-bounce' : ''}`} />
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
          </label>
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({ volunteerCode: '', name: '', phone: '', age: 20, skills: [], types: ['field'], availability: [{ day: '', from: '', to: '' }], profilePhoto: null, attachments: [] });
              setShowAddForm(true);
            }}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all font-bold whitespace-nowrap justify-center"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة متطوع جديد</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
        <div className="p-4 border-b border-emerald-50 bg-emerald-50/30 flex flex-col md:flex-row items-center gap-4 text-right dir-rtl">
          <div className="flex items-center gap-2 flex-grow">
            <Search className="w-5 h-5 text-emerald-400 shrink-0" />
            <input 
              type="text" 
              placeholder="بحث بالاسم أو المهارات..."
              className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-900 placeholder-emerald-300 outline-none text-right"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="bg-white border border-emerald-100 px-4 py-2 rounded-xl font-bold outline-none focus:border-emerald-500 text-right text-emerald-900"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
          >
            <option value="desc">الأحدث أولاً</option>
            <option value="asc">الأقدم أولاً</option>
          </select>
        </div>

        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          {loading ? (
            <div className="p-12 text-center text-emerald-600 font-medium whitespace-nowrap">جاري التحميل...</div>
          ) : (
            <table id="volunteers-table-full" className="w-full text-right min-w-[1000px] bg-white" dir="rtl">
              <thead>
                <tr className="bg-stone-50 text-emerald-800 text-sm font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4 text-center">م</th>
                  <th className="px-6 py-4">الاسم</th>
                  <th className="px-6 py-4">الهاتف</th>
                  <th className="px-6 py-4">المهارات</th>
                  <th className="px-6 py-4">نوع التطوع</th>
                  <th className="px-6 py-4">التفرغ</th>
                  <th className="px-6 py-4">العمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {filteredVolunteers.length > 0 ? filteredVolunteers.map((v, index) => (
                  <tr key={v.id} className="hover:bg-emerald-50/20 transition-colors">
                    <td className="px-6 py-4 text-emerald-800 font-bold tabular-nums text-center">{index + 1}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-emerald-950">{v.name}</div>
                      <div className="text-[10px] text-emerald-600/70 tabular-nums">كود: {v.volunteerCode || '---'} | العمر: {v.age} سنة</div>
                    </td>
                    <td className="px-6 py-4 text-emerald-800 tabular-nums font-bold">{v.phone}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {v.skills && Array.isArray(v.skills) ? v.skills.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] border border-emerald-100 font-bold">{s}</span>
                        )) : <span className="text-stone-300">---</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(v.types || []).map((t: any) => (
                           <span key={t} className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold",
                            t === 'field' ? "bg-amber-100 text-amber-700" : 
                            t === 'admin' ? "bg-blue-100 text-blue-700" :
                            t === 'design' ? "bg-purple-100 text-purple-700" :
                            t === 'marketing' ? "bg-indigo-100 text-indigo-700" :
                            t === 'medical' ? "bg-emerald-100 text-emerald-700" :
                            "bg-rose-100 text-rose-700"
                          )}>
                            {t === 'field' ? 'ميداني' : t === 'admin' ? 'إداري' : t === 'design' ? 'تصميم' : t === 'marketing' ? 'تسويق' : t === 'medical' ? 'طبي' : 'لوجستي'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {v.availability && Array.isArray(v.availability) ? v.availability.map((a, i) => (
                          <div key={i} className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 inline-block ml-1">
                            {a.day}: {a.from} - {a.to}
                          </div>
                        )) : <span className="text-stone-300">---</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleDownloadVolunteerPDF(v)}
                          className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="تحميل تقرير المتطوع PDF"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleEdit(v)}
                          className="p-3 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-blue-100 shadow-sm"
                          title="تعديل"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(v.id, v.name)}
                          className="p-3 text-rose-600 hover:bg-rose-100 rounded-xl transition-all border border-rose-100 shadow-sm"
                          title="حذف"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-emerald-400">لا يوجد متطوعون مسجلون</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowAddForm(false); setEditingId(null); }}
              className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden relative z-10 font-sans p-8" dir="rtl"
            >
              <div className="flex items-center justify-between mb-6 text-right">
                <h2 className="text-2xl font-bold text-emerald-900">{editingId ? 'تعديل بيانات متطوع' : 'إضافة متطوع جديد'}</h2>
                <button onClick={() => { setShowAddForm(false); setEditingId(null); }} className="p-2 hover:bg-emerald-50 rounded-full">
                  <X className="w-6 h-6 text-emerald-400" />
                </button>
              </div>

              <form className="space-y-6 max-h-[70vh] overflow-y-auto px-2 custom-scrollbar" onSubmit={handleAddVolunteer}>
                <div className="flex flex-col items-center gap-4 p-4 bg-emerald-50 rounded-3xl border-2 border-dashed border-emerald-200">
                  <div className="text-center">
                    <p className="text-xs font-bold text-emerald-700 mb-2">صورة المتطوع</p>
                    <div className="flex justify-center">
                      <FileUploadSlot 
                        label="تحميل صورة"
                        caseName={formData.name || 'avatar'}
                        values={formData.profilePhoto ? [formData.profilePhoto] : []}
                        storagePath="volunteers/profiles"
                        onUpload={(updater) => {
                           const current = formData.profilePhoto ? [formData.profilePhoto] : [];
                           const updated = typeof updater === 'function' ? updater(current) : updater;
                           setFormData(prev => ({ ...prev, profilePhoto: updated[0] || null }));
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputField 
                    label="كود المتطوع" 
                    value={formData.volunteerCode} 
                    onChange={(v: string) => setFormData({...formData, volunteerCode: v})} 
                    icon={<Tag className="w-4 h-4" />}
                  />
                  <InputField 
                    label="الاسم الكامل" 
                    value={formData.name} 
                    onChange={(v: string) => setFormData({...formData, name: v})} 
                    icon={<User className="w-4 h-4" />}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputField 
                    label="رقم الهاتف" 
                    value={formData.phone} 
                    onChange={(v: string) => setFormData({...formData, phone: v})} 
                    icon={<Phone className="w-4 h-4" />}
                    required
                  />
                  <InputField 
                    label="العمر" 
                    type="number"
                    value={formData.age} 
                    onChange={(v: string) => setFormData({...formData, age: v})} 
                    icon={<Calendar className="w-4 h-4" />}
                  />
                </div>

                <div className="space-y-3 text-right">
                  <label className="text-sm font-bold text-emerald-800">المهارات</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                    {SKILLS_LIST.map(skill => (
                      <label key={skill} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded-lg transition-all group">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                          checked={formData.skills.includes(skill)}
                          onChange={(e) => {
                            const newSkills = e.target.checked 
                              ? [...formData.skills, skill]
                              : formData.skills.filter(s => s !== skill);
                            setFormData({...formData, skills: newSkills});
                          }}
                        />
                        <span className="text-xs font-bold text-stone-600 group-hover:text-emerald-700">{skill}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 text-right">
                  <div className="flex items-center justify-between">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, availability: [...formData.availability, { day: '', from: '', to: '' }]})}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      + إضافة موعد آخر
                    </button>
                    <label className="text-sm font-bold text-emerald-800">مواعيد التفرغ</label>
                  </div>
                  <div className="space-y-3">
                    {formData.availability.map((slot, idx) => (
                      <div key={idx} className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex flex-wrap gap-3 items-end">
                        <div className="flex-grow min-w-[120px]">
                          <label className="block text-[10px] font-bold text-stone-400 mb-1">اليوم</label>
                          <select 
                            value={slot.day}
                            onChange={(e) => {
                              const newAv = [...formData.availability];
                              newAv[idx].day = e.target.value;
                              setFormData({...formData, availability: newAv});
                            }}
                            className="w-full bg-white p-2 rounded-xl border border-emerald-100 text-xs font-bold"
                          >
                            <option value="">اختر اليوم</option>
                            {DAYS_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="block text-[10px] font-bold text-stone-400 mb-1">من</label>
                          <input 
                            type="time"
                            value={slot.from}
                            onChange={(e) => {
                              const newAv = [...formData.availability];
                              newAv[idx].from = e.target.value;
                              setFormData({...formData, availability: newAv});
                            }}
                            className="w-full bg-white p-2 rounded-xl border border-emerald-100 text-xs font-bold"
                          />
                        </div>
                        <div className="w-24">
                          <label className="block text-[10px] font-bold text-stone-400 mb-1">إلى</label>
                          <input 
                            type="time"
                            value={slot.to}
                            onChange={(e) => {
                              const newAv = [...formData.availability];
                              newAv[idx].to = e.target.value;
                              setFormData({...formData, availability: newAv});
                            }}
                            className="w-full bg-white p-2 rounded-xl border border-emerald-100 text-xs font-bold"
                          />
                        </div>
                        {formData.availability.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, availability: formData.availability.filter((_, i) => i !== idx)})}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg mb-0.5"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 text-right">
                   <label className="text-sm font-bold text-emerald-800">نقاط التميز / أنواع التطوع</label>
                   <div className="flex flex-wrap gap-2 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                      {[
                        { id: 'field', label: 'ميداني' },
                        { id: 'admin', label: 'إداري' },
                        { id: 'design', label: 'تصميم' },
                        { id: 'marketing', label: 'تسويق' },
                        { id: 'medical', label: 'طبي' },
                        { id: 'logistics', label: 'لوجستي' }
                      ].map(t => (
                        <label key={t.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded-lg transition-all group">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            checked={formData.types.includes(t.id)}
                            onChange={(e) => {
                              const newTypes = e.target.checked 
                                ? [...formData.types, t.id]
                                : formData.types.filter(x => x !== t.id);
                              setFormData({...formData, types: newTypes});
                            }}
                          />
                          <span className="text-xs font-bold text-emerald-800 group-hover:text-emerald-600 font-sans">{t.label}</span>
                        </label>
                      ))}
                    </div>
                </div>

                <div className="space-y-1 text-right">
                  <label className="text-sm font-bold text-emerald-800">المرفقات الإضافية</label>
                  <FileUploadSlot 
                    label="رفع ملفات أخرى"
                    caseName={formData.name || 'volunteer'}
                    values={formData.attachments}
                    storagePath="volunteers/docs"
                    onUpload={(updater) => {
                      if (typeof updater === 'function') {
                        setFormData(prev => ({ ...prev, attachments: updater(prev.attachments || []) }));
                      } else {
                        setFormData(prev => ({ ...prev, attachments: updater }));
                      }
                    }}
                  />
                </div>

                <button type="submit" className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl text-xl hover:bg-emerald-700 transition-all mt-6 shadow-xl shadow-emerald-200">حفظ بيانات المتطوع</button>
              </form>
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

      {/* Excel Mapping Modal */}
      <AnimatePresence>
        {importData && (
          <div className="fixed inset-0 bg-emerald-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-5xl w-full p-8 my-8 text-right"
            >
              <div className="flex items-center justify-between mb-8 border-b border-emerald-100 pb-6">
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">تخصيص بيانات المتطوعين</h2>
                  <p className="text-emerald-500 font-bold font-sans">اربط أعمدة ملف الإكسل بالخانات المطلوبة</p>
                </div>
                <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center">
                  <UploadCloud className="w-10 h-10 text-emerald-600" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-10">
                {VOLUNTEER_MAPPING_FIELDS.map(field => (
                  <div key={field.id} className="group">
                    <label className="text-sm font-black text-emerald-700 block mb-2 pr-2">
                        {field.label}
                        {field.id === 'name' && <span className="text-rose-500 mr-1">*</span>}
                    </label>
                    <div className="relative">
                        <select 
                          value={fieldMapping[field.id] || ''}
                          onChange={(e) => setFieldMapping({...fieldMapping, [field.id]: e.target.value})}
                          className="w-full bg-emerald-50/50 border-2 border-emerald-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right appearance-none cursor-pointer pr-4 pl-10"
                        >
                          <option value="">-- اختر من الملف --</option>
                          {importData.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Info className="w-5 h-5 text-emerald-300" />
                        </div>
                    </div>
                    {fieldMapping[field.id] && (
                        <div className="mt-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg flex items-center justify-end gap-2 border border-emerald-100/50">
                            <span>{getPreviewValue(fieldMapping[field.id])}</span>
                            <span className="text-emerald-400 font-sans">مثال من الملف:</span>
                        </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 mb-8 flex items-start gap-4">
                <div className="flex-grow">
                  <h4 className="font-black text-amber-900 text-lg mb-1">تأكيد عملية الاستيراد</h4>
                  <p className="text-sm text-amber-800 font-bold">
                    سيتم استيراد <span className="text-xl font-black tabular-nums">{importData.rows.length}</span> متطوع. 
                    تأكد من اختيار الاسم الصحيح ورقم الهاتف لضمان جودة البيانات.
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-amber-600 shrink-0" />
              </div>

              <div className="flex flex-row-reverse gap-4">
                <button 
                  onClick={processMappingImport}
                  disabled={importing || !fieldMapping.name}
                  className="flex-grow bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-4 disabled:bg-stone-300 disabled:shadow-none"
                >
                  {importing ? (
                    <Clock className="w-7 h-7 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-7 h-7" />
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