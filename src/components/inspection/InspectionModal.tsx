// src/components/inspection/InspectionModal.tsx
import { useState, useRef, useMemo } from 'react';
import {
  X, ChevronLeft, CheckCircle2, Camera, Upload,
  Smartphone, ShieldCheck, PackageOpen, ListChecks
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { getDevicesList } from '../../utils/jobHelpers';
import { toast } from '../common/Toast';
import { SickwDeviceCheck } from './SickwDeviceCheck';
import { getSickwReasons } from '../../utils/sickwApi';
import type { InspectedDeviceData, ConditionGroup } from '../../types';

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

interface SlotPhoto { url: string; file: File }

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
  const [checks, setChecks] = useState<string[]>([]);
  // Slot-based photos: 6 named angles + optional damage close-ups.
  const [slotPhotos, setSlotPhotos] = useState<Record<SlotKey, SlotPhoto | null>>({
    front: null, back: null, top: null, bottom: null, left: null, right: null,
  });
  const [damagePhotos, setDamagePhotos] = useState<SlotPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const slotInputRef = useRef<HTMLInputElement>(null);
  const damageInputRef = useRef<HTMLInputElement>(null);
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

  const saveDeviceInspection = () => {
    if (activeDeviceIndex === null) return;
    const activeDevice = devicesList[activeDeviceIndex];
    // Photo requirement differs by device type: 6 angle shots for used
    // devices, 4 box+seal+IMEI shots for brand-new sealed units.
    if (!allRequiredSlotsFilled) {
      toast.error(
        activeDevice.isNewDevice
          ? 'กรุณาถ่ายภาพกล่อง ซีล และ IMEI ครบทั้ง 4 รูปก่อนบันทึก'
          : 'กรุณาถ่ายรูปครบทั้ง 6 ด้านก่อนบันทึก'
      );
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

    // Flatten slots → ordered array. Required slots come first (6 in
    // PHOTO_SLOTS order), then any damage close-ups append after.
    // saveDeviceInspection guards on allRequiredSlotsFilled so no nulls
    // sneak in here, but we filter for safety.
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
        deductions: deductionLabels, final_price: finalPrice
      }
    }));
    setActiveDeviceIndex(null);
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

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end animate-in fade-in duration-300">
      <div className="bg-white w-full rounded-t-[2rem] p-6 pb-12 animate-in slide-in-from-bottom duration-500 max-h-[90vh] overflow-y-auto flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">

        {/* Device list view */}
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
                      onClick={() => {
                        setChecks(inspectedDevicesData[index]?.checks || []);
                        // Reload slot photos from saved arrays — the first
                        // PHOTO_SLOTS.length entries map back to slots in
                        // order, the rest are damage close-ups.
                        const savedUrls = inspectedDevicesData[index]?.photos || [];
                        const savedFiles = inspectedDevicesData[index]?.photoFiles || [];
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
                        setActiveDeviceIndex(index);
                      }}
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
          /* Single device inspection */
          <div className="animate-in slide-in-from-right duration-300">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setActiveDeviceIndex(null)} className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200">
                <ChevronLeft size={20} />
              </button>
              <h3 className="text-lg font-bold text-gray-900 leading-tight flex-1 line-clamp-1">
                {devicesList[activeDeviceIndex].model}
              </h3>
            </div>

            <div className="space-y-8">
              {/* Sickw IMEI Check — ตรวจสอบสถานะเครื่องกับฐานข้อมูล Apple
                  วางก่อน Photos เพื่อให้ไรเดอร์ verify รุ่น/ความจุ/FMI
                  ก่อนเริ่มถ่ายรูป — ถ้าเครื่องติด iCloud/MDM/Blacklist จะรู้
                  ตั้งแต่ต้น ไม่ต้องเสียเวลาตรวจสภาพ */}
              <SickwDeviceCheck
                jobId={job.id}
                initialImei={
                  // Device type ใน rider app ยังไม่ติด imei field (legacy รับมาจาก job)
                  (devicesList[activeDeviceIndex] as any)?.imei ||
                  job.device_imei || job.imei || ''
                }
                initialSerial={
                  (devicesList[activeDeviceIndex] as any)?.serial ||
                  job.device_serial || job.serial || ''
                }
              />
              {(() => {
                const sickwIssues = getSickwReasons(job?.sickw_check);
                if (sickwIssues.length === 0) return null;
                return (
                  <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 -mt-4">
                    <p className="text-xs font-black text-red-900 uppercase tracking-tight mb-1">
                      ⚠ เครื่องนี้ติด Sickw — แอดมินจะ block ที่ขั้น QC
                    </p>
                    <ul className="text-xs text-red-800 list-disc pl-5">
                      {sickwIssues.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    <p className="text-[11px] text-red-700 mt-2">
                      แจ้งลูกค้าให้ sign out / เคลียร์ MDM ก่อน แล้วกดตรวจซ้ำ
                    </p>
                  </div>
                );
              })()}

              {/* Photos — named slots so admin/QC can match angles */}
              {(() => {
                const isNew = devicesList[activeDeviceIndex]?.isNewDevice;
                // Brand-new sealed devices: replace the 6-angle device
                // shots (we can't see the device, it's in the box) with
                // box + seal + IMEI proof. Same SlotKey storage so the
                // submit array stays consistent.
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
                <input
                  ref={slotInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleSlotCapture}
                />

                {/* Optional damage close-ups */}
                <div className="mt-4">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                    เพิ่มภาพรอย/จุดเสียหาย (ถ้ามี)
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {damagePhotos.map((p, i) => (
                      <div key={i} className="aspect-square rounded-2xl overflow-hidden relative shadow-sm border border-amber-200">
                        <img src={p.url} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleClearDamage(i)}
                          className="absolute top-1.5 right-1.5 bg-white/90 text-red-500 rounded-full p-1 shadow-sm"
                        >
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
                  <input
                    ref={damageInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleDamageCapture}
                  />
                </div>
              </div>
                );
              })()}

              {/* Checklist */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <ListChecks size={16} className="text-purple-500" /> เช็คลิสต์สภาพเครื่อง
                </label>
                {devicesList[activeDeviceIndex]?.isNewDevice ? (
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
                      <h4 className="text-sm font-medium text-gray-600 mb-2 pl-1">{group.title}</h4>
                      <div className="space-y-2">
                        {group.options?.map((opt: any) => {
                          const isChecked = checks.includes(opt.id);
                          const currentDevice = devicesList[activeDeviceIndex];
                          const startingPrice = getBasePrice(currentDevice);

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
                                <div className="text-xs font-medium text-red-500 bg-red-100/50 px-2 py-0.5 rounded-md w-fit">
                                  หัก {formatCurrency(displayDeduct)}
                                </div>
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

              <div className="pt-2">
                {!allRequiredSlotsFilled && (
                  <p className="text-center text-xs text-amber-600 font-medium mb-2">
                    เหลืออีก {requiredCountForActive - filledSlotCount} {activeDeviceIsNew ? 'รูปกล่อง' : 'ด้าน'} — บันทึกไม่ได้จนกว่าจะครบ
                  </p>
                )}
                <button
                  onClick={saveDeviceInspection}
                  disabled={!allRequiredSlotsFilled}
                  className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  บันทึกเครื่องนี้
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
