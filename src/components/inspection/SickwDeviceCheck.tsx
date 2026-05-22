// Sickw check panel ฝั่ง rider — รองรับ OCR scan + multi-service bundle
// (ใช้ catalog API ของ bkk-system → ไรเดอร์ดูชื่อ service ภาษาคน + ราคาได้)

import { useEffect, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import {
  Search, Loader2, CheckCircle2, AlertTriangle, HelpCircle, RefreshCw,
  ChevronDown, ChevronUp, Camera,
} from 'lucide-react';
import { db } from '../../api/firebase';
import {
  checkDeviceWithSickw, checkDeviceWithSickwBundle,
  interpretFmi, interpretMdm, interpretBlacklist,
  type SickwCheckResult, type SickwBundleResult, type SickwFlagState,
  type SickwParsedFields,
} from '../../utils/sickwApi';
import { ocrImei } from '../../utils/visionOcr';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { SickwServicePicker } from './SickwServicePicker';

const BUNDLE_STORAGE_KEY = 'sickw:lastSelectedServices';

interface Props {
  initialImei?: string;
  initialSerial?: string;
  jobId?: string;
}

interface UnifiedResult {
  ok: boolean;
  cached: boolean;
  checkedAt: number;
  bundle: boolean;
  serviceLabel: string;
  status: string;
  parsed: SickwParsedFields;
  fields: Record<string, string>;
  raw: string;
  imei: string;
  errors?: string[];
}

function toUnifiedFromSingle(r: SickwCheckResult): UnifiedResult {
  return {
    ok: r.ok, cached: r.cached, checkedAt: r.checkedAt, bundle: false,
    serviceLabel: `service ${r.serviceId}`, status: r.status,
    parsed: r.parsed, fields: r.fields, raw: r.raw, imei: r.imei,
  };
}

function toUnifiedFromBundle(r: SickwBundleResult): UnifiedResult {
  const errors: string[] = [];
  for (const [id, p] of Object.entries(r.perService)) {
    if (p.error) errors.push(`svc ${id}: ${p.error}`);
  }
  const allCached = Object.values(r.perService).every((p) => p.cached);
  return {
    ok: r.ok, cached: allCached, checkedAt: r.checkedAt, bundle: true,
    serviceLabel: `bundle [${r.serviceIds.join(', ')}]`,
    status: r.ok ? 'success' : 'error',
    parsed: r.parsed, fields: r.fields,
    raw: Object.values(r.perService).map((p) => `--- svc_${p.serviceId} ---\n${p.raw || p.error || ''}`).join('\n\n'),
    imei: r.imei,
    errors: errors.length ? errors : undefined,
  };
}

export function SickwDeviceCheck({ initialImei, initialSerial, jobId }: Props) {
  const [imei, setImei] = useState(initialImei || initialSerial || '');
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BUNDLE_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved.map(String) : [];
    } catch { return []; }
  });
  const [defaultBundle, setDefaultBundle] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UnifiedResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSerial, setOcrSerial] = useState<string | null>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // โหลด default bundle จาก admin settings
  useEffect(() => {
    const unsub = onValue(ref(db, 'settings/sickw/default_bundle'), (snap) => {
      const v = snap.val();
      if (Array.isArray(v)) setDefaultBundle(v.map(String));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (selectedServices.length === 0 && defaultBundle.length > 0) {
      setSelectedServices(defaultBundle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultBundle]);

  useEffect(() => {
    const incoming = initialImei || initialSerial;
    if (incoming && !imei) setImei(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImei, initialSerial]);

  const handleOcrCapture = async (file: File | undefined) => {
    if (!file || !jobId) return;
    setOcrLoading(true);
    setError(null);
    try {
      const url = await uploadImageToFirebase(file, `jobs/${jobId}/verification`, { opaqueFilename: true });
      const res = await ocrImei(url);
      if (res.fields?.imei) setImei(res.fields.imei);
      else if (res.fields?.serial) setImei(res.fields.serial);
      if (res.fields?.serial) setOcrSerial(res.fields.serial);
      if (!res.fields?.imei && !res.fields?.serial) setError('OCR อ่านค่าไม่ได้ — กรุณาพิมพ์เอง');
    } catch (e: any) {
      setError('OCR ผิดพลาด: ' + (e?.message || e));
    } finally {
      setOcrLoading(false);
    }
  };

  const runCheck = async (forceRefresh = false) => {
    setError(null);
    setLoading(true);
    try {
      if (selectedServices.length === 1) {
        const res = await checkDeviceWithSickw({
          imei: imei.trim(), serviceId: selectedServices[0], forceRefresh, jobId,
        });
        setResult(toUnifiedFromSingle(res));
      } else {
        const res = await checkDeviceWithSickwBundle({
          imei: imei.trim(), serviceIds: selectedServices, forceRefresh, jobId,
        });
        setResult(toUnifiedFromBundle(res));
      }
      localStorage.setItem(BUNDLE_STORAGE_KEY, JSON.stringify(selectedServices));
    } catch (e: any) {
      setError(e?.message || 'ตรวจสอบไม่สำเร็จ');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = imei.trim().length >= 8 && selectedServices.length > 0 && !loading;

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search size={16} className="text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900">Sickw IMEI Check</h3>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">IMEI / Serial</label>
          {jobId && (
            <>
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleOcrCapture(e.target.files?.[0])}
              />
              <button
                onClick={() => ocrInputRef.current?.click()}
                disabled={ocrLoading}
                className="flex items-center gap-1 text-[10px] font-bold text-blue-600 disabled:opacity-40"
              >
                {ocrLoading
                  ? <><Loader2 size={11} className="animate-spin" /> OCR...</>
                  : <><Camera size={11} /> สแกนจาก Settings → About</>}
              </button>
            </>
          )}
        </div>
        <input
          type="text"
          value={imei}
          onChange={(e) => setImei(e.target.value.replace(/\s/g, ''))}
          placeholder="358xxxxxxxxxxx"
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
        />
        {ocrSerial && ocrSerial !== imei && (
          <p className="text-[10px] text-gray-500 mt-1">
            OCR เจอ Serial: <button
              onClick={() => setImei(ocrSerial!)}
              className="text-blue-600 underline font-mono"
            >{ocrSerial}</button> (กดเพื่อใช้แทน)
          </p>
        )}
      </div>

      <SickwServicePicker
        value={selectedServices}
        onChange={setSelectedServices}
        defaultBundle={defaultBundle}
        disabled={loading}
      />

      <div className="flex gap-2">
        <button
          onClick={() => runCheck(false)}
          disabled={!canSubmit}
          className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 disabled:opacity-40 flex justify-center items-center gap-2"
        >
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> กำลังตรวจ...</>
            : <><Search size={16} /> {selectedServices.length > 1 ? `ตรวจครบชุด (${selectedServices.length})` : 'ตรวจสอบ'}</>}
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

function SickwResultPanel({ result, showAll, onToggleAll }: { result: UnifiedResult; showAll: boolean; onToggleAll: () => void }) {
  const p = result.parsed;

  if (result.status !== 'success' && !p.model && !p.fmiStatus && !p.iCloudStatus) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="text-xs font-bold text-amber-900">Sickw: {result.status}</span>
        </div>
        {result.errors && (
          <ul className="text-[10px] text-amber-800 list-disc pl-4">
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        {result.raw && (
          <pre className="text-[10px] text-amber-800 bg-white/60 p-2 rounded font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
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
        <span>{result.serviceLabel} · {new Date(result.checkedAt).toLocaleString('th-TH')}</span>
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

      {result.errors && result.errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[10px] text-amber-800">
          <p className="font-bold mb-1">บาง service ใน bundle ล้มเหลว:</p>
          <ul className="list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <button
        onClick={onToggleAll}
        className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-500 py-1"
      >
        {showAll ? <><ChevronUp size={12} /> ซ่อน</> : <><ChevronDown size={12} /> ดูข้อมูลดิบ ({Object.keys(result.fields).length})</>}
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
