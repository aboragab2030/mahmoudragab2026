import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from 'dompurify';
import {
  Calendar, Users, Activity, Clock, CheckCircle, AlertCircle, AlertTriangle,
  BarChart2, Printer, Phone, MessageCircle, TrendingUp, PieChart,
  Eye, Scissors, Banknote, Timer, UserCheck, PhoneOff, XCircle, Hash,
  CalendarDays, ArrowUpDown, RefreshCw, Filter, ChevronDown, ChevronUp,
  Bell, Shield, Flame, Star
} from 'lucide-react';

// Types matching parent component
interface Booking {
  id: number;
  patientName: string;
  phone: string;
  phone2?: string;
  doctorId: number;
  doctorName: string;
  service: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  reminderSent?: boolean;
  reminderType?: 'sms' | 'email' | 'none';
  bookingType?: 'cash' | 'contract';
  paymentMethod?: 'cash' | 'instapay' | 'wallet' | 'paymob';
  paymentStatus?: 'pending' | 'paid';
  contractingCompanyId?: number;
  notes?: string;
}

interface Operation {
  id: number;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  surgeryType: string;
  date: string;
  cost: number;
  reminderSent: boolean;
  status: 'pending' | 'confirmed' | 'cancelled';
  notes?: string;
  contractingCompanyId?: number;
}

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  maxPatients: number;
  currentBookings: number;
  fee: number;
  availableDates: string[];
  patientsPerHour: number;
}

