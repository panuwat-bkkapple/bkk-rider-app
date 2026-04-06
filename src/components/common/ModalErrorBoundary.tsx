// src/components/common/ModalErrorBoundary.tsx
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onClose: () => void;
}

interface State {
  hasError: boolean;
}

export class ModalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Modal error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 shadow-xl max-w-sm w-full text-center">
            <button
              onClick={this.props.onClose}
              className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500"
            >
              <X size={20} />
            </button>
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={28} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">เกิดข้อผิดพลาด</h3>
            <p className="text-sm text-gray-500 mb-4">
              ไม่สามารถแสดงหน้าต่างนี้ได้ กรุณาลองใหม่อีกครั้ง
            </p>
            <button
              onClick={this.props.onClose}
              className="w-full bg-purple-600 text-white py-3 rounded-2xl font-bold hover:bg-purple-700 active:scale-95 transition-all"
            >
              ปิด
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
