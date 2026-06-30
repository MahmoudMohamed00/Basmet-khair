// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, X, Calendar, User, Hospital, FileText, ClipboardList, Activity, FlaskConical, Database, Image as ImageIcon, CheckCircle2, AlertCircle, Clock, Trash2, Shield, Eye, EyeOff, Loader2, Search, Link as LinkIcon, Stethoscope, Printer, FileDown, FileUp, Download, Info, MapPin, Phone, CreditCard, ChevronLeft, ArrowRight, FileCheck, ArrowRightLeft, Heart, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { db, storage, handleFirestoreError, OperationType, logSystemAction } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, getDoc, addDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import ConfirmModal from './ConfirmModal';
import UnifiedTransferModal from './UnifiedTransferModal';
import MedicalModal from './MedicalModal';
import * as XLSX from 'xlsx';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';
import { checkDuplicateCase } from '../lib/duplicateRegistry';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type MedicalTab = 'prescriptions' | 'surgeries' | 'labTests' | 'radiology';

interface MedicalCase {
  id: string;
  codeNumber?: string;
  name: string;
  phone: string;
  nationalId: string;
  isUnderAge?: boolean;
  guardianName?: string;
  guardianNationalId?: string;
  address: string;
  diseaseType: string;
  assistanceType?: string; // Legacy
  assistanceTypes: string[];
  assistanceDate: string;
  helpType?: 'cash' | 'other';
  helpAmount?: string;
  otherHelpDetails?: string;
  isHelped: boolean;
  doctorName?: string;
  medicalCenter?: string;
  documentUrl?: string; // Legacy
  attachments?: FileAttachment[];
  
  // Detailed Attachments
  nationalIdAttachments?: FileAttachment[];
  spouseIdAttachments?: FileAttachment[];
  patientPhoto?: FileAttachment;
  birthCertificates?: FileAttachment[];
  deathCertificate?: FileAttachment;
  divorceCertificate?: FileAttachment;
  medicalReports?: FileAttachment[];
  xRays?: FileAttachment[];
  labTests?: FileAttachment[];
  otherDocs?: FileAttachment[];
  
  notes: string;
  createdAt: any;
}

