// src/native/push.ts
//
// Push notification ฝั่ง iOS app (Capacitor)
//
// ต่างจากเว็บตรงที่ไม่มี service worker: FirebaseMessaging plugin ลงทะเบียน
// APNs ให้ผ่าน Firebase SDK ฝั่ง native แล้วคืน FCM token ตัวเดียวกับที่
// cloud function ใช้อยู่แล้ว — backend จึงไม่ต้องรู้จัก APNs โดยตรง
// (แต่ payload ต้องมี `notification` ดู sendToRider ใน functions/src/index.ts)
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import type { PluginListenerHandle } from '@capacitor/core';
import { onAppResume } from './index';

interface NativePushOptions {
  /** เรียกทุกครั้งที่ได้ token ใหม่ (ครั้งแรก + ตอน FCM หมุน token) */
  onToken: (token: string) => Promise<void> | void;
  /** ผู้ใช้แตะ notification ของแชท → เปิดห้องแชทของงานนั้น */
  onOpenChat?: (jobId: string) => void;
}

/**
 * ลงทะเบียน push ฝั่ง native — คืนฟังก์ชัน cleanup (ใช้ใน useEffect ได้ตรง ๆ)
 */
export const registerNativePush = ({ onToken, onOpenChat }: NativePushOptions): (() => void) => {
  let cancelled = false;
  let stopResumeListener: () => void = () => undefined;
  const listenerHandles: Promise<PluginListenerHandle>[] = [];

  const refreshToken = async () => {
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token && !cancelled) await onToken(token);
    } catch (err) {
      // เกิดได้ตอนเครื่องยังไม่ได้ APNs token (offline / เพิ่งติดตั้ง) —
      // token ที่เก็บไว้เดิมยังใช้ได้ ปล่อยให้รอบหน้าลองใหม่
      console.warn('[Push/native] getToken failed:', err);
    }
  };

  const handleNotificationData = (data: unknown) => {
    const payload = (data || {}) as { type?: string; jobId?: string };
    if (payload.type === 'chat' && payload.jobId && onOpenChat) {
      onOpenChat(payload.jobId);
    }
  };

  (async () => {
    try {
      let permission = await FirebaseMessaging.checkPermissions();
      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
        permission = await FirebaseMessaging.requestPermissions();
      }
      if (permission.receive !== 'granted') {
        console.warn('[Push/native] notification permission not granted:', permission.receive);
        return;
      }
      if (cancelled) return;

      // plugin ส่ง event แบบ retainUntilConsumed → การแตะ notification ตอนแอป
      // ปิดสนิทจะถูกเก็บไว้จนกว่า listener นี้จะติด ไม่หลุดหาย
      listenerHandles.push(
        FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
          if (token && !cancelled) void onToken(token);
        }),
      );
      listenerHandles.push(
        FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
          handleNotificationData(event.notification?.data);
        }),
      );

      await refreshToken();

      // FCM หมุน token เงียบ ๆ ได้ — เช็คซ้ำทุกครั้งที่กลับมา foreground
      // (saveToken มี dedupe 12 ชม. อยู่แล้ว จึงไม่เปลือง write)
      stopResumeListener = onAppResume(() => {
        void refreshToken();
      });
    } catch (err) {
      console.warn('[Push/native] setup failed:', err);
    }
  })();

  return () => {
    cancelled = true;
    stopResumeListener();
    listenerHandles.forEach((handle) => {
      handle.then((h) => h.remove()).catch(() => undefined);
    });
  };
};
