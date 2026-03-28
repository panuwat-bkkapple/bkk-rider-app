// src/components/home/ActiveJobCard.tsx
import {
  Bike, MapPin, Navigation, Phone, CheckCircle2, X, ShieldCheck,
  MessageSquare, Landmark, PackageOpen, User, Clock, AlertTriangle
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getDisplayPrice, getCustomerName } from '../../utils/jobHelpers';

interface ActiveJobCardProps {
  job: any;
  index: number;
  totalJobs: number;
  onUpdateStatus: (jobId: string, nextStatus: string, logMsg: string, extraData?: any) => void;
  onOpenChat: (jobId: string) => void;
  onCallCustomer: (job: any) => void;
  onOpenNavigation: (job: any) => void;
  onReject: (job: any) => void;
  onInspect: (job: any) => void;
  onCompleteJob: (job: any) => void;
  onReportDiscrepancy: (job: any) => void;
}

export const ActiveJobCard = ({
  job, index, totalJobs,
  onUpdateStatus, onOpenChat, onCallCustomer, onOpenNavigation,
  onReject, onInspect, onCompleteJob, onReportDiscrepancy
}: ActiveJobCardProps) => {
  const hasPendingDiscrepancy = job.has_pending_discrepancy && job.discrepancy_reports
    ? Object.values(job.discrepancy_reports).some((r: any) => r.status === 'pending')
    : false;

  return (
  <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-100 animate-in slide-in-from-bottom flex flex-col gap-4 relative overflow-hidden">
    {totalJobs > 1 && (
      <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1 rounded-bl-xl font-bold text-xs shadow-sm">
        จุดหมายที่ {index + 1}
      </div>
    )}

    <div className="flex justify-between items-center mb-1 mt-2">
      <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-semibold">{job.status}</span>
      <div className="flex gap-2">
        <button onClick={() => onOpenChat(job.id)} className="bg-purple-50 p-3 rounded-full text-purple-600 hover:bg-purple-100 relative">
          <MessageSquare size={20} />
          {job.chats && Object.values(job.chats).some((c: any) => c.sender === 'admin' && !c.read) && (
            <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
          )}
        </button>
        <button onClick={() => onCallCustomer(job)} className="bg-emerald-50 p-3 rounded-full text-emerald-600 hover:bg-emerald-100"><Phone size={20} /></button>
        <button onClick={() => onOpenNavigation(job)} className="bg-blue-50 p-3 rounded-full text-blue-600 hover:bg-blue-100"><Navigation size={20} /></button>
      </div>
    </div>

    <h2 className="text-lg font-bold text-gray-800 leading-tight">{job.model}</h2>

    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2 mb-1">
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
      {job.appointment_time && (
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <Clock size={14} />
          <span className="font-semibold">{formatDate(job.appointment_time)}</span>
        </div>
      )}
    </div>

    <div className="flex items-start gap-3">
      <MapPin size={18} className="text-red-400 shrink-0 mt-0.5" />
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-gray-800">{job.cust_address || job.address || 'ไม่พบพิกัด'}</span>
        {(job.address_detail || job.note || job.remark) && (
          <span className="text-xs text-gray-700 mt-1 bg-yellow-50 p-2 rounded-lg border border-yellow-200 leading-relaxed">
            <strong>จุดสังเกต/หมายเหตุ:</strong> {job.address_detail || job.note || job.remark}
          </span>
        )}
      </div>
    </div>

    {/* Pending discrepancy banner */}
    {hasPendingDiscrepancy && (
      <button
        onClick={() => onReportDiscrepancy(job)}
        className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-3 animate-pulse"
      >
        <div className="animate-spin w-5 h-5 border-[3px] border-amber-400 border-t-transparent rounded-full shrink-0"></div>
        <div className="text-left flex-1">
          <p className="text-xs font-bold text-amber-700">รอแอดมินแก้ไขข้อมูล</p>
          <p className="text-[10px] text-amber-500">แตะเพื่อดูรายละเอียด</p>
        </div>
      </button>
    )}

    {/* Report discrepancy button */}
    {!hasPendingDiscrepancy && !['In-Transit', 'Pending QC', 'Completed'].includes(job.status) && (
      <button
        onClick={() => onReportDiscrepancy(job)}
        className="w-full text-xs font-bold text-amber-500 hover:text-amber-600 underline py-1 flex items-center justify-center gap-1"
      >
        <AlertTriangle size={12} /> แจ้งข้อมูลไม่ตรง
      </button>
    )}

    {/* Action buttons based on status */}
    {job.status === 'Accepted' && (
      <div className="flex gap-2 mt-2">
        <button onClick={() => onReject(job)} className="w-14 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
          <X size={20} />
        </button>
        <button onClick={() => onUpdateStatus(job.id, 'Heading to Customer', 'ไรเดอร์กำลังเดินทางไปหาลูกค้า')} className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 flex justify-center items-center gap-2">
          <Bike size={20} /> เริ่มออกเดินทาง (Start Journey)
        </button>
      </div>
    )}

    {job.status === 'Heading to Customer' && (
      <button onClick={() => onUpdateStatus(job.id, 'Arrived', 'ถึงจุดหมายแล้ว')} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 mt-2 flex justify-center items-center gap-2">
        <MapPin size={20} /> ถึงจุดหมายแล้ว (Arrived)
      </button>
    )}

    {(job.status === 'Arrived' || job.status === 'Being Inspected') && (
      <div className="space-y-2 mt-2">
        <button
          onClick={() => {
            if (job.status === 'Arrived') onUpdateStatus(job.id, 'Being Inspected', 'เริ่มตรวจสภาพ');
            onInspect(job);
          }}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex justify-center gap-2 shadow-md active:scale-95"
        >
          <ShieldCheck size={22} />{job.status === 'Arrived' ? 'เริ่มตรวจสภาพเครื่อง' : 'ดำเนินการตรวจต่อ'}
        </button>
        {job.status === 'Arrived' && (
          <button onClick={() => onReject(job)} className="w-full text-xs font-bold text-gray-400 hover:text-red-500 underline py-2">
            ติดต่อลูกค้าไม่ได้ / ขอยกเลิกงาน
          </button>
        )}
      </div>
    )}

    {job.status === 'QC Review' && (
      <div className="bg-amber-50 p-4 rounded-2xl text-center border border-amber-100 mt-2">
        <div className="animate-spin w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-2"></div>
        <p className="font-bold text-amber-700 text-sm">รอแอดมินอนุมัติรูปภาพ</p>
      </div>
    )}

    {(job.status === 'Payout Processing' || job.status === 'Price Accepted') && (
      <div className="bg-blue-50 p-4 rounded-2xl text-center border border-blue-100 mt-2">
        <Landmark size={28} className="text-blue-500 mx-auto mb-2 animate-bounce" />
        <p className="font-bold text-blue-700">แอดมินกำลังโอนเงิน!</p>
      </div>
    )}

    {['Waiting for Handover', 'Paid', 'PAID'].includes(job.status) && (
      <div className="space-y-3 mt-2">
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center shadow-sm">
          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-1" />
          <h3 className="font-bold text-emerald-800 text-sm">โอนเงินสำเร็จ!</h3>
          {(job.slip_url || job.payment_slip || job.slipUrl || job.payment_info?.slip_url) && (
            <img src={job.slip_url || job.payment_slip || job.slipUrl || job.payment_info?.slip_url} className="w-full h-auto max-h-48 object-contain mt-2 rounded-xl" />
          )}
        </div>
        <button onClick={() => { if (confirm('เดินทางกลับสาขาใช่หรือไม่?')) onUpdateStatus(job.id, 'In-Transit', 'เดินทางกลับ'); }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-md flex justify-center gap-2">
          <Bike size={20} /> เดินทางกลับสาขา
        </button>
      </div>
    )}

    {job.status === 'In-Transit' && (
      <button onClick={() => onCompleteJob(job)} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-md flex justify-center gap-2 mt-2">
        <PackageOpen size={20} /> ถึงสาขาแล้ว (ส่งมอบเครื่อง)
      </button>
    )}

    {job.status === 'Revised Offer' && (
      <div className="bg-purple-50 p-4 rounded-2xl text-center border border-purple-100 mt-2">
        <h3 className="font-bold text-purple-700 mb-2">มีการปรับราคาใหม่: {formatCurrency(getDisplayPrice(job))}</h3>
        <div className="flex gap-2">
          <button onClick={() => { if (confirm('ลูกค้ายกเลิก?')) onUpdateStatus(job.id, 'Cancelled', 'ลูกค้ายกเลิก', { cancel_reason: 'ลูกค้ายกเลิก' }); }} className="flex-1 bg-white text-red-500 py-2 rounded-xl text-sm font-bold border border-red-200">ยกเลิก</button>
          <button onClick={() => { if (confirm('ลูกค้ายอมรับ?')) onUpdateStatus(job.id, 'Payout Processing', 'ลูกค้ายอมรับ', { customer_accepted_at: Date.now() }); }} className="flex-1 bg-purple-600 text-white py-2 rounded-xl text-sm font-bold shadow">ยอมรับ</button>
        </div>
      </div>
    )}
  </div>
  );
};
