import * as admin from "firebase-admin";
import { onValueCreated, onValueWritten } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";
import { isBroadcastRecipient } from "./riderStanding";

admin.initializeApp();

const db = admin.database();
const messaging = admin.messaging();

// Helper: Get all FCM tokens for a rider
async function getRiderTokens(riderId: string): Promise<string[]> {
  const tokens: string[] = [];

  // Check fcm_tokens (multi-device)
  const tokensSnap = await db.ref(`riders/${riderId}/fcm_tokens`).get();
  if (tokensSnap.exists()) {
    const tokensData = tokensSnap.val();
    for (const key of Object.keys(tokensData)) {
      if (tokensData[key]?.token) {
        tokens.push(tokensData[key].token);
      }
    }
  }

  // Fallback: single fcm_token
  if (tokens.length === 0) {
    const tokenSnap = await db.ref(`riders/${riderId}/fcm_token`).get();
    if (tokenSnap.exists()) {
      tokens.push(tokenSnap.val());
    }
  }

  return tokens;
}

// Helper: Send notification to multiple tokens, clean up invalid ones
async function sendToRider(
  riderId: string,
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (tokens.length === 0) return;

  // Data-only message: SW builds the notification from `data`. Including a
  // top-level `notification` field would cause iOS PWA to auto-display ON TOP
  // of the SW's showNotification call, producing two identical alerts per push.
  const message: admin.messaging.MulticastMessage = {
    tokens,
    data: { ...(data || {}), title, body },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
      },
      payload: {
        aps: {
          "mutable-content": 1,
          sound: "default",
        },
      },
    },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400",
      },
    },
  };

  const response = await messaging.sendEachForMulticast(message);

  // Clean up invalid tokens
  if (response.failureCount > 0) {
    const tokensSnap = await db.ref(`riders/${riderId}/fcm_tokens`).get();
    if (!tokensSnap.exists()) return;

    const tokensData = tokensSnap.val();
    const updates: Record<string, null> = {};

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          // Find and remove this invalid token
          for (const key of Object.keys(tokensData)) {
            if (tokensData[key]?.token === tokens[idx]) {
              updates[`riders/${riderId}/fcm_tokens/${key}`] = null;
              break;
            }
          }
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }
  }
}

