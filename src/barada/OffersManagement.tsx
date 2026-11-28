import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Edit2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Tag,
  Trash,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { withMinSpin } from '@/lib/refreshSpin';
import { cairoTodayStr } from './dateUtils';
import { invokeBackend } from '@/lib/backend';
import {
  calculateDiscountPercentage,
  clearFallbackOffers,
  getOfferLifecycleStatus,
  hasOfferPermission,
  isMissingOffersTableError,
  mapOfferRow,
  notifyOffersChanged,
  OfferFormInput,
  OfferRecord,
  readFallbackOffers,
  removeOfferImageByUrl,
  uploadOfferImage,
  validateOfferImageFile,
  validateOfferInput,
  writeFallbackOffers,
} from './offers';

import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

interface OffersManagementProps {
  currentUser: { role: 'admin' | 'staff'; permissions: string[] };
  realtimeDoctors: Array<{ id: string; name: string; specialty?: string }>;
  realtimeOffers: Array<Record<string, unknown>>;
  realtimeLoaded?: boolean;
  cardClass: string;
  inputClass: string;
  onOffersChanged?: () => void;
}

const createEmptyForm = (todayStr: string): OfferFormInput => ({
  title: '',
  doctorId: '',
  description: '',
  offerPrice: '',
  originalPrice: '',
  discountPercentage: '',
  imageUrl: '',
  startDate: todayStr,
  endDate: todayStr,
  isActive: true,
  showOnHomepage: true,
  displayOrder: 0,
  buttonText: 'احجز الآن',
});

