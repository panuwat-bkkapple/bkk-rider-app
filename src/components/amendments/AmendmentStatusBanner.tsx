// Status banner shown on JobDetailPage when a v2 amendment is in flight.
//
// Subscribes to /jobs_amendments by job_id and surfaces the most recent
// non-terminal record (pending / approved / consented / rejected / expired).
//
// Class affects what the banner shows:
//   contractual + approved → "ขอเซ็นลูกค้า" (opens CustomerConsentModal)
//   operational + approved → impossible (server applies immediately)
//   any + applied/cancelled → terminal, hide banner
//
// When status is `rejected` we render the admin's reject_action verbatim
// so rider doesn't have to choose what to do next — they just follow.

import { useEffect, useState } from 'react';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../api/firebase';
import {
  Clock, ShieldCheck, AlertTriangle, ArrowRight, MessageSquare,
} from 'lucide-react';
import type {
  JobAmendment, JobAmendmentRejectAction, AmendmentClass,
} from '../../types';
import { AMENDMENT_TYPE_CLASS, AMENDMENT_TYPE_LABEL_TH } from '../../types';
import { CustomerConsentModal } from './CustomerConsentModal';

interface Props { jobId: string; }

const REJECT_INSTRUCTION_TH: Record<JobAmendmentRejectAction, string> = {
  continue_original: 'ปฏิเสธการแก้ไข — รับเครื่อง/ทำงานตาม spec เดิม',
  cancel_job: 'ยกเลิก job ทั้งหมด — แจ้งลูกค้าและกลับ',
  wait_admin_call: 'admin จะติดต่อลูกค้าเอง — รอที่จุดรับ ห้ามออก',
};

export const AmendmentStatusBanner = ({ jobId }: Props) => {
  const [open, setOpen] = useState<JobAmendment | null>(null);
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const q = query(ref(db, 'jobs_amendments'), orderByChild('job_id'), equalTo(jobId));
    const unsub = onValue(q, (snap) => {
      let candidate: JobAmendment | null = null;
      snap.forEach((s) => {
        const am = s.val() as JobAmendment;
        // Show in-flight + recent terminal-with-instruction states
        if (['applied', 'cancelled'].includes(am.status)) return;
        if (!candidate || am.requested_at > candidate.requested_at) candidate = am;
      });
      setOpen(candidate);
    });
    return () => unsub();
  }, [jobId]);

  if (!open) return null;

  const cls: AmendmentClass = open.amendment_class || AMENDMENT_TYPE_CLASS[open.type] || 'contractual';
  const typeLabel = AMENDMENT_TYPE_LABEL_TH[open.type] || open.type;

  if (open.status === 'pending') {
    const stale = open.escalated_at != null;
    return (
      <div className={`rounded-2xl border p-4 ${stale ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          <Clock size={18} className={`shrink-0 mt-0.5 ${stale ? 'text-red-600' : 'text-amber-600'}`} />
          <div className="flex-1">
            <p className={`font-bold text-sm ${stale ? 'text-red-900' : 'text-amber-900'}`}>
              {stale ? 'admin ค้างนาน — broadcast ไปทุกคนแล้ว' : `รอ admin จัดการ (${typeLabel})`}
            </p>
            <p className={`text-xs mt-0.5 ${stale ? 'text-red-700' : 'text-amber-700'}`}>
              อย่ารับเครื่อง / อย่าออกจากจุด — รอคำสั่งจาก admin ก่อน
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (open.status === 'approved' && cls === 'contractual') {
    const expiresIn = open.approved_expires_at ? Math.max(0, open.approved_expires_at - Date.now()) : 0;
    const hoursLeft = Math.floor(expiresIn / (60 * 60 * 1000));
    return (
      <>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3 mb-3">
            <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-bold text-sm text-emerald-900">Admin อนุมัติแล้ว — {typeLabel}</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                ขอลายเซ็นลูกค้าเพื่อยืนยันรายละเอียดใหม่
                {hoursLeft > 0 && hoursLeft < 24 && ` · เหลือเวลา ~${hoursLeft} ชม.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConsent(true)}
            className="w-full bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95"
          >
            ขอเซ็นจากลูกค้า <ArrowRight size={14} />
          </button>
        </div>
        {showConsent && (
          <CustomerConsentModal
            amendment={open}
            onClose={() => setShowConsent(false)}
            onConsented={() => setShowConsent(false)}
          />
        )}
      </>
    );
  }

  if (open.status === 'approved' && cls === 'operational') {
    // Server should have applied immediately; this state is transient
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <ShieldCheck size={18} className="shrink-0 mt-0.5 text-blue-600" />
        <div className="flex-1">
          <p className="font-bold text-sm text-blue-900">Admin จัดการแล้ว — กำลังอัพเดต</p>
        </div>
      </div>
    );
  }

  if (open.status === 'rejected') {
    const action = open.reject_action;
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <p className="font-bold text-sm text-red-900">Admin ปฏิเสธ — {typeLabel}</p>
            <p className="text-xs text-red-800 mt-1 leading-relaxed">
              {action ? REJECT_INSTRUCTION_TH[action] : 'ดูรายละเอียดที่ admin แจ้ง'}
            </p>
            {open.admin_note && (
              <p className="text-xs text-red-700 mt-2 italic">"{open.admin_note}"</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (open.status === 'consented') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
        <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600" />
        <div className="flex-1">
          <p className="font-bold text-sm text-emerald-900">บันทึกแล้ว — กำลังอัพเดต</p>
        </div>
      </div>
    );
  }

  if (open.status === 'expired') {
    return (
      <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 flex items-start gap-3">
        <Clock size={18} className="shrink-0 mt-0.5 text-slate-500" />
        <div className="flex-1">
          <p className="font-bold text-sm text-slate-700">Amendment หมดอายุ</p>
          <p className="text-xs text-slate-600 mt-0.5">
            ลูกค้าไม่ได้เซ็นภายใน 24 ชม. — กรุณาแจ้งใหม่หากต้องการแก้ไข
          </p>
        </div>
      </div>
    );
  }

  return null;
};
