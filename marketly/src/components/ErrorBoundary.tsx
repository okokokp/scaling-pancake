import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          friendly = `Database ${parsed.operationType || 'operation'} on "${parsed.path || 'unknown'}" failed: ${parsed.error}`;
        }
      } catch {
        // non-JSON message
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F9F5FD] p-6 text-[#1E1438] dark:bg-[#050507] dark:text-white">
          <div className="w-full max-w-md rounded-3xl border border-[#E5DDF5] bg-white p-6 shadow-xl dark:border-[#22222C] dark:bg-[#0E0E13]">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h1 className="font-display text-lg font-bold">Something went wrong</h1>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#5E5C70] dark:text-[#B9B0D8] break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#3A2B78] cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reload Marketly</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
