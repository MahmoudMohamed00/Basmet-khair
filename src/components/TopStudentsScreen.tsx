// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, Plus, Search, Trash2, Edit3, Download, Printer, 
  X, Save, RefreshCw, Palette, Check, Type, FileSpreadsheet, 
  School, Phone, User, Award, Sliders, Settings, Upload, CheckCircle2, AlertCircle,
  Calendar, Layers
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { uploadFile } from './BrandingUpload';

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
  const [activeTab, setActiveTab] = useState<'management' | 'designer'>('management');
  
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

  // Certificate Design Settings (Live Customization)
  const [certificateSettings, setCertificateSettings] = useState({
    titleText: 'شهادة شكر وتقدير',
    titleFontSize: 44, // in pt
    titleColor: '#b45309', // gold-700
    
    // Placeholder-supported template formula
    formulaText: 'تتقدم جمعية بصمة خير بخالص الشكر والتقدير للطالب المتميز / {{name}} المقيد بالصف {{grade}} بمدرسة {{school}} لحصوله على مجموع {{totalMarks}} بنسبة {{percentage}}% في امتحانات أوائل الطلبة، متمنين له دوام التوفيق والنجاح والتميز دائماً في مسيرته الدراسية.',
    formulaFontSize: 21,
    formulaColor: '#1c1917', // stone-900
    formulaLineHeight: 2.1,

    nameFontSize: 32,
    nameColor: '#047857', // emerald-700
    nameBold: true,

    borderColor: '#d97706', // gold-600
    borderStyle: 'islamic', // 'islamic' | 'classic' | 'modern'
    borderWidth: 12, // in px

    backgroundColor: '#fffdf9', // warm cream
    textColor: '#1c1917',

    leftLogoUrl: DEFAULT_MINISTRY_LOGO,
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
    signatureColor: '#44403c'
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
    const newYear = window.prompt('أدخل العام الدراسي الجديد (مثال: 2026/2027):');
    if (newYear && newYear.trim()) {
      const formatted = newYear.trim();
      if (years.includes(formatted)) {
        triggerError('هذا العام الدراسي مضاف بالفعل');
        return;
      }
      const updated = [formatted, ...years];
      setYears(updated);
      localStorage.setItem('top_students_years', JSON.stringify(updated));
      setSelectedYear(formatted);
      triggerSuccess(`تم إضافة العام الدراسي ${formatted} وتفعيله بنجاح`);
    }
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
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Reem+Kufi:wght@400;700&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap');
            
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
              font-family: 'Reem Kufi', 'Amiri', serif;
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
              font-family: 'Amiri', serif;
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
              font-family: 'Cairo', sans-serif;
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
              font-family: 'Cairo', sans-serif;
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
              font-family: 'Amiri', serif;
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
                      <span class="assoc-title">جمعية بصمة خير</span>
                    </div>

                    <div class="title-decor">
                      <h1 class="cert-main-title">${certificateSettings.titleText}</h1>
                      <div class="decorative-separator"></div>
                    </div>

                    <div class="logo-box left">
                      <img src="${certificateSettings.leftLogoUrl}" alt="Ministry Logo" referrerPolicy="no-referrer" />
                      <span class="ministry-title">وزارة التربية والتعليم<br/>والتعليم الفني</span>
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
                        <div className="truncate max-w-[80%]">
                          <p className={`truncate font-extrabold ${selectedSchoolId === s.id ? 'text-emerald-900' : 'text-stone-800'}`}>{s.name}</p>
                          {s.supervisorName && (
                            <p className="text-[10px] text-stone-400 font-semibold truncate mt-0.5">مسؤول: {s.supervisorName}</p>
                          )}
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
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                          <span>{s.name}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-xs">{s.phone || '-'}</td>
                      <td className="p-4 text-center">{s.totalMarks || '-'}</td>
                      <td className="p-4 text-center text-emerald-600 font-extrabold">
                        {s.percentage ? `${s.percentage}%` : '-'}
                      </td>
                      <td className="p-4">
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-black">
                          {s.grade || 'غير محدد'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="bg-amber-50 text-amber-800 px-2.5 py-1 rounded-lg text-xs font-black">
                          {s.stage || 'المرحلة الابتدائية'}
                        </span>
                      </td>
                      <td className="p-4 text-stone-500 font-semibold">{s.schoolName}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handlePrintCertificates(s)}
                            className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg transition-all"
                            title="طباعة شهادة التقدير للطالب"
                          >
                            <Award className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenStudentModal(s)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="تعديل بيانات الطالب"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(s.id, s.name)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
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
      )}

      {/* TAB 2: CERTIFICATE DESIGNER */}
      {activeTab === 'designer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left panel: Live Design Adjustments */}
          <div className="lg:col-span-5 flex flex-col gap-6 bg-white rounded-[2rem] p-6 border border-emerald-50 shadow-sm">
            <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-700" />
              <h3 className="font-extrabold text-emerald-900 text-md">أدوات ضبط ومظهر الشهادة</h3>
            </div>

            {/* Section 1: Template and Text formula */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-600 mb-2">عنوان الشهادة الرئيسي</label>
                <input
                  type="text"
                  value={certificateSettings.titleText}
                  onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleText: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-100 rounded-xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-2">صيغة التهنئة (Template Formula)</label>
                <textarea
                  rows={4}
                  value={certificateSettings.formulaText}
                  onChange={(e) => setCertificateSettings(prev => ({ ...prev, formulaText: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-100 rounded-xl text-stone-800 font-bold text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="ادخل نص التهنئة، استخدم المتغيرات: {{name}} للطلب، {{school}} للمدرسة، {{grade}} للصف، {{percentage}} للنسبة"
                />
                <p className="text-[10px] text-stone-400 font-bold mt-1 leading-relaxed">
                  * استخدم الحقول الآتية لتعبئتها تلقائياً لكل طالب: <br/>
                  <code className="text-emerald-700">{`{{name}}`}</code> (الاسم)، 
                  <code className="text-emerald-700">{` {{school}}`}</code> (المدرسة)، 
                  <code className="text-emerald-700">{` {{grade}}`}</code> (الصف)، 
                  <code className="text-emerald-700">{` {{percentage}}`}</code> (النسبة)
                </p>
              </div>
            </div>

            {/* Section 2: Font Sizes & Styles */}
            <div className="border-t border-stone-100 pt-4">
              <h4 className="font-extrabold text-stone-800 text-sm flex items-center gap-2 mb-3">
                <Type className="w-4 h-4 text-emerald-600" />
                <span>حجم خط الكلمات والنصوص (خطوة بخطوة)</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">حجم خط العنوان الرئيسي</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={18}
                      max={75}
                      value={certificateSettings.titleFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded shrink-0">{certificateSettings.titleFontSize}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">حجم خط اسم الطالب</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={14}
                      max={60}
                      value={certificateSettings.nameFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, nameFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded shrink-0">{certificateSettings.nameFontSize}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">حجم خط نص التهنئة</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={11}
                      max={45}
                      value={certificateSettings.formulaFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, formulaFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded shrink-0">{certificateSettings.formulaFontSize}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">حجم خط التوقيعات</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={35}
                      value={certificateSettings.signatureFontSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, signatureFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded shrink-0">{certificateSettings.signatureFontSize}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">حجم الشعار الأيمن</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={40}
                      max={220}
                      value={certificateSettings.rightLogoSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, rightLogoSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded shrink-0">{certificateSettings.rightLogoSize}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">حجم الشعار الأيسر</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={40}
                      max={220}
                      value={certificateSettings.leftLogoSize}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, leftLogoSize: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded shrink-0">{certificateSettings.leftLogoSize}px</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Color Schemes & Borders */}
            <div className="border-t border-stone-100 pt-4">
              <h4 className="font-extrabold text-stone-800 text-sm flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-emerald-600" />
                <span>الألوان ونوع الإطارات</span>
              </h4>
              
              <div className="space-y-3.5">
                {/* Borders selectors */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5">نمط إطار الشهادة</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'islamic', name: 'إسلامي مذهب' },
                      { id: 'classic', name: 'ملكي كلاسيكي' },
                      { id: 'modern', name: 'هندسي عصري' }
                    ].map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setCertificateSettings(prev => ({ ...prev, borderStyle: b.id }))}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${certificateSettings.borderStyle === b.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-stone-50 text-stone-600 hover:bg-stone-100'}`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preset Themes */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1.5 font-sans">سمات ألوان سريعة (Themes)</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'ذهبي فاخر', border: '#d97706', title: '#b45309', name: '#047857' },
                      { label: 'أخضر إسلامي', border: '#059669', title: '#064e3b', name: '#b45309' },
                      { label: 'أزرق ملكي', border: '#2563eb', title: '#1e3a8a', name: '#047857' },
                      { label: 'قرمزي كلاسيك', border: '#be123c', title: '#881337', name: '#047857' }
                    ].map((th, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCertificateSettings(prev => ({
                          ...prev,
                          borderColor: th.border,
                          titleColor: th.title,
                          nameColor: th.name
                        }))}
                        className="text-[10px] font-bold bg-stone-50 hover:bg-stone-100 px-2.5 py-1.5 rounded-lg border border-stone-150 transition-all text-stone-600 flex items-center gap-1.5"
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: th.border }}></span>
                        <span>{th.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Specific Colors picker */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">لون الإطار</label>
                    <input
                      type="color"
                      value={certificateSettings.borderColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, borderColor: e.target.value }))}
                      className="w-full h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">لون العنوان</label>
                    <input
                      type="color"
                      value={certificateSettings.titleColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleColor: e.target.value }))}
                      className="w-full h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">لون الاسم</label>
                    <input
                      type="color"
                      value={certificateSettings.nameColor}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, nameColor: e.target.value }))}
                      className="w-full h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Spacing, Margins & Logo Positions */}
            <div className="border-t border-stone-100 pt-4">
              <h4 className="font-extrabold text-stone-800 text-sm flex items-center gap-2 mb-3">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span>التحكم بالهوامش والمسافات ومواقع العناصر (بالبكسل)</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">الهامش العلوي للشهادة</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={certificateSettings.paddingTop}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, paddingTop: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.paddingTop}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">الهامش السفلي للشهادة</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={certificateSettings.paddingBottom}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, paddingBottom: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.paddingBottom}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">الهامش الأيمن للشهادة</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={150}
                      value={certificateSettings.paddingRight}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, paddingRight: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.paddingRight}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">الهامش الأيسر للشهادة</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={150}
                      value={certificateSettings.paddingLeft}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, paddingLeft: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.paddingLeft}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">تباعد الهيدر والشعارات</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={certificateSettings.headerMarginBottom}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, headerMarginBottom: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.headerMarginBottom}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">تباعد نص التهنئة بالوسط</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={certificateSettings.bodyMarginBottom}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, bodyMarginBottom: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.bodyMarginBottom}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">إزاحة رأسية للشعارات</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={certificateSettings.logosYOffset}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, logosYOffset: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.logosYOffset}px</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">إزاحة رأسية للعنوان الرئيسي</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={certificateSettings.titleYOffset}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, titleYOffset: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.titleYOffset}px</span>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">إزاحة رأسية للتوقيعات في الأسفل</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={certificateSettings.signaturesYOffset}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, signaturesYOffset: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{certificateSettings.signaturesYOffset}px</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Modify Logo image URLs */}
            <div className="border-t border-stone-100 pt-4">
              <h4 className="font-extrabold text-stone-800 text-sm flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-emerald-600" />
                <span>تغيير صور اللوجو والشعارات (روابط مباشرة أو رفع صور)</span>
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">شعار الجمعية الأيمن</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={certificateSettings.rightLogoUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCertificateSettings(prev => ({ ...prev, rightLogoUrl: val }));
                        localStorage.setItem('app_logo_url', val);
                      }}
                      placeholder="رابط صورة الشعار الأيمن..."
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-150 rounded-xl text-stone-800 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => rightLogoInputRef.current?.click()}
                      disabled={isUploadingRightLogo}
                      className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                    >
                      {isUploadingRightLogo ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>رفع لوجو</span>
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
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">شعار الوزارة الأيسر</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={certificateSettings.leftLogoUrl}
                      onChange={(e) => setCertificateSettings(prev => ({ ...prev, leftLogoUrl: e.target.value }))}
                      placeholder="رابط صورة الشعار الأيسر..."
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-150 rounded-xl text-stone-800 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => leftLogoInputRef.current?.click()}
                      disabled={isUploadingLeftLogo}
                      className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                    >
                      {isUploadingLeftLogo ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>رفع لوجو</span>
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

            {/* Section 4: Bottom Signatures */}
            <div className="border-t border-stone-100 pt-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-extrabold text-stone-800 text-sm">التوقيعات في الأسفل</h4>
                <button
                  type="button"
                  onClick={() => setCertificateSettings(prev => ({
                    ...prev,
                    signatures: [...prev.signatures, { title: 'توقيع جديد', name: 'الاسم هنا' }]
                  }))}
                  className="text-xs text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-all"
                >
                  إضافة خانة توقيع
                </button>
              </div>

              <div className="space-y-3 max-h-[160px] overflow-y-auto custom-scrollbar">
                {certificateSettings.signatures.map((sig, sIdx) => (
                  <div key={sIdx} className="flex gap-2 items-center bg-stone-50 p-2.5 rounded-xl border border-stone-100 relative group">
                    <input
                      type="text"
                      placeholder="صفة التوقيع (مثل: رئيس الجمعية)"
                      value={sig.title}
                      onChange={(e) => {
                        const updated = [...certificateSettings.signatures];
                        updated[sIdx].title = e.target.value;
                        setCertificateSettings(prev => ({ ...prev, signatures: updated }));
                      }}
                      className="w-1/2 px-2 py-1.5 bg-white border border-stone-150 rounded-lg text-xs font-bold"
                    />
                    <input
                      type="text"
                      placeholder="الاسم الكامل للموقع"
                      value={sig.name}
                      onChange={(e) => {
                        const updated = [...certificateSettings.signatures];
                        updated[sIdx].name = e.target.value;
                        setCertificateSettings(prev => ({ ...prev, signatures: updated }));
                      }}
                      className="w-1/2 px-2 py-1.5 bg-white border border-stone-150 rounded-lg text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = certificateSettings.signatures.filter((_, i) => i !== sIdx);
                        setCertificateSettings(prev => ({ ...prev, signatures: updated }));
                      }}
                      className="text-rose-500 hover:bg-rose-50 p-1 rounded-lg shrink-0"
                      title="حذف خانة التوقيع"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right panel: Realtime Certificate Preview Screen */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-white rounded-[2rem] p-6 border border-emerald-50 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-extrabold text-emerald-900 text-md">معاينة مباشرة للشهادة</h3>
                  <p className="text-xs text-stone-400 font-semibold mt-0.5">يعرض هذا المربع نموذج افتراضي لكيفية طباعة الشهادة للطالب الأوّل في الترتيب</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handlePrintCertificates(null)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة جماعية لـ ({filteredStudents.length} شهادة)</span>
                  </button>
                </div>
              </div>

              {/* Landscape Ratio Container */}
              <div className="border border-stone-200 rounded-2xl overflow-hidden bg-stone-100 p-4 flex justify-center items-center">
                
                {/* Visual Representation of the Certificate */}
                <div 
                  className="w-full relative shadow-lg rounded-md origin-center text-right transition-all flex flex-col justify-between animate-fade-in"
                  style={{
                    aspectRatio: '1.414 / 1', // A4 Landscape ratio
                    padding: `${(certificateSettings.paddingTop ?? 35) / 1.5}px ${(certificateSettings.paddingRight ?? 50) / 1.5}px ${(certificateSettings.paddingBottom ?? 35) / 1.5}px ${(certificateSettings.paddingLeft ?? 50) / 1.5}px`,
                    backgroundColor: certificateSettings.backgroundColor,
                    border: `${certificateSettings.borderWidth / 1.5}px ${certificateSettings.borderStyle === 'islamic' ? 'solid' : certificateSettings.borderStyle === 'classic' ? 'double' : 'solid'} ${certificateSettings.borderColor}`,
                    outline: certificateSettings.borderStyle === 'islamic' ? `2px double ${certificateSettings.borderColor}` : 'none',
                    outlineOffset: certificateSettings.borderStyle === 'islamic' ? '-8px' : '0px'
                  }}
                >
                  
                  {/* Ornaments */}
                  {certificateSettings.borderStyle === 'islamic' && (
                    <>
                      <div className="absolute top-1 right-1 w-4 h-4 border-2 border-amber-600 border-b-0 border-l-0"></div>
                      <div className="absolute top-1 left-1 w-4 h-4 border-2 border-amber-600 border-b-0 border-r-0"></div>
                      <div className="absolute bottom-1 right-1 w-4 h-4 border-2 border-amber-600 border-t-0 border-l-0"></div>
                      <div className="absolute bottom-1 left-1 w-4 h-4 border-2 border-amber-600 border-t-0 border-r-0"></div>
                    </>
                  )}

                  {/* Top Logos & Title header */}
                  <div 
                    className="flex justify-between items-center w-full"
                    style={{
                      marginBottom: `${(certificateSettings.headerMarginBottom ?? 15) / 1.5}px`,
                      transform: `translateY(${(certificateSettings.logosYOffset ?? 0) / 1.5}px)`
                    }}
                  >
                    {/* Right Logo */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      {certificateSettings.rightLogoUrl ? (
                        <img 
                          src={certificateSettings.rightLogoUrl} 
                          alt="Association Logo" 
                          style={{ height: `${certificateSettings.rightLogoSize / 1.5}px` }} 
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <span className="text-[9px] font-black text-emerald-900 leading-tight">جمعية بصمة خير</span>
                    </div>

                    {/* Centered Title */}
                    <div 
                      className="text-center flex-grow px-2 flex flex-col items-center"
                      style={{
                        transform: `translateY(${(certificateSettings.titleYOffset ?? 0) / 1.5}px)`
                      }}
                    >
                      <h2 
                        className="font-bold leading-tight select-none"
                        style={{ 
                          fontFamily: "'Reem Kufi', serif",
                          fontSize: `${certificateSettings.titleFontSize / 1.5}px`,
                          color: certificateSettings.titleColor 
                        }}
                      >
                        {certificateSettings.titleText}
                      </h2>
                      <div className="w-24 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent mt-1"></div>
                    </div>

                    {/* Left Logo */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      {certificateSettings.leftLogoUrl ? (
                        <img 
                          src={certificateSettings.leftLogoUrl} 
                          alt="Ministry Logo" 
                          style={{ height: `${certificateSettings.leftLogoSize / 1.5}px` }} 
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <span className="text-[7px] text-stone-500 font-extrabold text-center leading-tight">وزارة التربية والتعليم<br/>والتعليم الفني</span>
                    </div>
                  </div>

                  {/* Body Formula Preview with active student (or a sample placeholder student) */}
                  <div 
                    className="flex-grow flex items-center justify-center px-4 text-center"
                    style={{
                      marginBottom: `${(certificateSettings.bodyMarginBottom ?? 25) / 1.5}px`
                    }}
                  >
                    <p 
                      className="text-stone-700 leading-relaxed font-semibold max-w-[96%] text-center"
                      style={{
                        fontFamily: "'Amiri', serif",
                        fontSize: `${certificateSettings.formulaFontSize / 1.3}px`,
                        color: certificateSettings.formulaColor
                      }}
                    >
                      {/* Compile template text with sample student */}
                      {(() => {
                        const sampleStudent = filteredStudents[0] || {
                          name: 'أحمد محمود العبدالله',
                          schoolName: 'مدرسة عمر بن الخطاب النموذجية',
                          grade: 'الثالث الإعدادي',
                          totalMarks: 278.5,
                          percentage: 99.4
                        };
                        const text = compileFormula(certificateSettings.formulaText, sampleStudent);
                        return text.replace(sampleStudent.name, `###`);
                      })().split('###').map((part, pIdx, arr) => (
                        <React.Fragment key={pIdx}>
                          {part}
                          {pIdx < arr.length - 1 && (
                            <span 
                              className="mx-1 border-b border-dashed border-emerald-600 font-black inline-block"
                              style={{ 
                                fontSize: `${certificateSettings.nameFontSize / 1.3}px`, 
                                color: certificateSettings.nameColor 
                              }}
                            >
                              {filteredStudents[0]?.name || 'أحمد محمود العبدالله'}
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </p>
                  </div>

                  {/* Bottom Row Signatures preview */}
                  <div 
                    className="flex justify-around items-end w-full border-t border-dashed border-stone-200 pt-2.5"
                    style={{
                      transform: `translateY(${(certificateSettings.signaturesYOffset ?? 0) / 1.5}px)`
                    }}
                  >
                    {certificateSettings.signatures.map((sig, sigIdx) => (
                      <div key={sigIdx} className="text-center w-24">
                        <p 
                          className="font-black text-stone-500 mb-4 truncate text-center"
                          style={{ fontSize: `${certificateSettings.signatureFontSize / 1.3}px`, color: certificateSettings.signatureColor }}
                        >
                          {sig.title}
                        </p>
                        <div className="w-16 h-[1px] bg-stone-300 mx-auto mb-1"></div>
                        <p className="text-[10px] font-black text-stone-900 truncate">{sig.name}</p>
                      </div>
                    ))}
                  </div>

                </div>

              </div>

              {/* Single student specific selection to print single certificate */}
              <div className="mt-6 border-t border-stone-100 pt-4">
                <h4 className="font-extrabold text-stone-800 text-sm mb-3">طباعة شهادة تقدير فردية لطالب معين</h4>
                <div className="flex gap-2">
                  <select 
                    id="single-print-select"
                    className="flex-grow px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm"
                  >
                    {filteredStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - مدرسة {s.schoolName}</option>
                    ))}
                    {filteredStudents.length === 0 && (
                      <option value="">لا يوجد طلاب متوفرون</option>
                    )}
                  </select>
                  <button
                    onClick={() => {
                      const selectEl = document.getElementById('single-print-select') as HTMLSelectElement;
                      const selectedVal = selectEl?.value;
                      if (!selectedVal) {
                        triggerError('يرجى اختيار طالب أولاً');
                        return;
                      }
                      const foundStudent = students.find(s => s.id === selectedVal);
                      if (foundStudent) {
                        handlePrintCertificates(foundStudent);
                      }
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-stone-900 px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-md shadow-amber-500/10 shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة شهادة الطالب المختار</span>
                  </button>
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
                    <label className="block text-xs font-bold text-stone-600 mb-2">الصف الدراسي</label>
                    <input
                      type="text"
                      placeholder="مثل: الثالث الإعدادي"
                      value={studentForm.grade}
                      onChange={(e) => setStudentForm(prev => ({ ...prev, grade: e.target.value }))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                    />
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

    </div>
  );
}
