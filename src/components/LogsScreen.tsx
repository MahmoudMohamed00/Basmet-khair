// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Shield, Search, Calendar, User, Laptop, Info, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import ConfirmModal from './ConfirmModal';
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';

export const getFriendlyDeviceName = (userAgent: string) => {
  if (!userAgent) return 'جهاز غير معروف';
  const ua = userAgent.toLowerCase();
  
  let os = '';
  if (ua.includes('windows')) {
    os = 'كمبيوتر ويندوز';
  } else if (ua.includes('android')) {
    os = 'هاتف أندرويد';
  } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    os = 'آيفون/آيباد';
  } else if (ua.includes('macintosh') || ua.includes('mac os')) {
    os = 'كمبيوتر ماك';
  } else if (ua.includes('linux')) {
    os = 'جهاز لينكس';
  } else {
    os = 'جهاز ذكي';
  }

  let browser = '';
  if (ua.includes('edg/')) {
    browser = 'متصفح إيدج';
  } else if (ua.includes('chrome') || ua.includes('crios')) {
    browser = 'متصفح كروم';
  } else if (ua.includes('firefox') || ua.includes('fxios')) {
    browser = 'متصفح فايرفوكس';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'متصفح سافاري';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'متصفح أوبرا';
  } else {
    browser = 'متصفح ويب';
  }

  return `${os} (${browser})`;
};

interface Log {
  id: string;
  userEmail: string;
  action: string;
  device: string;
  timestamp: any;
}

export default function LogsScreen() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Log));
      setLogs(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'logs');
    });
    return () => unsubscribe();
  }, []);

  const handleClearLogs = async () => {
    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد مسح جميع السجلات',
      message: 'هل أنت متأكد من مسح جميع السجلات؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        try {
          const snapshot = await getDocs(collection(db, 'logs'));
          const batch = writeBatch(db);
          snapshot.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'logs');
        }
      }
    });
  };

  const filteredLogs = logs.filter(l => 
    l.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.action.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-right">
        <div>
          <h1 className="text-3xl font-bold text-emerald-900">سجل الأمان والنشاط</h1>
          <p className="text-emerald-700/60 mt-1">متابعة تحركات المستخدمين وعمليات تسجيل الدخول</p>
        </div>
        
        <button 
          onClick={handleClearLogs}
          className="flex items-center gap-2 bg-rose-50 text-rose-600 px-6 py-3 rounded-xl hover:bg-rose-100 transition-all font-bold"
        >
          <Trash2 className="w-5 h-5" />
          <span>مسح السجلات</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
        <div className="p-4 border-b border-emerald-50 bg-emerald-50/30 flex items-center gap-2 text-right dir-rtl">
          <Search className="w-5 h-5 text-emerald-400 shrink-0" />
          <input 
            type="text" 
            placeholder="بحث بالبريد أو العملية..."
            className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-900 placeholder-emerald-300 outline-none text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-emerald-600">جاري التحميل...</div>
          ) : (
            <table className="w-full text-right" dir="rtl">
              <thead>
                <tr className="bg-stone-50 text-emerald-800 text-sm font-semibold">
                  <th className="px-6 py-4">الوقت</th>
                  <th className="px-6 py-4">المستخدم</th>
                  <th className="px-6 py-4">العملية</th>
                  <th className="px-6 py-4">الجهاز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-emerald-50/20 transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-emerald-800 tabular-nums">
                      {log.timestamp?.toDate() ? new Date(log.timestamp.toDate()).toLocaleString('ar-EG') : '...'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                          <User className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">{log.userEmail}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-stone-400 max-w-[200px] truncate" title={log.device}>
                      <div className="flex items-center gap-1">
                        <Laptop className="w-3 h-3" />
                        {getFriendlyDeviceName(log.device)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <footer className="mt-12 py-8 border-t border-emerald-100 text-center">
        <p className="text-emerald-700/40 text-xs font-medium tracking-wide">
          نظام الإدارة الإلكتروني لجمعية بصمة خير نبروه
        </p>
        <p className="text-emerald-800/60 mt-1 text-sm font-bold">
          تم التطوير بواسطة م/ محمود جاويش (Mahmoud Gawish) © {new Date().getFullYear()}
        </p>
      </footer>
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