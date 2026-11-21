import React, { useId } from 'react';

export interface EyeCareIconProps {
  size?: number;
  className?: string;
}

const svgProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 64 64',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  className: `shrink-0 drop-shadow-[0_4px_6px_rgba(11,31,53,0.18)] ${className ?? ''}`.trim(),
  'aria-hidden': true as const,
});

/** 1. فحص العين الشامل — 3D Anatomical Eye */
export const Eye3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-sclera`} x1="10" y1="14" x2="54" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#E6F4F9" />
          <stop offset="100%" stopColor="#B8DCE8" />
        </linearGradient>
        <radialGradient id={`${id}-iris`} cx="32" cy="30" r="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3EE3F2" />
          <stop offset="55%" stopColor="#087F8C" />
          <stop offset="100%" stopColor="#0B3E5E" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#25B8C7" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
      </defs>
      <path d="M6 32C12 19 22 14 32 14C42 14 52 19 58 32C52 45 42 50 32 50C22 50 12 45 6 32Z" fill={`url(#${id}-sclera)`} stroke={`url(#${id}-rim)`} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="13" fill={`url(#${id}-iris)`} />
      <circle cx="32" cy="32" r="6" fill="#0B1F35" />
      <ellipse cx="28" cy="27" rx="3.2" ry="2.2" transform="rotate(-25 28 27)" fill="#FFFFFF" fillOpacity="0.92" />
      <circle cx="36" cy="36" r="1.5" fill="#7BF0FA" fillOpacity="0.8" />
      <path d="M13 28C19 20 26 17.5 32 17.5C38 17.5 45 20 51 28" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
};

/** 2. ليزك وتصحيح الإبصار — 3D Corneal Laser Surgery */
export const LasikLaser3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-emitter`} x1="22" y1="6" x2="42" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E6F4F9" />
          <stop offset="50%" stopColor="#8BB4CE" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="32" y1="22" x2="32" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5FF2FF" />
          <stop offset="100%" stopColor="#087F8C" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id={`${id}-cornea`} cx="32" cy="48" r="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7DECF7" />
          <stop offset="60%" stopColor="#1E88B8" />
          <stop offset="100%" stopColor="#0B2E4E" />
        </radialGradient>
      </defs>
      <path d="M10 47C16 39 24 36 32 36C40 36 48 39 54 47C48 53 40 56 32 56C24 56 16 53 10 47Z" fill={`url(#${id}-cornea)`} stroke="#88E9F5" strokeWidth="1.5" />
      <ellipse cx="32" cy="46" rx="8" ry="5" fill="#0B1F35" />
      <path d="M26 8H38L35 21H29L26 8Z" fill={`url(#${id}-emitter)`} stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="1" />
      <path d="M30.5 21L26 42H38L33.5 21H30.5Z" fill={`url(#${id}-beam)`} />
      <circle cx="32" cy="42" r="4.5" fill="#FFF3B0" />
      <circle cx="32" cy="42" r="2.2" fill="#FFFFFF" />
      <path d="M18 33L23 36M46 33L41 36" stroke="#25B8C7" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
};

/** 3. أشعة OCT وفحص القرنية — 3D Optical Tomography Scan */
export const ScanEye3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-frame`} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#25B8C7" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
        <radialGradient id={`${id}-orb`} cx="30" cy="30" r="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#D7EFF7" />
          <stop offset="100%" stopColor="#8FC6DB" />
        </radialGradient>
      </defs>
      <path d="M12 22V14C12 11.8 13.8 10 16 10H24M40 10H48C50.2 10 52 11.8 52 14V22M52 42V50C52 52.2 50.2 54 48 54H40M24 54H16C13.8 54 12 52.2 12 50V42" stroke={`url(#${id}-frame)`} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="14" fill={`url(#${id}-orb)`} />
      <circle cx="32" cy="32" r="8.5" fill="#087F8C" />
      <circle cx="32" cy="32" r="4" fill="#0B1F35" />
      <circle cx="29" cy="29" r="2" fill="#FFFFFF" />
      <rect x="10" y="30.5" width="44" height="3" rx="1.5" fill="#5FF2FF" fillOpacity="0.75" />
    </svg>
  );
};

