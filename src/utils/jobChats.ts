// src/utils/jobChats.ts
//
// Job chat messages live at /job_chats/{jobId} — OUTSIDE the job row — so
// conversations stop inflating every read of /jobs (rider queries included:
// a queried job row used to arrive with its whole chat history embedded).
// Mirror of bkk-system/src/utils/jobChats.ts; bkk-frontend-next's
// RiderChatModal implements the same contract inline. Keep in sync.
//
// Transition rules (until the move-chats migration has run and stale PWA
// clients have refreshed):
//   - READ both paths merged: legacy embedded jobs/{id}/chats + /job_chats
//   - WRITE to /job_chats; fall back to the legacy path if rules for the
//     new node aren't deployed yet, so chat never goes down mid-rollout
//   - Unread badges read jobs/{id}/chat_flags (maintained by cloud
//     functions); the reader clears its own flag when it opens the chat
import { ref, onValue, push, update } from 'firebase/database';
import { db } from '../api/firebase';

export type ChatMap = Record<string, any>;

/** Subscribe to the merged (legacy + current) chat map for a job. */
export const subscribeJobChats = (
  jobId: string,
  cb: (chats: ChatMap, legacy: ChatMap) => void
) => {
  let legacy: ChatMap = {};
  let current: ChatMap = {};
  const emit = () => cb({ ...legacy, ...current }, legacy);

  const unsubLegacy = onValue(
    ref(db, `jobs/${jobId}/chats`),
    (snap) => { legacy = snap.val() || {}; emit(); },
    () => emit()
  );
  const unsubCurrent = onValue(
    ref(db, `job_chats/${jobId}`),
    (snap) => { current = snap.val() || {}; emit(); },
    () => emit()
  );
  return () => { unsubLegacy(); unsubCurrent(); };
};

/** Send a message to the canonical path, legacy fallback if rules lag. */
export const sendJobChatMessage = async (jobId: string, message: ChatMap) => {
  try {
    await push(ref(db, `job_chats/${jobId}`), message);
  } catch {
    await push(ref(db, `jobs/${jobId}/chats`), message);
  }
};

/**
 * Mark every unread message NOT sent by the rider as read (on whichever
 * path each message lives) and clear the rider-facing unread flags.
 */
export const markJobChatsReadByRider = (
  jobId: string,
  chats: ChatMap,
  legacyChats: ChatMap
) => {
  for (const [key, msg] of Object.entries(chats)) {
    if (!msg || msg.sender === 'rider' || msg.read) continue;
    const path = legacyChats[key]
      ? `jobs/${jobId}/chats/${key}`
      : `job_chats/${jobId}/${key}`;
    update(ref(db, path), { read: true }).catch(() => {});
  }
  update(ref(db, `jobs/${jobId}/chat_flags`), {
    unread_from_admin: false,
    unread_from_customer: false,
  }).catch(() => {});
};

/** Badge helper: unread flag with legacy embedded-chats fallback. */
export const hasUnreadFromAdmin = (job: any): boolean => {
  if (job?.chat_flags?.unread_from_admin || job?.chat_flags?.unread_from_customer) return true;
  return !!(
    job?.chats &&
    Object.values(job.chats).some((c: any) => c.sender !== 'rider' && !c.read)
  );
};
