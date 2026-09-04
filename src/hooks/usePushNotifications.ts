// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getFirebaseMessaging } from '../api/firebase';
import { getToken, onMessage, type Messaging } from 'firebase/messaging';
import { ref, set, get, remove } from 'firebase/database';
import { db } from '../api/firebase';
import { toast } from '../components/common/Toast';
import { alertLine, foregroundAlert } from '../utils/pushDisplay';

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

export const usePushNotifications = (riderId: string | null, onOpenChat?: (jobId: string) => void) => {
  useEffect(() => {
    if (!riderId) return;

    let messagingInstance: Messaging | null = null;
    let swRegistration: ServiceWorkerRegistration | undefined;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let visibilityHandler: (() => void) | null = null;
    let cancelled = false;

    const saveToken = async (token: string) => {
      const deviceId = getDeviceId();
      const ua = navigator.userAgent;
      const device = /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
      const path = `riders/${riderId}/fcm_tokens/${deviceId}`;

      const snap = await get(ref(db, path));
      const existing = snap.val() as { token?: string; updated_at?: number } | null;

      // Skip the write if token + updated_at are still recent.
      if (
        existing?.token === token &&
        existing?.updated_at &&
        Date.now() - existing.updated_at < REFRESH_INTERVAL_MS
      ) {
        return;
      }

      await set(ref(db, path), { token, device, updated_at: Date.now() });
      // Drop legacy single-token field once the multi-device entry is in place;
      // the Cloud Function only falls back to it when fcm_tokens is empty.
      await remove(ref(db, `riders/${riderId}/fcm_token`));
      await set(ref(db, `riders/${riderId}/fcm_updated_at`), Date.now());
      console.log(`FCM token saved (${device}):`, token.slice(0, 20) + '...');
    };

    const fetchAndSaveToken = async () => {
      if (!messagingInstance || cancelled) return;
      try {
        const token = await getToken(messagingInstance, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined,
          serviceWorkerRegistration: swRegistration,
        });
        if (token && !cancelled) {
          await saveToken(token);
        } else if (!token) {
          // getToken() can return null for transient reasons (SW not yet
          // activated, FCM endpoint hiccup). Don't delete the stored token —
          // the Cloud Function (pushToRider) already prunes tokens that FCM
          // rejects with token-not-registered. Just log and retry next cycle.
          console.warn('[Push] getToken returned empty; keeping stored token, will retry');
        }
      } catch (err) {
        console.warn('[Push] Failed to fetch FCM token:', err);
      }
    };

    const setupPush = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('Notification permission denied');
          return;
        }

        if ('serviceWorker' in navigator) {
          swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          await navigator.serviceWorker.ready;
        }

        const messaging = await getFirebaseMessaging();
        if (!messaging) {
          console.warn('Firebase Messaging not supported');
          return;
        }
        messagingInstance = messaging;

        await fetchAndSaveToken();

        intervalId = setInterval(fetchAndSaveToken, REFRESH_INTERVAL_MS);

        visibilityHandler = () => {
          if (document.visibilityState === 'visible') {
            fetchAndSaveToken();
          }
        };
        document.addEventListener('visibilitychange', visibilityHandler);

        // แอปที่เปิดค้างอยู่ต้องแสดงเอง — SW ไม่ช่วย
        //
        // SDK (`@firebase/messaging@0.12.12`, `onPush` ใน `dist/index.sw.cjs`)
        // ทำแบบนี้: **ถ้ามี client ที่ visible อยู่ ให้ส่ง payload เข้าหน้าเว็บ
        // แล้ว return ทันที** ไม่ว่าข้อความจะมี `notification` หรือไม่ก็ตาม
        // เมื่อแอปเปิดอยู่จึงไม่มีใครแสดงให้นอกจากคอลแบ็กนี้
        //
        // ของเดิมขึ้นต้นด้วย `if (payload.notification)` ซึ่งกลายเป็นกิ่งที่ไม่มี
        // วันเข้าตั้งแต่ฝั่ง functions เปลี่ยนไปส่ง data-only เพื่อกัน iOS เด้งซ้ำ
        // → งานใหม่ · broadcast · แชท **เงียบสนิทเมื่อแอปเปิดอยู่** ซึ่งคือสภาพ
        // ของไรเดอร์ที่กำลังนั่งรองานพอดี (ดูรายงานสำรวจ 3 ก.ย. 2569 ข้อ A)
        onMessage(messaging, (payload) => {
          const alert = foregroundAlert(payload);
          if (!alert) return;

          // (1) แจ้งในแอปเสมอ — ทางเดียวที่การันตีว่าคนที่จ้องจออยู่เห็น
          //     ระบบปฏิบัติการอาจกลืน notification ของแอปที่กำลังเปิดอยู่ได้
          //     ถ้าพึ่ง (2) อย่างเดียวก็เท่ากับเดิมพันกับพฤติกรรมที่คุมไม่ได้
          toast.info(alertLine(alert));

          // (2) แล้วยิง notification จริงผ่าน registration ของ SW
          //     **ห้ามกลับไปใช้ `new Notification()`** — WebKit ไม่รองรับ
          //     constructor นั้นในเว็บแอปบน iOS ซึ่งเป็นแพลตฟอร์มที่ไรเดอร์ใช้
          //     ของเดิมจึงแสดงไม่ได้อยู่ดีแม้จะเข้ากิ่งถูก
          //     การกดใบนี้ถูกจัดการโดย `notificationclick` ใน SW อยู่แล้ว
          //     (โพสต์ OPEN_CHAT กลับมาที่ handleSWMessage ข้างล่าง) จึงไม่ผูก
          //     onclick เอง — ผูกเองแปลว่ามีกฎการเปิดแชทสองสำเนา
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
      } catch (error) {
        console.warn('Push notifications not available:', error);
      }
    };

    setupPush();

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CHAT' && event.data?.jobId && onOpenChat) {
        onOpenChat(event.data.jobId);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSWMessage);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, [riderId, onOpenChat]);
};
