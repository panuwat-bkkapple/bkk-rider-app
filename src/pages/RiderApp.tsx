// src/pages/RiderApp.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { formatCurrency, formatDate } from '../utils/formatters';
import { uploadImageToFirebase } from '../utils/uploadImage';
import {
  Bike, MapPin, Navigation, Phone, Wallet as WalletIcon,
  CheckCircle2, X, ShieldCheck, Camera, ChevronRight, AlertCircle,
  Landmark, User, FileText, CreditCard, Upload, History, Activity,
  PackageOpen, Smartphone, ListChecks, ChevronLeft, LogOut,
  MessageSquare, Send, Image as ImageIcon,
  Clock, Tag, AlertTriangle
} from 'lucide-react';
import { ref, update, push, onValue } from 'firebase/database';
import { db, auth } from '../api/firebase';
import { signOut } from 'firebase/auth';
import { sendAdminNotification } from '../utils/notifications';

interface RiderInfo {
  name: string; id: string; bankName: string; accountNo: string;
  accountName: string; idCardImg: string | null; licenseImg: string | null;
}

const MapBackground = () => (
  <div className="absolute inset-0 z-0 bg-[#F3F4F6] overflow-hidden">
    <div className="absolute top-1/3 left-1/3 p-3 bg-emerald-500/20 rounded-full animate-pulse">
      <div className="w-5 h-5 bg-emerald-500 rounded-full border-2 border-white shadow-md"></div>
    </div>
    <div className="w-full h-full opacity-30" style={{ backgroundImage: 'linear-gradient(#E5E7EB 1px, transparent 1px), linear-gradient(90deg, #E5E7EB 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
  </div>
);

const REJECT_REASONS = [
  'ลูกค้าไม่รับสาย / ติดต่อไม่ได้',
  'ลูกค้าขอยกเลิก / เปลี่ยนใจ',
  'รถเสีย / เกิดอุบัติเหตุฉุกเฉิน',
  'สภาพอากาศไม่เอื้ออำนวย (ฝนตกหนัก)',
  'ระยะทางไกลเกินไป / ไม่สะดวกรับงาน',
  'อื่นๆ (โปรดระบุในแชท)'
];

// 🌟 ตัวช่วยดึงยอดเงินที่ถูกต้องเสมอ
const getDisplayPrice = (job: any) => {
  if (job.net_payout !== undefined && job.net_payout !== null) return Number(job.net_payout);
  return Number(job.final_price || job.price || 0);
};

// 🌟 ตัวช่วยดึงชื่อลูกค้าที่ถูกต้อง
const getCustomerName = (job: any) => {
  return job.cust_name || job.customerName || job.customer_name || job.customer || 'ไม่ระบุชื่อลูกค้า';
};

export const RiderApp = ({ currentRiderId, onLogout }: { currentRiderId: string, onLogout: () => void }) => {
  const { data: jobs, loading: jobsLoading } = useDatabase('jobs');
  const { data: transactions, loading: txLoading } = useDatabase('transactions');
  const { data: modelsData, loading: modelsLoading } = useDatabase('models');
  const { data: conditionSets, loading: conditionsLoading } = useDatabase('settings/condition_sets');

  const [dispatchMode, setDispatchMode] = useState('manual');

  useEffect(() => {
    const unsubscribe = onValue(ref(db, 'settings/system/dispatch_mode'), (snapshot) => {
      setDispatchMode(snapshot.exists() ? snapshot.val() : 'manual');
    });
    return () => unsubscribe();
  }, []);

  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'wallet' | 'profile'>('home');
  const [historyFilter, setHistoryFilter] = useState<'today' | 'yesterday' | 'this_week' | 'all'>('today');
  const [isOnline, setIsOnline] = useState(false);

  const [inspectingJob, setInspectingJob] = useState<any>(null);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number | null>(null);
  const [inspectedDevicesData, setInspectedDevicesData] = useState<Record<number, any>>({});
  const [checks, setChecks] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chatJobId, setChatJobId] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [isChatUploading, setIsChatUploading] = useState(false);

  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingJob, setRejectingJob] = useState<any>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const [riderInfo, setRiderInfo] = useState<RiderInfo>({
    name: "กำลังโหลด...", id: currentRiderId, bankName: "-", accountNo: "-",
    accountName: "-", idCardImg: null, licenseImg: null
  });

  const jobData = useMemo(() => {
    const list = Array.isArray(jobs) ? jobs : [];
    const tx = Array.isArray(transactions) ? transactions : [];
    const myJobs = list.filter(j => j.rider_id === currentRiderId);
    const myTx = tx.filter(t => t.rider_id === currentRiderId).sort((a, b) => b.timestamp - a.timestamp);
    const balance = myTx.reduce((acc, t) => t.type === 'CREDIT' ? acc + Number(t.amount) : acc - Number(t.amount), 0);

    const incomingList = list.filter(j => {
      if (j.receive_method !== 'Pickup') return false;
      const isDirectlyAssigned = j.status === 'Assigned' && j.rider_id === currentRiderId;
      const isBroadcastJob =
        dispatchMode === 'broadcast' &&
        (j.status === 'Active Leads' || (j.status === 'Assigned' && !j.rider_id));

      return isDirectlyAssigned || isBroadcastJob;
    });

    return {
      activeList: myJobs.filter(j =>
        ['Accepted', 'Heading to Customer', 'Arrived', 'Being Inspected', 'QC Review', 'Price Accepted', 'Revised Offer', 'Payout Processing', 'In-Transit', 'Waiting for Handover', 'Paid', 'PAID'].includes(j.status)
        && !j.completed_at
      ),
      incomingList,
      history: myJobs.filter(j =>
        (['Pending QC', 'In Stock', 'Paid', 'PAID', 'Completed', 'Returned', 'Closed (Lost)'].includes(j.status) && j.completed_at)
        || j.status === 'Cancelled'
      ).sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0)),
      balance,
      transactions: myTx
    };
  }, [jobs, transactions, currentRiderId, dispatchMode]);

  useEffect(() => {
    if (chatJobId && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatJobId, jobs]);

  useEffect(() => {
    if (!isOnline) return;
    const updateLocationAndBattery = async (pos: GeolocationPosition) => {
      const now = Date.now();
      let currentBattery = 99;
      try {
        if ('getBattery' in navigator) {
          const battery: any = await (navigator as any).getBattery();
          currentBattery = Math.round(battery.level * 100);
        }
      } catch (error) { console.warn(error); }

      await update(ref(db, `riders/${riderInfo.id}`), {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        status: jobData.activeList.length > 0 ? 'Busy' : 'Online',
        battery: currentBattery, last_updated: now
      });
    };

    navigator.geolocation.getCurrentPosition(updateLocationAndBattery, console.error, { enableHighAccuracy: true });
    let lastUpdate = 0;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const now = Date.now();
      if (now - lastUpdate > 10000) { updateLocationAndBattery(pos); lastUpdate = now; }
    }, (err) => console.error(err), { enableHighAccuracy: true, maximumAge: 10000 });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, riderInfo.id, jobData.activeList.length]);

  useEffect(() => {
    if (currentRiderId) {
      const unsubscribe = onValue(ref(db, `riders/${currentRiderId}`), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();

          if (data.approval_status === 'Suspended') {
            alert(`⛔ บัญชีของคุณถูกระงับการใช้งาน!\nเหตุผล: ${data.suspend_reason || 'กรุณาติดต่อแอดมิน'}`);
            setIsOnline(false);
            signOut(auth).then(() => {
              localStorage.removeItem('rider_id');
              localStorage.removeItem('device_pin');
              window.location.reload();
            });
            return;
          }

          setRiderInfo(prev => ({
            ...prev,
            name: data.name || "ไม่ระบุชื่อ",
            bankName: data.bank?.name || "-",
            accountNo: data.bank?.account || "-",
            accountName: data.name || "-",
            idCardImg: data.documents?.idCard || null,
            licenseImg: data.documents?.license || null
          }));
        }
      });
      return () => unsubscribe();
    }
  }, [currentRiderId]);

  const getDevicesList = (job: any) => {
    if (!job) return [];
    if (job.devices && Array.isArray(job.devices) && job.devices.length > 0) return job.devices;
    return [{ device_id: 'old_item_1', model: job.model, estimated_price: job.price, isNewDevice: job.assessment_details?.isNewDevice || false, rawConditions: job.assessment_details?.rawConditions || {}, customer_conditions: job.customer_conditions || [] }];
  };

  const devicesListForModal = inspectingJob ? getDevicesList(inspectingJob) : [];

  const activeChecklist = useMemo(() => {
    if (!inspectingJob || activeDeviceIndex === null || !modelsData || !conditionSets) return [];
    const devicesList = getDevicesList(inspectingJob);
    const activeDevice = devicesList[activeDeviceIndex];
    if (!activeDevice) return [];
    const modelList = Array.isArray(modelsData) ? modelsData : Object.keys(modelsData).map(k => ({ id: k, ...(modelsData as any)[k] }));
    const setsList = Array.isArray(conditionSets) ? conditionSets : Object.keys(conditionSets).map(k => ({ id: k, ...(conditionSets as any)[k] }));
    const baseModelName = activeDevice.model.split(' (')[0].trim();
    const targetModel = modelList.find(m => m.name === baseModelName || activeDevice.model.includes(m.name));
    if (!targetModel || !targetModel.conditionSetId) return [];
    const targetSet = setsList.find(s => s.id === targetModel.conditionSetId);
    return targetSet?.groups || [];
  }, [inspectingJob, activeDeviceIndex, modelsData, conditionSets]);

  const displayHistoryData = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const filtered = jobData.history.filter(job => {
      const time = job.completed_at || job.updated_at || job.created_at || 0;
      if (historyFilter === 'today') return time >= todayStart;
      if (historyFilter === 'yesterday') return time >= todayStart - 86400000 && time < todayStart;
      if (historyFilter === 'this_week') return time >= todayStart - (7 * 86400000);
      return true;
    });
    return { list: filtered, stats: { income: filtered.reduce((acc, j) => acc + (Number(j.rider_fee) || 150), 0), count: filtered.length, progress: Math.min(100, (filtered.length / 10) * 100) } };
  }, [jobData.history, historyFilter]);

  // 🌟 ฟังก์ชันส่งการแจ้งเตือนหา "ลูกค้า" โดยเฉพาะ
  const sendCustomerNotification = async (job: any, title: string, message: string) => {
    // ถ้าไม่มี UID ของลูกค้า (เช่น เป็นลูกค้า Guest) จะข้ามการส่งไปเพื่อไม่ให้ Error
    if (!job || !job.uid) return; 

    try {
      await push(ref(db, 'notifications'), {
        target_uid: job.uid,           // 👈 สำคัญมาก! ระบุว่าส่งหาใคร
        target_role: 'customer',       // 👈 บอกว่าเป็นแจ้งเตือนของลูกค้า
        title: title,
        message: message,
        job_id: job.id,
        link: `/track/${job.id}`,      // 👈 ให้ลูกค้ากดแล้วเด้งไปหน้าติดตามสถานะได้เลย
        timestamp: Date.now(),
        read: false
      });
    } catch (error) {
      console.error('Error sending customer notification:', error);
    }
  };

  const updateStatus = async (jobId: string, nextStatus: string, logMsg: string, extraData = {}) => {
    const job = jobData.activeList.find(j => j.id === jobId) || jobData.incomingList.find(j => j.id === jobId);
    const updatedLogs = [{ action: nextStatus, by: `Rider: ${riderInfo.name}`, timestamp: Date.now(), details: logMsg }, ...(job?.qc_logs || [])];
    try {
      await update(ref(db, `jobs/${jobId}`), { status: nextStatus, updated_at: Date.now(), qc_logs: updatedLogs, ...extraData });
      const shortJobId = jobId.slice(-4).toUpperCase();
      
      // 🌟 ระบบยิงแจ้งเตือน 2 ทาง (Admin & Customer)
      if (nextStatus === 'Accepted') {
        sendAdminNotification('🛵 ไรเดอร์รับงาน', `${riderInfo.name} กำลังเดินทางไปจุดหมาย งาน #${shortJobId}`);
        sendCustomerNotification(job, 'จัดสรรไรเดอร์สำเร็จ! 🛵', `ไรเดอร์ ${riderInfo.name} กำลังเตรียมตัวเดินทางไปหาคุณ`);
      } 
      else if (nextStatus === 'Heading to Customer') {
        sendAdminNotification('🛵 ไรเดอร์ออกเดินทาง', `${riderInfo.name} กำลังมุ่งหน้าไปหาลูกค้า งาน #${shortJobId}`);
        sendCustomerNotification(job, 'ไรเดอร์กำลังเดินทาง! 🛵💨', `ไรเดอร์ ${riderInfo.name} กำลังมุ่งหน้าไปยังจุดนัดรับเครื่องของคุณแล้ว`);
      } 
      else if (nextStatus === 'Arrived') {
        sendAdminNotification('📍 ถึงจุดหมาย', `${riderInfo.name} เดินทางถึงจุดหมายแล้ว งาน #${shortJobId}`);
        sendCustomerNotification(job, 'ไรเดอร์มาถึงแล้ว! 📍', `ไรเดอร์เดินทางถึงจุดนัดหมายแล้ว กรุณาเตรียมตัวเครื่องให้พร้อมครับ`);
      } 
      else if (nextStatus === 'Being Inspected') {
        sendAdminNotification('🔍 เริ่มตรวจสภาพ', `${riderInfo.name} เริ่มตรวจสภาพเครื่อง งาน #${shortJobId}`);
        sendCustomerNotification(job, 'กำลังตรวจสภาพเครื่อง 🔍', `ไรเดอร์กำลังดำเนินการตรวจสอบสภาพเครื่องของคุณอย่างละเอียด`);
      } 
      else if (nextStatus === 'QC Review') {
        sendAdminNotification('🚨 ด่วน! รออนุมัติ QC', `${riderInfo.name} ส่งรูปตรวจเครื่อง #${shortJobId} เข้ามาแล้ว`);
        sendCustomerNotification(job, 'รออนุมัติราคา ⏳', `ช่างเทคนิคกำลังประเมินภาพถ่ายตัวเครื่องของคุณ กรุณารอสักครู่ครับ`);
      } 
      else if (nextStatus === 'In-Transit') {
        sendAdminNotification('🛵 กำลังกลับสาขา', `${riderInfo.name} กำลังนำเครื่อง #${shortJobId} กลับมาส่ง`);
      } 
      else if (nextStatus === 'Pending QC') {
        sendAdminNotification('📦 ส่งมอบเครื่องสำเร็จ', `${riderInfo.name} จบงานและส่งเครื่อง #${shortJobId} เข้าสาขาเรียบร้อย`);
      }
    } catch (error) { alert('เกิดข้อผิดพลาดในการอัปเดตข้อมูล'); }
  };

  const handleRejectOrCancelJob = async () => {
    if (!rejectingJob || !selectedRejectReason) {
      alert("กรุณาเลือกเหตุผลการยกเลิก/ปฏิเสธงานครับ");
      return;
    }

    setIsRejecting(true);
    try {
      const isIncoming = jobData.incomingList.some(j => j.id === rejectingJob.id);

      const updatedLogs = [
        {
          action: isIncoming ? 'Rider Rejected' : 'Rider Cancelled',
          by: `Rider: ${riderInfo.name}`,
          timestamp: Date.now(),
          details: `ไรเดอร์${isIncoming ? 'ปฏิเสธรับงาน' : 'ยกเลิกงานกลางทาง'} เหตุผล: ${selectedRejectReason}`
        },
        ...(rejectingJob.qc_logs || [])
      ];

      await update(ref(db, `jobs/${rejectingJob.id}`), {
        status: 'Active Leads',
        rider_id: null,
        updated_at: Date.now(),
        qc_logs: updatedLogs,
        cancel_reason: selectedRejectReason
      });

      sendAdminNotification('🚨 ไรเดอร์ยกเลิกงาน!', `${riderInfo.name} ได้ยกเลิก/ปฏิเสธงาน #${rejectingJob.id.slice(-4)} (${selectedRejectReason})`);

      setIsRejectModalOpen(false);
      setRejectingJob(null);
      setSelectedRejectReason('');
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการยกเลิกงาน: ' + error);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleOpenNavigation = (job: any) => {
    const targetAddress = job.cust_address || job.address;
    if (!targetAddress) return alert("ไม่พบพิกัดหรือที่อยู่สำหรับนำทาง");
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetAddress)}`, '_blank');
  };

  const handleCallCustomer = (job: any) => {
    const phone = job.cust_phone || job.customer_phone || job.phone;
    if (!phone) return alert("ไม่พบเบอร์โทรศัพท์ของลูกค้า");
    window.location.href = `tel:${phone}`;
  };

  const handleCompleteJob = async (job: any) => {
    if (!confirm('ยืนยันว่านำเครื่องมาถึงสาขา และส่งมอบให้แผนก QC เรียบร้อยแล้ว?')) return;
    try {
      await updateStatus(job.id, 'Pending QC', 'ไรเดอร์ส่งมอบเครื่องเข้าสาขาเรียบร้อยแล้ว', { completed_at: Date.now(), rider_fee: 150, rider_fee_status: 'Pending' });
      alert('ปิดจ๊อบสำเร็จ! ส่งมอบเครื่องเรียบร้อย');
    } catch (e) { alert('Error: ' + e); }
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

  const handleDocUpload = (type: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setRiderInfo(prev => ({ ...prev, [`${type}Img`]: url }));
    }
  };

  const saveDeviceInspection = () => {
    if (activeDeviceIndex === null || !inspectingJob) return;
    const devicesList = getDevicesList(inspectingJob);
    const activeDevice = devicesList[activeDeviceIndex];
    const deductionLabels: string[] = [];

    // 1. ดึงราคาเกรด A มาตั้งต้น
    let trueBasePrice = 0;
    if (modelsData) {
      const modelList = Array.isArray(modelsData) ? modelsData : Object.keys(modelsData).map(k => ({ id: k, ...(modelsData as any)[k] }));
      const targetModel = modelList.find(m => m.name === activeDevice.model);
      if (targetModel && targetModel.variants) {
        const targetVariant = targetModel.variants.find((v: any) => v.name === activeDevice.variant);
        if (targetVariant) trueBasePrice = Number(targetVariant.usedPrice || targetVariant.price || 0);
        else trueBasePrice = Number(targetModel.variants[0]?.usedPrice || targetModel.variants[0]?.price || 0);
      }
    }
    const startingPrice = trueBasePrice > 0 ? trueBasePrice : Number(activeDevice.base_price || activeDevice.estimated_price || 0);

    // 🌟 2. THE FIX: คำนวณยอดหักและยัดใส่ข้อความ Label ให้ลูกค้าและแอดมินเห็น
    let totalDeduction = 0;
    if (activeDevice.isNewDevice) {
      deductionLabels.push('[สภาพสินค้า] เครื่องใหม่มือ 1 (ตรวจสอบซีลและกล่องสมบูรณ์)');
    } else {
      activeChecklist.forEach((group: any) => {
        group.options?.forEach((opt: any) => {
          if (checks.includes(opt.id)) {
            // 🌟 THE FIX: สลับสมการให้ตรงกับหน้าเว็บ
            let deductAmount = 0;
            if (startingPrice >= 30000) {
              deductAmount = Number(opt.t1 || 0);
            } else if (startingPrice >= 15000 && startingPrice < 30000) {
              deductAmount = Number(opt.t2 || 0);
            } else {
              deductAmount = Number(opt.t3 || 0);
            }

            totalDeduction += deductAmount;

            if (deductAmount > 0) {
              deductionLabels.push(`[${group.title}] ${opt.label} (-฿${deductAmount.toLocaleString()})`);
            } else {
              deductionLabels.push(`[${group.title}] ${opt.label}`);
            }
          }
        });
      });
    }

    const finalPrice = activeDevice.isNewDevice ? startingPrice : Math.max(0, startingPrice - totalDeduction);

    setInspectedDevicesData(prev => ({
      ...prev, [activeDeviceIndex]: { checks: activeDevice.isNewDevice ? [] : [...checks], photos: [...photos], photoFiles: [...photoFiles], deductions: deductionLabels, final_price: finalPrice }
    }));
    setActiveDeviceIndex(null);
  };

  const submitAllInspections = async () => {
    if (!inspectingJob) return;
    setIsUploading(true);
    try {
      const updatedDevices = [...getDevicesList(inspectingJob)];
      let jobTotalDevicePrice = 0;

      for (let i = 0; i < updatedDevices.length; i++) {
        const data = inspectedDevicesData[i];
        if (data) {
          const uploadedUrls = await Promise.all(data.photoFiles.map((file: File) => uploadImageToFirebase(file, `jobs/${inspectingJob.id}/inspection/device_${i}`)));
          // 🌟 อัปเดตทั้ง estimated_price และ price ให้ตรงกัน
          updatedDevices[i] = { ...updatedDevices[i], photos: uploadedUrls, deductions: data.deductions, estimated_price: data.final_price, price: data.final_price, inspection_status: "Inspected" };
          jobTotalDevicePrice += data.final_price;
        } else {
          jobTotalDevicePrice += Number(updatedDevices[i].estimated_price || updatedDevices[i].price || 0);
        }
      }

      const pickupFee = Number(inspectingJob.pickup_fee || 0);
      // 🌟 ดึงตัวแปรคูปองจาก 'value' (รองรับ 'actual_value' เผื่อออเดอร์เก่า)
      const couponValue = Number(inspectingJob.applied_coupon?.value || inspectingJob.applied_coupon?.actual_value || 0);

      // 🌟 คำนวณยอดโอนใหม่ (ล็อคไม่ให้ยอดติดลบเด็ดขาด)
      const newNetPayout = Math.max(0, jobTotalDevicePrice - pickupFee + couponValue);

      await updateStatus(inspectingJob.id, 'QC Review', `ไรเดอร์ส่งผลตรวจสภาพ ${updatedDevices.length} เครื่อง`, {
        devices: updatedDevices,
        original_price: jobTotalDevicePrice,
        final_price: jobTotalDevicePrice,
        price: jobTotalDevicePrice,
        net_payout: newNetPayout,
        inspected_at: Date.now()
      });

      setInspectingJob(null); setInspectedDevicesData({}); setActiveDeviceIndex(null);
    } catch (error) { alert('Upload Failed: ' + error); } finally { setIsUploading(false); }
  };

  const handleRequestWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount < 100) return alert('ระบุขั้นต่ำ 100 บาท');
    if (amount > jobData.balance) return alert('ยอดเงินไม่เพียงพอ');
    try {
      await push(ref(db, 'withdrawals'), { rider_id: riderInfo.id, rider_name: riderInfo.name, withdraw_amount: amount, status: 'Withdrawal Requested', requested_at: Date.now(), type: 'Withdrawal', bank_name: riderInfo.bankName, bank_account: riderInfo.accountNo });
      sendAdminNotification('💰 คำขอถอนเงิน', `ไรเดอร์ ${riderInfo.name} ขอเบิกเงิน ${formatCurrency(amount)}`);
      alert('ส่งคำขอถอนเงินสำเร็จ!'); setIsWithdrawModalOpen(false); setWithdrawAmount('');
    } catch (e) { alert(e); }
  };

  const handleSendMessage = async () => {
    if (!chatJobId || !chatText.trim()) return;
    try {
      const currentChatJob = jobData.activeList.find(j => j.id === chatJobId) || jobData.history.find(j => j.id === chatJobId);
      const orderIdDisplay = currentChatJob?.OID || currentChatJob?.ref_no || `#${chatJobId.slice(-4)}`;

      await push(ref(db, `jobs/${chatJobId}/chats`), {
        sender: 'rider',
        senderName: riderInfo.name,
        text: chatText.trim(),
        timestamp: Date.now(),
        read: false
      });
      sendAdminNotification('💬 แชทใหม่จากไรเดอร์', `ไรเดอร์ ${riderInfo.name} ส่งข้อความในงาน ${orderIdDisplay}`);
      setChatText("");
    } catch (error) {
      alert("ไม่สามารถส่งข้อความได้ กรุณาลองใหม่");
    }
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !chatJobId) return;
    const file = e.target.files[0];
    setIsChatUploading(true);

    try {
      const currentChatJob = jobData.activeList.find(j => j.id === chatJobId) || jobData.history.find(j => j.id === chatJobId);
      const orderIdDisplay = currentChatJob?.OID || currentChatJob?.ref_no || `#${chatJobId.slice(-4)}`;

      const imageUrl = await uploadImageToFirebase(file, `jobs/${chatJobId}/chats/images`);

      await push(ref(db, `jobs/${chatJobId}/chats`), {
        sender: 'rider',
        senderName: riderInfo.name,
        text: '📷 ส่งรูปภาพ',
        imageUrl: imageUrl,
        timestamp: Date.now(),
        read: false
      });

      sendAdminNotification('💬 รูปภาพใหม่จากไรเดอร์', `ไรเดอร์ ${riderInfo.name} ส่งรูปภาพในงาน ${orderIdDisplay}`);
    } catch (error) {
      alert("ไม่สามารถอัปโหลดรูปภาพได้ กรุณาลองใหม่");
    } finally {
      setIsChatUploading(false);
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    }
  };

  // 🌟 THE FIX: ปลดล็อคไม่ให้ค้าง ถ้าระบบย่อยบางตัวไม่มีข้อมูลก็ให้ข้ามไปเลย
  if (jobsLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white text-emerald-500">
        <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full mb-4"></div>
        <div className="animate-pulse font-bold text-sm tracking-widest">กำลังเชื่อมต่อระบบ...</div>
      </div>
    );
  }
  const currentChatJob = chatJobId ? (jobData.activeList.find(j => j.id === chatJobId) || jobData.history.find(j => j.id === chatJobId)) : null;
  const chatMessages = currentChatJob?.chats ? Object.values(currentChatJob.chats).sort((a: any, b: any) => a.timestamp - b.timestamp) : [];

  return (
    <div className="min-h-screen bg-[#F3F4F6] max-w-md mx-auto relative overflow-hidden shadow-2xl font-sans text-gray-800">

      {/* 🟢 TAB 1: HOME */}
      {activeTab === 'home' && (
        <div className="absolute inset-0 pb-32 animate-in fade-in duration-500">
          <MapBackground />

          <div className="absolute top-12 left-0 right-0 px-6 z-20 flex justify-between items-center">
            <div onClick={() => setActiveTab('profile')} className="bg-white/90 backdrop-blur-md p-1.5 pr-4 rounded-full shadow-sm flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex justify-center items-center font-bold text-lg shadow-inner">{riderInfo.name.charAt(0)}</div>
              <div><div className="text-[10px] text-gray-500 font-medium">ยอดเงินสะสม</div><div className="text-sm font-bold text-gray-800">{formatCurrency(jobData.balance)}</div></div>
            </div>
            <button onClick={() => setIsOnline(!isOnline)} className={`relative w-24 h-10 rounded-full shadow-inner flex items-center transition-all duration-300 ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <div className={`absolute w-8 h-8 bg-white rounded-full flex justify-center items-center transition-transform duration-300 ${isOnline ? 'translate-x-15' : 'translate-x-1'}`}>
                {isOnline ? <Bike size={14} className="text-emerald-500" /> : <X size={14} className="text-gray-400" />}
              </div>
              <span className={`w-full text-center text-xs font-bold ${isOnline ? 'text-white pr-6' : 'text-gray-500 pl-6'}`}>{isOnline ? 'รับงาน' : 'ปิดรับ'}</span>
            </button>
          </div>

          <div className="absolute top-28 bottom-24 left-4 right-4 z-30 overflow-y-auto hide-scrollbar pb-4 space-y-4">

            {/* 🌟 งานเข้าใหม่ (Incoming Jobs) */}
            {isOnline && jobData.incomingList.map(job => (
              <div key={job.id} className="bg-white rounded-[2rem] p-6 shadow-xl border-2 border-emerald-400 animate-in slide-in-from-bottom-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>
                    <span className="text-emerald-600 font-bold text-sm">งานใหม่เข้า!</span>
                  </div>
                  <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl text-sm font-bold flex gap-1.5"><WalletIcon size={16} /> +{formatCurrency(job.rider_fee || 150)}</div>
                </div>

                <h2 className="text-lg font-bold text-gray-900 mb-2 leading-tight">{job.model}</h2>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2 mb-4">
                  <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2">
                    <span className="font-mono text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded">ID: {job.OID || job.ref_no || job.id.slice(-4)}</span>
                    {/* 🌟 แสดงยอดเงินด้วยฟังก์ชัน getDisplayPrice */}
                    <span className="font-bold text-emerald-600">{formatCurrency(getDisplayPrice(job))}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <User size={14} className="text-blue-500" />
                    {/* 🌟 แสดงชื่อลูกค้าด้วยฟังก์ชัน getCustomerName */}
                    <span className="font-semibold">{getCustomerName(job)}</span>
                  </div>
                  {job.appointment_time && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <Clock size={14} />
                      <span className="font-semibold">{formatDate(job.appointment_time)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3 mb-4">
                  <MapPin size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-800">{job.cust_address || job.address || 'รอรับพิกัด'}</span>
                    {(job.address_detail || job.note || job.remark) && (
                      <span className="text-xs text-gray-700 mt-1 bg-yellow-50 p-2 rounded-lg border border-yellow-200 leading-relaxed">
                        📝 <strong>จุดสังเกต/หมายเหตุ:</strong> {job.address_detail || job.note || job.remark}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setRejectingJob(job); setIsRejectModalOpen(true); }} className="w-1/3 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold text-sm hover:bg-red-50 hover:text-red-500 transition-colors">
                    ปฏิเสธ
                  </button>
                  <button onClick={() => updateStatus(job.id, 'Accepted', 'ไรเดอร์กดรับงาน', { rider_id: riderInfo.id })} className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-600 active:scale-95">
                    รับงานนี้
                  </button>
                </div>
              </div>
            ))}

            {/* 🌟 งานที่กำลังทำ (Active Jobs) */}
            {isOnline && jobData.activeList.map((job, index) => (
              <div key={job.id} className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-100 animate-in slide-in-from-bottom flex flex-col gap-4 relative overflow-hidden">
                {jobData.activeList.length > 1 && (
                  <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1 rounded-bl-xl font-bold text-xs shadow-sm">
                    จุดหมายที่ {index + 1}
                  </div>
                )}

                <div className="flex justify-between items-center mb-1 mt-2">
                  <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-semibold">{job.status}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setChatJobId(job.id)} className="bg-purple-50 p-3 rounded-full text-purple-600 hover:bg-purple-100 relative">
                      <MessageSquare size={20} />
                      {job.chats && Object.values(job.chats).some((c: any) => c.sender === 'admin' && !c.read) && (
                        <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                      )}
                    </button>
                    <button onClick={() => handleCallCustomer(job)} className="bg-emerald-50 p-3 rounded-full text-emerald-600 hover:bg-emerald-100"><Phone size={20} /></button>
                    <button onClick={() => handleOpenNavigation(job)} className="bg-blue-50 p-3 rounded-full text-blue-600 hover:bg-blue-100"><Navigation size={20} /></button>
                  </div>
                </div>

                <h2 className="text-lg font-bold text-gray-800 leading-tight">{job.model}</h2>

                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2 mb-1">
                  <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2">
                    <span className="font-mono text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded">ID: {job.OID || job.ref_no || job.id.slice(-4)}</span>
                    {/* 🌟 แสดงยอดเงินด้วยฟังก์ชัน getDisplayPrice */}
                    <span className="font-bold text-emerald-600">{formatCurrency(getDisplayPrice(job))}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <User size={14} className="text-blue-500" />
                    {/* 🌟 แสดงชื่อลูกค้าด้วยฟังก์ชัน getCustomerName */}
                    <span className="font-semibold">{getCustomerName(job)}</span>
                  </div>
                  {job.appointment_time && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <Clock size={14} />
                      <span className="font-semibold">{formatDate(job.appointment_time)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-800">{job.cust_address || job.address || 'ไม่พบพิกัด'}</span>
                    {(job.address_detail || job.note || job.remark) && (
                      <span className="text-xs text-gray-700 mt-1 bg-yellow-50 p-2 rounded-lg border border-yellow-200 leading-relaxed">
                        📝 <strong>จุดสังเกต/หมายเหตุ:</strong> {job.address_detail || job.note || job.remark}
                      </span>
                    )}
                  </div>
                </div>

                {job.status === 'Accepted' && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { setRejectingJob(job); setIsRejectModalOpen(true); }} className="w-14 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
                      <X size={20} />
                    </button>
                    <button onClick={() => updateStatus(job.id, 'Heading to Customer', 'ไรเดอร์กำลังเดินทางไปหาลูกค้า')} className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 flex justify-center items-center gap-2">
                      <Bike size={20} /> เริ่มออกเดินทาง (Start Journey)
                    </button>
                  </div>
                )}

                {job.status === 'Heading to Customer' && (
                  <button onClick={() => updateStatus(job.id, 'Arrived', 'ถึงจุดหมายแล้ว')} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 mt-2 flex justify-center items-center gap-2">
                    <MapPin size={20} /> ถึงจุดหมายแล้ว (Arrived)
                  </button>
                )}

                {(job.status === 'Arrived' || job.status === 'Being Inspected') && (
                  <div className="space-y-2 mt-2">
                    <button onClick={() => { if (job.status === 'Arrived') updateStatus(job.id, 'Being Inspected', 'เริ่มตรวจสภาพ'); setInspectingJob(job); setActiveDeviceIndex(null); }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex justify-center gap-2 shadow-md active:scale-95">
                      <ShieldCheck size={22} />{job.status === 'Arrived' ? 'เริ่มตรวจสภาพเครื่อง' : 'ดำเนินการตรวจต่อ'}
                    </button>
                    {job.status === 'Arrived' && (
                      <button onClick={() => { setRejectingJob(job); setIsRejectModalOpen(true); }} className="w-full text-xs font-bold text-gray-400 hover:text-red-500 underline py-2">
                        ติดต่อลูกค้าไม่ได้ / ขอยกเลิกงาน
                      </button>
                    )}
                  </div>
                )}

                {job.status === 'QC Review' && (
                  <div className="bg-amber-50 p-4 rounded-2xl text-center border border-amber-100 mt-2">
                    <div className="animate-spin w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="font-bold text-amber-700 text-sm">รอแอดมินอนุมัติรูปภาพ</p>
                  </div>
                )}

                {(job.status === 'Payout Processing' || job.status === 'Price Accepted') && (
                  <div className="bg-blue-50 p-4 rounded-2xl text-center border border-blue-100 mt-2">
                    <Landmark size={28} className="text-blue-500 mx-auto mb-2 animate-bounce" />
                    <p className="font-bold text-blue-700">แอดมินกำลังโอนเงิน!</p>
                  </div>
                )}

                {['Waiting for Handover', 'Paid', 'PAID'].includes(job.status) && (
                  <div className="space-y-3 mt-2">
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center shadow-sm">
                      <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-1" />
                      <h3 className="font-bold text-emerald-800 text-sm">โอนเงินสำเร็จ!</h3>
                      {(job.slip_url || job.payment_slip || job.slipUrl || job.payment_info?.slip_url) && (
                        <img src={job.slip_url || job.payment_slip || job.slipUrl || job.payment_info?.slip_url} className="w-full h-auto max-h-48 object-contain mt-2 rounded-xl" />
                      )}
                    </div>
                    <button onClick={() => { if (confirm('เดินทางกลับสาขาใช่หรือไม่?')) updateStatus(job.id, 'In-Transit', 'เดินทางกลับ'); }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-md flex justify-center gap-2"><Bike size={20} /> เดินทางกลับสาขา</button>
                  </div>
                )}

                {job.status === 'In-Transit' && (
                  <button onClick={() => handleCompleteJob(job)} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-md flex justify-center gap-2 mt-2"><PackageOpen size={20} /> ถึงสาขาแล้ว (ส่งมอบเครื่อง)</button>
                )}

                {job.status === 'Revised Offer' && (
                  <div className="bg-purple-50 p-4 rounded-2xl text-center border border-purple-100 mt-2">
                    {/* 🌟 แสดงยอดเงินที่มีการปรับราคาแล้วอย่างถูกต้อง */}
                    <h3 className="font-bold text-purple-700 mb-2">มีการปรับราคาใหม่: {formatCurrency(getDisplayPrice(job))}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => { if (confirm('ลูกค้ายกเลิก?')) updateStatus(job.id, 'Cancelled', 'ลูกค้ายกเลิก', { cancel_reason: 'ลูกค้ายกเลิก' }) }} className="flex-1 bg-white text-red-500 py-2 rounded-xl text-sm font-bold border border-red-200">ยกเลิก</button>
                      <button onClick={() => { if (confirm('ลูกค้ายอมรับ?')) updateStatus(job.id, 'Payout Processing', 'ลูกค้ายอมรับ', { customer_accepted_at: Date.now() }) }} className="flex-1 bg-purple-600 text-white py-2 rounded-xl text-sm font-bold shadow">ยอมรับ</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🔵 TAB 2: HISTORY */}
      {activeTab === 'history' && (
        <div className="p-6 pt-12 h-full overflow-y-auto pb-32 animate-in fade-in">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">ประวัติการรับงาน</h2>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-6 pb-2">
            {[
              { id: 'today', label: 'วันนี้' },
              { id: 'yesterday', label: 'เมื่อวาน' },
              { id: 'this_week', label: 'สัปดาห์นี้' },
              { id: 'all', label: 'ทั้งหมด' }
            ].map(filter => (
              <button key={filter.id} onClick={() => setHistoryFilter(filter.id as any)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${historyFilter === filter.id ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200'}`}>
                {filter.label}
              </button>
            ))}
          </div>
          <div className="bg-emerald-500 rounded-[2rem] p-6 mb-8 text-white shadow-lg relative overflow-hidden transition-all duration-300">
            <div className="absolute top-0 right-0 p-4 opacity-20"><Activity size={80} /></div>
            <p className="text-xs font-medium text-emerald-100 mb-4">สรุปผลงาน</p>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div><p className="text-xs text-emerald-100 mb-1">รายได้รวม</p><p className="text-3xl font-bold">{formatCurrency(displayHistoryData.stats.income)}</p></div>
              <div className="border-l border-emerald-400 pl-6"><p className="text-xs text-emerald-100 mb-1">จำนวนงาน</p><p className="text-3xl font-bold">{displayHistoryData.stats.count} <span className="text-sm font-normal">งาน</span></p></div>
            </div>
          </div>
          <div className="space-y-3">
            {displayHistoryData.list.length === 0 ? <div className="text-center text-gray-400 py-10 font-medium bg-white rounded-3xl border border-dashed border-gray-200">ไม่มีประวัติการวิ่งงานในช่วงเวลานี้</div> : displayHistoryData.list.map(job => (
              <div key={job.id} className="bg-white p-4 rounded-2xl shadow-sm flex flex-col border border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-gray-800 text-sm mb-1 line-clamp-1">{job.model}</div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-2">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{job.OID || job.ref_no || `#${job.id.slice(-4)}`}</span>
                      <span>•</span>
                      <span>{formatDate(job.completed_at || job.updated_at || job.created_at)}</span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <div className="text-base font-bold text-emerald-500 bg-emerald-50 px-3 py-1 rounded-xl">
                      +{formatCurrency(job.rider_fee || 150)}
                    </div>
                    {job.chats && (
                      <button
                        onClick={() => setChatJobId(job.id)}
                        className="text-[10px] flex items-center gap-1 text-purple-600 bg-purple-50 px-2 py-1 rounded-lg hover:bg-purple-100 transition-colors"
                      >
                        <MessageSquare size={12} /> ประวัติแชท
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🟠 TAB 3: WALLET */}
      {activeTab === 'wallet' && (
        <div className="h-full bg-[#F9FAFB] overflow-y-auto pb-32 animate-in fade-in">
          <div className="bg-emerald-600 p-8 pt-16 pb-12 text-white rounded-b-[2.5rem] shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><WalletIcon size={120} /></div>
            <p className="text-xs font-medium text-emerald-100 mb-2">ยอดเงินที่ถอนได้ (Available Balance)</p>
            <h3 className="text-5xl font-bold mb-8 tracking-tight">{formatCurrency(jobData.balance)}</h3>
            <button onClick={() => setIsWithdrawModalOpen(true)} className="w-full bg-white text-emerald-700 py-4 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-transform">ขอถอนเงินเข้าบัญชี</button>
          </div>
          <div className="p-6 space-y-4">
            <h4 className="font-bold text-gray-800 text-sm mb-2">ประวัติธุรกรรมล่าสุด</h4>
            {jobData.transactions.length === 0 ? <div className="text-center text-gray-400 py-10 font-medium">ยังไม่มีประวัติธุรกรรม</div> : jobData.transactions.map((t: any) => (
              <div key={t.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${t.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-500' : 'bg-orange-50 text-orange-500'}`}>
                    {t.type === 'CREDIT' ? <Bike size={20} /> : <Landmark size={20} />}
                  </div>
                  <div><div className="text-sm font-bold text-gray-800">{t.category}</div><div className="text-[10px] text-gray-400 mt-0.5">{formatDate(t.timestamp)}</div></div>
                </div>
                <div className={`text-base font-bold ${t.type === 'CREDIT' ? 'text-emerald-500' : 'text-gray-900'}`}>{t.type === 'CREDIT' ? '+' : '-'}{formatCurrency(t.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⚪️ TAB 4: PROFILE */}
      {activeTab === 'profile' && (
        <div className="h-full bg-[#F3F4F6] animate-in slide-in-from-right duration-300 overflow-y-auto pb-32">
          <div className="bg-white p-6 pt-12 pb-6 flex items-center gap-4 sticky top-0 z-20 border-b border-gray-100"><button onClick={() => setActiveTab('home')} className="p-2 -ml-2 bg-gray-50 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button><h2 className="text-lg font-bold text-gray-900">โปรไฟล์ของฉัน</h2></div>
          <div className="p-6 space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold text-2xl shadow-inner">{riderInfo.name.charAt(0)}</div>
              <div className="flex-1"><h3 className="text-xl font-bold text-gray-900">{riderInfo.name}</h3><p className="text-xs font-medium text-gray-500 mt-1">รหัสพนักงาน: {riderInfo.id}</p></div>
            </div>
            <div className="space-y-3">
              <button onClick={() => setIsBankModalOpen(true)} className="w-full bg-white p-5 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm active:scale-95 transition-all"><div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><CreditCard size={20} /></div><div className="flex-1 text-left font-semibold text-gray-800">บัญชีรับเงิน</div><ChevronRight size={20} className="text-gray-300" /></button>
              <button onClick={() => setIsDocModalOpen(true)} className="w-full bg-white p-5 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm active:scale-95 transition-all"><div className="p-2 bg-purple-50 text-purple-500 rounded-lg"><FileText size={20} /></div><div className="flex-1 text-left font-semibold text-gray-800">เอกสารประจำตัว</div><ChevronRight size={20} className="text-gray-300" /></button>
            </div>
            <button onClick={async () => { if (window.confirm('คุณต้องการออกจากระบบ (สลับบัญชี) หรือไม่?')) { setIsOnline(false); await signOut(auth); localStorage.removeItem('rider_id'); localStorage.removeItem('device_pin'); window.location.reload(); } }} className="w-full p-4 mt-8 flex items-center justify-center gap-2 text-red-500 font-bold text-sm bg-white rounded-2xl shadow-sm border border-red-100 hover:bg-red-50"><LogOut size={18} /> ออกจากระบบ (สลับบัญชี)</button>
          </div>
        </div>
      )}

      {/* ⚠️ MODALS SECTION */}

      {/* 🌟 1. MODAL: ปฏิเสธงาน / ยกเลิกงาน (Reject Job Modal) */}
      {isRejectModalOpen && rejectingJob && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white w-full sm:w-96 rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-12 sm:pb-6 animate-in slide-in-from-bottom duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center"><AlertTriangle size={20} /></div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">ปฏิเสธรับงาน<br /><span className="text-xs text-gray-500 font-normal">งานจะถูกคืนไปยังส่วนกลาง</span></h3>
              </div>
              <button onClick={() => { setIsRejectModalOpen(false); setRejectingJob(null); }} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 text-gray-500"><X size={20} /></button>
            </div>

            <p className="text-sm font-bold text-gray-700 mb-3">กรุณาระบุเหตุผล (บังคับ):</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6 hide-scrollbar">
              {REJECT_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => setSelectedRejectReason(reason)}
                  className={`w-full text-left p-3.5 rounded-xl border text-sm font-semibold transition-all ${selectedRejectReason === reason ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <button
              onClick={handleRejectOrCancelJob}
              disabled={isRejecting || !selectedRejectReason}
              className="w-full bg-red-500 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-red-500/30 hover:bg-red-600 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
            >
              {isRejecting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'ยืนยันการคืนงาน'}
            </button>
          </div>
        </div>
      )}

      {/* 🌟 2. CHAT MODAL */}
      {chatJobId && currentChatJob && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex flex-col justify-end animate-in fade-in duration-300">
          <div className="bg-[#F3F4F6] w-full h-[85vh] rounded-t-[2rem] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.2)] overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="bg-white p-4 px-6 flex justify-between items-center shadow-sm z-10">
              <div>
                <h3 className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={18} className="text-purple-500" /> ห้องแชท / แจ้งปัญหา</h3>
                <p className="text-xs text-gray-500 mt-1">ออเดอร์: {currentChatJob.model} <br /><span className="font-mono font-medium text-purple-600">Order ID: {currentChatJob.OID || currentChatJob.ref_no || `#${chatJobId?.slice(-4)}`}</span></p>
              </div>
              <button onClick={() => setChatJobId(null)} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-400 py-10 font-medium text-sm">ยังไม่มีข้อความ เริ่มต้นแชทกับแอดมินเลย!</div>
              ) : (
                chatMessages.map((msg: any, index: number) => {
                  const isMe = msg.sender === 'rider';
                  return (
                    <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${isMe ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm border border-gray-200 shadow-sm'}`}>
                        {/* 🌟 แสดงผลชื่อผู้ส่ง (แอดมิน หรือ ลูกค้า) */}
                        {!isMe && <p className="text-[10px] font-bold text-purple-600 mb-1">
                          {msg.sender === 'Customer' ? (msg.senderName || 'ลูกค้า') : (msg.senderName || 'แอดมิน')}
                        </p>}
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        {msg.imageUrl && (<img src={msg.imageUrl} alt="attachment" className="mt-2 rounded-xl w-full max-h-48 object-cover border border-black/10" />)}
                        <p className={`text-[9px] mt-2 text-right ${isMe ? 'text-purple-200' : 'text-gray-400'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {['Pending QC', 'In Stock', 'Paid', 'PAID', 'Completed', 'Returned', 'Closed (Lost)', 'Cancelled'].includes(currentChatJob.status) ? (
              <div className="bg-gray-100 p-4 pb-8 text-center border-t border-gray-200"><span className="text-xs font-bold text-gray-500 flex items-center justify-center gap-2">🔒 การสนทนานี้ถูกปิดแล้ว (จบงาน)</span></div>
            ) : (
              <div className="bg-white p-4 pb-8 border-t border-gray-100 flex gap-2 items-end">
                <input type="file" accept="image/*" className="hidden" ref={chatFileInputRef} onChange={handleChatImageUpload} />
                <button onClick={() => chatFileInputRef.current?.click()} disabled={isChatUploading} className="p-3 bg-gray-50 text-gray-500 rounded-full hover:bg-gray-100 shrink-0 disabled:opacity-50">
                  {isChatUploading ? <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div> : <ImageIcon size={20} />}
                </button>
                <textarea value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="พิมพ์ข้อความที่นี่..." className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none resize-none min-h-[48px] max-h-24" rows={1} />
                <button onClick={handleSendMessage} disabled={!chatText.trim()} className={`p-3 rounded-full shrink-0 transition-colors ${!chatText.trim() ? 'bg-gray-100 text-gray-400' : 'bg-purple-600 text-white shadow-md'}`}>
                  <Send size={20} className={chatText.trim() ? 'translate-x-0.5' : ''} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. INSPECTION MODAL */}
      {inspectingJob && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end animate-in fade-in duration-300">
          <div className="bg-white w-full rounded-t-[2rem] p-6 pb-12 animate-in slide-in-from-bottom duration-500 max-h-[90vh] overflow-y-auto flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
            {activeDeviceIndex === null ? (
              <div className="animate-in fade-in">
                <div className="flex justify-between items-center mb-6"><div><h3 className="text-xl font-bold text-gray-900">รายการที่ต้องตรวจ</h3><p className="text-sm text-gray-500 mt-1">ทั้งหมด {devicesListForModal.length} เครื่อง</p></div><button onClick={() => setInspectingJob(null)} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"><X size={20} /></button></div>
                <div className="space-y-3 mb-8">
                  {devicesListForModal.map((device: any, index: number) => {
                    const isDone = !!inspectedDevicesData[index];
                    return (
                      <div key={index} className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${isDone ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white shadow-sm'}`}>
                        <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{isDone ? <CheckCircle2 size={24} /> : <Smartphone size={24} />}</div><div><div className="font-semibold text-sm text-gray-900 leading-tight">{device.model}</div>{isDone ? <div className="text-xs font-medium text-emerald-600 mt-1">ตรวจแล้ว ✓</div> : <div className="text-xs font-medium text-amber-500 mt-1">รอตรวจสอบ</div>}</div></div>
                        <button onClick={() => { setChecks(inspectedDevicesData[index]?.checks || []); setPhotos(inspectedDevicesData[index]?.photos || []); setPhotoFiles(inspectedDevicesData[index]?.photoFiles || []); setActiveDeviceIndex(index); }} className={`px-4 py-2 rounded-xl font-semibold text-xs transition-all ${isDone ? 'bg-white text-gray-600 border border-gray-200' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700'}`}>{isDone ? 'แก้ไข' : 'เริ่มตรวจ'}</button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={submitAllInspections} disabled={isUploading || Object.keys(inspectedDevicesData).length !== devicesListForModal.length} className={`w-full py-4 rounded-2xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-2 ${isUploading || Object.keys(inspectedDevicesData).length !== devicesListForModal.length ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-emerald-500 text-white active:scale-95 hover:bg-emerald-600'}`}>{isUploading ? <><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div> อัปโหลด...</> : <><Upload size={22} /> ส่งผลตรวจทั้งหมด</>}</button>
              </div>
            ) : (
              <div className="animate-in slide-in-from-right duration-300">
                <div className="flex items-center gap-3 mb-6"><button onClick={() => setActiveDeviceIndex(null)} className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200"><ChevronLeft size={20} /></button><h3 className="text-lg font-bold text-gray-900 leading-tight flex-1 line-clamp-1">{devicesListForModal[activeDeviceIndex].model}</h3></div>
                <div className="space-y-8">
                  <div>
                    <label className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><Camera size={16} className="text-blue-500" /> รูปถ่ายตัวเครื่อง</label>
                    <div className="grid grid-cols-3 gap-3">
                      {photos.map((p, i) => (<div key={i} className="aspect-square rounded-2xl overflow-hidden relative shadow-sm border border-gray-100"><img src={p} className="w-full h-full object-cover" /><button onClick={() => handleRemovePhoto(i)} className="absolute top-2 right-2 bg-white/90 text-red-500 rounded-full p-1.5 shadow-sm"><X size={12} /></button></div>))}
                      <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors bg-blue-50/30"><Camera size={24} /><span className="text-xs font-medium mt-1">เพิ่มรูป</span></button>
                    </div>
                    <input type="file" accept="image/jpeg, image/png, image/jpg, image/webp" multiple className="hidden" ref={fileInputRef} onChange={handleCapture} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><ListChecks size={16} className="text-purple-500" /> เช็คลิสต์สภาพเครื่อง</label>
                    {devicesListForModal[activeDeviceIndex]?.isNewDevice ? (
                      <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl text-center shadow-sm"><PackageOpen size={36} className="text-blue-500 mx-auto mb-3 animate-pulse" /><h4 className="font-bold text-blue-800 text-base mb-1">เครื่องใหม่มือ 1 (Brand New)</h4><p className="text-xs text-blue-600 font-medium leading-relaxed">รายการนี้เป็นเครื่องใหม่ยังไม่แกะซีล <br />ไม่ต้องทำรายการเช็คลิสต์สภาพตัวเครื่อง<br /><strong className="text-blue-800 mt-2 block bg-white p-2 rounded-lg border border-blue-100">📸 กรุณาถ่ายรูปกล่อง ซีลพลาสติก และเลข IMEI ให้ชัดเจน</strong></p></div>
                    ) : activeChecklist.length > 0 ? (
                      activeChecklist.map((group: any) => (
                        <div key={group.id} className="mb-4">
                          <h4 className="text-sm font-medium text-gray-600 mb-2 pl-1">{group.title}</h4>
                          <div className="space-y-2">
                            {group.options?.map((opt: any) => {
                              const isChecked = checks.includes(opt.id);

                              // 🌟 THE FIX: คำนวณ Tier ให้ตรงกับราคา Grade A
                              let displayDeduct = 0;
                              const currentDevice = devicesListForModal[activeDeviceIndex];
                              let trueBasePrice = 0;

                              if (modelsData && currentDevice) {
                                const modelList = Array.isArray(modelsData) ? modelsData : Object.keys(modelsData).map(k => ({ id: k, ...(modelsData as any)[k] }));
                                const targetModel = modelList.find(m => m.name === currentDevice.model);
                                if (targetModel && targetModel.variants) {
                                  const targetVariant = targetModel.variants.find((v: any) => v.name === currentDevice.variant);
                                  if (targetVariant) trueBasePrice = Number(targetVariant.usedPrice || targetVariant.price || 0);
                                  else trueBasePrice = Number(targetModel.variants[0]?.usedPrice || targetModel.variants[0]?.price || 0);
                                }
                              }
                              const startingPrice = trueBasePrice > 0 ? trueBasePrice : Number(currentDevice?.base_price || currentDevice?.estimated_price || 0);

                              // เลือกเรทที่ถูกต้องมาโชว์บนหน้าจอ
                              if (startingPrice >= 30000) displayDeduct = Number(opt.t1 || 0);
                              else if (startingPrice >= 15000 && startingPrice < 30000) displayDeduct = Number(opt.t2 || 0);
                              else displayDeduct = Number(opt.t3 || 0);

                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => {
                                    setChecks((prev: string[]) => {
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
                                      {/* 🌟 โชว์เลขที่ถูกต้องตาม Tier แล้ว! */}
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
      )}

      {/* 4. WITHDRAW MODAL */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end animate-in fade-in duration-300">
          <div className="bg-white w-full rounded-t-[2rem] p-8 pb-12 animate-in slide-in-from-bottom duration-500 shadow-[0_-20px_50px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-bold text-gray-900">ถอนเงินเข้าบัญชี</h3><button onClick={() => setIsWithdrawModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button></div>
            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 mb-8 flex justify-center items-center"><span className="text-3xl font-bold text-gray-400 mr-2">฿</span><input type="number" autoFocus value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="w-2/3 bg-transparent border-none text-5xl font-bold text-gray-900 outline-none text-center" placeholder="0" /></div>
            <button onClick={handleRequestWithdraw} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-600 active:scale-95 transition-all">ยืนยันการถอนเงิน</button>
          </div>
        </div>
      )}

      {/* 5. BANK MODAL */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 z-[100] flex items-end">
          <div className="bg-white w-full rounded-t-[2rem] p-8 pb-12">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">บัญชีรับเงิน</h3><button onClick={() => setIsBankModalOpen(false)} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button></div>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-2xl"><label className="text-xs font-medium text-gray-500 block mb-1">ธนาคาร</label><input className="w-full bg-transparent font-bold text-gray-900 outline-none" value={riderInfo.bankName} onChange={e => setRiderInfo({ ...riderInfo, bankName: e.target.value })} /></div>
              <div className="bg-gray-50 p-4 rounded-2xl"><label className="text-xs font-medium text-gray-500 block mb-1">เลขบัญชี</label><input className="w-full bg-transparent font-bold text-gray-900 outline-none" value={riderInfo.accountNo} onChange={e => setRiderInfo({ ...riderInfo, accountNo: e.target.value })} /></div>
              <button onClick={async () => { try { await update(ref(db, `riders/${currentRiderId}/bank`), { name: riderInfo.bankName, account: riderInfo.accountNo }); setIsBankModalOpen(false); } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e); } }} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold mt-4">บันทึกข้อมูล</button>
            </div>
          </div>
        </div>
      )}

      {/* 6. DOC MODAL */}
      {isDocModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 z-[100] flex items-end">
          <div className="bg-white w-full rounded-t-[2rem] p-8 pb-12">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">เอกสารประจำตัว</h3><button onClick={() => setIsDocModalOpen(false)} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button></div>
            <div className="space-y-6">
              <div className="space-y-2"><p className="text-sm font-semibold text-gray-700">รูปถ่ายบัตรประชาชน</p><label className="block w-full h-32 rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center cursor-pointer bg-blue-50/50 hover:bg-blue-50 transition-colors">{riderInfo.idCardImg ? <img src={riderInfo.idCardImg} className="w-full h-full object-cover rounded-xl" /> : <><Upload size={24} className="text-blue-500 mb-2" /><span className="text-xs text-blue-600 font-bold">อัปโหลดรูปภาพ</span></>}<input type="file" className="hidden" onChange={(e) => handleDocUpload('idCard', e)} /></label></div>
              <button onClick={() => setIsDocModalOpen(false)} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold">บันทึกเอกสาร</button>
            </div>
          </div>
        </div>
      )}

      {/* 🧭 BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-around items-center z-50 pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {[{ id: 'home', icon: Navigation, label: 'หน้าหลัก' }, { id: 'history', icon: History, label: 'ประวัติ' }, { id: 'wallet', icon: WalletIcon, label: 'กระเป๋าเงิน' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center gap-1 transition-all ${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-400 hover:text-gray-500'}`}>
            <div className={`p-1.5 rounded-xl ${activeTab === tab.id ? 'bg-emerald-50' : ''}`}>
              <tab.icon size={24} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-bold">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};