// Dashboard Backup tab: full export to a JSON file and restore from one, through the
// admin-only server functions in src/lib/backup.functions.ts.
import { exportFullBackup, restoreFullBackup } from '@/lib/backup.functions';

export async function downloadFullBackup(fileName: string): Promise<void> {
  const result = await exportFullBackup().catch((e) => ({ ok: false as const, error: String(e?.message || e) }));
  if (!result.ok) { alert(result.error); return; }
  const blob = new Blob([JSON.stringify(result.data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(fileName || 'barada_backup').trim()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function restoreFromFile(file: File): Promise<void> {
  let backup: any;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    alert('الملف ده مش بصيغة JSON صحيحة.');
    return;
  }
  if (backup?.format !== 'barrada-backup-v1') {
    alert('الملف ده مش نسخة احتياطية من النظام الحالي. استخدم ملف من فولدر النسخ الاحتياطية على Google Drive أو من زرار "تصدير".');
    return;
  }
  const when = backup.exported_at ? new Date(backup.exported_at).toLocaleString('ar-EG') : 'غير معروف';
  if (!confirm(`هيتم استرجاع البيانات من نسخة بتاريخ ${when}.\n\nأي بيانات اتمسحت أو اتعدلت هترجع زي ما كانت في النسخة، والبيانات اللي اتضافت بعد النسخة هتفضل موجودة.\n\nمتأكد؟`)) return;

  const result = await restoreFullBackup({ data: { backup } }).catch((e) => ({ ok: false as const, error: String(e?.message || e) }));
  if (!result.ok) { alert(result.error); return; }
  const restored = result.data?.restored ?? {};
  const total = Object.values(restored).reduce((sum: number, v) => sum + (typeof v === 'number' ? v : 0), 0);
  alert(`تم استرجاع البيانات بنجاح (${total} سجل). هيتم تحديث الصفحة.`);
  window.location.reload();
}
