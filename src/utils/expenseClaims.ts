// รวม "ใบเบิกที่ไรเดอร์เห็น" จากสองแหล่งให้เป็นรายการเดียว — pure ทั้งไฟล์
//
// สองแหล่งเพราะสองช่วงชีวิต:
//   - คิวในเครื่อง (IndexedDB) = ก่อนขึ้น server: รอส่ง / กำลังส่ง / ส่งไม่ได้
//   - แถวบน server (`rider_expenses`) = หลังขึ้นแล้ว: รอหัวหน้า / รอบัญชี /
//     ตีกลับ / จ่ายแล้ว / ปฏิเสธ
//
// **id เดียวกันตลอด** (enqueue ออก id แล้ว server ใช้ id นั้นเป็นคีย์แถว)
// จึง join ได้ตรงๆ และ **server ชนะเสมอเมื่อมีทั้งคู่** — แถว `done` ในคิว
// เป็นแค่ความทรงจำว่าเคยส่ง ส่วนแถวบน server คือสิ่งที่แอดมินกำลังทำอยู่จริง
// ยกเว้นงานที่ยัง**มีชีวิต**ในคิว (กำลังส่งซ้ำใบที่ถูกตีกลับ) ซึ่งต้องโชว์ว่า
// "กำลังส่ง" ไม่ใช่ "ถูกตีกลับ" ไม่งั้นไรเดอร์กดส่งซ้ำอีกรอบ

import type { QueuedUpload, QueueState } from './uploadQueue/types';
import { isLive } from './uploadQueue/policy';

/** สถานะฝั่ง server — mirror ของ EXPENSE_STATUS ใน bkk-system/functions/rider-expense-flow.js
 *  (คนละ repo คนละภาษา) เพิ่มสถานะที่นั่นต้องเพิ่มป้ายที่นี่ ไม่งั้นไรเดอร์เห็นโค้ดดิบ */
export type ServerExpenseStatus =
  | 'submitted'
  | 'approved'
  | 'finance_approved'
  | 'paid'
  | 'needs_info'
  | 'rejected';

export interface ServerExpenseRow {
  id: string;
  rider_id?: string;
  category?: string;
  amount_thb?: number;
  note?: string;
  job_id?: string | null;
  occurred_at?: number;
  submitted_at?: number;
  status?: string;
  /** สิ่งที่แอดมินขอให้แก้ / เหตุผลที่ปฏิเสธ — ค้างอยู่จนกว่าจะส่งซ้ำ */
  review_reason?: string | null;
  reject_reason?: string | null;
  evidence?: { url?: string }[];
  needs_ceo?: boolean;
  paid_tx_id?: string;
}

export type ClaimViewStatus = QueueState | ServerExpenseStatus;

/** รูปเดียวที่หน้าจอ render — ไม่ว่าจะมาจากคิวหรือจาก server */
export interface ExpenseClaimView {
  id: string;
  source: 'queue' | 'server';
  status: ClaimViewStatus;
  category: string;
  amount_thb: number;
  note: string;
  job_id: string | null;
  /** เวลาที่ไรเดอร์กดส่ง (คิว) หรือเวลาที่ส่งถึงระบบ (server) — ใช้เรียงเท่านั้น */
  at: number;
  /** ข้อความที่ไรเดอร์ต้องอ่าน: error ของคิว หรือเหตุผลตีกลับ/ปฏิเสธจากแอดมิน */
  message?: string;
  /** ไรเดอร์แก้แล้วส่งใหม่ได้ไหม — เฉพาะใบที่แอดมินตีกลับ */
  canResubmit: boolean;
  /** งานในคิวที่ลบได้ (ถ่ายใหม่ / ส่งไม่ได้ถาวร) */
  canDelete: boolean;
  /** แถวต้นทาง ให้ modal แก้ไข prefill ได้ */
  row?: ServerExpenseRow;
  queued?: QueuedUpload;
}

