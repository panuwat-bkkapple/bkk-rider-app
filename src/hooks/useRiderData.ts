// src/hooks/useRiderData.ts
import { useState, useEffect, useMemo, useRef } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { db, auth } from '../api/firebase';
import { signOut } from 'firebase/auth';
import { useDatabase } from './useDatabase';
import { useRiderJobs } from './useRiderJobs';
import { usePaginatedDatabase } from './usePaginatedDatabase';
import { normalizeVehicleType } from '../utils/jobHelpers';
import { isRiderWalletTx, walletBalance, pendingWithdrawalHold } from '../utils/walletLedger';
import { compareByAppointment } from '../utils/pickupSchedule';
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
  // Rider-scoped queries only — never subscribe to the whole /jobs node
  // from a rider device (bandwidth cost scales with total job count).
  const { data: jobs, loading: jobsLoading } = useRiderJobs(currentRiderId);
  const { data: transactions, loading: txLoading, hasMore: hasMoreTx, loadMore: loadMoreTx } = usePaginatedDatabase('transactions', 'timestamp', { field: 'rider_id', value: currentRiderId });
  // คำขอถอนของตัวเอง (rules เปิด read เฉพาะ query rider_id ตัวเอง) — ใช้คิดยอด
  // จองค้าง (status 'requested') และโชว์รายการรอโอนใน WalletTab
  const { data: withdrawals } = usePaginatedDatabase('withdrawals', 'requested_at', { field: 'rider_id', value: currentRiderId });
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
        licenseImg: data.documents?.license || null,
        photoUrl: data.photo_url || data.photo || null,
        // แอดมินเขียนไว้ 2 ที่ (flat + nested) จากหน้าจัดการไรเดอร์ — ยังไม่ได้
        // ตั้งค่า = null ไม่เดาให้ เพราะเลขค่าจ้างที่โชว์จะผิดกลุ่มอัตรา
        vehicleType: normalizeVehicleType(data.vehicle_type ?? data.vehicle?.type),
        employmentType: data.employment?.type === 'employee' || data.employment?.type === 'freelance'
          ? data.employment.type
          : null
      }));
    });
    return () => unsubscribe();
  }, [currentRiderId]);

  // จำนวนงานที่ไรเดอร์ถืออยู่ ณ ตอนนี้ — เก็บใน ref เพราะตัวที่อ่านมันคือ
  // callback ของ watchPosition ซึ่งมีอายุยาวตลอด session ที่เปิดรับงาน
  //
  // เดิม callback นั้นอ่าน `jobData.activeList.length` จาก closure ที่ถูก
  // แช่ไว้ตั้งแต่ตอนกดเปิดรับงาน (deps มีแค่ [isOnline, riderInfo.id]) แปลว่า
  // ไรเดอร์ที่เปิดรับงานตอนมือว่างแล้วกดรับงาน จะถูกเขียนสถานะเป็น 'Online'
  // ทุก 10 วินาทีไปตลอดทั้งกะ ทั้งที่กำลังวิ่งงานอยู่ (และกลับกัน คนที่เปิด
  // ตอนถืองานอยู่จะค้างเป็น 'Busy' หลังส่งงานเสร็จ) — จุดสีเขียว/เหลืองใน
  // หน้า RiderManagement ของแอดมินอ่านฟิลด์นี้ตรงๆ
  //
  // ใส่ลง deps ตรงๆ ไม่ได้ เพราะจะรื้อ watchPosition ทิ้งแล้วเริ่มใหม่ทุกครั้ง
  // ที่จำนวนงานเปลี่ยน ซึ่งรีเซ็ตตัวหน่วง 10 วินาทีไปด้วย
  const activeJobCountRef = useRef(0);

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
        status: activeJobCountRef.current > 0 ? 'Busy' : 'Online',
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
    // กระเป๋านับเฉพาะหมวดเงินไรเดอร์ (allowlist ใน walletLedger) — /transactions
    // เป็นสมุดเงินสดของร้าน มีแถวฝั่งบริษัท (เช่น LOGISTICS_REVENUE) ที่เคยติด
    // rider_id มาด้วย สูตรเดิมที่รวมทุกแถวทำให้ balance บวมเกินจริง และ NaN
    // จากแถว amount เสียทะลุมาพังทั้งก้อนได้ — ห้ามถอด filter นี้ออก
    const myTx = tx
      .filter((t: any) => t.rider_id === currentRiderId && isRiderWalletTx(t))
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
    const wd = (Array.isArray(withdrawals) ? withdrawals : []).filter((w: any) => w.rider_id === currentRiderId);
    const pendingWithdrawals = wd
      .filter((w: any) => w.status === 'requested')
      .sort((a: any, b: any) => (b.requested_at || 0) - (a.requested_at || 0));
    // balance ที่โชว์/ใช้เช็คก่อนขอถอน = ledger ลบยอดจองค้าง (server ตรวจซ้ำ
    // ด้วยสูตรเดียวกันใน riderRequestWithdraw — client เป็นแค่ UX)
    const balance = walletBalance(myTx) - pendingWithdrawalHold(pendingWithdrawals);

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
    })
      // กองงานเคยเรียงตามลำดับคีย์ของ Firebase ล้วนๆ — งานที่นัดบ่ายจึงขึ้น
      // เหนืองานที่นัดอีกยี่สิบนาทีได้ตามใจ compareByAppointment เรียงให้
      // (รับด่วนก่อน → นัดใกล้สุด → งานที่อ่านเวลานัดไม่ได้อยู่ท้าย)
      .sort(compareByAppointment);

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
      pendingWithdrawals,
      transactions: myTx
    };
  }, [jobs, transactions, withdrawals, currentRiderId, dispatchMode]);

  // sync ref ให้ callback ของ watchPosition (อายุยาว) อ่านค่าล่าสุดเสมอ
  const activeJobCount = jobData.activeList.length;
  useEffect(() => {
    activeJobCountRef.current = activeJobCount;
  }, [activeJobCount]);

  return {
    jobData, riderInfo, setRiderInfo,
    isOnline, setIsOnline,
    modelsData, conditionSets,
    jobsLoading, txLoading, modelsLoading, conditionsLoading,
    hasMoreTx, loadMoreTx,
    dispatchMode
  };
};
