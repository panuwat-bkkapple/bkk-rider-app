// src/components/inspection/InspectionModal.tsx
//
// Unified rider intake — a 3-step stepper per device:
//   1) ระบุเครื่อง   : scan/enter IMEI → SickW returns identity + status
//   2) ยืนยันเครื่อง  : confirm card (Find My / Blacklist / MDM / warranty),
//                       auto-filled from SickW; Find My is the go/no-go gate.
//                       Only asks for a Find My screenshot when SickW can't
//                       read it (fallback).
//   3) ตรวจสภาพ      : battery (the one value SickW can't read — required),
//                       6-angle photos + condition checklist → price.
//
// SickW already provides IMEI/serial/Find My/warranty, so we DON'T make the
// rider re-photograph those — they flow straight into the verification record.
import { useState, useRef, useMemo } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, Camera, Upload,
  Smartphone, ShieldCheck, PackageOpen, ListChecks, AlertTriangle,
  HelpCircle, Loader2, Search,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { getDevicesList } from '../../utils/jobHelpers';
import { ocrFindMy } from '../../utils/visionOcr';
import { toast } from '../common/Toast';
import { SickwDeviceCheck, type SickwResultSummary } from './SickwDeviceCheck';
import { BatteryCheck } from './BatteryCheck';
import { emptyDeviceVerification } from '../../types';
import type { InspectedDeviceData, ConditionGroup, DeviceVerification } from '../../types';

// Required photo slots — rider must take one per angle so admin / Internal QC
// can verify the device condition without ambiguity. Order matters: photos
// flow into the submit array in this exact order, then any optional damage
// photos append after slot 5.
const PHOTO_SLOTS = [
  { key: 'front',  label: 'ด้านหน้า (เปิดหน้าจอ)', hint: 'หน้าจอเปิดและสว่างให้เห็นพิกเซลชัด' },
  { key: 'back',   label: 'ด้านหลัง',              hint: 'เห็นโลโก้และกล้องครบ' },
  { key: 'top',    label: 'ด้านบน',                hint: 'ปุ่มเปิด/ปิด, ลำโพง' },
  { key: 'bottom', label: 'ด้านล่าง',              hint: 'ช่องชาร์จ, ลำโพง' },
  { key: 'left',   label: 'ด้านข้างซ้าย',          hint: 'ปุ่มเสียง, ปุ่ม Action (ถ้ามี)' },
  { key: 'right',  label: 'ด้านข้างขวา',           hint: 'ปุ่มเปิดปิด/ปุ่ม Power' },
] as const;

// Brand-new sealed devices skip the 6-angle device shots (we can't see
// the device — it's still in the box). Replace with box + seal + IMEI
// proof so admin can verify authenticity and that the seal is intact.
const NEW_DEVICE_PHOTO_SLOTS = [
  { key: 'front',  label: 'หน้ากล่อง',           hint: 'เห็นรุ่น / สี / ความจุชัด' },
  { key: 'back',   label: 'ใต้กล่อง (IMEI)',     hint: 'ป้าย IMEI / Serial บนกล่อง' },
  { key: 'top',    label: 'ซีลพลาสติก',          hint: 'close-up ให้เห็นว่าซีลยังครบ ไม่แกะ' },
  { key: 'bottom', label: 'ซีลฝั่งตรงข้าม',      hint: 'ซีลอีกด้านของกล่อง' },
] as const;

type SlotKey = typeof PHOTO_SLOTS[number]['key'];
const SLOT_KEYS: SlotKey[] = PHOTO_SLOTS.map((s) => s.key);
const REQUIRED_SLOTS = PHOTO_SLOTS.length;
const NEW_DEVICE_REQUIRED_SLOTS = NEW_DEVICE_PHOTO_SLOTS.length;

const STEPS = [
  { n: 1 as const, label: 'ตรวจเครื่อง' },
  { n: 2 as const, label: 'สภาพ + ราคา' },
];
type Step = 1 | 2;

interface SlotPhoto { url: string; file: File }

// Best-effort map SickW's free-text warranty string → our enum (informational
// only; the rider doesn't act on it).
function mapWarranty(raw?: string, fallback: DeviceVerification['warranty_status'] = null): DeviceVerification['warranty_status'] {
  if (!raw) return fallback;
  const s = raw.toLowerCase();
  if (s.includes('active') || s.includes('valid') || s.includes('in warranty') || s.includes('applecare')) return 'active';
  if (s.includes('expire') || s.includes('out of') || s.includes('no coverage')) return 'expired';
  return fallback;
}

