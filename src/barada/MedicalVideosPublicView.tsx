import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Film,
  Layers,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Stethoscope,
  Video,
  X,
} from 'lucide-react';
import {
  filterPublicCategories,
  filterPublicMedicalVideos,
  getPlayableVideoUrl,
  isEmbedVideoSource,
  MedicalVideoCategoryRecord,
  MedicalVideoRecord,
  paginateItems,
} from './medicalVideos';

interface MedicalVideosPublicViewProps {
  videos: MedicalVideoRecord[];
  categories: MedicalVideoCategoryRecord[];
  language: 'ar' | 'en';
  isLoading?: boolean;
}

const PAGE_SIZE = 9;

export const MedicalVideosPublicView: React.FC<MedicalVideosPublicViewProps> = ({
  videos,
  categories,
  language,
  isLoading = false,
}) => {
  const isAr = language === 'ar';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  // Lazy-loaded video playback modal state
  const [activePlayer, setActivePlayer] = useState<{
    video: MedicalVideoRecord;
    resolvedUrl: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const activeCategories = useMemo(() => filterPublicCategories(categories), [categories]);
  const activeCategoryIds = useMemo(
    () => new Set(activeCategories.map((c) => c.id)),
    [activeCategories],
  );

  // Featured videos (always reflect active & published & featured in configured order)
  const featuredVideos = useMemo(
    () =>
      filterPublicMedicalVideos(videos, { activeCategoryIds }).filter((v) => v.isFeatured),
    [videos, activeCategoryIds],
  );

  // Filtered library list
  const filteredVideos = useMemo(
    () =>
      filterPublicMedicalVideos(videos, {
        search: searchTerm,
        categoryId: selectedCategoryId,
        activeCategoryIds,
      }),
    [videos, searchTerm, selectedCategoryId, activeCategoryIds],
  );

  const { visible: paginatedVideos, hasMore } = useMemo(
    () => paginateItems(filteredVideos, visibleLimit),
    [filteredVideos, visibleLimit],
  );

  const handleOpenPlayer = async (video: MedicalVideoRecord) => {
    setActivePlayer({ video, resolvedUrl: '', loading: true, error: null });
    const res = await getPlayableVideoUrl(video);
    setActivePlayer({
      video,
      resolvedUrl: res.url || '',
      loading: false,
      error: res.error || null,
    });
  };

  const renderCard = (video: MedicalVideoRecord, isFeaturedCard = false) => {
    const title = isAr ? video.titleAr : video.titleEn || video.titleAr;
    const desc = isAr ? video.descriptionAr : video.descriptionEn || video.descriptionAr;
    const catName = isAr ? video.categoryNameAr : video.categoryNameEn || video.categoryNameAr;

    return (
      <article
        key={`${isFeaturedCard ? 'feat-' : ''}${video.id}`}
        className="group relative glass-doctor-card rounded-3xl overflow-hidden transition-all duration-300 flex flex-col h-full"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-[#087F8C] via-[#25B8C7] to-[#1769AA]" />

        <button
          type="button"
          onClick={() => void handleOpenPlayer(video)}
          className="relative h-52 w-full bg-[#0B1F35] border-b border-[#DFEAF0]/80 overflow-hidden text-right cursor-pointer"
          aria-label={isAr ? `تشغيل: ${title}` : `Play: ${title}`}
        >
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0B1F35] to-[#102C48] text-[#25B8C7]">
              <Film size={44} className="opacity-70 mb-2" />
              <span className="text-xs font-bold text-slate-300">
                {isAr ? 'فيديو توعوي طبي' : 'Medical Video'}
              </span>
            </div>
          )}

          <div className="absolute inset-0 bg-[#0B1F35]/30 group-hover:bg-[#0B1F35]/45 transition-colors flex items-center justify-center">
            <span className="w-14 h-14 rounded-full bg-white/95 text-[#087F8C] shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Play size={24} className="mr-0.5" fill="currentColor" />
            </span>
          </div>

          {video.isFeatured && (
            <span className="absolute top-3.5 right-3.5 bg-amber-500 text-white px-3 py-1 rounded-xl text-[11px] font-black shadow-md inline-flex items-center gap-1">
              <Star size={12} fill="currentColor" />
              {isAr ? 'مميز' : 'Featured'}
            </span>
          )}

          {catName && (
            <span className="absolute bottom-3 left-3 bg-[#0B1F35]/80 backdrop-blur-xs text-white px-3 py-1 rounded-xl text-[11px] font-bold border border-white/15">
              {catName}
            </span>
          )}
        </button>

        <div className="p-6 grow flex flex-col">
          <h3 className="text-lg font-black text-[#172B3A] mb-2 group-hover:text-[#066D78] transition-colors leading-snug">
            {title}
          </h3>

          {desc && (
            <p className="text-xs md:text-sm font-medium text-[#4A5F72] leading-relaxed mb-4 line-clamp-2">
              {desc}
            </p>
          )}

          <div className="mt-auto pt-4 border-t border-[#DFEAF0]/80 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {video.doctorName && (
                <span className="inline-flex items-center gap-1.5 bg-[#087F8C]/10 text-[#066D78] px-2.5 py-1 rounded-xl font-bold text-[11px] border border-[#087F8C]/20">
                  <Stethoscope size={12} />
                  {video.doctorName}
                </span>
              )}
              {video.specialty && !video.doctorName && (
                <span className="inline-flex items-center gap-1.5 bg-[#1769AA]/10 text-[#1769AA] px-2.5 py-1 rounded-xl font-bold text-[11px] border border-[#1769AA]/20">
                  {video.specialty}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleOpenPlayer(video)}
              className="fv-btn-primary py-2 px-4 rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Play size={13} fill="currentColor" />
              {isAr ? 'مشاهدة' : 'Watch'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <section id="medical-videos" className="py-16 md:py-20 min-h-[75vh] relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 right-[-8%] w-[28rem] h-[28rem] rounded-full bg-[#25B8C7]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-[-8%] w-[26rem] h-[26rem] rounded-full bg-[#1769AA]/10 blur-3xl" />

      {/* Lazy Video Playback Modal */}
      {activePlayer && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B1F35]/80 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-[#DFEAF0] max-h-[92vh] flex flex-col">
            <div className="p-5 border-b border-[#DFEAF0] flex items-center justify-between bg-[#F5FAFC] gap-4">
              <div className="min-w-0">
                <h3 className="font-black text-lg text-[#172B3A] truncate">
                  {isAr
                    ? activePlayer.video.titleAr
                    : activePlayer.video.titleEn || activePlayer.video.titleAr}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-bold text-[#718394]">
                  {activePlayer.video.categoryNameAr && (
                    <span className="inline-flex items-center gap-1 text-[#087F8C]">
                      <Layers size={13} /> {activePlayer.video.categoryNameAr}
                    </span>
                  )}
                  {activePlayer.video.doctorName && (
                    <span className="inline-flex items-center gap-1">
                      <Stethoscope size={13} className="text-[#1769AA]" />{' '}
                      {activePlayer.video.doctorName}
                    </span>
                  )}
                  {activePlayer.video.publishedAt && (
                    <span className="inline-flex items-center gap-1 fv-num">
                      <Calendar size={13} /> {activePlayer.video.publishedAt.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePlayer(null)}
                className="p-2 rounded-xl text-[#718394] hover:text-[#172B3A] hover:bg-white border border-transparent hover:border-[#DFEAF0] transition-all cursor-pointer shrink-0"
                aria-label={isAr ? 'إغلاق' : 'Close'}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {activePlayer.loading ? (
                <div className="aspect-video rounded-2xl bg-[#0B1F35] flex items-center justify-center text-white">
                  <RefreshCw size={30} className="animate-spin text-[#25B8C7]" />
                </div>
              ) : activePlayer.error ? (
                <div className="aspect-video rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] flex items-center justify-center p-6 text-center">
                  <p className="font-bold text-[#172B3A]">{activePlayer.error}</p>
                </div>
              ) : isEmbedVideoSource(activePlayer.video.videoSourceType) ? (
                <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
                  <iframe
                    src={activePlayer.resolvedUrl}
                    title={activePlayer.video.titleAr}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
                  <video
                    src={activePlayer.resolvedUrl}
                    controls
                    playsInline
                    className="w-full h-full"
                  />
                </div>
              )}

              {(activePlayer.video.descriptionAr || activePlayer.video.specialty) && (
                <div className="bg-[#F5FAFC] p-5 rounded-2xl border border-[#DFEAF0] space-y-2">
                  {activePlayer.video.specialty && (
                    <p className="text-xs font-extrabold text-[#087F8C]">
                      {isAr ? 'التخصص:' : 'Specialty:'} {activePlayer.video.specialty}
                    </p>
                  )}
                  {activePlayer.video.descriptionAr && (
                    <p className="text-sm font-medium text-[#172B3A] leading-relaxed whitespace-pre-line">
                      {isAr
                        ? activePlayer.video.descriptionAr
                        : activePlayer.video.descriptionEn || activePlayer.video.descriptionAr}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Heading */}
        <div className="text-center mb-12">
          <span className="text-[#066D78] text-xs font-extrabold uppercase tracking-widest mb-3 inline-flex items-center gap-1.5">
            <Sparkles size={14} />
            {isAr ? 'التوعية الطبية البصرية' : 'Ophthalmic Educational Library'}
          </span>
          <h1 className="text-3xl md:text-5xl font-black text-[#172B3A] mb-4 tracking-tight leading-tight fv-balance">
            {isAr ? 'فيديوهات طبية' : 'Medical Videos'}
          </h1>
          <p className="text-[#4A5F72] text-base md:text-lg font-medium max-w-2xl mx-auto">
            {isAr
              ? 'مكتبة مرئية موثوقة من استشاريي مركز برادة للعيون حول أمراض العيون، الفحوصات، والجراحات الحديثة.'
              : 'Trusted educational videos from Barrada Eye Center consultants on eye conditions, diagnostics, and modern eye surgery.'}
          </p>
          <div className="w-16 h-1 bg-gradient-to-r from-[#087F8C] to-[#25B8C7] mx-auto mt-6 rounded-full" />
        </div>

        {isLoading ? (
          <div className="py-16 text-center" role="status">
            <div className="w-10 h-10 border-4 border-[#087F8C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#718394] font-bold text-sm">
              {isAr ? 'جاري تحميل الفيديوهات الطبية…' : 'Loading medical videos…'}
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Featured Section */}
            {featuredVideos.length > 0 && !searchTerm.trim() && !selectedCategoryId && (
              <div>
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 border border-amber-200 flex items-center justify-center">
                    <Star size={18} fill="currentColor" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-[#172B3A]">
                    {isAr ? 'فيديوهات مميزة' : 'Featured Videos'}
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {featuredVideos.map((v) => renderCard(v, true))}
                </div>
              </div>
            )}

            {/* Search & Category Filters */}
            <div className="bg-white/85 backdrop-blur-md rounded-3xl border border-[#DFEAF0] p-5 md:p-6 shadow-[0_10px_28px_-16px_rgba(11,31,53,0.08)] space-y-5">
              <div className="relative max-w-xl mx-auto">
                <Search size={18} className="absolute right-4 top-3.5 text-[#718394]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setVisibleLimit(PAGE_SIZE);
                  }}
                  placeholder={
                    isAr
                      ? 'ابحث بعنوان الفيديو أو الموضوع الطبي أو اسم الطبيب...'
                      : 'Search by video title, topic, or doctor...'
                  }
                  className="w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-2xl py-3 pr-11 pl-4 text-sm font-bold text-[#172B3A] focus:bg-white focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] outline-hidden transition-all"
                />
              </div>

              {activeCategories.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId('');
                      setVisibleLimit(PAGE_SIZE);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      selectedCategoryId === ''
                        ? 'bg-[#087F8C] text-white shadow-sm'
                        : 'bg-[#F5FAFC] text-[#4A5F72] border border-[#DFEAF0] hover:border-[#087F8C]/50 hover:text-[#087F8C]'
                    }`}
                  >
                    {isAr ? 'الكل' : 'All'}
                  </button>
                  {activeCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setVisibleLimit(PAGE_SIZE);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        selectedCategoryId === cat.id
                          ? 'bg-[#087F8C] text-white shadow-sm'
                          : 'bg-[#F5FAFC] text-[#4A5F72] border border-[#DFEAF0] hover:border-[#087F8C]/50 hover:text-[#087F8C]'
                      }`}
                    >
                      {isAr ? cat.nameAr : cat.nameEn || cat.nameAr}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Video Cards Grid or Empty State */}
            {filteredVideos.length === 0 ? (
              <div className="bg-white/80 rounded-3xl border border-[#DFEAF0] p-12 md:p-16 text-center max-w-2xl mx-auto shadow-[0_10px_28px_-16px_rgba(11,31,53,0.08)]">
                <div className="w-16 h-16 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 flex items-center justify-center mx-auto mb-4">
                  <Video size={30} />
                </div>
                <h3 className="text-xl font-black text-[#172B3A] mb-2">
                  {searchTerm || selectedCategoryId
                    ? isAr
                      ? 'لا توجد فيديوهات مطابقة لبحثك'
                      : 'No videos match your search'
                    : isAr
                    ? 'لا توجد فيديوهات طبية منشورة حالياً'
                    : 'No medical videos published yet'}
                </h3>
                <p className="text-sm font-medium text-[#718394]">
                  {searchTerm || selectedCategoryId
                    ? isAr
                      ? 'جرّب البحث بكلمات أخرى أو اختيار قسم مختلف.'
                      : 'Try different keywords or select another category.'
                    : isAr
                    ? 'سيتم إضافة الفيديوهات التوعوية من أطباء المركز قريباً.'
                    : 'Educational videos from our consultants will appear here soon.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {paginatedVideos.map((video) => renderCard(video, false))}
                </div>

                {hasMore && (
                  <div className="text-center pt-4">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                      className="bg-white hover:bg-[#F5FAFC] text-[#087F8C] border border-[#087F8C]/35 px-8 py-3.5 rounded-2xl font-black text-sm inline-flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      <ChevronDown size={18} />
                      {isAr ? 'عرض المزيد من الفيديوهات' : 'Load More Videos'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
