// Firebase Cloud Messaging Service Worker
// Handles background push notifications and offline caching
//
// Placeholders below are replaced by Vite build plugin (firebaseSWPlugin)
// with actual values from VITE_FIREBASE_* environment variables.

// --- Offline Caching ---
const CACHE_NAME = 'bkk-rider-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/manifest-icon-192.maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests for same-origin static assets
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML, cache-first for assets
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
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
    icon: '/manifest-icon-192.maskable.png',
    badge: '/manifest-icon-192.maskable.png',
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
