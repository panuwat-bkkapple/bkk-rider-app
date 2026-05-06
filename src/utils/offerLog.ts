// Broadcast job offer logging.
//
// Whenever a job appears in the rider's incoming list (broadcast or
// direct-assign waiting for accept), we write /jobs_offers/{jobId}/{riderId}
// so the dashboard in bkk-system can compute true acceptance rate
// (accepted / offered) instead of guessing from end-state status.
//
// Idempotent: write only if no record exists yet for this {job,rider}
// pair — the rider list can re-render many times without duplicating
// offered_at timestamps.

import { ref, get, update } from 'firebase/database';
import { db } from '../api/firebase';

export async function logOffer(jobId: string, riderId: string): Promise<void> {
  if (!jobId || !riderId) return;
  try {
    const path = `jobs_offers/${jobId}/${riderId}`;
    const snap = await get(ref(db, `${path}/offered_at`));
    if (snap.exists()) return; // already logged
    await update(ref(db, path), { offered_at: Date.now() });
  } catch (err) {
    // Non-fatal — logging shouldn't block the rider seeing the job.
    console.warn('logOffer failed:', jobId, riderId, err);
  }
}

export async function markOfferAccepted(jobId: string, riderId: string): Promise<void> {
  if (!jobId || !riderId) return;
  try {
    const path = `jobs_offers/${jobId}/${riderId}`;
    // Ensure offered_at exists so the row is well-formed even if the
    // rider opened the app straight onto the accept tap (offered_at
    // would otherwise be missing).
    const snap = await get(ref(db, `${path}/offered_at`));
    const updates: Record<string, number> = { accepted_at: Date.now() };
    if (!snap.exists()) updates.offered_at = Date.now();
    await update(ref(db, path), updates);
  } catch (err) {
    console.warn('markOfferAccepted failed:', jobId, riderId, err);
  }
}

export async function markOfferRejected(jobId: string, riderId: string): Promise<void> {
  if (!jobId || !riderId) return;
  try {
    const path = `jobs_offers/${jobId}/${riderId}`;
    const snap = await get(ref(db, `${path}/offered_at`));
    const updates: Record<string, number> = { rejected_at: Date.now() };
    if (!snap.exists()) updates.offered_at = Date.now();
    await update(ref(db, path), updates);
  } catch (err) {
    console.warn('markOfferRejected failed:', jobId, riderId, err);
  }
}