/** 4. قطرات وعلاج جفاف العين — 3D Ophthalmic Dropper */
export const EyeDrops3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-bottle`} x1="16" y1="14" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#CBEAF5" />
          <stop offset="100%" stopColor="#6BBBD6" />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="34" y1="8" x2="50" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#25B8C7" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
        <radialGradient id={`${id}-drop`} cx="45" cy="48" r="9" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B8FAFF" />
          <stop offset="55%" stopColor="#25B8C7" />
          <stop offset="100%" stopColor="#087F8C" />
        </radialGradient>
      </defs>
      <g transform="rotate(-38 26 26)">
        <rect x="14" y="18" width="22" height="28" rx="6" fill={`url(#${id}-bottle)`} stroke="#8AC5DB" strokeWidth="1.5" />
        <rect x="18" y="25" width="14" height="14" rx="3" fill="#087F8C" fillOpacity="0.18" />
        <path d="M21 18V12H29V18H21Z" fill={`url(#${id}-cap)`} />
        <path d="M23 12L25 5L27 12H23Z" fill="#087F8C" />
      </g>
      <path d="M46 39C46 39 53 47.2 53 51.5C53 55.4 49.9 58.5 46 58.5C42.1 58.5 39 55.4 39 51.5C39 47.2 46 39 46 39Z" fill={`url(#${id}-drop)`} />
      <ellipse cx="43.5" cy="50" rx="1.6" ry="2.8" transform="rotate(-15 43.5 50)" fill="#FFFFFF" fillOpacity="0.88" />
    </svg>
  );
};

/** 5. الميكروسكوب الجراحي / المصباح الشقي — 3D Ophthalmic Microscope */
export const Microscope3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-arm`} x1="16" y1="8" x2="48" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5FAFC" />
          <stop offset="55%" stopColor="#A6C8DC" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
        <linearGradient id={`${id}-tube`} x1="22" y1="10" x2="38" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#25B8C7" />
          <stop offset="100%" stopColor="#087F8C" />
        </linearGradient>
      </defs>
      <rect x="14" y="50" width="36" height="7" rx="3.5" fill={`url(#${id}-arm)`} />
      <path d="M40 50V28C40 22 36 18 30 18" stroke={`url(#${id}-arm)`} strokeWidth="6" strokeLinecap="round" />
      <rect x="20" y="9" width="12" height="22" rx="4" transform="rotate(-15 26 20)" fill={`url(#${id}-tube)`} stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="1" />
      <ellipse cx="26" cy="40" rx="10" ry="2.5" fill="#0B1F35" fillOpacity="0.25" />
      <rect x="16" y="38" width="18" height="4" rx="2" fill="#087F8C" />
      <circle cx="40" cy="30" r="4" fill="#FFFFFF" stroke="#087F8C" strokeWidth="2" />
      <path d="M23 32L21 38H29L27 32H23Z" fill="#5FF2FF" fillOpacity="0.55" />
    </svg>
  );
};

/** 6. النظارات الطبية وقياس النظر — 3D Clinical Optics */
export const Glasses3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-lens`} x1="8" y1="22" x2="28" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E6FBFF" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#94E8F5" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#1769AA" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`${id}-frame`} x1="6" y1="20" x2="58" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A54" />
          <stop offset="100%" stopColor="#087F8C" />
        </linearGradient>
      </defs>
      <path d="M8 29L15 16H19M56 29L49 16H45" stroke="#1769AA" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="6" y="24" width="22" height="18" rx="7" fill={`url(#${id}-lens)`} stroke={`url(#${id}-frame)`} strokeWidth="3" />
      <rect x="36" y="24" width="22" height="18" rx="7" fill={`url(#${id}-lens)`} stroke={`url(#${id}-frame)`} strokeWidth="3" />
      <path d="M28 31C30 29 34 29 36 31" stroke={`url(#${id}-frame)`} strokeWidth="3" strokeLinecap="round" />
      <path d="M10 34L17 27M40 34L47 27" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.85" />
    </svg>
  );
};

/** 7. الحقن الدوائي للشبكية — 3D Ophthalmic Micro-Syringe */
export const Syringe3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-barrel`} x1="16" y1="14" x2="46" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#C8EEF7" />
          <stop offset="100%" stopColor="#72BBD1" />
        </linearGradient>
        <linearGradient id={`${id}-fluid`} x1="20" y1="20" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5FF2FF" />
          <stop offset="100%" stopColor="#087F8C" />
        </linearGradient>
      </defs>
      <g transform="rotate(-45 32 32)">
        <rect x="28" y="6" width="8" height="10" rx="2" fill="#1769AA" />
        <rect x="23" y="14" width="18" height="3.5" rx="1.75" fill="#0B1F35" />
        <rect x="25" y="17.5" width="14" height="27" rx="3" fill={`url(#${id}-barrel)`} stroke="#5CA8C2" strokeWidth="1.5" />
        <rect x="27" y="25" width="10" height="17" rx="1.5" fill={`url(#${id}-fluid)`} />
        <path d="M28 24H33M28 29H32M28 34H33" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="29" y="44.5" width="6" height="4.5" rx="1" fill="#087F8C" />
        <path d="M32 49V60" stroke="#718394" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
};

