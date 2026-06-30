// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Plus, Search, Info, X, Heart, Loader2, Trash2, Calendar, Target, TrendingUp, Image as ImageIcon, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import ConfirmModal from './ConfirmModal';
import { uploadToGoogleDrive } from '../lib/driveUpload';

interface Campaign {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetAmount: number;
  collectedAmount: number;
  imageUrl?: string;
  createdAt: any;
}

export default function CampaignsScreen() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
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

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    targetAmount: 1000,
    collectedAmount: 0,
    imageUrl: ''
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
    // Remove delete buttons from the clone
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
    const q = query(collection(db, 'campaigns'), orderBy('createdAt', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign));
      setCampaigns(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'campaigns');
    });
    return () => unsubscribe();
  }, [sortOrder]);

  const filteredCampaigns = campaigns.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      const storageRef = ref(storage, `campaigns/${Date.now()}_${file.name}`);
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
        await uploadToGoogleDrive(file, 'حملات الجمعية', formData.name || 'حملة_بدون_اسم');
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

  const handleAddCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmConfig({
      isOpen: true,
      title: 'إضافة حملة',
      message: `هل أنت متأكد من بدء الحملة الجديدة "${formData.name}"؟`,
      onConfirm: async () => {
        try {
          await addDoc(collection(db, 'campaigns'), {
            ...formData,
            targetAmount: Number(formData.targetAmount),
            collectedAmount: Number(formData.collectedAmount),
            createdAt: serverTimestamp(),
          });
          setShowAddForm(false);
          setFormData({ 
            name: '', description: '', startDate: new Date().toISOString().split('T')[0], 
            endDate: '', targetAmount: 1000, collectedAmount: 0, imageUrl: '' 
          });
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'campaigns');
        }
      }
    });
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف حملة',
      message: `هل أنت متأكد من حذف الحملة "${name}"؟ ستفقد جميع بيانات التبرعات المسجلة عليها.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'campaigns', id));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `campaigns/${id}`);
        }
      }
    });
  };

  const handleDeleteAllCampaigns = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع الحملات',
      message: 'تحذير: هل أنت متأكد من حذف جميع الحملات نهائياً؟',
      onConfirm: async () => {
        try {
          const q = query(collection(db, 'campaigns'));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'campaigns');
        }
      }
    });
  };

  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const CAMPAIGN_MAPPING_FIELDS = [
    { id: 'name', label: 'اسم الحملة' },
    { id: 'description', label: 'وصف الحملة' },
    { id: 'targetAmount', label: 'المبلغ المستهدف' },
    { id: 'collectedAmount', label: 'المبلغ المحصل حالياً' },
    { id: 'startDate', label: 'تاريخ البداية' },
    { id: 'endDate', label: 'تاريخ النهاية' }
  ];

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          
          const initialMap: Record<string, string> = {
            name: headers.find(h => h.includes('اسم') || h.includes('name')) || '',
            description: headers.find(h => h.includes('وصف') || h.includes('desc')) || '',
            targetAmount: headers.find(h => h.includes('هدف') || h.includes('target')) || '',
            collectedAmount: headers.find(h => h.includes('محصل') || h.includes('جمع') || h.includes('collected')) || '',
            startDate: headers.find(h => h.includes('بداية') || h.includes('start')) || '',
            endDate: headers.find(h => h.includes('نهاية') || h.includes('end')) || ''
          };
          setFieldMapping(initialMap);
        }
      } catch (error) {
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
      const batch = writeBatch(db);
      let count = 0;
      const getVal = (row: any, fieldId: string) => fieldMapping[fieldId] ? String(row[fieldMapping[fieldId]]) : '';
      
      for (const row of importData.rows) {
        const name = getVal(row, 'name');
        if (name) {
          const docRef = doc(collection(db, 'campaigns'));
          batch.set(docRef, {
            name,
            description: getVal(row, 'description'),
            targetAmount: Number(getVal(row, 'targetAmount')) || 1000,
            collectedAmount: Number(getVal(row, 'collectedAmount')) || 0,
            startDate: getVal(row, 'startDate') || new Date().toISOString().split('T')[0],
            endDate: getVal(row, 'endDate'),
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      await batch.commit();
      alert(`تم استيراد ${count} حملة بنجاح`);
      setImportData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'campaigns');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-right">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold text-emerald-900">إدارة الحملات</h1>
            <p className="text-emerald-700/60 mt-1">تنظيم ومتابعة التبرعات للحملات الخيرية والفعاليات</p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-emerald-100 rounded-xl px-4 py-2 shadow-sm h-fit self-end md:self-center">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <select 
              className="bg-transparent border-none text-sm font-bold text-emerald-700 outline-none cursor-pointer p-0 pr-4"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
            >
              <option value="desc">الأحدث أولاً</option>
              <option value="asc">الأقدم أولاً</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDownloadPDF('تقرير_الحملات', 'campaigns-grid-full')}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold shadow-sm"
          >
            <FileText className="w-5 h-5" />
            <span>تحميل PDF</span>
          </button>
          <label className="flex items-center gap-2 bg-stone-50 border-2 border-stone-100 text-stone-600 px-6 py-3 rounded-xl hover:bg-stone-100 transition-all font-bold shadow-sm cursor-pointer whitespace-nowrap">
            <Download className="w-5 h-5 rotate-180" />
            <span>استيراد إكسل</span>
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />
          </label>
          <button 
            onClick={handleDeleteAllCampaigns}
            className="flex items-center gap-2 bg-rose-50 border-2 border-rose-100 text-rose-700 px-6 py-3 rounded-xl hover:bg-rose-100 transition-all font-bold shadow-sm"
          >
            <Trash2 className="w-5 h-5" />
            <span>حذف الكل</span>
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all font-bold whitespace-nowrap justify-center"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة حملة جديدة</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {importData && (
          <div className="fixed inset-0 bg-emerald-950/20 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full p-8 font-sans" dir="rtl"
            >
              <div className="flex items-center justify-between mb-8 border-b border-emerald-50 pb-6">
                <h2 className="text-3xl font-black text-emerald-950 text-right w-full">توصيف بيانات الحملات</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {CAMPAIGN_MAPPING_FIELDS.map(field => (
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
                  disabled={importing || !fieldMapping.name}
                  className="flex-grow bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 disabled:bg-stone-300 shadow-xl shadow-emerald-100 transition-all"
                >
                  {importing ? 'جاري الاستيراد...' : 'تأكيد واستيراد البيانات'}
                </button>
                <button onClick={() => setImportData(null)} className="px-12 bg-stone-100 text-stone-500 py-5 rounded-2xl font-bold hover:bg-stone-200 transition-all">إلغاء</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row gap-4 mb-8 bg-white p-4 rounded-2xl border border-emerald-50 shadow-sm">
        <div className="relative flex-grow">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-300 w-5 h-5" />
          <input 
            type="text" 
            placeholder="البحث باسم الحملة..."
            className="w-full bg-stone-50 border-2 border-stone-50 pr-12 pl-4 py-3 rounded-xl focus:border-emerald-500 outline-none font-bold text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select 
          className="bg-stone-50 border-2 border-stone-50 px-6 py-3 rounded-xl font-bold outline-none focus:border-emerald-500 text-right text-emerald-900"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
        >
          <option value="desc">الأحدث أولاً</option>
          <option value="asc">الأقدم أولاً</option>
        </select>
      </div>

      <div className="max-h-[800px] overflow-y-auto custom-scrollbar p-2" id="campaigns-grid-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full p-12 text-center text-emerald-600">جاري التحميل...</div>
        ) : filteredCampaigns.length > 0 ? filteredCampaigns.map(camp => {
          const progress = Math.min(100, Math.round((camp.collectedAmount / camp.targetAmount) * 100));
          return (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={camp.id} 
              className="bg-white rounded-3xl overflow-hidden shadow-sm border border-emerald-100 flex flex-col group"
            >
              <div className="h-48 relative overflow-hidden bg-emerald-50">
                {camp.imageUrl ? (
                  <img src={camp.imageUrl} alt={camp.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-emerald-200">
                    <ImageIcon className="w-12 h-12" />
                  </div>
                )}
                <div className="absolute top-4 right-4">
                  <span className="bg-white/90 backdrop-blur-sm text-emerald-900 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                    {camp.endDate ? `ينتهي في ${camp.endDate}` : 'مستمرة'}
                  </span>
                </div>
                <button 
                  onClick={() => handleDelete(camp.id, camp.name)}
                  className="absolute top-4 left-4 p-3 bg-white/95 hover:bg-rose-500 text-rose-600 hover:text-white rounded-2xl transition-all shadow-lg z-10 border border-white"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 flex-grow flex flex-col text-right">
                <h3 className="text-xl font-bold text-emerald-950 mb-2 truncate" dir="rtl">{camp.name}</h3>
                <p className="text-sm text-emerald-700/70 mb-6 line-clamp-2" dir="rtl">{camp.description}</p>
                
                <div className="mt-auto space-y-4">
                   <div className="space-y-2">
                      <div className="flex justify-between items-end text-sm mb-1" dir="rtl">
                         <span className="text-emerald-900 font-bold">تم جمع {camp.collectedAmount.toLocaleString()} ج.م</span>
                         <span className="text-emerald-500 font-black">{progress}%</span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-linear-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000"
                           style={{ width: `${progress}%` }}
                         />
                      </div>
                   </div>

                   <div className="flex items-center justify-between pt-4 border-t border-emerald-50" dir="rtl">
                      <div className="flex flex-col">
                         <span className="text-[10px] text-emerald-400 font-bold uppercase">الهدف</span>
                         <span className="text-emerald-900 font-bold tabular-nums">{camp.targetAmount.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                        <span className="text-emerald-900 font-black tabular-nums">{camp.collectedAmount.toLocaleString()}</span>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          );
        }) : (
          <div className="col-span-full p-20 text-center bg-stone-50 rounded-3xl border-2 border-dashed border-emerald-100">
             <Heart className="w-12 h-12 text-emerald-200 mx-auto mb-4" />
             <p className="text-emerald-400 font-bold text-lg">لا توجد حملات نشطة حالياً</p>
          </div>
        )}
        </div>
      </div>

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
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 font-sans" dir="rtl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8 text-right">
                  <h2 className="text-2xl font-bold text-emerald-900">إضافة حملة جديدة</h2>
                  <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-emerald-50 rounded-full">
                    <X className="w-6 h-6 text-emerald-400" />
                  </button>
                </div>

                <form className="space-y-5" onSubmit={handleAddCampaign}>
                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800">اسم الحملة</label>
                    <input 
                      type="text" required
                      className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 outline-none font-bold"
                      placeholder="مثال: صكوك الأضحية 2024"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800">وصف الحملة</label>
                    <textarea 
                      rows={3}
                      className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 outline-none"
                      placeholder="اشرح الهدف من الحملة والشرائح المستهدفة..."
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-right">
                      <label className="text-sm font-bold text-emerald-800">تاريخ البداية</label>
                      <input 
                        type="date"
                        className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 outline-none tabular-nums"
                        value={formData.startDate}
                        onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1 text-right">
                      <label className="text-sm font-bold text-emerald-800">تاريخ النهاية</label>
                      <input 
                        type="date"
                        className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 outline-none tabular-nums"
                        value={formData.endDate}
                        onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-right">
                      <label className="text-sm font-bold text-emerald-800">المبلغ المستهدف (ج.م)</label>
                      <input 
                        type="number" required
                        className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 outline-none font-black tabular-nums"
                        value={formData.targetAmount}
                        onChange={(e) => setFormData({...formData, targetAmount: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1 text-right">
                      <label className="text-sm font-bold text-emerald-800">صورة الحملة</label>
                      <div className="relative h-[56px]">
                         <input 
                           type="file" 
                           className="hidden" 
                           id="campaign-img" 
                           onChange={handleImageUpload}
                           accept="image/*"
                         />
                         <label 
                           htmlFor="campaign-img"
                           className="w-full h-full flex items-center justify-center gap-2 bg-emerald-50 rounded-xl border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-colors"
                         >
                            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-emerald-600" /> : <ImageIcon className="w-5 h-5 text-emerald-400" />}
                            <span className="text-xs font-bold text-emerald-700 truncate">{formData.imageUrl ? 'تم رفع الصورة ✓' : 'اختر صورة'}</span>
                         </label>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full bg-emerald-800 text-white font-bold py-4 rounded-xl hover:bg-emerald-900 transition-all mt-6 shadow-xl shadow-emerald-100 tracking-wide text-lg">نشر الحملة</button>
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