// BKK Diagnos panel — embedded in step 1 of the per-device inspection
// stepper (InspectionModal), scoped to ONE device. Rider taps start -> QR
// appears -> customer scans and runs the SOP on their own device -> results
// stream into the checklist here live. The rider's only input is the
// Face ID verdict (staff-confirmed step).

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Activity, Loader2, QrCode, RefreshCcw, CheckCircle2, XCircle, MinusCircle,
  ScanFace, AlertTriangle,
} from 'lucide-react';
import { requestAmendment, generateRequestId } from '../../utils/amendments';
import {
  DIAGNOS_STEP_ORDER,
  DIAGNOS_STEP_LABEL,
  createDiagnosSession,
  subscribeDiagnosSession,
  writeFaceIdVerdict,
  recallSession,
  forgetSession,
  type DiagnosSession,
} from '../../utils/diagnos';

interface Props {
  job: any;
  /** Which job device this panel tests — the panel is device-scoped. */
  deviceIndex: number;
}

const ResultIcon = ({ result }: { result?: string }) => {
  if (result === 'pass') return <CheckCircle2 size={16} className="text-emerald-500" />;
  if (result === 'fail') return <XCircle size={16} className="text-red-500" />;
  if (result === 'skipped') return <MinusCircle size={16} className="text-gray-400" />;
  return <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-gray-200" />;
};

