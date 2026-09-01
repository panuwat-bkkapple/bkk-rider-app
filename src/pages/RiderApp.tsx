// src/pages/RiderApp.tsx - Orchestrator (rebuilt from 1,110 lines monolith)
import { useState, useEffect, useMemo } from 'react';
import { signOut } from 'firebase/auth';
import { ref, update } from 'firebase/database';
import { auth, db } from '../api/firebase';
import { uploadImageToFirebase } from '../utils/uploadImage';
import { toast } from '../components/common/Toast';
import { getDevicesList, sumAccessoryItems } from '../utils/jobHelpers';
import { sumAppliedAdjustments, sumAppliedCoupons } from '../utils/adjustments';

// Hooks
import { useRiderData } from '../hooks/useRiderData';
import { useJobActions } from '../hooks/useJobActions';

// Components
import { BottomNav } from '../components/layout/BottomNav';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { RejectModal } from '../components/common/RejectModal';
import { HomeTab } from '../components/home/HomeTab';
import { HistoryTab } from '../components/history/HistoryTab';
import { WalletTab } from '../components/wallet/WalletTab';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { ProfileTab } from '../components/profile/ProfileTab';
import { FAQTab } from '../components/faq/FAQTab';
import { BankModal } from '../components/profile/BankModal';
import { DocumentModal } from '../components/profile/DocumentModal';
import { ChatModal } from '../components/chat/ChatModal';
import { InspectionModal } from '../components/inspection/InspectionModal';
import { KYCModal } from '../components/kyc/KYCModal';
import { ReportDiscrepancyModal } from '../components/common/ReportDiscrepancyModal';
import { ModalErrorBoundary } from '../components/common/ModalErrorBoundary';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { JobDetailPage } from './JobDetailPage';

// Types
import type { TabId, HistoryFilter, JobDateFilter, InspectedDeviceData } from '../types';

interface RiderAppProps {
  currentRiderId: string;
  onLogout: () => void;
  pendingChatJobId?: string | null;
  onClearPendingChat?: () => void;
}

