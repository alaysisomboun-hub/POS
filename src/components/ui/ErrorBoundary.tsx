import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    let parsedMessage = error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
    try {
      const obj = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (obj && obj.error) {
        parsedMessage = `ข้อผิดพลาดสิทธิ์ฐานข้อมูล (${obj.operationType ?? 'operation'} · ${obj.path ?? '-'}): ${obj.error}`;
      }
    } catch {
      // plain error message
    }
    return { hasError: true, message: parsedMessage };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-900">เกิดข้อผิดพลาดในการทำงานของระบบ</h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-5 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
