// src/components/common/ErrorBoundary.tsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-8 text-center">
          <div className="bg-white rounded-3xl p-8 shadow-xl max-w-sm w-full">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-sm text-gray-500 mb-6">
              แอปพลิเคชันเกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองรีเฟรชหน้าใหม่
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-600 active:scale-95 transition-all"
            >
              รีเฟรชหน้าใหม่
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
