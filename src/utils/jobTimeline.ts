// src/utils/jobTimeline.ts
//
// อ่านไทม์ไลน์งานจาก jobs/{id}/checkpoints — ข้อมูลที่ recordCheckpoint
// (utils/checkpoints.ts) เขียนไว้อยู่แล้วทุกครั้งที่ไรเดอร์กดเปลี่ยนสถานะ
// ที่นี่แค่คำนวณช่วงเวลาระหว่างจุด ไม่เขียนอะไรและไม่ยิง query เพิ่ม
//
// กติกาข้อมูลไม่ครบ (งานยุคก่อนระบบเช็คอินไม่มี checkpoints เลย):
// จุดไหนไม่มี = ไม่มีแถว, ช่วงไหนคำนวณไม่ได้ = null — ห้ามตีเป็น 0
// (0 นาทีคือคำตอบที่ผิด ไม่ใช่คำตอบที่ว่าง)

// ชนิด stage + ป้ายไทยอยู่ไฟล์นี้ (pure ไม่แตะ firebase) — checkpoints.ts
// ตัวเขียน re-export ไปให้ผู้ใช้เดิม เพื่อให้ไฟล์นี้เทสได้โดยไม่ init app จริง
export type CheckpointStage =
  | 'rider_accepted'
  | 'rider_en_route'
  | 'rider_arrived'
  | 'customer_left'
  | 'branch_handover';

/** ป้ายอ่านง่ายของแต่ละจุด — ใช้ทั้ง toast ตอนเช็คอินและไทม์ไลน์ */
export const STAGE_LABEL_TH: Record<CheckpointStage, string> = {
  rider_accepted: 'รับงาน',
  rider_en_route: 'ออกเดินทาง',
  rider_arrived: 'ถึงลูกค้า',
  customer_left: 'ออกจากลูกค้า',
  branch_handover: 'ส่งมอบสาขา',
};

const STAGE_ORDER: CheckpointStage[] = [
  'rider_accepted',
  'rider_en_route',
  'rider_arrived',
  'customer_left',
  'branch_handover',
];

interface CheckpointLike {
  at?: unknown;
  distance_m?: unknown;
  target?: { label?: unknown } | null;
}

export interface TimelineEntry {
  stage: CheckpointStage;
  label: string;
  at: number;
  /** ช่วงเวลาจากจุดก่อนหน้า (ms) — null เมื่อจุดก่อนหน้าไม่มีข้อมูล */
  sincePrevMs: number | null;
  /** ระยะห่างจากเป้าตอนเช็คอิน (เมตร) — มีเฉพาะจุดที่ verify กับหมุด */
  distanceM: number | null;
  /** ชื่อเป้า (เช่นชื่อสาขาที่ส่งมอบ) */
  targetLabel: string | null;
}

const finiteOrNull = (v: unknown): number | null => {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** เวลาเช็คอินของจุดหนึ่ง — null เมื่อไม่มีข้อมูล */
export function checkpointAt(job: any, stage: CheckpointStage): number | null {
  const cp = job?.checkpoints?.[stage] as CheckpointLike | undefined;
  const at = finiteOrNull(cp?.at);
  return at !== null && at > 0 ? at : null;
}

/** ไทม์ไลน์เรียงตามลำดับจริง เฉพาะจุดที่มีข้อมูล */
export function buildJobTimeline(job: any): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let prevAt: number | null = null;
  for (const stage of STAGE_ORDER) {
    const at = checkpointAt(job, stage);
    if (at === null) continue;
    const cp = job?.checkpoints?.[stage] as CheckpointLike;
    const label = typeof cp?.target?.label === 'string' ? cp.target.label : null;
    entries.push({
      stage,
      label: STAGE_LABEL_TH[stage],
      at,
      sincePrevMs: prevAt !== null && at >= prevAt ? at - prevAt : null,
      distanceM: finiteOrNull(cp?.distance_m),
      targetLabel: label,
    });
    prevAt = at;
  }
  return entries;
}

/** เวลาเดินทางไปหาลูกค้า (ออกเดินทาง → ถึงลูกค้า) — null เมื่อขาดจุดใดจุดหนึ่ง */
export function travelToCustomerMs(job: any): number | null {
  const start = checkpointAt(job, 'rider_en_route');
  const end = checkpointAt(job, 'rider_arrived');
  return start !== null && end !== null && end >= start ? end - start : null;
}

/** เวลารวมทั้งงาน (รับงาน → ส่งมอบสาขา/จบงาน) */
export function totalJobMs(job: any): number | null {
  const start = checkpointAt(job, 'rider_accepted');
  if (start === null) return null;
  const end =
    checkpointAt(job, 'branch_handover') ??
    checkpointAt(job, 'customer_left') ??
    (finiteOrNull(job?.completed_at) || null);
  return end !== null && end >= start ? end - start : null;
}

/** ระยะทางของงาน (กม.) จาก meta ที่ server คำนวณไว้ตอนคิดค่ารอบ */
export function jobDistanceKm(job: any): number | null {
  return (
    finiteOrNull(job?.rider_fee_meta?.distance_km) ??
    finiteOrNull(job?.rider_fee_estimate_meta?.distance_km)
  );
}

/** "18 นาที" / "1 ชม. 5 น." / "< 1 นาที" */
export function formatDurationTh(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '< 1 นาที';
  if (totalMin < 60) return `${totalMin} นาที`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

/** "20:41" — เวลาสั้นสำหรับไทม์ไลน์/การ์ด */
export function formatTimeTh(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
