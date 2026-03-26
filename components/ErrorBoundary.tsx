'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-pastel-pink/20">
          <div className="max-w-md w-full bg-white rounded-[32px] p-10 shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8 text-red-500">
              <AlertCircle size={40} />
            </div>
            <h1 className="text-3xl serif mb-4">문제가 발생했습니다</h1>
            <p className="text-gray-500 mb-10 leading-relaxed">
              죄송합니다. 일시적인 오류가 발생했습니다. <br />
              페이지를 새로고침하거나 잠시 후 다시 시도해 주세요.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full btn-primary py-4 flex items-center justify-center gap-2 text-lg"
            >
              <RefreshCcw size={20} /> 다시 시도하기
            </button>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-8 p-4 bg-gray-50 rounded-xl text-xs text-left overflow-auto max-h-40 text-red-400">
                {this.state.error?.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
