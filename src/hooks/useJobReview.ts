// src/hooks/useJobReview.ts
//
// อ่านรีวิวของงานหนึ่งใบจาก reviews/{review_id} — rules เปิดอ่าน "รายใบ"
// อยู่แล้ว (การ list ทั้ง /reviews เป็นของแอดมิน) จึงต้องรู้ id ก่อนเสมอ:
// jobs/{id}/review_id เขียนโดย review submit ฝั่งเว็บลูกค้า. งานที่รีวิว
// ก่อนมีฟิลด์นี้ (is_reviewed แต่ไม่มี review_id) จะได้แค่ธงว่ารีวิวแล้ว
// จนกว่าจะรัน backfill — hook นี้จึงตอบ 3 สถานะแยกกันชัดๆ ไม่เดา
import { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../api/firebase';

export interface JobReview {
  overall: number | null;
  comment: string;
}

export function useJobReview(job: any): { review: JobReview | null; loading: boolean } {
  const reviewId = typeof job?.review_id === 'string' && job.review_id ? job.review_id : null;
  const [review, setReview] = useState<JobReview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setReview(null);
    if (!reviewId) return;
    let cancelled = false;
    setLoading(true);
    get(ref(db, `reviews/${reviewId}`))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.val();
        const overall = Number(data?.ratings?.overall);
        setReview({
          overall: Number.isFinite(overall) && overall > 0 ? overall : null,
          comment: typeof data?.comment === 'string' ? data.comment : '',
        });
      })
      .catch(() => { /* อ่านไม่ได้ = โชว์แค่ธงรีวิวแล้ว ไม่พังจอ */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reviewId]);

  return { review, loading };
}
