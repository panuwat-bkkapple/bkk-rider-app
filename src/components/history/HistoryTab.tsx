// src/components/history/HistoryTab.tsx
import { useMemo } from 'react';
import { Activity, MessageSquare } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { HistoryFilter } from '../../types';

interface HistoryTabProps {
  history: any[];
  historyFilter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
  onOpenChat: (jobId: string) => void;
}

const filters = [
  { id: 'today' as HistoryFilter, label: 'วันนี้' },
  { id: 'yesterday' as HistoryFilter, label: 'เมื่อวาน' },
  { id: 'this_week' as HistoryFilter, label: 'สัปดาห์นี้' },
  { id: 'all' as HistoryFilter, label: 'ทั้งหมด' },
];

export const HistoryTab = ({ history, historyFilter, onFilterChange, onOpenChat }: HistoryTabProps) => {
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
        income: filtered.reduce((acc, j) => acc + (Number(j.rider_fee) || 150), 0),
        count: filtered.length
      }
    };
  }, [history, historyFilter]);

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
          displayData.list.map(job => (
            <div key={job.id} className="bg-white p-4 rounded-2xl shadow-sm flex flex-col border border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-gray-800 text-sm mb-1 line-clamp-1">{job.model}</div>
                  <div className="text-[10px] text-gray-400 flex items-center gap-2">
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                      {job.OID || job.ref_no || `#${job.id.slice(-4)}`}
                    </span>
                    <span>•</span>
                    <span>{formatDate(job.completed_at || job.updated_at || job.created_at)}</span>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="text-base font-bold text-emerald-500 bg-emerald-50 px-3 py-1 rounded-xl">
                    +{formatCurrency(job.rider_fee || 150)}
                  </div>
                  {job.chats && (
                    <button
                      onClick={() => onOpenChat(job.id)}
                      className="text-[10px] flex items-center gap-1 text-purple-600 bg-purple-50 px-2 py-1 rounded-lg hover:bg-purple-100 transition-colors"
                    >
                      <MessageSquare size={12} /> ประวัติแชท
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
