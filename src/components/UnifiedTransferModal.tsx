// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRightLeft, Copy, Check, Loader2, FileSpreadsheet, Layers, HelpCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';

interface UnifiedTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  // The source case data mapped to unified fields
  caseData: {
    id: string; // Document ID
    name: string;
    nationalId: string;
    phone: string;
    address: string;
    village?: string;
    familyCount?: number;
    sourceSection: 'cases' | 'orphans' | 'reception' | 'medical' | 'seasonal' | 'marriage';
    sourceSectionLabel: string;
    sourceCollection: string;
    parentDistId?: string; // Only if source is a seasonal campaign beneficiary
  };
  onSuccess: () => void;
}

const SECTIONS = [
  { id: 'cases', label: 'قسم الحالات العامة (قاعدة البيانات)', collection: 'cases' },
  { id: 'orphans', label: 'قسم كفالة الأيتام', collection: 'orphans' },
  { id: 'reception', label: 'قسم الاستقبال والمساعدات', collection: 'reception_cases' },
  { id: 'medical', label: 'قسم الحالات الطبية والعيادة', collection: 'medicalCases' },
  { id: 'marriage', label: 'قسم تيسير زواج العرائس', collection: 'marriageCases' },
  { id: 'seasonal', label: 'قسم الحالات الموسمية وحملات التوزيع', collection: 'seasonal_distributions' }
];

const CASE_CATEGORIES = [
  'أيتام',
  'حالات موسمية',
  'مساعدة شهرية',
  'حالات مرضية',
  'مطلقات',
  'أسرة مريض',
  'متزوجين',
  'أسرة سجين',
  'غارمين',
  'أخرى'
];

