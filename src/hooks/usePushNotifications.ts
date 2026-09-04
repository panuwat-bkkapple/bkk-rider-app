// src/hooks/usePushNotifications.ts
//
// เส้นทาง push ฝั่งเครื่องไรเดอร์: Service Worker → permission → FCM token →
// riders/{id}/fcm_tokens/{deviceId} — และรายงานทุกขั้นลง pushHealth store ให้
// การ์ดสถานะ (PushStatusCard) แสดง/ซ่อมได้
//
// สิ่งที่เปลี่ยนจากของเดิม (รายงานสำรวจ docs/reports/2026-09-03-rider-push-delivery-survey.md ข้อ B, G):
//
//   1. **Service Worker ถูก register ตั้งแต่เปิดแอป ไม่ขึ้นกับ permission และไม่
//      ขึ้นกับการล็อกอิน** — เดิมอยู่ใต้ `requestPermission()` จึงไม่ได้ permission
//      = ไม่มี SW = ไม่มีทั้ง push เบื้องหลังและแคชออฟไลน์
//   2. **ไม่เรียก `Notification.requestPermission()` อัตโนมัติอีก** — บน iOS
//      คำขอที่ไม่ได้มาจากการแตะของผู้ใช้ถูกปฏิเสธเงียบๆ (แอปแอดมินเขียนกันไว้ที่
//      useAdminPushNotifications ว่า "re-asks on iOS and is fragile") ตอนนี้ขอ
//      ก็ต่อเมื่อไรเดอร์กดปุ่มบนการ์ด (`enable`) ส่วน permission ที่ได้แล้ว
//      เดินต่ออัตโนมัติเหมือนเดิม. ข้อแลกเปลี่ยน: Android ที่เดิมได้ prompt เอง
//      ตอนเปิดแอป ตอนนี้ต้องแตะการ์ดหนึ่งครั้ง
//   3. `navigator.serviceWorker.ready` มีเพดานเวลา — เดิมแขวนได้ไม่จำกัดโดยไม่มี
//      error (ตระกูลเดียวกับบั๊ก IndexedDB ที่ #141 แก้)
//   4. ทุกความล้มเหลวไปโผล่ที่การ์ด ไม่ใช่แค่ console.warn
import { useEffect } from 'react';
import { getFirebaseMessaging } from '../api/firebase';
import { getToken, onMessage, type Messaging } from 'firebase/messaging';
import { ref, set, get, remove } from 'firebase/database';
import { db } from '../api/firebase';
import { toast } from '../components/common/Toast';
import { alertLine, foregroundAlert } from '../utils/pushDisplay';
import { registerPushActions, setPushHealth, type PushPermission } from '../utils/pushHealth';

// Stable per-device identifier so token refreshes overwrite the same DB entry
// instead of creating new ones. Without this each Service Worker reinstall left
// the old token entry behind and rider received duplicate push per job.
const getDeviceId = (): string => {
  const KEY = 'bkk_rider_fcm_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 20);
    localStorage.setItem(KEY, id);
  }
  return id;
};

// FCM tokens on iOS PWA can silently expire after weeks/months. Re-validate on
// visibility change (cheap) and every 12h while the app stays open.
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

// `serviceWorker.ready` ไม่มี timeout ในตัว — registration ที่ค้างสภาพแปลกๆ ทำให้
// มันไม่ resolve และไม่ reject ตลอดกาล
const SW_READY_TIMEOUT_MS = 10_000;

const SW_URL = '/firebase-messaging-sw.js';

const readPermission = (): PushPermission =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

/** register SW แล้วรอจน active — คืน registration หรือ undefined ถ้าทำไม่ได้ */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  const reg = await navigator.serviceWorker.register(SW_URL);
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
  ]);
  if (!ready) {
    console.warn('[Push] serviceWorker.ready timed out; continuing with registration');
    return reg;
  }
  return ready;
}

