// src/components/history/HistoryJobSheet.tsx
//
// Bottom sheet รายละเอียดงานจากหน้าประวัติ — ตอบสามคำถามที่การ์ดตอบไม่ได้:
// เริ่มรับงานกี่โมง ใช้เวลาเดินทาง/ระยะทางเท่าไหร่ และลูกค้ารีวิวว่ายังไง
// ทุกตัวเลขมาจากข้อมูลที่อยู่บน job แล้ว (checkpoints / rider_fee_meta) —
// ไม่มีการเขียนอะไร และ query เพิ่มมีแค่ reviews/{review_id} ใบเดียว
import { Bike, CheckCircle2, Clock, MessageSquare, Navigation, Star, X } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  buildJobTimeline,
  formatDurationTh,
  formatTimeTh,
  jobDistanceKm,
  totalJobMs,
  travelToCustomerMs,
} from '../../utils/jobTimeline';
import { useJobReview } from '../../hooks/useJobReview';
import { JOB_STATUS, normalizeStatus } from '../../types/job-statuses';

interface HistoryJobSheetProps {
  job: any;
  onClose: () => void;
  onOpenChat: (jobId: string) => void;
}

const StatTile = ({ icon, value, label }: { icon: React.ReactNode; value: string | null; label: string }) => (
  value ? (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl px-2 py-2.5 flex flex-col items-center gap-0.5">
      {icon}
      <div className="text-sm font-bold text-gray-800">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  ) : (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl px-2 py-2.5 flex flex-col items-center justify-center gap-0.5">
      <div className="text-sm font-bold text-gray-300">—</div>
      <div className="text-[10px] text-gray-300">{label}</div>
    </div>
  )
);

