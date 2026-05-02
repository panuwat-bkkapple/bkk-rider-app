// Status banner shown on JobDetailPage when an amendment is in flight.
// Subscribes to /jobs_amendments by job_id and surfaces the most recent
// non-terminal record:
//
//   pending   → "รอ admin อนุมัติ" (rider should stay at pickup, do nothing)
//   approved  → "ขอเซ็นลูกค้า" (button opens CustomerConsentModal)
//   rejected  → "Admin ตอบกลับ — ดูคำสั่ง" (shows admin's note + action)
//
// Once status becomes `applied`/`cancelled` the banner disappears and the
// regular flow continues (job's devices/price are now updated server-side).

import { useEffect, useState } from 'react';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../api/firebase';
import {
  Clock, ShieldCheck, AlertTriangle, ArrowRight,
} from 'lucide-react';
import type { JobAmendment, JobAmendmentRejectAction } from '../../types';
import { CustomerConsentModal } from './CustomerConsentModal';

interface Props {
  jobId: string;
}

const REJECT_INSTRUCTION_TH: Record<JobAmendmentRejectAction, string> = {
  continue_original: 'ปฏิเสธการแก้ไข — รับเครื่องตามที่ลูกค้าลงทะเบียนเดิม',
  cancel_job: 'ยกเลิก job ทั้งหมด — แจ้งลูกค้าและกลับ',
  wait_admin_call: 'admin จะติดต่อลูกค้าเอง — รอที่จุดรับ ห้ามออก',
};

export const AmendmentStatusBanner = ({ jobId }: Props) => {
  const [openAmendment, setOpenAmendment] = useState<JobAmendment | null>(null);
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const q = query(ref(db, 'jobs_amendments'), orderByChild('job_id'), equalTo(jobId));
    const unsub = onValue(q, (snap) => {
      let candidate: JobAmendment | null = null;
      snap.forEach((s) => {
        const am = s.val() as JobAmendment;
        // Show only in-flight + recent rejected (so rider sees the instruction)
        if (am.status === 'applied' || am.status === 'cancelled') return;
        if (!candidate || am.requested_at > candidate.requested_at) candidate = am;
      });
      setOpenAmendment(candidate);
    });
    return () => unsub();
  }, [jobId]);

  if (!openAmendment) return null;

  if (openAmendment.status === 'pending') {
    const stale = openAmendment.escalated_at != null;
    return (
      <div className={`rounded-2xl border p-4 ${stale ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          <Clock size={18} className={`shrink-0 mt-0.5 ${stale ? 'text-red-600' : 'text-amber-600'}`} />
          <div className="flex-1">
            <p className={`font-bold text-sm ${stale ? 'text-red-900' : 'text-amber-900'}`}>
              {stale ? 'admin ค้างนาน — broadcast ไปทุกคนแล้ว' : 'รอ admin อนุมัติ'}
            </p>
            <p className={`text-xs mt-0.5 ${stale ? 'text-red-700' : 'text-amber-700'}`}>
              อย่ารับเครื่อง — รอคำสั่งจาก admin ก่อน
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (openAmendment.status === 'approved') {
    return (
      <>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3 mb-3">
            <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-bold text-sm text-emerald-900">Admin อนุมัติแล้ว</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                ขอลายเซ็นลูกค้าเพื่อยืนยันรายละเอียดใหม่
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
            amendment={openAmendment}
            onClose={() => setShowConsent(false)}
            onConsented={() => setShowConsent(false)}
          />
        )}
      </>
    );
  }

  if (openAmendment.status === 'rejected') {
    const action = openAmendment.reject_action;
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <p className="font-bold text-sm text-red-900">Admin ปฏิเสธ amendment</p>
            <p className="text-xs text-red-800 mt-1 leading-relaxed">
              {action ? REJECT_INSTRUCTION_TH[action] : 'ดูรายละเอียดที่ admin แจ้ง'}
            </p>
            {openAmendment.admin_note && (
              <p className="text-xs text-red-700 mt-2 italic">"{openAmendment.admin_note}"</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (openAmendment.status === 'consented') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
        <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600" />
        <div className="flex-1">
          <p className="font-bold text-sm text-emerald-900">บันทึกแล้ว — กำลังอัพเดต</p>
        </div>
      </div>
    );
  }

  return null;
};
