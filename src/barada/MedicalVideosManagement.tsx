import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeBackend } from '@/lib/backend';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Edit2,
  Eye,
  EyeOff,
  Film,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Stethoscope,
  Trash,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cairoTodayStr } from './dateUtils';
import {
  autoYouTubeThumbnailUrl,
  buildSafeEmbedUrl,
  clearFallbackMedicalVideos,
  DEFAULT_MEDICAL_VIDEO_CATEGORIES,
  getPlayableVideoUrl,
  hasMedicalVideoPermission,
  isEmbedVideoSource,
  isMissingMedicalVideosTableError,
  mapCategoryRow,
  mapMedicalVideoRow,
  MedicalVideoCategoryInput,
  MedicalVideoCategoryRecord,
  MedicalVideoFormInput,
  MedicalVideoRecord,
  notifyMedicalVideosChanged,
  readFallbackCategories,
  readFallbackVideos,
  removeMedicalVideoFileByPath,
  removeMedicalVideoThumbnailByUrl,
  uploadMedicalVideoFile,
  uploadMedicalVideoThumbnail,
  validateCategoryInput,
  validateThumbnailFile,
  validateVideoFile,
  validateVideoInput,
  VideoSourceType,
  writeFallbackCategories,
  writeFallbackVideos,
} from './medicalVideos';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

interface MedicalVideosManagementProps {
  currentUser: { role: 'admin' | 'staff'; permissions: string[] };
  realtimeDoctors: Array<{ id: string; name: string; specialty?: string }>;
  realtimeVideos: Array<Record<string, unknown>>;
  realtimeCategories: Array<Record<string, unknown>>;
  realtimeLoaded?: boolean;
  cardClass: string;
  inputClass: string;
  onVideosChanged?: () => void;
}

const createEmptyVideoForm = (todayStr: string): MedicalVideoFormInput => ({
  titleAr: '',
  titleEn: '',
  descriptionAr: '',
  descriptionEn: '',
  thumbnailUrl: '',
  videoSourceType: 'youtube',
  videoUrl: '',
  storagePath: '',
  categoryId: '',
  doctorId: '',
  specialty: '',
  isActive: true,
  isPublished: false,
  isFeatured: false,
  displayOrder: 0,
  publishedAt: todayStr,
});

const createEmptyCategoryForm = (): MedicalVideoCategoryInput => ({
  nameAr: '',
  nameEn: '',
  isActive: true,
  displayOrder: 0,
});

const SOURCE_LABELS: Record<VideoSourceType, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  mp4: 'رابط MP4 مباشر',
  upload: 'ملف مرفوع (Storage)',
};

