import * as admin from "firebase-admin";
import { onValueWritten } from "firebase-functions/v2/database";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

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

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    data: data || {},
    webpush: {
      notification: {
        icon: "/manifest-icon-192.maskable.png",
        badge: "/manifest-icon-192.maskable.png",
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

    switch (after) {
      case "Assigned":
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

      case "Cancelled":
        title = "❌ งานถูกยกเลิก";
        body = `${deviceName} - ${job.cancel_reason || ""}`;
        break;

      default:
        // Don't send notification for other status changes
        return;
    }

    await sendToRider(riderId, tokens, title, body, {
      type: "job_status",
      jobId,
      status: after,
    });
  }
);

// Helper: Get all admin FCM tokens
async function getAllAdminTokens(): Promise<{ tokens: string[]; tokenPaths: string[] }> {
  const tokens: string[] = [];
  const tokenPaths: string[] = [];

  const adminTokensSnap = await db.ref("admin_fcm_tokens").get();
  if (!adminTokensSnap.exists()) return { tokens, tokenPaths };

  const allAdmins = adminTokensSnap.val();
  for (const staffId of Object.keys(allAdmins)) {
    const staffTokens = allAdmins[staffId];
    for (const key of Object.keys(staffTokens)) {
      if (staffTokens[key]?.token) {
        tokens.push(staffTokens[key].token);
        tokenPaths.push(`admin_fcm_tokens/${staffId}/${key}`);
      }
    }
  }

  return { tokens, tokenPaths };
}

// Helper: Send notification to admin tokens, clean up invalid ones
async function sendToAdmins(
  tokens: string[],
  tokenPaths: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (tokens.length === 0) return;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    data: data || {},
    webpush: {
      notification: {
        icon: "/vite.svg",
      },
    },
  };

  const response = await messaging.sendEachForMulticast(message);

  // Clean up invalid tokens
  if (response.failureCount > 0) {
    const updates: Record<string, null> = {};
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          updates[tokenPaths[idx]] = null;
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }
  }
}

// ============================================================
// 2. Chat Notification - HTTP endpoint called by client apps
// POST /notifyChatMessage { jobId, sender, senderName, text }
// Notifies rider (from admin/customer) AND admins (from rider/customer)
// ============================================================
export const notifyChatMessage = onRequest(
  { region: "asia-southeast1", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const { jobId, sender, senderName, text, imageUrl } = req.body;

    logger.info("notifyChatMessage called", { jobId, sender, senderName });

    if (!jobId || !sender) {
      res.status(400).json({ error: "jobId and sender are required" });
      return;
    }

    const jobSnap = await db.ref(`jobs/${jobId}`).get();
    if (!jobSnap.exists()) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const job = jobSnap.val();

    const displayName = senderName || (sender === "Customer" ? "ลูกค้า" : sender === "rider" ? "ไรเดอร์" : "แอดมิน");
    const isImage = !!imageUrl;
    const bodyText = isImage ? "📷 ส่งรูปภาพ" : (text || "ข้อความใหม่");
    const modelName = job.model || job.devices?.[0]?.model || "";

    const results: string[] = [];

    // 1. Notify rider (if sender is NOT rider)
    if (sender !== "rider") {
      const riderId = job.rider_id;
      if (riderId) {
        const tokens = await getRiderTokens(riderId);
        if (tokens.length > 0) {
          await sendToRider(riderId, tokens, `💬 ${displayName}`, bodyText, {
            type: "chat",
            jobId,
          });
          results.push(`rider:${tokens.length}`);
        }
      }
    }

    // 2. Notify admins (if sender is NOT admin)
    if (sender !== "Admin" && sender !== "admin") {
      const { tokens, tokenPaths } = await getAllAdminTokens();
      if (tokens.length > 0) {
        await sendToAdmins(
          tokens,
          tokenPaths,
          `💬 ${displayName} (${modelName || jobId.slice(-4)})`,
          bodyText,
          { type: "chat", jobId }
        );
        results.push(`admins:${tokens.length}`);
      }
    }

    logger.info("Chat notification sent!", { results });
    res.status(200).json({ success: true, notified: results });
  }
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

    // Only trigger for Active Leads (broadcast)
    if (after !== "Active Leads" || before === after) return;

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
