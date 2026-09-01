// Rider check-in writes to /jobs/{id}/checkpoints/{stage}.
//
// Each status transition the rider drives (accepted, en-route, arrived,
// customer-left, branch-handover) gets a structured timestamp + GPS
// snapshot, optionally compared against a target location. The dashboard
// in bkk-system uses these to compute success / cancel / on-time rates
// per rider; admin uses them as audit trail when a customer disputes
// "rider never showed up".
//
// Geo verification is non-blocking — if the rider is outside the
// expected zone we still record the checkpoint and let admin review
// later. The toast in useJobActions tells the rider what happened so
// they can sort it with the customer if it was an honest mistake.
//
// พิกัดเป็น "ของเสริม" ไม่ใช่เงื่อนไข: แถว checkpoint ต้องถูกเขียนทุกครั้งที่
// status เปลี่ยนไปยังจุดเช็คอิน แม้ขอพิกัดไม่ได้ — เดิม recordCheckpoint ถูก
// เรียกอยู่ "ข้างใน" success callback ของ getCurrentPosition ปฏิเสธสิทธิ์หรือ
// GPS ไม่ตอบ = ไม่มีแถวเลย ทั้งที่ status เปลี่ยนสำเร็จไปแล้ว ไทม์ไลน์จึงขาด
// เป็นช่วงๆ โดยไม่มี error ให้ใครเห็น

import { ref, update, get } from 'firebase/database';
import { db } from '../api/firebase';
import type { CheckpointStage } from './jobTimeline';
import type { GpsFix, GpsStatus } from './geolocation';
import { buildCheckpointRow, distanceMeters } from './checkpointPayload';

// ชนิด stage + ป้ายไทยย้ายไปอยู่ jobTimeline.ts (pure, เทสได้) —
// re-export ไว้ที่นี่ให้ผู้ใช้เดิมไม่ต้องแก้ import
export type { CheckpointStage } from './jobTimeline';
export { STAGE_LABEL_TH } from './jobTimeline';

interface VerifyConfig {
  // 'customer' uses the job's cust_lat/lng. 'branch' picks the nearest
  // active branch from settings/branches. 'none' just stores the GPS
  // snapshot without computing a distance.
  target: 'customer' | 'branch' | 'none';
  thresholdM: number;
}

// เกณฑ์การเทียบพิกัดของแต่ละจุดเช็คอิน — **แหล่งเดียว**
//
// ทั้งชื่อสถานะ (เส้นทางเดิม) และ event (เส้นทางใหม่ผ่าน transitionJob) ชี้มาที่
// ตารางนี้ ถ้าแยกกันเก็บ วันหนึ่งเกณฑ์ 200/250/300 ม. จะไม่ตรงกันตามทางที่เข้ามา
const STAGE_VERIFY: Record<CheckpointStage, VerifyConfig> = {
  rider_accepted:  { target: 'none',     thresholdM: 0   },
  rider_en_route:  { target: 'none',     thresholdM: 0   },
  rider_arrived:   { target: 'customer', thresholdM: 200 },
  // ไรเดอร์ออกจากจุดลูกค้า (จ่ายเงินแล้ว กำลังกลับสาขา)
  customer_left:   { target: 'customer', thresholdM: 250 },
  // ส่งมอบที่สาขา (สาขาที่ใกล้ตำแหน่งไรเดอร์ที่สุด)
  branch_handover: { target: 'branch',   thresholdM: 300 },
};

/**
 * เกณฑ์ของ stage — ผู้เรียกรู้ stage จาก **event** ที่ตัวเองยิง (ดู
 * EVENT_CHECKPOINT_STAGE ใน riderTransitions.ts)
 *
 * เดิมมีอีกทางคือค้นจาก "ชื่อสถานะปลายทาง" พร้อมตารางที่ต้องลิสต์ทั้ง canonical
 * และ legacy spelling ทุกตัว — ทางนั้นตายไปพร้อมกับ updateStatus เพราะไม่มี
 * ไคลเอนต์ตัวไหนรู้จักสถานะปลายทางล่วงหน้าอีกแล้ว ลบทิ้งแทนที่จะเก็บไว้ให้
 * คนอ่านรอบหน้าเข้าใจผิดว่ายังมีสองทาง
 */
export function getCheckpointForStage(stage: CheckpointStage): { stage: CheckpointStage; verify: VerifyConfig } {
  return { stage, verify: STAGE_VERIFY[stage] };
}

// Haversine ย้ายไปอยู่ checkpointPayload.ts (pure, เทสได้) — re-export ไว้ให้
// ผู้ใช้เดิมไม่ต้องแก้ import
export { distanceMeters } from './checkpointPayload';

interface BranchRecord {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  isActive?: boolean;
}