export default function DiagnosPanel({ job, deviceIndex }: Props) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // Propose-deduction composer (submitted view) — fires the same
  // requestAmendment flow the rider already uses, prefilled from results.
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjLabel, setAdjLabel] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjDone, setAdjDone] = useState('');
  const [adjErr, setAdjErr] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => recallSession(job.id, deviceIndex));
  const [session, setSession] = useState<DiagnosSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [now, setNow] = useState(Date.now());
  const urlRef = useRef('');

  // Live session subscription (also restores state after app reload).
  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribeDiagnosSession(sessionId, (s) => {
      if (!s || s.job_id !== job.id || (s.device_index ?? 0) !== deviceIndex) {
        setSession(null);
        setSessionId(null);
        forgetSession(job.id, deviceIndex);
        return;
      }
      setSession(s);
    });
    return unsub;
  }, [sessionId, job.id, deviceIndex]);

  // Expiry countdown tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await createDiagnosSession(job.id, deviceIndex);
      urlRef.current = res.url;
      setQrDataUrl(await QRCode.toDataURL(res.url, { width: 560, margin: 1 }));
      setSessionId(res.sessionId);
    } catch (e: any) {
      setError(e?.message || 'สร้างเซสชันไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  // Regenerate the QR image if we resumed a session from storage (no URL in
  // memory). The URL contains the secret which we never persist — so a
  // resumed open session that nobody scanned yet needs a fresh QR (new
  // session); a claimed one doesn't need the QR at all.
  const active = session && (session.status === 'open' || session.status === 'in_progress');
  const claimed = !!session?.claimed_by;
  const submitted = session?.status === 'submitted';
  const expiresIn = session ? Math.max(0, Math.floor(((session.expires_at || 0) - now) / 1000)) : 0;

  const steps = session?.steps || {};
  const doneCount = DIAGNOS_STEP_ORDER.filter((id) => steps[id]).length;
  const faceIdPending = active && claimed && !steps.faceid_guided;

  // --- idle: start button (+ device picker when multi-device job) ---
  if (!session || session.status === 'cancelled' || session.status === 'expired') {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-emerald-600" />
          <p className="font-bold text-gray-800 text-sm">BKK Diagnos — ให้ลูกค้าทดสอบเครื่องจริง</p>
        </div>
        <p className="text-xs text-gray-500 leading-5">
          สร้าง QR ให้ลูกค้าสแกนด้วยเครื่องที่จะขาย ระบบจะพาทดสอบทัช จอ กล้อง ลำโพง GPS
          ทีละขั้น และผลจะขึ้นบนหน้านี้แบบสด
        </p>
        {session?.status === 'expired' && (
          <p className="text-xs text-amber-600">เซสชันก่อนหน้าหมดอายุ — สร้างใหม่ได้เลย</p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={start}
          disabled={creating}
          className="w-full bg-emerald-500 text-white py-3 rounded-2xl font-bold flex justify-center items-center gap-2 active:scale-95 disabled:opacity-50"
        >
          {creating ? <Loader2 size={18} className="animate-spin" /> : <QrCode size={18} />}
          สร้าง QR เริ่มทดสอบ
        </button>
      </div>
    );
  }

  // --- submitted: summary ---
  if (submitted) {
    const s = session.summary || { pass: 0, fail: 0, skipped: 0 };
    // Server-verified snapshot on the job (finalize wrote it) — carries the
    // mismatches vs what the customer reported and any evidence photos.
    const devs: any[] = Array.isArray(job.devices)
      ? job.devices
      : job.devices ? Object.values(job.devices) : [];
    const diag = devs[deviceIndex]?.diagnostics;
    const mismatches: any[] = Array.isArray(diag?.mismatches) ? diag.mismatches : [];
    const failedSteps = DIAGNOS_STEP_ORDER.filter((id) => steps[id]?.result === 'fail');
    const canPropose = mismatches.length > 0 || failedSteps.length > 0;
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-emerald-600" />
            <p className="font-bold text-gray-800 text-sm">ผล BKK Diagnos</p>
          </div>
          <span className="text-[11px] text-gray-400">
            เครื่อง {(session.device_index ?? 0) + 1} · {session.device_label || ''}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50 rounded-xl py-2">
            <p className="text-lg font-bold text-emerald-600">{s.pass}</p>
            <p className="text-[11px] text-emerald-700">ผ่าน</p>
          </div>
          <div className="bg-red-50 rounded-xl py-2">
            <p className="text-lg font-bold text-red-500">{s.fail}</p>
            <p className="text-[11px] text-red-600">ไม่ผ่าน</p>
          </div>
          <div className="bg-gray-50 rounded-xl py-2">
            <p className="text-lg font-bold text-gray-500">{s.skipped}</p>
            <p className="text-[11px] text-gray-500">ข้าม</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {DIAGNOS_STEP_ORDER.map((id) => {
            const st = steps[id];
            if (!st) return null;
            return (
              <div key={id} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-gray-600">{DIAGNOS_STEP_LABEL[id]}</span>
                <div className="flex items-center gap-1.5">
                  {st.skip_reason && (
                    <span className="text-[10px] text-gray-400 max-w-[140px] truncate">{st.skip_reason}</span>
                  )}
                  <ResultIcon result={st.result} />
                </div>
              </div>
            );
          })}
        </div>
        {mismatches.length > 0 && (
          <div className="space-y-1.5">
            {mismatches.map((m: any, i: number) => (
              <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2.5 text-[11px] font-bold text-red-700">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  {m.reason || `${m.step_label || m.step_id} เทสไม่ผ่าน — ขัดกับที่ลูกค้าแจ้ง${m.customer_said ? `: ${m.customer_said}` : ''}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {adjDone ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-bold text-emerald-700">
            {adjDone}
          </div>
        ) : canPropose && !adjOpen ? (
          <button
            onClick={() => {
              const first = mismatches[0];
              const firstFail = failedSteps[0];
              setAdjLabel(
                first?.step_label
                  ? `ผลเทส: ${first.step_label} ไม่ผ่าน`
                  : firstFail
                    ? `ผลเทส: ${DIAGNOS_STEP_LABEL[firstFail]} ไม่ผ่าน`
                    : 'ตำหนิจากผลเทส BKK Diagnos',
              );
              setAdjErr('');
              setAdjOpen(true);
            }}
            className="w-full bg-amber-50 border-2 border-amber-200 text-amber-800 py-3 rounded-2xl font-bold flex justify-center items-center gap-2 active:scale-95"
          >
            <AlertTriangle size={16} /> เสนอปรับราคาจากผลเทส
          </button>
        ) : null}

        {adjOpen && !adjDone && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-amber-800">
              เสนอหักราคา (แอดมินอนุมัติก่อนมีผล) — แนบผลเทสเป็นหลักฐานให้อัตโนมัติ
            </p>
            <input
              type="text"
              value={adjLabel}
              onChange={(e) => setAdjLabel(e.target.value)}
              placeholder="รายการตำหนิ เช่น ผลเทส: ทัชสกรีนไม่ผ่าน"
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-gray-800"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">หัก</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="จำนวนเงิน"
                className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-gray-800"
              />
              <span className="text-xs font-bold text-gray-500">บาท</span>
            </div>
            {adjErr && <p className="text-[11px] font-bold text-red-500">{adjErr}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setAdjOpen(false)}
                disabled={adjBusy}
                className="flex-1 border border-gray-200 bg-white text-gray-600 py-2.5 rounded-xl font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                disabled={adjBusy || adjLabel.trim().length < 2 || !(Number(adjAmount) > 0)}
                onClick={async () => {
                  setAdjBusy(true);
                  setAdjErr('');
                  try {
                    const photos = ['camera_back', 'camera_front'].flatMap((k) => {
                      const list = diag?.values?.[k]?.photos;
                      return Array.isArray(list) ? list : [];
                    });
                    const evidence = photos
                      .filter((p: any) => typeof p?.url === 'string' && p.url.startsWith('https://'))
                      .slice(0, 6)
                      .map((p: any) => ({ url: p.url, purpose: 'other' as const, uploaded_at: Date.now() }));
                    const ref = (diag?.session_id || sessionId || '').slice(-6).toUpperCase();
                    const reasons = mismatches
                      .map((m: any) => m.reason || m.step_label || m.step_id)
                      .filter(Boolean)
                      .join(' / ');
                    await requestAmendment({
                      jobId: job.id,
                      type: 'ad_hoc_deduction',
                      riderNote: `อ้างอิงผล BKK Diagnos #${ref}${reasons ? ` — ${reasons}` : ''}`,
                      target: {
                        kind: 'ad_hoc_deduction',
                        label: adjLabel.trim(),
                        amount: -Math.abs(Number(adjAmount)),
                        device_index: deviceIndex,
                      },
                      evidence,
                      clientRequestId: generateRequestId(),
                    });
                    setAdjOpen(false);
                    setAdjDone('ส่งคำขอหักราคาให้แอดมินแล้ว — สถานะขึ้นที่แบนเนอร์คำขอของงานนี้');
                  } catch (e: any) {
                    setAdjErr(e?.message || 'ส่งคำขอไม่สำเร็จ');
                  } finally {
                    setAdjBusy(false);
                  }
                }}
                className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl font-bold text-xs disabled:opacity-50 flex justify-center items-center gap-1.5"
              >
                {adjBusy ? <Loader2 size={14} className="animate-spin" /> : null} ส่งให้แอดมินอนุมัติ
              </button>
            </div>
          </div>
        )}

        <button
          onClick={start}
          disabled={creating}
          className="w-full text-xs font-bold text-gray-400 underline py-1"
        >
          ทดสอบใหม่อีกรอบ
        </button>
      </div>
    );
  }

  // --- active: QR (until claimed) + live checklist ---
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-emerald-600" />
          <p className="font-bold text-gray-800 text-sm">BKK Diagnos</p>
        </div>
        <span className="text-[11px] text-gray-400">
          {claimed ? `กำลังทดสอบ ${doneCount}/${DIAGNOS_STEP_ORDER.length}` : `QR หมดอายุใน ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, '0')}`}
        </span>
      </div>

      {!claimed && (
        qrDataUrl ? (
          <div className="flex flex-col items-center gap-2">
            <img src={qrDataUrl} alt="Diagnos QR" className="w-56 h-56 rounded-xl border border-gray-100" />
            <p className="text-xs text-gray-500 text-center">
              ให้ลูกค้าเปิดกล้องบน &quot;เครื่องที่จะขาย&quot; แล้วสแกน QR นี้
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-700">
              เซสชันเดิมยังไม่ถูกสแกนและ QR ไม่อยู่ในหน้านี้แล้ว — สร้าง QR ใหม่เพื่อเริ่ม
            </p>
            <button
              onClick={start}
              disabled={creating}
              className="mt-2 w-full bg-amber-500 text-white py-2.5 rounded-xl font-bold text-sm flex justify-center items-center gap-2"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
              สร้าง QR ใหม่
            </button>
          </div>
        )
      )}

      {claimed && (
        <div className="divide-y divide-gray-100">
          {DIAGNOS_STEP_ORDER.map((id) => {
            const st = steps[id];
            return (
              <div key={id} className="flex items-center justify-between py-1.5">
                <span className={`text-xs ${st ? 'text-gray-700' : 'text-gray-400'}`}>
                  {DIAGNOS_STEP_LABEL[id]}
                </span>
                <ResultIcon result={st?.result} />
              </div>
            );
          })}
        </div>
      )}

      {faceIdPending && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ScanFace size={16} className="text-blue-600" />
            <p className="text-xs font-bold text-blue-800">
              ขั้น Face ID: ดูลูกค้าปลดล็อกเครื่องต่อหน้า แล้วกดยืนยันที่นี่
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => sessionId && writeFaceIdVerdict(sessionId, 'pass').catch(() => setError('บันทึกไม่สำเร็จ'))}
              className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl font-bold text-sm active:scale-95"
            >
              ปลดล็อกได้
            </button>
            <button
              onClick={() => sessionId && writeFaceIdVerdict(sessionId, 'fail').catch(() => setError('บันทึกไม่สำเร็จ'))}
              className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold text-sm active:scale-95"
            >
              สแกนไม่ได้
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={start}
        disabled={creating}
        className="w-full text-xs font-bold text-gray-400 underline py-1"
      >
        เริ่มเซสชันใหม่ (QR เดิมจะใช้ไม่ได้)
      </button>
    </div>
  );
}
