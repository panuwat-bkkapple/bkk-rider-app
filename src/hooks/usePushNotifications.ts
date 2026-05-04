// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getFirebaseMessaging } from '../api/firebase';
import { getToken, onMessage, type Messaging } from 'firebase/messaging';
import { ref, set, get, remove } from 'firebase/database';
import { db } from '../api/firebase';

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
          // Permission revoked or SW issue — drop the stored token so Cloud
          // Functions stop trying to push to a device that can't receive.
          const deviceId = getDeviceId();
          await remove(ref(db, `riders/${riderId}/fcm_tokens/${deviceId}`));
          console.warn('[Push] getToken returned empty; removed stored token');
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
              icon: '/manifest-icon-192.maskable.png',
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
