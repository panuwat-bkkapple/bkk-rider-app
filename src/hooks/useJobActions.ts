// src/hooks/useJobActions.ts
import { ref, update, push, set, runTransaction } from 'firebase/database';
import { db, functions } from '../api/firebase';
import { httpsCallable } from 'firebase/functions';
import { sendAdminNotification } from '../utils/notifications';
import { uploadImageToFirebase } from '../utils/uploadImage';
import { formatCurrency } from '../utils/formatters';
import type { RiderInfo, KYCRecord } from '../types';
import { DISCREPANCY_CATEGORIES, KYC_FALLBACK_REASON_LABEL_TH } from '../types';
import { JOB_STATUS, normalizeStatus, CANCEL_CATEGORY_LABEL_TH } from '../types/job-statuses';
import type { CancelCategory } from '../types/job-statuses';
import { toast } from '../components/common/Toast';
import { getCheckpointForStatus, getCheckpointForStage, recordCheckpoint, resolveCheckpointTarget, STAGE_LABEL_TH } from '../utils/checkpoints';
import { capturePosition } from '../utils/geolocation';
import { distanceMeters, GPS_STATUS_LABEL_TH } from '../utils/checkpointPayload';
import type { CheckpointTarget } from '../utils/checkpointPayload';
import type { GpsFix, GpsStatus } from '../utils/geolocation';
import { markOfferAccepted, markOfferRejected } from '../utils/offerLog';
import { EVENT_CHECKPOINT_STAGE, RIDER_EVENT, engineErrorCode, transitionErrorMessage } from '../utils/riderTransitions';
import type { RiderEvent } from '../utils/riderTransitions';
import type { CheckpointStage } from '../utils/jobTimeline';

/**
 * รูปงานเท่าที่เส้นทาง event ต้องรู้จัก
 *
 * ไฟล์นี้ใช้ `any` อยู่ทั่วไปตามยุคที่เขียน — โค้ดใหม่ไม่ควรเพิ่มจำนวนนั้น
 * (ขั้น Lint ใน CI เป็น advisory เพื่อให้ไล่ตัวเลขลง ไม่ใช่เพื่อให้เติมเข้าไป)
 * ที่ต้องรู้จริงๆ มีแค่ id กับพิกัดลูกค้าสำหรับเทียบระยะ ที่เหลือส่งผ่านเฉยๆ
 */
type JobRow = { id: string; cust_lat?: number; cust_lng?: number; [key: string]: unknown };
type JobLists = { activeList: JobRow[]; incomingList: JobRow[] };

