// src/hooks/useRiderJobs.ts
//
// Rider-scoped replacement for useDatabase('jobs'). Subscribing to the whole
// /jobs node made every rider device download the entire node on each app
// open / reconnect (mobile radios reconnect constantly), which dominated the
// Realtime Database bandwidth bill. Instead we subscribe to only the slices
// a rider can ever act on:
//
//   1. jobs assigned to this rider  — query rider_id == currentRiderId
//   2. the dispatch pool            — one query per raw status value that
//      normalizes to ACTIVE_LEAD / RIDER_ASSIGNED (broadcast candidates)
//
// Both are served server-side by the existing ".indexOn": ["status",
// "rider_id"] on /jobs (bkk-frontend-next/database.rules.json). The merged
// list is a superset of everything useRiderData's filters select, so the
// downstream filtering logic is unchanged.
import { useState, useEffect, useMemo } from 'react';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../api/firebase';

// Raw DB status strings whose normalizeStatus() result is ACTIVE_LEAD or
// RIDER_ASSIGNED (see LEGACY_ALIAS in types/job-statuses.ts). Queries match
// the stored string, not the canonical one, so legacy rows must be listed.
const POOL_RAW_STATUSES = [
  'Active Lead',
  'Active Leads', // legacy plural
  'Rider Assigned',
  'Assigned', // legacy name
];

type JobMap = Record<string, any>;

const snapshotToMap = (val: any): JobMap => {
  if (!val || typeof val !== 'object') return {};
  const map: JobMap = {};
  for (const [id, data] of Object.entries(val)) {
    map[id] = { id, ...(typeof data === 'object' && data !== null ? data : { value: data }) };
  }
  return map;
};

export const useRiderJobs = (currentRiderId: string) => {
  const [myJobs, setMyJobs] = useState<JobMap>({});
  const [poolJobs, setPoolJobs] = useState<Record<string, JobMap>>({});
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    if (!currentRiderId) return;
    setMyJobs({});
    setPoolJobs({});
    setLoadedCount(0);

    const markLoaded = (() => {
      const seen = new Set<string>();
      return (key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        setLoadedCount(seen.size);
      };
    })();

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onValue(
        query(ref(db, 'jobs'), orderByChild('rider_id'), equalTo(currentRiderId)),
        (snapshot) => {
          setMyJobs(snapshotToMap(snapshot.val()));
          markLoaded('mine');
        },
        (error) => {
          console.error('useRiderJobs error (rider_id query):', error.message);
          markLoaded('mine');
        }
      )
    );

    for (const status of POOL_RAW_STATUSES) {
      unsubs.push(
        onValue(
          query(ref(db, 'jobs'), orderByChild('status'), equalTo(status)),
          (snapshot) => {
            const map = snapshotToMap(snapshot.val());
            setPoolJobs((prev) => ({ ...prev, [status]: map }));
            markLoaded(status);
          },
          (error) => {
            console.error(`useRiderJobs error (status "${status}"):`, error.message);
            markLoaded(status);
          }
        )
      );
    }

    return () => unsubs.forEach((fn) => fn());
  }, [currentRiderId]);

  const data = useMemo(() => {
    // A job assigned to me can also sit in a pool status — merge maps so
    // each id appears once (my copy wins; both come from the same server row).
    const merged: JobMap = {};
    for (const map of Object.values(poolJobs)) Object.assign(merged, map);
    Object.assign(merged, myJobs);
    return Object.values(merged);
  }, [myJobs, poolJobs]);

  const loading = loadedCount < 1 + POOL_RAW_STATUSES.length;

  return { data, loading };
};
