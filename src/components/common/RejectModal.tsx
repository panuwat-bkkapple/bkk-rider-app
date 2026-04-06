// src/components/common/RejectModal.tsx
import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { REJECT_REASONS } from '../../types';
import { toast } from './Toast';

interface RejectModalProps {
  rejectingJob: any;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export const RejectModal = ({ rejectingJob, onClose, onConfirm }: RejectModalProps) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const handleConfirm = async () => {
    setIsRejecting(true);
    try {
      await onConfirm(selectedReason);
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการยกเลิกงาน');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center animate-in fade-in duration-300">
      <div className="bg-white w-full sm:w-96 rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-12 sm:pb-6 animate-in slide-in-from-bottom duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h3 className="font-bold text-gray-900 text-lg leading-tight">
              ปฏิเสธรับงาน<br />
              <span className="text-xs text-gray-500 font-normal">งานจะถูกคืนไปยังส่วนกลาง</span>
            </h3>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm font-bold text-gray-700 mb-3">กรุณาระบุเหตุผล (บังคับ):</p>
        <div className="space-y-2 max-h-60 overflow-y-auto mb-6 hide-scrollbar">
          {REJECT_REASONS.map(reason => (
            <button
              key={reason}
              onClick={() => setSelectedReason(reason)}
              className={`w-full text-left p-3.5 rounded-xl border text-sm font-semibold transition-all ${
                selectedReason === reason
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {reason}
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={isRejecting || !selectedReason}
          className="w-full bg-red-500 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-red-500/30 hover:bg-red-600 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
        >
          {isRejecting
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            : 'ยืนยันการคืนงาน'}
        </button>
      </div>
    </div>
  );
};
