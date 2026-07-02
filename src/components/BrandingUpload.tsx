// @ts-nocheck
import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Image as ImageIcon } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

export async function uploadFile(file: File, storagePath: string): Promise<string> {
  try {
    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: file.type || 'image/jpeg'
    };
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);
    
    return await new Promise<string>((resolve, reject) => {
      uploadTask.on('state_changed', 
        null,
        (error) => {
          console.error("Firebase upload error, falling back to local Base64:", error);
          reject(error);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadUrl);
          } catch (err: any) {
            reject(err);
          }
        }
      );
    });
  } catch (err) {
    console.warn("Firebase storage upload failed or not configured, reading file as Base64 data URL instead...", err);
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('فشل قراءة الملف كـ Base64'));
        }
      };
      reader.onerror = () => reject(new Error('فشل قراءة الملف'));
      reader.readAsDataURL(file);
    });
  }
}

function setFavicon(url: string) {
  let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

export default function BrandingUpload() {
  const [logoUrl, setLogoUrl] = useState<string>(localStorage.getItem('app_logo_url') || '');
  const [iconUrl, setIconUrl] = useState<string>(localStorage.getItem('app_icon_url') || '');
  const [busy, setBusy] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'logo' | 'icon') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(kind);
    try {
      const url = await uploadFile(file, `branding/${kind}`);
      if (kind === 'logo') {
        localStorage.setItem('app_logo_url', url);
        setLogoUrl(url);
        window.dispatchEvent(new Event('app_logo_changed'));
      } else {
        localStorage.setItem('app_icon_url', url);
        setIconUrl(url);
        setFavicon(url);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(null);
      e.target.value = '';
    }
  };

  const reset = (kind: 'logo' | 'icon') => {
    if (kind === 'logo') {
      localStorage.removeItem('app_logo_url');
      setLogoUrl('');
      window.dispatchEvent(new Event('app_logo_changed'));
    } else {
      localStorage.removeItem('app_icon_url');
      setIconUrl('');
      setFavicon('/favicon.ico');
    }
  };

  // Apply icon on mount
  React.useEffect(() => { if (iconUrl) setFavicon(iconUrl); }, []);

  const Slot = ({ kind, url, label }: any) => (
    <div className="bg-white border border-emerald-100 rounded-2xl p-4 flex items-center gap-4">
      <div className="w-20 h-20 bg-stone-50 rounded-xl flex items-center justify-center overflow-hidden border">
        {url ? <img src={url} className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-stone-300" />}
      </div>
      <div className="flex-1">
        <div className="font-bold text-emerald-900 mb-2">{label}</div>
        <div className="flex gap-2">
          <button
            onClick={() => (kind === 'logo' ? logoRef : iconRef).current?.click()}
            disabled={busy === kind}
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {busy === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            {url ? 'استبدال' : 'رفع صورة'}
          </button>
          {url && (
            <button onClick={() => reset(kind)} className="px-3 py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-1">
              <Trash2 className="w-4 h-4" /> إعادة الافتراضي
            </button>
          )}
        </div>
      </div>
      <input ref={kind === 'logo' ? logoRef : iconRef} type="file" accept="image/*" className="hidden" onChange={(e) => handle(e, kind)} />
    </div>
  );

  return (
    <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-5 mb-6">
      <h3 className="text-lg font-black text-emerald-900 mb-4 flex items-center gap-2">
        <ImageIcon className="w-5 h-5" /> هوية التطبيق (الشعار والأيقونة)
      </h3>
      <div className="space-y-3">
        <Slot kind="logo" url={logoUrl} label="شعار التطبيق (يظهر في كل الصفحات)" />
        <Slot kind="icon" url={iconUrl} label="أيقونة المتصفح / favicon" />
      </div>
      <p className="text-[11px] text-stone-500 mt-3">يتم حفظ الشعار والأيقونة محلياً ومشاركتهما عبر السحابة. قد يحتاج المتصفح لإعادة تحميل الصفحة لتطبيق الأيقونة.</p>
    </div>
  );
}
