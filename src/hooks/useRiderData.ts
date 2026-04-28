// src/hooks/useRiderData.ts
import { useState, useEffect, useMemo } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { db, auth } from '../api/firebase';
import { signOut } from 'firebase/auth';
import { useDatabase } from './useDatabase';
import { usePaginatedDatabase } from './usePaginatedDatabase';
import type { RiderInfo } from '../types';
import { JOB_STATUS, RECEIVE_METHOD, normalizeStatus } from '../types/job-statuses';
import type { JobStatus } from '../types/job-statuses';

// Status sets that the home/active/history filters care about. Defined as
// canonical values from JOB_STATUS; jobs in the DB still carry legacy
// strings ("Assigned", "Active Leads" plural, "PAID", "In-Transit", ...)
// so every comparison runs job.status through normalizeStatus() first,
// which handles legacy aliases (and the "In-Transit" overload via
// receive_method).
const ACTIVE_LIST_STATUSES = new Set<JobStatus>([
  JOB_STATUS.RIDER_ACCEPTED,
  JOB_STATUS.RIDER_EN_ROUTE,
  JOB_STATUS.RIDER_ARRIVED,
  JOB_STATUS.BEING_INSPECTED,
  JOB_STATUS.QC_REVIEW,
  JOB_STATUS.PRICE_ACCEPTED,
  JOB_STATUS.REVISED_OFFER,
  JOB_STATUS.PAYOUT_PROCESSING,
  JOB_STATUS.RIDER_RETURNING, // legacy "In-Transit" on Pickup
  JOB_STATUS.WAITING_FOR_HANDOVER,
  JOB_STATUS.PAID,
]);

const HISTORY_LIST_STATUSES = new Set<JobStatus>([
  JOB_STATUS.PENDING_QC,
  JOB_STATUS.IN_STOCK,
  JOB_STATUS.PAID,
  JOB_STATUS.COMPLETED,
  JOB_STATUS.RETURN_CONFIRMED, // legacy "Returned"
  JOB_STATUS.CLOSED_LOST,
]);

import { toast } from '../components/common/Toast';

