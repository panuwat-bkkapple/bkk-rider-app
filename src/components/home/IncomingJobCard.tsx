// src/components/home/IncomingJobCard.tsx
import { MapPin, User, Clock, Wallet as WalletIcon } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getDisplayPrice, getCustomerName } from '../../utils/jobHelpers';

interface IncomingJobCardProps {
  job: any;
  riderInfoId: string;
  onAccept: (jobId: string, extraData: any) => void;
  onReject: (job: any) => void;
  onOpenDetail: (jobId: string) => void;
}

export const IncomingJobCard = ({ job, riderInfoId, onAccept, onReject, onOpenDetail }: IncomingJobCardProps) => (
  <div
    onClick={() => onOpenDetail(job.id)}
    className="bg-white rounded-[2rem] p-6 shadow-xl border-2 border-emerald-400 animate-in slide-in-from-bottom-4 cursor-pointer hover:shadow-2xl transition-shadow"
  >
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
        <span className="text-emerald-600 font-bold text-sm">งานใหม่เข้า!</span>
      </div>
      <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl text-sm font-bold flex gap-1.5">
        <WalletIcon size={16} /> +{formatCurrency(job.rider_fee || 150)}
      </div>
    </div>

    <h2 className="text-lg font-bold text-gray-900 mb-2 leading-tight">{job.model}</h2>

    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2 mb-4">
      <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2">
        <span className="font-mono text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded">
          ID: {job.OID || job.ref_no || job.id.slice(-4)}
        </span>
        <span className="font-bold text-emerald-600">{formatCurrency(getDisplayPrice(job))}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <User size={14} className="text-blue-500" />
        <span className="font-semibold">{getCustomerName(job)}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-amber-600">
        <Clock size={14} />
        <span className="font-semibold">
          นัดหมาย: {job.appointment_time ? formatDate(job.appointment_time) : 'ยังไม่ระบุ'}
        </span>
      </div>
    </div>

    <div className="flex items-start gap-3 mb-4">
      <MapPin size={18} className="text-red-400 shrink-0 mt-0.5" />
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-gray-800">
          {job.cust_address || job.address || 'รอรับพิกัด'}
        </span>
        {(job.address_detail || job.note || job.remark) && (
          <span className="text-xs text-gray-700 mt-1 bg-yellow-50 p-2 rounded-lg border border-yellow-200 leading-relaxed">
            <strong>จุดสังเกต/หมายเหตุ:</strong> {job.address_detail || job.note || job.remark}
          </span>
        )}
      </div>
    </div>

    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onReject(job)}
        className="w-1/3 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold text-sm hover:bg-red-50 hover:text-red-500 transition-colors"
      >
        ปฏิเสธ
      </button>
      <button
        onClick={() => onAccept(job.id, { rider_id: riderInfoId })}
        className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-600 active:scale-95"
      >
        รับงานนี้
      </button>
    </div>
  </div>
);