// ============================================================
// 1. New Job Assigned - notify rider when a job is assigned
// ============================================================
//
// NAME COLLISION WARNING: keep this export name stable but be aware that the
// bkk-system codebase MUST NOT export a function of the same name on the same
// region. Firebase Cloud Functions are identified project-wide by
// {region}/{name}; the codebase concept only groups deploys, it does NOT
// namespace names. The two repos previously both exported `onJobStatusChanged`
// here and admin auto-deploys silently overwrote this function with admin
// code (and rider deploys flipped it back), producing the recurring "rider
// stopped getting notifications after admin pushed" / "admin stopped getting
// notifications after rider pushed" symptom. Admin side was renamed to
// `onAdminJobStatusNotify` in bkk-system to break the loop — see
// panuwat-bkkapple/bkk-system PR around 2026-05-23.
export const onJobStatusChanged = onValueWritten(
  {
    ref: "jobs/{jobId}/status",
    instance: "bkk-apple-tradein-default-rtdb",
    region: "asia-southeast1",
  },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const jobId = event.params.jobId;

    // Only trigger when status actually changed
    if (before === after) return;

    // Get job data
    const jobSnap = await db.ref(`jobs/${jobId}`).get();
    if (!jobSnap.exists()) return;
    const job = jobSnap.val();
    const riderId = job.rider_id;
    if (!riderId) return;

    const tokens = await getRiderTokens(riderId);
    if (tokens.length === 0) return;

    // Get device info for notification body
    const devices = job.devices || [];
    const firstDevice = devices[0];
    const deviceName = firstDevice
      ? `${firstDevice.brand || ""} ${firstDevice.model || ""} ${firstDevice.storage || ""}`.trim()
      : "อุปกรณ์";

    // Determine notification based on status change
    let title = "";
    let body = "";

    // Reopen — admin pulled a soft-cancelled job back onto the same ticket with
    // this rider still assigned (customer came back for the original revised
    // offer). The status flips to "Rider En Route", which carries no rider
    // notification on its own, so surface the turn-around explicitly. A short
    // recency guard on reopened_at keeps this from firing on ordinary En Route
    // transitions later in the job.
    if (
      job.reopened_at &&
      Date.now() - job.reopened_at < 2 * 60 * 1000 &&
      (after === "Rider En Route" || after === "Heading to Customer")
    ) {
      await sendToRider(riderId, tokens, "🔄 งานกลับมาแล้ว!", `${deviceName} - ลูกค้าขอขายใหม่ในราคาเดิม กรุณากลับไปรับเครื่อง`, {
        type: "job_status",
        jobId,
        status: after,
      });
      return;
    }

    // Tolerant matching: every case lists both the legacy DB string and
    // the canonical name from src/types/job-statuses.ts so the trigger
    // keeps firing while writers still emit legacy values (Phase 2D will
    // unify them). The functions/ package can't import the TS enum
    // directly because it has its own rootDir, hence the inline pairs.
    switch (after) {
      case "Assigned":
      case "Rider Assigned":
        title = "📦 งานใหม่เข้า!";
        body = `${deviceName} - ${job.customer_name || "ลูกค้า"}`;
        break;

      case "QC Review":
        // Don't notify rider for this - they submitted it
        return;

      case "Price Accepted":
        title = "✅ ลูกค้ายอมรับราคา";
        body = `${deviceName} - รอดำเนินการต่อ`;
        break;

      case "Revised Offer":
        title = "💰 QC ปรับราคาใหม่";
        body = `${deviceName} - กรุณาตรวจสอบ`;
        break;

      case "Completed":
      case "Paid":
      case "PAID":
        title = "🎉 งานเสร็จสมบูรณ์";
        body = `${deviceName} - ขอบคุณครับ!`;
        break;

      case "Waiting for Handover":
      case "Waiting For Handover":
      case "Payment Completed":
        // Finance transferred the payout to the customer. The rider already
        // handed the device over at QC, so for them this is the closing signal
        // that the money went out. Previously this status hit `default` and the
        // rider got nothing when Finance paid. (B2C Finance writes the
        // lowercase-'for' legacy string; B2B writes "Payment Completed".)
        title = "💸 โอนเงินให้ลูกค้าแล้ว";
        body = `${deviceName} - งานเสร็จสมบูรณ์`;
        break;

      case "Cancelled": {
        // Differentiate cancel source — rider needs to know whether to expect
        // a call from the customer, a refund flow from admin, or just move on.
        const cancelledBy: string = job.cancelled_by || "";

        // The rider himself cancelled — silent (he's the one who did it).
        if (cancelledBy === `rider:${riderId}`) return;

        if (cancelledBy.startsWith("customer") || cancelledBy === "customer") {
          title = "❌ ลูกค้ายกเลิกงาน";
        } else if (cancelledBy.startsWith("admin") || cancelledBy === "admin") {
          title = "❌ Admin ยกเลิกงาน";
        } else if (cancelledBy === "system") {
          title = "⏱ ระบบยกเลิกอัตโนมัติ";
        } else {
          title = "❌ งานถูกยกเลิก";
        }
        body = `${deviceName}${job.cancel_reason ? ` - ${job.cancel_reason}` : ""}`;
        break;
      }

      case "Returning To Customer":
      case "Return Confirmed":
        title = "🔙 ตีเครื่องกลับ";
        body = `${deviceName} - เตรียมตีเครื่องคืนลูกค้า`;
        break;

      default:
        // Don't send notification for other status changes
        return;
    }

    const isPayout =
      after === "Waiting for Handover" ||
      after === "Waiting For Handover" ||
      after === "Payment Completed";
    await sendToRider(riderId, tokens, title, body, {
      type: "job_status",
      jobId,
      status: after,
      // Mark payout pushes so the client can special-case them; type stays
      // "job_status" so existing SW / onMessage rendering keeps working.
      ...(isPayout
        ? { event: "payment_transferred", amount: String(job.net_payout != null ? job.net_payout : "") }
        : {}),
    });
  }
);

