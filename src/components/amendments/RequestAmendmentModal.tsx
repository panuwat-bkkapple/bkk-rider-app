// Rider's "report problem on-site" modal — v2 unified flow.
//
// Replaces the old ReportDiscrepancyModal. Same intent (rider reports,
// admin handles) but with structured type taxonomy, server-authored
// records, real FCM push, and atomic apply on the admin side.
//
// 2-step UX so rider doesn't have to scroll past irrelevant fields:
//   step 1: pick category (8 types, grouped by class)
//   step 2: type-specific form (photos for contractual, target hint
//           for operational) + rider_note + submit
//
// Submit goes through requestAmendment callable (Cloud Function in
// bkk-system/functions/index.js) which is the single source of truth
// for /jobs_amendments/{id} writes.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, AlertTriangle, Camera, Loader2, Trash2, Send, ArrowLeft,
  Smartphone, Plus, Calendar, MapPin, User, Ban, MessageSquare, Check,
} from 'lucide-react';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { requestAmendment, generateRequestId } from '../../utils/amendments';
import { toast } from '../common/Toast';
import {
  AMENDMENT_TYPE_CLASS, AMENDMENT_TYPE_LABEL_TH,
  type JobAmendmentType, type AmendmentTarget, type AmendmentEvidence, type AmendmentCancelCategory,
} from '../../types';

interface Props {
  job: any;
  /** Optional preset — when opened from a specific call site (e.g. a cancel
   *  shortcut). Step 1 skipped if provided. */
  initialType?: JobAmendmentType;
  onClose: () => void;
  onSubmitted: () => void;
}

interface UploadedPhoto {
  url: string;
  uploading: boolean;
}

// ─── Type taxonomy for picker ───────────────────────────────────────

const TYPE_GROUPS: Array<{
  label: string;
  items: Array<{
    type: JobAmendmentType;
    icon: React.ComponentType<any>;
    description: string;
  }>;
}> = [
  {
    label: 'กระทบสัญญา (ลูกค้าต้องเซ็นยืนยัน)',
    items: [
      { type: 'device_mismatch', icon: Smartphone, description: 'รุ่น/ความจุ/สี ไม่ตรงตามที่ลงทะเบียน' },
      { type: 'add_device', icon: Plus, description: 'ลูกค้ามีเครื่องอีกเครื่องที่อยากขายเพิ่ม' },
      { type: 'remove_device', icon: Smartphone, description: 'ลูกค้าขอลด/ยกเลิกบางเครื่องในออเดอร์' },
    ],
  },
  {
    label: 'ฝั่ง admin จัดการ (ไม่ต้องเซ็น)',
    items: [
      { type: 'appointment_reschedule', icon: Calendar, description: 'ลูกค้าขอเลื่อนวัน/เวลาเข้ารับ' },
      { type: 'address_wrong', icon: MapPin, description: 'ที่อยู่ในระบบไม่ตรงกับสถานที่จริง' },
      { type: 'customer_info_wrong', icon: User, description: 'ชื่อ / เบอร์โทร / อีเมล ของลูกค้าผิด' },
      { type: 'customer_request_cancel', icon: Ban, description: 'ลูกค้าขอยกเลิกทั้งงาน' },
      { type: 'other', icon: MessageSquare, description: 'อื่นๆ — admin โทรคุยลูกค้า' },
    ],
  },
];

// ─── Main modal ─────────────────────────────────────────────────────

