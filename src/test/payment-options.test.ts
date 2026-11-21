import { describe, it, expect } from 'vitest';
import { paymentOptionsFor, receiptError } from '@/barada/paymentOptions';

describe('booking payment options follow dashboard settings', () => {
  it('hides InstaPay when it is removed from settings', () => {
    expect(paymentOptionsFor([{ type: 'wallet' }]).instapay).toBe(false);
  });
  it('hides the wallet when it is removed from settings', () => {
    expect(paymentOptionsFor([{ type: 'instapay' }]).wallet).toBe(false);
  });
  it('shows cash at the center only when it is chosen in settings', () => {
    expect(paymentOptionsFor([{ type: 'instapay' }]).cash).toBe(false);
    expect(paymentOptionsFor([{ type: 'cash' }]).cash).toBe(true);
  });
  it('shows nothing when no methods are set', () => {
    expect(paymentOptionsFor([])).toEqual({ cash: false, instapay: false, wallet: false });
  });
  it('shows all three when all are set', () => {
    expect(paymentOptionsFor([{ type: 'cash' }, { type: 'instapay' }, { type: 'wallet' }])).toEqual({ cash: true, instapay: true, wallet: true });
  });
});

describe('InstaPay receipt is required', () => {
  it('rejects a transfer without a receipt', () => {
    expect(receiptError(null)).not.toBeNull();
  });
  it('accepts a photo up to 5 MB', () => {
    expect(receiptError({ name: 'r.jpg', size: 5 * 1024 * 1024 })).toBeNull();
  });
  it('rejects a receipt over 5 MB', () => {
    expect(receiptError({ name: 'r.png', size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
  });
  it('rejects unsupported file types', () => {
    expect(receiptError({ name: 'r.exe', size: 100 })).not.toBeNull();
  });
});