export const useJobActions = (riderInfo: RiderInfo) => {

  const sendCustomerNotification = async (job: any, title: string, message: string) => {
    if (!job || !job.uid) return;
    try {
      await push(ref(db, 'notifications'), {
        target_uid: job.uid, target_role: 'customer',
        title, message, job_id: job.id,
        link: `/track/${job.id}`, timestamp: Date.now(), read: false
      });
    } catch (error) {
      console.error('Error sending customer notification:', error);
    }
  };

  /**
   * บันทึกตำแหน่ง + checkpoint ของการเปลี่ยนสถานะหนึ่งครั้ง
   *
   * เดินหน้าเสมอ ไม่ว่าจะขอพิกัดได้หรือไม่ — `capturePosition` resolve เสมอ
   * (ไม่ reject ไม่ค้าง) และ `recordCheckpoint` เขียนแถวพร้อม `gps_status`
   * บอกเหตุผลเมื่อไม่มีพิกัด
   */
  const recordStatusCheckpoint = async (
    jobId: string,
    where: { status?: string; stage?: CheckpointStage },
    job: any,
    prefetched?: { gps: GpsFix | null; gpsStatus: GpsStatus; target?: CheckpointTarget | null; selfConfirmed?: boolean },
  ) => {
    // จุดที่ต้องเทียบพิกัดถูกอ่านตำแหน่งไปแล้วก่อนเปลี่ยนสถานะ (เพื่อถามยืนยัน) —
    // ใช้ค่านั้นต่อ ไม่ยิง GPS ซ้ำและไม่หาสาขาซ้ำ
    let gps: GpsFix | null;
    let gpsStatus: GpsStatus;
    if (prefetched) {
      gps = prefetched.gps;
      gpsStatus = prefetched.gpsStatus;
    } else {
      const captured = await capturePosition();
      gps = captured.gps;
      gpsStatus = captured.status;
    }

    // riders/{id} อัปเดตเฉพาะตอนมีพิกัดจริง — ห้ามเขียนทับตำแหน่งล่าสุดที่ใช้ได้
    // ด้วยค่าว่างหรือ 0,0 เพราะแอดมินกับหน้าจ่ายงานอ่านค่านี้เป็นตำแหน่งปัจจุบัน
    if (gps) {
      try {
        await update(ref(db, `riders/${riderInfo.id}`), {
          lat: gps.lat,
          lng: gps.lng,
          last_updated: Date.now(),
        });
      } catch (e) {
        console.error('Failed to update rider location:', e);
      }
    } else {
      console.warn(`Geolocation unavailable on status change (${gpsStatus})`);
    }

    try {
      const result = await recordCheckpoint({
        jobId,
        riderId: riderInfo.id,
        status: where.status,
        stage: where.stage,
        gps,
        gpsStatus,
        job: job ? { cust_lat: job.cust_lat, cust_lng: job.cust_lng } : null,
        target: prefetched?.target,
        selfConfirmed: prefetched?.selfConfirmed,
      });
      if (!result) return;
      if (result.withinZone === false && result.distanceM != null && result.targetLabel) {
        // Non-blocking — admin sees this in the dashboard, rider gets a
        // heads-up so they can correct course (or call the customer if
        // the pin is wrong).
        toast.info(
          `บันทึกเช็คอิน "${STAGE_LABEL_TH[result.stage]}" ห่างจาก${result.targetLabel} ${result.distanceM} ม.` +
            (prefetched?.selfConfirmed ? ' (คุณยืนยันเอง)' : ` (เกิน ${result.thresholdM} ม.)`),
        );
      } else if (gpsStatus !== 'ok') {
        // บอกไรเดอร์ตรงๆ ว่าเช็คอินถูกบันทึกแล้วแต่ไม่มีพิกัด — ถ้าเงียบไป เขา
        // จะไม่มีทางรู้ว่าหลักฐานตำแหน่งของงานนี้หายไปจนกว่าจะมีข้อพิพาท
        toast.info(
          `บันทึกเช็คอิน "${STAGE_LABEL_TH[result.stage]}" แล้ว แต่ไม่มีพิกัด (${GPS_STATUS_LABEL_TH[gpsStatus]})`,
        );
      }
    } catch (e) {
      console.error('Failed to record checkpoint:', e);
    }
  };

  /**
   * แจ้งเตือนแอดมิน/ลูกค้าตามสถานะที่งานไปถึง
   *
   * แยกออกมาเพราะตอนนี้มีสองเส้นทางที่พางานไปถึงสถานะเดียวกัน: เส้นเดิมที่เขียน
   * status ตรง กับเส้นใหม่ที่ยิง event ผ่าน transitionJob แล้วรับสถานะปลายทาง
   * กลับมาจาก engine — ปล่อยให้ก๊อปสองชุดเมื่อไหร่ ลูกค้าจะได้ push จากทางหนึ่ง
   * แต่ไม่ได้จากอีกทาง โดยไม่มีใครเห็น
   */
  const notifyStatusChange = (nextStatus: string, jobId: string, job: unknown) => {
    const shortJobId = jobId.slice(-4).toUpperCase();

    // Notifications match the canonical status names from
    // ../types/job-statuses (Rider Accepted, Rider En Route, ...).
    // Legacy spellings ("Accepted", "Heading to Customer", ...) are
    // accepted too so a stale call site doesn't drop a notification
    // during the writer-rename rollout.
    if (nextStatus === JOB_STATUS.RIDER_ACCEPTED || nextStatus === 'Accepted') {
      sendAdminNotification('ไรเดอร์รับงาน', `${riderInfo.name} กำลังเดินทางไปจุดหมาย งาน #${shortJobId}`);
      sendCustomerNotification(job, 'จัดสรรไรเดอร์สำเร็จ!', `ไรเดอร์ ${riderInfo.name} กำลังเตรียมตัวเดินทางไปหาคุณ`);
    } else if (nextStatus === JOB_STATUS.RIDER_EN_ROUTE || nextStatus === 'Heading to Customer') {
      sendAdminNotification('ไรเดอร์ออกเดินทาง', `${riderInfo.name} กำลังมุ่งหน้าไปหาลูกค้า งาน #${shortJobId}`);
      sendCustomerNotification(job, 'ไรเดอร์กำลังเดินทาง!', `ไรเดอร์ ${riderInfo.name} กำลังมุ่งหน้าไปยังจุดนัดรับเครื่องของคุณแล้ว`);
    } else if (nextStatus === JOB_STATUS.RIDER_ARRIVED || nextStatus === 'Arrived') {
      sendAdminNotification('ถึงจุดหมาย', `${riderInfo.name} เดินทางถึงจุดหมายแล้ว งาน #${shortJobId}`);
      sendCustomerNotification(job, 'ไรเดอร์มาถึงแล้ว!', `ไรเดอร์เดินทางถึงจุดนัดหมายแล้ว กรุณาเตรียมตัวเครื่องให้พร้อมครับ`);
    } else if (nextStatus === JOB_STATUS.BEING_INSPECTED) {
      sendAdminNotification('เริ่มตรวจสภาพ', `${riderInfo.name} เริ่มตรวจสภาพเครื่อง งาน #${shortJobId}`);
      sendCustomerNotification(job, 'กำลังตรวจสภาพเครื่อง', `ไรเดอร์กำลังดำเนินการตรวจสอบสภาพเครื่องของคุณอย่างละเอียด`);
    } else if (nextStatus === JOB_STATUS.QC_REVIEW) {
      sendAdminNotification('ด่วน! รออนุมัติ QC', `${riderInfo.name} ส่งรูปตรวจเครื่อง #${shortJobId} เข้ามาแล้ว`);
      sendCustomerNotification(job, 'รออนุมัติราคา', `ช่างเทคนิคกำลังประเมินภาพถ่ายตัวเครื่องของคุณ กรุณารอสักครู่ครับ`);
    } else if (nextStatus === JOB_STATUS.RIDER_RETURNING || nextStatus === 'In-Transit') {
      sendAdminNotification('กำลังกลับสาขา', `${riderInfo.name} กำลังนำเครื่อง #${shortJobId} กลับมาส่ง`);
    } else if (nextStatus === JOB_STATUS.PENDING_QC) {
      sendAdminNotification('ส่งมอบเครื่องสำเร็จ', `${riderInfo.name} จบงานและส่งเครื่อง #${shortJobId} เข้าสาขาเรียบร้อย`);
    }
  };

  const updateStatus = async (
    jobId: string, nextStatus: string, logMsg: string, extraData = {},
    jobLists: { activeList: any[]; incomingList: any[] }
  ) => {
    const job = jobLists.activeList.find(j => j.id === jobId) || jobLists.incomingList.find(j => j.id === jobId);

    // จุดที่ต้องเทียบพิกัด (ถึงลูกค้า / ออกจากลูกค้า / ส่งมอบสาขา): อ่านตำแหน่ง
    // **ก่อน** เขียนสถานะ แล้วถ้าอยู่นอกโซนให้ถามยืนยันก่อน
    //
    // ทำไมต้องถาม: พิกัดที่บันทึกคือที่ที่ "กดปุ่ม" ไม่ใช่ที่ที่ "เกิดเหตุการณ์"
    // และมันถูกใช้เป็นหลักฐานคิดค่าวิ่งใหม่ได้ (ท่อแย้งหมุด) — เคส 31 ส.ค. 2569
    // ไรเดอร์กดสามสถานะรวดเดียวตอนขี่กลับ พิกัดกลางทางเลยถูกใช้แทนจุดรับจริง
    // แล้วค่ารอบถูกปรับผิดไป 104 บาท ทั้งที่หมุดลูกค้าถูกต้อง
    //
    // ขอพิกัดไม่ได้ = ไม่ถาม เดินหน้าตามปกติ (แถวยังถูกเขียนพร้อม gps_status
    // ตามกฎ "พิกัดเป็นของเสริม เวลาที่เกิดเหตุคือของหลัก")
    let prefetched: { gps: GpsFix | null; gpsStatus: GpsStatus; target?: CheckpointTarget | null; selfConfirmed?: boolean } | undefined;
    const cpConfig = getCheckpointForStatus(nextStatus);
    if (cpConfig && cpConfig.verify.target !== 'none') {
      const { gps, status: gpsStatus } = await capturePosition();
      let target: CheckpointTarget | null = null;
      try {
        target = await resolveCheckpointTarget(
          cpConfig.verify, gps, job ? { cust_lat: job.cust_lat, cust_lng: job.cust_lng } : null,
        );
      } catch (e) {
        console.error('Failed to resolve checkpoint target:', e);
      }
      let selfConfirmed = false;
      if (gps && target) {
        const away = distanceMeters(gps.lat, gps.lng, target.lat, target.lng);
        if (away > cpConfig.verify.thresholdM) {
          const shown = away >= 1000 ? `${(away / 1000).toFixed(1)} กม.` : `${away} ม.`;
          const ok = window.confirm(
            `ตอนนี้คุณอยู่ห่างจาก${target.label} ${shown}\n\n` +
            `ยืนยันว่า "${STAGE_LABEL_TH[cpConfig.stage]}" แล้วจริงไหม?\n\n` +
            'OK = ใช่ ถึงแล้ว (บันทึกพร้อมหมายเหตุว่าคุณยืนยันเอง)\n' +
            'Cancel = ยังไม่ถึง กดพลาด (ไม่บันทึกอะไรเลย)'
          );
          if (!ok) {
            toast.info('ยกเลิกแล้ว — ยังไม่เปลี่ยนสถานะ กดใหม่อีกครั้งเมื่อถึงจุดหมาย');
            return;
          }
          selfConfirmed = true;
        }
      }
      prefetched = { gps, gpsStatus, target, selfConfirmed };
    }

    const updatedLogs = [
      { action: nextStatus, by: `Rider: ${riderInfo.name}`, timestamp: Date.now(), details: logMsg },
      ...(job?.qc_logs || [])
    ];

    try {
      await update(ref(db, `jobs/${jobId}`), {
        status: nextStatus, updated_at: Date.now(), qc_logs: updatedLogs, ...extraData
      });

      // Push พิกัดไรเดอร์ไปที่ riders/{id} ทุกครั้งที่เปลี่ยนสถานะ
      // - แอดมินจะเห็นพิกัดตลอดตั้งแต่รับงานจนจบงาน
      // - ลูกค้าจะเห็นเฉพาะตอน Heading to Customer (ควบคุมฝั่ง frontend)
      // นอกจากนั้นยังบันทึก check-in snapshot ลง jobs/{id}/checkpoints/{stage}
      // สำหรับ analytics + dispute audit (recordCheckpoint จะ no-op ถ้า
      // status นี้ไม่ใช่จุดที่ต้อง check-in)
      //
      // สำคัญ: การเขียน checkpoint อยู่ **นอก** เงื่อนไข "ได้พิกัด" โดยตั้งใจ
      // เดิมมันอยู่ข้างใน success callback ของ getCurrentPosition — ปฏิเสธสิทธิ์
      // ตำแหน่ง, GPS หาสัญญาณไม่เจอ, หรือผู้ใช้ปล่อย prompt ค้าง = ไม่มีแถว
      // checkpoint เลยทั้งที่ status เปลี่ยนสำเร็จ ทำให้ไทม์ไลน์งานขาดเป็นช่วงๆ
      // โดยไม่มี error ให้ใครเห็น พิกัดเป็นของเสริม เวลาที่เกิดเหตุคือของหลัก
      void recordStatusCheckpoint(jobId, { status: nextStatus }, job, prefetched);

      notifyStatusChange(nextStatus, jobId, job);
    } catch (error: any) {
      console.error('updateStatus error:', error);
      const msg = error?.code === 'PERMISSION_DENIED'
        ? 'ไม่มีสิทธิ์อัปเดตข้อมูล กรุณาลองใหม่หรือติดต่อแอดมิน'
        : `เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ${error?.message || error}`;
      toast.error(msg);
    }
  };

  /**
   * ยิง **event** ให้ engine ตัดสินสถานะปลายทาง — เส้นทางเดียวที่ไรเดอร์ใช้เปลี่ยน
   * สถานะงานได้แล้ว (ไม่มี fallback กลับไปเขียน jobs/{id}/status ตรงโดยตั้งใจ)
   *
   * ต่างจาก `updateStatus` สามข้อ:
   *   1. ผู้เรียกบอกว่า "เกิดอะไรขึ้น" ไม่ใช่ "อยากให้สถานะเป็นอะไร" — กติกาว่า
   *      สถานะไหนไปสถานะไหนได้อยู่ที่ตาราง TRANSITIONS ที่เดียว
   *   2. การเขียนอยู่ใน transaction ฝั่ง server พร้อม `status_version` + แถว
   *      `status_history` — แอดมินกับไรเดอร์กดพร้อมกันแล้วไม่มีใครถูกทับเงียบๆ
   *   3. **การปฏิเสธเป็นเรื่องปกติ ไม่ใช่ error** เช่นแอดมินเพิ่งเลื่อนสถานะไปแล้ว
   *      ไรเดอร์จะได้ข้อความบอกให้รีเฟรช แทนที่จะเขียนทับงานที่เดินไปข้างหน้าแล้ว
   *
   * ไม่ทำ optimistic update ฝั่ง client โดยตั้งใจ: การ์ดงานอ่านจาก onValue ของ
   * /jobs อยู่แล้ว สถานะใหม่จึงเด้งกลับมาเองภายในหลักร้อยมิลลิวินาที และการเดา
   * สถานะไว้ก่อนคือการเดาสิ่งที่เพิ่งย้ายไปให้ server ตัดสิน
   */
  const runTransition = async (
    jobId: string,
    event: RiderEvent,
    logMsg: string,
    extraData: Record<string, unknown> = {},
    jobLists: JobLists
  ): Promise<boolean> => {
    const job = jobLists.activeList.find(j => j.id === jobId) || jobLists.incomingList.find(j => j.id === jobId);

    // อ่านพิกัด **ก่อน** เขียน แล้วถ้าอยู่นอกโซนให้ถามยืนยัน — เหตุผลเดียวกับ
    // `updateStatus` (ดูคอมเมนต์ยาวที่นั่น): พิกัดที่บันทึกคือที่ที่ "กดปุ่ม"
    // และมันถูกใช้เป็นหลักฐานคิดค่าวิ่งใหม่ได้
    //
    // ต่างกันตรงที่ตอนนี้หา stage จาก **event** ไม่ใช่จากสถานะปลายทาง — แอปไม่รู้
    // ปลายทางล่วงหน้าอีกแล้ว และไม่ควรรู้
    const stage = EVENT_CHECKPOINT_STAGE[event];
    let prefetched: { gps: GpsFix | null; gpsStatus: GpsStatus; target?: CheckpointTarget | null; selfConfirmed?: boolean } | undefined;
    if (stage) {
      const cpConfig = getCheckpointForStage(stage);
      if (cpConfig.verify.target !== 'none') {
        const { gps, status: gpsStatus } = await capturePosition();
        let target: CheckpointTarget | null = null;
        try {
          target = await resolveCheckpointTarget(
            cpConfig.verify, gps, job ? { cust_lat: job.cust_lat, cust_lng: job.cust_lng } : null,
          );
        } catch (e) {
          console.error('Failed to resolve checkpoint target:', e);
        }
        let selfConfirmed = false;
        if (gps && target) {
          const away = distanceMeters(gps.lat, gps.lng, target.lat, target.lng);
          if (away > cpConfig.verify.thresholdM) {
            const shown = away >= 1000 ? `${(away / 1000).toFixed(1)} กม.` : `${away} ม.`;
            const ok = window.confirm(
              `ตอนนี้คุณอยู่ห่างจาก${target.label} ${shown}\n\n` +
              `ยืนยันว่า "${STAGE_LABEL_TH[cpConfig.stage]}" แล้วจริงไหม?\n\n` +
              'OK = ใช่ ถึงแล้ว (บันทึกพร้อมหมายเหตุว่าคุณยืนยันเอง)\n' +
              'Cancel = ยังไม่ถึง กดพลาด (ไม่บันทึกอะไรเลย)'
            );
            if (!ok) {
              toast.info('ยกเลิกแล้ว — ยังไม่เปลี่ยนสถานะ กดใหม่อีกครั้งเมื่อถึงจุดหมาย');
              return false;
            }
            selfConfirmed = true;
          }
        }
        prefetched = { gps, gpsStatus, target, selfConfirmed };
      }
    }

    try {
      const call = httpsCallable(functions, 'transitionJob');
      const res = await call({ jobId, event, reason: logMsg, patch: extraData });
      const to = (res?.data as { to?: string } | null)?.to;

      // checkpoint เขียนหลัง transition สำเร็จ และเขียนด้วย stage ที่รู้ตั้งแต่ต้น
      // ไม่ใช่สถานะที่ server คืนมา — ถ้าวันหนึ่ง engine เปลี่ยนปลายทางของ event
      // ไทม์ไลน์ต้องยังบันทึกว่า "ไรเดอร์ทำอะไร" ที่เดิม
      if (stage) void recordStatusCheckpoint(jobId, { stage }, job, prefetched);

      if (to) notifyStatusChange(to, jobId, job);
      return true;
    } catch (error) {
      const err = error as { code?: string; message?: string } | null;
      const code = engineErrorCode(error);
      // log ให้ครบทั้งรหัสของ engine และของ callable — เวลาไรเดอร์โทรมาแจ้ง
      // "กดแล้วไม่ไป" สิ่งที่ต้องรู้คือ engine ปฏิเสธด้วยเหตุอะไร
      console.error(`runTransition ${event} failed:`, code || err?.code, err?.message);
      toast.error(transitionErrorMessage(code, err?.message));
      return false;
    }
  };

  /**
   * Atomically claim a broadcast or assigned job. Two riders tapping
   * "รับงาน" within milliseconds of each other previously raced each other
   * via plain update() — last write wins, the loser thinks they got the job
   * but the DB belongs to the other rider.
   *
   * runTransaction() reads the live job state inside Firebase's optimistic
   * lock, decides whether the rider is still allowed to claim it, and only
   * commits if so. The loser sees `result.committed === false` and gets a
   * "งานนี้ถูกไรเดอร์คนอื่นรับไปแล้ว" toast.
   */
  const acceptIncomingJob = async (
    job: any
  ): Promise<{ success: boolean; reason?: 'taken' | 'not_found' | 'wrong_status' | 'error' }> => {
    if (!job?.id) {
      toast.error('ไม่พบงานนี้');
      return { success: false, reason: 'not_found' };
    }

    const updatedLogs = [
      {
        action: 'Accepted',
        by: `Rider: ${riderInfo.name}`,
        timestamp: Date.now(),
        details: 'ไรเดอร์กดรับงาน'
      },
      ...(job.qc_logs || [])
    ];

    try {
      const result = await runTransaction(ref(db, `jobs/${job.id}`), (current) => {
        if (current === null) {
          // Job was deleted between fetch and click — abort.
          return current;
        }

        const canonical = normalizeStatus(current.status, current.receive_method);

        if (canonical === JOB_STATUS.ACTIVE_LEAD) {
          // Broadcast: only the first rider without rider_id wins.
          if (current.rider_id) return undefined;
        } else if (canonical === JOB_STATUS.RIDER_ASSIGNED) {
          // Direct assignment: only the assigned rider may claim it.
          if (current.rider_id !== riderInfo.id) return undefined;
        } else {
          // Wrong status (cancelled, accepted by someone else, ...) — abort.
          return undefined;
        }

        return {
          ...current,
          status: JOB_STATUS.RIDER_ACCEPTED,
          rider_id: riderInfo.id,
          updated_at: Date.now(),
          qc_logs: updatedLogs
        };
      });

      if (!result.committed) {
        toast.error('งานนี้ถูกไรเดอร์คนอื่นรับไปแล้ว');
        return { success: false, reason: 'taken' };
      }

      const shortJobId = job.id.slice(-4).toUpperCase();
      sendAdminNotification(
        'ไรเดอร์รับงาน',
        `${riderInfo.name} กำลังเดินทางไปจุดหมาย งาน #${shortJobId}`
      );
      sendCustomerNotification(
        job,
        'จัดสรรไรเดอร์สำเร็จ!',
        `ไรเดอร์ ${riderInfo.name} กำลังเตรียมตัวเดินทางไปหาคุณ`
      );

      // Stamp accepted_at on the offer log so dashboard acceptance rate
      // is correct. Fire-and-forget — non-fatal if it errors.
      markOfferAccepted(job.id, riderInfo.id);

      // การกดรับงานคือการเปลี่ยนสถานะเป็น Rider Accepted ซึ่งเป็นจุดเช็คอิน
      // `rider_accepted` — แต่เส้นทางนี้ใช้ runTransaction ไม่ได้ผ่าน
      // updateStatus จึง **ไม่เคยเขียน checkpoint นั้นเลย** ตั้งแต่ต้น
      // (recordCheckpoint มี call site เดียวคือใน updateStatus)
      //
      // ผลที่ตามมาซึ่งมองไม่เห็นจากโค้ด: `totalJobMs()` ใน jobTimeline.ts เริ่ม
      // นับจาก rider_accepted เสมอ เมื่อจุดนั้นไม่มีอยู่จริง มันคืน null ทุกใบ
      // แถว "รวม X นาที" ในหน้าประวัติจึงไม่เคยขึ้นให้ใครเห็นเลย และไทม์ไลน์ใน
      // หน้า /rider-performance ของแอดมินขาดขั้นแรกทุกงาน
      void recordStatusCheckpoint(job.id, { status: JOB_STATUS.RIDER_ACCEPTED }, job);

      return { success: true };
    } catch (error: any) {
      console.error('acceptIncomingJob error:', error);
      const msg =
        error?.code === 'PERMISSION_DENIED'
          ? 'ไม่มีสิทธิ์อัปเดตข้อมูล กรุณาลองใหม่หรือติดต่อแอดมิน'
          : `เกิดข้อผิดพลาดในการรับงาน: ${error?.message || error}`;
      toast.error(msg);
      return { success: false, reason: 'error' };
    }
  };

  const handleRejectOrCancelJob = async (
    rejectingJob: any,
    cancelCategory: CancelCategory,
    cancelDetail: string,
    incomingList: any[],
    onDone: () => void
  ) => {
    if (!rejectingJob || !cancelCategory) {
      toast.error('กรุณาเลือกหมวดเหตุผลการยกเลิก/ปฏิเสธงานครับ');
      return;
    }

    const categoryLabel = CANCEL_CATEGORY_LABEL_TH[cancelCategory];
    const fullReason = cancelDetail
      ? `${categoryLabel} — ${cancelDetail}`
      : categoryLabel;

    // The Firebase RTDB rule on /jobs/{jobId} only allows a write when
    // either the existing rider_id OR the new rider_id matches auth.uid.
    // For a true broadcast job (rider_id is null and we're not the
    // assignee yet) BOTH would be null — the rule denies the write.
    //
    // Treat that case as a local dismiss: the rider isn't holding the
    // job, so there's nothing to release back to the pool. Other riders
    // continue to see it untouched. Only when the rider already owns
    // the job (broadcast they accepted, or admin direct-assignment) do
    // we actually write the cancel taxonomy.
    const isHoldingJob = rejectingJob.rider_id === riderInfo.id;
    const isIncoming = incomingList.some((j) => j.id === rejectingJob.id);

    if (!isHoldingJob) {
      toast.success('ข้ามงานนี้แล้ว');
      onDone();
      return;
    }

    const updatedLogs = [
      {
        action: isIncoming ? 'Rider Rejected' : 'Rider Cancelled',
        by: `Rider: ${riderInfo.name}`,
        timestamp: Date.now(),
        details: `ไรเดอร์${isIncoming ? 'ปฏิเสธรับงาน' : 'ยกเลิกงานกลางทาง'} เหตุผล: ${fullReason}`
      },
      ...(rejectingJob.qc_logs || [])
    ];

    try {
      await update(ref(db, `jobs/${rejectingJob.id}`), {
        // Park at Following Up (sales phase) so admin can decide what to
        // do next — re-broadcast, call the customer, or confirm cancel.
        // Do NOT route back to Active Leads here, even though that would
        // re-broadcast immediately, because:
        //   - the rider who just bailed would see the same job bounce
        //     back into their incoming list
        //   - other riders get a fresh notification for a job that
        //     might still be cancelled by admin
        //   - customer state is unclear and admin should call first
        // Admin's "Re-broadcast" action explicitly moves it to
        // Active Leads when they're ready (see bkk-system PR #123).
        status: JOB_STATUS.FOLLOWING_UP,
        rider_id: null,
        updated_at: Date.now(),
        qc_logs: updatedLogs,
        // Cancel taxonomy (PR-5B schema).
        cancel_category: cancelCategory,
        cancel_reason: cancelDetail || null,
        cancelled_by: `rider:${riderInfo.id}`,
        cancelled_at: Date.now()
      });

      sendAdminNotification(
        'ไรเดอร์ยกเลิกงาน!',
        `${riderInfo.name} ได้ยกเลิก/ปฏิเสธงาน #${rejectingJob.id.slice(-4)} (${fullReason})`
      );

      // Stamp rejected_at on the offer log only when this was an
      // incoming-list rejection (rider hadn't started the job yet).
      // Mid-route cancels are a different signal — they belong to
      // the rider_cancelled bucket on the dashboard, not the
      // offer-decline bucket.
      if (isIncoming) {
        markOfferRejected(rejectingJob.id, riderInfo.id);
      }

      onDone();
    } catch (error: any) {
      console.error('handleRejectOrCancelJob error:', error);
      const msg =
        error?.code === 'PERMISSION_DENIED'
          ? 'ไม่มีสิทธิ์ยกเลิกงานนี้ กรุณาติดต่อแอดมิน'
          : `เกิดข้อผิดพลาดในการยกเลิกงาน: ${error?.message || error}`;
      toast.error(msg);
    }
  };

  const handleRevertInspection = async (
    job: any,
    jobLists: { activeList: any[]; incomingList: any[] }
  ) => {
    if (!job || job.status !== 'QC Review') {
      toast.error('ไม่สามารถย้อนกลับได้ แอดมินเริ่มดำเนินการกับงานนี้แล้ว');
      return;
    }
    try {
      const currentDevices = Array.isArray(job.devices) ? job.devices : [];
      const revertedDevices = currentDevices.map((d: any) => {
        const { photos, deductions, inspection_status, ...rest } = d;
        return rest;
      });

      await updateStatus(
        job.id,
        'Being Inspected',
        'ไรเดอร์ย้อนกลับเพื่อแก้ไขผลตรวจสภาพ',
        { devices: revertedDevices, inspected_at: null },
        jobLists
      );
      toast.success('ย้อนกลับเรียบร้อย กรุณาตรวจสภาพและส่งใหม่อีกครั้ง');
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาด: ' + (e?.message || e));
    }
  };

  const handleCompleteJob = async (job: any, jobLists: { activeList: any[]; incomingList: any[] }) => {
    try {
      // Don't write rider_fee here — the `onJobHandedOverCalcRiderFee`
      // Cloud Function (triggered by status → Pending QC) calculates the
      // real fee from Google Routes distance × logistics_rates and
      // skips if rider_fee is already set. Hardcoding 150 made every
      // job fall back to that fixed amount and starved the wallet.
      // Just mark the job ready for settlement and let the function
      // compute the actual fee.
      const ok = await runTransition(
        job.id,
        RIDER_EVENT.RETURN_ARRIVED,
        'ไรเดอร์ส่งมอบเครื่องเข้าสาขาเรียบร้อยแล้ว',
        { completed_at: Date.now(), rider_fee_status: 'Pending' },
        jobLists
      );
      // engine ปฏิเสธ = แจ้งไปแล้วใน runTransition ห้ามขึ้น "ปิดจ๊อบสำเร็จ" ทับ
      if (!ok) return;
      toast.success('ปิดจ๊อบสำเร็จ! ส่งมอบเครื่องเรียบร้อย');
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด: ' + e);
    }
  };

  const handleOpenNavigation = (job: any) => {
    // Prefer the customer's pinned coordinates over the address text.
    // Reverse-geocoded addresses (especially upcountry / Tambon-level
    // ones like "1, Tambon Bang Nang, Amphoe Phan Thong, ...") are
    // ambiguous — Google Maps text search returns multiple unrelated
    // matches and rider ends up at the wrong door. The lat/lng was
    // captured at checkout (validateAndCreateOrder writes cust_lat +
    // cust_lng on the job) so use it directly when available.
    const lat = typeof job.cust_lat === 'number' ? job.cust_lat : null;
    const lng = typeof job.cust_lng === 'number' ? job.cust_lng : null;
    if (lat !== null && lng !== null) {
      // Directions URL = one-tap nav (Google Maps opens in directions
      // mode with the destination already set; rider taps "Start").
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
      return;
    }
    const targetAddress = job.cust_address || job.address;
    if (!targetAddress) return toast.error('ไม่พบพิกัดหรือที่อยู่สำหรับนำทาง');
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetAddress)}`, '_blank');
  };

  const handleCallCustomer = (job: any) => {
    const phone = job.cust_phone || job.customer_phone || job.phone;
    if (!phone) return toast.error('ไม่พบเบอร์โทรศัพท์ของลูกค้า');
    window.location.href = `tel:${phone}`;
  };

  // คำขอถอนผ่าน callable เท่านั้น — server เป็นคนตรวจยอดจริงจาก ledger
  // (client เช็คก่อนแค่เพื่อ UX) และ rules ปิด client write ที่ /withdrawals
  // สนิท ท่อเดิมที่ push ตรงถูกปฏิเสธเงียบมาตลอด (ดูแผนเฟส 4 ใน docs/reports)
  const handleRequestWithdraw = async (
    withdrawAmount: string, availableBalance: number, riderInfoData: RiderInfo, onDone: () => void
  ) => {
    const amount = Number(withdrawAmount);
    if (!Number.isInteger(amount) || amount < 100) return toast.error('ระบุยอดถอนเป็นจำนวนเต็ม ขั้นต่ำ 100 บาท');
    if (amount > availableBalance) return toast.error('ยอดเงินไม่เพียงพอ');
    try {
      await httpsCallable(functions, 'riderRequestWithdraw')({ amount });
      sendAdminNotification('คำขอถอนเงิน', `ไรเดอร์ ${riderInfoData.name} ขอเบิกเงิน ${formatCurrency(amount)}`);
      toast.success('ส่งคำขอถอนเงินสำเร็จ! รอฝ่ายการเงินโอนเข้าบัญชี');
      onDone();
    } catch (e: any) {
      // HttpsError จาก server มีข้อความไทยพร้อมใช้ (ยอดไม่พอ/มีคำขอค้าง)
      toast.error(e?.message || 'เกิดข้อผิดพลาดในการส่งคำขอถอนเงิน');
    }
  };

  const reportDiscrepancy = async (
    jobId: string, category: string, detail: string, imageFile: File | null
  ) => {
    const categoryLabel = DISCREPANCY_CATEGORIES.find(c => c.id === category)?.label || category;
    let imageUrl: string | undefined;

    if (imageFile) {
      imageUrl = await uploadImageToFirebase(imageFile, `jobs/${jobId}/discrepancy`);
    }

    const reportRef = push(ref(db, `jobs/${jobId}/discrepancy_reports`));
    await set(reportRef, {
      category,
      detail: detail || '',
      imageUrl: imageUrl || null,
      reported_by: `Rider: ${riderInfo.name}`,
      reported_at: Date.now(),
      status: 'pending'
    });

    // Add QC log entry
    const jobRef = ref(db, `jobs/${jobId}`);
    await update(jobRef, {
      updated_at: Date.now(),
      has_pending_discrepancy: true
    });

    const shortJobId = jobId.slice(-4).toUpperCase();
    sendAdminNotification(
      'ด่วน! ข้อมูลไม่ตรง',
      `ไรเดอร์ ${riderInfo.name} แจ้งข้อมูลไม่ตรงในงาน #${shortJobId}: ${categoryLabel}${detail ? ` - ${detail}` : ''}`
    );
  };

  /**
   * Persist customer KYC capture taken at pickup.
   *
   * The full KYC record (sensitive — ID number, photos, signature) is written
   * to `/jobs_kyc/{jobId}` which has strict RTDB read rules: only admins and
   * the assigned rider can read it. The job document at `/jobs/{id}` keeps
   * just two non-sensitive flags (`kyc_verified_at`, `kyc_method`) so the
   * dashboard can index/filter without exposing PII.
   *
   * Both writes are issued via a single multi-path update so they're
   * atomic — either both land or both reject.
   *
   * The fallback path (typed-only, no card) fires a fraud_suspected-style
   * notification so the case shows up in the admin review queue.
   */
  const submitKYC = async (
    job: any,
    payload: Omit<KYCRecord, 'verified_at' | 'verified_by_rider_uid' | 'verified_by_rider_name'>,
  ) => {
    if (!job?.id) throw new Error('ไม่พบงาน');
    const now = Date.now();
    const record: KYCRecord = {
      ...payload,
      verified_at: now,
      verified_by_rider_uid: riderInfo.id,
      verified_by_rider_name: riderInfo.name,
    };

    const detail = payload.method === 'photo'
      ? `ยืนยันตัวตนด้วยภาพถ่ายบัตรประชาชน`
      : `ยืนยันตัวตนแบบไม่มีบัตร (${KYC_FALLBACK_REASON_LABEL_TH[payload.fallback_reason!] || 'ไม่ระบุ'})${payload.fallback_detail ? ` — ${payload.fallback_detail}` : ''}`;

    const updatedLogs = [
      { action: 'KYC Verified', by: `Rider: ${riderInfo.name}`, timestamp: now, details: detail },
      ...(job.qc_logs || []),
    ];

    // Multi-path update — full record to /jobs_kyc, flags + audit to /jobs
    await update(ref(db), {
      [`jobs_kyc/${job.id}`]: record,
      [`jobs/${job.id}/kyc_verified_at`]: now,
      [`jobs/${job.id}/kyc_method`]: payload.method,
      [`jobs/${job.id}/qc_logs`]: updatedLogs,
      [`jobs/${job.id}/updated_at`]: now,
    });

    const shortJobId = job.id.slice(-4).toUpperCase();
    if (payload.method === 'typed_fallback') {
      sendAdminNotification(
        'KYC ผิดปกติ! รอตรวจสอบ',
        `งาน #${shortJobId} ลูกค้าไม่มีบัตรประชาชน — กรุณาตรวจสอบลายเซ็นและข้อมูลที่ไรเดอร์บันทึก`,
      );
    } else {
      sendAdminNotification(
        'บันทึก KYC แล้ว',
        `${riderInfo.name} บันทึก KYC ลูกค้าสำหรับงาน #${shortJobId} เรียบร้อย`,
      );
    }
  };

  return {
    updateStatus, runTransition, acceptIncomingJob, handleRejectOrCancelJob, handleCompleteJob,
    handleRevertInspection, submitKYC,
    handleOpenNavigation, handleCallCustomer, handleRequestWithdraw,
    reportDiscrepancy
  };
};
