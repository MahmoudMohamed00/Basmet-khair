// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Calendar, User, Hospital, FileText, ClipboardList, Activity, FlaskConical, Database, Image as ImageIcon, CheckCircle2, AlertCircle, Clock, Trash2, Shield, Eye, EyeOff, Loader2, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import ConfirmModal from './ConfirmModal';
import { uploadToGoogleDrive } from '../lib/driveUpload';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

type MedicalTab = 'prescriptions' | 'surgeries' | 'labTests' | 'radiology';

interface MedicalModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseName: string;
  mode?: 'general' | 'independent';
}

export default function MedicalModal({ isOpen, onClose, caseId, caseName, mode = 'general' }: MedicalModalProps) {
  const [activeTab, setActiveTab] = useState<MedicalTab>('prescriptions');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const basePath = mode === 'independent' ? 'medicalCases' : 'cases';

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

  // Form states
  const [prescriptionForm, setPrescriptionForm] = useState({
    doctorName: '', clinicName: '', date: new Date().toISOString().split('T')[0], medicines: '', notes: '', imageUrl: '', isPublic: false
  });
  const [surgeryForm, setSurgeryForm] = useState({
    hospitalName: '', doctorName: '', date: new Date().toISOString().split('T')[0], reportUrl: '', cost: 0, status: 'not_started' as any, notes: '', isPublic: false
  });
  const [labForm, setLabForm] = useState({
    testType: '', labName: '', date: new Date().toISOString().split('T')[0], resultUrl: '', status: 'normal' as any, isPublic: false
  });
  const [radiologyForm, setRadiologyForm] = useState({
    scanType: '', centerName: '', date: new Date().toISOString().split('T')[0], imageUrl: '', reportUrl: '', notes: '', isPublic: false
  });

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const q = query(collection(db, `${basePath}/${caseId}/${activeTab}`), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `${basePath}/${caseId}/${activeTab}`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isOpen, activeTab, caseId, basePath]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string, setter: any) => {
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
      
      // 1. Upload to Firebase (existing)
      const storageRef = ref(storage, `medical/${caseId}/${activeTab}/${Date.now()}_${file.name}`);
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
      
      // 2. Upload to Google Drive (new)
      try {
        await uploadToGoogleDrive(file, `القسم الطبي - ${activeTab}`, caseName);
      } catch (driveErr) {
        console.error("Google Drive sync failed:", driveErr);
        // We don't block the UI if drive fails but firebase works, 
        // but we should probably log it.
      }

      setter((prev: any) => ({ ...prev, [fieldName]: url }));
    } catch (error: any) {
      console.error("Upload error details:", error);
      let userMsg = `فشل رفع الملف: ${error.message}`;
      if (error.code === 'storage/retry-limit-exceeded') {
        userMsg = "فشل الرفع: تجاوز الحد الأقصى للمحاولة. قد يكون ذلك بسبب ضعف الاتصال بالإنترنت، تجاوز حصة Firebase (Storage Quota)، أو عدم تفعيل الخدمة في لوحة التحكم.";
      }
      alert(userMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let data = {};
    if (activeTab === 'prescriptions') data = prescriptionForm;
    else if (activeTab === 'surgeries') data = surgeryForm;
    else if (activeTab === 'labTests') data = labForm;
    else if (activeTab === 'radiology') data = radiologyForm;

    try {
      await addDoc(collection(db, `${basePath}/${caseId}/${activeTab}`), {
        ...data,
        createdAt: serverTimestamp()
      });
      setShowAddForm(false);
      resetForms();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${basePath}/${caseId}/${activeTab}`);
    }
  };

  const resetForms = () => {
    setPrescriptionForm({ doctorName: '', clinicName: '', date: new Date().toISOString().split('T')[0], medicines: '', notes: '', imageUrl: '', isPublic: false });
    setSurgeryForm({ hospitalName: '', doctorName: '', date: new Date().toISOString().split('T')[0], reportUrl: '', cost: 0, status: 'not_started', notes: '', isPublic: false });
    setLabForm({ testType: '', labName: '', date: new Date().toISOString().split('T')[0], resultUrl: '', status: 'normal', isPublic: false });
    setRadiologyForm({ scanType: '', centerName: '', date: new Date().toISOString().split('T')[0], imageUrl: '', reportUrl: '', notes: '', isPublic: false });
  };

  const handleDelete = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا السجل الطبي؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, `${basePath}/${caseId}/${activeTab}`, id));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `${basePath}/${caseId}/${activeTab}/${id}`);
        }
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-emerald-950/40 backdrop-blur-md"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[90vh] overflow-hidden relative z-10 font-sans flex flex-col" dir="rtl"
      >
        {/* Header */}
        <div className="bg-emerald-900 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
              <ClipboardList className="w-8 h-8 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">الملف الطبي: {caseName}</h2>
              <p className="text-emerald-200/60 text-sm">إدارة السجلات الطبية والتقارير الصحية</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-8 h-8 text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-emerald-50 bg-emerald-50/20 px-6">
          <TabButton active={activeTab === 'prescriptions'} onClick={() => setActiveTab('prescriptions')} icon={<FileText className="w-4 h-4" />} label="الروشتات" />
          <TabButton active={activeTab === 'surgeries'} onClick={() => setActiveTab('surgeries')} icon={<Activity className="w-4 h-4" />} label="العمليات" />
          <TabButton active={activeTab === 'labTests'} onClick={() => setActiveTab('labTests')} icon={<FlaskConical className="w-4 h-4" />} label="التحاليل" />
          <TabButton active={activeTab === 'radiology'} onClick={() => setActiveTab('radiology')} icon={<Database className="w-4 h-4" />} label="الأشعة" />
        </div>

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto p-6 bg-stone-50 custom-scrollbar">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-emerald-900">
              {activeTab === 'prescriptions' ? 'سجل الروشتات الطبية' : 
               activeTab === 'surgeries' ? 'سجل العمليات الجراحية' : 
               activeTab === 'labTests' ? 'سجل التحاليل الطبية' : 'سجل الأشعة والفحوصات'}
            </h3>
            <button 
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-all font-bold text-sm shadow-lg shadow-emerald-100"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة جديد</span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-emerald-50 text-emerald-300">
              <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-bold">لا يوجد سجلات مضافة لهذا القسم</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {records.map(record => (
                <RecordCard 
                  key={record.id} 
                  type={activeTab} 
                  record={record} 
                  onDelete={() => handleDelete(record.id)} 
                />
              ))}
            </div>
          )}
        </div>

        {/* Add Form Modal */}
        <AnimatePresence>
          {showAddForm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowAddForm(false)}
                className="absolute inset-0 bg-emerald-950/30 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden relative z-10 flex flex-col p-8"
              >
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-xl font-bold text-emerald-900">إضافة {activeTab === 'prescriptions' ? 'روشتة' : activeTab === 'surgeries' ? 'عملية' : activeTab === 'labTests' ? 'تحليل' : 'أشعة'}</h4>
                  <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-emerald-50 rounded-full"><X className="w-6 h-6" /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {activeTab === 'prescriptions' && (
                    <>
                      <FormInput label="اسم الدكتور" value={prescriptionForm.doctorName} onChange={val => setPrescriptionForm({...prescriptionForm, doctorName: val})} icon={<User className="w-4 h-4" />} />
                      <FormInput label="اسم العيادة" value={prescriptionForm.clinicName} onChange={val => setPrescriptionForm({...prescriptionForm, clinicName: val})} icon={<Hospital className="w-4 h-4" />} />
                      <FormInput type="date" label="تاريخ الروشتة" value={prescriptionForm.date} onChange={val => setPrescriptionForm({...prescriptionForm, date: val})} icon={<Calendar className="w-4 h-4" />} />
                      <FormTextarea label="الأدوية المكتوبة" value={prescriptionForm.medicines} onChange={val => setPrescriptionForm({...prescriptionForm, medicines: val})} />
                      <div className="flex items-center justify-between gap-4">
                        <UploadButton label="صورة الروشتة" url={prescriptionForm.imageUrl} onUpload={e => handleFileUpload(e, 'imageUrl', setPrescriptionForm)} uploading={uploading} />
                        <PrivacyToggle isPublic={prescriptionForm.isPublic} onToggle={val => setPrescriptionForm({...prescriptionForm, isPublic: val})} />
                      </div>
                    </>
                  )}

                  {activeTab === 'surgeries' && (
                    <>
                      <FormInput label="اسم المستشفى" value={surgeryForm.hospitalName} onChange={val => setSurgeryForm({...surgeryForm, hospitalName: val})} icon={<Hospital className="w-4 h-4" />} />
                      <FormInput label="اسم الطبيب" value={surgeryForm.doctorName} onChange={val => setSurgeryForm({...surgeryForm, doctorName: val})} icon={<User className="w-4 h-4" />} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormInput type="date" label="تاريخ العملية" value={surgeryForm.date} onChange={val => setSurgeryForm({...surgeryForm, date: val})} icon={<Calendar className="w-4 h-4" />} />
                        <FormInput type="number" label="التكلفة" value={String(surgeryForm.cost ?? 0)} onChange={val => setSurgeryForm({...surgeryForm, cost: Number(val)})} icon={<Database className="w-4 h-4" />} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-emerald-800">حالة العملية</label>
                        <select 
                          className="w-full bg-emerald-50 p-3 rounded-xl border border-emerald-100 font-bold"
                          value={surgeryForm.status}
                          onChange={e => setSurgeryForm({...surgeryForm, status: e.target.value as any})}
                        >
                          <option value="not_started">لم تتم</option>
                          <option value="in_progress">قيد التنفيذ</option>
                          <option value="completed">تمت</option>
                        </select>
                      </div>
                      <UploadButton label="تقرير العملية" url={surgeryForm.reportUrl} onUpload={e => handleFileUpload(e, 'reportUrl', setSurgeryForm)} uploading={uploading} />
                      <PrivacyToggle isPublic={surgeryForm.isPublic} onToggle={val => setSurgeryForm({...surgeryForm, isPublic: val})} />
                    </>
                  )}

                  {activeTab === 'labTests' && (
                    <>
                      <FormInput label="نوع التحليل" value={labForm.testType} onChange={val => setLabForm({...labForm, testType: val})} icon={<FlaskConical className="w-4 h-4" />} />
                      <FormInput label="اسم المعمل" value={labForm.labName} onChange={val => setLabForm({...labForm, labName: val})} icon={<Hospital className="w-4 h-4" />} />
                      <FormInput type="date" label="تاريخ التحليل" value={labForm.date} onChange={val => setLabForm({...labForm, date: val})} icon={<Calendar className="w-4 h-4" />} />
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-emerald-800">النتيجة</label>
                        <select 
                          className="w-full bg-emerald-50 p-3 rounded-xl border border-emerald-100 font-bold"
                          value={labForm.status}
                          onChange={e => setLabForm({...labForm, status: e.target.value as any})}
                        >
                          <option value="normal">طبيعي</option>
                          <option value="abnormal">غير طبيعي</option>
                        </select>
                      </div>
                      <UploadButton label="ملف النتيجة" url={labForm.resultUrl} onUpload={e => handleFileUpload(e, 'resultUrl', setLabForm)} uploading={uploading} />
                      <PrivacyToggle isPublic={labForm.isPublic} onToggle={val => setLabForm({...labForm, isPublic: val})} />
                    </>
                  )}

                  {activeTab === 'radiology' && (
                    <>
                      <FormInput label="نوع الأشعة" value={radiologyForm.scanType} onChange={val => setRadiologyForm({...radiologyForm, scanType: val})} icon={<ImageIcon className="w-4 h-4" />} />
                      <FormInput label="اسم المركز" value={radiologyForm.centerName} onChange={val => setRadiologyForm({...radiologyForm, centerName: val})} icon={<Hospital className="w-4 h-4" />} />
                      <FormInput type="date" label="التاريخ" value={radiologyForm.date} onChange={val => setRadiologyForm({...radiologyForm, date: val})} icon={<Calendar className="w-4 h-4" />} />
                      <div className="grid grid-cols-2 gap-4">
                        <UploadButton label="صورة الأشعة" url={radiologyForm.imageUrl} onUpload={e => handleFileUpload(e, 'imageUrl', setRadiologyForm)} uploading={uploading} />
                        <UploadButton label="تقرير الدكتور" url={radiologyForm.reportUrl} onUpload={e => handleFileUpload(e, 'reportUrl', setRadiologyForm)} uploading={uploading} />
                      </div>
                      <FormTextarea label="ملاحظات" value={radiologyForm.notes} onChange={val => setRadiologyForm({...radiologyForm, notes: val})} />
                      <PrivacyToggle isPublic={radiologyForm.isPublic} onToggle={val => setRadiologyForm({...radiologyForm, isPublic: val})} />
                    </>
                  )}

                  <button 
                    type="submit" 
                    disabled={uploading}
                    className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    {uploading ? 'جاري رفع الملفات...' : 'حفظ البيانات'}
                  </button>
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
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-4 font-bold text-sm transition-all relative",
        active ? "text-emerald-700" : "text-emerald-400 hover:text-emerald-600"
      )}
    >
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="medicalTab" className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-t-full" />}
    </button>
  );
}

function RecordCard({ type, record, onDelete }: { type: MedicalTab; record: any; onDelete: () => void | Promise<void>; key?: any }) {
  return (
    <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden group hover:shadow-xl transition-all h-full flex flex-col">
      <div className="p-5 flex-grow">
        <div className="flex justify-between items-start mb-4">
          <div className="bg-emerald-50 p-2 rounded-xl">
             <Calendar className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex items-center gap-2">
            {record.isPublic ? (
              <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                 <Eye className="w-3 h-3" /> متاح للجميع
              </span>
            ) : (
              <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                 <Shield className="w-3 h-3" /> خاص بالمدير
              </span>
            )}
            <button onClick={onDelete} className="p-1.5 text-rose-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-emerald-600 text-xs font-bold tabular-nums">{record.date}</p>
          
          {type === 'prescriptions' && (
            <>
              <h4 className="font-bold text-emerald-950">د/ {record.doctorName}</h4>
              <p className="text-xs text-emerald-700/60 font-bold">{record.clinicName}</p>
              <div className="bg-stone-50 p-3 rounded-2xl text-xs text-emerald-900 border border-emerald-50 line-clamp-3">
                {record.medicines}
              </div>
            </>
          )}

          {type === 'surgeries' && (
            <>
              <h4 className="font-bold text-emerald-950">{record.hospitalName}</h4>
              <p className="text-xs text-emerald-700/60 font-bold">بواسطة: د/ {record.doctorName}</p>
              <div className="flex items-center justify-between">
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold",
                  record.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                  record.status === 'in_progress' ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                )}>
                  {record.status === 'completed' ? 'تمت' : record.status === 'in_progress' ? 'قيد التنفيذ' : 'لم تنفذ'}
                </span>
                <span className="font-bold text-emerald-900 text-sm tabular-nums">{record.cost} ج.م</span>
              </div>
            </>
          )}

          {type === 'labTests' && (
            <>
              <h4 className="font-bold text-emerald-950">{record.testType}</h4>
              <p className="text-xs text-emerald-700/60 font-bold">{record.labName}</p>
              <div className={cn(
                "flex items-center gap-2 p-2 rounded-xl text-xs font-bold",
                record.status === 'normal' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              )}>
                {record.status === 'normal' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                النتيجة: {record.status === 'normal' ? 'طبيعي' : 'غير طبيعي'}
              </div>
            </>
          )}

          {type === 'radiology' && (
            <>
              <h4 className="font-bold text-emerald-950">{record.scanType}</h4>
              <p className="text-xs text-emerald-700/60 font-bold">{record.centerName}</p>
              {record.notes && <p className="text-xs text-emerald-800 font-medium bg-stone-50 p-2 rounded-xl">"{record.notes}"</p>}
            </>
          )}
        </div>
      </div>

      <div className="p-4 bg-emerald-50/50 border-t border-emerald-50 flex gap-2">
         {(record.imageUrl || record.reportUrl || record.resultUrl) ? (
           <>
              {record.imageUrl && (
                <a href={record.imageUrl} target="_blank" className="flex-grow flex items-center justify-center gap-2 bg-white border border-emerald-100 text-emerald-700 py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 hover:text-white transition-all">
                  <ImageIcon className="w-4 h-4" /> عرض الصور
                </a>
              )}
              {(record.reportUrl || record.resultUrl) && (
                <a href={record.reportUrl || record.resultUrl} target="_blank" className="flex-grow flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
                  <FileText className="w-4 h-4" /> تحميل التقرير
                </a>
              )}
           </>
         ) : (
           <div className="w-full text-center text-[10px] text-stone-400 py-2">لا توجد ملفات مرفقة</div>
         )}
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, icon, type = "text" }: { label: string; value: string; onChange: (val: string) => void; icon?: React.ReactNode; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-emerald-800 px-1">{label}</label>
      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-emerald-500/20">
        {icon && <div className="text-emerald-400">{icon}</div>}
        <input 
          type={type}
          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold text-sm"
          placeholder={label}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function FormTextarea({ label, value, onChange }: { label: string; value: string; onChange: (val: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-emerald-800 px-1">{label}</label>
      <textarea 
        rows={3}
        className="w-full bg-emerald-50 p-4 rounded-xl border border-emerald-100 focus:ring-2 ring-emerald-500/20 outline-none text-emerald-950 placeholder-emerald-300 font-bold text-sm"
        placeholder={label}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function PrivacyToggle({ isPublic, onToggle }: { isPublic: boolean; onToggle: (val: boolean) => void }) {
  return (
    <button 
      type="button"
      onClick={() => onToggle(!isPublic)}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all font-bold text-xs",
        isPublic ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-amber-50 border-amber-500 text-amber-700"
      )}
    >
      {isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      <span>{isPublic ? 'متاح للجميع' : 'خاص بالمدير'}</span>
    </button>
  );
}

function UploadButton({ label, url, onUpload, uploading }: { label: string; url?: string; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; uploading: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1 flex-grow">
      <label className="text-xs font-bold text-emerald-800 px-1">{label}</label>
      <button 
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "w-full flex items-center justify-center gap-2 bg-stone-50 border-2 border-dashed border-emerald-100 p-3 rounded-xl transition-all",
          url ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "hover:border-emerald-300 text-emerald-400"
        )}
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : url ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
        <span className="text-[10px] font-bold">{url ? 'تم الرفع' : 'رفع ملف'}</span>
      </button>
      <input type="file" className="hidden" ref={inputRef} onChange={onUpload} accept="image/*,.pdf" />
    </div>
  );
}