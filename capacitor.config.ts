/// <reference types="@capacitor/status-bar" />
/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/keyboard" />
/// <reference types="@capacitor-firebase/messaging" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bkkapple.rider',
  appName: 'BKK Rider',
  // Native shell ships the same Vite bundle that Firebase Hosting serves.
  // `npm run build` must run before `npx cap sync ios`.
  webDir: 'dist',
  ios: {
    // Rider ถ่ายรูปเครื่อง/บัตรผ่าน <input type="file" capture> ตลอด — ต้องเล่น
    // media แบบ inline ไม่ให้เด้ง fullscreen player
    contentInset: 'never',
    // ปิด bounce ของ WKWebView ให้รู้สึกเหมือนแอป native
    scrollEnabled: true,
  },
  plugins: {
    // overlaysWebView: false ทำให้ native ย่อ WebView ลงมาใต้ status bar
    // (พฤติกรรมเดียวกับ PWA standalone ปัจจุบัน) — จอบนจึงไม่ต้องแก้ layout เดิม
    // ส่วนขอบล่าง (home indicator) จัดการด้วย .pb-safe ใน index.css
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT', // LIGHT = ตัวอักษรสีเข้มบนพื้นสว่าง (ธีมแอปเป็นพื้นขาว)
      backgroundColor: '#ffffff',
    },
    SplashScreen: {
      // 1500ms เป็นแค่ตัวกันเหนียว — ปกติ initNativeShell() จะสั่ง hide()
      // ทันทีที่ web view พร้อม
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    // Keyboard ใช้ค่า default ของ iOS (resize = native: ย่อ web view ทั้งจอ
    // ตอนคีย์บอร์ดขึ้น) — ฟอร์มกรอกราคา/ตรวจเครื่องจึงไม่โดนคีย์บอร์ดบัง
    FirebaseMessaging: {
      // แสดง banner ทับหน้าแอปด้วยเมื่อ push เข้ามาตอนเปิดแอปอยู่ —
      // ไรเดอร์ต้องเห็นงานใหม่แม้กำลังจ้องหน้าอื่นค้างไว้
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          // เลี่ยง SwiftPM package identity collision ของ plugin ตัวนี้
          // (capawesome-team/capacitor-firebase#959)
          '@capacitor-firebase/messaging': {
            symlink: true,
          },
        },
      },
    },
  },
};

export default config;