export const RequestAmendmentModal = ({ job, initialType, onClose, onSubmitted }: Props) => {
  const [type, setType] = useState<JobAmendmentType | null>(initialType ?? null);
  const [riderNote, setRiderNote] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef<string>(generateRequestId());

  // Type-specific form state
  const [appointmentLocal, setAppointmentLocal] = useState<string>('');
  const [newAddress, setNewAddress] = useState<string>('');
  const [custInfoField, setCustInfoField] = useState<'cust_name' | 'cust_phone' | 'cust_email'>('cust_phone');
  const [custInfoValue, setCustInfoValue] = useState<string>('');
  const [cancelCategory, setCancelCategory] = useState<AmendmentCancelCategory>('customer_changed_mind');
  const [removeIdx, setRemoveIdx] = useState<number>(0);

  const cls = type ? AMENDMENT_TYPE_CLASS[type] : null;
  const photosRequired = type === 'device_mismatch' || type === 'add_device';

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const startIdx = photos.length;
    setPhotos((p) => [...p, ...Array.from(files).map(() => ({ url: '', uploading: true }))]);
    try {
      const uploads = await Promise.all(
        Array.from(files).map((f) =>
          uploadImageToFirebase(f, `jobs/${job.id}/amendments`, { opaqueFilename: true }),
        ),
      );
      setPhotos((p) => {
        const next = [...p];
        uploads.forEach((url, i) => { next[startIdx + i] = { url, uploading: false }; });
        return next;
      });
    } catch (e: any) {
      toast.error('อัปโหลดรูปไม่สำเร็จ: ' + (e?.message || e));
      setPhotos((p) => p.slice(0, startIdx));
    }
  };
  const removePhoto = (idx: number) => setPhotos((p) => p.filter((_, i) => i !== idx));

  const readyEvidence: AmendmentEvidence[] = photos
    .filter((p) => p.url && !p.uploading)
    .map((p) => ({ url: p.url, purpose: 'other', uploaded_at: Date.now() }));
  const anyUploading = photos.some((p) => p.uploading);

  const buildTarget = (): AmendmentTarget | null => {
    if (!type) return null;
    if (type === 'appointment_reschedule' && appointmentLocal) {
      return { kind: 'appointment', new_appointment_time: new Date(appointmentLocal).getTime() };
    }
    if (type === 'address_wrong' && newAddress.trim()) {
      return { kind: 'address', new_address: newAddress.trim() };
    }
    if (type === 'customer_info_wrong' && custInfoValue.trim()) {
      return { kind: 'customer_info', field: custInfoField, new_value: custInfoValue.trim() };
    }
    if (type === 'customer_request_cancel') {
      return { kind: 'cancel', reason_category: cancelCategory };
    }
    return null;
  };

  const canSubmit = (() => {
    if (!type || submitting || anyUploading) return false;
    if (photosRequired && readyEvidence.length < 1) return false;
    if (type === 'other' && riderNote.trim().length < 5) return false;
    if (type === 'remove_device' && (!job.devices || removeIdx >= (job.devices?.length || 0))) return false;
    if (type === 'address_wrong' && newAddress.trim().length < 5) return false;
    if (type === 'customer_info_wrong' && custInfoValue.trim().length < 1) return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (!type || !canSubmit) {
      if (photosRequired && readyEvidence.length < 1) toast.error('กรุณาแนบรูปประกอบ');
      return;
    }
    setSubmitting(true);
    try {
      await requestAmendment({
        jobId: job.id,
        type,
        riderNote: riderNote.trim() || undefined,
        evidence: readyEvidence.length ? readyEvidence : undefined,
        target: buildTarget() || undefined,
        target_device_index: type === 'remove_device' ? removeIdx : undefined,
        clientRequestId: requestIdRef.current,
      });
      toast.success('ส่งคำขอเรียบร้อย — admin จะแจ้งกลับ');
      onSubmitted();
    } catch (e: any) {
      toast.error('ส่งไม่สำเร็จ: ' + (e?.code || e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Step 1: type picker ─────────────────────────────────────────

  if (!type) {
    return (
      <Shell title="แจ้งปัญหาหน้างาน" subtitle="เลือกหมวดที่ตรงที่สุด" onClose={onClose}>
        <div className="space-y-4">
          {TYPE_GROUPS.map((group, gi) => (
            <div key={gi}>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2 px-1">{group.label}</p>
              <div className="space-y-2">
                {group.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.type}
                      onClick={() => setType(it.type)}
                      className="w-full text-left p-3.5 rounded-xl border border-gray-200 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all flex gap-3 items-start"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <Icon size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">{AMENDMENT_TYPE_LABEL_TH[it.type]}</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{it.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  // ─── Step 2: type-specific form ──────────────────────────────────

  const Icon = TYPE_GROUPS.flatMap((g) => g.items).find((i) => i.type === type)?.icon || AlertTriangle;

  return (
    <Shell
      title={AMENDMENT_TYPE_LABEL_TH[type]}
      subtitle={cls === 'contractual' ? 'admin จะอนุมัติแล้วขอลายเซ็นลูกค้า' : 'admin จะจัดการให้ ไม่ต้องเซ็น'}
      onClose={onClose}
      onBack={!initialType ? () => setType(null) : undefined}
      icon={<Icon size={22} />}
      footer={
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 disabled:opacity-40 flex justify-center items-center gap-2 ${cls === 'contractual' ? 'bg-amber-500' : 'bg-blue-500'}`}
        >
          {submitting ? <><Loader2 size={20} className="animate-spin" /> กำลังส่ง...</> : <><Send size={20} /> ส่งให้ admin ดูแล</>}
        </button>
      }
    >
      <FlowHint cls={cls!} />

      {/* Type-specific fields */}
      {type === 'remove_device' && (
        <Field title="เลือกเครื่องที่จะลด/ยกเลิก">
          <select
            value={removeIdx}
            onChange={(e) => setRemoveIdx(Number(e.target.value))}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
          >
            {(job.devices || []).map((d: any, i: number) => (
              <option key={i} value={i}>{i + 1}. {d.model || '-'}</option>
            ))}
            {(!job.devices || job.devices.length === 0) && <option value={0}>(ไม่มีเครื่องใน job)</option>}
          </select>
        </Field>
      )}

      {type === 'appointment_reschedule' && (
        <Field title="เวลานัดใหม่ (ลูกค้าเสนอ)">
          <input
            type="datetime-local"
            value={appointmentLocal}
            onChange={(e) => setAppointmentLocal(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
          />
          <p className="text-[11px] text-slate-500 mt-1">ใส่เวลาที่ลูกค้าบอก — admin ตรวจสอบและยืนยันต่อ</p>
        </Field>
      )}

      {type === 'address_wrong' && (
        <Field title="ที่อยู่ที่ลูกค้าแจ้ง">
          <textarea
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="เช่น 123 ม.5 ต.บางบอน อ.เมือง จ.สมุทรปราการ 10270"
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm resize-none"
          />
        </Field>
      )}

      {type === 'customer_info_wrong' && (
        <>
          <Field title="ฟิลด์ที่ผิด">
            <select
              value={custInfoField}
              onChange={(e) => setCustInfoField(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
            >
              <option value="cust_name">ชื่อ</option>
              <option value="cust_phone">เบอร์โทร</option>
              <option value="cust_email">อีเมล</option>
            </select>
          </Field>
          <Field title="ค่าที่ถูกต้อง">
            <input
              type="text"
              value={custInfoValue}
              onChange={(e) => setCustInfoValue(e.target.value)}
              maxLength={500}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
            />
          </Field>
        </>
      )}

      {type === 'customer_request_cancel' && (
        <>
          <Field title="เหตุผลการยกเลิก (ลูกค้าให้)">
            <select
              value={cancelCategory}
              onChange={(e) => setCancelCategory(e.target.value as AmendmentCancelCategory)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
            >
              <option value="customer_changed_mind">ลูกค้าเปลี่ยนใจ</option>
              <option value="customer_no_show">ลูกค้าไม่มา / ติดต่อไม่ได้</option>
              <option value="price_disagreement">เจรจาราคาไม่ลงตัว</option>
              <option value="device_mismatch">เครื่องไม่ตรงกับใบสั่ง</option>
              <option value="hidden_damage">พบความเสียหายซ่อน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </Field>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
            <p className="font-bold mb-1">💰 ค่าเสียเวลาไรเดอร์:</p>
            <p>หากคุณกำลังเดินทาง/ถึงจุดหมายแล้ว ลูกค้ายกเลิก = ระบบจ่ายค่าเสียเวลา 100฿ อัตโนมัติ (ถ้าลูกค้ายังไม่ส่งคุณออกเดินทาง = ไม่ได้)</p>
          </div>
        </>
      )}

      {/* Photos — show for all types but required only for contractual device types */}
      <Field title={`รูปประกอบ ${photosRequired ? '(จำเป็น ≥1 รูป)' : '(ไม่บังคับ)'}`}>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {photos.map((p, i) => (
            <div key={i} className="relative aspect-[4/3] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              {p.uploading ? (
                <div className="absolute inset-0 flex items-center justify-center text-emerald-500">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : (
                <>
                  <img src={p.url} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-white/90 rounded-full p-1 shadow"
                  >
                    <Trash2 size={12} className="text-red-600" />
                  </button>
                </>
              )}
            </div>
          ))}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
            className="aspect-[4/3] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50"
          >
            <Camera size={22} />
            <span className="text-[11px] font-medium">เพิ่มภาพ</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleAddPhotos(e.target.files)}
        />
      </Field>

      <Field title={`หมายเหตุ ${type === 'other' ? '(จำเป็น)' : '(ไม่บังคับ)'}`}>
        <textarea
          value={riderNote}
          onChange={(e) => setRiderNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="ลูกค้าบอกว่า ..."
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm resize-none"
        />
      </Field>
    </Shell>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────

const Shell: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, subtitle, icon, onClose, onBack, children, footer }) => (
  <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90dvh] flex flex-col">
      <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            {icon || <AlertTriangle size={22} />}
          </div>
          <div>
            <h2 className="font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
          <X size={20} className="text-gray-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
      {footer && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-gray-100 shrink-0">
          {footer}
        </div>
      )}
    </div>
  </div>
);

const Field: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">{title}</label>
    {children}
  </div>
);

const FlowHint: React.FC<{ cls: 'contractual' | 'operational' }> = ({ cls }) => (
  <div className={`border rounded-xl p-3 text-xs leading-relaxed ${cls === 'contractual' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
    <p className="font-bold mb-1">วิธีปฏิบัติ:</p>
    <ol className="list-decimal pl-5 space-y-0.5">
      <li>ส่งข้อมูลให้ admin ดูแล</li>
      {cls === 'contractual' ? (
        <>
          <li>รอ admin อนุมัติ</li>
          <li>ขอลูกค้าเซ็นยืนยันรายละเอียดใหม่</li>
        </>
      ) : (
        <li>รอ admin จัดการ — ระบบจะ apply อัตโนมัติ</li>
      )}
      <li><strong>อย่าเพิ่งรับเครื่อง / อย่าออกจากจุด</strong> จนกว่าจะมีคำสั่ง</li>
    </ol>
  </div>
);