// ============================================================
// 2. New Chat Message - notify rider when customer/admin sends
// Messages now live at /job_chats/{jobId} (moved out of the job row to cut
// RTDB download cost); the legacy embedded-path trigger stays alive for
// stale clients during the transition. Both share this handler.
// ============================================================
const handleNewChatMessage = async (
  message: any,
  jobId: string,
  messageId: string
) => {

    logger.info("Chat onCreate triggered", { jobId, sender: message?.sender, text: message?.text?.slice(0, 50) });

    // Only notify for messages NOT from rider
    if (!message || message.sender === "rider") {
      logger.info("Skipping - sender is rider");
      return;
    }

    // Get job to find rider_id
    const jobSnap = await db.ref(`jobs/${jobId}`).get();
    if (!jobSnap.exists()) {
      logger.warn("Job not found", { jobId });
      return;
    }
    const job = jobSnap.val();
    const riderId = job.rider_id;
    if (!riderId) {
      logger.warn("No rider_id on job", { jobId });
      return;
    }

    const tokens = await getRiderTokens(riderId);
    logger.info("Rider tokens", { riderId, count: tokens.length });

    if (tokens.length === 0) return;

    const senderName = message.senderName || (message.sender === "Customer" ? "ลูกค้า" : "แอดมิน");
    const isImage = !!message.imageUrl;
    const bodyText = isImage ? "📷 ส่งรูปภาพ" : (message.text || "ข้อความใหม่");

    await sendToRider(riderId, tokens, `💬 ${senderName}`, bodyText, {
      type: "chat",
      jobId,
      messageId,
    });

    logger.info("Chat notification sent!", { riderId, senderName });
};

// Legacy embedded path — stale (pre-/job_chats) clients only.
export const onNewChatMessage = onValueCreated(
  {
    ref: "jobs/{jobId}/chats/{messageId}",
    instance: "bkk-apple-tradein-default-rtdb",
    region: "asia-southeast1",
  },
  async (event) =>
    handleNewChatMessage(event.data.val(), event.params.jobId, event.params.messageId)
);

// Canonical path. Name must stay unique project-wide — the bkk-system
// codebase has its own chat triggers (onChatMessageCreated /
// onJobChatMessageV2); see the naming note in that repo's CLAUDE.md.
export const onNewJobChatMessage = onValueCreated(
  {
    ref: "job_chats/{jobId}/{messageId}",
    instance: "bkk-apple-tradein-default-rtdb",
    region: "asia-southeast1",
  },
  async (event) =>
    handleNewChatMessage(event.data.val(), event.params.jobId, event.params.messageId)
);

// ============================================================
// 3. Broadcast Job - notify all online riders for broadcast jobs
// ============================================================
export const onBroadcastJob = onValueWritten(
  {
    ref: "jobs/{jobId}/status",
    instance: "bkk-apple-tradein-default-rtdb",
    region: "asia-southeast1",
  },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const jobId = event.params.jobId;

    // Only trigger for the broadcast bucket. Accept both the legacy
    // plural string and the canonical singular from job-statuses.ts so
    // this push keeps firing through the Phase 2D writer rename.
    if (
      (after !== "Active Leads" && after !== "Active Lead") ||
      before === after
    ) {
      return;
    }

    // Get job data
    const jobSnap = await db.ref(`jobs/${jobId}`).get();
    if (!jobSnap.exists()) return;
    const job = jobSnap.val();

    // Check dispatch mode
    const modeSnap = await db.ref("settings/system/dispatch_mode").get();
    const mode = modeSnap.exists() ? modeSnap.val() : "manual";
    if (mode !== "broadcast") return;

    // Get all online riders
    const ridersSnap = await db.ref("riders").get();
    if (!ridersSnap.exists()) return;

    const riders = ridersSnap.val();
    const devices = job.devices || [];
    const firstDevice = devices[0];
    const deviceName = firstDevice
      ? `${firstDevice.brand || ""} ${firstDevice.model || ""} ${firstDevice.storage || ""}`.trim()
      : "อุปกรณ์";

    // ส่งให้ไรเดอร์ที่ **อนุมัติแล้ว** ทุกคน — ไม่ใช่ `status === 'Online' | 'Busy'`
    // ของเดิม ซึ่งกรองด้วยฟิลด์ที่มีสองความหมาย: คนที่อนุมัติแล้วแต่ยังไม่เคยกด
    // "รับงาน" ถือค่า `Active` อยู่ในฟิลด์นั้นจึงไม่เคยได้ push ส่วนคนที่ถูกระงับ
    // แต่ `status` ค้างเป็น `Busy` กลับได้ (ดูเหตุผลเต็มใน riderStanding.ts)
    const promises = Object.entries(riders).map(async ([riderId, riderData]: [string, any]) => {
      if (!isBroadcastRecipient(riderData)) return;

      const tokens = await getRiderTokens(riderId);
      if (tokens.length === 0) return;

      await sendToRider(riderId, tokens, "📦 งาน Broadcast ใหม่!", `${deviceName} - รีบกดรับก่อน!`, {
        type: "broadcast_job",
        jobId,
      });
    });

    await Promise.all(promises);
  }
);

