// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, FileText, Trash2, Edit, Save, X, 
  Users, Smartphone, Upload, BookOpen, Download, 
  MapPin, Globe, CreditCard, ChevronDown, ChevronUp,
  File, FileType, CheckCircle2, UserPlus, Briefcase,
  Loader2, BadgeInfo, Activity, Building, Calendar
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, onSnapshot, addDoc, updateDoc, 
  doc, query, orderBy, serverTimestamp, deleteDoc, 
  setDoc, getDoc 
} from 'firebase/firestore';

interface AssociationInfo {
  name: string;
  description: string;
  activities: string;
  address: string;
  phone: string;
  bankAccount: string;
}

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  department?: string;
  joinedAt: any;
}

interface Document {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string; // We'll simulate file storage with a simple link or base64 placeholder for now as we don't have Firebase Storage
  uploadedAt: any;
}

const ROLES = [
  'موظف استقبال',
  'مدخل بيانات',
  'رئيس قسم',
  'عامل/ه',
  'مدير',
  'نائب مدير',
  'سكرتير/ه',
  'مسؤول المطبخ',
  'مسؤول العيادة',
  'سائق',
  'مسعف',
  'مسؤول ايتام',
  'متطوع'
];

export default function AboutScreen() {
  const [activeTab, setActiveTab] = useState<'info' | 'employees' | 'documents'>('info');
  const [info, setInfo] = useState<AssociationInfo>({
    name: 'جمعية بصمة خير',
    description: '',
    activities: '',
    address: '',
    phone: '',
    bankAccount: ''
  });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeFormData, setEmployeeFormData] = useState({
    name: '',
    phone: '',
    role: ROLES[0],
    department: ''
  });

  const [showAddDocument, setShowAddDocument] = useState(false);
  const [documentFormData, setDocumentFormData] = useState({
    fileName: '',
    fileUrl: '',
    fileType: 'pdf'
  });

  useEffect(() => {
    // Info
    const unsubInfo = onSnapshot(doc(db, 'settings', 'about_info'), (snap) => {
      if (snap.exists()) {
        setInfo(snap.data() as AssociationInfo);
      }
    });

    // Employees
    const unsubEmployees = onSnapshot(query(collection(db, 'employees'), orderBy('joinedAt', 'desc')), (snap) => {
      setEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
    });

    // Documents
    const unsubDocs = onSnapshot(query(collection(db, 'about_documents'), orderBy('uploadedAt', 'desc')), (snap) => {
      setDocuments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document)));
      setLoading(false);
    });

    return () => {
      unsubInfo();
      unsubEmployees();
      unsubDocs();
    };
  }, []);

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    try {
      await setDoc(doc(db, 'settings', 'about_info'), {
        ...info,
        updatedAt: serverTimestamp()
      });
      alert('تم حفظ بيانات الجمعية بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/about_info');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmployee) {
        await updateDoc(doc(db, 'employees', editingEmployee.id), {
          ...employeeFormData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'employees'), {
          ...employeeFormData,
          joinedAt: serverTimestamp()
        });
      }
      setShowAddEmployee(false);
      setEditingEmployee(null);
      setEmployeeFormData({ name: '', phone: '', role: ROLES[0], department: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'employees');
    }
  };

  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'about_documents'), {
        ...documentFormData,
        uploadedAt: serverTimestamp()
      });
      setShowAddDocument(false);
      setDocumentFormData({ fileName: '', fileUrl: '', fileType: 'pdf' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'about_documents');
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد حذف موظف',
      message: 'هل أنت متأكد من حذف بيانات هذا الموظف؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'employees', id));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `employees/${id}`);
        }
      }
    });
  };

  const handleDeleteDocument = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد حذف المستند',
      message: 'هل أنت متأكد من حذف هذا المستند؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'about_documents', id));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `about_documents/${id}`);
        }
      }
    });
  };

  return (
    <div className="p-6 font-sans text-right mb-20" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-emerald-950 mb-2">معلومات عن بصمة خير</h1>
        <p className="text-emerald-600 font-bold">تعريف بالجمعية، أنشطتها، وفريق العمل</p>
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        {[
          { id: 'info', label: 'معلومات عامة', icon: <Building className="w-5 h-5" /> },
          { id: 'employees', label: 'فريق العمل', icon: <Users className="w-5 h-5" /> },
          { id: 'documents', label: 'المستندات', icon: <FileText className="w-5 h-5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black transition-all ${
              activeTab === tab.id 
              ? "bg-emerald-600 text-white shadow-xl shadow-emerald-200" 
              : "bg-white text-emerald-800 border border-emerald-50 hover:bg-emerald-50"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'info' && (
          <motion.div
            key="info-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-emerald-50 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-emerald-900 font-black pr-2">
                    <BadgeInfo className="w-5 h-5 text-emerald-400" />
                    اسم الجمعية
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-stone-50 border border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-emerald-900"
                    placeholder="جمعية بصمة خير نبروه"
                    value={info.name}
                    onChange={(e) => setInfo({...info, name: e.target.value})}
                  />
                </div>
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-emerald-900 font-black pr-2">
                    <MapPin className="w-5 h-5 text-emerald-400" />
                    عنوان المقر الرئيسي
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-stone-50 border border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-emerald-900"
                    placeholder="نبروه - الدقهلية..."
                    value={info.address}
                    onChange={(e) => setInfo({...info, address: e.target.value})}
                  />
                </div>
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-emerald-900 font-black pr-2">
                    <Smartphone className="w-5 h-5 text-emerald-400" />
                    أرقام التواصل
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-stone-50 border border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-emerald-900 tabular-nums"
                    placeholder="010..."
                    value={info.phone}
                    onChange={(e) => setInfo({...info, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-emerald-900 font-black pr-2">
                    <CreditCard className="w-5 h-5 text-emerald-400" />
                    فودافون كاش / حساب البنكي
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-stone-50 border border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-emerald-900 tabular-nums"
                    placeholder="حساب رقم..."
                    value={info.bankAccount}
                    onChange={(e) => setInfo({...info, bankAccount: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2 space-y-4">
                  <label className="flex items-center gap-2 text-emerald-900 font-black pr-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    نبذة عن الجمعية وأهدافها الأساسية
                  </label>
                  <textarea 
                    className="w-full bg-stone-50 border border-emerald-50 p-6 rounded-[2rem] min-h-[150px] outline-none focus:border-emerald-500 font-bold text-emerald-900 leading-relaxed"
                    value={info.description}
                    onChange={(e) => setInfo({...info, description: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2 space-y-4">
                  <label className="flex items-center gap-2 text-emerald-900 font-black pr-2">
                    <BookOpen className="w-5 h-5 text-emerald-400" />
                    أنشطة الجمعية الحالية
                  </label>
                  <textarea 
                    className="w-full bg-stone-50 border border-emerald-50 p-6 rounded-[2rem] min-h-[150px] outline-none focus:border-emerald-500 font-bold text-emerald-900 leading-relaxed"
                    value={info.activities}
                    onChange={(e) => setInfo({...info, activities: e.target.value})}
                    placeholder="مثال: إطعام، كفالة يتيم، مساعدات علاجية..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-6">
                <button 
                  onClick={handleSaveInfo}
                  disabled={savingInfo}
                  className="bg-emerald-600 text-white px-12 py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                >
                  {savingInfo ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                  حفظ معلومات الجمعية
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'employees' && (
          <motion.div
            key="employees-tab"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <div className="flex items-center justify-between mb-8">
              <div className="bg-emerald-100/50 px-6 py-3 rounded-2xl border border-emerald-100 flex items-center gap-3">
                 <Users className="w-6 h-6 text-emerald-600" />
                 <span className="text-xl font-black text-emerald-900 tabular-nums">{employees.length} موظف</span>
              </div>
              <button 
                onClick={() => { setEditingEmployee(null); setEmployeeFormData({ name: '', phone: '', role: ROLES[0], department: '' }); setShowAddEmployee(true); }}
                className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-100 hover:shadow-xl transition-all"
              >
                <UserPlus className="w-5 h-5" />
                إضافة موظف جديد
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {employees.map(emp => (
                <div key={emp.id} className="bg-white p-6 rounded-[2rem] border border-emerald-50 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-50 opacity-0 group-hover:opacity-100 group-hover:scale-[6] transition-all duration-700 pointer-events-none rounded-full" />
                   
                   <div className="relative z-10 flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center mb-4 border border-emerald-100 group-hover:bg-white transition-colors">
                        <Users className="w-8 h-8 text-emerald-600" />
                      </div>
                      <h3 className="text-xl font-black text-emerald-950 mb-1">{emp.name}</h3>
                      <p className="text-emerald-600 font-bold text-sm bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 mb-4 inline-block">
                        {emp.role} {emp.department && `- ${emp.department}`}
                      </p>
                      
                      <div className="w-full bg-stone-50 rounded-2xl p-4 border border-stone-100 flex items-center justify-between mb-6">
                        <Smartphone className="w-5 h-5 text-emerald-300" />
                        <span className="text-lg font-black text-emerald-900 tabular-nums tracking-widest">{emp.phone}</span>
                      </div>

                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={() => { setEditingEmployee(emp); setEmployeeFormData({ name: emp.name, phone: emp.phone, role: emp.role, department: emp.department || '' }); setShowAddEmployee(true); }}
                          className="flex-grow bg-white border border-emerald-100 text-emerald-600 py-3 rounded-xl font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          تعديل
                        </button>
                        <button 
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="w-12 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-100 transition-all border border-rose-100"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                   </div>
                </div>
              ))}
              {employees.length === 0 && (
                <div className="col-span-full py-24 text-center">
                  <Users className="w-20 h-20 text-stone-200 mx-auto mb-4" />
                  <p className="text-stone-400 font-black text-xl">لم يتم إضافة موظفين بعد</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'documents' && (
          <motion.div
            key="documents-tab"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="flex items-center justify-between mb-8">
               <div className="bg-blue-100/50 px-6 py-3 rounded-2xl border border-blue-100 flex items-center gap-3">
                 <FileText className="w-6 h-6 text-blue-600" />
                 <span className="text-xl font-black text-blue-900 tabular-nums">{documents.length} مستند</span>
              </div>
              <button 
                onClick={() => setShowAddDocument(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100 hover:shadow-xl transition-all"
              >
                <Plus className="w-5 h-5" />
                رفع مستند جديد
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {documents.map(doc => (
                <div key={doc.id} className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm group hover:border-blue-300 transition-all">
                  <div className="aspect-square bg-stone-50 rounded-2xl mb-4 flex items-center justify-center border-2 border-dashed border-stone-200 relative overflow-hidden group-hover:bg-blue-50/30 transition-colors">
                     <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 animate-pulse group-hover:scale-110 transition-transform">
                          {doc.fileType === 'pdf' ? <FileText className="w-12 h-12 text-rose-400" /> : <FileType className="w-12 h-12 text-blue-400" />}
                          <span className="text-[10px] font-black uppercase bg-stone-100 text-stone-500 px-2 py-0.5 rounded-lg border border-stone-200">{doc.fileType}</span>
                        </div>
                     </div>
                  </div>
                  <h4 className="font-black text-emerald-950 mb-1 truncate text-center">{doc.fileName}</h4>
                  <p className="text-[10px] text-stone-400 font-bold mb-4 text-center tabular-nums">
                    {doc.uploadedAt?.toDate() ? new Date(doc.uploadedAt.toDate()).toLocaleDateString('ar-EG') : 'الان'}
                  </p>
                  
                  <div className="flex gap-2">
                    <a 
                      href={doc.fileUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex-grow bg-blue-50 text-blue-600 py-3 rounded-xl font-black text-sm hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      تحميل
                    </a>
                    <button 
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="w-12 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center border border-rose-100 hover:bg-rose-100 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
              {documents.length === 0 && (
                <div className="col-span-full py-24 text-center">
                  <div className="bg-stone-50 p-8 rounded-full inline-block mb-4">
                    <FileText className="w-12 h-12 text-stone-200" />
                  </div>
                  <p className="text-stone-400 font-black text-xl">لا توجد مستندات مرفوعة</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Employee Modal */}
      <AnimatePresence>
        {showAddEmployee && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddEmployee(false)}
              className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden relative z-10 border border-emerald-100"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black text-emerald-950">{editingEmployee ? 'تعديل بيانات موظف' : 'إضافة موظف جديد'}</h2>
                  <button onClick={() => setShowAddEmployee(false)} className="p-2 bg-stone-50 text-stone-400 rounded-xl hover:bg-stone-100 transition-all"><X className="w-6 h-6" /></button>
                </div>
                
                <form onSubmit={handleSaveEmployee} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-emerald-900 pr-2">اسم الموظف بالكامل</label>
                    <input 
                      required
                      type="text"
                      className="w-full bg-stone-50 border border-emerald-50 p-4 rounded-2xl outline-none focus:border-emerald-600 font-bold"
                      value={employeeFormData.name}
                      onChange={(e) => setEmployeeFormData({...employeeFormData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-emerald-900 pr-2">رقم الهاتف</label>
                    <input 
                      required
                      type="tel"
                      className="w-full bg-stone-50 border border-emerald-50 p-4 rounded-2xl outline-none focus:border-emerald-600 font-bold tabular-nums"
                      value={employeeFormData.phone}
                      onChange={(e) => setEmployeeFormData({...employeeFormData, phone: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-emerald-900 pr-2">الوظيفة في الجمعية</label>
                    <select 
                      className="w-full bg-stone-50 border border-emerald-100 p-4 rounded-2xl outline-none font-bold"
                      value={employeeFormData.role}
                      onChange={(e) => setEmployeeFormData({...employeeFormData, role: e.target.value})}
                    >
                      {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </div>
                  {employeeFormData.role === 'رئيس قسم' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                      <label className="text-xs font-black text-emerald-900 pr-2">اسم القسم</label>
                      <input 
                        required
                        type="text"
                        className="w-full bg-stone-50 border border-emerald-100 p-4 rounded-2xl outline-none focus:border-emerald-600 font-bold"
                        value={employeeFormData.department}
                        onChange={(e) => setEmployeeFormData({...employeeFormData, department: e.target.value})}
                        placeholder="مثال: قسم الأيتام، قسم الإطعام..."
                      />
                    </div>
                  )}
                  
                  <button 
                    type="submit"
                    className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all border-none"
                  >
                    {editingEmployee ? 'حفظ التغييرات' : 'إضافة الموظف للفريق'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Document Modal */}
      <AnimatePresence>
        {showAddDocument && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddDocument(false)}
              className="absolute inset-0 bg-blue-950/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden relative z-10 border border-blue-100"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black text-blue-950">رفع مستند جديد</h2>
                  <button onClick={() => setShowAddDocument(false)} className="p-2 bg-stone-50 text-stone-400 rounded-xl hover:bg-stone-100 transition-all"><X className="w-6 h-6" /></button>
                </div>
                
                <form onSubmit={handleSaveDocument} className="space-y-6">
                  <div className="space-y-2 text-right">
                    <label className="text-xs font-black text-blue-900 pr-2">اسم المستند</label>
                    <input 
                      required
                      type="text"
                      className="w-full bg-stone-50 border border-blue-50 p-4 rounded-2xl outline-none focus:border-blue-600 font-bold text-right"
                      value={documentFormData.fileName}
                      onChange={(e) => setDocumentFormData({...documentFormData, fileName: e.target.value})}
                      placeholder="عقد الجمعية، لائحة، صورة..."
                    />
                  </div>
                  <div className="space-y-2 text-right">
                    <label className="text-xs font-black text-blue-900 pr-2">نوع الملف</label>
                    <select 
                      className="w-full bg-stone-50 border border-blue-50 p-4 rounded-2xl outline-none font-bold text-right"
                      value={documentFormData.fileType}
                      onChange={(e) => setDocumentFormData({...documentFormData, fileType: e.target.value})}
                    >
                      <option value="pdf">ملف PDF</option>
                      <option value="jpg">صورة JPG</option>
                      <option value="png">صورة PNG</option>
                    </select>
                  </div>
                  <div className="space-y-2 text-right">
                    <label className="text-xs font-black text-blue-900 pr-2">رابط الملف / الملف</label>
                    <input 
                      required
                      type="text"
                      className="w-full bg-stone-50 border border-blue-50 p-4 rounded-2xl outline-none focus:border-blue-600 font-bold text-right"
                      value={documentFormData.fileUrl}
                      onChange={(e) => setDocumentFormData({...documentFormData, fileUrl: e.target.value})}
                      placeholder="ضع رابط الملف هنا..."
                    />
                    <p className="text-[10px] text-stone-400 font-bold px-2">يتم رفع الملفات على سحابة خارجية حالياً ووضع الرابط هنا</p>
                  </div>
                  
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all border-none"
                  >
                    تأكيد الرفع والحفظ
                  </button>
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
    </div>
  );
}