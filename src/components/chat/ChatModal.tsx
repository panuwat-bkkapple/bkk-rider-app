// src/components/chat/ChatModal.tsx
import { useState, useRef, useEffect } from 'react';
import { X, MessageSquare, Send, Image as ImageIcon } from 'lucide-react';
import { ref, push } from 'firebase/database';
import { db } from '../../api/firebase';
import { uploadImageToFirebase } from '../../utils/uploadImage';
import { sendAdminNotification } from '../../utils/notifications';
import type { RiderInfo } from '../../types';

interface ChatModalProps {
  chatJob: any;
  riderInfo: RiderInfo;
  onClose: () => void;
}

const CLOSED_STATUSES = ['Pending QC', 'In Stock', 'Paid', 'PAID', 'Completed', 'Returned', 'Closed (Lost)', 'Cancelled'];

export const ChatModal = ({ chatJob, riderInfo, onClose }: ChatModalProps) => {
  const [chatText, setChatText] = useState('');
  const [isChatUploading, setIsChatUploading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  const chatMessages = chatJob?.chats
    ? Object.values(chatJob.chats).sort((a: any, b: any) => a.timestamp - b.timestamp)
    : [];

  const orderIdDisplay = chatJob?.OID || chatJob?.ref_no || `#${chatJob?.id?.slice(-4)}`;
  const isClosed = CLOSED_STATUSES.includes(chatJob?.status);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const handleSendMessage = async () => {
    if (!chatJob || !chatText.trim()) return;
    try {
      await push(ref(db, `jobs/${chatJob.id}/chats`), {
        sender: 'rider', senderName: riderInfo.name,
        text: chatText.trim(), timestamp: Date.now(), read: false
      });
      sendAdminNotification('แชทใหม่จากไรเดอร์', `ไรเดอร์ ${riderInfo.name} ส่งข้อความในงาน ${orderIdDisplay}`);
      setChatText('');
    } catch {
      alert('ไม่สามารถส่งข้อความได้ กรุณาลองใหม่');
    }
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !chatJob) return;
    const file = e.target.files[0];
    setIsChatUploading(true);
    try {
      const imageUrl = await uploadImageToFirebase(file, `jobs/${chatJob.id}/chats/images`);
      await push(ref(db, `jobs/${chatJob.id}/chats`), {
        sender: 'rider', senderName: riderInfo.name,
        text: 'ส่งรูปภาพ', imageUrl, timestamp: Date.now(), read: false
      });
      sendAdminNotification('รูปภาพใหม่จากไรเดอร์', `ไรเดอร์ ${riderInfo.name} ส่งรูปภาพในงาน ${orderIdDisplay}`);
    } catch {
      alert('ไม่สามารถอัปโหลดรูปภาพได้ กรุณาลองใหม่');
    } finally {
      setIsChatUploading(false);
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex flex-col justify-end animate-in fade-in duration-300">
      <div className="bg-[#F3F4F6] w-full h-[85vh] rounded-t-[2rem] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.2)] overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="bg-white p-4 px-6 flex justify-between items-center shadow-sm z-10">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare size={18} className="text-purple-500" /> ห้องแชท / แจ้งปัญหา
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              ออเดอร์: {chatJob.model} <br />
              <span className="font-mono font-medium text-purple-600">Order ID: {orderIdDisplay}</span>
            </p>
          </div>
          <button onClick={onClose} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200">
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="text-center text-gray-400 py-10 font-medium text-sm">ยังไม่มีข้อความ เริ่มต้นแชทกับแอดมินเลย!</div>
          ) : (
            chatMessages.map((msg: any, index: number) => {
              const isMe = msg.sender === 'rider';
              return (
                <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${isMe ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm border border-gray-200 shadow-sm'}`}>
                    {!isMe && (
                      <p className="text-[10px] font-bold text-purple-600 mb-1">
                        {msg.sender === 'Customer' ? (msg.senderName || 'ลูกค้า') : (msg.senderName || 'แอดมิน')}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    {msg.imageUrl && (
                      <img src={msg.imageUrl} alt="attachment" className="mt-2 rounded-xl w-full max-h-48 object-cover border border-black/10" />
                    )}
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

        {/* Input */}
        {isClosed ? (
          <div className="bg-gray-100 p-4 pb-8 text-center border-t border-gray-200">
            <span className="text-xs font-bold text-gray-500 flex items-center justify-center gap-2">การสนทนานี้ถูกปิดแล้ว (จบงาน)</span>
          </div>
        ) : (
          <div className="bg-white p-4 pb-8 border-t border-gray-100 flex gap-2 items-end">
            <input type="file" accept="image/*" className="hidden" ref={chatFileInputRef} onChange={handleChatImageUpload} />
            <button
              onClick={() => chatFileInputRef.current?.click()}
              disabled={isChatUploading}
              className="p-3 bg-gray-50 text-gray-500 rounded-full hover:bg-gray-100 shrink-0 disabled:opacity-50"
            >
              {isChatUploading
                ? <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                : <ImageIcon size={20} />
              }
            </button>
            <textarea
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="พิมพ์ข้อความที่นี่..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none resize-none min-h-[48px] max-h-24"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatText.trim()}
              className={`p-3 rounded-full shrink-0 transition-colors ${!chatText.trim() ? 'bg-gray-100 text-gray-400' : 'bg-purple-600 text-white shadow-md'}`}
            >
              <Send size={20} className={chatText.trim() ? 'translate-x-0.5' : ''} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
