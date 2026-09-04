// รายการเบิกของไรเดอร์เอง — ทั้งของที่รอส่ง ของที่ส่งไปแล้ว และของที่แอดมิน
// ส่งกลับมาให้แก้
//
// **แสดงของที่ยังไม่ขึ้นระบบด้วย ไม่ใช่แค่แถวบน server** — ถ้าโชว์แต่แถวจริง
// ไรเดอร์ที่ถ่ายสลิปตอนออฟไลน์จะเห็นหน้าจอว่างเปล่า แล้วสรุปว่ารายการหาย
// แล้วถ่ายส่งใหม่ (ซึ่งกันแถวซ้ำไว้แล้วด้วย id คงที่ แต่ความรู้สึกว่าหาย
// ก็ยังทำให้เขาเลิกใช้). การรวมสองแหล่งอยู่ที่ `utils/expenseClaims.ts`
// (pure มีเทส) ไฟล์นี้แค่ render
//
// **ปุ่มลบมีเฉพาะบนรายการที่ต้องถ่ายใหม่หรือส่งไม่ได้ถาวร** และต้องกดยืนยัน
// — การลบมีทางเดียวคือไรเดอร์ตัดสินใจเอง ระบบไม่ลบของค้างทิ้งไม่ว่ากรณีใด

import { useState } from 'react';
import {
  Clock, UploadCloud, AlertTriangle, CameraOff, CheckCircle2, Trash2, RefreshCw,
  UserCheck, Landmark, Wallet, Undo2, XCircle, Pencil,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  CLAIM_STATUS_LABEL,
  type ClaimViewStatus,
  type ExpenseClaimView,
} from '../../utils/expenseClaims';

const CATEGORY_LABEL: Record<string, string> = {
  toll: 'ค่าทางด่วน',
  parking: 'ค่าที่จอดรถ',
  other: 'ค่าใช้จ่ายอื่น',
};

const STATUS_UI: Record<ClaimViewStatus, { cls: string; Icon: typeof Clock }> = {
  pending: { cls: 'bg-sky-50 text-sky-700 border-sky-200', Icon: Clock },
  uploading: { cls: 'bg-sky-50 text-sky-700 border-sky-200', Icon: UploadCloud },
  done: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  failed_permanent: { cls: 'bg-red-50 text-red-700 border-red-200', Icon: AlertTriangle },
  evidence_lost: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: CameraOff },
  submitted: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: UserCheck },
  approved: { cls: 'bg-sky-50 text-sky-800 border-sky-200', Icon: Landmark },
  finance_approved: { cls: 'bg-indigo-50 text-indigo-800 border-indigo-200', Icon: Landmark },
  paid: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Wallet },
  needs_info: { cls: 'bg-orange-50 text-orange-800 border-orange-300', Icon: Undo2 },
  rejected: { cls: 'bg-gray-100 text-gray-600 border-gray-200', Icon: XCircle },
};

interface Props {
  items: ExpenseClaimView[];
  staleCount: number;
  onRetry: () => void;
  onDelete: (id: string) => void;
  /** แก้ใบที่แอดมินตีกลับแล้วส่งใหม่ */
  onResubmit: (view: ExpenseClaimView) => void;
}

export const ExpenseQueueList = ({ items, staleCount, onRetry, onDelete, onResubmit }: Props) => {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (items.length === 0) return null;

  const hasQueued = items.some((i) => i.source === 'queue');

  return (
    <div className="px-6 pt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-gray-800 text-sm">รายการเบิกค่าใช้จ่าย</h4>
        {hasQueued && (
          <button onClick={onRetry} className="text-xs text-emerald-600 font-bold flex items-center gap-1">
            <RefreshCw size={12} /> ลองส่งอีกครั้ง
          </button>
        )}
      </div>

      {/* แถบถาวร ไม่ใช่ toast — ของค้างที่หายไปจากสายตาคือของที่ไม่มีใครตาม */}
      {staleCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          <span>มีรายการเบิก {staleCount} รายการค้างส่งมาเกิน 3 วัน — เปิดแอปตอนมีสัญญาณเพื่อส่ง</span>
        </div>
      )}

      {items.map((i) => {
        const ui = STATUS_UI[i.status];
        return (
          <div
            key={i.id}
            className={`bg-white p-4 rounded-2xl shadow-sm border ${
              i.canResubmit ? 'border-orange-300' : 'border-gray-100'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900">
                  {CATEGORY_LABEL[i.category] || CATEGORY_LABEL.other}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {/* คิว = เวลาที่เขากดส่ง · server = เวลาที่แถวถึงระบบ */}
                  {formatDate(i.at)}
                  {i.job_id ? ` · งาน #${i.job_id.slice(-4)}` : ''}
                </div>
                {i.note && (
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{i.note}</div>
                )}
              </div>
              <div className="text-base font-bold text-gray-900 shrink-0">
                {formatCurrency(i.amount_thb)}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 ${ui.cls}`}>
                <ui.Icon size={11} /> {CLAIM_STATUS_LABEL[i.status]}
              </span>
              {/* ไม่มีป้าย "รอผู้บริหารอนุมัติ" ที่นี่โดยตั้งใจ — `needs_ceo`
                  ถูกตัดสินฝั่ง server จากเพดานที่แอดมินตั้งไว้ ณ วันที่ยื่น
                  ฝั่งแอปเดาเองได้แต่จะเดาจากค่าเริ่มต้นที่อาจไม่ตรงกับของจริง
                  แล้วขึ้นป้ายผิด ซึ่งแย่กว่าไม่มีป้าย (ฟอร์มบอกใบ้ไปแล้ว
                  ตอนกรอกยอด) */}
            </div>

            {/* ข้อความที่ไรเดอร์ต้องอ่าน — error ของคิวถูกแปลเป็นภาษาคนที่ runner
                แล้ว ส่วนเหตุผลตีกลับ/ปฏิเสธคือคำของแอดมินตรงๆ */}
            {i.message && (
              <p className={`text-xs mt-2 ${i.canResubmit ? 'text-orange-800 font-medium' : 'text-gray-500'}`}>
                {i.canResubmit ? 'แอดมินขอให้แก้: ' : ''}{i.message}
              </p>
            )}

            {i.canResubmit && (
              <button
                onClick={() => onResubmit(i)}
                className="mt-3 w-full bg-orange-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Pencil size={12} /> แก้ไขแล้วส่งใหม่
              </button>
            )}

            {i.canDelete && (
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
