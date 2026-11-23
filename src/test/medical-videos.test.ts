import { describe, expect, it, beforeEach } from 'vitest';
import {
  autoYouTubeThumbnailUrl,
  buildSafeEmbedUrl,
  clearFallbackMedicalVideos,
  DEFAULT_MEDICAL_VIDEO_CATEGORIES,
  extractVimeoId,
  extractYouTubeId,
  filterPublicCategories,
  filterPublicMedicalVideos,
  hasMedicalVideoPermission,
  isMissingMedicalVideosTableError,
  isValidDirectMp4Url,
  mapCategoryRow,
  mapMedicalVideoRow,
  paginateItems,
  readFallbackCategories,
  readFallbackVideos,
  safeThumbnailUrl,
  validateCategoryInput,
  validateThumbnailFile,
  validateVideoFile,
  validateVideoInput,
  writeFallbackVideos,
} from '@/barada/medicalVideos';
import {
  canAccessSection,
  DASHBOARD_PERMISSIONS,
  firstAccessibleSection,
  MEDICAL_VIDEO_PERMISSIONS,
  SECTION_PERMISSIONS,
} from '@/barada/permissions';

const adminUser = { role: 'admin' as const, permissions: [] as string[] };
const staffWith = (permissions: string[]) => ({ role: 'staff' as const, permissions });

describe('medical videos permissions & RBAC integration', () => {
  it('defines all 8 required permissions under group مكتبة الفيديوهات الطبية', () => {
    expect(MEDICAL_VIDEO_PERMISSIONS.map((p) => p.id)).toEqual([
      'medical_videos_view',
      'medical_videos_create',
      'medical_videos_edit',
      'medical_videos_delete',
      'medical_videos_publish',
      'medical_videos_manage_categories',
      'medical_videos_upload',
      'medical_videos_manage_featured',
    ]);
    expect(MEDICAL_VIDEO_PERMISSIONS.every((p) => p.group === 'مكتبة الفيديوهات الطبية')).toBe(true);
    for (const perm of MEDICAL_VIDEO_PERMISSIONS) {
      expect(DASHBOARD_PERMISSIONS.some((p) => p.id === perm.id)).toBe(true);
      expect(SECTION_PERMISSIONS['medical-videos']).toContain(perm.id);
    }
  });

  it('requires medical_videos_view for staff to access the dashboard section while keeping admin full access', () => {
    expect(canAccessSection(adminUser, 'medical-videos')).toBe(true);
    expect(canAccessSection(staffWith([]), 'medical-videos')).toBe(false);
    expect(canAccessSection(staffWith(['medical_videos_create']), 'medical-videos')).toBe(false);
    expect(canAccessSection(staffWith(['medical_videos_view']), 'medical-videos')).toBe(true);
    expect(firstAccessibleSection(staffWith(['medical_videos_view']))).toBe('medical-videos');
    expect(firstAccessibleSection(staffWith(['medical_videos_edit']))).toBe(null);
  });

  it('checks individual action permissions accurately without auto-granting to staff', () => {
    const viewOnly = staffWith(['medical_videos_view']);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_view')).toBe(true);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_create')).toBe(false);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_edit')).toBe(false);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_delete')).toBe(false);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_publish')).toBe(false);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_manage_categories')).toBe(false);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_upload')).toBe(false);
    expect(hasMedicalVideoPermission(viewOnly, 'medical_videos_manage_featured')).toBe(false);

    expect(hasMedicalVideoPermission(adminUser, 'medical_videos_delete')).toBe(true);
    expect(hasMedicalVideoPermission(null, 'medical_videos_view')).toBe(false);
  });
});