// Order-match: compare the scanned device against what the customer ordered.
// Formats differ between the order record and SickW, so normalise to model
// tokens + capacity and treat it as a prominent WARNING (not a hard gate —
// fuzzy matching can false-positive on string-format differences; admin QC
// is the backstop).
function normModel(s?: string): string {
  return (s || '').toLowerCase()
    .replace(/\d+\s?(gb|tb)/g, '')   // strip capacity
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function capacityOf(s?: string): string {
  const m = (s || '').match(/(\d+)\s?(gb|tb)/i);
  return m ? `${m[1]}${m[2].toUpperCase()}` : '';
}
function simLockState(s?: string): 'clean' | 'flagged' | 'unknown' {
  if (!s) return 'unknown';
  const v = s.toLowerCase();
  if (v.includes('unlock')) return 'clean';
  if (v.includes('lock')) return 'flagged';
  return 'unknown';
}

interface InspectionModalProps {
  job: any;
  modelsData: any;
  conditionSets: any;
  onClose: () => void;
  onSubmit: (job: any, inspectedData: Record<number, InspectedDeviceData>) => Promise<void>;
}

export const InspectionModal = ({ job, modelsData, conditionSets, onClose, onSubmit }: InspectionModalProps) => {
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number | null>(null);
  const [inspectedDevicesData, setInspectedDevicesData] = useState<Record<number, InspectedDeviceData>>({});
  const [step, setStep] = useState<Step>(1);
  const [checks, setChecks] = useState<string[]>([]);
  // Per-device verification (battery + Find My + identity from SickW).
  const [verify, setVerify] = useState<DeviceVerification>(emptyDeviceVerification());
  // SickW identity/status summary from step 1 (drives the step 2 confirm card).
  const [sickw, setSickw] = useState<SickwResultSummary | null>(null);
  const [sickwSkipped, setSickwSkipped] = useState(false);
  const [fmUploading, setFmUploading] = useState(false);
  // Slot-based photos: 6 named angles + optional damage close-ups.
  const [slotPhotos, setSlotPhotos] = useState<Record<SlotKey, SlotPhoto | null>>({
    front: null, back: null, top: null, bottom: null, left: null, right: null,
  });
  const [damagePhotos, setDamagePhotos] = useState<SlotPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const slotInputRef = useRef<HTMLInputElement>(null);
  const damageInputRef = useRef<HTMLInputElement>(null);
  const fmInputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);

  const devicesList = getDevicesList(job);

  const activeChecklist = useMemo((): ConditionGroup[] => {
    if (!job || activeDeviceIndex === null || !modelsData || !conditionSets) return [];
    const activeDevice = devicesList[activeDeviceIndex];
    if (!activeDevice) return [];
    const modelList = Array.isArray(modelsData) ? modelsData : Object.keys(modelsData).map(k => ({ id: k, ...(modelsData as any)[k] }));
    const setsList = Array.isArray(conditionSets) ? conditionSets : Object.keys(conditionSets).map(k => ({ id: k, ...(conditionSets as any)[k] }));
    const baseModelName = activeDevice.model.split(' (')[0].trim();
    const targetModel = modelList.find((m: any) => m.name === baseModelName || activeDevice.model.includes(m.name));
    if (!targetModel || !targetModel.conditionSetId) return [];
    const targetSet = setsList.find((s: any) => s.id === targetModel.conditionSetId);
    return targetSet?.groups || [];
  }, [job, activeDeviceIndex, modelsData, conditionSets]);

  const getBasePrice = (device: any): number => {
    let trueBasePrice = 0;
    if (modelsData && device) {
      const modelList = Array.isArray(modelsData) ? modelsData : Object.keys(modelsData).map(k => ({ id: k, ...(modelsData as any)[k] }));
      const targetModel = modelList.find((m: any) => m.name === device.model);
      if (targetModel && targetModel.variants) {
        const targetVariant = targetModel.variants.find((v: any) => v.name === device.variant);
        if (targetVariant) trueBasePrice = Number(targetVariant.usedPrice || targetVariant.price || 0);
        else trueBasePrice = Number(targetModel.variants[0]?.usedPrice || targetModel.variants[0]?.price || 0);
      }
    }
    if (trueBasePrice > 0) return trueBasePrice;
    // Prefer the base_price the cloud function froze on the device when the
    // order was created. Falling back to estimated_price re-deducts the
    // customer's conditions when the rider ticks the same boxes — same
    // double-deduction trap PR #113 fixed for admin Internal QC. Log it
    // so we can spot legacy / mismatched records.
    const fromDevice = Number(device?.base_price || 0);
    if (fromDevice > 0) return fromDevice;
    if (device?.estimated_price) {
      console.warn(
        `[InspectionModal] No base_price for ${device?.model} (${device?.variant}); falling back to estimated_price — deductions may double-count.`
      );
    }
    return Number(device?.estimated_price || 0);
  };

  // ── SickW result → auto-fill identity/status (step 1) ──────────────────
  const onSickwResult = (s: SickwResultSummary) => {
    setSickw(s);
    setSickwSkipped(false);
    setVerify((v) => ({
      ...v,
      device_imei: s.imei || v.device_imei,
      device_serial: s.parsed.serial ?? v.device_serial,
      device_model_number: s.parsed.modelNumber ?? v.device_model_number,
      // SickW FMI is authoritative when known: clean→off, flagged→on.
      // Unknown leaves it null so step 2 asks for a screenshot fallback.
      find_my_status: s.fmi === 'clean' ? 'off' : s.fmi === 'flagged' ? 'on' : v.find_my_status,
      // System-verified when the lookup actually returned an FMI state.
      find_my_manual: s.fmi === 'unknown' ? v.find_my_manual : false,
      warranty_status: mapWarranty(s.parsed.warrantyStatus, v.warranty_status),
      // Real coverage end date from the GSX lookup (we already pay for it).
      warranty_expires_at: s.parsed.warrantyExpiry ?? v.warranty_expires_at,
    }));
  };

  // ── Find My screenshot fallback (step 2, only when SickW can't read it) ─
  const handleFindMyShot = async (file?: File) => {
    if (!file) return;
    setFmUploading(true);
    try {
      const url = await uploadImageToFirebase(file, `jobs/${job.id}/verification`, { opaqueFilename: true });
      try {
        const r = await ocrFindMy(url);
        // OCR of a real screenshot counts as verified (not a blind attest).
        setVerify((v) => ({ ...v, verification_findmy_photo: url, find_my_status: r.fields?.findMyStatus ?? 'unknown', find_my_manual: false }));
      } catch {
        setVerify((v) => ({ ...v, verification_findmy_photo: url }));
        toast.info('อ่าน Find My อัตโนมัติไม่ได้ — ยืนยันด้วยตาเปล่า');
      }
    } catch (e: any) {
      toast.error('อัปโหลดไม่สำเร็จ: ' + (e?.message || e));
    } finally {
      setFmUploading(false);
    }
  };

  const handleSlotCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-selecting same file fires onChange
    if (!file || !activeSlot) return;
    setSlotPhotos((prev) => ({
      ...prev,
      [activeSlot]: { url: URL.createObjectURL(file), file },
    }));
    setActiveSlot(null);
  };

  const handleClearSlot = (key: SlotKey) => {
    setSlotPhotos((prev) => ({ ...prev, [key]: null }));
  };

  const handleDamageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDamagePhotos((prev) => [...prev, { url: URL.createObjectURL(file), file }]);
  };

  const handleClearDamage = (index: number) => {
    setDamagePhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const filledSlotCount = Object.values(slotPhotos).filter(Boolean).length;
  // Brand-new sealed devices need fewer photos (4 box+seal shots vs 6
  // device-angle shots). Pick the threshold based on the active device.
  const activeDeviceIsNew = activeDeviceIndex !== null && !!devicesList[activeDeviceIndex]?.isNewDevice;
  const requiredCountForActive = activeDeviceIsNew ? NEW_DEVICE_REQUIRED_SLOTS : REQUIRED_SLOTS;
  const allRequiredSlotsFilled = filledSlotCount >= requiredCountForActive;

  // Every condition group is a required question with one answer per group.
  // Sealed brand-new devices have no checklist; a model with no condition set
  // has nothing to answer — both are exempt and `every` is vacuously true.
  const isGroupAnswered = (group: ConditionGroup) =>
    !!group.options?.some((opt) => checks.includes(opt.id));
  const answeredGroupCount = activeDeviceIsNew ? 0 : activeChecklist.filter(isGroupAnswered).length;
  const allChecksAnswered = activeDeviceIsNew || activeChecklist.every(isGroupAnswered);

  // Gates. New sealed devices can't be powered on, so Find My + battery are
  // not required for them (box/seal photos prove authenticity instead).
  const findMyOn = verify.find_my_status === 'on';
  const findMyOk = activeDeviceIsNew || verify.find_my_status === 'off';
  const batteryDone = activeDeviceIsNew || verify.battery_unavailable || verify.battery_health_pct != null;
  // Find My is the hard gate at SAVE (end of step 2), NOT a step-1→2 block —
  // so the rider can photograph the body while the customer signs out of
  // Apple ID (real on-site dead time). Battery + IMEI are quick Settings
  // reads done together in step 1, so they're required to leave step 1.
  const canSaveDevice = allRequiredSlotsFilled && allChecksAnswered && batteryDone && findMyOk;
  const deviceIdentified = !!sickw || sickwSkipped || activeDeviceIsNew;
  const canNextStep1 = deviceIdentified && batteryDone;

  const saveDeviceInspection = () => {
    if (activeDeviceIndex === null) return;
    const activeDevice = devicesList[activeDeviceIndex];
    if (!allRequiredSlotsFilled) {
      toast.error(
        activeDevice.isNewDevice
          ? 'กรุณาถ่ายภาพกล่อง ซีล และ IMEI ครบทั้ง 4 รูปก่อนบันทึก'
          : 'กรุณาถ่ายรูปครบทั้ง 6 ด้านก่อนบันทึก'
      );
      return;
    }
    if (!activeDevice.isNewDevice && !allChecksAnswered) {
      toast.error('กรุณาเลือกสภาพเครื่องให้ครบทุกหัวข้อก่อนบันทึก');
      return;
    }
    if (!findMyOk) {
      toast.error('Find My ยังไม่ปิด/ยังไม่ยืนยัน — กลับไปขั้น 1 ตรวจซ้ำหลังลูกค้า sign out');
      return;
    }
    if (!batteryDone) {
      toast.error('กรุณากรอก % แบต หรือกด "เครื่องเปิดไม่ได้" ก่อนบันทึก');
      return;
    }
    const deductionLabels: string[] = [];
    const startingPrice = getBasePrice(activeDevice);

    let totalDeduction = 0;
    if (activeDevice.isNewDevice) {
      deductionLabels.push('[สภาพสินค้า] เครื่องใหม่มือ 1 (ตรวจสอบซีลและกล่องสมบูรณ์)');
    } else {
      activeChecklist.forEach((group: any) => {
        group.options?.forEach((opt: any) => {
          if (checks.includes(opt.id)) {
            let deductAmount = 0;
            if (startingPrice >= 30000) deductAmount = Number(opt.t1 || 0);
            else if (startingPrice >= 15000 && startingPrice < 30000) deductAmount = Number(opt.t2 || 0);
            else deductAmount = Number(opt.t3 || 0);
            totalDeduction += deductAmount;
            deductionLabels.push(deductAmount > 0
              ? `[${group.title}] ${opt.label} (-฿${deductAmount.toLocaleString()})`
              : `[${group.title}] ${opt.label}`
            );
          }
        });
      });
    }

    const finalPrice = activeDevice.isNewDevice ? startingPrice : Math.max(0, startingPrice - totalDeduction);

    // Flatten slots → ordered array. Required slots first (PHOTO_SLOTS order),
    // then damage close-ups. Guarded by allRequiredSlotsFilled; filter for safety.
    const slotPairs = SLOT_KEYS
      .map((k) => slotPhotos[k])
      .filter((p): p is SlotPhoto => p != null);
    const orderedPhotos = [...slotPairs, ...damagePhotos];

    setInspectedDevicesData(prev => ({
      ...prev,
      [activeDeviceIndex]: {
        checks: activeDevice.isNewDevice ? [] : [...checks],
        photos: orderedPhotos.map((p) => p.url),
        photoFiles: orderedPhotos.map((p) => p.file),
        deductions: deductionLabels, final_price: finalPrice,
        verification: verify,
        sickw,
      }
    }));
    setActiveDeviceIndex(null);
  };

  const openDevice = (index: number) => {
    const saved = inspectedDevicesData[index];
    setChecks(saved?.checks || []);
    setVerify(saved?.verification || emptyDeviceVerification());
    setSickw(saved?.sickw || null);
    setSickwSkipped(false);
    // Reload slot photos from saved arrays — the first PHOTO_SLOTS.length
    // entries map back to slots in order, the rest are damage close-ups.
    const savedUrls = saved?.photos || [];
    const savedFiles = saved?.photoFiles || [];
    const restored: Record<SlotKey, SlotPhoto | null> = {
      front: null, back: null, top: null, bottom: null, left: null, right: null,
    };
    SLOT_KEYS.forEach((k, i) => {
      if (savedUrls[i] && savedFiles[i]) restored[k] = { url: savedUrls[i], file: savedFiles[i] };
    });
    setSlotPhotos(restored);
    const damage: SlotPhoto[] = [];
    for (let i = REQUIRED_SLOTS; i < savedUrls.length; i++) {
      if (savedUrls[i] && savedFiles[i]) damage.push({ url: savedUrls[i], file: savedFiles[i] });
    }
    setDamagePhotos(damage);
    setStep(1);
    setActiveDeviceIndex(index);
  };

  const handleSubmitAll = async () => {
    setIsUploading(true);
    try {
      await onSubmit(job, inspectedDevicesData);
    } catch (error) {
      toast.error('อัปโหลดรูปภาพล้มเหลว กรุณาลองใหม่');
    } finally {
      setIsUploading(false);
    }
  };

  const activeDevice = activeDeviceIndex !== null ? devicesList[activeDeviceIndex] : null;

  // Compare scanned (SickW) vs ordered device — only when we have a SickW model.
  const orderMatch = (() => {
    if (!sickw?.parsed.model || !activeDevice) return null;
    const o = normModel(activeDevice.model);
    const s = normModel(sickw.parsed.model);
    let modelOk: boolean | null = null;
    if (o && s) {
      const ot = o.split(' ').filter(Boolean);
      const st = s.split(' ').filter(Boolean);
      modelOk = ot.every((t) => st.includes(t)) || st.every((t) => ot.includes(t));
    }
    const oc = capacityOf(`${activeDevice.model || ''} ${(activeDevice as any).variant || ''}`);
    const sc = capacityOf(sickw.parsed.capacity || sickw.parsed.model);
    const capOk: boolean | null = (!oc || !sc) ? null : oc === sc;
    const state: 'ok' | 'mismatch' | 'unknown' =
      (modelOk === false || capOk === false) ? 'mismatch' : modelOk === true ? 'ok' : 'unknown';
    return { state, scannedLabel: [sickw.parsed.model, sc].filter(Boolean).join(' ') };
  })();

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end animate-in fade-in duration-300">
      <div className="bg-white w-full rounded-t-[2rem] p-6 pb-12 animate-in slide-in-from-bottom duration-500 max-h-[90vh] overflow-y-auto flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">

        {/* ─────────────── Device list view ─────────────── */}
        {activeDeviceIndex === null ? (
          <div className="animate-in fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">รายการที่ต้องตรวจ</h3>
                <p className="text-sm text-gray-500 mt-1">ทั้งหมด {devicesList.length} เครื่อง</p>
              </div>
              <button onClick={onClose} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"><X size={20} /></button>
            </div>
            <div className="space-y-3 mb-8">
              {devicesList.map((device: any, index: number) => {
                const isDone = !!inspectedDevicesData[index];
                return (
                  <div key={index} className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${isDone ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white shadow-sm'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                        {isDone ? <CheckCircle2 size={24} /> : <Smartphone size={24} />}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900 leading-tight">{device.model}</div>
                        {isDone
                          ? <div className="text-xs font-medium text-emerald-600 mt-1">ตรวจแล้ว</div>
                          : <div className="text-xs font-medium text-amber-500 mt-1">รอตรวจสอบ</div>
                        }
                      </div>
                    </div>
                    <button
                      onClick={() => openDevice(index)}
                      className={`px-4 py-2 rounded-xl font-semibold text-xs transition-all ${isDone ? 'bg-white text-gray-600 border border-gray-200' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700'}`}
                    >
                      {isDone ? 'แก้ไข' : 'เริ่มตรวจ'}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleSubmitAll}
              disabled={isUploading || Object.keys(inspectedDevicesData).length !== devicesList.length}
              className={`w-full py-4 rounded-2xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-2 ${
                isUploading || Object.keys(inspectedDevicesData).length !== devicesList.length
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-500 text-white active:scale-95 hover:bg-emerald-600'
              }`}
            >
              {isUploading
                ? <><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div> อัปโหลด...</>
                : <><Upload size={22} /> ส่งผลตรวจทั้งหมด</>
              }
            </button>
          </div>
        ) : (
          /* ─────────────── Single device — stepper ─────────────── */
          <div className="animate-in slide-in-from-right duration-300 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => (step === 1 ? setActiveDeviceIndex(null) : setStep((step - 1) as Step))}
                className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200"
              >
                <ChevronLeft size={20} />
              </button>
              <h3 className="text-base font-bold text-gray-900 leading-tight flex-1 line-clamp-1">
                {activeDevice?.model}
              </h3>
              <span className="text-[11px] font-bold text-gray-400">ขั้น {step}/{STEPS.length}</span>
            </div>

            {/* Step indicator */}
            <div className="flex items-center mb-6">
              {STEPS.map((s, i) => {
                const done = step > s.n;
                const current = step === s.n;
                return (
                  <div key={s.n} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        done ? 'bg-emerald-500 text-white' : current ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {done ? <CheckCircle2 size={16} /> : s.n}
                      </div>
                      <span className={`text-[10px] mt-1 font-medium ${current ? 'text-blue-600' : 'text-gray-400'}`}>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 mb-4 rounded ${step > s.n ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── STEP 1: ตรวจเครื่อง — ทุกอย่างที่อ่านจากในเครื่อง (Settings):
                IMEI → รายละเอียด+สถานะทันที + Find My + แบต รวดเดียว ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <Search size={18} className="text-blue-500 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">สแกน / กรอก IMEI</h4>
                    <p className="text-[11px] text-gray-500">ระบบจะดึงรุ่น · Find My · ประกัน · สถานะ จาก Apple ให้อัตโนมัติ</p>
                  </div>
                </div>
                <SickwDeviceCheck
                  jobId={job.id}
                  hideResultPanel
                  hideServices
                  onResult={onSickwResult}
                  initialImei={(activeDevice as any)?.imei || job.device_imei || job.imei || ''}
                  initialSerial={(activeDevice as any)?.serial || job.device_serial || job.serial || ''}
                />
                {!sickw && !sickwSkipped && !activeDeviceIsNew && (
                  <button
                    onClick={() => setSickwSkipped(true)}
                    className="w-full text-[11px] font-bold text-gray-400 hover:text-gray-600 underline py-1"
                  >
                    ตรวจสอบไม่ได้ (สัญญาณ/บริการ) — กรอก/ยืนยันเอง
                  </button>
                )}

                {/* ผลตรวจ — โผล่ทันทีในจอเดียวกับที่สแกน (สแกน = เห็น) */}
                {deviceIdentified && (
                  <div className="space-y-4 pt-3 border-t border-gray-100">
                    {sickwSkipped && !sickw && !activeDeviceIsNew && (
                      <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-3 text-xs text-orange-900 flex items-start gap-2">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-orange-600" />
                        <div>
                          <p className="font-black">ข้ามการตรวจระบบ — ยังไม่ได้ verify</p>
                          <p className="mt-0.5">ข้อมูลด้านล่างเป็นการกรอก/ยืนยันเอง ระบบยังไม่ได้ตรวจสอบกับฐานข้อมูล — แอดมินจะตรวจซ้ำที่ขั้น QC</p>
                        </div>
                      </div>
                    )}
                    {/* เทียบกับออเดอร์ */}
                    {orderMatch && orderMatch.state !== 'unknown' && (
                      orderMatch.state === 'ok' ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-emerald-800 flex items-center gap-2">
                          <CheckCircle2 size={15} /> ตรงกับออเดอร์
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-300 rounded-xl px-3 py-2.5 text-xs text-red-800 flex items-start gap-2">
                          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                          <div>
                            <p className="font-black">อาจไม่ตรงกับออเดอร์ — ตรวจสอบก่อนรับ</p>
                            <p className="mt-0.5">ออเดอร์: <span className="font-bold">{activeDevice?.model}</span></p>
                            <p>สแกนได้: <span className="font-bold">{orderMatch.scannedLabel}</span></p>
                          </div>
                        </div>
                      )
                    )}

                    {/* การ์ดข้อมูลเครื่อง */}
                    <div className="rounded-2xl border border-gray-200 p-4">
                      <p className="text-lg font-black text-gray-900 leading-tight">
                        {sickw?.parsed.model || activeDevice?.model || 'ไม่ทราบรุ่น'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[sickw?.parsed.capacity, sickw?.parsed.color].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <div className="mt-3 space-y-1.5">
                        <InfoRow label="IMEI" value={verify.device_imei || sickw?.imei} mono />
                        <InfoRow label="IMEI 2" value={sickw?.parsed.imei2} mono />
                        <InfoRow label="Serial" value={verify.device_serial || undefined} mono />
                        <InfoRow label="Model No." value={verify.device_model_number || sickw?.parsed.modelNumber} mono />
                        <InfoRow label="ประเทศ" value={sickw?.parsed.country} />
                        <InfoRow label="Carrier" value={sickw?.parsed.carrier} />
                        <InfoRow label="Activation" value={sickw?.parsed.activationStatus} />
                        <InfoRow label="วันที่ซื้อ/activate" value={sickw?.parsed.estimatedPurchaseDate} />
                        <InfoRow label="ประกัน" value={sickw?.parsed.warrantyStatus} bold />
                        <InfoRow label="ประกันถึง" value={sickw?.parsed.warrantyExpiry} bold />
                        <InfoRow label="AppleCare" value={sickw?.parsed.appleCareDescription} />
                      </div>
                    </div>

                    {/* ป้ายสถานะ */}
                    <div className="grid grid-cols-2 gap-2">
                      <StatusChip
                        label="Find My"
                        state={verify.find_my_status === 'on' ? 'flagged' : verify.find_my_status === 'off' ? (verify.find_my_manual ? 'unknown' : 'clean') : 'unknown'}
                        value={verify.find_my_status === 'off' ? (verify.find_my_manual ? 'ปิด (เอง)' : 'ปิด') : verify.find_my_status === 'on' ? 'เปิดอยู่' : 'ไม่ทราบ'}
                      />
                      <StatusChip label="SIM Lock" state={simLockState(sickw?.parsed.simLock)} value={sickw?.parsed.simLock || '-'} />
                      <StatusChip label="Blacklist" state={sickw?.blacklist || 'unknown'} value={sickw?.parsed.blacklistStatus || sickw?.parsed.iCloudStatus || '-'} />
                      <StatusChip label="MDM" state={sickw?.mdm || 'unknown'} value={sickw?.parsed.mdmStatus || '-'} />
                    </div>

                    {/* Find My — ไม่บล็อกการถ่ายรูป แต่บล็อกตอน "บันทึก" */}
                    {activeDeviceIsNew ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2">
                        <PackageOpen size={16} className="mt-0.5 shrink-0" />
                        เครื่องใหม่ (ซีล) — ข้ามการตรวจ Find My/แบต ใช้รูปกล่อง+ซีลเป็นหลักฐานแทน
                      </div>
                    ) : findMyOn ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 items-start">
                        <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                        <div className="text-xs text-red-900">
                          <p className="font-bold">Find My เปิดอยู่ — ให้ลูกค้า Sign out</p>
                          <p className="mt-1">ถ่ายสภาพ (ขั้น 2) รอไปได้เลย แต่จะ "บันทึก" ไม่ได้จนกว่า Find My ปิด — พอลูกค้า sign out แล้ว กด refresh ที่ช่องตรวจด้านบนเพื่อตรวจซ้ำ</p>
                        </div>
                      </div>
                    ) : verify.find_my_status === 'off' && !verify.find_my_manual ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-medium flex items-center gap-2">
                        <CheckCircle2 size={16} /> Find My ปิด (ตรวจจากระบบแล้ว) — รับเครื่องได้
                      </div>
                    ) : verify.find_my_status === 'off' && verify.find_my_manual ? (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <div>
                          <p className="font-bold">Find My: ยืนยันด้วยตนเอง (ระบบยังไม่ได้ตรวจ)</p>
                          <p className="mt-0.5">แอดมินจะตรวจซ้ำกับฐานข้อมูลที่ขั้น QC — ถ้ามีสัญญาณ แนะนำกด refresh ตรวจระบบด้านบน</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-amber-900 flex items-center gap-1">
                          <AlertTriangle size={14} /> ยืนยันสถานะ Find My (อ่านอัตโนมัติไม่ได้)
                        </p>
                        <p className="text-[11px] text-amber-700">ที่เครื่อง: Settings → [Apple ID] → Find My</p>
                        <input ref={fmInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={(e) => { handleFindMyShot(e.target.files?.[0]); e.target.value = ''; }} />
                        <div className="flex gap-2">
                          <button
                            onClick={() => fmInputRef.current?.click()}
                            disabled={fmUploading}
                            className="flex-1 bg-white border border-amber-300 text-amber-800 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            {fmUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} ถ่ายหน้าจอ
                          </button>
                          <button
                            onClick={() => setVerify((v) => ({ ...v, find_my_status: 'off', find_my_manual: true }))}
                            className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-xs font-bold"
                          >
                            ยืนยันด้วยตาเปล่าว่าปิดแล้ว
                          </button>
                        </div>
                      </div>
                    )}

                    {(sickw?.blacklist === 'flagged') && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 flex items-start gap-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        เครื่องติด Blacklist/iCloud — แจ้งแอดมินก่อนรับ (แอดมินจะ block ที่ขั้น QC)
                      </div>
                    )}

                    {/* แบต — อยู่ใน Settings เดียวกับ IMEI/Find My เก็บรวดเดียว */}
                    {!activeDeviceIsNew && (
                      <div>
                        <label className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                          <ShieldCheck size={16} className="text-emerald-500" /> แบตเตอรี่
                        </label>
                        <BatteryCheck jobId={job.id} value={verify} onChange={setVerify} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 2: สภาพ + ราคา ── */}
            {step === 2 && (
              <div className="space-y-7">
                {/* Photos */}
                {(() => {
                  const isNew = activeDevice?.isNewDevice;
                  const slotsToShow = isNew ? NEW_DEVICE_PHOTO_SLOTS : PHOTO_SLOTS;
                  const totalRequired = isNew ? NEW_DEVICE_REQUIRED_SLOTS : REQUIRED_SLOTS;
                  return (
                <div>
                  <label className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <Camera size={16} className="text-blue-500" />
                    {isNew ? 'รูปถ่ายกล่อง + ซีล' : 'รูปถ่ายตัวเครื่อง'}
                    <span className={`text-[11px] font-normal ml-auto ${allRequiredSlotsFilled ? 'text-emerald-600' : 'text-gray-500'}`}>
                      {filledSlotCount} / {totalRequired}
                    </span>
                  </label>
                  <p className="text-[11px] text-gray-500 mb-3">
                    {isNew
                      ? 'เครื่องใหม่ยังไม่แกะซีล — ถ่ายกล่อง ซีลพลาสติก และเลข IMEI ให้ครบ'
                      : 'ถ่ายทั้ง 6 ด้านเพื่อให้แอดมินตรวจสภาพได้ครบ'}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {slotsToShow.map((slot) => {
                      const photo = slotPhotos[slot.key];
                      return (
                        <div key={slot.key} className="space-y-1">
                          {photo ? (
                            <div className="aspect-square rounded-2xl overflow-hidden relative shadow-sm border border-emerald-200">
                              <img src={photo.url} className="w-full h-full object-cover" />
                              <button
                                onClick={() => handleClearSlot(slot.key)}
                                className="absolute top-1.5 right-1.5 bg-white/90 text-red-500 rounded-full p-1 shadow-sm"
                              >
                                <X size={12} />
                              </button>
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                                <p className="text-[10px] font-bold text-white truncate">{slot.label}</p>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setActiveSlot(slot.key); slotInputRef.current?.click(); }}
                              className="w-full aspect-square rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors bg-blue-50/30 px-1 text-center"
                            >
                              <Camera size={20} />
                              <span className="text-[11px] font-bold mt-1 leading-tight">{slot.label}</span>
                              <span className="text-[9px] text-blue-400 mt-0.5 leading-tight line-clamp-2">{slot.hint}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <input ref={slotInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleSlotCapture} />

                  {/* Optional damage close-ups */}
                  <div className="mt-4">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">เพิ่มภาพรอย/จุดเสียหาย (ถ้ามี)</p>
                    <div className="grid grid-cols-3 gap-3">
                      {damagePhotos.map((p, i) => (
                        <div key={i} className="aspect-square rounded-2xl overflow-hidden relative shadow-sm border border-amber-200">
                          <img src={p.url} className="w-full h-full object-cover" />
                          <button onClick={() => handleClearDamage(i)} className="absolute top-1.5 right-1.5 bg-white/90 text-red-500 rounded-full p-1 shadow-sm">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => damageInputRef.current?.click()}
                        className="aspect-square rounded-2xl border-2 border-dashed border-amber-200 flex flex-col items-center justify-center text-amber-500 hover:bg-amber-50 transition-colors bg-amber-50/30"
                      >
                        <Camera size={20} />
                        <span className="text-[11px] font-bold mt-1">เพิ่มภาพรอย</span>
                      </button>
                    </div>
                    <input ref={damageInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleDamageCapture} />
                  </div>
                </div>
                  );
                })()}

                {/* Checklist */}
                <div>
                  <label className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <ListChecks size={16} className="text-purple-500" /> เช็คลิสต์สภาพเครื่อง
                    {!activeDevice?.isNewDevice && activeChecklist.length > 0 && (
                      <span className={`text-[11px] font-normal ml-auto ${allChecksAnswered ? 'text-emerald-600' : 'text-gray-500'}`}>
                        {answeredGroupCount} / {activeChecklist.length}
                      </span>
                    )}
                  </label>
                  {activeDevice?.isNewDevice ? (
                    <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl text-center shadow-sm">
                      <PackageOpen size={36} className="text-blue-500 mx-auto mb-3 animate-pulse" />
                      <h4 className="font-bold text-blue-800 text-base mb-1">เครื่องใหม่มือ 1 (Brand New)</h4>
                      <p className="text-xs text-blue-600 font-medium leading-relaxed">
                        รายการนี้เป็นเครื่องใหม่ยังไม่แกะซีล<br />ไม่ต้องทำรายการเช็คลิสต์สภาพตัวเครื่อง<br />
                        <strong className="text-blue-800 mt-2 block bg-white p-2 rounded-lg border border-blue-100">กรุณาถ่ายรูปกล่อง ซีลพลาสติก และเลข IMEI ให้ชัดเจน</strong>
                      </p>
                    </div>
                  ) : activeChecklist.length > 0 ? (
                    activeChecklist.map((group: any) => (
                      <div key={group.id} className="mb-4">
                        <h4 className="text-sm font-medium text-gray-600 mb-2 pl-1 flex items-center gap-2">
                          {group.title}
                          {!isGroupAnswered(group) && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">ต้องเลือก</span>
                          )}
                        </h4>
                        <div className="space-y-2">
                          {group.options?.map((opt: any) => {
                            const isChecked = checks.includes(opt.id);
                            const startingPrice = getBasePrice(activeDevice);
                            let displayDeduct = 0;
                            if (startingPrice >= 30000) displayDeduct = Number(opt.t1 || 0);
                            else if (startingPrice >= 15000 && startingPrice < 30000) displayDeduct = Number(opt.t2 || 0);
                            else displayDeduct = Number(opt.t3 || 0);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  setChecks(prev => {
                                    const optionsInThisGroup = group.options.map((o: any) => o.id);
                                    const otherChecks = prev.filter((id: string) => !optionsInThisGroup.includes(id));
                                    return isChecked ? otherChecks : [...otherChecks, opt.id];
                                  });
                                }}
                                className={`w-full p-4 rounded-2xl border text-left flex justify-between items-center transition-all ${isChecked ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                              >
                                <div>
                                  <div className={`font-semibold text-sm mb-1 ${isChecked ? 'text-red-700' : 'text-gray-800'}`}>{opt.label}</div>
                                  <div className="text-xs font-medium text-red-500 bg-red-100/50 px-2 py-0.5 rounded-md w-fit">หัก {formatCurrency(displayDeduct)}</div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isChecked ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300'}`}>
                                  {isChecked && <CheckCircle2 size={16} strokeWidth={3} />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-2xl border-dashed border-2 border-gray-200">
                      <ShieldCheck size={24} className="text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 font-medium">ไม่มีชุดคำถามสำหรับรุ่นนี้</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Footer nav ── */}
            <div className="pt-5 mt-2">
              {/* step 1 hints */}
              {step === 1 && deviceIdentified && !batteryDone && (
                <p className="text-center text-xs text-amber-600 font-medium mb-2">
                  ระบุ % แบต หรือกด "เครื่องเปิดไม่ได้" ก่อนไปต่อ
                </p>
              )}
              {/* step 2 hints */}
              {step === 2 && !allRequiredSlotsFilled && (
                <p className="text-center text-xs text-amber-600 font-medium mb-2">
                  เหลืออีก {requiredCountForActive - filledSlotCount} {activeDeviceIsNew ? 'รูปกล่อง' : 'ด้าน'} — บันทึกไม่ได้จนกว่าจะครบ
                </p>
              )}
              {step === 2 && allRequiredSlotsFilled && !allChecksAnswered && (
                <p className="text-center text-xs text-amber-600 font-medium mb-2">
                  เลือกสภาพเครื่องอีก {activeChecklist.length - answeredGroupCount} หัวข้อก่อนบันทึก
                </p>
              )}
              {step === 2 && allRequiredSlotsFilled && allChecksAnswered && !findMyOk && (
                <p className="text-center text-xs text-red-600 font-medium mb-2">
                  Find My ยังไม่ปิด — กลับไปขั้น 1 ตรวจซ้ำหลังลูกค้า sign out
                </p>
              )}

              {step < 2 ? (
                <button
                  onClick={() => setStep((step + 1) as Step)}
                  disabled={!canNextStep1}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-40 disabled:active:scale-100"
                >
                  ถัดไป (ถ่ายสภาพ) <ChevronRight size={20} />
                </button>
              ) : (
                <button
                  onClick={saveDeviceInspection}
                  disabled={!canSaveDevice}
                  className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  บันทึกเครื่องนี้
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Identity row (step 2) — renders nothing when the value is absent ──────
function InfoRow({ label, value, mono, bold }: { label: string; value?: string; mono?: boolean; bold?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline gap-3 text-[11px]">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`text-right text-gray-700 ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

// ── Status semaphore chip (step 2) ───────────────────────────────────────
function StatusChip({ label, state, value }: { label: string; state: 'clean' | 'flagged' | 'unknown'; value: string }) {
  const color =
    state === 'clean' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
    state === 'flagged' ? 'bg-red-50 border-red-300 text-red-800' :
    'bg-gray-50 border-gray-200 text-gray-600';
  const Icon = state === 'clean' ? CheckCircle2 : state === 'flagged' ? AlertTriangle : HelpCircle;
  return (
    <div className={`border rounded-lg p-2 ${color}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon size={11} />
        <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[11px] font-bold truncate" title={value}>{value}</p>
    </div>
  );
}
