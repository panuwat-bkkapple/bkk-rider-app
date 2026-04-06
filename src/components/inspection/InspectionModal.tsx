// src/components/inspection/InspectionModal.tsx
import { useState, useRef, useMemo } from 'react';
import {
  X, ChevronLeft, CheckCircle2, Camera, Upload,
  Smartphone, ShieldCheck, PackageOpen, ListChecks
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { getDevicesList } from '../../utils/jobHelpers';
import { toast } from '../common/Toast';
import type { InspectedDeviceData, ConditionGroup } from '../../types';

interface InspectionModalProps {
  job: any;
  modelsData: any;
  conditionSets: any;
  onClose: () => void;
  onSubmit: (job: any, inspectedData: Record<number, InspectedDeviceData>) => Promise<void>;
}

export const InspectionModal = ({ job, modelsData, conditionSets, onClose, onSubmit }: InspectionModalProps) => {
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number | null>(null);
  const [inspectedDevicesData, setInspectedDevicesData] = useState<Record<number, InspectedDeviceData>>({});
  const [checks, setChecks] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const devicesList = getDevicesList(job);

  const activeChecklist = useMemo((): ConditionGroup[] => {
    if (!job || activeDeviceIndex === null || !modelsData || !conditionSets) return [];
    const activeDevice = devicesList[activeDeviceIndex];
    if (!activeDevice) return [];
    const modelList = Array.isArray(modelsData) ? modelsData : Object.keys(modelsData).map(k => ({ id: k, ...(modelsData as any)[k] }));
    const setsList = Array.isArray(conditionSets) ? conditionSets : Object.keys(conditionSets).map(k => ({ id: k, ...(conditionSets as any)[k] }));
    const baseModelName = activeDevice.model.split(' (')[0].trim();
    const targetModel = modelList.find((m: any) => m.name === baseModelName || activeDevice.model.includes(m.name));
    if (!targetModel || !targetModel.conditionSetId) return [];
    const targetSet = setsList.find((s: any) => s.id === targetModel.conditionSetId);
    return targetSet?.groups || [];
  }, [job, activeDeviceIndex, modelsData, conditionSets]);

  const getBasePrice = (device: any): number => {
    let trueBasePrice = 0;
    if (modelsData && device) {
      const modelList = Array.isArray(modelsData) ? modelsData : Object.keys(modelsData).map(k => ({ id: k, ...(modelsData as any)[k] }));
      const targetModel = modelList.find((m: any) => m.name === device.model);
      if (targetModel && targetModel.variants) {
        const targetVariant = targetModel.variants.find((v: any) => v.name === device.variant);
        if (targetVariant) trueBasePrice = Number(targetVariant.usedPrice || targetVariant.price || 0);
        else trueBasePrice = Number(targetModel.variants[0]?.usedPrice || targetModel.variants[0]?.price || 0);
      }
    }
    return trueBasePrice > 0 ? trueBasePrice : Number(device?.base_price || device?.estimated_price || 0);
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFiles(prev => [...prev, file]);
      setPhotos(prev => [...prev, URL.createObjectURL(file)]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
  };

  const saveDeviceInspection = () => {
    if (activeDeviceIndex === null) return;
    const activeDevice = devicesList[activeDeviceIndex];
    const deductionLabels: string[] = [];
    const startingPrice = getBasePrice(activeDevice);

    let totalDeduction = 0;
    if (activeDevice.isNewDevice) {
      deductionLabels.push('[สภาพสินค้า] เครื่องใหม่มือ 1 (ตรวจสอบซีลและกล่องสมบูรณ์)');
    } else {
      activeChecklist.forEach((group: any) => {
        group.options?.forEach((opt: any) => {
          if (checks.includes(opt.id)) {
            let deductAmount = 0;
            if (startingPrice >= 30000) deductAmount = Number(opt.t1 || 0);
            else if (startingPrice >= 15000 && startingPrice < 30000) deductAmount = Number(opt.t2 || 0);
            else deductAmount = Number(opt.t3 || 0);
            totalDeduction += deductAmount;
            deductionLabels.push(deductAmount > 0
              ? `[${group.title}] ${opt.label} (-฿${deductAmount.toLocaleString()})`
              : `[${group.title}] ${opt.label}`
            );
          }
        });
      });
    }

    const finalPrice = activeDevice.isNewDevice ? startingPrice : Math.max(0, startingPrice - totalDeduction);

    setInspectedDevicesData(prev => ({
      ...prev,
      [activeDeviceIndex]: {
        checks: activeDevice.isNewDevice ? [] : [...checks],
        photos: [...photos], photoFiles: [...photoFiles],
        deductions: deductionLabels, final_price: finalPrice
      }
    }));
    setActiveDeviceIndex(null);
  };

  const handleSubmitAll = async () => {
    setIsUploading(true);
    try {
      await onSubmit(job, inspectedDevicesData);
    } catch (error) {
      toast.error('อัปโหลดรูปภาพล้มเหลว กรุณาลองใหม่');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end animate-in fade-in duration-300">
      <div className="bg-white w-full rounded-t-[2rem] p-6 pb-12 animate-in slide-in-from-bottom duration-500 max-h-[90vh] overflow-y-auto flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">

        {/* Device list view */}
        {activeDeviceIndex === null ? (
          <div className="animate-in fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">รายการที่ต้องตรวจ</h3>
                <p className="text-sm text-gray-500 mt-1">ทั้งหมด {devicesList.length} เครื่อง</p>
              </div>
              <button onClick={onClose} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"><X size={20} /></button>
            </div>
            <div className="space-y-3 mb-8">
              {devicesList.map((device: any, index: number) => {
                const isDone = !!inspectedDevicesData[index];
                return (
                  <div key={index} className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${isDone ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white shadow-sm'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                        {isDone ? <CheckCircle2 size={24} /> : <Smartphone size={24} />}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900 leading-tight">{device.model}</div>
                        {isDone
                          ? <div className="text-xs font-medium text-emerald-600 mt-1">ตรวจแล้ว</div>
                          : <div className="text-xs font-medium text-amber-500 mt-1">รอตรวจสอบ</div>
                        }
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setChecks(inspectedDevicesData[index]?.checks || []);
                        setPhotos(inspectedDevicesData[index]?.photos || []);
                        setPhotoFiles(inspectedDevicesData[index]?.photoFiles || []);
                        setActiveDeviceIndex(index);
                      }}
                      className={`px-4 py-2 rounded-xl font-semibold text-xs transition-all ${isDone ? 'bg-white text-gray-600 border border-gray-200' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700'}`}
                    >
                      {isDone ? 'แก้ไข' : 'เริ่มตรวจ'}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleSubmitAll}
              disabled={isUploading || Object.keys(inspectedDevicesData).length !== devicesList.length}
              className={`w-full py-4 rounded-2xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-2 ${
                isUploading || Object.keys(inspectedDevicesData).length !== devicesList.length
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-500 text-white active:scale-95 hover:bg-emerald-600'
              }`}
            >
              {isUploading
                ? <><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div> อัปโหลด...</>
                : <><Upload size={22} /> ส่งผลตรวจทั้งหมด</>
              }
            </button>
          </div>
        ) : (
          /* Single device inspection */
          <div className="animate-in slide-in-from-right duration-300">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setActiveDeviceIndex(null)} className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200">
                <ChevronLeft size={20} />
              </button>
              <h3 className="text-lg font-bold text-gray-900 leading-tight flex-1 line-clamp-1">
                {devicesList[activeDeviceIndex].model}
              </h3>
            </div>

            <div className="space-y-8">
              {/* Photos */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Camera size={16} className="text-blue-500" /> รูปถ่ายตัวเครื่อง
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((p, i) => (
                    <div key={i} className="aspect-square rounded-2xl overflow-hidden relative shadow-sm border border-gray-100">
                      <img src={p} className="w-full h-full object-cover" />
                      <button onClick={() => handleRemovePhoto(i)} className="absolute top-2 right-2 bg-white/90 text-red-500 rounded-full p-1.5 shadow-sm">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors bg-blue-50/30">
                    <Camera size={24} /><span className="text-xs font-medium mt-1">เพิ่มรูป</span>
                  </button>
                </div>
                <input type="file" accept="image/jpeg, image/png, image/jpg, image/webp" multiple className="hidden" ref={fileInputRef} onChange={handleCapture} />
              </div>

              {/* Checklist */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <ListChecks size={16} className="text-purple-500" /> เช็คลิสต์สภาพเครื่อง
                </label>
                {devicesList[activeDeviceIndex]?.isNewDevice ? (
                  <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl text-center shadow-sm">
                    <PackageOpen size={36} className="text-blue-500 mx-auto mb-3 animate-pulse" />
                    <h4 className="font-bold text-blue-800 text-base mb-1">เครื่องใหม่มือ 1 (Brand New)</h4>
                    <p className="text-xs text-blue-600 font-medium leading-relaxed">
                      รายการนี้เป็นเครื่องใหม่ยังไม่แกะซีล<br />ไม่ต้องทำรายการเช็คลิสต์สภาพตัวเครื่อง<br />
                      <strong className="text-blue-800 mt-2 block bg-white p-2 rounded-lg border border-blue-100">กรุณาถ่ายรูปกล่อง ซีลพลาสติก และเลข IMEI ให้ชัดเจน</strong>
                    </p>
                  </div>
                ) : activeChecklist.length > 0 ? (
                  activeChecklist.map((group: any) => (
                    <div key={group.id} className="mb-4">
                      <h4 className="text-sm font-medium text-gray-600 mb-2 pl-1">{group.title}</h4>
                      <div className="space-y-2">
                        {group.options?.map((opt: any) => {
                          const isChecked = checks.includes(opt.id);
                          const currentDevice = devicesList[activeDeviceIndex];
                          const startingPrice = getBasePrice(currentDevice);

                          let displayDeduct = 0;
                          if (startingPrice >= 30000) displayDeduct = Number(opt.t1 || 0);
                          else if (startingPrice >= 15000 && startingPrice < 30000) displayDeduct = Number(opt.t2 || 0);
                          else displayDeduct = Number(opt.t3 || 0);

                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                setChecks(prev => {
                                  const optionsInThisGroup = group.options.map((o: any) => o.id);
                                  const otherChecks = prev.filter((id: string) => !optionsInThisGroup.includes(id));
                                  return isChecked ? otherChecks : [...otherChecks, opt.id];
                                });
                              }}
                              className={`w-full p-4 rounded-2xl border text-left flex justify-between items-center transition-all ${isChecked ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                            >
                              <div>
                                <div className={`font-semibold text-sm mb-1 ${isChecked ? 'text-red-700' : 'text-gray-800'}`}>{opt.label}</div>
                                <div className="text-xs font-medium text-red-500 bg-red-100/50 px-2 py-0.5 rounded-md w-fit">
                                  หัก {formatCurrency(displayDeduct)}
                                </div>
                              </div>
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isChecked ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300'}`}>
                                {isChecked && <CheckCircle2 size={16} strokeWidth={3} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-2xl border-dashed border-2 border-gray-200">
                    <ShieldCheck size={24} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 font-medium">ไม่มีชุดคำถามสำหรับรุ่นนี้</p>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button onClick={saveDeviceInspection} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl active:scale-95 transition-all flex justify-center items-center gap-2">
                  บันทึกเครื่องนี้
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
