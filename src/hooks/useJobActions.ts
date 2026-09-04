// src/hooks/useJobActions.ts
import { ref, update, push, set } from 'firebase/database';
import { db, functions } from '../api/firebase';
import { httpsCallable } from 'firebase/functions';
import { isUnauthenticatedError, notifySessionLost } from '../utils/sessionState';
import { sendAdminNotification } from '../utils/notifications';
import { uploadImageToFirebase } from '../utils/uploadImage';
import { formatCurrency } from '../utils/formatters';
import type { RiderInfo, KYCRecord } from '../types';
import { DISCREPANCY_CATEGORIES, KYC_FALLBACK_REASON_LABEL_TH } from '../types';
import { JOB_STATUS, CANCEL_CATEGORY_LABEL_TH } from '../types/job-statuses';
import { canonicalStatus, statusIs } from '../utils/statusCompare';
import type { CancelCategory } from '../types/job-statuses';
import { toast } from '../components/common/Toast';
import { getCheckpointForStage, recordCheckpoint, resolveCheckpointTarget, STAGE_LABEL_TH } from '../utils/checkpoints';
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
    where: { stage?: CheckpointStage },
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

    // `next` is the canonical form of whatever the caller passed — a stale
    // call site still using a legacy spelling lands on the same branch.
    const next = canonicalStatus(nextStatus);
    if (next === JOB_STATUS.RIDER_ACCEPTED) {
      sendAdminNotification('ไรเดอร์รับงาน', `${riderInfo.name} กำลังเดินทางไปจุดหมาย งาน #${shortJobId}`);
      sendCustomerNotification(job, 'จัดสรรไรเดอร์สำเร็จ!', `ไรเดอร์ ${riderInfo.name} กำลังเตรียมตัวเดินทางไปหาคุณ`);
    } else if (next === JOB_STATUS.RIDER_EN_ROUTE) {
      sendAdminNotification('ไรเดอร์ออกเดินทาง', `${riderInfo.name} กำลังมุ่งหน้าไปหาลูกค้า งาน #${shortJobId}`);
      sendCustomerNotification(job, 'ไรเดอร์กำลังเดินทาง!', `ไรเดอร์ ${riderInfo.name} กำลังมุ่งหน้าไปยังจุดนัดรับเครื่องของคุณแล้ว`);
    } else if (next === JOB_STATUS.RIDER_ARRIVED) {
      sendAdminNotification('ถึงจุดหมาย', `${riderInfo.name} เดินทางถึงจุดหมายแล้ว งาน #${shortJobId}`);
      sendCustomerNotification(job, 'ไรเดอร์มาถึงแล้ว!', `ไรเดอร์เดินทางถึงจุดนัดหมายแล้ว กรุณาเตรียมตัวเครื่องให้พร้อมครับ`);
    } else if (next === JOB_STATUS.BEING_INSPECTED) {
      sendAdminNotification('เริ่มตรวจสภาพ', `${riderInfo.name} เริ่มตรวจสภาพเครื่อง งาน #${shortJobId}`);
      sendCustomerNotification(job, 'กำลังตรวจสภาพเครื่อง', `ไรเดอร์กำลังดำเนินการตรวจสอบสภาพเครื่องของคุณอย่างละเอียด`);
    } else if (next === JOB_STATUS.QC_REVIEW) {
      sendAdminNotification('ด่วน! รออนุมัติ QC', `${riderInfo.name} ส่งรูปตรวจเครื่อง #${shortJobId} เข้ามาแล้ว`);
      sendCustomerNotification(job, 'รออนุมัติราคา', `ช่างเทคนิคกำลังประเมินภาพถ่ายตัวเครื่องของคุณ กรุณารอสักครู่ครับ`);
    } else if (next === JOB_STATUS.RIDER_RETURNING) {
      sendAdminNotification('กำลังกลับสาขา', `${riderInfo.name} กำลังนำเครื่อง #${shortJobId} กลับมาส่ง`);
    } else if (next === JOB_STATUS.PENDING_QC) {
      sendAdminNotification('ส่งมอบเครื่องสำเร็จ', `${riderInfo.name} จบงานและส่งเครื่อง #${shortJobId} เข้าสาขาเรียบร้อย`);
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
    jobLists: JobLists,
    // แปลงรหัสปฏิเสธเป็นข้อความของเส้นทางนั้นๆ — บางปุ่มมีคำที่ตรงกว่าค่ากลาง
    // (เช่น "งานนี้ถูกไรเดอร์คนอื่นรับไปแล้ว" ซึ่งบอกไรเดอร์ได้ตรงกว่า
    // "งานนี้ไม่ได้อยู่ในมือคุณแล้ว") คืน null = ใช้ข้อความกลาง
    errorFor?: (code: string | null) => string | null
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

      // ดัก **ก่อน** engineErrorCode: error ที่ถูกปฏิเสธที่ชั้น auth ไม่มี
      // `details` ที่ engine ใส่มา engineErrorCode จึงคืน null แล้วข้อความตกไป
      // ที่ "เกิดข้อผิดพลาด กรุณาลองใหม่" — คำแนะนำที่ไม่มีวันสำเร็จ เพราะการ
      // ลองใหม่ด้วย token เดิมก็โดนปฏิเสธเหมือนเดิมทุกครั้ง (หลักการข้อ 4)
      if (isUnauthenticatedError(error)) {
        console.error(`runTransition ${event} rejected: unauthenticated`);
        const riderIdForLog =
          typeof job?.rider_id === 'string' ? job.rider_id : localStorage.getItem('rider_id');
        notifySessionLost(riderIdForLog, 'firebase_session_lost', {
          source: 'callable:transitionJob',
          event,
        });
        return false;
      }

      const code = engineErrorCode(error);
      // log ให้ครบทั้งรหัสของ engine และของ callable — เวลาไรเดอร์โทรมาแจ้ง
      // "กดแล้วไม่ไป" สิ่งที่ต้องรู้คือ engine ปฏิเสธด้วยเหตุอะไร
      console.error(`runTransition ${event} failed:`, code || err?.code, err?.message);
      toast.error(errorFor?.(code) || transitionErrorMessage(code, err?.message));
      return false;
    }
  };

  /**
   * รับงาน — ย้ายการแย่งงานไปตัดสินฝั่ง server
   *
   * เดิมใช้ `runTransaction` ในเบราว์เซอร์: อ่านสถานะสด ตรวจว่ายังรับได้ไหม
   * แล้วค่อย commit ซึ่งกันไรเดอร์สองคนกดพร้อมกันได้จริง แต่กติกาว่า "ใครรับ
   * ได้บ้าง" อยู่ในเครื่องของไรเดอร์ — ใครยิง RTDB ตรงก็เขียนทับได้ และ
   * กติกานั้นถูกก๊อปไว้คนละที่กับ engine
   *
   * ตอนนี้ transaction ยังมีอยู่ แต่ไปอยู่ใน `applyTransition` ฝั่ง server
   * พร้อม `riderOwnershipGuard` ที่รันอยู่ **ข้างใน** transaction เดียวกัน —
   * `rider_accepted` อยู่ใน CLAIMING_EVENTS จึงผ่านได้เมื่องานยังไม่มีเจ้าของ
   * และถูกปฏิเสธทันทีถ้ามีไรเดอร์คนอื่นถืออยู่แล้ว. คนที่แพ้ได้
   * `not_job_owner` แทนที่จะได้ `committed === false` — ข้อความถึงไรเดอร์
   * เหมือนเดิมทุกตัวอักษร
   */
  const acceptIncomingJob = async (
    job: any
  ): Promise<{ success: boolean; reason?: 'taken' | 'not_found' | 'wrong_status' | 'error' }> => {
    if (!job?.id) {
      toast.error('ไม่พบงานนี้');
      return { success: false, reason: 'not_found' };
    }

    let taken = false;
    const ok = await runTransition(
      job.id,
      RIDER_EVENT.ACCEPTED,
      'ไรเดอร์กดรับงาน',
      // rider_id ไปกับ patch จึงถูกเขียน **ข้างใน** transaction เดียวกับสถานะ
      // ไม่ใช่ write ที่สองซึ่งเป็นช่องให้แพ้การแย่งงานแบบเงียบๆ
      { rider_id: riderInfo.id },
      // งานยังไม่อยู่ใน activeList (เพิ่งรับ) — ส่งตัวมันเองเข้าไปเพื่อให้
      // ขั้นบันทึก checkpoint หา job เจอ. stage `rider_accepted` ไม่เทียบพิกัด
      // (target 'none') จึงไม่มีการขอ GPS หรือถามยืนยันในเส้นทางนี้
      { activeList: [job], incomingList: [] },
      (code) => {
        // แพ้การแย่งงาน มาได้สองรหัส: มีเจ้าของแล้ว (not_job_owner) หรือ
        // สถานะเดินไปข้างหน้าแล้วเพราะคนอื่นรับไปก่อน (illegal_from)
        if (code === 'not_job_owner' || code === 'illegal_from') {
          taken = true;
          return 'งานนี้ถูกไรเดอร์คนอื่นรับไปแล้ว';
        }
        return null;
      }
    );

    if (!ok) return { success: false, reason: taken ? 'taken' : 'error' };

    // แจ้งเตือนแอดมิน/ลูกค้าถูกยิงโดย notifyStatusChange ใน runTransition แล้ว
    // (สถานะปลายทาง Rider Accepted) เหลือแค่ประทับเวลาบน offer log ซึ่งเป็น
    // ของนอกงาน — fire-and-forget ตามเดิม พังแล้วไม่กระทบการรับงาน
    markOfferAccepted(job.id, riderInfo.id);

    return { success: true };
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

    // เหตุผลที่ไรเดอร์เลือกยังต้องไปกับ patch — engine เป็นคนตัดสิน "ไปสถานะไหน"
    // แต่ "ทำไม" เป็นข้อมูลของงาน ไม่ใช่ของ state machine. ใช้ชื่อฟิลด์ชุด
    // withdraw_* แยกจาก cancel_* ที่ยังสงวนไว้ให้การยกเลิกดีลจริง
    const ok = await runTransition(
      rejectingJob.id,
      RIDER_EVENT.WITHDREW,
      `ไรเดอร์${isIncoming ? 'ปฏิเสธรับงาน' : 'ยกเลิกงานกลางทาง'} เหตุผล: ${fullReason}`,
      {
        withdraw_category: cancelCategory,
        withdraw_reason: cancelDetail || null,
      },
      { activeList: [rejectingJob], incomingList: [] }
    );
    if (!ok) return;

    // engine ล้าง rider_id ให้แล้วผ่าน clears และประทับ withdrawn_at/withdrawn_by
    // จากตัวตนที่ยืนยันแล้ว — ไคลเอนต์ไม่ต้องเขียนอะไรเพิ่ม
    sendAdminNotification(
      'ไรเดอร์ยกเลิกงาน!',
      `${riderInfo.name} ได้ยกเลิก/ปฏิเสธงาน #${rejectingJob.id.slice(-4)} (${fullReason})`
    );

    // ประทับ rejected_at บน offer log เฉพาะตอนปฏิเสธจากคิวงานเข้า (ยังไม่เริ่มงาน)
    // การยกเลิกกลางทางเป็นสัญญาณคนละตัว อยู่ถัง rider_cancelled ของ dashboard
    // ไม่ใช่ถัง offer-decline
    if (isIncoming) {
      markOfferRejected(rejectingJob.id, riderInfo.id);
    }

    onDone();
  };

  const handleRevertInspection = async (
    job: any,
    jobLists: { activeList: any[]; incomingList: any[] }
  ) => {
    // เช็คสถานะฝั่ง client ไว้เพื่อไม่ให้ยิงไปโดนปฏิเสธในเคสที่รู้อยู่แล้ว —
    // แต่ตัวที่ตัดสินจริงคือ engine (from: [QC Review] + blockedWhenPaid) ซึ่ง
    // เห็นสถานะสด ไม่ใช่สำเนาที่หน้าจอถืออยู่
    if (!job || !statusIs(job, JOB_STATUS.QC_REVIEW)) {
      toast.error('ไม่สามารถย้อนกลับได้ แอดมินเริ่มดำเนินการกับงานนี้แล้ว');
      return;
    }

    const currentDevices = Array.isArray(job.devices) ? job.devices : [];
    const revertedDevices = currentDevices.map((d: any) => {
      const { photos, deductions, inspection_status, ...rest } = d;
      return rest;
    });

    const ok = await runTransition(
      job.id,
      RIDER_EVENT.INSPECTION_REVERTED,
      'ไรเดอร์ย้อนกลับเพื่อแก้ไขผลตรวจสภาพ',
      { devices: revertedDevices, inspected_at: null },
      jobLists
    );
    if (!ok) return;
    toast.success('ย้อนกลับเรียบร้อย กรุณาตรวจสภาพและส่งใหม่อีกครั้ง');
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
      if (isUnauthenticatedError(e)) {
        notifySessionLost(localStorage.getItem('rider_id'), 'firebase_session_lost', {
          source: 'callable:riderRequestWithdraw',
        });
        return;
      }
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
    runTransition, acceptIncomingJob, handleRejectOrCancelJob, handleCompleteJob,
    handleRevertInspection, submitKYC,
    handleOpenNavigation, handleCallCustomer, handleRequestWithdraw,
    reportDiscrepancy
  };
};
