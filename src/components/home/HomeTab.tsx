// src/components/home/HomeTab.tsx
import { useMemo } from 'react';
import { Bike, X, Coffee, Wifi, CalendarDays } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { MapBackground } from '../layout/MapBackground';
import { IncomingJobCard } from './IncomingJobCard';
import { ActiveJobCard } from './ActiveJobCard';
import { getAppointmentDateKey } from '../../utils/jobHelpers';
import type { RiderInfo, JobDateFilter } from '../../types';

interface HomeTabProps {
  riderInfo: RiderInfo;
  isOnline: boolean;
  onToggleOnline: () => void;
  balance: number;
  incomingList: any[];
  activeList: any[];
  jobDateFilter: JobDateFilter;
  onJobDateFilterChange: (filter: JobDateFilter) => void;
  onAcceptJob: (jobId: string, extraData: any) => void;
  onUpdateStatus: (jobId: string, nextStatus: string, logMsg: string, extraData?: any) => void;
  onRejectJob: (job: any) => void;
  onOpenChat: (jobId: string) => void;
  onCallCustomer: (job: any) => void;
  onOpenNavigation: (job: any) => void;
  onInspectJob: (job: any) => void;
  onCompleteJob: (job: any) => void;
  onRevertInspection: (job: any) => void;
  onReportDiscrepancy: (job: any) => void;
  onOpenJobDetail: (jobId: string) => void;
  onGoToProfile: () => void;
}

const filters: { id: JobDateFilter; label: string }[] = [
  { id: 'today', label: 'วันนี้' },
  { id: 'tomorrow', label: 'พรุ่งนี้' },
  { id: 'this_week', label: 'สัปดาห์นี้' },
  { id: 'all', label: 'ทั้งหมด' },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const filterByDate = (list: any[], filter: JobDateFilter): any[] => {
  if (filter === 'all') return list;
  const now = new Date();
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const weekEnd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  return list.filter(job => {
    const key = getAppointmentDateKey(job);
    if (!key) return false;
    if (filter === 'today') return key === today;
    if (filter === 'tomorrow') return key === tomorrow;
    if (filter === 'this_week') return key >= today && key < weekEnd;
    return true;
  });
};

export const HomeTab = ({
  riderInfo, isOnline, onToggleOnline, balance,
  incomingList, activeList, jobDateFilter, onJobDateFilterChange,
  onAcceptJob, onUpdateStatus, onRejectJob,
  onOpenChat, onCallCustomer, onOpenNavigation,
  onInspectJob, onCompleteJob, onRevertInspection, onReportDiscrepancy,
  onOpenJobDetail, onGoToProfile
}: HomeTabProps) => {
  const visibleIncoming = useMemo(
    () => filterByDate(incomingList, jobDateFilter),
    [incomingList, jobDateFilter]
  );
  const hiddenCount = incomingList.length - visibleIncoming.length;

  return (
  <div className="absolute inset-0 pb-32 animate-in fade-in duration-500">
    <MapBackground />

    {/* Header */}
    <div className="absolute top-12 left-0 right-0 px-6 z-20 flex justify-between items-center">
      <div
        onClick={onGoToProfile}
        className="bg-white/90 backdrop-blur-md p-1.5 pr-4 rounded-full shadow-sm flex items-center gap-3 border border-gray-100"
      >
        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex justify-center items-center font-bold text-lg shadow-inner">
          {(riderInfo.name || '?').charAt(0)}
        </div>
        <div>
          <div className="text-[10px] text-gray-500 font-medium">ยอดเงินสะสม</div>
          <div className="text-sm font-bold text-gray-800">{formatCurrency(balance)}</div>
        </div>
      </div>
      <button
        onClick={onToggleOnline}
        className={`relative w-24 h-10 rounded-full shadow-inner flex items-center transition-all duration-300 ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`}
      >
        <div className={`absolute w-8 h-8 bg-white rounded-full flex justify-center items-center transition-transform duration-300 ${isOnline ? 'translate-x-15' : 'translate-x-1'}`}>
          {isOnline ? <Bike size={14} className="text-emerald-500" /> : <X size={14} className="text-gray-400" />}
        </div>
        <span className={`w-full text-center text-xs font-bold ${isOnline ? 'text-white pr-6' : 'text-gray-500 pl-6'}`}>
          {isOnline ? 'รับงาน' : 'ปิดรับ'}
        </span>
      </button>
    </div>

    {/* Job cards */}
    <div className="absolute top-28 bottom-24 left-4 right-4 z-30 overflow-y-auto hide-scrollbar pb-4 space-y-4">
      {/* Date filter bar */}
      {isOnline && (
        <div className="bg-white/90 backdrop-blur-md rounded-2xl px-3 py-2 shadow-sm border border-gray-100 flex items-center gap-2 overflow-x-auto hide-scrollbar">
          <CalendarDays size={16} className="text-gray-400 shrink-0" />
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => onJobDateFilterChange(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                jobDateFilter === f.id
                  ? 'bg-emerald-500 text-white shadow'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {isOnline && visibleIncoming.map(job => (
        <IncomingJobCard
          key={job.id}
          job={job}
          riderInfoId={riderInfo.id}
          onAccept={onAcceptJob}
          onReject={onRejectJob}
          onOpenDetail={onOpenJobDetail}
        />
      ))}

      {isOnline && activeList.map((job, index) => (
        <ActiveJobCard
          key={job.id}
          job={job}
          index={index}
          totalJobs={activeList.length}
          onUpdateStatus={onUpdateStatus}
          onOpenChat={onOpenChat}
          onCallCustomer={onCallCustomer}
          onOpenNavigation={onOpenNavigation}
          onReject={onRejectJob}
          onInspect={onInspectJob}
          onCompleteJob={onCompleteJob}
          onRevertInspection={onRevertInspection}
          onReportDiscrepancy={onReportDiscrepancy}
          onOpenDetail={onOpenJobDetail}
        />
      ))}

      {/* Empty states */}
      {isOnline && visibleIncoming.length === 0 && activeList.length === 0 && (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl p-8 text-center shadow-lg border border-gray-100">
          <Coffee size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="font-bold text-gray-700 mb-1">
            {hiddenCount > 0 ? 'ไม่มีงานในช่วงเวลาที่เลือก' : 'ยังไม่มีงานเข้า'}
          </h3>
          <p className="text-sm text-gray-400">
            {hiddenCount > 0
              ? `มีงานอีก ${hiddenCount} งานในช่วงอื่น — กด "ทั้งหมด" เพื่อดู`
              : 'รอรับงานจากระบบ... เปิดรับงานไว้ได้เลยครับ'}
          </p>
        </div>
      )}

      {!isOnline && (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl p-8 text-center shadow-lg border border-gray-100">
          <Wifi size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="font-bold text-gray-700 mb-1">คุณอยู่ในโหมดปิดรับงาน</h3>
          <p className="text-sm text-gray-400">เปิดสวิตช์ "รับงาน" ด้านบนเพื่อเริ่มรับงาน</p>
        </div>
      )}
    </div>
  </div>
  );
};