export default function MedicalRecordsScreen() {
  const [loading, setLoading] = useState(true);
  const [medicalCases, setMedicalCases] = useState<MedicalCase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'assistanceDate' | 'isHelped' | 'assistanceType' | 'codeNumber'>('assistanceDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'helped' | 'pending'>('all');
  const [filterAssistanceType, setFilterAssistanceType] = useState<string>('all');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);

  // Find duplicates in medical cases
  const duplicatesMap = useMemo(() => {
    const nameCounts: Record<string, number> = {};
    const nationalIdCounts: Record<string, number> = {};
    const phoneCounts: Record<string, number> = {};

    medicalCases.forEach(c => {
      const name = String(c.name || '').trim();
      const nationalId = String(c.nationalId || '').trim();
      const phone = String(c.phone || '').trim();

      if (name && name.length > 2) {
        nameCounts[name] = (nameCounts[name] || 0) + 1;
      }
      if (nationalId && nationalId.length > 3 && nationalId !== '-' && !nationalId.includes('لا يوجد')) {
        nationalIdCounts[nationalId] = (nationalIdCounts[nationalId] || 0) + 1;
      }
      if (phone && phone.length > 4 && phone !== '-' && !phone.includes('لا يوجد')) {
        phoneCounts[phone] = (phoneCounts[phone] || 0) + 1;
      }
    });

    return { nameCounts, nationalIdCounts, phoneCounts };
  }, [medicalCases]);

  const getIsDuplicate = useCallback((c: MedicalCase) => {
    const name = String(c.name || '').trim();
    const nationalId = String(c.nationalId || '').trim();
    const phone = String(c.phone || '').trim();

    const isNameDup = name ? ((duplicatesMap.nameCounts[name] || 0) > 1) : false;
    const isNidDup = (nationalId && nationalId !== '-') ? ((duplicatesMap.nationalIdCounts[nationalId] || 0) > 1) : false;
    const isPhoneDup = (phone && phone !== '-') ? ((duplicatesMap.phoneCounts[phone] || 0) > 1) : false;

    return {
      isDuplicate: isNameDup || isNidDup || isPhoneDup,
      reasons: {
        name: isNameDup,
        nationalId: isNidDup,
        phone: isPhoneDup
      }
    };
  }, [duplicatesMap]);

  const duplicateMedicalCount = useMemo(() => {
    return medicalCases.filter(c => getIsDuplicate(c).isDuplicate).length;
  }, [medicalCases, getIsDuplicate]);
  const [selectedCase, setSelectedCase] = useState<MedicalCase | null>(null);
  const [unifiedTransferCase, setUnifiedTransferCase] = useState<any>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMedicalModalOpen, setIsMedicalModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MedicalTab>('prescriptions');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const MEDICAL_MAPPING_FIELDS = [
    { id: 'name', label: 'الاسم الكامل' },
    { id: 'nationalId', label: 'الرقم القومي' },
    { id: 'phone', label: 'رقم الهاتف' },
    { id: 'address', label: 'العنوان' },
    { id: 'assistanceType', label: 'نوع المساعدة' },
    { id: 'assistanceDate', label: 'التاريخ' },
    { id: 'diseaseType', label: 'التشخيص / الحالة' },
    { id: 'notes', label: 'ملاحظات' }
  ];

  const getPreviewValue = (excelHeader: string) => {
    if (!importData || !excelHeader) return '';
    return String(importData.rows[0]?.[excelHeader] || '');
  };
  
  const [formData, setFormData] = useState({
    codeNumber: '',
    name: '',
    phone: '',
    nationalId: '',
    isUnderAge: false,
    guardianName: '',
    guardianNationalId: '',
    address: '',
    assistanceTypes: ['روشتة'] as string[],
    assistanceDate: new Date().toISOString().split('T')[0],
    helpType: 'cash' as 'cash' | 'other',
    helpAmount: '',
    otherHelpDetails: '',
    doctorName: '',
    medicalCenter: '',
    isHelped: false,
    diseaseType: '',
    attachments: [] as FileAttachment[],
    
    // Detailed Attachments
    nationalIdAttachments: [] as FileAttachment[],
    spouseIdAttachments: [] as FileAttachment[],
    patientPhoto: null as FileAttachment | null,
    birthCertificates: [] as FileAttachment[],
    deathCertificate: null as FileAttachment | null,
    divorceCertificate: null as FileAttachment | null,
    medicalReports: [] as FileAttachment[],
    xRays: [] as FileAttachment[],
    labTests: [] as FileAttachment[],
    otherDocs: [] as FileAttachment[],
    
    notes: ''
  });

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

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'medicalCases'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MedicalCase));
      setMedicalCases(cases);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'medicalCases');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let uploadFile = file;
      if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg') || file.name.toLowerCase().endsWith('.png')) {
        try {
          const options = {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1280,
            useWebWorker: false,
            initialQuality: 0.7,
            fileType: 'image/jpeg' as string,
          };
          const compressed = await imageCompression(file, options);
          if (compressed && compressed.size < file.size) {
            uploadFile = compressed;
          }
        } catch (compErr) {
          console.error("Compression skipped:", compErr);
          uploadFile = file;
        }
      }

      const fileId = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `medical/docs/${fileId}`);
      const metadata = {
        contentType: uploadFile.type || 'image/jpeg'
      };
      const uploadTask = uploadBytesResumable(storageRef, uploadFile, metadata);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`Upload is ${progress}% done`);
        }, 
        (error) => {
          console.error("Upload error details:", error);
          alert(`خطأ في الرفع: ${error.message}`);
          setUploading(false);
        }, 
        async () => {
      try {
        const url = await getDownloadURL(uploadTask.snapshot.ref);

        // Upload to Google Drive (new)
        try {
          await uploadToGoogleDrive(file, 'وثائق المرضى', formData.name || 'مريض_بدون_اسم');
        } catch (driveErr) {
          console.error("Google Drive sync failed:", driveErr);
        }

        setFormData(prev => ({ 
          ...prev, 
          documentUrl: url,
          attachments: [...(prev.attachments || []), { url, name: file.name }]
        }));
        setUploading(false);
      } catch (urlError) {
            console.error("URL retrieval error:", urlError);
            alert("خطأ في الحصول على رابط الملف");
            setUploading(false);
          }
        }
      );
    } catch (error: any) {
      console.error("Critical upload error:", error);
      alert(`حدث خطأ أثناء معالجة الرفع: ${error.message}`);
      setUploading(false);
    }
  };

  const generateMedicalCode = (list: MedicalCase[]) => {
    const lastNum = list
      .map(c => c.codeNumber)
      .filter(num => num?.startsWith('H'))
      .map(num => {
        const numPart = num?.substring(1);
        return numPart ? parseInt(numPart) : 0;
      })
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a)[0] || 0;
    return `H${lastNum + 1}`;
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = formData.codeNumber || generateMedicalCode(medicalCases);
    const dataToSave = JSON.parse(JSON.stringify(formData));

    const performSave = async () => {
      try {
        setLoading(true);
        if (editingId) {
          await updateDoc(doc(db, 'medicalCases', editingId), {
            ...dataToSave,
            codeNumber: code,
            updatedAt: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'medicalCases'), {
            ...dataToSave,
            codeNumber: code,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
        setIsAddModalOpen(false);
        setEditingId(null);
        setFormData({ 
          codeNumber: '',
          name: '', phone: '', nationalId: '', address: '', 
          isUnderAge: false, guardianName: '', guardianNationalId: '',
          assistanceTypes: ['روشتة'], assistanceDate: new Date().toISOString().split('T')[0], 
          helpType: 'cash', helpAmount: '', otherHelpDetails: '',
          doctorName: '', medicalCenter: '',
          isHelped: false, diseaseType: '', attachments: [], 
          nationalIdAttachments: [], spouseIdAttachments: [], patientPhoto: null, 
          birthCertificates: [], deathCertificate: null, divorceCertificate: null,
          medicalReports: [], xRays: [], labTests: [], otherDocs: [],
          notes: '' 
        });
      } catch (error) {
        handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'medicalCases');
      } finally {
        setLoading(false);
      }
    };

    if (!editingId) {
      setLoading(true);
      let duplicateWarnings: string[] = [];
      try {
        duplicateWarnings = await checkDuplicateCase(formData.name, formData.nationalId);
      } catch (err) {
        console.error('Error checking duplicates:', err);
      } finally {
        setLoading(false);
      }

      if (duplicateWarnings.length > 0) {
        setConfirmConfig({
          isOpen: true,
          title: '⚠️ تنبيه: حالة مكررة مسجلة مسبقاً',
          message: `تنبيه: تم العثور على تكرار للاسم أو الرقم الرقم القومي في القوائم التالية:\n- ${duplicateWarnings.join('\n- ')}\n\nهل أنت متأكد من رغبتك في إضافة هذه الحالة على أي حال؟`,
          onConfirm: async () => {
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
            await performSave();
          }
        });
        return;
      }
    }

    await performSave();
  };

  const handlePrintSingleCase = (c: MedicalCase) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>تقرير_طبي_${c.name.replace(/\s+/g, '_')}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 40px; color: #111; line-height: 1.6; }
            .header { border-bottom: 3px double #059669; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
            .society-info { text-align: right; }
            .society-info p { margin: 0; font-size: 14px; font-weight: bold; }
            .society-logo { text-align: center; color: #059669; }
            .report-title { text-align: center; margin-bottom: 40px; background: #f0fdf4; padding: 15px; border-radius: 15px; border: 1px solid #d1fae5; }
            .report-title h1 { margin: 0; color: #065f46; font-size: 28px; }
            
            .section { margin-bottom: 30px; }
            .section-title { font-size: 20px; color: #065f46; border-right: 5px solid #059669; padding-right: 15px; margin-bottom: 20px; font-weight: bold; }
            
            .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .data-item { padding: 12px; background: #f9fafb; border-radius: 10px; border: 1px solid #f3f4f6; }
            .label { font-size: 12px; color: #6b7280; font-weight: bold; margin-bottom: 4px; display: block; }
            .value { font-size: 16px; color: #111827; font-weight: bold; }
            
            .badge { display: inline-block; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: bold; }
            .badge-amber { background: #fffbeb; color: #92400e; border: 1px solid #fef3c7; }
            .badge-emerald { background: #ecfdf5; color: #065f46; border: 1px solid #d1fae5; }
            
            .full-width { grid-column: span 2; }
            .notes-box { padding: 20px; border: 1px solid #e5e7eb; border-radius: 15px; min-height: 80px; background: #fff; }
            
            .footer { margin-top: 60px; display: flex; justify-content: space-between; text-align: center; }
            .signature { width: 200px; border-top: 1px solid #ccc; padding-top: 10px; margin-top: 40px; font-weight: bold; }
            
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="society-info">
              <p>مديرية التضامن الاجتماعي بالدقهلية</p>
              <p>جمعية بصمة خير نبروه</p>
              <p>المشهرة برقم ٢٥١٠ لسنة ٢٠١٥</p>
            </div>
            <div class="society-logo">
              <h2 style="margin:0">بصمة خير</h2>
              <p style="margin:0; font-size: 10px;">نبروه</p>
            </div>
            <div style="text-align: left;">
              <p>كود المريض: ${c.codeNumber || c.id.substring(0, 8)}</p>
              <p>تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
            </div>
          </div>

          <div class="report-title">
            <h1>تقرير حالة طبية مفصل</h1>
            <p>سجل المساعدات الطبية والبيانات الصحية للمريض</p>
          </div>

          <div class="section">
            <div class="section-title">بيانات المريض الأساسية</div>
            <div class="data-grid">
              <div class="data-item">
                <span class="label">اسم المريض</span>
                <div class="value">
                  ${c.name} 
                  <span class="badge ${c.isUnderAge ? 'badge-amber' : 'badge-emerald'}">
                    ${c.isUnderAge ? 'تحت السن' : 'بالغ'}
                  </span>
                </div>
              </div>
              <div class="data-item"><span class="label">الرقم القومي</span><div class="value">${c.nationalId}</div></div>
              <div class="data-item"><span class="label">رقم الهاتف</span><div class="value">${c.phone}</div></div>
              <div class="data-item full-width"><span class="label">العنوان</span><div class="value">${c.address}</div></div>
              
              ${c.isUnderAge ? `
                <div class="data-item"><span class="label">اسم ولي الأمر</span><div class="value">${c.guardianName || '-'}</div></div>
                <div class="data-item"><span class="label">الرقم القومي لولي الأمر</span><div class="value">${c.guardianNationalId || '-'}</div></div>
              ` : ''}
            </div>
          </div>

          <div class="section">
            <div class="section-title">التشخيص والجهة الطبية</div>
            <div class="data-grid">
              <div class="data-item full-width"><span class="label">التشخيص / الحالة المرضية</span><div class="value">${c.diseaseType}</div></div>
              <div class="data-item"><span class="label">الطبيب المعالج</span><div class="value">${c.doctorName || '-'}</div></div>
              <div class="data-item"><span class="label">المركز / المستشفى</span><div class="value">${c.medicalCenter || '-'}</div></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">بيانات المساعدة والتمويل</div>
            <div class="data-grid">
              <div class="data-item"><span class="label">نوع المساعدة المطلوبة</span><div class="value">${(c.assistanceTypes || []).join(' - ')}</div></div>
              <div class="data-item"><span class="label">تاريخ الطلب</span><div class="value">${c.assistanceDate}</div></div>
              <div class="data-item">
                <span class="label">نوع الدعم</span>
                <div class="value">${c.helpType === 'cash' ? 'دعم مالي (نقدي)' : 'دعم عيني / آخر'}</div>
              </div>
              <div class="data-item">
                <span class="label">القيمة / التفاصيل</span>
                <div class="value">${c.helpType === 'cash' ? c.helpAmount + ' ج.م' : c.otherHelpDetails || '-'}</div>
              </div>
              <div class="data-item full-width">
                <span class="label">حالة المساعدة</span>
                <div class="value" style="color: ${c.isHelped ? '#059669' : '#dc2626'}">
                  ${c.isHelped ? 'تم تسليم المساعدة بنجاح' : 'جاري مراجعة الطلب (لم يتم التسليم بعد)'}
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">ملاحظات إضافية</div>
            <div class="notes-box">
              ${c.notes || 'لا توجد ملاحظات إضافية مسجلة لهذه الحالة'}
            </div>
          </div>

          <div class="footer">
            <div class="signature">تحريراً بمعرفة / المسؤول</div>
            <div class="signature">توقيع أمين الصندوق</div>
            <div class="signature">رئيس مجلس الإدارة</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.document.title = `تقرير_طبي_${c.name.replace(/\s+/g, '_')}`;
    printWindow.print();
  };

  const handleDownloadPDF = async (c: MedicalCase) => {
    const content = `
      <div style="font-family: 'Amiri', serif; direction: rtl; padding: 20px; color: #111; line-height: 1.6; background: #fff; width: 210mm;">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
          .header { border-bottom: 3px double #059669; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .society-info { text-align: right; }
          .society-info p { margin: 0; font-size: 12px; font-weight: bold; }
          .society-logo { text-align: center; color: #059669; }
          .report-title { text-align: center; margin-bottom: 30px; background: #f0fdf4; padding: 12px; border-radius: 12px; border: 1px solid #d1fae5; }
          .report-title h1 { margin: 0; color: #065f46; font-size: 24px; }
          
          .section { margin-bottom: 25px; }
          .section-title { font-size: 18px; color: #065f46; border-right: 5px solid #059669; padding-right: 12px; margin-bottom: 15px; font-weight: bold; }
          
          .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .data-item { padding: 10px; background: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6; }
          .label { font-size: 11px; color: #6b7280; font-weight: bold; margin-bottom: 3px; display: block; }
          .value { font-size: 14px; color: #111827; font-weight: bold; }
          
          .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; }
          .badge-amber { background: #fffbeb; color: #92400e; border: 1px solid #fef3c7; }
          .badge-emerald { background: #ecfdf5; color: #065f46; border: 1px solid #d1fae5; }
          
          .full-width { grid-column: span 2; }
          .notes-box { padding: 15px; border: 1px solid #e5e7eb; border-radius: 12px; min-height: 80px; background: #fff; }
          
          .footer { margin-top: 50px; display: flex; justify-content: space-between; text-align: center; }
          .signature { width: 150px; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 30px; font-weight: bold; font-size: 12px; }
        </style>
        
        <div class="header">
          <div class="society-info">
            <p>مديرية التضامن الاجتماعي بالدقهلية</p>
            <p>جمعية بصمة خير نبروه</p>
            <p>المشهرة برقم ٢٥١٠ لسنة ٢٠١٥</p>
          </div>
          <div class="society-logo">
            <h2 style="margin:0; font-size: 20px;">بصمة خير</h2>
            <p style="margin:0; font-size: 10px;">نبروه</p>
          </div>
          <div style="text-align: left;">
            <p style="font-size: 11px; margin:0;">كود المريض: ${c.codeNumber || c.id.substring(0, 8)}</p>
            <p style="font-size: 11px; margin:0;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>

        <div class="report-title">
          <h1>تقرير حالة طبية مفصل</h1>
          <p style="font-size: 12px; margin: 4px 0 0 0;">سجل المساعدات الطبية والبيانات الصحية للمريض</p>
        </div>

        <div class="section">
          <div class="section-title">بيانات المريض الأساسية</div>
          <div class="data-grid">
            <div class="data-item">
              <span class="label">اسم المريض</span>
              <div class="value">
                ${c.name} 
                <span class="badge ${c.isUnderAge ? 'badge-amber' : 'badge-emerald'}">
                  ${c.isUnderAge ? 'تحت السن' : 'بالغ'}
                </span>
              </div>
            </div>
            <div class="data-item"><span class="label">الرقم القومي</span><div class="value">${c.nationalId}</div></div>
            <div class="data-item"><span class="label">رقم الهاتف</span><div class="value">${c.phone}</div></div>
            <div class="data-item full-width"><span class="label">العنوان</span><div class="value">${c.address}</div></div>
            
            ${c.isUnderAge ? `
              <div class="data-item"><span class="label">اسم ولي الأمر</span><div class="value">${c.guardianName || '-'}</div></div>
              <div class="data-item"><span class="label">الرقم القومي لولي الأمر</span><div class="value">${c.guardianNationalId || '-'}</div></div>
            ` : ''}
          </div>
        </div>

        <div class="section">
          <div class="section-title">التشخيص والجهة الطبية</div>
          <div class="data-grid">
            <div class="data-item full-width"><span class="label">التشخيص / الحالة المرضية</span><div class="value">${c.diseaseType}</div></div>
            <div class="data-item"><span class="label">الطبيب المعالج</span><div class="value">${c.doctorName || '-'}</div></div>
            <div class="data-item"><span class="label">المركز / المستشفى</span><div class="value">${c.medicalCenter || '-'}</div></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">بيانات المساعدة والتمويل</div>
          <div class="data-grid">
            <div class="data-item"><span class="label">نوع المساعدة المطلوبة</span><div class="value">${(c.assistanceTypes || []).join(' - ')}</div></div>
            <div class="data-item"><span class="label">تاريخ الطلب</span><div class="value">${c.assistanceDate}</div></div>
            <div class="data-item">
              <span class="label">نوع الدعم</span>
              <div class="value">${c.helpType === 'cash' ? 'دعم مالي (نقدي)' : 'دعم عيني / آخر'}</div>
            </div>
            <div class="data-item">
              <span class="label">القيمة / التفاصيل</span>
              <div class="value">${c.helpType === 'cash' ? c.helpAmount + ' ج.م' : c.otherHelpDetails || '-'}</div>
            </div>
            <div class="data-item full-width">
              <span class="label">حالة المساعدة</span>
              <div class="value" style="color: ${c.isHelped ? '#059669' : '#dc2626'}">
                ${c.isHelped ? 'تم تسليم المساعدة بنجاح' : 'جاري مراجعة الطلب (لم يتم التسليم بعد)'}
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">ملاحظات إضافية</div>
          <div class="notes-box">
            ${c.notes || 'لا توجد ملاحظات إضافية مسجلة لهذه الحالة'}
          </div>
        </div>

        <div class="footer">
          <div class="signature">تحريراً بمعرفة / المسؤول</div>
          <div class="signature">توقيع أمين الصندوق</div>
          <div class="signature">رئيس مجلس الإدارة</div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.innerHTML = content;
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
      pdf.save(`تقرير_طبي_${c.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      document.body.removeChild(container);
    }
  };

  const handleEditClick = (patient: MedicalCase) => {
    setFormData({
        codeNumber: patient.codeNumber || '',
        name: patient.name || '',
        phone: patient.phone || '',
        nationalId: patient.nationalId || '',
        isUnderAge: patient.isUnderAge || false,
        guardianName: patient.guardianName || '',
        guardianNationalId: patient.guardianNationalId || '',
        address: patient.address || '',
        assistanceTypes: patient.assistanceTypes || (patient.assistanceType ? [patient.assistanceType] : ['روشتة']),
        assistanceDate: patient.assistanceDate || new Date().toISOString().split('T')[0],
        helpType: patient.helpType || 'cash',
        helpAmount: patient.helpAmount || '',
        otherHelpDetails: patient.otherHelpDetails || '',
        doctorName: patient.doctorName || '',
        medicalCenter: patient.medicalCenter || '',
        isHelped: patient.isHelped || false,
        diseaseType: patient.diseaseType || '',
        attachments: patient.attachments || (patient.documentUrl ? [{ url: patient.documentUrl, name: 'مرفق سابق' }] : []),
        nationalIdAttachments: patient.nationalIdAttachments || [],
        spouseIdAttachments: patient.spouseIdAttachments || [],
        patientPhoto: patient.patientPhoto || null,
        birthCertificates: patient.birthCertificates || [],
        deathCertificate: patient.deathCertificate || null,
        divorceCertificate: patient.divorceCertificate || null,
        medicalReports: patient.medicalReports || [],
        xRays: patient.xRays || [],
        labTests: patient.labTests || [],
        otherDocs: patient.otherDocs || [],
        notes: patient.notes
    });
    setEditingId(patient.id);
    setIsAddModalOpen(true);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          setImporting(true);
          const headers = Object.keys(json[0] as any);
          
          const mapping = {
            name: headers.find(h => h.includes('الاسم') || h.toLowerCase().includes('name')) || '',
            phone: headers.find(h => h.includes('هاتف') || h.includes('phone')) || '',
            nationalId: headers.find(h => h.includes('قومي') || h.includes('id')) || '',
            diseaseType: headers.find(h => h.includes('تشخيص') || h.includes('مرض')) || '',
            doctorName: headers.find(h => h.includes('طبيب')) || '',
            medicalCenter: headers.find(h => h.includes('مركز') || h.includes('مستشفى')) || '',
            assistanceType: headers.find(h => h.includes('نوع المساعدة')) || 'روشتة'
          };

          if (!mapping.name) {
            alert('يجب أن يحتوي ملف الإكسل على عمود "الاسم" على الأقل');
            setImporting(false);
            return;
          }

          let lastNum = medicalCases
            .map(c => parseInt((c.codeNumber || '').substring(1)))
            .filter(n => !isNaN(n))
            .sort((a, b) => b - a)[0] || 0;

          let count = 0;
          const batchSize = 50;
          for (let i = 0; i < json.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = json.slice(i, i + batchSize);
            
            chunk.forEach((row: any) => {
              const name = String(row[mapping.name] || '').trim();
              if (name) {
                 lastNum++;
                 const code = `H${lastNum}`;
                 const docRef = doc(collection(db, 'medicalCases'));
                 batch.set(docRef, {
                    name,
                    codeNumber: code,
                    nationalId: String(row[mapping.nationalId] || '').trim(),
                    phone: String(row[mapping.phone] || ''),
                    diseaseType: String(row[mapping.diseaseType] || 'غير محدد'),
                    doctorName: String(row[mapping.doctorName] || ''),
                    medicalCenter: String(row[mapping.medicalCenter] || ''),
                    assistanceTypes: [String(row[mapping.assistanceType] || 'روشتة')],
                    isHelped: false,
                    helpType: 'cash',
                    helpAmount: 0,
                    notes: 'استيراد تلقائي عبر إكسل',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                 });
                 count++;
              }
            });
            await batch.commit();
          }
          alert(`تم استيراد ${count} مريض بنجاح`);
        }
      } catch (error) {
        console.error(error);
        alert('خطأ في قراءة أو استيراد ملف الإكسل');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleDeletePatient = (id: string) => {
    const caseData = medicalCases.find(c => c.id === id);
    const patientName = caseData?.name || '';
    setConfirmConfig({
      isOpen: true,
      title: 'حذف مريض مريض',
      message: 'هل أنت متأكد من حذف هذا المريض وكافة سجلاته الطبية؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'medicalCases', id));
          if (caseData) {
            await logSystemAction('delete', 'medicalCases', id, caseData, `حذف حالة طبية: ${patientName}`);
          }
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          if (selectedCase?.id === id) setSelectedCase(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `medicalCases/${id}`);
        }
      }
    });
  };



  const filteredCases = medicalCases.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nationalId.includes(searchQuery) ||
      (c.codeNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.diseaseType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.doctorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.medicalCenter?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'all' ? true : 
      filterStatus === 'helped' ? c.isHelped : !c.isHelped;

    const matchesAssistance = filterAssistanceType === 'all' ? true :
      (c.assistanceTypes || [c.assistanceType]).includes(filterAssistanceType);

    const matchesDup = !filterDuplicatesOnly || getIsDuplicate(c).isDuplicate;

    return matchesSearch && matchesStatus && matchesAssistance && matchesDup;
  }).sort((a, b) => {
    let result = 0;
    if (sortField === 'name') result = a.name.localeCompare(b.name, 'ar');
    else if (sortField === 'codeNumber') result = (a.codeNumber || '').localeCompare(b.codeNumber || '');
    else if (sortField === 'assistanceDate') result = (a.assistanceDate || '').localeCompare(b.assistanceDate || '');
    else if (sortField === 'isHelped') result = (a.isHelped === b.isHelped) ? 0 : (a.isHelped ? 1 : -1);
    else if (sortField === 'assistanceType') {
      const typeA = (a.assistanceTypes || [a.assistanceType])[0] || '';
      const typeB = (b.assistanceTypes || [b.assistanceType])[0] || '';
      result = typeA.localeCompare(typeB, 'ar');
    }
    return sortDirection === 'asc' ? result : -result;
  });

  const handleExportExcel = () => {
    const data = filteredCases.map((c, index) => ({
      '#': index + 1,
      'رقم كودي': c.codeNumber || '-',
      'الاسم': c.name,
      'نوع المساعدة': (c.assistanceTypes || [c.assistanceType]).join(', '),
      'الرقم القومي': c.nationalId,
      'رقم الهاتف': c.phone,
      'التشخيص': c.diseaseType,
      'الطبيب': c.doctorName || '-',
      'المركز': c.medicalCenter || '-',
      'العنوان': c.address
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Medical Patients');
    XLSX.writeFile(wb, `medical_patients_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printDate = new Date().toLocaleDateString('ar-EG');

    const content = `
      <html>
        <head>
          <title>كشف السجلات الطبية - بصمة خير</title>
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
            .footer-sign { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 40px; }
            .sign-box { text-align: center; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header-info">
            <div class="society-details">
              <p>مديرية التضامن الاجتماعي بالدقهلية</p>
              <p>ادارة التضامن الاجتماعي بنبروه</p>
              <p>جمعية بصمة خير بنبروه</p>
              <p>المشهرة برقم ٢٥١٠ لسنة ٢٠١٥</p>
            </div>
            <div style="text-align: center;">
              <p style="font-size: 10px; color: #059669; margin: 0; font-weight: bold;">بصمة خير</p>
            </div>
            <div style="text-align: left;">
              <p>التاريخ: ${printDate}</p>
              <p>نوع الكشف: سجلات طبية</p>
            </div>
          </div>

          <div class="report-title">
            <h1>كشف السجلات الطبية للمرضى</h1>
            <p>سجل بيانات المساعدات الطبية المقدمة</p>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">م</th>
                <th>الاسم</th>
                <th>الرقم القومي</th>
                <th>الطبيب / المركز</th>
                <th>نوع المساعدة</th>
                <th>طبيعة المساعدة</th>
                <th>المبلغ/التفاصيل</th>
                <th>الحالة</th>
                <th style="width: 120px;">التوقيع</th>
              </tr>
            </thead>
            <tbody>
              ${filteredCases.map((c, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td style="text-align: right; font-weight: bold;">
                    ${c.name}
                    ${c.codeNumber ? `<br/><span style="font-size: 10px; color: #666;">كود: ${c.codeNumber}</span>` : ''}
                  </td>
                  <td>${c.nationalId}</td>
                  <td style="font-size: 11px;">${c.doctorName || '-'} / ${c.medicalCenter || '-'}</td>
                  <td>${(c.assistanceTypes || [c.assistanceType]).join(', ')}</td>
                  <td>${c.helpType === 'cash' ? 'نقدية' : 'أخرى'}</td>
                  <td style="font-size: 11px;">${c.helpType === 'cash' ? (c.helpAmount || '0') + ' ج.م' : (c.otherHelpDetails || '-')}</td>
                  <td>${c.isHelped ? 'تمت' : 'لم تتم'}</td>
                  <td></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer-sign">
            <div class="sign-box">
              <p>المسؤول الطبي</p>
              <p>....................</p>
            </div>
            <div class="sign-box">
              <p>أمين الصندوق</p>
              <p>....................</p>
            </div>
            <div class="sign-box">
              <p>رئيس مجلس الإدارة</p>
              <p>....................</p>
            </div>
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

  if (selectedCase) {
    return (
      <div className="p-6 font-sans" dir="rtl">
        <div className="flex items-center gap-4 mb-8">
           <button 
             onClick={() => setSelectedCase(null)}
             className="p-3 bg-white border border-emerald-100 text-emerald-600 rounded-2xl hover:bg-emerald-50 transition-all shadow-sm"
           >
             <ArrowRight className="w-6 h-6" />
           </button>
           <div className="flex-grow">
             <h1 className="text-3xl font-black text-emerald-950">{selectedCase.name}</h1>
             <p className="text-emerald-600 font-bold flex items-center gap-2 mt-1">
               <Stethoscope className="w-4 h-4" />
               السجل الطبي التفصيلي
             </p>
           </div>
           <div className="flex flex-wrap gap-2">
             <button 
               onClick={() => handlePrintSingleCase(selectedCase)}
               className="flex items-center gap-2 bg-emerald-950 text-white px-6 py-3 rounded-2xl hover:bg-black transition-all font-bold shadow-lg"
             >
               <Printer className="w-5 h-5" />
               <span>طباعة التقرير بالتفاصيل</span>
             </button>
             <button 
               onClick={() => handleDownloadPDF(selectedCase)}
               className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-900 px-6 py-3 rounded-2xl hover:bg-emerald-50 transition-all font-bold shadow-lg"
             >
               <FileDown className="w-5 h-5" />
               <span>حفظ التقرير (PDF)</span>
             </button>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
           {/* Sidebar: Patient Info */}
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-[2.5rem] border border-emerald-100 p-8 shadow-xl">
                 <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                    <User className="w-10 h-10 text-emerald-600" />
                 </div>
                 
                 <div className="space-y-4">
                    <div className="flex flex-wrap gap-2 mb-2 p-1 bg-emerald-50 rounded-xl w-fit">
                      <span className={cn(
                        "text-[10px] font-black px-2 py-1 rounded-lg",
                        selectedCase.isUnderAge ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {selectedCase.isUnderAge ? 'تحت السن (طفل)' : 'فوق السن (بالغ)'}
                      </span>
                      {selectedCase.codeNumber && (
                        <span className="text-[10px] font-black px-2 py-1 bg-emerald-950 text-white rounded-lg">
                          كود: {selectedCase.codeNumber}
                        </span>
                      )}
                    </div>
                    <InfoField icon={<CreditCard className="w-4 h-4" />} label={selectedCase.isUnderAge ? "الرقم القومي للطفل/ة" : "الرقم القومي للمريض"} value={selectedCase.nationalId} />
                    
                    {selectedCase.isUnderAge && (
                      <>
                        <InfoField icon={<User className="w-4 h-4" />} label="اسم ولي الامر" value={selectedCase.guardianName || 'غير مسجل'} />
                        <InfoField icon={<CreditCard className="w-4 h-4" />} label="الرقم القومي لولي الامر" value={selectedCase.guardianNationalId || 'غير مسجل'} />
                      </>
                    )}
                    <InfoField icon={<Activity className="w-4 h-4" />} label="نوع المساعدة" value={selectedCase.assistanceType || 'روشتة'} />
                    {selectedCase.helpType === 'cash' ? (
                       <InfoField icon={<ClipboardList className="w-4 h-4" />} label="المساعدة النقدية" value={`${selectedCase.helpAmount} ج.م`} />
                    ) : (
                       <InfoField icon={<Info className="w-4 h-4" />} label="تفاصيل المساعدة" value={selectedCase.otherHelpDetails || 'غير محدد'} />
                    )}
                    <InfoField icon={<Phone className="w-4 h-4" />} label="رقم الهاتف" value={selectedCase.phone} />
                    <InfoField icon={<MapPin className="w-4 h-4" />} label="العنوان" value={selectedCase.address} />
                    {selectedCase.doctorName && <InfoField icon={<User className="w-4 h-4" />} label="الطبيب المعالج" value={selectedCase.doctorName} />}
                    {selectedCase.medicalCenter && <InfoField icon={<Hospital className="w-4 h-4" />} label="المركز / المستشفى" value={selectedCase.medicalCenter} />}
                    
                    {(selectedCase.attachments || []).length > 0 && (
                      <div className="pt-4 border-t border-emerald-50">
                        <span className="text-[10px] font-black text-emerald-400 block mb-2">المستندات المرفقة</span>
                        <div className="flex flex-col gap-2">
                          {(selectedCase.attachments || []).map((file, idx) => (
                            <div key={idx} className="relative group/doc rounded-2xl overflow-hidden border border-emerald-100 bg-emerald-50/50 aspect-video">
                              {file.url ? (
                                <img 
                                  src={file.url} 
                                  alt={file.name} 
                                  className="w-full h-full object-cover"
                                />
                              ) : null}
                              <a 
                                href={file.url || undefined} 
                                target="_blank" 
                                rel="noreferrer"
                                className="absolute inset-0 flex items-center justify-center bg-emerald-950/40 opacity-0 group-hover/doc:opacity-100 transition-all text-white font-bold gap-2 text-xs"
                              >
                                <Download className="w-4 h-4" />
                                {file.name}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="pt-4 border-t border-emerald-50">
                       <span className="text-[10px] font-black text-emerald-400 block mb-1">الحالة الطبية</span>
                       <p className="text-emerald-900 font-bold bg-emerald-50 px-4 py-3 rounded-2xl text-sm leading-relaxed">
                          {selectedCase.diseaseType}
                       </p>
                    </div>
                 </div>
              </div>
              
              <button 
                onClick={() => setIsMedicalModalOpen(true)}
                className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white py-5 rounded-[2rem] font-bold shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all"
              >
                <Plus className="w-6 h-6" />
                إضافة فحص جديد
              </button>
           </div>

           {/* Main: Tabs for Records */}
           <div className="lg:col-span-3">
              <div className="bg-white rounded-[2.5rem] border border-emerald-100 shadow-xl overflow-hidden min-h-[600px] flex flex-col">
                 <div className="flex border-b border-emerald-100 bg-stone-50/50 px-8 pt-4 gap-2">
                    <TabButton active={activeTab === 'prescriptions'} onClick={() => setActiveTab('prescriptions')} icon={<FileText className="w-4 h-4" />} label="الروشتات" />
                    <TabButton active={activeTab === 'surgeries'} onClick={() => setActiveTab('surgeries')} icon={<Activity className="w-4 h-4" />} label="العمليات" />
                    <TabButton active={activeTab === 'labTests'} onClick={() => setActiveTab('labTests')} icon={<FlaskConical className="w-4 h-4" />} label="التحاليل" />
                    <TabButton active={activeTab === 'radiology'} onClick={() => setActiveTab('radiology')} icon={<Database className="w-4 h-4" />} label="الأشعة" />
                 </div>
                 
                 <div className="p-8 flex-grow">
                    <MedicalRecordsList caseId={selectedCase.id} tab={activeTab} />
                 </div>
              </div>
           </div>
        </div>

        <MedicalModal 
          isOpen={isMedicalModalOpen}
          onClose={() => setIsMedicalModalOpen(false)}
          caseId={selectedCase.id}
          caseName={selectedCase.name}
          mode="independent" 
        />
      </div>
    );
  }

  return (
    <div className="p-6 font-sans" dir="rtl">
      {/* Visual Section Header Banner */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-emerald-900 h-48 flex items-center p-8 mb-8 text-white shadow-lg border border-emerald-800">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=1200" 
            alt="Medical Support" 
            className="w-full h-full object-cover opacity-20 select-none"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-900/90 to-emerald-950/40" />
        </div>
        <div className="relative z-10 w-full text-right">
          <h1 className="text-3xl font-black mb-2">السجلات الطبية وتيسير العلاج</h1>
          <p className="text-emerald-200 text-xs md:text-sm font-semibold max-w-2xl leading-relaxed">
            الرعاية والملفات الطبية بجمعية بصمة خير - نمول العمليات الجراحية، ونوفر الفحوصات الطبية والأدوية الشهرية اللازمة للأسر المتعففة والمرضى غير القادرين، متكاملة مع إدارة التقارير الطبية.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h2 className="text-xl font-black text-emerald-950 flex items-center gap-3">
            <Stethoscope className="w-10 h-10 text-emerald-600" />
            <span>ملفات المرضى</span>
          </h2>
          <p className="text-emerald-700/60 mt-1 font-bold">إدارة وملفات المرضى والمستندات الطبية الخاصة بهم</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
           <div className="flex items-center bg-white border border-emerald-100 rounded-2xl p-1.5 shadow-sm">
              <select 
                className="bg-transparent border-none text-xs font-bold text-emerald-900 outline-none px-3 py-1 cursor-pointer"
                value={sortField}
                onChange={(e: any) => setSortField(e.target.value)}
              >
                <option value="name">ترتيب بالاسم</option>
                <option value="codeNumber">ترتيب برقم الكود</option>
                <option value="assistanceDate">ترتيب بالتاريخ</option>
                <option value="assistanceType">ترتيب بنوع المساعدة</option>
                <option value="isHelped">ترتيب بحالة المساعدة</option>
              </select>
              <button 
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-2 hover:bg-emerald-50 rounded-xl text-emerald-600 transition-all"
                title={sortDirection === 'asc' ? 'تصاعدي' : 'تنازلي'}
              >
                <Database className={cn("w-4 h-4", sortDirection === 'asc' ? "rotate-180" : "")} />
              </button>
           </div>

           <div className="flex items-center bg-white border border-emerald-100 rounded-2xl p-1.5 shadow-sm">
              <select 
                className="bg-transparent border-none text-xs font-bold text-emerald-700 outline-none px-3 py-1 cursor-pointer"
                value={filterStatus}
                onChange={(e: any) => setFilterStatus(e.target.value)}
              >
                <option value="all">كل الحالات</option>
                <option value="helped">تمت المساعدة</option>
                <option value="pending">لم تتم المساعدة</option>
              </select>
              <div className="w-[1px] h-6 bg-emerald-100 mx-1"></div>
              <select 
                className="bg-transparent border-none text-xs font-bold text-emerald-700 outline-none px-3 py-1 cursor-pointer"
                value={filterAssistanceType}
                onChange={(e: any) => setFilterAssistanceType(e.target.value)}
              >
                <option value="all">كل الأنواع</option>
                {['روشتة', 'انسولين', 'عملية', 'تحليل', 'أشعة', 'أطراف صناعية', 'أخرى'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
           </div>

           <button 
             onClick={() => setIsAddModalOpen(true)}
             className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-[1.5rem] font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
           >
             <Plus className="w-5 h-5" />
             <span>إضافة مريض جديد</span>
           </button>

           <div className="flex items-center bg-white border border-emerald-100 rounded-2xl p-1.5 shadow-sm">
            <button 
              onClick={handleExportExcel}
              disabled={filteredCases.length === 0}
              className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all disabled:opacity-50"
              title="تصدير Excel"
            >
              <FileDown className="w-6 h-6" />
            </button>
            <label className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer" title="استيراد من Excel">
               <FileUp className="w-6 h-6" />
               <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
            </label>
            <button 
              onClick={handlePrint}
              className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
              title="طباعة السجل"
            >
              <Printer className="w-6 h-6" />
            </button>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 w-5 h-5" />
            <input 
              type="text"
              placeholder="بحث باسم المريض، الهاتف أو الرقم القومي..."
              className="w-full bg-white border border-emerald-100 rounded-2xl py-4 pr-12 pl-4 focus:ring-2 ring-emerald-500/20 outline-none font-bold text-sm shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {duplicateMedicalCount > 0 && (
        <div 
          onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
          className={cn(
            "p-5 rounded-[2.5rem] flex flex-row-reverse items-center justify-between cursor-pointer border transition-all text-right select-none mb-6 shadow-sm",
            filterDuplicatesOnly 
              ? "bg-rose-100 border-rose-300 text-rose-950 shadow-md scale-[1.01]" 
              : "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100"
          )}
        >
          <div className="flex items-center gap-3 flex-row-reverse">
            <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce shrink-0" />
            <div>
              <span className="font-extrabold text-sm block">تم كشف {duplicateMedicalCount} حالة تكرار في ملفات المرضى (الاسم أو الهوية أو الهاتف)!</span>
              <span className="text-xs font-bold text-rose-600">انقر هنا لعرض الحالات المكررة لتدقيقها والتحقق منها</span>
            </div>
          </div>
          <span className={cn(
            "px-4 py-2 rounded-2xl text-xs font-black transition-all",
            filterDuplicatesOnly ? "bg-rose-600 text-white" : "bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
          )}>
            {filterDuplicatesOnly ? "عرض كل الحالات" : "عرض الحالات المكررة"}
          </span>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] border border-emerald-100 shadow-2xl overflow-hidden min-h-[600px] flex flex-col">
        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center py-32 space-y-4">
             <Loader2 className="w-16 h-16 text-emerald-500 animate-spin" />
             <p className="text-emerald-600 font-black animate-pulse">جاري جلب قائمة المرضى...</p>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center py-32">
            <div className="bg-emerald-50 p-12 rounded-full mb-8">
              <ClipboardList className="w-24 h-24 text-emerald-200" />
            </div>
            <h3 className="text-3xl font-black text-emerald-950 mb-3">لا يوجد مرضى مضافون</h3>
            <p className="text-emerald-600/60 max-w-sm text-center font-bold text-lg">يمكنك البدء بإضافة مريض جديد وتوثيق سجلاته الطبية والدوائية هنا.</p>
          </div>
        ) : (
          <div className="custom-scrollbar sticky-table-container">
             <table className="w-full text-right min-w-[1000px]">
                <thead>
                   <tr className="bg-emerald-50/50 border-b border-emerald-100">
                      <th className="px-6 py-6 text-emerald-950 font-black text-sm text-center">#</th>
                      <th className="px-6 py-6 text-emerald-950 font-black text-sm text-center">الكود</th>
                      <th className="px-10 py-6 text-emerald-950 font-black text-sm uppercase tracking-wider">المريض</th>
                      <th className="px-10 py-6 text-emerald-950 font-black text-sm uppercase tracking-wider">نوع المساعدة</th>
                      <th className="px-10 py-6 text-emerald-950 font-black text-sm uppercase tracking-wider">التاريخ / الحالة</th>
                      <th className="px-10 py-6 text-emerald-950 font-black text-sm uppercase tracking-wider text-center">الإجراءات</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                   {filteredCases.map((patient, index) => (
                      <tr key={patient.id} className="group hover:bg-emerald-50/20 transition-all">
                         <td className="px-6 py-7 text-center font-black text-emerald-400 tabular-nums">
                            {index + 1}
                         </td>
                         <td className="px-6 py-7">
                            {patient.codeNumber ? (
                               <div className="flex items-center justify-center">
                                  <div className="bg-emerald-950 text-white px-3 py-1.5 rounded-xl font-black text-sm shadow-md min-w-[60px] text-center border-2 border-emerald-800">
                                     {patient.codeNumber}
                                  </div>
                               </div>
                            ) : (
                               <div className="text-center text-emerald-300 font-bold text-xs">لا يوجد</div>
                            )}
                         </td>
                         <td className="px-10 py-7">
                            <div className="flex items-center gap-5">
                               <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <User className="w-7 h-7 text-emerald-600" />
                               </div>
                               <div>
                                  <div className="flex items-center gap-2 mb-1">
                                     <div className={cn(
                                        "font-black text-xl",
                                        getIsDuplicate(patient).isDuplicate ? "text-rose-700 font-extrabold animate-pulse" : "text-emerald-950"
                                     )}>{patient.name}</div>
                                     {patient.isUnderAge && (
                                        <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded-lg font-black whitespace-nowrap">تحت السن</span>
                                     )}
                                  </div>
                                  {(() => {
                                     const dupInfo = getIsDuplicate(patient);
                                     return dupInfo.isDuplicate && (
                                        <div className="flex items-center gap-1 text-[8px] font-black bg-rose-50 border border-rose-100 text-rose-600 px-1.5 py-0.5 rounded-lg w-max select-none mb-1">
                                           <AlertTriangle className="w-2.5 h-2.5 text-rose-500" />
                                           <span>تكرار في: </span>
                                           {dupInfo.reasons.name && <span className="bg-rose-100 text-rose-800 px-0.5 rounded">الاسم</span>}
                                           {dupInfo.reasons.nationalId && <span className="bg-rose-100 text-rose-800 px-0.5 rounded">الهوية</span>}
                                           {dupInfo.reasons.phone && <span className="bg-rose-100 text-rose-800 px-0.5 rounded">الهاتف</span>}
                                        </div>
                                     );
                                  })()}
                                  <div className="flex items-center gap-3 text-xs font-bold text-emerald-600/60">
                                     <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {patient.phone}</span>
                                     <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> ID: {patient.nationalId}</span>
                                  </div>
                               </div>
                            </div>
                         </td>
                         <td className="px-10 py-7">
                            <div className="flex flex-wrap gap-2">
                               {(patient.assistanceTypes || [patient.assistanceType]).map(type => (
                                 <span key={type} className="font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 text-[10px]">
                                    {type}
                                 </span>
                               ))}
                            </div>
                         </td>
                         <td className="px-10 py-7">
                            <div className="flex flex-col gap-1">
                               <span className="text-xs font-black text-emerald-400">{patient.assistanceDate}</span>
                               <span className={cn(
                                 "w-fit px-3 py-1 rounded-full text-[10px] font-black",
                                 patient.isHelped ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                               )}>
                                  {patient.isHelped ? 'تمت المساعدة' : 'لم تتم المساعدة'}
                               </span>
                            </div>
                         </td>
                         <td className="px-10 py-7">
                            <div className="flex items-center justify-center gap-2">
                               <button 
                                 onClick={() => handlePrintSingleCase(patient)}
                                 className="p-3 text-emerald-600 hover:bg-emerald-50 bg-white border border-emerald-100 rounded-xl transition-all"
                                 title="طباعة التقرير"
                               >
                                  <Printer className="w-5 h-5" />
                               </button>
                               <button 
                                 onClick={() => handleDownloadPDF(patient)}
                                 className="p-3 text-blue-600 hover:bg-blue-50 bg-white border border-blue-100 rounded-xl transition-all"
                                 title="حفظ بصيغة PDF"
                               >
                                  <FileDown className="w-5 h-5" />
                               </button>
                               <button 
                                 onClick={() => setSelectedCase(patient)}
                                 className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-5 py-3 rounded-xl font-bold hover:bg-emerald-100 transition-all"
                               >
                                  <FileText className="w-4 h-4" />
                                  <span>السجل</span>
                               </button>
                               <button 
                                 onClick={() => setUnifiedTransferCase({
                                   id: patient.id,
                                   name: patient.name,
                                   nationalId: patient.nationalId,
                                   phone: patient.phone || '',
                                   address: patient.address || '',
                                   village: patient.village || '',
                                   familyCount: Number(patient.familyCount) || 1,
                                   sourceSection: 'medical',
                                   sourceSectionLabel: 'الحالات الطبية',
                                   sourceCollection: 'medicalCases'
                                 })}
                                 className="p-3 text-emerald-600 hover:bg-emerald-50 bg-white border border-emerald-250 rounded-xl transition-all"
                                 title="الربط والنقل بين الأقسام"
                               >
                                 <ArrowRightLeft className="w-5 h-5 text-emerald-600" />
                               </button>
                               <button 
                                 onClick={() => handleEditClick(patient)}
                                 className="p-3 text-amber-600 hover:bg-amber-50 bg-white border border-amber-100 rounded-xl transition-all"
                               >
                                  <Database className="w-4 h-4" />
                               </button>
                               <button 
                                 onClick={() => handleDeletePatient(patient.id)}
                                 className="p-3 text-rose-300 hover:text-rose-600 bg-white border border-rose-100 rounded-xl hover:bg-rose-50 transition-all"
                               >
                                  <Trash2 className="w-4 h-4" />
                               </button>
                            </div>
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
        )}
      </div>

      {/* Add Patient Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-emerald-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden border border-emerald-50 flex flex-col max-h-[90vh]"
            >
              <div className="p-8 pb-4 border-b border-emerald-50 bg-white flex items-center justify-between">
                <h3 className="text-3xl font-black text-emerald-900 px-6 py-3 bg-emerald-50 rounded-[1.5rem]">
                  {editingId ? 'تعديل بيانات المريض' : 'إضافة مريض جديد'}
                </h3>
                <button onClick={() => { setIsAddModalOpen(false); setEditingId(null); }} className="p-4 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all">
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="p-10 pt-4 overflow-y-auto custom-scrollbar flex-grow">
                <form onSubmit={handleAddPatient} className="space-y-6">
                  {/* Age Category Selection */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider mr-2 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      فئة المريض
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, isUnderAge: false})}
                        className={cn(
                          "py-4 rounded-2xl font-bold text-sm transition-all border",
                          !formData.isUnderAge ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                        )}
                      >فوق السن (بالغ)</button>
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, isUnderAge: true})}
                        className={cn(
                          "py-4 rounded-2xl font-bold text-sm transition-all border",
                          formData.isUnderAge ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                        )}
                      >تحت السن (طفل)</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputGroup 
                      label="رقم كودي" 
                      icon={<Shield className="w-4 h-4" />} 
                      value={formData.codeNumber} 
                      onChange={v => setFormData({...formData, codeNumber: v})} 
                    />
                    <div className="hidden md:block"></div>
                    <InputGroup 
                      label={formData.isUnderAge ? "اسم الطفل/ة بالكامل" : "اسم المريض بالكامل"} 
                      icon={<User className="w-4 h-4" />} 
                      value={formData.name} 
                      onChange={v => setFormData({...formData, name: v})} 
                      required 
                    />
                    <InputGroup 
                      label={formData.isUnderAge ? "الرقم القومي للطفل/ة" : "الرقم القومي للمريض"} 
                      icon={<CreditCard className="w-4 h-4" />} 
                      value={formData.nationalId} 
                      onChange={v => setFormData({...formData, nationalId: v})} 
                      required 
                    />

                    {formData.isUnderAge && (
                      <>
                        <InputGroup 
                          label="اسم ولي الامر" 
                          icon={<User className="w-4 h-4" />} 
                          value={formData.guardianName || ''} 
                          onChange={v => setFormData({...formData, guardianName: v})} 
                          required 
                        />
                        <InputGroup 
                          label="الرقم القومي لولي الامر" 
                          icon={<CreditCard className="w-4 h-4" />} 
                          value={formData.guardianNationalId || ''} 
                          onChange={v => setFormData({...formData, guardianNationalId: v})} 
                          required 
                        />
                      </>
                    )}

                    <InputGroup label="اسم الطبيب" icon={<User className="w-4 h-4" />} value={formData.doctorName || ''} onChange={v => setFormData({...formData, doctorName: v})} />
                    <InputGroup label="المركز / المستشفى" icon={<Hospital className="w-4 h-4" />} value={formData.medicalCenter || ''} onChange={v => setFormData({...formData, medicalCenter: v})} />
                    <InputGroup label="رقم الهاتف" icon={<Phone className="w-4 h-4" />} value={formData.phone} onChange={v => setFormData({...formData, phone: v})} required />
                    <InputGroup label="العنوان السكني" icon={<MapPin className="w-4 h-4" />} value={formData.address} onChange={v => setFormData({...formData, address: v})} required />
                    
                    <div className="space-y-2 md:col-span-2">
                       <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider mr-2 flex items-center gap-2">
                          <Activity className="w-4 h-4" />
                          نوع المساعدة المطلوبة (يمكن اختيار أكثر من نوع)
                       </label>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100">
                          {['روشتة', 'انسولين', 'عملية', 'تحليل', 'أشعة', 'أطراف صناعية', 'أخرى'].map(type => (
                             <label key={type} className="flex items-center gap-2 cursor-pointer group hover:bg-white/50 p-2 rounded-lg transition-all">
                                <input 
                                  type="checkbox"
                                  className="w-5 h-5 rounded-lg border-emerald-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer"
                                  checked={formData.assistanceTypes.includes(type)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setFormData(prev => ({
                                      ...prev,
                                      assistanceTypes: checked 
                                        ? [...prev.assistanceTypes, type]
                                        : prev.assistanceTypes.filter(t => t !== type)
                                    }));
                                  }}
                                />
                                <span className={cn(
                                  "text-sm font-bold transition-colors",
                                  formData.assistanceTypes.includes(type) ? "text-emerald-700" : "text-emerald-400 group-hover:text-emerald-600"
                                )}>{type}</span>
                             </label>
                          ))}
                       </div>
                    </div>

                    <InputGroup 
                       label="تاريخ المساعدة"
                       icon={<Calendar className="w-4 h-4" />} 
                       value={formData.assistanceDate} 
                       onChange={v => setFormData({...formData, assistanceDate: v})}
                    />

                    <div className="space-y-2 md:col-span-2">
                       <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider mr-2 flex items-center gap-2">
                          <ClipboardList className="w-4 h-4" />
                          طبيعة المساعدة المقدمة
                       </label>
                       <div className="grid grid-cols-2 gap-4">
                          <button 
                             type="button"
                             onClick={() => setFormData({...formData, helpType: 'cash'})}
                             className={cn(
                               "py-4 rounded-2xl font-bold text-sm transition-all border",
                               formData.helpType === 'cash' ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                             )}
                          >مساعدة نقدية</button>
                          <button 
                             type="button"
                             onClick={() => setFormData({...formData, helpType: 'other'})}
                             className={cn(
                               "py-4 rounded-2xl font-bold text-sm transition-all border",
                               formData.helpType === 'other' ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                             )}
                          >مساعدة أخرى</button>
                       </div>
                    </div>

                    {formData.helpType === 'cash' ? (
                       <div className="md:col-span-2">
                         <InputGroup 
                            label="المبلغ النقدي (ج.م)" 
                            icon={<Activity className="w-4 h-4" />} 
                            value={formData.helpAmount || ''} 
                            onChange={v => setFormData({...formData, helpAmount: v})} 
                            required 
                          />
                       </div>
                    ) : (
                       <div className="md:col-span-2 space-y-2">
                          <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider mr-2 flex items-center gap-2">
                             <Info className="w-4 h-4" />
                             تفاصيل المساعدة الأخرى
                          </label>
                          <textarea 
                             className="w-full bg-emerald-50/50 border border-emerald-100 rounded-2xl py-4 px-6 focus:ring-4 ring-emerald-500/10 outline-none font-bold text-sm transition-all min-h-[80px]"
                             placeholder="مثال: توفير أطراف صناعية، كراسي متحركة، الخ..."
                             value={formData.otherHelpDetails || ''}
                             onChange={e => setFormData({...formData, otherHelpDetails: e.target.value})}
                          />
                       </div>
                    )}

                    <div className="md:col-span-2 space-y-6">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">صوره المريض</label>
                            <FileUploadSlot 
                              label="رفع صوره المريض"
                              caseName={formData.name || 'patient'}
                              storagePath="medical/profiles"
                              values={formData.patientPhoto ? [formData.patientPhoto] : []}
                              onUpload={(updater) => {
                                const current = formData.patientPhoto ? [formData.patientPhoto] : [];
                                const updated = typeof updater === 'function' ? updater(current) : updater;
                                setFormData(prev => ({ ...prev, patientPhoto: updated[0] || null }));
                              }}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">البطاقة الشخصية</label>
                            <FileUploadSlot 
                              label="رفع البطاقة الشخصية"
                              caseName={formData.nationalId || 'national_id'}
                              storagePath="medical/ids"
                              values={formData.nationalIdAttachments}
                              onUpload={(u) => setFormData(p => ({ ...p, nationalIdAttachments: typeof u === 'function' ? u(p.nationalIdAttachments) : u }))}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">بطاقة الزوج/ة</label>
                            <FileUploadSlot 
                              label="رفع بطاقة الزوج/ة"
                              caseName={formData.name || 'spouse'}
                              storagePath="medical/spouse_ids"
                              values={formData.spouseIdAttachments}
                              onUpload={(u) => setFormData(p => ({ ...p, spouseIdAttachments: typeof u === 'function' ? u(p.spouseIdAttachments) : u }))}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">شهادات ميلاد الاولاد</label>
                            <FileUploadSlot 
                              label="رفع شهادات الميلاد"
                              caseName={formData.name || 'children'}
                              storagePath="medical/birth_certs"
                              values={formData.birthCertificates}
                              onUpload={(u) => setFormData(p => ({ ...p, birthCertificates: typeof u === 'function' ? u(p.birthCertificates) : u }))}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">شهادة الوفاة</label>
                            <FileUploadSlot 
                              label="رفع شهادة الوفاة"
                              caseName={formData.name || 'death_cert'}
                              storagePath="medical/death_certs"
                              values={formData.deathCertificate ? [formData.deathCertificate] : []}
                              onUpload={(u) => {
                                const curr = formData.deathCertificate ? [formData.deathCertificate] : [];
                                const upd = typeof u === 'function' ? u(curr) : u;
                                setFormData(p => ({ ...p, deathCertificate: upd[0] || null }));
                              }}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">قسيمة الطلاق</label>
                            <FileUploadSlot 
                              label="رفع قسيمة الطلاق"
                              caseName={formData.name || 'divorce'}
                              storagePath="medical/divorce_certs"
                              values={formData.divorceCertificate ? [formData.divorceCertificate] : []}
                              onUpload={(u) => {
                                const curr = formData.divorceCertificate ? [formData.divorceCertificate] : [];
                                const upd = typeof u === 'function' ? u(curr) : u;
                                setFormData(p => ({ ...p, divorceCertificate: upd[0] || null }));
                              }}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">تقارير</label>
                            <FileUploadSlot 
                              label="رفع تقارير طبية"
                              caseName={formData.name || 'reports'}
                              storagePath="medical/reports"
                              values={formData.medicalReports}
                              onUpload={(u) => setFormData(p => ({ ...p, medicalReports: typeof u === 'function' ? u(p.medicalReports) : u }))}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">اشعات</label>
                            <FileUploadSlot 
                              label="رفع أشعات"
                              caseName={formData.name || 'xrays'}
                              storagePath="medical/xrays"
                              values={formData.xRays}
                              onUpload={(u) => setFormData(p => ({ ...p, xRays: typeof u === 'function' ? u(p.xRays) : u }))}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">تحاليل</label>
                            <FileUploadSlot 
                              label="رفع تحاليل"
                              caseName={formData.name || 'labtests'}
                              storagePath="medical/labtests"
                              values={formData.labTests}
                              onUpload={(u) => setFormData(p => ({ ...p, labTests: typeof u === 'function' ? u(p.labTests) : u }))}
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-xs font-black text-emerald-900 pr-2">مرفقات اخري</label>
                            <FileUploadSlot 
                              label="رفع مرفقات أخرى"
                              caseName={formData.name || 'misc'}
                              storagePath="medical/misc"
                              values={formData.otherDocs}
                              onUpload={(u) => setFormData(p => ({ ...p, otherDocs: typeof u === 'function' ? u(p.otherDocs) : u }))}
                            />
                         </div>
                       </div>

                       <FileUploadSlot 
                         label="مرفقات عامة (إضافية)"
                         caseName={formData.name || 'مريض_بدون_اسم'}
                         storagePath="medical/docs"
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

                    <div className="flex items-center gap-6 p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100 md:col-span-2">
                       <span className="text-[11px] font-black text-emerald-900">هل تم تقديم المساعدة؟</span>
                       <div className="flex items-center gap-4">
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, isHelped: true})}
                            className={cn("px-4 py-2 rounded-xl text-xs font-bold transition-all", formData.isHelped ? "bg-emerald-600 text-white" : "bg-white text-emerald-400")}
                          >نعم</button>
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, isHelped: false})}
                            className={cn("px-4 py-2 rounded-xl text-xs font-bold transition-all", !formData.isHelped ? "bg-rose-600 text-white" : "bg-white text-rose-400")}
                          >لا</button>
                       </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                       <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider mr-2 flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" />
                          رفع المستندات (صورة)
                       </label>
                       
                       <div className="flex items-center gap-4">
                         <label className={cn(
                           "flex-grow flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer",
                           formData.documentUrl ? "border-emerald-200 bg-emerald-50/30" : "border-emerald-100 bg-emerald-50/50 hover:border-emerald-300"
                         )}>
                            {uploading ? (
                              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                            ) : formData.documentUrl ? (
                              <div className="flex items-center gap-4 w-full">
                                <img src={formData.documentUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-emerald-200" />
                                <div className="flex-grow">
                                  <p className="text-xs font-black text-emerald-900">تم اختيار الصورة</p>
                                  <button 
                                    type="button" 
                                    onClick={(e) => { e.preventDefault(); setFormData({...formData, documentUrl: ''}); }}
                                    className="text-[10px] font-bold text-rose-500 hover:underline"
                                  >حذف وتغيير</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <ImageIcon className="w-8 h-8 text-emerald-300 mb-2" />
                                <p className="text-[10px] font-black text-emerald-600">اسحب صورة أو انقر للرفع</p>
                              </>
                            )}
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={handleImageUpload} 
                            />
                         </label>
                       </div>
                    </div>
                  </div>
                  
                  <InputGroup label="التشخيص / الحالة الطبية" icon={<Stethoscope className="w-4 h-4" />} value={formData.diseaseType} onChange={v => setFormData({...formData, diseaseType: v})} required />
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider mr-2">ملاحظات إضافية</label>
                    <textarea 
                      className="w-full bg-emerald-50/50 border border-emerald-100 rounded-[1.5rem] p-5 focus:ring-4 ring-emerald-500/10 outline-none font-bold text-sm min-h-[120px] transition-all"
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-emerald-600 text-white py-6 rounded-[2rem] font-bold text-xl shadow-2xl shadow-emerald-200 hover:bg-emerald-700 transition-all mt-6"
                  >
                    {editingId ? 'تحديث بيانات المريض' : 'تأكيد المريض في النظام'}
                  </button>
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

      {/* Unified N/C Case Modal */}
      {unifiedTransferCase && (
        <UnifiedTransferModal
          isOpen={!!unifiedTransferCase}
          onClose={() => setUnifiedTransferCase(null)}
          caseData={unifiedTransferCase}
          onSuccess={() => setUnifiedTransferCase(null)}
        />
      )}
    </div>
  );
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 group">
       <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm group-hover:bg-emerald-600 group-hover:text-white transition-all">
          {icon}
       </div>
       <div>
          <span className="text-[10px] font-black text-emerald-400 block">{label}</span>
          <span className="text-emerald-950 font-bold text-sm tracking-tight">{value}</span>
       </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-8 py-5 font-black text-sm transition-all relative rounded-t-[1.5rem] mt-2",
        active ? "bg-white text-emerald-700 border-x border-t border-emerald-100 shadow-[0_-4px_10px_-5px_rgba(5,150,105,0.1)]" : "text-emerald-300 hover:text-emerald-600"
      )}
    >
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="medicalTabActive" className="absolute bottom-[-2px] left-0 right-0 h-1 bg-white z-20" />}
    </button>
  );
}

function MedicalRecordsList({ caseId, tab }: { caseId: string; tab: MedicalTab }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    setLoading(true);
    // Note: We use independent medicalCases collection now
    const q = query(collection(db, `medicalCases/${caseId}/${tab}`), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `medicalCases/${caseId}/${tab}`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [caseId, tab]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /></div>;

  if (records.length === 0) return (
     <div className="flex flex-col items-center justify-center py-20 text-emerald-200">
        <Database className="w-20 h-20 mb-4 opacity-20" />
        <p className="font-bold text-lg">لا يوجد سجـلات مضافة بعد</p>
     </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
       {records.map(r => (
          <div key={r.id} className="bg-emerald-50/30 border border-emerald-50 p-6 rounded-3xl hover:bg-emerald-50/60 transition-all relative group">
             <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Calendar className="w-5 h-5 text-emerald-600" />
                   </div>
                   <span className="font-black text-emerald-950 text-sm">{r.date}</span>
                </div>
                <button 
                  onClick={() => {
                     setConfirmConfig({
                        isOpen: true,
                        title: 'تأكيد الحذف',
                        message: 'هل أنت متأكد من حذف هذا السجل الطبي؟ لا يمكن التراجع عن هذا الإجراء.',
                        onConfirm: async () => {
                           try {
                              await deleteDoc(doc(db, `medicalCases/${caseId}/${tab}`, r.id));
                              setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                           } catch (error) {
                              console.error(error);
                           }
                        }
                     });
                  }}
                  className="p-2 text-rose-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                >
                   <Trash2 className="w-4 h-4" />
                </button>
             </div>

             <div className="space-y-2">
                {tab === 'prescriptions' && (
                   <>
                      <div className="font-bold text-emerald-950">د/ {r.doctorName}</div>
                      <div className="text-xs text-emerald-600/70 font-bold">{r.clinicName}</div>
                      <p className="text-xs text-stone-500 mt-2 line-clamp-2 bg-white/50 p-3 rounded-xl border border-white">{r.medicines}</p>
                   </>
                )}
                {tab === 'surgeries' && (
                   <>
                      <div className="font-bold text-emerald-950">{r.hospitalName}</div>
                      <div className="flex items-center justify-between mt-3">
                         <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">{r.cost} ج.م</span>
                         <span className="text-[10px] font-bold text-emerald-400">{r.status}</span>
                      </div>
                   </>
                )}
                {tab === 'labTests' && (
                   <>
                      <div className="font-bold text-emerald-950">{r.testType}</div>
                      <div className="text-xs text-emerald-600/70 font-bold">{r.labName}</div>
                      <div className="mt-2 text-[10px] font-black text-emerald-700 bg-emerald-100 w-fit px-2 py-0.5 rounded-lg">{r.status}</div>
                   </>
                )}
                {tab === 'radiology' && (
                   <>
                      <div className="font-bold text-emerald-950">{r.scanType}</div>
                      <div className="text-xs text-emerald-600/70 font-bold">{r.centerName}</div>
                   </>
                )}
             </div>

             <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-emerald-100/50">
                {r.imageUrl && (
                   <a href={r.imageUrl} target="_blank" rel="noreferrer" className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="فتح الصورة">
                      <ImageIcon className="w-5 h-5" />
                   </a>
                )}
                {(r.reportUrl || r.resultUrl) && (
                   <a href={r.reportUrl || r.resultUrl} target="_blank" rel="noreferrer" className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="فتح الملف">
                      <FileText className="w-5 h-5" />
                   </a>
                )}
             </div>
          </div>
       ))}

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

function InputGroup({ label, icon, value, onChange, required = false }: { label: string; icon: React.ReactNode; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider mr-2 flex items-center gap-2">
        {icon}
        {label}
      </label>
      <input 
        required={required}
        className="w-full bg-emerald-50/50 border border-emerald-100 rounded-2xl py-4 px-6 focus:ring-4 ring-emerald-500/10 outline-none font-bold text-sm transition-all"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}