/** 8. قياس ضغط العين وتخطيط الشبكية — 3D Ocular Tonometry / Waveform */
export const EyeActivity3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-panel`} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#102C48" />
          <stop offset="100%" stopColor="#081628" />
        </linearGradient>
        <linearGradient id={`${id}-wave`} x1="12" y1="32" x2="52" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#25B8C7" />
          <stop offset="50%" stopColor="#7BF7FF" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
      </defs>
      <rect x="8" y="10" width="48" height="44" rx="12" fill={`url(#${id}-panel)`} stroke="#25B8C7" strokeOpacity="0.55" strokeWidth="2" />
      <path d="M13 33H21L25.5 21L31.5 43L37 26L41 33H51" stroke={`url(#${id}-wave)`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="20" r="3.5" fill="#25B8C7" />
      <path d="M15 15H49" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

/** 9. تصوير قاع العين — 3D Fundus Camera & Retina */
export const FundusScan3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-ring`} x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#DCEEF5" />
          <stop offset="50%" stopColor="#6AA7C7" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
        <radialGradient id={`${id}-retina`} cx="32" cy="32" r="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9E66" />
          <stop offset="55%" stopColor="#D94E34" />
          <stop offset="100%" stopColor="#7C1D18" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="23" fill={`url(#${id}-ring)`} />
      <circle cx="32" cy="32" r="16.5" fill={`url(#${id}-retina)`} />
      <circle cx="38" cy="30" r="4.5" fill="#FFE6A8" fillOpacity="0.9" />
      <path d="M38 30C34 26 28 24 21 25M38 30C33 34 27 38 20 38M38 30C42 25 44 21 44 18" stroke="#8E1512" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="25" cy="22" rx="5" ry="2.2" transform="rotate(-30 25 22)" fill="#FFFFFF" fillOpacity="0.6" />
    </svg>
  );
};

/** 10. حماية ووقاية العين — 3D Corneal Shield */
export const ShieldEye3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-shield`} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#35D2E0" />
          <stop offset="55%" stopColor="#087F8C" />
          <stop offset="100%" stopColor="#104068" />
        </linearGradient>
      </defs>
      <path d="M32 7L52 15V31C52 44.5 43.2 53.5 32 57.5C20.8 53.5 12 44.5 12 31V15L32 7Z" fill={`url(#${id}-shield)`} stroke="#A8F6FC" strokeWidth="1.8" />
      <path d="M18 31C21.5 24.5 26.8 21.5 32 21.5C37.2 21.5 42.5 24.5 46 31C42.5 37.5 37.2 40.5 32 40.5C26.8 40.5 21.5 37.5 18 31Z" fill="#FFFFFF" />
      <circle cx="32" cy="31" r="5.5" fill="#1769AA" />
      <circle cx="32" cy="31" r="2.4" fill="#0B1F35" />
      <circle cx="30" cy="29" r="1.2" fill="#FFFFFF" />
    </svg>
  );
};

/** 11. رعاية ما بعد الجراحة — 3D Sterile Eye Patch */
export const EyePatch3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-pad`} x1="12" y1="16" x2="52" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#E1F2F8" />
          <stop offset="100%" stopColor="#B6D9E7" />
        </linearGradient>
      </defs>
      <path d="M12 22L52 42" stroke="#087F8C" strokeWidth="4" strokeLinecap="round" />
      <rect x="14" y="18" width="36" height="28" rx="14" transform="rotate(-12 32 32)" fill={`url(#${id}-pad)`} stroke="#8BC6DC" strokeWidth="2" />
      <path d="M32 25V39M25 32H39" stroke="#087F8C" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
};

