// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Printer, FileUp, FileDown, ArrowUpDown, Search, X, Loader2, Edit3, FileSpreadsheet, ChevronDown, Palette, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Logo from './Logo';
import ConfirmModal from './ConfirmModal';

interface PayrollItem {
  id: string;
  name: string;
  nationalId: string;
  phone: string;
  maritalStatus: string;
  amount: number;
  color?: string;
  isPaid?: boolean;
}

const ROW_COLORS = ['', '#fde68a', '#bbf7d0', '#fecaca', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#fed7aa'];
interface PayrollList {
  id: string;
  title: string;
  date: string;
  items: PayrollItem[];
  printTitle?: string;
  createdAt?: any;
}

const COMMITTEE = [
  'صالح محمود صالح',
  'محمد السيد راغب',
  'عيشة عبدالقادر علام',
];
const MARITAL_OPTIONS = ['أرملة', 'مطلقة', 'متزوجة', 'عزباء', 'أعزب', 'متزوج', 'مطلق', 'أرمل', 'أسرة سجين', 'أسرة مريض', 'إعاقة', 'أسرة فقيرة'];
const ROWS_PER_PAGE = 13;
const toArabicDigits = (v: any) => String(v ?? '').replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const COLUMNS: { key: keyof PayrollItem; label: string }[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'nationalId', label: 'الرقم القومي' },
  { key: 'phone', label: 'رقم التليفون' },
  { key: 'maritalStatus', label: 'الحالة' },
  { key: 'amount', label: 'المبلغ' },
];

const COLORS = [
  { name: 'أبيض', value: '' },
  { name: 'أحمر فاتح', value: '#fee2e2' },
  { name: 'أحمر', value: '#fecaca' },
  { name: 'برتقالي فاتح', value: '#ffedd5' },
  { name: 'برتقالي', value: '#fed7aa' },
  { name: 'أصفر فاتح', value: '#fef9c3' },
  { name: 'أصفر', value: '#fef08a' },
  { name: 'أخضر فاتح', value: '#dcfce7' },
  { name: 'أخضر', value: '#bbf7d0' },
  { name: 'زمردي', value: '#a7f3d0' },
  { name: 'تركواز', value: '#99f6e4' },
  { name: 'سماوي', value: '#bae6fd' },
  { name: 'أزرق', value: '#bfdbfe' },
  { name: 'بنفسجي فاتح', value: '#f3e8ff' },
  { name: 'بنفسجي', value: '#e9d5ff' },
  { name: 'وردي فاتح', value: '#fce7f3' },
  { name: 'وردي', value: '#fbcfe8' },
  { name: 'رمادي فاتح', value: '#f3f4f6' },
  { name: 'رمادي', value: '#e5e7eb' },
];

