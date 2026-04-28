// src/hooks/useJobActions.ts
import { ref, update, push, set, runTransaction } from 'firebase/database';
import { db } from '../api/firebase';
import { sendAdminNotification } from '../utils/notifications';
import { uploadImageToFirebase } from '../utils/uploadImage';
import { formatCurrency } from '../utils/formatters';
import type { RiderInfo } from '../types';
import { DISCREPANCY_CATEGORIES } from '../types';
import { JOB_STATUS, normalizeStatus } from '../types/job-statuses';
import { toast } from '../components/common/Toast';

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

  const updateStatus = async (
    jobId: string, nextStatus: string, logMsg: string, extraData = {},
    jobLists: { activeList: any[]; incomingList: any[] }
  ) => {
    const job = jobLists.activeList.find(j => j.id === jobId) || jobLists.incomingList.find(j => j.id === jobId);
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
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          await update(ref(db, `riders/${riderInfo.id}`), {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            last_updated: Date.now()
          });
        } catch (e) {
          console.error('Failed to update rider location:', e);
        }
      }, (err) => console.error('Geolocation error on status change:', err),
      { enableHighAccuracy: true });

      const shortJobId = jobId.slice(-4).toUpperCase();

      if (nextStatus === 'Accepted') {
        sendAdminNotification('ไรเดอร์รับงาน', `${riderInfo.name} กำลังเดินทางไปจุดหมาย งาน #${shortJobId}`);
        sendCustomerNotification(job, 'จัดสรรไรเดอร์สำเร็จ!', `ไรเดอร์ ${riderInfo.name} กำลังเตรียมตัวเดินทางไปหาคุณ`);
      } else if (nextStatus === 'Heading to Customer') {
        sendAdminNotification('ไรเดอร์ออกเดินทาง', `${riderInfo.name} กำลังมุ่งหน้าไปหาลูกค้า งาน #${shortJobId}`);
        sendCustomerNotification(job, 'ไรเดอร์กำลังเดินทาง!', `ไรเดอร์ ${riderInfo.name} กำลังมุ่งหน้าไปยังจุดนัดรับเครื่องของคุณแล้ว`);
      } else if (nextStatus === 'Arrived') {
        sendAdminNotification('ถึงจุดหมาย', `${riderInfo.name} เดินทางถึงจุดหมายแล้ว งาน #${shortJobId}`);
        sendCustomerNotification(job, 'ไรเดอร์มาถึงแล้ว!', `ไรเดอร์เดินทางถึงจุดนัดหมายแล้ว กรุณาเตรียมตัวเครื่องให้พร้อมครับ`);
      } else if (nextStatus === 'Being Inspected') {
        sendAdminNotification('เริ่มตรวจสภาพ', `${riderInfo.name} เริ่มตรวจสภาพเครื่อง งาน #${shortJobId}`);
        sendCustomerNotification(job, 'กำลังตรวจสภาพเครื่อง', `ไรเดอร์กำลังดำเนินการตรวจสอบสภาพเครื่องของคุณอย่างละเอียด`);
      } else if (nextStatus === 'QC Review') {
        sendAdminNotification('ด่วน! รออนุมัติ QC', `${riderInfo.name} ส่งรูปตรวจเครื่อง #${shortJobId} เข้ามาแล้ว`);
        sendCustomerNotification(job, 'รออนุมัติราคา', `ช่างเทคนิคกำลังประเมินภาพถ่ายตัวเครื่องของคุณ กรุณารอสักครู่ครับ`);
      } else if (nextStatus === 'In-Transit') {
        sendAdminNotification('กำลังกลับสาขา', `${riderInfo.name} กำลังนำเครื่อง #${shortJobId} กลับมาส่ง`);
      } else if (nextStatus === 'Pending QC') {
        sendAdminNotification('ส่งมอบเครื่องสำเร็จ', `${riderInfo.name} จบงานและส่งเครื่อง #${shortJobId} เข้าสาขาเรียบร้อย`);
      }
    } catch (error: any) {
      console.error('updateStatus error:', error);
      const msg = error?.code === 'PERMISSION_DENIED'
        ? 'ไม่มีสิทธิ์อัปเดตข้อมูล กรุณาลองใหม่หรือติดต่อแอดมิน'
        : `เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ${error?.message || error}`;
      toast.error(msg);
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
          status: 'Accepted',
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

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await update(ref(db, `riders/${riderInfo.id}`), {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              last_updated: Date.now()
            });
          } catch (e) {
            console.error('Failed to update rider location after accept:', e);
          }
        },
        (err) => console.error('Geolocation error on accept:', err),
        { enableHighAccuracy: true }
      );

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
    rejectingJob: any, selectedRejectReason: string,
    incomingList: any[], onDone: () => void
  ) => {
    if (!rejectingJob || !selectedRejectReason) {
      toast.error('กรุณาเลือกเหตุผลการยกเลิก/ปฏิเสธงานครับ');
      return;
    }

    const isIncoming = incomingList.some(j => j.id === rejectingJob.id);
    const updatedLogs = [
      {
        action: isIncoming ? 'Rider Rejected' : 'Rider Cancelled',
        by: `Rider: ${riderInfo.name}`,
        timestamp: Date.now(),
        details: `ไรเดอร์${isIncoming ? 'ปฏิเสธรับงาน' : 'ยกเลิกงานกลางทาง'} เหตุผล: ${selectedRejectReason}`
      },
      ...(rejectingJob.qc_logs || [])
    ];

    await update(ref(db, `jobs/${rejectingJob.id}`), {
      status: 'Active Leads', rider_id: null,
      updated_at: Date.now(), qc_logs: updatedLogs, cancel_reason: selectedRejectReason
    });

    sendAdminNotification('ไรเดอร์ยกเลิกงาน!', `${riderInfo.name} ได้ยกเลิก/ปฏิเสธงาน #${rejectingJob.id.slice(-4)} (${selectedRejectReason})`);
    onDone();
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
      await updateStatus(job.id, 'Pending QC', 'ไรเดอร์ส่งมอบเครื่องเข้าสาขาเรียบร้อยแล้ว', {
        completed_at: Date.now(), rider_fee: 150, rider_fee_status: 'Pending'
      }, jobLists);
      toast.success('ปิดจ๊อบสำเร็จ! ส่งมอบเครื่องเรียบร้อย');
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด: ' + e);
    }
  };

  const handleOpenNavigation = (job: any) => {
    const targetAddress = job.cust_address || job.address;
    if (!targetAddress) return toast.error('ไม่พบพิกัดหรือที่อยู่สำหรับนำทาง');
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetAddress)}`, '_blank');
  };

  const handleCallCustomer = (job: any) => {
    const phone = job.cust_phone || job.customer_phone || job.phone;
    if (!phone) return toast.error('ไม่พบเบอร์โทรศัพท์ของลูกค้า');
    window.location.href = `tel:${phone}`;
  };

  const handleRequestWithdraw = async (
    withdrawAmount: string, balance: number, riderInfoData: RiderInfo, onDone: () => void
  ) => {
    const amount = Number(withdrawAmount);
    if (!amount || amount < 100) return toast.error('ระบุขั้นต่ำ 100 บาท');
    if (amount > balance) return toast.error('ยอดเงินไม่เพียงพอ');
    try {
      await push(ref(db, 'withdrawals'), {
        rider_id: riderInfoData.id, rider_name: riderInfoData.name,
        withdraw_amount: amount, status: 'Withdrawal Requested',
        requested_at: Date.now(), type: 'Withdrawal',
        bank_name: riderInfoData.bankName, bank_account: riderInfoData.accountNo
      });
      sendAdminNotification('คำขอถอนเงิน', `ไรเดอร์ ${riderInfoData.name} ขอเบิกเงิน ${formatCurrency(amount)}`);
      toast.success('ส่งคำขอถอนเงินสำเร็จ!');
      onDone();
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด: ' + e);
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

  return {
    updateStatus, acceptIncomingJob, handleRejectOrCancelJob, handleCompleteJob,
    handleRevertInspection,
    handleOpenNavigation, handleCallCustomer, handleRequestWithdraw,
    reportDiscrepancy
  };
};