// ============================================================
// 4. Rider withdrawal request — คำขอถอนเงินจากกระเป๋าไรเดอร์
// ============================================================
//
// ทำไมต้องเป็น callable ไม่ใช่ให้แอปเขียน /withdrawals ตรง: RTDB rules รวมยอด
// ข้าม node ไม่ได้ การตรวจ "ยอดขอถอน <= ยอดในกระเป๋า" จึงต้องเกิดฝั่ง server
// ก่อนสร้างคำขอ ไม่งั้นใครยิงตรงก็ขอเกินได้ (ช่องเดิม: เช็คแค่ client)
// rules ของ /withdrawals จึงปิด client write สนิท — ดู
// bkk-frontend-next/database.rules.json และแผนเฟส 4 ใน
// docs/reports/2026-08-31-rider-wallet-fix-plan.md
//
// State machine ของแถว /withdrawals/{id} (DEBIT เขียนตอน paid เท่านั้น):
//   requested  = จองยอดไว้ ยังไม่แตะ ledger (คำขอที่ถูกปฏิเสธไม่กินยอดถาวร)
//   paid       = finance กดโอน → เขียน transactions DEBIT + เคลียร์ lock
//   rejected   = finance ปฏิเสธ → เคลียร์ lock ไม่มีรอย ledger
// ฝั่งจ่าย/ปฏิเสธอยู่ bkk-system RiderWithdrawals (admin-gated ตาม rules)
import { onCall, HttpsError } from "firebase-functions/v2/https";

// หมวดเงินไรเดอร์ — MIRROR ของ src/utils/walletLedger.ts (functions มี rootDir
// ของตัวเอง import จาก src/ ไม่ได้) แก้ฝั่งไหนต้องแก้ทั้งคู่
//
// **เคยหลุดมาแล้วหนึ่งรอบ อ่านก่อนแก้:** `ADJUSTMENT` ถูกเพิ่มฝั่งแอปใน #125
// แต่สำเนานี้ไม่ถูกแก้ตาม ผลคือหน้ากระเป๋าโชว์ยอดที่รวมแถว ADJUSTMENT แล้ว
// ขณะที่ `riderRequestWithdraw` คำนวณยอดถอนได้โดยไม่นับแถวนั้น — ไรเดอร์เห็น
// ตัวเลขหนึ่งแล้วถอนได้อีกตัวเลขหนึ่ง โดยไม่มี error ที่ไหนบอกว่าทำไม
// ซึ่งเป็นรูปบั๊กที่ CLAUDE.md เรียกว่า "แก้ฟิลด์เดียวของชุดที่ผูกกัน"
//
// **เพิ่มหมวดใหม่ = ต้องแก้สามที่ ไม่ใช่สองที่:** ไฟล์นี้ ·
// `src/utils/walletLedger.ts` · `bkk-system/src/utils/transactionLogger.ts`
const RIDER_WALLET_CATEGORIES = new Set([
  "JOB_PAYOUT",
  "WITHDRAWAL",
  "PENALTY",
  "BONUS",
  "ADJUSTMENT",
  "EXPENSE_REIMBURSEMENT",
]);

function walletTxAmount(t: Record<string, unknown> | null): number | null {
  if (!t) return null;
  if (t.type !== "CREDIT" && t.type !== "DEBIT") return null;
  if (!RIDER_WALLET_CATEGORIES.has(String(t.category ?? ""))) return null;
  const raw = t.amount;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const amt = Number(raw);
  if (!Number.isFinite(amt)) return null;
  return t.type === "CREDIT" ? amt : -amt;
}

