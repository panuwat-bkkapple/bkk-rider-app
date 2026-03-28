// src/components/home/HomeTab.tsx
import { Bike, X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { MapBackground } from '../layout/MapBackground';
import { IncomingJobCard } from './IncomingJobCard';
import { ActiveJobCard } from './ActiveJobCard';
import type { RiderInfo } from '../../types';

interface HomeTabProps {
  riderInfo: RiderInfo;
  isOnline: boolean;
  onToggleOnline: () => void;
  balance: number;
  incomingList: any[];
  activeList: any[];
  onAcceptJob: (jobId: string, extraData: any) => void;
  onUpdateStatus: (jobId: string, nextStatus: string, logMsg: string, extraData?: any) => void;
  onRejectJob: (job: any) => void;
  onOpenChat: (jobId: string) => void;
  onCallCustomer: (job: any) => void;
  onOpenNavigation: (job: any) => void;
  onInspectJob: (job: any) => void;
  onCompleteJob: (job: any) => void;
  onReportDiscrepancy: (job: any) => void;
  onGoToProfile: () => void;
}

export const HomeTab = ({
  riderInfo, isOnline, onToggleOnline, balance,
  incomingList, activeList,
  onAcceptJob, onUpdateStatus, onRejectJob,
  onOpenChat, onCallCustomer, onOpenNavigation,
  onInspectJob, onCompleteJob, onReportDiscrepancy, onGoToProfile
}: HomeTabProps) => (
  <div className="absolute inset-0 pb-32 animate-in fade-in duration-500">
    <MapBackground />

    {/* Header */}
    <div className="absolute top-12 left-0 right-0 px-6 z-20 flex justify-between items-center">
      <div
        onClick={onGoToProfile}
        className="bg-white/90 backdrop-blur-md p-1.5 pr-4 rounded-full shadow-sm flex items-center gap-3 border border-gray-100"
      >
        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex justify-center items-center font-bold text-lg shadow-inner">
          {riderInfo.name.charAt(0)}
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
      {isOnline && incomingList.map(job => (
        <IncomingJobCard
          key={job.id}
          job={job}
          riderInfoId={riderInfo.id}
          onAccept={onAcceptJob}
          onReject={onRejectJob}
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
          onReportDiscrepancy={onReportDiscrepancy}
        />
      ))}
    </div>
  </div>
);
