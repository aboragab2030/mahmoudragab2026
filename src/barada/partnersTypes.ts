export type RelationshipStatus = 'نشط' | 'قيد التفاوض' | 'معلق' | 'منتهي';

export type ContractStatus =
  | 'مسودة'
  | 'تحت المراجعة'
  | 'بانتظار التوقيع'
  | 'نشط'
  | 'قريب الانتهاء'
  | 'منتهي'
  | 'مجدد'
  | 'ملغي';

export type PartnerActivityType = 'visit' | 'meeting' | 'call' | 'followup' | 'message';
export type ActivityFollowupStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

export type FollowupPriority = 'low' | 'medium' | 'high' | 'urgent';
export type FollowupTaskStatus =
  | 'جديدة'
  | 'قيد التنفيذ'
  | 'بانتظار الرد'
  | 'مكتملة'
  | 'متأخرة'
  | 'ملغاة';

export type ContactImportance = 'high' | 'normal' | 'low';
export type ContactCommunicationStatus = 'active' | 'needs_followup' | 'inactive';

export interface PartnerOrganization {
  id: number;
  name: string;
  documents: string[];
  managerName?: string;
  managerPhone?: string;
  orgType: string;
  sector: string;
  governorate: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  contactTitle: string;
  contactEmail: string;
  cooperationStartDate: string;
  relationshipStatus: RelationshipStatus;
  assignedStaffId: string;
  assignedStaffName: string;
  adminNotes: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PartnerContact {
  id: string;
  companyId: number;
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  department: string;
  importanceLevel: ContactImportance;
  communicationStatus: ContactCommunicationStatus;
  isPrimary: boolean;
  lastContactAt: string | null;
  notes: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerAttachment {
  name: string;
  path: string;
  mimeType?: string;
  size?: number;
}

export interface PartnerActivity {
  id: string;
  companyId: number;
  contactId: string | null;
  contactName: string;
  activityType: PartnerActivityType;
  activityDate: string;
  activityTime: string;
  staffUserId: string;
  staffName: string;
  goal: string;
  summary: string;
  outcomes: string;
  agreements: string;
  nextSteps: string;
  nextFollowupDate: string;
  followupStatus: ActivityFollowupStatus;
  attachments: PartnerAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface PartnerContract {
  id: string;
  companyId: number;
  contractNumber: string;
  contractType: string;
  signedDate: string;
  startDate: string;
  endDate: string;
  durationMonths: number | null;
  status: ContractStatus;
  terms: string;
  discountTerms: string;
  responsibleStaffId: string;
  responsibleStaffName: string;
  lastRenewalDate: string;
  nextRenewalDate: string;
  notes: string;
  attachmentPath: string;
  attachmentName: string;
  parentContractId: string | null;
  versionNumber: number;
  isCurrentVersion: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerContractRenewal {
  id: string;
  companyId: number;
  previousContractId: string;
  renewedContractId: string;
  renewalDate: string;
  newStartDate: string;
  newEndDate: string;
  nextRenewalDate: string;
  renewalNotes: string;
  renewedBy: string;
  renewedByName: string;
  createdAt: string;
}

export interface PartnerFollowup {
  id: string;
  companyId: number;
  contactId: string | null;
  contractId: string | null;
  activityId: string | null;
  title: string;
  assigneeUserId: string;
  assigneeName: string;
  createdDate: string;
  dueDate: string;
  followupType: string;
  priority: FollowupPriority;
  description: string;
  status: FollowupTaskStatus;
  outcome: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerAlertSettings {
  id: number;
  alertDays: number[];
  notifyOverdue: boolean;
  autoMarkExpiringDays: number;
  updatedAt?: string;
}

export interface PartnerRenewalAlertLog {
  id: string;
  contractId: string;
  companyId: number;
  thresholdDays: number;
  alertDate: string;
  notificationId: string | null;
  title: string;
  message: string;
  createdAt: string;
}

export interface PartnerAuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  actionType: string;
  entityType: string;
  entityId: string;
  companyId: number | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const ORG_TYPE_OPTIONS = [
  'شركة تأمين',
  'شركة إدارة رعاية صحية (TPA)',
  'نقابة',
  'شركة خاصة',
  'جهة حكومية',
  'مستشفى / مركز طبي',
  'جمعية / مؤسسة خيرية',
  'بنك / مؤسسة مالية',
  'أخرى',
] as const;

export const RELATIONSHIP_STATUS_OPTIONS: RelationshipStatus[] = [
  'نشط',
  'قيد التفاوض',
  'معلق',
  'منتهي',
];

export const CONTRACT_TYPE_OPTIONS = [
  'سنوي',
  'نصف سنوي',
  'ربع سنوي',
  'تأمين طبي شامل',
  'خصم تعاقدي',
  'مؤسسي / نقابي',
  'اتفاقية تعاون',
  'مفتوح المدة',
] as const;

export const CONTRACT_STATUS_OPTIONS: ContractStatus[] = [
  'مسودة',
  'تحت المراجعة',
  'بانتظار التوقيع',
  'نشط',
  'قريب الانتهاء',
  'منتهي',
  'مجدد',
  'ملغي',
];

export const ACTIVITY_TYPE_LABELS: Record<PartnerActivityType, string> = {
  visit: 'زيارة ميدانية',
  meeting: 'اجتماع',
  call: 'مكالمة هاتفية',
  followup: 'متابعة',
  message: 'رسالة / بريد',
};

export const FOLLOWUP_PRIORITY_LABELS: Record<FollowupPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

export const FOLLOWUP_STATUS_OPTIONS: FollowupTaskStatus[] = [
  'جديدة',
  'قيد التنفيذ',
  'بانتظار الرد',
  'مكتملة',
  'متأخرة',
  'ملغاة',
];

export const DEFAULT_ALERT_SETTINGS: PartnerAlertSettings = {
  id: 1,
  alertDays: [90, 60, 30, 15, 7, 0],
  notifyOverdue: true,
  autoMarkExpiringDays: 30,
};
