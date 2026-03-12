// src/components/wallet/WithdrawModal.tsx
import { X } from 'lucide-react';

interface WithdrawModalProps {
  withdrawAmount: string;
  onAmountChange: (amount: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const WithdrawModal = ({ withdrawAmount, onAmountChange, onConfirm, onClose }: WithdrawModalProps) => (
  <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end animate-in fade-in duration-300">
    <div className="bg-white w-full rounded-t-[2rem] p-8 pb-12 animate-in slide-in-from-bottom duration-500 shadow-[0_-20px_50px_rgba(0,0,0,0.1)]">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xl font-bold text-gray-900">ถอนเงินเข้าบัญชี</h3>
        <button onClick={onClose} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
      </div>
      <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 mb-8 flex justify-center items-center">
        <span className="text-3xl font-bold text-gray-400 mr-2">฿</span>
        <input
          type="number" autoFocus
          value={withdrawAmount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="w-2/3 bg-transparent border-none text-5xl font-bold text-gray-900 outline-none text-center"
          placeholder="0"
        />
      </div>
      <button
        onClick={onConfirm}
        className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-600 active:scale-95 transition-all"
      >
        ยืนยันการถอนเงิน
      </button>
    </div>
  </div>
);
