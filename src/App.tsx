// @ts-nocheck
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, ReactNode, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Heart, ClipboardList, Menu, X, PlusCircle, LogIn, LogOut, UserCheck, Megaphone, Shield, ChevronUp, ChevronDown, Newspaper, Download, Terminal, DollarSign, MessageCircle, Lock, Box, UserPlus, Stethoscope, PartyPopper, Building, Loader2, ShieldAlert, MapPin, GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut, type User as FirebaseUser, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import CasesScreen from './components/CasesScreen';
import AccountsScreen from './components/AccountsScreen';
import PartiesScreen from './components/PartiesScreen';
import ActivitiesScreen from './components/ActivitiesScreen';
import VolunteersScreen from './components/VolunteersScreen';
import CampaignsScreen from './components/CampaignsScreen';
import NewsScreen from './components/NewsScreen';
import LogsScreen, { getFriendlyDeviceName } from './components/LogsScreen';
import DeveloperScreen from './components/DeveloperScreen';
import OrphansScreen from './components/OrphansScreen';
import MarriageCasesScreen from './components/MarriageCasesScreen';
import MedicalRecordsScreen from './components/MedicalRecordsScreen';
import WhatsAppListScreen from './components/WhatsAppListScreen';
import ReceptionScreen from './components/ReceptionScreen';
import SeasonalCasesScreen from './components/SeasonalCasesScreen';
import AboutScreen from './components/AboutScreen';
import Logo from './components/Logo';
import VoiceAssistant from './components/VoiceAssistant';
import MonthlyPayrollScreen from './components/MonthlyPayrollScreen';
import DuplicatesScreen from './components/DuplicatesScreen';
import TopStudentsScreen from './components/TopStudentsScreen';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

const DEVELOPER_EMAIL = '11gawish2004@gmail.com';
const SECONDARY_DEVELOPER_EMAIL = 'ma0277303@gmail.com';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Login Screen
const Login = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setError('عذراً، تم حظر النافذة المنبثقة. يرجى تفعيل السماح بالنوافذ المنبثقة في المتصفح أو فتح التطبيق في علامة تبويب جديدة.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError('تم إلغاء عملية الدخول. يرجى المحاولة مرة أخرى.');
      } else if (err.message?.includes('INTERNAL ASSERTION FAILED')) {
        setError('خطأ داخلي في المتصفح. يرجى تحديث الصفحة أو فتح التطبيق في علامة تبويب مستقلة.');
      } else {
        setError('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-right font-sans" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-12 rounded-3xl shadow-2xl border border-emerald-100 max-w-md w-full text-center"
      >
        <Logo className="w-24 h-24 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-emerald-900 mb-2 font-sans">بصمة خير</h1>
        <p className="text-emerald-700/60 mb-10 font-sans">نظام إدارة الجمعية الخيرية</p>
        
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-bold leading-relaxed">
            {error}
          </div>
        )}
        
        <button 
          onClick={handleLogin}
          disabled={isLoggingIn}
          className={cn(
            "w-full flex items-center justify-center gap-3 border-2 px-6 py-4 rounded-xl font-bold transition-all shadow-sm",
            isLoggingIn ? "bg-stone-50 border-stone-100 text-stone-400 cursor-not-allowed" : "bg-white border-emerald-100 text-emerald-900 hover:bg-emerald-50"
          )}
        >
          {isLoggingIn ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>جاري التحميل...</span>
            </>
          ) : (
            <>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              <span>الدخول باستخدام جوجل</span>
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};

