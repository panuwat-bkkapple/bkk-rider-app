import * as admin from "firebase-admin";
import { onValueCreated, onValueWritten } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";

admin.initializeApp();

const db = admin.database();
const messaging = admin.messaging();

/**
 * FCM token ของไรเดอร์ 1 ใบ
 *
 * `platform` แยกว่า token นี้มาจากไหน:
 *   - "web"  = PWA/เบราว์เซอร์ (service worker เป็นคนวาด notification)
 *   - "ios" / "android" = แอป native (Capacitor) — ระบบปฏิบัติการวาดให้จาก
 *     `notification` payload
 * token เก่าที่บันทึกไว้ก่อนมีแอป native จะไม่มีฟิลด์นี้ → ถือเป็น "web"
 * เหมือนพฤติกรรมเดิมทุกประการ
 */
interface RiderToken {
  token: string;
  platform: "web" | "ios" | "android";
}

const normalizePlatform = (value: unknown): RiderToken["platform"] =>
  value === "ios" || value === "android" ? value : "web";

// Helper: Get all FCM tokens for a rider
async function getRiderTokens(riderId: string): Promise<RiderToken[]> {
  const tokens: RiderToken[] = [];

  // Check fcm_tokens (multi-device)
  const tokensSnap = await db.ref(`riders/${riderId}/fcm_tokens`).get();
  if (tokensSnap.exists()) {
    const tokensData = tokensSnap.val();
    for (const key of Object.keys(tokensData)) {
      if (tokensData[key]?.token) {
        tokens.push({
          token: tokensData[key].token,
          platform: normalizePlatform(tokensData[key].platform),
        });
      }
    }
  }

  // Fallback: single fcm_token
  if (tokens.length === 0) {
    const tokenSnap = await db.ref(`riders/${riderId}/fcm_token`).get();
    if (tokenSnap.exists()) {
      tokens.push({ token: tokenSnap.val(), platform: "web" });
    }
  }

  return tokens;
}

// Helper: ลบ token ที่ FCM ตอบว่าใช้ไม่ได้แล้วออกจาก riders/{id}/fcm_tokens
async function pruneInvalidTokens(
  riderId: string,
  tokens: string[],
  response: admin.messaging.BatchResponse
): Promise<void> {
  if (response.failureCount === 0) return;

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

// Helper: Send notification to multiple tokens, clean up invalid ones
//
// ต้องส่งแยก 2 ก้อนเพราะ payload คนละแบบ:
//   - web  : data-only ให้ service worker วาดเอง — ถ้าใส่ `notification` ด้วย
//            iOS PWA จะเด้ง 2 อันซ้อน (auto-display + showNotification)
//   - native: ต้องมี `notification` + aps.alert ไม่งั้น iOS ไม่แสดงอะไรเลย
//            ตอนแอปอยู่เบื้องหลัง (data-only = silent push)
async function sendToRider(
  riderId: string,
  tokens: RiderToken[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (tokens.length === 0) return;

  const webTokens = tokens.filter((t) => t.platform === "web").map((t) => t.token);
  const nativeTokens = tokens.filter((t) => t.platform !== "web").map((t) => t.token);

  if (webTokens.length > 0) {
    const message: admin.messaging.MulticastMessage = {
      tokens: webTokens,
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
    await pruneInvalidTokens(riderId, webTokens, response);
  }

  if (nativeTokens.length > 0) {
    const message: admin.messaging.MulticastMessage = {
      tokens: nativeTokens,
      notification: { title, body },
      data: { ...(data || {}), title, body },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
          },
        },
      },
      android: {
        priority: "high",
        notification: { sound: "default" },
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    await pruneInvalidTokens(riderId, nativeTokens, response);
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

    // Send to each online rider
    const promises = Object.entries(riders).map(async ([riderId, riderData]: [string, any]) => {
      if (riderData.status !== "Online" && riderData.status !== "Busy") return;

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