export const MedicalVideosManagement: React.FC<MedicalVideosManagementProps> = ({
  currentUser,
  realtimeDoctors,
  realtimeVideos,
  realtimeCategories,
  realtimeLoaded = false,
  cardClass,
  inputClass,
  onVideosChanged,
}) => {
  const todayStr = cairoTodayStr();

  const canView = hasMedicalVideoPermission(currentUser, 'medical_videos_view');
  const canCreate = hasMedicalVideoPermission(currentUser, 'medical_videos_create');
  const canEdit = hasMedicalVideoPermission(currentUser, 'medical_videos_edit');
  const canDelete = hasMedicalVideoPermission(currentUser, 'medical_videos_delete');
  const canPublish = hasMedicalVideoPermission(currentUser, 'medical_videos_publish');
  const canManageCategories = hasMedicalVideoPermission(currentUser, 'medical_videos_manage_categories');
  const canUpload = hasMedicalVideoPermission(currentUser, 'medical_videos_upload');
  const canManageFeatured = hasMedicalVideoPermission(currentUser, 'medical_videos_manage_featured');

  const [subTab, setSubTab] = useState<'videos' | 'categories'>('videos');
  const [videos, setVideos] = useState<MedicalVideoRecord[]>([]);
  const [categories, setCategories] = useState<MedicalVideoCategoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usingFallbackStore, setUsingFallbackStore] = useState<boolean>(false);
  const schemaSyncAttemptedRef = useRef<boolean>(false);

  // Video Form State
  const [form, setForm] = useState<MedicalVideoFormInput>(() => createEmptyVideoForm(todayStr));
  const [editingVideo, setEditingVideo] = useState<MedicalVideoRecord | null>(null);
  const [savingVideo, setSavingVideo] = useState<boolean>(false);
  const [pendingThumbFile, setPendingThumbFile] = useState<File | null>(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState<string>('');
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);

  // Category Form State
  const [catForm, setCatForm] = useState<MedicalVideoCategoryInput>(createEmptyCategoryForm);
  const [editingCategory, setEditingCategory] = useState<MedicalVideoCategoryRecord | null>(null);
  const [savingCategory, setSavingCategory] = useState<boolean>(false);

  // Modals: Preview & Delete Confirmation
  const [previewVideo, setPreviewVideo] = useState<{
    video: MedicalVideoRecord | MedicalVideoFormInput;
    resolvedUrl: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<MedicalVideoRecord | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'published' | 'draft' | 'inactive' | 'featured'>('');

  const doctorsById = useMemo(() => {
    const map = new Map<string, { name?: string; specialty?: string }>();
    for (const d of realtimeDoctors) {
      map.set(d.id, { name: d.name, specialty: d.specialty });
    }
    return map;
  }, [realtimeDoctors]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, MedicalVideoCategoryRecord>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const activateFallbackStore = useCallback(() => {
    setUsingFallbackStore(true);
    setLoadError(null);
    const localCats = readFallbackCategories().map(mapCategoryRow);
    const catMap = new Map<string, MedicalVideoCategoryRecord>();
    for (const c of localCats) catMap.set(c.id, c);
    const localVideos = readFallbackVideos().map((r) => mapMedicalVideoRow(r, catMap, doctorsById));
    setCategories(localCats);
    setVideos(localVideos);
  }, [doctorsById]);

  const fetchLibrary = useCallback(async () => {
    if (!canView) {
      setVideos([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      let [catsRes, videosRes] = await Promise.all([
        supabase
          .from('medical_video_categories')
          .select('*')
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('medical_videos')
          .select('*')
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: false }),
      ]);

      if (
        (catsRes.error && isMissingMedicalVideosTableError(catsRes.error)) ||
        (videosRes.error && isMissingMedicalVideosTableError(videosRes.error))
      ) {
        if (!schemaSyncAttemptedRef.current) {
          schemaSyncAttemptedRef.current = true;
          const { data: migrationResult } = await invokeBackend('ensure-medical-videos-schema');
          if (migrationResult?.migrated) {
            [catsRes, videosRes] = await Promise.all([
              supabase
                .from('medical_video_categories')
                .select('*')
                .order('display_order', { ascending: true })
                .order('created_at', { ascending: true }),
              supabase
                .from('medical_videos')
                .select('*')
                .order('display_order', { ascending: true })
                .order('created_at', { ascending: false }),
            ]);
          }
        }
      }

      if (
        (catsRes.error && isMissingMedicalVideosTableError(catsRes.error)) ||
        (videosRes.error && isMissingMedicalVideosTableError(videosRes.error))
      ) {
        activateFallbackStore();
        return;
      }

      if (catsRes.error) throw catsRes.error;
      if (videosRes.error) throw videosRes.error;

      setUsingFallbackStore(false);
      let catRows = (catsRes.data || []) as unknown as Array<Record<string, unknown>>;
      let videoRows = (videosRes.data || []) as unknown as Array<Record<string, unknown>>;

      // Seed default categories automatically if DB table exists cleanly yet empty
      if (catRows.length === 0 && canManageCategories) {
        const seedRows = DEFAULT_MEDICAL_VIDEO_CATEGORIES.map((c) => ({
          name_ar: c.nameAr,
          name_en: c.nameEn,
          is_active: true,
          display_order: c.displayOrder,
        }));
        const { data: seeded } = await supabase
          .from('medical_video_categories')
          .insert(seedRows as TablesInsert<'medical_video_categories'>[])
          .select('*');
        if (Array.isArray(seeded) && seeded.length > 0) {
          catRows = seeded as unknown as Array<Record<string, unknown>>;
        }
      }

      // Sync pre-migration local fallback videos once tables go live
      if (videoRows.length === 0 && canCreate) {
        const pendingLocal = readFallbackVideos();
        if (pendingLocal.length > 0) {
          const validCatIds = new Set(catRows.map((c) => String(c.id ?? '')));
          const toInsert = pendingLocal.map((r) => ({
            title_ar: String(r.title_ar ?? ''),
            title_en: (r.title_en as string | null) ?? null,
            description_ar: (r.description_ar as string | null) ?? null,
            description_en: (r.description_en as string | null) ?? null,
            thumbnail_url: (r.thumbnail_url as string | null) ?? null,
            video_source_type: String(r.video_source_type ?? 'youtube'),
            video_url: (r.video_url as string | null) ?? null,
            storage_path: (r.storage_path as string | null) ?? null,
            category_id:
              typeof r.category_id === 'string' && validCatIds.has(r.category_id) ? r.category_id : null,
            doctor_id:
              typeof r.doctor_id === 'string' && doctorsById.has(r.doctor_id) ? r.doctor_id : null,
            specialty: (r.specialty as string | null) ?? null,
            is_active: r.is_active !== false,
            is_published: canPublish ? Boolean(r.is_published) : false,
            is_featured: canManageFeatured ? Boolean(r.is_featured) : false,
            display_order: Number(r.display_order ?? 0),
            published_at: canPublish && r.is_published ? String(r.published_at || new Date().toISOString()) : null,
          }));
          const { data: synced } = await supabase
            .from('medical_videos')
            .insert(toInsert as TablesInsert<'medical_videos'>[])
            .select('*');
          if (Array.isArray(synced)) {
            clearFallbackMedicalVideos();
            notifyMedicalVideosChanged();
            videoRows = synced as unknown as Array<Record<string, unknown>>;
          }
        }
      }

      const mappedCats = catRows.map(mapCategoryRow);
      const catMap = new Map<string, MedicalVideoCategoryRecord>();
      for (const c of mappedCats) catMap.set(c.id, c);

      setCategories(mappedCats);
      setVideos(videoRows.map((r) => mapMedicalVideoRow(r, catMap, doctorsById)));
    } catch (err) {
      if (isMissingMedicalVideosTableError(err)) {
        activateFallbackStore();
        return;
      }
      console.error('Error loading medical videos:', err);
      setLoadError('تعذر تحميل مكتبة الفيديوهات الطبية. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    canCreate,
    canManageCategories,
    canPublish,
    canManageFeatured,
    doctorsById,
    activateFallbackStore,
  ]);

  useEffect(() => {
    void fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    if (!canView || usingFallbackStore || !realtimeLoaded) return;
    const mappedCats = (realtimeCategories || []).map(mapCategoryRow);
    if (mappedCats.length > 0) {
      setCategories(mappedCats);
    }
    const catMap = new Map<string, MedicalVideoCategoryRecord>();
    for (const c of mappedCats.length > 0 ? mappedCats : categories) catMap.set(c.id, c);
    setVideos((realtimeVideos || []).map((r) => mapMedicalVideoRow(r, catMap, doctorsById)));
  }, [canView, usingFallbackStore, realtimeLoaded, realtimeVideos, realtimeCategories, doctorsById]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    };
  }, [thumbPreviewUrl]);

  const resetVideoForm = () => {
    if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    setThumbPreviewUrl('');
    setPendingThumbFile(null);
    setPendingVideoFile(null);
    setEditingVideo(null);
    setForm(createEmptyVideoForm(todayStr));
  };

  const handleThumbSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUpload) {
      toast.error('ليس لديك صلاحية رفع الصور.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateThumbnailFile(file);
    if (err) {
      toast.error(err);
      e.target.value = '';
      return;
    }
    if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    setPendingThumbFile(file);
    setThumbPreviewUrl(URL.createObjectURL(file));
  };

  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUpload) {
      toast.error('ليس لديك صلاحية رفع ملفات الفيديو.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateVideoFile(file);
    if (err) {
      toast.error(err);
      e.target.value = '';
      return;
    }
    setPendingVideoFile(file);
  };

  const handleEditVideoClick = (video: MedicalVideoRecord) => {
    if (!canEdit && !canUpload && !canPublish && !canManageFeatured) return;
    if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    setThumbPreviewUrl('');
    setPendingThumbFile(null);
    setPendingVideoFile(null);
    setEditingVideo(video);
    setForm({
      titleAr: video.titleAr,
      titleEn: video.titleEn,
      descriptionAr: video.descriptionAr,
      descriptionEn: video.descriptionEn,
      thumbnailUrl: video.thumbnailUrl,
      videoSourceType: video.videoSourceType,
      videoUrl: video.videoUrl,
      storagePath: video.storagePath,
      categoryId: video.categoryId || '',
      doctorId: video.doctorId || '',
      specialty: video.specialty,
      isActive: video.isActive,
      isPublished: video.isPublished,
      isFeatured: video.isFeatured,
      displayOrder: video.displayOrder,
      publishedAt: video.publishedAt ? video.publishedAt.slice(0, 10) : todayStr,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingVideo) {
      if (!canEdit && !canUpload && !canPublish && !canManageFeatured) {
        toast.error('ليس لديك صلاحية تعديل الفيديوهات.');
        return;
      }
    } else if (!canCreate) {
      toast.error('ليس لديك صلاحية إضافة فيديوهات طبية.');
      return;
    }

    if (form.videoSourceType === 'upload' && !editingVideo && !pendingVideoFile && !form.storagePath) {
      toast.error('يرجى اختيار ملف فيديو للرفع.');
      return;
    }

    const validationTarget: MedicalVideoFormInput =
      form.videoSourceType === 'upload' && pendingVideoFile
        ? { ...form, storagePath: 'pending-upload' }
        : form;

    const check = validateVideoInput(validationTarget);
    if (!check.valid) {
      toast.error(check.error);
      return;
    }

    setSavingVideo(true);
    try {
      let nextThumbUrl = form.thumbnailUrl?.trim() || '';
      if (pendingThumbFile) {
        if (!canUpload) {
          toast.error('ليس لديك صلاحية رفع الصور.');
          return;
        }
        const up = await uploadMedicalVideoThumbnail(pendingThumbFile);
        if (up.error || !up.url) {
          toast.error(up.error || 'تعذر رفع الصورة المصغرة.');
          return;
        }
        nextThumbUrl = up.url;
      } else if (!nextThumbUrl && form.videoSourceType === 'youtube') {
        nextThumbUrl = autoYouTubeThumbnailUrl(form.videoUrl);
      }

      let nextStoragePath = form.videoSourceType === 'upload' ? form.storagePath?.trim() || '' : '';
      if (form.videoSourceType === 'upload' && pendingVideoFile) {
        if (!canUpload) {
          toast.error('ليس لديك صلاحية رفع ملفات الفيديو.');
          return;
        }
        const vidUp = await uploadMedicalVideoFile(pendingVideoFile);
        if (vidUp.error || !vidUp.storagePath) {
          toast.error(vidUp.error || 'تعذر رفع ملف الفيديو.');
          return;
        }
        nextStoragePath = vidUp.storagePath;
      }

      const nextVideoUrl = form.videoSourceType === 'upload' ? '' : (form.videoUrl || '').trim();
      const publishedAtIso =
        form.isPublished && canPublish
          ? form.publishedAt
            ? new Date(`${form.publishedAt}T12:00:00Z`).toISOString()
            : new Date().toISOString()
          : editingVideo?.publishedAt ?? null;

      if (usingFallbackStore) {
        const now = new Date().toISOString();
        const currentRows = readFallbackVideos();
        if (editingVideo) {
          const updated = currentRows.map((row) =>
            row.id === editingVideo.id
              ? {
                  ...row,
                  title_ar: form.titleAr.trim(),
                  title_en: form.titleEn?.trim() || '',
                  description_ar: form.descriptionAr?.trim() || '',
                  description_en: form.descriptionEn?.trim() || '',
                  thumbnail_url: canUpload ? nextThumbUrl : row.thumbnail_url,
                  video_source_type: form.videoSourceType,
                  video_url: nextVideoUrl,
                  storage_path: canUpload ? nextStoragePath : row.storage_path,
                  category_id: form.categoryId || null,
                  doctor_id: form.doctorId || null,
                  specialty: form.specialty?.trim() || '',
                  is_active: form.isActive,
                  is_published: canPublish ? form.isPublished : Boolean(row.is_published),
                  is_featured: canManageFeatured ? form.isFeatured : Boolean(row.is_featured),
                  display_order: Number(form.displayOrder) || 0,
                  published_at: publishedAtIso,
                  updated_at: now,
                }
              : row,
          );
          writeFallbackVideos(updated);
          notifyMedicalVideosChanged();
          setVideos(updated.map((r) => mapMedicalVideoRow(r, categoriesById, doctorsById)));
          toast.success('تم تحديث بيانات الفيديو بنجاح.');
        } else {
          const newRow: Record<string, unknown> = {
            id: crypto.randomUUID(),
            title_ar: form.titleAr.trim(),
            title_en: form.titleEn?.trim() || '',
            description_ar: form.descriptionAr?.trim() || '',
            description_en: form.descriptionEn?.trim() || '',
            thumbnail_url: nextThumbUrl,
            video_source_type: form.videoSourceType,
            video_url: nextVideoUrl,
            storage_path: nextStoragePath,
            category_id: form.categoryId || null,
            doctor_id: form.doctorId || null,
            specialty: form.specialty?.trim() || '',
            is_active: form.isActive,
            is_published: canPublish ? form.isPublished : false,
            is_featured: canManageFeatured ? form.isFeatured : false,
            display_order: Number(form.displayOrder) || 0,
            published_at: publishedAtIso,
            created_at: now,
            updated_at: now,
          };
          const updated = [newRow, ...currentRows];
          writeFallbackVideos(updated);
          notifyMedicalVideosChanged();
          setVideos(updated.map((r) => mapMedicalVideoRow(r, categoriesById, doctorsById)));
          toast.success('تم إضافة الفيديو الطبي بنجاح.');
        }
        onVideosChanged?.();
        resetVideoForm();
        return;
      }

      if (editingVideo) {
        const updatePayload: TablesUpdate<'medical_videos'> = {};
        if (canEdit) {
          updatePayload.title_ar = form.titleAr.trim();
          updatePayload.title_en = form.titleEn?.trim() || null;
          updatePayload.description_ar = form.descriptionAr?.trim() || null;
          updatePayload.description_en = form.descriptionEn?.trim() || null;
          updatePayload.video_source_type = form.videoSourceType;
          updatePayload.video_url = nextVideoUrl || null;
          updatePayload.category_id = form.categoryId || null;
          updatePayload.doctor_id = form.doctorId || null;
          updatePayload.specialty = form.specialty?.trim() || null;
          updatePayload.is_active = form.isActive;
          updatePayload.display_order = Number(form.displayOrder) || 0;
        }
        if (canUpload) {
          updatePayload.thumbnail_url = nextThumbUrl || null;
          updatePayload.storage_path = nextStoragePath || null;
        }
        if (canPublish) {
          updatePayload.is_published = form.isPublished;
          updatePayload.published_at = form.isPublished ? publishedAtIso : null;
        }
        if (canManageFeatured) {
          updatePayload.is_featured = form.isFeatured;
        }

        const { error: updateErr } = await supabase
          .from('medical_videos')
          .update(updatePayload)
          .eq('id', editingVideo.id);
        if (updateErr) {
          if (updateErr.code === '23514' || String(updateErr.message || '').includes('video_source_type')) {
            const { data: mig } = await invokeBackend('ensure-medical-videos-schema');
            if (mig?.migrated) {
              const { error: retryErr } = await supabase
                .from('medical_videos')
                .update(updatePayload)
                .eq('id', editingVideo.id);
              if (retryErr) throw retryErr;
            } else {
              throw updateErr;
            }
          } else {
            throw updateErr;
          }
        }

        if (canUpload && editingVideo.thumbnailUrl && editingVideo.thumbnailUrl !== nextThumbUrl) {
          void removeMedicalVideoThumbnailByUrl(editingVideo.thumbnailUrl);
        }
        if (canUpload && editingVideo.storagePath && editingVideo.storagePath !== nextStoragePath) {
          void removeMedicalVideoFileByPath(editingVideo.storagePath);
        }

        toast.success('تم تحديث بيانات الفيديو بنجاح.');
      } else {
        const insertPayload: TablesInsert<'medical_videos'> = {
          title_ar: form.titleAr.trim(),
          title_en: form.titleEn?.trim() || null,
          description_ar: form.descriptionAr?.trim() || null,
          description_en: form.descriptionEn?.trim() || null,
          thumbnail_url: canUpload ? nextThumbUrl || null : null,
          video_source_type: form.videoSourceType,
          video_url: nextVideoUrl || null,
          storage_path: canUpload ? nextStoragePath || null : null,
          category_id: form.categoryId || null,
          doctor_id: form.doctorId || null,
          specialty: form.specialty?.trim() || null,
          is_active: form.isActive,
          is_published: canPublish ? form.isPublished : false,
          is_featured: canManageFeatured ? form.isFeatured : false,
          display_order: Number(form.displayOrder) || 0,
          published_at: canPublish && form.isPublished ? publishedAtIso : null,
        };

        const { error: insertErr } = await supabase.from('medical_videos').insert(insertPayload);
        if (insertErr) {
          if (insertErr.code === '23514' || String(insertErr.message || '').includes('video_source_type')) {
            const { data: mig } = await invokeBackend('ensure-medical-videos-schema');
            if (mig?.migrated) {
              const { error: retryErr } = await supabase.from('medical_videos').insert(insertPayload);
              if (retryErr) throw retryErr;
            } else {
              throw insertErr;
            }
          } else {
            throw insertErr;
          }
        }
        toast.success('تم إضافة الفيديو الطبي بنجاح.');
      }

      resetVideoForm();
      await fetchLibrary();
      onVideosChanged?.();
    } catch (err: unknown) {
      console.error('Error saving medical video:', err);
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الفيديو.';
      toast.error(msg.includes('permission denied') ? 'ليس لديك الصلاحية المطلوبة لهذا الإجراء.' : msg);
    } finally {
      setSavingVideo(false);
    }
  };

  const handleQuickToggle = async (
    video: MedicalVideoRecord,
    field: 'is_published' | 'is_active' | 'is_featured',
    nextVal: boolean,
  ) => {
    if (field === 'is_published' && !canPublish) {
      toast.error('ليس لديك صلاحية نشر أو إيقاف نشر الفيديوهات.');
      return;
    }
    if (field === 'is_active' && !canEdit) {
      toast.error('ليس لديك صلاحية تفعيل أو تعطيل الفيديوهات.');
      return;
    }
    if (field === 'is_featured' && !canManageFeatured) {
      toast.error('ليس لديك صلاحية تمييز الفيديوهات.');
      return;
    }

    try {
      if (usingFallbackStore) {
        const now = new Date().toISOString();
        const updated = readFallbackVideos().map((row) =>
          row.id === video.id
            ? {
                ...row,
                [field]: nextVal,
                ...(field === 'is_published' && nextVal && !row.published_at ? { published_at: now } : {}),
                updated_at: now,
              }
            : row,
        );
        writeFallbackVideos(updated);
        notifyMedicalVideosChanged();
        setVideos(updated.map((r) => mapMedicalVideoRow(r, categoriesById, doctorsById)));
        onVideosChanged?.();
        return;
      }

      const payload: TablesUpdate<'medical_videos'> = { [field]: nextVal };
      if (field === 'is_published' && nextVal && !video.publishedAt) {
        payload.published_at = new Date().toISOString();
      }
      const { error } = await supabase.from('medical_videos').update(payload).eq('id', video.id);
      if (error) throw error;
      await fetchLibrary();
      onVideosChanged?.();
    } catch (err) {
      console.error('Error updating video flag:', err);
      toast.error('تعذر تحديث حالة الفيديو.');
    }
  };

  const handleOrderChange = async (video: MedicalVideoRecord, order: number) => {
    if (!canEdit) {
      toast.error('ليس لديك صلاحية تغيير ترتيب العرض.');
      return;
    }
    try {
      if (usingFallbackStore) {
        const updated = readFallbackVideos().map((row) =>
          row.id === video.id ? { ...row, display_order: order, updated_at: new Date().toISOString() } : row,
        );
        writeFallbackVideos(updated);
        notifyMedicalVideosChanged();
        setVideos(updated.map((r) => mapMedicalVideoRow(r, categoriesById, doctorsById)));
        onVideosChanged?.();
        return;
      }
      const { error } = await supabase
        .from('medical_videos')
        .update({ display_order: order })
        .eq('id', video.id);
      if (error) throw error;
      await fetchLibrary();
      onVideosChanged?.();
    } catch {
      toast.error('تعذر تحديث ترتيب الفيديو.');
    }
  };

  const handleConfirmDeleteVideo = async () => {
    if (!deletingVideo) return;
    if (!canDelete) {
      toast.error('ليس لديك صلاحية حذف الفيديوهات.');
      setDeletingVideo(null);
      return;
    }
    setDeleting(true);
    try {
      if (usingFallbackStore) {
        const nextRows = readFallbackVideos().filter((r) => r.id !== deletingVideo.id);
        writeFallbackVideos(nextRows);
        notifyMedicalVideosChanged();
        setVideos(nextRows.map((r) => mapMedicalVideoRow(r, categoriesById, doctorsById)));
      } else {
        const { error } = await supabase.from('medical_videos').delete().eq('id', deletingVideo.id);
        if (error) throw error;
        if (deletingVideo.thumbnailUrl) void removeMedicalVideoThumbnailByUrl(deletingVideo.thumbnailUrl);
        if (deletingVideo.storagePath) void removeMedicalVideoFileByPath(deletingVideo.storagePath);
        await fetchLibrary();
      }
      if (editingVideo?.id === deletingVideo.id) resetVideoForm();
      toast.success('تم حذف الفيديو بنجاح.');
      onVideosChanged?.();
      setDeletingVideo(null);
    } catch (err) {
      console.error('Error deleting medical video:', err);
      toast.error('تعذر حذف الفيديو.');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenPreview = async (target: MedicalVideoRecord | MedicalVideoFormInput) => {
    setPreviewVideo({ video: target, resolvedUrl: '', loading: true, error: null });

    if ('id' in target) {
      const res = await getPlayableVideoUrl(target);
      setPreviewVideo({
        video: target,
        resolvedUrl: res.url || '',
        loading: false,
        error: res.error || null,
      });
      return;
    }

    if (target.videoSourceType === 'upload') {
      if (pendingVideoFile) {
        setPreviewVideo({
          video: target,
          resolvedUrl: URL.createObjectURL(pendingVideoFile),
          loading: false,
          error: null,
        });
        return;
      }
      if (target.storagePath) {
        const res = await getPlayableVideoUrl({
          id: editingVideo?.id || '',
          videoSourceType: 'upload',
          videoUrl: '',
          storagePath: target.storagePath,
        });
        setPreviewVideo({
          video: target,
          resolvedUrl: res.url || '',
          loading: false,
          error: res.error || null,
        });
        return;
      }
      setPreviewVideo({
        video: target,
        resolvedUrl: '',
        loading: false,
        error: 'يرجى رفع ملف الفيديو أولاً للمعاينة.',
      });
      return;
    }

    const embed = buildSafeEmbedUrl(target.videoSourceType, target.videoUrl);
    setPreviewVideo({
      video: target,
      resolvedUrl: embed,
      loading: false,
      error: embed ? null : 'رابط الفيديو غير صالح للمعاينة.',
    });
  };

  // --- Category Management Handlers ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCategories) {
      toast.error('ليس لديك صلاحية إدارة الأقسام الطبية.');
      return;
    }
    const check = validateCategoryInput(catForm);
    if (!check.valid) {
      toast.error(check.error);
      return;
    }
    setSavingCategory(true);
    try {
      const now = new Date().toISOString();
      if (usingFallbackStore) {
        const list = readFallbackCategories();
        const nextList = editingCategory
          ? list.map((c) =>
              c.id === editingCategory.id
                ? {
                    ...c,
                    name_ar: catForm.nameAr.trim(),
                    name_en: catForm.nameEn?.trim() || '',
                    is_active: catForm.isActive,
                    display_order: Number(catForm.displayOrder) || 0,
                    updated_at: now,
                  }
                : c,
            )
          : [
              ...list,
              {
                id: crypto.randomUUID(),
                name_ar: catForm.nameAr.trim(),
                name_en: catForm.nameEn?.trim() || '',
                is_active: catForm.isActive,
                display_order: Number(catForm.displayOrder) || list.length + 1,
                created_at: now,
                updated_at: now,
              },
            ];
        writeFallbackCategories(nextList);
        notifyMedicalVideosChanged();
        setCategories(nextList.map(mapCategoryRow));
      } else if (editingCategory) {
        const { error } = await supabase
          .from('medical_video_categories')
          .update({
            name_ar: catForm.nameAr.trim(),
            name_en: catForm.nameEn?.trim() || null,
            is_active: catForm.isActive,
            display_order: Number(catForm.displayOrder) || 0,
          })
          .eq('id', editingCategory.id);
        if (error) throw error;
        await fetchLibrary();
      } else {
        const { error } = await supabase.from('medical_video_categories').insert({
          name_ar: catForm.nameAr.trim(),
          name_en: catForm.nameEn?.trim() || null,
          is_active: catForm.isActive,
          display_order: Number(catForm.displayOrder) || categories.length + 1,
        });
        if (error) throw error;
        await fetchLibrary();
      }
      toast.success(editingCategory ? 'تم تحديث القسم بنجاح.' : 'تم إضافة القسم الطبي بنجاح.');
      setEditingCategory(null);
      setCatForm(createEmptyCategoryForm());
      onVideosChanged?.();
    } catch (err) {
      console.error('Error saving category:', err);
      toast.error('تعذر حفظ القسم الطبي.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCategoryMove = async (cat: MedicalVideoCategoryRecord, delta: number) => {
    if (!canManageCategories) return;
    const nextOrder = Math.max(0, cat.displayOrder + delta);
    try {
      if (usingFallbackStore) {
        const nextList = readFallbackCategories().map((c) =>
          c.id === cat.id ? { ...c, display_order: nextOrder, updated_at: new Date().toISOString() } : c,
        );
        writeFallbackCategories(nextList);
        notifyMedicalVideosChanged();
        setCategories(nextList.map(mapCategoryRow));
        onVideosChanged?.();
        return;
      }
      const { error } = await supabase
        .from('medical_video_categories')
        .update({ display_order: nextOrder })
        .eq('id', cat.id);
      if (error) throw error;
      await fetchLibrary();
      onVideosChanged?.();
    } catch {
      toast.error('تعذر تغيير ترتيب القسم.');
    }
  };

  const handleCategoryToggleActive = async (cat: MedicalVideoCategoryRecord) => {
    if (!canManageCategories) return;
    try {
      if (usingFallbackStore) {
        const nextList = readFallbackCategories().map((c) =>
          c.id === cat.id ? { ...c, is_active: !cat.isActive, updated_at: new Date().toISOString() } : c,
        );
        writeFallbackCategories(nextList);
        notifyMedicalVideosChanged();
        setCategories(nextList.map(mapCategoryRow));
        onVideosChanged?.();
        return;
      }
      const { error } = await supabase
        .from('medical_video_categories')
        .update({ is_active: !cat.isActive })
        .eq('id', cat.id);
      if (error) throw error;
      await fetchLibrary();
      onVideosChanged?.();
    } catch {
      toast.error('تعذر تحديث حالة القسم.');
    }
  };

  const filteredVideos = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return videos.filter((v) => {
      if (filterCategoryId && v.categoryId !== filterCategoryId) return false;
      if (filterStatus === 'published' && (!v.isPublished || !v.isActive)) return false;
      if (filterStatus === 'draft' && v.isPublished) return false;
      if (filterStatus === 'inactive' && v.isActive) return false;
      if (filterStatus === 'featured' && !v.isFeatured) return false;
      if (!q) return true;
      return (
        v.titleAr.toLowerCase().includes(q) ||
        v.titleEn.toLowerCase().includes(q) ||
        v.specialty.toLowerCase().includes(q) ||
        (v.doctorName || '').toLowerCase().includes(q) ||
        (v.categoryNameAr || '').toLowerCase().includes(q)
      );
    });
  }, [videos, searchTerm, filterCategoryId, filterStatus]);

  if (!canView) {
    return (
      <div className={cardClass}>
        <div className="py-12 text-center text-[#718394]">
          <Video size={36} className="mx-auto mb-3 opacity-40 text-[#087F8C]" />
          <p className="font-bold text-[#172B3A]">ليس لديك صلاحية عرض مكتبة الفيديوهات الطبية.</p>
        </div>
      </div>
    );
  }

  const showForm = editingVideo ? canEdit || canUpload || canPublish || canManageFeatured : canCreate;
  const activePreviewThumb = thumbPreviewUrl || form.thumbnailUrl || '';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Preview Video Modal */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B1F35]/75 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-[#DFEAF0]">
            <div className="p-5 border-b border-[#DFEAF0] flex items-center justify-between bg-[#F5FAFC]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Film size={20} className="text-[#087F8C] shrink-0" />
                <h3 className="font-black text-[#172B3A] truncate">
                  معاينة:{' '}
                  {'titleAr' in previewVideo.video ? previewVideo.video.titleAr || 'فيديو طبي' : 'فيديو طبي'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="p-2 rounded-xl text-[#718394] hover:text-[#172B3A] hover:bg-white transition-colors cursor-pointer"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {previewVideo.loading ? (
                <div className="aspect-video rounded-2xl bg-[#0B1F35] flex items-center justify-center text-white">
                  <RefreshCw size={28} className="animate-spin text-[#25B8C7]" />
                </div>
              ) : previewVideo.error ? (
                <div className="aspect-video rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] flex flex-col items-center justify-center text-center p-6">
                  <AlertTriangle size={34} className="text-amber-500 mb-2" />
                  <p className="font-bold text-[#172B3A]">{previewVideo.error}</p>
                </div>
              ) : isEmbedVideoSource(previewVideo.video.videoSourceType) ? (
                <div className="aspect-video rounded-2xl overflow-hidden bg-black">
                  <iframe
                    src={previewVideo.resolvedUrl}
                    title={'titleAr' in previewVideo.video ? previewVideo.video.titleAr : 'معاينة الفيديو'}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-2xl overflow-hidden bg-black">
                  <video src={previewVideo.resolvedUrl} controls className="w-full h-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف الفيديو</h3>
            <div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right">
              <p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف الفيديو:</p>
              <p className="text-base font-black text-red-600">{deletingVideo.titleAr}</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDeleteVideo}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                <Trash size={17} /> {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingVideo(null)}
                disabled={deleting}
                className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Sub-tabs */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 flex items-center justify-center">
              <Video size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#172B3A]">مكتبة الفيديوهات الطبية</h2>
              <p className="text-xs font-bold text-[#718394] mt-0.5">
                إدارة الفيديوهات الطبية التثقيفية والأقسام وصلاحيات النشر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('videos')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                subTab === 'videos'
                  ? 'bg-[#087F8C] text-white shadow-sm'
                  : 'bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] hover:text-[#172B3A]'
              }`}
            >
              <Film size={15} />
              الفيديوهات (<span className="fv-num">{videos.length}</span>)
            </button>
            {canManageCategories && (
              <button
                type="button"
                onClick={() => setSubTab('categories')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  subTab === 'categories'
                    ? 'bg-[#087F8C] text-white shadow-sm'
                    : 'bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] hover:text-[#172B3A]'
                }`}
              >
                <Layers size={15} />
                الأقسام الطبية (<span className="fv-num">{categories.length}</span>)
              </button>
            )}
            <button
              type="button"
              onClick={() => void fetchLibrary()}
              disabled={loading}
              className="bg-[#F5FAFC] hover:bg-white text-[#172B3A] border border-[#DFEAF0] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-[#087F8C]' : 'text-[#087F8C]'} />
              تحديث
            </button>
          </div>
        </div>
      </div>

      {subTab === 'categories' && canManageCategories ? (
        <div className="space-y-6">
          {/* Category Form */}
          <div className={`${cardClass} ${editingCategory ? 'ring-2 ring-[#087F8C]' : ''}`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
                <FolderPlus size={20} className="text-[#087F8C]" />
                {editingCategory ? 'تعديل القسم الطبي' : 'إضافة قسم طبي جديد'}
              </h3>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCatForm(createEmptyCategoryForm());
                  }}
                  className="text-xs font-bold text-[#718394] hover:text-[#172B3A] flex items-center gap-1 cursor-pointer"
                >
                  <X size={15} /> إلغاء
                </button>
              )}
            </div>
            <form onSubmit={handleSaveCategory} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم القسم (عربي) *</label>
                <input
                  type="text"
                  value={catForm.nameAr}
                  onChange={(e) => setCatForm({ ...catForm, nameAr: e.target.value })}
                  className={inputClass}
                  placeholder="مثال: أمراض الشبكية"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم القسم (إنجليزي - اختياري)</label>
                <input
                  type="text"
                  value={catForm.nameEn || ''}
                  onChange={(e) => setCatForm({ ...catForm, nameEn: e.target.value })}
                  className={inputClass}
                  dir="ltr"
                  placeholder="Retina Diseases"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1.5 block">ترتيب العرض</label>
                <input
                  type="number"
                  value={catForm.displayOrder ?? 0}
                  onChange={(e) => setCatForm({ ...catForm, displayOrder: e.target.value })}
                  className={`${inputClass} fv-num`}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-[#172B3A]">
                  <input
                    type="checkbox"
                    checked={catForm.isActive}
                    onChange={(e) => setCatForm({ ...catForm, isActive: e.target.checked })}
                    className="w-4 h-4 accent-[#087F8C]"
                  />
                  مفعل
                </label>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="flex-1 fv-btn-primary py-3 px-4 rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <Save size={16} />
                  {savingCategory ? 'جاري الحفظ...' : editingCategory ? 'حفظ التعديل' : 'إضافة القسم'}
                </button>
              </div>
            </form>
          </div>

          {/* Categories Table */}
          <div className={cardClass}>
            <h3 className="text-lg font-black text-[#172B3A] mb-5">قائمة الأقسام الطبية</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-[#DFEAF0] text-xs text-[#718394]">
                    <th className="py-3 px-3 font-bold">الترتيب</th>
                    <th className="py-3 px-3 font-bold">اسم القسم (عربي)</th>
                    <th className="py-3 px-3 font-bold">الاسم الإنجليزي</th>
                    <th className="py-3 px-3 font-bold">الحالة</th>
                    <th className="py-3 px-3 font-bold">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]/70">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-[#F5FAFC]/70">
                      <td className="py-3 px-3 fv-num font-bold">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleCategoryMove(cat, -1)}
                            className="p-1 rounded hover:bg-white border border-[#DFEAF0] text-[#718394] cursor-pointer"
                            title="تقديم للأعلى"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <span className="w-6 text-center">{cat.displayOrder}</span>
                          <button
                            type="button"
                            onClick={() => void handleCategoryMove(cat, 1)}
                            className="p-1 rounded hover:bg-white border border-[#DFEAF0] text-[#718394] cursor-pointer"
                            title="تأخير للأسفل"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-black text-[#172B3A]">{cat.nameAr}</td>
                      <td className="py-3 px-3 text-xs text-[#718394] font-semibold" dir="ltr">
                        {cat.nameEn || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => void handleCategoryToggleActive(cat)}
                          className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                            cat.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {cat.isActive ? 'مفعل' : 'معطل'}
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(cat);
                            setCatForm({
                              nameAr: cat.nameAr,
                              nameEn: cat.nameEn,
                              isActive: cat.isActive,
                              displayOrder: cat.displayOrder,
                            });
                          }}
                          className="text-[#087F8C] hover:bg-[#087F8C]/10 p-2 rounded-lg transition-all cursor-pointer"
                          title="تعديل القسم"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Create / Edit Video Form */}
          {showForm && (
            <div className={`${cardClass} ${editingVideo ? 'ring-2 ring-[#087F8C]' : ''}`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
                  {editingVideo ? <Edit2 size={20} className="text-[#087F8C]" /> : <Plus size={20} className="text-[#087F8C]" />}
                  {editingVideo ? 'تعديل بيانات الفيديو الطبي' : 'إضافة فيديو طبي جديد'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleOpenPreview(form)}
                    className="bg-[#F5FAFC] border border-[#DFEAF0] hover:border-[#087F8C] text-[#087F8C] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play size={14} /> معاينة قبل النشر
                  </button>
                  {editingVideo && (
                    <button
                      type="button"
                      onClick={resetVideoForm}
                      className="text-xs font-bold text-[#718394] hover:text-[#172B3A] bg-[#F5FAFC] border border-[#DFEAF0] px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <X size={14} /> إلغاء التعديل
                    </button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveVideo} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">عنوان الفيديو (عربي) *</label>
                    <input
                      type="text"
                      value={form.titleAr}
                      onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
                      className={inputClass}
                      placeholder="مثال: نصائح ما بعد عملية الليزك"
                      disabled={editingVideo ? !canEdit : !canCreate}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">العنوان بالإنجليزية (اختياري)</label>
                    <input
                      type="text"
                      value={form.titleEn || ''}
                      onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
                      className={inputClass}
                      dir="ltr"
                      placeholder="Post-LASIK Recovery Tips"
                      disabled={editingVideo ? !canEdit : !canCreate}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">القسم الطبي</label>
                    <select
                      value={form.categoryId || ''}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className={inputClass}
                      disabled={editingVideo ? !canEdit : !canCreate}
                    >
                      <option value="">بدون قسم محدد</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nameAr}
                          {!cat.isActive ? ' (معطل)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">نوع مصدر الفيديو *</label>
                    <select
                      value={form.videoSourceType}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          videoSourceType: e.target.value as VideoSourceType,
                        })
                      }
                      className={inputClass}
                      disabled={editingVideo ? !canEdit : !canCreate}
                    >
                      <option value="youtube">YouTube (يوتيوب)</option>
                      <option value="vimeo">Vimeo (فيميو)</option>
                      <option value="facebook">Facebook (فيسبوك)</option>
                      <option value="instagram">Instagram (إنستجرام)</option>
                      <option value="x">X / Twitter (إكس)</option>
                      <option value="mp4">رابط MP4 مباشر</option>
                      <option value="upload">ملف فيديو مرفوع (Supabase Storage)</option>
                    </select>
                  </div>

                  {form.videoSourceType === 'upload' ? (
                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-[#718394] mb-1.5 block">
                        رفع ملف الفيديو (MP4, WebM, OGG - بحد أقصى 100 ميجابايت)
                      </label>
                      {canUpload ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="bg-[#F5FAFC] text-[#172B3A] px-4 py-2.5 rounded-xl font-bold text-xs cursor-pointer hover:bg-white flex items-center gap-2 border border-[#DFEAF0]">
                            <Upload size={16} className="text-[#087F8C]" />
                            <span>{pendingVideoFile ? pendingVideoFile.name : 'اختر ملف فيديو'}</span>
                            <input
                              type="file"
                              accept="video/mp4,video/webm,video/ogg"
                              onChange={handleVideoFileSelect}
                              className="hidden"
                            />
                          </label>
                          {form.storagePath && !pendingVideoFile && (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 fv-mono">
                              تم رفع الملف مسبقاً
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs font-bold text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                          ليس لديك صلاحية رفع ملفات الفيديو (medical_videos_upload).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-[#718394] mb-1.5 block">
                        رابط الفيديو ({SOURCE_LABELS[form.videoSourceType]}) *
                      </label>
                      <input
                        type="url"
                        value={form.videoUrl || ''}
                        onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                        className={`${inputClass} fv-mono`}
                        dir="ltr"
                        placeholder={
                          form.videoSourceType === 'youtube'
                            ? 'https://www.youtube.com/watch?v=...'
                            : form.videoSourceType === 'vimeo'
                            ? 'https://vimeo.com/...'
                            : form.videoSourceType === 'facebook'
                            ? 'https://www.facebook.com/.../videos/...'
                            : form.videoSourceType === 'instagram'
                            ? 'https://www.instagram.com/reel/...'
                            : form.videoSourceType === 'x'
                            ? 'https://x.com/.../status/...'
                            : 'https://.../video.mp4'
                        }
                        disabled={editingVideo ? !canEdit : !canCreate}
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">الطبيب المرتبط (اختياري)</label>
                    <select
                      value={form.doctorId || ''}
                      onChange={(e) => {
                        const docId = e.target.value;
                        const docInfo = doctorsById.get(docId);
                        setForm({
                          ...form,
                          doctorId: docId,
                          specialty: form.specialty || docInfo?.specialty || '',
                        });
                      }}
                      className={inputClass}
                      disabled={editingVideo ? !canEdit : !canCreate}
                    >
                      <option value="">بدون طبيب محدد</option>
                      {realtimeDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">التخصص الطبي (اختياري)</label>
                    <input
                      type="text"
                      value={form.specialty || ''}
                      onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                      className={inputClass}
                      placeholder="مثال: جراحة الشبكية"
                      disabled={editingVideo ? !canEdit : !canCreate}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1.5 block">تاريخ النشر</label>
                      <input
                        type="date"
                        value={form.publishedAt || todayStr}
                        onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
                        className={`${inputClass} fv-num`}
                        disabled={!canPublish}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1.5 block">ترتيب العرض</label>
                      <input
                        type="number"
                        value={form.displayOrder ?? 0}
                        onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                        className={`${inputClass} fv-num`}
                        disabled={editingVideo ? !canEdit : !canCreate}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">وصف الفيديو (عربي)</label>
                    <textarea
                      rows={3}
                      value={form.descriptionAr || ''}
                      onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
                      className={inputClass}
                      placeholder="شرح مختصر للموضوع الطبي المقدم في الفيديو..."
                      disabled={editingVideo ? !canEdit : !canCreate}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1.5 block">الوصف بالإنجليزية (اختياري)</label>
                    <textarea
                      rows={3}
                      value={form.descriptionEn || ''}
                      onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
                      className={inputClass}
                      dir="ltr"
                      placeholder="Brief English description..."
                      disabled={editingVideo ? !canEdit : !canCreate}
                    />
                  </div>
                </div>

                {/* Thumbnail Upload + Preview */}
                {canUpload && (
                  <div className="p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] flex flex-wrap items-center gap-4">
                    <div className="w-28 h-18 rounded-xl bg-white border border-[#DFEAF0] overflow-hidden flex items-center justify-center shrink-0">
                      {activePreviewThumb ? (
                        <img src={activePreviewThumb} alt="Cover" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={24} className="text-[#718394] opacity-50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-xs font-bold text-[#172B3A] mb-2">
                        الصورة المصغرة للفيديو (JPG, PNG, WebP - بحد أقصى 5 ميجابايت)
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="bg-white text-[#172B3A] px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer hover:border-[#087F8C] flex items-center gap-1.5 border border-[#DFEAF0]">
                          <Upload size={15} className="text-[#087F8C]" />
                          رفع صورة غلاف
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleThumbSelect}
                            className="hidden"
                          />
                        </label>
                        {form.videoSourceType === 'youtube' && form.videoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              const ytThumb = autoYouTubeThumbnailUrl(form.videoUrl);
                              if (ytThumb) {
                                setPendingThumbFile(null);
                                if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
                                setThumbPreviewUrl('');
                                setForm({ ...form, thumbnailUrl: ytThumb });
                                toast.success('تم جلب صورة غلاف يوتيوب تلقائياً.');
                              } else {
                                toast.error('أدخل رابط يوتيوب صحيح أولاً.');
                              }
                            }}
                            className="bg-white text-[#087F8C] px-3.5 py-2 rounded-xl font-bold text-xs border border-[#087F8C]/30 hover:bg-[#087F8C]/5 cursor-pointer"
                          >
                            جلب غلاف YouTube تلقائياً
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Visibility / Publish / Featured Checkboxes */}
                <div className="flex flex-wrap items-center gap-6 pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm text-[#172B3A]">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      disabled={editingVideo ? !canEdit : !canCreate}
                      className="w-4 h-4 accent-[#087F8C]"
                    />
                    نشط
                  </label>
                  <label
                    className={`flex items-center gap-2.5 font-bold text-sm ${
                      canPublish ? 'cursor-pointer text-[#172B3A]' : 'opacity-50 cursor-not-allowed text-[#718394]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.isPublished}
                      onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                      disabled={!canPublish}
                      className="w-4 h-4 accent-[#087F8C]"
                    />
                    منشور للزوار
                  </label>
                  <label
                    className={`flex items-center gap-2.5 font-bold text-sm ${
                      canManageFeatured
                        ? 'cursor-pointer text-[#172B3A]'
                        : 'opacity-50 cursor-not-allowed text-[#718394]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.isFeatured}
                      onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                      disabled={!canManageFeatured}
                      className="w-4 h-4 accent-amber-500"
                    />
                    فيديو مميز (Featured)
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingVideo}
                    className="fv-btn-primary px-8 py-3 rounded-xl font-black text-sm flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                  >
                    <Save size={17} />
                    {savingVideo ? 'جاري الحفظ...' : editingVideo ? 'حفظ التعديلات' : 'حفظ الفيديو'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Videos Table + Search & Filters */}
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-black text-[#172B3A]">
                قائمة الفيديوهات الطبية (<span className="fv-num">{filteredVideos.length}</span>)
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-60">
                  <Search size={16} className="absolute right-3 top-3 text-[#718394]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ابحث بالعنوان أو الطبيب..."
                    className={`${inputClass} pr-9 py-2 text-sm`}
                  />
                </div>
                <select
                  value={filterCategoryId}
                  onChange={(e) => setFilterCategoryId(e.target.value)}
                  className={`${inputClass} w-44 py-2 text-sm`}
                >
                  <option value="">كل الأقسام</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(
                      e.target.value as '' | 'published' | 'draft' | 'inactive' | 'featured',
                    )
                  }
                  className={`${inputClass} w-40 py-2 text-sm`}
                >
                  <option value="">كل الحالات</option>
                  <option value="published">منشور</option>
                  <option value="draft">مسودة / غير منشور</option>
                  <option value="featured">مميز</option>
                  <option value="inactive">معطل</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-[#718394]">
                <RefreshCw size={28} className="animate-spin mx-auto mb-2 text-[#087F8C]" />
                <p className="text-sm font-bold">جاري تحميل مكتبة الفيديوهات...</p>
              </div>
            ) : loadError ? (
              <div className="py-10 text-center text-red-600 font-bold">{loadError}</div>
            ) : filteredVideos.length === 0 ? (
              <div className="py-14 text-center text-[#718394]">
                <Video size={40} className="mx-auto mb-3 opacity-35 text-[#087F8C]" />
                <p className="font-bold text-[#172B3A]">لا توجد فيديوهات مطابقة للبحث الحالي</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-[#DFEAF0] text-xs text-[#718394]">
                      <th className="py-3 px-3 font-bold">الفيديو</th>
                      <th className="py-3 px-3 font-bold">القسم</th>
                      <th className="py-3 px-3 font-bold">المصدر</th>
                      <th className="py-3 px-3 font-bold">النشر والتفعيل</th>
                      <th className="py-3 px-3 font-bold">مميز</th>
                      <th className="py-3 px-3 font-bold">الترتيب</th>
                      <th className="py-3 px-3 font-bold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFEAF0]/70">
                    {filteredVideos.map((video) => (
                      <tr key={video.id} className="hover:bg-[#F5FAFC]/70">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3 min-w-[230px]">
                            <button
                              type="button"
                              onClick={() => void handleOpenPreview(video)}
                              className="relative w-20 h-14 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] overflow-hidden shrink-0 group cursor-pointer"
                              title="معاينة وتشغيل"
                            >
                              {video.thumbnailUrl ? (
                                <img
                                  src={video.thumbnailUrl}
                                  alt={video.titleAr}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#087F8C]">
                                  <Film size={20} />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-[#0B1F35]/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                <Play size={16} />
                              </div>
                            </button>
                            <div className="min-w-0">
                              <p className="font-black text-[#172B3A] line-clamp-1">{video.titleAr}</p>
                              {(video.doctorName || video.specialty) && (
                                <p className="text-[11px] font-bold text-[#718394] flex items-center gap-1 mt-0.5">
                                  <Stethoscope size={12} className="text-[#087F8C]" />
                                  <span>{video.doctorName || video.specialty}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-xs font-bold text-[#172B3A]">
                          {video.categoryNameAr || '—'}
                        </td>
                        <td className="py-3.5 px-3 text-xs font-bold text-[#718394]">
                          {SOURCE_LABELS[video.videoSourceType]}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex flex-col gap-1.5 items-start">
                            <button
                              type="button"
                              disabled={!canPublish}
                              onClick={() =>
                                void handleQuickToggle(video, 'is_published', !video.isPublished)
                              }
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                                video.isPublished
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              } ${canPublish ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                            >
                              {video.isPublished ? <CheckCircle size={11} /> : <EyeOff size={11} />}
                              {video.isPublished ? 'منشور' : 'غير منشور'}
                            </button>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => void handleQuickToggle(video, 'is_active', !video.isActive)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                video.isActive
                                  ? 'bg-[#087F8C]/10 text-[#087F8C]'
                                  : 'bg-red-50 text-red-600'
                              } ${canEdit ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                            >
                              {video.isActive ? <Eye size={10} /> : <EyeOff size={10} />}
                              {video.isActive ? 'نشط' : 'معطل'}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <button
                            type="button"
                            disabled={!canManageFeatured}
                            onClick={() =>
                              void handleQuickToggle(video, 'is_featured', !video.isFeatured)
                            }
                            className={`p-2 rounded-xl border transition-all ${
                              video.isFeatured
                                ? 'bg-amber-50 text-amber-500 border-amber-200'
                                : 'bg-white text-slate-300 border-[#DFEAF0]'
                            } ${canManageFeatured ? 'cursor-pointer hover:scale-105' : 'opacity-60 cursor-not-allowed'}`}
                            title={video.isFeatured ? 'إزالة من المميزة' : 'تمييز الفيديو'}
                          >
                            <Star size={16} fill={video.isFeatured ? 'currentColor' : 'none'} />
                          </button>
                        </td>
                        <td className="py-3.5 px-3 fv-num">
                          <input
                            type="number"
                            value={video.displayOrder}
                            disabled={!canEdit}
                            onChange={(e) => void handleOrderChange(video, Number(e.target.value) || 0)}
                            className="w-16 bg-white border border-[#DFEAF0] rounded-lg px-2 py-1 text-xs font-bold text-center"
                          />
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleOpenPreview(video)}
                              className="text-[#1769AA] hover:bg-[#1769AA]/10 p-2 rounded-lg transition-all cursor-pointer"
                              title="معاينة الفيديو"
                            >
                              <Play size={15} />
                            </button>
                            {(canEdit || canUpload || canPublish || canManageFeatured) && (
                              <button
                                type="button"
                                onClick={() => handleEditVideoClick(video)}
                                className="text-[#087F8C] hover:bg-[#087F8C]/10 p-2 rounded-lg transition-all cursor-pointer"
                                title="تعديل"
                              >
                                <Edit2 size={15} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeletingVideo(video)}
                                className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
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
    </div>
  );
};
