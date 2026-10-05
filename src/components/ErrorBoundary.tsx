import { Component, ErrorInfo, ReactNode } from 'react';
import { Logger } from '../services/loggerService';
interface ErrorBoundaryProps {
    children?: ReactNode;
}
interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}
// React + browser extension conflicts can trigger benign removeChild errors.
if (typeof Node === 'function' && Node.prototype) {
    const originalRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(child: T): T {
        if (child.parentNode !== this) {
            if (typeof console !== 'undefined') {
                Logger.warn('UI', 'DOM Node removal error suppressed (Extension conflict).');
            }
            return child;
        }
        return originalRemoveChild.call(this, child) as T;
    };
}
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null
    };
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        Logger.error('UI', 'React Error Boundary Caught Error', error, {
            componentStack: errorInfo.componentStack
        });
    }
    private isEnglishMode(): boolean {
        if (typeof document === 'undefined')
            return false;
        return document.documentElement.dir === 'ltr' || document.body?.dir === 'ltr';
    }
    private tr(en: string, fa: string): string {
        return this.isEnglishMode() ? en : fa;
    }
    handleExportLogs = async () => {
        if (window.electronAPI?.exportLogs) {
            try {
                const result = await window.electronAPI.exportLogs();
                if (result.success) {
                    alert(`${this.tr('Crash report saved to', 'گزارش خطا ذخیره شد در')}:\n${result.filePath}`);
                }
                else if (!result.canceled) {
                    alert(`${this.tr('Failed to export logs', 'دریافت لاگ ناموفق بود')}: ${result.error}`);
                }
            }
            catch (e) {
                alert(this.tr('Export failed.', 'دریافت لاگ ناموفق بود.'));
            }
        }
        else {
            alert(this.tr('Log export is only available in Desktop App.', 'دریافت لاگ فقط در نسخه دسکتاپ در دسترس است.'));
        }
    };
    render() {
        if (this.state.hasError) {
            const isEnglish = this.isEnglishMode();
            const tr = (en: string, fa: string) => (isEnglish ? en : fa);
            return (<div className="min-h-screen flex items-center justify-center bg-gray-100 p-4" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center border-t-4 border-red-500">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">{tr('Something went wrong', 'متاسفانه خطایی رخ داده است')}</h1>
            <p className="text-gray-500 text-sm mb-6">{tr('The page could not be rendered. Please reload the app.', 'سیستم قادر به نمایش صفحه نیست. لطفاً برنامه را بازنشانی کنید.')}</p>

            <div className="bg-gray-50 p-4 rounded-lg text-left text-xs text-gray-700 font-mono overflow-auto mb-6 max-h-40 border border-gray-200" dir="ltr">
              {this.state.error?.toString()}
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition font-bold shadow-lg shadow-blue-500/30">
                {tr('Reload App', 'بازنشانی برنامه')}
              </button>
              <button onClick={this.handleExportLogs} className="bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl hover:bg-gray-300 transition font-bold text-sm flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                {tr('Download Crash Log', 'دریافت گزارش خطا (Log)')}
              </button>
            </div>
          </div>
        </div>);
        }
        return (this as any).props.children;
    }
}
