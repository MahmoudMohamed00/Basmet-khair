// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PartyPopper, Plus, Search, Calendar, MapPin, 
  DollarSign, Users, Info, Trash2, Edit3, 
  Download, Printer, Filter, X, ChevronRight,
  TrendingUp, Star, UserCheck, UploadCloud, CheckCircle2, AlertCircle, Clock, Loader2, FileCheck
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth, storage, logSystemAction } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useRef } from 'react';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import ConfirmModal from './ConfirmModal';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

function FileUploadSlot({ label, onUpload, values = [], caseName = 'حفلة_بدون_عنوان' }: { label: string; onUpload: (updater: FileAttachment[] | ((prev: FileAttachment[]) => FileAttachment[])) => void; values?: FileAttachment[]; caseName?: string }) {
  const [activeUploads, setActiveUploads] = useState<Record<string, { name: string; progress: number }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    for (const file of files) {
      const fileId = `${Date.now()}_${file.name}`;
      
      const storageRef = ref(storage, `parties/docs/${fileId}`);
      const metadata = { contentType: file.type || 'image/jpeg' };

      setActiveUploads(prev => ({
        ...prev,
        [fileId]: { name: file.name, progress: 10 }
      }));

      try {
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);
        
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setActiveUploads(prev => ({
              ...prev,
              [fileId]: { ...prev[fileId], progress: Math.max(10, progress) }
            }));
          }, 
          (error) => {
            alert(`فشل رفع ملف ${file.name}: ${error.message}`);
            setActiveUploads(prev => {
              const next = { ...prev };
              delete next[fileId];
              return next;
            });
          }, 
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              try {
                await uploadToGoogleDrive(file, `الحفلات والفعاليات`, caseName);
              } catch (driveErr) {
                console.error("Google Drive sync failed:", driveErr);
              }

              onUpload((prev: FileAttachment[]) => [...prev, { url, name: file.name }]);
              setActiveUploads(prev => {
                const next = { ...prev };
                delete next[fileId];
                return next;
              });
            } catch (urlError) {
              alert("خطأ في الحصول على رابط الملف");
            }
          }
        );
      } catch (err: any) {
        alert(`خطأ في الرفع: ${err.message}`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isUploading = Object.keys(activeUploads).length > 0;

  return (
    <div className={cn(
      "p-4 rounded-2xl border-2 border-dashed flex flex-col gap-2 transition-all min-h-[140px]",
      values.length > 0 || isUploading ? "bg-emerald-50 border-emerald-500 text-emerald-600" : "bg-stone-50 border-emerald-100 text-emerald-400"
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black">{label}</span>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1 hover:bg-emerald-100 rounded-lg">
          {isUploading ? <Loader2 className={`w-4 h-4 animate-spin ${isUploading ? 'text-emerald-500' : ''}`} /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
      <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*,.pdf" />
      <div className="flex flex-col gap-2 mt-2">
        <div className="flex flex-wrap gap-2">
          {values.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-white border border-emerald-100 px-3 py-1 rounded-xl text-[10px] font-bold">
              <FileCheck className="w-3 h-3 text-emerald-500" />
              <span className="truncate max-w-[100px]">{file.name}</span>
              <button type="button" onClick={() => onUpload((prev: FileAttachment[]) => prev.filter((_, i) => i !== idx))} className="text-rose-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        {Object.entries(activeUploads).map(([id, task]: [string, any]) => (
          <div key={id} className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold">
              <span>{task.name}</span>
              <span>{Math.round(task.progress)}%</span>
            </div>
            <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full" style={{ width: `${task.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FileAttachment {
  url: string;
  name: string;
}

interface Party {
  id: string;
  title: string;
  types: string[];
  date: string;
  location: string;
  cost: number;
  attendeesCount: number;
  sponsorName: string;
  description: string;
  programDetails: string;
  gifts: string;
  volunteersCount: number;
  status: 'planned' | 'completed' | 'cancelled';
  attachments?: FileAttachment[];
  addedBy: string;
  createdAt?: any;
}

const PARTY_TYPES = [
  'حفل أيتام',
  'حفل زواج جماعي',
  'تكريم متفوقين',
  'إفطار جماعي',
  'توزيع لحوم',
  'ملابس العيد',
  'أخرى'
];

export default function PartiesScreen() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const PARTY_MAPPING_FIELDS = [
    { id: 'title', label: 'عنوان الحفلة' },
    { id: 'date', label: 'التاريخ' },
    { id: 'location', label: 'الموقع' },
    { id: 'cost', label: 'التكلفة' },
    { id: 'attendeesCount', label: 'عدد الحضور' },
    { id: 'sponsorName', label: 'الراعي' }
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
          PARTY_MAPPING_FIELDS.forEach(field => {
            const match = headers.find(h => 
              h.includes(field.label) || 
              field.label.includes(h) ||
              (field.id === 'title' && (h.includes('عنوان') || h.includes('اسم الحفلة'))) ||
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
          await addDoc(collection(db, 'parties'), {
            title,
            types: ['حفل أيتام'],
            date: getVal('date') || new Date().toISOString().split('T')[0],
            location: getVal('location'),
            cost: Number(getVal('cost')) || 0,
            attendeesCount: Number(getVal('attendeesCount')) || 0,
            sponsorName: getVal('sponsorName'),
            description: '',
            programDetails: '',
            gifts: '',
            volunteersCount: 0,
            status: 'planned',
            attachments: [],
            addedBy: auth.currentUser?.email || 'Unknown',
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      alert(`تم استيراد ${count} حفلة بنجاح`);
      setImportData(null);
    } catch (error) {
      alert('حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  const [formData, setFormData] = useState({
    title: '',
    types: ['حفل أيتام'] as string[],
    date: new Date().toISOString().split('T')[0],
    location: '',
    cost: 0,
    attendeesCount: 0,
    sponsorName: '',
    description: '',
    programDetails: '',
    gifts: '',
    volunteersCount: 0,
    status: 'planned' as const,
    attachments: [] as FileAttachment[]
  });

  useEffect(() => {
    const q = query(collection(db, 'parties'), orderBy('date', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const partiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Party[];
      setParties(partiesData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [sortOrder]);

  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'parties'), {
        ...formData,
        cost: Number(formData.cost),
        attendeesCount: Number(formData.attendeesCount),
        addedBy: auth.currentUser?.email || 'Unknown',
        createdAt: serverTimestamp()
      });
      setShowAddForm(false);
      resetForm();
    } catch (error) {
      console.error('Error adding party:', error);
    }
  };

  const handleUpdateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParty) return;
    try {
      await updateDoc(doc(db, 'parties', editingParty.id), {
        ...formData,
        cost: Number(formData.cost),
        attendeesCount: Number(formData.attendeesCount),
        updatedAt: serverTimestamp()
      });
      setShowEditForm(false);
      setEditingParty(null);
      resetForm();
    } catch (error) {
      console.error('Error updating party:', error);
    }
  };

  const handleDeleteParty = async (id: string) => {
    const partyData = parties.find(p => p.id === id);
    const partyTitle = partyData?.title || '';
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد حذف الحفلة',
      message: 'هل أنت متأكد من حذف هذه الحفلة؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'parties', id));
          if (partyData) {
            await logSystemAction('delete', 'parties', id, partyData, `حذف حفلة: ${partyTitle}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error('Error deleting party:', error);
        }
      }
    });
  };

  const resetForm = () => {
    setFormData({
      title: '',
      types: ['حفل أيتام'],
      date: new Date().toISOString().split('T')[0],
      location: '',
      cost: 0,
      attendeesCount: 0,
      sponsorName: '',
      description: '',
      programDetails: '',
      gifts: '',
      volunteersCount: 0,
      status: 'planned',
      attachments: []
    });
  };

  const filteredParties = parties.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.sponsorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || p.types?.includes(typeFilter);
    return matchesSearch && matchesType;
  });

  const exportToExcel = () => {
    const exportData = filteredParties.map(p => ({
      'العنوان': p.title,
      'النوع': p.types?.join(' - '),
      'التاريخ': p.date,
      'الموقع': p.location,
      'التكلفة': p.cost,
      'عدد الحضور': p.attendeesCount,
      'الراعي': p.sponsorName,
      'تفاصيل البرنامج': p.programDetails,
      'الهدايا': p.gifts,
      'عدد المتطوعين': p.volunteersCount,
      'الحالة': p.status === 'planned' ? 'مخطط' : p.status === 'completed' ? 'تمت' : 'ملغاة'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parties");
    XLSX.writeFile(wb, `Parties_Report_${new Date().toLocaleDateString()}.xlsx`);
  };

  const totalCost = filteredParties.reduce((sum, p) => sum + p.cost, 0);
  const totalAttendees = filteredParties.reduce((sum, p) => sum + p.attendeesCount, 0);

  return (
    <div className="p-6 font-sans space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-emerald-900 mb-2">إدارة الحفلات والفعاليات</h1>
          <p className="text-emerald-600 font-bold flex items-center gap-2">
            <PartyPopper className="w-5 h-5" />
            تنظيم ومتابعة فعاليات الجمعية والاحتفالات
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowAddForm(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            إضافة حفلة جديدة
          </button>
          <button 
            onClick={exportToExcel}
            className="bg-white border-2 border-emerald-100 text-emerald-600 hover:bg-emerald-50 px-4 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            <Download className="w-5 h-5" />
            تصدير
          </button>
          <label className="flex items-center justify-center p-3 bg-white border-2 border-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-50 transition-all shadow-sm cursor-pointer" title="استيراد حفلات">
            <UploadCloud className={`w-6 h-6 ${importing ? 'animate-bounce' : ''}`} />
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
          </label>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
              <PartyPopper className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-500">إجمالي الحفلات</p>
              <h3 className="text-2xl font-black text-gray-900 tabular-nums">{filteredParties.length}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-500">إجمالي التكاليف</p>
              <h3 className="text-2xl font-black text-gray-900 tabular-nums">{totalCost.toLocaleString()} ج.م</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-500">إجمالي الحضور</p>
              <h3 className="text-2xl font-black text-gray-900 tabular-nums">{totalAttendees.toLocaleString()}</h3>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl border border-emerald-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex flex-col md:flex-row gap-4 flex-grow w-full">
          <div className="relative flex-grow">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text"
              placeholder="بحث عن حفلة، راعي، أو موقع..."
              className="w-full pr-12 pl-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 ring-emerald-500/20 outline-none font-bold text-gray-900 text-right"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="bg-gray-50 border-none px-6 py-3 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500/20 text-right text-gray-900"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
          >
            <option value="desc">الأحدث أولاً</option>
            <option value="asc">الأقدم أولاً</option>
          </select>
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 font-sans no-scrollbar">
          <button 
            onClick={() => setTypeFilter('all')}
            className={`px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all ${typeFilter === 'all' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
          >
            الكل
          </button>
          {PARTY_TYPES.map(type => (
            <button 
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all ${typeFilter === type ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Parties List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-white h-64 rounded-3xl animate-pulse border border-emerald-50" />
          ))
        ) : filteredParties.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-emerald-100">
            <PartyPopper className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-400">لا يوجد حفلات مسجلة تطابق بحثك</h3>
          </div>
        ) : (
          filteredParties.map((party) => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={party.id}
              className="group bg-white rounded-3xl border border-emerald-100 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all overflow-hidden"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    party.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 
                    party.status === 'cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {party.status === 'completed' ? 'تم تنفيذها' : party.status === 'cancelled' ? 'ملغاة' : 'مخطط لها'}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setEditingParty(party);
                        setFormData({
                          title: party.title,
                          types: party.types || [],
                          date: party.date,
                          location: party.location,
                          cost: party.cost,
                          attendeesCount: party.attendeesCount,
                          sponsorName: party.sponsorName,
                          description: party.description,
                          programDetails: party.programDetails || '',
                          gifts: party.gifts || '',
                          volunteersCount: party.volunteersCount || 0,
                          status: party.status,
                          attachments: party.attachments || []
                        });
                        setShowEditForm(true);
                      }}
                      className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteParty(party.id)}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-xl font-black text-gray-900 mb-2 truncate">{party.title}</h3>
                <div className="flex flex-wrap gap-1 mb-4">
                  {party.types?.map(t => (
                    <span key={t} className="text-emerald-600 text-[10px] font-black bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{t}</span>
                  ))}
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-gray-600">
                    <Calendar className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold font-mono">{party.date}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-600">
                    <MapPin className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold truncate">{party.location}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-600">
                    <UserCheck className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold truncate">الراعي: {party.sponsorName || 'لا يوجد'}</span>
                  </div>
                  {party.volunteersCount > 0 && (
                    <div className="flex items-center gap-3 text-emerald-600">
                      <Users className="w-5 h-5" />
                      <span className="text-sm font-bold">المتطوعين: {party.volunteersCount}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 mb-1 leading-none">التكلفة</p>
                    <p className="text-lg font-black text-gray-900 tabular-nums leading-none">
                      {party.cost.toLocaleString()} <span className="text-xs font-bold">ج.م</span>
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 mb-1 leading-none">الحضور</p>
                    <p className="text-lg font-black text-gray-900 tabular-nums leading-none">
                      {party.attendeesCount.toLocaleString()} <span className="text-xs font-bold font-sans">شخص</span>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Add/Edit Modals */}
      <AnimatePresence>
        {(showAddForm || showEditForm) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => {
                setShowAddForm(false);
                setShowEditForm(false);
                setEditingParty(null);
                resetForm();
              }}
              className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 p-8"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-emerald-900">
                  {showEditForm ? 'تعديل بيانات الحفلة' : 'إضافة حفلة جديدة'}
                </h2>
                <button 
                  onClick={() => {
                    setShowAddForm(false);
                    setShowEditForm(false);
                    setEditingParty(null);
                    resetForm();
                  }}
                  className="p-2 hover:bg-emerald-50 rounded-full transition-all"
                >
                  <X className="w-6 h-6 text-emerald-400" />
                </button>
              </div>

              <form className="space-y-4 max-h-[70vh] overflow-y-auto px-2 custom-scrollbar" onSubmit={showEditForm ? handleUpdateParty : handleAddParty}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField 
                    label="اسم الفعالية / الحفلة" 
                    icon={<PartyPopper className="w-5 h-5 text-emerald-400" />} 
                    placeholder="مثال: حفل توزيع جوائز الأيتام" 
                    value={formData.title}
                    onChange={(val) => setFormData({...formData, title: val})}
                  />
                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">انواع الحفلة (يمكن اختيار أكثر من نوع)</label>
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 grid grid-cols-2 gap-3">
                      {PARTY_TYPES.map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            checked={formData.types?.includes(type)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormData(prev => ({
                                ...prev,
                                types: checked 
                                  ? [...(prev.types || []), type]
                                  : (prev.types || []).filter(t => t !== type)
                              }));
                            }}
                          />
                          <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-600 transition-colors uppercase">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField 
                    label="التاريخ" 
                    type="date"
                    icon={<Calendar className="w-5 h-5 text-emerald-400" />} 
                    value={formData.date}
                    onChange={(val) => setFormData({...formData, date: val})}
                  />
                  <FormField 
                    label="الموقع" 
                    icon={<MapPin className="w-5 h-5 text-emerald-400" />} 
                    placeholder="مثال: قاعة النور" 
                    value={formData.location}
                    onChange={(val) => setFormData({...formData, location: val})}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField 
                    label="التكلفة التقديرية" 
                    icon={<DollarSign className="w-5 h-5 text-emerald-400" />} 
                    placeholder="0" 
                    value={String(formData.cost ?? 0)}
                    onChange={(val) => setFormData({...formData, cost: Number(val) || 0})}
                  />
                  <FormField 
                    label="عدد الحضور المتوقع" 
                    icon={<Users className="w-5 h-5 text-emerald-400" />} 
                    placeholder="0" 
                    value={String(formData.attendeesCount ?? 0)}
                    onChange={(val) => setFormData({...formData, attendeesCount: Number(val) || 0})}
                  />
                </div>

                <FormField 
                  label="اسم الراعي (إن وجد)" 
                  icon={<UserCheck className="w-5 h-5 text-emerald-400" />} 
                  placeholder="مثال: فاعل خير / شركة كذا" 
                  value={formData.sponsorName}
                  onChange={(val) => setFormData({...formData, sponsorName: val})}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField 
                    label="عدد المتطوعين المنظمين" 
                    icon={<Users className="w-5 h-5 text-emerald-400" />} 
                    placeholder="0" 
                    value={String(formData.volunteersCount ?? 0)}
                    onChange={(val) => setFormData({...formData, volunteersCount: Number(val) || 0})}
                  />
                  <FormField 
                    label="الهدايا الموزعة" 
                    icon={<Star className="w-5 h-5 text-emerald-400" />} 
                    placeholder="مثال: شنط مدرسية، ألعاب.." 
                    value={formData.gifts}
                    onChange={(val) => setFormData({...formData, gifts: val})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-emerald-800 px-1">تفاصيل البرنامج والفقرات</label>
                  <textarea 
                    rows={2}
                    className="w-full bg-emerald-50 p-4 rounded-2xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 placeholder-emerald-300 font-bold"
                    placeholder="مثال: فقرة الساحر، مسابقات، غداء.." 
                    value={formData.programDetails}
                    onChange={(e) => setFormData({...formData, programDetails: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-emerald-800 px-1">تفاصيل إضافية</label>
                  <textarea 
                    rows={3}
                    className="w-full bg-emerald-50 p-4 rounded-2xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 placeholder-emerald-300 font-bold"
                    placeholder="اكتب ملاحظات الحفلة هنا..."
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-emerald-800 px-1">حالة الحفلة</label>
                  <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
                    <Info className="w-5 h-5 text-emerald-400" />
                    <select 
                      className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold"
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                    >
                      <option value="planned">مخطط لها</option>
                      <option value="completed">تم التنفيذ</option>
                      <option value="cancelled">ملغاة</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-emerald-800 px-1">صور ومستندات الحفلة</label>
                  <FileUploadSlot 
                    label="رفع صور الحفلة أو فواتيرها"
                    caseName={formData.title || 'حفلة_بدون_عنوان'}
                    values={formData.attachments}
                    onUpload={(updater) => {
                      if (typeof updater === 'function') {
                        setFormData(prev => ({ ...prev, attachments: updater(prev.attachments || []) }));
                      } else {
                        setFormData(prev => ({ ...prev, attachments: updater }));
                      }
                    }}
                  />
                </div>

                <div className="pt-6 flex gap-3">
                  <button type="submit" className="flex-grow bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95">
                    {showEditForm ? 'تحديث البيانات' : 'حفظ الفعالية'}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowAddForm(false);
                      setShowEditForm(false);
                      setEditingParty(null);
                      resetForm();
                    }}
                    className="px-8 py-4 text-emerald-600 font-bold hover:bg-emerald-50 rounded-2xl transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                  <h2 className="text-3xl font-black text-emerald-950">استيراد بيانات الحفلات</h2>
                  <p className="text-emerald-500 font-bold">اربط أعمدة ملف الإكسل بالخانات المطلوبة</p>
                </div>
                <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center">
                  <UploadCloud className="w-10 h-10 text-emerald-600" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-10">
                {PARTY_MAPPING_FIELDS.map(field => (
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
                    سيتم استيراد <span className="text-xl font-black tabular-nums">{importData.rows.length}</span> حفلة/فعالية. 
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

function FormField({ label, icon, placeholder, value, onChange, type = 'text' }: { 
  label: string; icon: React.ReactNode; placeholder?: string; value: string; onChange: (val: string) => void; type?: string 
}) {
  return (
    <div className="space-y-1 text-right">
      <label className="text-sm font-bold text-emerald-800 px-1">{label}</label>
      <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20 transition-all">
        <span className="text-emerald-400">{icon}</span>
        <input 
          type={type}
          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none placeholder-emerald-300 font-bold"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}