interface AppSettings {
  appName: string;
  logoUrl: string;
  reminderSettings: {
    intervalHours: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface OverviewDashboardProps {
  bookings: Booking[];
  operations: Operation[];
  doctors: Doctor[];
  settings: AppSettings;
  cardClass: string;
  inputClass: string;
}

// =========== Helper functions ===========

const todayStr = () => new Date().toISOString().split('T')[0];
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};
const nDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// =========== StatCard ===========
const StatCard = ({ label, value, icon: Icon, color, sub }: { label: string; value: string | number; icon: any; color: string; sub?: string }) => (
  <div className="bg-white p-5 rounded-2xl border border-[#DFEAF0] shadow-[0_10px_28px_-18px_rgba(11,31,53,0.18)] hover:border-[#25B8C7]/50 transition-all">
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
      <span className="text-xs font-bold text-[#718394]">{label}</span>
    </div>
    <h3 className="text-2xl font-black text-[#172B3A] fv-num">{value}</h3>
    {sub && <p className="text-[11px] text-[#718394] font-bold mt-1 fv-num">{sub}</p>}
  </div>
);

// =========== AlertItem ===========
const AlertItem = ({ icon: Icon, color, text, count }: { icon: any; color: string; text: string; count: number }) => {
  if (count === 0) return null;
  return (
    <div className={`flex items-center justify-between p-3.5 rounded-xl border ${color}`}>
      <div className="flex items-center gap-2.5">
        <Icon size={16} />
        <span className="text-sm font-bold">{text}</span>
      </div>
      <span className="text-lg font-black fv-num">{count}</span>
    </div>
  );
};

// =========== Main Component ===========
const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  bookings, operations, doctors, settings, cardClass, inputClass
}) => {
  const [contactLogs, setContactLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'stats' | 'alerts' | 'reminders' | 'staff' | 'tables'>('stats');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const { data } = await supabase.from('contact_logs').select('*').order('created_at', { ascending: false }).limit(500);
      if (data) setContactLogs(data);
    } catch { /* silent */ }
    setLogsLoading(false);
  };

  const today = todayStr();
  const tomorrow = tomorrowStr();
  const sevenDaysAgo = nDaysAgo(7);
  const monthStart = startOfMonth();
  const intervalHours = settings.reminderSettings?.intervalHours || 24;

  // =========== Core Stats ===========
  const stats = useMemo(() => {
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
    const cancelledBookings = bookings.filter(b => b.status === 'cancelled');
    const todayBookings = confirmedBookings.filter(b => b.date === today);
    const tomorrowBookings = confirmedBookings.filter(b => b.date === tomorrow);
    const pendingBookings = confirmedBookings.filter(b => b.paymentStatus === 'pending');
    const monthBookings = confirmedBookings.filter(b => b.date >= monthStart);

    const confirmedOps = operations.filter(o => o.status === 'confirmed');
    const cancelledOps = operations.filter(o => o.status === 'cancelled');
    const pendingOps = operations.filter(o => o.status === 'pending');

    // Unique patients
    const allPatients = new Set([
      ...bookings.map(b => b.phone),
      ...operations.map(o => o.patientPhone)
    ]);
    const newPatientsThisMonth = new Set([
      ...monthBookings.map(b => b.phone),
    ]);

    // Active doctors today
    const activeDoctorsToday = new Set(todayBookings.map(b => b.doctorName));

    // Last 7 days data
    const last7Days: { date: string; bookings: number; operations: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = nDaysAgo(i);
      last7Days.push({
        date: d,
        bookings: confirmedBookings.filter(b => b.date === d).length,
        operations: confirmedOps.filter(o => o.date === d).length,
      });
    }

    // Peak hours
    const hourCounts: Record<string, number> = {};
    confirmedBookings.forEach(b => {
      const hour = b.time?.split(':')[0] || 'N/A';
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Service type distribution
    const cashCount = confirmedBookings.filter(b => b.bookingType !== 'contract').length;
    const contractCount = confirmedBookings.filter(b => b.bookingType === 'contract').length;

    // Doctor performance
    const doctorPerformance = doctors.map(doc => {
      const docBookings = confirmedBookings.filter(b => b.doctorName === doc.name);
      const docOps = confirmedOps.filter(o => o.doctorName === doc.name);
      const docTodayBookings = todayBookings.filter(b => b.doctorName === doc.name).length;
      return {
        name: doc.name,
        bookings: docBookings.length,
        operations: docOps.length,
        total: docBookings.length + docOps.length,
        todayLoad: docTodayBookings,
        maxPatients: doc.maxPatients,
        loadPercent: doc.maxPatients > 0 ? Math.round((docTodayBookings / doc.maxPatients) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);

    // Operational metrics
    const noShowRate = confirmedBookings.length > 0
      ? Math.round((cancelledBookings.length / (confirmedBookings.length + cancelledBookings.length)) * 100)
      : 0;

    return {
      confirmedBookings: confirmedBookings.length,
      cancelledBookings: cancelledBookings.length,
      pendingBookings: pendingBookings.length,
      todayBookings: todayBookings.length,
      tomorrowBookings: tomorrowBookings.length,
      totalPatients: allPatients.size,
      newPatientsThisMonth: newPatientsThisMonth.size,
      totalDoctors: doctors.length,
      activeDoctorsToday: activeDoctorsToday.size,
      confirmedOps: confirmedOps.length,
      cancelledOps: cancelledOps.length,
      pendingOps: pendingOps.length,
      last7Days,
      peakHours,
      cashCount,
      contractCount,
      doctorPerformance,
      noShowRate,
    };
  }, [bookings, operations, doctors, today, tomorrow, monthStart]);

  // =========== Alerts ===========
  const alerts = useMemo(() => {
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');

    // Bookings without doctor
    const noDoctorBookings = confirmedBookings.filter(b => !b.doctorName || b.doctorName.trim() === '');

    // Full doctors (load >= 90%)
    const fullDoctors = doctors.filter(doc => {
      const todayCount = confirmedBookings.filter(b => b.date === today && b.doctorName === doc.name).length;
      return doc.maxPatients > 0 && todayCount >= doc.maxPatients * 0.9;
    });

    // Failed payments
    const failedPayments = confirmedBookings.filter(b => b.paymentMethod && b.paymentMethod !== 'cash' && b.paymentStatus === 'pending');

    // Bookings within reminder window that haven't been contacted
    const now = new Date();
    const windowStart = new Date(now.getTime() + (1 * 60 * 60 * 1000)); // 1h from now
    const windowEnd = new Date(now.getTime() + (intervalHours * 60 * 60 * 1000)); // intervalHours from now

    const contactedBookingIds = new Set(
      contactLogs.filter(l => l.item_type === 'booking').map(l => l.item_id)
    );

    const inReminderWindow = confirmedBookings.filter(b => {
      const bookingDate = new Date(`${b.date}T00:00:00`);
      return bookingDate >= windowStart && bookingDate <= windowEnd;
    });

    const uncontactedInWindow = inReminderWindow.filter(b => !contactedBookingIds.has(String(b.id)));

    // Bookings with scheduled reminder but not executed
    const reminderNotExecuted = confirmedBookings.filter(b => 
      b.date === tomorrow && !b.reminderSent && !contactedBookingIds.has(String(b.id))
    );

    // Crowded time slots (more than 5 bookings in same hour)
    const slotCounts: Record<string, number> = {};
    confirmedBookings.filter(b => b.date === today || b.date === tomorrow).forEach(b => {
      const key = `${b.date}-${b.time}-${b.doctorName}`;
      slotCounts[key] = (slotCounts[key] || 0) + 1;
    });
    const crowdedSlots = Object.entries(slotCounts).filter(([, c]) => c > 3).length;

    return {
      noDoctorBookings: noDoctorBookings.length,
      fullDoctors: fullDoctors.length,
      failedPayments: failedPayments.length,
      uncontactedInWindow: uncontactedInWindow.length,
      reminderNotExecuted: reminderNotExecuted.length,
      crowdedSlots,
      tomorrowNoContact: uncontactedInWindow.filter(b => b.date === tomorrow).length,
    };
  }, [bookings, doctors, contactLogs, today, tomorrow, intervalHours]);

  // =========== Staff Performance ===========
  const staffPerformance = useMemo(() => {
    const staffMap: Record<string, {
      name: string;
      totalContacts: number;
      withinWindow: number;
      lateContacts: number;
      results: Record<string, number>;
      avgResponseTimeMin: number;
      responseTimes: number[];
    }> = {};

    const contactedBookingIds = new Set<string>();

    contactLogs.forEach(log => {
      const name = log.staff_name || 'غير معروف';
      if (!staffMap[name]) {
        staffMap[name] = { name, totalContacts: 0, withinWindow: 0, lateContacts: 0, results: {}, avgResponseTimeMin: 0, responseTimes: [] };
      }
      staffMap[name].totalContacts++;

      // Track contact type as result
      const contactType = log.contact_type || 'other';
      staffMap[name].results[contactType] = (staffMap[name].results[contactType] || 0) + 1;

      if (log.item_id) contactedBookingIds.add(log.item_id);
    });

    // Calculate unhandled reminders per staff (distribute evenly for now)
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
    const tomorrowBookingsCount = confirmedBookings.filter(b => b.date === tomorrow && !contactedBookingIds.has(String(b.id))).length;

    const staffList = Object.values(staffMap).sort((a, b) => b.totalContacts - a.totalContacts);

    // Confirmation rate after contact
    const totalContacts = contactLogs.length;
    const confirmedAfterContact = confirmedBookings.filter(b => contactedBookingIds.has(String(b.id))).length;
    const confirmationRate = totalContacts > 0 ? Math.round((confirmedAfterContact / totalContacts) * 100) : 0;

    return {
      staffList,
      totalContacts,
      confirmationRate,
      unhandledTomorrow: tomorrowBookingsCount,
    };
  }, [contactLogs, bookings, tomorrow]);

  // =========== Upcoming Reminders (within window) ===========
  const upcomingReminders = useMemo(() => {
    const contactedIds = new Set(contactLogs.filter(l => l.item_type === 'booking').map(l => l.item_id));
    const confirmed = bookings.filter(b => b.status === 'confirmed');
    
    return confirmed
      .filter(b => b.date === tomorrow && !contactedIds.has(String(b.id)))
      .map(b => ({
        ...b,
        hasContact: contactedIds.has(String(b.id)),
      }))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [bookings, contactLogs, tomorrow]);

  // =========== Print ===========
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const sanitizedAppName = DOMPurify.sanitize(settings.appName);
    const statsHtml = `
      <h3>مؤشرات عامة</h3>
      <table>
        <tr><td>الحجوزات المؤكدة</td><td>${stats.confirmedBookings}</td></tr>
        <tr><td>حجوزات اليوم</td><td>${stats.todayBookings}</td></tr>
        <tr><td>حجوزات الغد</td><td>${stats.tomorrowBookings}</td></tr>
        <tr><td>العمليات المؤكدة</td><td>${stats.confirmedOps}</td></tr>
        <tr><td>إجمالي المرضى</td><td>${stats.totalPatients}</td></tr>
        <tr><td>الأطباء النشطين اليوم</td><td>${stats.activeDoctorsToday}</td></tr>
      </table>
      <h3>تنبيهات</h3>
      <table>
        <tr><td>حجوزات بدون طبيب</td><td>${alerts.noDoctorBookings}</td></tr>
        <tr><td>أطباء ممتلئون</td><td>${alerts.fullDoctors}</td></tr>
        <tr><td>مدفوعات معلقة</td><td>${alerts.failedPayments}</td></tr>
        <tr><td>تذكيرات لم تُنفذ</td><td>${alerts.reminderNotExecuted}</td></tr>
      </table>
      <h3>أداء الموظفين</h3>
      <table>
        <thead><tr><th>الموظف</th><th>إجمالي الاتصالات</th></tr></thead>
        <tbody>${staffPerformance.staffList.map(s => `<tr><td>${DOMPurify.sanitize(s.name)}</td><td>${s.totalContacts}</td></tr>`).join('')}</tbody>
      </table>
      <h3>أداء الأطباء</h3>
      <table>
        <thead><tr><th>الطبيب</th><th>الحجوزات</th><th>العمليات</th><th>حمل اليوم %</th></tr></thead>
        <tbody>${stats.doctorPerformance.map(d => `<tr><td>${DOMPurify.sanitize(d.name)}</td><td>${d.bookings}</td><td>${d.operations}</td><td>${d.loadPercent}%</td></tr>`).join('')}</tbody>
      </table>
    `;

    const sanitizedContent = DOMPurify.sanitize(statsHtml, {
      ALLOWED_TAGS: ['div', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'h3', 'span', 'p'],
      ALLOWED_ATTR: ['class', 'style'],
    });

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>نظرة عامة - ${sanitizedAppName}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
            @page { margin: 10mm; size: A4; }
            body { font-family: 'Cairo', sans-serif; margin: 0; padding: 10mm; color: #172B3A; font-size: 10pt; }
            .header { text-align: center; border-bottom: 2px solid #087F8C; margin-bottom: 15px; padding-bottom: 8px; }
            .header h1 { margin: 0; font-size: 16pt; color: #0B1F35; }
            .header h2 { margin: 5px 0 0; font-size: 12pt; color: #718394; }
            h3 { color: #087F8C; font-size: 12pt; margin: 15px 0 5px; border-bottom: 1px solid #DFEAF0; padding-bottom: 3px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #DFEAF0; padding: 4px 8px; text-align: right; font-size: 9pt; }
            th { background-color: #F5FAFC; font-weight: bold; }
            .footer { margin-top: 20px; font-size: 8pt; text-align: center; color: #718394; border-top: 1px dashed #DFEAF0; padding-top: 10px; }
            @media print { img { display: none !important; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${sanitizedAppName}</h1>
            <h2>نظرة عامة - تقرير المراقبة</h2>
          </div>
          ${sanitizedContent}
          <div class="footer">تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')} | ${sanitizedAppName}</div>
          <script>window.onload = function() { window.print(); window.close(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // =========== Mini Bar Chart (CSS-only) ===========
  const MiniBar = ({ data, maxVal }: { data: { label: string; value: number }[]; maxVal: number }) => (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[9px] text-[#718394] font-bold fv-num">{d.value}</span>
          <div
            className="w-full bg-gradient-to-t from-[#087F8C] to-[#25B8C7] rounded-t-md min-h-[3px] transition-all"
            style={{ height: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%` }}
          />
          <span className="text-[8px] text-[#718394] font-bold truncate w-full text-center fv-num">{d.label.slice(5)}</span>
        </div>
      ))}
    </div>
  );

  const subTabs = [
    { id: 'stats', label: 'المؤشرات', icon: BarChart2 },
    { id: 'alerts', label: 'التنبيهات', icon: AlertTriangle },
    { id: 'reminders', label: 'مراقبة التذكير', icon: Bell },
    { id: 'staff', label: 'أداء الموظفين', icon: UserCheck },
    { id: 'tables', label: 'جداول المتابعة', icon: CalendarDays },
  ];

  const totalAlerts = alerts.noDoctorBookings + alerts.fullDoctors + alerts.failedPayments + alerts.uncontactedInWindow + alerts.reminderNotExecuted + alerts.crowdedSlots;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#172B3A] flex items-center gap-2.5">
            <Eye size={26} className="text-[#087F8C]" /> نظرة عامة
          </h2>
          <p className="text-xs text-[#718394] font-bold mt-1">تحديث تلقائي كل 60 ثانية • بيانات حقيقية مباشرة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLogs} className="bg-[#F5FAFC] text-[#087F8C] border border-[#DFEAF0] px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-[#087F8C]/10 transition-all cursor-pointer">
            <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} /> تحديث
          </button>
          <button onClick={handlePrint} className="bg-white text-[#172B3A] border border-[#DFEAF0] px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-[#F5FAFC] transition-all cursor-pointer">
            <Printer size={14} className="text-[#1769AA]" /> طباعة / PDF
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === tab.id
                ? 'fv-btn-primary text-white'
                : 'bg-white text-[#718394] border border-[#DFEAF0] hover:bg-[#F5FAFC] hover:text-[#087F8C]'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.id === 'alerts' && totalAlerts > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black fv-num">{totalAlerts}</span>
            )}
          </button>
        ))}
      </div>

      {/* =================== STATS TAB =================== */}
      {activeSubTab === 'stats' && (
        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="حجوزات مؤكدة" value={stats.confirmedBookings} icon={CheckCircle} color="bg-emerald-50 text-emerald-600 border border-emerald-200/70" />
            <StatCard label="حجوزات ملغية" value={stats.cancelledBookings} icon={XCircle} color="bg-red-50 text-red-600 border border-red-200/70" />
            <StatCard label="حجوزات اليوم" value={stats.todayBookings} icon={Calendar} color="bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20" />
            <StatCard label="حجوزات الغد" value={stats.tomorrowBookings} icon={CalendarDays} color="bg-[#1769AA]/10 text-[#1769AA] border border-[#1769AA]/20" />
            <StatCard label="في انتظار الدفع" value={stats.pendingBookings} icon={Banknote} color="bg-amber-50 text-amber-600 border border-amber-200/70" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="إجمالي المرضى" value={stats.totalPatients} icon={Users} color="bg-[#1769AA]/10 text-[#1769AA] border border-[#1769AA]/20" />
            <StatCard label="مرضى جدد (الشهر)" value={stats.newPatientsThisMonth} icon={TrendingUp} color="bg-emerald-50 text-emerald-600 border border-emerald-200/70" />
            <StatCard label="الأطباء" value={stats.totalDoctors} icon={Activity} color="bg-[#25B8C7]/15 text-[#087F8C] border border-[#25B8C7]/30" sub={`${stats.activeDoctorsToday} نشط اليوم`} />
            <StatCard label="عمليات مؤكدة" value={stats.confirmedOps} icon={Scissors} color="bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20" />
            <StatCard label="عمليات معلقة" value={stats.pendingOps} icon={Clock} color="bg-amber-50 text-amber-600 border border-amber-200/70" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Last 7 Days */}
            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2"><BarChart2 size={16} className="text-[#087F8C]" /> آخر 7 أيام</h3>
              <MiniBar
                data={stats.last7Days.map(d => ({ label: d.date, value: d.bookings + d.operations }))}
                maxVal={Math.max(...stats.last7Days.map(d => d.bookings + d.operations), 1)}
              />
              <div className="flex gap-4 mt-3 text-[11px] font-bold text-[#718394] fv-num">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#087F8C] inline-block" /> حجوزات: {stats.last7Days.reduce((a, d) => a + d.bookings, 0)}</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#25B8C7] inline-block" /> عمليات: {stats.last7Days.reduce((a, d) => a + d.operations, 0)}</span>
              </div>
            </div>

            {/* Peak Hours */}
            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2"><Clock size={16} className="text-[#087F8C]" /> أكثر ساعات الحجز</h3>
              <div className="space-y-2.5">
                {stats.peakHours.length === 0 && <p className="text-[#718394] text-xs font-bold">لا توجد بيانات</p>}
                {stats.peakHours.map(([hour, count]) => (
                  <div key={hour} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#718394] w-16 fv-num">{hour}:00</span>
                    <div className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] rounded-full h-3.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#087F8C] to-[#25B8C7] h-full rounded-full transition-all"
                        style={{ width: `${(count / (stats.peakHours[0]?.[1] || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-black text-[#172B3A] w-8 fv-num">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* More stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Service Distribution */}
            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2"><PieChart size={16} className="text-[#087F8C]" /> توزيع نوع الخدمة</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                    <span className="text-xs font-bold text-[#172B3A] fv-num">نقدي: {stats.cashCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-[#087F8C] rounded-full" />
                    <span className="text-xs font-bold text-[#172B3A] fv-num">تعاقد: {stats.contractCount}</span>
                  </div>
                </div>
                <div className="text-3xl font-black text-[#087F8C]/25 fv-num">
                  {stats.cashCount + stats.contractCount > 0
                    ? `${Math.round((stats.cashCount / (stats.cashCount + stats.contractCount)) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* Operational Metrics */}
            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2"><Activity size={16} className="text-[#087F8C]" /> مؤشرات تشغيلية</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-[#718394]">نسبة الإلغاء</span>
                  <span className="text-red-600 fv-num">{stats.noShowRate}%</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-[#718394]">نسبة التأكيد</span>
                  <span className="text-emerald-600 fv-num">{100 - stats.noShowRate}%</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-[#718394]">نسبة التأكيد بعد الاتصال</span>
                  <span className="text-[#087F8C] fv-num">{staffPerformance.confirmationRate}%</span>
                </div>
              </div>
            </div>

            {/* Doctor Performance Summary */}
            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2"><Star size={16} className="text-[#087F8C]" /> أداء الأطباء</h3>
              <div className="space-y-2.5">
                {stats.doctorPerformance.slice(0, 5).map((doc, i) => (
                  <div key={doc.name} className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-[#718394] w-4 fv-num">{i + 1}</span>
                    <span className="text-xs font-bold text-[#172B3A] flex-1 truncate">{doc.name}</span>
                    <span className="text-[11px] font-black text-[#087F8C] fv-num">{doc.total}</span>
                    <div className="w-16 bg-[#F5FAFC] border border-[#DFEAF0] rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full ${doc.loadPercent > 90 ? 'bg-red-500' : doc.loadPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(doc.loadPercent, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== ALERTS TAB =================== */}
      {activeSubTab === 'alerts' && (
        <div className={cardClass}>
          <h3 className="text-lg font-black text-[#172B3A] mb-6 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" /> لوحة التنبيهات
            {totalAlerts > 0 && <span className="bg-red-50 text-red-600 border border-red-200 text-xs px-2.5 py-0.5 rounded-full font-black fv-num">{totalAlerts} تنبيه</span>}
          </h3>
          {totalAlerts === 0 ? (
            <div className="text-center py-10 text-[#718394]">
              <CheckCircle size={40} className="mx-auto mb-3 text-emerald-500" />
              <p className="font-bold text-[#172B3A]">لا توجد تنبيهات حالياً - كل شيء تحت السيطرة</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AlertItem icon={AlertCircle} color="bg-red-50 border-red-200 text-red-700" text="حجوزات بدون طبيب" count={alerts.noDoctorBookings} />
              <AlertItem icon={Bell} color="bg-orange-50 border-orange-200 text-orange-700" text="تذكيرات لم تُنفذ رغم الجدولة" count={alerts.reminderNotExecuted} />
              <AlertItem icon={Phone} color="bg-amber-50 border-amber-200 text-amber-700" text="حجوزات داخل نافذة التذكير بدون اتصال" count={alerts.uncontactedInWindow} />
              <AlertItem icon={Flame} color="bg-red-50 border-red-200 text-red-600" text="أطباء ممتلئون (≥90%)" count={alerts.fullDoctors} />
              <AlertItem icon={Banknote} color="bg-yellow-50 border-yellow-200 text-yellow-700" text="مدفوعات معلقة" count={alerts.failedPayments} />
              <AlertItem icon={Users} color="bg-[#1769AA]/10 border-[#1769AA]/25 text-[#1769AA]" text="مواعيد مزدحمة" count={alerts.crowdedSlots} />
            </div>
          )}
        </div>
      )}

      {/* =================== REMINDERS TAB =================== */}
      {activeSubTab === 'reminders' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <h3 className="text-lg font-black text-[#172B3A] mb-3 flex items-center gap-2">
              <Bell size={20} className="text-[#087F8C]" /> مراقبة تنفيذ التذكيرات
            </h3>
            <p className="text-xs text-[#172B3A] font-bold mb-6 bg-[#F5FAFC] p-3.5 rounded-xl border border-[#DFEAF0] flex items-center gap-2 fv-num">
              <Bell size={15} className="text-[#087F8C] shrink-0" />
              <span>يعرض حجوزات الغد التي لم يُسجَّل لها اتصال بعد. نافذة التذكير الحالية: {intervalHours} ساعة.</span>
            </p>

            {upcomingReminders.length === 0 ? (
              <div className="text-center py-10 text-[#718394]">
                <CheckCircle size={40} className="mx-auto mb-3 text-emerald-500" />
                <p className="font-bold text-[#172B3A]">تم الاتصال بجميع مرضى الغد</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                      <th className="p-3 text-right">المريض</th>
                      <th className="p-3 text-right">الهاتف</th>
                      <th className="p-3 text-right">الطبيب</th>
                      <th className="p-3 text-right">الموعد</th>
                      <th className="p-3 text-right">الخدمة</th>
                      <th className="p-3 text-right">حالة التذكير</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFEAF0]/70">
                    {upcomingReminders.map(b => (
                      <tr key={b.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="p-3 font-bold text-[#172B3A]">{b.patientName}</td>
                        <td className="p-3 text-xs text-[#718394] fv-mono" dir="ltr">{b.phone}</td>
                        <td className="p-3 text-xs text-[#172B3A]">{b.doctorName}</td>
                        <td className="p-3 text-xs font-bold text-[#172B3A] fv-num">{b.date} - {b.time}</td>
                        <td className="p-3 text-xs text-[#718394]">{b.service}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-red-50 text-red-700 border border-red-200/80">
                            <AlertTriangle size={11} /> لم يتم الاتصال
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== STAFF TAB =================== */}
      {activeSubTab === 'staff' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="إجمالي الاتصالات" value={staffPerformance.totalContacts} icon={Phone} color="bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20" />
            <StatCard label="نسبة التأكيد بعد الاتصال" value={`${staffPerformance.confirmationRate}%`} icon={CheckCircle} color="bg-emerald-50 text-emerald-600 border border-emerald-200/70" />
            <StatCard label="حجوزات الغد بدون اتصال" value={staffPerformance.unhandledTomorrow} icon={AlertCircle} color="bg-red-50 text-red-600 border border-red-200/70" />
            <StatCard label="عدد الموظفين النشطين" value={staffPerformance.staffList.length} icon={UserCheck} color="bg-[#1769AA]/10 text-[#1769AA] border border-[#1769AA]/20" />
          </div>

          {/* Staff Performance Table */}
          <div className={cardClass}>
            <h3 className="text-lg font-black text-[#172B3A] mb-6 flex items-center gap-2">
              <UserCheck size={20} className="text-[#087F8C]" /> مؤشرات أداء الموظفين
            </h3>
            {staffPerformance.staffList.length === 0 ? (
              <p className="text-center text-[#718394] py-10 font-bold">لا توجد بيانات اتصال مسجلة بعد</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                      <th className="p-3 text-right">#</th>
                      <th className="p-3 text-right">الموظف</th>
                      <th className="p-3 text-center">إجمالي الاتصالات</th>
                      <th className="p-3 text-center">واتساب</th>
                      <th className="p-3 text-center">SMS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFEAF0]/70">
                    {staffPerformance.staffList.map((staff, i) => (
                      <tr key={staff.name} className="hover:bg-[#F5FAFC] transition-colors">
                        <td className="p-3 text-xs font-black text-[#718394] fv-num">{i + 1}</td>
                        <td className="p-3 font-bold text-[#172B3A]">{staff.name}</td>
                        <td className="p-3 text-center">
                          <span className="bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 px-2.5 py-1 rounded-lg text-xs font-black fv-num">{staff.totalContacts}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-xs font-bold text-emerald-600 fv-num">{staff.results['whatsapp'] || 0}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-xs font-bold text-amber-600 fv-num">{staff.results['sms'] || 0}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== TABLES TAB =================== */}
      {activeSubTab === 'tables' && (
        <div className="space-y-6">
          {/* Tomorrow's bookings without contact */}
          <div className={cardClass}>
            <h3 className="text-lg font-black text-[#172B3A] mb-4 flex items-center gap-2">
              <CalendarDays size={20} className="text-red-500" /> حجوزات الغد بدون نتيجة اتصال <span className="fv-num text-[#718394]">({upcomingReminders.length})</span>
            </h3>
            {upcomingReminders.length === 0 ? (
              <p className="text-center text-emerald-600 py-6 font-bold flex items-center justify-center gap-2"><CheckCircle size={18} /> تم تغطية جميع حجوزات الغد</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                      <th className="p-3 text-right">المريض</th>
                      <th className="p-3 text-right">الهاتف</th>
                      <th className="p-3 text-right">الطبيب</th>
                      <th className="p-3 text-right">الخدمة</th>
                      <th className="p-3 text-right">الوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFEAF0]/70">
                    {upcomingReminders.map(b => (
                      <tr key={b.id} className="hover:bg-[#F5FAFC]">
                        <td className="p-3 font-bold text-[#172B3A]">{b.patientName}</td>
                        <td className="p-3 text-xs text-[#718394] fv-mono" dir="ltr">{b.phone}</td>
                        <td className="p-3 text-xs text-[#172B3A]">{b.doctorName}</td>
                        <td className="p-3 text-xs text-[#718394]">{b.service}</td>
                        <td className="p-3 text-xs font-bold text-[#172B3A] fv-num">{b.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Staff Comparison */}
          <div className={cardClass}>
            <h3 className="text-lg font-black text-[#172B3A] mb-4 flex items-center gap-2">
              <ArrowUpDown size={20} className="text-[#087F8C]" /> مقارنة أداء الموظفين
            </h3>
            {staffPerformance.staffList.length === 0 ? (
              <p className="text-center text-[#718394] py-6 font-bold">لا توجد بيانات</p>
            ) : (
              <div className="space-y-3">
                {staffPerformance.staffList.map((staff, i) => {
                  const maxContacts = staffPerformance.staffList[0]?.totalContacts || 1;
                  return (
                    <div key={staff.name} className="flex items-center gap-3">
                      <span className="text-xs font-black text-[#718394] w-6 fv-num">{i + 1}</span>
                      <span className="text-xs font-bold text-[#172B3A] w-24 truncate">{staff.name}</span>
                      <div className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] rounded-full h-5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-[#087F8C] to-[#25B8C7] h-full rounded-full flex items-center justify-end px-2 transition-all"
                          style={{ width: `${(staff.totalContacts / maxContacts) * 100}%` }}
                        >
                          <span className="text-[10px] text-white font-black fv-num">{staff.totalContacts}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Doctor Daily Load */}
          <div className={cardClass}>
            <h3 className="text-lg font-black text-[#172B3A] mb-4 flex items-center gap-2">
              <Activity size={20} className="text-[#087F8C]" /> الحمل اليومي للأطباء
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                    <th className="p-3 text-right">الطبيب</th>
                    <th className="p-3 text-center">حجوزات اليوم</th>
                    <th className="p-3 text-center">الحد الأقصى</th>
                    <th className="p-3 text-right">نسبة التحميل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]/70">
                  {stats.doctorPerformance.map(doc => (
                    <tr key={doc.name} className="hover:bg-[#F5FAFC]">
                      <td className="p-3 font-bold text-[#172B3A]">{doc.name}</td>
                      <td className="p-3 text-center font-bold text-[#172B3A] fv-num">{doc.todayLoad}</td>
                      <td className="p-3 text-center text-[#718394] fv-num">{doc.maxPatients}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${doc.loadPercent > 90 ? 'bg-red-500' : doc.loadPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(doc.loadPercent, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-black fv-num ${doc.loadPercent > 90 ? 'text-red-600' : doc.loadPercent > 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {doc.loadPercent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewDashboard;
