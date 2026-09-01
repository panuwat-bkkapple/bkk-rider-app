// src/components/history/HistoryJobSheet.tsx
//
// Bottom sheet รายละเอียดงานจากหน้าประวัติ — ตอบสามคำถามที่การ์ดตอบไม่ได้:
// เริ่มรับงานกี่โมง ใช้เวลาเดินทาง/ระยะทางเท่าไหร่ และลูกค้ารีวิวว่ายังไง
// ทุกตัวเลขมาจากข้อมูลที่อยู่บน job แล้ว (checkpoints / rider_fee_meta) —
// ไม่มีการเขียนอะไร และ query เพิ่มมีแค่ reviews/{review_id} ใบเดียว
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { AlertTriangle, Bike, CheckCircle2, Clock, MapPinOff, MessageSquare, Navigation, Star, X } from 'lucide-react';
import { functions } from '../../api/firebase';
import { toast } from '../common/Toast';
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
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeBusy, setDisputeBusy] = useState(false);

  // แย้งหมุดลูกค้า — เปิดให้กดเฉพาะตอนจุดเช็คอิน 'ถึงลูกค้า' อยู่นอกโซนที่
  // ระบบตั้งไว้ (is_within_zone === false) เพราะนั่นคือเคสเดียวที่ระยะทางซึ่ง
  // ใช้คิดค่าวิ่งอาจไม่ใช่ที่ที่ไปจริง. server ตรวจซ้ำทุกเงื่อนไขอีกรอบ
  const arrived = job?.checkpoints?.rider_arrived;
  const dispute = job?.pin_dispute;
  const canDispute =
    !dispute &&
    arrived?.is_within_zone === false &&
    typeof arrived?.lat === 'number' &&
    typeof arrived?.lng === 'number';

  const submitDispute = async () => {
    setDisputeBusy(true);
    try {
      await httpsCallable(functions, 'riderDisputePickupPin')({
        jobId: job.id,
        reason: disputeReason.trim() || undefined,
      });
      toast.success('ส่งคำแย้งให้แอดมินแล้ว');
      setDisputeOpen(false);
      setDisputeReason('');
    } catch (e: any) {
      toast.error(e?.message || 'ส่งคำแย้งไม่สำเร็จ');
    } finally {
      setDisputeBusy(false);
    }
  };

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
      // นอกโซน = เล่าเป็น "หมุดกับจุดเช็คอินไม่ตรงกัน" ไม่ใช่ "ไรเดอร์ห่างเป้า"
      // เพราะสาเหตุที่พบจริงคือลูกค้าปักหมุดผิด และถ้อยคำที่อ่านเหมือนตำหนิ
      // จะทำให้คนที่ถูกหมุดผิดเล่นงานรู้สึกว่าระบบกำลังจับผิดเขา
      if (entry.distanceM !== null) {
        const outOfZone = arrived?.is_within_zone === false;
        const label = entry.distanceM >= 1000
          ? `${(entry.distanceM / 1000).toFixed(1)} กม.`
          : `${Math.round(entry.distanceM)} ม.`;
        parts.push(outOfZone ? `หมุดลูกค้าห่างจากจุดเช็คอิน ${label}` : `ห่างหมุดลูกค้า ${label}`);
      }
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

        {/* แย้งหมุดลูกค้า — ค่าวิ่งคิดจากเส้นทาง "หมุด → สาขา" ถ้าหมุดผิด
            ระยะทางที่คิดเงินก็เป็นของที่ที่ไม่มีใครไป คนที่รู้คือไรเดอร์ */}
        {dispute ? (
          <div className={`rounded-2xl px-4 py-3 border ${
            dispute.status === 'approved' ? 'bg-emerald-50 border-emerald-100'
              : dispute.status === 'rejected' ? 'bg-gray-50 border-gray-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-2">
              <MapPinOff size={16} className={
                dispute.status === 'approved' ? 'text-emerald-600'
                  : dispute.status === 'rejected' ? 'text-gray-400' : 'text-amber-700'
              } />
              <div className="text-[13px] font-bold text-gray-800">
                {dispute.status === 'approved' ? 'แอดมินอนุมัติการแย้งหมุด'
                  : dispute.status === 'rejected' ? 'แอดมินไม่อนุมัติการแย้งหมุด'
                  : 'ยื่นแย้งหมุดแล้ว รอแอดมินตรวจ'}
              </div>
            </div>
            {dispute.status === 'approved' && (
              <div className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                คิดค่าวิ่งใหม่จากจุดที่เช็คอิน: {formatCurrency(dispute.fee_before)} → {formatCurrency(dispute.fee_after)}
                {typeof dispute.delta === 'number' && dispute.delta !== 0 &&
                  ` (${dispute.delta > 0 ? '+' : ''}${formatCurrency(dispute.delta)})`}
                {dispute.delta_tx_id && ' · ลงส่วนต่างในกระเป๋าแล้ว'}
              </div>
            )}
            {dispute.admin_note && (
              <div className="text-[11px] text-gray-500 mt-1 leading-relaxed">หมายเหตุจากแอดมิน: {dispute.admin_note}</div>
            )}
          </div>
        ) : canDispute && (
          disputeOpen ? (
            <div className="rounded-2xl px-4 py-3 border border-amber-200 bg-amber-50 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-900 leading-relaxed">
                  ระบบจะส่งพิกัดจุดที่คุณเช็คอิน "ถึงลูกค้า" ให้แอดมินตรวจ ถ้าอนุมัติจะคิดค่าวิ่งใหม่จากจุดนั้น
                </div>
              </div>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="จุดรับจริงอยู่ที่ไหน (ไม่บังคับ)"
                className="w-full text-xs rounded-xl border border-amber-200 px-3 py-2 bg-white focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitDispute}
                  disabled={disputeBusy}
                  className="flex-1 bg-amber-600 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-50"
                >
                  {disputeBusy ? 'กำลังส่ง...' : 'ส่งคำแย้งให้แอดมิน'}
                </button>
                <button
                  onClick={() => setDisputeOpen(false)}
                  disabled={disputeBusy}
                  className="px-4 bg-white text-gray-500 border border-gray-200 text-xs font-bold rounded-xl py-2.5"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDisputeOpen(true)}
              className="rounded-2xl px-4 py-3 border border-dashed border-amber-300 bg-amber-50/50 flex items-center gap-2.5 text-left active:scale-[0.98] transition-transform"
            >
              <MapPinOff size={16} className="text-amber-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-900">หมุดลูกค้าไม่ตรงกับจุดรับจริง?</div>
                <div className="text-[10px] text-amber-700 mt-0.5">แย้งเพื่อขอให้คิดค่าวิ่งใหม่จากจุดที่คุณเช็คอิน</div>
              </div>
            </button>
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
