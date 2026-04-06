// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getFirebaseMessaging } from '../api/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { ref, set } from 'firebase/database';
import { db } from '../api/firebase';

export const usePushNotifications = (riderId: string | null, onOpenChat?: (jobId: string) => void) => {
  useEffect(() => {
    if (!riderId) return;

    const setupPush = async () => {
      try {
        // Request permission first
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('Notification permission denied');
          return;
        }

        // Register service worker explicitly (required for iOS PWA)
        let swRegistration: ServiceWorkerRegistration | undefined;
        if ('serviceWorker' in navigator) {
          swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          // Wait for the service worker to be ready
          await navigator.serviceWorker.ready;
        }

        const messaging = await getFirebaseMessaging();
        if (!messaging) {
          console.warn('Firebase Messaging not supported');
          return;
        }

        // Get FCM token with explicit SW registration
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined,
          serviceWorkerRegistration: swRegistration
        });

        if (token) {
          // Save token per device using a hash to support multiple devices
          const tokenKey = btoa(token).slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
          const ua = navigator.userAgent;
          const device = /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';

          await set(ref(db, `riders/${riderId}/fcm_tokens/${tokenKey}`), {
            token,
            device,
            updated_at: Date.now()
          });

          // Also keep single token for backward compatibility
          await set(ref(db, `riders/${riderId}/fcm_token`), token);
          await set(ref(db, `riders/${riderId}/fcm_updated_at`), Date.now());

          console.log(`FCM token registered (${device}):`, token.slice(0, 20) + '...');
        }

        // Handle foreground messages
        onMessage(messaging, (payload) => {
          const data = payload.data;
          if (payload.notification) {
            const notification = new Notification(payload.notification.title || 'BKK Rider', {
              body: payload.notification.body,
              icon: '/manifest-icon-192.maskable.png',
              data
            });
            // Open chat when tapping foreground notification
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

    // Listen for postMessage from service worker (background notification tap)
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CHAT' && event.data?.jobId && onOpenChat) {
        onOpenChat(event.data.jobId);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, [riderId, onOpenChat]);
};
