// src/hooks/usePaginatedDatabase.ts
import { useState, useEffect, useCallback } from 'react';
import { ref, query, orderByChild, limitToLast, endBefore, onValue, get } from 'firebase/database';
import { db } from '../api/firebase';

const PAGE_SIZE = 50;

export const usePaginatedDatabase = (path: string, orderBy: string = 'timestamp') => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastKey, setLastKey] = useState<number | null>(null);

  // Initial load - get latest PAGE_SIZE items via realtime listener
  useEffect(() => {
    const dbQuery = query(
      ref(db, path),
      orderByChild(orderBy),
      limitToLast(PAGE_SIZE)
    );

    const unsubscribe = onValue(dbQuery, (snapshot) => {
      const val = snapshot.val();
      if (val && typeof val === 'object') {
        const list = Object.entries(val).map(([id, data]: [string, any]) => ({
          id,
          ...(typeof data === 'object' && data !== null ? data : { value: data }),
        }));
        // Sort descending by orderBy field
        list.sort((a, b) => (b[orderBy] || 0) - (a[orderBy] || 0));
        setData(list);

        if (list.length < PAGE_SIZE) {
          setHasMore(false);
        } else {
          setLastKey(list[list.length - 1]?.[orderBy] || null);
        }
      } else {
        setData([]);
        setHasMore(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [path, orderBy]);

  // Load more (older data)
  const loadMore = useCallback(async () => {
    if (!hasMore || lastKey === null) return;

    const dbQuery = query(
      ref(db, path),
      orderByChild(orderBy),
      endBefore(lastKey),
      limitToLast(PAGE_SIZE)
    );

    const snapshot = await get(dbQuery);
    const val = snapshot.val();
    if (val && typeof val === 'object') {
      const list = Object.entries(val).map(([id, data]: [string, any]) => ({
        id,
        ...(typeof data === 'object' && data !== null ? data : { value: data }),
      }));
      list.sort((a, b) => (b[orderBy] || 0) - (a[orderBy] || 0));

      if (list.length < PAGE_SIZE) setHasMore(false);
      if (list.length > 0) {
        setLastKey(list[list.length - 1]?.[orderBy] || null);
        setData(prev => [...prev, ...list]);
      } else {
        setHasMore(false);
      }
    } else {
      setHasMore(false);
    }
  }, [path, orderBy, lastKey, hasMore]);

  return { data, loading, hasMore, loadMore };
};
