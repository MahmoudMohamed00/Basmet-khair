// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Terminal, Shield, Database, Users, Eye, AlertTriangle, RefreshCw, Trash2, ShieldAlert, CheckCircle2, XCircle, Clock, Lock, Unlock, Timer, Undo, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, getDoc, query, limit, orderBy, deleteDoc, doc, writeBatch, where, updateDoc, serverTimestamp, onSnapshot, setDoc } from 'firebase/firestore';
import ConfirmModal from './ConfirmModal';
import BrandingUpload from './BrandingUpload';

export default function DeveloperScreen() {
  const [siteSettings, setSiteSettings] = useState({
    isLocked: false,
    lockSchedule: {
      start: '00:00',
      end: '08:00'
    }
  });
  const [stats, setStats] = useState({
    casesCount: 0,
    donorsCount: 0,
    logsCount: 0,
    volunteersCount: 0,
    pendingCases: 0,
    pendingDonors: 0
  });
  const [pendingItems, setPendingItems] = useState<{
    id: string, 
    name: string, 
    type: 'case' | 'donor', 
    date: any,
    details?: { phone?: string, category?: string }
  }[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [systemChanges, setSystemChanges] = useState<any[]>([]);
  const [changesLoading, setChangesLoading] = useState(true);
  
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'warning'
  });

  const fetchStats = async () => {
    try {
      const [cases, donors, logs, volunteers, pCases, pDonors] = await Promise.all([
        getDocs(collection(db, 'cases')),
        getDocs(collection(db, 'donors')),
        getDocs(collection(db, 'logs')),
        getDocs(collection(db, 'volunteers')),
        getDocs(query(collection(db, 'cases'), where('status', '==', 'pending'))),
        getDocs(query(collection(db, 'donors'), where('status', '==', 'pending')))
      ]);
      
      setStats({
        casesCount: cases.size,
        donorsCount: donors.size,
        logsCount: logs.size,
        volunteersCount: volunteers.size,
        pendingCases: pCases.size,
        pendingDonors: pDonors.size
      });

      const pending = [
        ...pCases.docs.map(d => ({ 
          id: d.id, 
          name: d.data().name, 
          type: 'case' as const, 
          date: d.data().createdAt,
          details: { phone: d.data().phone, category: d.data().category }
        })),
        ...pDonors.docs.map(d => ({ 
          id: d.id, 
          name: d.data().name, 
          type: 'donor' as const, 
          date: d.data().createdAt,
          details: { phone: d.data().phone, category: d.data().donationType }
        }))
      ];
      setPendingItems(pending);
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Listen to site settings
    const unsub = onSnapshot(doc(db, 'settings', 'site_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSiteSettings({
          isLocked: data.isLocked || false,
          lockSchedule: data.lockSchedule || { start: '00:00', end: '08:00' }
        });
      }
    });

    const qChanges = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(150));
    const unsubChanges = onSnapshot(qChanges, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSystemChanges(data.filter(x => x.type === 'add' || x.type === 'delete'));
      setChangesLoading(false);
    });

    return () => {
      unsub();
      unsubChanges();
    };
  }, []);

  const handleToggleLock = async () => {
    try {
      await setDoc(doc(db, 'settings', 'site_config'), {
        ...siteSettings,
        isLocked: !siteSettings.isLocked
      }, { merge: true });
      alert(`تم ${!siteSettings.isLocked ? 'قفل' : 'فتح'} الموقع بنجاح`);
    } catch (err) {
      alert('فشل في تغيير حالة القفل');
    }
  };

  const handleSaveSchedule = async () => {
    try {
      await setDoc(doc(db, 'settings', 'site_config'), {
        lockSchedule: siteSettings.lockSchedule
      }, { merge: true });
      alert('تم حفظ مواعيد الإغلاق بنجاح');
    } catch (err) {
      alert('فشل في حفظ المواعيد');
    }
  };

  const handleApproveAll = async () => {
    if (pendingItems.length === 0) return;
    
    setConfirmConfig({
      isOpen: true,
      title: 'الموافقة على الكل',
      message: `هل أنت متأكد من الموافقة على جميع الطلبات المعلقة (${pendingItems.length} طلب)؟ سيتم تفعيل جميع هذه الحالات والمتبرعين فوراً.`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          const batch = writeBatch(db);
          pendingItems.forEach(item => {
            const collectionName = item.type === 'case' ? 'cases' : 'donors';
            batch.update(doc(db, collectionName, item.id), { 
              status: 'active',
              updatedAt: serverTimestamp() 
            });
          });
          await batch.commit();
          alert("تمت الموافقة على جميع الطلبات بنجاح وتم تفعيلها في النظام");
          await fetchStats();
        } catch (err) {
          console.error(err);
          alert("فشل في الموافقة الجماعية");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleRejectAll = async () => {
    if (pendingItems.length === 0) return;
    
    setConfirmConfig({
      isOpen: true,
      title: 'رفض الكل',
      message: `هل أنت متأكد من رفض جميع الطلبات المعلقة (${pendingItems.length} طلب)؟ سيتم حذف هذه البيانات نهائياً.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          const batch = writeBatch(db);
          pendingItems.forEach(item => {
            const collectionName = item.type === 'case' ? 'cases' : 'donors';
            batch.delete(doc(db, collectionName, item.id));
          });
          await batch.commit();
          alert("تم رفض وحذف جميع الطلبات بنجاح");
          await fetchStats();
        } catch (err) {
          console.error(err);
          alert("فشل في الرفض الجماعي");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleApprove = async (id: string, type: 'case' | 'donor') => {
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد الموافقة',
      message: 'هل أنت متأكد من الموافقة على هذا الطلب وتفعيله في النظام؟',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          const collectionName = type === 'case' ? 'cases' : 'donors';
          await updateDoc(doc(db, collectionName, id), { 
            status: 'active',
            updatedAt: serverTimestamp()
          });
          alert("تمت الموافقة بنجاح");
          fetchStats();
        } catch (err) {
          console.error(err);
          alert("فشل في الموافقة");
        }
      }
    });
  };

  const handleReject = async (id: string, type: 'case' | 'donor') => {
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد الرفض',
      message: 'هل أنت متأكد من رفض هذا الطلب وحذفه نهائياً؟',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          const collectionName = type === 'case' ? 'cases' : 'donors';
          await deleteDoc(doc(db, collectionName, id));
          alert("تم رفض وحذف الطلب");
          fetchStats();
        } catch (err) {
          alert("فشل في الرفض");
        }
      }
    });
  };

  const handleRestore = async (log: any) => {
    if (!log.collectionName || !log.itemId || !log.itemData) {
      alert("البيانات الخاصة بهذه الحركة غير كافية للاسترجاع");
      return;
    }
    
    setConfirmConfig({
      isOpen: true,
      title: 'استرجاع الحالة المحذوفة',
      message: `هل أنت متأكد من استرجاع هذه البيانات الرقمية وإعادتها إلى القسم الأصلي؟`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          const payload = JSON.parse(log.itemData);
          
          if (log.collectionName === 'monthly_payroll_item') {
            const listRef = doc(db, 'monthly_payroll_lists', payload.listId);
            const listSnap = await getDoc(listRef);
            if (listSnap.exists()) {
              const currentItems = listSnap.data().items || [];
              if (!currentItems.some(x => x.id === payload.item.id)) {
                await updateDoc(listRef, {
                  items: [...currentItems, payload.item]
                });
              }
            } else {
              alert("كشف القبض الشهري الأصلي غير موجود (قد يكون تم حذفه)");
              setLoading(false);
              return;
            }
          } else {
            await setDoc(doc(db, log.collectionName, log.itemId), payload);
          }
          
          await updateDoc(doc(db, 'logs', log.id), {
            isRestored: true,
            restoredAt: serverTimestamp(),
            restoredBy: auth.currentUser?.email || 'Unknown'
          });
          
          alert("تم استرجاع ومزامنة الحالة بنجاح وبنفس بياناتها السابقة!");
          await fetchStats();
        } catch (err) {
          console.error(err);
          alert("فشل في استرجاع الحالة: " + err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteLog = async (logId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف السجل',
      message: 'هل أنت متأكد من رغبتك في حذف هذا السجل نهائياً؟ لا يمكن التراجع عن هذه الخطوة.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          setLoading(true);
          await deleteDoc(doc(db, 'logs', logId));
          alert("تم حذف السجل بنجاح");
          await fetchStats();
        } catch (err) {
          console.error(err);
          alert("فشل حذف السجل: " + err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteAllLogs = async () => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع العمليات المعروضة',
      message: 'هل أنت متأكد من رغبتك في حذف جميع سجلات العمليات المعروضة نهائياً؟ لا يمكن التراجع عن هذه الخطوة.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          setLoading(true);
          const batch = writeBatch(db);
          systemChanges.forEach((log) => {
            batch.delete(doc(db, 'logs', log.id));
          });
          await batch.commit();
          alert("تم حذف جميع العمليات بنجاح");
          await fetchStats();
        } catch (err) {
          console.error(err);
          alert("فشل حذف العمليات: " + err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleClearLogs = async () => {
    setConfirmConfig({
      isOpen: true,
      title: 'مسح سجلات النظام',
      message: 'هل أنت متأكد من رغبتك في مسح كافة سجلات النظام؟ لا يمكن التراجع عن هذه الخطوة.',
      onConfirm: async () => {
        try {
          const q = query(collection(db, 'logs'), limit(500));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert("تم مسح أول 500 سجل بنجاح");
          fetchStats();
        } catch (err) {
          alert("فشل مسح السجلات");
        }
      }
    });
  };

  const [systemUsersConfig, setSystemUsersConfig] = useState<{email: string, permissions: string[], isAdmin: boolean}[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPermissions, setNewUserPermissions] = useState<string[]>(['cases', 'activity']);
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

  useEffect(() => {
    // Listen to users config
    const unsubUsers = onSnapshot(collection(db, 'users_config'), (snap) => {
      setSystemUsersConfig(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });
    return () => unsubUsers();
  }, []);

  const handleAddUser = async () => {
    if (!newUserEmail) return;
    try {
      await setDoc(doc(db, 'users_config', newUserEmail.toLowerCase().trim()), {
        email: newUserEmail.toLowerCase().trim(),
        permissions: newUserPermissions,
        isAdmin: newUserIsAdmin,
        updatedAt: serverTimestamp()
      });
      setNewUserEmail('');
      alert('تم تحديث المستخدم بنجاح');
    } catch (err) {
      alert('فشل في إضافة المستخدم');
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (email === auth.currentUser?.email) return alert('لا يمكنك حذف نفسك');
    
    setConfirmConfig({
      isOpen: true,
      title: 'حذف مستخدم',
      message: `هل أنت متأكد من حذف صلاحيات المستخدم "${email}"؟ لا يمكن التراجع عن هذه الخطوة.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users_config', email));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('فشل في حذف المستخدم');
        }
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <BrandingUpload />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-emerald-900 text-white p-8 rounded-3xl shadow-xl border-4 border-emerald-800">
        <div className="flex items-center gap-6">
          <div className="bg-emerald-800 p-4 rounded-2xl shadow-inner">
            <Terminal className="w-12 h-12 text-emerald-400" />
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-black font-sans tracking-tight">لوحة تحكم المبرمج</h1>
            <p className="text-emerald-300 font-medium opacity-80">إدارة الموافقات والبنية التحتية</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <span className="text-red-400 font-bold text-sm">إدارة مركزية كاملة</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Site Lock Control */}
        <div className="bg-white p-8 rounded-3xl border-2 border-emerald-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Lock className="w-6 h-6 text-emerald-600" />
              <h2 className="text-xl font-black text-emerald-900">التحكم في وصول المستخدمين</h2>
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-black ${siteSettings.isLocked ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
               {siteSettings.isLocked ? 'الموقع مغلق يدوياً' : 'الموقع متاح حالياً'}
            </div>
          </div>

          <div className="space-y-6">
             <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <div className="text-right">
                   <p className="font-black text-emerald-950">القفل اليدوي الفوري</p>
                   <p className="text-xs text-stone-400 font-bold">يمنع جميع المستخدمين من الدخول عدا المبرمج</p>
                </div>
                <button 
                  onClick={handleToggleLock}
                  className={`p-4 rounded-xl transition-all shadow-md ${siteSettings.isLocked ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}
                >
                  {siteSettings.isLocked ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                </button>
             </div>

             <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-4">
                <div className="flex items-center gap-2 justify-end mb-2">
                   <p className="font-black text-emerald-900">الجدولة التلقائية للإغلاق والفتح</p>
                   <Timer className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 block pr-2">وقت الفتح (صباحاً)</label>
                      <input 
                        type="time"
                        className="w-full bg-white border border-emerald-100 p-3 rounded-xl outline-none font-black text-center"
                        value={siteSettings.lockSchedule.end}
                        onChange={(e) => setSiteSettings({...siteSettings, lockSchedule: {...siteSettings.lockSchedule, end: e.target.value}})}
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 block pr-2">وقت الإغلاق (ليلاً)</label>
                      <input 
                        type="time"
                        className="w-full bg-white border border-emerald-100 p-3 rounded-xl outline-none font-black text-center"
                        value={siteSettings.lockSchedule.start}
                        onChange={(e) => setSiteSettings({...siteSettings, lockSchedule: {...siteSettings.lockSchedule, start: e.target.value}})}
                      />
                   </div>
                </div>
                <button 
                  onClick={handleSaveSchedule}
                  className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  حفظ الجدولة الزمنية
                </button>
             </div>
          </div>
        </div>

        {/* Approval Queue */}
      <div className="bg-white p-8 rounded-3xl border-2 border-amber-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-xl">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-xl font-black text-amber-900">طلبات الموافقة المعلقة ({pendingItems.length})</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingItems.length > 0 && (
              <>
                <button 
                  onClick={handleApproveAll}
                  className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl font-bold hover:bg-emerald-200 transition-all border border-emerald-200"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>موافقة على الكل ({pendingItems.length})</span>
                </button>
                <button 
                  onClick={handleRejectAll}
                  className="flex items-center gap-2 bg-rose-100 text-rose-700 px-4 py-2 rounded-xl font-bold hover:bg-rose-200 transition-all border border-rose-200"
                >
                  <XCircle className="w-4 h-4" />
                  <span>رفض الكل ({pendingItems.length})</span>
                </button>
              </>
            )}
            <button onClick={fetchStats} className="p-2 hover:bg-amber-50 rounded-lg text-amber-600">
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {pendingItems.length === 0 ? (
            <div className="text-center py-10 bg-stone-50 rounded-3xl border border-dashed border-stone-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
              <p className="text-stone-400 font-bold">لا توجد طلبات معلقة حالياً</p>
            </div>
          ) : (
            pendingItems.map((item) => (
              <motion.div 
                layout
                key={item.id}
                className="flex flex-col md:flex-row items-center justify-between p-4 bg-white border border-amber-100 rounded-2xl hover:border-amber-300 transition-all shadow-sm gap-4"
              >
                <div className="flex items-center gap-4 text-right flex-grow">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${item.type === 'case' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {item.type === 'case' ? 'ح' : 'م'}
                  </div>
                    <div>
                      <h3 className="font-bold text-emerald-950">{item.name}</h3>
                      <div className="flex gap-4 mt-1">
                        <p className="text-[10px] text-stone-400 font-medium">نوع الطلب: {item.type === 'case' ? 'إضافة حالة' : 'إضافة متبرع'}</p>
                        {item.details && (
                          <>
                            {item.details.phone && <p className="text-[10px] text-emerald-600 font-bold">الهاتف: {item.details.phone}</p>}
                            {item.details.category && <p className="text-[10px] text-blue-600 font-bold">التصنيف: {item.details.category}</p>}
                          </>
                        )}
                      </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleApprove(item.id, item.type)}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>موافقة</span>
                  </button>
                  <button 
                    onClick={() => handleReject(item.id, item.type)}
                    className="flex items-center gap-2 bg-rose-50 text-rose-600 px-5 py-2.5 rounded-xl font-bold hover:bg-rose-100 transition-all border border-rose-100"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>رفض</span>
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border-2 border-blue-100 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-blue-100 p-2 rounded-xl">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-xl font-black text-blue-900">إدارة المستخدمين والصلاحيات</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Add User Form */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
            <h3 className="font-black text-emerald-900 mb-2">إضافة / تحديث مستخدم</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-stone-400 block pr-2 mb-1">البريد الإلكتروني (Gmail)</label>
                <input 
                  type="email"
                  placeholder="user@gmail.com"
                  className="w-full bg-white border border-stone-200 p-3 rounded-xl outline-none font-bold text-center"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 block pr-2">الأقسام المسموح بها</label>
                <div className="flex flex-wrap gap-2">
                  {['dashboard', 'reception', 'cases', 'seasonal', 'medical', 'whatsapp', 'marriage', 'accounts', 'parties', 'campaigns', 'news', 'volunteers', 'logs', 'activities', 'orphans', 'developer'].map(p => (
                    <button 
                      key={p}
                      onClick={() => {
                        if (newUserPermissions.includes(p)) setNewUserPermissions(newUserPermissions.filter(x => x !== p));
                        else setNewUserPermissions([...newUserPermissions, p]);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${newUserPermissions.includes(p) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-stone-400 border-stone-200'}`}
                    >
                      {p === 'dashboard' ? 'لوحة البيانات' :
                       p === 'reception' ? 'الاستقبال' :
                       p === 'cases' ? 'الحالات' :
                       p === 'seasonal' ? 'الموسمية' :
                       p === 'medical' ? 'الطبية' :
                       p === 'whatsapp' ? 'واتساب' :
                       p === 'marriage' ? 'الزواج' :
                       p === 'accounts' ? 'الماليات' :
                       p === 'parties' ? 'الحفلات' :
                       p === 'campaigns' ? 'الحملات' :
                       p === 'news' ? 'الأخبار' :
                       p === 'volunteers' ? 'المتطوعين' :
                       p === 'logs' ? 'الأمان' :
                       p === 'activities' ? 'الأنشطة' :
                       p === 'orphans' ? 'الأعمال' : 'المبرمج'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs font-bold text-stone-500">مسؤول النظام (Admin)</span>
                <input 
                  type="checkbox" 
                  checked={newUserIsAdmin} 
                  onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600"
                />
              </div>

              <button 
                onClick={handleAddUser}
                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-sm shadow-lg shadow-emerald-100"
              >
                تحديث صلاحيات المستخدم
              </button>
            </div>
          </div>

          {/* Users List */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto px-2 custom-scrollbar">
            {systemUsersConfig.map(user => (
              <div key={user.email} className="p-4 bg-white border border-stone-100 rounded-2xl flex items-center justify-between group shadow-sm hover:border-blue-200 transition-all">
                <button 
                  onClick={() => handleDeleteUser(user.email)}
                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {user.isAdmin && <Shield className="w-4 h-4 text-blue-500" />}
                    <p className="font-bold text-emerald-950 text-sm">{user.email}</p>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1">صلاحيات: {user.permissions?.length || 0} أقسام</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* قسم المبرمج: سجل العمليات واسترجاع الحالات المحذوفة */}
      <div className="bg-white p-8 rounded-3xl border-2 border-emerald-500/20 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 text-right">
            <div className="bg-emerald-100 p-2.5 rounded-2xl">
              <Activity className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-emerald-950">مراقبة التغييرات واسترجاع البيانات المحذوفة</h2>
              <p className="text-xs text-stone-400 font-bold mt-0.5">سجل فوري لكافة عمليات إضافة وحذف الحالات عبر جميع أقسام النظام</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {systemChanges.length > 0 && (
              <button
                onClick={handleDeleteAllLogs}
                className="inline-flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 px-3.5 py-1.5 rounded-xl font-black transition-all"
                title="حذف كل السجلات المعروضة"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف الكل</span>
              </button>
            )}
            <span className="text-xs font-bold text-stone-500 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">بث مباشر للعمليات التفاعلية</span>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[250px] max-h-[500px] overflow-y-auto custom-scrollbar border border-emerald-50/50 rounded-2xl bg-stone-50/30">
          {changesLoading ? (
            <div className="p-12 text-center text-stone-400 font-bold">جاري تحميل سجل التغييرات...</div>
          ) : systemChanges.length === 0 ? (
            <div className="p-16 text-center text-stone-400">
               <Eye className="w-12 h-12 text-stone-300 mx-auto mb-3" />
               <p className="font-bold text-sm">لم يتم رصد أي عمليات إضافة أو حذف من قبل المستخدمين مؤخراً</p>
            </div>
          ) : (
            <table className="w-full text-right border-collapse text-sm" dir="rtl">
              <thead>
                <tr className="bg-emerald-50/50 text-emerald-900 border-b border-emerald-100">
                  <th className="p-4 font-black">الوقت والتاريخ</th>
                  <th className="p-4 font-black">بواسطة</th>
                  <th className="p-4 font-black">نوع القسم</th>
                  <th className="p-4 font-black">العملية والاسم</th>
                  <th className="p-4 font-black text-center">الإجراءات والتحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50/30">
                {systemChanges.map((log) => {
                  const isDel = log.type === 'delete';
                  return (
                    <tr key={log.id} className="hover:bg-emerald-50/10 transition-colors">
                      <td className="p-4 font-bold text-stone-600 tabular-nums">
                        {log.timestamp?.toDate() ? new Date(log.timestamp.toDate()).toLocaleString('ar-EG') : 'الآن'}
                      </td>
                      <td className="p-4">
                        <span className="bg-stone-100 text-stone-800 px-2.5 py-1 rounded-lg font-bold text-xs">{log.userEmail}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                          {log.collectionName === 'cases' ? 'البيانات العامة (الحالات)' :
                           log.collectionName === 'orphans' ? 'الأيتام والمستحقين' :
                           log.collectionName === 'new_orphan_registrations' ? 'تسجيل الأيتام الجديد' :
                           log.collectionName === 'marriageCases' ? 'مساعدات الزواج' :
                           log.collectionName === 'medicalCases' ? 'العيادة والرعاية الطبية' :
                           log.collectionName === 'reception_cases' ? 'حالات الاستقبال والاتصال' :
                           log.collectionName === 'seasonal_distributions' ? 'التوزيع الموسمي' :
                           log.collectionName?.includes('beneficiaries') ? 'مستفيدي التوزيع الموسمي' :
                           log.collectionName === 'volunteers' ? 'شؤون المتطوعين' :
                           log.collectionName === 'donors' ? 'قائمة المتبرعين والكفلاء' :
                           log.collectionName === 'activities' ? 'الأنشطة والتوثيق' :
                           log.collectionName === 'parties' ? 'الحفلات والفعاليات' :
                           log.collectionName === 'financial_accounts' ? 'الخزائن والحسابات' :
                           log.collectionName === 'account_transactions' ? 'حركات الخزينة والحسابات' :
                           log.collectionName === 'incoming_donations' ? 'الإيرادات والتبرعات الواردة' :
                           log.collectionName === 'outgoing_donations' ? 'المصروفات والصرف المالي' :
                           log.collectionName === 'monthly_payroll_item' ? 'كشف القبض الشهري' : log.collectionName || 'أخرى'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${isDel ? 'bg-rose-100 text-rose-700' : 'bg-green-100 text-green-700'}`}>
                            {isDel ? 'حذف' : 'إضافة'}
                          </span>
                          <span className="font-bold text-emerald-950">{log.action}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isDel ? (
                            log.isRestored ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-xl font-bold border border-green-200">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>تم الاسترجاع بواسطة {log.restoredBy}</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRestore(log)}
                                className="inline-flex items-center gap-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100 px-4 py-2 rounded-xl font-black transition-all"
                              >
                                <Undo className="w-3.5 h-3.5" />
                                <span>استرجاع الحالة</span>
                              </button>
                            )
                          ) : (
                            <span className="text-xs font-bold text-stone-400">إضافة ناجحة (مسجلة)</span>
                          )}

                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 p-2 rounded-xl font-black transition-all"
                            title="حذف السجل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">حذف السجل</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'إجمالي الحالات', value: stats.casesCount, icon: Database, color: 'emerald' },
          { label: 'إجمالي المتبرعين', value: stats.donorsCount, icon: Users, color: 'blue' },
          { label: 'سجلات النشاط', value: stats.logsCount, icon: Eye, color: 'amber' },
          { label: 'بانتظار المراجعة', value: stats.pendingCases + stats.pendingDonors, icon: Clock, color: 'rose' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm hover:shadow-md transition-all group">
             <div className="flex items-center justify-between">
                <div className={`p-3 bg-${stat.color}-50 rounded-2xl`}>
                  <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
                </div>
                <div className="text-right">
                  <p className="text-stone-400 text-xs font-bold mb-1">{stat.label}</p>
                  <p className="text-2xl font-black text-emerald-950 font-sans tabular-nums">
                    {loading ? '...' : stat.value.toLocaleString()}
                  </p>
                </div>
             </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Dangerous Operations */}
        <div className="bg-white p-8 rounded-3xl border-2 border-rose-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-6 h-6 text-rose-600" />
            <h2 className="text-xl font-bold text-rose-900">التحكم في البيانات</h2>
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={handleClearLogs}
              className="w-full flex items-center justify-between p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100 hover:bg-rose-100 transition-all font-bold group"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                <span>مسح سجلات النشاط (Logs)</span>
              </div>
              <span className="text-[10px] bg-rose-200 px-2 py-1 rounded-lg">Batch Delete</span>
            </button>
            <button 
              className="w-full flex items-center justify-between p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 hover:bg-emerald-100 transition-all font-bold"
              onClick={fetchStats}
            >
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5" />
                <span>تحديث البيانات الفوري</span>
              </div>
            </button>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-white p-8 rounded-3xl border border-blue-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Database className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-blue-900">معلومات النظام</h2>
          </div>
          
          <div className="space-y-3">
            {[
              { label: 'إصدار البيئة', value: 'v1.5.0 (Admin Approval)' },
              { label: 'قاعدة البيانات', value: 'Firestore Cloud' },
              { label: 'المبرمج المسؤول', value: 'Mahmoud Gawish' },
              { label: 'آخر فحص للنظام', value: new Date().toLocaleTimeString('ar-EG') },
            ].map((info, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                <span className="text-stone-500 font-bold text-xs">{info.label}</span>
                <span className="text-emerald-950 font-black text-sm">{info.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-emerald-50 border-2 border-emerald-100 p-6 rounded-3xl text-center">
        <p className="text-emerald-800 font-bold">كل عملية قبول تتم هنا، تجعل البيانات متاحة لبقية أعضاء الجمعية.</p>
        <p className="text-emerald-600/60 text-xs mt-2 font-medium">نظام بصمة خير - التحكم المركزي للمبرمج</p>
      </div>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        variant={confirmConfig.variant}
      />
    </div>
  );
}