// src/pages/RiderApp.tsx - Orchestrator (rebuilt from 1,110 lines monolith)
import { useState, useEffect, useMemo } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../api/firebase';
import { uploadImageToFirebase } from '../utils/uploadImage';
import { getDevicesList } from '../utils/jobHelpers';

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

  // Open chat from notification deep link
  useEffect(() => {
    if (pendingChatJobId && !jobsLoading) {
      setChatJobId(pendingChatJobId);
      onClearPendingChat?.();
    }
  }, [pendingChatJobId, jobsLoading, onClearPendingChat]);

  // Loading state
  if (jobsLoading) return <LoadingSpinner />;

  // Resolve chat job from all lists
  const currentChatJob = chatJobId
    ? (jobData.activeList.find(j => j.id === chatJobId) || jobData.history.find(j => j.id === chatJobId))
    : null;

  // Filter out jobs the rider locally dismissed via reject modal.
  const visibleIncomingList = useMemo(
    () => jobData.incomingList.filter((j) => !dismissedBroadcastIds.has(j.id)),
    [jobData.incomingList, dismissedBroadcastIds]
  );

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

    for (let i = 0; i < updatedDevices.length; i++) {
      const data = inspectedData[i];
      if (data) {
        const uploadedUrls = await Promise.all(
          data.photoFiles.map((file: File) => uploadImageToFirebase(file, `jobs/${job.id}/inspection/device_${i}`))
        );
        updatedDevices[i] = {
          ...updatedDevices[i], photos: uploadedUrls, deductions: data.deductions,
          estimated_price: data.final_price, price: data.final_price, inspection_status: 'Inspected'
        };
        jobTotalDevicePrice += data.final_price;
      } else {
        jobTotalDevicePrice += Number(updatedDevices[i].estimated_price || updatedDevices[i].price || 0);
      }
    }

    const pickupFee = Number(job.pickup_fee || 0);
    const couponValue = Number(job.applied_coupon?.value || job.applied_coupon?.actual_value || 0);
    const newNetPayout = Math.max(0, jobTotalDevicePrice - pickupFee + couponValue);

    await actions.updateStatus(job.id, 'QC Review', `ไรเดอร์ส่งผลตรวจสภาพ ${updatedDevices.length} เครื่อง`, {
      devices: updatedDevices,
      original_price: jobTotalDevicePrice,
      final_price: jobTotalDevicePrice,
      price: jobTotalDevicePrice,
      net_payout: newNetPayout,
      inspected_at: Date.now()
    }, { activeList: jobData.activeList, incomingList: jobData.incomingList });

    setInspectingJob(null);
  };

  const handleDocUpload = (type: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setRiderInfo(prev => ({ ...prev, [`${type}Img`]: url }));
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
        />
      )}

      {activeTab === 'wallet' && (
        <WalletTab
          balance={jobData.balance}
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
