// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X, Sparkles, Loader2, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { callAI } from '../lib/aiClient';

const SYSTEM = `أنت مساعد صوتي ذكي لتطبيق "بصمة خير" لإدارة الجمعية الخيرية. أجب باختصار ووضوح بالعربية. ساعد المستخدم في:
- شرح كيفية استخدام أقسام التطبيق (الحالات، الزواج، الموسمية، الاستقبال، التوزيعات، الأيتام، الكفالات، إلخ)
- الإجابة عن أسئلة عامة عن إدارة الجمعية
- إعطاء نصائح تنظيمية
اجعل ردودك قصيرة (1-3 جمل) مناسبة للقراءة الصوتية.`;

export default function VoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'ar-EG';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInput('');
      send(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const speak = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-EG';
      u.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newMessages = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(newMessages);
    setThinking(true);
    try {
      const reply = await callAI(newMessages, SYSTEM);
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
      speak(reply);
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `خطأ: ${e.message}` }]);
    } finally {
      setThinking(false);
    }
  };

  const toggleMic = () => {
    if (!recognitionRef.current) {
      alert('المتصفح لا يدعم التعرف على الصوت. استخدم Chrome.');
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        window.speechSynthesis.cancel();
        recognitionRef.current.start();
        setListening(true);
      } catch {}
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-10 right-6 z-50 p-4 bg-gradient-to-br from-purple-600 to-emerald-600 text-white rounded-full shadow-2xl border-2 border-white/30 hover:scale-110 transition-all"
        title="المساعد الصوتي الذكي"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-28 right-6 z-50 w-96 max-w-[92vw] bg-white rounded-3xl shadow-2xl border border-purple-200 flex flex-col"
            style={{ height: '70vh', maxHeight: 600 }}
            dir="rtl"
          >
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-600 to-emerald-600 text-white rounded-t-3xl">
              <div className="flex items-center gap-2 font-black">
                <Sparkles className="w-5 h-5" /> المساعد الذكي
              </div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50">
              {messages.length === 0 && (
                <div className="text-center text-stone-500 text-sm mt-8">
                  <Sparkles className="w-10 h-10 mx-auto text-purple-400 mb-2" />
                  <p className="font-bold">مرحباً! اسألني عن أي شيء</p>
                  <p className="text-xs mt-1">اضغط على المايك للحديث أو اكتب سؤالك</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.role === 'user' ? 'bg-emerald-100 text-emerald-900' : 'bg-purple-100 text-purple-900'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-end">
                  <div className="bg-purple-100 px-3 py-2 rounded-2xl text-sm text-purple-700 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> يفكر...
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t bg-white rounded-b-3xl flex items-center gap-2">
              <button
                onClick={toggleMic}
                className={`p-3 rounded-full text-white transition-all ${listening ? 'bg-rose-500 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}`}
                title={listening ? 'إيقاف' : 'تحدث'}
              >
                {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { send(input); setInput(''); } }}
                placeholder="اكتب سؤالك..."
                className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm outline-none focus:border-purple-400"
              />
              <button
                onClick={() => { send(input); setInput(''); }}
                disabled={!input.trim() || thinking}
                className="p-3 bg-emerald-600 text-white rounded-full disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
