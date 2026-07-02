// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, Plus, Search, Trash2, Edit3, Download, Printer, 
  X, Save, RefreshCw, Palette, Check, Type, FileSpreadsheet, 
  School, Phone, User, Award, Sliders, Settings, Upload, CheckCircle2, AlertCircle,
  Calendar, Layers, Loader2, FileText, Image as ImageIcon, Clock, MapPin
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { uploadFile } from './BrandingUpload';
import ConfirmModal from './ConfirmModal';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Helper functions for certificate export
export async function exportPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return;
  }
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: null
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error in exportPDF:', error);
    throw error;
  }
}

export async function exportJPG(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return;
  }
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: null
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.href = imgData;
    link.download = `${filename}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error in exportJPG:', error);
    throw error;
  }
}

export function exportWord(studentName: string, titleText: string, formulaText: string) {
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <title>${titleText}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body {
          font-family: 'Arial', sans-serif;
          direction: rtl;
          text-align: center;
          padding: 50px;
        }
        .container {
          border: 15px double #d97706;
          padding: 40px;
          background-color: #fffdf9;
        }
        .title {
          font-size: 28pt;
          color: #b45309;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .formula {
          font-size: 16pt;
          color: #1c1917;
          line-height: 1.8;
          margin-top: 30px;
          margin-bottom: 30px;
        }
        .name {
          font-size: 22pt;
          color: #047857;
          font-weight: bold;
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">${titleText}</div>
        <div class="formula">${formulaText}</div>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + htmlContent], {
    type: 'application/msword'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${studentName}_شهادة_تقدير.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportWordInvitation(
  studentName: string,
  titleText: string,
  formulaText: string,
  dateTimeText: string,
  locationText: string
) {
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <title>${titleText}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body {
          font-family: 'Arial', sans-serif;
          direction: rtl;
          text-align: center;
          padding: 50px;
        }
        .container {
          border: 15px double #d97706;
          padding: 40px;
          background-color: #fffdf9;
        }
        .title {
          font-size: 26pt;
          color: #b45309;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .formula {
          font-size: 15pt;
          color: #1c1917;
          line-height: 1.8;
          margin-top: 30px;
          margin-bottom: 30px;
        }
        .details {
          margin-top: 25px;
          border-top: 1px dashed #cccccc;
          padding-top: 20px;
          font-size: 13pt;
        }
        .detail-item {
          margin-bottom: 10px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">${titleText}</div>
        <div class="formula">${formulaText}</div>
        <div class="details">
          <div class="detail-item" style="color: #059669;">⏰ الموعد: ${dateTimeText}</div>
          <div class="detail-item" style="color: #1d4ed8;">📍 المكان: ${locationText}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + htmlContent], {
    type: 'application/msword'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${studentName}_دعوة_حفل_التفوق.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Constant default Ministry of Education Logo URL from Egyptian Wiki representation
const DEFAULT_MINISTRY_LOGO = "https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo_of_the_Ministry_of_Education_and_Technical_Education_%28Egypt%29.svg";

// Interface Definitions
interface SchoolItem {
  id: string;
  name: string;
  supervisorName: string;
  supervisorPhone: string;
  createdAt: any;
}

interface StudentItem {
  id: string;
  name: string;
  phone: string;
  totalMarks: number;
  percentage: number;
  grade: string;
  schoolId: string;
  schoolName: string;
  academicYear?: string;
  stage?: string;
  createdAt: any;
}

interface SignatureItem {
  title: string;
  name: string;
}

export default function TopStudentsScreen() {
  const [activeTab, setActiveTab] = useState<'management' | 'designer' | 'invitations'>('management');
  const [invitationPreviewStudentId, setInvitationPreviewStudentId] = useState<string>('');
  
  // Data State
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // New academic year & educational stage states for partitioning ("لكل عام ملف بمفرده")
  const [years, setYears] = useState<string[]>(() => {
    const saved = localStorage.getItem('top_students_years');
    return saved ? JSON.parse(saved) : ['2025/2026', '2024/2025', '2023/2024'];
  });
  const [selectedYear, setSelectedYear] = useState<string>('2025/2026');
  const [selectedStage, setSelectedStage] = useState<string>('all'); // 'all' | stage
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Custom Add Year Modal States
  const [showAddYearModal, setShowAddYearModal] = useState<boolean>(false);
  const [newYearForm, setNewYearForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    notes: ''
  });
  
  // Comprehensive list of Egyptian educational grades
  const ALL_GRADES_LIST = [
    'الصف الأول الابتدائي',
    'الصف الثاني الابتدائي',
    'الصف الثالث الابتدائي',
    'الصف الرابع الابتدائي',
    'الصف الخامس الابتدائي',
    'الصف السادس الابتدائي',
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
    'الصف الأول الثانوي',
    'الصف الثاني الثانوي',
    'الصف الثالث الثانوي',
    'الصف الأول الثانوي الفني',
    'الصف الثاني الثانوي الفني',
    'الصف الثالث الثانوي الفني',
    'الصف الرابع الثانوي الفني',
    'الصف الخامس الثانوي الفني'
  ];

  const ARABIC_FONTS = [
    { id: 'Cairo', name: 'خط القاهرة (Cairo)' },
    { id: 'Amiri', name: 'الخط الأميري (Amiri)' },
    { id: 'Reem Kufi', name: 'خط ريم الكوفي (Reem Kufi)' },
    { id: 'Tajawal', name: 'خط تجول (Tajawal)' },
    { id: 'Almarai', name: 'خط المراعي (Almarai)' },
    { id: 'Lalezar', name: 'خط لالزار (Lalezar)' },
    { id: 'El Messiri', name: 'خط المسيري (El Messiri)' },
    { id: 'Alexandria', name: 'خط الإسكندرية (Alexandria)' },
    { id: 'Changa', name: 'خط شانجا (Changa)' },
    { id: 'Kufam', name: 'خط كوفام (Kufam)' }
  ];

  // Certificate Design Settings (Live Customization with Font support)
  const [certificateSettings, setCertificateSettings] = useState({
    titleText: 'شهادة شكر وتقدير',
    titleFontSize: 44, // in pt
    titleColor: '#b45309', // gold-700
    titleFontFamily: 'Reem Kufi',
    
    // Placeholder-supported template formula
    formulaText: 'تتقدم جمعية بصمة خير بخالص الشكر والتقدير للطالب المتميز / {{name}} المقيد بالصف {{grade}} بمدرسة {{school}} لحصوله على مجموع {{totalMarks}} بنسبة {{percentage}}% في امتحانات أوائل الطلبة، متمنين له دوام التوفيق والنجاح والتميز دائماً في مسيرته الدراسية.',
    formulaFontSize: 21,
    formulaColor: '#1c1917', // stone-900
    formulaLineHeight: 2.1,
    formulaFontFamily: 'Cairo',

    nameFontSize: 32,
    nameColor: '#047857', // emerald-700
    nameBold: true,
    nameFontFamily: 'Cairo',

    borderColor: '#d97706', // gold-600
    borderStyle: 'islamic', // 'islamic' | 'classic' | 'modern'
    borderWidth: 12, // in px

    backgroundColor: '#fffdf9', // warm cream
    textColor: '#1c1917',

    leftLogoUrl: localStorage.getItem('cert_left_logo_url') || DEFAULT_MINISTRY_LOGO,
    rightLogoUrl: localStorage.getItem('app_logo_url') || 'https://i.ibb.co/L6V2yq9/logo.png',
    leftLogoSize: 110, // in px
    rightLogoSize: 110, // in px

    // Custom margins & spacing
    paddingTop: 35,
    paddingBottom: 35,
    paddingRight: 50,
    paddingLeft: 50,
    headerMarginBottom: 15,
    bodyMarginBottom: 25,
    
    // Vertical position offsets
    titleYOffset: 0,
    logosYOffset: 0,
    signaturesYOffset: 0,

    // Custom signatures list
    signatures: [
      { title: 'رئيس مجلس الإدارة', name: 'أ. أحمد علي سليمان' },
      { title: 'مسؤول لجنة التعليم', name: 'أ. محمد حسن الكردي' }
    ] as SignatureItem[],
    signatureFontSize: 15,
    signatureColor: '#44403c',
    signatureFontFamily: 'Cairo'
  });

  // Invitation Cards Custom Settings State
  const [invitationSettings, setInvitationSettings] = useState({
    titleText: 'بطاقة دعوة حضور حفل تفوق',
    titleFontSize: 28,
    titleColor: '#b45309',
    titleFontFamily: 'Reem Kufi',
    
    formulaText: 'تتشرف جمعية بصمة خير بدعوة الابن المتميز والابنة المتميزة / {{name}} المقيد بالصف {{grade}} بمدرسة {{school}} لحضور حفل تكريم الطلاب الأوائل والمتفوقين السنوي، وذلك تقديراً لجهوده المتميزة وتفوقه الدراسي الباهر وتتويجاً لرحلة كفاحه المشرفة.',
    formulaFontSize: 16,
    formulaColor: '#1c1917',
    formulaFontFamily: 'Cairo',
    formulaLineHeight: 1.8,

    dateTimeText: 'يوم الخميس الموافق 15 يوليو 2026 في تمام الساعة الرابعة عصراً',
    dateTimeColor: '#059669',
    dateTimeFontSize: 15,
    dateTimeFontFamily: 'Cairo',

    locationText: 'قاعة الاحتفالات الكبرى بالمركز الثقافي الاجتماعي بجوار مجلس المدينة',
    locationColor: '#1d4ed8',
    locationFontSize: 15,
    locationFontFamily: 'Cairo',

    borderColor: '#d97706',
    borderStyle: 'islamic',
    borderWidth: 10,
    backgroundColor: '#fffdf9',
    
    rightLogoUrl: localStorage.getItem('app_logo_url') || 'https://i.ibb.co/L6V2yq9/logo.png',
    leftLogoUrl: localStorage.getItem('cert_left_logo_url') || DEFAULT_MINISTRY_LOGO,
    rightLogoSize: 85,
    leftLogoSize: 85,

    paddingTop: 30,
    paddingBottom: 30,
    paddingRight: 40,
    paddingLeft: 40,
    headerMarginBottom: 12,
    bodyMarginBottom: 15
  });
  
  // Standard Egyptian educational stages
  const stages = [
    'المرحلة الابتدائية',
    'المرحلة الإعدادية',
    'المرحلة الثانوية',
    'الثانوي الفني التجاري',
    'الثانوي الفني الصناعي',
    'الثانوي الفندقي'
  ];

  // Modal / Form States
  const [showSchoolModal, setShowSchoolModal] = useState<boolean>(false);
  const [editingSchool, setEditingSchool] = useState<SchoolItem | null>(null);
  const [schoolForm, setSchoolForm] = useState({ name: '', supervisorName: '', supervisorPhone: '' });

  const [showStudentModal, setShowStudentModal] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [studentForm, setStudentForm] = useState({
    name: '',
    phone: '',
    totalMarks: '',
    percentage: '',
    grade: '',
    schoolId: '',
    schoolName: '',
    stage: 'المرحلة الابتدائية',
    academicYear: '2025/2026',
    section: ''
  });
  const [showSchoolSuggestions, setShowSchoolSuggestions] = useState<boolean>(false);

  // States for custom manual entry overrides in form dropdowns
  const [isCustomGrade, setIsCustomGrade] = useState<boolean>(false);
  const [isCustomSection, setIsCustomSection] = useState<boolean>(false);

  // Custom Confirmation Dialog State to replace window.confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Excel Upload state & message
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Local state for Quota warning
  const [quotaExceeded, setQuotaExceeded] = useState(() => !!(window as any).__firestore_quota_exceeded__);

  // Upload states & refs for certificate designer logos
  const [isUploadingRightLogo, setIsUploadingRightLogo] = useState(false);
  const [isUploadingLeftLogo, setIsUploadingLeftLogo] = useState(false);
  const rightLogoInputRef = useRef<HTMLInputElement>(null);
  const leftLogoInputRef = useRef<HTMLInputElement>(null);

  // Set up listeners
  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('firestore-quota-exceeded', handleQuota);

    // Listen to schools
    const qSchools = query(collection(db, 'schools'));
    const unsubSchools = onSnapshot(qSchools, (snapshot) => {
      const list: SchoolItem[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as SchoolItem);
      });
      // Sort schools alphabetically
      list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      setSchools(list);
    }, (err) => {
      console.error("Failed to load schools:", err);
    });

    // Listen to students
    const qStudents = query(collection(db, 'top_students'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const list: StudentItem[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as StudentItem);
      });
      setStudents(list);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load students:", err);
      setLoading(false);
    });

    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuota);
      unsubSchools();
      unsubStudents();
    };
  }, []);

  // Sync right logo changes
  useEffect(() => {
    const syncLogo = () => {
      setCertificateSettings(prev => ({
        ...prev,
        rightLogoUrl: localStorage.getItem('app_logo_url') || 'https://i.ibb.co/L6V2yq9/logo.png'
      }));
    };
    window.addEventListener('app_logo_changed', syncLogo);
    return () => window.removeEventListener('app_logo_changed', syncLogo);
  }, []);

  // Quick Action Alerts
  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  // --- SCHOOL OPERATIONS ---
  const handleOpenSchoolModal = (school: SchoolItem | null = null) => {
    if (school) {
      setEditingSchool(school);
      setSchoolForm({
        name: school.name,
        supervisorName: school.supervisorName || '',
        supervisorPhone: school.supervisorPhone || ''
      });
    } else {
      setEditingSchool(null);
      setSchoolForm({ name: '', supervisorName: '', supervisorPhone: '' });
    }
    setShowSchoolModal(true);
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolForm.name.trim()) return;

    try {
      if (editingSchool) {
        const docRef = doc(db, 'schools', editingSchool.id);
        await updateDoc(docRef, {
          name: schoolForm.name.trim(),
          supervisorName: schoolForm.supervisorName.trim(),
          supervisorPhone: schoolForm.supervisorPhone.trim(),
          updatedAt: serverTimestamp()
        });
        triggerSuccess('تم تعديل بيانات المدرسة بنجاح');
      } else {
        await addDoc(collection(db, 'schools'), {
          name: schoolForm.name.trim(),
          supervisorName: schoolForm.supervisorName.trim(),
          supervisorPhone: schoolForm.supervisorPhone.trim(),
          createdAt: serverTimestamp()
        });
        triggerSuccess('تم إضافة المدرسة بنجاح');
      }
      setShowSchoolModal(false);
    } catch (err) {
      console.error("Error saving school:", err);
      triggerError('حدث خطأ أثناء حفظ بيانات المدرسة');
    }
  };

  const handleDeleteSchool = (schoolId: string, schoolName: string) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'حذف المدرسة',
      message: `هل أنت متأكد من حذف مدرسة "${schoolName}"؟ سيؤدي ذلك لحذف المدرسة فقط، ويبقى الطلاب المرتبطون بها بحاجة لإعادة تعيين مدرستهم.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'schools', schoolId));
          if (selectedSchoolId === schoolId) {
            setSelectedSchoolId('all');
          }
          triggerSuccess('تم حذف المدرسة بنجاح');
        } catch (err) {
          console.error("Error deleting school:", err);
          triggerError('فشل حذف المدرسة');
        }
      }
    });
  };

  // --- STUDENT OPERATIONS ---
  const handleAddYear = () => {
    setNewYearForm({
      name: '',
      startDate: '',
      endDate: '',
      notes: ''
    });
    setShowAddYearModal(true);
  };

  const handleSaveNewYear = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = newYearForm.name.trim();
    if (!formatted) {
      triggerError('يرجى إدخال اسم العام الدراسي الجديد');
      return;
    }
    if (years.includes(formatted)) {
      triggerError('هذا العام الدراسي مضاف بالفعل');
      return;
    }
    const updated = [formatted, ...years];
    setYears(updated);
    localStorage.setItem('top_students_years', JSON.stringify(updated));
    setSelectedYear(formatted);
    setShowAddYearModal(false);
    triggerSuccess(`تم إنشاء العام الدراسي الجديد ${formatted} بدون أي بيانات سابقة بنجاح`);
  };

  const handleBulkUpdateStage = (targetStage: string) => {
    if (selectedStudentIds.length === 0) {
      triggerError('يرجى تحديد طلاب أولاً من الجدول لتحديث مرحلتهم');
      return;
    }
    setDeleteConfirm({
      isOpen: true,
      title: 'تغيير مرحلة الطلاب المحددين جماعياً',
      message: `هل أنت متأكد من تغيير المرحلة التعليمية لـ ${selectedStudentIds.length} طالب إلى "${targetStage}"؟`,
      onConfirm: async () => {
        try {
          setLoading(true);
          for (const studentId of selectedStudentIds) {
            const docRef = doc(db, 'top_students', studentId);
            await updateDoc(docRef, {
              stage: targetStage,
              updatedAt: serverTimestamp()
            });
          }
          setSelectedStudentIds([]);
          triggerSuccess('تم تحديث المرحلة التعليمية للطلاب المحددين بنجاح!');
        } catch (err) {
          console.error("Error bulk updating stages:", err);
          triggerError('حدث خطأ أثناء تحديث المراحل التعليمية جماعياً');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleBulkDeleteStudents = () => {
    if (selectedStudentIds.length === 0) {
      triggerError('يرجى تحديد طلاب أولاً من الجدول لحذفهم');
      return;
    }
    setDeleteConfirm({
      isOpen: true,
      title: 'حذف الطلاب المحددين جماعياً',
      message: `هل أنت متأكد من حذف ${selectedStudentIds.length} طالب نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
      onConfirm: async () => {
        try {
          setLoading(true);
          for (const studentId of selectedStudentIds) {
            const docRef = doc(db, 'top_students', studentId);
            await deleteDoc(docRef);
          }
          setSelectedStudentIds([]);
          triggerSuccess('تم حذف الطلاب المحددين بنجاح');
        } catch (err) {
          console.error("Error bulk deleting students:", err);
          triggerError('حدث خطأ أثناء حذف الطلاب المحددين');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Dynamic grade options based on stage
  const getGradesForStage = (stage: string) => {
    switch (stage) {
      case 'المرحلة الابتدائية':
        return [
          'الصف الأول الابتدائي',
          'الصف الثاني الابتدائي',
          'الصف الثالث الابتدائي',
          'الصف الرابع الابتدائي',
          'الصف الخامس الابتدائي',
          'الصف السادس الابتدائي'
        ];
      case 'المرحلة الإعدادية':
        return [
          'الصف الأول الإعدادي',
          'الصف الثاني الإعدادي',
          'الصف الثالث الإعدادي'
        ];
      case 'المرحلة الثانوية':
        return [
          'الصف الأول الثانوي',
          'الصف الثاني الثانوي',
          'الصف الثالث الثانوي'
        ];
      case 'الثانوي الفني التجاري':
      case 'الثانوي الفني الصناعي':
      case 'الثانوي الفندقي':
        return [
          'الصف الأول الثانوي الفني',
          'الصف الثاني الثانوي الفني',
          'الصف الثالث الثانوي الفني'
        ];
      default:
        return [
          'الصف الأول',
          'الصف الثاني',
          'الصف الثالث',
          'الصف الرابع',
          'الصف الخامس',
          'الصف السادس'
        ];
    }
  };

  // Dynamic section options based on stage
  const getSectionsForStage = (stage: string) => {
    switch (stage) {
      case 'المرحلة الثانوية':
        return ['علمي علوم', 'علمي رياضة', 'أدبي'];
      case 'الثانوي الفني التجاري':
        return ['تسويق', 'قانون', 'محاسبة'];
      case 'الثانوي الفني الصناعي':
        return ['زخرفة', 'كهرباء', 'ميكانيكا'];
      default:
        return [];
    }
  };

  const handleOpenStudentModal = (student: StudentItem | null = null) => {
    if (student) {
      setEditingStudent(student);
      const standardGrades = getGradesForStage(student.stage || 'المرحلة الابتدائية');
      const standardSections = getSectionsForStage(student.stage || 'المرحلة الابتدائية');
      
      setIsCustomGrade(!standardGrades.includes(student.grade || ''));
      setIsCustomSection(student.section ? !standardSections.includes(student.section) : false);

      setStudentForm({
        name: student.name,
        phone: student.phone || '',
        totalMarks: String(student.totalMarks || ''),
        percentage: String(student.percentage || ''),
        grade: student.grade || '',
        schoolId: student.schoolId,
        schoolName: student.schoolName || '',
        stage: student.stage || 'المرحلة الابتدائية',
        academicYear: student.academicYear || selectedYear,
        section: student.section || ''
      });
    } else {
      setEditingStudent(null);
      const initialSchoolId = selectedSchoolId !== 'all' ? selectedSchoolId : (schools[0]?.id || '');
      const initialSchoolName = schools.find(s => s.id === initialSchoolId)?.name || '';
      const initialStage = selectedStage !== 'all' ? selectedStage : 'المرحلة الابتدائية';
      const initialGrades = getGradesForStage(initialStage);
      const initialSections = getSectionsForStage(initialStage);

      setIsCustomGrade(false);
      setIsCustomSection(false);

      setStudentForm({
        name: '',
        phone: '',
        totalMarks: '',
        percentage: '',
        grade: initialGrades[0] || '',
        schoolId: initialSchoolId,
        schoolName: initialSchoolName,
        stage: initialStage,
        academicYear: selectedYear,
        section: initialSections[0] || ''
      });
    }
    setShowStudentModal(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredSchoolName = studentForm.schoolName.trim();
    if (!studentForm.name.trim() || !enteredSchoolName) {
      triggerError('يرجى ملء اسم الطالب وكتابة اسم المدرسة');
      return;
    }

    try {
      let finalSchoolId = '';
      let finalSchoolName = enteredSchoolName;

      // 1. Check if the school name matches an existing school
      const exactMatch = schools.find(s => s.name.trim().toLowerCase() === enteredSchoolName.toLowerCase());
      
      if (exactMatch) {
        finalSchoolId = exactMatch.id;
        finalSchoolName = exactMatch.name;
      } else {
        // 2. It's a new school! Create it in the schools collection
        const newSchoolRef = await addDoc(collection(db, 'schools'), {
          name: enteredSchoolName,
          supervisorName: '',
          supervisorPhone: '',
          createdAt: serverTimestamp()
        });
        finalSchoolId = newSchoolRef.id;
        finalSchoolName = enteredSchoolName;
      }

      const dataPayload = {
        name: studentForm.name.trim(),
        phone: studentForm.phone.trim(),
        totalMarks: studentForm.totalMarks ? parseFloat(studentForm.totalMarks) : 0,
        percentage: studentForm.percentage ? parseFloat(studentForm.percentage) : 0,
        grade: studentForm.grade.trim(),
        schoolId: finalSchoolId,
        schoolName: finalSchoolName,
        stage: studentForm.stage || 'المرحلة الابتدائية',
        academicYear: studentForm.academicYear || selectedYear,
        section: studentForm.section ? studentForm.section.trim() : '',
        updatedAt: serverTimestamp()
      };

      if (editingStudent) {
        const docRef = doc(db, 'top_students', editingStudent.id);
        await updateDoc(docRef, dataPayload);
        triggerSuccess('تم تعديل بيانات الطالب بنجاح');
      } else {
        await addDoc(collection(db, 'top_students'), {
          ...dataPayload,
          createdAt: serverTimestamp()
        });
        triggerSuccess('تم إضافة الطالب بنجاح');
      }
      setShowStudentModal(false);
    } catch (err) {
      console.error("Error saving student:", err);
      triggerError('حدث خطأ أثناء حفظ بيانات الطالب');
    }
  };

  const handleDeleteStudent = (id: string, name: string) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'حذف الطالب المتفوق',
      message: `هل أنت متأكد من حذف الطالب "${name}"؟ لا يمكن التراجع عن هذا الإجراء نهائياً.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'top_students', id));
          triggerSuccess('تم حذف الطالب بنجاح');
        } catch (err) {
          console.error("Error deleting student:", err);
          triggerError('فشل حذف الطالب');
        }
      }
    });
  };

  // --- EXCEL EXPORT ---
  const handleExportExcel = () => {
    const filtered = students.filter(s => {
      const matchYear = !s.academicYear || s.academicYear === selectedYear;
      const matchStage = selectedStage === 'all' || s.stage === selectedStage;
      const matchSchool = selectedSchoolId === 'all' || s.schoolId === selectedSchoolId;
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (s.phone && s.phone.includes(searchTerm)) ||
                          s.grade.toLowerCase().includes(searchTerm.toLowerCase());
      return matchYear && matchStage && matchSchool && matchSearch;
    });

    if (filtered.length === 0) {
      triggerError('لا توجد بيانات لتصديرها للعام الدراسي والمرحلة المحددة');
      return;
    }

    // Map to beautiful Arabic headers
    const dataToExport = filtered.map((s, index) => ({
      'م': index + 1,
      'الاسم الكامل': s.name,
      'رقم التليفون': s.phone || 'غير مسجل',
      'المجموع': s.totalMarks || 0,
      'النسبة المئوية (%)': s.percentage ? `${s.percentage}%` : '0%',
      'الصف الدراسي': s.grade || 'غير مسجل',
      'اسم المدرسة': s.schoolName,
      'المرحلة التعليمية': s.stage || 'المرحلة الابتدائية',
      'العام الدراسي': s.academicYear || selectedYear
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب الأوائل');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 5 },  // index
      { wch: 25 }, // name
      { wch: 15 }, // phone
      { wch: 10 }, // totalMarks
      { wch: 15 }, // percentage
      { wch: 15 }, // grade
      { wch: 25 }, // schoolName
      { wch: 20 }, // stage
      { wch: 15 }  // academicYear
    ];

    const currentSchool = schools.find(s => s.id === selectedSchoolId);
    const fileName = selectedSchoolId === 'all' 
      ? `جميع_أوائل_الطلبة_${selectedYear.replace('/', '-')}.xlsx` 
      : `أوائل_طلبة_مدرسة_${currentSchool?.name || 'محددة'}_${selectedYear.replace('/', '-')}.xlsx`;

    XLSX.writeFile(wb, fileName);
    triggerSuccess('تم تصدير ملف Excel بنجاح');
  };

  // --- EXCEL IMPORT ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (selectedSchoolId === 'all') {
      triggerError('برجاء تحديد مدرسة معينة من القائمة الجانبية أولاً لاستيراد الطلاب إليها');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const currentSchool = schools.find(s => s.id === selectedSchoolId);
    if (!currentSchool) return;

    const file = files[0];
    const reader = new FileReader();
    
    setUploadProgress('جاري قراءة الملف وتجهيزه...');

    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          triggerError('الملف فارغ أو لا يحتوي على بيانات متوافقة');
          setUploadProgress('');
          return;
        }

        setUploadProgress(`تم العثور على ${jsonData.length} من السجلات. جاري استيرادهم لـ "${currentSchool.name}"...`);

        let importedCount = 0;
        let failedCount = 0;

        for (const row of jsonData) {
          // Detect Arabic column headers or English alternatives
          const name = row['الاسم الكامل'] || row['الاسم'] || row['name'] || row['Name'];
          const phone = row['رقم التليفون'] || row['الهاتف'] || row['phone'] || row['Phone'] || '';
          const totalMarksStr = row['المجموع'] || row['الدرجات'] || row['marks'] || row['Marks'] || '0';
          const percentageStr = row['النسبة المئوية (%)'] || row['النسبة المئوية'] || row['النسبة'] || row['percentage'] || row['Percentage'] || '0';
          const grade = row['الصف الدراسي'] || row['الصف'] || row['grade'] || row['Grade'] || '';

          if (!name) {
            failedCount++;
            continue;
          }

          // Format totalMarks and percentage to safe numbers
          const totalMarks = parseFloat(String(totalMarksStr).replace(/[^\d.]/g, '')) || 0;
          let percentage = parseFloat(String(percentageStr).replace(/[^\d.]/g, '')) || 0;
          // Clean common percentage formatting (e.g. 0.95 -> 95)
          if (percentage > 0 && percentage < 1 && String(percentageStr).includes('.')) {
            percentage = Math.round(percentage * 100);
          }

          await addDoc(collection(db, 'top_students'), {
            name: String(name).trim(),
            phone: String(phone).trim(),
            totalMarks,
            percentage,
            grade: String(grade).trim(),
            schoolId: currentSchool.id,
            schoolName: currentSchool.name,
            stage: row['المرحلة التعليمية'] || row['المرحلة'] || (selectedStage !== 'all' ? selectedStage : 'المرحلة الابتدائية'),
            academicYear: row['العام الدراسي'] || row['العام'] || selectedYear,
            createdAt: serverTimestamp()
          });

          importedCount++;
        }

        triggerSuccess(`تم استيراد ${importedCount} طالب بنجاح لمدرسة "${currentSchool.name}"`);
        if (failedCount > 0) {
          triggerError(`تم تخطي ${failedCount} سطر لعدم وجود حقل الاسم`);
        }
      } catch (err) {
        console.error("Failed importing Excel file:", err);
        triggerError('حدث خطأ أثناء معالجة ملف Excel، يرجى التأكد من الصيغة والامتداد');
      } finally {
        setUploadProgress('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  // --- PRINT STUDENT LIST ---
  const handlePrintStudentList = () => {
    const filtered = students.filter(s => {
      const matchYear = !s.academicYear || s.academicYear === selectedYear;
      const matchStage = selectedStage === 'all' || s.stage === selectedStage;
      const matchSchool = selectedSchoolId === 'all' || s.schoolId === selectedSchoolId;
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (s.phone && s.phone.includes(searchTerm)) ||
                          s.grade.toLowerCase().includes(searchTerm.toLowerCase());
      return matchYear && matchStage && matchSchool && matchSearch;
    });

    if (filtered.length === 0) {
      triggerError('لا توجد بيانات لطباعتها للعام الدراسي والمرحلة المحددة');
      return;
    }

    const currentSchool = schools.find(s => s.id === selectedSchoolId);
    const listTitle = selectedSchoolId === 'all' 
      ? 'كشف أوائل الطلبة لجميع المدارس' 
      : `كشف أوائل الطلبة بمدرسة / ${currentSchool?.name}`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <html>
        <head>
          <title>${listTitle}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
            body {
              font-family: 'Cairo', sans-serif;
              direction: rtl;
              padding: 20px;
              color: #1c1917;
            }
            .header-table {
              width: 100%;
              margin-bottom: 30px;
              border-collapse: collapse;
            }
            .header-table td {
              border: none;
              padding: 5px;
            }
            .title-section {
              text-align: center;
            }
            .title-section h1 {
              font-size: 24px;
              margin: 0 0 10px 0;
              color: #047857;
            }
            .title-section p {
              margin: 0;
              font-size: 14px;
              color: #4b5563;
              font-weight: bold;
            }
            .logo-container {
              width: 100px;
              text-align: center;
            }
            .logo-container img {
              max-width: 80px;
              height: auto;
            }
            .main-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            .main-table th {
              background-color: #f3f4f6;
              border: 1px solid #d1d5db;
              padding: 10px;
              font-size: 14px;
              font-weight: bold;
              text-align: right;
            }
            .main-table td {
              border: 1px solid #e5e7eb;
              padding: 10px;
              font-size: 13px;
            }
            .main-table tr:nth-child(even) {
              background-color: #f9fafb;
            }
            .footer-section {
              margin-top: 40px;
              text-align: left;
              font-size: 12px;
              color: #9ca3af;
              font-weight: bold;
            }
            @media print {
              body { padding: 0; }
              @page { size: A4; margin: 1.5cm; }
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td class="logo-container">
                <img src="${localStorage.getItem('app_logo_url') || 'https://i.ibb.co/L6V2yq9/logo.png'}" alt="Logo" />
              </td>
              <td class="title-section">
                <h1>جمعية بصمة خير بنبروه</h1>
                <p>${listTitle}</p>
                ${currentSchool && currentSchool.supervisorName ? `<p style="font-size: 12px; margin-top: 5px;">مسؤول المدرسة: ${currentSchool.supervisorName} (${currentSchool.supervisorPhone || 'بدون هاتف'})</p>` : ''}
              </td>
              <td class="logo-container" style="text-align: left;">
                <img src="${DEFAULT_MINISTRY_LOGO}" alt="Ministry" />
              </td>
            </tr>
          </table>

          <table class="main-table">
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">م</th>
                <th>اسم الطالب</th>
                <th>رقم التليفون</th>
                <th style="text-align: center;">المجموع</th>
                <th style="text-align: center;">النسبة المئوية</th>
                <th>الصف الدراسي</th>
                <th>اسم المدرسة</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((s, index) => `
                <tr>
                  <td style="text-align: center;">${index + 1}</td>
                  <td style="font-weight: bold;">${s.name}</td>
                  <td>${s.phone || '-'}</td>
                  <td style="text-align: center; font-weight: bold;">${s.totalMarks || '-'}</td>
                  <td style="text-align: center; font-weight: bold; color: #047857;">${s.percentage ? `${s.percentage}%` : '-'}</td>
                  <td>${s.grade || '-'}</td>
                  <td>${s.schoolName}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer-section">
            تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')} - جمعية بصمة خير
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };


  // --- CERTIFICATE HELPER: FORMULA COMPILER ---
  const compileFormula = (template: string, student: StudentItem) => {
    return template
      .replace(/\{\{name\}\}/g, student.name)
      .replace(/\{\{school\}\}/g, student.schoolName)
      .replace(/\{\{grade\}\}/g, student.grade || '---')
      .replace(/\{\{totalMarks\}\}/g, String(student.totalMarks || '---'))
      .replace(/\{\{percentage\}\}/g, student.percentage ? `${student.percentage}%` : '---');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: 'right' | 'left') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (side === 'right') {
      setIsUploadingRightLogo(true);
    } else {
      setIsUploadingLeftLogo(true);
    }
    
    try {
      const url = await uploadFile(file, `certificates/${side}_logo_${Date.now()}`);
      setCertificateSettings(prev => ({
        ...prev,
        [`${side}LogoUrl`]: url
      }));
      if (side === 'right') {
        localStorage.setItem('app_logo_url', url);
        window.dispatchEvent(new Event('app_logo_changed'));
      } else {
        localStorage.setItem('cert_left_logo_url', url);
      }
      triggerSuccess('تم رفع الشعار وتحديثه بنجاح!');
    } catch (err: any) {
      console.error(err);
      triggerError(err.message || 'فشل رفع الشعار');
    } finally {
      if (side === 'right') {
        setIsUploadingRightLogo(false);
      } else {
        setIsUploadingLeftLogo(false);
      }
      e.target.value = '';
    }
  };

  // --- PRINT CERTIFICATES (SINGLE & BATCH) ---
  const handlePrintCertificates = (targetStudent: StudentItem | null = null) => {
    // Determine list of students to print
    let studentsToPrint: StudentItem[] = [];
    if (targetStudent) {
      studentsToPrint = [targetStudent];
    } else if (selectedStudentIds.length > 0) {
      studentsToPrint = students.filter(s => selectedStudentIds.includes(s.id));
    } else {
      // Filter current visible list using filteredStudents
      studentsToPrint = filteredStudents;
    }

    if (studentsToPrint.length === 0) {
      triggerError('لا يوجد طلاب محددون لطباعة شهاداتهم للخيارات المحددة');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Build the border CSS style
    let borderStyleCss = '';
    const bColor = certificateSettings.borderColor;
    const bWidth = certificateSettings.borderWidth;

    if (certificateSettings.borderStyle === 'islamic') {
      borderStyleCss = `
        border: ${bWidth}px solid ${bColor};
        outline: 4px double ${bColor};
        outline-offset: -12px;
        position: relative;
      `;
    } else if (certificateSettings.borderStyle === 'classic') {
      borderStyleCss = `
        border: ${bWidth}px double ${bColor};
        border-radius: 8px;
        padding: 40px;
      `;
    } else { // modern
      borderStyleCss = `
        border-right: ${bWidth}px solid ${bColor};
        border-left: ${bWidth}px solid ${bColor};
        border-top: 3px solid ${bColor}aa;
        border-bottom: 3px solid ${bColor}aa;
        padding: 40px;
      `;
    }

    // Build standard golden corner ornaments for Islamic style
    const cornerOrnaments = certificateSettings.borderStyle === 'islamic' ? `
      <div class="corner top-right"></div>
      <div class="corner top-left"></div>
      <div class="corner bottom-right"></div>
      <div class="corner bottom-left"></div>
    ` : '';

    const htmlContent = `
      <html>
        <head>
          <title>شهادات التقدير</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Reem+Kufi:wght@400;700&family=Amiri:wght@400;700&family=Tajawal:wght@400;700&family=Almarai:wght@400;700&family=Lalezar&family=El+Messiri:wght@400;700&family=Alexandria:wght@400;700&family=Changa:wght@400;700&family=Kufam:wght@400;700&display=swap');
            
            @page {
              size: A4 landscape;
              margin: 0;
            }
            
            body {
              margin: 0;
              padding: 0;
              background-color: #f3f4f6;
              font-family: 'Cairo', sans-serif;
              direction: rtl;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .page {
              width: 297mm;
              height: 210mm;
              box-sizing: border-box;
              display: flex;
              align-items: center;
              justify-content: center;
              background-color: #fff;
              page-break-after: always;
              overflow: hidden;
              position: relative;
            }

            .certificate-container {
              width: 285mm;
              height: 200mm;
              box-sizing: border-box;
              background-color: ${certificateSettings.backgroundColor};
              padding: ${certificateSettings.paddingTop ?? 35}px ${certificateSettings.paddingRight ?? 50}px ${certificateSettings.paddingBottom ?? 35}px ${certificateSettings.paddingLeft ?? 50}px;
              display: flex;
              flex-col: column;
              flex-direction: column;
              justify-content: space-between;
              ${borderStyleCss}
            }

            /* Islamic Corner Ornaments styling */
            .corner {
              position: absolute;
              width: 32px;
              height: 32px;
              border: 5px solid ${bColor};
              z-index: 10;
            }
            .top-right {
              top: 15px;
              right: 15px;
              border-bottom: none;
              border-left: none;
            }
            .top-left {
              top: 15px;
              left: 15px;
              border-bottom: none;
              border-right: none;
            }
            .bottom-right {
              bottom: 15px;
              right: 15px;
              border-top: none;
              border-left: none;
            }
            .bottom-left {
              bottom: 15px;
              left: 15px;
              border-top: none;
              border-right: none;
            }

            .header-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              width: 100%;
              margin-bottom: ${certificateSettings.headerMarginBottom ?? 15}px;
              transform: translateY(${certificateSettings.logosYOffset ?? 0}px);
            }

            .logo-box {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              gap: 4px;
            }

            .logo-box.right img {
              height: ${certificateSettings.rightLogoSize}px;
              object-fit: contain;
            }

            .logo-box.left img {
              height: ${certificateSettings.leftLogoSize}px;
              object-fit: contain;
            }

            .assoc-title {
              font-family: 'Cairo', sans-serif;
              font-weight: 900;
              font-size: 16px;
              color: #064e3b;
            }

            .ministry-title {
              font-family: 'Cairo', sans-serif;
              font-weight: 700;
              font-size: 13px;
              color: #4b5563;
              line-height: 1.3;
            }

            .title-decor {
              text-align: center;
              flex-grow: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              transform: translateY(${certificateSettings.titleYOffset ?? 0}px);
            }

            .cert-main-title {
              font-family: '${certificateSettings.titleFontFamily}', 'Reem Kufi', sans-serif;
              font-size: ${certificateSettings.titleFontSize}px;
              font-weight: 900;
              color: ${certificateSettings.titleColor};
              margin: 0;
              text-shadow: 1px 1px 2px rgba(0,0,0,0.06);
              letter-spacing: 1px;
            }

            .decorative-separator {
              width: 180px;
              height: 12px;
              background: radial-gradient(circle, ${bColor} 20%, transparent 60%);
              margin-top: 2px;
              position: relative;
            }
            .decorative-separator::after {
              content: '';
              position: absolute;
              left: 10%;
              right: 10%;
              top: 5px;
              height: 1px;
              background-color: ${bColor}88;
            }

            .body-section {
              text-align: center;
              padding: 0 10px;
              flex-grow: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              margin: ${certificateSettings.bodyMarginBottom ?? 25}px 0;
            }

            .formula-text {
              font-family: '${certificateSettings.formulaFontFamily}', 'Amiri', serif;
              font-size: ${certificateSettings.formulaFontSize}px;
              color: ${certificateSettings.formulaColor};
              line-height: ${certificateSettings.formulaLineHeight};
              margin: 0 auto;
              max-width: 96%;
              text-align: justify;
              text-align-last: center;
            }

            /* Highlight student name inside template */
            .student-highlight-name {
              font-family: '${certificateSettings.nameFontFamily}', 'Cairo', sans-serif;
              font-size: ${certificateSettings.nameFontSize}px;
              font-weight: ${certificateSettings.nameBold ? '900' : 'bold'};
              color: ${certificateSettings.nameColor};
              display: inline-block;
              margin: 0 6px;
              border-bottom: 2px dashed ${certificateSettings.nameColor}44;
              padding-bottom: 2px;
            }

            .signatures-row {
              display: flex;
              justify-content: space-around;
              align-items: flex-end;
              width: 100%;
              margin-top: auto;
              padding-top: 15px;
              border-top: 1px dashed rgba(0,0,0,0.06);
              transform: translateY(${certificateSettings.signaturesYOffset ?? 0}px);
            }

            .signature-card {
              text-align: center;
              width: 220px;
            }

            .sig-title {
              font-family: '${certificateSettings.signatureFontFamily || 'Cairo'}', 'Cairo', sans-serif;
              font-weight: bold;
              font-size: ${certificateSettings.signatureFontSize}px;
              color: ${certificateSettings.signatureColor};
              margin-bottom: 24px;
            }

            .sig-line {
              width: 160px;
              height: 1px;
              background-color: #d1d5db;
              margin: 0 auto 6px auto;
            }

            .sig-name {
              font-family: '${certificateSettings.signatureFontFamily || 'Cairo'}', 'Cairo', sans-serif;
              font-size: ${certificateSettings.signatureFontSize + 1}px;
              font-weight: bold;
              color: #1f2937;
            }

            @media print {
              body {
                background-color: transparent;
              }
              .page {
                box-shadow: none;
                margin: 0;
                border: none;
              }
            }
          </style>
        </head>
        <body>
          ${studentsToPrint.map(s => {
            // Compile formula text and insert styled span for the name
            const textToCompile = certificateSettings.formulaText;
            const compiledHtmlText = compileFormula(textToCompile, s)
              .replace(s.name, `<span class="student-highlight-name" style="font-size: ${certificateSettings.nameFontSize}px; color: ${certificateSettings.nameColor};">${s.name}</span>`);

            return `
              <div class="page">
                <div class="certificate-container">
                  ${cornerOrnaments}
                  
                  <!-- Top Row (Logos & Title) -->
                  <div class="header-row">
                    <div class="logo-box right">
                      <img src="${certificateSettings.rightLogoUrl}" alt="Charity Logo" referrerPolicy="no-referrer" />
                    </div>

                    <div class="title-decor">
                      <h1 class="cert-main-title">${certificateSettings.titleText}</h1>
                      <div class="decorative-separator"></div>
                    </div>

                    <div class="logo-box left">
                      <img src="${certificateSettings.leftLogoUrl}" alt="Ministry Logo" referrerPolicy="no-referrer" />
                    </div>
                  </div>

                  <!-- Content Area -->
                  <div class="body-section">
                    <p class="formula-text">${compiledHtmlText}</p>
                  </div>

                  <!-- Bottom Row (Signatures) -->
                  <div class="signatures-row">
                    ${certificateSettings.signatures.map(sig => `
                      <div class="signature-card">
                        <div class="sig-title" style="font-size: ${certificateSettings.signatureFontSize}px; color: ${certificateSettings.signatureColor};">${sig.title}</div>
                        <div class="sig-line"></div>
                        <div class="sig-name" style="font-size: ${certificateSettings.signatureFontSize + 1}px;">${sig.name}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}

          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // --- PRINT INVITATIONS (SINGLE & BATCH) ---
  const handlePrintInvitations = (targetStudent: StudentItem | null = null) => {
    let studentsToPrint: StudentItem[] = [];
    if (targetStudent) {
      studentsToPrint = [targetStudent];
    } else if (selectedStudentIds.length > 0) {
      studentsToPrint = students.filter(s => selectedStudentIds.includes(s.id));
    } else {
      studentsToPrint = filteredStudents;
    }

    if (studentsToPrint.length === 0) {
      triggerError('لا يوجد طلاب محددون لطباعة كروت دعوتهم للخيارات المحددة');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let borderStyleCss = '';
    const bColor = invitationSettings.borderColor;
    const bWidth = invitationSettings.borderWidth;

    if (invitationSettings.borderStyle === 'islamic') {
      borderStyleCss = `
        border: ${bWidth}px solid ${bColor};
        outline: 4px double ${bColor};
        outline-offset: -12px;
        position: relative;
      `;
    } else if (invitationSettings.borderStyle === 'classic') {
      borderStyleCss = `
        border: ${bWidth}px double ${bColor};
        border-radius: 8px;
        padding: 30px;
      `;
    } else { // modern
      borderStyleCss = `
        border-right: ${bWidth}px solid ${bColor};
        border-left: ${bWidth}px solid ${bColor};
        border-top: 3px solid ${bColor}aa;
        border-bottom: 3px solid ${bColor}aa;
        padding: 30px;
      `;
    }

    const cornerOrnaments = invitationSettings.borderStyle === 'islamic' ? `
      <div class="corner top-right"></div>
      <div class="corner top-left"></div>
      <div class="corner bottom-right"></div>
      <div class="corner bottom-left"></div>
    ` : '';

    const htmlContent = `
      <html>
        <head>
          <title>كروت دعوة حضور الحفل</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Reem+Kufi:wght@400;700&family=Amiri:wght@400;700&family=Tajawal:wght@400;700&family=Almarai:wght@400;700&family=Lalezar&family=El+Messiri:wght@400;700&family=Alexandria:wght@400;700&family=Changa:wght@400;700&family=Kufam:wght@400;700&display=swap');
            
            @page {
              size: A4 landscape;
              margin: 0;
            }
            
            body {
              margin: 0;
              padding: 0;
              background-color: #f3f4f6;
              font-family: 'Cairo', sans-serif;
              direction: rtl;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .page {
              width: 297mm;
              height: 210mm;
              box-sizing: border-box;
              display: flex;
              align-items: center;
              justify-content: center;
              background-color: #fff;
              page-break-after: always;
              overflow: hidden;
              position: relative;
            }

            .invitation-container {
              width: 285mm;
              height: 200mm;
              box-sizing: border-box;
              background-color: ${invitationSettings.backgroundColor};
              padding: ${invitationSettings.paddingTop ?? 30}px ${invitationSettings.paddingRight ?? 40}px ${invitationSettings.paddingBottom ?? 30}px ${invitationSettings.paddingLeft ?? 40}px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              ${borderStyleCss}
            }

            .corner {
              position: absolute;
              width: 28px;
              height: 28px;
              border: 4px solid ${bColor};
              z-index: 10;
            }
            .top-right {
              top: 12px;
              right: 12px;
              border-bottom: none;
              border-left: none;
            }
            .top-left {
              top: 12px;
              left: 12px;
              border-bottom: none;
              border-right: none;
            }
            .bottom-right {
              bottom: 12px;
              right: 12px;
              border-top: none;
              border-left: none;
            }
            .bottom-left {
              bottom: 12px;
              left: 12px;
              border-top: none;
              border-right: none;
            }

            .header-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              width: 100%;
              margin-bottom: ${invitationSettings.headerMarginBottom ?? 12}px;
            }

            .logo-box img {
              height: ${invitationSettings.rightLogoSize}px;
              object-fit: contain;
            }

            .title-decor {
              text-align: center;
              flex-grow: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }

            .invitation-main-title {
              font-family: '${invitationSettings.titleFontFamily}', 'Reem Kufi', sans-serif;
              font-size: ${invitationSettings.titleFontSize}px;
              font-weight: 900;
              color: ${invitationSettings.titleColor};
              margin: 0;
            }

            .decorative-separator {
              width: 150px;
              height: 8px;
              background: radial-gradient(circle, ${bColor} 20%, transparent 60%);
              margin-top: 2px;
              position: relative;
            }

            .body-section {
              text-align: center;
              padding: 0 15px;
              flex-grow: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              margin: ${invitationSettings.bodyMarginBottom ?? 15}px 0;
            }

            .formula-text {
              font-family: '${invitationSettings.formulaFontFamily}', 'Cairo', sans-serif;
              font-size: ${invitationSettings.formulaFontSize}px;
              color: ${invitationSettings.formulaColor};
              line-height: ${invitationSettings.formulaLineHeight};
              margin: 0 auto 15px auto;
              max-width: 92%;
              text-align: justify;
              text-align-last: center;
            }

            .student-highlight-name {
              font-family: 'Cairo', sans-serif;
              font-size: ${invitationSettings.formulaFontSize + 4}px;
              font-weight: 900;
              color: #047857;
              display: inline-block;
              margin: 0 4px;
              border-bottom: 2px dashed #04785766;
            }

            .details-box {
              display: flex;
              flex-direction: column;
              gap: 8px;
              margin-top: 10px;
              background: rgba(255, 255, 255, 0.4);
              padding: 12px;
              border-radius: 12px;
              border: 1px solid rgba(0,0,0,0.03);
              max-width: 80%;
              margin-left: auto;
              margin-right: auto;
            }

            .detail-item {
              font-size: ${invitationSettings.dateTimeFontSize}px;
              font-family: 'Cairo', sans-serif;
              font-weight: bold;
              color: ${invitationSettings.formulaColor};
            }

            .detail-label {
              color: #4b5563;
              margin-left: 4px;
            }

            @media print {
              body {
                background-color: transparent;
              }
              .page {
                box-shadow: none;
                margin: 0;
                border: none;
              }
            }
          </style>
        </head>
        <body>
          ${studentsToPrint.map(s => {
            const compiledHtmlText = compileFormula(invitationSettings.formulaText, s)
              .replace(s.name, `<span class="student-highlight-name">${s.name}</span>`);

            return `
              <div class="page">
                <div class="invitation-container">
                  ${cornerOrnaments}
                  
                  <div class="header-row">
                    <div class="logo-box">
                      <img src="${invitationSettings.rightLogoUrl}" alt="Charity Logo" referrerPolicy="no-referrer" />
                    </div>

                    <div class="title-decor">
                      <h1 class="invitation-main-title">${invitationSettings.titleText}</h1>
                      <div class="decorative-separator"></div>
                    </div>

                    <div class="logo-box">
                      <img src="${invitationSettings.leftLogoUrl}" alt="Ministry Logo" referrerPolicy="no-referrer" />
                    </div>
                  </div>

                  <div class="body-section">
                    <p class="formula-text">${compiledHtmlText}</p>
                    
                    <div class="details-box">
                      <div class="detail-item" style="color: ${invitationSettings.dateTimeColor}; font-size: ${invitationSettings.dateTimeFontSize}px;">
                        <span class="detail-label">⏰ الموعد:</span>
                        <span>${invitationSettings.dateTimeText}</span>
                      </div>
                      <div class="detail-item" style="color: ${invitationSettings.locationColor}; font-size: ${invitationSettings.locationFontSize}px;">
                        <span class="detail-label">📍 المكان:</span>
                        <span>${invitationSettings.locationText}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}

          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Filter students based on selection and search, academic year, and educational stage
  const filteredStudents = students.filter(s => {
    const matchYear = !s.academicYear || s.academicYear === selectedYear;
    const matchStage = selectedStage === 'all' || s.stage === selectedStage;
    const matchSchool = selectedSchoolId === 'all' || s.schoolId === selectedSchoolId;
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (s.phone && s.phone.includes(searchTerm)) ||
                        s.grade.toLowerCase().includes(searchTerm.toLowerCase());
    return matchYear && matchStage && matchSchool && matchSearch;
  });

  const activeSchool = schools.find(s => s.id === selectedSchoolId);

  return (
    <div className="p-6 font-sans text-right max-w-7xl mx-auto" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 text-white rounded-[2rem] p-8 shadow-xl relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-700/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-600/10 rounded-full blur-2xl -ml-10 -mb-10"></div>
        
        <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
              <GraduationCap className="w-9 h-9 text-amber-300" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">احتفالية أوائل الطلبة</h1>
              <p className="text-emerald-100 font-bold text-sm mt-1">
                منصة تكريم ودعم الطلاب المتفوقين دراسياً وتنظيم كشوف المدارس وطباعة الشهادات الفاخرة
              </p>
            </div>
          </div>
          <div className="flex gap-2 bg-emerald-900/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shrink-0">
            <button
              onClick={() => setActiveTab('management')}
              className={`px-6 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2 ${activeTab === 'management' ? 'bg-amber-400 text-stone-900 shadow-lg' : 'text-white hover:bg-white/10'}`}
            >
              <School className="w-4 h-4" />
              <span>إدارة المدارس والطلاب</span>
            </button>
            <button
              onClick={() => setActiveTab('designer')}
              className={`px-6 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2 ${activeTab === 'designer' ? 'bg-amber-400 text-stone-900 shadow-lg' : 'text-white hover:bg-white/10'}`}
            >
              <Award className="w-4 h-4" />
              <span>مُصمم شهادات التقدير</span>
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`px-6 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2 ${activeTab === 'invitations' ? 'bg-amber-400 text-stone-900 shadow-lg' : 'text-white hover:bg-white/10'}`}
            >
              <FileText className="w-4 h-4" />
              <span>كروت الدعوة للحفل</span>
            </button>
          </div>
        </div>
      </div>

      {quotaExceeded && (
        <div className="bg-rose-50 border-r-4 border-rose-500 p-4 rounded-xl text-rose-950 font-bold flex items-center gap-3 shadow-sm mb-6">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 animate-pulse" />
          <div className="text-right">
            <p className="font-extrabold text-sm">تم تجاوز الحصة المجانية اليومية لقاعدة البيانات (Firebase Quota Exceeded)</p>
            <p className="text-xs text-rose-800 mt-0.5 font-medium leading-relaxed">
              عمليات التعديل والإضافة الجديدة معطلة مؤقتاً حتى يتم تصفير الحصة من جوجل تلقائياً خلال 24 ساعة. يمكنك تصفح البيانات والطباعة والتصدير كالمعتاد.
            </p>
          </div>
        </div>
      )}

      {/* SUCCESS / ERROR ALERTS */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-6 p-4 bg-emerald-50 border-r-4 border-emerald-500 rounded-xl text-emerald-900 font-bold flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{successMsg}</span>
          </motion.div>
        )}
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-6 p-4 bg-rose-50 border-r-4 border-rose-500 rounded-xl text-rose-900 font-bold flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TAB 1: MANAGEMENT */}
      {activeTab === 'management' && (
        <>
          {/* Quick Statistics and Filter Panel */}
          <div className="bg-white rounded-[2rem] p-6 border border-emerald-50 shadow-sm mb-8 flex flex-col gap-6">
            {/* Filters Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-700">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-800 text-base">فلترة وتحديد ملفات الاحتفالية</h3>
                  <p className="text-stone-400 text-xs font-semibold">تصفح وعرض النتائج حسب العام الدراسي والمرحلة التعليمية</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Year Selector */}
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-100 px-3 py-1.5 rounded-2xl">
                  <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-stone-500">العام الدراسي:</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="bg-transparent text-xs font-black text-stone-800 focus:outline-none cursor-pointer"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddYear}
                    className="p-1 hover:bg-stone-200 rounded text-emerald-700"
                    title="إضافة عام دراسي جديد"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Stage Selector */}
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-100 px-3 py-1.5 rounded-2xl">
                  <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-stone-500">المرحلة:</span>
                  <select
                    value={selectedStage}
                    onChange={(e) => setSelectedStage(e.target.value)}
                    className="bg-transparent text-xs font-black text-stone-800 focus:outline-none cursor-pointer"
                  >
                    <option value="all">كل المراحل</option>
                    {stages.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-emerald-50/40 to-emerald-50/10 p-5 rounded-2xl border border-emerald-50/50 flex items-center gap-4 hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/10 shrink-0">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-stone-400 text-xs font-bold">إجمالي المتفوقين</p>
                  <p className="text-2xl font-black text-stone-800 tracking-tight mt-0.5">
                    {students.filter(st => !st.academicYear || st.academicYear === selectedYear).length} <span className="text-xs text-stone-500 font-bold">طالب</span>
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50/40 to-amber-50/10 p-5 rounded-2xl border border-amber-50/50 flex items-center gap-4 hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/10 shrink-0">
                  <School className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-stone-400 text-xs font-bold">المدارس المشاركة</p>
                  <p className="text-2xl font-black text-stone-800 tracking-tight mt-0.5">
                    {schools.length} <span className="text-xs text-stone-500 font-bold">مدرسة</span>
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-rose-50/40 to-rose-50/10 p-5 rounded-2xl border border-rose-50/50 flex items-center gap-4 hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-rose-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/10 shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-stone-400 text-xs font-bold">الحاصلون على النخبة (+95%)</p>
                  <p className="text-2xl font-black text-stone-800 tracking-tight mt-0.5">
                    {students.filter(st => (!st.academicYear || st.academicYear === selectedYear) && st.percentage >= 95).length} <span className="text-xs text-stone-500 font-bold">طالب</span>
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50/40 to-blue-50/10 p-5 rounded-2xl border border-blue-50/50 flex items-center gap-4 hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/10 shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-stone-400 text-xs font-bold">متوسط نسب الأوائل</p>
                  <p className="text-2xl font-black text-stone-800 tracking-tight mt-0.5">
                    {(() => {
                      const currYearStudents = students.filter(st => !st.academicYear || st.academicYear === selectedYear);
                      if (currYearStudents.length === 0) return '0%';
                      const avg = currYearStudents.reduce((acc, curr) => acc + curr.percentage, 0) / currYearStudents.length;
                      return `${avg.toFixed(1)}%`;
                    })()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            {/* Right Sidebar: Schools List */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              <div className="bg-white rounded-3xl p-6 border border-emerald-50 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-extrabold text-emerald-900 text-md">المدارس المشاركة</h3>
                  <button
                    onClick={() => handleOpenSchoolModal()}
                    className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-all"
                    title="إضافة مدرسة جديدة"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Schools selector */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                  <button
                    onClick={() => setSelectedSchoolId('all')}
                    className={`w-full text-right px-4 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-between ${selectedSchoolId === 'all' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'bg-stone-50 text-stone-600 hover:bg-stone-100'}`}
                  >
                    <span>عرض جميع المدارس</span>
                    <span className="text-xs bg-black/10 px-2 py-0.5 rounded-full">
                      {students.filter(st => (!st.academicYear || st.academicYear === selectedYear) && (selectedStage === 'all' || st.stage === selectedStage)).length}
                    </span>
                  </button>

                  {schools.map(s => {
                    const sCount = students.filter(st => st.schoolId === s.id && (!st.academicYear || st.academicYear === selectedYear) && (selectedStage === 'all' || st.stage === selectedStage)).length;
                    return (
                      <div 
                        key={s.id}
                        className={`group relative rounded-2xl transition-all ${selectedSchoolId === s.id ? 'bg-emerald-50 border border-emerald-100' : 'bg-white border border-stone-100 hover:bg-stone-50'}`}
                      >
                        <button
                          onClick={() => setSelectedSchoolId(s.id)}
                          className="w-full text-right px-4 py-3 rounded-2xl font-bold text-sm flex items-center justify-between"
                        >
                          <div className="truncate max-w-[80%] flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${selectedSchoolId === s.id ? 'bg-emerald-600/20 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                              <School className="w-4 h-4" />
                            </div>
                            <div className="truncate text-right">
                              <p className={`truncate font-extrabold ${selectedSchoolId === s.id ? 'text-emerald-900' : 'text-stone-800'}`}>{s.name}</p>
                              {s.supervisorName && (
                                <p className="text-[10px] text-stone-400 font-semibold truncate mt-0.5">مسؤول: {s.supervisorName}</p>
                              )}
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${selectedSchoolId === s.id ? 'bg-emerald-200 text-emerald-900' : 'bg-stone-100 text-stone-500'}`}>
                            {sCount}
                          </span>
                        </button>

                      {/* Quick actions on hover */}
                      <div className="absolute left-2 top-2.5 hidden group-hover:flex items-center gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-stone-100 shadow-sm">
                        <button
                          onClick={() => handleOpenSchoolModal(s)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="تعديل المدرسة"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteSchool(s.id, s.name)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                          title="حذف المدرسة"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {schools.length === 0 && (
                  <p className="text-center text-xs text-stone-400 font-bold py-6">لا توجد مدارس مضافة بعد.</p>
                )}
              </div>
            </div>

            {/* School Supervisor Info Card */}
            {selectedSchoolId !== 'all' && activeSchool && (
              <div className="bg-gradient-to-br from-stone-50 to-amber-50/30 rounded-3xl p-6 border border-amber-100/50 shadow-sm text-right">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-amber-600" />
                  <h4 className="font-extrabold text-stone-800 text-sm">بيانات المسؤول عن المدرسة</h4>
                </div>
                {activeSchool.supervisorName ? (
                  <div className="space-y-2 text-xs font-bold text-stone-600">
                    <p className="flex justify-between border-b border-stone-100 pb-1.5">
                      <span className="text-stone-400">الاسم:</span>
                      <span className="text-stone-800">{activeSchool.supervisorName}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-stone-400">رقم الهاتف:</span>
                      <span className="text-stone-800" dir="ltr">{activeSchool.supervisorPhone || 'غير مسجل'}</span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-stone-400 font-semibold mb-3">لا توجد بيانات مسؤول مسجلة لهذه المدرسة.</p>
                    <button
                      onClick={() => handleOpenSchoolModal(activeSchool)}
                      className="text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl font-bold transition-all w-full"
                    >
                      إضافة بيانات المسؤول
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Left Main Content: Students List Table */}
          <div className="lg:col-span-3 bg-white rounded-[2rem] p-6 border border-emerald-50 shadow-sm">
            
            {/* Table Actions / Tools Header */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-6">
              
              {/* Search Bar */}
              <div className="relative flex-grow max-w-md">
                <input
                  type="text"
                  placeholder="بحث باسم الطالب، رقم الهاتف، أو الصف الدراسي..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-11 pl-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white text-sm"
                />
                <Search className="absolute right-4 top-3.5 w-4 h-4 text-stone-400" />
              </div>

              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => handleOpenStudentModal()}
                  className="bg-emerald-600 text-white hover:bg-emerald-700 px-5 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-600/10"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة طالب متفوق</span>
                </button>

                {/* Import Excel */}
                <div className="relative">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx, .xls"
                    onChange={handleImportExcel}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!uploadProgress}
                    className="bg-amber-50 text-amber-700 hover:bg-amber-100 px-4 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all"
                    title={selectedSchoolId === 'all' ? 'اختر مدرسة أولاً من القائمة الجانبية لتتمكن من استيراد الطلاب إليها' : 'استيراد طلاب مدرسة محددة من ملف إكسل'}
                  >
                    <Upload className="w-4 h-4" />
                    <span>استيراد</span>
                  </button>
                </div>

                <button
                  onClick={handleExportExcel}
                  className="bg-stone-100 text-stone-600 hover:bg-stone-200 px-4 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all"
                  title="تصدير كشف الطلاب لملف Excel"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير</span>
                </button>

                <button
                  onClick={handlePrintStudentList}
                  className="bg-stone-100 text-stone-600 hover:bg-stone-200 p-3 rounded-2xl transition-all"
                  title="طباعة كشف الطلاب"
                >
                  <Printer className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {uploadProgress && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                <span>{uploadProgress}</span>
              </div>
            )}

            {/* Bulk Actions Panel */}
            <AnimatePresence>
              {selectedStudentIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  className="mb-4 overflow-hidden"
                >
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">
                        {selectedStudentIds.length}
                      </div>
                      <span className="text-xs font-black text-emerald-950">طلاب محددين لعمليات جماعية</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Print Selected Certificates */}
                      <button
                        onClick={() => handlePrintCertificates(null)}
                        className="bg-amber-500 hover:bg-amber-600 text-stone-900 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                        title="طباعة شهادة تقدير للطلاب المحددين"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة الشهادات ({selectedStudentIds.length})</span>
                      </button>

                      {/* Bulk change stage dropdown */}
                      <div className="relative group">
                        <button
                          type="button"
                          className="bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all"
                        >
                          <Layers className="w-3.5 h-3.5 text-stone-500" />
                          <span>تعيين المرحلة التعليمية لـ ({selectedStudentIds.length})</span>
                        </button>
                        <div className="absolute right-0 top-full mt-1 bg-white border border-stone-100 rounded-xl shadow-xl py-1 z-50 hidden group-hover:block min-w-[180px]">
                          {stages.map(st => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleBulkUpdateStage(st)}
                              className="w-full text-right px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-50 font-bold transition-all"
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bulk delete */}
                      <button
                        onClick={handleBulkDeleteStudents}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all"
                        title="حذف الطلاب المحددين نهائياً"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف المحددين</span>
                      </button>

                      {/* Clear selection */}
                      <button
                        onClick={() => setSelectedStudentIds([])}
                        className="text-stone-400 hover:text-stone-700 font-bold text-xs px-2 py-1"
                      >
                        إلغاء التحديد
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Students Data Grid/Table */}
            <div className="overflow-x-auto border border-stone-100 rounded-2xl">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100 text-stone-500 text-xs font-black">
                    <th className="p-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.includes(s.id))}
                        onChange={() => {
                          const visibleIds = filteredStudents.map(s => s.id);
                          const allSelected = visibleIds.every(id => selectedStudentIds.includes(id));
                          if (allSelected) {
                            setSelectedStudentIds(prev => prev.filter(id => !visibleIds.includes(id)));
                          } else {
                            setSelectedStudentIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-4 w-12 text-center">م</th>
                    <th className="p-4">اسم الطالب الكـامل</th>
                    <th className="p-4">رقم الهاتف</th>
                    <th className="p-4 text-center">المجموع</th>
                    <th className="p-4 text-center">النسبة المئوية</th>
                    <th className="p-4">الصف الدراسي</th>
                    <th className="p-4">المرحلة التعليمية</th>
                    <th className="p-4">اسم المدرسة</th>
                    <th className="p-4 text-center w-28">العمليات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {filteredStudents.map((s, index) => (
                    <tr key={s.id} className="hover:bg-stone-50/40 transition-colors font-bold text-stone-700">
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(s.id)}
                          onChange={() => {
                            if (selectedStudentIds.includes(s.id)) {
                              setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                            } else {
                              setSelectedStudentIds(prev => [...prev, s.id]);
                            }
                          }}
                          className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 text-center text-stone-400 text-xs">{index + 1}</td>
                      <td className="p-4 font-extrabold text-stone-900">
                        <div className="flex items-center gap-2.5">
                          {s.percentage >= 95 ? (
                            <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 shadow-sm border border-amber-200/50" title="طالب متميز جداً (نخبة)">
                              <Award className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 shrink-0">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <span className="truncate max-w-[200px]">{s.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {s.phone ? (
                          <div className="flex items-center gap-1.5 text-stone-500 font-mono text-xs">
                            <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span dir="ltr">{s.phone}</span>
                          </div>
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center font-mono text-sm text-stone-600">{s.totalMarks || '-'}</td>
                      <td className="p-4 text-center">
                        {s.percentage ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black border ${
                            s.percentage >= 95 
                              ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-sm shadow-amber-500/5' 
                              : s.percentage >= 90 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                              : 'bg-stone-50 text-stone-700 border-stone-200/60'
                          }`}>
                            {s.percentage}%
                          </span>
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="bg-emerald-50/60 text-emerald-800 border border-emerald-100/50 px-2.5 py-1 rounded-xl text-xs font-black">
                          {s.grade || 'غير محدد'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="bg-amber-50 text-amber-800 border border-amber-200/50 px-2.5 py-1 rounded-xl text-xs font-black">
                          {s.stage || 'المرحلة الابتدائية'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <School className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span className="text-stone-600 truncate max-w-[150px]">{s.schoolName}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handlePrintCertificates(s)}
                            className="p-2 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-100/60 rounded-xl transition-all shadow-sm"
                            title="طباعة شهادة التقدير للطالب"
                          >
                            <Award className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenStudentModal(s)}
                            className="p-2 text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-100/60 rounded-xl transition-all shadow-sm"
                            title="تعديل بيانات الطالب"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(s.id, s.name)}
                            className="p-2 text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-100/60 rounded-xl transition-all shadow-sm"
                            title="حذف الطالب"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-stone-400 font-bold">
                        {loading ? 'جاري تحميل البيانات...' : 'لا توجد بيانات طلاب مطابقة لخيارات التصفية.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Quick Batch Certificates Print Footer */}
            {filteredStudents.length > 0 && (
              <div className="mt-6 p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-right">
                  <p className="font-extrabold text-sm text-emerald-900">طباعة جماعية لشهادات التقدير</p>
                  <p className="text-xs text-stone-500 font-semibold mt-0.5">
                    يمكنك طباعة شهادات التقدير دفعة واحدة لجميع الطلاب المعروضين حالياً في الجدول ({filteredStudents.length} طالب)
                  </p>
                </div>
                <button
                  onClick={() => handlePrintCertificates(null)}
                  className="bg-amber-500 hover:bg-amber-600 text-stone-900 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-md shadow-amber-500/10 shrink-0"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الشهادات جماعياً</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    )}

      {/* TAB 2: CERTIFICATE DESIGNER */}
      {activeTab === 'designer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
          
          {/* Left Column: Live Certificate Preview & Direct Exports (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6 lg:sticky lg:top-6">
            <div className="bg-white rounded-[2.5rem] p-7 border border-stone-150 shadow-lg flex flex-col gap-6">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100 pb-5">
                <div>
                  <h3 className="font-black text-stone-900 text-lg flex items-center gap-2">
                    <Award className="w-6 h-6 text-amber-500 animate-pulse" />
                    <span>المعاينة المباشرة والتحميل والطباعة</span>
                  </h3>
                  <p className="text-xs text-stone-500 font-bold mt-1">شكل شهادة التقدير الحقيقي الذي يظهر جهة اليسار بدقة متناهية</p>
                </div>

                {/* Quick Student Selector to Preview real data */}
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <span className="text-xs font-black text-stone-600 shrink-0">معاينة الطالب:</span>
                  <select 
                    id="preview-student-select"
                    className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 font-extrabold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs flex-grow sm:flex-grow-0"
                    onChange={() => {
                      // Trigger state refresh for rendering
                      setSuccessMsg('');
                    }}
                  >
                    {filteredStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - مدرسة {s.schoolName}</option>
                    ))}
                    {filteredStudents.length === 0 && (
                      <option value="">أحمد محمود العبدالله (عينة)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* The Realistic Certificate Live Canvas Preview Container */}
              <div className="border border-stone-200 rounded-[2rem] overflow-hidden bg-stone-100 p-6 flex justify-center items-center shadow-inner relative min-h-[360px]">
                
                {/* Visual Representation of the Certificate (Export target element) */}
                <div 
                  id="certificate-preview-canvas"
                  className="w-full relative shadow-2xl rounded-sm origin-center text-right transition-all flex flex-col justify-between"
                  style={{
                    aspectRatio: '1.414 / 1', // standard A4 Landscape
                    padding: `${certificateSettings.paddingTop ?? 35}px ${certificateSettings.paddingRight ?? 50}px ${certificateSettings.paddingBottom ?? 35}px ${certificateSettings.paddingLeft ?? 50}px`,
                    backgroundColor: certificateSettings.backgroundColor || '#fffdf9',
                    border: `${certificateSettings.borderWidth}px ${certificateSettings.borderStyle === 'islamic' ? 'solid' : certificateSettings.borderStyle === 'classic' ? 'double' : 'solid'} ${certificateSettings.borderColor}`,
                    outline: certificateSettings.borderStyle === 'islamic' ? `3px double ${certificateSettings.borderColor}` : 'none',
                    outlineOffset: certificateSettings.borderStyle === 'islamic' ? '-10px' : '0px'
                  }}
                >
                  
                  {/* Ornaments for Islamic theme */}
                  {certificateSettings.borderStyle === 'islamic' && (
                    <>
                      <div className="absolute top-2 right-2 w-7 h-7 border-2 border-amber-600 border-b-0 border-l-0"></div>
                      <div className="absolute top-2 left-2 w-7 h-7 border-2 border-amber-600 border-b-0 border-r-0"></div>
                      <div className="absolute bottom-2 right-2 w-7 h-7 border-2 border-amber-600 border-t-0 border-l-0"></div>
                      <div className="absolute bottom-2 left-2 w-7 h-7 border-2 border-amber-600 border-t-0 border-r-0"></div>
                    </>
                  )}

                  {/* Top Logos & Title header */}
                  <div 
                    className="flex justify-between items-center w-full"
                    style={{
                      marginBottom: `${certificateSettings.headerMarginBottom ?? 15}px`,
                      transform: `translateY(${certificateSettings.logosYOffset ?? 0}px)`
                    }}
                  >
                    {/* Right Logo */}
                    <div className="flex flex-col items-center shrink-0">
                      {certificateSettings.rightLogoUrl ? (
                        <img 
                          src={certificateSettings.rightLogoUrl} 
                          alt="Association Logo" 
                          style={{ height: `${certificateSettings.rightLogoSize}px` }} 
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center border border-dashed border-stone-200">
                          <span className="text-[10px] font-bold text-stone-400">لا شعار</span>
                        </div>
                      )}
                    </div>

                    {/* Centered Title */}
                    <div 
                      className="text-center flex-grow px-4 flex flex-col items-center"
                      style={{
                        transform: `translateY(${certificateSettings.titleYOffset ?? 0}px)`
                      }}
                    >
                      <h2 
                        className="font-black leading-tight select-none"
                        style={{ 
                          fontFamily: `${certificateSettings.titleFontFamily || 'Reem Kufi'}, 'Reem Kufi', sans-serif`,
                          fontSize: `${certificateSettings.titleFontSize}px`,
                          color: certificateSettings.titleColor 
                        }}
                      >
                        {certificateSettings.titleText}
                      </h2>
                      <div className="w-32 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent mt-2"></div>
                    </div>

                    {/* Left Logo */}
                    <div className="flex flex-col items-center shrink-0">
                      {certificateSettings.leftLogoUrl ? (
                        <img 
                          src={certificateSettings.leftLogoUrl} 
                          alt="Ministry Logo" 
                          style={{ height: `${certificateSettings.leftLogoSize}px` }} 
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center border border-dashed border-stone-200">
                          <span className="text-[10px] font-bold text-stone-400">لا شعار</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body Formula Text Section */}
                  <div 
                    className="flex-grow flex items-center justify-center px-4 text-center"
                    style={{
                      marginBottom: `${certificateSettings.bodyMarginBottom ?? 25}px`
                    }}
                  >
                    <p 
                      className="text-stone-700 leading-relaxed font-bold max-w-[98%] text-center"
                      style={{
                        fontFamily: `${certificateSettings.formulaFontFamily || 'Amiri'}, 'Amiri', serif`,
                        fontSize: `${certificateSettings.formulaFontSize}px`,
                        color: certificateSettings.formulaColor
                      }}
                    >
                      {/* Compile template text with selected or sample student */}
                      {(() => {
                        const selectEl = document.getElementById('preview-student-select') as HTMLSelectElement;
                        const previewStudentId = selectEl?.value;
                        const activeStudent = students.find(s => s.id === previewStudentId) || filteredStudents[0] || {
                          name: 'أحمد محمود العبدالله',
                          schoolName: 'مدرسة عمر بن الخطاب النموذجية',
                          grade: 'الثالث الإعدادي',
                          totalMarks: 278.5,
                          percentage: 99.4
                        };
                        
                        const text = compileFormula(certificateSettings.formulaText, activeStudent);
                        return text.replace(activeStudent.name, `###`);
                      })().split('###').map((part, pIdx, arr) => {
                        const selectEl = document.getElementById('preview-student-select') as HTMLSelectElement;
                        const previewStudentId = selectEl?.value;
                        const activeStudent = students.find(s => s.id === previewStudentId) || filteredStudents[0] || {
                          name: 'أحمد محمود العبدالله'
                        };

                        return (
                          <React.Fragment key={pIdx}>
                            {part}
                            {pIdx < arr.length - 1 && (
                              <span 
                                className="mx-1.5 border-b border-dashed border-emerald-600 font-black inline-block px-1"
                                style={{ 
                                  fontFamily: `${certificateSettings.nameFontFamily || 'Cairo'}, 'Cairo', sans-serif`,
                                  fontSize: `${certificateSettings.nameFontSize}px`, 
                                  color: certificateSettings.nameColor 
                                }}
                              >
                                {activeStudent.name}
                              </span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </p>
                  </div>

                  {/* Bottom Row Signatures preview */}
                  <div 
                    className="flex justify-around items-end w-full border-t border-dashed border-stone-200/50 pt-4"
                    style={{
                      transform: `translateY(${certificateSettings.signaturesYOffset ?? 0}px)`
                    }}
                  >
                    {certificateSettings.signatures.map((sig, sigIdx) => (
                      <div key={sigIdx} className="text-center w-36">
                        <p 
                          className="font-black text-stone-500 mb-5 truncate text-center"
                          style={{ 
                            fontFamily: `${certificateSettings.signatureFontFamily || 'Cairo'}, 'Cairo', sans-serif`,
                            fontSize: `${certificateSettings.signatureFontSize}px`, 
                            color: certificateSettings.signatureColor 
                          }}
                        >
                          {sig.title}
                        </p>
                        <div className="w-20 h-[1px] bg-stone-300 mx-auto mb-1.5"></div>
                        <p className="text-xs font-black text-stone-900 truncate">{sig.name}</p>
                      </div>
                    ))}
                  </div>

                </div>

              </div>

              {/* SAVE & EXPORTS ACTIONS PANEL */}
              <div className="border-t border-stone-100 pt-6">
                <h4 className="font-extrabold text-stone-800 text-sm mb-4">تصدير وحفظ شهادة تقدير الطالب المحدد بالصيغ المختلفة</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  
                  {/* Export PDF Button */}
                  <button
                    onClick={async () => {
                      const selectEl = document.getElementById('preview-student-select') as HTMLSelectElement;
                      const previewStudentId = selectEl?.value;
                      const activeStudent = students.find(s => s.id === previewStudentId) || filteredStudents[0] || {
                        name: 'الطالب'
                      };
                      triggerSuccess('جاري تصدير الشهادة كملف PDF...');
                      await exportPDF('certificate-preview-canvas', `${activeStudent.name}_شهادة_تقدير`);
                      triggerSuccess('تم الحفظ بنجاح بصيغة PDF!');
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/10 border border-emerald-500/10"
                  >
                    <FileText className="w-5 h-5" />
                    <span>حفظ بصيغة PDF</span>
                  </button>

                  {/* Export JPG Button */}
                  <button
                    onClick={async () => {
                      const selectEl = document.getElementById('preview-student-select') as HTMLSelectElement;
                      const previewStudentId = selectEl?.value;
                      const activeStudent = students.find(s => s.id === previewStudentId) || filteredStudents[0] || {
                        name: 'الطالب'
                      };
                      triggerSuccess('جاري حفظ الشهادة كصورة عريضة...');
                      await exportJPG('certificate-preview-canvas', `${activeStudent.name}_شهادة_تقدير`);
                      triggerSuccess('تم حفظ الصورة بنجاح!');
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-stone-900 p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/10"
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span>حفظ كـ صورة JPG</span>
                  </button>

                  {/* Export Word Button */}
                  <button
                    onClick={() => {
                      const selectEl = document.getElementById('preview-student-select') as HTMLSelectElement;
                      const previewStudentId = selectEl?.value;
                      const activeStudent = students.find(s => s.id === previewStudentId) || filteredStudents[0] || {
                        name: 'الطالب',
                        schoolName: 'المدرسة التابع لها',
                        grade: 'الصف الدراسي',
                        totalMarks: 'المجموع',
                        percentage: 'النسبة %'
                      };
                      const compiledFormula = compileFormula(certificateSettings.formulaText, activeStudent);
                      exportWord(activeStudent.name, certificateSettings.titleText, compiledFormula);
                      triggerSuccess('تم تصدير ملف Word (.doc) بنجاح!');
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/10 border border-blue-500/10"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                    <span>تصدير ملف Word</span>
                  </button>

                  {/* Print Directly Button */}
                  <button
                    onClick={() => {
                      const selectEl = document.getElementById('preview-student-select') as HTMLSelectElement;
                      const previewStudentId = selectEl?.value;
                      const activeStudent = students.find(s => s.id === previewStudentId);
                      handlePrintCertificates(activeStudent || null);
                    }}
                    className="bg-stone-900 hover:bg-black text-white p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-stone-950/10"
                  >
                    <Printer className="w-5 h-5" />
                    <span>طباعة ورقية</span>
                  </button>

                </div>

                {/* Bulk action buttons */}
                <div className="mt-5 bg-stone-50 p-4 rounded-2xl border border-stone-150 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-center sm:text-right">
                    <h5 className="font-bold text-xs text-stone-700">طباعة وتصدير جماعي متكامل</h5>
                    <p className="text-[10px] text-stone-500 mt-0.5">تصفية وطباعة شهادات تقدير الطلاب المحددون بالجدول دفعة واحدة بورقة منفصلة لكل طالب</p>
                  </div>
                  <button
                    onClick={() => handlePrintCertificates(null)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-900 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة جميع الشهادات ({filteredStudents.length})</span>
                  </button>
                </div>

              </div>

            </div>
          </div>

          {/* Right Column: Live Design Adjustments Panel (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Control Panel Wrapper */}
            <div className="bg-white rounded-[2.5rem] p-7 border border-stone-150 shadow-lg flex flex-col gap-5">
              
              <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-700" />
                <h3 className="font-extrabold text-stone-900 text-md">أدوات ضبط ومظهر الشهادة</h3>
              </div>

              {/* SECTION 1: FONTS & COLOR SETTINGS */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-4">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Palette className="w-4 h-4 text-emerald-600" />
                  <span>ضبط أنواع الخطوط وألوانها</span>
                </h4>

                {/* Title Font Settings */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-stone-600">خط ولون العنوان الرئيسي</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={certificateSettings.titleFontFamily}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleFontFamily: e.target.value }))}
                      className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:outline-emerald-600"
                    >
                      {ARABIC_FONTS.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <input
                      type="color"
                      value={certificateSettings.titleColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleColor: e.target.value }))}
                      className="w-full h-8 cursor-pointer rounded-lg bg-white border border-stone-200"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400 shrink-0 font-bold">الحجم:</span>
                    <input
                      type="range"
                      min={18}
                      max={75}
                      value={certificateSettings.titleFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold bg-white border px-1.5 py-0.5 rounded">{certificateSettings.titleFontSize}px</span>
                  </div>
                </div>

                {/* Student Name Font Settings */}
                <div className="space-y-2 border-t border-stone-100/60 pt-2">
                  <label className="block text-[11px] font-bold text-stone-600">خط ولون اسم الطالب</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={certificateSettings.nameFontFamily}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, nameFontFamily: e.target.value }))}
                      className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:outline-emerald-600"
                    >
                      {ARABIC_FONTS.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <input
                      type="color"
                      value={certificateSettings.nameColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, nameColor: e.target.value }))}
                      className="w-full h-8 cursor-pointer rounded-lg bg-white border border-stone-200"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400 shrink-0 font-bold">الحجم:</span>
                    <input
                      type="range"
                      min={14}
                      max={60}
                      value={certificateSettings.nameFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, nameFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold bg-white border px-1.5 py-0.5 rounded">{certificateSettings.nameFontSize}px</span>
                  </div>
                </div>

                {/* Formula Font Settings */}
                <div className="space-y-2 border-t border-stone-100/60 pt-2">
                  <label className="block text-[11px] font-bold text-stone-600">خط ولون صيغة التهنئة</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={certificateSettings.formulaFontFamily}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, formulaFontFamily: e.target.value }))}
                      className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:outline-emerald-600"
                    >
                      {ARABIC_FONTS.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <input
                      type="color"
                      value={certificateSettings.formulaColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, formulaColor: e.target.value }))}
                      className="w-full h-8 cursor-pointer rounded-lg bg-white border border-stone-200"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400 shrink-0 font-bold">الحجم:</span>
                    <input
                      type="range"
                      min={11}
                      max={45}
                      value={certificateSettings.formulaFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, formulaFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold bg-white border px-1.5 py-0.5 rounded">{certificateSettings.formulaFontSize}px</span>
                  </div>
                </div>

                {/* Signature Font Settings */}
                <div className="space-y-2 border-t border-stone-100/60 pt-2">
                  <label className="block text-[11px] font-bold text-stone-600">خط ولون قسم التوقيعات</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={certificateSettings.signatureFontFamily}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, signatureFontFamily: e.target.value }))}
                      className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:outline-emerald-600"
                    >
                      {ARABIC_FONTS.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <input
                      type="color"
                      value={certificateSettings.signatureColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, signatureColor: e.target.value }))}
                      className="w-full h-8 cursor-pointer rounded-lg bg-white border border-stone-200"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400 shrink-0 font-bold">الحجم:</span>
                    <input
                      type="range"
                      min={10}
                      max={35}
                      value={certificateSettings.signatureFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, signatureFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold bg-white border px-1.5 py-0.5 rounded">{certificateSettings.signatureFontSize}px</span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: TEXT FORMULAS & TITLES */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Type className="w-4 h-4 text-emerald-600" />
                  <span>نصوص وصيغة التهنئة</span>
                </h4>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">عنوان الشهادة الرئيسي</label>
                  <input
                    type="text"
                    value={certificateSettings.titleText}
                    onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleText: e.target.value }))}
                    className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl text-stone-800 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">صيغة التقدير التلقائية</label>
                  <textarea
                    rows={4}
                    value={certificateSettings.formulaText}
                    onChange={(e) => setCertificateSettings(prev => ({ ...prev, formulaText: e.target.value }))}
                    className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl text-stone-800 font-bold text-[11px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                  />
                  <p className="text-[9px] text-stone-400 font-bold mt-1 leading-normal">
                    * استخدم الرموز التالية لتعبئتها لكل طالب آلياً: <br/>
                    <code className="text-emerald-700">{`{{name}}`}</code> للطلاب،
                    <code className="text-emerald-700">{` {{school}}`}</code> للمدرسة،
                    <code className="text-emerald-700">{` {{grade}}`}</code> للصف،
                    <code className="text-emerald-700">{` {{percentage}}`}</code> للنسبة.
                  </p>
                </div>
              </div>

              {/* SECTION 3: THEMES, BACKGROUNDS & BORDERS */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-4">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Palette className="w-4 h-4 text-emerald-600" />
                  <span>نمط الإطار ومظهر الخلفية والألوان</span>
                </h4>

                {/* Border style */}
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 mb-1.5">نمط الإطار الخارجي</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'islamic', name: 'إسلامي مذهب' },
                      { id: 'classic', name: 'ملكي كلاسيكي' },
                      { id: 'modern', name: 'هندسي عصري' }
                    ].map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setCertificateSettings(prev => ({ ...prev, borderStyle: b.id }))}
                        className={`py-1.5 rounded-xl text-[10px] font-bold transition-all ${certificateSettings.borderStyle === b.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'}`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preset Fast Themes */}
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 mb-1.5">سمات سريعة متناسقة (Themes)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'الملكي الذهبي', border: '#d97706', title: '#b45309', name: '#047857', bg: '#fffdf9' },
                      { label: 'الزمردي الفاخر', border: '#059669', title: '#064e3b', name: '#b45309', bg: '#f0fdf4' },
                      { label: 'الأزرق الرئاسي', border: '#2563eb', title: '#1e3a8a', name: '#d97706', bg: '#f0f5ff' },
                      { label: 'الكلاسيكي الفضي', border: '#6b7280', title: '#111827', name: '#047857', bg: '#f9fafb' },
                    ].map((th, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCertificateSettings(prev => ({
                          ...prev,
                          borderColor: th.border,
                          titleColor: th.title,
                          nameColor: th.name,
                          backgroundColor: th.bg
                        }))}
                        className="text-[9px] font-bold bg-white hover:bg-stone-50 px-2 py-1 rounded-lg border border-stone-200 transition-all text-stone-600 flex items-center gap-1 shrink-0"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: th.border }}></span>
                        <span>{th.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">لون الإطار</label>
                    <input
                      type="color"
                      value={certificateSettings.borderColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, borderColor: e.target.value }))}
                      className="w-full h-8 rounded-lg cursor-pointer bg-white border border-stone-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">لون خلفية الورق</label>
                    <input
                      type="color"
                      value={certificateSettings.backgroundColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                      className="w-full h-8 rounded-lg cursor-pointer bg-white border border-stone-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">سمك الإطار</label>
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="range"
                        min={2}
                        max={30}
                        value={certificateSettings.borderWidth}
                        onChange={(e) => setCertificateSettings(prev => ({ ...prev, borderWidth: parseInt(e.target.value) }))}
                        className="w-full accent-emerald-600"
                      />
                      <span className="text-[9px] font-mono font-bold bg-white border px-1 rounded shrink-0">{certificateSettings.borderWidth}px</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: SPACING & POSITION OFFSETS */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <span>ضبط الهوامش الرأسية والداخلية</span>
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">الهامش العلوي</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="range"
                        min={5}
                        max={120}
                        value={certificateSettings.paddingTop}
                        onChange={(e) => setCertificateSettings(prev => ({ ...prev, paddingTop: parseInt(e.target.value) }))}
                        className="w-full accent-emerald-600"
                      />
                      <span className="text-[9px] font-mono font-bold bg-white border px-1 rounded">{certificateSettings.paddingTop}px</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">الهامش السفلي</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="range"
                        min={5}
                        max={120}
                        value={certificateSettings.paddingBottom}
                        onChange={(e) => setCertificateSettings(prev => ({ ...prev, paddingBottom: parseInt(e.target.value) }))}
                        className="w-full accent-emerald-600"
                      />
                      <span className="text-[9px] font-mono font-bold bg-white border px-1 rounded">{certificateSettings.paddingBottom}px</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">محاذاة العنوان (رأسي)</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="range"
                        min={-50}
                        max={50}
                        value={certificateSettings.titleYOffset}
                        onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleYOffset: parseInt(e.target.value) }))}
                        className="w-full accent-emerald-600"
                      />
                      <span className="text-[9px] font-mono font-bold bg-white border px-1 rounded">{certificateSettings.titleYOffset}px</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">محاذاة التوقيعات (رأسي)</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="range"
                        min={-50}
                        max={50}
                        value={certificateSettings.signaturesYOffset}
                        onChange={(e) => setCertificateSettings(prev => ({ ...prev, signaturesYOffset: parseInt(e.target.value) }))}
                        className="w-full accent-emerald-600"
                      />
                      <span className="text-[9px] font-mono font-bold bg-white border px-1 rounded">{certificateSettings.signaturesYOffset}px</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 5: LOGOS & EMBLEMS */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>الشعارات واللوجو</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Right Logo */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-stone-600">الشعار الأيمن (الجمعية)</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        className="flex-1 text-[10px] px-2.5 py-1.5 border border-stone-200 rounded-xl font-bold bg-white"
                        placeholder="رابط الشعار الأيمن..."
                        value={certificateSettings.rightLogoUrl}
                        onChange={(e) => setCertificateSettings(prev => ({ ...prev, rightLogoUrl: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => rightLogoInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-bold transition-colors flex items-center justify-center shrink-0"
                      >
                        {isUploadingRightLogo ? <Loader2 className="w-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      </button>
                      <input
                        ref={rightLogoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleLogoUpload(e, 'right')}
                      />
                    </div>
                  </div>

                  {/* Left Logo */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-stone-600">الشعار الأيسر (الوزارة)</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        className="flex-1 text-[10px] px-2.5 py-1.5 border border-stone-200 rounded-xl font-bold bg-white"
                        placeholder="رابط الشعار الأيسر..."
                        value={certificateSettings.leftLogoUrl}
                        onChange={(e) => setCertificateSettings(prev => ({ ...prev, leftLogoUrl: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => leftLogoInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-bold transition-colors flex items-center justify-center shrink-0"
                      >
                        {isUploadingLeftLogo ? <Loader2 className="w-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      </button>
                      <input
                        ref={leftLogoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleLogoUpload(e, 'left')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 6: BOTTOM SIGNATURES MANAGER */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-stone-100">
                  <h4 className="font-black text-stone-800 text-xs">التوقيعات والمكرمين في الأسفل</h4>
                  <button
                    type="button"
                    onClick={() => setCertificateSettings(prev => ({
                      ...prev,
                      signatures: [...prev.signatures, { title: 'توقيع جديد', name: 'الاسم هنا' }]
                    }))}
                    className="text-[10px] text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-all"
                  >
                    + إضافة توقيع
                  </button>
                </div>

                <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar">
                  {certificateSettings.signatures.map((sig, sIdx) => (
                    <div key={sIdx} className="flex gap-1.5 items-center bg-white p-1.5 rounded-xl border border-stone-200 relative">
                      <input
                        type="text"
                        placeholder="صفة التوقيع"
                        value={sig.title}
                        onChange={(e) => {
                          const updated = [...certificateSettings.signatures];
                          updated[sIdx].title = e.target.value;
                          setCertificateSettings(prev => ({ ...prev, signatures: updated }));
                        }}
                        className="w-1/2 px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-[10px] font-bold"
                      />
                      <input
                        type="text"
                        placeholder="الاسم كامل"
                        value={sig.name}
                        onChange={(e) => {
                          const updated = [...certificateSettings.signatures];
                          updated[sIdx].name = e.target.value;
                          setCertificateSettings(prev => ({ ...prev, signatures: updated }));
                        }}
                        className="w-1/2 px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-[10px] font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = certificateSettings.signatures.filter((_, i) => i !== sIdx);
                          setCertificateSettings(prev => ({ ...prev, signatures: updated }));
                        }}
                        className="text-red-500 hover:text-red-700 p-1 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* TAB 3: INVITATIONS DESIGNER */}
      {activeTab === 'invitations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in text-right" dir="rtl">
          
          {/* Left Column: Live Card Preview & Direct Exports (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6 lg:sticky lg:top-6">
            <div className="bg-white rounded-[2.5rem] p-7 border border-stone-150 shadow-lg flex flex-col gap-6">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100 pb-5">
                <div>
                  <h3 className="font-black text-stone-900 text-lg flex items-center gap-2">
                    <Award className="w-6 h-6 text-amber-500 animate-pulse" />
                    <span>معاينة كروت الدعوة والطباعة</span>
                  </h3>
                  <p className="text-xs text-stone-500 font-bold mt-1">المعاينة الحية لكروت الدعوة المصممة لحضور الحفل السنوي</p>
                </div>

                {/* Quick Student Selector to Preview real data */}
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <span className="text-xs font-black text-stone-600 shrink-0">معاينة الطالب:</span>
                  <select 
                    value={invitationPreviewStudentId}
                    className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 font-extrabold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs flex-grow sm:flex-grow-0 cursor-pointer"
                    onChange={(e) => setInvitationPreviewStudentId(e.target.value)}
                  >
                    {filteredStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - مدرسة {s.schoolName}</option>
                    ))}
                    {filteredStudents.length === 0 && (
                      <option value="">أحمد محمود العبدالله (عينة)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* The Realistic Invitation Live Canvas Preview Container */}
              <div className="border border-stone-200 rounded-[2rem] overflow-hidden bg-stone-100 p-6 flex justify-center items-center shadow-inner relative min-h-[360px]">
                
                {/* Visual Representation of the Invitation Card (Export target element) */}
                <div 
                  id="invitation-preview-canvas"
                  className="w-full relative shadow-2xl rounded-sm origin-center text-right transition-all flex flex-col justify-between"
                  style={{
                    aspectRatio: '1.414 / 1', // standard A4 Landscape
                    padding: `${invitationSettings.paddingTop ?? 30}px ${invitationSettings.paddingRight ?? 40}px ${invitationSettings.paddingBottom ?? 30}px ${invitationSettings.paddingLeft ?? 40}px`,
                    backgroundColor: invitationSettings.backgroundColor || '#fffdf9',
                    border: `${invitationSettings.borderWidth}px ${invitationSettings.borderStyle === 'islamic' ? 'solid' : invitationSettings.borderStyle === 'classic' ? 'double' : 'solid'} ${invitationSettings.borderColor}`,
                    outline: invitationSettings.borderStyle === 'islamic' ? `3px double ${invitationSettings.borderColor}` : 'none',
                    outlineOffset: invitationSettings.borderStyle === 'islamic' ? '-10px' : '0px'
                  }}
                >
                  
                  {/* Ornaments for Islamic theme */}
                  {invitationSettings.borderStyle === 'islamic' && (
                    <>
                      <div className="absolute top-2 right-2 w-7 h-7 border-2 border-amber-600 border-b-0 border-l-0"></div>
                      <div className="absolute top-2 left-2 w-7 h-7 border-2 border-amber-600 border-b-0 border-r-0"></div>
                      <div className="absolute bottom-2 right-2 w-7 h-7 border-2 border-amber-600 border-t-0 border-l-0"></div>
                      <div className="absolute bottom-2 left-2 w-7 h-7 border-2 border-amber-600 border-t-0 border-r-0"></div>
                    </>
                  )}

                  {/* Top Logos & Title header */}
                  <div 
                    className="flex justify-between items-center w-full"
                    style={{
                      marginBottom: `${invitationSettings.headerMarginBottom ?? 12}px`
                    }}
                  >
                    {/* Right Logo */}
                    <div className="flex flex-col items-center shrink-0">
                      {invitationSettings.rightLogoUrl ? (
                        <img 
                          src={invitationSettings.rightLogoUrl} 
                          alt="Association Logo" 
                          style={{ height: `${invitationSettings.rightLogoSize}px` }} 
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center border border-dashed border-stone-200">
                          <span className="text-[10px] font-bold text-stone-400">لا شعار</span>
                        </div>
                      )}
                    </div>

                    {/* Centered Title */}
                    <div className="text-center flex-grow px-4 flex flex-col items-center">
                      <h2 
                        className="font-black leading-tight select-none"
                        style={{ 
                          fontFamily: `${invitationSettings.titleFontFamily || 'Reem Kufi'}, 'Reem Kufi', sans-serif`,
                          fontSize: `${invitationSettings.titleFontSize}px`,
                          color: invitationSettings.titleColor 
                        }}
                      >
                        {invitationSettings.titleText}
                      </h2>
                      <div className="w-32 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent mt-2"></div>
                    </div>

                    {/* Left Logo */}
                    <div className="flex flex-col items-center shrink-0">
                      {invitationSettings.leftLogoUrl ? (
                        <img 
                          src={invitationSettings.leftLogoUrl} 
                          alt="Ministry Logo" 
                          style={{ height: `${invitationSettings.leftLogoSize}px` }} 
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center border border-dashed border-stone-200">
                          <span className="text-[10px] font-bold text-stone-400">لا شعار</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body Formula Text Section */}
                  <div 
                    className="flex-grow flex flex-col items-center justify-center px-4 text-center"
                    style={{
                      marginBottom: `${invitationSettings.bodyMarginBottom ?? 15}px`
                    }}
                  >
                    <p 
                      className="text-stone-700 leading-relaxed font-bold max-w-[98%] text-center mb-6"
                      style={{
                        fontFamily: `${invitationSettings.formulaFontFamily || 'Cairo'}, 'Cairo', sans-serif`,
                        fontSize: `${invitationSettings.formulaFontSize}px`,
                        color: invitationSettings.formulaColor,
                        lineHeight: invitationSettings.formulaLineHeight
                      }}
                    >
                      {/* Compile template text with selected or sample student */}
                      {(() => {
                        const activeStudent = students.find(s => s.id === invitationPreviewStudentId) || filteredStudents[0] || {
                          name: 'أحمد محمود العبدالله',
                          schoolName: 'مدرسة عمر بن الخطاب النموذجية',
                          grade: 'الثالث الإعدادي',
                          totalMarks: 278.5,
                          percentage: 99.4
                        };
                        
                        const text = compileFormula(invitationSettings.formulaText, activeStudent);
                        return text.replace(activeStudent.name, `###`);
                      })().split('###').map((part, pIdx, arr) => {
                        const activeStudent = students.find(s => s.id === invitationPreviewStudentId) || filteredStudents[0] || {
                          name: 'أحمد محمود العبدالله'
                        };

                        return (
                          <React.Fragment key={pIdx}>
                            {part}
                            {pIdx < arr.length - 1 && (
                              <span 
                                className="mx-1.5 border-b border-dashed border-emerald-600 font-black inline-block px-1 text-center"
                                style={{ 
                                  fontFamily: 'Cairo, sans-serif',
                                  fontSize: `${invitationSettings.formulaFontSize + 4}px`, 
                                  color: '#047857' 
                                }}
                              >
                                {activeStudent.name}
                              </span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </p>

                    {/* Date/Time and Location Panel */}
                    <div className="bg-stone-50/70 border border-stone-100 rounded-2xl p-4 w-[90%] max-w-lg mx-auto flex flex-col gap-2 shadow-sm text-center">
                      <div className="flex items-center justify-center gap-2 text-sm font-black" style={{ color: invitationSettings.dateTimeColor }}>
                        <Clock className="w-4 h-4 shrink-0" />
                        <span className="opacity-80">الموعد:</span>
                        <span>{invitationSettings.dateTimeText}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2 text-sm font-black" style={{ color: invitationSettings.locationColor }}>
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span className="opacity-80">المكان:</span>
                        <span>{invitationSettings.locationText}</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* SAVE & EXPORTS ACTIONS PANEL */}
              <div className="border-t border-stone-100 pt-6">
                <h4 className="font-extrabold text-stone-800 text-sm mb-4">تصدير وحفظ كرت الدعوة للطالب المحدد بالصيغ المختلفة</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  
                  {/* Export PDF Button */}
                  <button
                    onClick={async () => {
                      const activeStudent = students.find(s => s.id === invitationPreviewStudentId) || filteredStudents[0] || {
                        name: 'الطالب'
                      };
                      triggerSuccess('جاري تصدير كرت الدعوة كملف PDF...');
                      await exportPDF('invitation-preview-canvas', `${activeStudent.name}_دعوة_حفل_التفوق`);
                      triggerSuccess('تم الحفظ بنجاح بصيغة PDF!');
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/10 border border-emerald-500/10"
                  >
                    <FileText className="w-5 h-5" />
                    <span>حفظ بصيغة PDF</span>
                  </button>

                  {/* Export JPG Button */}
                  <button
                    onClick={async () => {
                      const activeStudent = students.find(s => s.id === invitationPreviewStudentId) || filteredStudents[0] || {
                        name: 'الطالب'
                      };
                      triggerSuccess('جاري حفظ كرت الدعوة كصورة عريضة...');
                      await exportJPG('invitation-preview-canvas', `${activeStudent.name}_دعوة_حفل_التفوق`);
                      triggerSuccess('تم حفظ الصورة بنجاح!');
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-stone-900 p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/10"
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span>حفظ كـ صورة JPG</span>
                  </button>

                  {/* Export Word Button */}
                  <button
                    onClick={() => {
                      const activeStudent = students.find(s => s.id === invitationPreviewStudentId) || filteredStudents[0] || {
                        name: 'الطالب',
                        schoolName: 'المدرسة التابع لها',
                        grade: 'الصف الدراسي',
                        totalMarks: 'المجموع',
                        percentage: 'النسبة %'
                      };
                      const compiledFormula = compileFormula(invitationSettings.formulaText, activeStudent);
                      exportWordInvitation(
                        activeStudent.name,
                        invitationSettings.titleText,
                        compiledFormula,
                        invitationSettings.dateTimeText,
                        invitationSettings.locationText
                      );
                      triggerSuccess('تم تصدير ملف Word (.doc) بنجاح!');
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/10 border border-blue-500/10"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                    <span>تصدير ملف Word</span>
                  </button>

                  {/* Print Directly Button */}
                  <button
                    onClick={() => {
                      const activeStudent = students.find(s => s.id === invitationPreviewStudentId);
                      handlePrintInvitations(activeStudent || null);
                    }}
                    className="bg-stone-900 hover:bg-black text-white p-4 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-stone-950/10"
                  >
                    <Printer className="w-5 h-5" />
                    <span>طباعة ورقية</span>
                  </button>

                </div>

                {/* Bulk action buttons */}
                <div className="mt-5 bg-stone-50 p-4 rounded-2xl border border-stone-150 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-center sm:text-right">
                    <h5 className="font-bold text-xs text-stone-700">طباعة وتصدير جماعي متكامل</h5>
                    <p className="text-[10px] text-stone-500 mt-0.5">تصفية وطباعة كروت دعوة الطلاب المحددون بالجدول دفعة واحدة بورقة منفصلة لكل طالب</p>
                  </div>
                  <button
                    onClick={() => handlePrintInvitations(null)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-900 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة جميع الكروت ({filteredStudents.length})</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Right Column: Invitation Settings Customization Controls (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6 text-right">
            <div className="bg-white rounded-[2.5rem] p-7 border border-stone-150 shadow-lg flex flex-col gap-5">
              <div className="flex items-center gap-2.5 border-b border-stone-100 pb-4">
                <div className="w-9 h-9 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center shadow-inner">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-800 text-sm">لوحة تخصيص كرت الدعوة</h3>
                  <p className="text-stone-400 text-[10px] font-semibold">تحكم بجميع أبعاد وتنسيقات النصوص والألوان وإطارات الدعوة</p>
                </div>
              </div>

              {/* SECTION 1: TITLE & TYPOGRAPHY */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Type className="w-4 h-4 text-emerald-600" />
                  <span>عنوان كرت الدعوة العلوي</span>
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-black text-stone-500 mb-1">نص العنوان</label>
                    <input 
                      type="text" 
                      value={invitationSettings.titleText}
                      onChange={(e) => setInvitationSettings(prev => ({ ...prev, titleText: e.target.value }))}
                      className="w-full text-xs font-bold px-3 py-2 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="بطاقة دعوة حضور حفل تفوق..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">حجم الخط</label>
                      <input 
                        type="number" 
                        value={invitationSettings.titleFontSize}
                        onChange={(e) => setInvitationSettings(prev => ({ ...prev, titleFontSize: parseInt(e.target.value) }))}
                        className="w-full text-xs font-mono font-bold px-3 py-1.5 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">لون الخط</label>
                      <div className="flex gap-1.5">
                        <input 
                          type="color" 
                          value={invitationSettings.titleColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, titleColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-stone-200 p-0 overflow-hidden shrink-0"
                        />
                        <input 
                          type="text" 
                          value={invitationSettings.titleColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, titleColor: e.target.value }))}
                          className="w-full text-[10px] font-mono font-black px-2 py-1 bg-white border border-stone-200 rounded-xl text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-stone-500 mb-1">نوع خط العنوان</label>
                    <select
                      value={invitationSettings.titleFontFamily}
                      onChange={(e) => setInvitationSettings(prev => ({ ...prev, titleFontFamily: e.target.value }))}
                      className="w-full text-xs font-bold px-3 py-2 bg-white border border-stone-200 rounded-xl cursor-pointer"
                    >
                      {ARABIC_FONTS.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: FORMULA TEXT */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>صيغة الدعوة والترحيب</span>
                </h4>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-black text-stone-500">نص صيغة الدعوة</label>
                      <span className="text-[8px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black">المتغيرات: name, grade, school</span>
                    </div>
                    <textarea 
                      value={invitationSettings.formulaText}
                      onChange={(e) => setInvitationSettings(prev => ({ ...prev, formulaText: e.target.value }))}
                      rows={4}
                      className="w-full text-xs font-bold px-3 py-2 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      placeholder="تتشرف الجمعية بدعوة الطالب المتفوق..."
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-black text-stone-500 mb-1">حجم الخط</label>
                      <input 
                        type="number" 
                        value={invitationSettings.formulaFontSize}
                        onChange={(e) => setInvitationSettings(prev => ({ ...prev, formulaFontSize: parseInt(e.target.value) }))}
                        className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-white border border-stone-200 rounded-xl text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-stone-500 mb-1">تباعد الأسطر</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={invitationSettings.formulaLineHeight}
                        onChange={(e) => setInvitationSettings(prev => ({ ...prev, formulaLineHeight: parseFloat(e.target.value) }))}
                        className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-white border border-stone-200 rounded-xl text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-stone-500 mb-1">لون الخط</label>
                      <div className="flex gap-1">
                        <input 
                          type="color" 
                          value={invitationSettings.formulaColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, formulaColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-stone-200 p-0 overflow-hidden shrink-0"
                        />
                        <input 
                          type="text" 
                          value={invitationSettings.formulaColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, formulaColor: e.target.value }))}
                          className="w-full text-[9px] font-mono font-black px-1 py-1 bg-white border border-stone-200 rounded-xl text-center"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: DATE & LOCATION */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>الموعد ومكان الاحتفال</span>
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-black text-stone-500 mb-1">الموعد والتاريخ</label>
                    <input 
                      type="text" 
                      value={invitationSettings.dateTimeText}
                      onChange={(e) => setInvitationSettings(prev => ({ ...prev, dateTimeText: e.target.value }))}
                      className="w-full text-xs font-bold px-3 py-2 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">حجم خط الموعد</label>
                      <input 
                        type="number" 
                        value={invitationSettings.dateTimeFontSize}
                        onChange={(e) => setInvitationSettings(prev => ({ ...prev, dateTimeFontSize: parseInt(e.target.value) }))}
                        className="w-full text-xs font-mono font-bold px-3 py-1.5 bg-white border border-stone-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">لون الموعد</label>
                      <div className="flex gap-1.5">
                        <input 
                          type="color" 
                          value={invitationSettings.dateTimeColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, dateTimeColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-stone-200 p-0 overflow-hidden shrink-0"
                        />
                        <input 
                          type="text" 
                          value={invitationSettings.dateTimeColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, dateTimeColor: e.target.value }))}
                          className="w-full text-[10px] font-mono font-black px-2 py-1 bg-white border border-stone-200 rounded-xl text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-stone-500 mb-1">المكان والقاعة</label>
                    <input 
                      type="text" 
                      value={invitationSettings.locationText}
                      onChange={(e) => setInvitationSettings(prev => ({ ...prev, locationText: e.target.value }))}
                      className="w-full text-xs font-bold px-3 py-2 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">حجم خط المكان</label>
                      <input 
                        type="number" 
                        value={invitationSettings.locationFontSize}
                        onChange={(e) => setInvitationSettings(prev => ({ ...prev, locationFontSize: parseInt(e.target.value) }))}
                        className="w-full text-xs font-mono font-bold px-3 py-1.5 bg-white border border-stone-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">لون المكان</label>
                      <div className="flex gap-1.5">
                        <input 
                          type="color" 
                          value={invitationSettings.locationColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, locationColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-stone-200 p-0 overflow-hidden shrink-0"
                        />
                        <input 
                          type="text" 
                          value={invitationSettings.locationColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, locationColor: e.target.value }))}
                          className="w-full text-[10px] font-mono font-black px-2 py-1 bg-white border border-stone-200 rounded-xl text-center"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: COLORS & BORDERS */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Palette className="w-4 h-4 text-emerald-600" />
                  <span>ألوان وإطار كرت الدعوة</span>
                </h4>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">لون الإطار</label>
                      <div className="flex gap-1.5">
                        <input 
                          type="color" 
                          value={invitationSettings.borderColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, borderColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-stone-200 p-0 overflow-hidden shrink-0"
                        />
                        <input 
                          type="text" 
                          value={invitationSettings.borderColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, borderColor: e.target.value }))}
                          className="w-full text-[10px] font-mono font-black px-1.5 py-1 bg-white border border-stone-200 rounded-xl text-center"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">لون الخلفية</label>
                      <div className="flex gap-1.5">
                        <input 
                          type="color" 
                          value={invitationSettings.backgroundColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-stone-200 p-0 overflow-hidden shrink-0"
                        />
                        <input 
                          type="text" 
                          value={invitationSettings.backgroundColor}
                          onChange={(e) => setInvitationSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="w-full text-[10px] font-mono font-black px-1.5 py-1 bg-white border border-stone-200 rounded-xl text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">نمط الإطار الرئيسي</label>
                      <select
                        value={invitationSettings.borderStyle}
                        onChange={(e) => setInvitationSettings(prev => ({ ...prev, borderStyle: e.target.value }))}
                        className="w-full text-xs font-bold px-3 py-2 bg-white border border-stone-200 rounded-xl cursor-pointer"
                      >
                        <option value="islamic">🕌 نمط إسلامي مزخرف</option>
                        <option value="classic">🏛️ نمط كلاسيكي ملكي</option>
                        <option value="modern">📱 نمط حديدي عصري</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-stone-500 mb-1">عرض الإطار (بكسل)</label>
                      <input 
                        type="number" 
                        value={invitationSettings.borderWidth}
                        onChange={(e) => setInvitationSettings(prev => ({ ...prev, borderWidth: parseInt(e.target.value) }))}
                        className="w-full text-xs font-mono font-bold px-3 py-1.5 bg-white border border-stone-200 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 5: LOGOS */}
              <div className="bg-stone-50/50 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                <h4 className="font-black text-stone-800 text-xs flex items-center gap-1.5 pb-2 border-b border-stone-100">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>الشعارات واللوجو</span>
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-stone-600 mb-1">حجم الشعار الأيمن</label>
                    <input 
                      type="number" 
                      value={invitationSettings.rightLogoSize}
                      onChange={(e) => setInvitationSettings(prev => ({ ...prev, rightLogoSize: parseInt(e.target.value) }))}
                      className="w-full text-xs font-mono font-bold px-3 py-1.5 bg-white border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-stone-600 mb-1">حجم الشعار الأيسر</label>
                    <input 
                      type="number" 
                      value={invitationSettings.leftLogoSize}
                      onChange={(e) => setInvitationSettings(prev => ({ ...prev, leftLogoSize: parseInt(e.target.value) }))}
                      className="w-full text-xs font-mono font-bold px-3 py-1.5 bg-white border border-stone-200 rounded-xl"
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* MODAL 1: ADD / EDIT SCHOOL */}
      <AnimatePresence>
        {showSchoolModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl border border-stone-100 text-right"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-stone-900">
                  {editingSchool ? 'تعديل بيانات المدرسة' : 'إضافة مدرسة جديدة'}
                </h3>
                <button
                  onClick={() => setShowSchoolModal(false)}
                  className="p-1.5 hover:bg-stone-100 text-stone-400 hover:text-stone-700 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSchool} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-2">اسم المدرسة الكـامل *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثل: مدرسة عمر بن الخطاب النموذجية بنين"
                    value={schoolForm.name}
                    onChange={(e) => setSchoolForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-2">اسم المشرف أو المسؤول عن المدرسة</label>
                  <input
                    type="text"
                    placeholder="الاسم الكامل للمشرف"
                    value={schoolForm.supervisorName}
                    onChange={(e) => setSchoolForm(prev => ({ ...prev, supervisorName: e.target.value }))}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-2">رقم هاتف المشرف المسؤول</label>
                  <input
                    type="tel"
                    placeholder="رقم الهاتف (الواتساب)"
                    value={schoolForm.supervisorPhone}
                    onChange={(e) => setSchoolForm(prev => ({ ...prev, supervisorPhone: e.target.value }))}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white text-left"
                    dir="ltr"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    disabled={quotaExceeded}
                    className="flex-grow bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-bold text-sm transition-all shadow-md shadow-emerald-600/10"
                  >
                    <span>{editingSchool ? 'حفظ التعديلات' : 'إضافة المدرسة للمشروع'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSchoolModal(false)}
                    className="px-6 bg-stone-100 hover:bg-stone-200 text-stone-500 py-3.5 rounded-2xl font-bold text-sm transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: ADD / EDIT STUDENT */}
      <AnimatePresence>
        {showStudentModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-xl shadow-2xl border border-stone-100 text-right"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-stone-900">
                  {editingStudent ? 'تعديل بيانات الطالب المتفوق' : 'إضافة طالب متفوق جديد'}
                </h3>
                <button
                  onClick={() => setShowStudentModal(false)}
                  className="p-1.5 hover:bg-stone-100 text-stone-400 hover:text-stone-700 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveStudent} className="space-y-4">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-2">اسم الطالب الكـامل *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثل: أحمد محمود العبدالله"
                      value={studentForm.name}
                      onChange={(e) => setStudentForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-2">رقم هاتف الطالب / ولي الأمر</label>
                    <input
                      type="tel"
                      placeholder="مثل: 01021761633"
                      value={studentForm.phone}
                      onChange={(e) => setStudentForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white text-left"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-2">المجموع الدرجات</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="مثل: 278.5"
                      value={studentForm.totalMarks}
                      onChange={(e) => setStudentForm(prev => ({ ...prev, totalMarks: e.target.value }))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-2">النسبة المئوية (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="مثل: 99.4"
                      value={studentForm.percentage}
                      onChange={(e) => setStudentForm(prev => ({ ...prev, percentage: e.target.value }))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-2">الصف الدراسي *</label>
                    <select
                      value={ALL_GRADES_LIST.includes(studentForm.grade) ? studentForm.grade : (studentForm.grade ? 'custom' : '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setStudentForm(prev => ({ ...prev, grade: '' }));
                        } else {
                          setStudentForm(prev => ({ ...prev, grade: val }));
                        }
                      }}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white cursor-pointer mb-2"
                    >
                      <option value="">-- اختر الصف الدراسي --</option>
                      {ALL_GRADES_LIST.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="custom">✍️ كتابة صف مخصص...</option>
                    </select>

                    {(!ALL_GRADES_LIST.includes(studentForm.grade) || studentForm.grade === '') && (
                      <input
                        type="text"
                        placeholder="اكتب الصف المخصص هنا (مثال: حضانة ثانية)"
                        value={studentForm.grade}
                        onChange={(e) => setStudentForm(prev => ({ ...prev, grade: e.target.value }))}
                        className="w-full px-4 py-3 bg-amber-50/40 border border-amber-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white animate-fade-in"
                      />
                    )}
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-xs font-bold text-stone-600 mb-2">المدرسة التابع لها الطالب *</label>
                  <input
                    type="text"
                    required
                    placeholder="اكتب اسم المدرسة مباشرة هنا..."
                    value={studentForm.schoolName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStudentForm(prev => ({ 
                        ...prev, 
                        schoolName: val,
                        schoolId: ''
                      }));
                      setShowSchoolSuggestions(true);
                    }}
                    onFocus={() => setShowSchoolSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSchoolSuggestions(false), 250)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                  />
                  {showSchoolSuggestions && studentForm.schoolName.trim() && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-stone-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                      {(() => {
                        const filtered = schools.filter(s => 
                          s.name.toLowerCase().includes(studentForm.schoolName.toLowerCase())
                        );
                        if (filtered.length > 0) {
                          return filtered.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onMouseDown={() => {
                                setStudentForm(prev => ({ 
                                  ...prev, 
                                  schoolName: s.name, 
                                  schoolId: s.id 
                                }));
                                setShowSchoolSuggestions(false);
                              }}
                              className="w-full text-right px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 transition-all border-b border-stone-50 last:border-b-0 flex items-center justify-between"
                            >
                              <span>{s.name}</span>
                              <span className="text-[10px] bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full font-semibold">مدرسة مسجلة</span>
                            </button>
                          ));
                        } else {
                          return (
                            <div className="px-4 py-3 text-xs text-amber-600 font-bold bg-amber-50/50 flex items-center justify-between">
                              <span>سيتم إضافة "{studentForm.schoolName}" كمدرسة جديدة تلقائياً عند حفظ الطالب</span>
                              <Plus className="w-3.5 h-3.5" />
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-2">المرحلة التعليمية *</label>
                    <select
                      value={studentForm.stage}
                      onChange={(e) => setStudentForm(prev => ({ ...prev, stage: e.target.value }))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white cursor-pointer"
                    >
                      {stages.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-2">العام الدراسي للملف *</label>
                    <select
                      value={studentForm.academicYear}
                      onChange={(e) => setStudentForm(prev => ({ ...prev, academicYear: e.target.value }))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white cursor-pointer"
                    >
                      {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    disabled={quotaExceeded}
                    className="flex-grow bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-bold text-sm transition-all shadow-md shadow-emerald-600/10"
                  >
                    <span>{editingStudent ? 'حفظ تعديلات الطالب' : 'تسجيل الطالب'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStudentModal(false)}
                    className="px-6 bg-stone-100 hover:bg-stone-200 text-stone-500 py-3.5 rounded-2xl font-bold text-sm transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.title}
        message={deleteConfirm.message}
        onConfirm={async () => {
          await deleteConfirm.onConfirm();
          setDeleteConfirm(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}
      />

    </div>
  );
}
