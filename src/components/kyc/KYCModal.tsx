// src/components/kyc/KYCModal.tsx
//
// Captures customer KYC at pickup, before inspection starts.
//
// Two paths:
//  - Standard:  rider takes a photo of the customer's ID card +
//               a photo of the customer holding the card. Number /
//               address are typed (or transcribed from the photo).
//  - Fallback:  customer doesn't have the card on hand — rider types
//               the number, address, picks a reason, and the customer
//               draws a signature. Disabled when net_payout >= 50,000
//               (AMLO requirement: physical ID card mandatory above
//               this threshold).
//
// Stored on the job at `jobs/{jobId}/kyc` with photos under Storage
// path `jobs/{jobId}/kyc/`.

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X, Camera, IdCard, MapPin, AlertTriangle, ShieldCheck, Loader2,
  PencilLine, Trash2, Lock,
} from 'lucide-react';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { isValidThaiNid, formatThaiNid } from '../../utils/thaiNid';
import { toast } from '../common/Toast';
import {
  KYC_FALLBACK_BLOCK_THRESHOLD,
  KYC_FALLBACK_REASON_LABEL_TH,
} from '../../types';
import type { KYCMethod, KYCFallbackReason, KYCRecord } from '../../types';

interface KYCModalProps {
  job: any;
  onClose: () => void;
  onSubmit: (
    job: any,
    payload: Omit<KYCRecord, 'verified_at' | 'verified_by_rider_uid' | 'verified_by_rider_name'>,
  ) => Promise<void>;
}

