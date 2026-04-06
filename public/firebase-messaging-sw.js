// Firebase Cloud Messaging Service Worker
// Handles background push notifications when the app is not in focus
//
// Placeholders below are replaced by Vite build plugin (firebaseSWPlugin)
// with actual values from VITE_FIREBASE_* environment variables.

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
  const notificationTitle = payload.notification?.title || 'BKK Rider';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/manifest-icon-192.maskable.png',
    badge: '/manifest-icon-192.maskable.png',
    data: payload.data
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