export const CLAIM_STATUS_LABEL: Record<ClaimViewStatus, string> = {
  pending: 'รอส่ง',
  uploading: 'กำลังส่ง',
  done: 'ส่งแล้ว',
  failed_permanent: 'ส่งไม่ได้',
  evidence_lost: 'ต้องถ่ายใหม่',
  submitted: 'รอหัวหน้าตรวจ',
  approved: 'รอฝ่ายบัญชี',
  finance_approved: 'ตั้งเบิกแล้ว รอจ่าย',
  paid: 'จ่ายแล้ว',
  needs_info: 'ต้องแก้ไข',
  rejected: 'ปฏิเสธ',
};

const SERVER_STATUSES: ReadonlySet<string> = new Set<ServerExpenseStatus>([
  'submitted', 'approved', 'finance_approved', 'paid', 'needs_info', 'rejected',
]);

export const isServerStatus = (s: unknown): s is ServerExpenseStatus =>
  typeof s === 'string' && SERVER_STATUSES.has(s);

function fromQueue(i: QueuedUpload): ExpenseClaimView {
  return {
    id: i.id,
    source: 'queue',
    status: i.state,
    category: i.payload.category,
    amount_thb: Number(i.payload.amount_thb) || 0,
    note: i.payload.note || '',
    job_id: i.payload.job_id,
    at: i.created_at,
    message: i.state !== 'done' ? i.last_error : undefined,
    canResubmit: false,
    canDelete: i.state === 'evidence_lost' || i.state === 'failed_permanent',
    queued: i,
  };
}

function fromServer(r: ServerExpenseRow): ExpenseClaimView {
  // สถานะที่แอปไม่รู้จัก (เพิ่มฝั่งแอดมินก่อน deploy แอป) = โชว์ว่ารออยู่
  // ไม่ใช่โชว์โค้ดดิบ และไม่ใช่ซ่อนใบทั้งใบ
  const status: ClaimViewStatus = isServerStatus(r.status) ? r.status : 'submitted';
  const reason = r.review_reason || r.reject_reason || undefined;
  return {
    id: r.id,
    source: 'server',
    status,
    category: r.category || 'other',
    amount_thb: Number(r.amount_thb) || 0,
    note: r.note || '',
    job_id: r.job_id ?? null,
    at: Number(r.submitted_at) || 0,
    message: status === 'needs_info' || status === 'rejected' ? reason : undefined,
    canResubmit: status === 'needs_info',
    canDelete: false,
    row: r,
  };
}

/**
 * รวมสองแหล่ง — server ชนะเมื่อ id ชน ยกเว้นงานในคิวที่ยังมีชีวิต
 *
 * เรียงใหม่สุดก่อน ตามเวลาของแต่ละแหล่ง (คิว = เวลากด, server = เวลาถึงระบบ)
 * ซึ่งต่างกันได้เป็นชั่วโมงสำหรับใบที่ส่งตอนออฟไลน์ แต่สำหรับการเรียงรายการ
 * ให้ไรเดอร์ดู ความคลาดเคลื่อนนั้นไม่มีผลกับการตัดสินใจอะไร
 */
export function mergeExpenseViews(
  queued: readonly QueuedUpload[],
  rows: readonly ServerExpenseRow[]
): ExpenseClaimView[] {
  const byId = new Map<string, ExpenseClaimView>();
  for (const r of rows) {
    if (r && r.id) byId.set(r.id, fromServer(r));
  }
  for (const q of queued) {
    const existing = byId.get(q.id);
    if (!existing || isLive(q)) byId.set(q.id, fromQueue(q));
  }
  return Array.from(byId.values()).sort((a, b) => b.at - a.at);
}

/** ยังมีอะไรที่ไรเดอร์ต้องทำเอง — ใช้ทำ badge/แถบเตือน */
export const needsRiderAction = (v: ExpenseClaimView): boolean =>
  v.canResubmit || v.status === 'evidence_lost' || v.status === 'failed_permanent';
