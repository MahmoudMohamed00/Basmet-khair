// @ts-nocheck
import React, { useState, useEffect, ReactNode } from 'react';
import { Plus, Search, Phone, User, Mail, DollarSign, Calendar, X, Edit, Trash2, Tag, Target, FileCheck, Printer, MessageSquare, UploadCloud, Info, CheckCircle2, AlertCircle, Clock, Loader2, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ConfirmModal from './ConfirmModal';
import * as XLSX from 'xlsx';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useRef } from 'react';
import { uploadToGoogleDrive } from '../lib/driveUpload';

import FileUploadSlot, { FileAttachment } from './FileUploadSlot';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface Donor {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalDonations: number;
  lastDonationDate: string;
  donationType?: string;
  campaign?: string;
  status: 'pending' | 'active' | 'rejected';
  collectionStatus: 'collected' | 'pending' | 'not_collected';
  attachments?: FileAttachment[];
}

import Logo from './Logo';

export default function DonorsScreen() {
  const [showForm, setShowForm] = useState(false);
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const DONOR_MAPPING_FIELDS = [
    { id: 'name', label: 'اسم المتبرع' },
    { id: 'phone', label: 'رقم الهاتف' },
    { id: 'email', label: 'البريد الإلكتروني' },
    { id: 'donationType', label: 'نوع التبرع' },
    { id: 'campaign', label: 'الحملة' },
    { id: 'totalDonations', label: 'قيمة التبرع' },
    { id: 'lastDonationDate', label: 'تاريخ التبرع' }
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
          DONOR_MAPPING_FIELDS.forEach(field => {
            const match = headers.find(h => 
              h.includes(field.label) || 
              field.label.includes(h) ||
              (field.id === 'name' && (h.includes('الاسم') || h.includes('المتبرع'))) ||
              (field.id === 'phone' && (h.includes('الهاتف') || h.includes('الموبايل') || h.includes('تليفون'))) ||
              (field.id === 'totalDonations' && (h.includes('مبلغ') || h.includes('قيمة') || h.includes('تبرع')))
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
      const batch = writeBatch(db);
      
      for (const row of importData.rows) {
        const getVal = (fieldId: string) => fieldMapping[fieldId] ? String(row[fieldMapping[fieldId]] || '') : '';
        const name = getVal('name').trim();
        if (name) {
          const docRef = doc(collection(db, 'donors'));
          batch.set(docRef, {
            name,
            phone: getVal('phone'),
            email: getVal('email'),
            donationType: getVal('donationType') || 'نقدي',
            campaign: getVal('campaign') || 'عام',
            totalDonations: Number(getVal('totalDonations')) || 0,
            lastDonationDate: getVal('lastDonationDate') || new Date().toISOString().split('T')[0],
            status: 'active',
            collectionStatus: 'collected',
            createdAt: serverTimestamp()
          });
          count++;
          
          if (count % 400 === 0) {
            await batch.commit();
          }
        }
      }
      await batch.commit();
      alert(`تم استيراد ${count} متبرع بنجاح`);
      setImportData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'donors');
    } finally {
      setImporting(false);
    }
  };

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

  const handlePrintDonors = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printDate = new Date().toLocaleDateString('ar-EG');
    const totalAmount = filteredDonors.reduce((sum, d) => sum + (d.totalDonations || 0), 0);

    const content = `
      <html>
        <head>
          <title>كشف المتبرعين - بصمة خير</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 20px; color: #333; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #059669; padding-bottom: 15px; }
            .society-details { text-align: right; }
            .society-details p { margin: 2px 0; font-size: 14px; font-weight: bold; }
            .report-title { text-align: center; margin: 20px 0; }
            .report-title h1 { color: #059669; font-size: 24px; margin-bottom: 5px; }
            .report-title p { color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #059669; padding: 8px; text-align: center; font-size: 13px; }
            th { background-color: #f0fdf4; color: #059669; }
            .footer-info { margin-top: 30px; font-weight: bold; font-size: 16px; color: #059669; text-align: left; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header-info">
            <div class="society-details">
              <p>جمعية بصمة خير نبروه</p>
              <p>كشف بأسماء المتبرعين والمساهمين</p>
            </div>
            <div style="text-align: center;">
            </div>
            <div style="text-align: left;">
              <p>التاريخ: ${printDate}</p>
              <p>عدد المتبرعين: ${filteredDonors.length}</p>
            </div>
          </div>

          <div class="report-title">
            <h1>كشف المتبرعين</h1>
            <p>سجل المساهمات والداعمين لرحلة الخير</p>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">م</th>
                <th>الاسم</th>
                <th>رقم الهاتف</th>
                <th>نوع التبرع</th>
                <th>الحملة</th>
                <th>إجمالي المبلغ</th>
              </tr>
            </thead>
            <tbody>
              ${filteredDonors.map((d, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td style="text-align: right; font-weight: bold;">${d.name}</td>
                  <td>${d.phone}</td>
                  <td>${d.donationType || 'عادي'}</td>
                  <td>${d.campaign || 'عام'}</td>
                  <td style="font-weight: bold;">${d.totalDonations.toLocaleString()} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer-info">
            إجمالي التبرعات في هذا الكشف: ${totalAmount.toLocaleString()} ج.م
          </div>
          
          <div style="margin-top: 50px; text-align: center; font-size: 10px; color: #999;">
            تم استخراج هذا الكشف بواسطة نظام بصمة خير - تطوير محمود جاويش (Mahmoud Gawish)
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const initialFormData = {
    name: '',
    phone: '',
    email: '',
    totalDonations: 0,
    lastDonationDate: new Date().toISOString().split('T')[0],
    donationType: 'نقدي',
    campaign: 'عام',
    status: 'active' as const,
    collectionStatus: 'collected' as const,
    attachments: [] as FileAttachment[]
  };
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    const q = query(collection(db, 'donors'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const donorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Donor));
      setDonors(donorsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'donors');
    });

    return () => unsubscribe();
  }, []);

  const handleOpenEdit = (donor: Donor) => {
    setEditingDonor(donor);
    setFormData({
      name: donor.name || '',
      phone: donor.phone || '',
      email: donor.email || '',
      totalDonations: donor.totalDonations || 0,
      lastDonationDate: donor.lastDonationDate || '',
      donationType: donor.donationType || 'نقدي',
      campaign: donor.campaign || 'عام',
      status: donor.status || 'active',
      collectionStatus: donor.collectionStatus || 'collected',
      attachments: donor.attachments || []
    });
    setShowForm(true);
  };

  const handleSaveDonor = (e: React.FormEvent) => {
    e.preventDefault();
    
    setConfirmConfig({
      isOpen: true,
      title: editingDonor ? 'تأكيد التعديل' : 'تأكيد الإضافة',
      message: editingDonor 
        ? `هل أنت متأكد من حفظ التعديلات على بيانات المتبرع "${formData.name}"؟` 
        : `هل أنت متأكد من رغبتك في إضافة المتبرع الجديد "${formData.name}"؟`,
      onConfirm: async () => {
        try {
          if (editingDonor) {
            await updateDoc(doc(db, 'donors', editingDonor.id), {
              ...formData,
              totalDonations: Number(formData.totalDonations),
              updatedAt: serverTimestamp(),
            });
          } else {
            await addDoc(collection(db, 'donors'), {
              ...formData,
              totalDonations: Number(formData.totalDonations),
              createdAt: serverTimestamp(),
            });
          }
          setShowForm(false);
          setEditingDonor(null);
          setFormData(initialFormData);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, editingDonor ? OperationType.UPDATE : OperationType.CREATE, 'donors');
        }
      }
    });
  };

  const generateReceipt = async (donor: Donor) => {
    const receiptElement = document.createElement('div');
    receiptElement.style.position = 'absolute';
    receiptElement.style.left = '-9999px';
    receiptElement.style.width = '600px';
    receiptElement.style.padding = '40px';
    receiptElement.style.background = '#ffffff';
    receiptElement.style.direction = 'rtl';
    receiptElement.style.fontFamily = 'Arial, sans-serif';
    
    receiptElement.innerHTML = `
      <div style="border: 4px double #059669; padding: 20px; border-radius: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
          <div style="text-align: right;">
            <h1 style="color: #059669; margin: 0; font-size: 24px;">جمعية بصمة خير نبروه</h1>
            <p style="margin: 5px 0; font-size: 14px; color: #1e293b;">رعاية المحتاجين والأيتام</p>
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="text-decoration: underline; color: #1e293b;">إيصال استلام تبرع</h2>
          <p style="color: #64748b;">رقم مرجعي: ${donor.id.substring(0, 8).toUpperCase()}</p>
        </div>

        <div style="line-height: 2; font-size: 16px; color: #1e293b;">
          <p>استلمنا من السيد/السيدة: <strong style="color: #059669;">${donor.name}</strong></p>
          <p>مبلغاً وقدره: <strong style="color: #059669;">${donor.totalDonations.toLocaleString()} ج.م</strong></p>
          <p>نوع التبرع: <strong>${donor.donationType || 'عام'}</strong></p>
          <p>وذلك لصالح: <strong>${donor.campaign || 'أعمال الخير'}</strong></p>
          <p>بتاريخ: <strong>${donor.lastDonationDate}</strong></p>
        </div>

        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
          <div style="text-align: center;">
            <p style="margin: 0;">توقيع المستلم</p>
            <div style="margin-top: 40px; border-bottom: 1px solid #cbd5e1; width: 120px;"></div>
          </div>
          <div style="text-align: center;">
            <p style="margin: 0;">ختم الجمعية</p>
            <div style="margin-top: 10px; width: 80px; hieght: 80px; border: 3px solid #fecaca; border-radius: 50%; opacity: 0.5; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 8px; transform: rotate(-15deg);">
              بصمة خير
            </div>
          </div>
        </div>

        <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8;">
          <p>نبروه - الدقهلية | هاتف: 01000000000</p>
          <p>جزاكم الله خيراً على مساهمتكم - هذا الإيصال صادر إلكترونياً</p>
        </div>
      </div>
    `;

    document.body.appendChild(receiptElement);
    
    try {
      const canvas = await html2canvas(receiptElement, {
        scale: 2,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
      pdf.save(`Receipt-${donor.name}-${donor.id.substring(0, 5)}.pdf`);
    } finally {
      document.body.removeChild(receiptElement);
    }
  };

  const handleDeleteDonor = (id: string, name: string) => {
    const donorData = donors.find(d => d.id === id);
    setConfirmConfig({
      isOpen: true,
      title: 'حذف متبرع',
      message: `هل أنت متأكد من حذف المتبرع "${name}"؟ سيم حذف جميع بياناته نهائياً.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'donors', id));
          if (donorData) {
            await logSystemAction('delete', 'donors', id, donorData, `حذف متبرع: ${name}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `donors/${id}`);
        }
      }
    });
  };

  const handleDeleteAllDonors = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف جميع المتبرعين',
      message: 'تحذير: أنت على وشك حذف جميع الداعمين من قاعدة البيانات. هل أنت متأكد؟',
      onConfirm: async () => {
        try {
          const q = query(collection(db, 'donors'));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'donors');
        }
      }
    });
  };

  const filteredDonors = donors.filter(d => {
    const matchesSearch = d.name.includes(searchQuery) || d.phone.includes(searchQuery);
    // Only show active donors for regular view, unless searching
    const matchesStatus = d.status === 'active' || searchQuery !== '';
    return matchesSearch && matchesStatus;
  });

  const totalAmount = donors.reduce((sum, d) => sum + (d.totalDonations || 0), 0);
  const targetAmount = 500000; // Default target
  const progressPercentage = Math.min((totalAmount / targetAmount) * 100, 100);

  return (
    <div className="p-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-right">
        <div>
          <h1 className="text-3xl font-bold text-emerald-900">إدارة المتبرعين</h1>
          <p className="text-emerald-700/60 mt-1">قاعدة بيانات الداعمين والمساهمين في رحلة الخير</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDownloadPDF('كشف_المتبرعين', 'donors-table-full')}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-100 transition-all font-bold shadow-sm border border-emerald-100"
          >
            <FileText className="w-5 h-5" />
            <span>تحميل PDF</span>
          </button>
          <label className="flex items-center justify-center p-3 bg-white border-2 border-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-50 transition-all shadow-sm cursor-pointer" title="استيراد متبرعين">
            <UploadCloud className={`w-6 h-6 ${importing ? 'animate-bounce' : ''}`} />
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
          </label>
          <button 
            onClick={handlePrintDonors}
            className="flex items-center gap-2 bg-white border-2 border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all font-bold shadow-sm"
          >
            <Printer className="w-5 h-5" />
            <span>طباعة كشف المتبرعين</span>
          </button>
          <button 
            onClick={handleDeleteAllDonors}
            className="flex items-center gap-2 bg-rose-50 border-2 border-rose-100 text-rose-700 px-6 py-3 rounded-xl hover:bg-rose-100 transition-all font-bold shadow-sm"
          >
            <Trash2 className="w-5 h-5" />
            <span>حذف الكل</span>
          </button>
          <button 
            onClick={() => { setEditingDonor(null); setFormData(initialFormData); setShowForm(true); }}
            className="flex items-center gap-2 bg-rose-600 text-white px-6 py-3 rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all font-bold whitespace-nowrap justify-center"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة متبرع جديد</span>
          </button>
        </div>
      </div>

      {/* Enhanced Total Donations Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
             <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl animate-pulse" />
             <div className="absolute bottom-10 right-10 w-48 h-48 bg-emerald-400 rounded-full blur-3xl" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-right flex-grow w-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-emerald-400/20 p-3 rounded-2xl backdrop-blur-md border border-emerald-400/30">
                  <DollarSign className="w-8 h-8 text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-emerald-100/60 font-bold text-lg">إجمالي التبرعات والمساهمات</h2>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-black text-white tabular-nums tracking-tighter">
                      {totalAmount.toLocaleString()}
                    </span>
                    <span className="text-2xl font-black text-emerald-400">ج.م</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-end mb-1 px-1">
                  <span className="text-emerald-300 text-sm font-black">هدف الحملة: {targetAmount.toLocaleString()} ج.م</span>
                  <span className="text-white text-xl font-black tabular-nums">{progressPercentage.toFixed(1)}%</span>
                </div>
                <div className="h-4 bg-emerald-950/50 rounded-full overflow-hidden border border-emerald-800 p-0.5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 w-full md:w-auto">
               <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex items-center gap-4 group-hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 bg-rose-500/20 rounded-2xl flex items-center justify-center border border-rose-500/30">
                    <User className="w-6 h-6 text-rose-300" />
                  </div>
                  <div>
                    <p className="text-emerald-100/60 text-xs font-bold">عدد المتبرعين</p>
                    <p className="text-2xl font-black text-white tabular-nums">{donors.length}</p>
                  </div>
               </div>
               <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex items-center gap-4 group-hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30">
                    <Calendar className="w-6 h-6 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-emerald-100/60 text-xs font-bold">آخر تبرع</p>
                    <p className="text-lg font-black text-white tabular-nums">
                      {donors[0]?.lastDonationDate || '---'}
                    </p>
                  </div>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border-2 border-emerald-50 p-8 shadow-sm flex flex-col justify-between hover:border-emerald-200 transition-colors">
           <div>
             <h3 className="text-xl font-black text-emerald-950 mb-2">توزيع التبرعات</h3>
             <p className="text-sm font-bold text-emerald-600/60 mb-6 font-sans">نظرة سريعة على جودة التحصيل والمساهمات</p>
             
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                      <span className="font-bold text-emerald-900">تم التحصيل</span>
                   </div>
                   <span className="font-black tabular-nums">{donors.filter(d => d.collectionStatus === 'collected').length}</span>
                </div>
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-amber-500 rounded-full" />
                      <span className="font-bold text-emerald-900">جاري التحصيل</span>
                   </div>
                   <span className="font-black tabular-nums">{donors.filter(d => d.collectionStatus === 'pending').length}</span>
                </div>
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-rose-500 rounded-full" />
                      <span className="font-bold text-emerald-900">لم يتم التحصيل</span>
                   </div>
                   <span className="font-black tabular-nums">{donors.filter(d => d.collectionStatus === 'not_collected').length}</span>
                </div>
             </div>
           </div>
           
           <div className="mt-8 pt-6 border-t border-emerald-50">
              <button 
                onClick={() => setSearchQuery('جاري')}
                className="w-full py-4 text-emerald-700 font-black rounded-2xl bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
              >
                عرض المتأخرات
                <Info className="w-5 h-5" />
              </button>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden text-right">
        <div className="p-4 border-b border-emerald-50 bg-rose-50/20 flex items-center gap-2" dir="rtl">
          <Search className="w-5 h-5 text-rose-400 shrink-0" />
          <input 
            type="text" 
            placeholder="بحث بالاسم أو رقم الهاتف..."
            className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-900 placeholder-rose-300 outline-none text-right font-bold"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          {loading ? (
            <div className="p-12 text-center text-emerald-600 font-medium whitespace-nowrap">جاري التحميل...</div>
          ) : (
            <table id="donors-table-full" className="w-full text-right min-w-[1200px] bg-white" dir="rtl">
              <thead>
                <tr className="bg-stone-50 text-emerald-800 text-sm font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">اسم المتبرع</th>
                  <th className="px-6 py-4">بيانات التواصل</th>
                  <th className="px-6 py-4">نوع التبرع والحملة</th>
                  <th className="px-6 py-4">إجمالي المساهمات</th>
                  <th className="px-6 py-4">العمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50 text-right">
                {filteredDonors.length > 0 ? filteredDonors.map((d) => (
                  <tr key={d.id} className="hover:bg-rose-50/10 transition-colors">
                    <td className="px-6 py-4 font-bold text-emerald-950 flex items-center gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                        {d.name.substring(0, 1)}
                      </div>
                      {d.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <a href={`tel:${d.phone}`} className="text-emerald-800 text-sm tabular-nums hover:text-emerald-600 transition-colors flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {d.phone}
                        </a>
                        <a 
                          href={`https://wa.me/+2${d.phone.startsWith('0') ? d.phone.substring(1) : d.phone}?text=${encodeURIComponent(`تحية طيبة من جمعية بصمة خير، نشكركم على دعمكم المستمر وكفالتكم للأيتام.`)}`}
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1 font-bold text-emerald-600 hover:text-emerald-700 text-[10px] bg-emerald-50 px-2 py-0.5 rounded-lg w-fit"
                        >
                          <MessageSquare className="w-3 h-3" />
                          واتساب
                        </a>
                      </div>
                      <div className="text-xs text-emerald-600/70">{d.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-rose-600 mb-1">
                        <Tag className="w-3 h-3" />
                        <span>{d.donationType || 'غير محدد'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-emerald-600/60 font-bold">
                        <Target className="w-3 h-3" />
                        <span>{d.campaign || 'عام'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-emerald-700 tabular-nums">
                        {d.totalDonations?.toLocaleString()} ج.م
                      </div>
                      <div className={cn(
                        "text-[10px] font-bold mt-1 inline-block px-2 py-0.5 rounded-full",
                        d.collectionStatus === 'collected' ? "bg-emerald-100 text-emerald-700" :
                        d.collectionStatus === 'pending' ? "bg-amber-100 text-amber-700" :
                        "bg-rose-100 text-rose-700"
                      )}>
                        {d.collectionStatus === 'collected' ? 'تم التحصيل' :
                         d.collectionStatus === 'pending' ? 'جاري التحصيل' : 'لم يحصل'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => generateReceipt(d)}
                          className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-emerald-100 shadow-sm"
                          title="تحميل إيصال"
                        >
                          <FileCheck className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleOpenEdit(d)}
                          className="p-3 text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-rose-100 shadow-sm"
                          title="تعديل"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteDonor(d.id, d.name)}
                          className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-all hover:text-rose-600 border border-rose-100 shadow-sm"
                          title="حذف"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-emerald-400 font-bold">لا يوجد متبرعون مسجلون حالياً</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowForm(false); setEditingDonor(null); }}
              className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden relative z-10 font-sans" dir="rtl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-emerald-900">{editingDonor ? 'تعديل بيانات المتبرع' : 'إضافة متبرع جديد'}</h2>
                  <button onClick={() => { setShowForm(false); setEditingDonor(null); }} className="p-2 hover:bg-emerald-50 rounded-full">
                    <X className="w-6 h-6 text-emerald-400" />
                  </button>
                </div>

                <form className="space-y-4 max-h-[70vh] overflow-y-auto px-2 custom-scrollbar" onSubmit={handleSaveDonor}>
                  <FormField 
                    label="اسم المتبرع" 
                    icon={<User className="w-5 h-5 text-rose-400" />} 
                    placeholder="أدخل الاسم" 
                    value={formData.name}
                    onChange={(val) => setFormData({...formData, name: val})}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField 
                      label="رقم الهاتف" 
                      icon={<Phone className="w-5 h-5 text-rose-400" />} 
                      placeholder="01xxxxxxxxx" 
                      value={formData.phone}
                      onChange={(val) => setFormData({...formData, phone: val})}
                    />
                    <FormField 
                      label="البريد الإلكتروني" 
                      icon={<Mail className="w-5 h-5 text-rose-400" />} 
                      placeholder="example@mail.com" 
                      value={formData.email}
                      onChange={(val) => setFormData({...formData, email: val})}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 text-right">
                      <label className="text-sm font-bold text-emerald-800 px-1">نوع التبرع</label>
                      <div className="bg-stone-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-rose-500/20">
                        <Tag className="w-5 h-5 text-rose-400" />
                        <select 
                          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold text-right"
                          value={formData.donationType}
                          onChange={(e) => setFormData({...formData, donationType: e.target.value})}
                        >
                          <option>نقدي</option>
                          <option>عيني</option>
                          <option>كفالة أيتام</option>
                          <option>صدقة جارية</option>
                          <option>زكاة مال</option>
                          <option>إفطار صائم</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1 text-right">
                      <label className="text-sm font-bold text-emerald-800 px-1">الحملة</label>
                      <div className="bg-stone-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-rose-500/20">
                        <Target className="w-5 h-5 text-rose-400" />
                        <select 
                          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold text-right"
                          value={formData.campaign}
                          onChange={(e) => setFormData({...formData, campaign: e.target.value})}
                        >
                          <option>عام</option>
                          <option>حملة رمضان</option>
                          <option>كفالة أيتام</option>
                          <option>بناء مساجد</option>
                          <option>لحوم الأضاحي</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1 text-right">
                    <label className="text-sm font-bold text-emerald-800 px-1">حالة التحصيل</label>
                    <div className="bg-stone-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-rose-500/20">
                      <Edit className="w-5 h-5 text-rose-400" />
                      <select 
                        className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none font-bold text-right"
                        value={formData.collectionStatus}
                        onChange={(e) => setFormData({...formData, collectionStatus: e.target.value as any})}
                      >
                        <option value="collected">تم التحصيل ✅</option>
                        <option value="pending">جاري التحصيل ⏳</option>
                        <option value="not_collected">لم يحصول ❌</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField 
                      label="قيمة التبرع" 
                      icon={<DollarSign className="w-5 h-5 text-rose-400" />} 
                      placeholder="0.00" 
                      type="number"
                      value={String(formData.totalDonations ?? 0)}
                      onChange={(val) => setFormData({...formData, totalDonations: Number(val)})}
                    />
                    <FormField 
                      label="تاريخ التبرع" 
                      icon={<Calendar className="w-5 h-5 text-rose-400" />} 
                      placeholder="YYYY-MM-DD" 
                      type="date"
                      value={formData.lastDonationDate}
                      onChange={(val) => setFormData({...formData, lastDonationDate: val})}
                    />
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-emerald-50">
                    <label className="text-sm font-black text-emerald-800 border-r-4 border-amber-500 pr-3 block">إثبات التبرع (صور الرسائل / الوصولات)</label>
                    <FileUploadSlot 
                      label="رفع صورة إيصال أو رسالة تأكيد التبرع"
                      caseName={formData.name || 'متبرع_بدون_اسم'}
                      storagePath="donors/proofs"
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
                  
                  <div className="pt-6 flex gap-3 flex-row-reverse">
                    <button type="submit" className="flex-grow bg-rose-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all font-sans">
                      {editingDonor ? 'حفظ التغييرات' : 'تأكيد الإضافة'}
                    </button>
                    <button type="button" onClick={() => { setShowForm(false); setEditingDonor(null); setFormData(initialFormData); }} className="px-8 py-4 text-emerald-600 font-bold hover:bg-emerald-50 rounded-xl transition-all font-sans">إلغاء</button>
                  </div>
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

      {/* Excel Mapping Modal */}
      <AnimatePresence>
        {importData && (
          <div className="fixed inset-0 bg-emerald-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-5xl w-full p-8 my-8 text-right"
            >
              <div className="flex items-center justify-between mb-8 border-b border-emerald-100 pb-6">
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">تخصيص بيانات المتبرعين</h2>
                  <p className="text-emerald-500 font-bold font-sans">اربط أعمدة ملف الإكسل بالخانات المطلوبة لضمان دقة البيانات</p>
                </div>
                <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center">
                  <UploadCloud className="w-10 h-10 text-emerald-600" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-10">
                {DONOR_MAPPING_FIELDS.map(field => (
                  <div key={field.id} className="group">
                    <label className="text-sm font-black text-emerald-700 block mb-2 pr-2">
                        {field.label}
                        {field.id === 'name' && <span className="text-rose-500 mr-1">*</span>}
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
                    سيتم استيراد <span className="text-xl font-black tabular-nums">{importData.rows.length}</span> متبرع. 
                    تأكد من مراجعة الحقول المختارة بعناية قبل البدء.
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-amber-600 shrink-0" />
              </div>

              <div className="flex flex-row-reverse gap-4">
                <button 
                  onClick={processMappingImport}
                  disabled={importing || !fieldMapping.name}
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
}

function FormField({ label, icon, placeholder, value, onChange, type = "text" }: { label: string; icon: React.ReactNode; placeholder: string; value: string; onChange: (val: string) => void; type?: string }) {
  return (
    <div className="space-y-1 text-right">
      <label className="text-sm font-bold text-emerald-800 px-1">{label}</label>
      <div className="bg-stone-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-2 focus-within:ring-2 ring-rose-500/20">
        {icon}
        <input 
          type={type}
          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 outline-none placeholder-emerald-300 font-bold text-right"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}