async function findNearestBranch(lat: number, lng: number): Promise<BranchRecord | null> {
  try {
    const snap = await get(ref(db, 'settings/branches'));
    if (!snap.exists()) return null;
    const data = snap.val() as Record<string, Omit<BranchRecord, 'id'>>;
    let best: BranchRecord | null = null;
    let bestDist = Infinity;
    for (const [id, b] of Object.entries(data)) {
      if (b?.isActive === false) continue;
      if (typeof b?.lat !== 'number' || typeof b?.lng !== 'number') continue;
      const d = distanceMeters(lat, lng, b.lat, b.lng);
      if (d < bestDist) { bestDist = d; best = { id, ...b }; }
    }
    return best;
  } catch {
    return null;
  }
}

export interface CheckpointResult {
  stage: CheckpointStage;
  withinZone: boolean | null; // null = no verify
  distanceM: number | null;
  thresholdM: number;
  targetLabel: string | null;
  gpsStatus: GpsStatus;
}

interface RecordArgs {
  jobId: string;
  riderId: string;
  /** จุดเช็คอินของ event ที่เพิ่งยิงไป — ไม่มี = ไม่ต้องบันทึกอะไร */
  stage?: CheckpointStage;
  /** null = ขอพิกัดไม่ได้ — แถวยังต้องถูกเขียน (ดูหัวไฟล์) */
  gps: GpsFix | null;
  /** เหตุผลเมื่อ gps เป็น null ('ok' เมื่อมีพิกัด) */
  gpsStatus: GpsStatus;
  job: { cust_lat?: number; cust_lng?: number } | null;
  /** เป้าที่ผู้เรียกหามาแล้ว (ตอนประเมินก่อนถามยืนยัน) — ไม่ส่ง = หาเอง
   *  ส่งมาแล้วจะไม่หาซ้ำ กัน findNearestBranch ยิงสองรอบต่อการกดหนึ่งครั้ง */
  target?: { lat: number; lng: number; label: string } | null;
  /** ไรเดอร์ยืนยันเองว่าถึงแล้วทั้งที่นอกโซน */
  selfConfirmed?: boolean;
}

/**
 * หาเป้าที่ใช้เทียบระยะของ stage นี้ — แยกออกมาเพื่อให้ "ประเมินก่อนเขียน" ได้
 *
 * ผู้เรียกต้องรู้ระยะห่าง **ก่อน** ตัดสินใจว่าจะเขียนอะไรลง DB ไหม (ดูการถาม
 * ยืนยันใน useJobActions) การหาเป้าจึงต้องเรียกได้เดี่ยวๆ ไม่ใช่ฝังอยู่ใน
 * ตัวเขียนอย่างเดียว มิฉะนั้น logic เดียวกันจะถูกก๊อปไปอยู่สองที่แล้ววันหนึ่ง
 * ไม่ตรงกัน
 */
export async function resolveCheckpointTarget(
  verify: VerifyConfig,
  gps: GpsFix | null,
  job: { cust_lat?: number; cust_lng?: number } | null,
): Promise<{ lat: number; lng: number; label: string } | null> {
  if (verify.target === 'customer' && job?.cust_lat != null && job?.cust_lng != null) {
    return { lat: job.cust_lat, lng: job.cust_lng, label: 'พิกัดลูกค้า' };
  }
  if (verify.target === 'branch' && gps) {
    // หาสาขาที่ใกล้ "ตำแหน่งของเรา" ที่สุด — ไม่มีพิกัดของเราก็หาไม่ได้
    // และห้ามหยิบสาขาแรกมาใส่แทน (จะทำให้ระยะห่างเป็น 0 และ is_within_zone
    // เป็น true ทุกครั้งที่ GPS ล้ม = ด่านตรวจกลายเป็นตรายาง)
    const branch = await findNearestBranch(gps.lat, gps.lng);
    if (branch) return { lat: branch.lat, lng: branch.lng, label: branch.name || 'สาขา' };
  }
  return null;
}

export async function recordCheckpoint(args: RecordArgs): Promise<CheckpointResult | null> {
  if (!args.stage) return null;
  const config = getCheckpointForStage(args.stage);

  const { stage, verify } = config;
  const now = Date.now();

  const target = args.target !== undefined
    ? args.target
    : await resolveCheckpointTarget(verify, args.gps, args.job);

  const { row, distanceM, withinZone } = buildCheckpointRow({
    riderId: args.riderId,
    at: now,
    gps: args.gps,
    gpsStatus: args.gpsStatus,
    target,
    thresholdM: verify.thresholdM,
    selfConfirmed: args.selfConfirmed,
  });

  await update(ref(db, `jobs/${args.jobId}/checkpoints/${stage}`), row);

  return {
    stage,
    withinZone,
    distanceM,
    thresholdM: verify.thresholdM,
    targetLabel: target?.label ?? null,
    gpsStatus: args.gpsStatus,
  };
}

