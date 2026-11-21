import React from 'react';
import { Calendar, Stethoscope, Tag, Sparkles } from 'lucide-react';
import { cairoTodayStr } from './dateUtils';
import { DoctorLookupItem, filterHomepageOffers, OfferRecord } from './offers';

interface OffersSectionProps {
  offers: OfferRecord[];
  doctors: DoctorLookupItem[];
  onBookOffer: (doctor: DoctorLookupItem, offer: OfferRecord) => void;
  language: 'ar' | 'en';
  isLoading?: boolean;
}

export const OffersSection: React.FC<OffersSectionProps> = ({
  offers,
  doctors,
  onBookOffer,
  language,
  isLoading = false,
}) => {
  const todayStr = cairoTodayStr();
  const visibleOffers = filterHomepageOffers(offers, doctors, todayStr);

  if (!isLoading && visibleOffers.length === 0) return null;

  const findDoctorForOffer = (offer: OfferRecord): DoctorLookupItem | undefined =>
    doctors.find((d) => (d.dbId && d.dbId === offer.doctorId) || d.id === offer.doctorLocalId);

  return (
    <div id="offers" className="py-20 relative overflow-hidden scroll-mt-20">
      <div className="pointer-events-none absolute top-6 right-[-6%] w-[26rem] h-[26rem] rounded-full bg-[#25B8C7]/12 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-10 left-[-6%] w-[24rem] h-[24rem] rounded-full bg-[#1769AA]/10 blur-3xl"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-14">
          <span className="text-[#066D78] text-xs font-extrabold uppercase tracking-widest mb-3 inline-flex items-center gap-1.5">
            <Sparkles size={14} />
            {language === 'ar' ? 'باقات وعروض حصرية' : 'Exclusive Medical Offers'}
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-[#172B3A] mb-4 tracking-tight leading-tight fv-balance">
            {language === 'ar' ? 'عروض مركز برادة للعيون' : 'Barrada Eye Center Offers'}
          </h2>
          <p className="text-[#4A5F72] text-base md:text-lg font-medium max-w-2xl mx-auto">
            {language === 'ar'
              ? 'اكتشف أحدث العروض الطبية واحجز موعدك بسهولة'
              : 'Discover the latest medical offers and book your appointment easily'}
          </p>
          <div className="w-16 h-1 bg-gradient-to-r from-[#087F8C] to-[#25B8C7] mx-auto mt-6 rounded-full"></div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center" role="status">
            <div className="w-10 h-10 border-4 border-[#087F8C] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#718394] font-bold text-sm">
              {language === 'ar' ? 'جاري تحميل العروض…' : 'Loading offers…'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {visibleOffers.map((offer) => {
              const matchedDoctor = findDoctorForOffer(offer);
              if (!matchedDoctor) return null;
              const doctorDisplayName = matchedDoctor.name || offer.doctorName || '';

              return (
                <div
                  key={offer.id}
                  className="group relative glass-doctor-card rounded-3xl overflow-hidden transition-all duration-300 flex flex-col h-full"
                >
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#087F8C] via-[#25B8C7] to-[#1769AA]"></div>

                  <div className="relative h-52 w-full bg-[#F5FAFC] border-b border-[#DFEAF0]/80 overflow-hidden">
                    {offer.imageUrl ? (
                      <img
                        src={offer.imageUrl}
                        alt={offer.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#EBF8FA] to-[#F5FAFC] text-[#087F8C]">
                        <Tag size={42} className="opacity-70 mb-2" />
                        <span className="text-xs font-bold text-[#4A5F72]">
                          {language === 'ar' ? 'عرض طبي مميز' : 'Special Medical Offer'}
                        </span>
                      </div>
                    )}

                    {offer.discountPercentage !== null && offer.discountPercentage > 0 && (
                      <div className="absolute top-3.5 left-3.5 bg-gradient-to-l from-[#087F8C] to-[#1769AA] text-white px-3.5 py-1.5 rounded-xl text-xs font-black shadow-md fv-num">
                        {language === 'ar' ? `خصم ${offer.discountPercentage}%` : `${offer.discountPercentage}% OFF`}
                      </div>
                    )}
                  </div>

                  <div className="p-6 md:p-7 grow flex flex-col">
                    <div className="mb-3">
                      <h3 className="text-xl font-black text-[#172B3A] mb-2 group-hover:text-[#066D78] transition-colors leading-snug">
                        {offer.title}
                      </h3>
                      <div className="inline-flex items-center gap-2 bg-[#087F8C]/10 text-[#066D78] px-3 py-1 rounded-xl font-bold text-xs border border-[#087F8C]/20">
                        <Stethoscope size={13} />
                        <span>{doctorDisplayName}</span>
                      </div>
                    </div>

                    {offer.description && (
                      <p className="text-xs md:text-sm font-medium text-[#3B5062] leading-relaxed mb-5 line-clamp-3">
                        {offer.description}
                      </p>
                    )}

                    <div className="mt-auto pt-4 border-t border-[#DFEAF0]/80 flex items-center justify-between gap-4">
                      <div className="shrink-0">
                        <p className="text-[10px] font-bold text-[#4A5F72] uppercase mb-0.5">
                          {language === 'ar' ? 'سعر العرض' : 'Offer Price'}
                        </p>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className="text-xl font-black text-[#066D78] fv-num">
                            {offer.offerPrice}{' '}
                            <span className="text-xs font-bold text-[#4A5F72]">
                              {language === 'ar' ? 'ج.م' : 'EGP'}
                            </span>
                          </p>
                          {offer.originalPrice !== null && offer.originalPrice > offer.offerPrice && (
                            <p className="text-xs font-bold text-[#718394] line-through fv-num">
                              {offer.originalPrice} {language === 'ar' ? 'ج.م' : 'EGP'}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onBookOffer(matchedDoctor, offer)}
                        className="flex-1 fv-btn-primary py-3 px-4 rounded-xl font-black flex items-center justify-center gap-2 text-sm cursor-pointer"
                      >
                        <Calendar size={17} />
                        <span>{offer.buttonText || (language === 'ar' ? 'احجز الآن' : 'Book Now')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
