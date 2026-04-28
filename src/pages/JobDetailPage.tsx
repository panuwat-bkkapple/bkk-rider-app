// src/pages/JobDetailPage.tsx
import { useState } from 'react';
import {
  ArrowLeft, MapPin, Navigation, Phone, User, Clock, Wallet as WalletIcon,
  Bike, CheckCircle2, X, ShieldCheck, MessageSquare, Landmark, PackageOpen,
  AlertTriangle, Loader2, Camera, Tag, Hash, Undo2,
  Monitor, Smartphone, BatteryCharging, Globe, Info, ClipboardCheck
} from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { getDisplayPrice, getCustomerName, getDevicesList, getPaymentSlip, getAppointmentDisplay } from '../utils/jobHelpers';
import { JOB_STATUS } from '../types/job-statuses';

const parseCustomerCondition = (raw: string): { category: string; detail: string } => {
  const m = raw.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
  if (m) return { category: m[1].trim(), detail: m[2].trim() };
  return { category: '', detail: raw };
};

const getConditionIcon = (category: string) => {
  const c = category.toLowerCase();
  if (category.includes('จอ') || c.includes('screen') || c.includes('display')) return Monitor;
  if (category.includes('ตัวเครื่อง') || category.includes('ฝาหลัง') || c.includes('body')) return Smartphone;
  if (category.includes('แบตเตอรี่') || c.includes('battery')) return BatteryCharging;
  if (category.includes('อุปกรณ์เสริม') || c.includes('accessor')) return PackageOpen;
  if (category.includes('โมเดล') || c.includes('model')) return Globe;
  if (category.includes('ประกัน') || c.includes('warranty')) return ShieldCheck;
  return Info;
};

type ParsedCondition = { category: string; detail: string };

const normalizeConditionEntries = (input: any): ParsedCondition[] => {
  if (!input) return [];
  const out: ParsedCondition[] = [];

  if (Array.isArray(input)) {
    input.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) out.push(parseCustomerCondition(trimmed));
      } else if (typeof item === 'object') {
        const category = String(item.category || item.label || item.title || item.group || '').trim();
        const detail = String(item.detail || item.value || item.option || item.text || item.label || '').trim();
        if (category || detail) out.push({ category, detail });
      }
    });
  } else if (typeof input === 'object') {
    Object.entries(input).forEach(([key, value]) => {
      const category = String(key).trim();
      if (Array.isArray(value)) {
        value.forEach((v) => {
          const detail = typeof v === 'string' ? v : String((v as any)?.label ?? (v as any)?.value ?? '');
          if (detail.trim()) out.push({ category, detail: detail.trim() });
        });
      } else if (value && typeof value === 'object') {
        const detail = String((value as any).label ?? (value as any).value ?? (value as any).detail ?? '').trim();
        if (detail) out.push({ category, detail });
      } else if (value !== undefined && value !== null && String(value).trim()) {
        out.push({ category, detail: String(value).trim() });
      }
    });
  }

  return out;
};

const getCustomerConditions = (device: any, job: any): ParsedCondition[] => {
  const sources: any[] = [
    device?.customer_conditions,
    device?.rawConditions,
    device?.assessment_details?.rawConditions,
    job?.customer_conditions,
    job?.assessment_details?.rawConditions,
  ];
  for (const src of sources) {
    const entries = normalizeConditionEntries(src);
    if (entries.length > 0) return entries;
  }
  return [];
};

interface JobDetailPageProps {
  job: any;
  riderInfoId: string;
  mode: 'incoming' | 'active';
  onBack: () => void;
  onAccept: (jobId: string, extraData: any) => void;
  onReject: (job: any) => void;
  onUpdateStatus: (jobId: string, nextStatus: string, logMsg: string, extraData?: any) => void;
  onOpenChat: (jobId: string) => void;
  onCallCustomer: (job: any) => void;
  onOpenNavigation: (job: any) => void;
  onInspect: (job: any) => void;
  onCompleteJob: (job: any) => void;
  onRevertInspection: (job: any) => void;
  onReportDiscrepancy: (job: any) => void;
}

