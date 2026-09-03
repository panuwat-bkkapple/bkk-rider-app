// Firebase Cloud Messaging Service Worker
// Handles background push notifications and offline caching
//
// Placeholders below are replaced by Vite build plugin (firebaseSWPlugin)
// with actual values from VITE_FIREBASE_* environment variables.

// --- Offline Caching ---
// Bump CACHE_NAME whenever STATIC_ASSETS or critical SW logic changes — the
// previous v1 listed /manifest-icon-192.maskable.png which never existed in
// public/, so cache.addAll() rejected (atomic) and the install event failed,
// leaving no active SW to receive background push.
const CACHE_NAME = 'bkk-rider-v4';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/android-chrome-192x192.png',
];

// สำเนา index.html ที่ใช้ตอนออฟไลน์ — เก็บไว้ที่คีย์เดียวคือ '/'
//
// เดิมค่านี้ถูกเขียนครั้งเดียวตอน install ของ CACHE_NAME แต่ละรุ่น แล้วไม่เคย
// ถูกเขียนทับอีกเลย (เส้น document เป็น network-first จึงไม่เคย cache.put)
// ผลคือ fallback ออฟไลน์เสิร์ฟ index.html ของวันที่ SW รุ่นนั้นติดตั้ง ซึ่งชี้
// ไปยัง /assets/index-<hash เก่า>.js — โค้ด auth ทั้งก้อนย้อนกลับไปเป็น
// เวอร์ชันนั้นได้ไม่จำกัดเวลา (ดูรายงานสำรวจ 3 ก.ย. 2569 ข้อ 5)
//
// ตอนนี้รีเฟรชสองจังหวะ: ตอน activate และทุกครั้งที่ navigation สำเร็จ
const OFFLINE_DOC_KEY = '/';

async function cacheOfflineDoc(response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_DOC_KEY, response);
  } catch (err) {
    console.warn('[SW] Failed to refresh offline document:', err?.message || err);
  }
}

self.addEventListener('install', (event) => {
  // cache.addAll is atomic — a single 404 rejects the whole promise, the
  // install event fails, and no SW activates to receive background push
  // (the v1 regression above). Add each asset individually with .catch so a
  // missing file only loses its own caching, not the entire install. Mirrors
  // the hardening already applied to the bkk-system admin SW.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to cache ${url}, continuing:`, err?.message || err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));

      // ดึง index.html สดมาทับสำเนาออฟไลน์ทันทีที่ SW รุ่นนี้เข้าคุม —
      // ถ้าไม่ทำ ตัวที่ค้างอยู่คือ snapshot ตอน install ซึ่งเก่าได้ไม่จำกัด
      // cache: 'reload' เพื่อข้าม HTTP cache ของเบราว์เซอร์ ไม่งั้นอาจได้
      // สำเนาเก่าจากชั้นนั้นมาแทน
      try {
        const fresh = await fetch(OFFLINE_DOC_KEY, { cache: 'reload' });
        await cacheOfflineDoc(fresh.clone());
      } catch (err) {
        // ออฟไลน์ตอน activate = เก็บของเดิมไว้ก่อน ดีกว่าไม่มีอะไรเลย
        console.warn('[SW] activate could not refresh offline document:', err?.message || err);
      }
    })()
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests for same-origin static assets
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations, cache-first for hashed assets
  //
  // เทียบ request.mode === 'navigate' ด้วย ไม่ใช่ destination อย่างเดียว —
  // destination เป็น '' ในบางเบราว์เซอร์/บางเส้นทาง แล้ว navigation จะร่วงลงไป
  // ไม่เข้ากิ่งไหนเลย
  const isNavigation =
    event.request.mode === 'navigate' || event.request.destination === 'document';

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(event.request);
          // ทุก navigation ที่สำเร็จรีเฟรชสำเนาออฟไลน์ไปด้วย — สำเนาจึงตามหลัง
          // ของจริงไม่เกินหนึ่งครั้งที่เปิดแอปแบบออนไลน์ ไม่ใช่หลายเดือน
          if (fresh && fresh.ok) void cacheOfflineDoc(fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(OFFLINE_DOC_KEY);
          if (cached) return cached;
          // ไม่มีสำเนาเลย (ยังไม่เคยออนไลน์หลังติดตั้ง) — ปล่อยให้เบราว์เซอร์
          // แสดงหน้า offline ของตัวเอง ดีกว่าคืน Response ว่างที่อ่านไม่ออก
          throw new Error('offline and no cached document');
        }
      })()
    );
  } else if (['script', 'style', 'image', 'font'].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      )
    );
  }
});

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  storageBucket: '__FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Cloud Functions send data-only messages (no top-level `notification`)
  // so iOS PWA does not auto-display a duplicate alongside this handler.
  const data = payload.data || {};
  const notificationTitle = data.title || 'BKK Rider';
  const notificationOptions = {
    body: data.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    tag: data.jobId ? `${data.type || 'rider'}-${data.jobId}` : 'bkk-rider',
    data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click - open chat if it's a chat notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Build target URL with chat param if it's a chat notification
      const targetUrl = data.type === 'chat' && data.jobId
        ? '/?openChat=' + encodeURIComponent(data.jobId)
        : '/';

      if (clientList.length > 0) {
        const client = clientList[0];
        // Send message to the app to open chat
        if (data.type === 'chat' && data.jobId) {
          client.postMessage({ type: 'OPEN_CHAT', jobId: data.jobId });
        }
        return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
