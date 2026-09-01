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
import { JOB_STATUS } from '../types/job-statuses';
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

const STATUS_TO_STAGE: Record<string, { stage: CheckpointStage; verify: VerifyConfig }> = {
  // Pickup flow
  [JOB_STATUS.RIDER_ACCEPTED]: { stage: 'rider_accepted',  verify: { target: 'none',     thresholdM: 0   } },
  'Accepted':                  { stage: 'rider_accepted',  verify: { target: 'none',     thresholdM: 0   } }, // legacy
  [JOB_STATUS.RIDER_EN_ROUTE]: { stage: 'rider_en_route',  verify: { target: 'none',     thresholdM: 0   } },
  'Heading to Customer':       { stage: 'rider_en_route',  verify: { target: 'none',     thresholdM: 0   } }, // legacy
  [JOB_STATUS.RIDER_ARRIVED]:  { stage: 'rider_arrived',   verify: { target: 'customer', thresholdM: 200 } },
  'Arrived':                   { stage: 'rider_arrived',   verify: { target: 'customer', thresholdM: 200 } }, // legacy
  // Rider leaves customer site (post-payment, returning to branch)
  [JOB_STATUS.RIDER_RETURNING]: { stage: 'customer_left',  verify: { target: 'customer', thresholdM: 250 } },
  'In-Transit':                { stage: 'customer_left',   verify: { target: 'customer', thresholdM: 250 } }, // legacy
  // Branch hand-over (rider arrives at any active branch with the device)
  [JOB_STATUS.PENDING_QC]:     { stage: 'branch_handover', verify: { target: 'branch',   thresholdM: 300 } },
};

export function getCheckpointForStatus(status: string): { stage: CheckpointStage; verify: VerifyConfig } | null {
  return STATUS_TO_STAGE[status] ?? null;
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
  status: string;
  /** null = ขอพิกัดไม่ได้ — แถวยังต้องถูกเขียน (ดูหัวไฟล์) */
  gps: GpsFix | null;
  /** เหตุผลเมื่อ gps เป็น null ('ok' เมื่อมีพิกัด) */
  gpsStatus: GpsStatus;
  job: { cust_lat?: number; cust_lng?: number } | null;
}

export async function recordCheckpoint(args: RecordArgs): Promise<CheckpointResult | null> {
  const config = getCheckpointForStatus(args.status);
  if (!config) return null;

  const { stage, verify } = config;
  const now = Date.now();

  let target: { lat: number; lng: number; label: string } | null = null;
  if (verify.target === 'customer' && args.job?.cust_lat != null && args.job?.cust_lng != null) {
    target = { lat: args.job.cust_lat, lng: args.job.cust_lng, label: 'พิกัดลูกค้า' };
  } else if (verify.target === 'branch' && args.gps) {
    // หาสาขาที่ใกล้ "ตำแหน่งของเรา" ที่สุด — ไม่มีพิกัดของเราก็หาไม่ได้
    // และห้ามหยิบสาขาแรกมาใส่แทน (จะทำให้ระยะห่างเป็น 0 และ is_within_zone
    // เป็น true ทุกครั้งที่ GPS ล้ม = ด่านตรวจกลายเป็นตรายาง)
    const branch = await findNearestBranch(args.gps.lat, args.gps.lng);
    if (branch) target = { lat: branch.lat, lng: branch.lng, label: branch.name || 'สาขา' };
  }

  const { row, distanceM, withinZone } = buildCheckpointRow({
    riderId: args.riderId,
    at: now,
    gps: args.gps,
    gpsStatus: args.gpsStatus,
    target,
    thresholdM: verify.thresholdM,
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