/** 12. جراحة العيون والطوارئ — 3D Surgical Ophthalmology Kit */
export const EyeSurgeryKit3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-case`} x1="10" y1="18" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#25B8C7" />
          <stop offset="60%" stopColor="#087F8C" />
          <stop offset="100%" stopColor="#0B3B59" />
        </linearGradient>
      </defs>
      <path d="M23 18V14C23 11.8 24.8 10 27 10H37C39.2 10 41 11.8 41 14V18" stroke="#1769AA" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="8" y="18" width="48" height="36" rx="10" fill={`url(#${id}-case)`} stroke="#98F0F8" strokeWidth="1.5" />
      <path d="M16 36C21 28 26.5 25 32 25C37.5 25 43 28 48 36C43 44 37.5 47 32 47C26.5 47 21 44 16 36Z" fill="#FFFFFF" />
      <circle cx="32" cy="36" r="6" fill="#1769AA" />
      <circle cx="32" cy="36" r="2.6" fill="#0B1F35" />
      <circle cx="30" cy="34" r="1.2" fill="#FFFFFF" />
    </svg>
  );
};

/** 13. طب عيون الأطفال والحول — 3D Pediatric Eye Care */
export const PediatricEye3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="28" cy="24" r="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EBFBFF" />
          <stop offset="65%" stopColor="#9CE9F5" />
          <stop offset="100%" stopColor="#25B8C7" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill={`url(#${id}-bg)`} stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="32" cy="32" r="14" fill="#FFFFFF" />
      <circle cx="32" cy="32" r="8.5" fill="#1769AA" />
      <circle cx="32" cy="32" r="4" fill="#0B1F35" />
      <circle cx="29" cy="28.5" r="2.5" fill="#FFFFFF" />
      <circle cx="35.5" cy="35" r="1.2" fill="#FFFFFF" />
      <path d="M16 20L19 23M48 20L45 23M32 13V17" stroke="#087F8C" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
};

/** 14. العلاج الدوائي والمكملات — 3D Ophthalmic Capsules */
export const OphthalmicPill3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-top`} x1="16" y1="12" x2="36" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4DE8F6" />
          <stop offset="100%" stopColor="#087F8C" />
        </linearGradient>
        <linearGradient id={`${id}-bot`} x1="28" y1="30" x2="48" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#B8DCE8" />
        </linearGradient>
      </defs>
      <g transform="rotate(-45 32 32)">
        <path d="M22 20C22 14.5 26.5 10 32 10C37.5 10 42 14.5 42 20V32H22V20Z" fill={`url(#${id}-top)`} />
        <path d="M22 32H42V44C42 49.5 37.5 54 32 54C26.5 54 22 49.5 22 44V32Z" fill={`url(#${id}-bot)`} stroke="#8BC5DA" strokeWidth="1.4" />
        <path d="M26 18V44" stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
};

/** 15. مركز جراحات اليوم الواحد — 3D Eye Hospital */
export const EyeHospital3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-bldg`} x1="12" y1="12" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#DCEFF7" />
          <stop offset="100%" stopColor="#94C5DB" />
        </linearGradient>
      </defs>
      <rect x="12" y="14" width="40" height="42" rx="8" fill={`url(#${id}-bldg)`} stroke="#6AA9C8" strokeWidth="1.8" />
      <rect x="20" y="7" width="24" height="10" rx="4" fill="#087F8C" />
      <path d="M25 12C27.5 9.8 29.8 9 32 9C34.2 9 36.5 9.8 39 12C36.5 14.2 34.2 15 32 15C29.8 15 27.5 14.2 25 12Z" fill="#FFFFFF" />
      <circle cx="32" cy="12" r="1.8" fill="#1769AA" />
      <rect x="18" y="23" width="8" height="7" rx="2" fill="#25B8C7" />
      <rect x="38" y="23" width="8" height="7" rx="2" fill="#25B8C7" />
      <rect x="18" y="34" width="8" height="7" rx="2" fill="#1769AA" />
      <rect x="38" y="34" width="8" height="7" rx="2" fill="#1769AA" />
      <rect x="27" y="42" width="10" height="14" rx="2.5" fill="#0B1F35" />
    </svg>
  );
};