export const KYCModal = ({ job, onClose, onSubmit }: KYCModalProps) => {
  const netPayout = Number(job?.net_payout ?? job?.final_price ?? job?.price ?? 0);
  const fallbackBlocked = netPayout >= KYC_FALLBACK_BLOCK_THRESHOLD;

  const [method, setMethod] = useState<KYCMethod>('photo');
  const [idCardUrl, setIdCardUrl] = useState<string | null>(null);
  const [holderUrl, setHolderUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [idNumberRaw, setIdNumberRaw] = useState('');
  const [idAddress, setIdAddress] = useState(job?.cust_id_address || '');
  const [fallbackReason, setFallbackReason] = useState<KYCFallbackReason>('forgot_card');
  const [fallbackDetail, setFallbackDetail] = useState('');
  const [uploadingSlot, setUploadingSlot] = useState<'card' | 'holder' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cardInputRef = useRef<HTMLInputElement>(null);
  const holderInputRef = useRef<HTMLInputElement>(null);

  const idNumberDigits = idNumberRaw.replace(/\D/g, '');
  const idNumberValid = isValidThaiNid(idNumberDigits);

  const handlePhotoUpload = async (
    file: File | undefined,
    slot: 'card' | 'holder',
  ) => {
    if (!file) return;
    setUploadingSlot(slot);
    try {
      const url = await uploadImageToFirebase(file, `jobs/${job.id}/kyc`);
      if (slot === 'card') setIdCardUrl(url);
      else setHolderUrl(url);
    } catch (e: any) {
      toast.error('อัปโหลดรูปไม่สำเร็จ: ' + (e?.message || e));
    } finally {
      setUploadingSlot(null);
    }
  };

  const standardComplete = useMemo(() => {
    return Boolean(
      idCardUrl &&
        holderUrl &&
        idNumberValid &&
        idAddress.trim().length >= 10,
    );
  }, [idCardUrl, holderUrl, idNumberValid, idAddress]);

  const fallbackComplete = useMemo(() => {
    return Boolean(
      idNumberValid &&
        idAddress.trim().length >= 10 &&
        signatureUrl &&
        (fallbackReason !== 'other' || fallbackDetail.trim().length > 0),
    );
  }, [idNumberValid, idAddress, signatureUrl, fallbackReason, fallbackDetail]);

  const canSubmit = method === 'photo' ? standardComplete : fallbackComplete;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(job, {
        method,
        id_number: idNumberDigits,
        id_address: idAddress.trim(),
        id_card_url: method === 'photo' ? idCardUrl : null,
        holder_url: method === 'photo' ? holderUrl : null,
        signature_url: method === 'typed_fallback' ? signatureUrl : null,
        fallback_reason: method === 'typed_fallback' ? fallbackReason : undefined,
        fallback_detail:
          method === 'typed_fallback' && fallbackReason === 'other'
            ? fallbackDetail.trim()
            : undefined,
      });
      toast.success('บันทึก KYC สำเร็จ เริ่มตรวจสภาพเครื่องได้');
      onClose();
    } catch (e: any) {
      toast.error('บันทึก KYC ไม่สำเร็จ: ' + (e?.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <ShieldCheck size={22} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">ยืนยันตัวตนลูกค้า</h2>
              <p className="text-xs text-gray-500">บันทึกบัตรประชาชนก่อนเริ่มตรวจสภาพ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full" aria-label="ปิด">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Method tabs */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMethod('photo')}
              className={`p-3 rounded-2xl border-2 text-left transition ${
                method === 'photo'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <IdCard size={16} className={method === 'photo' ? 'text-emerald-600' : 'text-gray-400'} />
                <span className="text-sm font-bold text-gray-900">มีบัตรประชาชน</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">ถ่ายภาพบัตร + ภาพลูกค้าถือบัตร</p>
            </button>
            <button
              onClick={() => !fallbackBlocked && setMethod('typed_fallback')}
              disabled={fallbackBlocked}
              className={`p-3 rounded-2xl border-2 text-left transition relative ${
                method === 'typed_fallback'
                  ? 'border-amber-500 bg-amber-50'
                  : fallbackBlocked
                  ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {fallbackBlocked ? (
                  <Lock size={16} className="text-gray-400" />
                ) : (
                  <PencilLine size={16} className={method === 'typed_fallback' ? 'text-amber-600' : 'text-gray-400'} />
                )}
                <span className="text-sm font-bold text-gray-900">ไม่มีบัตร</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">
                {fallbackBlocked ? 'ยอด ≥ 50,000฿ ต้องมีบัตรจริงเท่านั้น (AMLO)' : 'พิมพ์เลขบัตร + ลายเซ็นยืนยัน'}
              </p>
            </button>
          </div>

          {/* Standard mode — photo capture */}
          {method === 'photo' && (
            <>
              <PhotoSlot
                title="ภาพบัตรประชาชน"
                hint="ถ่ายให้เห็นเลขบัตร 13 หลักและที่อยู่ชัดเจน"
                imageUrl={idCardUrl}
                uploading={uploadingSlot === 'card'}
                inputRef={cardInputRef}
                onUpload={(f) => handlePhotoUpload(f, 'card')}
                onClear={() => setIdCardUrl(null)}
              />
              <PhotoSlot
                title="ภาพลูกค้าถือบัตร"
                hint="ลูกค้าถือบัตรไว้ใกล้ใบหน้า ให้เห็นทั้งบัตรและหน้าชัด"
                imageUrl={holderUrl}
                uploading={uploadingSlot === 'holder'}
                inputRef={holderInputRef}
                onUpload={(f) => handlePhotoUpload(f, 'holder')}
                onClear={() => setHolderUrl(null)}
              />
            </>
          )}

          {/* Fallback mode — reason + signature */}
          {method === 'typed_fallback' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex gap-2 items-start">
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  เคสนี้จะถูก flag ให้แอดมินตรวจสอบเพิ่มเติม กรุณายืนยันตัวตนลูกค้าด้วยวิธีอื่น (เช่น ใบขับขี่, passport)
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                  เหตุผลที่ไม่มีบัตร
                </label>
                <select
                  value={fallbackReason}
                  onChange={(e) => setFallbackReason(e.target.value as KYCFallbackReason)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
                >
                  {Object.entries(KYC_FALLBACK_REASON_LABEL_TH).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>

              {fallbackReason === 'other' && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                    ระบุเหตุผล <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fallbackDetail}
                    onChange={(e) => setFallbackDetail(e.target.value)}
                    maxLength={120}
                    placeholder="ระบุเหตุผลโดยย่อ"
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
                  />
                </div>
              )}

              <SignaturePad
                onChange={async (file) => {
                  if (!file) {
                    setSignatureUrl(null);
                    return;
                  }
                  try {
                    const url = await uploadImageToFirebase(file, `jobs/${job.id}/kyc`);
                    setSignatureUrl(url);
                  } catch (e: any) {
                    toast.error('อัปโหลดลายเซ็นไม่สำเร็จ: ' + (e?.message || e));
                  }
                }}
              />
            </div>
          )}

          {/* ID number — both modes */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <IdCard size={13} /> เลขบัตรประชาชน 13 หลัก <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={formatThaiNid(idNumberRaw)}
              onChange={(e) => setIdNumberRaw(e.target.value)}
              placeholder="1-2345-67890-12-3"
              className={`w-full px-4 py-3 bg-white border rounded-xl text-sm font-medium tracking-wide focus:ring-2 outline-none ${
                idNumberDigits.length === 13 && !idNumberValid
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20'
              }`}
            />
            {idNumberDigits.length === 13 && !idNumberValid && (
              <p className="mt-1.5 text-xs text-red-500 font-medium">
                เลขบัตรไม่ถูกต้อง (checksum ไม่ผ่าน) กรุณาตรวจสอบอีกครั้ง
              </p>
            )}
          </div>

          {/* ID address — both modes; pre-filled if customer entered at checkout */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <MapPin size={13} /> ที่อยู่ตามบัตรประชาชน <span className="text-red-500">*</span>
            </label>
            {job?.cust_id_address && (
              <p className="text-[11px] text-emerald-600 font-medium mb-1.5">
                ลูกค้ากรอกล่วงหน้าตอน checkout — ตรวจสอบให้ตรงกับบัตรจริง
              </p>
            )}
            <textarea
              value={idAddress}
              onChange={(e) => setIdAddress(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="บ้านเลขที่ / หมู่ / ซอย / ถนน / แขวง-ตำบล / เขต-อำเภอ / จังหวัด / รหัสไปรษณีย์"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium resize-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
            />
          </div>
        </div>

        {/* Footer — extra bottom padding so the button clears the iOS home indicator */}
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-gray-100 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition"
          >
            {isSubmitting ? (
              <><Loader2 size={20} className="animate-spin" /> กำลังบันทึก...</>
            ) : (
              <><ShieldCheck size={20} /> บันทึก KYC และเริ่มตรวจสภาพ</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Photo slot — file input with capture=environment so it opens the
// rear camera directly on mobile.
// ─────────────────────────────────────────────────────────────────────

interface PhotoSlotProps {
  title: string;
  hint: string;
  imageUrl: string | null;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onUpload: (file: File | undefined) => void;
  onClear: () => void;
}

const PhotoSlot = ({ title, hint, imageUrl, uploading, inputRef, onUpload, onClear }: PhotoSlotProps) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <div>
        <p className="text-sm font-bold text-gray-900">{title} <span className="text-red-500">*</span></p>
        <p className="text-[11px] text-gray-500">{hint}</p>
      </div>
      {imageUrl && (
        <button onClick={onClear} className="text-xs text-red-500 font-medium flex items-center gap-1 hover:underline">
          <Trash2 size={12} /> ถ่ายใหม่
        </button>
      )}
    </div>
    {imageUrl ? (
      <img src={imageUrl} alt={title} className="w-full aspect-[4/3] object-cover rounded-2xl border border-gray-200" />
    ) : (
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full aspect-[4/3] border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/50 transition disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 size={28} className="animate-spin text-emerald-500" />
        ) : (
          <>
            <Camera size={28} />
            <span className="text-sm font-medium">เปิดกล้องเพื่อถ่ายภาพ</span>
          </>
        )}
      </button>
    )}
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => onUpload(e.target.files?.[0])}
    />
  </div>
);

// ─────────────────────────────────────────────────────────────────────
// Signature pad — canvas the customer signs; emits a PNG file when
// committed, or null when cleared.
// ─────────────────────────────────────────────────────────────────────

interface SignaturePadProps {
  onChange: (file: File | null) => void;
}

const SignaturePad = ({ onChange }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Match canvas pixel size to its CSS size for sharp lines
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

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (committed) return;
    drawingRef.current = true;
    setHasDrawn(true);
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || committed) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pointFromEvent(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onPointerUp = () => {
    drawingRef.current = false;
  };

  const handleClear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    setCommitted(false);
    onChange(null);
  };

  const handleConfirm = () => {
    const c = canvasRef.current;
    if (!c || !hasDrawn) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'signature.png', { type: 'image/png' });
      onChange(file);
      setCommitted(true);
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
            committed
              ? 'bg-emerald-100 text-emerald-700 cursor-default'
              : hasDrawn
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {committed ? 'ยืนยันลายเซ็นแล้ว' : 'ยืนยันลายเซ็น'}
        </button>
      </div>
    </div>
  );
};
