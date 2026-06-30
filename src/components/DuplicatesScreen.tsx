// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Copy, ArrowRightLeft, ExternalLink, X, Search, Filter, ShieldAlert } from 'lucide-react';
import { useDuplicateRegistry, SECTIONS, transferEntry, RegistryEntry } from '../lib/duplicateRegistry';

const SECTION_COLORS: Record<string, string> = {
  cases: 'bg-emerald-100 text-emerald-800',
  reception: 'bg-sky-100 text-sky-800',
  seasonal: 'bg-amber-100 text-amber-800',
  marriage: 'bg-pink-100 text-pink-800',
  orphans: 'bg-violet-100 text-violet-800',
  payroll: 'bg-rose-100 text-rose-800',
};

export default function DuplicatesScreen() {
  const { duplicateGroups, loading, entries } = useDuplicateRegistry();
  const [filter, setFilter] = useState<'all' | 'nid' | 'name'>('all');
  const [search, setSearch] = useState('');
  const [transferEntryState, setTransferEntryState] = useState<RegistryEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    let g = duplicateGroups;
    if (filter !== 'all') g = g.filter((x) => x.type === filter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      g = g.filter((x) => x.entries.some((e) => (e.name || '').toLowerCase().includes(s) || (e.nationalId || '').includes(s)));
    }
    return g;
  }, [duplicateGroups, filter, search]);

  return (
    <div className="p-6 lg:p-10" dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-emerald-900 flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-amber-500" />
            كاشف التكرار وربط الأقسام
          </h1>
          <p className="text-sm text-stone-500 mt-1">يفحص الأسماء والأرقام القومية عبر جميع الأقسام ويسمح بنقل الحالات بينها</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2"><span className="text-stone-500">إجمالي السجلات:</span> <span className="font-black text-emerald-700">{entries.length}</span></div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2"><span className="text-stone-500">حالات مكررة:</span> <span className="font-black text-amber-700">{duplicateGroups.length}</span></div>
        </div>
      </div>

      <div className="bg-white border border-emerald-100 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-stone-50 px-3 py-2 rounded-xl border border-stone-100 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في التكرارات بالاسم أو الرقم القومي..." className="bg-transparent outline-none text-sm flex-1" />
        </div>
        <div className="flex items-center gap-1 bg-stone-50 rounded-xl p-1 border border-stone-100">
          {[
            { id: 'all', l: 'الكل' },
            { id: 'nid', l: 'رقم قومي' },
            { id: 'name', l: 'بالاسم' },
          ].map((t) => (
            <button key={t.id} onClick={() => setFilter(t.id as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === t.id ? 'bg-emerald-600 text-white' : 'text-stone-600 hover:bg-white'}`}>{t.l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-emerald-400"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-16 text-center">
          <ShieldAlert className="w-16 h-16 mx-auto mb-3 text-emerald-300" />
          <p className="text-emerald-800 font-black">لا توجد تكرارات</p>
          <p className="text-emerald-600/70 text-sm">جميع البيانات نظيفة ✓</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((g, gi) => {
            const head = g.entries[0];
            return (
              <motion.div
                key={`${g.type}-${g.key}-${gi}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="font-black text-stone-800">{head.name || '—'}</div>
                      <div className="text-xs text-stone-500">
                        {g.type === 'nid' ? 'تكرار بالرقم القومي: ' : 'تكرار بالاسم'}
                        <span className="font-bold tabular-nums">{g.type === 'nid' ? g.key : ''}</span>
                        <span className="mx-2">·</span>
                        <span className="font-bold text-amber-700">{g.entries.length} نسخ</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  {g.entries.map((e, ei) => (
                    <div key={ei} className="border border-stone-100 rounded-xl p-3 bg-stone-50/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${SECTION_COLORS[e.sectionId] || 'bg-stone-100'}`}>{e.sectionLabel}</span>
                        <Link to={SECTIONS.find((s) => s.id === e.sectionId)?.route || '/'} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-lg" title="فتح القسم">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                      <div className="text-sm font-bold text-stone-800 mb-1">{e.name || '—'}</div>
                      <div className="text-xs text-stone-500 tabular-nums">رقم قومي: {e.nationalId || '—'}</div>
                      {e.phone && <div className="text-xs text-stone-500 tabular-nums">هاتف: {e.phone}</div>}
                      {e.subKey && <div className="text-[10px] text-stone-400 mt-1">عنصر فرعي: {e.subKey}</div>}
                      <div className="mt-2 pt-2 border-t border-stone-100 flex gap-1.5">
                        <button
                          onClick={() => setTransferEntryState(e)}
                          className="flex-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1"
                        >
                          <ArrowRightLeft className="w-3 h-3" /> نقل / نسخ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {transferEntryState && (
          <TransferModal
            entry={transferEntryState}
            busy={busy}
            onClose={() => setTransferEntryState(null)}
            onSubmit={async (targetId, mode) => {
              setBusy(true);
              try {
                await transferEntry(transferEntryState, targetId, mode);
                setTransferEntryState(null);
              } catch (e: any) {
                alert('فشل النقل: ' + (e?.message || e));
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TransferModal({ entry, busy, onClose, onSubmit }: { entry: RegistryEntry; busy: boolean; onClose: () => void; onSubmit: (t: string, m: 'copy' | 'move') => void }) {
  const [target, setTarget] = useState<string>('');
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const isSubItem = !!entry.subKey && entry.subKey !== 'guardian';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-2xl p-6 max-w-md w-full" dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-emerald-900">نقل / نسخ الحالة</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-stone-50 rounded-xl p-3 mb-4 text-sm">
          <div className="font-bold">{entry.name || '—'}</div>
          <div className="text-xs text-stone-500 tabular-nums mt-1">رقم قومي: {entry.nationalId || '—'}</div>
          <div className="text-xs text-stone-500 mt-1">المصدر: <span className="font-bold">{entry.sectionLabel}</span></div>
        </div>

        <label className="block text-xs font-bold text-stone-600 mb-1">نقل إلى:</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full px-3 py-2.5 border border-stone-200 rounded-xl mb-4">
          <option value="">-- اختر القسم --</option>
          {SECTIONS.filter((s) => s.id !== entry.sectionId).map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setMode('copy')} className={`p-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 ${mode === 'copy' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-200 text-stone-600'}`}>
            <Copy className="w-4 h-4" /> نسخ (الإبقاء بالمصدر)
          </button>
          <button
            disabled={isSubItem}
            onClick={() => setMode('move')}
            className={`p-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'move' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-stone-200 text-stone-600'}`}
          >
            <ArrowRightLeft className="w-4 h-4" /> نقل (حذف من المصدر)
          </button>
        </div>
        {isSubItem && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">هذا عنصر فرعي داخل قسم، يمكن نسخه فقط — لا يمكن حذفه من سياقه.</p>}

        <button
          disabled={!target || busy}
          onClick={() => onSubmit(target, mode)}
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
          تأكيد {mode === 'copy' ? 'النسخ' : 'النقل'}
        </button>
      </motion.div>
    </motion.div>
  );
}
