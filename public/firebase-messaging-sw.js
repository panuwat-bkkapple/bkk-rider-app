// Firebase Cloud Messaging Service Worker
// Handles background push notifications when the app is not in focus
//
// IMPORTANT: Replace the Firebase config below with your actual values
// from Firebase Console > Project Settings > General > Your apps

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
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
