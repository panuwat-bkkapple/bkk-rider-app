import { describe, it, expect } from 'vitest';
import { mergeExpenseViews, CLAIM_STATUS_LABEL, needsRiderAction } from './expenseClaims';
import type { QueuedUpload } from './uploadQueue/types';

const q = (id: string, state: QueuedUpload['state'], created_at = 1): QueuedUpload => ({
  id, uid: 'riderA', created_at, kind: 'expense_evidence', files: [],
  payload: { category: 'toll', amount_thb: 65, note: '', occurred_at: 1, job_id: null },
  state, attempts: 0, next_attempt_at: 0,
  last_error: state === 'failed_permanent' ? 'rules ปฏิเสธ' : undefined,
});
const row = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id, rider_id: 'riderA', category: 'toll', amount_thb: 65, submitted_at: 10, status, ...over,
});

describe('mergeExpenseViews — คิวกับ server เป็นใบเดียวกัน', () => {
  it('id เดียวกัน server ชนะ — แถว done ในคิวเป็นแค่ความทรงจำ', () => {
    const out = mergeExpenseViews([q('a', 'done')], [row('a', 'approved')]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('server');
    expect(out[0].status).toBe('approved');
  });

  it('งานที่ยังมีชีวิตในคิวชนะ server — กำลังส่งซ้ำต้องไม่โชว์ว่า "ต้องแก้ไข" ไม่งั้นกดส่งซ้ำอีกรอบ', () => {
    for (const state of ['pending', 'uploading'] as const) {
      const out = mergeExpenseViews([q('a', state)], [row('a', 'needs_info')]);
      expect(out[0].source).toBe('queue');
      expect(out[0].canResubmit).toBe(false);
    }
  });

  it('ใบที่ยังไม่ถึง server โชว์จากคิว — ไม่งั้นไรเดอร์ที่ส่งตอนออฟไลน์เห็นจอว่างแล้วคิดว่าหาย', () => {
    const out = mergeExpenseViews([q('local', 'pending')], []);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('pending');
  });

  it('ใบที่ถูกตีกลับ = ส่งซ้ำได้ และข้อความของแอดมินไปถึงไรเดอร์', () => {
    const out = mergeExpenseViews([], [row('a', 'needs_info', { review_reason: 'ขอใบเสร็จตัวจริง' })]);
    expect(out[0].canResubmit).toBe(true);
    expect(out[0].message).toBe('ขอใบเสร็จตัวจริง');
  });

  it('ใบที่ถูกปฏิเสธเห็นเหตุผล แต่ส่งซ้ำไม่ได้', () => {
    const out = mergeExpenseViews([], [row('a', 'rejected', { reject_reason: 'ไม่ใช่งานของบริษัท' })]);
    expect(out[0].canResubmit).toBe(false);
    expect(out[0].message).toBe('ไม่ใช่งานของบริษัท');
  });

  it('ใบที่รออยู่ตามปกติไม่โชว์เหตุผลเก่าที่ค้าง (server ล้าง review_reason ตอนส่งซ้ำแล้ว แต่กันไว้อีกชั้น)', () => {
    const out = mergeExpenseViews([], [row('a', 'submitted', { reject_reason: 'ของเก่า' })]);
    expect(out[0].message).toBeUndefined();
  });

  it('สถานะที่แอปไม่รู้จัก = โชว์เป็นรออยู่ ไม่ซ่อนใบ ไม่โชว์โค้ดดิบ', () => {
    const out = mergeExpenseViews([], [row('a', 'some_future_status')]);
    expect(out).toHaveLength(1);
    expect(CLAIM_STATUS_LABEL[out[0].status]).toBe('รอหัวหน้าตรวจ');
  });

  it('เรียงใหม่สุดก่อน', () => {
    const out = mergeExpenseViews([q('old', 'pending', 5)], [row('new', 'submitted', { submitted_at: 50 })]);
    expect(out.map((v) => v.id)).toEqual(['new', 'old']);
  });

  it('ทุกสถานะมีป้ายภาษาคน', () => {
    for (const label of Object.values(CLAIM_STATUS_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('needsRiderAction — อะไรที่รอเขาอยู่', () => {
  it('ตีกลับ / ถ่ายใหม่ / ส่งไม่ได้ = ต้องทำเอง · รอแอดมิน = ไม่ใช่', () => {
    const [back] = mergeExpenseViews([], [row('a', 'needs_info')]);
    const [lost] = mergeExpenseViews([q('b', 'evidence_lost')], []);
    const [wait] = mergeExpenseViews([], [row('c', 'approved')]);
    expect(needsRiderAction(back)).toBe(true);
    expect(needsRiderAction(lost)).toBe(true);
    expect(needsRiderAction(wait)).toBe(false);
  });
});