export default function UnifiedTransferModal({ isOpen, onClose, caseData, onSuccess }: UnifiedTransferModalProps) {
  const [targetSection, setTargetSection] = useState<string>('');
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [busy, setBusy] = useState(false);

  // States for "الكشف والترشيح"
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]); // For 'cases'
  const [distributions, setDistributions] = useState<any[]>([]); // For 'seasonal'
  const [selectedDistId, setSelectedDistId] = useState<string>(''); // Target seasonal distribution campaign
  const [loadingDistributions, setLoadingDistributions] = useState(false);
  const [customClassification, setCustomClassification] = useState<string>(''); // For other departments

  // Load active campaigns/distributions when seasonal section is selected
  useEffect(() => {
    if (targetSection === 'seasonal') {
      const fetchDistributions = async () => {
        setLoadingDistributions(true);
        try {
          const q = query(collection(db, 'seasonal_distributions'), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setDistributions(list);
          if (list.length > 0) {
            setSelectedDistId(list[0].id);
          }
        } catch (e) {
          console.error("Error loading seasonal campaigns:", e);
        } finally {
          setLoadingDistributions(false);
        }
      };
      fetchDistributions();
    }
  }, [targetSection]);

  const handleExecuteTransfer = async () => {
    if (!targetSection) return;
    setBusy(true);
    try {
      const base: any = {
        createdAt: serverTimestamp(),
        transferredFrom: caseData.sourceSection,
        transferredFromLabel: caseData.sourceSectionLabel,
        transferredAt: new Date().toISOString(),
      };

      // Map fields specifically based on target department schemas
      if (targetSection === 'cases') {
        base.name = caseData.name;
        base.nationalId = caseData.nationalId;
        base.phone = caseData.phone;
        base.address = caseData.address || '';
        base.village = caseData.village || '';
        base.status = 'active';
        base.familyCount = Number(caseData.familyCount) || 1;
        base.categories = selectedCategories.length > 0 ? selectedCategories : ['أخرى'];
        base.description = `تم النقل من ${caseData.sourceSectionLabel}. الكشوفات: ${base.categories.join(' - ')}`;
        
        await addDoc(collection(db, 'cases'), base);

      } else if (targetSection === 'orphans') {
        base.guardianName = caseData.name;
        base.guardianId = caseData.nationalId;
        base.guardianPhone = caseData.phone;
        base.address = caseData.address || '';
        base.village = caseData.village || '';
        base.orphans = []; // New blank orphans array to fill
        base.status = 'active';
        base.notes = `منقول من قسم: ${caseData.sourceSectionLabel}. التصنيف: ${customClassification || 'عام'}`;
        
        await addDoc(collection(db, 'orphans'), base);

      } else if (targetSection === 'reception') {
        base.name = caseData.name;
        base.nationalId = caseData.nationalId;
        base.phone = caseData.phone;
        base.address = caseData.address || '';
        base.village = caseData.village || '';
        base.status = 'active';
        base.caseType = customClassification || 'other';
        base.notes = `تم النقل من قسم ${caseData.sourceSectionLabel}`;
        
        await addDoc(collection(db, 'reception_cases'), base);

      } else if (targetSection === 'medical') {
        base.name = caseData.name;
        base.nationalId = caseData.nationalId;
        base.phone = caseData.phone;
        base.address = caseData.address || '';
        base.village = caseData.village || '';
        base.status = 'active';
        base.diagnosis = customClassification || 'حالة مرضية منقولة';
        base.requiredSponsorship = 0;
        base.requiredMedicines = [];
        base.notes = `تم النقل من قسم ${caseData.sourceSectionLabel}`;
        
        await addDoc(collection(db, 'medicalCases'), base);

      } else if (targetSection === 'marriage') {
        base.brideName = caseData.name;
        base.brideNationalId = caseData.nationalId;
        base.bridePhone = caseData.phone;
        base.address = caseData.address || '';
        base.village = caseData.village || '';
        base.status = 'pending';
        base.notes = `تم النقل من قسم ${caseData.sourceSectionLabel}. التصنيف: ${customClassification || 'مستحق زواج'}`;
        
        await addDoc(collection(db, 'marriageCases'), base);

      } else if (targetSection === 'seasonal') {
        if (!selectedDistId) {
          throw new Error('الرجاء اختيار حملة / كشف توزيع للمستندات الموسمية');
        }
        // Add as beneficiary in the subcollection of the selected campaign
        base.name = caseData.name;
        base.nationalId = caseData.nationalId;
        base.phone = caseData.phone;
        base.address = caseData.address || '';
        base.village = caseData.village || '';
        base.familyCount = Number(caseData.familyCount) || 1;
        base.quantity = 1;
        base.collected = false;
        
        await addDoc(collection(db, 'seasonal_distributions', selectedDistId, 'beneficiaries'), base);
      }

      // If requested MODE is MOVE, we delete the source case document
      if (mode === 'move') {
        if (caseData.sourceSection === 'seasonal' && caseData.parentDistId) {
          // Deleting from subcollection of seasonal beneficiary
          await deleteDoc(doc(db, 'seasonal_distributions', caseData.parentDistId, 'beneficiaries', caseData.id));
        } else {
          // Normal top-level deletion from collection
          await deleteDoc(doc(db, caseData.sourceCollection, caseData.id));
        }
      }

      alert(`تمت عملية ${mode === 'copy' ? 'النسخ' : 'النقل'} بنجاح!`);
      onSuccess();
      onClose();
    } catch (e: any) {
      console.error(e);
      alert('خطأ أثناء النقل: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const currentSectionDetails = SECTIONS.find(s => s.id === targetSection);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl h-[88vh] flex flex-col overflow-hidden relative z-10 font-sans border border-stone-100"
            dir="rtl"
          >
            {/* Header */}
            <div className="p-6 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
              <button 
                onClick={onClose}
                className="p-2 hover:bg-stone-200/60 rounded-xl text-stone-400 hover:text-stone-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-right">
                <h3 className="text-lg font-black text-emerald-950 flex items-center gap-2 justify-end">
                  <span>الربط والنقل الموحد للحالات</span>
                  <ArrowRightLeft className="w-5 h-5 text-emerald-600 animate-pulse" />
                </h3>
                <p className="text-xs text-stone-400 font-bold mt-1">نقل أو نسخ سجل الحالة السكني والبيانات بين الأقسام بصورة فورية</p>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-right">
              
              {/* Header Info Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100/50 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-200">
                  تفاصيل الحالة المصدر
                </span>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-[10px] text-stone-400 font-bold">الاسم رباعي:</p>
                    <p className="text-sm font-black text-stone-800">{caseData.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-400 font-bold">الرقم القومي:</p>
                    <p className="text-sm font-black text-stone-700 tabular-nums">{caseData.nationalId || '—'}</p>
                  </div>
                  <div className="col-span-2 grid grid-cols-3 gap-2 pt-1 border-t border-dashed border-emerald-200/40">
                    <div>
                      <p className="text-[10px] text-stone-400 font-bold">رقم الهاتف:</p>
                      <p className="text-xs font-bold text-stone-600 tabular-nums">{caseData.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400 font-bold">المرسل من:</p>
                      <p className="text-xs font-bold text-emerald-700">{caseData.sourceSectionLabel || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400 font-bold">العنوان الكلي:</p>
                      <p className="text-xs font-bold text-stone-600 truncate">{caseData.address || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Choosing Target Section */}
              <div className="space-y-2">
                <label className="text-xs font-black text-stone-500 pr-2 block">
                  ١. اختر القسم الذي ترغب بنقل أو نسخ الحالة إليه:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SECTIONS.filter(sect => sect.id !== caseData.sourceSection).map((sect) => {
                    const isSelected = targetSection === sect.id;
                    return (
                      <button
                        key={sect.id}
                        type="button"
                        onClick={() => {
                          setTargetSection(sect.id);
                          // Reset dynamic options
                          setSelectedCategories([]);
                          setCustomClassification('');
                        }}
                        className={`p-4 rounded-xl text-right border-2 transition flex items-center justify-between group ${
                          isSelected 
                            ? 'bg-emerald-50/60 border-emerald-500 text-emerald-950 shadow-sm'
                            : 'bg-white border-stone-200 text-stone-600 hover:border-emerald-200'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                          isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-stone-300'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className="font-bold text-sm tracking-tight">{sect.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Asking for Dynamic "الكشف أو الترشيح" based on department */}
              {targetSection && (
                <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200/60 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 justify-end border-b border-stone-200 pb-2">
                    <span className="text-xs font-black text-stone-700">تحديد الكشف أو فئة الترشيح بالقسم</span>
                    <Layers className="w-4 h-4 text-emerald-600" />
                  </div>

                  {/* Dynamic choices: CASES / General DB */}
                  {targetSection === 'cases' && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-stone-500 pr-1">حدد تصنيف أو كشف الحالة الملحق بها (يمكن اختيار متعدد):</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {CASE_CATEGORIES.map(cat => {
                          const hasCat = selectedCategories.includes(cat);
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                if (hasCat) {
                                  setSelectedCategories(prev => prev.filter(c => c !== cat));
                                } else {
                                  setSelectedCategories(prev => [...prev, cat]);
                                }
                              }}
                              className={`p-2.5 rounded-lg text-xs font-bold border-2 text-center transition ${
                                hasCat 
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                                  : 'bg-white border-stone-200 text-stone-500 hover:border-emerald-200'
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Dynamic choices: SEASONAL */}
                  {targetSection === 'seasonal' && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-stone-500 pr-1">اختر كشف التوزيع أو حملة المساعدات الموسمية النشطة:</p>
                      {loadingDistributions ? (
                        <div className="flex items-center gap-2 justify-center py-4 text-emerald-600">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-xs font-bold">جاري تحميل حملات كشوف التوزيع...</span>
                        </div>
                      ) : distributions.length === 0 ? (
                        <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-700 text-xs font-bold">
                          لا توجد حملات أو كشوف توزيع مسجلة بنظام الحالات الموسمية حالياً. يرجى إنشاء حملة أولاً لتتمكن من النقل إليها.
                        </div>
                      ) : (
                        <select 
                          value={selectedDistId} 
                          onChange={(e) => setSelectedDistId(e.target.value)}
                          className="w-full p-3.5 rounded-xl border-2 border-stone-200 bg-white font-bold text-sm text-stone-800 outline-none focus:border-emerald-500 transition-all text-right"
                        >
                          {distributions.map(dist => (
                            <option key={dist.id} value={dist.id}>
                              {dist.title} — ({dist.organization})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Dynamic choices: Other Sections (Orphans, Medical, Marriage, Reception) */}
                  {['orphans', 'medical', 'marriage', 'reception'].includes(targetSection) && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-stone-500 pr-1">
                        إدراج كشف فرعي أو فئة تشخيصية للمساعدات (اختياري):
                      </p>
                      <input
                        type="text"
                        placeholder={
                          targetSection === 'medical' ? 'مثال: مرض الكبد، أورام، أجهزة تعويضية...' :
                          targetSection === 'marriage' ? 'مثال: عروسة مستحقة، جهاز مطبخ، أثاث...' :
                          targetSection === 'orphans' ? 'مثال: كفالة كاملة، فئة أ، يتيم مع إعاقة...' :
                          'مثال: مساعدة طارئة، كشف عيني، كشف علاجي...'
                        }
                        value={customClassification}
                        onChange={(e) => setCustomClassification(e.target.value)}
                        className="w-full p-3.5 rounded-xl border-2 border-stone-200 bg-white font-bold text-sm text-stone-800 outline-none focus:border-emerald-500 transition-all text-right"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs font-black text-stone-500 pr-2 block">
                  ٢. اختر طبيعة العملية الأمنية والنقل:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setMode('copy')} 
                    className={`p-4 rounded-2xl border-2 font-bold text-sm flex flex-col items-center justify-center gap-2 transition ${
                      mode === 'copy' 
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm' 
                        : 'border-stone-200 text-stone-500 bg-white hover:border-emerald-100'
                    }`}
                  >
                    <Copy className="w-5 h-5 text-emerald-600" />
                    <span>نسخ الحالة</span>
                    <span className="text-[10px] text-stone-400 font-bold">إبقاء الحالة في القسم الحالي وسياقه</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('move')}
                    className={`p-4 rounded-2xl border-2 font-bold text-sm flex flex-col items-center justify-center gap-2 transition ${
                      mode === 'move' 
                        ? 'border-rose-500 bg-rose-50 text-rose-800 shadow-sm' 
                        : 'border-stone-200 text-stone-500 bg-white hover:border-rose-100'
                    }`}
                  >
                    <ArrowRightLeft className="w-5 h-5 text-rose-600" />
                    <span>نقل الحالة كلياً</span>
                    <span className="text-[10px] text-stone-400 font-bold">حذف الحالة تماماً من القسم الأير لإتمام النقل</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Footer buttons */}
            <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-4 shrink-0">
              <button
                onClick={handleExecuteTransfer}
                disabled={busy || !targetSection || (targetSection === 'seasonal' && !selectedDistId)}
                className="flex-grow bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-lg disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري تفعيل عملية النقل...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-5 h-5" />
                    <span>تأكيد {mode === 'copy' ? 'النسخ للقسم الجديد' : 'النقل وحذف القديم'}</span>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-4 bg-white hover:bg-stone-100 text-stone-500 rounded-2xl font-bold transition border border-stone-200"
              >
                إلغاء الأمر
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
