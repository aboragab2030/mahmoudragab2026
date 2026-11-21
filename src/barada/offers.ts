import { supabase } from '@/integrations/supabase/client';
import { localIdFromUuid } from './publicData';

export const OFFER_IMAGES_BUCKET = 'offer-images';
export const MAX_OFFER_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_OFFER_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const ALLOWED_OFFER_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type OfferPermissionId =
  | 'view_offers'
  | 'create_offers'
  | 'edit_offers'
  | 'delete_offers'
  | 'manage_offer_visibility'
  | 'upload_offer_images';

export interface OfferRecord {
  id: string;
  title: string;
  doctorId: string;
  doctorLocalId: number;
  doctorName?: string;
  doctorSpecialty?: string;
  description: string;
  offerPrice: number;
  originalPrice: number | null;
  discountPercentage: number | null;
  imageUrl: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  showOnHomepage: boolean;
  displayOrder: number;
  buttonText: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface OfferFormInput {
  title: string;
  doctorId: string;
  description: string;
  offerPrice: string | number;
  originalPrice?: string | number | null;
  discountPercentage?: string | number | null;
  imageUrl?: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  showOnHomepage: boolean;
  displayOrder?: string | number;
  buttonText?: string;
}

export interface DoctorLookupItem {
  id: number;
  dbId?: string;
  name: string;
  specialty?: string;
}

type PermissionCheckUser = { role: 'admin' | 'staff'; permissions?: string[] } | null | undefined;

export function hasOfferPermission(user: PermissionCheckUser, permission: OfferPermissionId): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function calculateDiscountPercentage(offerPriceInput: unknown, originalPriceInput: unknown): number | null {
  const offerPrice = Number(offerPriceInput);
  const originalPrice = Number(originalPriceInput);
  if (!Number.isFinite(offerPrice) || !Number.isFinite(originalPrice) || offerPrice <= 0 || originalPrice <= offerPrice) {
    return null;
  }
  const pct = Math.round(((originalPrice - offerPrice) / originalPrice) * 100);
  return pct > 0 && pct <= 100 ? pct : null;
}

export function validateOfferInput(input: OfferFormInput): { valid: true } | { valid: false; error: string } {
  const title = (input.title || '').trim();
  if (!title) return { valid: false, error: 'عنوان العرض مطلوب.' };
  if (title.length > 200) return { valid: false, error: 'عنوان العرض طويل جداً (الحد الأقصى 200 حرف).' };

  const doctorId = (input.doctorId || '').trim();
  if (!doctorId) return { valid: false, error: 'يرجى اختيار الطبيب المرتبط بالعرض.' };

  const offerPrice = Number(input.offerPrice);
  if (!Number.isFinite(offerPrice) || offerPrice <= 0) {
    return { valid: false, error: 'سعر العرض يجب أن يكون رقماً أكبر من صفر.' };
  }

  const rawOriginal = input.originalPrice === '' || input.originalPrice === null || input.originalPrice === undefined
    ? null
    : Number(input.originalPrice);
  if (rawOriginal !== null) {
    if (!Number.isFinite(rawOriginal) || rawOriginal <= offerPrice) {
      return { valid: false, error: 'السعر الأصلي قبل الخصم يجب أن يكون أكبر من سعر العرض.' };
    }
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(input.startDate || '')) {
    return { valid: false, error: 'يرجى تحديد تاريخ بداية صحيح للعرض.' };
  }
  if (!datePattern.test(input.endDate || '')) {
    return { valid: false, error: 'يرجى تحديد تاريخ انتهاء صحيح للعرض.' };
  }
  if (input.endDate < input.startDate) {
    return { valid: false, error: 'تاريخ انتهاء العرض يجب أن يكون مساوياً لتاريخ البداية أو بعده.' };
  }

  if (input.discountPercentage !== '' && input.discountPercentage !== null && input.discountPercentage !== undefined) {
    const pct = Number(input.discountPercentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { valid: false, error: 'نسبة الخصم يجب أن تكون بين 0 و 100%.' };
    }
  }

  return { valid: true };
}

export function validateOfferImageFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeAllowed = (ALLOWED_OFFER_IMAGE_MIMES as readonly string[]).includes((file.type || '').toLowerCase());
  const extAllowed = (ALLOWED_OFFER_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
  if (!mimeAllowed && !extAllowed) {
    return 'صيغة الصورة غير مدعومة. الصيغ المسموح بها: JPG, JPEG, PNG, WebP.';
  }
  if (file.size <= 0 || file.size > MAX_OFFER_IMAGE_BYTES) {
    return 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.';
  }
  return null;
}

export function safeImageUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function extractOfferStoragePath(imageUrl: string): string | null {
  if (!imageUrl) return null;
  const marker = `/storage/v1/object/public/${OFFER_IMAGES_BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return null;
  const path = imageUrl.slice(idx + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

export async function uploadOfferImage(file: File): Promise<{ url?: string; error?: string }> {
  const validationErr = validateOfferImageFile(file);
  if (validationErr) return { error: validationErr };

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const safeExt = (ALLOWED_OFFER_IMAGE_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'jpg';
  const objectPath = `offers/${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage
    .from(OFFER_IMAGES_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
      upsert: false,
    });

  if (error) {
    return { error: error.message || 'تعذر رفع صورة العرض.' };
  }

  const { data } = supabase.storage.from(OFFER_IMAGES_BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    return { error: 'تعذر الحصول على رابط صورة العرض.' };
  }
  return { url: data.publicUrl };
}

export async function removeOfferImageByUrl(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  const path = extractOfferStoragePath(imageUrl);
  if (!path) return;
  await supabase.storage.from(OFFER_IMAGES_BUCKET).remove([path]);
}

export function mapOfferRow(
  row: Record<string, unknown>,
  doctorsByUuid?: Map<string, { name?: string; specialty?: string }>,
): OfferRecord {
  const doctorUuid = String(row.doctor_id ?? '');
  const docInfo = doctorsByUuid?.get(doctorUuid);
  const offerPrice = Number(row.offer_price ?? 0);
  const originalPrice = row.original_price !== null && row.original_price !== undefined ? Number(row.original_price) : null;
  const discountPercentage =
    row.discount_percentage !== null && row.discount_percentage !== undefined
      ? Number(row.discount_percentage)
      : calculateDiscountPercentage(offerPrice, originalPrice);

  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    doctorId: doctorUuid,
    doctorLocalId: doctorUuid ? localIdFromUuid(doctorUuid) : 0,
    doctorName: docInfo?.name,
    doctorSpecialty: docInfo?.specialty,
    description: typeof row.description === 'string' ? row.description : '',
    offerPrice,
    originalPrice,
    discountPercentage,
    imageUrl: safeImageUrl(row.image_url),
    startDate: String(row.start_date ?? ''),
    endDate: String(row.end_date ?? ''),
    isActive: row.is_active !== false,
    showOnHomepage: row.show_on_homepage !== false,
    displayOrder: Number(row.display_order ?? 0),
    buttonText: typeof row.button_text === 'string' && row.button_text.trim() ? row.button_text.trim() : 'احجز الآن',
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
  };
}

