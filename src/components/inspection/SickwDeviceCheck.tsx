// ปุ่ม + พาเนลผลตรวจ Sickw สำหรับแอป Rider (PWA)
// ใช้ที่: DeviceVerificationModal — รัน OCR ดึง IMEI ได้แล้ว ไรเดอร์กดตรวจ
// Sickw ก่อนรับเครื่อง เพื่อยืนยันว่า iCloud/FMI ปิดจริง, ไม่ติด blacklist
//
// - ถ้า OCR ได้ IMEI มาแล้ว → autofill
// - จำ default Service ID ใน localStorage
// - cache 24 ชั่วโมง (จัดการในฝั่ง Cloud Function)

import { useEffect, useState } from 'react';
import {
  Search, Loader2, CheckCircle2, AlertTriangle, HelpCircle, RefreshCw,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  checkDeviceWithSickw,
  interpretFmi, interpretMdm, interpretBlacklist,
  type SickwCheckResult, type SickwFlagState,
} from '../../utils/sickwApi';

const SVC_ID_STORAGE_KEY = 'sickw:lastServiceId';

interface Props {
  initialImei?: string;
  initialSerial?: string;
  defaultServiceId?: string;
  /** ส่ง jobId เพื่อให้ Cloud Function เก็บ snapshot ลงใบงาน */
  jobId?: string;
  /** ผลตรวจที่เก็บไว้ก่อนหน้า — ใช้ pre-populate ตอนเปิดใบงานซ้ำ */
  existingResult?: SickwCheckResult | null;
  /** trigger หลังตรวจสำเร็จ ให้ parent re-evaluate */
  onChecked?: (result: SickwCheckResult) => void;
}

export function SickwDeviceCheck({ initialImei, initialSerial, defaultServiceId, jobId, existingResult, onChecked }: Props) {
  const [imei, setImei] = useState(initialImei || initialSerial || existingResult?.imei || '');
  const [serviceId, setServiceId] = useState(() =>
    defaultServiceId || existingResult?.serviceId || localStorage.getItem(SVC_ID_STORAGE_KEY) || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SickwCheckResult | null>(existingResult || null);
  const [showAll, setShowAll] = useState(false);

  // Sync เมื่อ parent ส่ง IMEI/Serial หรือ existingResult ใหม่มา — เฉพาะตอน input
  // ยังว่างอยู่ ห้ามทับสิ่งที่ไรเดอร์เพิ่งพิมพ์
  useEffect(() => {
    const incoming = initialImei || initialSerial;
    if (incoming && !imei) setImei(incoming);
    if (existingResult && !result) setResult(existingResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImei, initialSerial, existingResult]);

  const runCheck = async (forceRefresh = false) => {
    setError(null);
    setLoading(true);
    try {
      const res = await checkDeviceWithSickw({ imei: imei.trim(), serviceId: serviceId.trim(), forceRefresh, jobId });
      setResult(res);
      localStorage.setItem(SVC_ID_STORAGE_KEY, String(serviceId));
      onChecked?.(res);
    } catch (e: any) {
      setError(e?.message || 'ตรวจสอบไม่สำเร็จ');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = imei.trim().length >= 8 && /^\d+$/.test(serviceId.trim()) && !loading;

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search size={16} className="text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900">Sickw IMEI Check</h3>
      </div>
      <p className="text-[11px] text-gray-500 -mt-2">
        ตรวจรุ่น / ความจุ / ประเทศ / iCloud / FMI / MDM / Blacklist
      </p>

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">IMEI / Serial</label>
        <input
          type="text"
          value={imei}
          onChange={(e) => setImei(e.target.value.replace(/\s/g, ''))}
          placeholder="358xxxxxxxxxxx"
          className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Service ID</label>
        <input
          type="text"
          inputMode="numeric"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="เช่น 3"
          className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => runCheck(false)}
          disabled={!canSubmit}
          className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex justify-center items-center gap-2"
        >
          {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังตรวจ...</> : <><Search size={16} /> ตรวจสอบ</>}
        </button>
        {result && (
          <button
            onClick={() => runCheck(true)}
            disabled={loading}
            className="px-3 py-3 rounded-xl border border-gray-200 bg-white text-gray-500 disabled:opacity-40"
            aria-label="ตรวจใหม่"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 items-start text-xs text-red-800">
          <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <SickwResultPanel result={result} showAll={showAll} onToggleAll={() => setShowAll((v) => !v)} />
      )}
    </div>
  );
}

function SickwResultPanel({ result, showAll, onToggleAll }: { result: SickwCheckResult; showAll: boolean; onToggleAll: () => void }) {
  const p = result.parsed;

  if (result.status !== 'success') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="text-xs font-bold text-amber-900">Sickw ตอบกลับว่า: {result.status}</span>
        </div>
        {result.raw && (
          <pre className="text-[10px] text-amber-800 bg-white/60 p-2 rounded font-mono whitespace-pre-wrap break-words">
            {result.raw.slice(0, 500)}
          </pre>
        )}
      </div>
    );
  }

  const fmi = interpretFmi(p.fmiStatus || p.iCloudStatus || p.activationLock);
  const mdm = interpretMdm(p.mdmStatus);
  const bl = interpretBlacklist(p.blacklistStatus);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center text-[10px] text-gray-500">
        <span>ตรวจเมื่อ: {new Date(result.checkedAt).toLocaleString('th-TH')}</span>
        {result.cached && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-bold uppercase">cached</span>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FlagBadge label="Find My" state={fmi} value={p.fmiStatus || p.iCloudStatus || p.activationLock || '-'} />
        <FlagBadge label="MDM" state={mdm} value={p.mdmStatus || '-'} />
        <FlagBadge label="Blacklist" state={bl} value={p.blacklistStatus || '-'} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1.5">
        <InfoRow label="รุ่น" value={p.model} />
        <InfoRow label="Model No." value={p.modelNumber} mono />
        <InfoRow label="ความจุ" value={p.capacity} />
        <InfoRow label="สี" value={p.color} />
        <InfoRow label="ประเทศ" value={p.country} />
        <InfoRow label="Carrier" value={p.carrier} />
        <InfoRow label="SIM Lock" value={p.simLock} />
        <InfoRow label="Activation" value={p.activationStatus} />
        <InfoRow label="ประกัน" value={p.warrantyStatus} />
        <InfoRow label="IMEI" value={p.imei || result.imei} mono />
        <InfoRow label="Serial" value={p.serial} mono />
      </div>

      <button
        onClick={onToggleAll}
        className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-500 py-1"
      >
        {showAll ? <><ChevronUp size={12} /> ซ่อนข้อมูลดิบ</> : <><ChevronDown size={12} /> ดูข้อมูลดิบทั้งหมด ({Object.keys(result.fields).length})</>}
      </button>

      {showAll && (
        <pre className="text-[10px] bg-gray-900 text-gray-100 p-3 rounded-xl font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
          {Object.entries(result.fields).map(([k, v]) => `${k}: ${v}`).join('\n')}
        </pre>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline gap-3 text-xs">
      <span className="text-gray-400 font-medium shrink-0">{label}</span>
      <span className={`text-gray-800 font-bold text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function FlagBadge({ label, state, value }: { label: string; state: SickwFlagState; value: string }) {
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
