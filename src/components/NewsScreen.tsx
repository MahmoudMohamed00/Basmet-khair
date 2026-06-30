// @ts-nocheck
import React from 'react';
import { Facebook, ExternalLink, Newspaper, Info } from 'lucide-react';
import { motion } from 'motion/react';

export default function NewsScreen() {
  const facebookUrl = "https://www.facebook.com/BsmetKheir";
  const facebookIframeUrl = `https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2FBsmetKheir&tabs=timeline&width=500&height=800&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true&appId`;

  return (
    <div className="p-6 space-y-6 font-sans" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-900 flex items-center gap-3">
            <Newspaper className="w-8 h-8 text-emerald-600" />
            أخبار الجمعية
          </h1>
          <p className="text-emerald-600 font-medium mt-1">تابع آخر المنشورات والفعاليات من صفحتنا الرسمية</p>
        </div>
        
        <a 
          href={facebookUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#1877F2] text-white px-6 py-3 rounded-2xl font-bold hover:bg-[#166fe5] transition-all shadow-lg shadow-blue-200 w-fit"
        >
          <Facebook className="w-5 h-5" />
          <span>زيارة صفحة فيسبوك</span>
          <ExternalLink className="w-4 h-4 opacity-70" />
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Feed */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-emerald-100 overflow-hidden min-h-[800px] flex flex-col">
            <div className="p-6 border-b border-emerald-50 bg-emerald-50/30 flex items-center justify-between">
              <h2 className="text-xl font-bold text-emerald-900">المنشورات المباشرة</h2>
              <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold animate-pulse">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                تحديث مباشر
              </div>
            </div>
            
            <div className="p-0 flex-grow flex justify-center bg-stone-50/50">
              <iframe 
                src={facebookIframeUrl} 
                width="100%" 
                height="800" 
                style={{ border: 'none', overflow: 'hidden' }} 
                scrolling="no" 
                frameBorder="0" 
                allowFullScreen={true} 
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                className="max-w-[500px] shadow-2xl"
              ></iframe>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-4 space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-emerald-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10">
               <Facebook className="w-32 h-32" />
            </div>
            <h3 className="text-xl font-bold mb-4 relative z-10">تواصل معنا</h3>
            <p className="text-emerald-100/80 mb-6 relative z-10 leading-relaxed">
              جمعية بصمة خير نبروه هي مؤسسة خيرية تهدف للوصول لكل محتاج وتقديم المساعدات الإنسانية والاجتماعية. شاركنا في نشر الخير.
            </p>
            <div className="space-y-4 relative z-10">
              <div className="flex items-center gap-3 p-3 bg-white/10 rounded-2xl border border-white/10">
                <Info className="w-5 h-5 text-emerald-300" />
                <span className="text-sm font-bold">قرية كفر نبروة - نبروه - الدقهلية</span>
              </div>
            </div>
          </motion.div>

          <div className="bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-sm">
            <h4 className="font-bold text-emerald-900 mb-4">تعليمات متابعة الأخبار</h4>
            <ul className="space-y-3 text-sm text-emerald-700/80">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                يتم تحديث المنشورات تلقائياً من صفحة الفيسبوك الرسمية.
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                يمكنك الضغط على أي منشور لعرضه كاملاً على فيسبوك.
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                في حالة عدم التحميل، يرجى التأكد من تسجيل الدخول للفيسبوك في المتصفح.
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      <footer className="mt-12 py-8 border-t border-emerald-100 text-center">
        <p className="text-emerald-800/60 mt-1 text-sm font-bold">
          تم التطوير بواسطة م/ محمود جاويش (Mahmoud Gawish) © {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}