export const riderRequestWithdraw = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "กรุณาเข้าสู่ระบบใหม่");

    const riderSnap = await db.ref(`riders/${uid}`).get();
    if (!riderSnap.exists()) {
      throw new HttpsError("permission-denied", "ไม่พบบัญชีไรเดอร์");
    }
    const rider = riderSnap.val() || {};

    const amount = Number(request.data?.amount);
    if (!Number.isInteger(amount) || amount < 100) {
      throw new HttpsError("invalid-argument", "ระบุยอดถอนเป็นจำนวนเต็ม ขั้นต่ำ 100 บาท");
    }

    const lockRef = db.ref(`withdrawal_locks/${uid}`);

    // lock ค้างจากคำขอที่จบไปแล้ว (paid/rejected ที่ฝั่ง finance ลืมเคลียร์ หรือ
    // callable ตายกลางทาง) = ปลดได้ — เช็คจากแถวจริงก่อน ไม่เชื่อ lock ลอยๆ
    const staleLock = (await lockRef.get()).val();
    if (staleLock && staleLock.request_id) {
      const rowStatus = (
        await db.ref(`withdrawals/${staleLock.request_id}/status`).get()
      ).val();
      if (rowStatus !== "requested") await lockRef.set(null);
    }

    // จุด serialize: หนึ่งคำขอเปิดได้ครั้งละหนึ่งใบต่อไรเดอร์ — transaction
    // สร้าง lock ได้เฉพาะเมื่อว่าง สองคำขอพร้อมกันจะมีคนแพ้เสมอ
    const wid = db.ref("withdrawals").push().key as string;
    const now = Date.now();
    const lockResult = await lockRef.transaction((cur) =>
      cur === null ? { request_id: wid, amount, at: now } : undefined
    );
    if (!lockResult.committed) {
      throw new HttpsError(
        "failed-precondition",
        "มีคำขอถอนเงินค้างอยู่แล้ว รอฝ่ายการเงินดำเนินการก่อนจึงขอใหม่ได้"
      );
    }

    try {
      // ยอดที่ถอนได้ = ledger (เฉพาะหมวดเงินไรเดอร์) − คำขอที่ยังค้าง
      // scan ตาม query rider_id (index มีแล้ว) — ข้อมูลยังหลักร้อยแถว ยอมรับได้
      // ตามที่เคาะไว้ อย่าเพิ่ง denormalize balance จนกว่าจะช้าจริง
      const [txSnap, pendingSnap] = await Promise.all([
        db.ref("transactions").orderByChild("rider_id").equalTo(uid).get(),
        db.ref("withdrawals").orderByChild("rider_id").equalTo(uid).get(),
      ]);
      let available = 0;
      txSnap.forEach((child) => {
        const v = walletTxAmount(child.val());
        if (v !== null) available += v;
        return false;
      });
      pendingSnap.forEach((child) => {
        const w = child.val() || {};
        if (w.status === "requested") available -= Number(w.withdraw_amount) || 0;
        return false;
      });

      if (amount > available) {
        throw new HttpsError(
          "failed-precondition",
          `ยอดเงินไม่เพียงพอ (ถอนได้ ${available.toLocaleString("th-TH")} บาท)`
        );
      }

      // field names คงรูปที่หน้า finance ใช้อยู่ (withdraw_amount ฯลฯ) — ตัวอ่าน
      // คือ bkk-system RiderWithdrawals ซึ่งย้าย source มาที่ node นี้
      await db.ref(`withdrawals/${wid}`).set({
        rider_id: uid,
        rider_name: rider.name || "",
        withdraw_amount: amount,
        status: "requested",
        requested_at: now,
        bank_name: rider.bank?.name || "",
        bank_account: rider.bank?.account || "",
      });

      return { id: wid, amount, available_after: available - amount };
    } catch (err) {
      // สร้างคำขอไม่สำเร็จ = คืนการจอง ไม่ทิ้ง lock ค้าง
      await lockRef.set(null).catch(() => undefined);
      throw err;
    }
  }
);

