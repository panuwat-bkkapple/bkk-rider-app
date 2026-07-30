// Attaching a customer's self-run assessment by scanning their QR.
//
// The customer's BKK Diagnos app shows a QR and a six-digit code for the same
// record. The code has always worked — staff type it into the job (see
// components/diagnos/SelfAssessmentClaim). The QR pointed at a page that was
// never built, so scanning it produced a 404.
//
// It lands HERE, in the rider app, rather than on the customer website: this
// is the origin where staff are already signed in, and the handover is where
// the attaching actually happens. Scanning with the phone camera opens the
// PWA, which knows who the rider is and which jobs they are holding.
//
// The assessment id rides in the path and the code in the fragment, matching
// the /diagnos/s/{id}#k={secret} convention — a fragment is not sent to the
// server and does not land in access logs.

import { useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Package } from 'lucide-react';
import { app } from '../api/firebase';
import { useRiderData } from '../hooks/useRiderData';
import { getCustomerName } from '../utils/jobHelpers';

interface Props {
  riderId: string;
}

interface ClaimResult {
  ok: boolean;
  assessmentId: string;
  summary: { pass: number; fail: number; skipped: number };
  mismatches: Array<{ step_label?: string; reason?: string; customer_said?: string }>;
  device: { model_name?: string; capacity_gb?: number | null } | null;
}

export const ClaimAssessment = ({ riderId }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { jobData, jobsLoading } = useRiderData(riderId);

  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);

  // #c=123456 — the same six digits the customer can read down a phone line.
  // Sent only when there is no id, which is the case for a hand-typed link.
  const code = useMemo(() => {
    const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('c');
    const fromQuery = new URLSearchParams(location.search).get('c');
    const digits = String(fromHash || fromQuery || '').replace(/\D/g, '');
    return digits.length === 6 ? digits : null;
  }, [location.hash, location.search]);

  // Jobs this rider is holding right now. A test can only be attached to a job
  // that is still in flight — anything completed has its price settled.
  const jobs = jobData.activeList;

  const attach = async (job: any) => {
    setBusyJobId(job.id);
    setError(null);
    try {
      const fns = getFunctions(app, 'asia-southeast1');
      const claim = httpsCallable(fns, 'claimSelfAssessment');
      const payload: Record<string, unknown> = { jobId: job.id, deviceIndex: 0 };
      if (assessmentId) payload.assessmentId = assessmentId;
      else if (code) payload.code = code;
      const res = await claim(payload);
      setResult(res.data as ClaimResult);
    } catch (err) {
      // claimSelfAssessment throws HttpsError with Thai text already — a
      // precise reason ("this result is already on job X") beats a generic one.
      setError((err as { message?: string })?.message || 'ผูกผลไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusyJobId(null);
    }
  };

  if (!assessmentId && !code) {
    return (
      <Shell onBack={() => navigate('/')}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">ลิงก์ไม่สมบูรณ์</p>
          <p className="mt-1 text-[12px] text-amber-800">
            สแกน QR จากหน้า &quot;ทำรายการ&quot; ในแอปของลูกค้าอีกครั้ง
            หรือกรอกรหัส 6 หลักจากในใบงานได้เหมือนเดิม
          </p>
        </div>
      </Shell>
    );
  }

  if (result) {
    return (
      <Shell onBack={() => navigate('/')}>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <p className="text-sm font-bold text-emerald-900">ผูกผลที่ลูกค้าตรวจเองแล้ว</p>
          </div>
          <p className="mt-1 text-[12px] text-emerald-800">
            {result.device?.model_name || 'เครื่องของลูกค้า'} ·{' '}
            {result.summary.pass} ผ่าน / {result.summary.fail} ไม่ผ่าน / {result.summary.skipped} ข้าม
          </p>
          {result.mismatches?.length > 0 && (
            <div className="mt-2 rounded-lg border border-red-200 bg-white p-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="shrink-0 text-red-500" />
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
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white"
        >
          กลับไปหน้างาน
        </button>
      </Shell>
    );
  }

  return (
    <Shell onBack={() => navigate('/')}>
      <p className="text-[13px] leading-5 text-gray-600">
        เลือกใบงานที่จะผูกผลตรวจนี้เข้าไป — ผูกได้ครั้งเดียวต่อหนึ่งผล
      </p>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-[12px] font-semibold text-red-700">{error}</p>
        </div>
      )}

      {jobsLoading && jobs.length === 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[12px]">กำลังโหลดใบงาน...</span>
        </div>
      )}

      {!jobsLoading && jobs.length === 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-bold text-gray-900">ยังไม่มีใบงานที่กำลังทำอยู่</p>
          <p className="mt-1 text-[12px] text-gray-500">
            กดรับงานก่อน แล้วสแกนอีกครั้ง หรือกรอกรหัส 6 หลักจากในใบงานตอนตรวจเครื่อง
          </p>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {jobs.map((job: any) => {
          const attached = !!job?.devices?.[0]?.diagnostics;
          const busy = busyJobId === job.id;
          return (
            <button
              key={job.id}
              type="button"
              disabled={attached || !!busyJobId}
              onClick={() => attach(job)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left active:bg-gray-50 disabled:opacity-45"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">{job.model || 'ไม่ระบุรุ่น'}</p>
                <p className="truncate text-[11px] text-gray-500">
                  {job.OID || job.ref_no || job.id?.slice(-4)} · {getCustomerName(job)}
                </p>
              </div>
              {attached && (
                <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                  มีผลแล้ว
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Shell>
  );
};

const Shell = ({ children, onBack }: { children: React.ReactNode; onBack: () => void }) => (
  <div className="min-h-screen bg-gray-50 px-4 pb-10 pt-5">
    <button
      type="button"
      onClick={onBack}
      className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-gray-600"
    >
      <ArrowLeft size={16} />
      กลับ
    </button>
    <h1 className="text-lg font-bold text-gray-900">ผลตรวจจากลูกค้า</h1>
    <div className="mt-3">{children}</div>
  </div>
);
