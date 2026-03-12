// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getFirebaseMessaging } from '../api/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { ref, update } from 'firebase/database';
import { db } from '../api/firebase';

export const usePushNotifications = (riderId: string | null) => {
  useEffect(() => {
    if (!riderId) return;

    const setupPush = async () => {
      try {
        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Get FCM token
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined
        });

        if (token) {
          // Save token to rider's profile
          await update(ref(db, `riders/${riderId}`), {
            fcm_token: token,
            fcm_updated_at: Date.now()
          });
        }

        // Handle foreground messages
        onMessage(messaging, (payload) => {
          if (payload.notification) {
            new Notification(payload.notification.title || 'BKK Rider', {
              body: payload.notification.body,
              icon: '/manifest-icon-192.maskable.png'
            });
          }
        });
      } catch (error) {
        // FCM not supported or permission denied - fail silently
        console.warn('Push notifications not available:', error);
      }
    };

    setupPush();
  }, [riderId]);
};
