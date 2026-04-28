// src/components/common/ErrorBoundary.tsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.name}: ${error?.message}`,
      '',
      'Stack:',
      error?.stack || '(no stack)',
      '',
      'Component stack:',
      errorInfo?.componentStack || '(no component stack)',
      '',
      `UA: ${navigator.userAgent}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-xl max-w-md w-full">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">เกิดข้อผิดพลาด</h2>
            <p className="text-sm text-gray-500 mb-4 text-center">
              แอปพลิเคชันเกิดข้อผิดพลาดที่ไม่คาดคิด
            </p>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-left">
              <p className="text-xs font-bold text-red-700 mb-1">{error?.name || 'Error'}</p>
              <p className="text-xs text-red-600 break-words mb-2">{error?.message || '(no message)'}</p>
              {error?.stack && (
                <pre className="text-[10px] text-gray-600 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                  {error.stack}
                </pre>
              )}
              {errorInfo?.componentStack && (
                <pre className="text-[10px] text-gray-500 mt-2 overflow-auto max-h-32 whitespace-pre-wrap break-words border-t border-red-100 pt-2">
                  {errorInfo.componentStack}
                </pre>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={this.handleCopy}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-2xl font-bold text-sm hover:bg-gray-200 active:scale-95 transition-all"
              >
                คัดลอกรายละเอียด
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-emerald-500 text-white py-3 rounded-2xl font-bold text-sm shadow-lg hover:bg-emerald-600 active:scale-95 transition-all"
              >
                รีเฟรชหน้า
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
