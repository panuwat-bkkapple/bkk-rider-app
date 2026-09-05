// src/hooks/useRiderData.ts
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { db, auth } from '../api/firebase';
import { signOut } from 'firebase/auth';
import { logAuthEvent } from '../utils/authEvents';
import { useDatabase } from './useDatabase';
import { useRiderJobs } from './useRiderJobs';
import { usePaginatedDatabase } from './usePaginatedDatabase';
import { normalizeVehicleType } from '../utils/jobHelpers';
import { isRiderWalletTx, walletBalance, pendingWithdrawalHold } from '../utils/walletLedger';
import { compareByAppointment } from '../utils/pickupSchedule';
import type { RiderInfo } from '../types';
import { JOB_STATUS, RECEIVE_METHOD, normalizeStatus } from '../types/job-statuses';
// แบ่ง active/history ผ่านกติกาเดียวใน utils/riderJobLists (ChatModal ถามที่เดียวกัน)
// — ลิสต์สถานะที่เคยพิมพ์มือตรงนี้ขาด Sent To QC Lab / Sold ฯลฯ แล้วงานหายจากจอ
// ไรเดอร์ตอนแอดมินส่ง QC (5 ก.ย. 2569) ดูหัวไฟล์นั้น
import { classifyRiderJob, historyTimeOf } from '../utils/riderJobLists';

import { toast } from '../components/common/Toast';
import { isSuspended } from '../utils/riderStanding';
import { offlineWriteNeeded, presenceIsOn, PRESENCE_OFFLINE } from '../utils/presence';
import { setAuthNotice } from '../utils/authNotice';

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
  // สวิตช์เริ่มตามฐานข้อมูลครั้งเดียวตอนเปิดแอป — เดิมเริ่มที่ปิดเสมอ ขณะที่
  // riders/{id}/status ยังบอกว่า Online จากกะที่ยังไม่จบ แอดมินจึงเห็นคนละอย่างกับ
  // ไรเดอร์ และ GPS ไม่เดิน (เดินเฉพาะตอน isOnline) = หมุดค้างที่เดิม
  const presenceInitialised = useRef(false);

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

      // อ่านผ่าน isSuspended (approval_status ก่อน แล้ว fallback status)
      if (isSuspended(data)) {
        const reason = typeof data.suspend_reason === 'string' ? data.suspend_reason.slice(0, 120) : '';
        const message = reason
          ? `บัญชีถูกระงับ กรุณาติดต่อออฟฟิศ (${reason})`
          : 'บัญชีถูกระงับ กรุณาติดต่อออฟฟิศ';
        toast.error(message);
        setIsOnline(false);
        // toast ตายไปกับ reload ที่ตามมาอีกเสี้ยววินาที ไรเดอร์จึงเห็นแค่จอเปล่า
        setAuthNotice(message);
        // สัญญาณจากฝั่ง server = หนึ่งในสองเหตุที่ล้างการลงทะเบียนเครื่องได้
        // (อีกเหตุคือไรเดอร์กดออกเอง) — หลักการข้อ 2
        logAuthEvent(currentRiderId, 'account_suspended', {
          suspendReason: typeof data.suspend_reason === 'string' ? data.suspend_reason.slice(0, 120) : null,
        });
        signOut(auth).then(() => {
          localStorage.removeItem('rider_id');
          localStorage.removeItem('device_pin');
          localStorage.removeItem('rider_email');
          window.location.reload();
        });
        return;
      }

      if (!presenceInitialised.current) {
        presenceInitialised.current = true;
        if (presenceIsOn(data.status)) {
          // กะยังเปิดอยู่ในฐานข้อมูล → เปิดสวิตช์ตาม (GPS จะเริ่มเขียนต่อเอง)
          // ref ตามมาเองผ่าน effect ข้างล่าง การกดปิดครั้งแรกจึงเห็น prev=true
          setIsOnline(true);
        }
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

  // writer ของ Offline — ปิดรับต้องมีผลจริง (เจ้าของงานเคาะ 4 ก.ย. 2569)
  //
  // เป็นฟังก์ชัน explicit ไม่ใช่ effect ที่เฝ้า isOnline — เพราะตอนออกจากระบบต้อง
  // **เขียน Offline ให้เสร็จก่อน signOut** ไม่งั้น write ไปถึง RTDB หลัง token หาย
  // = PERMISSION_DENIED เงียบๆ แล้วแอดมินเห็นคนที่ออกไปแล้วว่ายังเปิดรับอยู่
  // effect ควบคุมลำดับนั้นไม่ได้ (มันยิงหลัง commit ซึ่งอาจช้ากว่า await signOut)
  //
  // เขียนเฉพาะตอนสวิตช์เปลี่ยนจากเปิดเป็นปิด (offlineWriteNeeded) ไม่ใช่ทุกครั้งที่
  // เป็นปิด — ค่าเริ่มต้นตอน mount คือปิด. คนอ่านฟิลด์นี้ (grep ครบ 3 รีโป):
  // DispatcherPage กรอง Offline ออกจากรายชื่อจ่ายงาน · RiderManagement ซ่อนจุดสี ·
  // broadcast (functions/riderStanding) ข้ามคนที่ Offline · actor.js/riderStanding
  // อ่าน Offline เป็น "เคยอนุมัติ" (ไม่กระทบสิทธิ์). ไม่ใช้ onDisconnect — เหตุผลใน
  // utils/presence.ts
  // ref ตามค่า state ผ่าน effect (ไม่เขียน ref ใน callback — React Compiler lint
  // ถือว่า ref ใน useCallback เป็นค่าที่แก้ไม่ได้) callback อ่านอย่างเดียว
  const isOnlineRef = useRef(false);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);
  const setPresence = useCallback(async (next: boolean) => {
    const prev = isOnlineRef.current;
    setIsOnline(next);
    if (!offlineWriteNeeded(prev, next) || !currentRiderId) return;
    try {
      await update(ref(db, `riders/${currentRiderId}`), {
        status: PRESENCE_OFFLINE,
        last_updated: Date.now(),
      });
    } catch (err) {
      // เขียนไม่ผ่าน (เน็ตหลุด) = แอดมินยังเห็นเป็นเปิดอยู่ชั่วคราว ไม่ใช่เรื่องที่ต้อง
      // ขวางการกดปิดรับ แค่ให้เห็นใน log
      console.warn('[presence] write Offline failed:', err);
    }
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
        void setPresence(false);
      }
    };

    navigator.geolocation.getCurrentPosition(updateLocationAndBattery, handleGeoError, { enableHighAccuracy: true });
    let lastUpdate = 0;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const now = Date.now();
      if (now - lastUpdate > 10000) { updateLocationAndBattery(pos); lastUpdate = now; }
    }, handleGeoError, { enableHighAccuracy: true, maximumAge: 10000 });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, riderInfo.id, setPresence]);

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
      activeList: myJobs.filter((j: any) => classifyRiderJob(j) === 'active'),
      incomingList,
      history: myJobs
        .filter((j: any) => classifyRiderJob(j) === 'history')
        .sort((a: any, b: any) => historyTimeOf(b) - historyTimeOf(a)),
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
    isOnline, setPresence,
    modelsData, conditionSets,
    jobsLoading, txLoading, modelsLoading, conditionsLoading,
    hasMoreTx, loadMoreTx,
    dispatchMode
  };
};
