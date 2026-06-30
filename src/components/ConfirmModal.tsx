// @ts-nocheck
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
}

export default function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = "نعم، متأكد", 
  cancelText = "إلغاء",
  variant = 'danger'
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden relative z-10 font-sans"
            dir="rtl"
          >
            <div className="p-8">
              <div className="flex items-center justify-center w-16 h-16 bg-rose-50 rounded-full mb-6 mx-auto">
                <AlertTriangle className="w-8 h-8 text-rose-600" />
              </div>
              
              <h3 className="text-xl font-bold text-emerald-900 text-center mb-2">{title}</h3>
              <p className="text-emerald-600/70 text-center text-sm mb-8 leading-relaxed">
                {message}
              </p>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={onConfirm}
                  className="w-full py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                >
                  {confirmText}
                </button>
                <button 
                  onClick={onCancel}
                  className="w-full py-4 bg-stone-100 text-emerald-900 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  {cancelText}
                </button>
              </div>
            </div>
            
            <button 
              onClick={onCancel}
              className="absolute top-4 right-4 p-2 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}