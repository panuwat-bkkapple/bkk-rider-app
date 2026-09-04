// src/components/wallet/WithdrawModal.tsx
import { useEffect, useState } from 'react';
import { X, Info } from 'lucide-react';
import { ref, get } from 'firebase/database';
import { db } from '../../api/firebase';
import { estimateRiderWht, readRiderWhtConfig, type RiderWhtConfig } from '../../utils/riderWht';

interface WithdrawModalProps {
  withdrawAmount: string;
  onAmountChange: (amount: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** สถานะการจ้างของไรเดอร์ — รับจ้างอิสระเท่านั้นที่ถูกหักภาษี ณ ที่จ่าย */
  employmentType?: 'employee' | 'freelance' | null;
}

export const WithdrawModal = ({
  withdrawAmount, onAmountChange, onConfirm, onClose, employmentType,
}: WithdrawModalProps) => {
  // อ่านครั้งเดียวตอนเปิด — ค่านี้เปลี่ยนไม่บ่อยและไม่คุ้มเปิด listener ค้างไว้
  const [cfg, setCfg] = useState<RiderWhtConfig>({ enabled: false, ratePercent: 3 });
  useEffect(() => {
    let cancelled = false;
    get(ref(db, 'settings/accounting/rider_wht'))
      .then((s) => { if (!cancelled) setCfg(readRiderWhtConfig(s.val())); })
      .catch(() => { /* อ่านไม่ได้ = ไม่แสดงว่าหัก ยอดที่โชว์จะเท่าที่กรอก */ });
    return () => { cancelled = true; };
  }, []);

  const est = estimateRiderWht(Number(withdrawAmount) || 0, employmentType, cfg);

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end animate-in fade-in duration-300">
      <div className="bg-white w-full rounded-t-[2rem] p-8 pb-12 animate-in slide-in-from-bottom duration-500 shadow-[0_-20px_50px_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-bold text-gray-900">ถอนเงินเข้าบัญชี</h3>
          <button onClick={onClose} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
        </div>
        <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 mb-4 flex justify-center items-center">
          <span className="text-3xl font-bold text-gray-400 mr-2">฿</span>
          <input
            type="number" autoFocus
            value={withdrawAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            className="w-2/3 bg-transparent border-none text-5xl font-bold text-gray-900 outline-none text-center"
            placeholder="0"
          />
        </div>

        {/* บอกก่อนกด ไม่ใช่ให้รู้ตอนเงินเข้า — ยอดที่โอนจริงน้อยกว่ายอดที่กรอก */}
        {est.applies && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm">
            <div className="flex justify-between text-amber-800 font-medium">
              <span>ยอดที่ขอถอน</span>
              <span>฿{est.gross.toLocaleString('th-TH')}</span>
            </div>
            <div className="flex justify-between text-amber-800 font-medium mt-1">
              <span>หักภาษี ณ ที่จ่าย {est.ratePercent}% (สูงสุด)</span>
              <span>−฿{est.wht.toLocaleString('th-TH')}</span>
            </div>
            <div className="flex justify-between font-bold text-amber-900 mt-2 pt-2 border-t border-amber-200">
              <span>ได้รับเข้าบัญชีอย่างน้อย</span>
              <span>฿{est.net.toLocaleString('th-TH')}</span>
            </div>
            {/* พูดความจริงเรื่องทิศของความคลาดเคลื่อน: ตัวเลขนี้เป็นเพดาน ยอดจริง
                ไม่หักส่วนที่เป็นเงินคืนค่าใช้จ่าย จึงได้เท่านี้หรือมากกว่า ไม่มีทางน้อยกว่า */}
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 mt-3 leading-relaxed">
              <Info size={13} className="shrink-0 mt-0.5" />
              ภาษีหักเฉพาะส่วนที่เป็นค่าจ้าง ไม่หักเงินคืนค่าทางด่วน/ที่จอดรถที่คุณเบิกไว้
              ยอดจริงจึงเท่านี้หรือมากกว่า ดูตัวเลขที่แน่นอนได้จากหนังสือรับรอง (50 ทวิ)
              ที่ส่งให้ทางอีเมลและในแอปหลังโอน ใช้เป็นเครดิตตอนยื่นภาษีสิ้นปีได้
            </p>
          </div>
        )}
        {!est.applies && <div className="mb-6" />}

        <button
          onClick={onConfirm}
          className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-600 active:scale-95 transition-all"
        >
          ยืนยันการถอนเงิน
        </button>
      </div>
    </div>
  );
};
