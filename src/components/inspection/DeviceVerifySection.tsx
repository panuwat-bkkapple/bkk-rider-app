// Per-device verification block used inside the unified InspectionModal.
// Captures the iOS Settings screenshots that an IMEI lookup (SickW) can't
// give us — most importantly Battery Maximum Capacity, which lives only on
// the device. Find My is a hard gate (ON = can't accept), battery is
// required (read a % or flag the device un-powerable), IMEI/Serial and
// Warranty are optional aids for admin QC.
//
// State is fully controlled via `value`/`onChange` so InspectionModal can
// save/restore it per device. Photos upload immediately (OCR needs a
// Storage URL); transient upload/OCR spinners live in local state and are
// fine to reset when the rider switches devices.

import { useState } from 'react';
import {
  Search, Smartphone, BatteryFull, Award, AlertTriangle, Loader2,
  Trash2, Camera, BatteryWarning,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import {
  ocrImei, ocrBattery, ocrFindMy, ocrWarranty, OCR_VERIFY_THRESHOLD,
} from '../../utils/visionOcr';
import { toast } from '../common/Toast';
import type { DeviceVerification } from '../../types';

type Slot = 'imei' | 'battery' | 'findMy' | 'warranty';

interface Props {
  jobId: string;
  value: DeviceVerification;
  onChange: (next: DeviceVerification) => void;
}

export function DeviceVerifySection({ jobId, value, onChange }: Props) {
  const [uploading, setUploading] = useState<Partial<Record<Slot, boolean>>>({});
  const [ocring, setOcring] = useState<Partial<Record<Slot, boolean>>>({});
  const [lowConfidence, setLowConfidence] = useState<Partial<Record<Slot, boolean>>>({});

  const patch = (p: Partial<DeviceVerification>) => onChange({ ...value, ...p });

  const handleUpload = async (file: File | undefined, slot: Slot) => {
    if (!file) return;
    setUploading((s) => ({ ...s, [slot]: true }));
    try {
      const url = await uploadImageToFirebase(file, `jobs/${jobId}/verification`, { opaqueFilename: true });
      setUploading((s) => ({ ...s, [slot]: false }));
      setOcring((s) => ({ ...s, [slot]: true }));
      try {
        if (slot === 'battery') {
          const r = await ocrBattery(url);
          patch({
            battery_photo: url,
            battery_unavailable: false,
            // Only auto-fill when OCR actually read a number — never clobber a
            // value the rider already typed.
            battery_health_pct: r.fields?.maximumCapacityPct ?? value.battery_health_pct,
            battery_cycle_count: r.fields?.cycleCount ?? value.battery_cycle_count,
          });
          setLowConfidence((s) => ({ ...s, battery: r.confidence < OCR_VERIFY_THRESHOLD }));
        } else if (slot === 'findMy') {
          const r = await ocrFindMy(url);
          patch({ verification_findmy_photo: url, find_my_status: r.fields?.findMyStatus ?? 'unknown' });
          setLowConfidence((s) => ({ ...s, findMy: r.confidence < OCR_VERIFY_THRESHOLD }));
        } else if (slot === 'imei') {
          const r = await ocrImei(url);
          patch({
            verification_imei_photo: url,
            device_imei: r.fields?.imei || value.device_imei,
            device_serial: r.fields?.serial ?? value.device_serial,
            device_model_number: r.fields?.modelNumber ?? value.device_model_number,
          });
          setLowConfidence((s) => ({ ...s, imei: r.confidence < OCR_VERIFY_THRESHOLD }));
        } else {
          const r = await ocrWarranty(url);
          patch({
            verification_warranty_photo: url,
            warranty_status: r.fields?.status ?? 'unknown',
            warranty_expires_at: r.fields?.expiresAt ?? value.warranty_expires_at,
            warranty_coverage_type: r.fields?.coverageType ?? value.warranty_coverage_type,
          });
          setLowConfidence((s) => ({ ...s, warranty: r.confidence < OCR_VERIFY_THRESHOLD }));
        }
      } catch (e: any) {
        // OCR failure isn't fatal — keep the photo, let the rider type.
        if (slot === 'battery') patch({ battery_photo: url, battery_unavailable: false });
        else if (slot === 'findMy') patch({ verification_findmy_photo: url });
        else if (slot === 'imei') patch({ verification_imei_photo: url });
        else patch({ verification_warranty_photo: url });
        toast.info('อ่านข้อมูลอัตโนมัติไม่ได้ — กรุณากรอกเอง');
      } finally {
        setOcring((s) => ({ ...s, [slot]: false }));
      }
    } catch (e: any) {
      setUploading((s) => ({ ...s, [slot]: false }));
      toast.error('อัปโหลดไม่สำเร็จ: ' + (e?.message || e));
    }
  };

  const findMyOn = value.find_my_status === 'on';
  const batteryDone = value.battery_unavailable || value.battery_health_pct != null;

  return (
    <div className="space-y-5">
      {/* Find My — most critical, surface first */}
      <Slot
        title="Find My / Activation Lock"
        instruction="ที่เครื่อง: Settings → [Apple ID] → Find My"
        icon={Search}
        photoUrl={value.verification_findmy_photo}
        uploading={!!uploading.findMy}
        ocring={!!ocring.findMy}
        onUpload={(f) => handleUpload(f, 'findMy')}
        onClear={() => patch({ verification_findmy_photo: null, find_my_status: null })}
        required
      >
        {value.find_my_status && (
          findMyOn ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-2 flex gap-2 items-start">
              <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
              <div className="text-xs text-red-900">
                <p className="font-bold">Find My ยังเปิดอยู่ — ห้ามรับเครื่อง</p>
                <p className="mt-1">ขอให้ลูกค้า sign out จาก Apple ID และปิด Find My ก่อน แล้วถ่ายใหม่</p>
              </div>
            </div>
          ) : value.find_my_status === 'off' ? (
            <p className="text-[11px] text-emerald-600 font-medium mt-2">✓ Find My ปิด — รับเครื่องต่อได้</p>
          ) : (
            <p className="text-[11px] text-amber-600 font-medium mt-2">
              อ่านสถานะไม่ชัด — กรุณายืนยันด้วยตาเปล่าก่อนรับเครื่อง
            </p>
          )
        )}
      </Slot>

      {/* Battery Health — REQUIRED */}
      <Slot
        title="Battery Health (จำเป็น)"
        instruction="ที่เครื่อง: Settings → Battery → Battery Health"
        icon={BatteryFull}
        photoUrl={value.battery_photo}
        uploading={!!uploading.battery}
        ocring={!!ocring.battery}
        onUpload={(f) => handleUpload(f, 'battery')}
        onClear={() => patch({ battery_photo: null, battery_health_pct: null, battery_cycle_count: null })}
        required
        hideCamera={value.battery_unavailable}
      >
        {value.battery_unavailable ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-1 flex items-start gap-2">
            <BatteryWarning size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900 flex-1">
              <p className="font-bold">ทำเครื่องหมายว่า "เปิดไม่ได้ / อ่านแบตไม่ได้"</p>
              <p className="mt-0.5">แอดมินจะตรวจแบตเองตอน QC</p>
            </div>
            <button
              onClick={() => patch({ battery_unavailable: false })}
              className="text-[11px] font-bold text-amber-700 underline shrink-0"
            >
              ยกเลิก
            </button>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Maximum Capacity (%)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={value.battery_health_pct ?? ''}
                onChange={(e) => {
                  const n = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  patch({ battery_health_pct: n != null && Number.isFinite(n) ? n : null });
                }}
                placeholder="89"
                className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
              />
            </div>
            {value.battery_cycle_count != null && (
              <p className="text-[11px] text-gray-500">Cycle count: <span className="font-mono">{value.battery_cycle_count}</span></p>
            )}
            {lowConfidence.battery && (
              <p className="text-[11px] text-amber-600">อ่านได้ความมั่นใจต่ำ — กรุณาตรวจตัวเลข</p>
            )}
            <button
              onClick={() => patch({ battery_unavailable: true, battery_health_pct: null, battery_cycle_count: null })}
              className="text-[11px] font-bold text-gray-400 hover:text-amber-600 underline"
            >
              เครื่องเปิดไม่ได้ / อ่านแบตไม่ได้
            </button>
          </div>
        )}
        {!batteryDone && !value.battery_unavailable && (
          <p className="text-[11px] text-amber-600 font-medium mt-2">
            ต้องกรอก % แบต หรือกด "เครื่องเปิดไม่ได้" ก่อนบันทึก
          </p>
        )}
      </Slot>

      {/* IMEI / Serial — optional aid */}
      <Slot
        title="IMEI / Serial (ถ้าถ่ายได้)"
        instruction="ที่เครื่อง: Settings → General → About"
        icon={Smartphone}
        photoUrl={value.verification_imei_photo}
        uploading={!!uploading.imei}
        ocring={!!ocring.imei}
        onUpload={(f) => handleUpload(f, 'imei')}
        onClear={() => patch({ verification_imei_photo: null })}
      >
        {(value.verification_imei_photo || value.device_imei) && (
          <div className="space-y-2 mt-2">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">IMEI (15 หลัก)</label>
              <input
                type="tel"
                inputMode="numeric"
                value={value.device_imei}
                onChange={(e) => patch({ device_imei: e.target.value })}
                placeholder="358xxxxxxxxxxx"
                className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
              />
            </div>
            {value.device_serial && (
              <p className="text-[11px] text-gray-500">Serial: <span className="font-mono">{value.device_serial}</span></p>
            )}
            {lowConfidence.imei && <p className="text-[11px] text-amber-600">อ่านได้ความมั่นใจต่ำ — กรุณาตรวจ</p>}
          </div>
        )}
      </Slot>

      {/* Warranty / AppleCare — optional */}
      <Slot
        title="Warranty / AppleCare (ถ้ามี)"
        instruction="ที่เครื่อง: Settings → General → AppleCare & Warranty"
        icon={Award}
        photoUrl={value.verification_warranty_photo}
        uploading={!!uploading.warranty}
        ocring={!!ocring.warranty}
        onUpload={(f) => handleUpload(f, 'warranty')}
        onClear={() => patch({ verification_warranty_photo: null, warranty_status: null })}
      >
        {value.warranty_status && (
          <div className="space-y-2 mt-2">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                value.warranty_status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                value.warranty_status === 'expired' ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-gray-100 text-gray-600 border border-gray-200'
              }`}>
                {value.warranty_status === 'active' ? 'อยู่ในประกัน' :
                 value.warranty_status === 'expired' ? 'หมดประกันแล้ว' : 'ไม่ทราบสถานะ'}
              </span>
              {value.warranty_coverage_type && (
                <span className="text-[11px] text-gray-500">
                  {value.warranty_coverage_type === 'applecare_plus' ? 'AppleCare+' : 'Limited Warranty'}
                </span>
              )}
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">วันหมดประกัน (YYYY-MM-DD)</label>
              <input
                type="text"
                inputMode="numeric"
                value={value.warranty_expires_at ?? ''}
                onChange={(e) => patch({ warranty_expires_at: e.target.value || null })}
                placeholder="2026-10-31"
                className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
              />
            </div>
            {lowConfidence.warranty && <p className="text-[11px] text-amber-600">อ่านได้ความมั่นใจต่ำ — กรุณาตรวจ</p>}
          </div>
        )}
      </Slot>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
interface SlotProps {
  title: string;
  instruction: string;
  icon: LucideIcon;
  photoUrl: string | null;
  uploading: boolean;
  ocring: boolean;
  onUpload: (file: File | undefined) => void;
  onClear: () => void;
  required?: boolean;
  hideCamera?: boolean;
  children?: React.ReactNode;
}

function Slot({
  title, instruction, icon: Icon, photoUrl, uploading, ocring, onUpload, onClear, required, hideCamera, children,
}: SlotProps) {
  const inputId = `verify-slot-${title.replace(/\W/g, '-')}`;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-gray-500" />
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {required && <span className="text-[10px] font-bold text-red-500">*</span>}
        </div>
        {photoUrl && (
          <button onClick={onClear} className="text-xs text-red-500 font-medium flex items-center gap-1 hover:underline">
            <Trash2 size={12} /> ถ่ายใหม่
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-2">{instruction}</p>

      {photoUrl ? (
        <div className="relative">
          <img src={photoUrl} alt={title} className="w-full aspect-[3/4] object-cover rounded-2xl border border-gray-200" />
          {ocring && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-2xl">
              <div className="bg-white px-3 py-2 rounded-xl shadow flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-blue-600" />
                <span className="text-xs font-medium text-gray-700">กำลังอ่านข้อมูล...</span>
              </div>
            </div>
          )}
        </div>
      ) : hideCamera ? null : (
        <>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }}
          />
          <label
            htmlFor={inputId}
            className="w-full aspect-[3/4] border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-blue-400 hover:bg-blue-50/50 transition cursor-pointer"
          >
            {uploading ? (
              <Loader2 size={28} className="animate-spin text-blue-500" />
            ) : (
              <>
                <Camera size={28} />
                <span className="text-sm font-medium">เปิดกล้อง / เลือกภาพ</span>
              </>
            )}
          </label>
        </>
      )}

      {children}
    </div>
  );
}