export const usePushNotifications = (riderId: string | null, onOpenChat?: (jobId: string) => void) => {
  // (1) SW ก่อนทุกอย่าง — ครั้งเดียวต่อการเปิดแอป ไม่ขึ้นกับ riderId/permission
  useEffect(() => {
    let cancelled = false;
    setPushHealth({ permission: readPermission(), supported: typeof Notification !== 'undefined' });
    ensureServiceWorker()
      .then((reg) => {
        if (!cancelled) setPushHealth({ swActive: !!reg?.active });
      })
      .catch((err) => {
        console.warn('[Push] SW register failed:', err);
        if (!cancelled) setPushHealth({ swActive: false, lastError: 'ติดตั้งตัวรับการแจ้งเตือนไม่สำเร็จ' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // (2) token ต่อบัญชี
  useEffect(() => {
    if (!riderId) {
      registerPushActions(null);
      return;
    }

    let messagingInstance: Messaging | null = null;
    let swRegistration: ServiceWorkerRegistration | undefined;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let visibilityHandler: (() => void) | null = null;
    let unsubscribeMessage: (() => void) | null = null;
    let cancelled = false;

    const saveToken = async (token: string, force: boolean) => {
      const deviceId = getDeviceId();
      const ua = navigator.userAgent;
      const device = /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
      const path = `riders/${riderId}/fcm_tokens/${deviceId}`;

      const snap = await get(ref(db, path));
      const existing = snap.val() as { token?: string; updated_at?: number } | null;

      // Skip the write if token + updated_at are still recent (ไรเดอร์กด "ลองใหม่"
      // = force เขียนเสมอ เพราะเขากำลังบอกว่ามันไม่ทำงาน)
      if (
        !force &&
        existing?.token === token &&
        existing?.updated_at &&
        Date.now() - existing.updated_at < REFRESH_INTERVAL_MS
      ) {
        setPushHealth({ tokenSavedAt: existing.updated_at, lastError: null });
        return;
      }

      const now = Date.now();
      await set(ref(db, path), { token, device, updated_at: now });
      // Drop legacy single-token field once the multi-device entry is in place;
      // the Cloud Function only falls back to it when fcm_tokens is empty.
      await remove(ref(db, `riders/${riderId}/fcm_token`));
      await set(ref(db, `riders/${riderId}/fcm_updated_at`), now);
      setPushHealth({ tokenSavedAt: now, lastError: null });
      console.log(`FCM token saved (${device}):`, token.slice(0, 20) + '...');
    };

    /** ดึง token แล้วเขียน — เรียกได้เฉพาะเมื่อ permission เป็น granted แล้ว */
    const fetchAndSaveToken = async (force = false) => {
      if (cancelled) return;
      if (readPermission() !== 'granted') return;
      setPushHealth({ busy: true });
      try {
        if (!swRegistration) swRegistration = await ensureServiceWorker();
        setPushHealth({ swActive: !!swRegistration?.active });
        if (!messagingInstance) {
          const messaging = await getFirebaseMessaging();
          if (!messaging) {
            setPushHealth({ supported: false, permission: 'unsupported' });
            return;
          }
          messagingInstance = messaging;
          attachForeground(messaging);
        }
        const token = await getToken(messagingInstance, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined,
          serviceWorkerRegistration: swRegistration,
        });
        if (cancelled) return;
        if (token) {
          await saveToken(token, force);
        } else {
          // getToken() can return null for transient reasons (SW not yet
          // activated, FCM endpoint hiccup). Don't delete the stored token —
          // the Cloud Function (pushToRider) already prunes tokens that FCM
          // rejects with token-not-registered. Just log and retry next cycle.
          console.warn('[Push] getToken returned empty; keeping stored token, will retry');
          setPushHealth({ lastError: 'ยังขอรหัสรับการแจ้งเตือนไม่ได้ ระบบจะลองใหม่เอง' });
        }
      } catch (err) {
        console.warn('[Push] Failed to fetch FCM token:', err);
        const code = (err as { code?: string })?.code || '';
        setPushHealth({
          lastError: code === 'PERMISSION_DENIED'
            ? 'บัญชีไม่มีสิทธิ์บันทึก — ลองออกจากระบบแล้วเข้าใหม่'
            : 'ลงทะเบียนเครื่องไม่สำเร็จ ลองอีกครั้งเมื่อมีสัญญาณ',
        });
      } finally {
        if (!cancelled) setPushHealth({ busy: false });
      }
    };

    /** ปุ่ม "เปิดการแจ้งเตือน" — ต้องถูกเรียกจาก click handler เท่านั้น
     *  (iOS ปฏิเสธ requestPermission ที่ไม่ได้มาจาก user gesture) */
    const enable = async () => {
      if (typeof Notification === 'undefined') {
        setPushHealth({ supported: false, permission: 'unsupported' });
        return;
      }
      setPushHealth({ busy: true, lastError: null });
      try {
        const result = await Notification.requestPermission();
        setPushHealth({ permission: result });
        if (result === 'granted') await fetchAndSaveToken(true);
      } catch (err) {
        console.warn('[Push] requestPermission failed:', err);
        setPushHealth({ permission: readPermission(), lastError: 'ขออนุญาตไม่สำเร็จ ลองกดอีกครั้ง' });
      } finally {
        if (!cancelled) setPushHealth({ busy: false });
      }
    };

    const attachForeground = (messaging: Messaging) => {
      // แอปที่เปิดค้างอยู่ต้องแสดงเอง — SW ไม่ช่วย
      //
      // SDK (`@firebase/messaging@0.12.12`, `onPush` ใน `dist/index.sw.cjs`)
      // ทำแบบนี้: **ถ้ามี client ที่ visible อยู่ ให้ส่ง payload เข้าหน้าเว็บ
      // แล้ว return ทันที** ไม่ว่าข้อความจะมี `notification` หรือไม่ก็ตาม
      // เมื่อแอปเปิดอยู่จึงไม่มีใครแสดงให้นอกจากคอลแบ็กนี้ (#149)
      unsubscribeMessage = onMessage(messaging, (payload) => {
        const alert = foregroundAlert(payload);
        if (!alert) return;

        // (1) แจ้งในแอปเสมอ — ทางเดียวที่การันตีว่าคนที่จ้องจออยู่เห็น
        toast.info(alertLine(alert));

        // (2) แล้วยิง notification จริงผ่าน registration ของ SW
        //     **ห้ามกลับไปใช้ `new Notification()`** — WebKit ไม่รองรับ
        //     constructor นั้นในเว็บแอปบน iOS. การกดใบนี้ถูกจัดการโดย
        //     `notificationclick` ใน SW อยู่แล้ว จึงไม่ผูก onclick เอง
        void (async () => {
          try {
            const reg = swRegistration || (await navigator.serviceWorker?.getRegistration());
            await reg?.showNotification(alert.title, {
              body: alert.body,
              icon: '/android-chrome-192x192.png',
              badge: '/android-chrome-192x192.png',
              tag: alert.tag,
              data: alert.data,
            });
          } catch (err) {
            console.warn('[Push] foreground showNotification failed:', err);
          }
        })();
      });
    };

    registerPushActions({ enable, refresh: () => fetchAndSaveToken(true) });

    // permission ที่ได้แล้วเดินต่ออัตโนมัติ — ที่เหลือรอไรเดอร์กดปุ่มบนการ์ด
    setPushHealth({ permission: readPermission() });
    void fetchAndSaveToken(false);

    intervalId = setInterval(() => void fetchAndSaveToken(false), REFRESH_INTERVAL_MS);

    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // permission เปลี่ยนได้ระหว่างที่แอปอยู่เบื้องหลัง (ไปเปิดในตั้งค่าเครื่อง)
        setPushHealth({ permission: readPermission() });
        void fetchAndSaveToken(false);
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CHAT' && event.data?.jobId && onOpenChat) {
        onOpenChat(event.data.jobId);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    return () => {
      cancelled = true;
      registerPushActions(null);
      if (intervalId) clearInterval(intervalId);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      if (unsubscribeMessage) unsubscribeMessage();
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, [riderId, onOpenChat]);
};