export const OffersManagement: React.FC<OffersManagementProps> = ({
  currentUser,
  realtimeDoctors,
  realtimeOffers,
  realtimeLoaded = false,
  cardClass,
  inputClass,
  onOffersChanged,
}) => {
  const todayStr = cairoTodayStr();

  const canView = hasOfferPermission(currentUser, 'view_offers');
  const canCreate = hasOfferPermission(currentUser, 'create_offers');
  const canEdit = hasOfferPermission(currentUser, 'edit_offers');
  const canDelete = hasOfferPermission(currentUser, 'delete_offers');
  const canManageVisibility = hasOfferPermission(currentUser, 'manage_offer_visibility');
  const canUploadImages = hasOfferPermission(currentUser, 'upload_offer_images');

  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usingFallbackStore, setUsingFallbackStore] = useState<boolean>(false);
  const schemaSyncAttemptedRef = useRef<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [editingOffer, setEditingOffer] = useState<OfferRecord | null>(null);
  const [deletingOffer, setDeletingOffer] = useState<OfferRecord | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [form, setForm] = useState<OfferFormInput>(() => createEmptyForm(todayStr));
  const [discountManuallyEdited, setDiscountManuallyEdited] = useState<boolean>(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string>('');

  // Quick row-level image replacement (for staff with upload_offer_images without edit_offers)
  const quickImageInputRef = useRef<HTMLInputElement>(null);
  const [quickImageTarget, setQuickImageTarget] = useState<OfferRecord | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDoctorId, setFilterDoctorId] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'inactive' | 'expired' | 'upcoming'>('');
  const [filterVisibility, setFilterVisibility] = useState<'' | 'visible' | 'hidden'>('');

  const doctorsByUuid = useMemo(() => {
    const map = new Map<string, { name?: string; specialty?: string }>();
    for (const d of realtimeDoctors) {
      map.set(d.id, { name: d.name, specialty: d.specialty });
    }
    return map;
  }, [realtimeDoctors]);

  const syncFallbackRows = useCallback(
    (rows: Array<Record<string, unknown>>) => {
      writeFallbackOffers(rows);
      notifyOffersChanged();
      setOffers(rows.map((row) => mapOfferRow(row, doctorsByUuid)));
      onOffersChanged?.();
    },
    [doctorsByUuid, onOffersChanged],
  );

  const activateFallbackOffers = useCallback(() => {
    setUsingFallbackStore(true);
    setLoadError(null);
    const localRows = readFallbackOffers();
    setOffers(localRows.map((row) => mapOfferRow(row, doctorsByUuid)));
  }, [doctorsByUuid]);

  const fetchOffers = useCallback(async () => {
    if (!canView) {
      setOffers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      let queryResult = await supabase
        .from('offers')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (queryResult.error && isMissingOffersTableError(queryResult.error)) {
        if (!schemaSyncAttemptedRef.current) {
          schemaSyncAttemptedRef.current = true;
          const { data: migrationResult } = await invokeBackend('ensure-offers-schema');
          if (migrationResult?.migrated) {
            queryResult = await supabase
              .from('offers')
              .select('*')
              .order('display_order', { ascending: true })
              .order('created_at', { ascending: false });
          }
        }
      }

      if (queryResult.error) {
        if (isMissingOffersTableError(queryResult.error)) {
          activateFallbackOffers();
          return;
        }
        throw queryResult.error;
      }

      setUsingFallbackStore(false);
      let rows = (queryResult.data || []) as unknown as Array<Record<string, unknown>>;

      if (rows.length === 0 && canCreate) {
        const pendingLocal = readFallbackOffers().filter((row) => {
          const docId = String(row.doctor_id ?? '');
          return docId && doctorsByUuid.has(docId);
        });
        if (pendingLocal.length > 0) {
          const toInsert = pendingLocal.map((row) => ({
            title: String(row.title ?? ''),
            doctor_id: String(row.doctor_id ?? ''),
            description: (row.description as string | null) ?? null,
            offer_price: Number(row.offer_price ?? 0),
            original_price: row.original_price !== null && row.original_price !== undefined ? Number(row.original_price) : null,
            discount_percentage:
              row.discount_percentage !== null && row.discount_percentage !== undefined
                ? Number(row.discount_percentage)
                : null,
            image_url: (row.image_url as string | null) ?? null,
            start_date: String(row.start_date ?? ''),
            end_date: String(row.end_date ?? ''),
            is_active: canManageVisibility ? Boolean(row.is_active) : false,
            show_on_homepage: canManageVisibility ? Boolean(row.show_on_homepage) : false,
            display_order: canManageVisibility ? Number(row.display_order ?? 0) : 0,
            button_text: String(row.button_text ?? 'احجز الآن') || 'احجز الآن',
          }));
          const { data: insertedRows, error: insertErr } = await supabase
            .from('offers')
            .insert(toInsert as TablesInsert<'offers'>[])
            .select('*');
          if (!insertErr && Array.isArray(insertedRows)) {
            clearFallbackOffers();
            notifyOffersChanged();
            rows = insertedRows as unknown as Array<Record<string, unknown>>;
          }
        }
      }

      const mapped = rows.map((row) => mapOfferRow(row, doctorsByUuid));
      setOffers(mapped);
    } catch (err: unknown) {
      if (isMissingOffersTableError(err)) {
        activateFallbackOffers();
        return;
      }
      console.error('Error loading offers:', err);
      setLoadError('تعذر تحميل قائمة العروض. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [canView, canCreate, canManageVisibility, doctorsByUuid, activateFallbackOffers]);

  useEffect(() => {
    void fetchOffers();
  }, [fetchOffers]);

  const handleRefreshOffers = useCallback(async () => {
    setRefreshing(true);
    try {
      await withMinSpin(() => Promise.all([fetchOffers(), Promise.resolve(onOffersChanged?.())]));
    } finally {
      setRefreshing(false);
    }
  }, [fetchOffers, onOffersChanged]);

  // Keep list in sync when realtime offers arrive
  useEffect(() => {
    if (!canView || usingFallbackStore || !Array.isArray(realtimeOffers)) return;
    if (realtimeLoaded || realtimeOffers.length > 0) {
      setOffers(realtimeOffers.map((row) => mapOfferRow(row as Record<string, unknown>, doctorsByUuid)));
    }
  }, [canView, usingFallbackStore, realtimeOffers, realtimeLoaded, doctorsByUuid]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [previewObjectUrl]);

  const resetForm = () => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setPreviewObjectUrl('');
    setPendingFile(null);
    setEditingOffer(null);
    setDiscountManuallyEdited(false);
    setForm(createEmptyForm(cairoTodayStr()));
  };

  const handlePriceChange = (field: 'offerPrice' | 'originalPrice', value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (!discountManuallyEdited) {
        const auto = calculateDiscountPercentage(
          field === 'offerPrice' ? value : prev.offerPrice,
          field === 'originalPrice' ? value : prev.originalPrice,
        );
        next.discountPercentage = auto !== null ? String(auto) : '';
      }
      return next;
    });
  };

  const handleSelectImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!canUploadImages) {
      toast.error('ليست لديك صلاحية رفع أو تغيير صور العروض.');
      return;
    }
    const fileErr = validateOfferImageFile(file);
    if (fileErr) {
      toast.error(fileErr);
      return;
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    const localPreview = URL.createObjectURL(file);
    setPendingFile(file);
    setPreviewObjectUrl(localPreview);
  };

  const handleRemoveSelectedImage = () => {
    if (!canUploadImages) return;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setPreviewObjectUrl('');
    setPendingFile(null);
    setForm((prev) => ({ ...prev, imageUrl: '' }));
  };

  const handleStartEdit = (offer: OfferRecord) => {
    if (!canEdit) {
      toast.error('ليست لديك صلاحية تعديل العروض.');
      return;
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setPreviewObjectUrl('');
    setPendingFile(null);
    setEditingOffer(offer);
    setDiscountManuallyEdited(false);
    setForm({
      title: offer.title,
      doctorId: offer.doctorId,
      description: offer.description,
      offerPrice: String(offer.offerPrice),
      originalPrice: offer.originalPrice !== null ? String(offer.originalPrice) : '',
      discountPercentage: offer.discountPercentage !== null ? String(offer.discountPercentage) : '',
      imageUrl: offer.imageUrl,
      startDate: offer.startDate,
      endDate: offer.endDate,
      isActive: offer.isActive,
      showOnHomepage: offer.showOnHomepage,
      displayOrder: offer.displayOrder,
      buttonText: offer.buttonText || 'احجز الآن',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOffer && !canEdit) {
      toast.error('ليست لديك صلاحية تعديل العروض.');
      return;
    }
    if (!editingOffer && !canCreate) {
      toast.error('ليست لديك صلاحية إضافة العروض.');
      return;
    }

    const validation = validateOfferInput(form);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setSaving(true);
    let uploadedNewUrl: string | null = null;
    try {
      let nextImageUrl = (form.imageUrl || '').trim();
      const previousImageUrl = editingOffer?.imageUrl || '';

      if (pendingFile) {
        if (!canUploadImages) {
          toast.error('ليست لديك صلاحية رفع أو تغيير صور العروض.');
          setSaving(false);
          return;
        }
        setUploadingImage(true);
        const uploadRes = await uploadOfferImage(pendingFile);
        setUploadingImage(false);
        if (uploadRes.error || !uploadRes.url) {
          toast.error(uploadRes.error || 'تعذر رفع صورة العرض.');
          setSaving(false);
          return;
        }
        uploadedNewUrl = uploadRes.url;
        nextImageUrl = uploadRes.url;
      }

      const offerPriceNum = Number(form.offerPrice);
      const originalPriceNum =
        form.originalPrice === '' || form.originalPrice === null || form.originalPrice === undefined
          ? null
          : Number(form.originalPrice);
      const computedDiscount =
        form.discountPercentage !== '' && form.discountPercentage !== null && form.discountPercentage !== undefined
          ? Math.round(Number(form.discountPercentage))
          : calculateDiscountPercentage(offerPriceNum, originalPriceNum);

      const basePayload: Record<string, unknown> = {
        title: form.title.trim(),
        doctor_id: form.doctorId,
        description: (form.description || '').trim() || null,
        offer_price: offerPriceNum,
        original_price: originalPriceNum,
        discount_percentage: computedDiscount,
        start_date: form.startDate,
        end_date: form.endDate,
        button_text: (form.buttonText || '').trim() || 'احجز الآن',
      };

      if (canUploadImages) {
        basePayload.image_url = nextImageUrl || null;
      }

      if (canManageVisibility) {
        basePayload.is_active = Boolean(form.isActive);
        basePayload.show_on_homepage = Boolean(form.showOnHomepage);
        basePayload.display_order = Math.max(0, Math.round(Number(form.displayOrder) || 0));
      } else if (!editingOffer) {
        // Without manage_offer_visibility, newly created offers stay hidden/inactive until approved
        basePayload.is_active = false;
        basePayload.show_on_homepage = false;
        basePayload.display_order = 0;
      }

      const saveToFallback = () => {
        const nowIso = new Date().toISOString();
        const current = readFallbackOffers();
        if (editingOffer) {
          const next = current.map((row) =>
            String(row.id) === editingOffer.id ? { ...row, ...basePayload, updated_at: nowIso } : row,
          );
          syncFallbackRows(next);
          toast.success('تم تحديث العرض بنجاح.');
        } else {
          const newRow: Record<string, unknown> = {
            id: crypto.randomUUID(),
            image_url: null,
            is_active: false,
            show_on_homepage: false,
            display_order: 0,
            ...basePayload,
            created_at: nowIso,
            updated_at: nowIso,
            created_by: null,
          };
          syncFallbackRows([...current, newRow]);
          toast.success('تم إضافة العرض بنجاح.');
        }
        resetForm();
      };

      if (usingFallbackStore) {
        saveToFallback();
        return;
      }

      if (editingOffer) {
        const { error } = await supabase
          .from('offers')
          .update(basePayload as TablesUpdate<'offers'>)
          .eq('id', editingOffer.id);
        if (error) {
          if (isMissingOffersTableError(error)) {
            setUsingFallbackStore(true);
            saveToFallback();
            return;
          }
          throw error;
        }

        if (canUploadImages && previousImageUrl && previousImageUrl !== nextImageUrl) {
          await removeOfferImageByUrl(previousImageUrl);
        }
        toast.success('تم تحديث العرض بنجاح.');
      } else {
        const { error } = await supabase.from('offers').insert(basePayload as TablesInsert<'offers'>);
        if (error) {
          if (isMissingOffersTableError(error)) {
            setUsingFallbackStore(true);
            saveToFallback();
            return;
          }
          throw error;
        }
        toast.success('تم إضافة العرض بنجاح.');
      }

      resetForm();
      await fetchOffers();
      onOffersChanged?.();
    } catch (err: unknown) {
      if (uploadedNewUrl) {
        await removeOfferImageByUrl(uploadedNewUrl);
      }
      console.error('Error saving offer:', err);
      const errObj = err as { code?: string; message?: string };
      const denied = errObj?.code === '42501' || /permission|row-level security/i.test(errObj?.message || '');
      toast.error(denied ? 'ليست لديك الصلاحية اللازمة لتنفيذ هذا الإجراء.' : 'حدث خطأ أثناء حفظ العرض. حاول مرة أخرى.');
    } finally {
      setUploadingImage(false);
      setSaving(false);
    }
  };

  const handleToggleActive = async (offer: OfferRecord) => {
    if (!canManageVisibility) {
      toast.error('ليست لديك صلاحية التحكم في ظهور العروض.');
      return;
    }
    const nextVal = !offer.isActive;
    const applyFallbackToggle = () => {
      const next = readFallbackOffers().map((row) =>
        String(row.id) === offer.id ? { ...row, is_active: nextVal, updated_at: new Date().toISOString() } : row,
      );
      syncFallbackRows(next);
      toast.success(nextVal ? 'تم تفعيل العرض.' : 'تم إيقاف العرض.');
    };
    if (usingFallbackStore) {
      applyFallbackToggle();
      return;
    }
    try {
      const { error } = await supabase
        .from('offers')
        .update({ is_active: nextVal })
        .eq('id', offer.id);
      if (error) {
        if (isMissingOffersTableError(error)) {
          setUsingFallbackStore(true);
          applyFallbackToggle();
          return;
        }
        throw error;
      }
      setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, isActive: nextVal } : o)));
      toast.success(nextVal ? 'تم تفعيل العرض.' : 'تم إيقاف العرض.');
      onOffersChanged?.();
    } catch (err: unknown) {
      console.error('Error toggling offer status:', err);
      toast.error('تعذر تحديث حالة العرض.');
    }
  };

  const handleToggleHomepage = async (offer: OfferRecord) => {
    if (!canManageVisibility) {
      toast.error('ليست لديك صلاحية التحكم في ظهور العروض.');
      return;
    }
    const nextVal = !offer.showOnHomepage;
    const applyFallbackToggle = () => {
      const next = readFallbackOffers().map((row) =>
        String(row.id) === offer.id ? { ...row, show_on_homepage: nextVal, updated_at: new Date().toISOString() } : row,
      );
      syncFallbackRows(next);
      toast.success(nextVal ? 'تم إظهار العرض في الصفحة الرئيسية.' : 'تم إخفاء العرض من الصفحة الرئيسية.');
    };
    if (usingFallbackStore) {
      applyFallbackToggle();
      return;
    }
    try {
      const { error } = await supabase
        .from('offers')
        .update({ show_on_homepage: nextVal })
        .eq('id', offer.id);
      if (error) {
        if (isMissingOffersTableError(error)) {
          setUsingFallbackStore(true);
          applyFallbackToggle();
          return;
        }
        throw error;
      }
      setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, showOnHomepage: nextVal } : o)));
      toast.success(nextVal ? 'تم إظهار العرض في الصفحة الرئيسية.' : 'تم إخفاء العرض من الصفحة الرئيسية.');
      onOffersChanged?.();
    } catch (err: unknown) {
      console.error('Error toggling homepage visibility:', err);
      toast.error('تعذر تحديث ظهور العرض في الصفحة الرئيسية.');
    }
  };

  const handleUpdateDisplayOrder = async (offer: OfferRecord, newOrder: number) => {
    if (!canManageVisibility) {
      toast.error('ليست لديك صلاحية التحكم في ترتيب العروض.');
      return;
    }
    const normalized = Math.max(0, Math.round(Number(newOrder) || 0));
    if (normalized === offer.displayOrder) return;
    const applyFallbackOrder = () => {
      const next = readFallbackOffers()
        .map((row) =>
          String(row.id) === offer.id ? { ...row, display_order: normalized, updated_at: new Date().toISOString() } : row,
        )
        .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
      syncFallbackRows(next);
      toast.success('تم تحديث ترتيب العرض.');
    };
    if (usingFallbackStore) {
      applyFallbackOrder();
      return;
    }
    try {
      const { error } = await supabase
        .from('offers')
        .update({ display_order: normalized })
        .eq('id', offer.id);
      if (error) {
        if (isMissingOffersTableError(error)) {
          setUsingFallbackStore(true);
          applyFallbackOrder();
          return;
        }
        throw error;
      }
      setOffers((prev) =>
        prev
          .map((o) => (o.id === offer.id ? { ...o, displayOrder: normalized } : o))
          .sort((a, b) => a.displayOrder - b.displayOrder),
      );
      toast.success('تم تحديث ترتيب العرض.');
      onOffersChanged?.();
    } catch (err: unknown) {
      console.error('Error updating display order:', err);
      toast.error('تعذر تحديث ترتيب العرض.');
    }
  };

  const handleQuickImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = quickImageTarget;
    e.target.value = '';
    setQuickImageTarget(null);
    if (!file || !target) return;
    if (!canUploadImages) {
      toast.error('ليست لديك صلاحية رفع أو تغيير صور العروض.');
      return;
    }

    const fileErr = validateOfferImageFile(file);
    if (fileErr) {
      toast.error(fileErr);
      return;
    }

    setUploadingImage(true);
    let uploadedUrl: string | undefined;
    try {
      const res = await uploadOfferImage(file);
      if (res.error || !res.url) {
        toast.error(res.error || 'تعذر رفع الصورة.');
        return;
      }
      uploadedUrl = res.url;

      const applyFallbackImage = () => {
        const next = readFallbackOffers().map((row) =>
          String(row.id) === target.id ? { ...row, image_url: res.url, updated_at: new Date().toISOString() } : row,
        );
        syncFallbackRows(next);
        toast.success('تم تحديث صورة العرض بنجاح.');
      };

      if (usingFallbackStore) {
        applyFallbackImage();
        return;
      }

      const { error } = await supabase
        .from('offers')
        .update({ image_url: res.url })
        .eq('id', target.id);
      if (error) {
        if (isMissingOffersTableError(error)) {
          setUsingFallbackStore(true);
          applyFallbackImage();
          return;
        }
        throw error;
      }

      if (target.imageUrl) {
        await removeOfferImageByUrl(target.imageUrl);
      }
      setOffers((prev) => prev.map((o) => (o.id === target.id ? { ...o, imageUrl: res.url || '' } : o)));
      toast.success('تم تحديث صورة العرض بنجاح.');
      onOffersChanged?.();
    } catch (err: unknown) {
      if (uploadedUrl) await removeOfferImageByUrl(uploadedUrl);
      console.error('Error updating offer image:', err);
      toast.error('تعذر تحديث صورة العرض.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingOffer || !canDelete) return;
    setDeleting(true);
    const applyFallbackDelete = () => {
      const next = readFallbackOffers().filter((row) => String(row.id) !== deletingOffer.id);
      syncFallbackRows(next);
      if (editingOffer?.id === deletingOffer.id) resetForm();
      setDeletingOffer(null);
      toast.success('تم حذف العرض بنجاح.');
    };
    if (usingFallbackStore) {
      applyFallbackDelete();
      setDeleting(false);
      return;
    }
    try {
      const { error } = await supabase.from('offers').delete().eq('id', deletingOffer.id);
      if (error) {
        if (isMissingOffersTableError(error)) {
          setUsingFallbackStore(true);
          applyFallbackDelete();
          return;
        }
        throw error;
      }
      if (deletingOffer.imageUrl) {
        await removeOfferImageByUrl(deletingOffer.imageUrl);
      }
      setOffers((prev) => prev.filter((o) => o.id !== deletingOffer.id));
      if (editingOffer?.id === deletingOffer.id) resetForm();
      setDeletingOffer(null);
      toast.success('تم حذف العرض بنجاح.');
      onOffersChanged?.();
    } catch (err: unknown) {
      console.error('Error deleting offer:', err);
      toast.error('تعذر حذف العرض. تأكد من صلاحياتك وحاول مرة أخرى.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredOffers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return offers.filter((o) => {
      if (q) {
        const matchText =
          o.title.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q) ||
          (o.doctorName || '').toLowerCase().includes(q);
        if (!matchText) return false;
      }
      if (filterDoctorId && o.doctorId !== filterDoctorId) return false;
      if (filterStatus) {
        const lifecycle = getOfferLifecycleStatus(o, todayStr);
        if (lifecycle !== filterStatus) return false;
      }
      if (filterVisibility === 'visible' && !o.showOnHomepage) return false;
      if (filterVisibility === 'hidden' && o.showOnHomepage) return false;
      return true;
    });
  }, [offers, searchTerm, filterDoctorId, filterStatus, filterVisibility, todayStr]);

  const showForm = (editingOffer !== null && canEdit) || (editingOffer === null && canCreate);
  const currentPreviewUrl = previewObjectUrl || form.imageUrl || '';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Delete confirmation modal */}
      {deletingOffer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-[#DFEAF0]">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-black text-[#172B3A] mb-3">تأكيد حذف العرض</h3>
            <div className="bg-[#F5FAFC] p-5 rounded-2xl mb-6 border border-[#DFEAF0] text-right">
              <p className="text-xs text-[#718394] font-bold mb-1.5">هل أنت متأكد من رغبتك في حذف هذا العرض؟</p>
              <p className="text-base font-black text-red-600">{deletingOffer.title}</p>
              {deletingOffer.doctorName && (
                <p className="text-xs text-[#718394] mt-1 font-bold">الطبيب: {deletingOffer.doctorName}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Trash size={17} /> {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingOffer(null)}
                disabled={deleting}
                className="flex-1 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] font-black py-3.5 rounded-xl hover:bg-white transition-all cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden quick image upload input */}
      <input
        ref={quickImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleQuickImageChange}
        className="hidden"
      />

      {/* Create / Edit Offer Form */}
      {showForm && (
        <form onSubmit={handleSaveOffer} className={`${cardClass} ${editingOffer ? 'ring-2 ring-[#087F8C]' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
              {editingOffer ? <Edit2 size={20} className="text-[#087F8C]" /> : <Plus size={20} className="text-[#087F8C]" />}
              {editingOffer ? 'تعديل بيانات العرض' : 'إضافة عرض جديد'}
            </h3>
            {editingOffer && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-bold text-[#718394] hover:text-[#172B3A] bg-[#F5FAFC] border border-[#DFEAF0] px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <X size={15} /> إلغاء التعديل
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">عنوان العرض *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputClass}
                placeholder="مثال: عرض الفحص الشامل والليزك"
                maxLength={200}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">الطبيب المرتبط *</label>
              <select
                value={form.doctorId}
                onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                className={inputClass}
              >
                <option value="">-- اختر الطبيب --</option>
                {realtimeDoctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} {doc.specialty ? `- ${doc.specialty}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">نص زر الحجز (اختياري)</label>
              <input
                type="text"
                value={form.buttonText || ''}
                onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                className={inputClass}
                placeholder="احجز الآن"
                maxLength={60}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">سعر العرض (ج.م) *</label>
              <input
                type="number"
                min="1"
                step="any"
                value={form.offerPrice}
                onChange={(e) => handlePriceChange('offerPrice', e.target.value)}
                className={`${inputClass} fv-num`}
                placeholder="مثال: 500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">السعر الأصلي قبل الخصم (اختياري)</label>
              <input
                type="number"
                min="1"
                step="any"
                value={form.originalPrice ?? ''}
                onChange={(e) => handlePriceChange('originalPrice', e.target.value)}
                className={`${inputClass} fv-num`}
                placeholder="مثال: 800"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">نسبة الخصم % (تحسب تلقائياً)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.discountPercentage ?? ''}
                onChange={(e) => {
                  setDiscountManuallyEdited(e.target.value !== '');
                  setForm({ ...form, discountPercentage: e.target.value });
                }}
                className={`${inputClass} fv-num`}
                placeholder="تحسب تلقائياً"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">تاريخ بداية العرض *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={`${inputClass} fv-num`}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">تاريخ انتهاء العرض *</label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={`${inputClass} fv-num`}
              />
            </div>

            {canManageVisibility && (
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1.5 block">ترتيب العرض (اختياري)</label>
                <input
                  type="number"
                  min="0"
                  value={form.displayOrder ?? 0}
                  onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                  className={`${inputClass} fv-num`}
                />
              </div>
            )}

            <div className="md:col-span-2 lg:col-span-3">
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">وصف العرض</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={`${inputClass} resize-none`}
                placeholder="تفاصيل العرض الطبي والمزايا المشمولة..."
              />
            </div>

            {/* Image Upload Section */}
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-[#718394] mb-1.5 block">صورة العرض</label>
              {canUploadImages ? (
                <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0]">
                  <div className="w-24 h-20 rounded-xl bg-white border border-[#DFEAF0] overflow-hidden flex items-center justify-center shrink-0">
                    {currentPreviewUrl ? (
                      <img src={currentPreviewUrl} alt="معاينة صورة العرض" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={24} className="text-[#718394]/60" />
                    )}
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <label className="bg-white text-[#172B3A] px-4 py-2 rounded-xl font-bold text-xs cursor-pointer hover:border-[#087F8C] border border-[#DFEAF0] flex items-center gap-2 transition-colors">
                        <Upload size={15} className="text-[#087F8C]" />
                        <span>{currentPreviewUrl ? 'تغيير الصورة' : 'رفع صورة العرض'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleSelectImageFile}
                          className="hidden"
                        />
                      </label>
                      {currentPreviewUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveSelectedImage}
                          className="bg-red-50 text-red-600 px-3 py-2 rounded-xl font-bold text-xs border border-red-200 hover:bg-red-100 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={14} /> إزالة
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#718394] font-medium">
                      الصيغ المدعومة: JPG, PNG, WebP (بحد أقصى 5 ميجابايت)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] text-xs font-bold text-[#718394]">
                  ليست لديك صلاحية رفع أو تغيير صور العروض.
                </div>
              )}
            </div>

            {/* Visibility toggles */}
            {canManageVisibility && (
              <div className="space-y-3 flex flex-col justify-center">
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] cursor-pointer hover:border-[#087F8C] transition-colors">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                  />
                  <span className="text-sm font-bold text-[#172B3A]">العرض نشط (Active)</span>
                </label>
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] cursor-pointer hover:border-[#087F8C] transition-colors">
                  <input
                    type="checkbox"
                    checked={form.showOnHomepage}
                    onChange={(e) => setForm({ ...form, showOnHomepage: e.target.checked })}
                    className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                  />
                  <span className="text-sm font-bold text-[#172B3A]">إظهار في الصفحة الرئيسية</span>
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 mt-7">
            <button
              type="submit"
              disabled={saving || uploadingImage}
              className="fv-btn-primary px-8 py-3.5 rounded-xl font-black flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {editingOffer ? <Save size={18} /> : <Plus size={18} />}
              <span>
                {uploadingImage
                  ? 'جاري رفع الصورة...'
                  : saving
                  ? 'جاري الحفظ...'
                  : editingOffer
                  ? 'حفظ التعديلات'
                  : 'إضافة العرض'}
              </span>
            </button>
            {editingOffer && (
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] px-6 py-3.5 rounded-xl font-bold hover:bg-white cursor-pointer"
              >
                إلغاء
              </button>
            )}
          </div>
        </form>
      )}

      {/* Offers List Table */}
      {canView ? (
        <div className={cardClass}>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div className="flex items-center gap-2.5">
              <Tag className="text-[#087F8C]" size={22} />
              <h3 className="text-lg font-black text-[#172B3A]">
                قائمة العروض (<span className="fv-num">{filteredOffers.length}</span>)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshOffers()}
              disabled={loading || refreshing}
              className="bg-[#F5FAFC] border border-[#DFEAF0] hover:border-[#087F8C] text-[#172B3A] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={15} className={loading || refreshing ? 'animate-spin text-[#087F8C]' : 'text-[#087F8C]'} />
              تحديث القائمة
            </button>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="relative">
              <Search className="absolute right-3 top-3 text-[#718394]" size={17} />
              <input
                type="text"
                placeholder="بحث بعنوان العرض أو الطبيب..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputClass} pr-10 py-2.5 text-sm`}
              />
            </div>

            <select
              value={filterDoctorId}
              onChange={(e) => setFilterDoctorId(e.target.value)}
              className={`${inputClass} py-2.5 text-sm`}
            >
              <option value="">كل الأطباء</option>
              {realtimeDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as '' | 'active' | 'inactive' | 'expired' | 'upcoming')}
              className={`${inputClass} py-2.5 text-sm`}
            >
              <option value="">كل الحالات</option>
              <option value="active">نشط وسارٍ</option>
              <option value="inactive">غير نشط</option>
              <option value="upcoming">قادم (لم يبدأ بعد)</option>
              <option value="expired">منتهي الصلاحية</option>
            </select>

            <select
              value={filterVisibility}
              onChange={(e) => setFilterVisibility(e.target.value as '' | 'visible' | 'hidden')}
              className={`${inputClass} py-2.5 text-sm`}
            >
              <option value="">الظهور بالرئيسية (الكل)</option>
              <option value="visible">ظاهر بالصفحة الرئيسية</option>
              <option value="hidden">مخفي عن الصفحة الرئيسية</option>
            </select>
          </div>

          {loadError ? (
            <div className="p-8 text-center rounded-2xl bg-red-50 border border-red-200 text-red-700 font-bold text-sm">
              {loadError}
            </div>
          ) : loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-[#087F8C] mx-auto mb-3" />
              <p className="text-sm font-bold text-[#718394]">جاري تحميل العروض...</p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="py-14 text-center rounded-2xl bg-[#F5FAFC] border border-dashed border-[#DFEAF0]">
              <Tag size={36} className="mx-auto mb-3 text-[#087F8C]/50" />
              <p className="font-bold text-[#172B3A]">لا توجد عروض مطابقة للبحث</p>
              <p className="text-xs text-[#718394] mt-1">
                {canCreate ? 'يمكنك إضافة عرض جديد من النموذج أعلاه.' : 'لم يتم العثور على عروض مسجلة.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
              <table className="w-full text-right text-sm">
                <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-extrabold border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3.5">الصورة</th>
                    <th className="p-3.5">عنوان العرض</th>
                    <th className="p-3.5">الطبيب</th>
                    <th className="p-3.5">سعر العرض</th>
                    <th className="p-3.5">السعر الأصلي</th>
                    <th className="p-3.5">الفترة</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5">الظهور بالرئيسية</th>
                    {(canEdit || canDelete || canUploadImages) && <th className="p-3.5">الإجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0] bg-white">
                  {filteredOffers.map((offer) => {
                    const lifecycle = getOfferLifecycleStatus(offer, todayStr);
                    return (
                      <tr key={offer.id} className="hover:bg-[#F5FAFC]/70 transition-colors">
                        <td className="p-3.5">
                          <div className="w-14 h-12 rounded-xl overflow-hidden bg-[#F5FAFC] border border-[#DFEAF0] flex items-center justify-center">
                            {offer.imageUrl ? (
                              <img src={offer.imageUrl} alt={offer.title} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon size={18} className="text-[#718394]/60" />
                            )}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-black text-[#172B3A]">{offer.title}</div>
                          {offer.discountPercentage !== null && offer.discountPercentage > 0 && (
                            <span className="inline-block mt-1 text-[10px] font-black bg-[#087F8C]/10 text-[#087F8C] px-2 py-0.5 rounded-md fv-num">
                              خصم {offer.discountPercentage}%
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-bold text-[#172B3A]">{offer.doctorName || '—'}</td>
                        <td className="p-3.5 font-black text-[#087F8C] fv-num">{offer.offerPrice} ج.م</td>
                        <td className="p-3.5 text-[#718394] font-bold fv-num">
                          {offer.originalPrice !== null ? (
                            <span className="line-through">{offer.originalPrice} ج.م</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3.5 text-xs font-bold text-[#718394] fv-num whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Calendar size={12} className="text-[#087F8C]" />
                            <span>{offer.startDate}</span>
                          </div>
                          <div className="text-[11px] text-[#718394]/80 mt-0.5">إلى {offer.endDate}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-col items-start gap-1">
                            {canManageVisibility ? (
                              <button
                                type="button"
                                onClick={() => void handleToggleActive(offer)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-colors cursor-pointer ${
                                  offer.isActive
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                }`}
                              >
                                {offer.isActive ? 'نشط' : 'غير نشط'}
                              </button>
                            ) : (
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-black border ${
                                  offer.isActive
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {offer.isActive ? 'نشط' : 'غير نشط'}
                              </span>
                            )}
                            {lifecycle === 'expired' && (
                              <span className="text-[10px] font-bold text-red-600">منتهي الصلاحية</span>
                            )}
                            {lifecycle === 'upcoming' && (
                              <span className="text-[10px] font-bold text-amber-600">لم يبدأ بعد</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            {canManageVisibility ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleHomepage(offer)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1 transition-colors cursor-pointer ${
                                    offer.showOnHomepage
                                      ? 'bg-[#EBF8FA] text-[#087F8C] border-[#B8E6EC] hover:bg-[#d8f1f5]'
                                      : 'bg-slate-50 text-[#718394] border-[#DFEAF0] hover:bg-slate-100'
                                  }`}
                                >
                                  {offer.showOnHomepage ? <Eye size={13} /> : <EyeOff size={13} />}
                                  <span>{offer.showOnHomepage ? 'ظاهر' : 'مخفي'}</span>
                                </button>
                                <input
                                  key={`${offer.id}-${offer.displayOrder}`}
                                  type="number"
                                  min="0"
                                  defaultValue={offer.displayOrder}
                                  title="ترتيب العرض"
                                  onBlur={(e) => void handleUpdateDisplayOrder(offer, Number(e.target.value))}
                                  className="w-14 bg-[#F5FAFC] border border-[#DFEAF0] rounded-lg px-2 py-1 text-xs font-bold text-center fv-num"
                                />
                              </>
                            ) : (
                              <span className="text-xs font-bold text-[#718394] flex items-center gap-1">
                                {offer.showOnHomepage ? (
                                  <>
                                    <CheckCircle size={13} className="text-[#087F8C]" /> ظاهر
                                  </>
                                ) : (
                                  'مخفي'
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        {(canEdit || canDelete || canUploadImages) && (
                          <td className="p-3.5">
                            <div className="flex items-center gap-1">
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(offer)}
                                  className="text-[#087F8C] hover:bg-[#087F8C]/10 p-2 rounded-lg transition-colors cursor-pointer"
                                  title="تعديل العرض"
                                >
                                  <Edit2 size={16} />
                                </button>
                              )}
                              {canUploadImages && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickImageTarget(offer);
                                    quickImageInputRef.current?.click();
                                  }}
                                  className="text-[#1769AA] hover:bg-[#1769AA]/10 p-2 rounded-lg transition-colors cursor-pointer"
                                  title="تغيير صورة العرض"
                                >
                                  <Upload size={16} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingOffer(offer)}
                                  className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors cursor-pointer"
                                  title="حذف العرض"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className={cardClass}>
          <p className="text-sm font-bold text-[#718394] text-center py-4">
            ليست لديك صلاحية عرض قائمة العروض المسجلة.
          </p>
        </div>
      )}
    </div>
  );
};
