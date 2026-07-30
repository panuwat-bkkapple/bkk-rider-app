// src/native/index.ts
//
// จุดรวมของ "เปลือก native" (Capacitor) — โค้ดแอปส่วนที่เหลือควรอ้าง
// helper ในไฟล์นี้แทนการ import @capacitor/* กระจายทั่ว repo
//
// แอปนี้รันได้ 2 แบบจาก bundle ก้อนเดียวกัน:
//   1. เว็บ/PWA บน Firebase Hosting (เหมือนเดิมทุกอย่าง)
//   2. iOS app (Capacitor + WKWebView) โหลด bundle เดียวกันจากในเครื่อง
// ทุก helper จึงต้อง no-op อย่างปลอดภัยเมื่อรันบนเว็บ
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

/** true เมื่อรันในเปลือก native (iOS app) — false บนเว็บ/PWA */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** 'ios' | 'android' | 'web' */
export const nativePlatform = (): string => Capacitor.getPlatform();

export const isIosApp = (): boolean => isNativeApp() && nativePlatform() === 'ios';

/**
 * เตรียมเปลือก native ก่อน React mount — เรียกครั้งเดียวจาก main.tsx
 *
 * - ติด class บน <html> ให้ CSS แยกกรณี native ได้ (ดู .pb-safe ใน index.css)
 * - เปิด viewport-fit=cover เฉพาะ native เพื่อให้ env(safe-area-inset-*) มีค่าจริง
 *   (ห้ามใส่ใน index.html เพราะจะทำให้ PWA เดิมไหลไปใต้ status bar)
 * - ซ่อน splash หลัง web view พร้อม
 */
export const initNativeShell = async (): Promise<void> => {
  if (!isNativeApp()) return;

  document.documentElement.classList.add('cap-native');
  document.documentElement.classList.add(`cap-${nativePlatform()}`);

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    );
  }

  try {
    // พื้นหลังแอปเป็นสีขาว → ต้องใช้ตัวอักษรสีเข้ม (Style.Light)
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* status bar ปรับไม่ได้บนบางเครื่อง — ไม่ใช่เรื่องคอขาดบาดตาย */
  }

  try {
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
};

/**
 * เรียก callback ทุกครั้งที่แอปกลับมา foreground
 * คืน unsubscribe function (no-op บนเว็บ)
 */
export const onAppResume = (callback: () => void): (() => void) => {
  if (!isNativeApp()) return () => undefined;

  const handle = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) callback();
  });

  return () => {
    handle.then((h) => h.remove()).catch(() => undefined);
  };
};
