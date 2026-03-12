// src/components/profile/BankModal.tsx
import { X } from 'lucide-react';
import { ref, update } from 'firebase/database';
import { db } from '../../api/firebase';

interface BankModalProps {
  currentRiderId: string;
  bankName: string;
  accountNo: string;
  onBankNameChange: (v: string) => void;
  onAccountNoChange: (v: string) => void;
  onClose: () => void;
}

export const BankModal = ({ currentRiderId, bankName, accountNo, onBankNameChange, onAccountNoChange, onClose }: BankModalProps) => {
  const handleSave = async () => {
    try {
      await update(ref(db, `riders/${currentRiderId}/bank`), { name: bankName, account: accountNo });
      onClose();
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + e);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 z-[100] flex items-end">
      <div className="bg-white w-full rounded-t-[2rem] p-8 pb-12">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">บัญชีรับเงิน</h3>
          <button onClick={onClose} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-2xl">
            <label className="text-xs font-medium text-gray-500 block mb-1">ธนาคาร</label>
            <input className="w-full bg-transparent font-bold text-gray-900 outline-none" value={bankName} onChange={e => onBankNameChange(e.target.value)} />
          </div>
          <div className="bg-gray-50 p-4 rounded-2xl">
            <label className="text-xs font-medium text-gray-500 block mb-1">เลขบัญชี</label>
            <input className="w-full bg-transparent font-bold text-gray-900 outline-none" value={accountNo} onChange={e => onAccountNoChange(e.target.value)} />
          </div>
          <button onClick={handleSave} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold mt-4">บันทึกข้อมูล</button>
        </div>
      </div>
    </div>
  );
};
