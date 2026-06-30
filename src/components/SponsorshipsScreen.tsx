// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Plus, Search, Phone, User, DollarSign, Calendar, CheckCircle2, XCircle, Trash2, Edit, X, Save, Clock, Filter, UserCheck, AlertCircle, TrendingUp, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, where, getDocs, setDoc } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { FileText } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface Donor {
  id: string;
  name: string;
  phone: string;
  amount: number;
  collectorName?: string;
  notes?: string;
  createdAt: any;
}

interface PaymentRecord {
  id: string;
  donorId: string;
  month: number;
  year: number;
  isCollected: boolean;
  amount: number;
  income?: number;
  expenses?: number;
  collectorName?: string;
  notes?: string;
  createdAt: any;
}

interface SponsorshipItem extends Donor {
  isCollected: boolean;
  paymentId?: string;
  paymentAmount?: number;
  paymentIncome?: number;
  paymentExpenses?: number;
  paymentCollector?: string;
}

const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

export default function SponsorshipsScreen() {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [showAddDonorForm, setShowAddDonorForm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedItemForPayment, setSelectedItemForPayment] = useState<SponsorshipItem | null>(null);
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [collectorFilter, setCollectorFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);

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

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    amount: '',
    collectorName: '',
    notes: ''
  });

  const [paymentFormData, setPaymentFormData] = useState({
    income: '',
    expenses: '',
    collectorName: '',
    notes: ''
  });

  // Listen to all permanent donors
  useEffect(() => {
    const q = query(collection(db, 'sponsorship_donors'), orderBy('createdAt', sortOrder));
    return onSnapshot(q, (snapshot) => {
      setDonors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Donor)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'sponsorship_donors'));
  }, [sortOrder]);

  // Listen to payments for the selected month/year
  useEffect(() => {
    const q = query(
      collection(db, 'sponsorship_payments'),
      where('month', '==', selectedMonth),
      where('year', '==', selectedYear)
    );
    return onSnapshot(q, (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'sponsorship_payments'));
  }, [selectedMonth, selectedYear]);

  const joinedData: SponsorshipItem[] = donors.map(donor => {
    const payment = payments.find(p => p.donorId === donor.id);
    return {
      ...donor,
      isCollected: payment ? payment.isCollected : false,
      paymentId: payment?.id,
      paymentAmount: payment?.amount,
      paymentIncome: payment?.income,
      paymentExpenses: payment?.expenses,
      paymentCollector: payment?.collectorName || donor.collectorName
    };
  });

  const filtered = joinedData.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.phone.includes(searchQuery);
    const matchesCollector = !collectorFilter || d.paymentCollector === collectorFilter || d.collectorName === collectorFilter;
    return matchesSearch && matchesCollector;
  });

  const uniqueCollectors = Array.from(new Set([
    ...donors.map(d => d.collectorName).filter(Boolean),
    ...payments.map(p => p.collectorName).filter(Boolean)
  ])).sort();

  const groupedFiltered = filtered.reduce((acc, item) => {
    const collector = item.paymentCollector || item.collectorName || 'غير محدد';
    if (!acc[collector]) acc[collector] = [];
    acc[collector].push(item);
    return acc;
  }, {} as Record<string, SponsorshipItem[]>);

  const collectorNamesSorted = Object.keys(groupedFiltered).sort();

  const handleAddDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingDonor) {
        await updateDoc(doc(db, 'sponsorship_donors', editingDonor.id), {
          name: formData.name,
          phone: formData.phone,
          amount: Number(formData.amount),
          collectorName: formData.collectorName,
          notes: formData.notes,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'sponsorship_donors'), {
          name: formData.name,
          phone: formData.phone,
          amount: Number(formData.amount),
          collectorName: formData.collectorName,
          notes: formData.notes,
          createdAt: serverTimestamp()
        });
      }
      setShowAddDonorForm(false);
      setEditingDonor(null);
      setFormData({ name: '', phone: '', amount: '', collectorName: '', notes: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sponsorship_donors');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForPayment) return;
    setLoading(true);
    try {
      if (selectedItemForPayment.paymentId) {
        await updateDoc(doc(db, 'sponsorship_payments', selectedItemForPayment.paymentId), {
          income: Number(paymentFormData.income),
          expenses: Number(paymentFormData.expenses),
          collectorName: paymentFormData.collectorName,
          notes: paymentFormData.notes,
          isCollected: true,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'sponsorship_payments'), {
          donorId: selectedItemForPayment.id,
          month: selectedMonth,
          year: selectedYear,
          isCollected: true,
          amount: selectedItemForPayment.amount,
          income: Number(paymentFormData.income),
          expenses: Number(paymentFormData.expenses),
          collectorName: paymentFormData.collectorName,
          notes: paymentFormData.notes,
          createdAt: serverTimestamp()
        });
      }
      setShowPaymentModal(false);
      setSelectedItemForPayment(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sponsorship_payments');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!selectedItemForPayment?.paymentId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'إلغاء التحصيل',
      message: `هل أنت متأكد من إلغاء عملية التحصيل لهذا الشهر؟ سيتم حذف بيانات الوارد والمنصرف لهذا السجل.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'sponsorship_payments', selectedItemForPayment.paymentId!));
          setShowPaymentModal(false);
          setSelectedItemForPayment(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `sponsorship_payments/${selectedItemForPayment.paymentId}`);
        }
      }
    });
  };

  const toggleCollection = async (item: SponsorshipItem) => {
    setSelectedItemForPayment(item);
    setPaymentFormData({
      income: String(item.paymentIncome ?? item.amount ?? 0),
      expenses: String(item.paymentExpenses ?? 0),
      collectorName: item.paymentCollector || item.collectorName || '',
      notes: ''
    });
    setShowPaymentModal(true);
  };

  const handleDeleteDonor = async (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف متبرع',
      message: `هل أنت متأكد من حذف المتبرع "${name}" نهائياً؟ سيتم حذف بياناته من جميع الشهور.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'sponsorship_donors', id));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `sponsorship_donors/${id}`);
        }
      }
    });
  };

  const stats = {
    totalRequired: filtered.reduce((acc, d) => acc + d.amount, 0),
    totalCollected: filtered.reduce((acc, d) => acc + (d.paymentIncome || 0), 0),
    totalSpent: filtered.reduce((acc, d) => acc + (d.paymentExpenses || 0), 0),
    count: filtered.length,
    collectedCount: filtered.filter(d => d.isCollected).length
  };

  return (
    <div className="p-4 lg:p-8 font-sans" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-emerald-950 flex items-center gap-3">
            <UserCheck className="w-8 h-8 text-emerald-600" />
            تحصيل كفالات شهر {months[selectedMonth-1]}
          </h1>
          <p className="text-stone-500 font-bold mt-1">المتبرعون ثابتون شهرياً، ويحق لك تتبع التحصيل لكل شهر</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDownloadPDF(`كشف_كفالات_${months[selectedMonth-1]}`, 'sponsorships-table-full')}
            className="flex-grow lg:flex-none border-2 border-emerald-100 text-emerald-700 bg-white px-8 py-4 rounded-2xl font-black text-lg hover:bg-emerald-50 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <FileText className="w-6 h-6" />
            تحميل PDF
          </button>
          <button 
            onClick={() => setShowAddDonorForm(true)}
            className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 group"
          >
            <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            إضافة متبرع (كفيل) جديد
          </button>
        </div>
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-3xl border-2 border-emerald-50 shadow-sm">
          <label className="text-xs font-black text-emerald-800 block mb-3 pr-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            اختر الشهر والسنة
          </label>
          <div className="flex gap-2">
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="flex-grow bg-emerald-50 border-none p-3 rounded-xl font-bold text-emerald-900 outline-none cursor-pointer"
            >
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <input 
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-24 bg-emerald-50 border-none p-3 rounded-xl font-bold text-emerald-900 outline-none text-center"
            />
          </div>
        </div>

        <div className="bg-emerald-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-100 flex items-center gap-4 relative overflow-hidden">
          <TrendingUp className="absolute -right-4 -bottom-4 w-24 h-24 text-white/10 -rotate-12" />
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center relative z-10">
            <DollarSign className="w-6 h-6" />
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold opacity-80">إجمالي المطلوب</p>
            <p className="text-2xl font-black tabular-nums">{stats.totalRequired.toLocaleString()} ج.م</p>
          </div>
        </div>

        <div className="bg-emerald-500 p-6 rounded-3xl text-white shadow-lg shadow-emerald-50 flex items-center gap-4 border-b-4 border-emerald-600">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold opacity-80">إجمالي الوارد (المحصل)</p>
            <p className="text-2xl font-black tabular-nums">{stats.totalCollected.toLocaleString()} ج.م</p>
          </div>
        </div>

        <div className="bg-rose-500 p-6 rounded-3xl text-white shadow-lg shadow-rose-50 flex items-center gap-4 border-b-4 border-rose-600">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 rotate-180" />
          </div>
          <div>
            <p className="text-xs font-bold opacity-80">إجمالي المنصرف</p>
            <p className="text-2xl font-black tabular-nums">{stats.totalSpent.toLocaleString()} ج.م</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border-2 border-emerald-50 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-emerald-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-emerald-50/10">
          <div className="flex flex-col md:flex-row gap-4 flex-grow max-w-3xl">
            <div className="relative flex-grow">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 w-5 h-5" />
              <input 
                type="text"
                placeholder="ابحث عن متبرع بالاسم أو الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-emerald-50 p-4 pr-12 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500/20 text-right text-emerald-950 shadow-inner text-sm"
              />
            </div>
            <select 
              className="bg-white border border-emerald-50 px-6 py-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500/20 text-right text-emerald-950 shadow-inner text-sm min-w-[150px]"
              value={collectorFilter}
              onChange={(e) => setCollectorFilter(e.target.value)}
            >
              <option value="">كل المحصلين</option>
              {uniqueCollectors.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select 
              className="bg-white border border-emerald-50 px-6 py-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500/20 text-right text-emerald-950 shadow-inner text-sm"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
            >
              <option value="desc">الأحدث أولاً</option>
              <option value="asc">الأقدم أولاً</option>
            </select>
          </div>
          <div className="flex items-center gap-6 text-emerald-900 font-bold">
            <div className="text-right">
                <span className="text-[10px] block text-stone-400">إجمالي المتبرعين</span>
                <span className="text-sm font-black">{stats.count} كفيل</span>
            </div>
            <div className="h-8 w-px bg-emerald-100" />
            <div className="text-right">
                <span className="text-[10px] block text-stone-400">نسبة التحصيل</span>
                <span className="text-sm font-black text-emerald-600">{Math.round((stats.collectedCount / (stats.count || 1)) * 100)}%</span>
            </div>
          </div>
        </div>

        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          <table id="sponsorships-table-full" className="w-full text-right border-collapse min-w-[1000px] bg-white">
            <thead>
              <tr className="bg-emerald-50/50">
                <th className="px-6 py-5 text-emerald-900 font-black">اسم المتبرع / المحصل</th>
                <th className="px-6 py-5 text-emerald-900 font-black text-center">المطلوب</th>
                <th className="px-6 py-5 text-emerald-900 font-black text-center text-emerald-600">الوارد</th>
                <th className="px-6 py-5 text-emerald-900 font-black text-center text-rose-600">المنصرف</th>
                <th className="px-6 py-5 text-emerald-900 font-black text-center">الحالة</th>
                <th className="px-6 py-5 text-emerald-900 font-black text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {collectorNamesSorted.map(collector => (
                <React.Fragment key={collector}>
                  <tr className="bg-stone-50/80 border-y border-stone-200">
                    <td colSpan={6} className="px-6 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-stone-600 font-black text-sm">
                          <UserCheck className="w-4 h-4 text-emerald-600" />
                          كشف المحصل: {collector}
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] mr-2">
                             {groupedFiltered[collector].length} كفيل
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-black text-stone-400">
                           <span>الوارد: {groupedFiltered[collector].reduce((a, b) => a + (b.paymentIncome || 0), 0).toLocaleString()}</span>
                           <span>المنصرف: {groupedFiltered[collector].reduce((a, b) => a + (b.paymentExpenses || 0), 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {groupedFiltered[collector].map(item => (
                    <tr key={item.id} className={`hover:bg-emerald-50/20 transition-all group ${item.isCollected ? 'bg-emerald-50/10' : ''}`}>
                      <td className="px-6 py-5">
                          <p className="font-black text-stone-900 text-lg">{item.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded font-black">المحصل: {item.paymentCollector || 'غير محدد'}</span>
                            {item.notes && <span className="text-[10px] text-stone-400 font-bold border-r pr-2 border-stone-200">{item.notes}</span>}
                          </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                          <span className="inline-block text-stone-600 font-bold tabular-nums">
                            {item.amount.toLocaleString()}
                          </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                          <span className="inline-block bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg font-black tabular-nums">
                            {(item.paymentIncome || 0).toLocaleString()}
                          </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                          <span className="inline-block bg-rose-50 text-rose-700 px-3 py-1 rounded-lg font-black tabular-nums">
                            {(item.paymentExpenses || 0).toLocaleString()}
                          </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <button 
                          onClick={() => toggleCollection(item)}
                          className={`px-4 py-2 rounded-xl font-black text-xs transition-all flex items-center gap-2 mx-auto shadow-sm ${
                            item.isCollected 
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                            : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                          }`}
                        >
                          {item.isCollected ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                تم التحصيل
                              </>
                          ) : (
                              <>
                                <Clock className="w-3 h-3 opacity-50" />
                                بانتظار التحصيل
                              </>
                          )}
                        </button>
                        <div className="mt-2">
                            <a href={`tel:${item.phone}`} className="text-[10px] font-black text-stone-400 hover:text-emerald-600 tabular-nums">
                                {item.phone}
                            </a>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                             onClick={() => {
                               setEditingDonor(item);
                               setFormData({
                                 name: item.name,
                                 amount: String(item.amount ?? 0),
                                 phone: item.phone,
                                 collectorName: item.collectorName || '',
                                 notes: item.notes || ''
                               });
                               setShowAddDonorForm(true);
                             }}
                             className="p-3 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-2xl transition-all shadow-sm"
                             title="تعديل بيانات المتبرع"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteDonor(item.id, item.name)}
                            className="p-3 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-2xl transition-all shadow-sm"
                            title="حذف المتبرع"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-32 text-center text-stone-400">
                    <div className="flex flex-col items-center gap-4">
                        <AlertCircle className="w-16 h-16 text-stone-100" />
                        <p className="text-xl font-bold">لم تضف أي متبرعين دائمين بعد</p>
                        <button 
                          onClick={() => setShowAddDonorForm(true)}
                          className="text-emerald-600 font-black hover:underline"
                        >
                            سجل أول متبرع (كفيل) الآن
                        </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showPaymentModal && selectedItemForPayment && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[3rem] shadow-2xl max-w-lg w-full p-10 relative"
            >
              <div className="flex items-center justify-between mb-8 text-right">
                <div>
                    <h2 className="text-2xl font-black text-emerald-950">تحصيل كفالة شهر {months[selectedMonth-1]}</h2>
                    <p className="text-emerald-600 font-bold">{selectedItemForPayment.name}</p>
                </div>
                <button onClick={() => setShowPaymentModal(false)} className="p-3 hover:bg-stone-50 rounded-3xl transition-all font-black underline underline-offset-4 text-xs">إغلاق</button>
              </div>

              <form onSubmit={handlePaymentSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-right text-emerald-800">
                    <label className="text-sm font-black pr-2">المبلغ الوارد</label>
                    <input 
                      type="number" required
                      value={paymentFormData.income}
                      onChange={(e) => setPaymentFormData({...paymentFormData, income: e.target.value})}
                      className="w-full bg-emerald-50 border-2 border-transparent p-5 rounded-2xl focus:border-emerald-500 outline-none font-black text-right transition-all tabular-nums"
                    />
                  </div>
                  <div className="space-y-2 text-right text-rose-800">
                    <label className="text-sm font-black pr-2">المصروفات/المنصرف</label>
                    <input 
                      type="number" required
                      value={paymentFormData.expenses}
                      onChange={(e) => setPaymentFormData({...paymentFormData, expenses: e.target.value})}
                      className="w-full bg-rose-50 border-2 border-transparent p-5 rounded-2xl focus:border-rose-500 outline-none font-black text-right transition-all tabular-nums"
                    />
                  </div>
                </div>

                <div className="space-y-2 text-right">
                  <label className="text-sm font-black text-emerald-800 pr-2">اسم المحصل لهذا الشهر</label>
                  <input 
                      type="text" required
                      value={paymentFormData.collectorName}
                      onChange={(e) => setPaymentFormData({...paymentFormData, collectorName: e.target.value})}
                      className="w-full bg-stone-50 border-2 border-emerald-50 p-5 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                  />
                </div>

                <div className="space-y-2 text-right">
                  <label className="text-sm font-black text-emerald-800 pr-2">ملاحظات التحصيل</label>
                  <textarea 
                    value={paymentFormData.notes}
                    onChange={(e) => setPaymentFormData({...paymentFormData, notes: e.target.value})}
                    rows={2}
                    className="w-full bg-stone-50 border-2 border-emerald-50 p-5 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right resize-none"
                  />
                </div>

                <button 
                  disabled={loading}
                  className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Clock className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                  <span>حفظ وإثبات التحصيل</span>
                </button>

                {selectedItemForPayment.paymentId && (
                  <button 
                    type="button"
                    onClick={handleDeletePayment}
                    className="w-full text-rose-600 font-bold text-sm hover:underline mt-2 p-2"
                  >
                    حذف بيانات التحصيل (إلغاء التحصيل لهذا الشهر)
                  </button>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddDonorForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[3rem] shadow-2xl max-w-lg w-full p-10 relative"
            >
              <div className="flex items-center justify-between mb-8 text-right">
                <div>
                    <h2 className="text-2xl font-black text-emerald-950">
                        {editingDonor ? 'تعديل بيانات المتبرع' : 'إضافة متبرع دائم'}
                    </h2>
                    <p className="text-stone-400 font-bold text-sm">بيانات المتبرع التي تظهر تلقائياً كل شهر</p>
                </div>
                <button onClick={() => {
                  setShowAddDonorForm(false);
                  setEditingDonor(null);
                  setFormData({ name: '', phone: '', amount: '', collectorName: '', notes: '' });
                }} className="p-3 hover:bg-stone-50 rounded-3xl transition-all">
                  <X className="w-6 h-6 text-stone-400" />
                </button>
              </div>

              <form onSubmit={handleAddDonor} className="space-y-6">
                <div className="space-y-2 text-right">
                  <label className="text-sm font-black text-emerald-800 pr-2">اسم المتبرع (الكفيل)</label>
                  <div className="relative">
                    <User className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 w-5 h-5 shadow-sm" />
                    <input 
                        type="text" required
                        placeholder="أدخل اسم المتبرع كاملاً"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-5 pr-12 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right text-emerald-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-right">
                    <label className="text-sm font-black text-emerald-800 pr-2">المبلغ الثابت</label>
                    <div className="relative">
                        <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 w-5 h-5 shadow-sm" />
                        <input 
                        type="number" required
                        placeholder="ج.م"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-5 pr-12 rounded-2xl focus:border-emerald-500 outline-none transition-all font-black text-right text-emerald-950 tabular-nums"
                        />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <label className="text-sm font-black text-emerald-800 pr-2">رقم الهاتف</label>
                    <div className="relative">
                        <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 w-5 h-5 shadow-sm" />
                        <input 
                        type="text" required
                        placeholder="01xxxxxxxxx"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-5 pr-12 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right text-emerald-950 tabular-nums"
                        />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-right">
                  <label className="text-sm font-black text-emerald-800 pr-2">اسم المحصل الافتراضي</label>
                  <div className="relative">
                    <UserCheck className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 w-5 h-5 shadow-sm" />
                    <input 
                        type="text"
                        placeholder="اسم الشخص المسؤول عن التحصيل"
                        value={formData.collectorName}
                        onChange={(e) => setFormData({...formData, collectorName: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-5 pr-12 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right text-emerald-950"
                    />
                  </div>
                </div>

                <div className="space-y-2 text-right">
                  <label className="text-sm font-black text-emerald-800 pr-2">ملاحظات إضافية</label>
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={3}
                    placeholder="مثلاً: يفضل الدفع قبل يوم 10..."
                    className="w-full bg-stone-50 border-2 border-emerald-50 p-5 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right resize-none text-emerald-950"
                  />
                </div>

                <button 
                  disabled={loading}
                  className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 transition-all shadow-2xl shadow-emerald-200 flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  {loading ? <Clock className="w-6 h-6 animate-spin" /> : (editingDonor ? <Save className="w-6 h-6" /> : <Plus className="w-6 h-6" />)}
                  <span>{loading ? 'جاري الحفظ...' : (editingDonor ? 'حفظ التغييرات' : 'إضافة المتبرع')}</span>
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
    </div>
  );
}