// ============================================================
// 5. Rider expense claim — ไรเดอร์เบิกค่าใช้จ่ายที่สำรองจ่ายเอง
// ============================================================
//
// ค่าทางด่วน/ค่าจอดรถที่ไรเดอร์จ่ายไปเองระหว่างวิ่งงาน วันนี้**ไม่มีช่องทาง
// บันทึกเลยสักทาง** (สำรวจครบสามรีโปแล้ว) เขาจึงต้องทวงผ่านแชทหรือจำเอาเอง
// ดีไซน์เต็มอยู่ที่ docs/reports/2026-09-02-rider-expense-claim-design.md
//
// เฟส P1 = ท่อฝั่ง server เท่านั้น ยังไม่มี UI:
//   riderSubmitExpense (ไฟล์นี้ — ฝั่งไรเดอร์ ตามรอย riderRequestWithdraw)
//   adminReviewExpense (bkk-system/functions — ต้องใช้ lookupStaffByAuth ที่นั่น)
//
// **ทำไม callable สองตัวอยู่คนละ codebase:** ตัวนี้ต้องรู้จัก `riders/{uid}`
// และถูกเรียกจากแอปไรเดอร์ (โปรเจกต์นี้ deploy เป็น codebase rider-notifications)
// ส่วนตัวรีวิวต้อง gate ด้วย `lookupStaffByAuth` + `dispatchAdminPush` ซึ่งอยู่ที่
// bkk-system ทั้งคู่ การย้ายอย่างใดอย่างหนึ่งข้ามฝั่งแปลว่าต้องก๊อป gate ไปอีกที่
// ซึ่งแพงกว่าการ deploy สอง codebase
//
// ชื่อ function ต้อง unique ระดับ project (กฎ {region}/{name} ใน CLAUDE.md) —
// prefix `rider*` ยังไม่ชนกับใคร

import {
  RIDER_EXPENSE_DEFAULTS,
  buildExpenseRow,
  duplicateDecision,
  evaluateExpense,
  evidenceBelongsTo,
  resolveExpenseSettings,
} from "./riderExpensePolicy";

const EXPENSE_CATEGORIES = new Set(["toll", "parking", "other"]);

