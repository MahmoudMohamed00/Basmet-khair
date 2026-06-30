// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, MessageCircle, Phone, User, Calendar, ExternalLink, Filter, X, Settings, Smartphone, Save, Loader2, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  category: string;
  requestDate: string;
  source: string;
}

export default function WhatsAppListScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('الكل');
  const [sourceFilter, setSourceFilter] = useState('الكل');
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [message, setMessage] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const ASSOCIATION_PHONE = "01021761633";

  useEffect(() => {
    // Fetch Employees for Officials List
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const collections = [
      { name: 'cases', label: 'كشف الحالات العامة' },
      { name: 'orphans', label: 'كفل اليتيم' },
      { name: 'seasonal_cases', label: 'الحالات الموسمية' },
      { name: 'marriageCases', label: 'حالات الزواج' },
      { name: 'medicalCases', label: 'السجلات الطبية' },
      { name: 'reception_cases', label: 'الاستقبال' }
    ];

    const unsubscribes: (() => void)[] = [];
    const allData: Record<string, Contact[]> = {};

    collections.forEach(col => {
      const q = query(collection(db, col.name), orderBy(col.name === 'reception_cases' ? 'serialNumber' : 'name', 'asc'));
      const unsub = onSnapshot(q, (snapshot) => {
        allData[col.name] = snapshot.docs.map(doc => {
          const data = doc.data();
          let name = data.name || data.orphanName || data.patientName || data.guardianName || 'بدون اسم';
          
          // Handle new orphans structure
          if (col.name === 'orphans' && data.orphans && Array.isArray(data.orphans) && data.orphans.length > 0) {
            name = data.orphans.map((o: any) => o.name).join(' - ');
          }

          return {
            id: doc.id,
            name: name,
            phone: data.phone || data.phone1 || data.guardianPhone || data.whatsappPhone || '',
            category: data.category || (data.categories ? data.categories[0] : 'غير محدد'),
            requestDate: data.requestDate || (data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleDateString('ar-EG') : ''),
            source: col.label
          };
        }).filter(c => c.phone); // Only show those with a phone number

        const combined = Object.values(allData).flat().sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        setContacts(combined);
        setLoading(false);
      }, (err) => {
        console.error(`Error fetching ${col.name}:`, err);
      });
      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
      unsubEmployees();
    };
  }, []);

  const categories = ['الكل', ...Array.from(new Set(contacts.map(c => c.category)))];
  const sources = ['الكل', ...Array.from(new Set(contacts.map(c => c.source)))];

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.phone.includes(searchQuery);
    const matchesCategory = categoryFilter === 'الكل' || c.category === categoryFilter;
    const matchesSource = sourceFilter === 'الكل' || c.source === sourceFilter;
    return matchesSearch && matchesCategory && matchesSource;
  });

  const getWhatsAppLink = (phone: string, msg: string = '') => {
    const cleanPhone = phone.startsWith('0') ? phone.substring(1) : phone;
    const encodedMsg = encodeURIComponent(msg);
    return `https://wa.me/+2${cleanPhone}${msg ? `?text=${encodedMsg}` : ''}`;
  };

  const openQuickChat = (contact: Contact) => {
    setSelectedContact(contact);
    setMessage(`مرحباً أستاذ/ة ${contact.name}، بخصوص الحالة الخاصة بكم...`);
  };

  return (
    <div className="p-6 font-sans mb-20" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-emerald-900 mb-2 font-arabic-bold">قائمة تواصل واتساب</h1>
          <p className="text-emerald-600/70 font-bold">تواصل سريع واحترافي مع جميع الحالات</p>
        </div>
        <div className="flex items-center gap-3">
          <a 
            href="https://web.whatsapp.com/"
            target="_blank"
            rel="noreferrer"
            className="px-8 py-4 rounded-2xl bg-[#25D366] text-white shadow-xl shadow-green-100 flex items-center gap-3 font-black hover:bg-[#128C7E] transition-all scale-105 active:scale-95"
          >
            <ExternalLink className="w-6 h-6" />
            <span>فتح واتساب ويب</span>
          </a>
          <div className="bg-emerald-100 text-emerald-700 px-6 py-3 rounded-2xl shadow-sm border border-emerald-200 flex items-center gap-3">
            <MessageCircle className="w-6 h-6" />
            <span className="text-xl font-bold tabular-nums">{filteredContacts.length} جهة اتصال</span>
          </div>
        </div>
      </div>

      {/* Official Association & Team Details */}
      <div className="mb-12">
        <h2 className="text-xl font-bold text-emerald-900 mb-6 flex items-center gap-2">
           <Shield className="w-6 h-6 text-emerald-600" />
           التواصل الرسمي وفريق العمل
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Main Association Contact */}
          <div className="lg:col-span-3 bg-emerald-600 p-8 rounded-[2.5rem] shadow-2xl shadow-emerald-200 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:scale-150 transition-transform duration-1000" />
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/30 shadow-inner">
                <MessageCircle className="w-10 h-10 text-white" />
              </div>
              <div className="text-right text-white">
                <h3 className="text-3xl font-black mb-1">الواتساب الرسمي لبصمة خير</h3>
                <p className="text-emerald-100 font-bold opacity-90 text-lg">نبروه - الخط الساخن للاستفسارات</p>
                <div className="flex items-center gap-2 mt-2 bg-black/10 w-fit px-3 py-1 rounded-lg">
                   <Smartphone className="w-4 h-4 text-emerald-300" />
                   <span className="font-black tabular-nums tracking-wider">{ASSOCIATION_PHONE}</span>
                </div>
              </div>
            </div>
            
            <a 
               href={getWhatsAppLink(ASSOCIATION_PHONE, "السلام عليكم، أريد الاستفسار عن خدمة في الجمعية")}
               target="_blank"
               rel="noreferrer"
               className="bg-white text-emerald-600 px-10 py-5 rounded-[1.5rem] font-black text-xl hover:bg-emerald-50 shadow-xl transition-all flex items-center justify-center gap-3 relative z-10"
            >
              <MessageCircle className="w-7 h-7" />
              تحدث معنا الآن
            </a>
          </div>

          {/* List of Officials/Employees */}
          {employees.map(emp => (
            <motion.div 
               key={emp.id}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               className="bg-white p-6 rounded-[2rem] border border-emerald-50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group"
            >
               <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-500">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="bg-stone-50 px-3 py-1 rounded-full border border-stone-100 text-[10px] font-black text-stone-400 group-hover:border-emerald-100 group-hover:text-emerald-600 transition-colors">
                    {emp.role}
                  </div>
               </div>
               
               <div className="text-right mb-6">
                  <h4 className="text-xl font-black text-emerald-950 mb-1">{emp.name}</h4>
                  <p className="text-emerald-600 font-bold text-sm">{emp.department || "مسؤول رسمي"}</p>
               </div>

               <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-100 group-hover:border-emerald-50 transition-colors">
                     <span className="text-lg font-black text-emerald-900 tabular-nums">{emp.phone}</span>
                     <Smartphone className="w-4 h-4 text-stone-300" />
                  </div>
                  
                  <a 
                    href={getWhatsAppLink(emp.phone, `السلام عليكم أ/ ${emp.name}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-[#128C7E] shadow-lg shadow-emerald-50 transition-all text-sm"
                  >
                     <MessageCircle className="w-5 h-5 fill-current" />
                     بدء محادثة واتساب
                  </a>
               </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-emerald-100 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 w-5 h-5" />
            <input 
              type="text"
              placeholder="بحث بالاسم أو رقم الهاتف..."
              className="w-full bg-stone-50 border border-emerald-100 rounded-2xl py-4 pr-12 pl-6 focus:ring-4 ring-emerald-500/10 outline-none font-bold text-emerald-900 transition-all focus:bg-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar no-scrollbar scroll-smooth">
            <span className="text-xs font-bold text-emerald-900/40 ml-2 shrink-0">التصنيف:</span>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all border ${
                  categoryFilter === cat 
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100 scale-105" 
                  : "bg-stone-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar no-scrollbar scroll-smooth mt-4">
            <span className="text-xs font-bold text-emerald-900/40 ml-2 shrink-0">القسم:</span>
            {sources.map(src => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all border ${
                  sourceFilter === src 
                  ? "bg-teal-600 text-white border-teal-600 shadow-lg shadow-teal-100 scale-105" 
                  : "bg-stone-50 text-teal-700 border-teal-100 hover:bg-teal-50"
                }`}
              >
                {src}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-emerald-600 border-t-2 border-t-transparent shadow-lg"></div>
          <span className="text-emerald-800 font-bold animate-pulse">جاري تحميل جهات الاتصال...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredContacts.map((contact) => (
              <motion.div
                key={contact.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all group overflow-hidden relative"
              >
                {/* Visual Flair */}
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-emerald-50 rounded-full group-hover:scale-[8] transition-transform duration-700 ease-in-out opacity-50 pointer-events-none" />

                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 font-black text-2xl border border-emerald-100 shadow-inner group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      {contact.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-emerald-950 text-xl font-arabic-bold mb-1">{contact.name}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">{contact.category}</span>
                        <span className="text-[10px] font-black bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full border border-stone-200">{contact.source}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-left">
                    {contact.requestDate && (
                      <p className="text-[10px] text-emerald-400 font-bold tabular-nums flex items-center gap-1 justify-end bg-stone-50 px-2 py-1 rounded-lg">
                        <Calendar className="w-3 h-3" />
                        {contact.requestDate}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-6 text-emerald-900 font-black bg-stone-50/80 p-4 rounded-2xl border border-stone-100 relative z-10 group-hover:bg-white transition-colors">
                  <Phone className="w-5 h-5 text-emerald-400" />
                  <span className="tabular-nums tracking-widest text-lg">{contact.phone}</span>
                </div>

                <div className="flex gap-2 relative z-10">
                  <button 
                    onClick={() => openQuickChat(contact)}
                    className="flex-grow bg-[#25D366] text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-[#128C7E] shadow-lg shadow-green-100 transition-all active:scale-95 group-hover:shadow-green-200"
                  >
                    <MessageCircle className="w-6 h-6" />
                    مراسلة سريعة
                  </button>
                  <a 
                    href={`tel:${contact.phone}`}
                    className="w-14 bg-stone-100 text-stone-600 rounded-2xl flex items-center justify-center hover:bg-stone-200 transition-all border border-stone-200 active:scale-90"
                  >
                    <Phone className="w-6 h-6" />
                  </a>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredContacts.length === 0 && (
            <div className="col-span-full py-24 text-center">
              <div className="bg-stone-50 border border-stone-100 p-8 rounded-[2rem] inline-block mb-4">
                <Search className="w-12 h-12 text-stone-300 mx-auto" />
              </div>
              <p className="text-stone-400 font-black text-xl">لا توجد جهات اتصال تطابق بحثك</p>
            </div>
          )}
        </div>
      )}

      {/* Quick Chat Modal */}
      <AnimatePresence>
        {selectedContact && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedContact(null)}
              className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden relative z-10 border border-emerald-100"
            >
              <div className="bg-emerald-600 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white font-black text-2xl border border-white/30">
                    {selectedContact.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-black text-xl leading-none mb-1">{selectedContact.name}</h3>
                    <div className="text-emerald-100 text-sm font-bold flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      متوفر للمراسلة الآن
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedContact(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-all"
                >
                  <X className="w-7 h-7" />
                </button>
              </div>

              <div className="p-8">
                <label className="block text-emerald-900 font-black mb-3">نص الرسالة المقترح:</label>
                <textarea 
                  className="w-full bg-emerald-50/50 border-2 border-emerald-100 rounded-3xl p-6 min-h-[160px] outline-none focus:border-emerald-500 transition-all font-bold text-emerald-900 leading-relaxed resize-none"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="اكتب رسالتك هنا..."
                />
                
                <div className="mt-8 flex flex-col gap-4">
                  <a 
                    href={getWhatsAppLink(selectedContact.phone, message)}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-[#25D366] text-white py-5 rounded-[1.5rem] font-black flex items-center justify-center gap-4 hover:bg-[#128C7E] shadow-xl shadow-green-100 transition-all active:scale-95 text-xl"
                  >
                    <MessageCircle className="w-7 h-7" />
                    بدء المحادثة في واتساب
                  </a>
                  <p className="text-center text-sm font-bold text-emerald-600/60">
                    سيتم فتح تطبيق واتساب لتأكيد الإرسال
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}