// src/hooks/useDatabase.ts
import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../api/firebase';
import { isPermissionDenied, notifySessionLost } from '../utils/sessionState';

export const useDatabase = (path: string) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // 'auth' = อ่านไม่ได้เพราะหมดสิทธิ์ ไม่ใช่เพราะไม่มีข้อมูล
  const [error, setError] = useState<'auth' | 'unknown' | null>(null);

  useEffect(() => {
    const dbRef = ref(db, path);
    const unsubscribe = onValue(dbRef, (snapshot) => {
      const val = snapshot.val();
      if (val && typeof val === 'object') {
        // แปลง Object จาก Firebase เป็น Array พร้อมใส่ ID
        const list = Object.entries(val).map(([id, data]: [string, any]) => ({
          id,
          ...(typeof data === 'object' && data !== null ? data : { value: data }),
        }));
        setData(list);
      } else {
        setData([]);
      }
      setError(null);
      setLoading(false);
    }, (error) => {
      console.error(`useDatabase error on "${path}":`, error.message);
      setLoading(false);

      // PERMISSION_DENIED เกือบทั้งหมดแปลว่า token ตายหรือถูกเพิกถอน
      //
      // เดิมบรรทัดนี้ `setData([])` ซึ่งทำให้ "หมดสิทธิ์" กับ "ไม่มีข้อมูล"
      // หน้าตาเหมือนกันเป๊ะบนจอ — ไรเดอร์เห็น "ไม่มีงาน" ทั้งที่ความจริงคือ
      // เขาไม่ได้ล็อกอินอยู่แล้ว และไม่มีอะไรพาเขาไปหน้าล็อกอิน
      // (หลักการข้อ 4)
      if (isPermissionDenied(error)) {
        setError('auth');
        // **ห้าม setData([])** — ปล่อยข้อมูลชุดเดิมค้างไว้บนจอระหว่างที่ App
        // กำลังจะสลับไปจอ "เซสชันหมดอายุ" ดีกว่าล้างให้ว่างแล้วกระพริบ
        notifySessionLost(localStorage.getItem('rider_id'), 'firebase_session_lost', {
          source: 'useDatabase',
          path,
        });
        return;
      }

      setError('unknown');
      setData([]);
    });

    return () => unsubscribe();
  }, [path]);

  return { data, loading, error };
};