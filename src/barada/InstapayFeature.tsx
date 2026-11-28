import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, CheckCircle, XCircle, AlertTriangle, FileText, History, RefreshCw, X, Printer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { withMinSpin } from '@/lib/refreshSpin';
import { INSTAPAY_STATUS_LABELS, InstapayStatus, duplicateTransactionRefs, isDuplicateRef, reviewOutcome, ReviewAction } from './instapayRules';

export interface InstapaySubmissionInput { transactionRef: string; declaredAmount?: number; file?: File | null }
export interface InstapayResult { bookingRef?: string; amountDue?: number; error?: string }

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

/** Uploads the required receipt and records the payment submission for a just-created booking. */
export async function submitInstapay(bookingId: string, phone: string, input: InstapaySubmissionInput): Promise<InstapayResult> {
  let evidencePath: string | null = null;
  if (input.file) {
    const ext = (input.file.name.split('.').pop() || '').toLowerCase();
    if (ALLOWED_EXT.includes(ext) && input.file.size <= 5 * 1024 * 1024) {
      const path = `${bookingId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('instapay-evidence').upload(path, input.file, { contentType: input.file.type });
      if (!error) evidencePath = path;
    }
  }
  if (!evidencePath) return { error: 'evidence upload failed' };
  const { data, error } = await supabase.rpc('submit_instapay_payment', {
    _booking_id: bookingId, _phone: phone, _transaction_ref: input.transactionRef,
    _declared_amount: input.declaredAmount ?? null, _evidence_path: evidencePath,
  } as any);
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { bookingRef: row?.booking_ref, amountDue: row?.amount_due };
}

const statusClass = (s: string) =>
  s === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
  : s === 'REJECTED' || s === 'MISMATCH' ? 'bg-red-50 text-red-700 border-red-200'
  : s === 'REVIEW_REQUIRED' ? 'bg-amber-50 text-amber-700 border-amber-200'
  : 'bg-[#EBF8FA] text-[#087F8C] border-[#B8E6EC]';

/** Shown to the patient right after an InstaPay booking. */
export const InstapaySubmittedDialog = ({ result, onClose }: { result: InstapayResult | null; onClose: () => void }) => {
  if (!result) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-md w-full p-8 text-center relative" dir="rtl">
        <button onClick={onClose} aria-label="إغلاق" className="absolute top-4 left-4 p-2 rounded-full hover:bg-[#F5FAFC] text-[#718394] hover:text-[#172B3A] transition-colors"><X size={20} /></button>
        {result.error ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={34} />
            </div>
            <h3 className="text-lg font-black text-[#172B3A] mb-2">تم تسجيل الحجز</h3>
            <p className="text-sm text-[#718394] font-bold leading-relaxed">تعذر تسجيل بيانات التحويل. يرجى التواصل مع المركز لمراجعة الدفع.</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-[#EBF8FA] border border-[#DFEAF0] text-[#087F8C] flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={34} />
            </div>
            <h3 className="text-lg font-black text-[#172B3A] mb-2">رقم الحجز: <span dir="ltr" className="fv-mono text-[#087F8C]">{result.bookingRef}</span></h3>
            <p className="text-sm text-[#172B3A] font-bold mb-2 leading-relaxed">تم استلام بيانات التحويل المرتبطة بالحجز رقم <span dir="ltr" className="fv-mono">{result.bookingRef}</span>. التحويل قيد المراجعة ولم يتم تأكيد الدفع بعد.</p>
            {typeof result.amountDue === 'number' && <p className="text-xs text-[#087F8C] font-black fv-num">المبلغ المستحق: {result.amountDue} ج.م</p>}
            <p className="text-xs text-[#718394] font-medium mt-3">احتفظ برقم الحجز لمتابعة حالة الدفع من صفحة حجوزاتي.</p>
          </>
        )}
        <button onClick={onClose} className="mt-6 w-full fv-btn-primary font-black py-3.5 rounded-2xl">حسناً</button>
      </div>
    </div>
  );
};

/** Patient lookup by booking reference + phone. Shows payment status only. */
export const InstapayStatusLookup = () => {
  const [ref, setRef] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ status: string; reason?: string | null; amount_due?: number } | null | 'none'>(null);
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ref.trim() || phone.trim().length < 11) return;
    setLoading(true);
    const { data } = await supabase.rpc('get_instapay_status', { _booking_ref: ref, _phone: phone } as any);
    const row = Array.isArray(data) ? data[0] : null;
    setRes(row || 'none');
    setLoading(false);
  };
  return (
    <div className="max-w-3xl mx-auto px-4 pb-12" dir="rtl">
      <form onSubmit={check} className="bg-white rounded-3xl border border-[#DFEAF0] p-6 shadow-[0_14px_34px_-22px_rgba(11,31,53,0.16)]">
        <h3 className="font-black text-[#172B3A] mb-1">متابعة حالة الدفع (إنستاباي)</h3>
        <p className="text-xs text-[#718394] font-bold mb-4">أدخل رقم الحجز ورقم الهاتف المسجل في الحجز.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input aria-label="رقم الحجز" value={ref} onChange={e => setRef(e.target.value)} placeholder="BR-XXXXXXXX" dir="ltr" className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-2xl p-3 font-bold text-[#172B3A] fv-mono outline-hidden focus:border-[#087F8C] focus:ring-2 focus:ring-[#25B8C7]/20" />
          <input aria-label="رقم الهاتف" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="01xxxxxxxxx" dir="ltr" inputMode="numeric" className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-2xl p-3 font-bold text-[#172B3A] fv-mono outline-hidden focus:border-[#087F8C] focus:ring-2 focus:ring-[#25B8C7]/20" />
          <button disabled={loading} className="fv-btn-primary rounded-2xl font-black py-3 flex items-center justify-center gap-2 disabled:opacity-60"><Search size={16} /> استعلام</button>
        </div>
        {res === 'none' && <p className="mt-4 text-sm font-bold text-[#718394]">لا توجد بيانات مطابقة.</p>}
        {res && res !== 'none' && (
          <div className={`mt-4 border rounded-2xl p-4 text-sm font-bold ${statusClass(res.status)}`}>
            الحالة: {INSTAPAY_STATUS_LABELS[res.status as InstapayStatus] || res.status}
            {res.reason && <p className="mt-1 font-medium">السبب: {res.reason}</p>}
          </div>
        )}
      </form>
    </div>
  );
};

interface Submission {
  id: string; booking_id: string; booking_ref: string; transaction_ref: string; declared_amount: number | null; amount_due: number;
  verified_amount: number | null; evidence_path: string | null; status: InstapayStatus; reason: string | null;
  reviewed_by_name: string | null; reviewed_at: string | null; created_at: string;
}
interface AuditEvent { id: string; event_type: string; actor_name: string; previous_status: string | null; new_status: string | null; reason: string | null; created_at: string }

/** Accounting review panel, placed inside the existing payments section. */
export const InstapayReviewPanel = ({ cardClass, inputClass, onPrint, isAdmin = false }: { cardClass: string; inputClass: string; onPrint?: (title: string, content: string) => void; isAdmin?: boolean }) => {
  const [rows, setRows] = useState<Submission[]>([]);
  const [bookings, setBookings] = useState<Record<string, any>>({});
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [doctor, setDoctor] = useState('');
  const [listMsg, setListMsg] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [active, setActive] = useState<Submission | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditEvent[]>([]);
  const [verified, setVerified] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const load = useCallback(async (manualSpin = false) => {
    setRefreshing(true);
    try {
      const work = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setAllowed(false); return; }
        const { data: ok, error: permError } = await supabase.rpc('can_review_instapay', { _uid: user.id } as any);
        const canAccess = permError ? isAdmin : Boolean(ok || isAdmin);
        setAllowed(canAccess);
        if (!canAccess) return;
        const { data, error } = await supabase.from('instapay_submissions' as any).select('*').order('created_at', { ascending: false });
        if (error) { setListMsg('تعذر تحديث القائمة. حاول مرة أخرى.'); return; }
        const list = (data || []) as unknown as Submission[];
        setRows(list);
        const ids = [...new Set(list.map(r => r.booking_id).filter(Boolean))];
        if (ids.length) {
          const { data: bk } = await supabase.from('bookings').select('id, patient_name, phone, doctor_name, service, date, time').in('id', ids);
          setBookings(Object.fromEntries((bk || []).map((b: any) => [b.id, b])));
        } else {
          setBookings({});
        }
        setLastUpdated(new Date());
      };
      if (manualSpin) {
        await withMinSpin(work);
      } else {
        await work();
      }
    } finally {
      setRefreshing(false);
    }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);
  // Keep the list current without a manual click (every 30 seconds while the panel is open).
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  const dups = useMemo(() => duplicateTransactionRefs(rows), [rows]);
  const doctorOptions = useMemo(() => [...new Set(Object.values(bookings).map((b: any) => b?.doctor_name).filter(Boolean))].sort() as string[], [bookings]);
  const filtered = rows.filter(r => {
    const q = search.trim().toLowerCase();
    if (q && !r.booking_ref.toLowerCase().includes(q) && !r.transaction_ref.toLowerCase().includes(q)) return false;
    if (status && r.status !== status) return false;
    if (doctor && bookings[r.booking_id]?.doctor_name !== doctor) return false;
    const d = r.created_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  const open = async (r: Submission) => {
    setActive(r); setVerified(r.declared_amount?.toString() || ''); setReason(''); setMsg(''); setEvidenceUrl(null);
    if (r.evidence_path) {
      supabase.storage.from('instapay-evidence').createSignedUrl(r.evidence_path, 600).then(({ data }) => setEvidenceUrl(data?.signedUrl || null));
    }
    const { data } = await supabase.from('instapay_audit_events' as any).select('*').eq('submission_id', r.id).order('created_at');
    setHistory((data || []) as unknown as AuditEvent[]);
  };
  const viewEvidence = async (path: string) => {
    const { data } = await supabase.storage.from('instapay-evidence').createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };
  const act = async (action: ReviewAction) => {
    if (!active) return;
    const v = verified.trim() === '' ? null : Number(verified);
    const pre = reviewOutcome(active.status, action, active.amount_due, v, reason);
    if ('error' in pre) { setMsg(pre.error); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('review_instapay_payment', { _submission_id: active.id, _action: action, _verified_amount: action === 'approve' ? v : null, _reason: reason } as any);
    setBusy(false);
    if (error) {
      setMsg(error.message.includes('already') ? 'رقم العملية مستخدم بالفعل أو تم اتخاذ قرار سابق — يرجى المراجعة' : 'تعذر حفظ القرار. حاول مرة أخرى.');
      return;
    }
    setMsg(`تم الحفظ: ${INSTAPAY_STATUS_LABELS[data as InstapayStatus] || data}`);
    await load();
    setActive(null);
  };
  // Quick payment confirmation for the full amount due, after the reviewer confirms the money arrived.
  const confirmPaid = async (r: Submission) => {
    if (!window.confirm(`تأكيد استلام مبلغ ${r.amount_due} ج.م للحجز ${r.booking_ref} في حساب المركز؟`)) return;
    setConfirmingId(r.id); setListMsg('');
    const { data, error } = await supabase.rpc('review_instapay_payment', { _submission_id: r.id, _action: 'approve', _verified_amount: r.amount_due, _reason: '' } as any);
    setConfirmingId(null);
    if (error) {
      setListMsg(error.message.includes('already') ? 'رقم العملية مستخدم بالفعل أو تم اتخاذ قرار سابق — يرجى المراجعة' : 'تعذر تأكيد الدفع. حاول مرة أخرى.');
      return;
    }
    setListMsg(`الحجز ${r.booking_ref}: ${INSTAPAY_STATUS_LABELS[data as InstapayStatus] || data}`);
    await load();
  };
  const deleteSubmission = async (r: Submission) => {
    if (!isAdmin || !window.confirm(`هل أنت متأكد من حذف طلب مراجعة الدفع للحجز ${r.booking_ref} نهائياً؟`)) return;
    setDeletingId(r.id);
    const { data: path, error } = await supabase.rpc('delete_instapay_submission' as any, { _submission_id: r.id } as any);
    setDeletingId(null);
    if (error) { setListMsg('تعذر حذف الطلب. هذه الصلاحية للمدير فقط.'); return; }
    setRows(prev => prev.filter(row => row.id !== r.id));
    if (active?.id === r.id) setActive(null);
    if (typeof path === 'string' && path) {
      const { error: fileError } = await supabase.storage.from('instapay-evidence').remove([path]);
      if (fileError) setListMsg('تم حذف الطلب، وتعذر حذف ملف الإيصال.');
    }
  };
  const printList = () => {
    if (!onPrint) return;
    const esc = (v: unknown) => String(v ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = filtered.map(r => {
      const b = bookings[r.booking_id];
      return `<tr><td>${esc(r.booking_ref)}</td><td>${esc(b?.patient_name)}</td><td>${esc(b?.phone)}</td><td>${esc(b?.doctor_name)}</td><td>${esc(b?.service)}</td><td>${esc(b ? `${b.date} ${b.time}` : '-')}</td><td>${esc(r.transaction_ref)}</td><td>${esc(r.amount_due)} ج.م</td><td>${esc(r.declared_amount)}</td><td>${esc(r.verified_amount)}</td><td>${esc(INSTAPAY_STATUS_LABELS[r.status] || r.status)}</td></tr>`;
    }).join('');
    onPrint('تقرير مراجعة مدفوعات إنستاباي', `<table><thead><tr><th>رقم الحجز</th><th>المريض</th><th>الهاتف</th><th>الطبيب</th><th>الخدمة</th><th>الموعد</th><th>رقم العملية</th><th>المستحق</th><th>المُعلن</th><th>المُتحقق</th><th>الحالة</th></tr></thead><tbody>${body}</tbody></table>`);
  };

  if (allowed === null) return null;
  if (!allowed) return (
    <div className={`${cardClass} mt-8`} dir="rtl"><h3 className="text-lg font-black text-[#172B3A]">مراجعة مدفوعات إنستاباي</h3><p className="text-sm text-[#718394] mt-2">ليست لديك صلاحية مراجعة مدفوعات إنستاباي.</p></div>
  );

  return (
    <div className={`${cardClass} mt-8`} dir="rtl">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-black text-[#172B3A]">مراجعة مدفوعات إنستاباي (<span className="fv-num">{filtered.length}</span>)</h3>
        <div className="flex items-center gap-2.5">
          {onPrint && <button onClick={printList} className="px-3.5 py-2 rounded-xl border border-[#DFEAF0] bg-[#F5FAFC] hover:bg-white text-[#172B3A] flex items-center gap-2 text-xs font-bold transition-colors whitespace-nowrap"><Printer size={15} className="text-[#087F8C]" /> طباعة</button>}
          <button type="button" onClick={() => { setListMsg(''); void load(true); }} disabled={refreshing} title={lastUpdated ? `آخر تحديث: ${lastUpdated.toLocaleTimeString('ar-EG')}` : undefined} className="px-3.5 py-2 rounded-xl border border-[#DFEAF0] bg-[#EBF8FA] hover:bg-[#087F8C] text-[#087F8C] hover:text-white flex items-center gap-2 text-xs font-bold transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'جاري التحديث...' : 'تحديث'}</button>
        </div>
      </div>
      <p className="text-xs text-[#718394] font-bold mb-5">يتم التأكيد يدوياً فقط بعد التحقق من وصول المبلغ في كشف حساب المركز. صورة الإيصال وحدها ليست إثباتاً للدفع.</p>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="رقم الحجز أو رقم العملية" className={inputClass} aria-label="بحث" />
        <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass} aria-label="الحالة">
          <option value="">كل الحالات</option>
          {Object.entries(INSTAPAY_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={doctor} onChange={e => setDoctor(e.target.value)} className={inputClass} aria-label="الطبيب">
          <option value="">كل الأطباء</option>
          {doctorOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inputClass} fv-num`} aria-label="من تاريخ" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${inputClass} fv-num`} aria-label="إلى تاريخ" />
      </div>
      {listMsg && <p className="mb-4 text-sm font-bold text-[#087F8C] bg-[#EBF8FA] border border-[#DFEAF0] rounded-2xl px-4 py-3">{listMsg}</p>}
      <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
        <table className="w-full text-right text-sm">
          <thead className="bg-[#F5FAFC] text-[#172B3A] border-b border-[#DFEAF0]"><tr>
            <th className="p-3.5 font-black">رقم الحجز</th><th className="p-3.5 font-black">المريض / الموعد</th><th className="p-3.5 font-black">رقم العملية</th>
            <th className="p-3.5 font-black">المستحق</th><th className="p-3.5 font-black">المُعلن</th><th className="p-3.5 font-black">المُتحقق</th><th className="p-3.5 font-black">الحالة</th><th className="p-3.5"></th>
          </tr></thead>
          <tbody>
            {filtered.map(r => {
              const b = bookings[r.booking_id];
              const amountWarn = r.declared_amount !== null && r.declared_amount !== r.amount_due;
              return (
                <tr key={r.id} className="border-t border-[#DFEAF0] hover:bg-[#F5FAFC]/70 transition-colors">
                  <td className="p-3.5 font-bold fv-mono text-[#087F8C]" dir="ltr">{r.booking_ref}</td>
                  <td className="p-3.5">{b ? <><div className="font-bold text-[#172B3A]">{b.patient_name}</div><div className="text-xs text-[#718394] font-bold fv-num" dir="ltr">{b.phone}</div><div className="text-xs text-[#718394] fv-num">{b.doctor_name} · {b.service} · {b.date} {b.time}</div></> : '-'}</td>
                  <td className="p-3.5 fv-mono text-[#172B3A]" dir="ltr">{r.transaction_ref}{isDuplicateRef(dups, r.transaction_ref) && <span className="block text-[10px] text-red-600 font-bold font-cairo" dir="rtl">رقم مكرر في حجز آخر</span>}</td>
                  <td className="p-3.5 font-bold fv-num text-[#172B3A]">{r.amount_due} ج.م</td>
                  <td className="p-3.5 fv-num text-[#172B3A]">{r.declared_amount ?? '-'}{amountWarn && <span className="block text-[10px] text-amber-600 font-bold">لا يطابق المستحق</span>}</td>
                  <td className="p-3.5 fv-num text-[#172B3A]">{r.verified_amount ?? '-'}</td>
                  <td className="p-3.5"><span className={`text-xs px-2.5 py-1 rounded-lg border font-bold whitespace-nowrap ${statusClass(r.status)}`}>{INSTAPAY_STATUS_LABELS[r.status]}</span></td>
                  <td className="p-3.5"><div className="flex items-center gap-2">
                    {r.status !== 'PAID' && r.status !== 'REJECTED' && (
                      <button disabled={confirmingId === r.id} onClick={() => confirmPaid(r)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 py-1.5 font-bold text-xs flex items-center gap-1 whitespace-nowrap transition-colors disabled:opacity-60"><CheckCircle size={14} /> تأكيد الدفع</button>
                    )}
                    <button onClick={() => open(r)} className="text-[#087F8C] hover:bg-[#087F8C] hover:text-white bg-[#EBF8FA] border border-[#DFEAF0] px-3 py-1.5 rounded-xl font-bold text-xs transition-colors whitespace-nowrap">مراجعة</button>
                    {isAdmin && <Button variant="ghost" size="icon" onClick={() => deleteSubmission(r)} disabled={deletingId === r.id} title="حذف طلب مراجعة الدفع نهائياً" aria-label="حذف طلب مراجعة الدفع نهائياً" className="text-[#718394] hover:text-destructive"><Trash2 size={16} /></Button>}
                  </div></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-[#718394] font-bold">لا توجد طلبات</td></tr>}
          </tbody>
        </table>
      </div>

      {active && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-lg w-full p-6 md:p-8 max-h-[90vh] overflow-y-auto relative">
            <button onClick={() => setActive(null)} aria-label="إغلاق" className="absolute top-4 left-4 p-2 rounded-full hover:bg-[#F5FAFC] text-[#718394] hover:text-[#172B3A] transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-black text-[#172B3A] mb-4">مراجعة الحجز <span dir="ltr" className="fv-mono text-[#087F8C]">{active.booking_ref}</span></h3>
            <div className="text-sm space-y-1.5 mb-5 font-bold text-[#172B3A] bg-[#F5FAFC] border border-[#DFEAF0] rounded-2xl p-4">
              {bookings[active.booking_id] && <p>المريض: {bookings[active.booking_id].patient_name} · الهاتف: <span dir="ltr" className="fv-num">{bookings[active.booking_id].phone}</span></p>}
              <p>رقم العملية: <span dir="ltr" className="fv-mono text-[#087F8C]">{active.transaction_ref}</span></p>
              <p className="fv-num">المبلغ المستحق: {active.amount_due} ج.م · المُعلن: {active.declared_amount ?? '-'}</p>
              <p>الحالة الحالية: {INSTAPAY_STATUS_LABELS[active.status]}</p>
              {active.evidence_path && <button onClick={() => { if (active.evidence_path) viewEvidence(active.evidence_path); }} className="text-[#087F8C] hover:text-[#1769AA] flex items-center gap-1.5 pt-1"><FileText size={14} /> عرض الإيصال المرفق</button>}
            </div>
            {active.evidence_path && evidenceUrl && !/\.pdf$/i.test(active.evidence_path) && (
              <a href={evidenceUrl} target="_blank" rel="noopener" className="block mb-4">
                <img src={evidenceUrl} alt="صورة إيصال التحويل" className="w-full max-h-80 object-contain rounded-2xl border border-[#DFEAF0] bg-[#F5FAFC]" />
              </a>
            )}
            {active.status !== 'PAID' && active.status !== 'REJECTED' && (
              <div className="space-y-3">
                <input type="number" value={verified} onChange={e => setVerified(e.target.value)} placeholder="المبلغ الذي تم التحقق من استلامه فعلياً" className={`${inputClass} fv-num`} aria-label="المبلغ المتحقق" />
                <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="السبب / ملاحظات (إلزامي عند الرفض)" className={inputClass} rows={2} aria-label="السبب" />
                <div className="grid grid-cols-3 gap-2">
                  <button disabled={busy} onClick={() => act('approve')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-black text-sm flex items-center justify-center gap-1 transition-colors disabled:opacity-60"><CheckCircle size={16} /> اعتماد</button>
                  <button disabled={busy} onClick={() => act('reject')} className="bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 font-black text-sm flex items-center justify-center gap-1 transition-colors disabled:opacity-60"><XCircle size={16} /> رفض</button>
                  <button disabled={busy} onClick={() => act('investigate')} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-3 font-black text-sm flex items-center justify-center gap-1 transition-colors disabled:opacity-60"><AlertTriangle size={16} /> تحقيق</button>
                </div>
              </div>
            )}
            {msg && <p className="mt-3 text-sm font-bold text-[#087F8C]">{msg}</p>}
            <div className="mt-6">
              <h4 className="font-black text-sm text-[#172B3A] mb-2 flex items-center gap-1.5"><History size={14} className="text-[#087F8C]" /> سجل القرارات</h4>
              <ul className="space-y-2 text-xs">
                {history.map(h => (
                  <li key={h.id} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3 text-[#172B3A]">
                    <span className="font-bold">{h.event_type}</span> · {h.actor_name} · <span className="fv-num text-[#718394]">{new Date(h.created_at).toLocaleString('ar-EG')}</span>
                    {h.new_status && <> · {h.previous_status} → {h.new_status}</>}
                    {h.reason && <div className="text-[#718394] mt-1">{h.reason}</div>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
