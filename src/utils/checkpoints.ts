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

import { ref, update, get } from 'firebase/database';
import { db } from '../api/firebase';
import { JOB_STATUS } from '../types/job-statuses';

export type CheckpointStage =
  | 'rider_accepted'
  | 'rider_en_route'
  | 'rider_arrived'
  | 'customer_left'
  | 'branch_handover';

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

// Haversine — accurate enough at neighbourhood scale, no external dep.
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

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
}

interface RecordArgs {
  jobId: string;
  riderId: string;
  status: string;
  gps: { lat: number; lng: number; accuracy?: number };
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
  } else if (verify.target === 'branch') {
    const branch = await findNearestBranch(args.gps.lat, args.gps.lng);
    if (branch) target = { lat: branch.lat, lng: branch.lng, label: branch.name || 'สาขา' };
  }

  const distanceM = target ? distanceMeters(args.gps.lat, args.gps.lng, target.lat, target.lng) : null;
  const withinZone = distanceM == null ? null : distanceM <= verify.thresholdM;

  const payload: Record<string, unknown> = {
    at: now,
    rider_id: args.riderId,
    lat: args.gps.lat,
    lng: args.gps.lng,
  };
  if (typeof args.gps.accuracy === 'number') payload.accuracy = args.gps.accuracy;
  if (target) payload.target = target;
  if (distanceM != null) {
    payload.distance_m = distanceM;
    payload.is_within_zone = withinZone;
    payload.zone_m = verify.thresholdM;
  }

  await update(ref(db, `jobs/${args.jobId}/checkpoints/${stage}`), payload);

  return {
    stage,
    withinZone,
    distanceM,
    thresholdM: verify.thresholdM,
    targetLabel: target?.label ?? null,
  };
}

// Human-readable label for toast messages.
export const STAGE_LABEL_TH: Record<CheckpointStage, string> = {
  rider_accepted: 'รับงาน',
  rider_en_route: 'ออกเดินทาง',
  rider_arrived: 'ถึงลูกค้า',
  customer_left: 'ออกจากลูกค้า',
  branch_handover: 'ส่งมอบสาขา',
};
