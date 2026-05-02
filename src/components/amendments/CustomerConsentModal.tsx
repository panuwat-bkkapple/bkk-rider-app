// Customer-facing (rider holds the tablet) consent modal — opens on the
// rider's phone after admin approves an amendment. Customer sees the diff
// (model + price), then signs on canvas to acknowledge the new terms.
//
// Phase 1 = signature only. Schema fields are forward-compat with OTP /
// verbal — those will be added once an SMS gateway is wired up.

import { useEffect, useRef, useState } from 'react';
import {
  X, Loader2, ShieldCheck, PencilLine, ArrowRight,
} from 'lucide-react';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { consentAmendment } from '../../utils/amendments';
import { toast } from '../common/Toast';
import type { JobAmendment } from '../../types';

interface Props {
  amendment: JobAmendment;
  onClose: () => void;
  onConsented: () => void;
}

export const CustomerConsentModal = ({ amendment, onClose, onConsented }: Props) => {
  const [submitting, setSubmitting] = useState(false);
  const [signatureCommitted, setSignatureCommitted] = useState<File | null>(null);

  const before = amendment.before;
  const after = amendment.after;
  if (!after) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm">
          <p className="text-sm">ข้อมูล amendment ไม่ครบ — กรุณาแจ้ง admin</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold">ปิด</button>
        </div>
      </div>
    );
  }

  const priceDiff = after.final_price - before.final_price;

  const handleSubmit = async () => {
    if (!signatureCommitted) {
      toast.error('กรุณาให้ลูกค้าเซ็นและกดยืนยันลายเซ็น');
      return;
    }
    setSubmitting(true);
    try {
      const url = await uploadImageToFirebase(
        signatureCommitted,
        `jobs/${amendment.job_id}/amendments`,
        { opaqueFilename: true },
      );
      await consentAmendment({ amendmentId: amendment.id, signatureUrl: url });
      toast.success('อัพเดตเรียบร้อย — ทำงานต่อได้');
      onConsented();
    } catch (e: any) {
      toast.error('ส่งไม่สำเร็จ: ' + (e?.code || e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <ShieldCheck size={22} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">ยืนยันรายละเอียดใหม่</h2>
              <p className="text-xs text-gray-500">ขอลายเซ็นลูกค้าก่อนรับเครื่อง</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Diff */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">ก่อน (ที่ลูกค้าลงทะเบียน)</p>
              {before.devices.map((d, i) => (
                <p key={i} className="text-sm text-slate-700">{i + 1}. {d.model || '-'}</p>
              ))}
              <p className="text-sm font-bold text-slate-900 mt-1">ราคา ฿{before.final_price.toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-center py-2 bg-emerald-50 border-y border-emerald-200">
              <ArrowRight size={16} className="text-emerald-600" />
            </div>
            <div className="px-4 py-3 bg-emerald-50/40">
              <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest mb-1">หลัง (admin อนุมัติแล้ว)</p>
              {after.devices.map((d, i) => (
                <p key={i} className="text-sm text-emerald-900 font-medium">{i + 1}. {d.model || '-'}</p>
              ))}
              <p className="text-sm font-black text-emerald-900 mt-1">ราคา ฿{after.final_price.toLocaleString()}</p>
              <p className={`text-xs font-bold mt-0.5 ${priceDiff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {priceDiff >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ฿{Math.abs(priceDiff).toLocaleString()}
              </p>
            </div>
          </div>

          {amendment.admin_note && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-[11px] font-black text-blue-700 uppercase tracking-wider mb-1">หมายเหตุจาก admin</p>
              <p className="text-sm text-blue-900">{amendment.admin_note}</p>
            </div>
          )}

          <SignaturePad onCommitted={(file) => setSignatureCommitted(file)} />
        </div>

        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-gray-100 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!signatureCommitted || submitting}
            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 flex justify-center items-center gap-2 disabled:opacity-40"
          >
            {submitting ? (
              <><Loader2 size={20} className="animate-spin" /> กำลังบันทึก...</>
            ) : (
              <><ShieldCheck size={20} /> ยืนยันรายละเอียดใหม่</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Signature canvas — copy of the pattern in KYCModal (kept inline so this
// modal doesn't depend on KYCModal internals; that file is large and
// changing it would create unnecessary coupling).
// ─────────────────────────────────────────────────────────────────────

const SignaturePad = ({ onCommitted }: { onCommitted: (file: File | null) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const scale = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * scale;
    c.height = rect.height * scale;
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (committed) return;
    drawingRef.current = true; setHasDrawn(true);
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || committed) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const onUp = () => { drawingRef.current = false; };

  const handleClear = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false); setCommitted(false); onCommitted(null);
  };
  const handleConfirm = () => {
    const c = canvasRef.current; if (!c || !hasDrawn) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'amendment_signature.png', { type: 'image/png' });
      onCommitted(file); setCommitted(true);
    }, 'image/png');
  };

  return (
    <div>
      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
        <PencilLine size={13} /> ลายเซ็นลูกค้า <span className="text-red-500">*</span>
      </label>
      <div className="border-2 border-gray-200 rounded-2xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="w-full h-40 touch-none"
          style={{ touchAction: 'none' }}
        />
      </div>
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleClear}
          disabled={!hasDrawn}
          className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          ล้าง
        </button>
        <button
          onClick={handleConfirm}
          disabled={!hasDrawn || committed}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl ${
            committed ? 'bg-emerald-100 text-emerald-700 cursor-default'
              : hasDrawn ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {committed ? 'ยืนยันลายเซ็นแล้ว' : 'ยืนยันลายเซ็น'}
        </button>
      </div>
    </div>
  );
};
