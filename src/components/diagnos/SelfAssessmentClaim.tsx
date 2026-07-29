// Attaching a self-run assessment to this job.
//
// The customer may have already run the twelve steps at home, days before
// anyone was dispatched. They hold a six-digit code (and a QR carrying the
// same record). Entering it here pulls the result onto this job exactly as if
// a live session had finished — same snapshot shape, same mismatch rules, same
// report card in the admin panel.
//
// Typed code rather than a camera scan on purpose: this app is a PWA, and
// camera access in iOS Safari is unreliable enough that a number the customer
// can also read down the phone is the dependable path. The QR is a
// convenience the native app prints; it is not the only way in.

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CheckCircle2, KeyRound, Loader2, AlertTriangle } from 'lucide-react';
import { app } from '../../api/firebase';

interface Props {
  job: any;
  deviceIndex: number;
}

interface ClaimResult {
  ok: boolean;
  assessmentId: string;
  summary: { pass: number; fail: number; skipped: number };
  mismatches: Array<{ step_label?: string; reason?: string; customer_said?: string }>;
  device: { model_name?: string; capacity_gb?: number | null } | null;
}

export default function SelfAssessmentClaim({ job, deviceIndex }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);

  // Already carrying a diagnostics snapshot — nothing to claim onto.
  const existing = job?.devices?.[deviceIndex]?.diagnostics;
  if (existing && !result) return null;

  const submit = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('รหัสอ้างอิงต้องเป็นตัวเลข 6 หลัก');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fns = getFunctions(app, 'asia-southeast1');
      const claim = httpsCallable(fns, 'claimSelfAssessment');
      const res = await claim({ code: digits, jobId: job.id, deviceIndex });
      setResult(res.data as ClaimResult);
    } catch (err) {
      // The callable throws HttpsError with Thai text already — show it as-is
      // rather than replacing a precise reason with a generic one.
      setError((err as { message?: string })?.message || 'ผูกผลไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-bold text-emerald-900">ผูกผลที่ลูกค้าตรวจเองแล้ว</p>
        </div>
        <p className="mt-1 text-[11px] text-emerald-800">
          {result.device?.model_name || 'เครื่องของลูกค้า'} ·{' '}
          {result.summary.pass} ผ่าน / {result.summary.fail} ไม่ผ่าน / {result.summary.skipped} ข้าม
        </p>
        {result.mismatches?.length > 0 && (
          <div className="mt-2 rounded-lg border border-red-200 bg-white p-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-red-500 shrink-0" />
              <p className="text-[11px] font-bold text-red-700">
                พบ {result.mismatches.length} จุดขัดกับที่ลูกค้าแจ้ง
              </p>
            </div>
            <ul className="mt-1 space-y-0.5">
              {result.mismatches.map((m, i) => (
                <li key={i} className="text-[11px] leading-4 text-red-700">
                  {m.reason || `${m.step_label}: แจ้งไว้ว่า ${m.customer_said || '-'}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 text-[11px] text-emerald-700">
          ผลนี้เป็นการตรวจการทำงานเท่านั้น — สภาพภายนอกยังต้องตรวจที่หน้างานตามปกติ
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-semibold text-gray-600 active:bg-gray-50"
      >
        <KeyRound size={14} />
        ลูกค้าตรวจเครื่องมาแล้ว — กรอกรหัส 6 หลัก
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-sm font-bold text-gray-900">รหัสอ้างอิงจากแอปลูกค้า</p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        ขอรหัส 6 หลักจากหน้า &quot;ทำรายการ&quot; ในแอป BKK Diagnos ของลูกค้า
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="000000"
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-mono text-2xl tracking-[0.3em] text-gray-900 focus:border-blue-500 focus:outline-none"
      />
      {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="flex-1 rounded-lg border border-gray-300 py-2 text-[12px] font-semibold text-gray-600"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || code.length !== 6}
          className="flex flex-[2] items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? 'กำลังผูก...' : 'ผูกเข้าใบงานนี้'}
        </button>
      </div>
    </div>
  );
}