export const riderSubmitExpense = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "กรุณาเข้าสู่ระบบใหม่");

    // สถานะไรเดอร์: ใช้เกณฑ์เดียวกับกฎ /jobs ที่แก้ใน #928 เป๊ะ — มี record
    // และไม่ถูก Suspended/Rejected. **ห้ามกลับไปเป็น allow-list
    // `approval_status === 'Active'`**: ค่านั้นไม่เคยถูกเขียนลง DB สำหรับ
    // ไรเดอร์ส่วนใหญ่ (ตอนสมัครเขียนแค่ `status` ส่วนหน้าแอดมิน derive ตอน
    // render โดยไม่เขียนกลับ) การใช้มันทำ production พังมาแล้วหนึ่งรอบ
    const riderSnap = await db.ref(`riders/${uid}`).get();
    if (!riderSnap.exists()) {
      throw new HttpsError("permission-denied", "ไม่พบบัญชีไรเดอร์");
    }
    const rider = riderSnap.val() || {};
    const standing = String(rider.approval_status ?? "");
    if (standing === "Suspended" || standing === "Rejected") {
      throw new HttpsError("permission-denied", "บัญชีถูกระงับ ติดต่อแอดมิน");
    }

    const data = (request.data || {}) as Record<string, unknown>;

    const category = String(data.category ?? "");
    if (!EXPENSE_CATEGORIES.has(category)) {
      throw new HttpsError("invalid-argument", "เลือกประเภทค่าใช้จ่าย");
    }
    const note = String(data.note ?? "").trim().slice(0, 500);
    if (category === "other" && note === "") {
      throw new HttpsError("invalid-argument", "ระบุรายละเอียดเมื่อเลือก 'อื่นๆ'");
    }

    // หลักฐานเป็นเงื่อนไขของฟีเจอร์ ไม่ใช่ของแถม: ไม่มีรูป = ส่งไม่ได้
    // และ URL ต้องอยู่ใต้โฟลเดอร์ของคนที่ยิงมาเอง — storage rules ให้ไรเดอร์
    // ทุกคนอ่านรูปของกันได้ การแนบ URL ของคนอื่นจึงทำได้ง่ายมากถ้าไม่ตรงนี้
    const rawEvidence = Array.isArray(data.evidence) ? data.evidence : [];
    const evidence = rawEvidence
      .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>).url : e))
      .filter((url) => evidenceBelongsTo(url, uid))
      .slice(0, 5)
      .map((url) => ({ url: String(url), uploaded_at: Date.now() }));
    if (evidence.length === 0) {
      throw new HttpsError("invalid-argument", "แนบรูปสลิปหรือหลักฐานอย่างน้อย 1 รูป");
    }

    // งานที่อ้างต้องเป็นของไรเดอร์คนนี้ — ไม่งั้นเบิกใส่งานคนอื่นได้ ซึ่งทำให้
    // ต้นทุนไปลงงานผิดใบและตามรอยย้อนกลับไม่ได้
    const jobId = data.job_id == null ? null : String(data.job_id);
    if (jobId) {
      const jobRiderId = (await db.ref(`jobs/${jobId}/rider_id`).get()).val();
      if (jobRiderId !== uid) {
        throw new HttpsError("permission-denied", "งานนี้ไม่ใช่งานของคุณ");
      }
    }

    const settings = resolveExpenseSettings(
      (await db.ref("settings/rider_expense").get()).val()
    );

    // ยอดรวมของงานเดียวกันที่ยังมีชีวิต — ใช้ตัดสินว่าต้องขึ้น CEO ไหม
    // query ตาม index rider_id (มีใน rules แล้ว) ไม่กวาดทั้งโหนด (กฎค่า RTDB)
    let jobTotalSoFar = 0;
    if (jobId) {
      const mine = await db
        .ref("rider_expenses")
        .orderByChild("rider_id")
        .equalTo(uid)
        .get();
      mine.forEach((child) => {
        const v = child.val() || {};
        if (v.job_id === jobId && v.status !== "rejected") {
          jobTotalSoFar += Number(v.amount_thb) || 0;
        }
        return false;
      });
    }

    const now = Date.now();
    const occurredAt = Number(data.occurred_at);
    const verdict = evaluateExpense(
      {
        amountThb: Number(data.amount_thb),
        // ไม่ส่งมา = ถือว่าจ่ายตอนนี้ (เคสปกติ: ถ่ายสลิปแล้วส่งทันที)
        occurredAt: Number.isFinite(occurredAt) ? occurredAt : now,
        jobTotalSoFar,
      },
      settings,
      now
    );
    if (!verdict.ok) {
      throw new HttpsError("failed-precondition", verdict.message || "รายการนี้ส่งไม่ได้");
    }

    // id มาจาก client เพื่อให้ offline queue ยิงซ้ำได้โดยไม่เกิดแถวซ้ำ
    // (queue ยิงซ้ำเป็นเรื่องปกติ ไม่ใช่ความผิดพลาด) — sanitize ให้เป็น key
    // ที่ RTDB รับได้ก่อนเสมอ ไม่งั้น path พังหรือแตกโหนดโดยไม่ตั้งใจ
    const rawId = String(data.id ?? "");
    const id = /^[A-Za-z0-9_-]{8,64}$/.test(rawId)
      ? rawId
      : (db.ref("rider_expenses").push().key as string);

    const rowRef = db.ref(`rider_expenses/${id}`);
    const existing = (await rowRef.get()).val();
    // ยิงซ้ำจากคิว = ตอบผลเดิม ไม่เขียนทับ (ทับแล้วรายการที่แอดมินอนุมัติไป
    // แล้วจะกลับเป็น submitted แล้วอนุมัติได้อีกรอบ = จ่ายสองครั้ง)
    const dup = duplicateDecision(existing, uid);
    if (dup === "reject_not_owner") {
      throw new HttpsError("permission-denied", "รหัสรายการนี้ถูกใช้แล้ว");
    }
    if (dup === "return_existing") {
      return { id, status: existing.status, duplicate: true };
    }

    // status ถูกตั้งเป็น submitted ข้างใน buildExpenseRow และ **ไม่มีช่องให้
    // ส่งค่าอื่นเข้ามา** — ไรเดอร์ยิง callable ตรงได้ สิ่งแรกที่จะลองส่งคือ
    // status: "approved"
    await rowRef.set(
      buildExpenseRow({
        id,
        uid,
        jobId,
        category,
        amountThb: Number(data.amount_thb),
        note,
        evidence,
        occurredAt: Number.isFinite(occurredAt) ? occurredAt : now,
        now,
        needsCeo: verdict.needsCeo,
        late: verdict.late,
      })
    );

    return { id, status: "submitted", needs_ceo: verdict.needsCeo, late: verdict.late };
  }
);

// ค่าเริ่มต้นถูก export เผื่อหน้าตั้งค่าฝั่งแอดมินอยากโชว์ว่า "ยังไม่ตั้ง = ใช้ค่านี้"
export { RIDER_EXPENSE_DEFAULTS };