describe('medical videos URL security, embed building & validation', () => {
  it('parses YouTube IDs and builds strict youtube-nocookie embed URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(buildSafeEmbedUrl('youtube', 'https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
    );
    expect(autoYouTubeThumbnailUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });

  it('parses Vimeo IDs and builds strict player.vimeo.com embed URLs', () => {
    expect(extractVimeoId('https://vimeo.com/123456789')).toBe('123456789');
    expect(extractVimeoId('https://player.vimeo.com/video/987654321')).toBe('987654321');
    expect(buildSafeEmbedUrl('vimeo', 'https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789',
    );
  });

  it('blocks unsafe URL schemes and spoofed domains from embeds and thumbnails', () => {
    expect(extractYouTubeId('javascript:alert(1)')).toBeNull();
    expect(extractYouTubeId('https://evil-youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(buildSafeEmbedUrl('youtube', 'javascript:alert(1)')).toBe('');
    expect(buildSafeEmbedUrl('vimeo', 'data:text/html,<script>alert(1)</script>')).toBe('');
    expect(isValidDirectMp4Url('javascript:alert(1)')).toBe(false);
    expect(isValidDirectMp4Url('https://user:pass@cdn.example.com/video.mp4')).toBe(false);
    expect(isValidDirectMp4Url('https://cdn.example.com/cataract.mp4')).toBe(true);
    expect(safeThumbnailUrl('javascript:alert(1)')).toBe('');
    expect(safeThumbnailUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe('');
    expect(safeThumbnailUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });

  it('validates video and category inputs and upload files cleanly', () => {
    expect(
      validateVideoInput({
        titleAr: '',
        videoSourceType: 'youtube',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        isActive: true,
        isPublished: true,
        isFeatured: false,
      }).valid,
    ).toBe(false);

    expect(
      validateVideoInput({
        titleAr: 'عملية المياه البيضاء بالفاكو',
        videoSourceType: 'youtube',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        isActive: true,
        isPublished: true,
        isFeatured: true,
      }).valid,
    ).toBe(true);

    expect(validateCategoryInput({ nameAr: '', isActive: true }).valid).toBe(false);
    expect(validateCategoryInput({ nameAr: 'جراحة الشبكية', isActive: true }).valid).toBe(true);

    const badImg = new File(['abc'], 'shell.svg', { type: 'image/svg+xml' });
    expect(validateThumbnailFile(badImg)).not.toBeNull();
    const okImg = new File(['abc'], 'thumb.webp', { type: 'image/webp' });
    expect(validateThumbnailFile(okImg)).toBeNull();

    const badVid = new File(['abc'], 'script.exe', { type: 'application/x-msdownload' });
    expect(validateVideoFile(badVid)).not.toBeNull();
    const okVid = new File(['abc'], 'surgery.mp4', { type: 'video/mp4' });
    expect(validateVideoFile(okVid)).toBeNull();
  });
});

describe('medical videos public filtering, categories & fallback integrity', () => {
  beforeEach(() => {
    clearFallbackMedicalVideos();
  });

  it('seeds all 12 required ophthalmology categories and never includes fake demo videos', () => {
    expect(DEFAULT_MEDICAL_VIDEO_CATEGORIES).toHaveLength(12);
    const names = DEFAULT_MEDICAL_VIDEO_CATEGORIES.map((c) => c.nameAr);
    expect(names).toEqual([
      'أمراض العيون',
      'المياه البيضاء',
      'القرنية',
      'الليزك وتصحيح الإبصار',
      'الشبكية والجسم الزجاجي',
      'الحول وعيون الأطفال',
      'الجلوكوما والمياه الزرقاء',
      'تجميل العيون',
      'الفحوصات الطبية',
      'نصائح وإرشادات طبية',
      'فيديوهات الأطباء',
      'أخرى',
    ]);
    expect(readFallbackCategories()).toHaveLength(12);
    expect(readFallbackVideos()).toEqual([]);
  });

  it('hides unpublished, inactive, and inactive-category videos from public views', () => {
    const categories = [
      mapCategoryRow({ id: 'cat-1', name_ar: 'المياه البيضاء', is_active: true, display_order: 1 }),
      mapCategoryRow({ id: 'cat-2', name_ar: 'قسم مخفي', is_active: false, display_order: 2 }),
    ];
    const activeCats = filterPublicCategories(categories);
    expect(activeCats.map((c) => c.id)).toEqual(['cat-1']);
    const activeSet = new Set(activeCats.map((c) => c.id));

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const rows = [
      {
        id: 'vid-draft',
        title_ar: 'مسودة',
        video_source_type: 'youtube',
        video_url: 'https://youtu.be/dQw4w9WgXcQ',
        category_id: 'cat-1',
        is_active: true,
        is_published: false,
        is_featured: true,
        display_order: 1,
      },
      {
        id: 'vid-inactive',
        title_ar: 'غير نشط',
        video_source_type: 'youtube',
        video_url: 'https://youtu.be/dQw4w9WgXcQ',
        category_id: 'cat-1',
        is_active: false,
        is_published: true,
        is_featured: true,
        display_order: 2,
      },
      {
        id: 'vid-inactive-cat',
        title_ar: 'في قسم مخفي',
        video_source_type: 'youtube',
        video_url: 'https://youtu.be/dQw4w9WgXcQ',
        category_id: 'cat-2',
        is_active: true,
        is_published: true,
        is_featured: false,
        display_order: 3,
      },
      {
        id: 'vid-visible-2',
        title_ar: 'نصائح ما بعد الفيمتو ليزك',
        video_source_type: 'youtube',
        video_url: 'https://youtu.be/dQw4w9WgXcQ',
        category_id: 'cat-1',
        is_active: true,
        is_published: true,
        is_featured: false,
        display_order: 10,
      },
      {
        id: 'vid-visible-1',
        title_ar: 'علاج المياه البيضاء بالليزر',
        video_source_type: 'youtube',
        video_url: 'https://youtu.be/dQw4w9WgXcQ',
        category_id: 'cat-1',
        is_active: true,
        is_published: true,
        is_featured: true,
        display_order: 1,
      },
    ].map((r) => mapMedicalVideoRow(r, catMap));

    const visible = filterPublicMedicalVideos(rows, { activeCategoryIds: activeSet });
    expect(visible.map((v) => v.id)).toEqual(['vid-visible-1', 'vid-visible-2']);

    const searched = filterPublicMedicalVideos(rows, {
      activeCategoryIds: activeSet,
      search: 'الفيمتو',
    });
    expect(searched.map((v) => v.id)).toEqual(['vid-visible-2']);

    const paged = paginateItems(visible, 1);
    expect(paged.visible).toHaveLength(1);
    expect(paged.hasMore).toBe(true);
  });

  it('recognizes missing-table errors and supports fallback persistence when pre-migration', () => {
    expect(isMissingMedicalVideosTableError({ code: 'PGRST205' })).toBe(true);
    expect(
      isMissingMedicalVideosTableError({ message: 'relation "public.medical_videos" does not exist' }),
    ).toBe(true);
    expect(isMissingMedicalVideosTableError({ code: '23505', message: 'duplicate key' })).toBe(false);

    writeFallbackVideos([
      { id: 'v1', title_ar: 'فيديو محفوظ محلياً', display_order: 1, created_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(readFallbackVideos()).toHaveLength(1);
    clearFallbackMedicalVideos();
    expect(readFallbackVideos()).toEqual([]);
  });
});
