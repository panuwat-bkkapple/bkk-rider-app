// src/utils/notifications.ts (หรือโฟลเดอร์ที่คุณเก็บไว้)
import { ref, push, set } from 'firebase/database';
import { db } from '../api/firebase'; // 🌟 อย่าลืมเช็ค Path ให้ตรงกับไฟล์ firebase ของคุณนะครับ

// 🌟 เพิ่มคำว่า export ด้านหน้า
export const sendAdminNotification = async (title: string, message: string) => {
  try {
    const notiRef = ref(db, 'notifications');
    const newNotiRef = push(notiRef); // สร้าง ID ใหม่สุ่มๆ
    await set(newNotiRef, {
      title: title,
      message: message,
      timestamp: Date.now(),
      read: false // ค่าเริ่มต้นคือ แอดมินยังไม่ได้อ่าน
    });
  } catch (error) {
    console.error("Notification Error:", error);
  }
};