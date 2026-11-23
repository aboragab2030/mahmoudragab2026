
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cairoTodayStr, addDaysStr, weekdayOf, arabicWeekday, upcomingDates, isDayFull, resolveBookingDate } from './dateUtils';
import { paymentOptionsFor, receiptError } from './paymentOptions';
import { canCancelPatientBooking } from './paymentsLog';
import { createRoot } from 'react-dom/client';
import { supabase } from "@/integrations/supabase/client";
import { invokeBackend } from '@/lib/backend';
import DOMPurify from 'dompurify';
import { useBaradaAuth, BaradaUser } from '@/hooks/useBaradaAuth';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { usePublicSiteData } from '@/hooks/usePublicSiteData';
import { mapDoctorRow, mapServiceRow, mapHeroRow, mapPartnerRow, applySettingsRow, settingsToRow } from './publicData';
import { downloadFullBackup, restoreFromFile } from './backupClient';
import { GoogleDrivePanel } from './GoogleDrivePanel';
import { runBookingTestMode } from './bookingTestMode';
import { EGYPT_CENTERS } from './egyptData';
import PatientStats from './PatientStats';
import ManagementIntelligence from './ManagementIntelligence';
import clinicFacilityImg from '../assets/images/clinic_facility_modern_1795257432732.jpg';
import { SERVICE_3D_ICONS, SERVICE_3D_ICON_LABELS, getService3DIcon } from './EyeCare3DIcons';
import { 
  Eye, Calendar, Phone, MapPin, Send, Menu, X, 
  Activity, Clock, UserPlus, Users, Settings, Trash2, 
  CheckCircle, AlertCircle, Lock, LogOut, UserCog, Shield, 
  MessageSquare, List, Search, ImageIcon, Plus, 
  Filter, Tag, Timer, Percent, LayoutTemplate, Facebook, 
  Home, Map, CheckSquare, ChevronRight, ChevronLeft, 
  BarChart2, FileText, Upload, Globe, Ticket,
  Zap, Droplets, Baby, Stethoscope, Ambulance,
  Microscope, Glasses, Syringe, Thermometer, Pill, Heart, Brain, Bone, ScanEye,
  Bell, Check, Mail, MessageCircle, CalendarDays, Printer, Edit2, RotateCcw,
  AlertTriangle, Smartphone, History, ArrowUpDown, Banknote, Tag as TagIcon,
  Flame, Megaphone, Database, Download, Save, Star, Scissors, CalendarRange,
  StickyNote, Hash, Users2, LayoutDashboard, Award, Target, Compass, User,
  Stethoscope as StethoscopeIcon, Award as AwardIcon, Timer as TimerIcon,
  Pencil, Trash, ShieldCheck, ZapIcon, HeartPulse, Hospital, Tablet, Activity as ActivityIcon,
  ClipboardList, Scan, UserRound, BriefcaseMedical, Bandage, Microscope as MicroscopeIcon,
  ArrowRight, GraduationCap, Briefcase, EyeOff, LayoutList, ShieldAlert, Scale, Info, Share2,
  TrendingUp, PieChart, Users as UsersIcon, Landmark, Building2, Handshake,
  CreditCard, Wallet, Copy, ArrowLeft, Youtube, Instagram, Video
} from 'lucide-react';

import { ContractingSelector, ContractingManager, ContractingCompany, CONTRACTING_CHANGED_EVENT } from './contracting';
import { PartnersSuccessHub } from './PartnersSuccessHub';
import { PaymentsTab } from './PaymentsTab';
import { InstapaySubmittedDialog, InstapayStatusLookup, submitInstapay, type InstapaySubmissionInput, type InstapayResult } from './InstapayFeature';
import { usePaymobEnabled, startPaymobCheckout, PaymobResultDialog, PaymobSettingsPanel } from './PaymobFeature';
import { StaffManagement } from './StaffManagement';
import { canAccessSection, firstAccessibleSection } from './permissions';
import OverviewDashboard from './OverviewDashboard';
import { createOperation, updateOperation, setOperationFields, deleteOperation, submitComplaint, deleteComplaint, markBookingReminderSent, mapOperationRow, mapComplaintRow, numericId, readLocalOperations, readLocalComplaints, importLocalRecords } from './clinicRecords';
import { OffersSection } from './OffersSection';
import { OffersManagement } from './OffersManagement';
import { mapOfferRow, type OfferRecord } from './offers';
import { MedicalVideosManagement } from './MedicalVideosManagement';
import { MedicalVideosPublicView } from './MedicalVideosPublicView';
import { mapCategoryRow, mapMedicalVideoRow } from './medicalVideos';

// Constants for input validation
const MAX_AI_MESSAGE_LENGTH = 500;

// --- Types ---

interface StatItem {
  label: string;
  value: string;
  trend: string;
}

interface Operation {
  id: number;
  patientName: string;
  patientPhone: string;
  patientPhone2?: string;
  patientEmail?: string;
  patientAge?: number;
  doctorName: string;
  surgeryType: string;
  date: string;
  cost: number;
  reminderSent: boolean;
  status: 'pending' | 'confirmed' | 'cancelled'; 
  notes?: string; 
  contractingCompanyId?: number; // Added field
  dbId?: string;
}

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  image: string;
  maxPatients: number;
  currentBookings: number;
  fee: number;
  rating: number; 
  topSpecialties: string[]; 
  availableDates: string[]; 
  patientsPerHour: number;
  experience: number;
  education: string;
  followUpExamCount: number; // عدد متابعات الكشف
  followUpSurgeryCount: number; // عدد متابعات العمليات
  facebookUrl?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  xUrl?: string;
}

/** Database row for a doctor (shared so booking limits are checked on the server). */
const doctorToRow = (d: Doctor) => ({
  name: d.name,
  specialty: d.specialty,
  image: d.image || null,
  max_patients: Number(d.maxPatients) || 0,
  current_bookings: Number(d.currentBookings) || 0,
  fee: Math.round(Number(d.fee) || 0),
  rating: Number(d.rating) || 5,
  top_specialties: d.topSpecialties || [],
  available_dates: d.availableDates || [],
  patients_per_hour: Number(d.patientsPerHour) || 4,
  experience: Number(d.experience) || 0,
  education: d.education || null,
  follow_up_exam_count: Number(d.followUpExamCount) || 2,
  follow_up_surgery_count: Number(d.followUpSurgeryCount) || 3,
  facebook_url: d.facebookUrl || null,
  youtube_url: d.youtubeUrl || null,
  tiktok_url: d.tiktokUrl || null,
  website_url: d.websiteUrl || null,
  instagram_url: d.instagramUrl || null,
  x_url: d.xUrl || null,
});

const safeSocialUrl = (raw?: string): string | null => {
  const val = (raw || '').trim();
  if (!val) return null;
  if (/^(javascript|data|vbscript):/i.test(val)) return null;
  const normalized = /^https?:\/\//i.test(val) ? val : `https://${val}`;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const TikTokIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.87a8.26 8.26 0 0 0 4.76 1.5v-3.4a4.85 4.85 0 0 1-1-.28Z" />
  </svg>
);

const XSocialIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const DoctorSocialLinks = ({ doc, compact = false }: { doc: Doctor; compact?: boolean }) => {
  const links = [
    { href: safeSocialUrl(doc.facebookUrl), label: 'Facebook', icon: <Facebook size={compact ? 13 : 16} />, cls: 'text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white border-blue-100' },
    { href: safeSocialUrl(doc.instagramUrl), label: 'Instagram', icon: <Instagram size={compact ? 13 : 16} />, cls: 'text-pink-600 bg-pink-50 hover:bg-pink-600 hover:text-white border-pink-100' },
    { href: safeSocialUrl(doc.youtubeUrl), label: 'YouTube', icon: <Youtube size={compact ? 13 : 16} />, cls: 'text-red-600 bg-red-50 hover:bg-red-600 hover:text-white border-red-100' },
    { href: safeSocialUrl(doc.tiktokUrl), label: 'TikTok', icon: <TikTokIcon size={compact ? 13 : 15} />, cls: 'text-gray-800 bg-gray-100 hover:bg-gray-900 hover:text-white border-gray-200' },
    { href: safeSocialUrl(doc.xUrl), label: 'X', icon: <XSocialIcon size={compact ? 12 : 14} />, cls: 'text-gray-900 bg-gray-100 hover:bg-black hover:text-white border-gray-200' },
    { href: safeSocialUrl(doc.websiteUrl), label: 'Website', icon: <Globe size={compact ? 13 : 16} />, cls: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white border-emerald-100' },
  ].filter((item): item is { href: string; label: string; icon: React.ReactElement; cls: string } => Boolean(item.href));

  if (links.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5 mt-3' : 'justify-center gap-2 pt-2'}`}>
      {links.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          title={item.label}
          aria-label={item.label}
          className={`${compact ? 'w-7 h-7' : 'w-9 h-9'} rounded-xl border flex items-center justify-center transition-all ${item.cls}`}
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
};

interface User {
  id: number;
  name: string;
  username: string;
  password?: string;
  role: 'admin' | 'staff';
  permissions: string[];
}

interface Booking {
  id: number;
  databaseId?: string;
  cancellationToken?: string;
  patientName: string;
  phone: string;
  phone2?: string;
  patientEmail?: string;
  address: string;
  age?: number;
  governorate?: string;
  center?: string;
  notes?: string;
  bookingType?: 'cash' | 'contract';
  doctorId: number;
  doctorName: string;
  service: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  reminderSent?: boolean; 
  reminderType?: 'sms' | 'email' | 'none';
  contractingCompanyId?: number;
  contractingDocs?: Record<string, string>;
  paymentMethod?: 'cash' | 'instapay' | 'wallet' | 'paymob';
  paymentStatus?: 'pending' | 'paid';
}

// Egypt Governorates list
const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة',
  'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية',
  'الوادي الجديد', 'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد',
  'دمياط', 'الشرقية', 'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر',
  'قنا', 'شمال سيناء', 'سوهاج'
];

interface Complaint {
  id: number;
  name: string;
  phone: string;
  type: 'suggestion' | 'complaint';
  message: string;
  date: string;
  dbId?: string;
}

interface HeroImage {
  id: number;
  url: string;
  dbId?: string;
}

interface Partner {
  id: number;
  name: string;
  logo: string;
  description: string;
  dbId?: string;
}

interface ServiceItem {
  id: number;
  title: string;
  description: string;
  iconName: string;
  color: string;
  price: number; 
}

interface PaymentMethod {
  id: string;
  type: 'cash' | 'instapay' | 'wallet' | 'other';
  label: string;
  detail: string;
}

interface AppSettings {
  appName: string;
  heroTitle: string;
  heroDescription: string;
  logoUrl: string;
  phones: string[];
  addresses: string[];
  facebookUrl: string;
  whatsappNumber: string;
  mapLocationUrl: string;
  language: 'ar' | 'en';
  patientMode: boolean; 
  stats: StatItem[];
  workingHours: {
    weekdays: string;
    friday: string;
  };
  reminderSettings: {
    smsBody: string;
    emailSubject: string;
    emailBody: string;
    opSmsBody: string;
    opEmailSubject: string;
    opEmailBody: string;
    intervalHours: number;
    whatsappBody: string;
    opWhatsappBody: string;
  };
  termsAr: string;
  termsEn: string;
  paymentMethods: PaymentMethod[];
}

interface PermissionOption {
  id: string;
  label: string;
}

interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info';
  date: string;
  read: boolean;
}

// --- Translations ---

const TRANSLATIONS = {
  ar: {
    home: "الرئيسية",
    about: "من نحن",
    partners: "التعاقدات",
    doctors: "الأطباء",
    services: "خدماتنا",
    offers: "عروضنا",
    medicalVideos: "فيديوهات طبية",
    myBookings: "حجوزاتي",
    contact: "تواصل معنا",
    login: "دخول الموظفين",
    logout: "تسجيل الخروج",
    reminderStatus: "حالة التذكير",
    reminderSent: "تم الإرسال",
    reminderPending: "قيد الانتظار",
    reminderNA: "غير قابل للتطبيق",
    management: "إدارة",
    confirmed: "مؤكد",
    cancelled: "ملغي",
    patient: "المريض",
    appointment: "الموعد",
    doctorService: "الطبيب / الخدمة",
    status: "الحالة",
    save: "حفظ",
    language: "الغة",
    arabic: "العربية",
    english: "الإنجليزية",
    settings: "الإعدادات",
    controlPanel: "لوحة التحكم",
    admin: "مسؤول",
    staff: "موظف",
    terms: "الشروط والأحكام"
  },
  en: {
    home: "Home",
    about: "About Us",
    partners: "Insurance",
    doctors: "Doctors",
    services: "Services",
    offers: "Offers",
    medicalVideos: "Medical Videos",
    myBookings: "My Bookings",
    contact: "Contact Us",
    login: "Staff Login",
    logout: "Logout",
    reminderStatus: "Reminder Status",
    reminderSent: "Sent",
    reminderPending: "Pending",
    reminderNA: "N/A",
    management: "Manage",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    patient: "Patient",
    appointment: "Appointment",
    doctorService: "Doctor / Service",
    status: "Status",
    save: "Save",
    language: "Language",
    arabic: "Arabic",
    english: "English",
    settings: "Settings",
    controlPanel: "Control Panel",
    admin: "Admin",
    staff: "Staff",
    terms: "Terms and Conditions"
  }
};

// --- Constants ---

const ICON_MAP = SERVICE_3D_ICONS;


const AVAILABLE_COLORS = [
  { name: 'أزرق', value: 'text-blue-600', bg: 'bg-blue-600' },
  { name: 'أحمر', value: 'text-red-600', bg: 'bg-red-600' },
  { name: 'أخضر', value: 'text-green-600', bg: 'bg-green-600' },
  { name: 'أصفر', value: 'text-yellow-500', bg: 'bg-yellow-500' },
  { name: 'بنفسجي', value: 'text-purple-600', bg: 'bg-purple-600' },
  { name: 'وردي', value: 'text-pink-500', bg: 'bg-pink-500' },
  { name: 'سماوي', value: 'text-cyan-500', bg: 'bg-cyan-500' },
  { name: 'برتقالي', value: 'text-orange-500', bg: 'bg-orange-500' },
];

const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let h = 9; h < 12; h++) {
    for (let m = 0; m < 60; m += 15) {
       const minute = m.toString().padStart(2, '0');
       const hour = h.toString().padStart(2, '0');
       slots.push(`${hour}:${minute} ص`);
    }
  }
  for (let m = 0; m < 60; m += 15) {
     const minute = m.toString().padStart(2, '0');
     slots.push(`12:${minute} م`);
  }
  for (let h = 1; h < 9; h++) {
     for (let m = 0; m < 60; m += 15) {
       const minute = m.toString().padStart(2, '0');
       const hour = h.toString().padStart(2, '0');
       slots.push(`${hour}:${minute} م`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Helper: Convert Arabic time slot (e.g., "09:00 ص") to 24h minutes
const timeSlotTo24hMinutes = (slot: string): number => {
  const parts = slot.trim().split(' ');
  const timePart = parts[0]; // "09:00"
  const period = parts[1]; // "ص" or "م"
  const [hourStr, minuteStr] = timePart.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (period === 'م' && hour !== 12) hour += 12;
  if (period === 'ص' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

// Helper: Parse working hours text like "9:00 صباحاً - 9:00 مساءً" to { start, end } in minutes
const parseWorkingHoursText = (text: string): { start: number; end: number } | null => {
  try {
    const parts = text.split('-').map(s => s.trim());
    if (parts.length !== 2) return null;
    const parseTime = (t: string): number => {
      const match = t.match(/(\d{1,2}):(\d{2})\s*(صباحاً|مساءً|ص|م)/);
      if (!match) return -1;
      let hour = parseInt(match[1], 10);
      const minute = parseInt(match[2], 10);
      const period = match[3];
      if (period === 'مساءً' || period === 'م') { if (hour !== 12) hour += 12; }
      if (period === 'صباحاً' || period === 'ص') { if (hour === 12) hour = 0; }
      return hour * 60 + minute;
    };
    const start = parseTime(parts[0]);
    const end = parseTime(parts[1]);
    if (start < 0 || end < 0) return null;
    return { start, end };
  } catch { return null; }
};

// Helper: Check if a given date is Friday
const isFriday = (dateStr: string): boolean => weekdayOf(dateStr) === 5;

const AVAILABLE_PERMISSIONS: PermissionOption[] = [
  { id: 'manage_doctors', label: 'إدارة الأطباء' },
  { id: 'manage_bookings', label: 'إدارة الحجوزات' },
  { id: 'manage_partners', label: 'شركاء النجاح' },
  { id: 'manage_content', label: 'إدارة المحتوى والخدمات' },
  { id: 'view_reports', label: 'عرض التقارير والإحصائيات' },
  { id: 'manage_settings', label: 'الإعدادات العامة' },
  { id: 'manage_complaints', label: 'إدارة الشكاوى والمقترحات' },
  { id: 'manage_reminders', label: 'إدارة التذكيرات' },
  { id: 'manage_operations', label: 'إدارة سجل العمليات' },
  { id: 'manage_users', label: 'إدارة المستخدمين' },
  { id: 'manage_payments', label: 'إدارة المدفوعات' },
  { id: 'review_instapay', label: 'مراجعة مدفوعات إنستاباي' },
  { id: 'view_audit_log', label: 'سجل العمليات (Audit Log)' },
];

// --- Initial Data ---

const INITIAL_APP_SETTINGS: AppSettings = {
  appName: 'مركز براده للعيون',
  heroTitle: 'مركز براده المتخصص للعيون',
  heroDescription: 'نخبة من الاستشاريين وأحدث التقنيات العالمية لرعاية عينيك وضمان رؤية أوضح لمستقبل أفضل.',
  logoUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=192&h=192&fit=crop',
  phones: ['01000000000', '01200000000'],
  addresses: ['القاهرة، مدينة نصر، شارع عباس العقاد', 'الجيزة، حي الدقي'],
  facebookUrl: 'https://facebook.com',
  whatsappNumber: '',
  mapLocationUrl: '',
  language: 'ar',
  patientMode: false,
  stats: [
    { label: 'مريض تم خدمته', value: '50,000+', trend: '+12% شهرياً' },
    { label: 'عملية ناجحة', value: '15,000+', trend: 'نسبة نجاح 99%' },
    { label: 'طبيب استشاري', value: '25+', trend: 'خبرات عالمية' },
    { label: 'عام من الخبرة', value: '20+', trend: 'ريادة طبية' },
  ],
  workingHours: {
    weekdays: '9:00 صباحاً - 9:00 مساءً',
    friday: '4:00 مساءً - 9:00 مساءً'
  },
  reminderSettings: {
    smsBody: "عزيزي [الاسم]، نذكركم بموعدكم في مركز براده للعيون غداً في تمام الساعة [الوقت] مع د. [الطبيب].",
    emailSubject: "تذكير بموعد الكشف - مركز براده للعيون",
    emailBody: "مرحباً [الاسم]، نود تذكيركم بموعدكم غداً [التاريخ] في تمام الساعة [الوقت] مع د. [الطبيب]. نتمنى لكم السلامة.",
    whatsappBody: "عزيزي [الاسم]، نذكركم بموعد الكشف في مركز براده للعيون غداً [التاريخ] في تمام الساعة [الوقت] مع د. [الطبيب].",
    opSmsBody: "عزيزي [الاسم]، نذكركم بموعد إجراء العملية الجراحية ([الإجراء]) غداً في مركز براده للعيون.",
    opEmailSubject: "تذكير بموعد عملية جراحية - مركز براده للعيون",
    opEmailBody: "مرحباً [الاسم]، نود تذكيركم بموعد إجراء العملية ([الإجراء]) غداً [التاريخ] مع د. [الطبيب]. يرجى الصيام لمدة 6 ساعات قبل الموعد والحضور مبكراً بـ 30 دقيقة.",
    opWhatsappBody: "عزيزي [الاسم]، نذكركم بموعد إجراء العملية الجراحية ([الإجراء]) غداً في مركز براده للعيون. يرجى الصيام 6 ساعات قبل الموعد.",
    intervalHours: 24
  },
  termsAr: 'باستخدامك لهذا التطبيق، فإنك توافق على الالتزام بالشروط والأحكام المذكورة هنا. يهدف مركز براده للعيون لتوفير تجربة حجز وإدارة مواعيد سلسة وآمنة لجميع المرضى. يجب الحضور قبل الموعد بـ 15 دقيقة على الأقل. نحن نلتزم بحماية بياناتك الشخصية والطبية.',
  termsEn: 'By using this application, you agree to be bound by the terms and conditions stated here. Barada Eye Center aims to provide a seamless and secure appointment booking and management experience for all patients. You must arrive at least 15 minutes before your appointment. We are committed to protecting your personal and medical data.',
  paymentMethods: [
    { id: 'cash', type: 'cash', label: 'الدفع نقداً في المركز', detail: '' },
    { id: '1', type: 'instapay', label: 'حساب المؤسسة', detail: 'barada@instapay' },
    { id: '2', type: 'wallet', label: 'فودافون كاش', detail: '01000000000' }
  ]
};


// Note: Users are now managed through Supabase Auth
// INITIAL_USERS removed for security - no hardcoded credentials
const INITIAL_USERS: User[] = [];



// --- Components ---

const TermsView = ({ settings }: { settings: AppSettings }) => {
  const isAr = settings.language === 'ar';
  const content = isAr ? settings.termsAr : settings.termsEn;
  return (
    <div className="py-20 min-h-[80vh]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 mb-5">
            <Scale size={28} />
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-[#172B3A] mb-3 fv-balance">{isAr ? 'الشروط والأحكام' : 'Terms and Conditions'}</h1>
          <p className="text-[#718394] font-semibold">{isAr ? 'يرجى قراءة اتفاقية الاستخدام بعناية' : 'Please read the usage agreement carefully'}</p>
        </div>

        <div className="bg-white p-8 md:p-12 rounded-3xl border border-[#DFEAF0] shadow-[0_12px_32px_-16px_rgba(11,31,53,0.1)]">
           <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#DFEAF0] text-[#087F8C]">
             <ShieldAlert size={24} />
             <h3 className="text-xl font-black text-[#172B3A]">{isAr ? 'اتفاقية الخدمة' : 'Service Agreement'}</h3>
           </div>
           <div className="max-w-none">
              <p className="text-[#172B3A]/85 text-base md:text-lg leading-relaxed font-medium whitespace-pre-wrap">
                {content}
              </p>
           </div>
        </div>

        <div className="mt-10 fv-dark-surface text-white p-8 md:p-10 rounded-3xl border border-white/10 shadow-xl text-center">
          <h4 className="text-2xl font-black mb-3">{isAr ? 'هل لديك أي استفسار حول سياساتنا؟' : 'Have questions about our policies?'}</h4>
          <p className="text-slate-300 mb-6 font-medium">{isAr ? 'نحن هنا لمساعدتك وتوضيح كافة التفاصيل المتعلقة بحقوق المريض.' : 'We are here to help and clarify all details regarding patient rights.'}</p>
          <span className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-[#25B8C7] px-6 py-3 rounded-xl font-bold text-sm">
             {isAr ? 'فريق خدمة المرضى متاح دائماً عبر صفحة تواصل معنا' : 'Patient care team is available via Contact Us'}
          </span>
        </div>
      </div>
    </div>
  );
};

const BookingModal = ({ 
    isOpen, 
    onClose, 
    doctor, 
    services, 
    onConfirm,
    initialData,
    doctors,
    bookings,
    settings,
    selectedOffer
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    doctor?: Doctor | null; 
    services: ServiceItem[];
    onConfirm: (data: Omit<Booking, 'id' | 'createdAt' | 'status'> & { instapay?: InstapaySubmissionInput }) => void;
    initialData?: Booking | null;
    doctors: Doctor[];
    bookings: Booking[];
    settings: AppSettings;
    selectedOffer?: OfferRecord | null;
}) => {
    // Form State
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [phone2, setPhone2] = useState(''); 
    const [address, setAddress] = useState('');
    const [age, setAge] = useState('');
    const [governorate, setGovernorate] = useState('');
    const [center, setCenter] = useState('');
    const [bookingNotes, setBookingNotes] = useState('');
    const [bookingType, setBookingType] = useState<'cash' | 'contract'>('cash');
    const [service, setService] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [selectedDoctorId, setSelectedDoctorId] = useState<number>(0);
    
    // Contracting State
    const [contractingId, setContractingId] = useState<number | undefined>(undefined);
    const [companies, setCompanies] = useState<ContractingCompany[]>([]);

    // Payment Flow State
    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Form, 2: Payment Selection, 3: Payment Details
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash' | 'instapay' | 'wallet' | 'paymob'>('cash');
    const paymobEnabled = usePaymobEnabled();
    const [copied, setCopied] = useState<string | null>(null);

    // InstaPay transfer details (optional evidence for manual accounting review)
    const [transferRef, setTransferRef] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [instapayError, setInstapayError] = useState('');

    // Track if initial values have been set to prevent reset during typing
    const hasInitialized = useRef(false);
    
    // Real-time doctor data state
    const [realtimeDoctors, setRealtimeDoctors] = useState<Doctor[]>(doctors);

    // Set up real-time listener for doctor schedules
    useEffect(() => {
        if (!isOpen) return;
        
        // Update doctors from props initially
        setRealtimeDoctors(doctors);
        
        // Set up real-time subscription for doctors table
        const channel = supabase
            .channel('booking-modal-doctors')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'doctors' },
                (payload) => {
                    if (payload.eventType === 'UPDATE') {
                        setRealtimeDoctors(prev => prev.map(d => {
                            // Convert the updated doctor data
                            if (d.id === parseInt((payload.new as any).id.slice(-8), 16)) {
                                const updated = payload.new as any;
                                return {
                                    ...d,
                                    availableDates: updated.available_dates || d.availableDates,
                                    fee: updated.fee !== undefined ? updated.fee : d.fee,
                                    patientsPerHour: updated.patients_per_hour || d.patientsPerHour,
                                    maxPatients: updated.max_patients || d.maxPatients,
                                };
                            }
                            return d;
                        }));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isOpen, doctors]);

    const currentSelectedDoctor = realtimeDoctors.find(d => d.id === selectedDoctorId);

    // Confirmed bookings per hour for the chosen doctor/date (counts only, works for visitors too)
    const [hourLoad, setHourLoad] = useState<Record<string, number>>({});
    const selectedDoctorName = currentSelectedDoctor?.name;
    useEffect(() => {
        setHourLoad({});
        if (!isOpen || !selectedDoctorName || !date) return;
        let cancelled = false;
        supabase.rpc('get_doctor_hour_load', { _doctor_name: selectedDoctorName, _date: date }).then(({ data, error }) => {
            if (cancelled || error || !data) return;
            const map: Record<string, number> = {};
            (data as { hour_key: string; booked: number }[]).forEach(r => { map[r.hour_key] = r.booked; });
            setHourLoad(map);
        });
        return () => { cancelled = true; };
    }, [isOpen, selectedDoctorName, date]);
    // Confirmed bookings for the whole day (sum of the hourly counts) vs. the doctor's daily limit
    const serverDayCount = initialData ? 0 : Object.values(hourLoad).reduce((sum, n) => sum + n, 0);
    const dayFullOnServer = !!currentSelectedDoctor && currentSelectedDoctor.maxPatients > 0 && serverDayCount >= currentSelectedDoctor.maxPatients;
    const todayStr = cairoTodayStr();
    const tomorrowStr = addDaysStr(todayStr, 1);
    const editingId = initialData ? initialData.id : undefined;
    const filteredAvailableDates = upcomingDates(currentSelectedDoctor?.availableDates || [], todayStr)
        .filter(d => d === initialData?.date || !currentSelectedDoctor || !isDayFull(bookings, currentSelectedDoctor.id, d, currentSelectedDoctor.maxPatients, editingId));

    // A select can display its first option while React still holds another doctor's day.
    const availableDatesKey = filteredAvailableDates.join(',');
    useEffect(() => {
        if (!isOpen || !hasInitialized.current || !currentSelectedDoctor) return;
        setDate(previous => resolveBookingDate(previous, availableDatesKey ? availableDatesKey.split(',') : []));
    }, [isOpen, selectedDoctorId, availableDatesKey, !!currentSelectedDoctor]);

    // Get service price based on selection
    const selectedService = services.find(s => s.title === service);
    const servicePrice = selectedService?.price || 0;
    
    // Get doctor fee based on selection - fee is 0 for follow-up visits
    const isFollowUpVisit = service.includes('متابعة كشف') || service.includes('متابعة الكشف') || service.includes('متابعة عملية') || service.includes('متابعة العملية');
    const doctorFee = isFollowUpVisit ? 0 : (currentSelectedDoctor?.fee || 0);
    
    // Total required payment
    const totalPayment = servicePrice + doctorFee;

    // Contracting companies saved in the dashboard, shown to every visitor (reloaded on each open).
    useEffect(() => {
        if (!isOpen) return;
        const load = () => ContractingManager.getPublic().then(setCompanies);
        load();
        window.addEventListener(CONTRACTING_CHANGED_EVENT, load);
        return () => window.removeEventListener(CONTRACTING_CHANGED_EVENT, load);
    }, [isOpen]);

    const getAvailableSlots = () => {
        if (!currentSelectedDoctor || !date) return TIME_SLOTS;
        
        // Filter by center working hours first
        const friday = isFriday(date);
        const hoursText = friday ? settings.workingHours.friday : settings.workingHours.weekdays;
        const parsedHours = parseWorkingHoursText(hoursText);
        
        return TIME_SLOTS.filter(slot => {
            // Filter out slots outside center working hours
            if (parsedHours) {
                const slotMinutes = timeSlotTo24hMinutes(slot);
                if (slotMinutes < parsedHours.start || slotMinutes >= parsedHours.end) return false;
            }
            
            if (dayFullOnServer || isDayFull(bookings, currentSelectedDoctor.id, date, currentSelectedDoctor.maxPatients, initialData ? initialData.id : undefined)) return false;
            const isTaken = bookings.some(b => 
                b.doctorId === selectedDoctorId && 
                b.date === date && 
                b.time === slot && 
                b.status === 'confirmed' &&
                (!initialData || b.id !== initialData.id)
            );
            if (isTaken) return false;
            const hourPart = slot.split(':')[0]; 
            const amPmPart = slot.split(' ')[1]; 
            const localInSameHour = bookings.filter(b => 
                b.doctorId === selectedDoctorId && 
                b.date === date && 
                b.status === 'confirmed' &&
                b.time.split(':')[0] === hourPart &&
                b.time.split(' ')[1] === amPmPart &&
                (!initialData || b.id !== initialData.id)
            ).length;
            const serverInSameHour = initialData ? 0 : (hourLoad[`${hourPart} ${amPmPart}`] || 0);
            const bookingsInSameHour = Math.max(localInSameHour, serverInSameHour);
            return bookingsInSameHour < currentSelectedDoctor.patientsPerHour;
        });
    };

    const availableSlots = getAvailableSlots();

    // Reset time when doctor or date changes (after initial load)
    useEffect(() => {
        if (!isOpen || !hasInitialized.current) return;
        setTime('');
    }, [selectedDoctorId, date]);

    useEffect(() => {
        // Reset the flag when modal closes
        if (!isOpen) {
            hasInitialized.current = false;
            return;
        }
        
        // Only initialize once when modal opens
        if (hasInitialized.current) return;
        hasInitialized.current = true;
        
        setStep(1); // Reset step on open
        setSelectedPaymentMethod('cash');
        if (initialData) {
            setName(initialData.patientName);
            setPhone(initialData.phone);
            setPhone2(initialData.phone2 || '');
            setAddress(initialData.address || '');
            setAge(initialData.age ? String(initialData.age) : '');
            setGovernorate(initialData.governorate || '');
            setCenter(initialData.center || '');
            setBookingNotes(initialData.notes || '');
            setBookingType(initialData.bookingType || 'cash');
            setService(initialData.service);
            setDate(initialData.date);
            setTime(initialData.time);
            // If doctorId is 0 (null in DB), resolve by matching doctor name
            const resolvedDoctorId = initialData.doctorId || realtimeDoctors.find(d => d.name === initialData.doctorName)?.id || 0;
            setSelectedDoctorId(resolvedDoctorId);
            setContractingId(initialData.contractingCompanyId);
            if (initialData.paymentMethod) setSelectedPaymentMethod(initialData.paymentMethod);
        } else {
            setName('');
            setPhone('');
            setPhone2('');
            setAddress('');
            setAge('');
            setGovernorate('');
            setCenter('');
            setBookingNotes(
                selectedOffer
                    ? `حجز عبر العرض: ${selectedOffer.title} (سعر العرض: ${selectedOffer.offerPrice} ج.م)`
                    : ''
            );
            setBookingType('cash');
            setService(services[0]?.title || '');
            // لا يتم تحديد طبيب افتراضي — يجب الاختيار يدوياً
            const initialDocId = doctor?.id || 0;
            setSelectedDoctorId(initialDocId);
            const initialDoc = doctor ? realtimeDoctors.find(d => d.id === initialDocId) : null;
            const firstValidDate = upcomingDates(initialDoc?.availableDates || [], todayStr)[0] || tomorrowStr;
            setDate(firstValidDate);
            setTime('');
            setContractingId(undefined);
        }
    }, [isOpen, initialData, doctor, services, realtimeDoctors, selectedOffer]);

    if (!isOpen) return null;

    // دالة للتحقق من إمكانية حجز المتابعة
    const canBookFollowUp = (patientName: string, patientPhone: string, doctorId: number, serviceName: string): boolean => {
        const isFollowUpExam = serviceName.includes('متابعة كشف') || serviceName.includes('متابعة الكشف');
        const isFollowUpSurgery = serviceName.includes('متابعة عملية') || serviceName.includes('متابعة العملية');
        
        if (!isFollowUpExam && !isFollowUpSurgery) {
            return true; // ليست متابعة، يسمح بالحجز
        }

        // البحث عن حجوزات سابقة للمريض مع نفس الطبيب
        const previousBookings = bookings.filter(b => 
            (b.patientName.trim().toLowerCase() === patientName.trim().toLowerCase() || 
             b.phone === patientPhone) &&
            b.doctorId === doctorId &&
            b.status === 'confirmed'
        );

        if (isFollowUpExam) {
            // التحقق من وجود كشف سابق (ليس متابعة)
            const hasExam = previousBookings.some(b => 
                !b.service.includes('متابعة') && 
                !b.service.includes('عملية')
            );
            return hasExam;
        }

        if (isFollowUpSurgery) {
            // التحقق من وجود عملية سابقة
            const hasSurgery = previousBookings.some(b => 
                b.service.includes('عملية') && !b.service.includes('متابعة')
            );
            return hasSurgery;
        }

        return true;
    };

    const handleNextStep = (e: React.FormEvent) => {
        e.preventDefault();
        
        // === التحقق من اختيار الطبيب ===
        if (!selectedDoctorId || selectedDoctorId === 0) {
            alert('عذراً، يجب اختيار الطبيب أولاً.');
            return;
        }
        
        // === التحقق من أن الطبيب لديه أيام عمل محددة ===
        if (!currentSelectedDoctor || !currentSelectedDoctor.availableDates || currentSelectedDoctor.availableDates.length === 0) {
            alert('عذراً، لا يمكن الحجز مع هذا الطبيب حالياً لأنه لا توجد له أيام عمل محددة في النظام. يرجى اختيار طبيب آخر أو التواصل مع الإدارة.');
            return;
        }

        // === التحقق من الاسم الرباعي ===
        const trimmedName = name.trim();
        const nameParts = trimmedName.split(/\s+/).filter(part => part.length > 0);
        
        // Check minimum 4 words
        if (nameParts.length < 4) {
            alert('عذراً، يجب إدخال الاسم الرباعي كاملاً (4 كلمات على الأقل).');
            return;
        }
        
        // Check name length limits (2-100 characters)
        if (trimmedName.length < 2 || trimmedName.length > 100) {
            alert('عذراً، يجب أن يكون الاسم بين 2 و 100 حرف.');
            return;
        }
        
        // Check for valid characters in name (Arabic, English letters, spaces, hyphens, apostrophes only)
        const nameCharRegex = /^[\p{L}\s\-']+$/u;
        if (!nameCharRegex.test(trimmedName)) {
            alert('عذراً، الاسم يجب أن يحتوي على حروف فقط بدون أرقام أو رموز خاصة.');
            return;
        }

        // === التحقق من رقم الهاتف (11 رقم بصيغة مصرية 01XXXXXXXXX) ===
        const egyptianPhoneRegex = /^01[0-9]{9}$/;
        if (!egyptianPhoneRegex.test(phone)) {
            alert('عذراً، يجب أن يكون رقم الهاتف الأساسي 11 رقماً ويبدأ بـ 01 (مثال: 01012345678).');
            return;
        }
        if (phone2 && phone2.trim() !== '' && !egyptianPhoneRegex.test(phone2)) {
            alert('عذراً، يجب أن يكون رقم الهاتف الثاني 11 رقماً ويبدأ بـ 01 (مثال: 01012345678).');
            return;
        }

        // === التحقق من السن ===
        const ageNum = parseInt(age, 10);
        if (!age || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
            alert('عذراً، يجب إدخال السن (رقم بين 1 و 120).');
            return;
        }

        // === التحقق من المحافظة والمركز ===
        if (!governorate) {
            alert('عذراً، يجب اختيار المحافظة.');
            return;
        }
        if (!center.trim()) {
            alert('عذراً، يجب إدخال المركز / المدينة.');
            return;
        }

        // Compose address from governorate + center
        const composedAddress = `${governorate} - ${center.trim()}`;


        if (!name || !phone || !date || !time) {
            alert('يرجى ملء جميع الحقول المطلوبة واختيار موعد متاح');
            return;
        }
        
        // === التحقق من أن التاريخ ليس في الماضي أو منتهي ===
        if (date < todayStr) {
            alert('عذراً، لا يمكن الحجز في تاريخ منتهي أو ماضٍ. يرجى اختيار تاريخ صالح.');
            return;
        }
        
        // === منع الحجز في نفس اليوم ===
        if (date === todayStr) {
            alert('عذراً، لا يمكن الحجز في نفس يوم اليوم. يرجى اختيار تاريخ بدءاً من الغد.');
            return;
        }
        
        // === التحقق من أن التاريخ المختار من ضمن أيام عمل الطبيب المحددة فقط ===
        if (dayFullOnServer || isDayFull(bookings, currentSelectedDoctor.id, date, currentSelectedDoctor.maxPatients, initialData ? initialData.id : undefined)) {
            alert('عذراً، اكتمل الحد الأقصى لعدد المرضى لهذا الطبيب في هذا اليوم. يرجى اختيار يوم آخر.');
            return;
        }
        if (!currentSelectedDoctor.availableDates.includes(date)) {
            alert('عذراً، الطبيب غير متاح في هذا اليوم. يرجى اختيار يوم من أيام عمل الطبيب المتاحة فقط.');
            return;
        }

        // === التحقق من أن الوقت المختار داخل ساعات العمل ===
        if (time) {
            const friday = isFriday(date);
            const hoursText = friday ? settings.workingHours.friday : settings.workingHours.weekdays;
            const parsed = parseWorkingHoursText(hoursText);
            if (parsed) {
                const selectedMinutes = timeSlotTo24hMinutes(time);
                if (selectedMinutes < parsed.start || selectedMinutes >= parsed.end) {
                    alert(`عذراً، الوقت المختار خارج ساعات العمل (${hoursText}). يرجى اختيار وقت آخر ضمن ساعات العمل.`);
                    return;
                }
            }
        }

        const normalizedName = name.trim().toLowerCase().replace(/\s+/g, ' ');
        const existingPatientBooking = bookings.find(b => 
            b.patientName.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName && 
            b.status === 'confirmed' &&
            (!initialData || b.id !== initialData.id)
        );
        if (existingPatientBooking) {
            alert('عذراً، يوجد حجز مسجل مسبقاً بنفس هذا الاسم. لا يمكن تكرار الاسم لتجنب الازدواجية.');
            return;
        }

        // === التحقق من إمكانية حجز المتابعة وعدد المتابعات ===
        const isFollowUpExam = service.includes('متابعة كشف') || service.includes('متابعة الكشف');
        const isFollowUpSurgery = service.includes('متابعة عملية') || service.includes('متابعة العملية');

        if (isFollowUpExam || isFollowUpSurgery) {
            // التحقق من وجود كشف أو عملية سابقة
            if (!canBookFollowUp(name, phone, selectedDoctorId, service)) {
                if (isFollowUpExam) {
                    alert('عذراً، لا يمكن حجز متابعة كشف لأن المريض لم يسبق له إجراء كشف لدى هذا الطبيب.');
                } else {
                    alert('عذراً، لا يمكن حجز متابعة عملية لأن المريض لم يسبق له إجراء عملية لدى هذا الطبيب.');
                }
                return;
            }

            // === التحقق من عدد المتابعات المسموح بها ===
            const patientFollowUps = bookings.filter(b => 
                (b.patientName.trim().toLowerCase() === name.trim().toLowerCase() || b.phone === phone) &&
                b.doctorId === selectedDoctorId &&
                b.status === 'confirmed' &&
                (!initialData || b.id !== initialData.id)
            );

            if (isFollowUpExam) {
                const examFollowUpsCount = patientFollowUps.filter(b => 
                    b.service.includes('متابعة كشف') || b.service.includes('متابعة الكشف')
                ).length;
                const maxExamFollowUps = currentSelectedDoctor.followUpExamCount || 0;
                if (examFollowUpsCount >= maxExamFollowUps) {
                    alert(`عذراً، تم الوصول إلى الحد الأقصى لمتابعات الكشف (${maxExamFollowUps}) لهذا المريض مع هذا الطبيب.`);
                    return;
                }
            }

            if (isFollowUpSurgery) {
                const surgeryFollowUpsCount = patientFollowUps.filter(b => 
                    b.service.includes('متابعة عملية') || b.service.includes('متابعة العملية')
                ).length;
                const maxSurgeryFollowUps = currentSelectedDoctor.followUpSurgeryCount || 0;
                if (surgeryFollowUpsCount >= maxSurgeryFollowUps) {
                    alert(`عذراً، تم الوصول إلى الحد الأقصى لمتابعات العمليات (${maxSurgeryFollowUps}) لهذا المريض مع هذا الطبيب.`);
                    return;
                }
            }
        }

        // === منع تكرار الحجز في نفس اليوم لنفس الطبيب ===
        const isDuplicateSameDay = bookings.some(b => 
            b.patientName.trim().toLowerCase() === name.trim().toLowerCase() && 
            b.doctorId === selectedDoctorId &&
            b.date === date &&
            b.status === 'confirmed' &&
            (!initialData || b.id !== initialData.id)
        );
        if (isDuplicateSameDay) {
            alert('عذراً، يوجد حجز مسبق بهذا الاسم لدى الطبيب في نفس اليوم.');
            return;
        }

        // --- Logic Layer Separation: Cash vs Contract ---
        if (bookingType === 'contract' && contractingId) {
            // Case: Insurance Patient
            onConfirm({
                patientName: name,
                phone,
                phone2,
                address: composedAddress,
                age: ageNum,
                governorate,
                center: center.trim(),
                notes: bookingNotes.trim() || undefined,
                bookingType: 'contract',
                doctorId: selectedDoctorId,
                doctorName: currentSelectedDoctor?.name || 'طبيب عام',
                service,
                date,
                time,
                reminderSent: false,
                contractingCompanyId: contractingId,
                contractingDocs: {},
                paymentMethod: undefined,
                paymentStatus: 'pending'
            });
            onClose();
        } else {
            // Case: Cash/Private Patient
            setStep(2);
        }
    };

    const handleFinalConfirm = (overridePaymentMethod?: 'cash' | 'instapay' | 'wallet' | 'paymob') => {
        const method = overridePaymentMethod || selectedPaymentMethod;
        if (method === 'instapay' && !initialData && transferRef.trim().length < 4) {
            setInstapayError('يرجى إدخال رقم العملية (التحويل) بشكل صحيح');
            return;
        }
        if (method === 'instapay' && !initialData) {
            const fileErr = receiptError(evidenceFile);
            if (fileErr) { setInstapayError(fileErr); return; }
        }
        setInstapayError('');
        const status = method === 'cash' ? 'pending' : 'pending'; 
        const composedAddr = `${governorate} - ${center.trim()}`;
        const ageNum = parseInt(age, 10);

        onConfirm({
            patientName: name,
            phone,
            phone2,
            address: composedAddr,
            age: isNaN(ageNum) ? undefined : ageNum,
            governorate,
            center: center.trim(),
            notes: bookingNotes.trim() || undefined,
            bookingType: 'cash',
            doctorId: selectedDoctorId,
            doctorName: currentSelectedDoctor?.name || 'طبيب عام',
            service,
            date,
            time,
            reminderSent: false,
            contractingCompanyId: contractingId,
            contractingDocs: {},
            paymentMethod: method,
            paymentStatus: status,
            instapay: method === 'instapay' && !initialData ? {
                transactionRef: transferRef.trim(),
                declaredAmount: transferAmount.trim() === '' ? undefined : Number(transferAmount),
                file: evidenceFile
            } : undefined
        });
        onClose();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(text);
        setTimeout(() => setCopied(null), 2000);
    };

    const renderFormStep = () => {
        const modalFieldClass = "w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3.5 text-[#172B3A] focus:bg-white focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] outline-hidden transition-all font-bold";
        const modalLabelClass = "text-xs font-bold text-[#718394] mr-1 block";
        return (
        <form onSubmit={handleNextStep} className="space-y-4">
            {selectedOffer && !initialData && (
                <div className="bg-[#EBF8FA] border border-[#25B8C7]/40 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-bold text-[#087F8C] mb-0.5">حجز ضمن العرض الطبي</p>
                        <p className="text-sm font-black text-[#172B3A]">{selectedOffer.title}</p>
                        {selectedOffer.doctorName && (
                            <p className="text-xs font-bold text-[#718394] mt-0.5">{selectedOffer.doctorName}</p>
                        )}
                    </div>
                    <div className="text-left shrink-0">
                        <span className="text-base font-black text-[#087F8C] fv-num">{selectedOffer.offerPrice} ج.م</span>
                        {selectedOffer.originalPrice !== null && selectedOffer.originalPrice > selectedOffer.offerPrice && (
                            <div className="text-[11px] text-[#718394] line-through fv-num">{selectedOffer.originalPrice} ج.م</div>
                        )}
                    </div>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>الاسم بالكامل</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className={modalFieldClass} placeholder="ادخل اسمك الرباعي" />
                </div>
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>رقم الهاتف (11 رقم)</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={`${modalFieldClass} text-left fv-num`} placeholder="01xxxxxxxxx" dir="ltr" maxLength={11} />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>رقم هاتف ثانٍ (اختياري)</label>
                    <input type="tel" value={phone2} onChange={e => setPhone2(e.target.value)} className={`${modalFieldClass} text-left fv-num`} placeholder="01xxxxxxxxx" dir="ltr" maxLength={11} />
                </div>
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>السن</label>
                    <input type="number" value={age} onChange={e => setAge(e.target.value)} min={1} max={120} className={`${modalFieldClass} fv-num`} placeholder="السن" />
                </div>
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>المحافظة</label>
                    <select value={governorate} onChange={e => { setGovernorate(e.target.value); setCenter(''); }} className={modalFieldClass}>
                        <option value="" disabled>-- اختر المحافظة --</option>
                        {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>المركز / المدينة</label>
                    {governorate && EGYPT_CENTERS[governorate] ? (
                        <select value={center} onChange={e => setCenter(e.target.value)} className={modalFieldClass}>
                            <option value="" disabled>-- اختر المركز --</option>
                            {EGYPT_CENTERS[governorate].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    ) : (
                        <input type="text" value={center} onChange={e => setCenter(e.target.value)} disabled={!governorate} className={`${modalFieldClass} disabled:opacity-50`} placeholder={governorate ? 'أدخل المركز' : 'اختر المحافظة أولاً'} />
                    )}
                </div>
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>نوع الكشف</label>
                    <select value={bookingType} onChange={e => {
                        const val = e.target.value as 'cash' | 'contract';
                        setBookingType(val);
                        if (val === 'cash') setContractingId(undefined);
                    }} className={modalFieldClass}>
                        <option value="cash">كشف نقدي</option>
                        <option value="contract">كشف تعاقد</option>
                    </select>
                </div>
            </div>
            {bookingType === 'contract' && (
                <div className="space-y-1.5">
                    <ContractingSelector 
                        companies={companies} 
                        value={contractingId} 
                        onChange={setContractingId} 
                    />
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                    <label className={modalLabelClass}>الطبيب</label>
                    <select value={selectedDoctorId} onChange={e => setSelectedDoctorId(Number(e.target.value))} className={modalFieldClass}>
                        <option value={0} disabled>-- اختر الطبيب --</option>
                        {realtimeDoctors.map(d => <option key={d.id} value={d.id}>{d.name} - {d.fee} ج.م</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>الخدمة</label>
                    <select value={service} onChange={e => setService(e.target.value)} className={modalFieldClass}>
                        {services.map(s => <option key={s.id} value={s.title}>{s.title} - {s.price} ج.م</option>)}
                    </select>
                    {servicePrice > 0 && (
                        <p className="text-xs text-[#087F8C] font-bold mt-1 fv-num">سعر الخدمة: {servicePrice} ج.م</p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>التاريخ</label>
                    {currentSelectedDoctor && filteredAvailableDates.length > 0 ? (
                        <select value={date} onChange={e => setDate(e.target.value)} className={modalFieldClass}>
                            {filteredAvailableDates.map(d => <option key={d} value={d}>{arabicWeekday(d)} - {d}</option>)}
                        </select>
                    ) : (
                        <input type="date" value={date} min={tomorrowStr} disabled={!!currentSelectedDoctor} onChange={e => setDate(e.target.value)} className={modalFieldClass} />
                    )}
                </div>
            </div>
            {/* Display Doctor Fee */}
            {currentSelectedDoctor && (
                <div className="bg-[#F5FAFC] border border-[#25B8C7]/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[#087F8C] font-bold text-sm">رسوم الطبيب:</span>
                        <span className="text-[#172B3A] font-black text-lg fv-num">{doctorFee} ج.م</span>
                        {isFollowUpVisit && <span className="text-xs text-[#718394] font-bold">(متابعة - مجاناً)</span>}
                    </div>
                    {totalPayment > 0 && (
                        <div className="text-right">
                            <span className="text-[#718394] text-sm font-bold">إجمالي المطلوب: </span>
                            <span className="text-[#1769AA] font-black text-lg fv-num">{totalPayment} ج.م</span>
                        </div>
                    )}
                </div>
            )}
            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                    <label className={modalLabelClass}>الوقت (المواعيد المتاحة)</label>
                    <select value={time} onChange={e => setTime(e.target.value)} className={modalFieldClass}>
                        <option value="" disabled>اختر موعداً...</option>
                        {availableSlots.map(t => <option key={t} value={t}>{t}</option>)}
                        {availableSlots.length === 0 && <option disabled>لا توجد مواعيد متاحة حالياً</option>}
                    </select>
                </div>
            </div>
            <div className="space-y-1.5">
                <label className={modalLabelClass}>ملاحظات (اختياري)</label>
                <textarea value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} rows={2} maxLength={500} className={`${modalFieldClass} resize-none`} placeholder="أي ملاحظات إضافية..." />
            </div>
            <button type="submit" className={`w-full ${initialData ? 'bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-500/20 text-white' : 'fv-btn-primary'} font-black py-4 rounded-xl transition-all flex items-center justify-center gap-3 mt-4`}>
                {initialData ? <Edit2 size={20} /> : <CheckCircle size={20} />}
                {initialData ? 'تحديث البيانات' : (bookingType === 'contract' && contractingId ? 'تأكيد حجز التعاقد' : 'متابعة لاختيار الدفع')}
            </button>
        </form>
        );
    };

    const renderPaymentSelectionStep = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
            <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-[#718394] hover:text-[#087F8C] font-bold text-sm mb-4">
                <ArrowLeft size={18} /> عودة للبيانات
            </button>

            <div className="text-center mb-6">
                <h3 className="text-xl font-black text-[#172B3A]">طريقة الدفع</h3>
                <p className="text-[#718394] text-sm mt-1 font-medium">اختر الطريقة المناسبة لتأكيد حجزك</p>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
                {paymentOptionsFor(settings.paymentMethods).cash && (
                <button 
                    onClick={() => { setSelectedPaymentMethod('cash'); handleFinalConfirm('cash'); }}
                    className="p-4 rounded-2xl border border-[#DFEAF0] hover:border-[#087F8C] hover:bg-[#F5FAFC] transition-all flex items-center gap-4 group text-right"
                >
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-200 group-hover:scale-105 transition-transform">
                        <Banknote size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#172B3A]">الدفع نقداً في المركز</h4>
                        <p className="text-xs text-[#718394]">الدفع عند الحضور للكشف</p>
                    </div>
                </button>
                )}

                {paymentOptionsFor(settings.paymentMethods).instapay && (
                <button 
                    onClick={() => { setSelectedPaymentMethod('instapay'); setStep(3); }}
                    className="p-4 rounded-2xl border border-[#DFEAF0] hover:border-[#1769AA] hover:bg-[#F5FAFC] transition-all flex items-center gap-4 group text-right"
                >
                    <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center border border-purple-200 group-hover:scale-105 transition-transform">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#172B3A]">انستا باي (InstaPay)</h4>
                        <p className="text-xs text-[#718394]">تحويل لحظي آمن</p>
                    </div>
                </button>
                )}

                {paymentOptionsFor(settings.paymentMethods).wallet && (
                <button 
                    onClick={() => { setSelectedPaymentMethod('wallet'); setStep(3); }}
                    className="p-4 rounded-2xl border border-[#DFEAF0] hover:border-[#087F8C] hover:bg-[#F5FAFC] transition-all flex items-center gap-4 group text-right"
                >
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-200 group-hover:scale-105 transition-transform">
                        <Wallet size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#172B3A]">محافظ الهاتف (Wallet)</h4>
                        <p className="text-xs text-[#718394]">فودافون كاش، اتصالات، أورانج</p>
                    </div>
                </button>
                )}

                {paymobEnabled && !initialData && (
                <button 
                    onClick={() => { setSelectedPaymentMethod('paymob'); handleFinalConfirm('paymob'); }}
                    className="p-4 rounded-2xl border border-[#DFEAF0] hover:border-[#1769AA] hover:bg-[#F5FAFC] transition-all flex items-center gap-4 group text-right"
                >
                    <div className="w-12 h-12 bg-[#087F8C]/10 text-[#087F8C] rounded-xl flex items-center justify-center border border-[#087F8C]/20 group-hover:scale-105 transition-transform">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#172B3A]">الدفع أونلاين (بطاقة / محفظة إلكترونية)</h4>
                        <p className="text-xs text-[#718394]">ادفع الآن ويتم تأكيد الحجز تلقائياً</p>
                    </div>
                </button>
                )}
            </div>
        </div>
    );

    const renderPaymentDetailsStep = () => {
        const isInsta = selectedPaymentMethod === 'instapay';
        const currentMethods = settings.paymentMethods.filter(m => m.type === (isInsta ? 'instapay' : 'wallet'));
        const defaultInsta = { id: 'def', type: 'instapay', label: 'حساب المؤسسة', detail: 'barada@instapay' };
        const defaultWallet = { id: 'def2', type: 'wallet', label: 'فودافون كاش', detail: '01000000000' };

        const methodsToShow = currentMethods.length > 0 ? currentMethods : [isInsta ? defaultInsta : defaultWallet];

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-[#718394] hover:text-[#087F8C] font-bold text-sm mb-4">
                    <ArrowLeft size={18} /> عودة للاختيار
                </button>

                <div className="text-center mb-6">
                    <div className={`w-16 h-16 ${isInsta ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-amber-50 text-amber-600 border-amber-200'} border rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                        {isInsta ? <Zap size={28} /> : <Smartphone size={28} />}
                    </div>
                    <h3 className="text-xl font-black text-[#172B3A]">{isInsta ? 'بيانات التحويل عبر انستا باي' : 'بيانات المحفظة الإلكترونية'}</h3>
                    <p className="text-[#718394] text-sm mt-1 font-medium">يرجى تحويل مبلغ الكشف إلى البيانات التالية</p>
                </div>

                <div className="bg-[#F5FAFC] p-5 rounded-2xl border border-[#DFEAF0] space-y-3">
                    {methodsToShow.map((method, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-[#DFEAF0] flex justify-between items-center">
                            <div>
                                <p className="text-[11px] text-[#718394] font-bold">{method.label}</p>
                                <p className="font-black text-lg text-[#172B3A] fv-num" dir="ltr">{method.detail}</p>
                            </div>
                            <button onClick={() => copyToClipboard(method.detail)} className="p-2 text-[#087F8C] hover:bg-[#F5FAFC] rounded-lg transition-colors">
                                {copied === method.detail ? <CheckCircle size={20} /> : <Copy size={20} />}
                            </button>
                        </div>
                    ))}
                </div>

                <div className="bg-[#087F8C]/8 border border-[#087F8C]/20 p-4 rounded-xl text-xs text-[#172B3A] font-semibold flex items-start gap-2">
                    <Info size={16} className="shrink-0 mt-0.5 text-[#087F8C]" />
                    <p>بعد إتمام التحويل، سيقوم فريق الاستقبال بمراجعة العملية وتأكيد الحجز نهائياً. يرجى الاحتفاظ بصورة التحويل.</p>
                </div>

                {isInsta && (
                    <div className="space-y-3 border-t border-[#DFEAF0] pt-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#718394] mr-1 block">رقم العملية / التحويل (إلزامي)</label>
                            <input type="text" value={transferRef} onChange={e => setTransferRef(e.target.value)} dir="ltr" className="w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3.5 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-hidden transition-all font-bold text-left fv-num" placeholder="رقم العملية كما يظهر في تطبيق إنستاباي" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#718394] mr-1 block">المبلغ المرسل (اختياري)</label>
                            <input type="number" min={0} value={transferAmount} onChange={e => setTransferAmount(e.target.value)} className="w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3.5 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-hidden transition-all font-bold fv-num" placeholder="مثال: 300" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#718394] mr-1 block">صورة الإيصال (إلزامي - صورة أو PDF حتى 5 ميغابايت)</label>
                            <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e => setEvidenceFile(e.target.files?.[0] || null)} className="w-full text-sm font-bold text-[#718394] file:ml-3 file:rounded-xl file:border-0 file:bg-purple-50 file:px-4 file:py-2 file:font-bold file:text-purple-700" />
                        </div>
                        {instapayError && <p className="text-xs text-red-600 font-bold">{instapayError}</p>}
                    </div>
                )}

                <button 
                    onClick={() => handleFinalConfirm()}
                    className={`w-full ${isInsta ? 'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/20' : 'fv-btn-primary'} text-white font-black py-4 rounded-xl transition-all flex items-center justify-center gap-3`}
                >
                    <CheckCircle size={20} />
                    تم إرسال المبلغ وتأكيد الحجز
                </button>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-xl w-full p-6 md:p-10 overflow-hidden relative max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-5 left-5 p-2 hover:bg-[#F5FAFC] rounded-full transition-colors text-[#718394] hover:text-[#172B3A] z-10">
                    <X size={22} />
                </button>
                
                {step === 1 && (
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 mb-4">
                            {initialData ? <Edit2 size={26} /> : <Calendar size={26} />}
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black text-[#172B3A]">{initialData ? 'تعديل بيانات الحجز' : 'تأكيد موعد الحجز'}</h2>
                        <p className="text-[#718394] text-sm mt-1.5 font-medium">
                            {initialData ? `تعديل حجز المريض: ${initialData.patientName}` : doctor ? `حجز مع ${doctor.name}` : 'حجز موعد جديد'}
                        </p>
                    </div>
                )}

                {step === 1 && renderFormStep()}
                {step === 2 && renderPaymentSelectionStep()}
                {step === 3 && renderPaymentDetailsStep()}
            </div>
        </div>
    );
};

const LoginView = ({ onLogin, settings, isLoading: externalLoading }: { onLogin: (usernameOrEmail: string, password: string) => Promise<{ error: string | null }>, settings: AppSettings, isLoading?: boolean }) => {
    const [usernameOrEmail, setUsernameOrEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!usernameOrEmail || !password) {
            setError('يرجى إدخال اسم المستخدم/البريد الإلكتروني وكلمة المرور');
            return;
        }
        
        // Password minimum length validation
        if (password.length < 6) {
            setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            return;
        }
        
        setIsSubmitting(true);
        setError('');
        
        const result = await onLogin(usernameOrEmail, password);
        
        if (result.error) {
            setError(result.error);
        }
        
        setIsSubmitting(false);
    };

    return (
        <div className="min-h-[82vh] flex items-center justify-center px-4 py-14 relative overflow-hidden">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_24px_60px_-20px_rgba(11,31,53,0.16)] p-8 md:p-10 border border-[#DFEAF0] relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-[#F5FAFC] text-[#087F8C] rounded-2xl mb-5 overflow-hidden border border-[#DFEAF0] p-2">
                        {settings.logoUrl ? (
                            <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                            <Lock size={34} />
                        )}
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-[#172B3A] mb-1.5">دخول الموظفين</h2>
                    <p className="text-[#718394] text-sm font-medium">يرجى إدخال بيانات الاعتماد الخاصة بك</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-[#718394] mb-1.5">اسم المستخدم أو البريد الإلكتروني</label>
                        <div className="relative">
                            <User className="absolute right-3.5 top-3.5 text-[#718394]" size={18} />
                            <input type="text" value={usernameOrEmail} onChange={e => { setUsernameOrEmail(e.target.value); setError(''); }} className="w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3.5 pr-11 text-[#172B3A] focus:bg-white focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] outline-hidden transition-all font-bold" placeholder="اسم المستخدم أو example@email.com" dir="ltr" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-[#718394] mb-1.5">كلمة المرور</label>
                        <div className="relative">
                            <Shield className="absolute right-3.5 top-3.5 text-[#718394]" size={18} />
                            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} className="w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3.5 pr-11 text-[#172B3A] focus:bg-white focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] outline-hidden transition-all font-bold" placeholder="••••••••" />
                        </div>
                    </div>
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3.5 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                    <button type="submit" disabled={isSubmitting || externalLoading} className="w-full fv-btn-primary font-black py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                        {(isSubmitting || externalLoading) ? <RotateCcw size={20} className="animate-spin" /> : <Send size={18} />}
                        تسجيل الدخول
                    </button>
                </form>
                <div className="mt-7 pt-5 border-t border-[#DFEAF0] text-center text-[#718394] text-xs font-medium">
                    نظام إدارة مركز براده للعيون &copy; {new Date().getFullYear()}
                </div>
            </div>
        </div>
    );
};

const SmartStatsBar = ({ settings }: { settings: AppSettings }) => {
    const icons = [Users, Activity, UserPlus, Award];
    const accents = [
      'bg-[#087F8C]/10 text-[#087F8C] border-[#087F8C]/20',
      'bg-[#1769AA]/10 text-[#1769AA] border-[#1769AA]/20',
      'bg-[#25B8C7]/15 text-[#087F8C] border-[#25B8C7]/25',
      'bg-[#102C48]/10 text-[#172B3A] border-[#102C48]/15',
    ];
    
    return (
        <div className="relative -mt-14 z-30 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="glass-stats rounded-2xl p-6 md:p-8 grid grid-cols-2 lg:grid-cols-4 gap-6 relative overflow-hidden">
                {settings.stats.map((stat, idx) => {
                    const StatIcon = icons[idx] || Award;
                    const accentCls = accents[idx] || accents[0];
                    return (
                        <div key={idx} className="relative flex flex-col items-center text-center group/item">
                            {idx !== 0 && <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-px h-12 bg-[#DFEAF0]"></div>}
                            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-3 transition-transform duration-300 group-hover/item:-translate-y-0.5 ${accentCls}`}>
                                <StatIcon size={22} />
                            </div>
                            <h4 className="text-2xl md:text-3xl font-black text-[#172B3A] mb-1 tracking-tight fv-num">{stat.value}</h4>
                            <p className="text-[#172B3A] text-xs font-bold mb-1">{stat.label}</p>
                            <span className="text-[11px] font-medium text-[#718394]">{stat.trend}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const AboutUs = ({ settings }: { settings: AppSettings, t: any }) => {
    const isAr = settings.language === 'ar';
    return (
        <div id="about" className="py-24 relative overflow-hidden scroll-mt-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
                    <div className="relative">
                        <div className="relative rounded-3xl overflow-hidden border border-[#DFEAF0] shadow-[0_28px_60px_-22px_rgba(11,31,53,0.22)] aspect-[4/5] lg:aspect-auto lg:h-[600px]">
                            <img src={clinicFacilityImg} alt={isAr ? 'مقر مركز برادة للعيون وتجهيزاته الطبية' : 'Barrada Eye Center modern ophthalmology suite'} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F35]/90 via-[#0B1F35]/20 to-transparent"></div>
                            <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-md px-5 py-3.5 rounded-2xl shadow-lg border border-[#DFEAF0] flex items-center gap-3.5">
                                <div className="w-11 h-11 bg-[#087F8C] rounded-xl flex items-center justify-center text-white">
                                    <ShieldCheck size={22} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-[#718394]">{isAr ? 'خبرة تفوق' : 'Expertise over'}</p>
                                    <p className="text-lg font-black text-[#172B3A] fv-num">{isAr ? '20 عاماً' : '20 Years'}</p>
                                </div>
                            </div>
                            <div className="absolute bottom-6 right-6 left-6 bg-[#0B1F35]/75 backdrop-blur-xl p-6 rounded-2xl border border-white/15 text-white">
                                <h4 className="font-black text-xl mb-2 text-white">{isAr ? 'رعاية طبية بمعايير عالمية' : 'World-class Medical Care'}</h4>
                                <p className="text-sm text-slate-200 leading-relaxed font-medium">{isAr ? 'نحن في مركز براده نؤمن أن الرؤية هي أثمن ما يملكه الإنسان، ولذلك نكرس أحدث التقنيات الجراحية لخدمة أعينكم.' : 'At Barada Center, we believe vision is humanity\'s most precious asset, so we dedicate advanced surgical technologies to serve your eyes.'}</p>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <span className="text-[#087F8C] text-xs font-extrabold tracking-wide uppercase inline-block">{isAr ? 'قصتنا ونجاحنا' : 'Our Story & Success'}</span>
                            <h2 className="text-3xl md:text-5xl font-black text-[#172B3A] leading-[1.2] tracking-tight fv-balance">
                                {isAr ? (
                                    <>نصنع مستقبلاً <span className="text-[#087F8C]">أكثر إشراقاً</span> لعينيك</>
                                ) : (
                                    <>Creating a <span className="text-[#087F8C]">Brighter</span> Future for Your Eyes</>
                                )}
                            </h2>
                            <p className="text-[#718394] text-lg leading-relaxed font-medium">{isAr ? 'تأسس مركز براده ليكون الصرح الطبي الأول المتخصص في طب وجراحة العيون، حيث نجمع بين الإرث الأكاديمي والخبرة العملية والتقنيات الرقمية المتقدمة.' : 'Barada Center was founded to be a leading specialized medical facility for ophthalmology, combining academic heritage with practical experience and advanced digital technologies.'}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div className="p-7 bg-white rounded-2xl border border-[#DFEAF0] hover:border-[#087F8C]/40 shadow-[0_6px_20px_-14px_rgba(11,31,53,0.12)] transition-all">
                                <div className="w-12 h-12 bg-[#087F8C]/10 rounded-xl flex items-center justify-center text-[#087F8C] mb-5">
                                    <Target size={24} />
                                </div>
                                <h4 className="text-xl font-black text-[#172B3A] mb-2.5">{isAr ? 'رؤيتنا' : 'Our Vision'}</h4>
                                <p className="text-sm text-[#718394] leading-relaxed font-medium">{isAr ? 'أن نبقى الخيار الأول والأكثر موثوقية في الشرق الأوسط عبر تقديم حلول بصرية متكاملة وآمنة.' : 'To remain the first and most trusted choice in the Middle East by providing integrated and safe optical solutions.'}</p>
                            </div>
                            <div className="p-7 bg-white rounded-2xl border border-[#DFEAF0] hover:border-[#1769AA]/40 shadow-[0_6px_20px_-14px_rgba(11,31,53,0.12)] transition-all">
                                <div className="w-12 h-12 bg-[#1769AA]/10 rounded-xl flex items-center justify-center text-[#1769AA] mb-5">
                                    <Compass size={24} />
                                </div>
                                <h4 className="text-xl font-black text-[#172B3A] mb-2.5">{isAr ? 'رسالتنا' : 'Our Mission'}</h4>
                                <p className="text-sm text-[#718394] leading-relaxed font-medium">{isAr ? 'الالتزام بالابتكار الطبي المستمر وتوفير تجربة مريض استثنائية ترتكز على الشفافية والنتائج الملموسة.' : 'Commitment to continuous medical innovation and providing an exceptional patient experience focused on transparency and tangible results.'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Navbar = ({ 
  onNavigate, 
  onLoginClick, 
  currentUser, 
  onLogout,
  settings,
  notifications,
  onClearNotifications,
  onMarkAsRead,
  t,
  transparent = false
}: { 
  onNavigate: (section: string) => void, 
  onLoginClick: () => void, 
  currentUser: User | null,
  onLogout: () => void,
  settings: AppSettings,
  notifications: AppNotification[],
  onClearNotifications: () => void,
  onMarkAsRead: () => void,
  t: any,
  transparent?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogoClick = () => {
    if (settings.patientMode && !currentUser) {
      const newCount = logoClickCount + 1;
      if (newCount >= 5) {
        onLoginClick();
        setLogoClickCount(0);
      } else {
        setLogoClickCount(newCount);
        setTimeout(() => setLogoClickCount(0), 2000);
      }
    } else {
      onNavigate('home');
    }
  };

  const navItems = settings.patientMode ? [
    { name: t.home, id: 'home' },
    { name: t.myBookings, id: 'my-bookings' },
    { name: t.contact, id: 'contact' },
  ] : [
    { name: t.home, id: 'home' },
    { name: t.about, id: 'about' },
    { name: t.doctors, id: 'doctors' },
    { name: t.services, id: 'services' },
    { name: t.offers, id: 'offers' },
    { name: t.medicalVideos, id: 'medical-videos' },
    { name: t.myBookings, id: 'my-bookings' },
    { name: t.contact, id: 'contact' },
  ];

  return (
    <nav className={`sticky w-full z-50 top-0 transition-all duration-300 glass-navbar ${
      isScrolled 
        ? "py-0.5" 
        : "py-2"
    } ${transparent && !isScrolled ? "navbar-clear" : ""}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-18 md:h-20 items-center">
          <div className="flex items-center">
            <div className="shrink-0 flex items-center gap-2.5 cursor-pointer group glass-logo" onClick={handleLogoClick}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden border border-[#DFEAF0]/60 bg-white/90 transition-transform group-hover:scale-105 active:scale-95">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Eye size={22} className="text-[#087F8C]" />
                )}
              </div>
              <span className="font-black text-lg md:text-xl text-[#172B3A] tracking-tight fv-nav-brand transition-colors">{settings.appName}</span>
              {settings.patientMode && <span className="bg-[#087F8C]/10 text-[#087F8C] text-[9px] font-black px-2 py-0.5 rounded-md border border-[#087F8C]/20 uppercase tracking-tighter mr-1">Patient Mode</span>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => onNavigate(item.id)} className="fv-nav-link text-[#172B3A] hover:text-[#087F8C] px-3 py-2 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap glass-btn-hover">
                {item.name}
              </button>
            ))}
            
            {currentUser && (
                <div className="relative">
                    <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) onMarkAsRead(); }} className="fv-nav-icon relative p-2.5 text-[#172B3A] hover:text-[#087F8C] hover:bg-[#087F8C]/10 rounded-xl transition-all active:scale-90">
                        <Bell size={22} />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white fv-num">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                    {showNotifications && (
                        <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-2xl shadow-[0_20px_50px_-15px_rgba(11,31,53,0.2)] border border-[#DFEAF0] overflow-hidden z-[60] origin-top-left animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-3.5 border-b border-[#DFEAF0] flex justify-between items-center bg-[#F5FAFC]">
                                <h3 className="font-black text-[#172B3A] text-sm">الإشعارات</h3>
                                {notifications.length > 0 && (
                                    <button onClick={onClearNotifications} className="text-xs font-bold text-red-600 hover:text-red-700">مسح الكل</button>
                                )}
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="p-8 text-center text-[#718394]">
                                        <Bell size={30} className="mx-auto mb-2 opacity-30" />
                                        <p className="text-sm font-medium">لا توجد إشعارات جديدة</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-[#DFEAF0]/70">
                                        {notifications.map(note => (
                                            <div key={note.id} className={`p-4 hover:bg-[#F5FAFC] transition-colors ${!note.read ? 'bg-[#087F8C]/5' : ''}`}>
                                                <div className="flex items-start gap-3">
                                                    <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${note.type === 'success' ? 'bg-emerald-50 text-emerald-600' : note.type === 'warning' ? 'bg-red-50 text-red-600' : 'bg-[#087F8C]/10 text-[#087F8C]'}`}>
                                                        {note.type === 'success' ? <CheckCircle size={16} /> : note.type === 'warning' ? <AlertCircle size={16} /> : <Bell size={16} />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-bold text-[#172B3A]">{note.title}</h4>
                                                        <p className="text-xs text-[#718394] mt-0.5 leading-relaxed">{note.message}</p>
                                                        <span className="text-[10px] text-[#718394] mt-2 block fv-num">{note.date}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {currentUser ? (
              <div className="flex items-center gap-2 mr-3 border-r border-[#DFEAF0]/60 pr-3">
                 <button onClick={() => onNavigate('admin')} className="bg-[#0B1F35] hover:bg-[#102C48] text-white px-4 py-2 rounded-xl transition-all shadow-xs border border-white/10 flex items-center gap-2 text-sm font-bold active:scale-95">
                  <Settings size={16} className="text-[#25B8C7]" />
                  <span>{currentUser.name}</span>
                </button>
                <button onClick={onLogout} className="text-red-500 hover:bg-red-500/10 p-2 rounded-xl transition-all active:scale-90" title={t.logout}>
                  <LogOut size={19} />
                </button>
              </div>
            ) : !settings.patientMode && (
              <button onClick={onLoginClick} className="fv-btn-primary px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 mr-2">
                <Lock size={15} />
                {t.login}
              </button>
            )}
          </div>
          <div className="md:hidden flex items-center gap-2">
            {currentUser && (
                <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) onMarkAsRead(); }} className="fv-nav-icon relative p-2 text-[#172B3A] hover:text-[#087F8C] transition-all active:scale-90">
                    <Bell size={22} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white fv-num">
                            {unreadCount}
                        </span>
                    )}
                </button>
            )}
            <button onClick={() => setIsOpen(!isOpen)} className="fv-nav-icon text-[#172B3A] hover:text-[#087F8C] p-2 relative w-11 h-11 flex items-center justify-center transition-all overflow-hidden">
              <div className={`transition-all duration-300 transform absolute ${isOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`}>
                <Menu size={28} />
              </div>
              <div className={`transition-all duration-300 transform absolute ${isOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`}>
                <X size={28} />
              </div>
            </button>
          </div>
        </div>
      </div>
      {showNotifications && currentUser && (
        <div className="md:hidden absolute top-18 left-0 w-full bg-white border-b border-[#DFEAF0] shadow-xl z-40 max-h-[50vh] overflow-y-auto animate-in slide-in-from-top duration-300">
             <div className="p-3 border-b border-[#DFEAF0] flex justify-between items-center bg-[#F5FAFC]">
                <h3 className="font-black text-[#172B3A] text-sm">الإشعارات</h3>
                {notifications.length > 0 && (
                    <button onClick={onClearNotifications} className="text-xs font-bold text-red-600 hover:text-red-700">مسح الكل</button>
                )}
            </div>
            {notifications.length === 0 ? (
                <div className="p-8 text-center text-[#718394]">
                    <p className="text-sm font-medium">لا توجد إشعارات جديدة</p>
                </div>
            ) : (
                <div className="divide-y divide-[#DFEAF0]/70">
                    {notifications.map(note => (
                        <div key={note.id} className={`p-4 ${!note.read ? 'bg-[#087F8C]/5' : ''}`}>
                            <div className="flex items-start gap-3">
                                <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${note.type === 'success' ? 'bg-emerald-50 text-emerald-600' : note.type === 'warning' ? 'bg-red-50 text-red-600' : 'bg-[#087F8C]/10 text-[#087F8C]'}`}>
                                    {note.type === 'success' ? <CheckCircle size={16} /> : note.type === 'warning' ? <AlertCircle size={16} /> : <Bell size={16} />}
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-[#172B3A]">{note.title}</h4>
                                    <p className="text-xs text-[#718394] mt-1 leading-relaxed">{note.message}</p>
                                    <span className="text-[10px] text-[#718394] mt-2 block fv-num">{note.date}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-[#DFEAF0] absolute w-full h-[calc(100vh-4.5rem)] overflow-y-auto shadow-xl z-30 animate-in slide-in-from-right duration-300">
          <div className="px-4 pb-20 space-y-1 sm:px-6 pt-4">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => { onNavigate(item.id); setIsOpen(false); }} className="text-[#172B3A] hover:text-[#087F8C] hover:bg-[#F5FAFC] block px-4 py-4 rounded-xl text-base font-bold w-full text-right border-b border-[#DFEAF0]/60 transition-all active:scale-95">
                {item.name}
              </button>
            ))}
             {(currentUser || !settings.patientMode) && (
               <button onClick={() => { currentUser ? onLogout() : onLoginClick(); setIsOpen(false); }} className={`block px-4 py-4 rounded-xl text-base font-bold w-full text-right ${currentUser ? 'text-red-600 bg-red-50' : 'text-[#087F8C] bg-[#F5FAFC] border border-[#DFEAF0]'} mt-6 transition-all active:scale-95`}>
                  {currentUser ? t.logout : t.login}
                </button>
             )}
          </div>
        </div>
      )}
    </nav>
  );
};

const Hero = ({ onCtaClick, images, title, description, t }: { onCtaClick: () => void, images: HeroImage[], title: string, description: string, t: any }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % images.length);
    }, 5000); 
    return () => clearInterval(interval);
  }, [images.length]);
  return (
    <div id="home" className="relative min-h-[640px] md:min-h-[680px] flex items-center justify-center overflow-hidden fv-hero-stage -mt-20 pt-20">
      {images.map((img, index) => (
        <div key={img.id} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentIndex ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F35]/80 via-[#0B1F35]/65 to-[#0B1F35]/90 z-10"></div> 
          <img src={img.url} alt="Hero" className="w-full h-full object-fill" />
        </div>
      ))}
      <div className="absolute inset-0 fv-grid-pattern opacity-40 pointer-events-none z-10"></div>
      <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white pb-12">
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-6 leading-[1.15] tracking-tight drop-shadow-xl fv-balance">{title}</h1>
            <p className="text-base sm:text-lg md:text-xl mb-10 text-slate-200 leading-relaxed max-w-2xl mx-auto font-medium">{description}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={onCtaClick} className="fv-btn-primary px-9 py-4 rounded-xl text-lg font-black flex items-center justify-center gap-3">
                  <Calendar size={22} />
                  {t.arabic === 'العربية' ? 'احجز موعدك الآن' : 'Book Your Appointment Now'}
                </button>
                <button onClick={() => document.getElementById('partners')?.scrollIntoView({ behavior: 'smooth' })} className="bg-white/10 backdrop-blur-md border border-white/25 text-white px-9 py-4 rounded-xl text-lg font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-3">
                  <Handshake size={22} className="text-[#25B8C7]" />
                  {t.arabic === 'العربية' ? 'استعرض التعاقدات' : 'View Partners'}
                </button>
            </div>
        </div>
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-20 left-0 right-0 z-20 flex justify-center gap-2.5">
          {images.map((_, idx) => (
              <button key={idx} onClick={() => setCurrentIndex(idx)} className={`h-2 rounded-full transition-all duration-300 ${idx === currentIndex ? 'bg-[#25B8C7] w-9' : 'bg-white/40 hover:bg-white/75 w-2.5'}`} aria-label={`Slide ${idx + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
};

const ContactUsView = ({ onSubmit, onNavigate }: { onSubmit: (data: any) => Promise<boolean> | boolean, onNavigate: (v: string) => void }) => {
    const [form, setForm] = useState({ name: '', phone: '', type: 'suggestion', message: '' });
    const [sending, setSending] = useState(false);
    const handleSubmit = async () => {
        if(!form.name || !form.phone || !form.message) { alert('يرجى ملء جميع الحقول'); return; }
        if (sending) return;
        const submissionData = { ...form, date: new Date().toISOString().split('T')[0] };
        setSending(true);
        const ok = await onSubmit(submissionData);
        setSending(false);
        if (!ok) { alert('تعذر إرسال رسالتك، حاول مرة أخرى أو تواصل معنا تليفونياً.'); return; }
        alert('تم إرسال رسالتك بنجاح. شكراً لتواصلك معنا.');
        onNavigate('home');
    };
    const fieldCls = "w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3.5 text-[#172B3A] focus:bg-white focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] outline-hidden transition-all font-bold";
    return (
        <div className="py-16 md:py-20 min-h-screen">
            <div className="max-w-2xl mx-auto px-4">
                <div className="bg-white rounded-3xl shadow-[0_20px_50px_-20px_rgba(11,31,53,0.14)] p-8 md:p-10 border border-[#DFEAF0]">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 mb-4">
                            <MessageCircle size={28} />
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black text-[#172B3A]">تواصل معنا</h2>
                        <p className="text-[#718394] text-sm font-medium mt-2">يسعدنا استقبال مقترحاتكم واستفساركم في أي وقت</p>
                    </div>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-[#718394] mb-1.5">الاسم الكريم</label>
                            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={fieldCls} placeholder="الاسم" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#718394] mb-1.5">رقم الهاتف</label>
                            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className={`${fieldCls} text-left fv-num`} dir="ltr" placeholder="01xxxxxxxxx" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#718394] mb-2">نوع الرسالة</label>
                            <div className="flex gap-3">
                                <label className="flex items-center gap-2.5 cursor-pointer bg-[#F5FAFC] p-3.5 rounded-xl flex-1 border border-[#DFEAF0] hover:border-[#087F8C]/40 transition-colors font-bold text-sm text-[#172B3A]">
                                    <input type="radio" name="type" value="suggestion" checked={form.type === 'suggestion'} onChange={e => setForm({...form, type: e.target.value})} className="accent-[#087F8C]" />
                                    <span>اقتراح / استفسار</span>
                                </label>
                                <label className="flex items-center gap-2.5 cursor-pointer bg-[#F5FAFC] p-3.5 rounded-xl flex-1 border border-[#DFEAF0] hover:border-red-300 transition-colors font-bold text-sm text-[#172B3A]">
                                    <input type="radio" name="type" value="complaint" checked={form.type === 'complaint'} onChange={e => setForm({...form, type: e.target.value})} className="accent-red-600" />
                                    <span>شكوى</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#718394] mb-1.5">الرسالة</label>
                            <textarea rows={5} value={form.message} onChange={e => setForm({...form, message: e.target.value})} className={fieldCls} placeholder="اكتب تفاصيل رسالتك هنا..." />
                        </div>
                        <div className="flex gap-3 pt-3">
                            <button onClick={handleSubmit} disabled={sending} className="flex-1 fv-btn-primary font-black py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                                <Send size={18} /> إرسال
                            </button>
                            <button onClick={() => onNavigate('home')} className="px-6 py-3.5 border border-[#DFEAF0] rounded-xl text-[#718394] font-bold hover:bg-[#F5FAFC] hover:text-[#172B3A] transition-colors">إلغاء</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
};

const AiAssistant = ({ language }: { language: 'ar' | 'en' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isOpen]);
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    // Client-side message length validation
    if (input.length > MAX_AI_MESSAGE_LENGTH) {
      setMessages(prev => [...prev, { 
        role: 'model', 
        text: language === 'ar' 
          ? `الرسالة طويلة جداً. الحد الأقصى ${MAX_AI_MESSAGE_LENGTH} حرف.`
          : `Message too long. Maximum length is ${MAX_AI_MESSAGE_LENGTH} characters.`
      }]);
      return;
    }
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);
    try {
      const { data, error } = await invokeBackend('ai-chat', {
        body: { message: userMessage, language, history: messages.slice(-6) }
      });
      
      if (error) {
        throw error;
      }
      
      setMessages(prev => [...prev, { role: 'model', text: data?.response || '' }]);
    } catch (err) {
      const status = typeof (err as any)?.status === 'number' ? (err as any).status : undefined;
      const errMsg = err instanceof Error ? err.message : '';
      let fallback = language === 'ar'
        ? 'عذراً، حدث خطأ أثناء الاتصال بالمساعد الذكي.'
        : 'Sorry, an error occurred while connecting to the smart assistant.';
      if (status === 429) {
        fallback = language === 'ar'
          ? 'تم تجاوز الحد المسموح حالياً. يرجى المحاولة مرة أخرى بعد قليل.'
          : 'Too many requests right now. Please try again in a moment.';
      } else if (/Settings > Secrets|API key/i.test(errMsg)) {
        fallback = language === 'ar'
          ? 'خدمة المساعد الذكي غير مفعّلة حالياً (يرجى التحقق من مفتاح Gemini API في Settings > Secrets).'
          : errMsg;
      }
      setMessages(prev => [...prev, { role: 'model', text: fallback }]);
    } finally { setIsLoading(false); }
  };
  return (
    <>
      <div className={`fixed bottom-6 left-6 z-[60] transition-all duration-300 ${isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}>
        <button onClick={() => setIsOpen(true)} className="bg-transparent border-0 p-0 cursor-pointer transition-all hover:scale-110 animate-bounce focus:outline-hidden" title={language === 'ar' ? "المساعد الذكي" : "Smart Assistant"} aria-label={language === 'ar' ? "المساعد الذكي" : "Smart Assistant"}>
           <img src="/assets/ai-robot-mascot.png" alt={language === 'ar' ? "المساعد الذكي" : "Smart Assistant"} referrerPolicy="no-referrer" className="w-20 h-20 object-contain drop-shadow-[0_10px_18px_rgba(8,127,140,0.45)] select-none pointer-events-none" />
        </button>
      </div>
      <div className={`fixed bottom-24 left-6 z-[60] w-[350px] max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-[#DFEAF0] overflow-hidden transition-all duration-300 origin-bottom-left flex flex-col ${isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-10 pointer-events-none'}`}>
          <div className="bg-gradient-to-l from-[#0B1F35] via-[#102C48] to-[#087F8C] p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                  <img src="/assets/ai-robot-mascot.png" alt="" referrerPolicy="no-referrer" className="w-7 h-7 object-contain" />
                  <h3 className="font-bold">{language === 'ar' ? "المساعد الذكي" : "Smart Assistant"}</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-lg transition-colors"><X size={20} /></button>
          </div>
          <div className="h-80 overflow-y-auto p-4 space-y-4 bg-[#F5FAFC]">
              {messages.length === 0 && (
                  <div className="text-center text-[#718394] mt-16">
                      <img src="/assets/ai-robot-mascot.png" alt="" referrerPolicy="no-referrer" className="w-16 h-16 object-contain mx-auto mb-2 drop-shadow-xs" />
                      <p className="text-sm font-semibold">{language === 'ar' ? "مرحباً! كيف يمكنني مساعدتك اليوم؟" : "Hello! How can I help you today?"}</p>
                  </div>
              )}
              {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-line ${msg.role === 'user' ? 'bg-[#087F8C] text-white rounded-tr-none' : 'bg-white text-[#172B3A] shadow-xs border border-[#DFEAF0] rounded-tl-none'}`}>
                          {msg.text}
                      </div>
                  </div>
              ))}
              {isLoading && (
                  <div className="flex justify-end">
                        <div className="bg-white text-[#718394] shadow-xs border border-[#DFEAF0] rounded-2xl rounded-tl-none p-3 text-sm">
                          <span className="animate-pulse">{language === 'ar' ? "جاري الكتابة..." : "Typing..."}</span>
                        </div>
                  </div>
              )}
              <div ref={chatEndRef} />
          </div>
          <div className="p-3.5 bg-white border-t border-[#DFEAF0] flex gap-2">
              <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={language === 'ar' ? "اكتب استفسارك هنا..." : "Type your query here..."} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] text-sm text-[#172B3A]" />
              <button onClick={handleSend} disabled={isLoading} className="fv-btn-primary p-3 rounded-xl disabled:opacity-50">
                  <Send size={18} className={isLoading ? "opacity-0" : ""} />
              </button>
          </div>
      </div>
    </>
  );
};

const AdminPanel = ({ 
  doctors, setDoctors, users, setUsers, currentUser, currentUserUuid, allBookings, setBookings, operations, setOperations,
  onCancelBooking, onConfirmBooking, onEditBooking, onDeleteBooking, onSendReminder,
  complaints, setComplaints, heroImages, setHeroImages, partners, setPartners, settings, setSettings, services, setServices, t, handleWhatsAppReminder, handleSmsReminder, onConfirmPayment, onOffersChanged, onVideosChanged, onNotify
}: { 
  doctors: Doctor[], setDoctors: React.Dispatch<React.SetStateAction<Doctor[]>>, users: User[], setUsers: React.Dispatch<React.SetStateAction<User[]>>, currentUser: User, currentUserUuid?: string, allBookings: Booking[], setBookings: React.Dispatch<React.SetStateAction<Booking[]>>, operations: Operation[], setOperations: React.Dispatch<React.SetStateAction<Operation[]>>, onCancelBooking: (id: number) => void, onConfirmBooking: (id: number) => void, onEditBooking: (booking: Booking) => void, onDeleteBooking: (id: number) => void, onSendReminder: (id: number, itemType: 'booking' | 'operation') => void, complaints: Complaint[], setComplaints: React.Dispatch<React.SetStateAction<Complaint[]>>, heroImages: HeroImage[], setHeroImages: React.Dispatch<React.SetStateAction<HeroImage[]>>, partners: Partner[], setPartners: React.Dispatch<React.SetStateAction<Partner[]>>, settings: AppSettings, setSettings: React.Dispatch<React.SetStateAction<AppSettings>>, services: ServiceItem[], setServices: React.Dispatch<React.SetStateAction<ServiceItem[]>>, t: any, handleWhatsAppReminder: (rem: any) => void, handleSmsReminder: (rem: any) => void, onConfirmPayment: (id: number) => void, onOffersChanged?: () => void, onVideosChanged?: () => void, onNotify?: (title: string, message: string, type: 'success' | 'warning' | 'info') => void
}) => {
  // Access realtime data for Supabase operations
  const { data: realtimeData, isLoading: realtimeLoading } = useRealtimeSync({ enabled: true });
  
  const [activeTab, setActiveTab] = useState<'overview' | 'doctors' | 'users' | 'bookings' | 'reports' | 'hero-images' | 'partners' | 'settings' | 'services' | 'offers' | 'medical-videos' | 'complaints' | 'reminders' | 'backup' | 'operations' | 'patient-stats' | 'intelligence' | 'payments' | 'contact-logs' | 'paymob-settings'>('overview');
  const [contactLogs, setContactLogs] = useState<any[]>([]);
  const [contactLogsLoading, setContactLogsLoading] = useState(false);
  const [contactStaffFilter, setContactStaffFilter] = useState('');
  const [contactDoctorFilter, setContactDoctorFilter] = useState('');
  const [contactDateFrom, setContactDateFrom] = useState('');
  const [contactDateTo, setContactDateTo] = useState('');
  const contactStaffOptions = [...new Set(contactLogs.map(l => l.staff_name).filter(Boolean))].sort() as string[];
  const contactDoctorOptions = [...new Set(contactLogs.map(l => l.doctor_name).filter(Boolean))].sort() as string[];
  const filteredContactLogs = contactLogs.filter(l => {
    const day = cairoTodayStr(new Date(l.created_at));
    return (!contactStaffFilter || l.staff_name === contactStaffFilter) && (!contactDoctorFilter || l.doctor_name === contactDoctorFilter)
      && (!contactDateFrom || day >= contactDateFrom) && (!contactDateTo || day <= contactDateTo);
  });
  const [newDoctor, setNewDoctor] = useState({ name: '', specialty: '', image: '', maxPatients: 10, fee: 150, availableDates: [] as string[], patientsPerHour: 4, topSpecialtiesStr: '', experience: 10, education: '', followUpExamCount: 2, followUpSurgeryCount: 3, facebookUrl: '', youtubeUrl: '', tiktokUrl: '', websiteUrl: '', instagramUrl: '', xUrl: '' });
  const [dateInput, setDateInput] = useState('');
  const [editingDoctorId, setEditingDoctorId] = useState<number | null>(null);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'staff' as 'admin' | 'staff', permissions: [] as string[] });
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [newHeroImageUrl, setNewHeroImageUrl] = useState('');
  const [newPartner, setNewPartner] = useState({ name: '', logo: '', description: '' });
  const [newService, setNewService] = useState({ title: '', description: '', iconName: 'Eye', color: 'text-blue-600', price: 200 });
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [newOp, setNewOp] = useState<Omit<Operation, 'id' | 'reminderSent' | 'status'>>({ patientName: '', patientPhone: '', patientPhone2: '', patientEmail: '', patientAge: undefined, doctorName: '', surgeryType: '', date: '', cost: 0, notes: '', contractingCompanyId: undefined });
  const [editingOpId, setEditingOpId] = useState<number | null>(null);
  const [tempSettings, setTempSettings] = useState<AppSettings>(settings);
  const [phonesInput, setPhonesInput] = useState(settings.phones.join('\n'));
  const [addressesInput, setAddressesInput] = useState(settings.addresses.join('\n'));
  const [bookingStart, setBookingStart] = useState('');
  const [bookingEnd, setBookingEnd] = useState('');
  const [bookingDoctorId, setBookingDoctorId] = useState('');
  const [bookingStatus, setBookingStatus] = useState<string>('');
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState<string>(''); // New Payment Status Filter
  const [bookingPatientName, setBookingPatientName] = useState<string>('');
  const [bookingService, setBookingService] = useState<string>('');
  const [bookingAddressFilter, setBookingAddressFilter] = useState<string>('');
  const [bookingContractingId, setBookingContractingId] = useState<string>(''); 
  const [bookingPhoneFilter, setBookingPhoneFilter] = useState<string>(''); 
  const [contractingList, setContractingList] = useState<ContractingCompany[]>([]); 
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const [analyticsStart, setAnalyticsStart] = useState('');
  const [analyticsEnd, setAnalyticsEnd] = useState('');

  const [opFilterDoctor, setOpFilterDoctor] = useState('');
  const [opFilterService, setOpFilterService] = useState('');
  const [opFilterStatus, setOpFilterStatus] = useState(''); 
  const [opFilterStart, setOpFilterStart] = useState('');
  const [opFilterEnd, setOpFilterEnd] = useState('');
  const [opFilterContracting, setOpFilterContracting] = useState(''); // Added
  const [opSearchName, setOpSearchName] = useState('');
  const [opSearchPhone, setOpSearchPhone] = useState(''); 
  const [reminderFilterService, setReminderFilterService] = useState('');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [reportSortBy, setReportSortBy] = useState<'total' | 'bookings' | 'operations'>('total');
  const [backupFileName, setBackupFileName] = useState(`barada_backup_${new Date().toISOString().split('T')[0]}`);

  const [complaintSearch, setComplaintSearch] = useState('');
  const [complaintStart, setComplaintStart] = useState('');
  const [complaintEnd, setComplaintEnd] = useState('');
  
  const [deletingBookingId, setDeletingBookingId] = useState<number | null>(null);
  const [deletingDoctorId, setDeletingDoctorId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [deletingPartnerId, setDeletingPartnerId] = useState<number | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<number | null>(null);
  const [deletingOpIdModal, setDeletingOpIdModal] = useState<number | null>(null);
  const [deletingHeroImageId, setDeletingHeroImageId] = useState<number | null>(null);
  const [clearingContactLogsModal, setClearingContactLogsModal] = useState(false);
  const [isClearingContactLogs, setIsClearingContactLogs] = useState(false);
  const [contactLogsNotice, setContactLogsNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [doctorSearchTerm, setDoctorSearchTerm] = useState('');

  const fetchContactLogs = async () => {
    setContactLogsLoading(true);
    try {
      const { data, error } = await supabase.from('contact_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (!error && data) setContactLogs(data);
    } catch { /* silent */ }
    setContactLogsLoading(false);
  };

  const handleClearContactLogs = async () => {
    if (currentUser?.role !== 'admin') return;
    setIsClearingContactLogs(true);
    setContactLogsNotice(null);
    try {
      const { error } = await supabase
        .from('contact_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        console.error('Error clearing contact logs:', error);
        setContactLogsNotice({ type: 'error', message: 'تعذر مسح سجل الاتصالات والتذكيرات.' });
        return;
      }
      setContactLogs([]);
      setClearingContactLogsModal(false);
      setContactLogsNotice({ type: 'success', message: 'تم مسح سجل الاتصالات والتذكيرات بنجاح.' });
    } catch (err) {
      console.error('Error clearing contact logs:', err);
      setContactLogsNotice({ type: 'error', message: 'حدث خطأ أثناء مسح سجل الاتصالات والتذكيرات.' });
    } finally {
      setIsClearingContactLogs(false);
    }
  };

  // Staff only open the sections the manager allowed; land on the first allowed one.
  const permissionsKey = `${currentUser?.role}|${(currentUser?.permissions || []).join(',')}`;
  useEffect(() => {
    if (canAccessSection(currentUser, activeTab)) return;
    const first = firstAccessibleSection(currentUser);
    if (!first) return;
    setActiveTab(first);
    if (first === 'contact-logs' && contactLogs.length === 0) fetchContactLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsKey, activeTab]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onloadend = () => setter(reader.result as string); reader.readAsDataURL(file); }
  };

  useEffect(() => {
      const load = () => ContractingManager.getAll().then(setContractingList);
      ContractingManager.importDeviceListOnce().then(load);
      window.addEventListener(CONTRACTING_CHANGED_EVENT, load);
      return () => window.removeEventListener(CONTRACTING_CHANGED_EVENT, load);
  }, []);

  // Keep the settings form in step with the settings saved in the database (they can finish
  // loading after the dashboard opens), so saving never sends older values back.
  useEffect(() => {
      setTempSettings(settings);
      setPhonesInput(settings.phones.join('\n'));
      setAddressesInput(settings.addresses.join('\n'));
  }, [settings]);

const handlePrint = (title: string, contentHtml: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  // Sanitize all HTML content to prevent XSS attacks
  const sanitizedContent = DOMPurify.sanitize(contentHtml, {
    ALLOWED_TAGS: ['div', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'ul', 'li', 'br'],
    ALLOWED_ATTR: ['class', 'style'],
    ALLOW_DATA_ATTR: false
  });
  const sanitizedTitle = DOMPurify.sanitize(title);
  const sanitizedAppName = DOMPurify.sanitize(settings.appName);
  
  printWindow.document.write(`
    <html lang="ar" dir="rtl">
      <head>
        <title>${sanitizedTitle}</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline';">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
          
          /* إعدادات الصفحة والهوامش */
          @page { 
            margin: 5mm !important; 
            size: auto; 
          }
          
          body { 
            font-family: 'Cairo', sans-serif; 
            margin: 0; 
            padding: 5mm; 
            color: #333; 
            font-size: 10pt; 
            line-height: 1.2;
          }

          /* --- إخفاء صورة الطبيب واللوجو نهائياً --- */
          img, .Image, [class*="image"], [class*="avatar"] { 
            display: none !important; 
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            margin: 0 !important;
          }

          .header { 
            text-align: center; 
            border-bottom: 2px solid #2563eb; 
            margin-bottom: 10px; 
            padding-bottom: 5px; 
          }
          
          .header h1 { 
            margin: 0; 
            font-size: 16pt; 
            color: #1e3a8a; 
          }
          
          .header h2 { 
            margin: 5px 0 0; 
            font-size: 12pt; 
            color: #64748b; 
          }

          /* تحسين جداول البيانات */
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 10px; 
          }
          
          th, td { 
            border: 1px solid #e2e8f0; 
            padding: 3px 6px !important; /* تصغير الهوامش الداخلية */
            text-align: right; 
            font-size: 9pt; 
          }
          
          th { 
            background-color: #f8fafc !important; 
            -webkit-print-color-adjust: exact;
          }

          tr { 
            height: auto !important; /* تقليل ارتفاع الصفوف */
          }

          .footer { 
            margin-top: 20px; 
            font-size: 8pt; 
            text-align: center; 
            color: #94a3b8; 
            border-top: 1px dashed #e2e8f0; 
            padding-top: 10px; 
          }

          .no-print { display: none !important; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${sanitizedAppName}</h1>
          <h2>${sanitizedTitle}</h2>
        </div>
        <div class="content">
          ${sanitizedContent}
        </div>
        <div class="footer">
          تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')} | ${sanitizedAppName}
        </div>
        <script>
          window.onload = function() {
            // حذف أي صور قد تكون تسللت داخل contentHtml برمجياً قبل الطباعة
            document.querySelectorAll('img').forEach(function(img) { img.remove(); });
            window.print();
            window.close();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

  // Mirrors doctor changes to the shared database so booking limits are enforced for everyone.
  const findDbDoctor = (localId: number, name?: string) =>
    realtimeData.doctors.find((r: any) => parseInt(r.id.slice(-8), 16) === localId) ||
    (name ? realtimeData.doctors.find((r: any) => r.name === name) : undefined);
  const saveDoctorToDb = async (doc: Doctor, previousName?: string) => {
    const existing = findDbDoctor(doc.id, previousName ?? doc.name);
    const row = doctorToRow(doc);
    const { error } = existing
      ? await supabase.from('doctors').update(row as any).eq('id', existing.id)
      : await supabase.from('doctors').insert(row as any);
    if (error) console.error('Error saving doctor:', error);
  };
  const deleteDoctorFromDb = async (doc: Doctor | undefined) => {
    if (!doc) return;
    const existing = findDbDoctor(doc.id, doc.name);
    if (!existing) return;
    const { error } = await supabase.from('doctors').delete().eq('id', existing.id);
    if (error) console.error('Error deleting doctor:', error);
  };

  const handleAddDoctor = () => {
    if (!newDoctor.name || !newDoctor.specialty) return;
    if (editingDoctorId) {
      const prevDoc = doctors.find(d => d.id === editingDoctorId);
      if (prevDoc) {
        const updated: Doctor = { ...prevDoc, name: newDoctor.name, specialty: newDoctor.specialty, image: newDoctor.image || prevDoc.image, maxPatients: Number(newDoctor.maxPatients), fee: Number(newDoctor.fee), topSpecialties: newDoctor.topSpecialtiesStr.split(',').map(s => s.trim()).filter(Boolean), availableDates: newDoctor.availableDates, patientsPerHour: Number(newDoctor.patientsPerHour), experience: Number(newDoctor.experience), education: newDoctor.education, followUpExamCount: Number(newDoctor.followUpExamCount), followUpSurgeryCount: Number(newDoctor.followUpSurgeryCount), facebookUrl: newDoctor.facebookUrl.trim(), youtubeUrl: newDoctor.youtubeUrl.trim(), tiktokUrl: newDoctor.tiktokUrl.trim(), websiteUrl: newDoctor.websiteUrl.trim(), instagramUrl: newDoctor.instagramUrl.trim(), xUrl: newDoctor.xUrl.trim() };
        setDoctors(prev => prev.map(d => d.id === editingDoctorId ? updated : d));
        saveDoctorToDb(updated, prevDoc.name);
      }
      setEditingDoctorId(null);
      alert('تم تحديث بيانات الطبيب بنجاح');
    } else {
      const doctor: Doctor = { id: Date.now(), name: newDoctor.name, specialty: newDoctor.specialty, image: newDoctor.image || 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=400&h=400', maxPatients: Number(newDoctor.maxPatients), currentBookings: 0, fee: Number(newDoctor.fee), rating: 5.0, topSpecialties: newDoctor.topSpecialtiesStr.split(',').map(s => s.trim()).filter(Boolean), availableDates: newDoctor.availableDates, patientsPerHour: Number(newDoctor.patientsPerHour) || 4, experience: Number(newDoctor.experience), education: newDoctor.education, followUpExamCount: Number(newDoctor.followUpExamCount) || 2, followUpSurgeryCount: Number(newDoctor.followUpSurgeryCount) || 3, facebookUrl: newDoctor.facebookUrl.trim(), youtubeUrl: newDoctor.youtubeUrl.trim(), tiktokUrl: newDoctor.tiktokUrl.trim(), websiteUrl: newDoctor.websiteUrl.trim(), instagramUrl: newDoctor.instagramUrl.trim(), xUrl: newDoctor.xUrl.trim() };
      setDoctors(prev => [...prev, doctor]);
      saveDoctorToDb(doctor);
      alert('تم إضافة الطبيب بنجاح');
    }
    setNewDoctor({ name: '', specialty: '', image: '', maxPatients: 10, fee: 150, availableDates: [], patientsPerHour: 4, topSpecialtiesStr: '', experience: 10, education: '', followUpExamCount: 2, followUpSurgeryCount: 3, facebookUrl: '', youtubeUrl: '', tiktokUrl: '', websiteUrl: '', instagramUrl: '', xUrl: '' });
  };

  const handleEditDoctorRequest = (doc: Doctor) => {
    setEditingDoctorId(doc.id);
    setNewDoctor({ name: doc.name, specialty: doc.specialty, image: doc.image, maxPatients: doc.maxPatients, fee: doc.fee, availableDates: doc.availableDates, patientsPerHour: doc.patientsPerHour, topSpecialtiesStr: doc.topSpecialties.join(', '), experience: doc.experience, education: doc.education, followUpExamCount: doc.followUpExamCount || 2, followUpSurgeryCount: doc.followUpSurgeryCount || 3, facebookUrl: doc.facebookUrl || '', youtubeUrl: doc.youtubeUrl || '', tiktokUrl: doc.tiktokUrl || '', websiteUrl: doc.websiteUrl || '', instagramUrl: doc.instagramUrl || '', xUrl: doc.xUrl || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddDateToNewDoctor = () => { if (!dateInput) return; if (newDoctor.availableDates.includes(dateInput)) { alert('هذا التاريخ مضاف بالفعل'); return; } setNewDoctor(prev => ({ ...prev, availableDates: [...prev.availableDates, dateInput] })); setDateInput(''); };
  const handleRemoveDateFromNewDoctor = (date: string) => { setNewDoctor(prev => ({ ...prev, availableDates: prev.availableDates.filter(d => d !== date) })); };
  const handleTogglePermission = (permId: string) => { setNewUser(prev => ({ ...prev, permissions: prev.permissions.includes(permId) ? prev.permissions.filter(p => p !== permId) : [...prev.permissions, permId] })); };

  const handleSaveUser = () => {
    if (!newUser.name || !newUser.username || !newUser.password) { alert('يرجى ملء جميع الحقول المطلوبة للمستخدم'); return; }
    if (editingUserId) { setUsers(prev => prev.map(u => u.id === editingUserId ? { ...u, name: newUser.name, username: newUser.username, password: newUser.password, role: newUser.role, permissions: newUser.permissions } : u)); setEditingUserId(null); alert('تم تحديث بيانات المستخدم بنجاح'); } else { setUsers(prev => [...prev, { ...newUser, id: Date.now() }]); alert('تم إضافة المستخدم بنجاح'); }
    setNewUser({ name: '', username: '', password: '', role: 'staff', permissions: [] });
  };

  const handleEditUserClick = (u: User) => { setEditingUserId(u.id); setNewUser({ name: u.name, username: u.username, password: u.password || '', role: u.role, permissions: [...u.permissions] }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleAddHeroImage = async () => { if (!newHeroImageUrl) return; const { data, error } = await supabase.from('hero_images').insert({ url: newHeroImageUrl }).select().single(); if (error || !data) { console.error('Error saving hero image:', error); alert('تعذر حفظ الصورة. حاول مرة أخرى.'); return; } setHeroImages(prev => [...prev, mapHeroRow(data)]); setNewHeroImageUrl(''); alert('تم إضافة الصورة للواجهة'); };
  const handleDeleteHeroImage = (id: number) => { setDeletingHeroImageId(id); };
  const confirmDeleteHeroImage = async () => { const img = heroImages.find(i => i.id === deletingHeroImageId); if (img?.dbId) { const { error } = await supabase.from('hero_images').delete().eq('id', img.dbId); if (error) { console.error('Error deleting hero image:', error); alert('تعذر حذف الصورة. حاول مرة أخرى.'); setDeletingHeroImageId(null); return; } } setHeroImages(prev => prev.filter(i => i.id !== deletingHeroImageId)); setDeletingHeroImageId(null); };
  
  const handleAddPartner = async () => { if (!newPartner.name) return; const { data, error } = await supabase.from('partners').insert({ name: newPartner.name, description: newPartner.description, logo: newPartner.logo || 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&q=80&w=300&h=300' }).select().single(); if (error || !data) { console.error('Error saving partner:', error); alert('تعذر حفظ جهة التعاقد. حاول مرة أخرى.'); return; } setPartners(prev => [...prev, mapPartnerRow(data)]); setNewPartner({ name: '', logo: '', description: '' }); alert('تم إضافة جهة التعاقد بنجاح'); };
  const confirmDeletePartner = async () => { const partner = partners.find(p => p.id === deletingPartnerId); if (partner?.dbId) { const { error } = await supabase.from('partners').delete().eq('id', partner.dbId); if (error) { console.error('Error deleting partner:', error); alert('تعذر حذف جهة التعاقد. حاول مرة أخرى.'); setDeletingPartnerId(null); return; } } setPartners(prev => prev.filter(p => p.id !== deletingPartnerId)); setDeletingPartnerId(null); };
  
  const handleAddService = async () => { 
    if (!newService.title) return;
    
    try {
      const serviceData = {
        title: newService.title,
        description: newService.description || null,
        icon_name: newService.iconName || 'Eye',
        color: newService.color || 'text-blue-600',
        price: newService.price || 0,
      };
      
      if (editingServiceId) {
        // Find the original UUID from realtime data
        const originalService = realtimeData.services.find((s: any) => 
          parseInt(s.id.slice(-8), 16) === editingServiceId
        );
        
        if (originalService) {
          const { error } = await supabase
            .from('services')
            .update(serviceData)
            .eq('id', originalService.id);
            
          if (error) throw error;
          alert('تم تحديث الخدمة بنجاح');
        } else {
          // Fallback to local update
          setServices(prev => prev.map(s => s.id === editingServiceId ? { ...newService, id: editingServiceId } : s));
          alert('تم تحديث الخدمة بنجاح');
        }
        setEditingServiceId(null);
      } else {
        const { error } = await supabase
          .from('services')
          .insert([serviceData]);
          
        if (error) throw error;
        alert('تم إضافة الخدمة بنجاح');
      }
      
      setNewService({ title: '', description: '', iconName: 'Eye', color: 'text-blue-600', price: 200 });
    } catch (error: any) {
      console.error('Error saving service:', error);
      alert('حدث خطأ أثناء حفظ الخدمة. يرجى المحاولة مرة أخرى.');
    }
  };

  const handleEditServiceClick = (service: ServiceItem) => {
    setEditingServiceId(service.id);
    setNewService({ ...service });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteComplaint = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return;
    const target = complaints.find(c => c.id === id);
    if (target?.dbId && !(await deleteComplaint(target.dbId))) return;
    setComplaints(prev => prev.filter(c => c.id !== id));
  };
  const handleSaveSettings = async () => {
    const nextSettings = { ...tempSettings, phones: phonesInput.split('\n').filter(Boolean), addresses: addressesInput.split('\n').filter(Boolean) };
    setSettings(nextSettings);
    const values = settingsToRow(nextSettings) as any;
    const { data: row } = await supabase.from('app_settings').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const { error } = row
      ? await supabase.from('app_settings').update({ ...values, updated_at: new Date().toISOString() }).eq('id', row.id)
      : await supabase.from('app_settings').insert(values);
    if (error) { console.error('Failed to save settings:', error); alert('تعذر حفظ الإعدادات لكل الزوار. حاول مرة أخرى.'); return; }
    alert('تم حفظ الإعدادات بنجاح');
  };
  const handleGetCurrentLocation = () => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((position) => { const lat = position.coords.latitude; const lng = position.coords.longitude; setTempSettings(prev => ({ ...prev, mapLocationUrl: `https://www.google.com/maps?q=${lat},${lng}` })); }, (error) => alert('تعذر تحديد الموقع.')); } else alert('المتصفح لا يدعم تحديد الموقع.'); };

  // Helper function to validate operation input
  const validateOperationInput = (): boolean => {
    if (!newOp.patientName || !newOp.doctorName || !newOp.surgeryType || !newOp.date) { 
      alert('يرجى ملء جميع الحقول المطلوبة للعملية'); 
      return false; 
    }
    
    // Validate phone number format if provided
    const egyptianPhoneRegex = /^01[0-9]{9}$/;
    if (newOp.patientPhone && newOp.patientPhone.trim() !== '' && !egyptianPhoneRegex.test(newOp.patientPhone)) {
      alert('عذراً، يجب أن يكون رقم الهاتف 11 رقماً ويبدأ بـ 01 (مثال: 01012345678).');
      return false;
    }
    if (newOp.patientPhone2 && newOp.patientPhone2.trim() !== '' && !egyptianPhoneRegex.test(newOp.patientPhone2)) {
      alert('عذراً، يجب أن يكون رقم الهاتف الثاني 11 رقماً ويبدأ بـ 01 (مثال: 01012345678).');
      return false;
    }
    
    // Validate email format if provided
    if (newOp.patientEmail && newOp.patientEmail.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newOp.patientEmail.trim())) {
        alert('عذراً، صيغة البريد الإلكتروني غير صحيحة.');
        return false;
      }
      if (newOp.patientEmail.length > 255) {
        alert('عذراً، البريد الإلكتروني طويل جداً (الحد الأقصى 255 حرف).');
        return false;
      }
    }
    
    // Validate cost is a positive number
    if (newOp.cost < 0 || newOp.cost > 1000000) {
      alert('عذراً، يجب أن تكون التكلفة بين 0 و 1,000,000 جنيه.');
      return false;
    }

    // Validate age if provided
    if (newOp.patientAge !== undefined && (isNaN(newOp.patientAge) || newOp.patientAge < 1 || newOp.patientAge > 120)) {
      alert('عذراً، يجب أن يكون السن بين 1 و 120 سنة.');
      return false;
    }
    
    return true;
  };

  const handleAddOp = async () => {
    if (!validateOperationInput()) return;
    const saved = await createOperation({ ...newOp, status: 'pending', reminderSent: false });
    if (!saved) return;
    setOperations(prev => prev.some(o => o.dbId === saved.dbId) ? prev : [...prev, saved]);
    setNewOp({ patientName: '', patientPhone: '', patientPhone2: '', patientEmail: '', patientAge: undefined, doctorName: '', surgeryType: '', date: '', cost: 0, notes: '', contractingCompanyId: undefined }); alert('تمت إضافة العملية بنجاح');
  };

  const handleSaveOpEdit = async () => {
    if (!editingOpId) return;
    if (!validateOperationInput()) return;
    const target = operations.find(o => o.id === editingOpId);
    if (target?.dbId && !(await updateOperation(target.dbId, newOp))) return;
    setOperations(prev => prev.map(o => o.id === editingOpId ? { ...o, patientName: newOp.patientName, patientPhone: newOp.patientPhone, patientPhone2: newOp.patientPhone2, patientEmail: newOp.patientEmail, patientAge: newOp.patientAge, doctorName: newOp.doctorName, surgeryType: newOp.surgeryType, date: newOp.date, cost: newOp.cost, notes: newOp.notes, contractingCompanyId: newOp.contractingCompanyId } : o));
    setEditingOpId(null); setNewOp({ patientName: '', patientPhone: '', patientPhone2: '', patientEmail: '', patientAge: undefined, doctorName: '', surgeryType: '', date: '', cost: 0, notes: '', contractingCompanyId: undefined }); alert('تم تحديث بيانات العملية بنجاح');
  };

  const handleToggleOpStatus = async (id: number, status: 'confirmed' | 'cancelled' | 'pending') => {
    const target = operations.find(o => o.id === id);
    if (target?.dbId && !(await setOperationFields(target.dbId, { status }))) return;
    setOperations(prev => prev.map(op => op.id === id ? { ...op, status } : op));
  };

  const handleStartEditOp = (op: Operation) => { setEditingOpId(op.id); setNewOp({ patientName: op.patientName, patientPhone: op.patientPhone || '', patientPhone2: op.patientPhone2 || '', patientEmail: op.patientEmail || '', patientAge: op.patientAge, doctorName: op.doctorName, surgeryType: op.surgeryType, date: op.date, cost: op.cost, notes: op.notes || '', contractingCompanyId: op.contractingCompanyId }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  
  const handleExportData = () => { void downloadFullBackup(backupFileName); };
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void restoreFromFile(file); };

  const filteredBookings = allBookings.filter(b => { 
    let matches = true; 
    if (bookingStart) matches = matches && b.date >= bookingStart; 
    if (bookingEnd) matches = matches && b.date <= bookingEnd; 
    if (bookingDoctorId) matches = matches && b.doctorId === Number(bookingDoctorId); 
    if (bookingStatus) matches = matches && b.status === bookingStatus; 
    if (bookingPaymentStatus) matches = matches && b.paymentStatus === bookingPaymentStatus; // Updated logic
    if (bookingPatientName) matches = matches && b.patientName.toLowerCase().includes(bookingPatientName.toLowerCase()); 
    if (bookingPhoneFilter) matches = matches && !!(b.phone.includes(bookingPhoneFilter) || (b.phone2 && b.phone2.includes(bookingPhoneFilter)));
    if (bookingService) matches = matches && b.service === bookingService; 
    if (bookingAddressFilter) matches = matches && b.address?.toLowerCase().includes(bookingAddressFilter.toLowerCase());
    if (bookingContractingId) matches = matches && b.contractingCompanyId === Number(bookingContractingId);
    return matches; 
  }).sort((a, b) => { 
    let comparison = a.date.localeCompare(b.date); 
    if (comparison === 0) comparison = TIME_SLOTS.indexOf(a.time) - TIME_SLOTS.indexOf(b.time); 
    return sortDirection === 'asc' ? comparison : -comparison; 
  });

  const filteredOperations = operations.filter(op => { 
    let matches = true; 
    if (opFilterDoctor) matches = matches && op.doctorName === opFilterDoctor; 
    if (opFilterService) matches = matches && op.surgeryType === opFilterService; 
    if (opFilterStatus) matches = matches && op.status === opFilterStatus; 
    if (opFilterStart) matches = matches && op.date >= opFilterStart; 
    if (opFilterEnd) matches = matches && op.date <= opFilterEnd; 
    if (opFilterContracting) matches = matches && op.contractingCompanyId === Number(opFilterContracting); // Added filter
    if (opSearchName) matches = matches && op.patientName.toLowerCase().includes(opSearchName.toLowerCase()); 
    if (opSearchPhone) matches = matches && !!((op.patientPhone && op.patientPhone.includes(opSearchPhone)) || (op.patientPhone2 && op.patientPhone2.includes(opSearchPhone)));
    return matches; 
  }).sort((a, b) => b.date.localeCompare(a.date));

  const filteredDoctorsList = doctors.filter(doc => doc.name.toLowerCase().includes(doctorSearchTerm.toLowerCase()));

  const getUpcomingReminders = () => {
      const tomorrowStr = addDaysStr(cairoTodayStr(), 1);
      const bookingReminders = allBookings.filter(b => b.date === tomorrowStr && b.status === 'confirmed' && !b.reminderSent && (!reminderFilterService || b.service === reminderFilterService)).map(b => ({ id: b.id, patientName: b.patientName, phone: b.phone, date: b.date, time: b.time, doctorName: b.doctorName, service: b.service, itemType: 'booking' as const }));
      const operationReminders = operations.filter(op => op.date === tomorrowStr && op.status !== 'cancelled' && !op.reminderSent && (!reminderFilterService || op.surgeryType === reminderFilterService)).map(op => ({ id: op.id, patientName: op.patientName, phone: op.patientPhone || 'غير مسجل', date: op.date, time: 'موعد عملية', doctorName: op.doctorName, service: `عملية: ${op.surgeryType}`, itemType: 'operation' as const }));
      return [...bookingReminders, ...operationReminders];
  };

  const getDoctorStats = () => doctors.map(doc => { const bookingsCount = allBookings.filter(b => b.doctorId === doc.id && (!reportStart || b.date >= reportStart) && (!reportEnd || b.date <= reportEnd) && b.status === 'confirmed').length; const operationsCount = operations.filter(op => op.doctorName === doc.name && (!reportStart || op.date >= reportStart) && (!reportEnd || op.date <= reportEnd) && op.status === 'confirmed').length; return { ...doc, bookingsCount, operationsCount, total: bookingsCount + operationsCount }; }).sort((a,b) => { if (reportSortBy === 'bookings') return b.bookingsCount - a.bookingsCount; if (reportSortBy === 'operations') return b.operationsCount - a.operationsCount; return b.total - a.total; });
  const doctorStats = getDoctorStats(); const top5Doctors = doctorStats.slice(0, 5); const maxStatValue = Math.max(...doctorStats.map(d => d.total), 1);
  const tabClass = (id: string) => `w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === id ? 'bg-[#087F8C] text-white shadow-[0_8px_20px_-6px_rgba(8,127,140,0.45)] translate-x-0.5' : 'bg-transparent text-[#718394] hover:bg-[#F5FAFC] hover:text-[#087F8C]'}`;
  const inputClass = "w-full bg-white border border-[#DFEAF0] rounded-xl p-3 text-[#172B3A] focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] focus:outline-hidden transition-all font-medium";
  const cardClass = "bg-white p-6 md:p-8 rounded-2xl border border-[#DFEAF0] shadow-[0_10px_28px_-16px_rgba(11,31,53,0.1)]";
  
  const bookingToDelete = allBookings.find(b => b.id === deletingBookingId); 
  const doctorToDelete = doctors.find(d => d.id === deletingDoctorId);
  const userToDelete = users.find(u => u.id === deletingUserId);
  const partnerToDelete = partners.find(p => p.id === deletingPartnerId);
  const serviceToDelete = services.find(s => s.id === deletingServiceId);
  const opToDelete = operations.find(o => o.id === deletingOpIdModal);

  const handleUpdateStat = (index: number, field: keyof StatItem, value: string) => {
    const newStats = [...tempSettings.stats];
    newStats[index] = { ...newStats[index], [field]: value };
    setTempSettings({ ...tempSettings, stats: newStats });
  };

  const filteredComplaints = complaints.filter(c => {
    let matches = true; 
    if (complaintSearch) {
      const search = complaintSearch.toLowerCase();
      matches = matches && (c.name.toLowerCase().includes(search) || c.phone.includes(search));
    }
    if (complaintStart) matches = matches && (c.date >= complaintStart);
    if (complaintEnd) matches = matches && (c.date <= complaintEnd);
    return matches;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const getPatientAnalytics = () => {
    const patientMap: Record<string, { name: string, phone: string, count: number, totalCost: number }> = {};
    const filteredBookingsForAnalytics = allBookings.filter(b => b.status === 'confirmed' && (!analyticsStart || b.date >= analyticsStart) && (!analyticsEnd || b.date <= analyticsEnd));
    const filteredOperationsForAnalytics = operations.filter(op => op.status === 'confirmed' && (!analyticsStart || op.date >= analyticsStart) && (!analyticsEnd || op.date <= analyticsEnd));

    filteredBookingsForAnalytics.forEach(b => {
      const key = `${b.patientName}-${b.phone}`;
      if (!patientMap[key]) patientMap[key] = { name: b.patientName, phone: b.phone, count: 0, totalCost: 0 };
      patientMap[key].count += 1;
    });

    filteredOperationsForAnalytics.forEach(op => {
      const key = `${op.patientName}-${op.patientPhone}`;
      if (!patientMap[key]) patientMap[key] = { name: op.patientName, phone: op.patientPhone, count: 0, totalCost: 0 };
      patientMap[key].count += 1;
      patientMap[key].totalCost += op.cost;
    });

    const patients = Object.values(patientMap);
    const mostFrequent = [...patients].sort((a, b) => b.count - a.count).slice(0, 10);
    const totalPatients = patients.length;
    const totalRevenue = patients.reduce((acc, p) => acc + p.totalCost, 0);
    const avgCostPerPatient = totalPatients > 0 ? totalRevenue / totalPatients : 0;

    const serviceMap: Record<string, number> = {};
    filteredBookingsForAnalytics.forEach(b => { serviceMap[b.service] = (serviceMap[b.service] || 0) + 1; });
    filteredOperationsForAnalytics.forEach(op => { serviceMap[op.surgeryType] = (serviceMap[op.surgeryType] || 0) + 1; });
    const popularServices = Object.entries(serviceMap).map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count);

    return { totalPatients, avgCostPerPatient, mostFrequent, popularServices, totalRevenue };
  };

  const analyticsData = getPatientAnalytics();

  return (
    <div className="py-12 md:py-16 bg-[#F5FAFC] text-[#172B3A] min-h-screen" id="admin">
      {deletingBookingId !== null && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف الحجز</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف حجز المريض:</p><p className="text-base font-black text-red-600">{bookingToDelete?.patientName}</p><p className="text-xs text-[#718394] mt-1.5 fv-num">موعد: {bookingToDelete?.date} في {bookingToDelete?.time}</p></div><div className="flex gap-3"><button onClick={() => { onDeleteBooking(deletingBookingId); setDeletingBookingId(null); }} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"><Trash size={17} /> تأكيد الحذف</button><button onClick={() => setDeletingBookingId(null)} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}
      {deletingDoctorId !== null && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف الطبيب</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف بيانات الطبيب:</p><p className="text-base font-black text-red-600">{doctorToDelete?.name}</p></div><div className="flex gap-3"><button onClick={() => { const id = deletingDoctorId; deleteDoctorFromDb(doctors.find(d => d.id === id)); setDoctors(prev => prev.filter(d => d.id !== id)); if (editingDoctorId === id) { setEditingDoctorId(null); setNewDoctor({ name: '', specialty: '', image: '', maxPatients: 10, fee: 150, availableDates: [], patientsPerHour: 4, topSpecialtiesStr: '', experience: 10, education: '', followUpExamCount: 2, followUpSurgeryCount: 3, facebookUrl: '', youtubeUrl: '', tiktokUrl: '', websiteUrl: '', instagramUrl: '', xUrl: '' }); } setDeletingDoctorId(null); }} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"><Trash size={17} /> تأكيد الحذف</button><button onClick={() => setDeletingDoctorId(null)} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}
      {deletingUserId !== null && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف المستخدم</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف حساب الموظف:</p><p className="text-base font-black text-red-600">{userToDelete?.name}</p></div><div className="flex gap-3"><button onClick={() => { setUsers(prev => prev.filter(u => u.id !== deletingUserId)); setDeletingUserId(null); }} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"><Trash size={17} /> تأكيد الحذف</button><button onClick={() => setDeletingUserId(null)} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}
      {deletingPartnerId !== null && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف جهة التعاقد</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف:</p><p className="text-base font-black text-red-600">{partnerToDelete?.name}</p></div><div className="flex gap-3"><button onClick={confirmDeletePartner} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"><Trash size={17} /> تأكيد الحذف</button><button onClick={() => setDeletingPartnerId(null)} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}
      {deletingServiceId !== null && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف الخدمة</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف الخدمة:</p><p className="text-base font-black text-red-600">{serviceToDelete?.title}</p></div><div className="flex gap-3"><button onClick={async () => { try { const originalService = realtimeData.services.find((s: any) => parseInt(s.id.slice(-8), 16) === deletingServiceId); if (originalService) { const { error } = await supabase.from('services').delete().eq('id', originalService.id); if (error) throw error; } else { setServices(prev => prev.filter(s => s.id !== deletingServiceId)); } if(editingServiceId === deletingServiceId) setEditingServiceId(null); setDeletingServiceId(null); } catch (err) { console.error('Error deleting service:', err); alert('حدث خطأ أثناء حذف الخدمة'); setDeletingServiceId(null); } }} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"><Trash size={17} /> تأكيد الحذف</button><button onClick={() => setDeletingServiceId(null)} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}
      {deletingOpIdModal !== null && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف سجل العملية</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف سجل العملية للمريض:</p><p className="text-base font-black text-red-600">{opToDelete?.patientName}</p><p className="text-xs text-[#718394] mt-1.5">نوع الجراحة: {opToDelete?.surgeryType}</p></div><div className="flex gap-3"><button onClick={async () => { const target = operations.find(o => o.id === deletingOpIdModal); if (target?.dbId && !(await deleteOperation(target.dbId))) return; setOperations(prev => prev.filter(o => o.id !== deletingOpIdModal)); if (editingOpId === deletingOpIdModal) setEditingOpId(null); setDeletingOpIdModal(null); }} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"><Trash size={17} /> تأكيد الحذف</button><button onClick={() => setDeletingOpIdModal(null)} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}
      {deletingHeroImageId !== null && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف الصورة</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-2">هل أنت متأكد من رغبتك في حذف هذه الصورة من شريط العرض؟</p><div className="rounded-xl overflow-hidden h-32 w-full mt-3 border border-[#DFEAF0]"><img src={heroImages.find(i => i.id === deletingHeroImageId)?.url} className="w-full h-full object-cover" /></div></div><div className="flex gap-3"><button onClick={confirmDeleteHeroImage} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"><Trash size={17} /> تأكيد الحذف</button><button onClick={() => setDeletingHeroImageId(null)} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}
      {clearingContactLogsModal && currentUser?.role === 'admin' && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]"><div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div><h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد مسح سجل الاتصالات والتذكيرات</h3><div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right"><p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في مسح جميع سجلات الاتصالات والتذكيرات نهائياً؟</p><p className="text-xs text-red-600 font-bold fv-num">عدد السجلات الحالية: {contactLogs.length}</p></div><div className="flex gap-3"><button onClick={handleClearContactLogs} disabled={isClearingContactLogs} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"><Trash size={17} /> {isClearingContactLogs ? 'جاري المسح...' : 'تأكيد المسح'}</button><button onClick={() => setClearingContactLogsModal(false)} disabled={isClearingContactLogs} className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all">تراجع</button></div></div></div>)}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-8">
            <aside className="lg:w-72 shrink-0">
                <div className="sticky top-24 bg-white rounded-2xl border border-[#DFEAF0] shadow-[0_10px_28px_-16px_rgba(11,31,53,0.1)] p-4 md:p-5 space-y-1 overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-4 mb-3 border-b border-[#DFEAF0]"><div className="p-2.5 bg-gradient-to-br from-[#087F8C] to-[#1769AA] rounded-xl text-white shadow-sm"><LayoutDashboard size={22} /></div><div><h2 className="text-lg font-black text-[#172B3A] leading-none">{t.controlPanel}</h2><p className="text-[10px] text-[#718394] font-bold mt-1 uppercase tracking-widest">Barada EMS</p></div></div>
                    {canAccessSection(currentUser, 'overview') && (<button onClick={() => setActiveTab('overview')} className={tabClass('overview')}><Eye size={18} /> نظرة عامة</button>)}
                    {canAccessSection(currentUser, 'doctors') && (<button onClick={() => setActiveTab('doctors')} className={tabClass('doctors')}><Users size={18} /> {t.doctors}</button>)}
                    {canAccessSection(currentUser, 'bookings') && (<button onClick={() => setActiveTab('bookings')} className={tabClass('bookings')}><CalendarDays size={18} /> {t.myBookings}</button>)}
                    {canAccessSection(currentUser, 'operations') && (<button onClick={() => setActiveTab('operations')} className={tabClass('operations')}><Scissors size={18} /> سجل العمليات</button>)}
                    {canAccessSection(currentUser, 'reminders') && (<button onClick={() => setActiveTab('reminders')} className={tabClass('reminders')}><Smartphone size={18} /> التذكيرات</button>)}
                    {canAccessSection(currentUser, 'patient-stats') && (<button onClick={() => setActiveTab('patient-stats')} className={tabClass('patient-stats')}><PieChart size={18} /> إحصائيات المرضى</button>)}
                    {canAccessSection(currentUser, 'intelligence') && (<button onClick={() => setActiveTab('intelligence')} className={tabClass('intelligence')}><Brain size={18} /> الذكاء الإداري</button>)}
                    {canAccessSection(currentUser, 'payments') && (<button onClick={() => setActiveTab('payments')} className={tabClass('payments')}><CreditCard size={18} /> المدفوعات</button>)}
                    {canAccessSection(currentUser, 'contact-logs') && (<button onClick={() => { setActiveTab('contact-logs'); if (contactLogs.length === 0) fetchContactLogs(); }} className={tabClass('contact-logs')}><History size={18} /> سجل الاتصالات</button>)}
                    <div className="h-px bg-[#DFEAF0] mx-3 my-3"></div>
                    {canAccessSection(currentUser, 'partners') && (<button onClick={() => setActiveTab('partners')} className={tabClass('partners')}><Building2 size={18} /> {settings.language === 'ar' ? 'شركاء النجاح' : 'Partners of Success'}</button>)}
                    {canAccessSection(currentUser, 'services') && (<button onClick={() => setActiveTab('services')} className={tabClass('services')}><LayoutTemplate size={18} /> {t.services}</button>)}
                    {canAccessSection(currentUser, 'offers') && (<button onClick={() => setActiveTab('offers')} className={tabClass('offers')}><Tag size={18} /> إدارة العروض</button>)}
                    {canAccessSection(currentUser, 'medical-videos') && (<button onClick={() => setActiveTab('medical-videos')} className={tabClass('medical-videos')}><Video size={18} /> مكتبة الفيديوهات الطبية</button>)}
                    {canAccessSection(currentUser, 'hero-images') && (<button onClick={() => setActiveTab('hero-images')} className={tabClass('hero-images')}><ImageIcon size={18} /> الصور</button>)}
                    {canAccessSection(currentUser, 'complaints') && (<button onClick={() => setActiveTab('complaints')} className={tabClass('complaints')}><MessageSquare size={18} /> الشكاوى</button>)}
                    <div className="h-px bg-[#DFEAF0] mx-3 my-3"></div>
                    {canAccessSection(currentUser, 'users') && (<button onClick={() => setActiveTab('users')} className={tabClass('users')}><UserCog size={18} /> المستخدمين</button>)}
                    {canAccessSection(currentUser, 'settings') && (<button onClick={() => setActiveTab('settings')} className={tabClass('settings')}><Settings size={18} /> {t.settings}</button>)}
                    {canAccessSection(currentUser, 'backup') && (<button onClick={() => setActiveTab('backup')} className={tabClass('backup')}><Database size={18} /> النسخ الاحتياطي</button>)}
                    {canAccessSection(currentUser, 'paymob-settings') && (<button onClick={() => setActiveTab('paymob-settings')} className={tabClass('paymob-settings')}><CreditCard size={18} /> إعدادات الدفع الإلكتروني</button>)}
                </div>
            </aside>
            <main className="flex-1 min-w-0">
                {canAccessSection(currentUser, activeTab) && (<>
                {activeTab === 'overview' && (
                  <OverviewDashboard
                    bookings={allBookings}
                    operations={operations}
                    doctors={doctors}
                    settings={settings}
                    cardClass={cardClass}
                    inputClass={inputClass}
                  />
                )}
                {activeTab === 'doctors' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className={`${cardClass} ${editingDoctorId ? 'ring-2 ring-[#087F8C]' : ''}`}>
                            <h3 className="text-lg font-black text-[#172B3A] mb-6 flex items-center gap-2">{editingDoctorId ? <Edit2 size={20} className="text-[#087F8C]"/> : <Plus size={20} className="text-[#087F8C]" />} {editingDoctorId ? 'تعديل بيانات الطبيب' : 'إضافة طبيب جديد وتخصيص البيانات'}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم الطبيب</label><input type="text" value={newDoctor.name} onChange={e => setNewDoctor({...newDoctor, name: e.target.value})} className={inputClass} placeholder="د. الاسم بالكامل" /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">التخصص الرئيسي</label><input type="text" value={newDoctor.specialty} onChange={e => setNewDoctor({...newDoctor, specialty: e.target.value})} className={inputClass} placeholder="مثال: استشاري ليزك" /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">سعر الكشف (ج.م)</label><input type="number" value={newDoctor.fee} onChange={e => setNewDoctor({...newDoctor, fee: Number(e.target.value)})} className={`${inputClass} fv-num`} /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">سنوات الخبرة</label><input type="number" value={newDoctor.experience} onChange={e => setNewDoctor({...newDoctor, experience: Number(e.target.value)})} className={`${inputClass} fv-num`} /></div>
                                <div className="md:col-span-2"><label className="text-xs font-bold text-[#718394] mb-1.5 block">المؤهلات العلمية</label><input type="text" value={newDoctor.education} onChange={e => setNewDoctor({...newDoctor, education: e.target.value})} className={inputClass} placeholder="دكتوراه، ماجستير، زمالة..." /></div>
                                <div className="md:col-span-2"><label className="text-xs font-bold text-[#718394] mb-1.5 block">التخصصات الدقيقة (افصل بفاصلة ,)</label><input type="text" value={newDoctor.topSpecialtiesStr} onChange={e => setNewDoctor({...newDoctor, topSpecialtiesStr: e.target.value})} className={inputClass} placeholder="مثال: تصحيح إبصار، مياه بيضاء" /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">مريض / ساعة</label><input type="number" value={newDoctor.patientsPerHour} onChange={e => setNewDoctor({...newDoctor, patientsPerHour: Number(e.target.value)})} className={`${inputClass} fv-num`} /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">صورة الطبيب (ملف)</label><input type="file" onChange={e => handleFileUpload(e, (val) => setNewDoctor({...newDoctor, image: val}))} className={`${inputClass} py-2`} /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">أقصى عدد مرضى يومياً</label><input type="number" value={newDoctor.maxPatients} onChange={e => setNewDoctor({...newDoctor, maxPatients: Number(e.target.value)})} className={`${inputClass} fv-num`} /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">عدد متابعات الكشف</label><input type="number" value={newDoctor.followUpExamCount} onChange={e => setNewDoctor({...newDoctor, followUpExamCount: Number(e.target.value)})} className={`${inputClass} fv-num`} min="0" placeholder="عدد المتابعات المجانية بعد الكشف" /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">عدد متابعات العمليات</label><input type="number" value={newDoctor.followUpSurgeryCount} onChange={e => setNewDoctor({...newDoctor, followUpSurgeryCount: Number(e.target.value)})} className={`${inputClass} fv-num`} min="0" placeholder="عدد المتابعات المجانية بعد العملية" /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط فيسبوك (اختياري)</label><input type="url" dir="ltr" value={newDoctor.facebookUrl} onChange={e => setNewDoctor({...newDoctor, facebookUrl: e.target.value})} className={inputClass} placeholder="https://facebook.com/..." /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط يوتيوب (اختياري)</label><input type="url" dir="ltr" value={newDoctor.youtubeUrl} onChange={e => setNewDoctor({...newDoctor, youtubeUrl: e.target.value})} className={inputClass} placeholder="https://youtube.com/..." /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط تيك توك (اختياري)</label><input type="url" dir="ltr" value={newDoctor.tiktokUrl} onChange={e => setNewDoctor({...newDoctor, tiktokUrl: e.target.value})} className={inputClass} placeholder="https://tiktok.com/@..." /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط الموقع الإلكتروني (اختياري)</label><input type="url" dir="ltr" value={newDoctor.websiteUrl} onChange={e => setNewDoctor({...newDoctor, websiteUrl: e.target.value})} className={inputClass} placeholder="https://..." /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط إنستجرام (اختياري)</label><input type="url" dir="ltr" value={newDoctor.instagramUrl} onChange={e => setNewDoctor({...newDoctor, instagramUrl: e.target.value})} className={inputClass} placeholder="https://instagram.com/..." /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط موقع إكس X (اختياري)</label><input type="url" dir="ltr" value={newDoctor.xUrl} onChange={e => setNewDoctor({...newDoctor, xUrl: e.target.value})} className={inputClass} placeholder="https://x.com/..." /></div>
                                <div className="md:col-span-2 lg:col-span-3"><label className="text-xs font-bold text-[#718394] mb-1.5 block">إدارة مواعيد العمل</label><div className="flex gap-2"><input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)} className={inputClass} /><button onClick={handleAddDateToNewDoctor} className="fv-btn-primary px-6 rounded-xl font-bold shrink-0">إضافة يوم</button></div><div className="flex wrap gap-2 mt-3">{newDoctor.availableDates.map(date => (<span key={date} className="bg-[#087F8C]/10 text-[#087F8C] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-[#087F8C]/20 fv-num">{date}<button onClick={() => handleRemoveDateFromNewDoctor(date)} className="text-red-500 hover:scale-110"><X size={14}/></button></span>))}</div></div>
                            </div>
                            <div className="flex gap-3 mt-7"><button onClick={handleAddDoctor} className="fv-btn-primary font-black py-3.5 px-8 rounded-xl flex items-center gap-2">{editingDoctorId ? <Save size={18}/> : <Plus size={18} />} {editingDoctorId ? t.save : 'حفظ بيانات الطبيب'}</button>{editingDoctorId && (<button onClick={() => { setEditingDoctorId(null); setNewDoctor({ name: '', specialty: '', image: '', maxPatients: 10, fee: 150, availableDates: [], patientsPerHour: 4, topSpecialtiesStr: '', experience: 10, education: '', followUpExamCount: 2, followUpSurgeryCount: 3, facebookUrl: '', youtubeUrl: '', tiktokUrl: '', websiteUrl: '', instagramUrl: '', xUrl: '' }); }} className="bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-bold py-3.5 px-8 rounded-xl hover:bg-white transition-all flex items-center gap-2">إلغاء التعديل</button>)}</div>
                        </div>
                        <div className={cardClass}><div className="flex justify-between items-center mb-6 gap-4 flex-wrap"><h3 className="text-lg font-black text-[#172B3A]">قائمة الأطباء الحاليين (<span className="fv-num">{doctors.length}</span>)</h3><div className="relative w-64"><Search className="absolute right-3 top-3 text-[#718394]" size={18} /><input type="text" placeholder="ابحث عن طبيب..." value={doctorSearchTerm} onChange={e => setDoctorSearchTerm(e.target.value)} className={`${inputClass} pr-10 py-2`} /></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-5">{filteredDoctorsList.map(doc => (<div key={doc.id} className={`bg-[#F5FAFC] p-5 rounded-2xl border ${editingDoctorId === doc.id ? 'border-[#087F8C] bg-white ring-2 ring-[#087F8C]/20' : 'border-[#DFEAF0]'} flex gap-5 hover:bg-white hover:shadow-md transition-all group`}><img src={doc.image} className="w-22 h-22 rounded-xl object-cover border border-[#DFEAF0]" /><div className="flex-1 min-w-0"><div className="flex justify-between items-start"><h4 className="font-black text-base text-[#172B3A]">{doc.name}</h4><div className="flex gap-1"><button onClick={() => handleEditDoctorRequest(doc)} className="text-[#087F8C] hover:bg-[#087F8C]/10 p-2 rounded-lg transition-all" title="تعديل"><Edit2 size={16}/></button><button onClick={() => setDeletingDoctorId(doc.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all" title="حذف"><Trash2 size={16}/></button></div></div><p className="text-xs text-[#087F8C] font-bold mb-3">{doc.specialty}</p><div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-[#718394] fv-num"><div className="flex items-center gap-1"><Banknote size={12} className="text-[#087F8C]"/> {doc.fee} ج.م</div><div className="flex items-center gap-1"><Users size={12} className="text-[#1769AA]"/> {doc.patientsPerHour} / ساعة</div><div className="flex items-center gap-1"><Eye size={12}/> متابعات كشف: {doc.followUpExamCount || 0}</div><div className="flex items-center gap-1"><Scissors size={12}/> متابعات عمليات: {doc.followUpSurgeryCount || 0}</div></div><div className="mt-3 pt-3 border-t border-[#DFEAF0]"><div className="flex wrap gap-1.5">{doc.topSpecialties.map(spec => (<span key={spec} className="bg-white px-2 py-0.5 rounded-md border border-[#DFEAF0] text-[10px] font-bold text-[#172B3A]">{spec}</span>))}</div><DoctorSocialLinks doc={doc} compact /></div></div></div>))}</div></div>
                    </div>
                )}
                {activeTab === 'bookings' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className={cardClass}>
                          <h3 className="text-lg font-black text-[#172B3A] mb-5 flex items-center gap-2"><Filter size={18} className="text-[#087F8C]"/> فرز الحجوزات</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">البحث بالاسم</label><input type="text" value={bookingPatientName} onChange={e => setBookingPatientName(e.target.value)} className={inputClass} placeholder="ابحث عن مريض..." /></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">رقم الهاتف</label><input type="text" value={bookingPhoneFilter} onChange={e => setBookingPhoneFilter(e.target.value)} className={`${inputClass} fv-num`} placeholder="بحث برقم الهاتف..." /></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">الطبيب</label><select value={bookingDoctorId} onChange={e => setBookingDoctorId(e.target.value)} className={inputClass}><option value="">جميع الأطباء</option>{doctors.map(d => <option key={d.id} value={d.id.toString()}>{d.name}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">نوع الإجراء</label><select value={bookingService} onChange={e => setBookingService(e.target.value)} className={inputClass}><option value="">جميع الإجراءات</option>{services.map(s => <option key={s.id} value={s.title}>{s.title}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">حالة الحجز</label><select value={bookingStatus} onChange={e => setBookingStatus(e.target.value)} className={inputClass}><option value="">الكل</option><option value="confirmed">{t.confirmed}</option><option value="cancelled">{t.cancelled}</option></select></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">حالة الدفع</label><select value={bookingPaymentStatus} onChange={e => setBookingPaymentStatus(e.target.value)} className={inputClass}><option value="">الكل</option><option value="paid">تم الدفع</option><option value="pending">في انتظار الدفع</option></select></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">جهة التعاقد</label><select value={bookingContractingId} onChange={e => setBookingContractingId(e.target.value)} className={inputClass}><option value="">الكل</option><option value="-1">خاص (بدون تعاقد)</option>{contractingList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">فلتر العنوان</label><input type="text" value={bookingAddressFilter} onChange={e => setBookingAddressFilter(e.target.value)} className={inputClass} placeholder="ابحث بالعنوان..." /></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">من تاريخ</label><input type="date" value={bookingStart} onChange={e => setBookingStart(e.target.value)} className={inputClass} /></div>
                            <div><label className="text-xs font-bold text-[#718394] mb-1 block">إلى تاريخ</label><input type="date" value={bookingEnd} onChange={e => setBookingEnd(e.target.value)} className={inputClass} /></div>
                            <div className="flex items-end"><button onClick={() => { setBookingPatientName(''); setBookingPhoneFilter(''); setBookingDoctorId(''); setBookingStatus(''); setBookingPaymentStatus(''); setBookingStart(''); setBookingEnd(''); setBookingAddressFilter(''); setBookingService(''); setBookingContractingId(''); }} className="text-red-600 font-bold text-xs hover:underline mb-3">مسح الفلاتر</button></div>
                          </div>
                        </div>
                        <div className={`${cardClass} overflow-x-auto p-0`}><div className="p-6 flex justify-between items-center border-b border-[#DFEAF0]"><h3 className="text-lg font-black text-[#172B3A]">جدول الحجوزات (<span className="fv-num">{filteredBookings.length}</span>)</h3><button onClick={() => handlePrint('تقرير الحجوزات', `<table><thead><tr><th>المريض</th><th>الهواتف</th><th>العنوان</th><th>الطبيب</th><th>اسم الإجراء</th><th>جهة التعاقد</th><th>التاريخ</th><th>الوقت</th></tr></thead><tbody>${filteredBookings.map(b => {
                            const companyName = b.contractingCompanyId ? (contractingList.find(c => c.id === b.contractingCompanyId)?.name || 'تعاقد غير معروف') : 'حساب خاص';
                            return `<tr><td>${b.patientName}</td><td>${b.phone}${b.phone2 ? ` / ${b.phone2}` : ''}</td><td>${b.address || '-'}</td><td>${b.doctorName}</td><td>${b.service}</td><td>${companyName}</td><td>${b.date}</td><td>${b.time}</td></tr>`;
                        }).join('')}</tbody></table>`)} className="text-[#087F8C] bg-[#087F8C]/10 hover:bg-[#087F8C]/20 px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-xs transition-colors"><Printer size={15}/> طباعة التقرير</button></div><table className="w-full text-right"><thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]"><tr><th className="p-4 text-xs font-bold">{t.patient}</th><th className="p-4 text-xs font-bold">{t.appointment}</th><th className="p-4 text-xs font-bold">{t.doctorService}</th><th className="p-4 text-xs font-bold">{t.status}</th><th className="p-4 text-xs font-bold text-center">{t.management}</th></tr></thead><tbody className="divide-y divide-[#DFEAF0]">{filteredBookings.map(booking => (<tr key={booking.id} className="hover:bg-[#F5FAFC] transition-colors"><td className="p-4"><div className="font-bold text-sm text-[#172B3A]">{booking.patientName}</div><div className="text-[11px] text-[#718394] fv-num" dir="ltr">{booking.phone}{booking.phone2 && ` / ${booking.phone2}`}</div><div className="text-[10px] text-[#718394] font-semibold">{booking.address}</div></td><td className="p-4 fv-num"><div className="text-xs font-bold text-[#172B3A]">{booking.date}</div><div className="text-[11px] text-[#718394]">{booking.time}</div></td><td className="p-4"><div className="text-xs font-bold text-[#087F8C]">د. {booking.doctorName}</div><div className="text-[11px] text-[#718394]"><span className="font-bold text-[#172B3A]">اسم الإجراء:</span> {booking.service}</div><div className="text-[11px] text-[#718394]"><span className="font-bold text-[#172B3A]">نوع الكشف:</span> {booking.bookingType === 'contract' || booking.contractingCompanyId ? 'تعاقد' : 'نقدي'}</div>{(booking.bookingType === 'contract' || booking.contractingCompanyId) && <div className="text-[11px] text-[#718394]"><span className="font-bold text-[#172B3A]">جهة التعاقد:</span> {contractingList.find(c => c.id === booking.contractingCompanyId)?.name || 'تعاقد غير معروف'}</div>}{booking.notes && <div className="text-[11px] text-[#718394] whitespace-pre-wrap break-words"><span className="font-bold text-[#172B3A]">ملاحظات إضافية:</span> {booking.notes}</div>}</td><td className="p-4"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{booking.status === 'confirmed' ? t.confirmed : t.cancelled}</span>
                        {booking.paymentMethod && (
                            <div className="mt-1.5 flex items-center gap-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${booking.paymentMethod === 'cash' ? 'bg-emerald-50 text-emerald-700' : booking.paymentMethod === 'instapay' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'}`}>
                                    {booking.paymentMethod === 'cash' ? 'نقداً' : booking.paymentMethod === 'instapay' ? 'InstaPay' : booking.paymentMethod === 'paymob' ? 'Paymob' : 'Wallet'}
                                </span>
                                {booking.paymentMethod !== 'cash' && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${booking.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {booking.paymentStatus === 'paid' ? 'تم الدفع' : 'في انتظار الدفع'}
                                    </span>
                                )}
                            </div>
                        )}
                        </td><td className="p-4 text-center"><div className="flex justify-center gap-1.5">
                        {booking.paymentStatus === 'pending' && booking.paymentMethod !== 'cash' && (
                            <button onClick={() => onConfirmPayment(booking.id)} className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100" title="تأكيد استلام المبلغ">
                                <Banknote size={15}/>
                            </button>
                        )}
                        <button onClick={() => onEditBooking(booking)} className="p-2 bg-[#087F8C]/10 text-[#087F8C] rounded-lg hover:bg-[#087F8C]/20" title="تعديل الحجز"><Edit2 size={15}/></button>{booking.status === 'confirmed' ? (<button onClick={() => onCancelBooking(booking.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><X size={15}/></button>) : (<button onClick={() => onConfirmBooking(booking.id)} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"><CheckCircle size={15}/></button>)}{currentUser.role === 'admin' && (<button onClick={() => setDeletingBookingId(booking.id)} className="p-2 bg-[#F5FAFC] text-[#718394] rounded-lg hover:bg-red-600 hover:text-white transition-all" title="حذف الحجز نهائياً"><Trash2 size={15}/></button>)}</div></td></tr>))}</tbody></table></div>
                    </div>
                )}
                {activeTab === 'users' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                    {/* Staff Management from Supabase */}
                    <StaffManagement inputClass={inputClass} cardClass={cardClass} currentUserId={currentUserUuid} />
                  </div>
                )}
                {activeTab === 'reports' && (
                  <PatientStats
                    bookings={allBookings}
                    operations={operations}
                    contractingCompanies={contractingList.map(c => ({ id: c.id, name: c.name }))}
                    cardClass={cardClass}
                    inputClass={inputClass}
                    onPrint={handlePrint}
                  />
                )}
                {activeTab === 'hero-images' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className={cardClass}><h3 className="text-lg font-black text-[#172B3A] mb-5">إدارة صور الواجهة (Slider)</h3><div className="flex flex-col md:flex-row gap-4"><div className="flex-1"><label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط الصورة (URL) أو ارفع من الجهاز</label><div className="flex gap-2"><input type="text" value={newHeroImageUrl} onChange={e => setNewHeroImageUrl(e.target.value)} className={inputClass} placeholder="https://..." /><label className="bg-[#F5FAFC] text-[#172B3A] px-5 py-2 rounded-xl font-bold cursor-pointer hover:bg-white flex items-center gap-2 border border-[#DFEAF0]"><Upload size={18} className="text-[#087F8C]"/><input type="file" onChange={e => handleFileUpload(e, (val) => setNewHeroImageUrl(val))} className="hidden" /></label></div></div><div className="flex items-end"><button onClick={handleAddHeroImage} className="fv-btn-primary px-7 py-3 rounded-xl font-bold">إضافة للواجهة</button></div></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">{heroImages.map(img => (<div key={img.id} className="relative group rounded-2xl overflow-hidden shadow-xs h-48 border border-[#DFEAF0]"><img src={img.url} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-[#0B1F35]/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><button onClick={() => handleDeleteHeroImage(img.id)} className="bg-red-600 text-white p-3 rounded-xl hover:scale-110 transition-transform shadow-lg"><Trash2 size={22}/></button></div></div>))}</div>
                    </div>
                )}
                {activeTab === 'partners' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <PartnersSuccessHub
                          currentUser={currentUser}
                          currentUserUuid={currentUserUuid}
                          rawBookings={realtimeData.bookings}
                          allBookings={allBookings}
                          operations={operations}
                          rawPayments={realtimeData.payments}
                          doctors={doctors}
                          services={services}
                          staffMembers={realtimeData.staffMembers}
                          cardClass={cardClass}
                          inputClass={inputClass}
                          onPrint={handlePrint}
                          onNotify={onNotify || (() => {})}
                        />
                        <div className="w-full h-px bg-[#DFEAF0] my-6"></div>
                        <div className={cardClass}>
                            <h3 className="text-lg font-black text-[#172B3A] mb-5 flex items-center gap-2">
                                <ImageIcon size={20} className="text-[#087F8C]"/> 
                                إدارة شعارات الشركاء (الصفحة الرئيسية)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5"><div><label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم الجهة / الشركة</label><input type="text" value={newPartner.name} onChange={e => setNewPartner({...newPartner, name: e.target.value})} className={inputClass} /></div><div><label className="text-xs font-bold text-[#718394] mb-1.5 block">نوع التغطية / نسبة الخصم</label><input type="text" value={newPartner.description} onChange={e => setNewPartner({...newPartner, description: e.target.value})} className={inputClass} placeholder="مثال: تغطية 80%" /></div><div><label className="text-xs font-bold text-[#718394] mb-1.5 block">شعار الجهة</label><div className="flex gap-2"><input type="text" value={newPartner.logo} onChange={e => setNewPartner({...newPartner, logo: e.target.value})} className={inputClass} /><label className="bg-[#F5FAFC] p-3 rounded-xl cursor-pointer border border-[#DFEAF0] hover:bg-white"><Upload size={18} className="text-[#087F8C]"/><input type="file" onChange={e => handleFileUpload(e, (val) => setNewPartner({...newPartner, logo: val}))} className="hidden"/></label></div></div></div><button onClick={handleAddPartner} className="mt-7 fv-btn-primary font-bold py-3.5 px-8 rounded-xl flex items-center gap-2"><Plus size={18}/> إضافة شريك (للعرض فقط)</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{partners.map(p => (<div key={p.id} className="bg-white rounded-2xl border border-[#DFEAF0] shadow-xs hover:shadow-md transition-all p-5 relative group flex items-center gap-4"><div className="w-14 h-14 rounded-xl border border-[#DFEAF0] p-1 flex items-center justify-center bg-[#F5FAFC] overflow-hidden"><img src={p.logo} className="w-full h-full object-contain" /></div><div className="flex-1"><h4 className="font-black text-sm text-[#172B3A]">{p.name}</h4><p className="text-xs text-[#718394] mt-1">{p.description}</p></div><button onClick={() => setDeletingPartnerId(p.id)} className="absolute top-3.5 left-3.5 text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={17}/></button></div>))}</div>
                    </div>
                )}
                {activeTab === 'settings' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                     <div className={cardClass}>
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#DFEAF0]">
                            <div className="bg-[#087F8C]/10 p-2.5 rounded-xl text-[#087F8C]"><Settings size={22} /></div>
                            <h3 className="text-lg font-black text-[#172B3A]">الإعدادات العامة</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                           <div className="md:col-span-2">
                                <label className="text-xs font-bold text-[#718394] mb-2 block">شعار التطبيق (Logo)</label>
                                <div className="flex gap-4 items-center">
                                    <div className="w-20 h-20 bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] flex items-center justify-center overflow-hidden shrink-0">
                                        {tempSettings.logoUrl ? <img src={tempSettings.logoUrl} className="w-full h-full object-contain" /> : <ImageIcon className="text-[#718394]"/>}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex gap-2">
                                            <input type="text" value={tempSettings.logoUrl} onChange={e => setTempSettings({...tempSettings, logoUrl: e.target.value})} className={inputClass} placeholder="https://..." />
                                            <label className="bg-[#F5FAFC] text-[#172B3A] px-4 py-2 rounded-xl font-bold cursor-pointer hover:bg-white flex items-center gap-2 border border-[#DFEAF0]">
                                                <Upload size={18} className="text-[#087F8C]"/>
                                                <input type="file" onChange={e => handleFileUpload(e, (val) => setTempSettings({...tempSettings, logoUrl: val}))} className="hidden" />
                                            </label>
                                        </div>
                                        <p className="text-[11px] text-[#718394]">يفضل استخدام صورة مربعة بخلفية شفافة (PNG)</p>
                                    </div>
                                </div>
                           </div>

                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم المركز</label><input type="text" value={tempSettings.appName} onChange={e => setTempSettings({...tempSettings, appName: e.target.value})} className={inputClass} /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رقم واتساب الأساسي</label><input type="text" value={tempSettings.whatsappNumber} onChange={e => setTempSettings({...tempSettings, whatsappNumber: e.target.value})} className={`${inputClass} fv-num`} /></div>
                           
                           <div className="md:col-span-2"><label className="text-xs font-bold text-[#718394] mb-1.5 block">عنوان الترحيب الرئيسي</label><input type="text" value={tempSettings.heroTitle} onChange={e => setTempSettings({...tempSettings, heroTitle: e.target.value})} className={inputClass} /></div>
                           <div className="md:col-span-2"><label className="text-xs font-bold text-[#718394] mb-1.5 block">وصف الترحيب</label><textarea value={tempSettings.heroDescription} onChange={e => setTempSettings({...tempSettings, heroDescription: e.target.value})} className={inputClass} rows={2} /></div>
                           
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">أرقام الهواتف (كل رقم في سطر)</label><textarea value={phonesInput} onChange={e => setPhonesInput(e.target.value)} className={`${inputClass} fv-num`} rows={3} /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">العناوين (كل عنوان في سطر)</label><textarea value={addressesInput} onChange={e => setAddressesInput(e.target.value)} className={inputClass} rows={3} /></div>
                           
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">مواعيد العمل (السبت - الخميس)</label><input type="text" value={tempSettings.workingHours.weekdays} onChange={e => setTempSettings({...tempSettings, workingHours: {...tempSettings.workingHours, weekdays: e.target.value}})} className={inputClass} /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">مواعيد العمل (الجمعة)</label><input type="text" value={tempSettings.workingHours.friday} onChange={e => setTempSettings({...tempSettings, workingHours: {...tempSettings.workingHours, friday: e.target.value}})} className={inputClass} /></div>
                        </div>

                        <div className="space-y-5 mt-8 border-t border-[#DFEAF0] pt-7">
                            <div className="flex justify-between items-center">
                                <h4 className="font-black text-base text-[#172B3A] flex items-center gap-2">
                                <CreditCard className="text-[#087F8C]" size={20} /> إعدادات الدفع الإلكتروني
                                </h4>
                                <button 
                                onClick={() => {
                                    const newMethod: PaymentMethod = { id: Date.now().toString(), type: 'wallet', label: '', detail: '' };
                                    setTempSettings({...tempSettings, paymentMethods: [...tempSettings.paymentMethods, newMethod]});
                                }}
                                className="fv-btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                                >
                                + إضافة وسيلة جديدة
                                </button>
                            </div>

                            <div className="grid gap-4">
                                {tempSettings.paymentMethods.map((method, idx) => (
                                <div key={method.id} className="bg-[#F5FAFC] p-4 rounded-2xl border border-[#DFEAF0] flex flex-wrap gap-3 items-end">
                                    <div className="flex-1 min-w-[150px] space-y-1">
                                    <label className="text-[11px] font-bold text-[#718394] mr-1">نوع الوسيلة</label>
                                    <select 
                                        className="w-full p-2.5 rounded-xl border border-[#DFEAF0] bg-white text-sm font-bold text-[#172B3A]"
                                        value={method.type}
                                        onChange={(e) => {
                                        const updated = [...tempSettings.paymentMethods];
                                        updated[idx].type = e.target.value as any;
                                        setTempSettings({...tempSettings, paymentMethods: updated});
                                        }}
                                    >
                                        <option value="cash">الدفع نقداً بالمركز</option>
                                        <option value="instapay">انستا باي</option>
                                        <option value="wallet">محفظة إلكترونية</option>
                                        <option value="other">أخرى</option>
                                    </select>
                                    </div>
                                    
                                    <div className="flex-1 min-w-[150px] space-y-1">
                                    <label className="text-[11px] font-bold text-[#718394] mr-1">الاسم (Label)</label>
                                    <input 
                                        className="w-full p-2.5 rounded-xl border border-[#DFEAF0] bg-white text-sm font-bold text-[#172B3A]"
                                        placeholder="مثال: رقم المدير"
                                        value={method.label}
                                        onChange={(e) => {
                                        const updated = [...tempSettings.paymentMethods];
                                        updated[idx].label = e.target.value;
                                        setTempSettings({...tempSettings, paymentMethods: updated});
                                        }}
                                    />
                                    </div>

                                    <div className="flex-[2] min-w-[200px] space-y-1">
                                    <label className="text-[11px] font-bold text-[#718394] mr-1">التفاصيل (الرقم/المعرف)</label>
                                    <input 
                                        className="w-full p-2.5 rounded-xl border border-[#DFEAF0] bg-white text-sm font-bold text-[#172B3A] text-left fv-num"
                                        dir="ltr"
                                        placeholder="01xxxxxxxxx"
                                        value={method.detail}
                                        onChange={(e) => {
                                        const updated = [...tempSettings.paymentMethods];
                                        updated[idx].detail = e.target.value;
                                        setTempSettings({...tempSettings, paymentMethods: updated});
                                        }}
                                    />
                                    </div>

                                    <button 
                                    onClick={() => {
                                        const updated = tempSettings.paymentMethods.filter((_, i) => i !== idx);
                                        setTempSettings({...tempSettings, paymentMethods: updated});
                                    }}
                                    className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                                    >
                                    <Trash2 size={18} />
                                    </button>
                                </div>
                                ))}
                            </div>
                        </div>
                     </div>

                     <div className={cardClass}>
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#DFEAF0]">
                            <div className="bg-[#1769AA]/10 p-2.5 rounded-xl text-[#1769AA]"><Facebook size={22} /></div>
                            <h3 className="text-lg font-black text-[#172B3A]">روابط التواصل والموقع</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط الفيسبوك</label>
                            <input 
                              type="text" 
                              value={tempSettings.facebookUrl} 
                              onChange={e => setTempSettings({...tempSettings, facebookUrl: e.target.value})}
                              className={inputClass}
                              placeholder="https://facebook.com/..."
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-[#718394] mb-1.5 block">رابط الموقع على الخريطة</label>
                            <div className="flex gap-2">
                                <input 
                                type="text" 
                                value={tempSettings.mapLocationUrl} 
                                onChange={e => setTempSettings({...tempSettings, mapLocationUrl: e.target.value})}
                                className={inputClass}
                                placeholder="https://maps.google.com/..."
                                />
                                <button onClick={handleGetCurrentLocation} className="bg-[#F5FAFC] border border-[#DFEAF0] text-[#087F8C] p-3 rounded-xl hover:bg-white" title="تحديد موقعي"><MapPin size={19}/></button>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                     <div className={cardClass}>
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#DFEAF0]">
                            <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600"><MessageCircle size={22} /></div>
                            <h3 className="text-lg font-black text-[#172B3A]">إعدادات الرسائل (SMS/WhatsApp)</h3>
                        </div>
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                              <label className="text-xs font-bold text-[#718394] mb-1.5 block">رسالة واتساب (للكشوفات)</label>
                              <textarea 
                                value={tempSettings.reminderSettings.whatsappBody} 
                                onChange={e => setTempSettings({...tempSettings, reminderSettings: {...tempSettings.reminderSettings, whatsappBody: e.target.value}})}
                                className={`${inputClass} h-32`}
                              />
                              <p className="text-[11px] text-[#718394] mt-1">المتغيرات المتاحة: [الاسم], [التاريخ], [الوقت], [الطبيب]</p>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-[#718394] mb-1.5 block">رسالة واتساب (للعمليات)</label>
                              <textarea 
                                value={tempSettings.reminderSettings.opWhatsappBody} 
                                onChange={e => setTempSettings({...tempSettings, reminderSettings: {...tempSettings.reminderSettings, opWhatsappBody: e.target.value}})}
                                className={`${inputClass} h-32`}
                              />
                              <p className="text-[11px] text-[#718394] mt-1">المتغيرات المتاحة: [الاسم], [التاريخ], [الإجراء], [الطبيب]</p>
                            </div>
                          </div>

                          <div className="w-full h-px bg-[#DFEAF0] my-4"></div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                              <label className="text-xs font-bold text-[#718394] mb-1.5 block">رسالة SMS (للكشوفات)</label>
                              <textarea 
                                value={tempSettings.reminderSettings.smsBody} 
                                onChange={e => setTempSettings({...tempSettings, reminderSettings: {...tempSettings.reminderSettings, smsBody: e.target.value}})}
                                className={`${inputClass} h-32`}
                              />
                              <p className="text-[11px] text-[#718394] mt-1">المتغيرات المتاحة: [الاسم], [التاريخ], [الوقت], [الطبيب]</p>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-[#718394] mb-1.5 block">رسالة SMS (للعمليات)</label>
                              <textarea 
                                value={tempSettings.reminderSettings.opSmsBody} 
                                onChange={e => setTempSettings({...tempSettings, reminderSettings: {...tempSettings.reminderSettings, opSmsBody: e.target.value}})}
                                className={`${inputClass} h-32`}
                              />
                              <p className="text-[11px] text-[#718394] mt-1">المتغيرات المتاحة: [الاسم], [التاريخ], [الإجراء], [الطبيب]</p>
                            </div>
                          </div>
                          
                          <div className="p-5 bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0]">
                            <label className="text-sm font-black text-[#172B3A] block mb-4 flex justify-between">
                              <span>موعد إرسال التذكير تلقائياً</span>
                              <span className="text-[#087F8C] bg-white px-3 py-1 rounded-lg border border-[#DFEAF0] fv-num">{tempSettings.reminderSettings.intervalHours} ساعة قبل الموعد</span>
                            </label>
                            <input 
                              type="range" 
                              min="1" 
                              max="72" 
                              value={tempSettings.reminderSettings.intervalHours}
                              onChange={e => setTempSettings({...tempSettings, reminderSettings: {...tempSettings.reminderSettings, intervalHours: parseInt(e.target.value)}})}
                              className="w-full h-2 bg-[#DFEAF0] rounded-lg appearance-none cursor-pointer accent-[#087F8C]"
                            />
                            <div className="flex justify-between mt-2 text-[11px] font-bold text-[#718394] fv-num">
                              <span>ساعة واحدة</span>
                              <span>72 ساعة</span>
                            </div>
                          </div>
                        </div>
                      </div>

                     <div className={cardClass}>
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#DFEAF0]">
                            <div className="bg-purple-50 p-2.5 rounded-xl text-purple-600"><ShieldCheck size={22} /></div>
                            <h3 className="text-lg font-black text-[#172B3A]">الشروط والأحكام</h3>
                        </div>
                        <textarea 
                          value={tempSettings.termsAr} 
                          onChange={e => setTempSettings({...tempSettings, termsAr: e.target.value})}
                          className={`${inputClass} h-48`}
                          placeholder="اكتب الشروط والأحكام باللغة العربية هنا..."
                        />
                      </div>

                     <div className={cardClass}>
                         <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#DFEAF0]">
                            <div className="bg-amber-50 p-2.5 rounded-xl text-amber-600"><BarChart2 size={22} /></div>
                            <h3 className="text-lg font-black text-[#172B3A]">إحصائيات الصفحة الرئيسية</h3>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {tempSettings.stats.map((stat, idx) => (
                               <div key={idx} className="bg-[#F5FAFC] p-4 rounded-xl space-y-2 border border-[#DFEAF0]">
                                  <input type="text" value={stat.label} onChange={e => handleUpdateStat(idx, 'label', e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs font-bold border border-[#DFEAF0] text-[#172B3A]" placeholder="العنوان" />
                                  <input type="text" value={stat.value} onChange={e => handleUpdateStat(idx, 'value', e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs font-bold border border-[#DFEAF0] text-[#172B3A] fv-num" placeholder="القيمة" />
                                  <input type="text" value={stat.trend} onChange={e => handleUpdateStat(idx, 'trend', e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs font-bold border border-[#DFEAF0] text-[#172B3A]" placeholder="الوصف" />
                               </div>
                            ))}
                         </div>
                     </div>

                     <div className="sticky bottom-4 z-10 flex justify-end">
                        <button onClick={handleSaveSettings} className="fv-btn-primary font-black py-3.5 px-10 rounded-xl flex items-center gap-2.5">
                           <Save size={18}/> حفظ كافة الإعدادات
                        </button>
                     </div>
                  </div>
                )}
                {activeTab === 'services' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className={`${cardClass} ${editingServiceId ? 'ring-2 ring-[#087F8C]' : ''}`}>
                            <h3 className="text-lg font-black text-[#172B3A] mb-6 flex items-center gap-2">
                                {editingServiceId ? <Edit2 size={20} className="text-[#087F8C]" /> : <Plus size={20} className="text-[#087F8C]" />}
                                {editingServiceId ? 'تعديل الخدمة الطبية' : 'إضافة خدمة طبية جديدة'}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">عنوان الخدمة</label><input type="text" value={newService.title} onChange={e => setNewService({...newService, title: e.target.value})} className={inputClass} /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">السعر (ج.م)</label><input type="number" value={newService.price} onChange={e => setNewService({...newService, price: Number(e.target.value)})} className={`${inputClass} fv-num`} /></div>
                                <div className="md:col-span-2"><label className="text-xs font-bold text-[#718394] mb-1.5 block">وصف الخدمة</label><input type="text" value={newService.description} onChange={e => setNewService({...newService, description: e.target.value})} className={inputClass} /></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-2 block">اختر أيقونة للخدمة</label><div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-7 gap-2 p-4 bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] max-h-60 overflow-y-auto">{Object.keys(ICON_MAP).map(icon => { const Icon = ICON_MAP[icon]; const iconLabel = SERVICE_3D_ICON_LABELS[icon] || icon; return (<button key={icon} type="button" onClick={() => setNewService({...newService, iconName: icon})} className={`p-2.5 rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${newService.iconName === icon ? 'bg-[#EBF8FA] text-[#087F8C] border-2 border-[#087F8C] scale-105 shadow-md' : 'bg-white text-[#718394] border border-[#DFEAF0] hover:border-[#087F8C] hover:text-[#087F8C]'}`} title={iconLabel}><Icon size={26}/><span className="text-[8px] font-bold truncate w-full text-center">{iconLabel}</span></button>) })}</div></div>
                                <div><label className="text-xs font-bold text-[#718394] mb-2 block">اللون المميز</label><div className="flex flex-wrap gap-3 p-4 bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0]">{AVAILABLE_COLORS.map(color => (<button key={color.value} onClick={() => setNewService({...newService, color: color.value})} className={`w-10 h-10 rounded-full ${color.bg} transition-all ${newService.color === color.value ? 'ring-4 ring-[#25B8C7]/50 scale-110' : 'hover:scale-105 opacity-80'}`} title={color.name}></button>))}</div></div>
                            </div>
                            <div className="flex gap-3 mt-7">
                                <button onClick={handleAddService} className="fv-btn-primary px-8 py-3.5 rounded-xl font-bold flex items-center gap-2">
                                    {editingServiceId ? <Save size={18}/> : <Plus size={18}/>}
                                    {editingServiceId ? 'حفظ التعديلات' : 'إضافة الخدمة'}
                                </button>
                                {editingServiceId && (
                                    <button onClick={() => { setEditingServiceId(null); setNewService({ title: '', description: '', iconName: 'Eye', color: 'text-blue-600', price: 200 }); }} className="bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] px-6 py-3.5 rounded-xl font-bold hover:bg-white">إلغاء</button>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {services.map(service => { 
                                const Icon = getService3DIcon(service.iconName); 
                                return (
                                    <div key={service.id} className="bg-white p-5 rounded-2xl border border-[#DFEAF0] shadow-xs hover:shadow-md transition-all flex items-center gap-4 relative group">
                                        <div className={`p-3 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] ${service.color}`}><Icon size={32}/></div>
                                        <div className="flex-1 min-w-0"><h4 className="font-black text-sm text-[#172B3A]">{service.title}</h4><p className="text-xs font-bold text-[#087F8C] fv-num">{service.price} ج.م</p></div>
                                        <div className="flex flex-col gap-1">
                                            <button onClick={() => handleEditServiceClick(service)} className="text-[#087F8C] hover:bg-[#087F8C]/10 p-2 rounded-lg" title="تعديل"><Edit2 size={16}/></button>
                                            <button onClick={() => setDeletingServiceId(service.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg" title="حذف"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                ) 
                            })}
                        </div>
                    </div>
                )}
                {activeTab === 'offers' && (
                  <OffersManagement
                    currentUser={currentUser}
                    realtimeDoctors={realtimeData.doctors}
                    realtimeOffers={realtimeData.offers}
                    realtimeLoaded={!realtimeLoading}
                    cardClass={cardClass}
                    inputClass={inputClass}
                    onOffersChanged={onOffersChanged}
                  />
                )}
                {activeTab === 'medical-videos' && (
                  <MedicalVideosManagement
                    currentUser={currentUser}
                    realtimeDoctors={realtimeData.doctors}
                    realtimeVideos={realtimeData.medicalVideos}
                    realtimeCategories={realtimeData.medicalVideoCategories}
                    realtimeLoaded={!realtimeLoading}
                    cardClass={cardClass}
                    inputClass={inputClass}
                    onVideosChanged={onVideosChanged}
                  />
                )}
                {activeTab === 'complaints' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className={cardClass}>
                       <div className="flex justify-between items-center mb-6">
                          <h3 className="text-lg font-black text-[#172B3A]">صندوق الشكاوى والمقترحات (<span className="fv-num">{filteredComplaints.length}</span>)</h3>
                          <button onClick={() => {
                              const esc = (v: string) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                              handlePrint('تقرير الشكاوى والمقترحات', `<table><thead><tr><th>النوع</th><th>الاسم</th><th>الهاتف</th><th>التاريخ</th><th>الرسالة</th></tr></thead><tbody>${filteredComplaints.map(c => `<tr><td>${c.type === 'complaint' ? 'شكوى' : 'اقتراح'}</td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.date)}</td><td>${esc(c.message)}</td></tr>`).join('')}</tbody></table>`);
                          }} className="text-[#087F8C] bg-[#087F8C]/10 hover:bg-[#087F8C]/20 px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-xs transition-colors"><Printer size={15}/> طباعة التقرير</button>
                       </div>
                       <div className="flex gap-4 mb-6">
                          <input type="text" placeholder="بحث بالاسم أو الهاتف..." value={complaintSearch} onChange={e => setComplaintSearch(e.target.value)} className={inputClass} />
                          <input type="date" value={complaintStart} onChange={e => setComplaintStart(e.target.value)} className={inputClass} />
                       </div>
                       <div className="grid grid-cols-1 gap-4">
                          {filteredComplaints.length === 0 && <p className="text-[#718394] text-center py-8 font-medium">لا توجد رسائل</p>}
                          {filteredComplaints.map(c => (
                            <div key={c.id} className={`p-5 rounded-2xl border ${c.type === 'complaint' ? 'bg-red-50/70 border-red-200' : 'bg-[#F5FAFC] border-[#DFEAF0]'} relative`}>
                               <button onClick={() => handleDeleteComplaint(c.id)} className="absolute top-4 left-4 text-[#718394] hover:text-red-600"><Trash2 size={17}/></button>
                               <div className="flex items-center gap-3 mb-2">
                                  <span className={`px-3 py-0.5 rounded-full text-[10px] font-black ${c.type === 'complaint' ? 'bg-red-100 text-red-700' : 'bg-[#087F8C]/10 text-[#087F8C]'}`}>{c.type === 'complaint' ? 'شكوى' : 'اقتراح'}</span>
                                  <span className="text-xs font-bold text-[#718394] fv-num">{c.date}</span>
                               </div>
                               <h4 className="font-black text-[#172B3A] mb-1">{c.name} <span className="text-[#718394] text-xs mx-2 fv-num">{c.phone}</span></h4>
                               <p className="text-[#172B3A] text-sm mt-2 leading-relaxed bg-white p-3.5 rounded-xl border border-[#DFEAF0]">{c.message}</p>
                            </div>
                          ))}
                       </div>
                    </div>
                  </div>
                )}
                {activeTab === 'reminders' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                     <div className={cardClass}>
                        <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
                           <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2"><Smartphone className="text-[#087F8C]" size={20}/> مركز التذكيرات (واتساب / SMS)</h3>
                           <div className="flex gap-2">
                              <select value={reminderFilterService} onChange={e => setReminderFilterService(e.target.value)} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold text-[#172B3A] outline-hidden"><option value="">كل الخدمات</option>{services.map(s => <option key={s.id} value={s.title}>{s.title}</option>)}</select>
                           </div>
                        </div>
                        <p className="text-xs text-[#172B3A] mb-5 font-bold bg-[#087F8C]/8 p-3.5 rounded-xl border border-[#087F8C]/20 flex items-center gap-2"><Info size={16} className="text-[#087F8C] shrink-0" /> يتم عرض الحجوزات والعمليات المؤكدة لليوم التالي فقط لإرسال التذكيرات.</p>
                        <div className="space-y-3">
                           {getUpcomingReminders().length === 0 && <p className="text-center text-[#718394] py-10 font-medium">لا توجد مواعيد تتطلب التذكير للغد</p>}
                           {getUpcomingReminders().map((item) => (
                              <div key={`${item.itemType}-${item.id}`} className="flex items-center justify-between p-4 bg-[#F5FAFC] border border-[#DFEAF0] rounded-2xl hover:bg-white transition-colors gap-3 flex-wrap">
                                 <div className="flex items-center gap-3.5">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${item.itemType === 'booking' ? 'bg-[#087F8C]' : 'bg-[#1769AA]'}`}>{item.itemType === 'booking' ? <Calendar size={18}/> : <Scissors size={18}/>}</div>
                                    <div>
                                       <h4 className="font-black text-sm text-[#172B3A]">{item.patientName}</h4>
                                       <p className="text-xs text-[#718394] fv-num">{item.phone} • {item.time} • {item.doctorName}</p>
                                    </div>
                                 </div>
                                 <div className="flex gap-2">
                                     <button onClick={() => handleSmsReminder(item)} className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-amber-600 transition-all"><Mail size={15}/> إرسال SMS</button>
                                     {item.phone && item.phone.replace(/\D/g, '').length >= 10 ? (
                                       <button onClick={() => handleWhatsAppReminder(item)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-700 transition-all"><MessageCircle size={15}/> واتساب</button>
                                     ) : (
                                       <button disabled title="رقم الهاتف غير متوفر" className="bg-slate-200 text-slate-500 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-not-allowed opacity-70"><MessageCircle size={15}/> واتساب</button>
                                     )}
                                  </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
                )}
                {activeTab === 'backup' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <div className={cardClass}>
                        <h3 className="text-xl font-black text-[#172B3A] mb-6">النسخ الاحتياطي واستعادة البيانات</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="bg-[#F5FAFC] p-7 rounded-2xl border border-[#DFEAF0] text-center">
                              <div className="w-14 h-14 bg-[#087F8C] text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"><Download size={28}/></div>
                              <h4 className="font-black text-[#172B3A] text-lg mb-2">تصدير قاعدة البيانات</h4>
                              <p className="text-xs text-[#718394] mb-6 leading-relaxed">حفظ نسخة كاملة من كل بيانات النظام على جهازك. بيتم كمان حفظ نسخة تلقائية كل يوم على Google Drive الخاص بالمركز.</p>
                              <div className="flex gap-2 max-w-xs mx-auto">
                                 <input type="text" value={backupFileName} onChange={e => setBackupFileName(e.target.value)} className="flex-1 p-2.5 rounded-xl border border-[#DFEAF0] bg-white text-[#172B3A] text-xs font-bold text-center outline-hidden focus:border-[#087F8C] fv-mono" />
                                 <button onClick={handleExportData} className="fv-btn-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer">تصدير</button>
                              </div>
                           </div>
                           <div className="bg-emerald-50/70 p-7 rounded-2xl border border-emerald-200/80 text-center">
                              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"><Upload size={28}/></div>
                              <h4 className="font-black text-[#172B3A] text-lg mb-2">استعادة نسخة احتياطية</h4>
                              <p className="text-xs text-[#718394] mb-6 leading-relaxed">اختار ملف نسخة احتياطية (من Google Drive أو من زرار التصدير). البيانات اللي اتمسحت أو اتعدلت هترجع، واللي اتضاف بعد النسخة هيفضل موجود.</p>
                              <label className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-xs hover:bg-emerald-700 cursor-pointer inline-flex items-center gap-2 shadow-sm transition-colors">
                                 <Upload size={16}/> رفع ملف النسخة الاحتياطية
                                 <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
                              </label>
                           </div>
                        </div>
                     </div>
                     <GoogleDrivePanel cardClass={cardClass} inputClass={inputClass} backupFileName={backupFileName} />
                  </div>
                )}
                {activeTab === 'contact-logs' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <div className={cardClass}>
                        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                           <h3 className="text-xl font-black text-[#172B3A] flex items-center gap-2"><History className="text-[#087F8C]"/> سجل الاتصالات والتذكيرات</h3>
                           <div className="flex flex-wrap items-center gap-2">
                             <button onClick={() => {
                               const esc = (v: unknown) => String(v ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                               handlePrint('تقرير سجل الاتصالات والتذكيرات', `<table><thead><tr><th>الموظف</th><th>المريض</th><th>الهاتف</th><th>النوع</th><th>القسم</th><th>الطبيب</th><th>التاريخ</th></tr></thead><tbody>${filteredContactLogs.map(log => `<tr><td>${esc(log.staff_name)}</td><td>${esc(log.patient_name)}</td><td>${esc(log.patient_phone)}</td><td>${log.contact_type === 'whatsapp' ? 'واتساب' : 'SMS'}</td><td>${log.item_type === 'booking' ? 'حجز' : 'عملية'}</td><td>${esc(log.doctor_name)}</td><td>${esc(new Date(log.created_at).toLocaleString('ar-EG'))}</td></tr>`).join('')}</tbody></table>`);
                             }} className="bg-[#F5FAFC] text-[#087F8C] border border-[#DFEAF0] px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-[#087F8C]/10 cursor-pointer transition-colors"><Printer size={15}/> طباعة</button>
                             <button onClick={fetchContactLogs} className="bg-[#F5FAFC] text-[#1769AA] border border-[#DFEAF0] px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-[#1769AA]/10 cursor-pointer transition-colors"><RotateCcw size={15}/> تحديث</button>
                             {currentUser?.role === 'admin' && (
                               <button
                                 onClick={() => setClearingContactLogsModal(true)}
                                 disabled={contactLogsLoading || contactLogs.length === 0}
                                 className="bg-red-50 text-red-600 border border-red-200/80 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                               >
                                 <Trash2 size={15}/> مسح السجل
                               </button>
                             )}
                           </div>
                        </div>
                        {contactLogsNotice && (
                          <div className={`mb-4 p-3 rounded-xl text-xs font-bold border ${contactLogsNotice.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            {contactLogsNotice.message}
                          </div>
                        )}
                        <p className="text-xs text-[#172B3A] mb-6 font-bold bg-[#F5FAFC] p-3.5 rounded-xl border border-[#DFEAF0] flex items-center gap-2">
                          <Info size={16} className="text-[#087F8C] shrink-0" />
                          <span>يعرض هذا السجل جميع عمليات الاتصال والتذكير التي قام بها كل موظف مع المرضى.</span>
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                          <select value={contactStaffFilter} onChange={e => setContactStaffFilter(e.target.value)} className={inputClass} aria-label="الموظف">
                            <option value="">كل الموظفين</option>
                            {contactStaffOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={contactDoctorFilter} onChange={e => setContactDoctorFilter(e.target.value)} className={inputClass} aria-label="الطبيب">
                            <option value="">كل الأطباء</option>
                            {contactDoctorOptions.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <input type="date" value={contactDateFrom} onChange={e => setContactDateFrom(e.target.value)} className={`${inputClass} fv-num`} aria-label="من تاريخ" title="من تاريخ" />
                          <input type="date" value={contactDateTo} onChange={e => setContactDateTo(e.target.value)} className={`${inputClass} fv-num`} aria-label="إلى تاريخ" title="إلى تاريخ" />
                          <div className="flex items-center"><button onClick={() => { setContactStaffFilter(''); setContactDoctorFilter(''); setContactDateFrom(''); setContactDateTo(''); }} className="text-red-600 font-bold text-xs hover:underline cursor-pointer">مسح الفلاتر</button></div>
                        </div>
                        {contactLogsLoading ? (
                          <p className="text-center text-[#718394] py-10 font-bold text-sm">جاري التحميل...</p>
                        ) : filteredContactLogs.length === 0 ? (
                          <p className="text-center text-[#718394] py-10 font-bold text-sm">لا توجد سجلات اتصال بعد</p>
                        ) : (
                          <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                            <table className="w-full text-sm">
                              <thead><tr className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                                <th className="p-3.5 text-right">الموظف</th>
                                <th className="p-3.5 text-right">المريض</th>
                                <th className="p-3.5 text-right">الهاتف</th>
                                <th className="p-3.5 text-right">النوع</th>
                                <th className="p-3.5 text-right">القسم</th>
                                <th className="p-3.5 text-right">الطبيب</th>
                                <th className="p-3.5 text-right">التاريخ</th>
                              </tr></thead>
                              <tbody className="divide-y divide-[#DFEAF0]/70">
                                {filteredContactLogs.map(log => (
                                  <tr key={log.id} className="hover:bg-[#F5FAFC] transition-colors">
                                    <td className="p-3.5 font-bold text-[#172B3A]">{log.staff_name}</td>
                                    <td className="p-3.5 text-[#172B3A] font-medium">{log.patient_name}</td>
                                    <td className="p-3.5 text-xs text-[#718394] fv-mono" dir="ltr">{log.patient_phone}</td>
                                    <td className="p-3.5"><span className={`px-2.5 py-1 rounded-md text-[10px] font-black ${log.contact_type === 'whatsapp' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80' : 'bg-amber-50 text-amber-700 border border-amber-200/80'}`}>{log.contact_type === 'whatsapp' ? 'واتساب' : 'SMS'}</span></td>
                                    <td className="p-3.5"><span className={`px-2.5 py-1 rounded-md text-[10px] font-black ${log.item_type === 'booking' ? 'bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20' : 'bg-[#1769AA]/10 text-[#1769AA] border border-[#1769AA]/20'}`}>{log.item_type === 'booking' ? 'حجز' : 'عملية'}</span></td>
                                    <td className="p-3.5 text-xs text-[#172B3A]">{log.doctor_name || '-'}</td>
                                    <td className="p-3.5 text-xs text-[#718394] fv-num">{new Date(log.created_at).toLocaleString('ar-EG')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                     </div>
                  </div>
                )}
                {activeTab === 'operations' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <div className={cardClass}>
                        <h3 className="text-xl font-black text-[#172B3A] mb-6 flex items-center gap-2">{editingOpId ? <Edit2 size={22} className="text-[#087F8C]"/> : <Plus size={22} className="text-[#087F8C]"/>} {editingOpId ? 'تعديل سجل عملية' : 'تسجيل عملية جراحية جديدة'}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم المريض</label><input type="text" value={newOp.patientName} onChange={e => setNewOp({...newOp, patientName: e.target.value})} className={inputClass} /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رقم الهاتف</label><input type="text" value={newOp.patientPhone} onChange={e => setNewOp({...newOp, patientPhone: e.target.value})} className={`${inputClass} fv-num`} /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">رقم الهاتف 2 (اختياري)</label><input type="text" value={newOp.patientPhone2 || ''} onChange={e => setNewOp({...newOp, patientPhone2: e.target.value})} className={`${inputClass} fv-num`} /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">السن</label><input type="number" min={1} max={120} value={newOp.patientAge ?? ''} onChange={e => setNewOp({...newOp, patientAge: e.target.value ? Number(e.target.value) : undefined})} className={`${inputClass} fv-num`} placeholder="السن" /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">الطبيب الجراح</label><select value={newOp.doctorName} onChange={e => setNewOp({...newOp, doctorName: e.target.value})} className={inputClass}><option value="">اختر الطبيب</option>{doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}</select></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">نوع العملية</label><input type="text" value={newOp.surgeryType} onChange={e => setNewOp({...newOp, surgeryType: e.target.value})} className={inputClass} placeholder="مياه بيضاء، ليزك..." /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">تاريخ العملية</label><input type="date" value={newOp.date} onChange={e => setNewOp({...newOp, date: e.target.value})} className={`${inputClass} fv-num`} /></div>
                           <div><label className="text-xs font-bold text-[#718394] mb-1.5 block">التكلفة (ج.م)</label><input type="number" value={newOp.cost} onChange={e => setNewOp({...newOp, cost: Number(e.target.value)})} className={`${inputClass} fv-num`} /></div>
                           
                           {/* Integrated Contracting Selector for Operations */}
                           <div className="lg:col-span-1">
                                <label className="text-xs font-bold text-[#718394] mb-1.5 block">جهة التعاقد (اختياري)</label>
                                <select 
                                    value={newOp.contractingCompanyId || ''} 
                                    onChange={e => setNewOp({...newOp, contractingCompanyId: e.target.value ? Number(e.target.value) : undefined})} 
                                    className={inputClass}
                                >
                                    <option value="">حساب خاص</option>
                                    {contractingList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                           </div>

                           <div className="md:col-span-3"><label className="text-xs font-bold text-[#718394] mb-1.5 block">ملاحظات طبية</label><textarea value={newOp.notes} onChange={e => setNewOp({...newOp, notes: e.target.value})} className={inputClass} rows={2} /></div>
                        </div>
                        <div className="mt-8 flex gap-3">
                           <button onClick={editingOpId ? handleSaveOpEdit : handleAddOp} className="fv-btn-primary text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 cursor-pointer">{editingOpId ? 'حفظ التعديلات' : 'تسجيل العملية'}</button>
                           {editingOpId && <button onClick={() => { setEditingOpId(null); setNewOp({ patientName: '', patientPhone: '', patientPhone2: '', patientEmail: '', patientAge: undefined, doctorName: '', surgeryType: '', date: '', cost: 0, notes: '', contractingCompanyId: undefined }); }} className="bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-bold py-3 px-8 rounded-xl hover:text-[#172B3A] cursor-pointer">إلغاء</button>}
                        </div>
                     </div>
                     <div className={cardClass}>
                        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                           <h3 className="text-xl font-black text-[#172B3A]">سجل العمليات الجراحية <span className="text-[#087F8C] fv-num">({filteredOperations.length})</span></h3>
                           <div className="flex flex-wrap gap-2 items-center">
                              <input type="date" value={opFilterStart} onChange={e => setOpFilterStart(e.target.value)} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-2 text-xs font-bold text-[#172B3A] fv-num outline-hidden focus:border-[#087F8C]" title="من تاريخ" />
                              <span className="text-[#718394] font-bold">-</span>
                              <input type="date" value={opFilterEnd} onChange={e => setOpFilterEnd(e.target.value)} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-2 text-xs font-bold text-[#172B3A] fv-num outline-hidden focus:border-[#087F8C]" title="إلى تاريخ" />
                              
                              <select value={opFilterDoctor} onChange={e => setOpFilterDoctor(e.target.value)} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-2 text-xs font-bold text-[#172B3A] outline-hidden focus:border-[#087F8C] max-w-[150px]">
                                  <option value="">كل الأطباء</option>
                                  {doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                              </select>

                              <select value={opFilterContracting} onChange={e => setOpFilterContracting(e.target.value)} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-2 text-xs font-bold text-[#172B3A] outline-hidden focus:border-[#087F8C]">
                                  <option value="">كل التعاقدات</option>
                                  <option value="-1">حساب خاص</option>
                                  {contractingList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>

                              <select value={opFilterStatus} onChange={e => setOpFilterStatus(e.target.value)} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-2 text-xs font-bold text-[#172B3A] outline-hidden focus:border-[#087F8C]">
                                  <option value="">كل الحالات</option>
                                  <option value="confirmed">ناجحة/مؤكدة</option>
                                  <option value="pending">مجدولة</option>
                                  <option value="cancelled">ملغاة</option>
                              </select>

                              <input type="text" placeholder="بحث باسم المريض..." value={opSearchName} onChange={e => setOpSearchName(e.target.value)} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-2 text-xs font-bold text-[#172B3A] outline-hidden focus:border-[#087F8C] w-36" />
                              
                              <button onClick={() => handlePrint('تقرير سجل العمليات', `<table><thead><tr><th>المريض</th><th>الهواتف</th><th>العملية</th><th>جهة التعاقد</th><th>الطبيب</th><th>التاريخ</th><th>التكلفة</th><th>الحالة</th></tr></thead><tbody>${filteredOperations.map(op => {
                                  const company = contractingList.find(c => c.id === op.contractingCompanyId);
                                  return `<tr><td>${op.patientName}</td><td>${op.patientPhone} ${op.patientPhone2 ? '/ ' + op.patientPhone2 : ''}</td><td>${op.surgeryType}</td><td>${company ? company.name : 'حساب خاص'}</td><td>${op.doctorName}</td><td>${op.date}</td><td>${op.cost}</td><td>${op.status === 'confirmed' ? 'ناجحة' : op.status === 'cancelled' ? 'ملغاة' : 'مجدولة'}</td></tr>`;
                              }).join('')}</tbody></table>`)} className="bg-[#F5FAFC] text-[#087F8C] border border-[#DFEAF0] p-2 rounded-xl hover:bg-[#087F8C]/10 cursor-pointer transition-colors" title="طباعة السجل"><Printer size={18}/></button>
                           </div>
                        </div>
                        <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                           <table className="w-full text-right">
                              <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]"><tr><th className="p-3.5">المريض / التعاقد</th><th className="p-3.5">العملية</th><th className="p-3.5">الطبيب</th><th className="p-3.5">التاريخ</th><th className="p-3.5">الحالة</th><th className="p-3.5 text-center">إجراءات</th></tr></thead>
                              <tbody className="divide-y divide-[#DFEAF0]/70">
                                 {filteredOperations.map(op => (
                                    <tr key={op.id} className="hover:bg-[#F5FAFC] transition-colors">
                                       <td className="p-3.5 font-bold text-[#172B3A]">
                                         <div>{op.patientName}</div>
                                         <div className="flex flex-wrap gap-2 items-center mt-1">
                                            <span className="text-[11px] text-[#718394] font-medium fv-mono" dir="ltr">{op.patientPhone}</span>
                                            {op.patientAge ? <span className="text-[11px] text-[#718394] font-medium fv-num">({op.patientAge} سنة)</span> : null}
                                            {op.contractingCompanyId ? (
                                                <span className="px-2 py-0.5 bg-[#087F8C]/10 text-[#087F8C] rounded-md text-[10px] font-black border border-[#087F8C]/20">
                                                    {contractingList.find(c => c.id === op.contractingCompanyId)?.name || 'تعاقد'}
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-[#F5FAFC] text-[#718394] rounded-md text-[10px] font-bold border border-[#DFEAF0]">حساب خاص</span>
                                            )}
                                         </div>
                                       </td>
                                       <td className="p-3.5 text-sm font-bold text-[#087F8C]">{op.surgeryType}</td>
                                       <td className="p-3.5 text-sm text-[#172B3A]">{op.doctorName}</td>
                                       <td className="p-3.5 text-sm font-bold text-[#172B3A] fv-num">{op.date}</td>
                                       <td className="p-3.5"><span className={`px-2.5 py-1 rounded-md text-[10px] font-black ${op.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80' : op.status === 'cancelled' ? 'bg-red-50 text-red-700 border border-red-200/80' : 'bg-amber-50 text-amber-700 border border-amber-200/80'}`}>{op.status === 'confirmed' ? 'تمت بنجاح' : op.status === 'cancelled' ? 'ملغاة' : 'مجدولة'}</span></td>
                                       <td className="p-3.5 flex justify-center gap-1.5">
                                          <button onClick={() => handleStartEditOp(op)} className="p-2 text-[#1769AA] hover:bg-[#1769AA]/10 rounded-lg cursor-pointer transition-colors" title="تعديل"><Edit2 size={16}/></button>
                                          <button onClick={() => handleToggleOpStatus(op.id, op.status === 'confirmed' ? 'pending' : 'confirmed')} className={`p-2 rounded-lg cursor-pointer transition-colors ${op.status === 'confirmed' ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>{op.status === 'confirmed' ? <RotateCcw size={16}/> : <CheckCircle size={16}/>}</button>
                                          {currentUser.role === 'admin' && (<button onClick={() => setDeletingOpIdModal(op.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors" title="حذف"><Trash2 size={16}/></button>)}
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
                )}
                {activeTab === 'patient-stats' && (
                  <PatientStats
                    bookings={allBookings}
                    operations={operations}
                    contractingCompanies={contractingList.map(c => ({ id: c.id, name: c.name }))}
                    cardClass={cardClass}
                    inputClass={inputClass}
                    onPrint={handlePrint}
                  />
                )}
                {activeTab === 'intelligence' && (
                  <ManagementIntelligence
                    bookings={allBookings}
                    operations={operations}
                    doctors={doctors}
                    contractingCompanies={contractingList.map(c => ({ id: c.id, name: c.name }))}
                    cardClass={cardClass}
                    inputClass={inputClass}
                    onPrint={handlePrint}
                  />
                )}
                {activeTab === 'paymob-settings' && currentUser.role === 'admin' && (
                   <PaymobSettingsPanel cardClass={cardClass} inputClass={inputClass} />
                )}
                {activeTab === 'payments' && (
                   <PaymentsTab 
                     cardClass={cardClass} 
                     inputClass={inputClass} 
                     onPrint={handlePrint}
                     isAdmin={currentUser.role === 'admin'}
                     showInstapayReview={currentUser.role === 'admin' || currentUser.permissions.includes('review_instapay')}
                   />
                )}
                </>)}
            </main>
        </div>
      </div>
    </div>
  );
};

// Shown in a home page section while its items are still loading from the database.
const SectionLoading = ({ language }: { language: 'ar' | 'en' }) => (
  <div className="py-12 text-center" role="status">
    <div className="w-10 h-10 border-4 border-[#087F8C] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p className="text-[#718394] font-bold text-sm">{language === 'ar' ? 'جاري التحميل…' : 'Loading…'}</p>
  </div>
);

const DoctorsList = ({ doctors, onBook, language, isLoading = false }: { doctors: Doctor[], onBook: (doctor: Doctor) => void, language: 'ar' | 'en', t: any, isLoading?: boolean }) => {
  const [searchTerm] = useState('');
  const filteredDoctors = doctors.filter(doc => doc.name.toLowerCase().includes(searchTerm.toLowerCase()) || doc.specialty.toLowerCase().includes(searchTerm.toLowerCase()));
  return (
    <div id="doctors" className="py-24 relative overflow-hidden scroll-mt-20">
      <div className="pointer-events-none absolute -top-16 right-[-8%] w-[28rem] h-[28rem] rounded-full bg-[#25B8C7]/12 blur-3xl"></div>
      <div className="pointer-events-none absolute bottom-0 left-[-6%] w-[26rem] h-[26rem] rounded-full bg-[#1769AA]/10 blur-3xl"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-14">
          <span className="text-[#066D78] text-xs font-extrabold uppercase tracking-widest mb-3 inline-block">
            {language === 'ar' ? 'نخبة من الاستشاريين' : 'Elite Consultants'}
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-[#172B3A] mb-4 tracking-tight leading-tight fv-balance">
            {language === 'ar' ? 'تعرف على فريقنا الطبي' : 'Meet Our Medical Team'}
          </h2>
          <p className="text-[#4A5F72] text-base md:text-lg font-medium max-w-2xl mx-auto">
            {language === 'ar' ? 'نضم مجموعة من أمهر الأطباء الحاصلين على أعلى المؤهلات العلمية لتقديم رعاية طبية متميزة لعينيك.' : 'We host a group of the most skilled doctors with the highest scientific qualifications to provide distinguished medical care for your eyes.'}
          </p>
          <div className="w-16 h-1 bg-gradient-to-r from-[#087F8C] to-[#25B8C7] mx-auto mt-6 rounded-full"></div>
        </div>

        {isLoading && <SectionLoading language={language} />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredDoctors.map(doctor => (
              <div key={doctor.id} className="group relative glass-doctor-card rounded-3xl overflow-hidden transition-all duration-300 flex flex-col h-full">
                <div className="h-1.5 w-full bg-gradient-to-r from-[#087F8C] via-[#25B8C7] to-[#1769AA]"></div>
                
                <div className="p-7 md:p-8 grow flex flex-col">
                  <div className="relative mx-auto mb-7 group-hover:scale-[1.03] transition-transform duration-300">
                    <div className="w-36 h-36 rounded-2xl overflow-hidden border-2 border-white/85 shadow-[0_14px_30px_-14px_rgba(11,31,53,0.2)] relative z-10 bg-white/80">
                        <img src={doctor.image} alt={doctor.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2.5 -right-2.5 w-10 h-10 bg-[#087F8C] text-white rounded-xl flex items-center justify-center shadow-md border-2 border-white z-20">
                        <CheckCircle size={20} />
                    </div>
                  </div>

                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-[#172B3A] mb-2 group-hover:text-[#066D78] transition-colors leading-tight">{doctor.name}</h3>
                    <div className="inline-flex items-center gap-2 bg-[#087F8C]/12 text-[#066D78] px-3.5 py-1.5 rounded-xl font-bold text-xs border border-[#087F8C]/25">
                        <StethoscopeIcon size={14} />
                        {doctor.specialty}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 mb-6">
                    <div className="bg-white/60 backdrop-blur-xs p-3.5 rounded-2xl border border-[#DFEAF0]/85 text-center shadow-[0_2px_10px_-6px_rgba(11,31,53,0.08)]">
                        <div className="flex justify-center text-[#1769AA] mb-1.5"><Briefcase size={18} /></div>
                        <p className="text-[10px] font-bold text-[#4A5F72] uppercase mb-0.5">{language === 'ar' ? 'الخبرة' : 'Experience'}</p>
                        <p className="text-base font-black text-[#172B3A] fv-num">{doctor.experience} {language === 'ar' ? 'سنة' : 'Years'}</p>
                    </div>
                  </div>

                  <div className="space-y-3.5 mb-7">
                    <div className="flex items-start gap-2.5">
                        <GraduationCap className="text-[#066D78] shrink-0 mt-0.5" size={17} />
                        <p className="text-xs font-semibold text-[#3B5062] leading-relaxed">{doctor.education}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {doctor.topSpecialties.map((spec, i) => (
                            <span key={i} className="bg-white/65 text-[#172B3A] px-2.5 py-1 rounded-lg text-[10px] font-bold border border-[#DFEAF0]/85">
                                {spec}
                            </span>
                        ))}
                    </div>
                    <DoctorSocialLinks doc={doctor} />
                  </div>

                  <div className="mt-auto pt-5 border-t border-[#DFEAF0]/80 flex items-center justify-between gap-4">
                    <div className="shrink-0">
                        <p className="text-[10px] font-bold text-[#4A5F72] uppercase mb-0.5">{language === 'ar' ? 'سعر الكشف' : 'Booking Fee'}</p>
                        <p className="text-xl font-black text-[#066D78] fv-num">{doctor.fee} <span className="text-xs font-bold text-[#4A5F72]">ج.م</span></p>
                    </div>
                    <button 
                        onClick={() => onBook(doctor)} 
                        className="flex-1 fv-btn-primary py-3.5 px-4 rounded-xl font-black flex items-center justify-center gap-2 text-sm"
                    >
                        <Calendar size={18} />
                        {language === 'ar' ? 'احجز موعدك' : 'Book Appointment'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

const PartnersSection = ({ partners, language }: { partners: Partner[], language: 'ar' | 'en' }) => {
  if (partners.length === 0) return null;
  return (
    <div id="partners" className="py-16 relative scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
            <span className="text-[#087F8C] text-xs font-extrabold uppercase tracking-widest mb-2.5 inline-block">{language === 'ar' ? 'التعاقدات والتأمين الطبي' : 'Medical Insurance & Partners'}</span>
            <h2 className="text-3xl md:text-4xl font-black text-[#172B3A] mb-3 tracking-tight fv-balance">{language === 'ar' ? 'شركاء النجاح' : 'Our Partners'}</h2>
            <p className="text-[#718394] text-sm md:text-base font-medium max-w-xl mx-auto">{language === 'ar' ? 'نتشرف بالتعاون مع كبرى شركات التأمين والنقابات لتوفير رعاية صحية متميزة' : 'We are honored to cooperate with major insurance companies and unions to provide distinguished health care.'}</p>
            <div className="w-16 h-1 bg-gradient-to-r from-[#087F8C] to-[#25B8C7] mx-auto mt-6 rounded-full"></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {partners.map((partner) => (
            <div key={partner.id} className="glass-service-card p-5 rounded-2xl transition-all duration-300 text-center group relative overflow-hidden flex flex-col h-full">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] flex items-center justify-center group-hover:scale-105 transition-transform duration-300 overflow-hidden p-1.5">
                {partner.logo ? <img src={partner.logo} alt={partner.name} className="w-full h-full object-contain rounded-lg" /> : <Handshake size={26} className="text-[#087F8C]" />}
              </div>
              <h3 className="text-sm font-black text-[#172B3A] mb-1.5 group-hover:text-[#087F8C] transition-colors leading-tight">{partner.name}</h3>
              <p className="text-[#718394] leading-relaxed text-xs font-medium grow line-clamp-2">{partner.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Services = ({ services, language, isLoading = false }: { services: ServiceItem[], language: 'ar' | 'en', isLoading?: boolean }) => (
    <div id="services" className="py-20 relative overflow-hidden scroll-mt-20">
      <div className="pointer-events-none absolute top-4 left-[-6%] w-[24rem] h-[24rem] rounded-full bg-[#25B8C7]/12 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-10 right-[-6%] w-[24rem] h-[24rem] rounded-full bg-[#1769AA]/10 blur-3xl"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-12">
            <span className="text-[#066D78] text-xs font-extrabold uppercase tracking-widest mb-2.5 inline-block">{language === 'ar' ? 'ما نقدمه لعينيك' : 'What we offer your eyes'}</span>
            <h2 className="text-3xl md:text-4xl font-black text-[#172B3A] tracking-tight leading-tight fv-balance">{language === 'ar' ? 'خدماتنا الطبية المتكاملة' : 'Integrated Medical Services'}</h2>
            <p className="text-[#4A5F72] mt-3 max-w-2xl mx-auto text-base font-medium">{language === 'ar' ? 'نقدم مجموعة واسعة من الخدمات المتخصصة بأعلى معايير الجودة العالمية وأحدث التقنيات.' : 'We offer a wide range of specialized services with the highest international quality standards and latest technology.'}</p>
            <div className="w-16 h-1 bg-gradient-to-r from-[#087F8C] to-[#25B8C7] mx-auto mt-6 rounded-full"></div>
        </div>
        {isLoading && <SectionLoading language={language} />}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {services.map((service) => {
             const IconComp = getService3DIcon(service.iconName);
             return (
                <div key={service.id} className="glass-service-card p-5 rounded-3xl transition-all duration-300 text-center group relative overflow-hidden flex flex-col h-full">
                    <div className="w-15 h-15 mx-auto mb-4 rounded-2xl bg-white/75 backdrop-blur-xs border border-[#DFEAF0]/90 shadow-[0_4px_12px_-6px_rgba(11,31,53,0.1)] flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                        <IconComp size={34} className={service.color} />
                    </div>
                    <h3 className="text-sm font-black text-[#172B3A] mb-2 leading-tight">{service.title}</h3>
                    <p className="text-[#3B5062] mb-4 leading-relaxed text-xs font-medium grow line-clamp-2">{service.description}</p>
                    <div className="mt-auto">
                        <div className="w-full h-px bg-[#DFEAF0]/80 mb-3"></div>
                        <p className="text-lg font-black text-[#066D78] fv-num">{service.price} <span className="text-[11px] text-[#4A5F72] font-bold">ج.م</span></p>
                    </div>
                </div>
             );
          })}
        </div>
      </div>
    </div>
);

const Footer = ({ settings, t, onNavigate }: { settings: AppSettings, t: any, onNavigate: (section: string) => void }) => (
    <footer className="fv-dark-surface text-white pt-20 pb-10 mt-16 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#087F8C] via-[#25B8C7] to-[#1769AA]"></div>
        <div className="absolute inset-0 fv-grid-pattern opacity-25 pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-14">
                <div>
                    <div className="flex items-center gap-2.5 mb-5">
                        <div className="w-10 h-10 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center overflow-hidden p-1">
                             {settings.logoUrl ? <img src={settings.logoUrl} className="w-full h-full object-contain" alt="Logo" /> : <Eye size={22} className="text-[#25B8C7]" />}
                        </div>
                        <span className="text-xl font-black tracking-tight">{settings.appName}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed text-sm font-medium mb-6">{settings.heroDescription}</p>
                    <div className="flex gap-3">
                        <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 hover:bg-[#1769AA] flex items-center justify-center transition-all hover:-translate-y-0.5"><Facebook size={18} /></a>
                        <a href={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 hover:bg-[#087F8C] flex items-center justify-center transition-all hover:-translate-y-0.5"><MessageCircle size={18} /></a>
                    </div>
                </div>
                <div>
                    <h4 className="text-base font-black mb-5 flex items-center gap-2 text-white"><List size={17} className="text-[#25B8C7]"/> {settings.language === 'ar' ? 'روابط سريعة' : 'Quick Links'}</h4>
                    <ul className="space-y-2.5 text-slate-300 font-semibold text-sm">
                        <li><button onClick={() => onNavigate('home')} className="hover:text-[#25B8C7] transition-colors">{t.home}</button></li>
                        <li><button onClick={() => onNavigate('about')} className="hover:text-[#25B8C7] transition-colors">{t.about}</button></li>
                        <li><button onClick={() => onNavigate('partners')} className="hover:text-[#25B8C7] transition-colors">{t.partners}</button></li>
                        <li><button onClick={() => onNavigate('doctors')} className="hover:text-[#25B8C7] transition-colors">{t.doctors}</button></li>
                        <li><button onClick={() => onNavigate('services')} className="hover:text-[#25B8C7] transition-colors">{t.services}</button></li>
                        <li><button onClick={() => onNavigate('my-bookings')} className="hover:text-[#25B8C7] transition-colors">{t.myBookings}</button></li>
                        <li><button onClick={() => onNavigate('contact')} className="hover:text-[#25B8C7] transition-colors">{t.contact}</button></li>
                        <li><button onClick={() => onNavigate('terms')} className="hover:text-[#25B8C7] transition-colors">{t.terms}</button></li>
                    </ul>
                </div>
                <div>
                    <h4 className="text-base font-black mb-5 flex items-center gap-2 text-white"><Phone size={17} className="text-[#25B8C7]"/> {settings.language === 'ar' ? 'أرقام التواصل والعناوين' : 'Contact & Address'}</h4>
                    <ul className="space-y-3 text-slate-300 font-semibold text-sm">
                        {settings.phones.map((phone, i) => <li key={i} dir="ltr" className="text-right fv-num">{phone}</li>)}
                        <li className="mt-4 pt-4 border-t border-white/10">
                            {settings.addresses.map((addr, i) => <p key={i} className="mb-2 flex items-start gap-2 text-slate-300"><MapPin size={15} className="mt-0.5 shrink-0 text-[#25B8C7]"/> {addr}</p>)}
                        </li>
                    </ul>
                </div>
                <div>
                     <h4 className="text-base font-black mb-5 flex items-center gap-2 text-white"><Clock size={17} className="text-[#25B8C7]"/> {settings.language === 'ar' ? 'مواعيد العمل' : 'Working Hours'}</h4>
                     <ul className="space-y-3.5 text-slate-300 font-semibold text-sm">
                        {settings.language === 'ar' ? (
                            <>
                                <li className="flex justify-between gap-2"><span>السبت - الخميس:</span> <span className="fv-num">{settings.workingHours.weekdays}</span></li>
                                <li className="flex justify-between gap-2"><span>الجمعة:</span> <span className="fv-num">{settings.workingHours.friday}</span></li>
                            </>
                        ) : (
                            <>
                                <li className="flex justify-between gap-2"><span>Sat - Thu:</span> <span className="fv-num">{settings.workingHours.weekdays}</span></li>
                                <li className="flex justify-between gap-2"><span>Friday:</span> <span className="fv-num">{settings.workingHours.friday}</span></li>
                            </>
                        )}
                     </ul>
                </div>
            </div>
            <div className="border-t border-white/10 pt-7 text-center text-slate-400 text-xs font-semibold flex flex-col md:flex-row justify-between items-center gap-4">
                <p>&copy; {new Date().getFullYear()} {settings.appName}. {settings.language === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.</p>
                <div className="flex gap-4">
                    <button onClick={() => onNavigate('terms')} className="hover:text-[#25B8C7] transition-colors underline-offset-4 hover:underline">{t.terms}</button>
                    <span>|</span>
                    <p>Designed for Clinical Excellence</p>
                </div>
            </div>
        </div>
    </footer>
);

const MyBookingsView = ({ bookings, phone, setPhone, onSearch, onEditBooking, onCancelBooking }: { 
  bookings: Booking[]; 
  phone: string; 
  setPhone: (p: string) => void; 
  onSearch: () => void; 
  onEditBooking: (booking: Booking) => void; 
  onCancelBooking: (id: number) => void; 
}) => {
  return (
    <section className="py-16 md:py-20 px-4 max-w-7xl mx-auto min-h-[75vh]">
      <div className="text-center mb-10">
        <span className="text-[#087F8C] text-xs font-extrabold uppercase tracking-widest mb-2 block">إدارة المواعيد</span>
        <h2 className="text-3xl md:text-4xl font-black text-[#172B3A] mb-3 fv-balance">حجوزاتي</h2>
        <p className="text-[#718394] font-medium">تابع حالة حجوزاتك وقم بإدارتها بكل سهولة</p>
      </div>

      <div className="max-w-md mx-auto mb-12">
        <div className="flex gap-2">
          <input
            type="tel"
            placeholder="أدخل رقم الهاتف للبحث..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
            className="flex-1 p-3.5 rounded-xl bg-white border border-[#DFEAF0] text-[#172B3A] focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] outline-hidden font-bold text-left fv-num"
          />
          <button
            onClick={onSearch}
            className="fv-btn-primary px-6 rounded-xl font-black text-sm"
          >
            بحث
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bookings.map((booking: Booking) => (
          <div key={booking.id} className="bg-white p-6 rounded-2xl border border-[#DFEAF0] shadow-[0_10px_28px_-16px_rgba(11,31,53,0.1)] relative group overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[#087F8C] font-black fv-mono text-sm">#{booking.id.toString().slice(-4)}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {booking.status === 'confirmed' ? 'مؤكد' : 'ملغي'}
                  </span>
                </div>
                <h3 className="font-black text-[#172B3A]">{booking.patientName}</h3>
              </div>
              <div className="bg-[#087F8C]/10 p-2.5 rounded-xl text-[#087F8C]">
                <Calendar size={20} />
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-sm text-[#718394] font-medium fv-num">
                <Clock size={14} className="text-[#087F8C]" /> <span>{booking.date} - {booking.time}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#718394] font-medium">
                <Stethoscope size={14} className="text-[#1769AA]" /> <span>{booking.service}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#718394] font-medium">
                <User size={14} className="text-[#087F8C]" /> <span>{booking.doctorName}</span>
              </div>
            </div>

            {/* أزرار الإدارة للمريض - تعديل وإلغاء */}
            {booking.status === 'confirmed' && (
              <div className="flex gap-2 pt-4 border-t border-[#DFEAF0]">
                <button 
                  onClick={() => onEditBooking(booking)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#087F8C]/10 text-[#087F8C] py-2.5 rounded-xl text-sm font-bold hover:bg-[#087F8C]/20 transition-colors"
                >
                  <Edit2 size={14} /> تعديل
                </button>
                <button 
                  onClick={() => { if(confirm('هل أنت متأكد من إلغاء هذا الحجز؟')) onCancelBooking(booking.id); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-red-600 py-2.5 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={14} /> إلغاء
                </button>
              </div>
            )}
            {booking.status === 'cancelled' && (
              <div className="pt-4 border-t border-[#DFEAF0] text-center">
                <span className="text-red-600 text-xs font-bold">تم إلغاء هذا الحجز</span>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {bookings.length === 0 && phone && (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-[#DFEAF0]">
          <div className="w-14 h-14 bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] flex items-center justify-center mx-auto mb-4 text-[#718394]">
            <Search size={28} />
          </div>
          <p className="text-[#718394] font-bold">لم يتم العثور على حجوزات لهذا الرقم</p>
        </div>
      )}

      <InstapayStatusLookup />
    </section>
  );
};



const App = () => {
  // Supabase Auth hook
  const { baradaUser, signIn, signOut, isLoading: authLoading } = useBaradaAuth();
  
  const [activeSection, setActiveSection] = useState('home');
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<OfferRecord | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [instapayResult, setInstapayResult] = useState<InstapayResult | null>(null);
  const [paymobRedirecting, setPaymobRedirecting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [bookings, setBookings] = useState<Booking[]>(() => {
      const saved = localStorage.getItem('barada_bookings');
      return saved ? JSON.parse(saved) : [];
  });
  const [users, setUsers] = useState<User[]>(() => {
      const saved = localStorage.getItem('barada_users');
      return saved ? JSON.parse(saved) : INITIAL_USERS;
  });
  // currentUser is now derived from Supabase Auth with displayUsername
  const currentUser: User | null = baradaUser ? {
    id: parseInt(baradaUser.id.slice(-8), 16) || Date.now(),
    name: baradaUser.name,
    username: baradaUser.displayUsername || baradaUser.username,
    role: baradaUser.role,
    permissions: baradaUser.permissions,
  } : null;

  // Real-time sync - only enable when user is authenticated (staff/admin)
  const { data: realtimeData, isConnected, isLoading: realtimeLoading, refresh: refreshData } = useRealtimeSync({
    enabled: !!currentUser,
  });

  // Public clinic content (doctors, services, top photos, partners, offers, settings) for everyone.
  const { data: publicData, refresh: refreshPublicData } = usePublicSiteData();
  const doctorsLoading = publicData.doctors === null;
  const servicesLoading = publicData.services === null;
  const offersLoading = publicData.offers === null;

  const doctorsWithDbId = React.useMemo(() => {
    const rawDoctors = publicData.doctors || [];
    return doctors.map((doc) => {
      const matchedRaw = rawDoctors.find((r: any) => parseInt(String(r.id).slice(-8), 16) === doc.id || r.name === doc.name);
      return { ...doc, dbId: matchedRaw?.id as string | undefined };
    });
  }, [doctors, publicData.doctors]);

  const offers = React.useMemo(() => {
    if (!Array.isArray(publicData.offers)) return [];
    const byUuid = new globalThis.Map<string, { name?: string; specialty?: string }>();
    for (const d of publicData.doctors || []) {
      byUuid.set(d.id, { name: d.name, specialty: d.specialty });
    }
    return publicData.offers.map((row: any) => mapOfferRow(row, byUuid));
  }, [publicData.offers, publicData.doctors]);

  const videoCategories = React.useMemo(
    () => (publicData.medicalVideoCategories || []).map((row: Record<string, unknown>) => mapCategoryRow(row)),
    [publicData.medicalVideoCategories],
  );
  const medicalVideosLoading = publicData.medicalVideos === null;
  const medicalVideos = React.useMemo(() => {
    if (!Array.isArray(publicData.medicalVideos)) return [];
    const categoriesById = new globalThis.Map(videoCategories.map((c) => [c.id, c]));
    const doctorsByUuid = new globalThis.Map<string, { name?: string; specialty?: string }>();
    for (const d of publicData.doctors || []) {
      doctorsByUuid.set(d.id, { name: d.name, specialty: d.specialty });
    }
    return publicData.medicalVideos.map((row: Record<string, unknown>) =>
      mapMedicalVideoRow(row, categoriesById, doctorsByUuid),
    );
  }, [publicData.medicalVideos, videoCategories, publicData.doctors]);

  useEffect(() => {
    if (publicData.doctors) setDoctors(publicData.doctors.map(mapDoctorRow));
  }, [publicData.doctors]);

  useEffect(() => {
    // Staff lists always mirror the database once it has loaded (an emptied table shows empty).
    if (currentUser && !realtimeLoading) {
      const mappedBookings = realtimeData.bookings.map((b: any) => ({
        id: parseInt(b.id.slice(-8), 16) || Date.now(),
        patientName: b.patient_name,
        phone: b.phone,
        phone2: b.phone2,
        patientEmail: b.patient_email,
        address: b.address || '',
        age: b.age || undefined,
        governorate: b.governorate || undefined,
        center: b.center || undefined,
        notes: b.notes || undefined,
        bookingType: b.booking_type || 'cash',
        doctorId: b.doctor_id ? (parseInt(b.doctor_id.slice(-8), 16) || 0) : 0,
        doctorName: b.doctor_name,
        service: b.service,
        date: b.date,
        time: b.time,
        status: b.status as 'confirmed' | 'cancelled',
        createdAt: b.created_at,
        reminderSent: b.reminder_sent,
        reminderType: b.reminder_type,
        contractingCompanyId: b.contracting_company_id,
        contractingDocs: b.contracting_docs,
        paymentMethod: b.payment_method,
        paymentStatus: b.payment_status,
      }));
      setBookings(mappedBookings);
    }
  }, [realtimeData.bookings, realtimeLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Internal Booking Test Mode — runs once in dev, logs to console only
  const hasRunBookingTest = useRef(false);
  useEffect(() => {
    if (import.meta.env.DEV && doctors.length > 0 && !hasRunBookingTest.current) {
      hasRunBookingTest.current = true;
      runBookingTestMode(doctors, settings);
    }
  }, [doctors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Surgery operations and visitor messages come only from the database (src/barada/clinicRecords.ts).
  useEffect(() => {
    if (currentUser && !realtimeLoading) setOperations(realtimeData.operations.map(mapOperationRow));
  }, [realtimeData.operations, realtimeLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentUser && !realtimeLoading) setComplaints(realtimeData.complaints.map(mapComplaintRow));
  }, [realtimeData.complaints, realtimeLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (publicData.services) setServices(publicData.services.map(mapServiceRow));
  }, [publicData.services]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [heroImages, setHeroImages] = useState<HeroImage[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_APP_SETTINGS);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  const [searchPhone, setSearchPhone] = useState('');
  const [foundBookings, setFoundBookings] = useState<Booking[]>([]);

  const t = settings.language === 'ar' ? TRANSLATIONS.ar : TRANSLATIONS.en;

  const defaultDocTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (defaultDocTitleRef.current === null) {
      defaultDocTitleRef.current = document.title || 'مركز برادة للعيون بالاقصر';
    }
    if (activeSection === 'medical-videos') {
      document.title =
        settings.language === 'ar'
          ? `فيديوهات طبية | ${settings.appName}`
          : `Medical Videos | ${settings.appName}`;
    } else if (defaultDocTitleRef.current) {
      document.title = defaultDocTitleRef.current;
    }
  }, [activeSection, settings.language, settings.appName]);

  useEffect(() => { localStorage.setItem('barada_bookings', JSON.stringify(bookings)); }, [bookings]);
  // Note: Users are now managed through Supabase Auth, localStorage is only for legacy UI state
  // One-time copy of operations / messages this device kept before they were saved in the
  // database, so nothing recorded on a staff computer is lost.
  const localRecordsRef = useRef<{ ops: any[]; complaints: any[] } | null>(null);
  if (localRecordsRef.current === null) localRecordsRef.current = { ops: readLocalOperations(), complaints: readLocalComplaints() };
  useEffect(() => {
    if (!currentUser || realtimeLoading || !localRecordsRef.current) return;
    const { ops, complaints: localComplaints } = localRecordsRef.current;
    if (!ops.length && !localComplaints.length) return;
    localRecordsRef.current = { ops: [], complaints: [] };
    importLocalRecords(ops, localComplaints, realtimeData.operations, realtimeData.complaints).then((n) => { if (n > 0) refreshData(); });
  }, [!!currentUser, realtimeLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  // Doctors, services, top photos, partners and settings come only from the database.
  useEffect(() => { if (publicData.heroImages) setHeroImages(publicData.heroImages.map(mapHeroRow)); }, [publicData.heroImages]);
  useEffect(() => { if (publicData.partners) setPartners(publicData.partners.map(mapPartnerRow)); }, [publicData.partners]);
  useEffect(() => { if (publicData.settings) setSettings(prev => applySettingsRow(prev, publicData.settings)); }, [publicData.settings]);
  // Staff also get the staff-only settings (reminder messages) from the full settings row.
  useEffect(() => {
    if (!currentUser) return;
    supabase.from('app_settings').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle().then(({ data, error }) => {
      if (!error && data) setSettings(prev => applySettingsRow(prev, data));
    });
  }, [!!currentUser]); // eslint-disable-line react-hooks/exhaustive-deps
  // Payment methods saved from the dashboard settings apply to every visitor's booking window.
  useEffect(() => {
    supabase.rpc('get_payment_methods').then(({ data, error }) => {
      if (!error && Array.isArray(data)) setSettings(prev => ({ ...prev, paymentMethods: data as unknown as PaymentMethod[] }));
    });
  }, []);

const handleNavigate = (sectionId: string) => {
    // قائمة بالأقسام التي تعتبر جزءاً من الصفحة الرئيسية
    const homeSections = ['about', 'doctors', 'services', 'offers', 'stats', 'hero'];

    if (homeSections.includes(sectionId)) {
      // إذا كان القسم جزءاً من الصفحة الرئيسية، نتأكد أننا في قسم home أولاً
      setActiveSection('home');
      
      // ننتظر قليلاً حتى يتأكد React من رندر الصفحة الرئيسية ثم نقوم بالتمرير
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      // إذا كان قسماً منفصلاً (مثل لوحة التحكم أو حجوزاتي)
      setActiveSection(sectionId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    setIsMenuOpen(false);
  };

  const handleLogin = async (email: string, password: string): Promise<{ error: string | null }> => {
    const result = await signIn(email, password);
    if (!result.error) {
      setActiveSection('admin');
      addNotification('تم تسجيل الدخول بنجاح', `مرحباً بك`, 'success');
    }
    return result;
  };

  const handleLogout = async () => {
    await signOut();
    setActiveSection('home');
  };

  const handleBookAppointment = (doctor?: Doctor) => {
    setSelectedDoctor(doctor || null);
    setSelectedOffer(null);
    setEditingBooking(null);
    setIsBookingModalOpen(true);
  };

  const handleBookOffer = (doctorLookup: { id: number; dbId?: string; name: string }, offer: OfferRecord) => {
    const matchedDoctor =
      doctorsWithDbId.find((d) => (doctorLookup.dbId && d.dbId === doctorLookup.dbId) || d.id === doctorLookup.id) ||
      null;
    setSelectedDoctor(matchedDoctor);
    setSelectedOffer(offer);
    setEditingBooking(null);
    setIsBookingModalOpen(true);
  };

  const handleConfirmBooking = async (data: Omit<Booking, 'id' | 'createdAt' | 'status'> & { instapay?: InstapaySubmissionInput }) => {
    try {
      // Find the doctor's UUID from the doctors table
      const doctorData = realtimeData.doctors.find((d: any) => d.name === data.doctorName);
      const doctorUuid = doctorData?.id || null;
      
      const bookingData = {
        patient_name: data.patientName,
        phone: data.phone,
        phone2: data.phone2 || null,
        patient_email: data.patientEmail || null,
        address: data.address || null,
        age: data.age || null,
        governorate: data.governorate || null,
        center: data.center || null,
        notes: data.notes || null,
        booking_type: data.bookingType || 'cash',
        doctor_id: doctorUuid,
        doctor_name: data.doctorName,
        service: data.service,
        date: data.date,
        time: data.time,
        reminder_sent: data.reminderSent || false,
        reminder_type: data.reminderType || null,
        contracting_company_id: data.contractingCompanyId || null,
        contracting_docs: data.contractingDocs || null,
        payment_method: data.paymentMethod || null,
        payment_status: data.paymentStatus || 'pending',
        status: 'confirmed',
      };
      
      if (editingBooking) {
        // Find the original UUID from realtime data
        const originalBooking = realtimeData.bookings.find((b: any) => 
          parseInt(b.id.slice(-8), 16) === editingBooking.id
        );
        
        if (originalBooking) {
          const { error } = await supabase
            .from('bookings')
            .update(bookingData as any)
            .eq('id', originalBooking.id);
            
          if (error) throw error;
          addNotification('تم تعديل الحجز', `تم تعديل حجز المريض ${data.patientName} بنجاح`, 'success');
        } else {
          // Fallback to local update if UUID not found
          setBookings(prev => prev.map(b => b.id === editingBooking.id ? { ...b, ...data } : b));
          addNotification('تم تعديل الحجز', `تم تعديل حجز المريض ${data.patientName} بنجاح`, 'success');
        }
      } else {
        const newBookingId = crypto.randomUUID();
        const cancellationToken = crypto.randomUUID();
        const { error } = await supabase
          .from('bookings')
          .insert([{ ...bookingData, id: newBookingId, cancellation_token: cancellationToken } as any]);
          
        if (error) throw error;
        setBookings(prev => [...prev, {
          ...data, id: parseInt(newBookingId.slice(-8), 16), databaseId: newBookingId,
          cancellationToken, status: 'confirmed', createdAt: new Date().toISOString(),
        }]);
        addNotification('حجز جديد', `تم تسجيل حجز جديد للمريض ${data.patientName}`, 'success');
        if (data.instapay) {
          const res = await submitInstapay(newBookingId, data.phone, data.instapay);
          setInstapayResult(res);
        }
        if (data.paymentMethod === 'paymob') {
          setPaymobRedirecting(true);
          const res = await startPaymobCheckout(newBookingId, data.phone);
          if (res.url) {
            window.location.href = res.url;
          } else {
            setPaymobRedirecting(false);
            alert(`تم تسجيل الحجز، لكن ${res.error || 'تعذر فتح صفحة الدفع'}. يمكنك الدفع نقداً عند الحضور.`);
          }
        }
      }
    } catch (error: any) {
      console.error('Error saving booking:', error);
      if (String(error?.message || '').includes('DOCTOR_DAY_FULL')) {
        alert('عذراً، اكتمل الحد الأقصى لعدد المرضى لهذا الطبيب في هذا اليوم. يرجى اختيار يوم آخر.');
      } else if (String(error?.message || '').includes('DOCTOR_HOUR_FULL')) {
        alert('عذراً، اكتمل عدد المرضى المسموح به لهذا الطبيب في هذه الساعة. يرجى اختيار ساعة أخرى.');
      } else {
        alert('حدث خطأ أثناء حفظ الحجز. يرجى المحاولة مرة أخرى.');
      }
    }
    setIsBookingModalOpen(false);
    setSelectedOffer(null);
    setEditingBooking(null);
  };

  const handleBookingSearch = () => {
      if (searchPhone.length < 11) {
          alert('يرجى إدخال رقم هاتف صحيح');
          return;
      }
      const results = bookings.filter(b => b.phone === searchPhone || b.phone2 === searchPhone);
      setFoundBookings(results);
  };

  const addNotification = (title: string, message: string, type: 'success' | 'warning' | 'info') => {
      const newNote: AppNotification = {
          id: Date.now(),
          title,
          message,
          type,
          date: new Date().toLocaleTimeString(),
          read: false
      };
      setNotifications(prev => [newNote, ...prev]);
  };

  const handleClearNotifications = () => setNotifications([]);
  const handleMarkAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const handleCancelBooking = async (id: number) => {
    try {
      // Find the original UUID from realtime data
      const originalBooking = realtimeData.bookings.find((b: any) => 
        parseInt(b.id.slice(-8), 16) === id
      );
      
      if (originalBooking) {
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', originalBooking.id);
          
        if (error) throw error;
      } else {
        const booking = bookings.find(b => b.id === id);
        if (!booking || !canCancelPatientBooking(booking)) {
          alert('لا يمكن إلغاء هذا الحجز القديم من هذا الجهاز. يرجى التواصل مع المركز لإلغائه.');
          return;
        }
        const { data, error } = await supabase.rpc('cancel_patient_booking' as any, {
          _booking_id: booking.databaseId, _token: booking.cancellationToken,
        } as any);
        if (error || data !== true) throw error || new Error('Cancellation denied');
      }
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
      setFoundBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
      addNotification('تم إلغاء الحجز', 'تم إلغاء الحجز بنجاح', 'warning');
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('حدث خطأ أثناء إلغاء الحجز');
    }
  };

  const handleConfirmStatusBooking = async (id: number) => {
    try {
      // Find the original UUID from realtime data
      const originalBooking = realtimeData.bookings.find((b: any) => 
        parseInt(b.id.slice(-8), 16) === id
      );
      
      if (originalBooking) {
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'confirmed' })
          .eq('id', originalBooking.id);
          
        if (error) throw error;
      } else {
        // Fallback to local update
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'confirmed' } : b));
      }
      addNotification('تم تأكيد الحجز', 'تم تأكيد الحجز بنجاح', 'success');
    } catch (error) {
      console.error('Error confirming booking:', error);
      alert('حدث خطأ أثناء تأكيد الحجز');
    }
  };

  const handleEditBooking = (booking: Booking) => {
      setEditingBooking(booking);
      setIsBookingModalOpen(true);
  };

  const handleDeleteBooking = async (id: number) => {
    try {
      // Find the original UUID from realtime data
      const originalBooking = realtimeData.bookings.find((b: any) => 
        parseInt(b.id.slice(-8), 16) === id
      );
      
      if (originalBooking) {
        const { error } = await supabase
          .from('bookings')
          .delete()
          .eq('id', originalBooking.id);
          
        if (error) throw error;
      } else {
        // Fallback to local update
        setBookings(prev => prev.filter(b => b.id !== id));
      }
      addNotification('تم حذف الحجز', 'تم حذف الحجز نهائياً من النظام', 'warning');
    } catch (error) {
      console.error('Error deleting booking:', error);
      alert('حدث خطأ أثناء حذف الحجز');
    }
  };

  const handleSendReminder = (id: number, itemType: 'booking' | 'operation') => {
      if (itemType === 'booking') {
        const row = realtimeData.bookings.find((b: any) => numericId(b.id) === id);
        if (row) void markBookingReminderSent(row.id);
        setBookings(prev => prev.map(b => b.id === id ? { ...b, reminderSent: true } : b));
      } else {
        const op = operations.find(o => o.id === id);
        if (op?.dbId) void setOperationFields(op.dbId, { reminder_sent: true });
        setOperations(prev => prev.map(o => o.id === id ? { ...o, reminderSent: true } : o));
      }
      addNotification('تم إرسال التذكير', 'تم إرسال رسالة التذكير بنجاح', 'success');
  };

  // دالة استبدال المتغيرات في نص الرسالة
  const fillReminderTemplate = (template: string, item: any): string => {
      return template
        .replace(/\[الاسم\]/g, item.patientName || '')
        .replace(/\[التاريخ\]/g, item.date || '')
        .replace(/\[الوقت\]/g, item.time || '')
        .replace(/\[الطبيب\]/g, item.doctorName || '')
        .replace(/\[الإجراء\]/g, item.service || '');
  };

  const logContact = async (contactType: string, item: any, messagePreview: string) => {
    try {
      await supabase.from('contact_logs').insert({
        staff_user_id: baradaUser?.id || '',
        staff_name: baradaUser?.name || currentUser?.name || 'غير معروف',
        patient_name: item.patientName || '',
        patient_phone: item.phone || '',
        contact_type: contactType,
        item_type: item.itemType || 'booking',
        item_id: String(item.id || ''),
        doctor_name: item.doctorName || '',
        message_preview: messagePreview.slice(0, 200),
      });
    } catch { /* silent */ }
  };

  const handleSmsReminder = (item: any) => {
      const rawTemplate = item.itemType === 'booking' ? settings.reminderSettings.smsBody : settings.reminderSettings.opSmsBody;
      const filledMessage = fillReminderTemplate(rawTemplate, item);
      alert(`تم إرسال SMS تذكير للمريض: ${item.patientName}\nنص الرسالة:\n${filledMessage}`);
      handleSendReminder(item.id, item.itemType);
      logContact('sms', item, filledMessage);
  };

  const handleWhatsAppReminder = (item: any) => {
      let cleanPhone = (item.phone || '').replace(/[\s\-\+\(\)]/g, '');
      cleanPhone = cleanPhone.replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('0')) cleanPhone = '2' + cleanPhone;
      else if (!cleanPhone.startsWith('2') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;
      const rawTemplate = item.itemType === 'booking' ? settings.reminderSettings.whatsappBody : settings.reminderSettings.opWhatsappBody;
      const filledMessage = fillReminderTemplate(rawTemplate, item);
      const text = encodeURIComponent(filledMessage);
      const waUrl = `https://wa.me/${cleanPhone}?text=${text}`;
      // Use anchor element to avoid iframe/popup blocking
      const a = document.createElement('a');
      a.href = waUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      handleSendReminder(item.id, item.itemType);
      logContact('whatsapp', item, filledMessage);
  };

  const handleConfirmPayment = async (id: number) => {
      try {
        // Find the original UUID from realtime data
        const originalBooking = realtimeData.bookings.find((b: any) => 
          parseInt(b.id.slice(-8), 16) === id
        );
        
        if (originalBooking) {
          const { error } = await supabase
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', originalBooking.id);
            
          if (error) throw error;
        } else {
          // Fallback to local update
          setBookings(prev => prev.map(b => b.id === id ? { ...b, paymentStatus: 'paid' } : b));
        }
        addNotification('تأكيد الدفع', 'تم تأكيد استلام المبلغ بنجاح', 'success');
      } catch (error) {
        console.error('Error confirming payment:', error);
        alert('حدث خطأ أثناء تأكيد الدفع');
      }
  };

  return (
    <div dir={settings.language === 'ar' ? 'rtl' : 'ltr'} className={`font-sans barada-app-bg ${settings.language === 'ar' ? 'font-cairo' : ''}`}>
      <Navbar 
        onNavigate={handleNavigate} 
        onLoginClick={() => setActiveSection('login')} 
        currentUser={currentUser} 
        onLogout={handleLogout}
        settings={settings}
        notifications={notifications}
        onClearNotifications={handleClearNotifications}
        onMarkAsRead={handleMarkAsRead}
        t={t}
        transparent={activeSection === 'home'}
      />
      
      {activeSection === 'home' && (
        <>
          <Hero 
            onCtaClick={() => handleBookAppointment()} 
            images={heroImages}
            title={settings.heroTitle}
            description={settings.heroDescription}
            t={t}
          />
          <SmartStatsBar settings={settings} />
          <Services services={services} language={settings.language} isLoading={servicesLoading} />
          <OffersSection offers={offers} doctors={doctorsWithDbId} onBookOffer={handleBookOffer} language={settings.language} isLoading={offersLoading} />
          <DoctorsList doctors={doctors} onBook={handleBookAppointment} language={settings.language} t={t} isLoading={doctorsLoading} />
          <PartnersSection partners={partners} language={settings.language} />
          <AboutUs settings={settings} t={t} />
        </>
      )}

      {activeSection === 'login' && (
        <LoginView onLogin={handleLogin} settings={settings} isLoading={authLoading} />
      )}

      {activeSection === 'admin' && currentUser && (
        <AdminPanel 
           doctors={doctors} setDoctors={setDoctors}
           users={users} setUsers={setUsers}
           currentUser={currentUser}
           currentUserUuid={baradaUser?.id}
           allBookings={bookings} setBookings={setBookings}
           operations={operations} setOperations={setOperations}
           onCancelBooking={handleCancelBooking}
           onConfirmBooking={handleConfirmStatusBooking}
           onEditBooking={handleEditBooking}
           onDeleteBooking={handleDeleteBooking}
           onSendReminder={handleSendReminder}
           complaints={complaints} setComplaints={setComplaints}
           heroImages={heroImages} setHeroImages={setHeroImages}
           partners={partners} setPartners={setPartners}
           settings={settings} setSettings={setSettings}
           services={services} setServices={setServices}
           t={t}
           handleSmsReminder={handleSmsReminder}
           handleWhatsAppReminder={handleWhatsAppReminder}
           onConfirmPayment={handleConfirmPayment}
           onOffersChanged={() => { void refreshPublicData('offers'); }}
           onVideosChanged={() => { void Promise.all([refreshPublicData('medicalVideos'), refreshPublicData('medicalVideoCategories')]); }}
           onNotify={addNotification}
        />
      )}

      {activeSection === 'my-bookings' && (
          <MyBookingsView 
            bookings={foundBookings} 
            phone={searchPhone} 
            setPhone={setSearchPhone} 
            onSearch={handleBookingSearch}
            onEditBooking={handleEditBooking}
            onCancelBooking={handleCancelBooking}
          />
      )}

      {activeSection === 'contact' && (
          <ContactUsView 
             onSubmit={(data) => submitComplaint(data)}
             onNavigate={handleNavigate}
          />
      )}

      {activeSection === 'terms' && (
          <TermsView settings={settings} />
      )}

      {activeSection === 'medical-videos' && (
          <MedicalVideosPublicView
            videos={medicalVideos}
            categories={videoCategories}
            language={settings.language}
            isLoading={medicalVideosLoading}
          />
      )}

      <BookingModal 
        isOpen={isBookingModalOpen} 
        onClose={() => { setIsBookingModalOpen(false); setSelectedOffer(null); setEditingBooking(null); }} 
        doctor={selectedDoctor} 
        services={services}
        onConfirm={handleConfirmBooking}
        initialData={editingBooking}
        doctors={doctors}
        bookings={bookings}
        settings={settings}
        selectedOffer={selectedOffer}
      />

      <InstapaySubmittedDialog result={instapayResult} onClose={() => setInstapayResult(null)} />
      <PaymobResultDialog />
      {paymobRedirecting && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs" role="status" dir="rtl">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="w-10 h-10 border-4 border-[#087F8C] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="font-black text-[#172B3A]">جاري تحويلك إلى صفحة الدفع الآمنة…</p>
          </div>
        </div>
      )}

      {activeSection !== 'admin' && <AiAssistant language={settings.language} />}

      <Footer settings={settings} t={t} onNavigate={handleNavigate} />
    </div>
  );
};

export default App;
