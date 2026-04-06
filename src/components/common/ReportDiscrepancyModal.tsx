// src/components/common/ReportDiscrepancyModal.tsx
import { useState, useRef } from 'react';
import { AlertTriangle, X, Camera, Send, CheckCircle2 } from 'lucide-react';
import { DISCREPANCY_CATEGORIES } from '../../types';
import { toast } from './Toast';

interface ReportDiscrepancyModalProps {
  job: any;
  onClose: () => void;
  onSubmit: (jobId: string, category: string, detail: string, imageFile: File | null) => Promise<void>;
}

export const ReportDiscrepancyModal = ({ job, onClose, onSubmit }: ReportDiscrepancyModalProps) => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [detail, setDetail] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!selectedCategory) return;
    setIsSubmitting(true);
    try {
      await onSubmit(job.id, selectedCategory, detail, imageFile);
      onClose();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if there's already a pending report
  const pendingReport = job.discrepancy_reports
    ? Object.values(job.discrepancy_reports).find((r: any) => r.status === 'pending')
    : null;

  if (pendingReport) {
    const report = pendingReport as any;
    const categoryLabel = DISCREPANCY_CATEGORIES.find(c => c.id === report.category)?.label || report.category;
    return (
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center animate-in fade-in duration-300">
        <div className="bg-white w-full sm:w-96 rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-12 sm:pb-6 animate-in slide-in-from-bottom duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.1)]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-900 text-lg">รอแอดมินแก้ไขข้อมูล</h3>
            <button onClick={onClose} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 text-gray-500">
              <X size={20} />
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-3">
            <div className="animate-spin w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full mx-auto"></div>
            <p className="font-bold text-amber-700">กำลังรอแอดมินแก้ไข</p>
            <div className="text-sm text-amber-600 space-y-1">
              <p>หมวดหมู่: <strong>{categoryLabel}</strong></p>
              {report.detail && <p>รายละเอียด: {report.detail}</p>}
              <p className="text-xs text-amber-500">
                แจ้งเมื่อ: {new Date(report.reported_at).toLocaleString('th-TH')}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              เมื่อแอดมินแก้ไขข้อมูลแล้ว ข้อมูลจะอัปเดตอัตโนมัติ<br />
              คุณสามารถทำงานต่อได้ทันที
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-4 bg-gray-100 text-gray-600 py-3 rounded-2xl font-bold text-sm hover:bg-gray-200"
          >
            ปิด
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center animate-in fade-in duration-300">
      <div className="bg-white w-full sm:w-96 rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-12 sm:pb-6 animate-in slide-in-from-bottom duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.1)] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-5 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h3 className="font-bold text-gray-900 text-lg leading-tight">
              แจ้งข้อมูลไม่ตรง<br />
              <span className="text-xs text-gray-500 font-normal">แอดมินจะแก้ไขข้อมูลให้จากหลังบ้าน</span>
            </h3>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        {/* Category selection */}
        <p className="text-sm font-bold text-gray-700 mb-3">เลือกหมวดหมู่ปัญหา (บังคับ):</p>
        <div className="space-y-2 mb-5">
          {DISCREPANCY_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                selectedCategory === cat.id
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-sm font-semibold">{cat.label}</span>
              <span className="block text-xs text-gray-400 mt-0.5">{cat.description}</span>
            </button>
          ))}
        </div>

        {/* Detail */}
        <p className="text-sm font-bold text-gray-700 mb-2">รายละเอียดเพิ่มเติม:</p>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="เช่น ที่อยู่จริงคือ... / ลูกค้าบอกว่า... / รุ่นเครื่องจริงคือ..."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none resize-none min-h-[80px] mb-4"
          rows={3}
        />

        {/* Photo upload */}
        <div className="mb-5">
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageSelect} />
          {imagePreview ? (
            <div className="relative">
              <img src={imagePreview} alt="หลักฐาน" className="w-full h-40 object-cover rounded-xl border border-gray-200" />
              <button
                onClick={() => { setImageFile(null); setImagePreview(null); }}
                className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-center text-gray-400 hover:border-amber-400 hover:text-amber-500 transition-colors"
            >
              <Camera size={24} className="mx-auto mb-1" />
              <span className="text-xs font-semibold">แนบรูปหลักฐาน (ไม่บังคับ)</span>
            </button>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedCategory}
          className="w-full bg-amber-500 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-amber-500/30 hover:bg-amber-600 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
        >
          {isSubmitting
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            : <><Send size={18} /> ส่งแจ้งแอดมิน</>
          }
        </button>

        <p className="text-[11px] text-gray-400 text-center mt-3">
          แอดมินจะได้รับแจ้งเตือนทันที และแก้ไขข้อมูลจากระบบหลังบ้าน<br />
          ข้อมูลที่แก้ไขจะอัปเดตในหน้างานของคุณอัตโนมัติ
        </p>
      </div>
    </div>
  );
};
