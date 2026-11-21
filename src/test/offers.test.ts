import { describe, it, expect } from 'vitest';
import {
  calculateDiscountPercentage,
  filterHomepageOffers,
  getOfferLifecycleStatus,
  hasOfferPermission,
  mapOfferRow,
  safeImageUrl,
  validateOfferImageFile,
  validateOfferInput,
  type DoctorLookupItem,
  type OfferFormInput,
  type OfferPermissionId,
  type OfferRecord,
} from '@/barada/offers';
import {
  canAccessSection,
  firstAccessibleSection,
  OFFER_PERMISSIONS,
  SECTION_PERMISSIONS,
} from '@/barada/permissions';
import { localIdFromUuid } from '@/barada/publicData';

const doc1Uuid = '11111111-1111-4111-8111-111111111111';
const doc2Uuid = '22222222-2222-4222-8222-222222222222';
const deletedDocUuid = '99999999-9999-4999-8999-999999999999';

const doctors: DoctorLookupItem[] = [
  { id: localIdFromUuid(doc1Uuid), dbId: doc1Uuid, name: 'د. أحمد برادة', specialty: 'استشاري جراحة العيون' },
  { id: localIdFromUuid(doc2Uuid), dbId: doc2Uuid, name: 'د. سارة محمد', specialty: 'استشاري القرنية والليزك' },
];

const makeOffer = (overrides: Partial<OfferRecord> = {}): OfferRecord => ({
  id: 'offer-1',
  title: 'عرض فحص الليزك الشامل',
  doctorId: doc1Uuid,
  doctorLocalId: localIdFromUuid(doc1Uuid),
  doctorName: 'د. أحمد برادة',
  description: 'يشمل فحص القرنية وقياس النظر',
  offerPrice: 400,
  originalPrice: 800,
  discountPercentage: 50,
  imageUrl: 'https://example.supabase.co/storage/v1/object/public/offer-images/offers/1.jpg',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  isActive: true,
  showOnHomepage: true,
  displayOrder: 1,
  buttonText: 'احجز الآن',
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-01T10:00:00Z',
  createdBy: null,
  ...overrides,
});

