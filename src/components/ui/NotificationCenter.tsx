import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, SyncStatus } from '../../types';
import type { HealthSnapshot } from "../../services/localDiagnostics";
import type { ConnectivityState } from "../../services/localWorkspaceState";
import { formatAppDateTime } from '../../lib/formatters';
import { localizeOperationalMessage } from '../../utils/operationalMessageFormatter';
import { resolveOperationalDisplayStatus, type OperationalDisplayStatus, type OperationalTone } from './operationalDisplayStatus';
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';
export type NotificationSource = 'activity' | 'server' | 'sync' | 'security' | 'system' | 'admin';
export interface NotificationCenterItem {
    id: string;
    title: string;
    message: string;
    level: NotificationLevel;
    source: NotificationSource;
    createdAt: string;
    read: boolean;
}
interface NotificationCenterProps {
    isOpen: boolean;
    isEnglish: boolean;
    settings?: AppSettings;
    isOnline: boolean;
    connectivityState?: ConnectivityState;
    syncStatus?: SyncStatus;
    notifications: NotificationCenterItem[];
    queueStatus: {
        length: number;
        isProcessing: boolean;
        isPaused: boolean;
        nextRetry: number;
        queueLength?: number;
        deltaQueueLength?: number;
        warehouseOutboxLength?: number;
        totalPending?: number;
    };
    healthSnapshot: HealthSnapshot;
    onClose: () => void;
    onMarkAllRead: () => void;
    onClearAll: () => void;
    onMarkRead: (id: string) => void;
    onOpenServerManagement: () => void;
}
const levelToneMap: Record<NotificationLevel, string> = {
    info: 'border-sky-200/90 bg-sky-50/95 text-sky-900',
    success: 'border-emerald-200/90 bg-emerald-50/95 text-emerald-900',
    warning: 'border-amber-200/90 bg-amber-50/95 text-amber-900',
    error: 'border-rose-200/90 bg-rose-50/95 text-rose-900'
};
const sourceLabelMap: Record<NotificationSource, {
    en: string;
    fa: string;
}> = {
    activity: { en: 'Activity', fa: 'فعالیت' },
    server: { en: 'Server', fa: 'سرور' },
    sync: { en: 'Sync', fa: 'همگام‌سازی' },
    security: { en: 'Security', fa: 'امنیت' },
    system: { en: 'System', fa: 'سیستم' },
    admin: { en: 'Admin', fa: 'مدیریت' }
};
const toneTextClassMap: Record<OperationalTone, string> = {
    emerald: 'text-emerald-600',
    sky: 'text-sky-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    slate: 'text-slate-600'
};
const syncStateLabelMap: Record<OperationalDisplayStatus['sync']['state'], {
    en: string;
    fa: string;
}> = {
    stable: { en: 'Stable', fa: 'پایدار' },
    'background-sync': { en: 'Background sync', fa: 'همگام‌سازی پس‌زمینه' },
    pending: { en: 'Pending', fa: 'در انتظار' },
    offline: { en: 'Offline', fa: 'آفلاین' },
    'server-unreachable': { en: 'Server unavailable', fa: 'سرور غیرقابل دسترس' },
    error: { en: 'Error', fa: 'خطا' }
};
const healthStateLabelMap: Record<OperationalDisplayStatus['health']['state'], {
    en: string;
    fa: string;
}> = {
    healthy: { en: 'Healthy', fa: 'سالم' },
    checking: { en: 'Checking', fa: 'در حال بررسی' },
    degraded: { en: 'Degraded', fa: 'کاهش کیفیت' },
    error: { en: 'Critical', fa: 'بحرانی' }
};
const formatTime = (iso: string, isEnglish: boolean, settings?: AppSettings) => {
    const formatted = formatAppDateTime(iso, settings || ({ language: isEnglish ? 'english' : 'dari' } as AppSettings), 'system');
    return formatted === '-' ? (isEnglish ? 'Unknown time' : 'زمان نامعلوم') : formatted;
};
export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, isEnglish, settings, isOnline, connectivityState, syncStatus, notifications, queueStatus, healthSnapshot, onClose, onMarkAllRead, onClearAll, onMarkRead, onOpenServerManagement }) => {
    const operationalInput = useMemo(() => ({
        syncStatus,
        isOnline,
        connectivityState,
        queueStatus,
        healthSnapshot
    }), [
        syncStatus,
        isOnline,
        connectivityState?.browserOnline,
        connectivityState?.supabaseReachable,
        connectivityState?.backendReachable,
        connectivityState?.effectiveOnline,
        connectivityState?.reason,
        queueStatus.length,
        queueStatus.isProcessing,
        queueStatus.isPaused,
        queueStatus.nextRetry,
        queueStatus.queueLength,
        queueStatus.deltaQueueLength,
        queueStatus.warehouseOutboxLength,
        queueStatus.totalPending,
        healthSnapshot.status,
        healthSnapshot.lastIssue,
        healthSnapshot.lastCheckedAt,
        healthSnapshot.running,
        healthSnapshot.inFlight
    ]);
    const [operationalDisplay, setOperationalDisplay] = useState(() => resolveOperationalDisplayStatus(operationalInput));
    useEffect(() => {
        if (!isOpen)
            return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);
    useEffect(() => {
        const refreshDisplay = () => {
            setOperationalDisplay((previous) => resolveOperationalDisplayStatus(operationalInput, previous));
        };
        refreshDisplay();
        if (!isOpen)
            return undefined;
        const intervalId = window.setInterval(refreshDisplay, 1000);
        return () => window.clearInterval(intervalId);
    }, [isOpen, operationalInput]);
    if (!isOpen)
        return null;
    const unreadCount = notifications.filter((item) => !item.read).length;
    const adminNotifications = notifications.filter((item) => item.source === 'admin');
    const operationalNotifications = notifications.filter((item) => item.source !== 'admin');
    const syncDisplayLabel = isEnglish
        ? syncStateLabelMap[operationalDisplay.sync.state].en
        : syncStateLabelMap[operationalDisplay.sync.state].fa;
    const browserOnline = connectivityState?.browserOnline ?? isOnline;
    const serverReachable = connectivityState
        ? connectivityState.supabaseReachable && connectivityState.backendReachable
        : isOnline;
    const pendingCount = operationalDisplay.sync.pendingCount;
    const healthLabel = isEnglish
        ? healthStateLabelMap[operationalDisplay.health.state].en
        : healthStateLabelMap[operationalDisplay.health.state].fa;
    const renderItem = (item: NotificationCenterItem) => (<button key={item.id} type="button" onClick={() => onMarkRead(item.id)} className={`w-full rounded-2xl border px-3.5 py-3 text-left shadow-[0_10px_24px_-22px_rgba(15,23,42,0.28)] transition duration-200 ${levelToneMap[item.level]} ${item.read ? 'opacity-85' : 'shadow-[0_14px_30px_-22px_rgba(15,23,42,0.38)]'} hover:border-slate-300/80`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black tracking-tight">{item.title}</p>
          <p className="mt-1 text-[11px] font-semibold leading-5 opacity-100">
            {localizeOperationalMessage(item.message, isEnglish)}
          </p>
        </div>
        {!item.read ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-current opacity-85"/> : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold opacity-90">
        <span>{isEnglish ? sourceLabelMap[item.source].en : sourceLabelMap[item.source].fa}</span>
        <span>{formatTime(item.createdAt, isEnglish, settings)}</span>
      </div>
    </button>);
    return (<div className="fixed inset-0 z-[90]" dir={isEnglish ? 'ltr' : 'rtl'}>
      <button type="button" aria-label={isEnglish ? 'Close notification center' : 'بستن مرکز اعلان‌ها'} onClick={onClose} className="absolute inset-0 bg-slate-950/46 backdrop-blur-[1px]"/>

      <section className={`absolute top-3 ${isEnglish ? 'right-3' : 'left-3'} w-[min(520px,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-[28px] border border-slate-200/90 bg-slate-50/95 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.52)] backdrop-blur-md`}>
        <div className="relative border-b border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-sky-50/90 p-4">
          <div className="pointer-events-none absolute -top-16 -right-10 h-32 w-32 rounded-full bg-sky-200/25 blur-3xl"/>
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-brand-200/18 blur-3xl"/>

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black tracking-wide text-slate-800">
                {isEnglish ? 'Notification Center' : 'مرکز اعلان‌ها'}
              </h3>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {isEnglish
            ? 'Admin messages are separated from connection and sync events.'
            : 'پیام‌های مدیریتی از رویدادهای اتصال و همگام‌سازی جدا نمایش داده می‌شوند.'}
              </p>
            </div>
            <span className="rounded-full border border-slate-200/80 bg-white/95 px-2.5 py-1 text-[11px] font-black text-slate-700 shadow-sm">
              {isEnglish ? `${unreadCount} unread` : `${unreadCount} خوانده نشده`}
            </span>
          </div>

          <div className="relative mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200/80 bg-white/94 px-2.5 py-2 text-center shadow-sm" data-testid="notification-connectivity-device" data-state={browserOnline ? 'online' : 'offline'}>
              <p className="text-[10px] font-bold text-slate-500">{isEnglish ? 'Device' : 'دستگاه'}</p>
              <p className={`mt-1 text-xs font-black ${browserOnline ? 'text-emerald-600' : 'text-rose-600'}`}>
                {browserOnline ? (isEnglish ? 'Online' : 'آنلاین') : (isEnglish ? 'Offline' : 'آفلاین')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/94 px-2.5 py-2 text-center shadow-sm" data-testid="notification-connectivity-server" data-state={serverReachable ? 'reachable' : 'unreachable'}>
              <p className="text-[10px] font-bold text-slate-500">{isEnglish ? 'Server' : 'سرور'}</p>
              <p className={`mt-1 text-xs font-black ${serverReachable ? 'text-emerald-600' : 'text-rose-600'}`}>
                {serverReachable ? (isEnglish ? 'Reachable' : 'در دسترس') : (isEnglish ? 'Unreachable' : 'غیرقابل دسترس')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/94 px-2.5 py-2 text-center shadow-sm" data-testid="notification-connectivity-pending" data-pending-count={pendingCount} data-state={pendingCount > 0 ? 'pending' : 'clean'}>
              <p className="text-[10px] font-bold text-slate-500">{isEnglish ? 'Pending' : 'در انتظار'}</p>
              <p className={`mt-1 text-xs font-black ${pendingCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {pendingCount > 0 ? `${pendingCount}` : (isEnglish ? 'Clean' : 'خالی')}
              </p>
            </div>
          </div>

          <div className="relative mt-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-500 shadow-sm" data-testid="notification-sync-breakdown" data-state={operationalDisplay.sync.state} data-queue-count={queueStatus.queueLength ?? queueStatus.length} data-outbox-count={queueStatus.warehouseOutboxLength ?? 0}>
            <span>{isEnglish ? 'Sync' : 'همگام‌سازی'}: </span>
            <span className={toneTextClassMap[operationalDisplay.sync.tone]}>
              {syncDisplayLabel}
            </span>
            <span className="mx-2 text-slate-300">|</span>
            <span>{isEnglish ? 'Queue' : 'صف'}: {queueStatus.queueLength ?? queueStatus.length}</span>
            <span className="mx-2 text-slate-300">|</span>
            <span>{isEnglish ? 'Outbox' : 'آوت‌باکس'}: {queueStatus.warehouseOutboxLength ?? 0}</span>
          </div>

          <div className="relative mt-3 grid grid-cols-2 gap-2">
            {null}
            <button type="button" onClick={onOpenServerManagement} className="rounded-xl border border-slate-200/85 bg-white/96 px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm transition hover:bg-white">
              {isEnglish ? 'Open Server Management' : 'بازکردن مدیریت سرور'}
            </button>
          </div>
        </div>

        <div className="bg-white/72 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {isEnglish ? 'Event Feed' : 'جریان رویدادها'}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onMarkAllRead} className="rounded-lg border border-slate-200/85 bg-white/96 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm transition hover:bg-white">
                {isEnglish ? 'Mark all read' : 'علامت گذاری همه'}
              </button>
              <button type="button" onClick={onClearAll} className="rounded-lg border border-rose-200/85 bg-rose-50/95 px-2.5 py-1 text-[10px] font-bold text-rose-700 shadow-sm transition hover:bg-rose-100">
                {isEnglish ? 'Clear' : 'پاک کردن'}
              </button>
            </div>
          </div>

          <div className="max-h-[52vh] space-y-2.5 overflow-y-auto pe-1">
            <div className="rounded-xl border border-slate-200/80 bg-white/94 px-3 py-2.5 shadow-sm" data-testid="notification-health-monitor" data-state={operationalDisplay.health.state}>
              <p className="text-[10px] font-bold text-slate-500">
                {isEnglish ? 'Server Health Monitor' : 'مانیتور سلامت سرور'}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className={`text-xs font-black ${toneTextClassMap[operationalDisplay.health.tone]}`}>
                  {healthLabel}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {isEnglish ? 'Queue paused' : 'صف متوقف'}: {queueStatus.isPaused ? (isEnglish ? 'Yes' : 'بلی') : (isEnglish ? 'No' : 'خیر')}
                </span>
              </div>
              {healthSnapshot.lastIssue ? (<p className="mt-1 text-[10px] font-semibold text-slate-500">
                  {localizeOperationalMessage(healthSnapshot.lastIssue, isEnglish)}
                </p>) : null}
            </div>

            {notifications.length === 0 ? (<div className="rounded-xl border border-slate-200/80 bg-white/95 px-4 py-8 text-center shadow-sm">
                <p className="text-sm font-black text-slate-700">{isEnglish ? 'No notifications yet.' : 'فعلاً اعلانی ثبت نشده است.'}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {isEnglish
                ? 'Admin and operational events will appear here.'
                : 'پیام های مدیریتی و رویدادهای عملیاتی اینجا نمایش داده می شوند.'}
                </p>
              </div>) : (<>
                <div className="rounded-xl border border-indigo-200/85 bg-indigo-50/90 px-3 py-2 shadow-sm">
                  <p className="text-[10px] font-bold text-indigo-700">{isEnglish ? 'Admin Messages' : 'پیام های مدیریتی'}</p>
                  {adminNotifications.length === 0 ? (<p className="mt-1 text-[11px] font-semibold text-indigo-700/80">{isEnglish ? 'No admin messages yet.' : 'فعلاً پیام مدیریتی موجود نیست.'}</p>) : (<div className="mt-2 space-y-2">
                      {adminNotifications.map(renderItem)}
                    </div>)}
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white/94 px-3 py-2 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-600">{isEnglish ? 'Connection & Sync Status' : 'وضعیت اتصال و همگام‌سازی'}</p>
                  {operationalNotifications.length === 0 ? (<p className="mt-1 text-[11px] font-semibold text-slate-500">{isEnglish ? 'No operational events.' : 'رویداد عملیاتی موجود نیست.'}</p>) : (<div className="mt-2 space-y-2">
                      {operationalNotifications.map(renderItem)}
                    </div>)}
                </div>
              </>)}
          </div>
        </div>
      </section>
    </div>);
};
