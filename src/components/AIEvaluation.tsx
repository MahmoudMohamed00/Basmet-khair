// @ts-nocheck
import React, { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertCircle, Edit3 } from 'lucide-react';
import { callAI } from '../lib/aiClient';

interface Props {
  caseData: Record<string, any>;
  attachmentNames?: string[];
  initialResult?: { verdict?: string; reason?: string; score?: number };
  onSave?: (result: { verdict: string; reason: string; score: number }) => void;
}

const SYSTEM_PROMPT = `أنت مساعد ذكي لتقييم استحقاق الحالات في جمعية بصمة خير الخيرية. تقوم بتحليل بيانات الحالة وأسماء المستندات المرفقة، ثم تعطي حكماً موضوعياً.

أعد إجابتك بصيغة JSON فقط بدون أي شرح إضافي:
{
  "verdict": "مستحق" | "غير مستحق" | "يحتاج مراجعة",
  "score": رقم من 0 إلى 100 يمثل درجة الاستحقاق,
  "reason": "سبب مختصر بالعربية في 2-3 جمل"
}`;

export default function AIEvaluation({ caseData, attachmentNames = [], initialResult, onSave }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(initialResult || null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const evaluate = async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = Object.entries(caseData)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n');
      const filesLine = attachmentNames.length
        ? `\n\nالمستندات المرفقة:\n${attachmentNames.join(', ')}`
        : '\n\n(لا توجد مستندات مرفقة)';
      const prompt = `بيانات الحالة:\n${summary}${filesLine}`;
      const content = await callAI([{ role: 'user', content: prompt }], SYSTEM_PROMPT);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('تنسيق رد الذكاء الاصطناعي غير صالح');
      const parsed = JSON.parse(jsonMatch[0]);
      setResult(parsed);
      onSave?.(parsed);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const verdictStyle = (v: string) => {
    if (v === 'مستحق') return { bg: 'bg-emerald-50 border-emerald-300', text: 'text-emerald-700', Icon: CheckCircle2 };
    if (v === 'غير مستحق') return { bg: 'bg-rose-50 border-rose-300', text: 'text-rose-700', Icon: XCircle };
    return { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-700', Icon: AlertCircle };
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-emerald-50 border-2 border-purple-200 rounded-2xl p-4 my-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-black text-purple-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> تقييم بالذكاء الاصطناعي
        </h4>
        <button
          onClick={evaluate}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 hover:bg-purple-700"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {result ? 'إعادة التقييم' : 'تقييم الحالة'}
        </button>
      </div>
      {error && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg mb-2">{error}</div>}
      {result && (() => {
        const s = verdictStyle(result.verdict);
        return (
          <div className={`${s.bg} border-2 rounded-xl p-3`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`flex items-center gap-2 font-black text-sm ${s.text}`}>
                <s.Icon className="w-5 h-5" />
                {editing ? (
                  <select
                    value={result.verdict}
                    onChange={(e) => setResult({ ...result, verdict: e.target.value })}
                    className="bg-white border rounded px-2 py-1"
                  >
                    <option>مستحق</option>
                    <option>غير مستحق</option>
                    <option>يحتاج مراجعة</option>
                  </select>
                ) : result.verdict}
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black ${s.text} bg-white border`}>
                  {result.score}%
                </span>
                <button
                  onClick={() => {
                    if (editing) onSave?.(result);
                    setEditing(!editing);
                  }}
                  className="p-1 text-stone-500 hover:text-purple-600"
                  title="تعديل"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {editing ? (
              <textarea
                value={result.reason}
                onChange={(e) => setResult({ ...result, reason: e.target.value })}
                className="w-full text-xs bg-white border rounded-lg p-2"
                rows={3}
              />
            ) : (
              <p className="text-xs text-stone-700 leading-relaxed">{result.reason}</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
