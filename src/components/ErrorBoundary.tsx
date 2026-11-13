import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected interface error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F7F8F3] dark:bg-[#0D1917] p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-[#17211F] dark:text-[#F7F8F3]">Something went wrong</h1>
            <p className="text-sm text-[#17211F]/70 dark:text-[#F7F8F3]/70 mt-2">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#087F8C] text-white font-medium text-sm flex items-center justify-center gap-2 hover:bg-[#066974] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload AccessRoute
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
