// src/hooks/useDatabase.ts
import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../api/firebase';

export const useDatabase = (path: string) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dbRef = ref(db, path);
    const unsubscribe = onValue(dbRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        // แปลง Object จาก Firebase เป็น Array พร้อมใส่ ID
        const list = Object.entries(val).map(([id, data]: [string, any]) => ({
          id,
          ...data,
        }));
        setData(list);
      } else {
        setData([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [path]);

  return { data, loading };
};