// Placeholder Screens
const Dashboard = ({ isDeveloper }: { isDeveloper: boolean }) => {
  const [stats, setStats] = useState({ 
    cases: 0, 
    donors: 0, 
    volunteers: 0, 
    campaigns: 0,
    orphans: 0,
    marriages: 0,
    activities: 0,
    reception: 0
  });
  const [casesList, setCasesList] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [recentReception, setRecentReception] = useState<any[]>([]);
  const [latestActivity, setLatestActivity] = useState<any | null>(null);
  const [criticalReceptionCount, setCriticalReceptionCount] = useState(0);

  useEffect(() => {
    // Real-time listener for general cases
    const unsubCases = onSnapshot(collection(db, 'cases'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCasesList(list);
      setStats(prev => ({ ...prev, cases: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cases'));

    // Real-time listener for donors
    const unsubDonors = onSnapshot(collection(db, 'donors'), (snap) => {
      setStats(prev => ({ ...prev, donors: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'donors'));

    // Real-time listener for volunteers
    const unsubVolunteers = onSnapshot(collection(db, 'volunteers'), (snap) => {
      setStats(prev => ({ ...prev, volunteers: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'volunteers'));

    // Real-time listener for campaigns
    const unsubCampaigns = onSnapshot(collection(db, 'campaigns'), (snap) => {
      setStats(prev => ({ ...prev, campaigns: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'campaigns'));

    // Real-time listener for orphans
    const unsubOrphans = onSnapshot(collection(db, 'orphans'), (snap) => {
      setStats(prev => ({ ...prev, orphans: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orphans'));

    // Real-time listener for marriage cases
    const unsubMarriage = onSnapshot(collection(db, 'marriageCases'), (snap) => {
      setStats(prev => ({ ...prev, marriages: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'marriageCases'));

    // Real-time listener for activities
    const unsubActivities = onSnapshot(collection(db, 'activities'), (snap) => {
      setStats(prev => ({ ...prev, activities: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'activities'));

    // Listen to latest activity
    const qLatestActivity = query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(1));
    const unsubLatestActivity = onSnapshot(qLatestActivity, (snap) => {
      if (!snap.empty) {
        setLatestActivity({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setLatestActivity(null);
      }
    });

    // Real-time listener for reception cases
    const unsubReceptionCount = onSnapshot(collection(db, 'reception_cases'), (snap) => {
      setStats(prev => ({ ...prev, reception: snap.size }));
      const highRatingCount = snap.docs.filter(doc => {
        const d = doc.data();
        return (d.receptionistEvaluation !== undefined && Number(d.receptionistEvaluation) >= 9);
      }).length;
      setCriticalReceptionCount(highRatingCount);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'reception_cases'));
    
    // Listen to real activity logs
    const qLogs = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(10));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setRecentLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'logs'));

    const qReception = query(collection(db, 'reception_cases'), orderBy('createdAt', 'desc'), limit(5));
    const unsubReception = onSnapshot(qReception, (snap) => {
      setRecentReception(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'reception_cases'));

    return () => {
      unsubCases();
      unsubDonors();
      unsubVolunteers();
      unsubCampaigns();
      unsubOrphans();
      unsubMarriage();
      unsubActivities();
      unsubLatestActivity();
      unsubReceptionCount();
      unsubLogs();
      unsubReception();
    };
  }, []);

  const statusData = useMemo(() => {
    const counts = {
      pending: 0,
      active: 0,
      completed: 0,
      rejected: 0,
    };
    casesList.forEach(c => {
      const s = c.status || 'pending';
      if (counts.hasOwnProperty(s)) {
        counts[s as keyof typeof counts]++;
      } else {
        counts.pending++;
      }
    });
    return [
      { name: 'قيد الانتظار', count: counts.pending, color: '#f59e0b' },
      { name: 'نشطة', count: counts.active, color: '#10b981' },
      { name: 'مكتملة', count: counts.completed, color: '#3b82f6' },
      { name: 'مرفوضة', count: counts.rejected, color: '#ef4444' },
    ];
  }, [casesList]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    casesList.forEach(c => {
      const cats = c.categories || [];
      if (cats.length === 0) {
        counts['أخرى'] = (counts['أخرى'] || 0) + 1;
      } else {
        cats.forEach((cat: string) => {
          counts[cat] = (counts[cat] || 0) + 1;
        });
      }
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value
    })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [casesList]);

  const criticalCasesCount = useMemo(() => {
    return casesList.filter(c => (c.rating || 0) >= 9).length;
  }, [casesList]);

  const totalCriticalCount = criticalCasesCount + criticalReceptionCount;

  return (
    <div className="p-6 space-y-10 font-sans">
      {/* Dynamic Welcome Hero with Charity Logo and Background Image */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2.5rem] bg-emerald-900 min-h-[360px] flex items-center p-8 md:p-12 text-white shadow-2xl border border-emerald-800"
      >
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1559028012-481c04fa702d?auto=format&fit=crop&q=80&w=1200" 
            alt="Charity" 
            className="w-full h-full object-cover opacity-15 scale-105 select-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/95 via-emerald-900/90 to-transparent" />
        </div>

        <div className="relative z-10 w-full flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-right max-w-2xl flex-grow order-2 md:order-1">
            <div className="flex items-center gap-4 mb-4 justify-end">
              <div>
                <h1 className="text-3.5xl md:text-5xl font-black mb-1 tracking-tight leading-tight">بصمة خير</h1>
                <p className="text-emerald-300 text-xs md:text-sm font-bold">بوابتك لإدارة ومتابعة الأعمال الإنسانية بكفاءة وأمان</p>
              </div>
              <Logo className="w-16 h-16 bg-white/10 p-2 rounded-2xl border border-white/20 shadow-xl backdrop-blur-md shrink-0" />
            </div>
            
            <p className="text-emerald-100/90 text-sm md:text-base leading-relaxed mt-2 font-medium">
              نحن هنا لنجعل العطاء أسهل، أكثر تنظيماً، وأعمق أثراً. من خلال لوحة التحكم الذكية، يمكنك تتبع حالات الاستقبال، رعاية الأيتام، الحملات الميدانية، والأنشطة التكافلية لحظة بلحظة لإيصال الدعم لمن يستحقه.
            </p>
            
            <div className="mt-8 flex flex-wrap gap-3 justify-end">
              <Link to="/campaigns" className="bg-white text-emerald-900 px-5 py-3 rounded-xl font-black text-xs hover:bg-emerald-50 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-emerald-700" />
                <span>الحملات والفعاليات</span>
              </Link>
              <Link to="/volunteers" className="bg-emerald-800 text-white px-5 py-3 rounded-xl font-black text-xs hover:bg-emerald-750 border border-emerald-700 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-300" />
                <span>فريق المتطوعين</span>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Automatic Real-Time Stats Grid (8 Columns) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-bold border border-emerald-100/80 animate-pulse">تحديث تلقائي فوري</span>
          <h2 className="text-lg font-black text-emerald-950 flex items-center gap-1.5 justify-end">
            <span>مؤشرات أداء الجمعية</span>
            <LayoutDashboard className="w-5 h-5 text-emerald-600" />
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <StatCard title="إجمالي الحالات" value={stats.cases.toString()} icon={<Users className="w-5 h-5 text-emerald-600" />} color="bg-white hover:border-emerald-200" />
          <StatCard title="الأيتام المكفولين" value={stats.orphans.toString()} icon={<Heart className="w-5 h-5 text-rose-600" />} color="bg-white hover:border-rose-200" />
          <StatCard title="حالات الزواج" value={stats.marriages.toString()} icon={<PartyPopper className="w-5 h-5 text-pink-600" />} color="bg-white hover:border-pink-200" />
          <StatCard title="المتبرعين" value={stats.donors.toString()} icon={<Heart className="w-5 h-5 text-indigo-600" />} color="bg-white hover:border-indigo-200" />
          <StatCard title="المتطوعين" value={stats.volunteers.toString()} icon={<UserCheck className="w-5 h-5 text-blue-600" />} color="bg-white hover:border-blue-200" />
          <StatCard title="الحملات النشطة" value={stats.campaigns.toString()} icon={<Megaphone className="w-5 h-5 text-amber-600" />} color="bg-white hover:border-amber-200" />
          <StatCard title="الأنشطة الموثقة" value={stats.activities.toString()} icon={<ClipboardList className="w-5 h-5 text-violet-600" />} color="bg-white hover:border-violet-200" />
          <StatCard title="طلبات الاستقبال" value={stats.reception.toString()} icon={<UserPlus className="w-5 h-5 text-cyan-600" />} color="bg-white hover:border-cyan-200" />
        </div>
      </div>

      {/* Charity Inspiration & Good Deeds Gallery Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-400 font-bold">معاً لنصنع الفرق في حياة الآخرين</span>
          <h2 className="text-xl font-black text-emerald-950 flex items-center gap-2">
            <span>بوابات ومشاريع الخير</span>
            <Heart className="w-5 h-5 text-emerald-600" />
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              title: "كفالة ورعاية الأيتام",
              quote: "«أنا وكافل اليتيم في الجنة كهاتين» وأشار بالسبابة والوسطى.",
              img: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&q=80&w=600",
              badge: "كفالة أيتام",
              color: "from-rose-950/85 to-rose-900/40"
            },
            {
              title: "توفير الغذاء وإطعام المساكين",
              quote: "«وَيُطْعِمُونَ الطَّعَامَ عَلَىٰ حُبِّهِ مِسْكِينًا وَيَتِيمًا وَأَسِيرًا» سورة الإنسان.",
              img: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&q=80&w=600",
              badge: "سلة الغذاء والوجبات",
              color: "from-amber-950/85 to-amber-900/40"
            },
            {
              title: "الرعاية والخدمات الطبية",
              quote: "«وَمَنْ أَحْيَاهَا فَكاَنَّمَا أَحْيَا النَّاسَ جَمِيعًا» تيسير العلاج للمرضى العاجزين.",
              img: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=600",
              badge: "الرعاية الصحية",
              color: "from-teal-950/85 to-teal-900/40"
            },
            {
              title: "سقيا الماء وحفر الآبار",
              quote: "«أفضل الصدقة سقيا الماء» تروي عطش الأسر وتجلب البهجة والارتواء.",
              img: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=600",
              badge: "سقيا الماء الصالح",
              color: "from-blue-950/85 to-blue-900/40"
            }
          ].map((item, idx) => (
            <motion.div 
              key={idx}
              whileHover={{ y: -6 }}
              className="relative h-64 rounded-3xl overflow-hidden shadow-md group cursor-pointer border border-emerald-100"
            >
              <img 
                src={item.img} 
                alt={item.title} 
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${item.color} via-stone-900/70 to-transparent`} />
              <div className="absolute inset-0 p-6 flex flex-col justify-between text-right text-white z-10">
                <div className="flex justify-start">
                  <span className="text-[10px] bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-xl font-bold border border-white/10">{item.badge}</span>
                </div>
                <div>
                  <h3 className="text-md font-black mb-1 leading-snug">{item.title}</h3>
                  <p className="text-[11px] text-white/80 leading-relaxed font-medium">
                    {item.quote}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Categories BarChart */}
        <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex flex-col text-right">
          <h3 className="text-xl font-bold text-emerald-900 mb-6 flex items-center gap-2 justify-end">
            <span>توزيع الحالات حسب التصنيف</span>
            <ClipboardList className="w-5 h-5 text-emerald-600" />
          </h3>
          <div className="h-80 w-full animate-in fade-in" dir="ltr">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'sans-serif' }}
                    formatter={(value: any) => [value, 'عدد الحالات']}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#059669' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-stone-400 font-medium">لا توجد بيانات كافية للرسم البياني</div>
            )}
          </div>
        </div>

        {/* Chart 2: Status PieChart */}
        <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex flex-col text-right">
          <h3 className="text-xl font-bold text-emerald-900 mb-6 flex items-center gap-2 justify-end">
            <span>توزيع الحالات حسب حالة الملف</span>
            <Users className="w-5 h-5 text-emerald-600" />
          </h3>
          <div className="h-80 w-full flex flex-col md:flex-row items-center justify-center animate-in fade-in" dir="ltr">
            {statusData.some(d => d.count > 0) ? (
              <>
                <div className="w-full md:w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'sans-serif' }}
                        formatter={(value: any) => [value, 'الحالات']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-1/2 flex flex-col gap-2 justify-center mb-4 md:mb-0" dir="rtl">
                  {statusData.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-stone-50/50 border border-stone-100 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="font-bold text-stone-700">{s.name}</span>
                      </div>
                      <span className="font-black text-emerald-950 ml-2 tabular-nums">{s.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-stone-400 font-medium">لا توجد بيانات كافية للرسم البياني</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
             <Link to="/reception" className="text-xs text-emerald-600 font-bold hover:underline">عرض الكل</Link>
             <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                حالات الاستقبال الجديدة
             </h3>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {recentReception.length > 0 ? recentReception.map((c) => (
              <div key={c.id} className="flex items-start gap-4 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-50 text-right hover:scale-[1.02] transition-all group">
                <div className="flex-grow">
                  <div className="flex items-center justify-between mb-1">
                     <span className="text-[10px] text-emerald-400 font-bold tabular-nums">
                       {c.createdAt?.toDate() ? new Date(c.createdAt.toDate()).toLocaleDateString('ar-EG') : 'الان'}
                     </span>
                     <p className="font-bold text-emerald-950 text-sm">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-2 justify-end mt-1">
                    <span className="text-[10px] bg-white px-2 py-0.5 rounded-md border border-emerald-100 font-bold text-emerald-600">{c.village}</span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-md font-bold",
                      c.caseType === 'orphan' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    )}>{c.caseType === 'orphan' ? 'يتيم' : 'حالة عامة'}</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-emerald-600 font-black shrink-0">
                  {c.serialNumber}
                </div>
              </div>
            )) : (
              <div className="py-20 text-center text-emerald-400 font-medium">لا توجد حالات استقبال جديدة</div>
            )}
          </div>
        </div>

        {isDeveloper && (
          <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
               <Link to="/logs" className="text-xs text-emerald-600 font-bold hover:underline">عرض الكل</Link>
               <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  سجل النشاط
               </h3>
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {recentLogs.length > 0 ? recentLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-transparent hover:border-emerald-50 text-right transition-all group">
                  <div className="flex-grow">
                    <div className="flex items-center justify-between mb-1">
                       <span className="text-[10px] text-emerald-400 font-bold tabular-nums">
                         {log.timestamp?.toDate() ? new Date(log.timestamp.toDate()).toLocaleTimeString('ar-EG') : 'الان'}
                       </span>
                       <p className="font-bold text-emerald-900 text-sm">{log.userEmail}</p>
                    </div>
                    <p className="text-xs text-emerald-700 bg-emerald-100/50 inline-block px-2 py-0.5 rounded-md mb-2">{log.action}</p>
                    <p className="text-[10px] text-stone-400 line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity" title={log.device}>{getFriendlyDeviceName(log.device)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-emerald-600 font-bold shrink-0">
                    <LogIn className="w-5 h-5 opacity-40" />
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center text-emerald-400 font-medium">لا توجد سجلات بعد</div>
              )}
            </div>
          </div>
        )}
        
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-6 rounded-3xl border border-amber-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4">
             <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md shadow-amber-200">
                <ClipboardList className="w-6 h-6 animate-pulse" />
             </div>
             <div className="text-right">
                <div className="flex items-center gap-2 justify-end md:justify-start">
                   {totalCriticalCount > 0 && (
                     <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-rose-200 animate-bounce">
                       تنبيه عاجل
                     </span>
                   )}
                   <h4 className="font-black text-amber-950 text-md leading-tight">تنبيهات المتابعة التلقائية</h4>
                </div>
                <p className="text-sm text-amber-900/80 mt-1 font-semibold leading-relaxed">
                  {totalCriticalCount > 0 
                    ? `يوجد حالياً ${totalCriticalCount} حالة حرجة (تقييم احتياج 9 أو أعلى) تتطلب زيارة ميدانية وبحثاً عاجلاً لتحديث ملفاتها.`
                    : 'جميع ملفات الحالات مستقرة، ولا توجد أي حالات حرجة غير مراجعة في نظام الاستقبال أو الحالات العامة.'
                  }
                </p>
                {totalCriticalCount > 0 && (
                  <div className="flex gap-2 justify-end mt-3 flex-wrap">
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold">
                      {criticalCasesCount} في الحالات العامة
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold">
                      {criticalReceptionCount} في طلبات الاستقبال
                    </span>
                  </div>
                )}
             </div>
          </div>
          <Link 
            to="/cases" 
            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl text-xs font-black shadow-lg shadow-amber-200 hover:shadow-xl transition-all whitespace-nowrap"
          >
            مراجعة وفلترة الحالات
          </Link>
        </div>

        <div className="col-span-1 md:col-span-1 lg:col-span-1 xl:col-span-1">
          {latestActivity ? (
            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-white rounded-3xl border border-emerald-100 overflow-hidden shadow-sm hover:shadow-md transition-all grid grid-cols-1 md:grid-cols-12"
            >
              <div className="md:col-span-4 h-48 md:h-full min-h-[160px] relative bg-emerald-50">
                <img 
                  src={latestActivity.imageUrl || "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=600"} 
                  alt={latestActivity.title} 
                  className="w-full h-full object-cover select-none"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 right-3 bg-emerald-600 text-white text-[9px] font-black px-2.5 py-1 rounded-full shadow-sm">
                  آخر نشاط تم توثيقه
                </div>
              </div>
              <div className="md:col-span-8 p-6 text-right flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-stone-400 font-bold">{latestActivity.date}</span>
                    <h4 className="font-black text-emerald-950 text-md">{latestActivity.title}</h4>
                  </div>
                  <p className="text-stone-500 text-xs line-clamp-2 leading-relaxed font-medium">
                    {latestActivity.description}
                  </p>
                  <div className="flex items-center gap-1 justify-end text-[10px] text-emerald-600 font-bold mt-2">
                    <span>{latestActivity.location}</span>
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-stone-50">
                  <p className="text-emerald-800/60 text-xs font-bold">
                    هل لديك نشاط أو إنجاز جديد لتسجيله ومشاركته مع الداعمين؟
                  </p>
                  {isDeveloper && (
                    <Link 
                      to="/activities" 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-md shadow-emerald-100 transition-all flex items-center gap-1.5"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>توثيق نشاط جديد</span>
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            isDeveloper && (
              <div className="bg-emerald-50 p-8 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 border border-emerald-100">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl">
                  <PlusCircle className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-emerald-900">هل لديك نشاط جديد؟</h3>
                <p className="text-emerald-800/60 max-w-xs">وثق أعمال الجمعية وشارك الصور مع الفريق والداعمين.</p>
                <Link to="/activities" className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all">إضافة نشاط</Link>
              </div>
            )
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
    </div>
  );
};

const StatCard = ({ title, value, icon, color }: { title: string; value: string; icon: ReactNode; color: string }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className={cn("p-6 rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-between font-sans", color)}
  >
    <div className="text-right">
      <p className="text-emerald-800/70 text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold text-emerald-900 mt-1 tabular-nums">{value}</p>
    </div>
    {icon}
  </motion.div>
);

const SidebarLink = ({ to, icon, label, active, onClick }: { to: string; icon: ReactNode; label: string; active: boolean; onClick?: () => void, key?: string }) => (
  <Link
    to={to}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right font-sans",
      active ? "bg-emerald-600 text-white shadow-lg" : "text-emerald-800 hover:bg-emerald-50"
    )}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </Link>
);

function NavLinks({ onLinkClick, userConfig }: { onLinkClick?: () => void, userConfig: any }) {
  const location = useLocation();
  const perms = userConfig?.permissions || [];
  const isAdmin = userConfig?.isAdmin || userConfig?.email === DEVELOPER_EMAIL || userConfig?.email === SECONDARY_DEVELOPER_EMAIL;

  const links = [
    { to: "/", icon: <LayoutDashboard className="w-5 h-5" />, label: "لوحة التحكم", id: 'dashboard' },
    { to: "/reception", icon: <UserPlus className="w-5 h-5" />, label: "الاستقبال", id: 'reception' },
    { to: "/cases", icon: <Users className="w-5 h-5" />, label: "الحالات", id: 'cases' },
    { to: "/seasonal", icon: <Box className="w-5 h-5" />, label: "الحالات الموسمية", id: 'seasonal' },
    { to: "/medical", icon: <Stethoscope className="w-5 h-5" />, label: "السجلات الطبية", id: 'medical' },
    { to: "/whatsapp", icon: <MessageCircle className="w-5 h-5" />, label: "قائمة واتساب", id: 'whatsapp' },
    { to: "/marriage", icon: <PartyPopper className="w-5 h-5" />, label: "حالات الزواج", id: 'marriage' },
    { to: "/about", icon: <Building className="w-5 h-5" />, label: "عن الجمعية", id: 'about' },
    { to: "/accounts", icon: <DollarSign className="w-5 h-5" />, label: "الحسابات والماليات", id: 'accounts' },
    { to: "/parties", icon: <PartyPopper className="w-5 h-5" />, label: "الحفلات والفعاليات", id: 'parties' },
    { to: "/top-students", icon: <GraduationCap className="w-5 h-5" />, label: "حفلة أوائل الطلبة", id: 'top_students' },
    { to: "/campaigns", icon: <Megaphone className="w-5 h-5" />, label: "الحملات", id: 'campaigns' },
    { to: "/news", icon: <Newspaper className="w-5 h-5" />, label: "أخبار الجمعية", id: 'news' },
    { to: "/volunteers", icon: <UserCheck className="w-5 h-5" />, label: "المتطوعون", id: 'volunteers' },
    { to: "/logs", icon: <Shield className="w-5 h-5" />, label: "سجل الأمان", id: 'logs' },
    { to: "/activities", icon: <ClipboardList className="w-5 h-5" />, label: "الأنشطة", id: 'activities' },
    { to: "/orphans", icon: <Heart className="w-5 h-5" />, label: "هيئة الأعمال", id: 'orphans' },
    { to: "/payroll", icon: <DollarSign className="w-5 h-5" />, label: "كشف القبض الشهري", id: 'payroll' },
    { to: "/duplicates", icon: <ShieldAlert className="w-5 h-5" />, label: "كاشف التكرار", id: 'duplicates' },
    { to: "/developer", icon: <Terminal className="w-5 h-5" />, label: "المبرمج", id: 'developer' },
  ];

  return (
    <>
      {links.filter(link => isAdmin || perms.includes(link.id)).map(link => (
        <SidebarLink key={link.to} to={link.to} icon={link.icon} label={link.label} active={location.pathname === link.to} onClick={onLinkClick} />
      ))}
      <div className="pt-4 mt-4 border-t border-emerald-50">
        <button 
          onClick={() => signOut(auth)}
          className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold justify-start font-sans group"
        >
          <LogOut className="w-5 h-5 text-rose-500" />
          <span>خروج من النظام</span>
        </button>
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isSiteLocked, setIsSiteLocked] = useState(false);
  const [lockSchedule, setLockSchedule] = useState<{ start: string; end: string } | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(() => !!(window as any).__firestore_quota_exceeded__);

  useEffect(() => {
    const handleQuotaExceeded = () => {
      setQuotaExceeded(true);
    };
    window.addEventListener('firestore-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  useEffect(() => {
    // Site Locking Logic
    const unsubSettings = onSnapshot(doc(db, 'settings', 'site_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsSiteLocked(data.isLocked || false);
        setLockSchedule(data.lockSchedule || null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/site_config'));
    return () => unsubSettings();
  }, []);

  const [userConfig, setUserConfig] = useState<{email: string, permissions: string[], isAdmin: boolean} | null>(null);

  useEffect(() => {
    if (!user) {
      setUserConfig(null);
      return;
    }

    // Developer always has all permissions
    if (user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL) {
      setUserConfig({
        email: user.email,
        permissions: ['dashboard', 'reception', 'cases', 'seasonal', 'medical', 'whatsapp', 'marriage', 'accounts', 'parties', 'campaigns', 'news', 'volunteers', 'logs', 'activities', 'orphans', 'payroll', 'duplicates', 'developer'],
        isAdmin: true
      });
      return;
    }

    // Listen to current user config
    const unsub = onSnapshot(doc(db, 'users_config', user.email?.toLowerCase() || ''), (snap) => {
      if (snap.exists()) {
        setUserConfig(snap.data() as any);
      } else {
        // Fallback for unauthorized users - maybe they only have basic dashboard access?
        // Or we keep it null to show they have no extra permissions
        setUserConfig(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users_config/${user.email?.toLowerCase()}`));
    return () => unsub();
  }, [user]);

  const isAccessAllowed = () => {
    if (user?.email === DEVELOPER_EMAIL || user?.email === SECONDARY_DEVELOPER_EMAIL) return true;
    if (isSiteLocked) return false;
    
    if (lockSchedule && lockSchedule.start && lockSchedule.end) {
      const now = new Date();
      const current = now.getHours() * 60 + now.getMinutes();
      
      const [sH, sM] = lockSchedule.start.split(':').map(Number);
      const [eH, eM] = lockSchedule.end.split(':').map(Number);
      
      const start = sH * 60 + sM;
      const end = eH * 60 + eM;
      
      if (start < end) {
        if (current >= start && current <= end) return false;
      } else {
        if (current >= start || current <= end) return false;
      }
    }
    return true;
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        // Log sign-in if it's a new session
        const sessionKey = `logged_signin_${u.uid}`;
        const alreadyLogged = sessionStorage.getItem(sessionKey);
        const hasQuotaError = (window as any).__firestore_quota_exceeded__;
        
        if (!alreadyLogged && !hasQuotaError) {
          addDoc(collection(db, 'logs'), {
            userEmail: u.email,
            action: 'دخول للنظام',
            device: navigator.userAgent,
            timestamp: serverTimestamp()
          })
          .then(() => {
            sessionStorage.setItem(sessionKey, 'true');
          })
          .catch(err => {
            const errStr = err instanceof Error ? err.message : String(err);
            if (errStr.toLowerCase().includes('resource-exhausted') || errStr.toLowerCase().includes('quota')) {
              (window as any).__firestore_quota_exceeded__ = true;
              window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
            }
            console.error("Logging failed:", err);
          });
        }
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []); // Empty dependency array is critical to avoid infinite loops with auth listeners

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-50">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Logo className="w-20 h-20" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const accessAllowed = isAccessAllowed();

  if (!accessAllowed) {
    return (
      <div className="h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-right font-sans" dir="rtl">
        <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl border border-rose-100 max-w-lg w-full text-center">
          <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <Lock className="w-12 h-12 text-rose-500" />
          </div>
          <h1 className="text-3xl font-black text-rose-950 mb-4">الموقع مغلق الآن</h1>
          <p className="text-stone-500 font-bold mb-8 leading-relaxed">
            عذراً، الموقع مغلق حالياً بقرار من الإدارة أو ضمن مواعيد الإغلاق المقررة.
            برجاء المحاولة في وقت لاحق.
          </p>
          <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 mb-8">
             <p className="text-sm font-bold text-stone-400 mb-2">مواعيد العمل المجدولة</p>
             <p className="text-emerald-600 font-black">يفتح الموقع تلقائياً من {lockSchedule?.end || '8:00'} صباحاً حتى {lockSchedule?.start || '12:00'} ليلاً</p>
          </div>
          <button 
           onClick={() => signOut(auth)}
           className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-200"
          >
            <LogOut className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-stone-50 font-sans text-emerald-950 overflow-hidden" dir="rtl">
        {/* Sidebar for Desktop */}
        <aside className="hidden lg:flex flex-col w-72 bg-white border-l border-emerald-100 p-6 shadow-2xl z-20 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-3 mb-10 px-2 justify-end group cursor-pointer">
            <Logo className="w-10 h-10 transition-transform group-hover:scale-110" />
            <h2 className="text-xl font-bold text-emerald-900 tracking-tight font-sans transition-colors group-hover:text-emerald-600">بصمة خير</h2>
          </div>
          
          <nav className="space-y-1 flex-grow">
            <NavLinks userConfig={userConfig} />
            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="w-full flex items-center gap-3 px-4 py-3 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all font-bold justify-start font-sans mt-4 border border-emerald-100 shadow-sm"
              >
                <Download className="w-5 h-5" />
                <span>تثبيت التطبيق</span>
              </button>
            )}
          </nav>

          <div className="mt-8 pt-6 border-t border-emerald-50">
            <div className="flex items-center gap-3 mb-4 px-2 bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/50">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="profile" />
              <div className="text-right flex-grow overflow-hidden">
                <p className="text-sm font-bold truncate text-emerald-950">{user.displayName}</p>
                <p className="text-[10px] text-emerald-600/70 truncate">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold justify-end font-sans group"
            >
              <span className="group-hover:translate-x-1 transition-transform">تسجيل الخروج</span>
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </aside>

        {/* Mobile Header */}
        <header className="lg:hidden fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-emerald-100 px-6 py-4 flex items-center justify-between z-30">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-emerald-900">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <span className="font-bold font-sans">بصمة خير</span>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
          <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: 200 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 200 }}
              className="lg:hidden fixed inset-0 bg-white z-40 p-6 pt-20"
            >
              <nav className="space-y-4">
                <NavLinks userConfig={userConfig} onLinkClick={() => setMobileMenuOpen(false)} />
                {deferredPrompt && (
                  <button 
                    onClick={() => {
                      handleInstallClick();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 text-white rounded-xl transition-all font-bold justify-center font-sans mt-4 shadow-lg"
                  >
                    <Download className="w-5 h-5" />
                    <span>تثبيت التطبيق على الجهاز</span>
                  </button>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main id="main-content" className="flex-grow overflow-y-auto pt-20 lg:pt-0 custom-scrollbar relative scroll-smooth">
          {quotaExceeded && (
            <div className="bg-rose-50 border-b border-rose-150 p-4 text-rose-900 text-sm font-bold flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 animate-pulse" />
                <div className="text-right">
                  <p className="font-extrabold text-rose-950 text-md">تنبيه: تم تجاوز الحصة المجانية اليومية لقاعدة البيانات (Firebase Quota Exceeded)</p>
                  <p className="text-xs text-rose-800 font-semibold mt-1 leading-relaxed">
                    البيانات الحالية معروضة من الذاكرة المؤقتة (Offline Cache). يمكنك الاستمرار في قراءة وتصفح الملفات والتقارير بأمان، ولكن عمليات الإضافة والتعديل ستتوقف مؤقتاً حتى إعادة تعيين الحصة تلقائياً من قِبل جوجل (خلال 24 ساعة) أو تحديث خطة الاستضافة.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setQuotaExceeded(false)}
                className="text-rose-400 hover:text-rose-700 p-1.5 hover:bg-rose-100 rounded-lg transition-all"
                title="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard isDeveloper={userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL} />} />
              <Route path="/reception" element={<ReceptionScreen />} />
              <Route path="/cases" element={<CasesScreen />} />
              <Route path="/seasonal" element={<SeasonalCasesScreen />} />
              <Route path="/medical" element={<MedicalRecordsScreen />} />
              <Route path="/marriage" element={<MarriageCasesScreen />} />
              <Route path="/whatsapp" element={<WhatsAppListScreen />} />
              <Route path="/about" element={<AboutScreen />} />
              <Route path="/accounts" element={<AccountsScreen />} />
              <Route path="/parties" element={<PartiesScreen />} />
              <Route path="/top-students" element={<TopStudentsScreen />} />
              <Route path="/activities" element={<ActivitiesScreen />} />
              <Route path="/volunteers" element={<VolunteersScreen />} />
              <Route path="/campaigns" element={<CampaignsScreen />} />
              <Route path="/news" element={<NewsScreen />} />
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL || userConfig?.permissions?.includes('logs')) && (
                <Route path="/logs" element={<LogsScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL || userConfig?.permissions?.includes('activities')) && (
                <Route path="/activities" element={<ActivitiesScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL || userConfig?.permissions?.includes('developer')) && (
                <Route path="/developer" element={<DeveloperScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL || userConfig?.permissions?.includes('orphans')) && (
                <Route path="/orphans" element={<OrphansScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL || userConfig?.permissions?.includes('payroll')) && (
                <Route path="/payroll" element={<MonthlyPayrollScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || user.email === SECONDARY_DEVELOPER_EMAIL || userConfig?.permissions?.includes('duplicates')) && (
                <Route path="/duplicates" element={<DuplicatesScreen />} />
              )}
            </Routes>
          </div>

          {/* Global Floating Scroll Sidebar */}
          <div className="fixed bottom-10 left-6 flex flex-col gap-3 z-50">
            <a 
              href="https://wa.me/201021761633" 
              target="_blank" 
              rel="noreferrer"
              className="p-3 bg-[#25D366] text-white rounded-2xl shadow-2xl hover:bg-[#128C7E] transition-all border-2 border-white/20 group flex items-center justify-center"
              title="تواصل عبر واتساب"
            >
              <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </a>
            <button 
              onClick={() => document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' })}
              className="p-3 bg-emerald-600 text-white rounded-2xl shadow-2xl hover:bg-emerald-700 transition-all border-2 border-white/20 group"
              title="للأعلى"
            >
              <ChevronUp className="w-6 h-6 group-hover:-translate-y-1 transition-transform" />
            </button>
            <button 
              onClick={() => {
                const el = document.getElementById('main-content');
                el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
              }}
              className="p-3 bg-emerald-600 text-white rounded-2xl shadow-2xl hover:bg-emerald-700 transition-all border-2 border-white/20 group"
              title="للأسفل"
            >
              <ChevronDown className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
            </button>
          </div>
          <VoiceAssistant />
        </main>
      </div>
    </BrowserRouter>
  );
}