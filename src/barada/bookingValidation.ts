import { cairoTodayStr, isDayFull, weekdayOf } from './dateUtils';

export type BookingSourceType = 'website' | 'staff' | 'admin';

export interface ValidationDoctor {
  id: number;
  name: string;
  fee: number;
  maxPatients: number;
  patientsPerHour: number;
  availableDates: string[];
  followUpExamCount?: number;
  followUpSurgeryCount?: number;
}

export interface ValidationBooking {
  id?: number;
  patientName: string;
  phone: string;
  doctorId: number;
  service: string;
  date: string;
  time: string;
  status: string;
}

export interface ValidationService {
  title: string;
  price: number;
}

export interface BookingRuleValidationInput {
  patientName: string;
  phone: string;
  phone2?: string;
  age: number | string;
  governorate: string;
  center: string;
  doctor: ValidationDoctor | null | undefined;
  service: string;
  date: string;
  time: string;
  bookingType: 'cash' | 'contract';
  contractingCompanyId?: number;
  bookings: ValidationBooking[];
  workingHours: { weekdays: string; friday: string };
  excludeBookingId?: number;
  todayStr?: string;
  serverDayFull?: boolean;
  serverHourFull?: boolean;
}

export interface BookingRuleValidationResult {
  ok: boolean;
  message?: string;
  code?: string;
  overridable: boolean;
}

const EGYPTIAN_PHONE_REGEX = /^01[0-9]{9}$/;
const NAME_CHAR_REGEX = /^[\p{L}\s\-']+$/u;

export const normalizeDigits = (val: string): string =>
  (val || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();

export const normalizePhone = (val: string): string =>
  normalizeDigits(val).replace(/\D/g, '');

export const isValidEgyptianPhone = (val: string): boolean =>
  EGYPTIAN_PHONE_REGEX.test(normalizePhone(val));

export const generateClinicTimeSlots = (): string[] => {
  const slots: string[] = [];
  for (let h = 9; h < 12; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ص`);
    }
  }
  for (let m = 0; m < 60; m += 15) {
    slots.push(`12:${String(m).padStart(2, '0')} م`);
  }
  for (let h = 1; h < 9; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} م`);
    }
  }
  return slots;
};