export const useRiderData = (currentRiderId: string) => {
  const { data: jobs, loading: jobsLoading } = useDatabase('jobs');
  const { data: transactions, loading: txLoading, hasMore: hasMoreTx, loadMore: loadMoreTx } = usePaginatedDatabase('transactions', 'timestamp', { field: 'rider_id', value: currentRiderId });
  const { data: modelsData, loading: modelsLoading } = useDatabase('models');
  const { data: conditionSets, loading: conditionsLoading } = useDatabase('settings/condition_sets');

  const [dispatchMode, setDispatchMode] = useState('manual');
  const [isOnline, setIsOnline] = useState(false);

  const [riderInfo, setRiderInfo] = useState<RiderInfo>({
    name: 'กำลังโหลด...', id: currentRiderId, bankName: '-', accountNo: '-',
    accountName: '-', idCardImg: null, licenseImg: null
  });

  // Listen dispatch mode
  useEffect(() => {
    const unsubscribe = onValue(ref(db, 'settings/system/dispatch_mode'), (snapshot) => {
      setDispatchMode(snapshot.exists() ? snapshot.val() : 'manual');
    });
    return () => unsubscribe();
  }, []);

  // Listen rider info + suspension check
  useEffect(() => {
    if (!currentRiderId) return;
    const unsubscribe = onValue(ref(db, `riders/${currentRiderId}`), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.val();

      if (data.approval_status === 'Suspended') {
        toast.error(`บัญชีถูกระงับ: ${data.suspend_reason || 'กรุณาติดต่อแอดมิน'}`);
        setIsOnline(false);
        signOut(auth).then(() => {
          localStorage.removeItem('rider_id');
          localStorage.removeItem('device_pin');
          window.location.reload();
        });
        return;
      }

      setRiderInfo(prev => ({
        ...prev,
        name: data.name || 'ไม่ระบุชื่อ',
        bankName: data.bank?.name || '-',
        accountNo: data.bank?.account || '-',
        accountName: data.name || '-',
        idCardImg: data.documents?.idCard || null,
        licenseImg: data.documents?.license || null
      }));
    });
    return () => unsubscribe();
  }, [currentRiderId]);

  // Geolocation tracking
  useEffect(() => {
    if (!isOnline) return;
    const updateLocationAndBattery = async (pos: GeolocationPosition) => {
      let currentBattery = 99;
      try {
        if ('getBattery' in navigator) {
          const battery: any = await (navigator as any).getBattery();
          currentBattery = Math.round(battery.level * 100);
        }
      } catch { /* ignore */ }

      await update(ref(db, `riders/${riderInfo.id}`), {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        status: jobData.activeList.length > 0 ? 'Busy' : 'Online',
        battery: currentBattery, last_updated: Date.now()
      });
    };

    const handleGeoError = (error: GeolocationPositionError) => {
      const messages: Record<number, string> = {
        1: 'กรุณาอนุญาตการเข้าถึงตำแหน่ง (Location) เพื่อใช้งานระบบ',
        2: 'ไม่สามารถระบุตำแหน่งได้ กรุณาตรวจสอบ GPS',
        3: 'การระบุตำแหน่งใช้เวลานานเกินไป กรุณาลองใหม่',
      };
      console.warn('Geolocation error:', error.message);
      if (error.code === 1) {
        toast.error(messages[error.code]);
        setIsOnline(false);
      }
    };

    navigator.geolocation.getCurrentPosition(updateLocationAndBattery, handleGeoError, { enableHighAccuracy: true });
    let lastUpdate = 0;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const now = Date.now();
      if (now - lastUpdate > 10000) { updateLocationAndBattery(pos); lastUpdate = now; }
    }, handleGeoError, { enableHighAccuracy: true, maximumAge: 10000 });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, riderInfo.id]);

  const jobData = useMemo(() => {
    const list = Array.isArray(jobs) ? jobs : [];
    const tx = Array.isArray(transactions) ? transactions : [];
    const myJobs = list.filter((j: any) => j.rider_id === currentRiderId);
    const myTx = tx.filter((t: any) => t.rider_id === currentRiderId).sort((a: any, b: any) => b.timestamp - a.timestamp);
    const balance = myTx.reduce((acc: number, t: any) => t.type === 'CREDIT' ? acc + Number(t.amount) : acc - Number(t.amount), 0);

    const incomingList = list.filter((j: any) => {
      if (j.receive_method !== RECEIVE_METHOD.PICKUP) return false;
      const canonical = normalizeStatus(j.status, j.receive_method);
      const isDirectlyAssigned =
        canonical === JOB_STATUS.RIDER_ASSIGNED && j.rider_id === currentRiderId;
      const isBroadcastJob =
        dispatchMode === 'broadcast' &&
        (canonical === JOB_STATUS.ACTIVE_LEAD ||
          (canonical === JOB_STATUS.RIDER_ASSIGNED && !j.rider_id));
      return isDirectlyAssigned || isBroadcastJob;
    });

    return {
      activeList: myJobs.filter((j: any) => {
        const canonical = normalizeStatus(j.status, j.receive_method);
        return canonical && ACTIVE_LIST_STATUSES.has(canonical) && !j.completed_at;
      }),
      incomingList,
      history: myJobs.filter((j: any) => {
        const canonical = normalizeStatus(j.status, j.receive_method);
        if (canonical === JOB_STATUS.CANCELLED) return true;
        return canonical && HISTORY_LIST_STATUSES.has(canonical) && j.completed_at;
      }).sort((a: any, b: any) => (b.completed_at || 0) - (a.completed_at || 0)),
      balance,
      transactions: myTx
    };
  }, [jobs, transactions, currentRiderId, dispatchMode]);

  return {
    jobData, riderInfo, setRiderInfo,
    isOnline, setIsOnline,
    modelsData, conditionSets,
    jobsLoading, txLoading, modelsLoading, conditionsLoading,
    hasMoreTx, loadMoreTx,
    dispatchMode
  };
};
