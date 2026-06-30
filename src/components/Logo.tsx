// @ts-nocheck
import React, { useEffect, useState } from 'react';

const DEFAULT_LOGO = 'https://i.ibb.co/L6V2yq9/logo.png';
const FALLBACK = 'https://cdn-icons-png.flaticon.com/512/2513/2513076.png';

export default function Logo({ className = "w-12 h-12" }: { className?: string }) {
  const [src, setSrc] = useState<string>(() => localStorage.getItem('app_logo_url') || DEFAULT_LOGO);

  useEffect(() => {
    const handler = () => setSrc(localStorage.getItem('app_logo_url') || DEFAULT_LOGO);
    window.addEventListener('storage', handler);
    window.addEventListener('app_logo_changed', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('app_logo_changed', handler);
    };
  }, []);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img
        src={src}
        alt="بصمة خير"
        className="w-full h-full object-contain filter drop-shadow-md"
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK; }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
