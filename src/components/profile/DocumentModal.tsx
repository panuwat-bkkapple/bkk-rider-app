// src/components/profile/DocumentModal.tsx
import { X, Upload } from 'lucide-react';

interface DocumentModalProps {
  idCardImg: string | null;
  onDocUpload: (type: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
}

export const DocumentModal = ({ idCardImg, onDocUpload, onClose }: DocumentModalProps) => (
  <div className="fixed inset-0 bg-gray-900/60 z-[100] flex items-end">
    <div className="bg-white w-full rounded-t-[2rem] p-8 pb-12">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold">เอกสารประจำตัว</h3>
        <button onClick={onClose} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button>
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">รูปถ่ายบัตรประชาชน</p>
          <label className="block w-full h-32 rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center cursor-pointer bg-blue-50/50 hover:bg-blue-50 transition-colors">
            {idCardImg ? (
              <img src={idCardImg} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <>
                <Upload size={24} className="text-blue-500 mb-2" />
                <span className="text-xs text-blue-600 font-bold">อัปโหลดรูปภาพ</span>
              </>
            )}
            <input type="file" className="hidden" onChange={(e) => onDocUpload('idCard', e)} />
          </label>
        </div>
        <button onClick={onClose} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold">บันทึกเอกสาร</button>
      </div>
    </div>
  </div>
);