export const timeSlotTo24hMinutes = (slot: string): number => {
  const parts = slot.trim().split(' ');
  const timePart = parts[0] || '';
  const period = parts[1] || '';
  const [hourStr, minuteStr] = timePart.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return -1;
  if (period === 'م' && hour !== 12) hour += 12;
  if (period === 'ص' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

export const parseWorkingHoursText = (
  text: string,
): { start: number; end: number } | null => {
  try {
    const parts = text.split('-').map((s) => s.trim());
    if (parts.length !== 2) return null;
    const parseTime = (t: string): number => {
      const match = t.match(/(\d{1,2}):(\d{2})\s*(صباحاً|مساءً|ص|م)/);
      if (!match) return -1;
      let hour = parseInt(match[1], 10);
      const minute = parseInt(match[2], 10);
      const period = match[3];
      if (period === 'مساءً' || period === 'م') {
        if (hour !== 12) hour += 12;
      }
      if (period === 'صباحاً' || period === 'ص') {
        if (hour === 12) hour = 0;
      }
      return hour * 60 + minute;
    };
    const start = parseTime(parts[0]);
    const end = parseTime(parts[1]);
    if (start < 0 || end < 0) return null;
    return { start, end };
  } catch {
    return null;
  }
};

export const isFollowUpService = (serviceName: string): { isFollowUp: boolean; kind: 'exam' | 'surgery' | null } => {
  if (serviceName.includes('متابعة كشف') || serviceName.includes('متابعة الكشف')) {
    return { isFollowUp: true, kind: 'exam' };
  }
  if (serviceName.includes('متابعة عملية') || serviceName.includes('متابعة العملية')) {
    return { isFollowUp: true, kind: 'surgery' };
  }
  return { isFollowUp: false, kind: null };
};

export const computeBookingExpectedFee = (
  serviceTitle: string,
  doctor: { fee?: number } | null | undefined,
  services: ValidationService[],
): number => {
  const { isFollowUp } = isFollowUpService(serviceTitle || '');
  const svcPrice = services.find((s) => s.title === serviceTitle)?.price ?? 0;
  const docFee = isFollowUp ? 0 : (doctor?.fee ?? 0);
  return Math.max(Number(svcPrice || 0) + Number(docFee || 0), 0);
};

export const countDoctorHourBookings = (
  bookings: ValidationBooking[],
  doctorId: number,
  date: string,
  slot: string,
  excludeBookingId?: number,
): number => {
  const [hourPart, periodPart] = slot.trim().split(' ');
  return bookings.filter((b) => {
    if (b.status !== 'confirmed') return false;
    if (excludeBookingId !== undefined && b.id === excludeBookingId) return false;
    if (b.doctorId !== doctorId || b.date !== date) return false;
    const parts = (b.time || '').trim().split(' ');
    const bh = (parts[0] || '').split(':')[0];
    const bp = parts[1] || '';
    return bh === (hourPart || '').split(':')[0] && bp === (periodPart || '');
  }).length;
};

export function validateBookingRules(input: BookingRuleValidationInput): BookingRuleValidationResult {
  const todayStr = input.todayStr || cairoTodayStr();
  const trimmedName = (input.patientName || '').trim();
  const nameParts = trimmedName.split(/\s+/).filter((p) => p.length > 0);
  const phone = normalizePhone(input.phone || '');
  const phone2 = normalizePhone(input.phone2 || '');
  const ageNum = typeof input.age === 'number' ? input.age : parseInt(String(input.age || ''), 10);

  // Hard format / required field checks (never overridable)
  if (!input.doctor) {
    return { ok: false, code: 'DOCTOR_REQUIRED', message: 'عذراً، يجب اختيار الطبيب أولاً.', overridable: false };
  }
  if (nameParts.length < 4) {
    return {
      ok: false,
      code: 'QUAD_NAME_REQUIRED',
      message: 'عذراً، يجب إدخال الاسم الرباعي كاملاً (4 كلمات على الأقل).',
      overridable: false,
    };
  }
  if (trimmedName.length < 2 || trimmedName.length > 100 || !NAME_CHAR_REGEX.test(trimmedName)) {
    return {
      ok: false,
      code: 'INVALID_NAME',
      message: 'عذراً، الاسم يجب أن يحتوي على حروف فقط بين 2 و 100 حرف.',
      overridable: false,
    };
  }
  if (!isValidEgyptianPhone(phone)) {
    return {
      ok: false,
      code: 'INVALID_PHONE',
      message: 'عذراً، يجب أن يكون رقم الهاتف الأساسي 11 رقماً ويبدأ بـ 01.',
      overridable: false,
    };
  }
  if (input.phone2 && input.phone2.trim() !== '' && !isValidEgyptianPhone(phone2)) {
    return {
      ok: false,
      code: 'INVALID_PHONE2',
      message: 'عذراً، يجب أن يكون رقم الهاتف الثاني 11 رقماً ويبدأ بـ 01.',
      overridable: false,
    };
  }
  if (!ageNum || Number.isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
    return { ok: false, code: 'INVALID_AGE', message: 'عذراً، يجب إدخال السن بين 1 و 120 سنة.', overridable: false };
  }
  if (!input.governorate || !input.center.trim()) {
    return { ok: false, code: 'LOCATION_REQUIRED', message: 'عذراً، يجب اختيار المحافظة والمركز / المدينة.', overridable: false };
  }
  if (!input.service || !input.date || !input.time) {
    return { ok: false, code: 'SLOT_REQUIRED', message: 'يرجى تحديد نوع الإجراء وتاريخ وموعد الحجز.', overridable: false };
  }
  if (input.bookingType === 'contract' && !input.contractingCompanyId) {
    return { ok: false, code: 'CONTRACT_REQUIRED', message: 'يرجى اختيار جهة التعاقد لحجز التعاقد.', overridable: false };
  }
  if (input.date < todayStr) {
    return { ok: false, code: 'PAST_DATE', message: 'عذراً، لا يمكن الحجز في تاريخ ماضٍ.', overridable: false };
  }

  // Overridable clinic scheduling / capacity / policy rules (staff with permission + reason can override)
  if (input.date === todayStr) {
    return {
      ok: false,
      code: 'SAME_DAY',
      message: 'القواعد التنظيمية تمنع الحجز في نفس اليوم عبر الموقع، يمكن تسجيله فقط عبر صلاحية الاستثناء.',
      overridable: true,
    };
  }
  if (!input.doctor.availableDates || !input.doctor.availableDates.includes(input.date)) {
    return {
      ok: false,
      code: 'DOCTOR_UNAVAILABLE_DATE',
      message: 'التاريخ المختار ليس ضمن أيام عمل الطبيب المحددة في النظام.',
      overridable: true,
    };
  }
  if (
    input.serverDayFull ||
    isDayFull(input.bookings, input.doctor.id, input.date, input.doctor.maxPatients, input.excludeBookingId)
  ) {
    return {
      ok: false,
      code: 'DOCTOR_DAY_FULL',
      message: 'اكتمل الحد الأقصى لعدد المرضى لهذا الطبيب في هذا اليوم.',
      overridable: true,
    };
  }

  const friday = weekdayOf(input.date) === 5;
  const hoursText = friday ? input.workingHours.friday : input.workingHours.weekdays;
  const parsed = parseWorkingHoursText(hoursText);
  if (parsed) {
    const selectedMinutes = timeSlotTo24hMinutes(input.time);
    if (selectedMinutes < parsed.start || selectedMinutes >= parsed.end) {
      return {
        ok: false,
        code: 'OUTSIDE_WORKING_HOURS',
        message: `الوقت المختار خارج ساعات العمل الرسمية (${hoursText}).`,
        overridable: true,
      };
    }
  }

  if (
    input.serverHourFull ||
    (input.doctor.patientsPerHour > 0 &&
      countDoctorHourBookings(input.bookings, input.doctor.id, input.date, input.time, input.excludeBookingId) >=
        input.doctor.patientsPerHour)
  ) {
    return {
      ok: false,
      code: 'DOCTOR_HOUR_FULL',
      message: 'اكتملت سعة الطبيب في هذه الساعة.',
      overridable: true,
    };
  }

  const normalizedName = trimmedName.toLowerCase().replace(/\s+/g, ' ');
  const sameDaySameDoc = input.bookings.some(
    (b) =>
      b.status === 'confirmed' &&
      (input.excludeBookingId === undefined || b.id !== input.excludeBookingId) &&
      b.doctorId === input.doctor!.id &&
      b.date === input.date &&
      (b.patientName.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName ||
        normalizePhone(b.phone) === phone),
  );
  if (sameDaySameDoc) {
    return {
      ok: false,
      code: 'DUPLICATE_SAME_DAY',
      message: 'يوجد حجز مؤكد مسبقاً لنفس المريض لدى نفس الطبيب في نفس اليوم.',
      overridable: true,
    };
  }

  const followUp = isFollowUpService(input.service);
  if (followUp.isFollowUp) {
    const prevBookings = input.bookings.filter(
      (b) =>
        b.status === 'confirmed' &&
        (input.excludeBookingId === undefined || b.id !== input.excludeBookingId) &&
        b.doctorId === input.doctor!.id &&
        (b.patientName.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName ||
          normalizePhone(b.phone) === phone),
    );
    if (followUp.kind === 'exam') {
      const hasExam = prevBookings.some(
        (b) => !b.service.includes('متابعة') && !b.service.includes('عملية'),
      );
      if (!hasExam) {
        return {
          ok: false,
          code: 'NO_PRIOR_EXAM',
          message: 'لا يمكن حجز متابعة كشف لعدم وجود كشف سابق لدى هذا الطبيب.',
          overridable: true,
        };
      }
      const examCount = prevBookings.filter((b) => isFollowUpService(b.service).kind === 'exam').length;
      const maxExam = input.doctor.followUpExamCount ?? 0;
      if (examCount >= maxExam) {
        return {
          ok: false,
          code: 'MAX_EXAM_FOLLOWUPS',
          message: `تم الوصول للحد الأقصى لمتابعات الكشف (${maxExam}) لدى هذا الطبيب.`,
          overridable: true,
        };
      }
    }
    if (followUp.kind === 'surgery') {
      const hasSurgery = prevBookings.some(
        (b) => b.service.includes('عملية') && !b.service.includes('متابعة'),
      );
      if (!hasSurgery) {
        return {
          ok: false,
          code: 'NO_PRIOR_SURGERY',
          message: 'لا يمكن حجز متابعة عملية لعدم وجود عملية سابقة لدى هذا الطبيب.',
          overridable: true,
        };
      }
      const surgeryCount = prevBookings.filter((b) => isFollowUpService(b.service).kind === 'surgery').length;
      const maxSurgery = input.doctor.followUpSurgeryCount ?? 0;
      if (surgeryCount >= maxSurgery) {
        return {
          ok: false,
          code: 'MAX_SURGERY_FOLLOWUPS',
          message: `تم الوصول للحد الأقصى لمتابعات العمليات (${maxSurgery}) لدى هذا الطبيب.`,
          overridable: true,
        };
      }
    }
  }

  return { ok: true, overridable: false };
}
