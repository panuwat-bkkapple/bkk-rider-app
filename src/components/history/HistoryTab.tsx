// src/components/history/HistoryTab.tsx
import { useMemo, useState } from 'react';
import { Activity, Bike, ChevronRight, Clock, Navigation, Star } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  checkpointAt,
  formatDurationTh,
  formatTimeTh,
  jobDistanceKm,
  totalJobMs,
} from '../../utils/jobTimeline';
import { getRiderPayout, sumRiderPayout } from '../../utils/jobHelpers';
import { JOB_STATUS, normalizeStatus } from '../../types/job-statuses';
import { HistoryJobSheet } from './HistoryJobSheet';
import type { HistoryFilter } from '../../types';

interface HistoryTabProps {
  history: any[];
  historyFilter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
  onOpenChat: (jobId: string) => void;
  // ยานพาหนะของไรเดอร์ที่กำลังดูอยู่ (riders/{id}/vehicle_type) — อัตราค่าวิ่ง
  // แยกตามยานพาหนะ ค่ารอบที่โชว์จึงต้องเป็นของการ์ดอัตราที่ตรงคน ไม่ใช่ตัวเลข
  // กลางของมอเตอร์ไซค์ที่เก็บไว้ตอนงานยังไม่มีใครถือ
  vehicleType?: 'motorcycle' | 'car' | null;
}

const filters = [
  { id: 'today' as HistoryFilter, label: 'วันนี้' },
  { id: 'yesterday' as HistoryFilter, label: 'เมื่อวาน' },
  { id: 'this_week' as HistoryFilter, label: 'สัปดาห์นี้' },
  { id: 'all' as HistoryFilter, label: 'ทั้งหมด' },
];

export const HistoryTab = ({ history, historyFilter, onFilterChange, onOpenChat, vehicleType }: HistoryTabProps) => {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const displayData = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const filtered = history.filter(job => {
      const time = job.completed_at || job.updated_at || job.created_at || 0;
      if (historyFilter === 'today') return time >= todayStart;
      if (historyFilter === 'yesterday') return time >= todayStart - 86400000 && time < todayStart;
      if (historyFilter === 'this_week') return time >= todayStart - (7 * 86400000);
      return true;
    });
    return {
      list: filtered,
      stats: {
        income: sumRiderPayout(filtered, vehicleType),
        count: filtered.length
      }
    };
  }, [history, historyFilter, vehicleType]);

  // Sheet อ่านงานสดจาก list เสมอ (ไม่ freeze snapshot ตอนกด) — ค่ารอบ/รีวิว
  // ที่เพิ่งเปลี่ยนจะสะท้อนทันทีระหว่างเปิดค้าง
  const selectedJob = selectedJobId ? displayData.list.find(j => j.id === selectedJobId) : null;

  return (
    <div className="p-6 pt-12 h-full overflow-y-auto pb-32 animate-in fade-in">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">ประวัติการรับงาน</h2>

      {/* Filter buttons */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-6 pb-2">
        {filters.map(filter => (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              historyFilter === filter.id
                ? 'bg-emerald-500 text-white shadow-md'
                : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Stats card */}
      <div className="bg-emerald-500 rounded-[2rem] p-6 mb-8 text-white shadow-lg relative overflow-hidden transition-all duration-300">
        <div className="absolute top-0 right-0 p-4 opacity-20"><Activity size={80} /></div>
        <p className="text-xs font-medium text-emerald-100 mb-4">สรุปผลงาน</p>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs text-emerald-100 mb-1">รายได้รวม</p>
            <p className="text-3xl font-bold">{formatCurrency(displayData.stats.income)}</p>
          </div>
          <div className="border-l border-emerald-400 pl-6">
            <p className="text-xs text-emerald-100 mb-1">จำนวนงาน</p>
            <p className="text-3xl font-bold">{displayData.stats.count} <span className="text-sm font-normal">งาน</span></p>
          </div>
        </div>
      </div>

      {/* History list */}
      <div className="space-y-3">
        {displayData.list.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-bold text-gray-600 mb-1">ยังไม่มีประวัติงาน</p>
            <p className="text-sm text-gray-400">ไม่มีประวัติการวิ่งงานในช่วงเวลานี้</p>
          </div>
        ) : (
          displayData.list.map(job => {
            const acceptedAt = checkpointAt(job, 'rider_accepted');
            const distanceKm = jobDistanceKm(job);
            const totalMs = totalJobMs(job);
            const hasMetaRow = acceptedAt !== null || distanceKm !== null || totalMs !== null;
            const cancelled = normalizeStatus(job.status, job.receive_method) === JOB_STATUS.CANCELLED;
            return (
              <button
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className="w-full text-left bg-white p-4 rounded-2xl shadow-sm flex flex-col gap-2.5 border border-gray-100 active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-800 text-sm mb-1 line-clamp-1">{job.model}</div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-2 flex-wrap">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                        {job.OID || job.ref_no || `#${job.id.slice(-4)}`}
                      </span>
                      <span>{formatDate(job.completed_at || job.updated_at || job.created_at)}</span>
                      {/* ป้ายรีวิว — งานที่ยกเลิกไม่มีวันได้รีวิว ไม่ต้องขึ้นป้าย */}
                      {!cancelled && (job.is_reviewed ? (
                        <span className="flex items-center gap-1 bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full">
                          <Star size={9} className="text-amber-500 fill-amber-500" /> รีวิวแล้ว
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-400">
                          <Star size={9} className="text-gray-300" /> ยังไม่รีวิว
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-base font-bold text-emerald-500 bg-emerald-50 px-3 py-1 rounded-xl">
                      +{formatCurrency(getRiderPayout(job, vehicleType))}
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </div>
                {/* แถวสรุปเวลา/ระยะทาง — มีข้อมูลถึงขึ้น ไม่มีก็ตัดทั้งแถว */}
                {hasMetaRow && (
                  <div className="flex items-center gap-3 border-t border-gray-100 pt-2.5 flex-wrap">
                    {acceptedAt !== null && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                        <Clock size={12} className="text-gray-400" /> รับงาน {formatTimeTh(acceptedAt)}
                      </span>
                    )}
                    {distanceKm !== null && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                        <Bike size={12} className="text-gray-400" /> {distanceKm} กม.
                      </span>
                    )}
                    {totalMs !== null && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                        <Navigation size={12} className="text-gray-400" /> รวม {formatDurationTh(totalMs)}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {selectedJob && (
        <HistoryJobSheet
          job={selectedJob}
          onClose={() => setSelectedJobId(null)}
          onOpenChat={(jobId) => { setSelectedJobId(null); onOpenChat(jobId); }}
        />
      )}
    </div>
  );
};