/** 16. تجهيز ما قبل العمليات — 3D Clinical Vitals */
export const PreOpVitals3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-heart`} x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7A8A" />
          <stop offset="55%" stopColor="#E11D48" />
          <stop offset="100%" stopColor="#9F1239" />
        </linearGradient>
      </defs>
      <path d="M32 54C32 54 10 40.5 10 24C10 16.8 15.8 11 22.8 11C26.9 11 30.5 13 32 16C33.5 13 37.1 11 41.2 11C48.2 11 54 16.8 54 24C54 40.5 32 54 32 54Z" fill={`url(#${id}-heart)`} />
      <path d="M17 31H24L27.5 23L32 38L36 27L39 31H47" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/** 17. العصب البصري والأعصاب — 3D Optic Nerve & Globe */
export const OpticNerve3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <radialGradient id={`${id}-globe`} cx="24" cy="24" r="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#C8EBF6" />
          <stop offset="100%" stopColor="#4DA5C4" />
        </radialGradient>
      </defs>
      <path d="M39 36C46 40 50 46 56 50M37 40C44 46 47 52 50 56M41 31C48 33 53 36 57 40" stroke="#087F8C" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="26" cy="28" r="18" fill={`url(#${id}-globe)`} stroke="#1769AA" strokeWidth="2" />
      <circle cx="20" cy="25" r="7.5" fill="#087F8C" />
      <circle cx="20" cy="25" r="3.4" fill="#0B1F35" />
      <circle cx="18.5" cy="23.5" r="1.4" fill="#FFFFFF" />
    </svg>
  );
};

/** 18. استشارة طب العيون — 3D Ophthalmologist Consultation */
export const Stethoscope3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-metal`} x1="12" y1="10" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#35D2E0" />
          <stop offset="55%" stopColor="#087F8C" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
      </defs>
      <path d="M16 12V24C16 31.7 22.3 38 30 38C37.7 38 44 31.7 44 24V12" stroke={`url(#${id}-metal)`} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M30 38V44C30 49.5 34.5 54 40 54C45.5 54 50 49.5 50 44V35" stroke="#1769AA" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="31" r="7.5" fill="#FFFFFF" stroke="#087F8C" strokeWidth="3" />
      <circle cx="50" cy="31" r="3" fill="#25B8C7" />
      <circle cx="16" cy="12" r="3" fill="#0B1F35" />
      <circle cx="44" cy="12" r="3" fill="#0B1F35" />
    </svg>
  );
};

/** 19. لوحة فحص حدة الإبصار — 3D Snellen Eye Chart */
export const EyeChart3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-board`} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D6EDF6" />
        </linearGradient>
      </defs>
      <rect x="13" y="10" width="38" height="46" rx="7" fill={`url(#${id}-board)`} stroke="#6AA9C8" strokeWidth="2" />
      <rect x="23" y="6" width="18" height="7" rx="3.5" fill="#087F8C" />
      <path d="M25 21H38M25 21V31M25 26H35M25 31H38" stroke="#0B1F35" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 39H42M24 45H40" stroke="#1769AA" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M27 50H37" stroke="#25B8C7" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

/** 20. متابعة المريض — 3D Patient Care Focus */
export const PatientEye3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-user`} x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#35D2E0" />
          <stop offset="100%" stopColor="#1769AA" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="23" r="11" fill={`url(#${id}-user)`} />
      <path d="M13 52C13 42.6 21.5 36 32 36C42.5 36 51 42.6 51 52" fill={`url(#${id}-user)`} />
      <circle cx="28.5" cy="19.5" r="2.2" fill="#FFFFFF" fillOpacity="0.65" />
    </svg>
  );
};

/** 21. العدسات اللاصقة وزراعة العدسة — 3D Intraocular / Contact Lens */
export const ContactLens3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <radialGradient id={`${id}-dome`} cx="32" cy="24" r="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#8EEFF8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#087F8C" stopOpacity="0.9" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="46" rx="22" ry="7" fill="#0B1F35" fillOpacity="0.14" />
      <path d="M12 40C12 24 20.5 14 32 14C43.5 14 52 24 52 40C46 44 39 46 32 46C25 46 18 44 12 40Z" fill={`url(#${id}-dome)`} stroke="#1769AA" strokeWidth="1.8" />
      <ellipse cx="32" cy="40" rx="20" ry="6" fill="#EBFBFF" fillOpacity="0.55" stroke="#25B8C7" strokeWidth="1.5" />
      <path d="M20 27C23 22 27 19 32 19" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
};

/** 22. فحص حرارة والتهاب العين — 3D Ocular Surface Probe */
export const OcularProbe3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-tube`} x1="20" y1="8" x2="44" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#B8DCE8" />
        </linearGradient>
      </defs>
      <rect x="25" y="8" width="14" height="34" rx="7" fill={`url(#${id}-tube)`} stroke="#1769AA" strokeWidth="2" />
      <circle cx="32" cy="45" r="10" fill="#087F8C" stroke="#FFFFFF" strokeWidth="2" />
      <rect x="29.5" y="18" width="5" height="24" rx="2.5" fill="#25B8C7" />
      <circle cx="32" cy="45" r="4.5" fill="#7BF7FF" />
    </svg>
  );
};