function ColorPicker({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_colors');
    return saved ? JSON.parse(saved) : [];
  });

  const handleSelect = (c: string) => {
    onChange(c);
    setOpen(false);
    if (c && !recent.includes(c)) {
      const newRecent = [c, ...recent.slice(0, 7)];
      setRecent(newRecent);
      localStorage.setItem('recent_colors', JSON.stringify(newRecent));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-xl border border-stone-200 hover:bg-emerald-50 transition flex items-center shadow-sm"
        title="تلوين الحالة"
        style={value ? { background: value } : undefined}
      >
        <Palette className={`w-4 h-4 ${value ? 'text-stone-900' : 'text-emerald-600'}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 left-0 bg-white border border-stone-200 rounded-xl shadow-xl z-50 p-3 w-64 animate-in fade-in zoom-in duration-150">
            {recent.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-stone-400 font-bold mb-1.5 px-1 truncate uppercase tracking-wider">الألوان المستخدمة مؤخراً</div>
                <div className="flex flex-wrap gap-1.5">
                  {recent.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelect(c)}
                      className="w-6 h-6 rounded-md border border-stone-100 hover:scale-110 transition shadow-sm"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="text-[10px] text-stone-400 font-bold mb-1.5 px-1 uppercase tracking-wider">لوحة الألوان</div>
            <div className="grid grid-cols-6 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleSelect(c.value)}
                  className={`w-7 h-7 rounded-lg border transition hover:scale-110 flex items-center justify-center ${value === c.value ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-stone-100'}`}
                  style={{ background: c.value || '#fff' }}
                  title={c.name}
                >
                  {!c.value && <X className="w-3 h-3 text-stone-400" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n: number) => toArabicDigits((Number(n) || 0).toLocaleString('en-US'));

export default function MonthlyPayrollScreen() {
  const [lists, setLists] = useState<PayrollList[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeleteCase, setConfirmDeleteCase] = useState<string | null>(null);

  // editor state
  const [search, setSearch] = useState('');
  const [filterCol, setFilterCol] = useState<string>('');
  const [sort1, setSort1] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [sort2, setSort2] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  useEffect(() => {
    setPaymentFilter('all');
  }, [activeId]);

  // import dialog
  const [importData, setImportData] = useState<any[][] | null>(null);
  const [importMap, setImportMap] = useState<Record<string, number>>({});
  const [importHasHeader, setImportHasHeader] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Modal states for adding/editing a case
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [isCustomMarital, setIsCustomMarital] = useState(false);
  const [modalCaseData, setModalCaseData] = useState<{
    id?: string;
    name: string;
    nationalId: string;
    phone: string;
    maritalStatus: string;
    amount: number;
    color?: string;
    isPaid?: boolean;
  }>({
    name: '',
    nationalId: '',
    phone: '',
    maritalStatus: '',
    amount: 100,
    isPaid: false
  });

  useEffect(() => {
    const q = query(collection(db, 'monthly_payroll_lists'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setLists(data);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const active = lists.find((l) => l.id === activeId) || null;

  const createList = async () => {
    setCreating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastList = lists[0]; // lists is ordered by createdAt desc
      const initialItems = lastList ? lastList.items.map(it => ({ ...it, id: uid(), isPaid: false })) : [];
      
      const ref = await addDoc(collection(db, 'monthly_payroll_lists'), {
        title: `كشف شهر ${new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`,
        date: today,
        items: initialItems,
        createdAt: serverTimestamp(),
      });
      setActiveId(ref.id);
    } finally { setCreating(false); }
  };

  const cleanUndefined = (obj: any): any => {
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (Array.isArray(obj)) {
      return obj.map(item => cleanUndefined(item));
    }
    if (typeof obj === 'object') {
      const res: any = {};
      for (const key of Object.keys(obj)) {
        if (obj[key] !== undefined) {
          res[key] = cleanUndefined(obj[key]);
        }
      }
      return res;
    }
    return obj;
  };

  const updateActive = async (patch: Partial<PayrollList>) => {
    if (!active) return;
    const cleanPatch = cleanUndefined(patch);
    await updateDoc(doc(db, 'monthly_payroll_lists', active.id), cleanPatch as any);
  };

  const removeList = async (id: string) => {
    await deleteDoc(doc(db, 'monthly_payroll_lists', id));
    if (activeId === id) setActiveId(null);
  };

  // ---------- items ops ----------
  const addItem = () => {
    setModalCaseData({
      name: '',
      nationalId: '',
      phone: '',
      maritalStatus: '',
      amount: 100,
      color: '',
      isPaid: false
    });
    setIsCustomMarital(false);
    setShowCaseModal(true);
  };

  const updItem = (id: string, patch: Partial<PayrollItem>) => {
    if (!active) return;
    const items = active.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
    updateActive({ items });
  };

  const delItem = (id: string) => {
    if (!active) return;
    setConfirmDeleteCase(id);
  };

  const executeDelItem = async (id: string) => {
    if (!active) return;
    const it = active.items.find(x => x.id === id);
    if (!it) return;
    
    try {
      const items = active.items.filter((x) => x.id !== id);
      await updateActive({ items });
      await logSystemAction('delete', 'monthly_payroll_item', active.id + '_' + id, {
        listId: active.id,
        item: it
      }, `حذف حالة "${it.name}" من كشف: ${active.title}`);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء الحذف');
    }
  };

  const handleSaveCase = async () => {
    if (!active) return;
    if (!modalCaseData.name.trim()) {
      alert('الرجاء إدخال اسم الحالة');
      return;
    }

    try {
      if (modalCaseData.id) {
        // Edit existing item
        const updatedItems = active.items.map((it) => 
          it.id === modalCaseData.id ? { ...it, ...modalCaseData } : it
        );
        await updateActive({ items: updatedItems });
      } else {
        // Add new item
        const newItem: PayrollItem = {
          id: uid(),
          name: modalCaseData.name.trim(),
          nationalId: modalCaseData.nationalId.trim(),
          phone: modalCaseData.phone.trim(),
          maritalStatus: modalCaseData.maritalStatus.trim(),
          amount: modalCaseData.amount || 0,
          color: '',
          isPaid: false
        };
        const updatedItems = [...(active.items || []), newItem];
        await updateActive({ items: updatedItems });
        
        await logSystemAction('add', 'monthly_payroll_item', active.id + '_' + newItem.id, {
          listId: active.id,
          item: newItem
        }, `إضافة حالة "${newItem.name}" لكشف: ${active.title}`);
      }
      setShowCaseModal(false);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ الحالة');
    }
  };

  // ---------- view (filter + sort) ----------
  const view = useMemo(() => {
    if (!active) return [];
    let arr = [...active.items];

    if (paymentFilter === 'paid') {
      arr = arr.filter((it) => it.isPaid === true);
    } else if (paymentFilter === 'unpaid') {
      arr = arr.filter((it) => !it.isPaid);
    }

    if (search.trim()) {
      const s = search.trim();
      arr = arr.filter((it) => {
        if (filterCol) return String((it as any)[filterCol] ?? '').includes(s);
        return COLUMNS.some((c) => String((it as any)[c.key] ?? '').includes(s));
      });
    }
    const cmp = (a: any, b: any, col: string, dir: 'asc' | 'desc') => {
      const av = a[col]; const bv = b[col];
      const an = typeof av === 'number' ? av : parseFloat(av);
      const bn = typeof bv === 'number' ? bv : parseFloat(bv);
      let r: number;
      if (!isNaN(an) && !isNaN(bn)) r = an - bn;
      else r = String(av ?? '').localeCompare(String(bv ?? ''), 'ar');
      return dir === 'asc' ? r : -r;
    };
    if (sort1) arr.sort((a, b) => cmp(a, b, sort1.col, sort1.dir) || (sort2 ? cmp(a, b, sort2.col, sort2.dir) : 0));
    else if (sort2) arr.sort((a, b) => cmp(a, b, sort2.col, sort2.dir));
    return arr;
  }, [active, search, filterCol, sort1, sort2, paymentFilter]);

  const grandTotal = useMemo(() => view.reduce((s, it) => s + (Number(it.amount) || 0), 0), [view]);

  const stats = useMemo(() => {
    if (!active) return { total: 0, paid: 0, unpaid: 0, paidAmount: 0, unpaidAmount: 0 };
    const items = active.items || [];
    const total = items.length;
    const paid = items.filter(it => it.isPaid).length;
    const unpaid = total - paid;
    const paidAmount = items.filter(it => it.isPaid).reduce((s, it) => s + (it.amount || 0), 0);
    const unpaidAmount = items.filter(it => !it.isPaid).reduce((s, it) => s + (it.amount || 0), 0);
    return { total, paid, unpaid, paidAmount, unpaidAmount };
  }, [active]);

  // ---------- excel ----------
  const exportExcel = () => {
    if (!active) return;
    const rows = view.map((it, i) => ({
      'م': i + 1,
      'الاسم': it.name,
      'الرقم القومي': it.nationalId,
      'رقم التليفون': it.phone,
      'الحالة الاجتماعية': it.maritalStatus,
      'المبلغ': it.amount,
    }));
    rows.push({ 'م': '', 'الاسم': 'الإجمالي', 'الرقم القومي': '', 'رقم التليفون': '', 'الحالة الاجتماعية': '', 'المبلغ': grandTotal } as any);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف القبض');
    XLSX.writeFile(wb, `${active.title || 'كشف_القبض'}.xlsx`);
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      if (!arr.length) return;
      // auto-detect mapping by header row
      const header = arr[0].map((h) => String(h || '').trim());
      const guess: Record<string, number> = {};
      const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
      guess.name = find('اسم', 'الاسم');
      guess.nationalId = find('قومي', 'الرقم');
      guess.phone = find('تليفون', 'هاتف', 'موبايل');
      guess.maritalStatus = find('اجتماعي', 'الحالة');
      guess.amount = find('مبلغ', 'قيمة');
      setImportMap(guess);
      setImportData(arr);
      setImportHasHeader(true);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!active || !importData) return;
    const start = importHasHeader ? 1 : 0;
    const newItems: PayrollItem[] = [];
    for (let i = start; i < importData.length; i++) {
      const row = importData[i];
      if (!row || row.every((c) => c == null || c === '')) continue;
      newItems.push({
        id: uid(),
        name: String(row[importMap.name] ?? '').trim(),
        nationalId: String(row[importMap.nationalId] ?? '').trim(),
        phone: String(row[importMap.phone] ?? '').trim(),
        maritalStatus: String(row[importMap.maritalStatus] ?? '').trim(),
        amount: Number(row[importMap.amount]) || 0,
      });
    }
    updateActive({ items: [...(active.items || []), ...newItems] });
    setImportData(null); setImportMap({});
  };

  // ---------- print ----------
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) return;
    const styles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Poppins:wght@600;900&display=swap');
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; font-family: 'Cairo', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { direction: rtl; color: #000; }
        .page {
          page-break-after: always;
          width: 210mm;
          height: 297mm;
          padding: 4mm 8mm;
          display: flex;
          flex-direction: column;
          position: relative;
          background: #fff;
          overflow: hidden;
        }
        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-35deg);
          opacity: 0.04;
          z-index: 0;
          pointer-events: none;
        }
        .watermark img {
          width: 550px;
          filter: grayscale(100%);
        }
        .page:last-child { page-break-after: auto; }
        .hdr { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 8px; position: relative; z-index: 1; }
        .hdr .right { text-align: right; font-size: 13.5px; line-height: 1.5; font-weight: 700; color: #000; }
        .hdr .left img { width: 115px; height: 115px; object-fit: contain; }
        .title { text-align: center; margin: 6px 0; font-weight: 900; font-size: 17px; line-height: 1.3; color: #000; border: 2px solid #000; padding: 6px; background: #f9f9f9; position: relative; z-index: 1; }
        
        table { width: 100%; border-collapse: collapse; font-size: 15px; table-layout: fixed; border: 2px solid #000; position: relative; z-index: 1; margin-bottom: 1px; }
        th, td { border: 2px solid #000; padding: 1px 4px; text-align: center; vertical-align: middle; height: 54px; overflow: hidden; }
        th { background: #f2f2f2; font-weight: 900; font-size: 15px; height: 42px; border: 2px solid #000; }
        
        col.c-no { width: 10mm; }
        col.c-name { width: 54mm; }
        col.c-nid { width: 28mm; }
        col.c-phone { width: 24mm; }
        col.c-mar { width: 20mm; }
        col.c-amt { width: 16mm; }
        col.c-sig { width: 44mm; }
        
        td.name { 
          font-size: 14.5px; 
          text-align: right; 
          padding: 2px 8px; 
          font-weight: 900; 
          white-space: normal; 
          line-height: 1.25;
          word-break: break-word;
        }
        td.nid, td.phone { 
          white-space: nowrap; 
          font-family: 'Cairo', sans-serif; 
          font-weight: 800; 
          font-size: 11.5px; 
          direction: ltr;
          letter-spacing: -0.3px;
          padding: 1px 2px;
        }
        td.amount { font-weight: 900; font-size: 17px; }
        td.no { font-weight: 900; background-color: #f7f7f7; }
        
        .totals-box { 
          margin-top: 0px; 
          border: 2px solid #000; 
          background: #f9f9f9; 
          padding: 3px 15px; 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 20px;
          position: relative; z-index: 1;
        }
        .totals-box div { font-weight: 900; font-size: 16px; text-align: center; }
        
        .committee-title {
          text-align: center;
          font-weight: 900;
          font-size: 15px;
          margin-top: 0px;
          margin-bottom: 0px;
          position: relative;
          z-index: 1;
        }
        .committee { 
          display: grid; 
          grid-template-columns: repeat(3, 1fr); 
          gap: 5px; 
          border: 2px solid #000; 
          padding: 4px;
          position: relative; z-index: 1;
        }
        .committee-item { text-align: center; font-size: 14.5px; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .committee-item .role { font-weight: 900; min-width: 60px; }
        .committee-item .sig-line { border-bottom: 1px dashed #000; flex: 1; margin-top: 5px; height: 18px; }
      </style>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${active?.title || 'كشف القبض الشهري'}</title>${styles}</head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 200);
  };

  const pages = useMemo(() => {
    const out: { items: PayrollItem[]; prev: number; total: number }[] = [];
    let prev = 0;
    const itemsPerPage = 13; 
    for (let i = 0; i < view.length; i += itemsPerPage) {
      const chunk = view.slice(i, i + itemsPerPage);
      const total = chunk.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      out.push({ items: chunk, prev, total });
      prev += total;
    }
    if (out.length === 0) out.push({ items: [], prev: 0, total: 0 });
    return out;
  }, [view]);

  const logoUrl = (typeof window !== 'undefined' && localStorage.getItem('app_logo_url')) || 'https://i.ibb.co/L6V2yq9/logo.png';

  // ---------- UI ----------
  if (!active) {
    return (
      <div className="p-6 lg:p-10" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl lg:text-3xl font-black text-emerald-900">كشف القبض الشهري</h1>
          <button onClick={createList} disabled={creating} className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-50">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} كشف جديد
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-emerald-400"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
        ) : lists.length === 0 ? (
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-16 text-center text-emerald-700">
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-emerald-400" />
            <p className="font-bold mb-2">لا توجد كشوف بعد</p>
            <p className="text-sm text-emerald-600/70">ابدأ بإنشاء كشف جديد لإدارة المساعدات الشهرية</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((l) => (
              <motion.div key={l.id} whileHover={{ y: -3 }} className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-black text-emerald-900">{l.title}</h3>
                    <p className="text-xs text-stone-500">{l.date}</p>
                  </div>
                  <button onClick={() => setConfirmDelete(l.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="text-sm text-stone-600 mb-3">عدد الحالات: <span className="font-bold text-emerald-700">{l.items?.length || 0}</span></div>
                <div className="text-sm text-stone-600 mb-4">الإجمالي: <span className="font-bold text-emerald-700">{fmt((l.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0))} ج.م</span></div>
                <button onClick={() => setActiveId(l.id)} className="w-full bg-emerald-50 text-emerald-700 py-2 rounded-xl font-bold hover:bg-emerald-100 flex items-center justify-center gap-2">
                  <Edit3 className="w-4 h-4" /> فتح وتحرير
                </button>
              </motion.div>
            ))}
          </div>
        )}

        <ConfirmModal
          isOpen={!!confirmDelete}
          title="حذف الكشف"
          message="هل أنت متأكد من حذف الكشف نهائياً؟"
          onConfirm={() => { removeList(confirmDelete!); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>
    );
  }

  // ---------- editor ----------
  return (
    <div className="p-4 lg:p-8" dir="rtl">
      {/* Alert Banner for Unpaid Cases */}
      <AnimatePresence>
        {stats.unpaid > 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="mb-4 bg-rose-50/75 border-r-4 border-rose-600 rounded-2xl p-4 flex items-start gap-3 shadow-sm"
          >
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl mt-0.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 animate-bounce" />
            </div>
            <div>
              <h4 className="font-black text-rose-950 text-sm mb-1 font-bold">تنبيه كشف الصرف الشهري</h4>
              <p className="text-xs text-rose-800 font-bold leading-relaxed">
                يوجد عدد <span className="text-sm bg-rose-200/65 px-2 py-0.5 rounded-lg font-black mx-1 inline-block text-rose-900">{toArabicDigits(stats.unpaid)}</span> من الحالات المعتمدة في هذا الكشف لم تستلم المساعدة المالية المخصصة لها بعد.
                <span className="block mt-1.5 text-[11px] text-rose-700 font-medium">إجمالي المبالغ المتبقية غير المصروفة حالياً: <span className="font-extrabold">{fmt(stats.unpaidAmount)} ج.م</span> من إجمالي قيمة الكشف البالغة {fmt(grandTotal)} ج.م</span>
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="mb-4 bg-emerald-50/75 border-r-4 border-emerald-600 rounded-2xl p-4 flex items-start gap-3 shadow-sm"
          >
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl mt-0.5">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h4 className="font-black text-emerald-950 text-sm mb-1 font-bold">تم اكتمال الصرف بالكامل!</h4>
              <p className="text-xs text-emerald-800 font-bold leading-relaxed">
                ممتاز! تم الانتهاء من عملية الصرف لجميع الحالات المعتمدة في كشف هذا الشهر بنسبة ١٠٠٪.
                <span className="block mt-1 text-[11px] text-emerald-700 font-medium">عدد المقبوضات: {toArabicDigits(stats.total)} حالة — بإجمالي مصروفات تبلغ {fmt(stats.paidAmount)} ج.م</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white border border-emerald-100 rounded-2xl p-4 mb-4 flex flex-col gap-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <button onClick={() => setActiveId(null)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl font-bold hover:bg-stone-200 transition-colors self-end mb-1">رجوع</button>
          
          <div className="flex-1 min-w-[200px] flex flex-col gap-1">
            <span className="text-xs font-bold text-emerald-800">عنوان الكشف (الأساسي):</span>
            <input value={active.title} onChange={(e) => updateActive({ title: e.target.value })} className="w-full px-4 py-2 border border-emerald-100 rounded-xl font-bold text-emerald-900 focus:outline-none focus:ring-1 focus:ring-emerald-550 bg-emerald-50/10" />
          </div>
          
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <span className="text-xs font-bold text-emerald-800">تاريخ الكشف:</span>
            <input type="date" value={active.date} onChange={(e) => updateActive({ date: e.target.value })} className="px-4 py-2 border border-emerald-100 rounded-xl font-bold text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-550 bg-emerald-50/10" />
          </div>
        </div>
        
        <div className="flex flex-col gap-1.5 border-t border-dashed border-emerald-100 pt-3">
          <label className="text-xs font-bold text-emerald-800 flex flex-wrap items-center gap-1.5">
            <span>عنوان الكشف المطبوع (الذي يظهر في ورقة الكشف عند الطباعة):</span>
            <span className="text-[10px] text-stone-400 font-medium">(يدعم التعديل الكامل للقيمة والمسمى وتواريخ المساعدة)</span>
          </label>
          <textarea 
            value={active.printTitle !== undefined ? active.printTitle : 'كشف بأسماء الحالات المستحقة للمساعدة بالجمعية عبارة عن كفالة شهرية بقيمة ١٠٠ جنيهات لكل أسرة بتاريخ     /     /      ٢٠٢٦'} 
            onChange={(e) => updateActive({ printTitle: e.target.value })} 
            className="w-full px-4 py-2 border border-emerald-100 rounded-xl font-bold text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-550 bg-emerald-50/10 resize-y"
            rows={2}
            placeholder="اكتب عنوان الطباعة المخصص هنا..."
          />
        </div>
      </div>

      {/* Segmented control for Paid/Unpaid/All list filters */}
      <div className="bg-stone-50 p-1 border border-stone-200 rounded-2xl mb-4 flex gap-1 max-w-md shadow-sm select-none">
        <button
          type="button"
          onClick={() => setPaymentFilter('all')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all ${
            paymentFilter === 'all'
              ? 'bg-white text-emerald-950 shadow-sm border border-stone-150'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          الكل ({toArabicDigits(stats.total)})
        </button>
        <button
          type="button"
          onClick={() => setPaymentFilter('paid')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            paymentFilter === 'paid'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-emerald-700 hover:bg-emerald-50/50'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${paymentFilter === 'paid' ? 'bg-white shadow' : 'bg-emerald-600'}`} />
          تم الصرف ({toArabicDigits(stats.paid)})
        </button>
        <button
          type="button"
          onClick={() => setPaymentFilter('unpaid')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            paymentFilter === 'unpaid'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-rose-700 hover:bg-rose-50/50'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${paymentFilter === 'unpaid' ? 'bg-white shadow animate-pulse' : 'bg-rose-500'}`} />
          لم تقبض ({toArabicDigits(stats.unpaid)})
        </button>
      </div>

      <div className="bg-white border border-emerald-100 rounded-2xl p-4 mb-4 flex flex-wrap gap-2 items-center">
        <button onClick={addItem} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2"><Plus className="w-4 h-4" />إضافة حالة</button>
        <button onClick={() => fileRef.current?.click()} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2"><FileUp className="w-4 h-4" />استيراد Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportFile} />
        <button onClick={exportExcel} className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2"><FileDown className="w-4 h-4" />تصدير Excel</button>
        <button onClick={handlePrint} className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2"><Printer className="w-4 h-4" />طباعة</button>

        <div className="flex-1" />

        <div className="flex items-center gap-2 bg-stone-50 px-3 py-2 rounded-xl border border-stone-100">
          <Search className="w-4 h-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="bg-transparent outline-none text-sm" />
          <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)} className="bg-transparent text-xs outline-none">
            <option value="">كل الخانات</option>
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        <SortPicker label="ترتيب 1" value={sort1} onChange={setSort1} />
        <SortPicker label="ترتيب 2" value={sort2} onChange={setSort2} />
      </div>

      <div className="bg-white border border-emerald-100 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-emerald-50">
            <tr>
              <th className="p-3 font-bold text-emerald-900 text-center">م</th>
              <th className="p-3 font-bold text-emerald-900 text-center w-28">حالة القبض</th>
              {COLUMNS.map((c) => <th key={c.key} className="p-3 font-bold text-emerald-900 text-right">{c.label}</th>)}
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 3} className="text-center py-10 text-stone-400">لا توجد بيانات. اضغط "إضافة حالة" أو استورد Excel.</td></tr>
            )}
            {view.map((it, i) => (
              <tr key={it.id} className="border-t border-emerald-50 hover:bg-emerald-50/30">
                <td className="p-2 text-center font-black tabular-nums" style={it.color ? { background: it.color, color: '#111' } : { color: '#047857' }}>{i + 1}</td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => updItem(it.id, { isPaid: !it.isPaid })}
                    className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-black transition-all select-none border shadow-sm ${
                      it.isPaid 
                        ? 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-850 border-emerald-200' 
                        : 'bg-rose-50 hover:bg-rose-100/80 text-rose-850 border-rose-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${it.isPaid ? 'bg-emerald-600 animate-pulse' : 'bg-rose-500'}`} />
                    {it.isPaid ? 'قبضت (نعم)' : 'متبقية (لا)'}
                  </button>
                </td>
                <td className="p-2 font-bold text-emerald-950">{it.name}</td>
                <td className="p-2 font-mono text-stone-500 tabular-nums">{it.nationalId || '-'}</td>
                <td className="p-2 font-mono text-stone-550 tabular-nums">{it.phone || '-'}</td>
                <td className="p-2">
                  <span className="bg-stone-100 text-stone-700 px-2 py-1 rounded-lg text-xs font-bold">{it.maritalStatus || '-'}</span>
                </td>
                <td className="p-2 font-black text-emerald-700 text-sm tabular-nums">{fmt(it.amount)} ج.م</td>
                <td className="p-2">
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => {
                        const isCustomVal = it.maritalStatus && !MARITAL_OPTIONS.includes(it.maritalStatus);
                        setModalCaseData({
                          id: it.id,
                          name: it.name,
                          nationalId: it.nationalId,
                          phone: it.phone,
                          maritalStatus: it.maritalStatus,
                          amount: it.amount,
                          color: it.color,
                          isPaid: it.isPaid
                        });
                        setIsCustomMarital(!!isCustomVal);
                        setShowCaseModal(true);
                      }}
                      className="p-2 text-blue-500 hover:bg-teal-50 rounded-xl transition-all"
                      title="تعديل الحالة"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <ColorPicker value={it.color} onChange={(c) => updItem(it.id, { color: c })} />
                    <button onClick={() => delItem(it.id)} className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition" title="حذف"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-emerald-50/50">
            <tr>
              <td colSpan={6} className="p-3 text-left font-black text-emerald-900">الإجمالي</td>
              <td className="p-3 text-center font-black text-emerald-900 tabular-nums text-lg">{fmt(grandTotal)} ج.م</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <datalist id="marital-opts">{MARITAL_OPTIONS.map((o) => <option key={o} value={o} />)}</datalist>
      </div>

      {/* hidden print template */}
      <div className="hidden"><div ref={printRef}>
        {pages.map((pg, idx) => (
          <div key={idx} className="page">
            <div className="watermark"><img src={logoUrl} alt="watermark" /></div>
            <div className="hdr">
              <div className="right">
                مديرية الشئون الإجتماعية بالدقهلية<br />
                إدارة الشئون الإجتماعية بنبروه<br />
                جمعية بصمة خير بنبروه<br />
                المشهرة برقم 2510 لسنة 2015
              </div>
              <div className="left"><img src={logoUrl} alt="logo" /></div>
            </div>
            <div className="title">
              {active.printTitle !== undefined && active.printTitle !== '' ? active.printTitle : `كشف بأسماء الحالات المستحقة للمساعدة بالجمعية عبارة عن كفالة شهرية بقيمة ١٠٠ جنيهات لكل أسرة بتاريخ     /     /      ${toArabicDigits('٢٠٢٦')}`}
            </div>
            <table>
              <colgroup>
                <col className="c-no" /><col className="c-name" /><col className="c-nid" /><col className="c-phone" /><col className="c-mar" /><col className="c-amt" /><col className="c-sig" />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: '10mm' }}>م</th>
                  <th style={{ width: '52mm' }}>الاسم</th>
                  <th style={{ width: '26mm' }}>الرقم القومي</th>
                  <th style={{ width: '22mm' }}>رقم التليفون</th>
                  <th style={{ width: '18mm' }}>الحالة</th>
                  <th style={{ width: '14mm' }}>المبلغ</th>
                  <th style={{ width: '44mm' }}>التوقيع</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="no" style={it.color ? { background: it.color } : undefined}>{toArabicDigits(idx * 13 + i + 1)}</td>
                    <td className="name">{it.name}</td>
                    <td className="nid">{toArabicDigits(it.nationalId)}</td>
                    <td className="phone">{toArabicDigits(it.phone)}</td>
                    <td className="marital" style={{ fontSize: '14px', fontWeight: 900, whiteSpace: 'normal', lineHeight: 1.2 }}>{it.maritalStatus}</td>
                    <td className="amount">{fmt(it.amount)}</td>
                    <td className="signature"></td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 13 - pg.items.length) }).map((_, i) => (
                  <tr key={`empty-${i}`}>
                    <td className="no"></td>
                    <td className="name"></td>
                    <td className="nid"></td>
                    <td className="phone"></td>
                    <td className="marital"></td>
                    <td className="amount"></td>
                    <td className="signature"></td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="totals-box">
              <div>ما قبله: {fmt(pg.prev)} ج.م</div>
              <div>الإجمالي: {fmt(pg.prev + pg.total)} ج.م</div>
            </div>

            <div className="committee-title">لجنة التوزيع</div>
            <div className="committee">
              {COMMITTEE.map((role, i) => (
                <div key={i} className="committee-item">
                  <span className="role">{role}:</span>
                  <span className="sig-line"></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div></div>

      {/* import dialog */}
      <AnimatePresence>
        {importData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-black text-emerald-900">استيراد من Excel</h3>
                <button onClick={() => setImportData(null)} className="p-2 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-stone-600 mb-4">حدد رقم العمود لكل خانة من البيانات (الأعمدة مرقمة من 0):</p>
              <label className="flex items-center gap-2 mb-4 text-sm">
                <input type="checkbox" checked={importHasHeader} onChange={(e) => setImportHasHeader(e.target.checked)} />
                الملف يحتوي على صف رؤوس (سيتم تجاهله)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {COLUMNS.map((c) => (
                  <div key={c.key}>
                    <label className="block text-xs font-bold text-stone-600 mb-1">{c.label}</label>
                    <select value={importMap[c.key] ?? -1} onChange={(e) => setImportMap({ ...importMap, [c.key]: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-stone-200 rounded-lg">
                      <option value={-1}>(تجاهل)</option>
                      {(importData[0] || []).map((h: any, i: number) => (
                        <option key={i} value={i}>عمود {i} — {String(h ?? '').slice(0, 30)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-6 bg-stone-50 rounded-xl p-3 text-xs">
                <div className="font-bold mb-2">معاينة أول 3 صفوف:</div>
                <div className="overflow-x-auto">
                  <table className="text-xs"><tbody>
                    {importData.slice(0, 3).map((r, i) => (
                      <tr key={i}>{r.map((c: any, j: number) => <td key={j} className="border px-2 py-1">{String(c ?? '')}</td>)}</tr>
                    ))}
                  </tbody></table>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={confirmImport} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold">استيراد</button>
                <button onClick={() => setImportData(null)} className="px-6 bg-stone-100 text-stone-700 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showCaseModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-white rounded-3xl p-6 lg:p-8 max-w-lg w-full shadow-2xl border border-emerald-100" dir="rtl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-emerald-950">
                  {modalCaseData.id ? 'تعديل بيانات الحالة' : 'إضافة حالة جديدة للكشف'}
                </h3>
                <button onClick={() => setShowCaseModal(false)} className="p-2 hover:bg-stone-100 rounded-xl transition-colors"><X className="w-5 h-5 text-stone-500" /></button>
              </div>

              <div className="space-y-4 text-right">
                <div>
                  <label className="block text-xs font-black text-emerald-950 mb-1.5 pr-1">اسم الحالة ثلاثي/رباعي</label>
                  <input 
                    type="text" 
                    value={modalCaseData.name} 
                    onChange={(e) => setModalCaseData({ ...modalCaseData, name: e.target.value })} 
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:border-emerald-500 rounded-2xl outline-none font-bold text-sm transition-all text-emerald-950" 
                    placeholder="الاسم الكامل للعميل"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-emerald-950 mb-1.5 pr-1">الرقم القومي (١٤ رقم)</label>
                    <input 
                      type="text" 
                      value={modalCaseData.nationalId} 
                      onChange={(e) => setModalCaseData({ ...modalCaseData, nationalId: e.target.value })} 
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:border-emerald-500 rounded-2xl outline-none font-bold text-sm transition-all tabular-nums text-emerald-950" 
                      placeholder="٢٩٩٠١٠١..."
                      maxLength={14}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-emerald-950 mb-1.5 pr-1">رقم التليفون للتواصل</label>
                    <input 
                      type="text" 
                      value={modalCaseData.phone} 
                      onChange={(e) => setModalCaseData({ ...modalCaseData, phone: e.target.value })} 
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:border-emerald-500 rounded-2xl outline-none font-bold text-sm transition-all tabular-nums text-emerald-950" 
                      placeholder="٠١٠..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-emerald-950 mb-1.5 pr-1">الحالة الاجتماعية</label>
                    <select
                      value={isCustomMarital ? "أخرى" : modalCaseData.maritalStatus} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "أخرى") {
                          setIsCustomMarital(true);
                          setModalCaseData({ ...modalCaseData, maritalStatus: "" });
                        } else {
                          setIsCustomMarital(false);
                          setModalCaseData({ ...modalCaseData, maritalStatus: val });
                        }
                      }} 
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:border-emerald-500 rounded-2xl outline-none font-bold text-sm transition-all text-emerald-950"
                    >
                      <option value="">-- اضغط للاختيار --</option>
                      {MARITAL_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      <option value="أخرى">أخرى (تحديد يدوي)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-emerald-950 mb-1.5 pr-1">المبلغ المالي المخصص (ج.م)</label>
                    <input 
                      type="number" 
                      value={modalCaseData.amount} 
                      onChange={(e) => setModalCaseData({ ...modalCaseData, amount: parseFloat(e.target.value) || 0 })} 
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:border-emerald-500 rounded-2xl outline-none font-bold text-sm transition-all tabular-nums text-emerald-700 text-lg" 
                      min={0}
                    />
                  </div>
                </div>

                {isCustomMarital && (
                  <div className="bg-emerald-50/20 border border-dashed border-emerald-150 p-4 rounded-2xl">
                    <label className="block text-xs font-black text-emerald-900 mb-1.5 pr-1">الحالة الاجتماعية الأخرى (تحديد يدوي)</label>
                    <input 
                      type="text" 
                      value={modalCaseData.maritalStatus} 
                      onChange={(e) => setModalCaseData({ ...modalCaseData, maritalStatus: e.target.value })} 
                      placeholder="امسح واكتب هنا (مثال: ذوي الهمم، متعطل، إلخ)" 
                      className="w-full px-4 py-3 bg-white border border-emerald-100 focus:border-emerald-500 rounded-2xl outline-none font-bold text-sm transition-all text-emerald-950"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={handleSaveCase} 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 transition-all"
                >
                  حفظ البيانات والاعتماد
                </button>
                <button 
                  onClick={() => setShowCaseModal(false)} 
                  className="px-6 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3.5 rounded-2xl font-bold text-sm transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!confirmDeleteCase}
        title="تأكيد حذف الحالة"
        message={
          confirmDeleteCase && active 
            ? `هل أنت متأكد من حذف الحالة "${active.items.find((x) => x.id === confirmDeleteCase)?.name || ''}" نهائياً من هذا الكشف؟` 
            : 'هل أنت متأكد من حذف هذه الحالة؟'
        }
        onConfirm={() => {
          if (confirmDeleteCase) {
            executeDelItem(confirmDeleteCase);
            setConfirmDeleteCase(null);
          }
        }}
        onCancel={() => setConfirmDeleteCase(null)}
      />
    </div>
  );
}

function SortPicker({ label, value, onChange }: { label: string; value: any; onChange: (v: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="px-3 py-2 bg-stone-50 border border-stone-100 rounded-xl text-xs font-bold flex items-center gap-1">
        <ArrowUpDown className="w-3 h-3" />{label}{value ? `: ${COLUMNS.find((c) => c.key === value.col)?.label} ${value.dir === 'asc' ? '↑' : '↓'}` : ''}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-stone-200 rounded-xl shadow-lg z-30 p-2 w-48">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-right px-3 py-1.5 text-xs hover:bg-stone-50 rounded">بدون ترتيب</button>
          {COLUMNS.map((c) => (
            <div key={c.key} className="flex">
              <button onClick={() => { onChange({ col: c.key, dir: 'asc' }); setOpen(false); }} className="flex-1 text-right px-3 py-1.5 text-xs hover:bg-emerald-50 rounded">{c.label} ↑</button>
              <button onClick={() => { onChange({ col: c.key, dir: 'desc' }); setOpen(false); }} className="flex-1 text-right px-3 py-1.5 text-xs hover:bg-emerald-50 rounded">{c.label} ↓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

