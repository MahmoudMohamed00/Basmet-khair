import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Download, FileText, X, Phone, Calendar, 
  Trash2, Edit, Printer, ArrowUpCircle, ArrowDownCircle, 
  PieChart, TrendingDown, Clock, FileCheck, Calculator, PlusCircle,
  FileUp, Upload, Check, AlertCircle, FileSpreadsheet, MapPin, Filter, CheckCircle2
} from 'lucide-react';
import { 
  collection, query, onSnapshot, addDoc, updateDoc, doc, 
  serverTimestamp, deleteDoc, orderBy, where
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType, logSystemAction } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';
import { 
  PieChart as ReChartsPieChart, Pie, Cell, ResponsiveContainer, 
  Tooltip, Legend 
} from 'recharts';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// --- Interfaces ---

interface Donor {
  id: string;
  donorCode: string;
  name: string;
  phone: string;
  address?: string;
  lastDonationDate?: string;
  totalDonations: number;
}

interface IncomingDonation {
  id: string;
  donorId?: string;
  donorName: string;
  phone: string;
  amount?: number;
  quantity?: string;
  type: 'cash' | 'inkind';
  date: string;
  receiverName: string;
  paymentMethod?: string;
  itemDescription?: string;
  status: 'available' | 'disbursed';
}

interface OutgoingDonation {
  id: string;
  receiverName: string;
  amount?: number;
  quantity?: string;
  description: string;
  date: string;
  incomingId?: string;
}

