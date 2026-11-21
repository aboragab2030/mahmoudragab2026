import { describe, it, expect } from 'vitest';
import { applySettingsRow, mapDoctorRow, settingsToRow } from '@/barada/publicData';

const defaults = {
  appName: 'مركز براده للعيون',
  heroTitle: 'عنوان افتراضي',
  phones: ['01000000000'],
  language: 'ar',
  paymentMethods: [{ id: '1', type: 'instapay', label: 'x', detail: 'y' }],
};

describe('public site data from the database', () => {
  it('uses the saved database value instead of the built-in one', () => {
    const next = applySettingsRow(defaults, { hero_title: 'مركز برادة للعيون بالأقصر', phones: ['0952222222'] });
    expect(next.heroTitle).toBe('مركز برادة للعيون بالأقصر');
    expect(next.phones).toEqual(['0952222222']);
  });

  it('keeps the current value when the database field is empty', () => {
    const next = applySettingsRow(defaults, { hero_title: null, app_name: 'مركز براده للعيون' });
    expect(next.heroTitle).toBe('عنوان افتراضي');
  });

  it('does not touch payment methods when the public settings row has none', () => {
    const next = applySettingsRow(defaults, { hero_title: 'جديد' });
    expect(next.paymentMethods).toEqual(defaults.paymentMethods);
  });

  it('saves every settings field, including payment methods', () => {
    const row = settingsToRow({ ...defaults, heroTitle: 'جديد' });
    expect(row.hero_title).toBe('جديد');
    expect(row.payment_methods).toEqual(defaults.paymentMethods);
  });

  it('reads a doctor row with its daily and hourly limits', () => {
    const doc = mapDoctorRow({ id: '00000000-0000-0000-0000-0000000000ff', name: 'د. أحمد', specialty: 'شبكية', max_patients: 20, patients_per_hour: 4, fee: '300', rating: null });
    expect(doc.id).toBe(255);
    expect(doc.maxPatients).toBe(20);
    expect(doc.patientsPerHour).toBe(4);
    expect(doc.fee).toBe(300);
  });
});

describe('contracting companies from the database', () => {
  it('shows a company from the public list with its required documents and no manager details', async () => {
    const { mapContractingRow } = await import('@/barada/publicData');
    const c = mapContractingRow({ id: 7, name: 'نقابة المهندسين', documents: ['كارنيه النقابة'] });
    expect(c).toEqual({ id: 7, name: 'نقابة المهندسين', documents: ['كارنيه النقابة'], managerName: undefined, managerPhone: undefined });
  });

  it('saves the company name, documents and manager contact to the database columns', async () => {
    const { contractingToRow } = await import('@/barada/publicData');
    expect(contractingToRow({ name: 'أكسا', documents: ['كارنيه'], managerName: 'أ. سارة', managerPhone: '01234567890' }))
      .toEqual({ name: 'أكسا', documents: ['كارنيه'], manager_name: 'أ. سارة', manager_phone: '01234567890' });
  });
});