export function getOfferLifecycleStatus(
  offer: Pick<OfferRecord, 'isActive' | 'startDate' | 'endDate'>,
  todayStr: string,
): 'active' | 'inactive' | 'expired' | 'upcoming' {
  if (!offer.isActive) return 'inactive';
  if (offer.endDate && offer.endDate < todayStr) return 'expired';
  if (offer.startDate && offer.startDate > todayStr) return 'upcoming';
  return 'active';
}

export function filterHomepageOffers(
  offers: OfferRecord[],
  doctors: DoctorLookupItem[],
  todayStr: string,
): OfferRecord[] {
  const doctorsByUuid = new Map<string, DoctorLookupItem>();
  const doctorsByLocalId = new Map<number, DoctorLookupItem>();
  for (const d of doctors) {
    if (d.dbId) doctorsByUuid.set(d.dbId, d);
    doctorsByLocalId.set(d.id, d);
  }

  return offers
    .filter((offer) => {
      if (!offer.isActive) return false;
      if (!offer.showOnHomepage) return false;
      if (!offer.startDate || !offer.endDate) return false;
      if (todayStr < offer.startDate || todayStr > offer.endDate) return false;
      const doc = (offer.doctorId ? doctorsByUuid.get(offer.doctorId) : undefined) || doctorsByLocalId.get(offer.doctorLocalId);
      return Boolean(doc);
    })
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}
