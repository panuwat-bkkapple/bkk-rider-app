// ฟอร์มเบิกค่าใช้จ่ายที่ไรเดอร์สำรองจ่าย
//
// **ไม่มีรูป = ปุ่มส่งไม่ทำงาน** ไม่ใช่เพราะเป็นกฎที่ตั้งไว้ แต่เพราะรูปคือ
// สิ่งเดียวที่ทำให้แอดมินอนุมัติเงินออกได้ — ฟอร์มที่ยอมให้ส่งโดยไม่มีหลักฐาน
// คือฟอร์มที่ผลิตรายการที่ไม่มีใครอนุมัติได้ แล้วไรเดอร์รอฟรี
//
// เพดาน/เส้นตายไม่ถูกบังคับที่นี่ — ฟอร์มเตือนได้เพื่อความสุภาพ แต่ตัวบังคับ
// อยู่ฝั่ง server (`riderSubmitExpense`) เพราะไรเดอร์ยิง callable ตรงได้

import { useState } from 'react';
import { Camera, X, Loader2, WifiOff, Download } from 'lucide-react';
import { enqueue } from '../../utils/uploadQueue/enqueue';
import { isStandalone } from '../../utils/displayMode';
import { RIDER_EXPENSE_DEFAULTS as LIMITS } from '../../utils/expenseLimits';

const CATEGORIES = [
  { id: 'toll', label: 'ค่าทางด่วน' },
  { id: 'parking', label: 'ค่าที่จอดรถ' },
  { id: 'other', label: 'อื่นๆ' },
] as const;

interface Props {
  uid: string;
  /** งานที่ไรเดอร์ถืออยู่ตอนนี้ — ให้เลือกแนบได้ ไม่บังคับ */
  activeJobs: { id: string; OID?: string; ref_no?: string; model?: string }[];
  onClose: () => void;
  /** ส่งสำเร็จ/เข้าคิวแล้ว — caller เป็นคน flush กับ refresh */
  onQueued: (queued: boolean) => void;
}

