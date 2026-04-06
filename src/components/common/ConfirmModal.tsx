// src/components/common/ConfirmModal.tsx
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmModal = ({
  title, message, confirmText = 'ยืนยัน', cancelText = 'ยกเลิก',
  variant = 'default', onConfirm, onCancel
}: ConfirmModalProps) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const btnColor = variant === 'danger'
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-purple-600 hover:bg-purple-700';

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 shadow-xl max-w-sm w-full text-center animate-in zoom-in-95 duration-200">
        <div className={`w-14 h-14 ${variant === 'danger' ? 'bg-red-50 text-red-500' : 'bg-purple-50 text-purple-500'} rounded-full flex items-center justify-center mx-auto mb-3`}>
          <AlertTriangle size={28} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6 whitespace-pre-line">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-2xl font-bold hover:bg-gray-200 active:scale-95 transition-all"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 ${btnColor} text-white py-3 rounded-2xl font-bold active:scale-95 transition-all disabled:opacity-50`}
          >
            {loading ? 'กำลังดำเนินการ...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