export const JobDetailPage = ({
  job, riderInfoId, mode, onBack,
  onAccept, onReject, onUpdateStatus,
  onOpenChat, onCallCustomer, onOpenNavigation,
  onInspect, onCompleteJob, onRevertInspection, onReportDiscrepancy,
}: JobDetailPageProps) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const handleAction = async (name: string, fn: () => void | Promise<void>) => {
    setLoadingAction(name);
    try { await fn(); } finally { setLoadingAction(null); }
  };

  const devices = getDevicesList(job);
  const phone = job.cust_phone || job.customer_phone || job.phone;
  const photos: string[] = Array.isArray(job.photos) ? job.photos : [];
  const deductions: string[] = Array.isArray(job.deductions) ? job.deductions : [];
  const hasPendingDiscrepancy = job.has_pending_discrepancy && job.discrepancy_reports
    ? Object.values(job.discrepancy_reports).some((r: any) => r.status === 'pending')
    : false;
  const unreadChat = job.chats && Object.values(job.chats).some((c: any) => c.sender === 'admin' && !c.read);
  const paymentSlip = getPaymentSlip(job);

  return (
    <div className="fixed inset-0 bg-gray-50 z-[60] overflow-y-auto animate-in fade-in duration-200">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 active:scale-95 transition"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={22} className="text-gray-700" />
        </button>
        <h1 className="font-bold text-gray-800 text-base flex-1 truncate">รายละเอียดงาน</h1>
        {mode === 'incoming' ? (
          <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
            งานใหม่เข้า!
          </span>
        ) : (
          <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-semibold">
            {job.status}
          </span>
        )}
      </div>

      <div className="p-4 pb-36 space-y-4 max-w-md mx-auto">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex justify-between items-start gap-3 mb-3">
            <h2 className="text-xl font-bold text-gray-900 leading-tight flex-1">{job.model}</h2>
            <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl text-sm font-bold flex gap-1.5 shrink-0">
              <WalletIcon size={16} /> +{formatCurrency(job.rider_fee || 150)}
            </div>
          </div>
          <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-3">
            <span className="font-mono text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded flex items-center gap-1">
              <Hash size={12} /> {job.OID || job.ref_no || job.id.slice(-4)}
            </span>
            <span className="font-bold text-emerald-600 text-base">{formatCurrency(getDisplayPrice(job))}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">ลูกค้า</h3>
          <div className="flex items-center gap-2 text-sm text-gray-800">
            <User size={16} className="text-blue-500" />
            <span className="font-semibold">{getCustomerName(job)}</span>
          </div>
          {phone && (
            <button
              onClick={() => onCallCustomer(job)}
              className="w-full flex items-center justify-between bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl font-semibold text-sm hover:bg-emerald-100 active:scale-[0.99] transition"
            >
              <span className="flex items-center gap-2">
                <Phone size={16} /> {phone}
              </span>
              <span className="text-xs">แตะเพื่อโทร</span>
            </button>
          )}
          {getAppointmentDisplay(job) && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <Clock size={16} />
              <span className="font-semibold">นัดหมาย: {getAppointmentDisplay(job)}</span>
            </div>
          )}
          {job.created_at && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock size={14} />
              <span>สร้างเมื่อ: {formatDate(job.created_at)}</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">ที่อยู่รับเครื่อง</h3>
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">
                {job.cust_address || job.address || 'รอรับพิกัด'}
              </p>
              {(job.address_detail || job.note || job.remark) && (
                <div className="text-xs text-gray-700 mt-2 bg-yellow-50 p-3 rounded-lg border border-yellow-200 leading-relaxed">
                  <strong>จุดสังเกต/หมายเหตุ:</strong> {job.address_detail || job.note || job.remark}
                </div>
              )}
            </div>
          </div>
          {(job.cust_address || job.address) && (
            <button
              onClick={() => onOpenNavigation(job)}
              className="mt-3 w-full bg-blue-50 text-blue-600 py-3 rounded-xl font-semibold text-sm hover:bg-blue-100 flex justify-center items-center gap-2 active:scale-[0.99] transition"
            >
              <Navigation size={16} /> เปิดนำทาง
            </button>
          )}
        </div>

        {job.cust_notes && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <MessageSquare size={12} /> หมายเหตุจากลูกค้า
            </h3>
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap break-words flex-1 min-w-0">
                {job.cust_notes}
              </p>
            </div>
          </div>
        )}

        {devices.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              รายการเครื่อง ({devices.length})
            </h3>
            <div className="space-y-3">
              {devices.map((d, i) => {
                const conditions = getCustomerConditions(d, job);
                return (
                  <div key={d.device_id || i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{d.model}</p>
                        {d.variant && <p className="text-xs text-gray-500 mt-0.5">{d.variant}</p>}
                        {d.inspection_status && (
                          <span className="inline-block mt-1 text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-semibold">
                            {d.inspection_status}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">
                        {formatCurrency(Number(d.price || d.estimated_price || d.base_price || 0))}
                      </span>
                    </div>

                    {conditions.length > 0 && (
                      <div className="pt-2 border-t border-gray-200 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <ClipboardCheck size={14} />
                          <span>ลูกค้าแจ้งสภาพ</span>
                        </div>
                        <ul className="space-y-1.5">
                          {conditions.map(({ category, detail }, idx) => {
                            const Icon = getConditionIcon(category);
                            return (
                              <li
                                key={idx}
                                className="flex items-start gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-2 text-xs text-gray-700 leading-relaxed"
                              >
                                <Icon size={14} className="text-gray-500 shrink-0 mt-0.5" />
                                <span className="flex-1 min-w-0">
                                  {category && (
                                    <span className="font-semibold text-gray-800">[{category}] </span>
                                  )}
                                  <span>{detail}</span>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {deductions.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Tag size={12} /> รายการหักราคา
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-700">
              {deductions.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {photos.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Camera size={12} /> ภาพถ่าย ({photos.length})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square block overflow-hidden rounded-xl border border-gray-100"
                >
                  <img src={url} alt={`photo-${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {paymentSlip && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">หลักฐานโอนเงิน</h3>
            <img src={paymentSlip} alt="payment-slip" className="w-full rounded-xl" />
          </div>
        )}

        <button
          onClick={() => onOpenChat(job.id)}
          className="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between hover:bg-purple-50 active:scale-[0.99] transition"
        >
          <span className="flex items-center gap-3">
            <span className="bg-purple-50 text-purple-600 p-2 rounded-xl relative">
              <MessageSquare size={18} />
              {unreadChat && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
              )}
            </span>
            <span className="font-semibold text-gray-800 text-sm">แชทกับแอดมิน</span>
          </span>
          <ArrowLeft size={16} className="text-gray-400 rotate-180" />
        </button>

        {mode === 'active' && hasPendingDiscrepancy && (
          <button
            onClick={() => onReportDiscrepancy(job)}
            className="w-full bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 animate-pulse"
          >
            <div className="animate-spin w-5 h-5 border-[3px] border-amber-400 border-t-transparent rounded-full shrink-0"></div>
            <div className="text-left flex-1">
              <p className="text-sm font-bold text-amber-700">รอแอดมินแก้ไขข้อมูล</p>
              <p className="text-xs text-amber-500">แตะเพื่อดูรายละเอียด</p>
            </div>
          </button>
        )}

        {mode === 'active' && !hasPendingDiscrepancy && !['In-Transit', 'Pending QC', 'Completed'].includes(job.status) && (
          <button
            onClick={() => onReportDiscrepancy(job)}
            className="w-full text-xs font-bold text-amber-500 hover:text-amber-600 underline py-2 flex items-center justify-center gap-1"
          >
            <AlertTriangle size={12} /> แจ้งข้อมูลไม่ตรง
          </button>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-[61]">
        <div className="max-w-md mx-auto">
          {mode === 'incoming' && (
            <div className="flex gap-2">
              <button
                onClick={() => onReject(job)}
                className="w-1/3 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold text-sm hover:bg-red-50 hover:text-red-500 transition"
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
          )}

          {mode === 'active' && (job.status === 'Accepted' || job.status === JOB_STATUS.RIDER_ACCEPTED) && (
            <div className="flex gap-2">
              <button onClick={() => onReject(job)} disabled={!!loadingAction} className="w-14 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition disabled:opacity-50">
                <X size={20} />
              </button>
              <button onClick={() => handleAction('start', () => onUpdateStatus(job.id, JOB_STATUS.RIDER_EN_ROUTE, 'ไรเดอร์กำลังเดินทางไปหาลูกค้า'))} disabled={!!loadingAction} className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50">
                {loadingAction === 'start' ? <Loader2 size={20} className="animate-spin" /> : <Bike size={20} />} เริ่มออกเดินทาง
              </button>
            </div>
          )}

          {mode === 'active' && (job.status === 'Heading to Customer' || job.status === JOB_STATUS.RIDER_EN_ROUTE) && (
            <button onClick={() => handleAction('arrived', () => onUpdateStatus(job.id, JOB_STATUS.RIDER_ARRIVED, 'ถึงจุดหมายแล้ว'))} disabled={!!loadingAction} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50">
              {loadingAction === 'arrived' ? <Loader2 size={20} className="animate-spin" /> : <MapPin size={20} />} ถึงจุดหมายแล้ว
            </button>
          )}

          {mode === 'active' && ((job.status === 'Arrived' || job.status === JOB_STATUS.RIDER_ARRIVED) || job.status === 'Being Inspected') && (
            <div className="space-y-2">
              <button
                onClick={() => {
                  if ((job.status === 'Arrived' || job.status === JOB_STATUS.RIDER_ARRIVED)) onUpdateStatus(job.id, JOB_STATUS.BEING_INSPECTED, 'เริ่มตรวจสภาพ');
                  onInspect(job);
                }}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex justify-center gap-2 shadow-md active:scale-95"
              >
                <ShieldCheck size={22} />{(job.status === 'Arrived' || job.status === JOB_STATUS.RIDER_ARRIVED) ? 'เริ่มตรวจสภาพเครื่อง' : 'ดำเนินการตรวจต่อ'}
              </button>
              {(job.status === 'Arrived' || job.status === JOB_STATUS.RIDER_ARRIVED) && (
                <button onClick={() => onReject(job)} className="w-full text-xs font-bold text-gray-400 hover:text-red-500 underline py-2">
                  ติดต่อลูกค้าไม่ได้ / ขอยกเลิกงาน
                </button>
              )}
            </div>
          )}

          {mode === 'active' && job.status === 'QC Review' && (
            <div className="space-y-2">
              <div className="bg-amber-50 p-4 rounded-2xl text-center border border-amber-100">
                <div className="animate-spin w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="font-bold text-amber-700 text-sm">รอแอดมินอนุมัติรูปภาพ</p>
              </div>
              <button
                onClick={() => onRevertInspection(job)}
                className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-2xl font-bold text-sm hover:bg-gray-50 active:scale-[0.99] flex justify-center items-center gap-2 transition-all"
              >
                <Undo2 size={16} /> ย้อนกลับไปแก้ไขข้อมูล
              </button>
            </div>
          )}

          {mode === 'active' && (job.status === 'Payout Processing' || job.status === 'Price Accepted') && (
            <div className="bg-blue-50 p-4 rounded-2xl text-center border border-blue-100">
              <Landmark size={28} className="text-blue-500 mx-auto mb-2 animate-bounce" />
              <p className="font-bold text-blue-700">แอดมินกำลังโอนเงิน!</p>
            </div>
          )}

          {mode === 'active' && ['Waiting for Handover', 'Paid', 'PAID'].includes(job.status) && (
            <div className="space-y-2">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-center">
                <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-1" />
                <h3 className="font-bold text-emerald-800 text-sm">โอนเงินสำเร็จ!</h3>
              </div>
              <button onClick={() => handleAction('transit', () => onUpdateStatus(job.id, JOB_STATUS.RIDER_RETURNING, 'เดินทางกลับ'))} disabled={!!loadingAction} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-md flex justify-center gap-2 disabled:opacity-50">
                {loadingAction === 'transit' ? <Loader2 size={20} className="animate-spin" /> : <Bike size={20} />} เดินทางกลับสาขา
              </button>
            </div>
          )}

          {mode === 'active' && (job.status === 'In-Transit' || job.status === JOB_STATUS.RIDER_RETURNING) && (
            <button onClick={() => onCompleteJob(job)} disabled={!!loadingAction} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-md flex justify-center gap-2 disabled:opacity-50">
              <PackageOpen size={20} /> ถึงสาขาแล้ว (ส่งมอบเครื่อง)
            </button>
          )}

          {mode === 'active' && job.status === 'Revised Offer' && (
            <div className="bg-purple-50 p-4 rounded-2xl text-center border border-purple-100">
              <h3 className="font-bold text-purple-700 mb-2">ปรับราคาใหม่: {formatCurrency(getDisplayPrice(job))}</h3>
              <div className="flex gap-2">
                <button onClick={() => handleAction('cancel', () => onUpdateStatus(job.id, JOB_STATUS.CANCELLED, 'ลูกค้ายกเลิก', { cancel_reason: 'ลูกค้ายกเลิก' }))} disabled={!!loadingAction} className="flex-1 bg-white text-red-500 py-2 rounded-xl text-sm font-bold border border-red-200 disabled:opacity-50">
                  {loadingAction === 'cancel' ? 'กำลังดำเนินการ...' : 'ยกเลิก'}
                </button>
                <button onClick={() => handleAction('accept', () => onUpdateStatus(job.id, JOB_STATUS.PAYOUT_PROCESSING, 'ลูกค้ายอมรับ', { customer_accepted_at: Date.now() }))} disabled={!!loadingAction} className="flex-1 bg-purple-600 text-white py-2 rounded-xl text-sm font-bold shadow disabled:opacity-50">
                  {loadingAction === 'accept' ? 'กำลังดำเนินการ...' : 'ยอมรับ'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