export const HistoryJobSheet = ({ job, onClose, onOpenChat }: HistoryJobSheetProps) => {
  const timeline = buildJobTimeline(job);
  const distanceKm = jobDistanceKm(job);
  const travelMs = travelToCustomerMs(job);
  const totalMs = totalJobMs(job);
  const { review } = useJobReview(job);

  const canonical = normalizeStatus(job.status, job.receive_method);
  const isCancelled = canonical === JOB_STATUS.CANCELLED;
  const fee = Number(job.rider_fee);
  const hasFee = Number.isFinite(fee) && fee > 0;
  const feePaid = job.rider_fee_status === 'Paid';

  // บรรทัดเสริมใต้แต่ละจุด — เล่าเฉพาะสิ่งที่มีข้อมูลจริง
  const subLines = (entry: (typeof timeline)[number]): string[] => {
    const lines: string[] = [];
    if (entry.stage === 'rider_arrived') {
      const parts: string[] = [];
      if (entry.sincePrevMs !== null) parts.push(`เดินทาง ${formatDurationTh(entry.sincePrevMs)}`);
      if (entry.distanceM !== null) parts.push(`ห่างหมุดลูกค้า ${Math.round(entry.distanceM)} ม.`);
      if (parts.length) lines.push(parts.join(' · '));
      if (job.cust_address) lines.push(String(job.cust_address));
    } else if (entry.stage === 'customer_left' && entry.sincePrevMs !== null) {
      lines.push(`อยู่หน้างาน ${formatDurationTh(entry.sincePrevMs)}`);
    } else if (entry.stage === 'branch_handover') {
      const parts: string[] = [];
      if (entry.sincePrevMs !== null) parts.push(`ขากลับ ${formatDurationTh(entry.sincePrevMs)}`);
      if (entry.targetLabel) parts.push(entry.targetLabel);
      if (parts.length) lines.push(parts.join(' · '));
    }
    return lines;
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-gray-900/45" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-[2rem] shadow-2xl max-h-[88vh] overflow-y-auto hide-scrollbar px-6 pb-7 pt-2.5 flex flex-col gap-3 animate-in slide-in-from-bottom">

        <div className="flex justify-center sticky top-0 bg-white pt-1 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* หัวงาน */}
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0 flex flex-col gap-1.5">
            <div className="text-base font-bold text-gray-800 leading-snug">{job.model || 'ไม่ระบุรุ่น'}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-gray-100 text-gray-500 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                {job.OID || job.ref_no || `#${String(job.id || '').slice(-4)}`}
              </span>
              <span className="text-[10px] text-gray-400">{formatDate(job.completed_at || job.updated_at || job.created_at)}</span>
              {isCancelled ? (
                <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full">ยกเลิก</span>
              ) : (
                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full">เสร็จสิ้น</span>
              )}
            </div>
          </div>
          {hasFee && (
            <div className="shrink-0 text-base font-bold text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-xl">
              +{formatCurrency(fee)}
            </div>
          )}
          <button onClick={onClose} className="shrink-0 w-8 h-8 -mr-1 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        {/* แถวสรุปตัวเลข */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            icon={<Bike size={16} className="text-emerald-500" />}
            value={distanceKm !== null ? `${distanceKm} กม.` : null}
            label="ระยะทางงานนี้"
          />
          <StatTile
            icon={<Navigation size={16} className="text-emerald-500" />}
            value={travelMs !== null ? formatDurationTh(travelMs) : null}
            label="เดินทางไปรับ"
          />
          <StatTile
            icon={<Clock size={16} className="text-emerald-500" />}
            value={totalMs !== null ? formatDurationTh(totalMs) : null}
            label="เวลารวมทั้งงาน"
          />
        </div>

        {/* ไทม์ไลน์ */}
        {timeline.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-bold text-gray-800">ไทม์ไลน์งาน</div>
            <div className="flex flex-col">
              {timeline.map((entry, i) => (
                <div key={entry.stage} className="flex gap-3">
                  <div className="flex flex-col items-center w-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1" />
                    {i < timeline.length - 1 && <div className="w-0.5 flex-grow bg-emerald-100" />}
                  </div>
                  <div className={`flex justify-between items-start flex-grow gap-2 ${i < timeline.length - 1 ? 'pb-3.5' : ''}`}>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <div className="text-[13px] font-bold text-gray-800">{entry.label}</div>
                      {subLines(entry).map((line) => (
                        <div key={line} className="text-[11px] text-gray-400 leading-snug break-words">{line}</div>
                      ))}
                    </div>
                    <div className="text-xs font-semibold text-gray-500 shrink-0">{formatTimeTh(entry.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-gray-200 rounded-2xl px-4 py-5 flex flex-col items-center gap-1.5 text-center">
            <Clock size={20} className="text-gray-400" />
            <div className="text-xs font-bold text-gray-500">งานนี้ไม่มีข้อมูลไทม์ไลน์</div>
            <div className="text-[11px] text-gray-400 leading-relaxed">
              เป็นงานก่อนระบบบันทึกจุดเช็คอิน<br />งานใหม่จะเห็นเวลารับงาน เดินทาง และส่งมอบครบทุกจุด
            </div>
          </div>
        )}

        {/* สถานะค่ารอบ */}
        {hasFee ? (
          feePaid ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5 flex items-center gap-3">
              <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />
              <div className="flex-grow min-w-0">
                <div className="text-[13px] font-bold text-emerald-900">ค่ารอบเข้ากระเป๋าแล้ว</div>
                {job.settled_at && (
                  <div className="text-[10px] text-emerald-600">โอนเข้ากระเป๋า {formatDate(job.settled_at)}</div>
                )}
              </div>
              <div className="text-[15px] font-bold text-emerald-600 shrink-0">+{formatCurrency(fee)}</div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex items-center gap-3">
              <Clock size={22} className="text-amber-700 shrink-0" />
              <div className="flex-grow min-w-0">
                <div className="text-[13px] font-bold text-amber-900">ค่ารอบรอเข้ากระเป๋า</div>
                <div className="text-[10px] text-amber-700">รอฝ่ายการเงินอนุมัติค่ารอบ</div>
              </div>
              <div className="text-[15px] font-bold text-amber-700 shrink-0">{formatCurrency(fee)}</div>
            </div>
          )
        ) : (
          !isCancelled && (
            <div className="border border-dashed border-gray-200 rounded-2xl px-4 py-3 text-[11px] text-gray-400 text-center">
              งานนี้ยังไม่ได้กำหนดค่ารอบ — ติดต่อแอดมิน
            </div>
          )
        )}

        {/* รีวิวจากลูกค้า — งานที่ถูกยกเลิกไม่มีวันได้รีวิว ไม่ต้องเล่า */}
        {!isCancelled && (
          job.is_reviewed ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex flex-col gap-1.5">
              <div className="flex justify-between items-center gap-2">
                <div className="text-xs font-bold text-amber-900">รีวิวจากลูกค้า</div>
                {review?.overall ? (
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={13}
                        className={n <= review.overall! ? 'text-amber-500 fill-amber-500' : 'text-amber-200'}
                      />
                    ))}
                    <span className="text-xs font-bold text-amber-700 ml-1">{review.overall.toFixed(1)}</span>
                  </div>
                ) : (
                  <Star size={13} className="text-amber-500 fill-amber-500" />
                )}
              </div>
              {review?.comment ? (
                <div className="text-[11px] text-amber-800 leading-relaxed break-words">"{review.comment}"</div>
              ) : (
                !review && <div className="text-[10px] text-amber-700">ลูกค้ารีวิวงานนี้แล้ว</div>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-2.5">
              <Star size={16} className="text-gray-300 shrink-0" />
              <div className="text-xs font-semibold text-gray-400">ลูกค้ายังไม่ได้รีวิวงานนี้</div>
            </div>
          )
        )}

        {/* แชท */}
        {(job.chats || job.chat_flags) && (
          <button
            onClick={() => onOpenChat(job.id)}
            className="bg-purple-50 rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <MessageSquare size={16} className="text-purple-600" />
            <span className="text-[13px] font-bold text-purple-600">ดูประวัติแชทของงานนี้</span>
          </button>
        )}

      </div>
    </div>
  );
};
