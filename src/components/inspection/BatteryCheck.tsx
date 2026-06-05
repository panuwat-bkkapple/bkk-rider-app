// Battery Maximum Capacity is the ONE value an IMEI lookup (SickW) can't
// give us — it lives only on the device (Settings > Battery > Battery
// Health). So this is the single required manual capture in the intake
// flow. The rider either OCRs a screenshot, types the %, or flags the
// device un-powerable. Controlled via the shared DeviceVerification value so
// InspectionModal saves/restores it per device.

import { useState } from 'react';
import { BatteryFull, BatteryWarning, Camera, Loader2, Trash2 } from 'lucide-react';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { ocrBattery, OCR_VERIFY_THRESHOLD } from '../../utils/visionOcr';
import { toast } from '../common/Toast';
import type { DeviceVerification } from '../../types';

interface Props {
  jobId: string;
  value: DeviceVerification;
  onChange: (next: DeviceVerification) => void;
}

export function BatteryCheck({ jobId, value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [ocring, setOcring] = useState(false);
  const [lowConfidence, setLowConfidence] = useState(false);

  const patch = (p: Partial<DeviceVerification>) => onChange({ ...value, ...p });

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageToFirebase(file, `jobs/${jobId}/verification`, { opaqueFilename: true });
      setUploading(false);
      setOcring(true);
      try {
        const r = await ocrBattery(url);
        patch({
          battery_photo: url,
          battery_unavailable: false,
          // Only overwrite when OCR actually read a number.
          battery_health_pct: r.fields?.maximumCapacityPct ?? value.battery_health_pct,
          battery_cycle_count: r.fields?.cycleCount ?? value.battery_cycle_count,
        });
        setLowConfidence(r.confidence < OCR_VERIFY_THRESHOLD);
      } catch {
        patch({ battery_photo: url, battery_unavailable: false });
        toast.info('อ่าน % แบตอัตโนมัติไม่ได้ — กรุณากรอกเอง');
      } finally {
        setOcring(false);
      }
    } catch (e: any) {
      setUploading(false);
      toast.error('อัปโหลดไม่สำเร็จ: ' + (e?.message || e));
    }
  };

  const inputId = 'battery-capture';

  if (value.battery_unavailable) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <BatteryWarning size={22} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-amber-900 text-sm">ทำเครื่องหมาย: เปิดไม่ได้ / อ่านแบตไม่ได้</p>
          <p className="text-xs text-amber-700 mt-0.5">แอดมินจะตรวจแบตเองตอน QC</p>
        </div>
        <button
          onClick={() => patch({ battery_unavailable: false })}
          className="text-[11px] font-bold text-amber-700 underline shrink-0"
        >
          ยกเลิก
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BatteryFull size={18} className="text-emerald-600" />
        <h4 className="text-sm font-bold text-gray-900">Battery Health</h4>
        <span className="text-[10px] font-bold text-red-500">* จำเป็น</span>
      </div>
      <p className="text-[11px] text-gray-500 -mt-1">ที่เครื่อง: Settings → Battery → Battery Health</p>

      {/* % input — the primary field, works with or without a screenshot */}
      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Maximum Capacity (%)</label>
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
          placeholder="เช่น 89"
          className="w-full mt-1 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-base font-mono"
        />
      </div>

      {/* Optional screenshot → OCR auto-fills the % above */}
      {value.battery_photo ? (
        <div className="flex items-center gap-3">
          <img src={value.battery_photo} alt="battery" className="w-16 h-16 object-cover rounded-xl border border-gray-200" />
          <div className="flex-1 text-xs text-gray-500">
            {ocring ? 'กำลังอ่าน...' : 'แนบรูปหน้าจอแล้ว'}
            {value.battery_cycle_count != null && <div>Cycle: <span className="font-mono">{value.battery_cycle_count}</span></div>}
          </div>
          <button
            onClick={() => patch({ battery_photo: null })}
            className="text-xs text-red-500 font-medium flex items-center gap-1"
          >
            <Trash2 size={12} /> ลบรูป
          </button>
        </div>
      ) : (
        <>
          <input id={inputId} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }} />
          <label
            htmlFor={inputId}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-emerald-200 text-emerald-600 text-sm font-bold cursor-pointer hover:bg-emerald-50/50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            ถ่ายหน้าจอ Battery (อ่าน % อัตโนมัติ)
          </label>
        </>
      )}

      {lowConfidence && <p className="text-[11px] text-amber-600">อ่านได้ความมั่นใจต่ำ — กรุณาตรวจตัวเลข</p>}

      <button
        onClick={() => patch({ battery_unavailable: true, battery_health_pct: null, battery_cycle_count: null, battery_photo: null })}
        className="text-[11px] font-bold text-gray-400 hover:text-amber-600 underline"
      >
        เครื่องเปิดไม่ได้ / อ่านแบตไม่ได้
      </button>
    </div>
  );
}
