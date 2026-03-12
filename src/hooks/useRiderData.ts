// src/hooks/useRiderData.ts
import { useState, useEffect, useMemo } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { db, auth } from '../api/firebase';
import { signOut } from 'firebase/auth';
import { useDatabase } from './useDatabase';
import { usePaginatedDatabase } from './usePaginatedDatabase';
import type { RiderInfo } from '../types';

export const useRiderData = (currentRiderId: string) => {
  const { data: jobs, loading: jobsLoading } = useDatabase('jobs');
  const { data: transactions, loading: txLoading, hasMore: hasMoreTx, loadMore: loadMoreTx } = usePaginatedDatabase('transactions', 'timestamp');
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
        alert(`บัญชีของคุณถูกระงับการใช้งาน!\nเหตุผล: ${data.suspend_reason || 'กรุณาติดต่อแอดมิน'}`);
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

    navigator.geolocation.getCurrentPosition(updateLocationAndBattery, console.error, { enableHighAccuracy: true });
    let lastUpdate = 0;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const now = Date.now();
      if (now - lastUpdate > 10000) { updateLocationAndBattery(pos); lastUpdate = now; }
    }, console.error, { enableHighAccuracy: true, maximumAge: 10000 });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, riderInfo.id]);

  const jobData = useMemo(() => {
    const list = Array.isArray(jobs) ? jobs : [];
    const tx = Array.isArray(transactions) ? transactions : [];
    const myJobs = list.filter((j: any) => j.rider_id === currentRiderId);
    const myTx = tx.filter((t: any) => t.rider_id === currentRiderId).sort((a: any, b: any) => b.timestamp - a.timestamp);
    const balance = myTx.reduce((acc: number, t: any) => t.type === 'CREDIT' ? acc + Number(t.amount) : acc - Number(t.amount), 0);

    const incomingList = list.filter((j: any) => {
      if (j.receive_method !== 'Pickup') return false;
      const isDirectlyAssigned = j.status === 'Assigned' && j.rider_id === currentRiderId;
      const isBroadcastJob =
        dispatchMode === 'broadcast' &&
        (j.status === 'Active Leads' || (j.status === 'Assigned' && !j.rider_id));
      return isDirectlyAssigned || isBroadcastJob;
    });

    return {
      activeList: myJobs.filter((j: any) =>
        ['Accepted', 'Heading to Customer', 'Arrived', 'Being Inspected', 'QC Review', 'Price Accepted', 'Revised Offer', 'Payout Processing', 'In-Transit', 'Waiting for Handover', 'Paid', 'PAID'].includes(j.status)
        && !j.completed_at
      ),
      incomingList,
      history: myJobs.filter((j: any) =>
        (['Pending QC', 'In Stock', 'Paid', 'PAID', 'Completed', 'Returned', 'Closed (Lost)'].includes(j.status) && j.completed_at)
        || j.status === 'Cancelled'
      ).sort((a: any, b: any) => (b.completed_at || 0) - (a.completed_at || 0)),
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