/** 23. طوارئ العيون العاجلة — 3D Eye Emergency Unit */
export const EyeEmergency3D: React.FC<EyeCareIconProps> = ({ size = 28, className }) => {
  const id = useId();
  return (
    <svg {...svgProps(size, className)}>
      <defs>
        <linearGradient id={`${id}-van`} x1="8" y1="18" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#DCEEF7" />
          <stop offset="100%" stopColor="#92C1D9" />
        </linearGradient>
      </defs>
      <rect x="20" y="12" width="10" height="6" rx="3" fill="#EF4444" />
      <path d="M8 22C8 19.8 9.8 18 12 18H40L52 28V44C52 46.2 50.2 48 48 48H12C9.8 48 8 46.2 8 44V22Z" fill={`url(#${id}-van)`} stroke="#1769AA" strokeWidth="1.8" />
      <path d="M40 22H46L51 28H40V22Z" fill="#25B8C7" />
      <path d="M20 33V33M16 33H28M22 27V39" stroke="#087F8C" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="18" cy="48" r="5.5" fill="#0B1F35" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="43" cy="48" r="5.5" fill="#0B1F35" stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  );
};

/** 3D Ophthalmology & Eye Surgery icon dictionary (keys match existing DB icon_name values). */
export const SERVICE_3D_ICONS: Record<string, React.FC<EyeCareIconProps>> = {
  Eye: Eye3D,
  Zap: LasikLaser3D,
  ScanEye: ScanEye3D,
  Droplets: EyeDrops3D,
  Microscope: Microscope3D,
  Glasses: Glasses3D,
  Syringe: Syringe3D,
  Scan: FundusScan3D,
  Tablet: ContactLens3D,
  Bandage: EyePatch3D,
  Activity: EyeActivity3D,
  ShieldCheck: ShieldEye3D,
  Baby: PediatricEye3D,
  ClipboardList: EyeChart3D,
  BriefcaseMedical: EyeSurgeryKit3D,
  Hospital: EyeHospital3D,
  Pill: OphthalmicPill3D,
  HeartPulse: PreOpVitals3D,
  Brain: OpticNerve3D,
  Stethoscope: Stethoscope3D,
  UserRound: PatientEye3D,
  Thermometer: OcularProbe3D,
  Ambulance: EyeEmergency3D,
};

/** Human-readable Arabic labels for tooltips in the admin service icon selector. */
export const SERVICE_3D_ICON_LABELS: Record<string, string> = {
  Eye: 'فحص العين',
  Zap: 'ليزك وليزر',
  ScanEye: 'أشعة القرنية OCT',
  Droplets: 'قطرات وجفاف',
  Microscope: 'ميكروسكوب جراحي',
  Glasses: 'قياس نظر ونظارات',
  Syringe: 'حقن الشبكية',
  Scan: 'تصوير قاع العين',
  Tablet: 'عدسات وزراعة قرنية',
  Bandage: 'ما بعد الجراحة',
  Activity: 'ضغط العين والشبكية',
  ShieldCheck: 'حماية العين',
  Baby: 'عيون الأطفال',
  ClipboardList: 'مخطط الإبصار',
  BriefcaseMedical: 'جراحات العيون',
  Hospital: 'عمليات اليوم الواحد',
  Pill: 'علاج دوائي',
  HeartPulse: 'فحص ما قبل العملية',
  Brain: 'العصب البصري',
  Stethoscope: 'استشارة طبية',
  UserRound: 'متابعة المريض',
  Thermometer: 'سطح العين',
  Ambulance: 'طوارئ العيون',
};

const LEGACY_3D_ALIASES: Record<string, React.FC<EyeCareIconProps>> = {
  ZapIcon: LasikLaser3D,
  ActivityIcon: EyeActivity3D,
  MicroscopeIcon: Microscope3D,
  Heart: PreOpVitals3D,
  Bone: OpticNerve3D,
};

export const getService3DIcon = (iconName?: string): React.FC<EyeCareIconProps> => {
  if (!iconName) return Eye3D;
  return SERVICE_3D_ICONS[iconName] || LEGACY_3D_ALIASES[iconName] || Eye3D;
};
