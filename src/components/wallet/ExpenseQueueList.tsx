// รายการเบิกของไรเดอร์เอง — ทั้งของที่รอส่งและของที่ส่งไปแล้ว
//
// **แสดงของที่ยังไม่ขึ้นระบบด้วย ไม่ใช่แค่แถวบน server** — ถ้าโชว์แต่แถวจริง
// ไรเดอร์ที่ถ่ายสลิปตอนออฟไลน์จะเห็นหน้าจอว่างเปล่า แล้วสรุปว่ารายการหาย
// แล้วถ่ายส่งใหม่ (ซึ่งกันแถวซ้ำไว้แล้วด้วย id คงที่ แต่ความรู้สึกว่าหาย
// ก็ยังทำให้เขาเลิกใช้)
//
// **ปุ่มลบมีเฉพาะบนรายการที่ต้องถ่ายใหม่หรือส่งไม่ได้ถาวร** และต้องกดยืนยัน
// — การลบมีทางเดียวคือไรเดอร์ตัดสินใจเอง ระบบไม่ลบของค้างทิ้งไม่ว่ากรณีใด

import { useState } from 'react';
import {
  Clock, UploadCloud, AlertTriangle, CameraOff, CheckCircle2, Trash2, RefreshCw,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { QueuedUpload, QueueState } from '../../utils/uploadQueue/types';

const CATEGORY_LABEL: Record<string, string> = {
  toll: 'ค่าทางด่วน',
  parking: 'ค่าที่จอดรถ',
  other: 'ค่าใช้จ่ายอื่น',
};

const STATE_UI: Record<QueueState, { label: string; cls: string; Icon: typeof Clock }> = {
  pending: { label: 'รอส่ง', cls: 'bg-sky-50 text-sky-700 border-sky-200', Icon: Clock },
  uploading: { label: 'กำลังส่ง', cls: 'bg-sky-50 text-sky-700 border-sky-200', Icon: UploadCloud },
  done: { label: 'ส่งแล้ว รออนุมัติ', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  failed_permanent: { label: 'ส่งไม่ได้', cls: 'bg-red-50 text-red-700 border-red-200', Icon: AlertTriangle },
  evidence_lost: { label: 'ต้องถ่ายใหม่', cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: CameraOff },
};

interface Props {
  items: QueuedUpload[];
  staleCount: number;
  onRetry: () => void;
  onDelete: (id: string) => void;
}

export const ExpenseQueueList = ({ items, staleCount, onRetry, onDelete }: Props) => {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="px-6 pt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-gray-800 text-sm">รายการเบิกค่าใช้จ่าย</h4>
        <button onClick={onRetry} className="text-xs text-emerald-600 font-bold flex items-center gap-1">
          <RefreshCw size={12} /> ลองส่งอีกครั้ง
        </button>
      </div>

      {/* แถบถาวร ไม่ใช่ toast — ของค้างที่หายไปจากสายตาคือของที่ไม่มีใครตาม */}
      {staleCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          <span>มีรายการเบิก {staleCount} รายการค้างส่งมาเกิน 3 วัน — เปิดแอปตอนมีสัญญาณเพื่อส่ง</span>
        </div>
      )}

      {items.map((i) => {
        const ui = STATE_UI[i.state];
        const removable = i.state === 'evidence_lost' || i.state === 'failed_permanent';
        return (
          <div key={i.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900">
                  {CATEGORY_LABEL[i.payload.category] || CATEGORY_LABEL.other}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {/* created_at = เวลาที่เขากดส่ง ไม่ใช่เวลาที่แถวขึ้นระบบ */}
                  {formatDate(i.created_at)}
                  {i.payload.job_id ? ` · งาน #${i.payload.job_id.slice(-4)}` : ''}
                </div>
                {i.payload.note && (
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{i.payload.note}</div>
                )}
              </div>
              <div className="text-base font-bold text-gray-900 shrink-0">
                {formatCurrency(i.payload.amount_thb)}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 ${ui.cls}`}>
                <ui.Icon size={11} /> {ui.label}
              </span>
              {/* ไม่มีป้าย "รอผู้บริหารอนุมัติ" ที่นี่โดยตั้งใจ — `needs_ceo`
                  ถูกตัดสินฝั่ง server จากเพดานที่แอดมินตั้งไว้ ณ วันที่ยื่น
                  ฝั่งแอปเดาเองได้แต่จะเดาจากค่าเริ่มต้นที่อาจไม่ตรงกับของจริง
                  แล้วขึ้นป้ายผิด ซึ่งแย่กว่าไม่มีป้าย (ฟอร์มบอกใบ้ไปแล้ว
                  ตอนกรอกยอด) */}
            </div>

            {/* error ที่อ่านไม่ออกคือ error ที่ไรเดอร์ทำอะไรไม่ได้ —
                ข้อความทุกอันในนี้ถูกแปลเป็นภาษาคนที่ runner แล้ว */}
            {i.last_error && i.state !== 'done' && (
              <p className="text-xs text-gray-500 mt-2">{i.last_error}</p>
            )}

            {removable && (
              confirming === i.id ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => { onDelete(i.id); setConfirming(null); }}
                    className="flex-1 bg-red-500 text-white py-2 rounded-xl text-xs font-bold"
                  >
                    ยืนยันลบรายการนี้
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 border border-gray-200"
                  >
                    ไม่ลบ
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(i.id)}
                  className="mt-3 text-xs text-gray-400 flex items-center gap-1"
                >
                  <Trash2 size={12} /> ลบรายการนี้
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};
