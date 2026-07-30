// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getFirebaseMessaging } from '../api/firebase';
import { getToken, onMessage, type Messaging } from 'firebase/messaging';
import { ref, set, get, remove } from 'firebase/database';
import { db } from '../api/firebase';
import { isNativeApp, nativePlatform } from '../native';
import { registerNativePush } from '../native/push';

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

/**
 * เขียน FCM token ลง riders/{id}/fcm_tokens/{deviceId}
 *
 * `platform` สำคัญมาก: cloud function (sendToRider ใน functions/src/index.ts)
 * ใช้ค่านี้แยกวิธีส่ง — 'web' ต้องเป็น data-only ให้ service worker วาด
 * notification เอง (ไม่งั้น iOS PWA เด้งซ้ำ 2 อัน) ส่วน 'ios' ของแอป native
 * ต้องมี notification payload ไม่งั้น iOS ไม่แสดงอะไรเลยตอนแอปปิด
 */
const saveToken = async (
  riderId: string,
  token: string,
  platform: 'web' | 'ios' | 'android',
) => {
  const deviceId = getDeviceId();
  const ua = navigator.userAgent;
  const device =
    platform !== 'web' ? platform : /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
  const path = `riders/${riderId}/fcm_tokens/${deviceId}`;

  const snap = await get(ref(db, path));
  const existing = snap.val() as { token?: string; updated_at?: number; platform?: string } | null;

  // Skip the write if token + platform + updated_at are still recent.
  if (
    existing?.token === token &&
    existing?.platform === platform &&
    existing?.updated_at &&
    Date.now() - existing.updated_at < REFRESH_INTERVAL_MS
  ) {
    return;
  }

  await set(ref(db, path), { token, device, platform, updated_at: Date.now() });
  // Drop legacy single-token field once the multi-device entry is in place;
  // the Cloud Function only falls back to it when fcm_tokens is empty.
  await remove(ref(db, `riders/${riderId}/fcm_token`));
  await set(ref(db, `riders/${riderId}/fcm_updated_at`), Date.now());
  console.log(`FCM token saved (${device}/${platform}):`, token.slice(0, 20) + '...');
};

export const usePushNotifications = (riderId: string | null, onOpenChat?: (jobId: string) => void) => {
  useEffect(() => {
    if (!riderId) return;

    // ---- iOS app (Capacitor): ใช้ APNs ผ่าน Firebase SDK ฝั่ง native ----
    // ไม่มี service worker ใน WKWebView — token มาจาก FirebaseMessaging plugin
    if (isNativeApp()) {
      return registerNativePush({
        onToken: (token) => saveToken(riderId, token, nativePlatform() === 'ios' ? 'ios' : 'android'),
        onOpenChat,
      });
    }

    // ---- เว็บ / PWA: ของเดิมทั้งหมด ----
    let messagingInstance: Messaging | null = null;
    let swRegistration: ServiceWorkerRegistration | undefined;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let visibilityHandler: (() => void) | null = null;
    let cancelled = false;

    const fetchAndSaveToken = async () => {
      if (!messagingInstance || cancelled) return;
      try {
        const token = await getToken(messagingInstance, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined,
          serviceWorkerRegistration: swRegistration,
        });
        if (token && !cancelled) {
          await saveToken(riderId, token, 'web');
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

        onMessage(messaging, (payload) => {
          const data = payload.data;
          if (payload.notification) {
            const notification = new Notification(payload.notification.title || 'BKK Rider', {
              body: payload.notification.body,
              icon: '/android-chrome-192x192.png',
              data,
            });
            if (data?.type === 'chat' && data?.jobId && onOpenChat) {
              notification.onclick = () => {
                window.focus();
                onOpenChat(data.jobId);
                notification.close();
              };
            }
          }
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
