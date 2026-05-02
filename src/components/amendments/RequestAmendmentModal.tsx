// Rider-side "report problem on-site" modal.
//
// Phase 1: only `device_mismatch` is supported. The form is intentionally
// minimal — rider doesn't pick the new model, set price, or write a long
// reason. They just attach photos + a short note. Admin handles the rest
// from /jobs_amendments review screen.
//
// On submit the request lands as `pending`; rider stays at the pickup point
// until they receive the admin's decision via push (handled separately).

import { useRef, useState } from 'react';
import {
  X, AlertTriangle, Camera, Loader2, Trash2, Send, Smartphone,
} from 'lucide-react';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { requestAmendment } from '../../utils/amendments';
import { toast } from '../common/Toast';

interface Props {
  job: any;
  onClose: () => void;
  onSubmitted: () => void;
}

interface UploadedPhoto {
  url: string;
  uploading: boolean;
}

export const RequestAmendmentModal = ({ job, onClose, onSubmitted }: Props) => {
  const [riderNote, setRiderNote] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Append placeholder rows immediately so user sees progress
    const startIdx = photos.length;
    setPhotos((p) => [...p, ...Array.from(files).map(() => ({ url: '', uploading: true }))]);
    try {
      const uploads = await Promise.all(
        Array.from(files).map((f) =>
          uploadImageToFirebase(f, `jobs/${job.id}/amendments`, { opaqueFilename: true }),
        ),
      );
      setPhotos((p) => {
        const next = [...p];
        uploads.forEach((url, i) => {
          next[startIdx + i] = { url, uploading: false };
        });
        return next;
      });
    } catch (e: any) {
      toast.error('อัปโหลดรูปไม่สำเร็จ: ' + (e?.message || e));
      // Remove the placeholders we just added
      setPhotos((p) => p.slice(0, startIdx));
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  };

  const readyUrls = photos.filter((p) => p.url && !p.uploading).map((p) => p.url);
  const anyUploading = photos.some((p) => p.uploading);
  const canSubmit = readyUrls.length >= 1 && !anyUploading && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (readyUrls.length === 0) toast.error('กรุณาแนบภาพเครื่องอย่างน้อย 1 รูป');
      return;
    }
    setSubmitting(true);
    try {
      await requestAmendment({
        jobId: job.id,
        type: 'device_mismatch',
        riderNote: riderNote.trim() || undefined,
        evidenceUrls: readyUrls,
      });
      toast.success('ส่งคำขอแก้ไขเรียบร้อย — admin จะแจ้งกลับ');
      onSubmitted();
    } catch (e: any) {
      toast.error('ส่งไม่สำเร็จ: ' + (e?.code || e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle size={22} className="text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">เครื่องไม่ตรงตามที่ลงทะเบียน</h2>
              <p className="text-xs text-gray-500">รุ่น/ความจุ/สี ต่างจากที่ลูกค้ากรอก</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full" aria-label="ปิด">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
            <p className="font-bold mb-1">วิธีปฏิบัติ:</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>ถ่ายภาพเครื่องจริงให้เห็น <strong>IMEI/บาร์โค้ด</strong> ด้านหลังเครื่อง</li>
              <li>(ถ้าได้) ถ่ายหน้าจอ Settings → General → About เพื่อโชว์รุ่น</li>
              <li>ใส่หมายเหตุสั้นๆ ว่าลูกค้าบอกอะไร</li>
              <li>รอคำสั่งจาก admin — <strong>อย่าเพิ่งรับเครื่อง</strong></li>
            </ol>
          </div>

          {/* Photos */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Smartphone size={13} /> ภาพเครื่องจริง <span className="text-red-500">* (อย่างน้อย 1 รูป)</span>
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-[4/3] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  {p.uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-emerald-500">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : (
                    <>
                      <img src={p.url} alt={`evidence-${i}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow"
                        aria-label="ลบ"
                      >
                        <Trash2 size={12} className="text-red-600" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="aspect-[4/3] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/50 transition disabled:opacity-50"
              >
                <Camera size={22} />
                <span className="text-[11px] font-medium">เพิ่มภาพ</span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleAdd(e.target.files)}
            />
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <textarea
              value={riderNote}
              onChange={(e) => setRiderNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="ลูกค้าบอกว่า ..."
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium resize-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
            />
          </div>
        </div>

        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-gray-100 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-amber-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition"
          >
            {submitting ? (
              <><Loader2 size={20} className="animate-spin" /> กำลังส่ง...</>
            ) : (
              <><Send size={20} /> ส่งให้ admin ดูแล</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
