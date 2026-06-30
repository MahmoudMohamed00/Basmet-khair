// @ts-nocheck
import React, { useState, useEffect, ReactNode } from 'react';
import { Plus, Calendar, MapPin, Image as ImageIcon, X, Trash2, Loader2, ArrowUpDown, UploadCloud, CheckCircle2, AlertCircle, Clock, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, storage, handleFirestoreError, OperationType, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { FileText } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import ConfirmModal from './ConfirmModal';
import * as XLSX from 'xlsx';
import { uploadToGoogleDrive } from '../lib/driveUpload';

interface Activity {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  imageUrl?: string;
}

export default function ActivitiesScreen() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const ACTIVITY_MAPPING_FIELDS = [
    { id: 'title', label: 'عنوان النشاط' },
    { id: 'date', label: 'التاريخ' },
    { id: 'location', label: 'الموقع' },
    { id: 'description', label: 'الوصف' }
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
          ACTIVITY_MAPPING_FIELDS.forEach(field => {
            const match = headers.find(h => 
              h.includes(field.label) || 
              field.label.includes(h) ||
              (field.id === 'title' && (h.includes('عنوان') || h.includes('اسم النشاط'))) ||
              (field.id === 'date' && (h.includes('تاريخ'))) ||
              (field.id === 'location' && (h.includes('موقع') || h.includes('مكان')))
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
        const title = getVal('title').trim();
        if (title) {
          await addDoc(collection(db, 'activities'), {
            title,
            description: getVal('description'),
            date: getVal('date') || new Date().toISOString().split('T')[0],
            location: getVal('location'),
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      alert(`تم استيراد ${count} نشاط بنجاح`);
      setImportData(null);
    } catch (error) {
      alert('حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };
  const [uploading, setUploading] = useState(false);

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
  const initialFormData = {
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    location: '',
    imageUrl: ''
  };
  const [formData, setFormData] = useState(initialFormData);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let uploadFile = file;
      if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg') || file.name.toLowerCase().endsWith('.png')) {
        try {
          const options = {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1280,
            useWebWorker: false,
            initialQuality: 0.7,
            fileType: 'image/jpeg' as string,
          };
          const compressed = await imageCompression(file, options);
          if (compressed && compressed.size < file.size) {
            uploadFile = compressed;
          }
        } catch (compErr) {
          console.error("Compression skipped:", compErr);
          uploadFile = file;
        }
      }
      const storageRef = ref(storage, `activities/${Date.now()}_${file.name}`);
      const metadata = {
        contentType: uploadFile.type || 'image/jpeg'
      };
      const uploadTask = uploadBytesResumable(storageRef, uploadFile, metadata);
      
      const url = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', 
          null,
          (error) => reject(error),
          async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            } catch (err) {
              reject(err);
            }
          }
        );
      });

      // Upload to Google Drive (new)
      try {
        await uploadToGoogleDrive(file, 'أنشطة الجمعية', formData.title || 'نشاط_بدون_عنوان');
      } catch (driveErr) {
        console.error("Google Drive sync failed:", driveErr);
      }

      setFormData(prev => ({ ...prev, imageUrl: url }));
    } catch (error: any) {
      console.error("Upload error details:", error);
      let userMsg = `فشل رفع الصورة: ${error.message}`;
      if (error.code === 'storage/retry-limit-exceeded') {
        userMsg = "فشل الرفع: تجاوز الحد الأقصى للمحاولة. قد يكون ذلك بسبب ضعف الاتصال بالإنترنت، تجاوز حصة Firebase (Storage Quota)، أو عدم تفعيل الخدمة في لوحة التحكم.";
      }
      alert(userMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) {
      alert('الرجاء اختيار نوع النشاط');
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: 'إضافة نشاط',
      message: `هل أنت متأكد من توثيق النشاط "${formData.title}"؟`,
      onConfirm: async () => {
        try {
          await addDoc(collection(db, 'activities'), {
            ...formData,
            imageUrl: formData.imageUrl || 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb8?auto=format&fit=crop&q=80&w=600',
            createdAt: serverTimestamp(),
          });
          setShowAddForm(false);
          setFormData(initialFormData);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'activities');
        }
      }
    });
  };

  const handleDeleteActivity = (id: string, title: string) => {
    const activityData = activities.find(a => a.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف نشاط',
      message: `هل أنت متأكد من حذف النشاط "${title}"؟`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'activities', id));
          if (activityData) {
            await logSystemAction('delete', 'activities', id, activityData, `حذف نشاط: ${title}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `activities/${id}`);
        }
      }
    });
  };

  const handleDeleteAllActivities = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع الأنشطة',
      message: 'تحذير: هل أنت متأكد من حذف جميع الأنشطة الموثقة نهائياً؟',
      onConfirm: async () => {
        try {
          const q = query(collection(db, 'activities'));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'activities');
        }
      }
    });
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
    // Remove individual action buttons from cards in the PDF
    const deleteButtons = clone.querySelectorAll('button');
    deleteButtons.forEach(btn => btn.style.display = 'none');
    
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

  useEffect(() => {
    const q = query(collection(db, 'activities'), orderBy('createdAt', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActivities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity)));
      setLoading(false);
    });
    return unsubscribe;
  }, [sortOrder]);

  return (
    <div className="p-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-right">
        <div>
          <h1 className="text-3xl font-bold text-emerald-900">أنشطة الجمعية</h1>
          <p className="text-emerald-700/60 mt-1">توثيق لرحلتنا في خدمة المجتمع ونشر الخير</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDownloadPDF('تقرير_الأنشطة', 'activities-grid-full')}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold shadow-sm"
          >
            <FileText className="w-5 h-5" />
            <span>تحميل PDF</span>
          </button>
          <button 
            onClick={handleDeleteAllActivities}
            className="flex items-center gap-2 bg-rose-50 border-2 border-rose-100 text-rose-700 px-6 py-3 rounded-xl hover:bg-rose-100 transition-all font-bold shadow-sm"
          >
            <Trash2 className="w-5 h-5" />
            <span>حذف الكل</span>
          </button>
          <label className="flex items-center justify-center p-3 bg-white border-2 border-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-50 transition-all shadow-sm cursor-pointer" title="استيراد أنشطة">
            <UploadCloud className={`w-6 h-6 ${importing ? 'animate-bounce' : ''}`} />
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
          </label>
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all font-bold whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة نشاط جديد</span>
          </button>
        </div>
      </div>

      <div className="flex justify-end mb-8">
        <select 
          className="bg-white border-2 border-emerald-50 px-6 py-3 rounded-xl font-bold outline-none focus:border-emerald-500 text-right text-emerald-900 shadow-sm"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
        >
          <option value="desc">الأحدث أولاً</option>
          <option value="asc">الأقدم أولاً</option>
        </select>
      </div>

      {loading ? (
        <div className="p-12 text-center text-emerald-600 font-medium">جاري التحميل...</div>
      ) : (
        <div className="max-h-[800px] overflow-y-auto custom-scrollbar p-2" id="activities-grid-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" dir="rtl">
          {activities.length > 0 ? activities.map((activity) => (
            <motion.div 
              key={activity.id}
              whileHover={{ y: -8 }}
              className="bg-white rounded-3xl overflow-hidden border border-emerald-100 shadow-sm flex flex-col text-right"
            >
              <div className="h-48 overflow-hidden relative">
                <img src={activity.imageUrl || 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb8?auto=format&fit=crop&q=80&w=600'} alt={activity.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-emerald-900 border border-emerald-100 tabular-nums">
                  {activity.date}
                </div>
              </div>
              <div className="p-6 flex-grow flex flex-col">
                <h3 className="text-xl font-bold text-emerald-900 mb-2">{activity.title}</h3>
                <p className="text-emerald-800/70 text-sm mb-4 line-clamp-3 leading-relaxed font-medium">{activity.description}</p>
                
                  <div className="mt-auto pt-4 border-t border-emerald-50 flex items-center justify-between flex-row-reverse">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleDeleteActivity(activity.id, activity.title)}
                        className="p-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all border border-rose-100 shadow-sm"
                        title="حذف"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button className="text-blue-600 text-sm font-bold hover:underline">عرض التفاصيل</button>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600">
                      <MapPin className="w-4 h-4" />
                      <span className="text-xs font-bold">{activity.location}</span>
                    </div>
                  </div>
              </div>
            </motion.div>
          )) : (
            <div className="col-span-full py-20 text-center text-emerald-400 font-medium">لا توجد أنشطة موثقة حالياً</div>
          )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddForm(false)}
              className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 font-sans" dir="rtl"
            >
              <div className="bg-emerald-900 p-6 text-white flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">توثيق نشاط جديد</h2>
                  <p className="text-emerald-300 text-xs mt-1">أضف تفاصيل النشاط والفعاليات التي تمت</p>
                </div>
                <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-emerald-800 rounded-full transition-colors text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <form className="space-y-6 text-right" onSubmit={handleAddActivity}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField 
                      label="عنوان النشاط" 
                      placeholder="مثال: شنطة رمضان" 
                      value={formData.title} 
                      onChange={(val) => setFormData({...formData, title: val})} 
                    />
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-emerald-800">نوع النشاط</label>
                      <select 
                        className="w-full bg-stone-50 p-3 rounded-xl border border-emerald-100 outline-none focus:ring-2 ring-emerald-500/20 font-bold text-right"
                        value={formData.title}
                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                      >
                        <option value="">اختر النوع</option>
                        <option>حملة رمضان</option>
                        <option>حملة لحوم الأضاحي</option>
                        <option>الحفلات</option>
                        <option>شنطة الخير</option>
                        <option>أخرى</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField 
                      label="المكان" 
                      placeholder="عنوان التنفيذ" 
                      value={formData.location} 
                      onChange={(val) => setFormData({...formData, location: val})} 
                    />
                    <FormField 
                      label="تاريخ النشاط" 
                      placeholder="YYYY-MM-DD" 
                      type="date"
                      value={formData.date} 
                      onChange={(val) => setFormData({...formData, date: val})} 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-bold text-emerald-800">وصف النشاط</label>
                    <textarea 
                      className="w-full bg-stone-50 p-4 rounded-xl border border-emerald-100 outline-none h-32 font-bold focus:ring-2 ring-emerald-500/20" 
                      placeholder="اكتب تفاصيل ما تم إنجازه، عدد المستفيدين، وكيف تم التنفيذ..." 
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-emerald-800 mb-2 text-right">صورة النشاط</label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        id="activity-image" 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                      <label 
                        htmlFor="activity-image"
                        className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-emerald-200 rounded-2xl bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-400 transition-all cursor-pointer overflow-hidden border-emerald-100"
                      >
                        {uploading ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                            <span className="text-sm font-bold text-emerald-700">جاري الرفع...</span>
                          </div>
                        ) : formData.imageUrl ? (
                          <div className="relative w-full h-full">
                            <img src={formData.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                            <div className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-white font-bold text-sm">تغيير الصورة</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-emerald-400">
                            <ImageIcon className="w-10 h-10" />
                            <span className="text-sm font-medium">اضغط هنا لرفع صورة</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                  
                  <div className="pt-6 flex gap-4 flex-row-reverse border-t border-emerald-50">
                    <button type="submit" className="flex-grow bg-emerald-600 text-white font-bold py-4 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">حفظ ونشر النشاط</button>
                    <button type="button" onClick={() => setShowAddForm(false)} className="px-10 py-4 text-emerald-600 font-bold hover:bg-emerald-50 rounded-xl transition-colors">إلغاء</button>
                  </div>
                </form>
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

      {/* Excel Mapping Modal */}
      <AnimatePresence>
        {importData && (
          <div className="fixed inset-0 bg-emerald-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-5xl w-full p-8 my-8 text-right font-sans" dir="rtl"
            >
              <div className="flex items-center justify-between mb-8 border-b border-emerald-100 pb-6">
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">استيراد بيانات الأنشطة</h2>
                  <p className="text-emerald-500 font-bold">اربط أعمدة ملف الإكسل بالخانات المطلوبة</p>
                </div>
                <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center">
                  <UploadCloud className="w-10 h-10 text-emerald-600" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-10">
                {ACTIVITY_MAPPING_FIELDS.map(field => (
                  <div key={field.id} className="group">
                    <label className="text-sm font-black text-emerald-700 block mb-2 pr-2">
                        {field.label}
                        {field.id === 'title' && <span className="text-rose-500 mr-1">*</span>}
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
                    سيتم استيراد <span className="text-xl font-black tabular-nums">{importData.rows.length}</span> نشاط/فعالية. 
                    يرجى مراجعة الحقول المختارة بعناية.
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-amber-600 shrink-0" />
              </div>

              <div className="flex flex-row-reverse gap-4">
                <button 
                  onClick={processMappingImport}
                  disabled={importing || !fieldMapping.title}
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

function FormField({ label, placeholder, value, onChange, type = "text" }: { label: string; placeholder: string; value: string; onChange: (val: string) => void; type?: string }) {
  return (
    <div className="space-y-1 text-right">
      <label className="text-sm font-bold text-emerald-800">{label}</label>
      <input 
        type={type}
        className="w-full bg-stone-50 p-3 rounded-xl border border-emerald-100 outline-none focus:ring-2 ring-blue-500/20 font-bold text-right" 
        placeholder={placeholder} 
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}