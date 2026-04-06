// src/utils/notifications.ts
import { ref, push, set } from 'firebase/database';
import { db, auth } from '../api/firebase';

export const sendAdminNotification = async (title: string, message: string) => {
  try {
    // Only send if user is authenticated
    if (!auth.currentUser) {
      console.warn('Cannot send notification: user not authenticated');
      return;
    }

    const notiRef = ref(db, 'notifications');
    const newNotiRef = push(notiRef);
    await set(newNotiRef, {
      title,
      message,
      timestamp: Date.now(),
      read: false,
      sender_uid: auth.currentUser.uid
    });
  } catch (error) {
    console.error("Notification Error:", error);
  }
};