export default function AccountsScreen() {
  const [activeTab, setActiveTab] = useState<'analysis' | 'donors' | 'incoming' | 'outgoing' | 'sponsorships' | 'accounts'>('analysis');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [donors, setDonors] = useState<Donor[]>([]);
  const [incomingDonations, setIncomingDonations] = useState<IncomingDonation[]>([]);
  const [outgoingDonations, setOutgoingDonations] = useState<OutgoingDonation[]>([]);
  const [sponsorships, setSponsorships] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [printingOp, setPrintingOp] = useState<any>(null);

  useEffect(() => {
    const unsubDonors = onSnapshot(query(collection(db, 'donors'), orderBy('createdAt', 'desc')), 
      snap => setDonors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Donor))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'donors'));

    const unsubIncoming = onSnapshot(query(collection(db, 'incoming_donations'), orderBy('createdAt', 'desc')), 
      snap => {
        const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncomingDonation));
        const filtered = all.filter(d => {
          const dDate = new Date(d.date);
          return (dDate.getMonth() + 1) === selectedMonth && dDate.getFullYear() === selectedYear;
        });
        setIncomingDonations(filtered);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'incoming_donations'));

    const unsubOutgoing = onSnapshot(query(collection(db, 'outgoing_donations'), orderBy('createdAt', 'desc')), 
      snap => {
        const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OutgoingDonation));
        const filtered = all.filter(d => {
          const dDate = new Date(d.date);
          return (dDate.getMonth() + 1) === selectedMonth && dDate.getFullYear() === selectedYear;
        });
        setOutgoingDonations(filtered);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'outgoing_donations'));

    const unsubSponsorships = onSnapshot(collection(db, 'monthly_sponsorships'), 
      snap => setSponsorships(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'monthly_sponsorships'));

    const unsubAccounts = onSnapshot(collection(db, 'financial_accounts'), 
      snap => setAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'financial_accounts'));

    return () => {
      unsubDonors();
      unsubIncoming();
      unsubOutgoing();
      unsubSponsorships();
      unsubAccounts();
    };
  }, [selectedMonth, selectedYear]);

  const generateDonorCode = (existingDonors: Donor[]) => {
    const numbers = existingDonors
      .map(d => parseInt(d.donorCode?.replace('N', '')))
      .filter(n => !isNaN(n));
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `N${nextNum}`;
  };

  const tabs = [
    { id: 'analysis', label: 'التحليل المالي', icon: PieChart },
    { id: 'donors', label: 'بيانات المتبرعين', icon: Phone },
    { id: 'incoming', label: 'التبرعات الواردة', icon: ArrowUpCircle },
    { id: 'outgoing', label: 'التبرعات المنصرفة', icon: ArrowDownCircle },
    { id: 'sponsorships', label: 'نظام الكفالات', icon: Calendar },
    { id: 'accounts', label: 'الحسابات والخزائن', icon: Calculator },
  ];

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-sans" dir="rtl">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 mb-2">النظام المالي والحسابات</h1>
          <p className="text-slate-500 font-medium font-sans">إدارة شاملة للمتبرعين، الكفالات، والتدفقات النقدية</p>
        </div>
        <div className="flex bg-white p-2 rounded-2xl border border-slate-100 shadow-sm gap-2">
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-slate-50 px-4 py-2 rounded-xl outline-none font-bold text-slate-700 border-none cursor-pointer"
          >
            {["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"].map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <input 
            type="number" 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-24 bg-slate-50 px-4 py-2 rounded-xl text-center font-bold text-slate-700 border-none outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 bg-white p-2 rounded-3xl border border-slate-100 shadow-sm overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${
              activeTab === tab.id 
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'analysis' && <AnalysisTab incoming={incomingDonations} outgoing={outgoingDonations} sponsorships={sponsorships} selectedMonth={selectedMonth} selectedYear={selectedYear} />}
          {activeTab === 'donors' && <DonorsTab donors={donors} generateCode={generateDonorCode} />}
          {activeTab === 'incoming' && <IncomingTab donations={incomingDonations} donors={donors} onPrint={setPrintingOp} />}
          {activeTab === 'outgoing' && <OutgoingTab donations={outgoingDonations} incoming={incomingDonations} onPrint={setPrintingOp} />}
          {activeTab === 'sponsorships' && <SponsorshipsTab sponsorships={sponsorships} selectedMonth={selectedMonth} selectedYear={selectedYear} />}
          {activeTab === 'accounts' && <AccountsTab accounts={accounts} selectedMonth={selectedMonth} selectedYear={selectedYear} />}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {printingOp && (
          <ReceiptModal 
            data={printingOp} 
            onClose={() => setPrintingOp(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Helpers ---

const InputField = ({ label, value, onChange, required = false, type = "text", placeholder = "", dir = "rtl", icon: Icon }: any) => (
  <div className="space-y-2 text-right">
    <label className="block text-slate-700 font-bold pr-2 flex items-center gap-2 justify-end">
      {label}
      {required && <span className="text-rose-500 mr-1">*</span>}
      {Icon && <Icon className="w-4 h-4 text-emerald-600" />}
    </label>
    <input
      type={type}
      required={required}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:border-emerald-500 transition-all bg-slate-50 focus:bg-white font-sans text-right"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      dir={dir}
    />
  </div>
);

const AnalysisTab = ({ incoming, outgoing, sponsorships, selectedMonth, selectedYear }: any) => {
  const totalIncoming = incoming.reduce((s: number, o: any) => s + (o.amount || 0), 0);
  const totalOutgoing = outgoing.reduce((s: number, o: any) => s + (o.amount || 0), 0);
  
  const currentSponsorships = sponsorships.filter((s: any) => s.month === selectedMonth && s.year === selectedYear);

  const totalSponsIncome = currentSponsorships.reduce((s: number, m: any) => 
    s + (m.revenues?.reduce((rs: number, r: any) => rs + (r.isCollected ? r.amount : 0), 0) || 0), 0);
  const totalSponsExpense = currentSponsorships.reduce((s: number, m: any) => 
    s + (m.expenses?.reduce((rs: number, e: any) => rs + e.amount, 0) || 0), 0);

  const grandTotalIncome = totalIncoming + totalSponsIncome;
  const grandTotalExpense = totalOutgoing + totalSponsExpense;

  const incomeData = [
    { name: 'الوارد العام', value: totalIncoming, color: '#10b981' },
    { name: 'وارد الكفالات', value: totalSponsIncome, color: '#3b82f6' },
  ];

  const expenseData = [
    { name: 'المنصرف العام', value: totalOutgoing, color: '#ef4444' },
    { name: 'مصاريف الكفالات', value: totalSponsExpense, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100 text-center">
          <p className="text-emerald-600 font-bold mb-1">إجمالي الإيرادات</p>
          <h3 className="text-3xl font-black text-slate-800">{grandTotalIncome.toLocaleString()} ج.م</h3>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 rounded-3xl shadow-sm border border-rose-100 text-center">
          <p className="text-rose-600 font-bold mb-1">إجمالي المصروفات</p>
          <h3 className="text-3xl font-black text-slate-800">{grandTotalExpense.toLocaleString()} ج.م</h3>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 rounded-3xl shadow-sm border border-blue-100 text-center">
          <p className="text-blue-600 font-bold mb-1">صافي الرصيد</p>
          <h3 className="text-3xl font-black text-slate-800">{(grandTotalIncome - grandTotalExpense).toLocaleString()} ج.م</h3>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
           <h3 className="text-xl font-black mb-6 text-right">تحليل الدخل</h3>
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ReChartsPieChart>
                  <Pie data={incomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                    {incomeData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </ReChartsPieChart>
              </ResponsiveContainer>
           </div>
        </div>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
           <h3 className="text-xl font-black mb-6 text-right">تحليل المنصرف</h3>
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ReChartsPieChart>
                  <Pie data={expenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                    {expenseData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </ReChartsPieChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
};

const DonorsTab = ({ donors, generateCode }: any) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'donorCode' | 'totalDonations'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const tableRef = useRef<HTMLDivElement>(null);

  const handleSave = async (e: any) => {
    e.preventDefault();
    const code = formData.donorCode || generateCode(donors);
    try {
      if (formData.id) {
        const dataToUpdate = JSON.parse(JSON.stringify(formData));
        await updateDoc(doc(db, 'donors', formData.id), { ...dataToUpdate, updatedAt: serverTimestamp() });
      } else {
        const dataToSave = JSON.parse(JSON.stringify(formData));
        await addDoc(collection(db, 'donors'), {
          ...dataToSave,
          donorCode: code,
          totalDonations: 0,
          lastDonationDate: '',
          createdAt: serverTimestamp()
        });
      }
      setShowForm(false);
      setFormData({});
    } catch (err) { console.error(err); }
  };

  const filtered = donors.filter((d: any) => 
    (d.name || '').includes(searchTerm) || (d.phone || '').includes(searchTerm) || (d.donorCode || '').includes(searchTerm)
  );

  const sorted = [...filtered].sort((a, b) => {
    let comp = 0;
    if (sortBy === 'name') {
      comp = (a.name || '').localeCompare(b.name || '');
    } else if (sortBy === 'donorCode') {
      comp = (a.donorCode || '').localeCompare(b.donorCode || '');
    } else if (sortBy === 'totalDonations') {
      comp = (a.totalDonations || 0) - (b.totalDonations || 0);
    }
    return sortOrder === 'asc' ? comp : -comp;
  });

  const handleExportExcel = () => {
    const dataToExport = sorted.map((d: any, index: number) => ({
      'م': index + 1,
      'كود المتبرع': d.donorCode,
      'الاسم': d.name,
      'رقم الهاتف': d.phone,
      'العنوان': d.address || 'غير مسجل',
      'إجمالي التبرعات': d.totalDonations || 0,
      'تاريخ آخر تبرع': d.lastDonationDate || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'المتبرعون');
    XLSX.writeFile(workbook, `كشف_المتبرعين_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        let count = 0;
        const existingCodes = donors.map((dn: any) => dn.donorCode);
        for (const item of data) {
          const name = item['الاسم'] || item['اسم المتبرع'] || item['name'];
          if (!name) continue;
          const phone = String(item['رقم الهاتف'] || item['الهاتف'] || item['الموبايل'] || item['phone'] || '');
          const address = item['العنوان'] || item['address'] || '';
          
          let donorCode = item['كود المتبرع'] || item['الكود'] || item['donorCode'] || '';
          if (!donorCode) {
            // Generate temporary unique donor code sequentially
            const nextIndex = donors.length + count + 1;
            donorCode = `N${nextIndex}`;
          }

          await addDoc(collection(db, 'donors'), {
            name,
            phone,
            address,
            donorCode,
            totalDonations: Number(item['إجمالي التبرعات'] || item['إجمالي_التبرعات'] || item['totalDonations']) || 0,
            lastDonationDate: item['تاريخ آخر تبرع'] || item['آخر_تبرع'] || item['lastDonationDate'] || '',
            createdAt: serverTimestamp()
          });
          count++;
        }
        alert(`تم استيراد ${count} متبرع بنجاح`);
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء استيراد البيانات، تأكد من صحة ملف الإكسل');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePrint = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`كشف_المتبرعين_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="بحث..."
            className="w-full pr-12 pl-4 py-3 rounded-2xl border border-slate-200 outline-none text-right text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 border border-slate-100 rounded-2xl">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500">ترتيب حسب:</span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-slate-700 cursor-pointer"
          >
            <option value="name">الاسم</option>
            <option value="donorCode">الكود</option>
            <option value="totalDonations">إجمالي التبرعات</option>
          </select>
          <select 
            value={sortOrder} 
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-slate-700 cursor-pointer"
          >
            <option value="asc">تصاعدي</option>
            <option value="desc">تنازلي</option>
          </select>
        </div>

        {/* Import/Export/Print Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-slate-200 transition-colors"
            title="طباعة الكشف"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>
          
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-emerald-100 transition-colors"
            title="تصدير إكسل"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير إكسل</span>
          </button>

          <label 
            className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-blue-100 transition-colors cursor-pointer"
            title="استيراد إكسل"
          >
            <Upload className="w-4 h-4" />
            <span>استيراد إكسل</span>
            <input type="file" hidden accept=".xlsx, .xls" onChange={handleImportExcel} />
          </label>

          <button onClick={() => { setFormData({}); setShowForm(true); }} className="bg-emerald-600 text-white px-6 py-2.5 rounded-2xl font-black text-xs hover:bg-emerald-700 transition-colors">إضافة متبرع</button>
        </div>
      </div>

      <div ref={tableRef} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto text-right">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 font-black text-xs text-slate-400">الكود</th>
              <th className="px-6 py-4 font-black text-xs text-slate-400">الاسم</th>
              <th className="px-6 py-4 font-black text-xs text-slate-400">رقم الهاتف</th>
              <th className="px-6 py-4 font-black text-xs text-slate-400">العنوان</th>
              <th className="px-6 py-4 font-black text-xs text-slate-400">إجمالي التبرعات</th>
              <th className="px-6 py-4 font-black text-xs text-slate-400">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((donor: any) => (
              <tr key={donor.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-emerald-600 text-sm">{donor.donorCode}</td>
                <td className="px-6 py-4 font-bold text-sm text-slate-700">{donor.name}</td>
                <td className="px-6 py-4 text-sm text-slate-500 font-sans">{donor.phone}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{donor.address || 'غير مسجل'}</td>
                <td className="px-6 py-4 font-sans font-black text-emerald-600 text-sm">{(donor.totalDonations || 0).toLocaleString()} ج.م</td>
                <td className="px-6 py-4">
                   <button onClick={() => { setFormData(donor); setShowForm(true); }} className="text-emerald-600 font-bold hover:underline text-xs">تعديل</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl">
              <h3 className="text-xl font-black mb-6 text-right">بيانات المتبرع</h3>
              <form onSubmit={handleSave} className="space-y-4">
                <InputField label="الاسم" value={formData.name} onChange={(v: any) => setFormData({...formData, name: v})} required />
                <InputField label="رقم الهاتف" value={formData.phone} onChange={(v: any) => setFormData({...formData, phone: v})} required />
                <InputField label="العنوان" value={formData.address} onChange={(v: any) => setFormData({...formData, address: v})} />
                <InputField label="الكود (اختياري)" value={formData.donorCode} onChange={(v: any) => setFormData({...formData, donorCode: v})} />
                <div className="flex gap-2 pt-4">
                  <button type="submit" className="flex-1 bg-emerald-600 text-white rounded-xl font-bold h-12">حفظ</button>
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-xl font-bold h-12">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const IncomingTab = ({ donations, donors, onPrint }: any) => {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({ type: 'cash', status: 'available' });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'donorName' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleSave = async (e: any) => {
    e.preventDefault();
    try {
      const dataToSave = JSON.parse(JSON.stringify(formData)); // Clean undefined values
      if (editingItem) {
        await updateDoc(doc(db, 'incoming_donations', editingItem.id), {
          ...dataToSave,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'incoming_donations'), {
          ...dataToSave,
          date: formData.date || new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp()
        });

        // Update donor's total donations if linked
        if (formData.donorId) {
          const donor = donors.find((d: any) => d.id === formData.donorId);
          if (donor) {
            const amount = Number(formData.amount) || 0;
            await updateDoc(doc(db, 'donors', donor.id), {
              totalDonations: (donor.totalDonations || 0) + amount,
              lastDonationDate: formData.date || new Date().toISOString().split('T')[0],
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      setShowForm(false);
      setEditingItem(null);
      setFormData({ type: 'cash', status: 'available' });
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'incoming_donations', id));
      if (itemToDelete) {
        await logSystemAction('delete', 'incoming_donations', id, itemToDelete, `حذف تبرع وارد من: ${itemToDelete.donorName || 'مجهول'}`);
      }
      setItemToDelete(null);
    } catch (err) { console.error(err); }
  };

  const filtered = donations.filter((d: any) => 
    (d.donorName || '').includes(searchTerm) || (d.phone || '').includes(searchTerm)
  );

  const sorted = [...filtered].sort((a, b) => {
    let comp = 0;
    if (sortBy === 'date') {
      comp = (a.date || '').localeCompare(b.date || '');
    } else if (sortBy === 'donorName') {
      comp = (a.donorName || '').localeCompare(b.donorName || '');
    } else if (sortBy === 'amount') {
      const aAmt = a.type === 'cash' ? (a.amount || 0) : 0;
      const bAmt = b.type === 'cash' ? (b.amount || 0) : 0;
      comp = aAmt - bAmt;
    }
    return sortOrder === 'asc' ? comp : -comp;
  });

  const handleExportExcel = () => {
    const dataToExport = sorted.map((d: any, index: number) => ({
      'م': index + 1,
      'اسم المتبرع': d.donorName,
      'رقم الهاتف': d.phone,
      'نوع التبرع': d.type === 'cash' ? 'نقدي' : 'عيني',
      'المبلغ / الكمية': d.amount || d.quantity,
      'طريقة التحصيل / البيان': d.paymentMethod || d.itemDescription || d.description || '',
      'التاريخ': d.date,
      'اسم المستلم': d.receiverName,
      'الحالة': d.status === 'available' ? 'متاح' : 'تم الصرف'
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'التبرعات الواردة');
    XLSX.writeFile(workbook, `كشف_التبرعات_الواردة_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        let count = 0;
        for (const item of data) {
          const donorName = item['اسم المتبرع'] || item['الاسم'] || item['donorName'];
          if (!donorName) continue;
          const phone = String(item['رقم الهاتف'] || item['الهاتف'] || item['الموبايل'] || item['phone'] || '');
          const typeStr = item['نوع التبرع'] || item['النوع'] || item['type'] || 'cash';
          const type = (typeStr === 'عيني' || typeStr === 'inkind' || typeStr === 'عيني') ? 'inkind' : 'cash';
          
          const amount = item['المبلغ'] || item['amount'] ? Number(item['المبلغ'] || item['amount']) : undefined;
          const quantity = String(item['الكمية'] || item['العدد'] || item['quantity'] || '');
          const receiverName = item['اسم المستلم'] || item['المستلم'] || item['receiverName'] || 'إدارة الجمعية';
          const date = item['التاريخ'] || item['date'] || new Date().toISOString().split('T')[0];
          const itemDescription = item['الوصف'] || item['البيان'] || item['وصف التبرع'] || item['itemDescription'] || '';
          const statusStr = item['الحالة'] || item['status'] || 'available';
          const status = (statusStr === 'تم الصرف' || statusStr === 'disbursed') ? 'disbursed' : 'available';

          const matchedDonor = donors.find((dn: any) => dn.name === donorName);
          const donorId = matchedDonor?.id || undefined;

          await addDoc(collection(db, 'incoming_donations'), {
            donorName,
            phone,
            type,
            amount: amount || null,
            quantity: quantity || null,
            receiverName,
            date,
            itemDescription,
            status,
            donorId: donorId || null,
            createdAt: serverTimestamp()
          });
          count++;
        }
        alert(`تم استيراد ${count} تبرع وارد بنجاح`);
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء استيراد البيانات، تأكد من مطابقة أعمدة ملف الإكسل');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePrintTable = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`كشف_التبرعات_الواردة_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input type="text" placeholder="بحث باسم المتبرع أو الهاتف..." className="w-full pr-12 pl-4 py-3 rounded-2xl border border-slate-200 text-right text-sm outline-none focus:border-emerald-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {/* Sorting Controls */}
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 border border-slate-100 rounded-2xl">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500">ترتيب حسب:</span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-slate-700 cursor-pointer"
          >
            <option value="date">التاريخ</option>
            <option value="donorName">اسم المتبرع</option>
            <option value="amount">المبلغ</option>
          </select>
          <select 
            value={sortOrder} 
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-slate-700 cursor-pointer"
          >
            <option value="desc">الأحدث أولاً</option>
            <option value="asc">الأقدم أولاً</option>
          </select>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={handlePrintTable}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-slate-200 transition-colors"
            title="طباعة الجدول"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>
          
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-emerald-100 transition-colors"
            title="تصدير إكسل"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير إكسل</span>
          </button>

          <label 
            className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-blue-100 transition-colors cursor-pointer"
            title="استيراد من إكسل"
          >
            <Upload className="w-4 h-4" />
            <span>استيراد إكسل</span>
            <input type="file" hidden accept=".xlsx, .xls" onChange={handleImportExcel} />
          </label>

          <button onClick={() => { setEditingItem(null); setFormData({ type: 'cash', status: 'available' }); setShowForm(true); }} className="bg-emerald-600 text-white px-6 py-2.5 rounded-2xl font-black text-xs hover:bg-emerald-700 transition-colors">إضافة تبرع وارد</button>
        </div>
      </div>

      <div ref={tableRef} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto text-right">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100 font-black text-xs text-slate-400">
            <tr>
              <th className="px-6 py-4">المتبرع</th>
              <th className="px-6 py-4">النوع</th>
              <th className="px-6 py-4">المبلغ/العدد</th>
              <th className="px-6 py-4">التاريخ</th>
              <th className="px-6 py-4">الحالة</th>
              <th className="px-6 py-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d: any) => (
              <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-6 py-4 font-bold text-sm text-slate-700">{d.donorName}</td>
                <td className="px-6 py-4 text-xs font-bold text-slate-500">{d.type === 'cash' ? 'نقدي' : 'عيني'}</td>
                <td className="px-6 py-4 font-black font-sans text-sm text-slate-800">{d.type === 'cash' ? `${(d.amount || 0).toLocaleString()} ج.م` : d.quantity}</td>
                <td className="px-6 py-4 text-xs font-medium text-slate-500 font-sans">{d.date}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${d.status === 'available' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {d.status === 'available' ? 'متاح' : 'تم الصرف'}
                  </span>
                </td>
                <td className="px-6 py-4">
                   <div className="flex items-center justify-center gap-2">
                     <button onClick={() => onPrint(d)} className="text-slate-400 p-2 hover:bg-slate-100 rounded-xl transition-all" title="طباعة الإيصال"><Printer className="w-4 h-4" /></button>
                     <button onClick={() => { setEditingItem(d); setFormData(d); setShowForm(true); }} className="text-emerald-600 p-2 hover:bg-emerald-50 rounded-xl transition-all"><Edit className="w-4 h-4" /></button>
                     <button onClick={() => setItemToDelete(d)} className="text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-black mb-6 text-right">{editingItem ? 'تعديل تبرع' : 'تسجيل تبرع وارد'}</h3>
              <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-2 text-right">
                  <label className="block text-slate-700 font-bold pr-2 flex items-center gap-2 justify-end">
                    ربط مع متبرع مسجل (اختياري)
                  </label>
                  <select 
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:border-emerald-500 transition-all bg-slate-50 focus:bg-white font-sans text-right text-sm"
                    onChange={(e) => {
                      const selected = donors.find((d: any) => d.id === e.target.value);
                      if (selected) {
                        setFormData({
                          ...formData,
                          donorId: selected.id,
                          donorName: selected.name,
                          phone: selected.phone
                        });
                      } else {
                        setFormData({
                          ...formData,
                          donorId: undefined,
                          donorName: '',
                          phone: ''
                        });
                      }
                    }}
                    value={formData.donorId || ''}
                  >
                    <option value="">-- متبرع جديد / غير مسجل --</option>
                    {donors.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.donorCode})</option>
                    ))}
                  </select>
                </div>
                <InputField label="اسم المتبرع" value={formData.donorName} onChange={(v: any) => setFormData({...formData, donorName: v})} required />
                <InputField label="رقم الهاتف" value={formData.phone} onChange={(v: any) => setFormData({...formData, phone: v})} required />
                <InputField label="التاريخ" type="date" value={formData.date} onChange={(v: any) => setFormData({...formData, date: v})} required />
                <InputField label="اسم المستلم" value={formData.receiverName} onChange={(v: any) => setFormData({...formData, receiverName: v})} required />
                <div className="space-y-1 text-right">
                   <label className="text-sm font-bold block pr-2">نوع التبرع</label>
                   <select className="w-full p-3 rounded-xl border border-slate-200" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
                     <option value="cash">نقدي</option>
                     <option value="inkind">عيني</option>
                   </select>
                </div>
                {formData.type === 'cash' ? (
                  <>
                    <InputField label="المبلغ" type="number" value={formData.amount} onChange={(v: any) => setFormData({...formData, amount: Number(v)})} required />
                    <InputField label="طريقة التحصيل" value={formData.paymentMethod} onChange={(v: any) => setFormData({...formData, paymentMethod: v})} />
                  </>
                ) : (
                  <>
                    <InputField label="العدد/الكمية" value={formData.quantity} onChange={(v: any) => setFormData({...formData, quantity: v})} required />
                    <InputField label="وصف التبرع" value={formData.itemDescription} onChange={(v: any) => setFormData({...formData, itemDescription: v})} required />
                  </>
                )}
                <div className="md:col-span-2 flex gap-2 pt-4">
                  <button type="submit" className="flex-1 bg-emerald-600 text-white rounded-xl font-bold h-12">حفظ التبرع</button>
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-xl font-bold h-12">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!itemToDelete}
        title="تأكيد حذف التبرع الوارد"
        message={`هل أنت متأكد من حذف هذا التبرع الوارد من "${itemToDelete?.donorName}" بقيمة/كمية "${itemToDelete?.type === 'cash' ? (itemToDelete?.amount?.toLocaleString() + ' ج.م') : itemToDelete?.quantity}"؟`}
        onConfirm={() => {
          if (itemToDelete) {
            handleDelete(itemToDelete.id);
          }
        }}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};

const OutgoingTab = ({ donations, incoming, onPrint }: any) => {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'receiverName' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleSave = async (e: any) => {
    e.preventDefault();
    try {
      const dataToSave = JSON.parse(JSON.stringify(formData)); // Clean undefined values
      if (editingItem) {
        await updateDoc(doc(db, 'outgoing_donations', editingItem.id), {
          ...dataToSave,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'outgoing_donations'), {
          ...dataToSave,
          date: formData.date || new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp()
        });
        if (formData.incomingId) {
          await updateDoc(doc(db, 'incoming_donations', formData.incomingId), {
            status: 'disbursed',
            updatedAt: serverTimestamp()
          });
        }
      }
      setShowForm(false);
      setEditingItem(null);
      setFormData({});
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'outgoing_donations', id));
      if (itemToDelete) {
        await logSystemAction('delete', 'outgoing_donations', id, itemToDelete, `حذف عملية صرف مالي للمستلم: ${itemToDelete.receiverName || 'مجهول'}`);
      }
      setItemToDelete(null);
    } catch (err) { console.error(err); }
  };

  const filtered = donations.filter((d: any) => (d.receiverName || '').includes(searchTerm));

  const sorted = [...filtered].sort((a, b) => {
    let comp = 0;
    if (sortBy === 'date') {
      comp = (a.date || '').localeCompare(b.date || '');
    } else if (sortBy === 'receiverName') {
      comp = (a.receiverName || '').localeCompare(b.receiverName || '');
    } else if (sortBy === 'amount') {
      comp = (a.amount || 0) - (b.amount || 0);
    }
    return sortOrder === 'asc' ? comp : -comp;
  });

  const handleExportExcel = () => {
    const dataToExport = sorted.map((d: any, index: number) => ({
      'م': index + 1,
      'اسم المستلم': d.receiverName,
      'التاريخ': d.date,
      'المبلغ / الكمية': d.amount || d.quantity || '',
      'البيان': d.description || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'حسابات الصرف والتبرعات');
    XLSX.writeFile(workbook, `كشف_الصرف_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        let count = 0;
        for (const item of data) {
          const receiverName = item['اسم المستلم'] || item['المستلم'] || item['receiverName'];
          if (!receiverName) continue;
          const date = item['التاريخ'] || item['date'] || new Date().toISOString().split('T')[0];
          const amount = Number(item['المبلغ'] || item['الكمية'] || item['amount'] || 0);
          const description = item['البيان'] || item['الوصف'] || item['description'] || '';

          await addDoc(collection(db, 'outgoing_donations'), {
            receiverName,
            date,
            amount,
            description,
            createdAt: serverTimestamp()
          });
          count++;
        }
        alert(`تم استيراد ${count} سجل صرف بنجاح`);
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء استيراد البيانات، تأكد من مطابقة أعمدة ملف الإكسل');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePrintTable = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`كشف_الصرف_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input type="text" placeholder="بحث باسم المستلم..." className="w-full pr-12 pl-4 py-3 rounded-2xl border border-slate-200 text-right text-sm outline-none focus:border-rose-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {/* Sorting Controls */}
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 border border-slate-100 rounded-2xl">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500">ترتيب حسب:</span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-slate-700 cursor-pointer"
          >
            <option value="date">التاريخ</option>
            <option value="receiverName">المستلم</option>
            <option value="amount">المبلغ</option>
          </select>
          <select 
            value={sortOrder} 
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-slate-700 cursor-pointer"
          >
            <option value="desc">الأحدث أولاً</option>
            <option value="asc">الأقدم أولاً</option>
          </select>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={handlePrintTable}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-slate-200 transition-colors"
            title="طباعة الجدول"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>
          
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-rose-50 text-rose-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-rose-100 transition-colors"
            title="تصدير إكسل"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير إكسل</span>
          </button>

          <label 
            className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-blue-100 transition-colors cursor-pointer"
            title="استيراد من إكسل"
          >
            <Upload className="w-4 h-4" />
            <span>استيراد إكسل</span>
            <input type="file" hidden accept=".xlsx, .xls" onChange={handleImportExcel} />
          </label>

          <button onClick={() => { setEditingItem(null); setFormData({}); setShowForm(true); }} className="bg-rose-600 text-white px-6 py-2.5 rounded-2xl font-black text-xs hover:bg-rose-700 transition-colors">إضافة صرف جديد</button>
        </div>
      </div>

      <div ref={tableRef} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto text-right">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100 font-black text-xs text-slate-400">
            <tr>
              <th className="px-6 py-4">المستلم</th>
              <th className="px-6 py-4">التاريخ</th>
              <th className="px-6 py-4">المبلغ/البيان</th>
              <th className="px-6 py-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d: any) => (
              <tr key={d.id} className="border-b border-slate-50 hover:bg-rose-50/20">
                <td className="px-6 py-4 font-bold text-sm text-slate-700">{d.receiverName}</td>
                <td className="px-6 py-4 text-xs font-medium text-slate-500 font-sans">{d.date}</td>
                <td className="px-6 py-4 font-black font-sans text-sm text-slate-800">{(Number(d.amount) || 0).toLocaleString()} ج.م</td>
                <td className="px-6 py-4 text-center">
                   <div className="flex items-center justify-center gap-2">
                     <button onClick={() => onPrint(d)} className="text-slate-400 p-2 hover:bg-slate-100 rounded-xl transition-all" title="طباعة الإيصال"><Printer className="w-4 h-4" /></button>
                     <button onClick={() => { setEditingItem(d); setFormData(d); setShowForm(true); }} className="text-emerald-600 p-2 hover:bg-emerald-50 rounded-xl transition-all"><Edit className="w-4 h-4" /></button>
                     <button onClick={() => setItemToDelete(d)} className="text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl">
              <h3 className="text-xl font-black mb-6 text-right text-rose-600">{editingItem ? 'تعديل صرف' : 'تسجيل صرف تبرعات'}</h3>
              <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="md:col-span-2 space-y-1 text-right">
                    <label className="text-sm font-bold pr-2">ربط مع تبرع وارد متاح (اختياري)</label>
                    <select className="w-full p-3 rounded-xl border border-slate-200" value={formData.incomingId || ''} onChange={(e) => {
                       const inc = incoming.find((i: any) => i.id === e.target.value);
                       if (inc) setFormData({ 
                         ...formData, 
                         incomingId: inc.id, 
                         amount: inc.amount || 0, 
                         quantity: inc.quantity || '', 
                         description: inc.description || inc.itemDescription || '' 
                       }); else setFormData({ ...formData, incomingId: undefined });
                    }}>
                      <option value="">صرف مباشر</option>
                      {incoming.filter((i: any) => i.status === 'available').map((i: any) => (
                        <option key={i.id} value={i.id}>{i.donorName} - {i.amount || i.quantity}</option>
                      ))}
                    </select>
                 </div>
                 <InputField label="اسم المستلم" value={formData.receiverName} onChange={(v: any) => setFormData({...formData, receiverName: v})} required />
                 <InputField label="التاريخ" type="date" value={formData.date} onChange={(v: any) => setFormData({...formData, date: v})} required />
                 <InputField label="المبلغ" type="number" value={formData.amount} onChange={(v: any) => setFormData({...formData, amount: Number(v)})} />
                 <InputField label="البيان" value={formData.description} onChange={(v: any) => setFormData({...formData, description: v})} required />
                 <div className="md:col-span-2 flex gap-2 pt-4">
                  <button type="submit" className="flex-1 bg-rose-600 text-white rounded-xl font-bold h-12">حفظ الصرف</button>
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-xl font-bold h-12">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!itemToDelete}
        title="تأكيد حذف الصرف"
        message={`هل أنت متأكد من حذف عملية الصرف هذه للمستلم "${itemToDelete?.receiverName}"؟`}
        onConfirm={() => {
          if (itemToDelete) {
            handleDelete(itemToDelete.id);
          }
        }}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};

const SponsorshipsTab = ({ sponsorships, selectedMonth, selectedYear }: any) => {
  const [showAddMonth, setShowAddMonth] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showRevenueForm, setShowRevenueForm] = useState(false);
  
  const [expenseData, setExpenseData] = useState<any>({ 
    description: '', 
    amount: 0, 
    receiverName: '', 
    date: new Date().toISOString().split('T')[0],
    attachments: []
  });
  const [revenueData, setRevenueData] = useState<any>({ 
    donorName: '', 
    amount: 0, 
    phone: '', 
    address: '',
    collectorName: '',
    isCollected: true 
  });
  const [editingRevenueIdx, setEditingRevenueIdx] = useState<number | null>(null);
  const [editingExpenseIdx, setEditingExpenseIdx] = useState<number | null>(null);
  const [collectorFilter, setCollectorFilter] = useState('');
  
  const [revSearch, setRevSearch] = useState('');
  const [expSearch, setExpSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [individualReceipt, setIndividualReceipt] = useState<any>(null);
  const [revenueToDelete, setRevenueToDelete] = useState<{ idx: number, name: string } | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<{ idx: number, desc: string } | null>(null);

  // Sorting state for Sponsorships (Revenues and Expenses)
  const [revSortBy, setRevSortBy] = useState<'donorName' | 'amount'>('donorName');
  const [revSortOrder, setRevSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expSortBy, setExpSortBy] = useState<'description' | 'amount' | 'date'>('date');
  const [expSortOrder, setExpSortOrder] = useState<'asc' | 'desc'>('desc');

  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const months_ar = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const currentMonthData = sponsorships.find((s: any) => s.month === selectedMonth && s.year === selectedYear);

  const handleAddMonth = async () => {
    // Find the chronologically preceding month data
    let prevM = selectedMonth - 1;
    let prevY = selectedYear;
    if (prevM === 0) {
      prevM = 12;
      prevY--;
    }
    
    // Search in local sponsorships state
    const prevMonthData = sponsorships.find((s: any) => s.month === prevM && s.year === prevY);
    
    // If not found chronologically, fall back to the most recent one overall
    const sorted = [...sponsorships].sort((a,b) => b.year-a.year || b.month-a.month);
    const source = prevMonthData || sorted[0];

    await addDoc(collection(db, 'monthly_sponsorships'), {
      month: selectedMonth, 
      year: selectedYear,
      revenues: source ? source.revenues.map((r: any) => ({ 
        ...r, 
        isCollected: false, 
        collectedAt: null 
      })) : [],
      expenses: [], 
      createdAt: serverTimestamp()
    });
    setShowAddMonth(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const storageRef = ref(storage, `sponsorships/expenses/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      setExpenseData((prev: any) => ({
        ...prev,
        attachments: [...(prev.attachments || []), { name: file.name, url }]
      }));
    } catch (error) {
      console.error("Upload error:", error);
      alert("حدث خطأ أثناء رفع الملف");
    } finally {
      setUploading(false);
    }
  };

  const handleAddExpense = async (e: any) => {
    e.preventDefault();
    if (!currentMonthData) return;
    let expenses = [...(currentMonthData.expenses || [])];
    const data = { ...expenseData };
    delete (data as any).originalIndex;

    if (editingExpenseIdx !== null) {
      expenses[editingExpenseIdx] = data;
    } else {
      expenses.push(data);
    }
    await updateDoc(doc(db, 'monthly_sponsorships', currentMonthData.id), { 
      expenses, 
      updatedAt: serverTimestamp() 
    });
    setShowExpenseForm(false);
    setEditingExpenseIdx(null);
    setExpenseData({ 
      description: '', 
      amount: 0, 
      receiverName: '', 
      date: new Date().toISOString().split('T')[0],
      attachments: [] 
    });
  };

  const handleAddRevenue = async (e: any) => {
    e.preventDefault();
    if (!currentMonthData) return;
    let revenues = [...(currentMonthData.revenues || [])];
    const data = { ...revenueData, collectedAt: (revenueData.isCollected && !revenueData.collectedAt) ? new Date().toISOString() : revenueData.collectedAt };
    
    // Clean data from internal UI flags before saving
    delete data.originalIndex;

    if (editingRevenueIdx !== null) {
      revenues[editingRevenueIdx] = data;
    } else {
      revenues.push(data);
    }
    await updateDoc(doc(db, 'monthly_sponsorships', currentMonthData.id), { 
      revenues, 
      updatedAt: serverTimestamp() 
    });
    setShowRevenueForm(false);
    setEditingRevenueIdx(null);
    setRevenueData({ 
      donorName: '', 
      amount: 0, 
      phone: '', 
      address: '',
      collectorName: '',
      isCollected: true 
    });
  };

  const handleDeleteRevenue = async (idx: number) => {
    if (!currentMonthData) return;
    const revenues = currentMonthData.revenues.filter((_: any, i: number) => i !== idx);
    await updateDoc(doc(db, 'monthly_sponsorships', currentMonthData.id), { revenues, updatedAt: serverTimestamp() });
    setRevenueToDelete(null);
  };

  const handleDeleteExpense = async (idx: number) => {
    if (!currentMonthData) return;
    const expenses = currentMonthData.expenses.filter((_: any, i: number) => i !== idx);
    await updateDoc(doc(db, 'monthly_sponsorships', currentMonthData.id), { expenses, updatedAt: serverTimestamp() });
    setExpenseToDelete(null);
  };

  const toggleCollection = async (idx: number) => {
    if (!currentMonthData) return;
    const revs = [...currentMonthData.revenues];
    revs[idx].isCollected = !revs[idx].isCollected;
    revs[idx].collectedAt = revs[idx].isCollected ? new Date().toISOString() : null;
    await updateDoc(doc(db, 'monthly_sponsorships', currentMonthData.id), { 
      revenues: revs, 
      updatedAt: serverTimestamp() 
    });
  };

  const syncWithPreviousMonth = async () => {
    if (!currentMonthData) return;
    
    let prevM = selectedMonth - 1;
    let prevY = selectedYear;
    if (prevM === 0) {
      prevM = 12;
      prevY--;
    }
    
    const prevMonthData = sponsorships.find((s: any) => s.month === prevM && s.year === prevY);
    if (!prevMonthData) {
      console.warn("No previous month found to sync from.");
      return;
    }

    const currentNames = new Set(currentMonthData.revenues.map((r: any) => r.donorName));
    const missingSponsors = prevMonthData.revenues
      .filter((r: any) => !currentNames.has(r.donorName))
      .map((r: any) => ({ ...r, isCollected: false, collectedAt: null }));

    if (missingSponsors.length === 0) {
      console.log("All sponsors are already present.");
      return;
    }

    const merged = [...currentMonthData.revenues, ...missingSponsors];
    await updateDoc(doc(db, 'monthly_sponsorships', currentMonthData.id), {
      revenues: merged,
      updatedAt: serverTimestamp()
    });
  };

  const totalIncome = currentMonthData?.revenues?.reduce((s: number, r: any) => s + (r.isCollected ? Number(r.amount) : 0), 0) || 0;
  const totalExpense = currentMonthData?.expenses?.reduce((s: number, e: any) => s + Number(e.amount), 0) || 0;
  const balance = totalIncome - totalExpense;

  const chartData = [
    { name: 'الإيرادات المحصلة', value: totalIncome, color: '#10b981' },
    { name: 'المصروفات', value: totalExpense, color: '#ef4444' },
  ];

  const downloadReport = async () => {
    if (!reportRef.current) return;
    try {
      const canvas = await html2canvas(reportRef.current, { 
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`sponsorship_report_${months_ar[selectedMonth-1]}_${selectedYear}.pdf`);
    } catch (err) {
      console.error('Report Generation Error:', err);
    }
  };

  const exportToExcel = () => {
    if (!currentMonthData) return;
    
    const revenues = currentMonthData.revenues.map((r: any) => ({
      'اسم الكفيل': r.donorName,
      'رقم التليفون': r.phone,
      'العنوان': r.address,
      'المبلغ': r.amount,
      'الحالة': r.isCollected ? 'تم التحصيل' : 'انتظار'
    }));
    
    const expenses = currentMonthData.expenses.map((e: any) => ({
      'البيان': e.description,
      'المبلغ': e.amount,
      'المستلم': e.receiverName,
      'التاريخ': e.date
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(revenues);
    const ws2 = XLSX.utils.json_to_sheet(expenses);
    
    XLSX.utils.book_append_sheet(wb, ws1, "الإيرادات");
    XLSX.utils.book_append_sheet(wb, ws2, "المصروفات");
    
    XLSX.writeFile(wb, `كفالات_${months_ar[selectedMonth-1]}_${selectedYear}.xlsx`);
  };

  const importFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentMonthData) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data: any[] = XLSX.utils.sheet_to_json(ws);

      const newRevenues = data.map(item => ({
        donorName: item['اسم الكفيل'] || item['الاسم'],
        phone: item['رقم التليفون'] || item['الموبايل'] || '',
        address: item['العنوان'] || '',
        amount: Number(item['المبلغ']) || 0,
        isCollected: false
      }));

      const merged = [...(currentMonthData.revenues || []), ...newRevenues];
      await updateDoc(doc(db, 'monthly_sponsorships', currentMonthData.id), { 
        revenues: merged, 
        updatedAt: serverTimestamp() 
      });
      alert('تم استيراد البيانات بنجاح');
    };
    reader.readAsBinaryString(file);
  };

  const rawFilteredRevenues = currentMonthData?.revenues
    ?.map((r: any, originalIndex: number) => ({ ...r, originalIndex }))
    ?.filter((r: any) => 
      ((r.donorName || '').includes(revSearch) || (r.phone || '').includes(revSearch)) &&
      (collectorFilter === '' || r.collectorName === collectorFilter)
    ) || [];

  const filteredRevenues = [...rawFilteredRevenues].sort((a, b) => {
    let comp = 0;
    if (revSortBy === 'donorName') {
      comp = (a.donorName || '').localeCompare(b.donorName || '');
    } else if (revSortBy === 'amount') {
      comp = (a.amount || 0) - (b.amount || 0);
    }
    return revSortOrder === 'asc' ? comp : -comp;
  });

  const rawFilteredExpenses = currentMonthData?.expenses
    ?.map((e: any, originalIndex: number) => ({ ...e, originalIndex }))
    ?.filter((e: any) => 
      (e.description || '').includes(expSearch) || (e.receiverName || '').includes(expSearch)
    ) || [];

  const filteredExpenses = [...rawFilteredExpenses].sort((a, b) => {
    let comp = 0;
    if (expSortBy === 'description') {
      comp = (a.description || '').localeCompare(b.description || '');
    } else if (expSortBy === 'amount') {
      comp = (a.amount || 0) - (b.amount || 0);
    } else if (expSortBy === 'date') {
      comp = (a.date || '').localeCompare(b.date || '');
    }
    return expSortOrder === 'asc' ? comp : -comp;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-emerald-600" />
          <h3 className="text-xl font-black text-slate-800">بيانات شهر {months_ar[selectedMonth-1]} {selectedYear}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentMonthData && (
            <div className="flex gap-2">
              <button onClick={downloadReport} className="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-900 transition-colors">
                <Printer className="w-4 h-4" />
                طباعة التقرير
              </button>
              <button onClick={exportToExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors">
                <FileSpreadsheet className="w-4 h-4" />
                تصدير إكسل
              </button>
              <label className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                استيراد إكسل
                <input type="file" hidden accept=".xlsx, .xls" onChange={importFromExcel} />
              </label>
            </div>
          )}
        </div>
        {!currentMonthData && <button onClick={() => setShowAddMonth(true)} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold shadow-md shadow-emerald-100">تهيئة بيانات الشهر</button>}
      </div>

      {!currentMonthData ? (
        <div className="h-96 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-100 space-y-4">
          <Clock className="w-16 h-16 opacity-20" />
          <p className="font-bold text-lg">لم يتم تهيئة بيانات لشهر {months_ar[selectedMonth-1]} {selectedYear}</p>
        </div>
      ) : (
        <div ref={reportRef} className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10"><ArrowUpCircle className="w-12 h-12 text-emerald-600" /></div>
               <p className="text-emerald-600 font-bold mb-1">إجمالي الإيرادات المحصلة</p>
               <h4 className="text-2xl font-black text-slate-800">{totalIncome.toLocaleString()} ج.م</h4>
            </motion.div>
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-3xl border border-rose-100 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10"><ArrowDownCircle className="w-12 h-12 text-rose-600" /></div>
               <p className="text-rose-600 font-bold mb-1">إجمالي المصروفات</p>
               <h4 className="text-2xl font-black text-slate-800">{totalExpense.toLocaleString()} ج.م</h4>
            </motion.div>
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-3xl border border-blue-100 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10"><Calculator className="w-12 h-12 text-blue-600" /></div>
               <p className="text-blue-600 font-bold mb-1">المتبقي (الصافي)</p>
               <h4 className="text-2xl font-black text-slate-800">{balance.toLocaleString()} ج.م</h4>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-50 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="font-black text-slate-800">بيان الإيرادات والمجموع</h3>
                    <div className="relative w-48">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input 
                        type="text" 
                        placeholder="بحث في الكفلاء..." 
                        className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-100 text-xs focus:border-emerald-500 outline-none"
                        value={revSearch}
                        onChange={(e) => setRevSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 min-w-[130px]">
                      <Filter className="w-3 h-3 text-slate-400" />
                      <select 
                        className="bg-transparent border-none outline-none text-xs font-bold text-slate-600 w-full"
                        value={collectorFilter}
                        onChange={(e) => setCollectorFilter(e.target.value)}
                      >
                        <option value="">جميع المحصلين</option>
                        {Array.from(new Set(currentMonthData.revenues.map((r: any) => r.collectorName).filter(Boolean))).map((name: any) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sorting selectors */}
                    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded-xl border border-slate-100">
                      <select 
                        className="bg-transparent border-none outline-none text-xs font-bold text-slate-600 outline-none"
                        value={revSortBy}
                        onChange={(e) => setRevSortBy(e.target.value as any)}
                        title="ترتيب حسب"
                      >
                        <option value="donorName">الاسم</option>
                        <option value="amount">المبلغ</option>
                      </select>
                      <select 
                        className="bg-transparent border-none outline-none text-xs font-bold text-slate-600 outline-none"
                        value={revSortOrder}
                        onChange={(e) => setRevSortOrder(e.target.value as any)}
                        title="اتجاه الترتيب"
                      >
                        <option value="asc">تصاعدي</option>
                        <option value="desc">تنازلي</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={syncWithPreviousMonth} className="text-blue-600 hover:bg-blue-50 p-2 rounded-xl transition-all" title="مزامنة الكفلاء من الشهر السابق">
                      <Clock className="w-5 h-5" />
                    </button>
                    <button onClick={() => setShowRevenueForm(true)} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-xl transition-all">
                      <PlusCircle className="w-6 h-6" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[1000px]">
                  {Array.from(new Set(filteredRevenues.map(r => r.collectorName || 'بدون محصل'))).map(collector => (
                    <div key={collector} className="mb-8 last:mb-0">
                      <div className="bg-slate-50 px-6 py-2 border-y border-slate-100 flex items-center justify-between">
                        <span className="font-black text-slate-600 text-xs">المحصل: {collector}</span>
                        <span className="text-[10px] font-bold text-slate-400">
                           {filteredRevenues.filter(r => (r.collectorName || 'بدون محصل') === collector).length} كفيل
                        </span>
                      </div>
                      <table className="w-full text-right">
                        <tbody className="divide-y divide-slate-50">
                          {filteredRevenues.filter(r => (r.collectorName || 'بدون محصل') === collector).map((r: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-bold text-slate-700 w-1/3">
                                {r.donorName}
                                {r.address && <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {r.address}</div>}
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-500 font-sans">{r.phone || '---'}</td>
                              <td className="px-6 py-4 font-black text-emerald-600">{r.amount?.toLocaleString()} ج.م</td>
                              <td className="px-6 py-4 text-center">
                                <button 
                                  onClick={() => toggleCollection(r.originalIndex)} 
                                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all ${r.isCollected ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                  {r.isCollected ? 'تم التحصيل' : 'في الانتظار'}
                                </button>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => { setEditingRevenueIdx(r.originalIndex); setRevenueData(r); setShowRevenueForm(true); }} className="text-slate-400 p-2 hover:bg-slate-100 rounded-xl">
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setRevenueToDelete({ idx: r.originalIndex, name: r.donorName })} className="text-rose-400 p-2 hover:bg-rose-50 rounded-xl">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {filteredRevenues.length === 0 && (
                    <div className="px-6 py-10 text-center text-slate-400 font-medium">لا توجد نتائج بحث</div>
                  )}
                </div>
             </div>

             <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-fit">
                <h3 className="text-xl font-black mb-8 text-right flex items-center gap-2 justify-end">
                  التحليل المالي للكفالات
                  <PieChart className="w-5 h-5 text-emerald-600" />
                </h3>
                <div className="h-64">
                   <ResponsiveContainer width="100%" height="100%">
                      <ReChartsPieChart>
                         <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                            {chartData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                         </Pie>
                         <Tooltip />
                         <Legend />
                      </ReChartsPieChart>
                   </ResponsiveContainer>
                </div>
                <div className="mt-8 space-y-4">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-slate-400">نسبة التحصيل</span>
                    <span className="text-emerald-600">
                      {currentMonthData.revenues.length > 0 
                        ? (Math.round((currentMonthData.revenues.filter((r: any) => r.isCollected).length / currentMonthData.revenues.length) * 100)) 
                        : 0}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500" 
                      style={{ width: `${currentMonthData.revenues.length > 0 ? (currentMonthData.revenues.filter((r: any) => r.isCollected).length / currentMonthData.revenues.length) * 100 : 0}%` }} 
                    />
                  </div>
                </div>
             </div>

             <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-right">
                <div className="p-6 border-b border-slate-50 flex flex-wrap justify-between items-center gap-4">
                   <div className="flex items-center gap-4">
                    <h3 className="font-black text-slate-800">بيان المصروفات المنفذة</h3>
                    <div className="relative w-64">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input 
                        type="text" 
                        placeholder="بحث في المصروفات..." 
                        className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-100 text-xs focus:border-emerald-500 outline-none"
                        value={expSearch}
                        onChange={(e) => setExpSearch(e.target.value)}
                      />
                    </div>
                  </div>
                   <button onClick={() => setShowExpenseForm(true)} className="text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all">
                    <PlusCircle className="w-6 h-6" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-400 uppercase font-black">
                      <tr>
                        <th className="px-6 py-4">البيان / الوصف</th>
                        <th className="px-6 py-4">اسم المستلم</th>
                        <th className="px-6 py-4">التاريخ</th>
                        <th className="px-6 py-4">المبلغ</th>
                        <th className="px-6 py-4 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredExpenses.map((e: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-700">
                            {e.description}
                            {e.attachments?.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {e.attachments.map((att: any, idx: number) => (
                                  <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="text-[9px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 hover:bg-slate-200">مرفق {idx+1}</a>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-500">{e.receiverName}</td>
                          <td className="px-6 py-4 font-medium text-slate-400 font-sans">{e.date}</td>
                          <td className="px-6 py-4 font-black text-rose-600">{Number(e.amount).toLocaleString()} ج.م</td>
                          <td className="px-6 py-4 text-center">
                             <div className="flex items-center justify-center gap-2">
                               <button onClick={() => setIndividualReceipt({...e, type: 'expense'})} className="text-slate-400 p-2 hover:bg-slate-100 rounded-xl">
                                <Printer className="w-4 h-4" />
                               </button>
                               <button onClick={() => { setEditingExpenseIdx(e.originalIndex); setExpenseData(e); setShowExpenseForm(true); }} className="text-slate-400 p-2 hover:bg-slate-100 rounded-xl">
                                <Edit className="w-4 h-4" />
                               </button>
                               <button onClick={() => setExpenseToDelete({ idx: e.originalIndex, desc: e.description })} className="text-rose-400 p-2 hover:bg-rose-50 rounded-xl">
                                <Trash2 className="w-4 h-4" />
                               </button>
                             </div>
                          </td>
                        </tr>
                      ))}
                      {filteredExpenses.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-medium">لا توجد مصروفات مسجلة</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showAddMonth && (
           <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center">
               <Calendar className="w-16 h-16 text-emerald-500 mx-auto mb-6 bg-emerald-50 p-4 rounded-3xl" />
               <h3 className="text-xl font-black mb-4">تهيئة بيانات شهر {months_ar[selectedMonth-1]}؟</h3>
               <p className="text-slate-500 mb-8 text-sm leading-relaxed">سيتم نسخ أسماء الكفلاء من الشهر السابق تلقائياً لتسهيل عملية التحصيل.</p>
               <div className="flex gap-2">
                 <button onClick={handleAddMonth} className="flex-1 bg-emerald-600 text-white rounded-2xl font-bold h-12 shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors">نعم، تهيئة</button>
                 <button onClick={() => setShowAddMonth(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-2xl font-bold h-12 hover:bg-slate-200 transition-colors">إلغاء</button>
               </div>
             </motion.div>
           </div>
        )}

        {showExpenseForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                <h3 className="text-xl font-black mb-6 text-right">إضافة مصروف كفالة</h3>
                <form onSubmit={handleAddExpense} className="space-y-4">
                  <InputField label="البيان" value={expenseData.description} onChange={(v: any) => setExpenseData({...expenseData, description: v})} required />
                  <InputField label="اسم المستلم" value={expenseData.receiverName} onChange={(v: any) => setExpenseData({...expenseData, receiverName: v})} required />
                  <InputField label="التاريخ" type="date" value={expenseData.date} onChange={(v: any) => setExpenseData({...expenseData, date: v})} required />
                  <InputField label="المبلغ" type="number" value={expenseData.amount} onChange={(v: any) => setExpenseData({...expenseData, amount: Number(v)})} required />
                  
                  <div className="space-y-2">
                    <label className="block text-slate-700 font-bold pr-2 text-right">المرفقات (إيصالات)</label>
                    <div className="flex flex-wrap gap-2">
                      {expenseData.attachments?.map((att: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600">
                          <FileText className="w-3 h-3" />
                          <span className="truncate max-w-[100px]">{att.name}</span>
                          <button type="button" onClick={() => setExpenseData({...expenseData, attachments: expenseData.attachments.filter((_: any, idx: number) => idx !== i)})} className="text-rose-500">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 border-2 border-dashed border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:border-emerald-500 hover:text-emerald-600 transition-all"
                      >
                        {uploading ? <Clock className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
                        رفع ملف
                      </button>
                      <input type="file" hidden ref={fileInputRef} onChange={handleFileUpload} />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button type="submit" className="flex-1 bg-rose-600 text-white rounded-2xl font-bold h-12 shadow-lg shadow-rose-100 hover:bg-rose-700">إضافة</button>
                    <button type="button" onClick={() => setShowExpenseForm(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-2xl font-bold h-12 hover:bg-slate-200">إلغاء</button>
                  </div>
                </form>
             </motion.div>
          </div>
        )}

        {showRevenueForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                <h3 className="text-xl font-black mb-6 text-right">{editingRevenueIdx !== null ? 'تعديل إيراد كفالة' : 'إضافة إيراد كفالة (كفيل جديد)'}</h3>
                <form onSubmit={handleAddRevenue} className="space-y-4">
                  <InputField label="اسم الكفيل / المتبرع" value={revenueData.donorName} onChange={(v: any) => setRevenueData({...revenueData, donorName: v})} required />
                  <InputField label="رقم الهاتف" value={revenueData.phone} onChange={(v: any) => setRevenueData({...revenueData, phone: v})} />
                  <InputField label="العنوان" value={revenueData.address} onChange={(v: any) => setRevenueData({...revenueData, address: v})} />
                  <InputField label="اسم المحصل" value={revenueData.collectorName} onChange={(v: any) => setRevenueData({...revenueData, collectorName: v})} />
                  <InputField label="المبلغ" type="number" value={revenueData.amount} onChange={(v: any) => setRevenueData({...revenueData, amount: Number(v)})} required />
                  
                  <div className="flex items-center gap-2 justify-end p-2 bg-slate-50 rounded-2xl">
                    <label className="text-sm font-bold text-slate-600 cursor-pointer select-none" htmlFor="collected">تم تحصيل هذا الشهر؟</label>
                    <input 
                      type="checkbox" 
                      id="collected"
                      className="w-5 h-5 rounded-lg border-slate-200 accent-emerald-600 cursor-pointer"
                      checked={revenueData.isCollected}
                      onChange={(e) => setRevenueData({...revenueData, isCollected: e.target.checked})}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button type="submit" className="flex-1 bg-emerald-600 text-white rounded-2xl font-bold h-12 shadow-lg shadow-emerald-100 hover:bg-emerald-700">تأكيد الإضافة</button>
                    <button type="button" onClick={() => setShowRevenueForm(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-2xl font-bold h-12 hover:bg-slate-200">إلغاء</button>
                  </div>
                </form>
             </motion.div>
          </div>
        )}

        {individualReceipt && (
          <ReceiptModal 
            data={individualReceipt} 
            onClose={() => setIndividualReceipt(null)} 
          />
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!revenueToDelete}
        title="تأكيد حذف الكفيل"
        message={`هل أنت متأكد من حذف الكفيل "${revenueToDelete?.name}"؟ سيؤدي هذا لحذف هذه الكفالة نهائياً.`}
        onConfirm={() => {
          if (revenueToDelete) {
            handleDeleteRevenue(revenueToDelete.idx);
          }
        }}
        onCancel={() => setRevenueToDelete(null)}
      />

      <ConfirmModal 
        isOpen={!!expenseToDelete}
        title="تأكيد حذف المصروف"
        message={`هل أنت متأكد من حذف المصروف "${expenseToDelete?.desc}"؟`}
        onConfirm={() => {
          if (expenseToDelete) {
            handleDeleteExpense(expenseToDelete.idx);
          }
        }}
        onCancel={() => setExpenseToDelete(null)}
      />
    </div>
  );
};

const AccountsTab = ({ accounts, selectedMonth, selectedYear }: any) => {
  const [viewingAccount, setViewingAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [accountFormData, setAccountFormData] = useState<any>({ name: '', description: '', balance: 0, type: 'income', initialTxDescription: 'رصيد افتتاحي' });
  const [txFormData, setTxFormData] = useState<any>({ type: 'income', date: new Date().toISOString().split('T')[0], amount: 0, description: '' });
  const [editingTx, setEditingTx] = useState<any>(null);
  const [txSearchTerm, setTxSearchTerm] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [printingTx, setPrintingTx] = useState<any>(null);
  const [accountToDelete, setAccountToDelete] = useState<any>(null);
  const [txToDelete, setTxToDelete] = useState<any>(null);

  // Sorting state for transactions
  const [sortBy, setSortBy] = useState<'date' | 'description' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewingAccount) {
      const q = query(
        collection(db, 'account_transactions'),
        where('accountId', '==', viewingAccount.id),
        orderBy('date', 'desc')
      );
      const unsub = onSnapshot(q, (snap) => {
        const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Filter by month/year matching the main selector
        const filtered = all.filter((d: any) => {
          const dDate = new Date(d.date);
          return (dDate.getMonth() + 1) === selectedMonth && dDate.getFullYear() === selectedYear;
        });
        setTransactions(filtered);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'account_transactions'));
      return unsub;
    }
  }, [viewingAccount, selectedMonth, selectedYear]);

  const handleAddAccount = async (e: any) => {
    e.preventDefault();
    try {
      if (accountFormData.id) {
        await updateDoc(doc(db, 'financial_accounts', accountFormData.id), {
          name: accountFormData.name,
          description: accountFormData.description,
          type: accountFormData.type,
          balance: accountFormData.balance,
          updatedAt: serverTimestamp()
        });
      } else {
        const docRef = await addDoc(collection(db, 'financial_accounts'), {
          name: accountFormData.name,
          description: accountFormData.description,
          balance: accountFormData.balance,
          type: accountFormData.type,
          createdAt: serverTimestamp()
        });

        if (accountFormData.balance !== 0) {
          await addDoc(collection(db, 'account_transactions'), {
            accountId: docRef.id,
            type: accountFormData.balance > 0 ? 'income' : 'expense',
            amount: Math.abs(accountFormData.balance),
            description: accountFormData.initialTxDescription || 'رصيد افتتاحي',
            date: new Date().toISOString().split('T')[0],
            month: selectedMonth,
            year: selectedYear,
            createdAt: serverTimestamp()
          });
        }
      }
      setShowAddAccount(false);
      setAccountFormData({ name: '', description: '', balance: 0, type: 'income', initialTxDescription: 'رصيد افتتاحي' });
    } catch (err) { console.error(err); }
  };

  const handleSaveTx = async (e: any) => {
    e.preventDefault();
    if (!viewingAccount) return;
    try {
      const dataToSave = {
        ...txFormData,
        accountId: viewingAccount.id,
        month: selectedMonth,
        year: selectedYear,
        updatedAt: serverTimestamp()
      };

      if (editingTx) {
        // Adjust balance: remove old effect, add new effect
        const oldDiff = editingTx.type === 'income' ? editingTx.amount : -editingTx.amount;
        const newDiff = dataToSave.type === 'income' ? dataToSave.amount : -dataToSave.amount;
        const balanceChange = newDiff - oldDiff;

        await updateDoc(doc(db, 'account_transactions', editingTx.id), dataToSave);
        await updateDoc(doc(db, 'financial_accounts', viewingAccount.id), {
          balance: (viewingAccount.balance || 0) + balanceChange
        });
      } else {
        await addDoc(collection(db, 'account_transactions'), {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
        const balanceChange = dataToSave.type === 'income' ? dataToSave.amount : -dataToSave.amount;
        await updateDoc(doc(db, 'financial_accounts', viewingAccount.id), {
          balance: (viewingAccount.balance || 0) + balanceChange
        });
      }
      setShowTxForm(false);
      setEditingTx(null);
      setTxFormData({ type: 'income', date: new Date().toISOString().split('T')[0], amount: 0, description: '' });
    } catch (err) { console.error(err); }
  };

  const handleDeleteTx = async (tx: any) => {
    try {
      await deleteDoc(doc(db, 'account_transactions', tx.id));
      await logSystemAction('delete', 'account_transactions', tx.id, tx, `حذف حركة من خزينة ${viewingAccount?.name || 'مجهول'}: ${tx.description}`);
      const balanceChange = tx.type === 'income' ? -tx.amount : tx.amount;
      await updateDoc(doc(db, 'financial_accounts', viewingAccount.id), {
        balance: (viewingAccount.balance || 0) + balanceChange
      });
      setTxToDelete(null);
    } catch (err) { console.error(err); }
  };

  const filteredTxs = transactions.filter(t => {
    const matchesSearch = (t.description || '').includes(txSearchTerm) || (t.receiverName || '').includes(txSearchTerm);
    const matchesType = txTypeFilter === 'all' || t.type === txTypeFilter;
    return matchesSearch && matchesType;
  });

  const sortedTxs = [...filteredTxs].sort((a, b) => {
    let comp = 0;
    if (sortBy === 'date') {
      comp = (a.date || '').localeCompare(b.date || '');
    } else if (sortBy === 'description') {
      comp = (a.description || '').localeCompare(b.description || '');
    } else if (sortBy === 'amount') {
      comp = (a.amount || 0) - (b.amount || 0);
    }
    return sortOrder === 'asc' ? comp : -comp;
  });

  const totalIncome = filteredTxs.filter((t: any) => t.type === 'income').reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
  const totalExpense = filteredTxs.filter((t: any) => t.type === 'expense').reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
  const netRemaining = totalIncome - totalExpense;

  const handleExportExcel = () => {
    const dataToExport = sortedTxs.map((t: any, index: number) => ({
      'م': index + 1,
      'التاريخ': t.date,
      'البيان / الوصف': t.description,
      'المستلم / المصدر': t.receiverName || t.sourceName || 'غير مسجل',
      'نوع المعاملة': t.type === 'income' ? 'إيراد' : 'مصروف',
      'المبلغ': t.amount
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'كشف معاملات الخزينة');
    XLSX.writeFile(workbook, `كشف_معاملات_خزينة_${viewingAccount.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        let count = 0;
        let cumulativeBalanceChange = 0;

        for (const item of data) {
          const description = item['البيان'] || item['البيان / الوصف'] || item['description'] || 'معاملة مستوردة';
          const typeStr = item['نوع المعاملة'] || item['نوع'] || item['type'] || 'income';
          const type = (typeStr === 'مصروف' || typeStr === 'expense' || typeStr === 'منصرف') ? 'expense' : 'income';
          const amount = Math.abs(Number(item['المبلغ'] || item['المبلغ_الإجمالي'] || item['amount'] || 0));
          if (amount === 0) continue;

          const date = item['التاريخ'] || item['date'] || new Date().toISOString().split('T')[0];
          const receiverName = item['المستلم / المصدر'] || item['المستلم'] || item['المصدر'] || item['receiverName'] || '';

          await addDoc(collection(db, 'account_transactions'), {
            accountId: viewingAccount.id,
            description,
            type,
            amount,
            date,
            receiverName,
            month: selectedMonth,
            year: selectedYear,
            createdAt: serverTimestamp()
          });

          const balanceChange = type === 'income' ? amount : -amount;
          cumulativeBalanceChange += balanceChange;
          count++;
        }

        // Update the main account balance
        await updateDoc(doc(db, 'financial_accounts', viewingAccount.id), {
          balance: (viewingAccount.balance || 0) + cumulativeBalanceChange
        });

        alert(`تم استيراد ${count} معاملة مضافة بنجاح وتحديث رصيد الحساب`);
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء استيراد البيانات، تأكد من صحة الأعمدة لملف الإكسل');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePrintTransactions = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`كشف_معاملات_خزينة_${viewingAccount.name}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  if (viewingAccount) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center gap-4">
             <button onClick={() => setViewingAccount(null)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors">
               <X className="w-5 h-5" />
             </button>
             <div>
               <h3 className="text-xl font-black text-slate-800">{viewingAccount.name}</h3>
               <p className="text-slate-400 text-sm">{viewingAccount.description}</p>
             </div>
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-slate-400">الرصيد الحالي</p>
            <p className="text-2xl font-black text-emerald-600 tabular-nums">{viewingAccount.balance?.toLocaleString()} ج.م</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <h4 className="font-black mb-4 text-slate-700">إضافة معاملة</h4>
              <button 
                onClick={() => { setTxFormData({ type: 'income', date: new Date().toISOString().split('T')[0], amount: 0, description: '' }); setEditingTx(null); setShowTxForm(true); }}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-2xl font-bold mb-3 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
              >
                <ArrowUpCircle className="w-5 h-5" /> تبرع وارد جديد
              </button>
              <button 
                onClick={() => { setTxFormData({ type: 'expense', date: new Date().toISOString().split('T')[0], amount: 0, description: '' }); setEditingTx(null); setShowTxForm(true); }}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white py-3 rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
              >
                <ArrowDownCircle className="w-5 h-5" /> صرف مالي جديد
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
               <h4 className="font-black mb-4 text-slate-700">تصفية وترتيب</h4>
               <div className="space-y-4">
                 <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                     type="text" 
                     placeholder="بحث في البيان..." 
                     className="w-full pr-10 pl-3 py-2 bg-slate-50 rounded-xl border border-slate-100 text-xs focus:bg-white outline-none"
                     value={txSearchTerm}
                     onChange={(e) => setTxSearchTerm(e.target.value)}
                    />
                 </div>
                 <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setTxTypeFilter('all')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${txTypeFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400'}`}>الكل</button>
                    <button onClick={() => setTxTypeFilter('income')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${txTypeFilter === 'income' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>وارد</button>
                    <button onClick={() => setTxTypeFilter('expense')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${txTypeFilter === 'expense' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400'}`}>منصرف</button>
                 </div>

                 {/* Sorting selects */}
                 <div className="space-y-2 pt-2 border-t border-slate-100">
                   <div className="flex items-center justify-between text-xs">
                     <span className="font-bold text-slate-400">ترتيب بالعمود:</span>
                     <select 
                       className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-slate-700 outline-none"
                       value={sortBy}
                       onChange={(e) => setSortBy(e.target.value as any)}
                     >
                       <option value="date">التاريخ</option>
                       <option value="description">البيان / الوصف</option>
                       <option value="amount">المبلغ</option>
                     </select>
                   </div>
                   <div className="flex items-center justify-between text-xs">
                     <span className="font-bold text-slate-400">الاتجاه:</span>
                     <select 
                       className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-slate-700 outline-none"
                       value={sortOrder}
                       onChange={(e) => setSortOrder(e.target.value as any)}
                     >
                       <option value="desc">تنازلي</option>
                       <option value="asc">تصاعدي</option>
                     </select>
                   </div>
                 </div>

                 {/* Utilities bar */}
                 <div className="flex gap-2 pt-2 border-t border-slate-100">
                   <button 
                     onClick={handlePrintTransactions}
                     className="flex-1 flex items-center justify-center gap-1 bg-slate-100 text-slate-700 py-2 rounded-xl text-xs font-black hover:bg-slate-200"
                     title="طباعة المعاملات"
                   >
                     <Printer className="w-3.5 h-3.5" />
                     <span>طباعة</span>
                   </button>
                   <button 
                     onClick={handleExportExcel}
                     className="flex-1 flex items-center justify-center gap-1 bg-emerald-50 text-emerald-700 py-2 rounded-xl text-xs font-black hover:bg-emerald-100"
                     title="تصدير إكسل"
                   >
                     <FileSpreadsheet className="w-3.5 h-3.5" />
                     <span>تصدير</span>
                   </button>
                   <label 
                     className="flex-1 flex items-center justify-center gap-1 bg-blue-50 text-blue-700 py-2 rounded-xl text-xs font-black hover:bg-blue-100 cursor-pointer text-center"
                     title="استيراد إكسل"
                   >
                     <Upload className="w-3.5 h-3.5" />
                     <span>استيراد</span>
                     <input type="file" hidden accept=".xlsx, .xls" onChange={handleImportExcel} />
                   </label>
                 </div>
               </div>
            </div>
          </div>

          <div className="lg:col-span-3">
             <div ref={tableRef} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black">
                    <tr>
                      <th className="px-6 py-4">التاريخ</th>
                      <th className="px-6 py-4">البيان</th>
                      <th className="px-6 py-4">المستلم/المصدر</th>
                      <th className="px-6 py-4">النوع</th>
                      <th className="px-6 py-4">المبلغ</th>
                      <th className="px-6 py-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedTxs.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-sans text-slate-500">{tx.date}</td>
                        <td className="px-6 py-4 font-bold text-slate-800">{tx.description}</td>
                        <td className="px-6 py-4 text-slate-600">{tx.receiverName || tx.sourceName || '---'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
                            tx.type === 'income' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${tx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {tx.type === 'income' ? 'وارد' : 'منصرف'}
                          </span>
                        </td>
                        <td className={`px-6 py-4 font-black ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'income' ? '+' : '-'} {tx.amount.toLocaleString()} ج.م
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center justify-center gap-2">
                             <button onClick={() => setPrintingTx(tx)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><Printer className="w-4 h-4" /></button>
                             <button onClick={() => { setTxFormData(tx); setEditingTx(tx); setShowTxForm(true); }} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl"><Edit className="w-4 h-4" /></button>
                             <button onClick={() => setTxToDelete(tx)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                           </div>
                        </td>
                      </tr>
                    ))}
                    {sortedTxs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">لا توجد معاملات مسجلة لهذا الشهر</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* --- Summary Footer displaying Remaining, Total Income and Total Expenses --- */}
                <div className="bg-slate-50 p-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-400 mb-1">إجمالي الوارد</p>
                    <p className="text-xl font-black text-emerald-600 tabular-nums">+{totalIncome.toLocaleString()} ج.م</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-400 mb-1">إجمالي المنصرف</p>
                    <p className="text-xl font-black text-rose-600 tabular-nums">-{totalExpense.toLocaleString()} ج.م</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-400 mb-1">المبلغ المتبقي</p>
                    <p className={`text-xl font-black tabular-nums ${netRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {netRemaining.toLocaleString()} ج.م
                    </p>
                  </div>
                </div>
             </div>
          </div>
        </div>

        <AnimatePresence>
          {showTxForm && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl">
                  <h3 className={`text-xl font-black mb-6 text-right ${txFormData.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {txFormData.type === 'income' ? 'تسجيل وارد مالي' : 'تسجيل مصروف مالي'}
                  </h3>
                  <form onSubmit={handleSaveTx} className="space-y-4">
                    <InputField label="التاريخ" type="date" value={txFormData.date} onChange={(v: any) => setTxFormData({...txFormData, date: v})} required />
                    <InputField label={txFormData.type === 'income' ? 'مصدر الدخل / الاسم' : 'اسم المستلم'} value={txFormData.type === 'income' ? txFormData.sourceName : txFormData.receiverName} onChange={(v: any) => setTxFormData({...txFormData, [txFormData.type === 'income' ? 'sourceName' : 'receiverName']: v})} required />
                    <InputField label="المبلغ" type="number" value={txFormData.amount} onChange={(v: any) => setTxFormData({...txFormData, amount: Number(v)})} required />
                    <InputField label="البيان / الوصف" value={txFormData.description} onChange={(v: any) => setTxFormData({...txFormData, description: v})} required />
                    
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className={`flex-1 text-white rounded-xl font-bold h-12 ${txFormData.type === 'income' ? 'bg-emerald-600' : 'bg-rose-600'}`}>تأكيد</button>
                      <button type="button" onClick={() => setShowTxForm(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-xl font-bold h-12">إلغاء</button>
                    </div>
                  </form>
               </motion.div>
            </div>
          )}
          {printingTx && (
            <ReceiptModal data={printingTx} onClose={() => setPrintingTx(null)} />
          )}
        </AnimatePresence>

        <ConfirmModal 
          isOpen={!!txToDelete}
          title="تأكيد حذف المعاملة"
          message={`هل أنت متأكد من حذف هذه المعاملة "${txToDelete?.description}" بقيمة "${txToDelete?.amount?.toLocaleString()} ج.م"؟`}
          onConfirm={() => {
            if (txToDelete) {
              handleDeleteTx(txToDelete);
            }
          }}
          onCancel={() => setTxToDelete(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all animate-in fade-in">
        <h3 className="text-xl font-black text-slate-800">إدارة الخزائن والحسابات</h3>
        <button onClick={() => { setAccountFormData({ name: '', description: '', balance: 0, type: 'income' }); setShowAddAccount(true); }} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
          <PlusCircle className="w-5 h-5" /> إضافة خزينة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map((acc: any) => (
          <motion.div 
            whileHover={{ y: -5 }}
            key={acc.id} 
            className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden cursor-pointer"
            onClick={() => setViewingAccount(acc)}
          >
            <div className={`absolute left-0 top-0 w-2 h-full transition-all group-hover:w-3 ${acc.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <div className="flex justify-between items-start mb-4">
               <div className={`p-3 rounded-2xl ${acc.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                 <Calculator className="w-6 h-6" />
               </div>
               <div className="flex gap-1">
                 <button onClick={(e) => { e.stopPropagation(); setAccountFormData(acc); setShowAddAccount(true); }} className="p-2 text-slate-400 hover:bg-slate-50 hover:text-emerald-600 rounded-xl transition-all"><Edit className="w-4 h-4" /></button>
                 <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setAccountToDelete(acc);
                  }} 
                  className="p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600 rounded-xl transition-all"
                 >
                  <Trash2 className="w-4 h-4" />
                 </button>
               </div>
            </div>
            <h4 className="text-xl font-black text-slate-800 mb-1 text-right">{acc.name}</h4>
            <p className="text-slate-400 text-sm mb-6 text-right line-clamp-1">{acc.description}</p>
            <div className="flex items-end justify-between bg-slate-50 p-4 rounded-2xl">
               <div className="text-right">
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">الرصيد الحالي</p>
                 <p className="text-2xl font-black text-slate-800 tabular-nums">{acc.balance?.toLocaleString()} <span className="text-xs text-slate-400 mr-1">ج.م</span></p>
               </div>
               <div className={`px-3 py-1 rounded-full text-[10px] font-black ${acc.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                 {acc.type === 'income' ? 'إيرادات' : 'مصروفات'}
               </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showAddAccount && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                <h3 className="text-xl font-black mb-6 text-right">{accountFormData.id ? 'تعديل بيانات الخزينة' : 'إضافة خزينة جديدة'}</h3>
                <form onSubmit={handleAddAccount} className="space-y-4">
                  <InputField label="اسم الخزينة" value={accountFormData.name} onChange={(v: any) => setAccountFormData({...accountFormData, name: v})} required />
                  <InputField label="الوصف" value={accountFormData.description} onChange={(v: any) => setAccountFormData({...accountFormData, description: v})} />
                  <InputField label="الرصيد (الافتتاحي أو الحالي)" type="number" value={accountFormData.balance} onChange={(v: any) => setAccountFormData({...accountFormData, balance: Number(v)})} required />
                  {!accountFormData.id && (
                    <InputField label="بيان الرصيد الافتتاحي" value={accountFormData.initialTxDescription} onChange={(v: any) => setAccountFormData({...accountFormData, initialTxDescription: v})} placeholder="مثال: رصيد مرحل من عهدة سابقة" />
                  )}
                  <div className="space-y-2 text-right">
                    <label className="text-sm font-bold block pr-2">نوع الحساب الغالب</label>
                    <div className="flex gap-2">
                       <button type="button" onClick={() => setAccountFormData({...accountFormData, type: 'income'})} className={`flex-1 font-bold h-12 rounded-xl transition-all ${accountFormData.type === 'income' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>إيرادات</button>
                       <button type="button" onClick={() => setAccountFormData({...accountFormData, type: 'expense'})} className={`flex-1 font-bold h-12 rounded-xl transition-all ${accountFormData.type === 'expense' ? 'bg-rose-600 text-white shadow-lg shadow-rose-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>مصروفات</button>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <button type="submit" className="flex-1 bg-emerald-600 text-white rounded-xl font-bold h-12 shadow-lg shadow-emerald-100">حفظ البيانات</button>
                    <button type="button" onClick={() => setShowAddAccount(false)} className="flex-1 bg-slate-100 text-slate-600 rounded-xl font-bold h-12">إلغاء</button>
                  </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!accountToDelete}
        title="تأكيد حذف الخزينة"
        message={`هل أنت متأكد من حذف الخزينة "${accountToDelete?.name}"؟ سيؤدي هذا لحذف الحساب نهائياً.`}
        onConfirm={async () => {
          if (accountToDelete) {
            try {
              await deleteDoc(doc(db, 'financial_accounts', accountToDelete.id));
              await logSystemAction('delete', 'financial_accounts', accountToDelete.id, accountToDelete, `حذف خزينة: ${accountToDelete.name}`);
              setAccountToDelete(null);
            } catch (err) {
              console.error(err);
            }
          }
        }}
        onCancel={() => setAccountToDelete(null)}
      />

      <ConfirmModal 
        isOpen={!!txToDelete}
        title="تأكيد حذف المعاملة"
        message={`هل أنت متأكد من حذف هذه المعاملة "${txToDelete?.description}" بقيمة "${txToDelete?.amount?.toLocaleString()} ج.م"؟`}
        onConfirm={() => {
          if (txToDelete) {
            handleDeleteTx(txToDelete);
          }
        }}
        onCancel={() => setTxToDelete(null)}
      />
    </div>
  );
};

const ReceiptModal = ({ data, onClose }: any) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const isExpense = data.type === 'expense';
  
  const downloadPDF = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, { 
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Additional safety: find all elements in the cloned doc and force RGB if they have oklch/oklab
          // Though we manually set hex in the React source, this is a final defensive layer.
          const elements = clonedDoc.getElementsByClassName('receipt-capture');
          if (elements.length > 0) {
            const captureArea = elements[0] as HTMLElement;
            captureArea.style.colorScheme = 'light';
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${isExpense ? 'expense' : 'receipt'}-${data.id || 'new'}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      // Fallback or alert could be added here
    }
  };

  const title = isExpense ? "إيصال صرف نقدية" : "إيصال استلام تبرع";
  const partyLabel = isExpense ? "صرفنا للمكرم/ة:" : "استلمنا من السيد/ة:";
  const partyName = isExpense ? data.receiverName : (data.donorName || data.sourceName || data.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-8 w-full max-w-xl shadow-2xl relative">
        <button onClick={onClose} className="absolute left-6 top-6 p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-rose-500 transition-colors"><X className="w-5 h-5" /></button>
        <div className="mb-6 flex justify-between items-center text-right">
           <h2 className="text-xl font-black">معاينة المستند</h2>
           <button onClick={downloadPDF} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2">تحميل PDF <Download className="w-4 h-4" /></button>
        </div>
        <div ref={receiptRef} className="receipt-capture p-8 rounded-2xl text-right relative overflow-hidden" dir="rtl" style={{ backgroundColor: '#ffffff', border: `4px solid ${isExpense ? '#e11d48' : '#10b981'}` }}>
           <div className="flex justify-between items-start mb-8 pb-4" style={{ borderColor: '#f1f5f9', borderBottomWidth: '2px', borderBottomStyle: 'solid' }}>
              <div className="font-black" style={{ color: isExpense ? '#9f1239' : '#065f46' }}>
                <h1 className="text-xl">جمعية بصمة خير نبروه</h1>
                <p className="text-[10px]">نظام الإدارة المالية الموحد</p>
              </div>
              <div className="text-xs font-mono" style={{ color: '#94a3b8' }}>
                <p>الرقم: {data.id ? data.id.slice(-6).toUpperCase() : 'NEW'}</p>
                <p>التاريخ: {data.date || new Date().toLocaleDateString()}</p>
              </div>
           </div>
           <div className="text-center mb-6">
              <span className="px-6 py-1 rounded-full font-black border" style={{ 
                backgroundColor: isExpense ? '#fff1f2' : '#ecfdf5',
                color: isExpense ? '#be123c' : '#047857',
                borderColor: isExpense ? '#fecdd3' : '#a7f3d0'
              }}>
                {title}
              </span>
           </div>
           <div className="space-y-4 font-bold" style={{ color: '#1e293b' }}>
              <p>{partyLabel} <span style={{ color: isExpense ? '#be123c' : '#047857' }}>{partyName}</span></p>
              <p>مبلغ وقدره: <span className="text-xl" style={{ color: isExpense ? '#be123c' : '#047857' }}>{data.amount ? `${Number(data.amount).toLocaleString()} جنيهاً مصرياً` : data.quantity}</span></p>
              <p>بيان: <span style={{ color: '#64748b' }}>{data.itemDescription || data.description || 'كفالة شهرية'}</span></p>
           </div>
           <div className="mt-12 flex justify-between items-center px-4">
              <div className="text-center">
                 <p className="text-[10px] mb-6" style={{ color: '#94a3b8' }}>{isExpense ? 'توقيع المحاسب' : 'توقيع المستلم'}</p>
                 <p className="font-black underline" style={{ 
                   color: '#1e293b',
                   textDecorationColor: isExpense ? '#f43f5e' : '#10b981'
                 }}>{isExpense ? (auth.currentUser?.email?.split('@')[0] || 'المحاسب') : (data.receiverName || 'إدارة الجمعية')}</p>
              </div>
              <div className="w-20 h-20 border-4 rounded-full flex items-center justify-center opacity-30 select-none pointer-events-none -rotate-12 border-dotted" style={{ borderColor: isExpense ? 'rgba(225, 29, 72, 0.3)' : 'rgba(16, 185, 129, 0.3)' }}>
                <div className="text-center text-[10px] font-black leading-none" style={{ color: isExpense ? '#4c0519' : '#065f46' }}>ختم<br/>الجمعية</div>
              </div>
           </div>
        </div>
      </motion.div>
    </div>
  );
};