export const ExpenseClaimModal = ({ uid, activeJobs, onClose, onQueued }: Props) => {
  const [category, setCategory] = useState<string>('toll');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [jobId, setJobId] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const online = navigator.onLine;
  const standalone = isStandalone();
  // เส้น B ตอนออฟไลน์: รับงานไว้ไม่ได้เพราะ ITP ลบ storage ใน 7 วัน
  const blockedOffline = !standalone && !online;

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overCap = amountValid && amountNum > LIMITS.hard_max_per_item;
  const needsCeo = amountValid && !overCap && amountNum > LIMITS.manager_max_per_item;
  const noteRequired = category === 'other' && note.trim() === '';
  const canSubmit =
    !busy && !blockedOffline && files.length > 0 && amountValid && !overCap && !noteRequired;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await enqueue({
      uid,
      files,
      payload: {
        category,
        amount_thb: amountNum,
        note: note.trim(),
        occurred_at: Date.now(),
        job_id: jobId || null,
      },
      online,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onQueued(r.queued);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-gray-900">เบิกค่าใช้จ่ายที่จ่ายไปเอง</h3>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="ปิด"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          {blockedOffline && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <WifiOff size={16} /> ตอนนี้ยังส่งไม่ได้
              </div>
              {/* พูดความจริง: ระบบไม่ได้ขัดข้อง มันปฏิเสธที่จะสัญญาสิ่งที่
                  รับประกันไม่ได้ — และบอกทางแก้ที่เขาทำเองได้ */}
              <p className="text-xs text-amber-800 leading-relaxed">
                เครื่องนี้เปิดจากเบราว์เซอร์ ระบบเก็บรูปไว้รอส่งไม่ได้ (ข้อมูลอาจถูกลบใน 7 วัน)
              </p>
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-100 rounded-xl p-3">
                <Download size={14} className="mt-0.5 shrink-0" />
                <span>
                  เปิดเมนูแชร์ของเบราว์เซอร์ แล้วเลือก &quot;เพิ่มไปยังหน้าจอโฮม&quot;
                  จากนั้นเปิดแอปจากไอคอนบนหน้าจอ จะส่งตอนไม่มีสัญญาณได้
                </span>
              </div>
            </div>
          )}

          {!blockedOffline && !online && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 text-xs text-sky-800 flex items-center gap-2">
              <WifiOff size={14} /> ตอนนี้ไม่มีสัญญาณ — บันทึกไว้ในเครื่องแล้วส่งอัตโนมัติเมื่อมีเน็ต
            </div>
          )}

          {/* หลักฐาน — มาก่อนทุกช่อง เพราะมันคือเงื่อนไข ไม่ใช่ของแถม */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-2">
              รูปสลิป/ใบเสร็จ <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt={`หลักฐาน ${i + 1}`}
                    className="w-20 h-20 object-cover rounded-xl border border-gray-200"
                  />
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5"
                    aria-label="ลบรูป"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {files.length < 3 && (
                <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 cursor-pointer">
                  <Camera size={20} />
                  <span className="text-[10px] mt-1">ถ่ายรูป</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFiles([...files, f]);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-2">ประเภท</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`py-2.5 rounded-xl text-xs font-bold border ${
                    category === c.id
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                      : 'bg-white border-gray-200 text-gray-500'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-2">
              จำนวนเงิน (บาท) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="65"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg font-bold"
            />
            {overCap && (
              <p className="text-xs text-red-600 mt-1.5">
                เกิน {LIMITS.hard_max_per_item.toLocaleString('th-TH')} บาทต่อรายการ
                ตรวจสอบยอดอีกครั้ง หรือแจ้งแอดมินให้บันทึกให้
              </p>
            )}
            {needsCeo && (
              <p className="text-xs text-amber-700 mt-1.5">
                ยอดนี้ต้องให้ผู้บริหารอนุมัติ อาจใช้เวลานานกว่าปกติ
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-2">
              รายละเอียด {category === 'other' && <span className="text-red-500">*</span>}
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={category === 'other' ? 'ระบุว่าจ่ายอะไร' : 'เช่น ทางด่วนขาไปรับเครื่อง'}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm"
            />
          </div>

          {activeJobs.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">
                แนบกับงาน (ไม่บังคับ)
              </label>
              {/* เลือกทีหลังได้ที่หน้ารายการ ตราบใดที่ยังไม่ถูกส่งขึ้นระบบ —
                  เคสจริงคือถ่ายสลิปที่ด่านโดยยังไม่รู้ว่าจะแนบงานไหน */}
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white"
              >
                <option value="">ไม่แนบกับงานใด</option>
                {/* ป้ายต้องเป็นสิ่งที่ไรเดอร์เพิ่งเห็นบนการ์ดงาน ไม่ใช่ id ภายใน —
                    `OID || ref_no || #4ตัวท้าย` คือสำนวนเดียวกับ ActiveJobCard /
                    IncomingJobCard / HistoryTab / ChatModal / JobDetailPage และ
                    ต่อด้วยรุ่นเครื่องซึ่งเป็นพาดหัวของการ์ดงานทุกใบ

                    เดิมบรรทัดนี้อ่าน `j.ref` ซึ่ง **ไม่มีอยู่จริงในระบบ** (ไม่มีที่ไหน
                    เขียนฟิลด์ชื่อนี้เลย) มันจึงตกไปที่ `#4ตัวท้าย` ของ push key
                    ทุกครั้ง = รายการเป็น #AQsf #TMBp ที่ไม่มีความหมายกับใคร */}
                {activeJobs.map((j) => {
                  const oid = j.OID || j.ref_no || `#${j.id.slice(-4)}`;
                  return (
                    <option key={j.id} value={j.id}>
                      {j.model ? `${oid} · ${j.model}` : oid}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white py-4 rounded-2xl font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {files.length === 0 ? 'แนบรูปหลักฐานก่อน' : online ? 'ส่งคำขอเบิก' : 'บันทึกไว้รอส่ง'}
          </button>
        </div>
      </div>
    </div>
  );
};