export const RiderApp = ({ currentRiderId, onLogout, pendingChatJobId, onClearPendingChat }: RiderAppProps) => {
  // Data & state
  const {
    jobData, riderInfo, setRiderInfo,
    isOnline, setIsOnline,
    modelsData, conditionSets,
    jobsLoading,
    hasMoreTx, loadMoreTx
  } = useRiderData(currentRiderId);

  const actions = useJobActions(riderInfo);

  // UI state
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('today');
  const [jobDateFilter, setJobDateFilter] = useState<JobDateFilter>('today');
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  // Modal state
  const [inspectingJob, setInspectingJob] = useState<any>(null);
  const [kycJob, setKycJob] = useState<any>(null);
  const [chatJobId, setChatJobId] = useState<string | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingJob, setRejectingJob] = useState<any>(null);
  // IDs of broadcast jobs the rider locally dismissed via the reject
  // modal. The DB stays untouched (RTDB rules block non-owner writes),
  // so we hide the job from this rider's incoming list until they
  // refresh the app — at which point the broadcast pool is fair game
  // again.
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<Set<string>>(new Set());
  const [discrepancyJob, setDiscrepancyJob] = useState<any>(null);
  const [completingJob, setCompletingJob] = useState<any>(null);
  const [revertingJob, setRevertingJob] = useState<any>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Must live with the other hooks ABOVE the `if (jobsLoading) return` early
  // return — declaring it after that guard changed the hook count between
  // renders (React #310).
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Open chat from notification deep link
  useEffect(() => {
    if (pendingChatJobId && !jobsLoading) {
      setChatJobId(pendingChatJobId);
      onClearPendingChat?.();
    }
  }, [pendingChatJobId, jobsLoading, onClearPendingChat]);

  // Filter out jobs the rider locally dismissed via reject modal.
  // Must run before any early return — moving this below the
  // `if (jobsLoading)` guard breaks the rules of hooks because the
  // first render (loading=true) skips it and the second render
  // (loading=false) calls it, tripping React error #310.
  const visibleIncomingList = useMemo(
    () => jobData.incomingList.filter((j) => !dismissedBroadcastIds.has(j.id)),
    [jobData.incomingList, dismissedBroadcastIds]
  );

  // Loading state
  if (jobsLoading) return <LoadingSpinner />;

  // Resolve chat job from all lists
  const currentChatJob = chatJobId
    ? (jobData.activeList.find(j => j.id === chatJobId) || jobData.history.find(j => j.id === chatJobId))
    : null;

  // Resolve job for detail page from incoming or active lists
  const detailIncoming = detailJobId ? visibleIncomingList.find(j => j.id === detailJobId) : null;
  const detailActive = detailJobId && !detailIncoming ? jobData.activeList.find(j => j.id === detailJobId) : null;
  const detailJob = detailIncoming || detailActive;
  const detailMode: 'incoming' | 'active' = detailIncoming ? 'incoming' : 'active';

  // Handlers
  const handleUpdateStatus = async (jobId: string, nextStatus: string, logMsg: string, extraData?: any) => {
    await actions.updateStatus(jobId, nextStatus, logMsg, extraData || {}, {
      activeList: jobData.activeList,
      incomingList: jobData.incomingList
    });
  };

  // Accept goes through actions.acceptIncomingJob, which uses
  // runTransaction() to claim the job atomically. With broadcast jobs that
  // multiple riders see simultaneously, the previous plain update() let the
  // last write win and the loser thought they had the job. The transaction
  // returns success=false on race loss; the hook already shows the toast.
  const handleAcceptJob = async (jobId: string) => {
    const job =
      jobData.incomingList.find((j) => j.id === jobId) ||
      jobData.activeList.find((j) => j.id === jobId);
    if (!job) return;
    await actions.acceptIncomingJob(job);
  };

  const handleInspectionSubmit = async (job: any, inspectedData: Record<number, InspectedDeviceData>) => {
    const updatedDevices = [...getDevicesList(job)];
    let jobTotalDevicePrice = 0;
    // First inspected device's verification feeds the job-level mirror below
    // (admin QCStation / Inventory read job-level battery, not per-device).
    let primaryVerification: InspectedDeviceData['verification'] | null = null;

    for (let i = 0; i < updatedDevices.length; i++) {
      const data = inspectedData[i];
      if (data) {
        const uploadedUrls = await Promise.all(
          data.photoFiles.map((file: File) => uploadImageToFirebase(file, `jobs/${job.id}/inspection/device_${i}`))
        );
        const v = data.verification;
        if (!primaryVerification) primaryVerification = v;
        updatedDevices[i] = {
          ...updatedDevices[i], photos: uploadedUrls, deductions: data.deductions,
          estimated_price: data.final_price, price: data.final_price, inspection_status: 'Inspected',
          ...(data.functional_check ? { functional_check: data.functional_check } : {}),
          // Per-device verification — B2B jobs keep each device's own battery
          // / IMEI / Find My instead of collapsing to a single job-level value.
          battery_health_pct: v.battery_health_pct,
          battery_cycle_count: v.battery_cycle_count,
          battery_unavailable: v.battery_unavailable,
          battery_photo: v.battery_photo,
          device_imei: v.device_imei || updatedDevices[i].device_imei || '',
          device_serial: v.device_serial,
          find_my_status: v.find_my_status,
          find_my_manual: !!v.find_my_manual,
          warranty_status: v.warranty_status,
          warranty_expires_at: v.warranty_expires_at,
        };
        jobTotalDevicePrice += data.final_price;
      } else {
        jobTotalDevicePrice += Number(updatedDevices[i].estimated_price || updatedDevices[i].price || 0);
      }
    }

    // Effective fee = gross pickup_fee minus any rider-fee discount the company
    // absorbs (rider pay is untouched). Keep this in step with the net_payout
    // invariant — recomputing without the discount would silently wipe it.
    const grossPickupFee = Number(job.pickup_fee || 0);
    const riderFeeDiscount = job.receive_method === 'Pickup' ? Number(job.rider_fee_discount || 0) : 0;
    const pickupFee = Math.max(0, grossPickupFee - riderFeeDiscount);
    const couponValue = sumAppliedCoupons(job);
    // อุปกรณ์เสริมที่ขายพ่วง (accessory_items) ไม่อยู่ใน devices[] แต่มูลค่าอยู่ใน
    // price/final_price ของงาน — การ recompute จากราคาเครื่องล้วนๆ ต้องบวกกลับ
    // ไม่งั้นเงินอุปกรณ์เสริมหายจาก payout ตอนไรเดอร์ส่งผลตรวจ
    const accessoriesTotal = sumAccessoryItems(job);
    const jobTotalPrice = jobTotalDevicePrice + accessoriesTotal;
    // Preserve any already-applied ad-hoc adjustments (admin QC / approved rider
    // proposal) when the rider's inspection recomputes the payout.
    const newNetPayout = Math.max(0, jobTotalPrice - pickupFee + couponValue + sumAppliedAdjustments(job));

    // original_price is the customer's quote total at order creation —
    // never overwrite it from QC, otherwise we lose the audit trail
    // that lets admin/finance compare quote vs final.
    const jobUpdates: Record<string, any> = {
      devices: updatedDevices,
      final_price: jobTotalPrice,
      price: jobTotalPrice,
      net_payout: newNetPayout,
      inspected_at: Date.now(),
    };

    // Mirror the primary device's verification onto the job root so existing
    // readers keep working: admin QCStation/Inventory read `battery_health`,
    // JobDetailPage reads `battery_health_pct` / `find_my_status` /
    // `device_imei`. Only write keys we actually have — RTDB rejects
    // `undefined`. Skip battery when un-powerable so we never report a fake %.
    if (primaryVerification) {
      const v = primaryVerification;
      jobUpdates.verification_completed_at = Date.now();
      if (v.find_my_status) jobUpdates.find_my_status = v.find_my_status;
      // Audit: was Find My system-verified or rider self-attested/skipped?
      if (v.find_my_status === 'off') jobUpdates.find_my_manual = !!v.find_my_manual;
      if (v.device_imei) jobUpdates.device_imei = v.device_imei;
      if (v.device_serial) jobUpdates.device_serial = v.device_serial;
      if (v.device_model_number) jobUpdates.device_model_number = v.device_model_number;
      if (v.battery_health_pct != null) {
        jobUpdates.battery_health_pct = v.battery_health_pct;
        jobUpdates.battery_health = v.battery_health_pct; // compat: admin reads battery_health
      }
      if (v.battery_cycle_count != null) jobUpdates.battery_cycle_count = v.battery_cycle_count;
      if (v.battery_unavailable) jobUpdates.battery_unavailable = true;
      if (v.battery_photo) jobUpdates.verification_battery_photo = v.battery_photo;
      if (v.verification_imei_photo) jobUpdates.verification_imei_photo = v.verification_imei_photo;
      if (v.verification_findmy_photo) jobUpdates.verification_findmy_photo = v.verification_findmy_photo;
      if (v.warranty_status) jobUpdates.warranty_status = v.warranty_status;
      if (v.warranty_expires_at) jobUpdates.warranty_expires_at = v.warranty_expires_at;
      if (v.warranty_coverage_type) jobUpdates.warranty_coverage_type = v.warranty_coverage_type;
      if (v.verification_warranty_photo) jobUpdates.verification_warranty_photo = v.verification_warranty_photo;
    }

    await actions.updateStatus(job.id, 'QC Review', `ไรเดอร์ส่งผลตรวจสภาพ ${updatedDevices.length} เครื่อง`,
      jobUpdates, { activeList: jobData.activeList, incomingList: jobData.incomingList });

    setInspectingJob(null);
  };

  const handleDocUpload = (type: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setRiderInfo(prev => ({ ...prev, [`${type}Img`]: url }));
    }
  };

  // Profile photo upload → Storage (riders/{id}/profile, rider-writable per
  // storage.rules) then persist riders/{id}/photo_url (publicly readable, so
  // the customer /track + admin show it). Rider sees it via the riders/{id}
  // listener in useRiderData. (uploadingPhoto state is declared with the
  // other hooks above, before the loading early-return.)
  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !riderInfo.id) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImageToFirebase(file, `riders/${riderInfo.id}/profile`, { opaqueFilename: true });
      await update(ref(db, `riders/${riderInfo.id}`), { photo_url: url });
      toast.success('อัปเดตรูปโปรไฟล์แล้ว');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setIsOnline(false);
    await signOut(auth);
    localStorage.removeItem('rider_id');
    localStorage.removeItem('device_pin');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] max-w-md mx-auto relative overflow-hidden shadow-2xl font-sans text-gray-800">

      {/* Tab content */}
      {activeTab === 'home' && (
        <HomeTab
          riderInfo={riderInfo}
          isOnline={isOnline}
          onToggleOnline={() => setIsOnline(!isOnline)}
          balance={jobData.balance}
          incomingList={visibleIncomingList}
          activeList={jobData.activeList}
          jobDateFilter={jobDateFilter}
          onJobDateFilterChange={setJobDateFilter}
          onAcceptJob={handleAcceptJob}
          onUpdateStatus={handleUpdateStatus}
          onRejectJob={(job) => { setRejectingJob(job); setIsRejectModalOpen(true); }}
          onOpenChat={setChatJobId}
          onCallCustomer={actions.handleCallCustomer}
          onOpenNavigation={actions.handleOpenNavigation}
          onStartKYC={(job) => setKycJob(job)}
          onInspectJob={(job) => { setInspectingJob(job); }}
          onCompleteJob={(job) => setCompletingJob(job)}
          onRevertInspection={(job) => setRevertingJob(job)}
          onReportDiscrepancy={(job) => setDiscrepancyJob(job)}
          onOpenJobDetail={setDetailJobId}
          onGoToProfile={() => setActiveTab('profile')}
        />
      )}

      {detailJob && (
        <JobDetailPage
          job={detailJob}
          riderInfoId={riderInfo.id}
          riderVehicle={riderInfo.vehicleType}
          mode={detailMode}
          onBack={() => setDetailJobId(null)}
          onAccept={async (jobId) => {
            await handleAcceptJob(jobId);
            setDetailJobId(null);
          }}
          onReject={(job) => { setRejectingJob(job); setIsRejectModalOpen(true); }}
          onUpdateStatus={handleUpdateStatus}
          onOpenChat={setChatJobId}
          onCallCustomer={actions.handleCallCustomer}
          onOpenNavigation={actions.handleOpenNavigation}
          onStartKYC={(job) => setKycJob(job)}
          onInspect={(job) => setInspectingJob(job)}
          onCompleteJob={(job) => setCompletingJob(job)}
          onRevertInspection={(job) => setRevertingJob(job)}
          onReportDiscrepancy={(job) => setDiscrepancyJob(job)}
        />
      )}

      {activeTab === 'history' && (
        <HistoryTab
          history={jobData.history}
          historyFilter={historyFilter}
          onFilterChange={setHistoryFilter}
          onOpenChat={setChatJobId}
          vehicleType={riderInfo.vehicleType}
        />
      )}

      {activeTab === 'wallet' && (
        <WalletTab
          balance={jobData.balance}
          pendingWithdrawals={jobData.pendingWithdrawals}
          transactions={jobData.transactions}
          hasMoreTx={hasMoreTx}
          onLoadMoreTx={loadMoreTx}
          onOpenWithdraw={() => setIsWithdrawModalOpen(true)}
        />
      )}

      {activeTab === 'profile' && (
        <ProfileTab
          riderInfo={riderInfo}
          onGoHome={() => setActiveTab('home')}
          onOpenBank={() => setIsBankModalOpen(true)}
          onOpenDoc={() => setIsDocModalOpen(true)}
          onLogout={handleLogout}
          onUploadPhoto={handleUploadPhoto}
          uploadingPhoto={uploadingPhoto}
        />
      )}

      {activeTab === 'faq' && (
        <FAQTab onGoHome={() => setActiveTab('home')} />
      )}

      {/* Modals - wrapped with ModalErrorBoundary */}
      {isRejectModalOpen && rejectingJob && (
        <ModalErrorBoundary onClose={() => { setIsRejectModalOpen(false); setRejectingJob(null); }}>
          <RejectModal
            rejectingJob={rejectingJob}
            onClose={() => { setIsRejectModalOpen(false); setRejectingJob(null); }}
            onConfirm={async (category, detail) => {
              // Snapshot the job + figure out whether this is a true
              // broadcast (rider doesn't own it) before the handler
              // closes the modal. Broadcast rejections only update
              // local state — DB stays untouched (RTDB rule blocks
              // non-owner writes), so this rider needs the job hidden
              // here or it would just bounce back into the list.
              const dismissedJobId = rejectingJob.id;
              const isBroadcastDismiss = rejectingJob.rider_id !== riderInfo.id;
              await actions.handleRejectOrCancelJob(
                rejectingJob,
                category,
                detail,
                jobData.incomingList,
                () => {
                  setIsRejectModalOpen(false);
                  setRejectingJob(null);
                }
              );
              if (isBroadcastDismiss) {
                setDismissedBroadcastIds((prev) => {
                  const next = new Set(prev);
                  next.add(dismissedJobId);
                  return next;
                });
              }
            }}
          />
        </ModalErrorBoundary>
      )}

      {chatJobId && currentChatJob && (
        <ModalErrorBoundary onClose={() => setChatJobId(null)}>
          <ChatModal
            chatJob={currentChatJob}
            riderInfo={riderInfo}
            onClose={() => setChatJobId(null)}
          />
        </ModalErrorBoundary>
      )}

      {discrepancyJob && (
        <ModalErrorBoundary onClose={() => setDiscrepancyJob(null)}>
          <ReportDiscrepancyModal
            job={discrepancyJob}
            onClose={() => setDiscrepancyJob(null)}
            onSubmit={async (jobId, category, detail, imageFile) => {
              await actions.reportDiscrepancy(jobId, category, detail, imageFile);
              setDiscrepancyJob(null);
            }}
          />
        </ModalErrorBoundary>
      )}

      {inspectingJob && (
        <ModalErrorBoundary onClose={() => setInspectingJob(null)}>
          <InspectionModal
            job={inspectingJob}
            modelsData={modelsData}
            conditionSets={conditionSets}
            onClose={() => setInspectingJob(null)}
            onSubmit={handleInspectionSubmit}
          />
        </ModalErrorBoundary>
      )}

      {kycJob && (
        <ModalErrorBoundary onClose={() => setKycJob(null)}>
          <KYCModal
            job={kycJob}
            onClose={() => setKycJob(null)}
            onSubmit={actions.submitKYC}
          />
        </ModalErrorBoundary>
      )}

      {isWithdrawModalOpen && (
        <ModalErrorBoundary onClose={() => setIsWithdrawModalOpen(false)}>
          <WithdrawModal
            withdrawAmount={withdrawAmount}
            onAmountChange={setWithdrawAmount}
            onConfirm={() => actions.handleRequestWithdraw(withdrawAmount, jobData.balance, riderInfo, () => {
              setIsWithdrawModalOpen(false);
              setWithdrawAmount('');
            })}
            onClose={() => setIsWithdrawModalOpen(false)}
            employmentType={riderInfo.employmentType}
          />
        </ModalErrorBoundary>
      )}

      {isBankModalOpen && (
        <ModalErrorBoundary onClose={() => setIsBankModalOpen(false)}>
          <BankModal
            currentRiderId={currentRiderId}
            bankName={riderInfo.bankName}
            accountNo={riderInfo.accountNo}
            onBankNameChange={(v) => setRiderInfo(prev => ({ ...prev, bankName: v }))}
            onAccountNoChange={(v) => setRiderInfo(prev => ({ ...prev, accountNo: v }))}
            onClose={() => setIsBankModalOpen(false)}
          />
        </ModalErrorBoundary>
      )}

      {isDocModalOpen && (
        <ModalErrorBoundary onClose={() => setIsDocModalOpen(false)}>
          <DocumentModal
            idCardImg={riderInfo.idCardImg}
            onDocUpload={handleDocUpload}
            onClose={() => setIsDocModalOpen(false)}
          />
        </ModalErrorBoundary>
      )}

      {/* Confirm Modals */}
      {completingJob && (
        <ConfirmModal
          title="ยืนยันส่งมอบเครื่อง"
          message="ยืนยันว่านำเครื่องมาถึงสาขา และส่งมอบให้แผนก QC เรียบร้อยแล้ว?"
          confirmText="ยืนยัน"
          onConfirm={async () => {
            await actions.handleCompleteJob(completingJob, { activeList: jobData.activeList, incomingList: jobData.incomingList });
            setCompletingJob(null);
          }}
          onCancel={() => setCompletingJob(null)}
        />
      )}

      {revertingJob && (
        <ConfirmModal
          title="ย้อนกลับเพื่อแก้ไขข้อมูล"
          message={'ข้อมูลตรวจสภาพที่ส่งไปจะถูกลบ และต้องตรวจสอบใหม่ทั้งหมด\n(ใช้ได้เฉพาะก่อนแอดมินเริ่มอนุมัติเท่านั้น)'}
          confirmText="ย้อนกลับ"
          variant="danger"
          onConfirm={async () => {
            await actions.handleRevertInspection(revertingJob, { activeList: jobData.activeList, incomingList: jobData.incomingList });
            setRevertingJob(null);
          }}
          onCancel={() => setRevertingJob(null)}
        />
      )}

      {showLogoutConfirm && (
        <ConfirmModal
          title="ออกจากระบบ"
          message="คุณต้องการออกจากระบบ (สลับบัญชี) หรือไม่?"
          confirmText="ออกจากระบบ"
          variant="danger"
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {/* Bottom navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};
