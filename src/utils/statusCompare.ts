// ตัวเทียบสถานะงานตัวเดียวของแอปไรเดอร์ — normalizeStatus ทั้งสองฝั่ง แทน string literal
//
// MIRROR ของ bkk-system/src/utils/statusCompare.ts (กติกาเดียวกัน คนละรีโป แชร์โค้ด
// ไม่ได้เพราะแต่ละรีโปถือ job-statuses.ts ของตัวเอง — Data Contracts ข้อ 6)
//
// ที่มา (4 ก.ย. 2569, bkk-system docs/reports/2026-09-04-status-literal-compare-survey-cross-repo.md):
// แอปนี้เขียน "รับทั้งสองสะกด" ด้วยมือทุกจุด (`job.status === 'Accepted' ||
// job.status === JOB_STATUS.RIDER_ACCEPTED`) ซึ่งถูก แต่ยาวสองเท่าและไม่มีอะไร
// บังคับจุดใหม่ให้ทำตาม. กติกาใหม่: reader เขียนเซ็ตด้วย JOB_STATUS.* แล้วถามผ่าน
// statusIs/statusIn ซึ่ง normalize ฝั่งงานก่อนเทียบ — ด่าน src/utils/statusLiteralCensus.test.ts
import { normalizeStatus } from '../types/job-statuses';

export type StatusJob = { status?: string | null; receive_method?: string | null } | null | undefined;

/** canonical ถ้าอ่านออก ไม่งั้นค่าดิบ (string ไม่ว่าง) ไม่งั้น null */
export const canonicalStatus = (raw: unknown, receiveMethod?: string | null): string | null => {
  const text = typeof raw === 'string' && raw ? raw : null;
  if (!text) return null;
  return normalizeStatus(text, receiveMethod) ?? text;
};

export const canonicalStatusOf = (job: StatusJob): string | null =>
  canonicalStatus(job?.status, job?.receive_method);

/** งานอยู่ในสถานะใดสถานะหนึ่งที่ให้มา (เขียนด้วย JOB_STATUS.*) */
export const statusIs = (job: StatusJob, ...canonical: readonly string[]): boolean => {
  const s = canonicalStatusOf(job);
  return !!s && canonical.includes(s);
};

export const statusIn = (job: StatusJob, set: ReadonlySet<string> | readonly string[]): boolean => {
  const s = canonicalStatusOf(job);
  if (!s) return false;
  return set instanceof Set ? set.has(s) : (set as readonly string[]).includes(s);
};

/** เทียบ qc_logs[].action — engine เขียน action = ชื่อสถานะ canonical, log เก่าสะกดเดิม */
export const actionIs = (action: unknown, ...accepted: readonly string[]): boolean => {
  const a = canonicalStatus(action);
  return !!a && accepted.includes(a);
};
