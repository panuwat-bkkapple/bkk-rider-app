// แถวใบเบิกของไรเดอร์คนนี้บน server — query ตาม index `rider_id` เท่านั้น
//
// rules ของ `rider_expenses` ให้ไรเดอร์อ่านได้เฉพาะ query ที่ `orderByChild
// === 'rider_id' && equalTo === auth.uid` (bkk-frontend-next/database.rules.json)
// อ่านทั้งโหนดจะถูกปฏิเสธ และถึงอ่านได้ก็ไม่ควร (กฎค่า RTDB)
//
// อ่านไม่ได้ (rules ยังไม่ deploy / เน็ตหลุด) = รายการว่าง ไม่ใช่หน้าพัง —
// ฝั่งคิวในเครื่องยังโชว์ของที่ยังไม่ขึ้น server ได้ตามปกติ

import { useEffect, useState } from 'react';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../api/firebase';
import type { ServerExpenseRow } from '../utils/expenseClaims';

const EMPTY: ServerExpenseRow[] = [];

export function useRiderExpenses(uid: string | null): ServerExpenseRow[] {
  // เก็บ uid คู่กับแถว แล้วคืนเฉพาะเมื่อตรงกับ uid ปัจจุบัน — สลับบัญชีแล้ว
  // แถวของคนเก่าต้องไม่โผล่ให้คนใหม่เห็นแม้เสี้ยววินาที (และไม่ต้อง setState
  // ใน effect เพื่อล้าง ซึ่ง React 19 เตือนเรื่อง cascading render)
  const [state, setState] = useState<{ uid: string | null; rows: ServerExpenseRow[] }>({
    uid: null,
    rows: EMPTY,
  });

  useEffect(() => {
    if (!uid) return;
    const q = query(ref(db, 'rider_expenses'), orderByChild('rider_id'), equalTo(uid));
    return onValue(
      q,
      (snap) => {
        const out: ServerExpenseRow[] = [];
        snap.forEach((child) => {
          const v = child.val();
          if (v && typeof v === 'object') out.push({ ...(v as ServerExpenseRow), id: child.key as string });
          return false;
        });
        setState({ uid, rows: out });
      },
      () => setState({ uid, rows: EMPTY }),
    );
  }, [uid]);

  return uid && state.uid === uid ? state.rows : EMPTY;
}