describe('offers helpers & validation', () => {
  it('calculates discount percentage automatically when original price > offer price', () => {
    expect(calculateDiscountPercentage(500, 1000)).toBe(50);
    expect(calculateDiscountPercentage(750, 1000)).toBe(25);
    expect(calculateDiscountPercentage(1000, 1000)).toBeNull();
    expect(calculateDiscountPercentage(1200, 1000)).toBeNull();
    expect(calculateDiscountPercentage(0, 1000)).toBeNull();
    expect(calculateDiscountPercentage(500, '')).toBeNull();
  });

  it('validates offer form input fields strictly', () => {
    const valid: OfferFormInput = {
      title: 'عرض الفحص',
      doctorId: doc1Uuid,
      description: 'وصف',
      offerPrice: 500,
      originalPrice: 800,
      discountPercentage: 38,
      startDate: '2026-05-01',
      endDate: '2026-05-30',
      isActive: true,
      showOnHomepage: true,
    };
    expect(validateOfferInput(valid)).toEqual({ valid: true });

    expect(validateOfferInput({ ...valid, title: '   ' }).valid).toBe(false);
    expect(validateOfferInput({ ...valid, doctorId: '' }).valid).toBe(false);
    expect(validateOfferInput({ ...valid, offerPrice: 0 }).valid).toBe(false);
    expect(validateOfferInput({ ...valid, originalPrice: 400 }).valid).toBe(false);
    expect(validateOfferInput({ ...valid, originalPrice: 500 }).valid).toBe(false);
    expect(validateOfferInput({ ...valid, endDate: '2026-04-30' }).valid).toBe(false);
    expect(validateOfferInput({ ...valid, startDate: 'invalid' }).valid).toBe(false);
    expect(validateOfferInput({ ...valid, discountPercentage: 120 }).valid).toBe(false);
  });

  it('validates offer image format and size', () => {
    const ok = new File([new Uint8Array(1024)], 'offer.png', { type: 'image/png' });
    expect(validateOfferImageFile(ok)).toBeNull();

    const badMime = new File([new Uint8Array(512)], 'offer.svg', { type: 'image/svg+xml' });
    expect(validateOfferImageFile(badMime)).not.toBeNull();

    const tooBig = new File([new Uint8Array(6 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    expect(validateOfferImageFile(tooBig)).not.toBeNull();
  });

  it('sanitizes image URLs to http/https only', () => {
    expect(safeImageUrl('https://cdn.example.com/img.png')).toBe('https://cdn.example.com/img.png');
    expect(safeImageUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('data:image/png;base64,abc')).toBe('');
    expect(safeImageUrl('')).toBe('');
  });

  it('maps database rows and computes lifecycle status', () => {
    const byUuid = new Map([[doc1Uuid, { name: 'د. أحمد برادة', specialty: 'العيون' }]]);
    const mapped = mapOfferRow(
      {
        id: 'o-1',
        title: 'عرض متابعة',
        doctor_id: doc1Uuid,
        offer_price: 300,
        original_price: 600,
        start_date: '2026-05-01',
        end_date: '2026-05-20',
        is_active: true,
        show_on_homepage: true,
        display_order: 2,
        button_text: '',
      },
      byUuid,
    );
    expect(mapped.doctorName).toBe('د. أحمد برادة');
    expect(mapped.discountPercentage).toBe(50);
    expect(mapped.buttonText).toBe('احجز الآن');

    expect(getOfferLifecycleStatus(mapped, '2026-05-10')).toBe('active');
    expect(getOfferLifecycleStatus(mapped, '2026-04-20')).toBe('upcoming');
    expect(getOfferLifecycleStatus(mapped, '2026-05-25')).toBe('expired');
    expect(getOfferLifecycleStatus({ ...mapped, isActive: false }, '2026-05-10')).toBe('inactive');
  });

  it('filters homepage offers by active, homepage flag, date range, and existing doctor, sorted by displayOrder', () => {
    const list: OfferRecord[] = [
      makeOffer({ id: 'active-2', displayOrder: 2 }),
      makeOffer({ id: 'active-1', displayOrder: 1, doctorId: doc2Uuid, doctorLocalId: localIdFromUuid(doc2Uuid) }),
      makeOffer({ id: 'inactive', isActive: false, displayOrder: 0 }),
      makeOffer({ id: 'hidden', showOnHomepage: false, displayOrder: 0 }),
      makeOffer({ id: 'expired', endDate: '2026-05-09', displayOrder: 0 }),
      makeOffer({ id: 'upcoming', startDate: '2026-05-11', displayOrder: 0 }),
      makeOffer({ id: 'missing-doc', doctorId: deletedDocUuid, doctorLocalId: localIdFromUuid(deletedDocUuid), displayOrder: 0 }),
    ];

    const visible = filterHomepageOffers(list, doctors, '2026-05-10');
    expect(visible.map((o) => o.id)).toEqual(['active-1', 'active-2']);
  });
});

describe('offers employee permissions', () => {
  it('defines 6 independent permissions grouped under العروض', () => {
    expect(OFFER_PERMISSIONS).toHaveLength(6);
    expect(OFFER_PERMISSIONS.every((p) => p.group === 'العروض')).toBe(true);
    expect(SECTION_PERMISSIONS.offers).toEqual([
      'view_offers',
      'create_offers',
      'edit_offers',
      'delete_offers',
      'manage_offer_visibility',
      'upload_offer_images',
    ]);
  });

  it('grants full offer permissions to admins and only assigned permissions to staff', () => {
    const admin = { role: 'admin' as const, permissions: [] };
    for (const perm of OFFER_PERMISSIONS) {
      expect(hasOfferPermission(admin, perm.id as OfferPermissionId)).toBe(true);
    }
    expect(canAccessSection(admin, 'offers')).toBe(true);

    const viewOnly = { role: 'staff' as const, permissions: ['view_offers'] };
    expect(canAccessSection(viewOnly, 'offers')).toBe(true);
    expect(hasOfferPermission(viewOnly, 'view_offers')).toBe(true);
    expect(hasOfferPermission(viewOnly, 'create_offers')).toBe(false);
    expect(hasOfferPermission(viewOnly, 'edit_offers')).toBe(false);
    expect(hasOfferPermission(viewOnly, 'delete_offers')).toBe(false);
    expect(hasOfferPermission(viewOnly, 'manage_offer_visibility')).toBe(false);
    expect(hasOfferPermission(viewOnly, 'upload_offer_images')).toBe(false);

    const noOffers = { role: 'staff' as const, permissions: ['manage_bookings', 'manage_doctors'] };
    expect(canAccessSection(noOffers, 'offers')).toBe(false);

    expect(firstAccessibleSection({ role: 'staff', permissions: ['view_offers'] })).toBe('offers');
  });
});
