import { supabase } from '@/integrations/supabase/client';
import { invokeBackend } from '@/lib/backend';

export const MEDICAL_VIDEO_THUMBNAILS_BUCKET = 'medical-video-thumbnails';
export const MEDICAL_VIDEO_FILES_BUCKET = 'medical-video-files';

export const MAX_VIDEO_THUMBNAIL_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_VIDEO_FILE_BYTES = 100 * 1024 * 1024; // 100MB

export const ALLOWED_THUMBNAIL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const ALLOWED_THUMBNAIL_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg'] as const;
export const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg'] as const;

export type MedicalVideoPermissionId =
  | 'medical_videos_view'
  | 'medical_videos_create'
  | 'medical_videos_edit'
  | 'medical_videos_delete'
  | 'medical_videos_publish'
  | 'medical_videos_manage_categories'
  | 'medical_videos_upload'
  | 'medical_videos_manage_featured';

export type VideoSourceType = 'youtube' | 'vimeo' | 'mp4' | 'upload';

export interface MedicalVideoCategoryRecord {
  id: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalVideoRecord {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  thumbnailUrl: string;
  videoSourceType: VideoSourceType;
  videoUrl: string;
  storagePath: string;
  categoryId: string | null;
  categoryNameAr?: string;
  categoryNameEn?: string;
  doctorId: string | null;
  doctorName?: string;
  doctorSpecialty?: string;
  specialty: string;
  isActive: boolean;
  isPublished: boolean;
  isFeatured: boolean;
  displayOrder: number;
  publishedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalVideoFormInput {
  titleAr: string;
  titleEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  thumbnailUrl?: string;
  videoSourceType: VideoSourceType;
  videoUrl?: string;
  storagePath?: string;
  categoryId?: string | null;
  doctorId?: string | null;
  specialty?: string;
  isActive: boolean;
  isPublished: boolean;
  isFeatured: boolean;
  displayOrder?: string | number;
  publishedAt?: string;
}

export interface MedicalVideoCategoryInput {
  nameAr: string;
  nameEn?: string;
  isActive: boolean;
  displayOrder?: string | number;
}

export const DEFAULT_MEDICAL_VIDEO_CATEGORIES: MedicalVideoCategoryRecord[] = [
  { id: '33333333-3333-4333-8333-333333333301', nameAr: 'أمراض العيون', nameEn: 'Eye Diseases', isActive: true, displayOrder: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333302', nameAr: 'المياه البيضاء', nameEn: 'Cataract', isActive: true, displayOrder: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333303', nameAr: 'القرنية', nameEn: 'Cornea', isActive: true, displayOrder: 3, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333304', nameAr: 'الليزك وتصحيح الإبصار', nameEn: 'LASIK & Vision Correction', isActive: true, displayOrder: 4, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333305', nameAr: 'الشبكية والجسم الزجاجي', nameEn: 'Retina & Vitreous', isActive: true, displayOrder: 5, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333306', nameAr: 'الحول وعيون الأطفال', nameEn: 'Strabismus & Pediatric Ophthalmology', isActive: true, displayOrder: 6, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333307', nameAr: 'الجلوكوما والمياه الزرقاء', nameEn: 'Glaucoma', isActive: true, displayOrder: 7, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333308', nameAr: 'تجميل العيون', nameEn: 'Oculoplastic Surgery', isActive: true, displayOrder: 8, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333309', nameAr: 'الفحوصات الطبية', nameEn: 'Medical Examinations', isActive: true, displayOrder: 9, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333310', nameAr: 'نصائح وإرشادات طبية', nameEn: 'Medical Advice & Guidelines', isActive: true, displayOrder: 10, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333311', nameAr: 'فيديوهات الأطباء', nameEn: 'Doctors Videos', isActive: true, displayOrder: 11, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333312', nameAr: 'أخرى', nameEn: 'Other', isActive: true, displayOrder: 12, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

type PermissionCheckUser = { role: 'admin' | 'staff'; permissions?: string[] } | null | undefined;

export function hasMedicalVideoPermission(
  user: PermissionCheckUser,
  permission: MedicalVideoPermissionId,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeId(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    const host = parsed.hostname.toLowerCase();
    let candidate: string | null = null;
    if (host.endsWith('youtu.be')) {
      candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (parsed.pathname.startsWith('/watch')) {
      candidate = parsed.searchParams.get('v');
    } else {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
        candidate = parts[1] ?? null;
      }
    }

    return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIMEO_ID_RE = /^\d{5,12}$/;

export function extractVimeoId(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    if (!VIMEO_HOSTS.has(host)) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    const candidate =
      host === 'player.vimeo.com' && parts[0] === 'video' ? parts[1] : parts[parts.length - 1];
    return candidate && VIMEO_ID_RE.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function isValidDirectMp4Url(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;
    const pathLower = parsed.pathname.toLowerCase();
    return /\.(mp4|webm|ogg)$/i.test(pathLower) || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildSafeEmbedUrl(sourceType: VideoSourceType, rawUrl: unknown): string {
  if (sourceType === 'youtube') {
    const id = extractYouTubeId(rawUrl);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : '';
  }
  if (sourceType === 'vimeo') {
    const id = extractVimeoId(rawUrl);
    return id ? `https://player.vimeo.com/video/${id}` : '';
  }
  if (sourceType === 'mp4' && typeof rawUrl === 'string' && isValidDirectMp4Url(rawUrl)) {
    return new URL(rawUrl.trim()).toString();
  }
  return '';
}

export function autoYouTubeThumbnailUrl(rawUrl: unknown): string {
  const id = extractYouTubeId(rawUrl);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

const SAFE_RASTER_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i;

export function safeThumbnailUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (SAFE_RASTER_DATA_URL_RE.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function validateVideoInput(
  input: MedicalVideoFormInput,
): { valid: true } | { valid: false; error: string } {
  const titleAr = (input.titleAr || '').trim();
  if (!titleAr) return { valid: false, error: 'عنوان الفيديو باللغة العربية مطلوب.' };
  if (titleAr.length > 200) return { valid: false, error: 'عنوان الفيديو طويل جداً (الحد الأقصى 200 حرف).' };

  const source = input.videoSourceType;
  if (!(['youtube', 'vimeo', 'mp4', 'upload'] as const).includes(source)) {
    return { valid: false, error: 'نوع مصدر الفيديو غير صالح.' };
  }

  if (source === 'youtube' && !extractYouTubeId(input.videoUrl)) {
    return { valid: false, error: 'يرجى إدخال رابط YouTube صحيح.' };
  }
  if (source === 'vimeo' && !extractVimeoId(input.videoUrl)) {
    return { valid: false, error: 'يرجى إدخال رابط Vimeo صحيح.' };
  }
  if (source === 'mp4' && !isValidDirectMp4Url(input.videoUrl)) {
    return { valid: false, error: 'يرجى إدخال رابط فيديو مباشر صحيح (https).' };
  }
  if (source === 'upload' && !(input.storagePath || '').trim() && !(input.videoUrl || '').trim()) {
    return { valid: false, error: 'يرجى رفع ملف فيديو بصيغة MP4 أو WebM أو OGG.' };
  }

  if ((input.thumbnailUrl || '').trim() && !safeThumbnailUrl(input.thumbnailUrl)) {
    return { valid: false, error: 'رابط الصورة المصغرة غير صالح.' };
  }

  return { valid: true };
}

export function validateCategoryInput(
  input: MedicalVideoCategoryInput,
): { valid: true } | { valid: false; error: string } {
  const nameAr = (input.nameAr || '').trim();
  if (!nameAr) return { valid: false, error: 'اسم القسم باللغة العربية مطلوب.' };
  if (nameAr.length > 100) return { valid: false, error: 'اسم القسم طويل جداً (الحد الأقصى 100 حرف).' };
  return { valid: true };
}

export function validateThumbnailFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeOk = (ALLOWED_THUMBNAIL_MIMES as readonly string[]).includes((file.type || '').toLowerCase());
  const extOk = (ALLOWED_THUMBNAIL_EXTENSIONS as readonly string[]).includes(ext);
  if (!mimeOk && !extOk) {
    return 'صيغة الصورة المصغرة غير مدعومة. الصيغ المسموح بها: JPG, JPEG, PNG, WebP.';
  }
  if (file.size <= 0 || file.size > MAX_VIDEO_THUMBNAIL_BYTES) {
    return 'حجم الصورة المصغرة يجب ألا يتجاوز 5 ميجابايت.';
  }
  return null;
}

export function validateVideoFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeOk = (ALLOWED_VIDEO_MIMES as readonly string[]).includes((file.type || '').toLowerCase());
  const extOk = (ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
  if (!mimeOk && !extOk) {
    return 'صيغة ملف الفيديو غير مدعومة. الصيغ المسموح بها: MP4, WebM, OGG.';
  }
  if (file.size <= 0 || file.size > MAX_VIDEO_FILE_BYTES) {
    return 'حجم ملف الفيديو يجب ألا يتجاوز 100 ميجابايت.';
  }
  return null;
}

export function isMissingMedicalVideosTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const codeStr = typeof code === 'string' ? code : '';
  const msgStr = typeof message === 'string' ? message : '';
  return (
    codeStr === 'PGRST205' ||
    codeStr === '42P01' ||
    /Could not find the table|relation .*medical_video.* does not exist|schema cache/i.test(msgStr)
  );
}

export function isMissingStorageBucketError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { message, statusCode, error: innerErr } = error as {
    message?: unknown;
    statusCode?: unknown;
    error?: unknown;
  };
  const msg = `${typeof message === 'string' ? message : ''} ${typeof innerErr === 'string' ? innerErr : ''}`;
  return String(statusCode || '') === '404' || /bucket not found|does not exist/i.test(msg);
}

function fileToRasterDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (SAFE_RASTER_DATA_URL_RE.test(result)) resolve(result);
      else reject(new Error('صيغة الصورة غير مدعومة.'));
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadMedicalVideoThumbnail(file: File): Promise<{ url?: string; error?: string }> {
  const err = validateThumbnailFile(file);
  if (err) return { error: err };

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const safeExt = (ALLOWED_THUMBNAIL_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'jpg';
  const objectPath = `thumbnails/${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage
    .from(MEDICAL_VIDEO_THUMBNAILS_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
      upsert: false,
    });

  if (error) {
    if (isMissingStorageBucketError(error)) {
      try {
        const dataUrl = await fileToRasterDataUrl(file);
        return { url: dataUrl };
      } catch (readErr) {
        return { error: readErr instanceof Error ? readErr.message : 'تعذر معالجة الصورة.' };
      }
    }
    return { error: error.message || 'تعذر رفع الصورة المصغرة.' };
  }

  const { data } = supabase.storage.from(MEDICAL_VIDEO_THUMBNAILS_BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) return { error: 'تعذر الحصول على رابط الصورة المصغرة.' };
  return { url: data.publicUrl };
}

export function extractThumbnailStoragePath(url: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${MEDICAL_VIDEO_THUMBNAILS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

export async function removeMedicalVideoThumbnailByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const path = extractThumbnailStoragePath(url);
  if (!path) return;
  await supabase.storage.from(MEDICAL_VIDEO_THUMBNAILS_BUCKET).remove([path]);
}

export async function uploadMedicalVideoFile(file: File): Promise<{ storagePath?: string; error?: string }> {
  const err = validateVideoFile(file);
  if (err) return { error: err };

  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const safeExt = (ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'mp4';
  const objectPath = `videos/${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage
    .from(MEDICAL_VIDEO_FILES_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type || `video/${safeExt}`,
      upsert: false,
    });

  if (error) {
    if (isMissingStorageBucketError(error)) {
      return {
        error: 'مخزن ملفات الفيديو غير مفعّل بعد على قاعدة البيانات. يرجى تطبيق الترحيل 0019 أو استخدام رابط YouTube / Vimeo / MP4.',
      };
    }
    return { error: error.message || 'تعذر رفع ملف الفيديو.' };
  }

  return { storagePath: objectPath };
}

export async function removeMedicalVideoFileByPath(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;
  await supabase.storage.from(MEDICAL_VIDEO_FILES_BUCKET).remove([storagePath]);
}

export async function getPlayableVideoUrl(
  video: Pick<MedicalVideoRecord, 'id' | 'videoSourceType' | 'videoUrl' | 'storagePath'>,
): Promise<{ url?: string; error?: string }> {
  if (video.videoSourceType !== 'upload') {
    const safeUrl = buildSafeEmbedUrl(video.videoSourceType, video.videoUrl);
    return safeUrl ? { url: safeUrl } : { error: 'رابط الفيديو غير صالح.' };
  }

  if (!video.storagePath) {
    if (video.videoUrl && isValidDirectMp4Url(video.videoUrl)) {
      return { url: video.videoUrl };
    }
    return { error: 'ملف الفيديو غير متاح.' };
  }

  // Prefer server-signed playback endpoint so private storage stays protected
  const { data, error } = await invokeBackend('get-medical-video-url', {
    body: { videoId: video.id },
  });

  if (!error && data?.url) {
    return { url: String(data.url) };
  }

  // Direct authenticated staff preview fallback (works for mock client or authenticated admin session)
  const { data: signedData, error: signErr } = await supabase.storage
    .from(MEDICAL_VIDEO_FILES_BUCKET)
    .createSignedUrl(video.storagePath, 3600);

  if (!signErr && signedData?.signedUrl) {
    return { url: signedData.signedUrl };
  }

  return { error: error?.message || signErr?.message || 'تعذر تشغيل الفيديو.' };
}

export function mapCategoryRow(row: Record<string, unknown>): MedicalVideoCategoryRecord {
  return {
    id: String(row.id ?? ''),
    nameAr: String(row.name_ar ?? ''),
    nameEn: typeof row.name_en === 'string' ? row.name_en : '',
    isActive: row.is_active !== false,
    displayOrder: Number(row.display_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function mapMedicalVideoRow(
  row: Record<string, unknown>,
  categoriesById?: Map<string, MedicalVideoCategoryRecord>,
  doctorsById?: Map<string, { name?: string; specialty?: string }>,
): MedicalVideoRecord {
  const categoryId = typeof row.category_id === 'string' && row.category_id ? row.category_id : null;
  const doctorId = typeof row.doctor_id === 'string' && row.doctor_id ? row.doctor_id : null;
  const cat = categoryId ? categoriesById?.get(categoryId) : undefined;
  const doc = doctorId ? doctorsById?.get(doctorId) : undefined;
  const sourceType = (['youtube', 'vimeo', 'mp4', 'upload'].includes(String(row.video_source_type))
    ? String(row.video_source_type)
    : 'youtube') as VideoSourceType;

  return {
    id: String(row.id ?? ''),
    titleAr: String(row.title_ar ?? ''),
    titleEn: typeof row.title_en === 'string' ? row.title_en : '',
    descriptionAr: typeof row.description_ar === 'string' ? row.description_ar : '',
    descriptionEn: typeof row.description_en === 'string' ? row.description_en : '',
    thumbnailUrl: safeThumbnailUrl(row.thumbnail_url),
    videoSourceType: sourceType,
    videoUrl: typeof row.video_url === 'string' ? row.video_url : '',
    storagePath: typeof row.storage_path === 'string' ? row.storage_path : '',
    categoryId,
    categoryNameAr: cat?.nameAr,
    categoryNameEn: cat?.nameEn,
    doctorId,
    doctorName: doc?.name,
    doctorSpecialty: doc?.specialty,
    specialty: typeof row.specialty === 'string' ? row.specialty : '',
    isActive: row.is_active !== false,
    isPublished: row.is_published === true,
    isFeatured: row.is_featured === true,
    displayOrder: Number(row.display_order ?? 0),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    updatedBy: typeof row.updated_by === 'string' ? row.updated_by : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function filterPublicCategories(
  categories: MedicalVideoCategoryRecord[],
): MedicalVideoCategoryRecord[] {
  return [...categories]
    .filter((c) => c.isActive && c.nameAr.trim() !== '')
    .sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt));
}

export function filterPublicMedicalVideos(
  videos: MedicalVideoRecord[],
  options: {
    search?: string;
    categoryId?: string;
    activeCategoryIds?: Set<string>;
  } = {},
): MedicalVideoRecord[] {
  const q = (options.search || '').trim().toLowerCase();
  const catFilter = (options.categoryId || '').trim();
  const activeCatSet = options.activeCategoryIds;

  return [...videos]
    .filter((v) => {
      if (!v.isActive || !v.isPublished) return false;
      if (catFilter && v.categoryId !== catFilter) return false;
      if (v.categoryId && activeCatSet && activeCatSet.size > 0 && !activeCatSet.has(v.categoryId)) {
        // If a category was explicitly deactivated, hide videos filtered into inactive categories or show uncategorized cleanly
        return false;
      }
      if (!q) return true;
      return (
        v.titleAr.toLowerCase().includes(q) ||
        v.titleEn.toLowerCase().includes(q) ||
        v.descriptionAr.toLowerCase().includes(q) ||
        v.specialty.toLowerCase().includes(q) ||
        (v.doctorName || '').toLowerCase().includes(q) ||
        (v.categoryNameAr || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return (b.publishedAt || b.createdAt || '').localeCompare(a.publishedAt || a.createdAt || '');
    });
}

export function paginateItems<T>(items: T[], limit: number): { visible: T[]; hasMore: boolean } {
  const safeLimit = Math.max(1, limit);
  return {
    visible: items.slice(0, safeLimit),
    hasMore: items.length > safeLimit,
  };
}

// Local pre-migration fallback storage (never contains fake/demo videos)
export const MEDICAL_VIDEOS_FALLBACK_KEY = 'barada_medical_videos_fallback_v1';
export const MEDICAL_VIDEO_CATEGORIES_FALLBACK_KEY = 'barada_medical_video_categories_fallback_v1';
export const MEDICAL_VIDEOS_CHANGED_EVENT = 'barada:medical-videos-changed';

export function readFallbackCategories(): Array<Record<string, unknown>> {
  const defaultRows = DEFAULT_MEDICAL_VIDEO_CATEGORIES.map((c) => ({
    id: c.id,
    name_ar: c.nameAr,
    name_en: c.nameEn,
    is_active: c.isActive,
    display_order: c.displayOrder,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  if (typeof window === 'undefined' || !window.localStorage) return defaultRows;
  try {
    const raw = window.localStorage.getItem(MEDICAL_VIDEO_CATEGORIES_FALLBACK_KEY);
    if (!raw) return defaultRows;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultRows;
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
  } catch {
    return defaultRows;
  }
}

export function writeFallbackCategories(rows: Array<Record<string, unknown>>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(MEDICAL_VIDEO_CATEGORIES_FALLBACK_KEY, JSON.stringify(rows));
  } catch {
    /* ignore storage quota errors */
  }
}

export function readFallbackVideos(): Array<Record<string, unknown>> {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(MEDICAL_VIDEOS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .sort((a, b) => {
        const orderDiff = Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
      });
  } catch {
    return [];
  }
}

export function writeFallbackVideos(rows: Array<Record<string, unknown>>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(MEDICAL_VIDEOS_FALLBACK_KEY, JSON.stringify(rows));
  } catch {
    /* ignore storage quota errors */
  }
}

export function clearFallbackMedicalVideos(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(MEDICAL_VIDEOS_FALLBACK_KEY);
    window.localStorage.removeItem(MEDICAL_VIDEO_CATEGORIES_FALLBACK_KEY);
  } catch {
    /* ignore */
  }
}

export function notifyMedicalVideosChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MEDICAL_VIDEOS_CHANGED_EVENT));
}
