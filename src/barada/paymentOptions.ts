// Which options the booking "طريقة الدفع" step offers, based on the
// payment methods saved in the dashboard settings (cash at the center included).

export const paymentOptionsFor = (methods: { type: string }[] | null | undefined) => ({
  cash: (methods || []).some(m => m.type === 'cash'),
  instapay: (methods || []).some(m => m.type === 'instapay'),
  wallet: (methods || []).some(m => m.type === 'wallet'),
});

// InstaPay transfers must include a receipt photo (or PDF) up to 5 MB.
export const RECEIPT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export function receiptError(file: { name: string; size: number } | null | undefined): string | null {
  if (!file) return 'يرجى إرفاق صورة إيصال التحويل (إلزامي)';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!RECEIPT_EXTENSIONS.includes(ext)) return 'صيغة الإيصال غير مدعومة. استخدم صورة (JPG / PNG / WEBP) أو PDF';
  if (file.size > RECEIPT_MAX_BYTES) return 'حجم الإيصال أكبر من 5 ميغابايت';
  return null;
}
