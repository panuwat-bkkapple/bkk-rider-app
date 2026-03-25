// src/pages/RiderApp.tsx - Orchestrator (rebuilt from 1,110 lines monolith)
import { useState } from 'react';
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
import { BankModal } from '../components/profile/BankModal';
import { DocumentModal } from '../components/profile/DocumentModal';
import { ChatModal } from '../components/chat/ChatModal';
import { InspectionModal } from '../components/inspection/InspectionModal';

// Types
import type { TabId, HistoryFilter, InspectedDeviceData } from '../types';

export const RiderApp = ({ currentRiderId, onLogout }: { currentRiderId: string; onLogout: () => void }) => {
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

  // Modal state
  const [inspectingJob, setInspectingJob] = useState<any>(null);
  const [chatJobId, setChatJobId] = useState<string | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingJob, setRejectingJob] = useState<any>(null);

  // Loading state
  if (jobsLoading) return <LoadingSpinner />;

  // Resolve chat job from all lists
  const currentChatJob = chatJobId
    ? (jobData.activeList.find(j => j.id === chatJobId) || jobData.history.find(j => j.id === chatJobId))
    : null;

  // Handlers
  const handleUpdateStatus = async (jobId: string, nextStatus: string, logMsg: string, extraData?: any) => {
    await actions.updateStatus(jobId, nextStatus, logMsg, extraData || {}, {
      activeList: jobData.activeList,
      incomingList: jobData.incomingList
    });
  };

  const handleAcceptJob = async (jobId: string, extraData: any) => {
    await handleUpdateStatus(jobId, 'Accepted', 'ไรเดอร์กดรับงาน', extraData);
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
    if (!window.confirm('คุณต้องการออกจากระบบ (สลับบัญชี) หรือไม่?')) return;
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
          incomingList={jobData.incomingList}
          activeList={jobData.activeList}
          onAcceptJob={handleAcceptJob}
          onUpdateStatus={handleUpdateStatus}
          onRejectJob={(job) => { setRejectingJob(job); setIsRejectModalOpen(true); }}
          onOpenChat={setChatJobId}
          onCallCustomer={actions.handleCallCustomer}
          onOpenNavigation={actions.handleOpenNavigation}
          onInspectJob={(job) => { setInspectingJob(job); }}
          onCompleteJob={(job) => actions.handleCompleteJob(job, { activeList: jobData.activeList, incomingList: jobData.incomingList })}
          onGoToProfile={() => setActiveTab('profile')}
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

      {/* Modals */}
      {isRejectModalOpen && rejectingJob && (
        <RejectModal
          rejectingJob={rejectingJob}
          onClose={() => { setIsRejectModalOpen(false); setRejectingJob(null); }}
          onConfirm={async (reason) => {
            await actions.handleRejectOrCancelJob(rejectingJob, reason, jobData.incomingList, () => {
              setIsRejectModalOpen(false);
              setRejectingJob(null);
            });
          }}
        />
      )}

      {chatJobId && currentChatJob && (
        <ChatModal
          chatJob={currentChatJob}
          riderInfo={riderInfo}
          onClose={() => setChatJobId(null)}
        />
      )}

      {inspectingJob && (
        <InspectionModal
          job={inspectingJob}
          modelsData={modelsData}
          conditionSets={conditionSets}
          onClose={() => setInspectingJob(null)}
          onSubmit={handleInspectionSubmit}
        />
      )}

      {isWithdrawModalOpen && (
        <WithdrawModal
          withdrawAmount={withdrawAmount}
          onAmountChange={setWithdrawAmount}
          onConfirm={() => actions.handleRequestWithdraw(withdrawAmount, jobData.balance, riderInfo, () => {
            setIsWithdrawModalOpen(false);
            setWithdrawAmount('');
          })}
          onClose={() => setIsWithdrawModalOpen(false)}
        />
      )}

      {isBankModalOpen && (
        <BankModal
          currentRiderId={currentRiderId}
          bankName={riderInfo.bankName}
          accountNo={riderInfo.accountNo}
          onBankNameChange={(v) => setRiderInfo(prev => ({ ...prev, bankName: v }))}
          onAccountNoChange={(v) => setRiderInfo(prev => ({ ...prev, accountNo: v }))}
          onClose={() => setIsBankModalOpen(false)}
        />
      )}

      {isDocModalOpen && (
        <DocumentModal
          idCardImg={riderInfo.idCardImg}
          onDocUpload={handleDocUpload}
          onClose={() => setIsDocModalOpen(false)}
        />
      )}

      {/* Bottom navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};
