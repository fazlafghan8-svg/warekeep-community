import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Language, SyncStatus } from '../../types';
import { classNames } from '@/utils/classNames';
import { useNativeWindowControls } from '../../hooks/useNativeWindowControls';
import { WindowControls } from './WindowControls';
import { shellActionButtonClass, shellSearchTriggerClass } from './shellPrimitives';
import { ShellBellIcon, ShellChevronIcon, ShellCustomersIcon, ShellFocusIcon, ShellIconSlot, ShellInventoryIcon, ShellMoreIcon, ShellPlusIcon, ShellPurchaseIcon, ShellSalesIcon, ShellSearchIcon, ShellSettingsIcon, ShellUsersIcon, ShellWalletIcon } from './ShellIcons';
const isMacPlatform = typeof navigator !== 'undefined'
    && /mac/i.test(navigator.platform || navigator.userAgent || '');
const commandPaletteShortcutLabel = isMacPlatform ? '⌘ K' : 'Ctrl+K';
type QuickAddItem = {
    id: string;
    label: string;
    description?: string;
    onClick: () => void;
};
type ResolvedQuickAddItem = QuickAddItem & {
    icon: React.ReactNode;
};
interface AppTopBarProps {
    className?: string;
    syncStatus?: SyncStatus;
    isDeviceOnline?: boolean;
    isConnectionOnline?: boolean;
    language?: Language;
    notificationCount?: number;
    hasNotificationAlert?: boolean;
    showQuickActions?: boolean;
    profileName?: string;
    profileInitial?: string;
    isZenMode?: boolean;
    isSidebarCollapsed?: boolean;
    workspaceName?: string;
    workspaceMeta?: string;
    updateAvailable?: boolean;
    quickAddItems?: QuickAddItem[];
    onToggleZenMode?: () => void;
    onQuickAdd?: () => void;
    onOpenNotifications?: () => void;
    onOpenSettings?: () => void;
    onOpenProfile?: () => void;
    onToggleSidebar?: () => void;
    onOpenWorkspace?: () => void;
    onOpenCommandPalette?: () => void;
    onOpenAssistant?: () => void;
    onOpenUpdates?: () => void;
}
const resolveQuickAddIcon = (id: string) => {
    const normalizedId = id.trim().toLowerCase();
    if (normalizedId.includes('sale') || normalizedId.includes('invoice')) {
        return <ShellSalesIcon />;
    }
    if (normalizedId.includes('medicine') ||
        normalizedId.includes('inventory') ||
        normalizedId.includes('stock')) {
        return <ShellInventoryIcon />;
    }
    if (normalizedId.includes('purchase') || normalizedId.includes('procurement')) {
        return <ShellPurchaseIcon />;
    }
    if (normalizedId.includes('expense') || normalizedId.includes('cost')) {
        return <ShellWalletIcon />;
    }
    if (normalizedId.includes('customer') || normalizedId.includes('account')) {
        return <ShellCustomersIcon />;
    }
    return <ShellPlusIcon />;
};
const ActionIconButton: React.FC<{
    title: string;
    ariaLabel?: string;
    shortcut?: string;
    onClick?: () => void;
    children: React.ReactNode;
    badge?: number;
    badgeLabel?: string;
    alert?: boolean;
    active?: boolean;
    className?: string;
    hasPopup?: 'menu' | 'dialog';
    expanded?: boolean;
    testId?: string;
}> = ({ title, ariaLabel, shortcut, onClick, children, badge = 0, badgeLabel, alert = false, active = false, className, hasPopup, expanded, testId, }) => {
    const buttonTitle = shortcut ? `${title} (${shortcut})` : title;
    return (<button type="button" onClick={onClick} title={buttonTitle} aria-label={ariaLabel ?? title} aria-haspopup={hasPopup} aria-expanded={hasPopup ? expanded : undefined} data-shell-state={active ? 'active' : undefined} data-shell-tone={active ? 'active' : undefined} data-testid={testId} className={classNames(shellActionButtonClass, 'relative shrink-0 text-slate-400 hover:text-slate-700', active && 'border-[#dbe8ff] bg-[#eef4ff] text-[#2563eb]', className)}>
      <ShellIconSlot scope="action">{children}</ShellIconSlot>
      {badge > 0 ? (<span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white shadow-sm">
          {badgeLabel ?? (badge > 9 ? '9+' : badge)}
        </span>) : alert ? (<span className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full bg-rose-400"/>) : null}
    </button>);
};
const ShellSunIcon = () => (<svg className="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3.25"/>
    <path d="M12 3.75v1.5"/>
    <path d="M12 18.75v1.5"/>
    <path d="M5.64 5.64l1.06 1.06"/>
    <path d="M17.3 17.3l1.06 1.06"/>
    <path d="M3.75 12h1.5"/>
    <path d="M18.75 12h1.5"/>
    <path d="M5.64 18.36l1.06-1.06"/>
    <path d="M17.3 6.7l1.06-1.06"/>
  </svg>);
const ShellMenuIcon = () => (<svg className="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.75 7.25h14.5"/>
    <path d="M4.75 12h14.5"/>
    <path d="M4.75 16.75h14.5"/>
  </svg>);
export const AppTopBar: React.FC<AppTopBarProps> = ({ className = '', syncStatus, isDeviceOnline, isConnectionOnline, language = 'dari', notificationCount, hasNotificationAlert, showQuickActions = false, profileName, profileInitial = 'U', isZenMode = false, updateAvailable = false, quickAddItems = [], onToggleSidebar, onQuickAdd, onToggleZenMode, onOpenNotifications, onOpenSettings, onOpenProfile, onOpenWorkspace, onOpenCommandPalette, onOpenAssistant, onOpenUpdates, }) => {
    const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
    const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
    const utilityMenuRef = useRef<HTMLDivElement>(null);
    const hasNativeWindowControls = useNativeWindowControls();
    const isEnglish = language === 'english';
    const localTextDir = isEnglish ? 'ltr' : 'rtl';
    const localTextAlignClass = isEnglish ? 'text-left' : 'text-right';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const deviceOnline = isDeviceOnline ?? isOnline;
    const hasDeviceConnectionIssue = !deviceOnline;
    const hasServerConnectionIssue = deviceOnline && isConnectionOnline === false;
    const isBackgroundSyncing = syncStatus === 'syncing' && true;
    const bellHasAlert = hasNotificationAlert ?? false;
    const bellBadgeCount = typeof notificationCount === 'number'
        ? notificationCount
        : 0;
    const resolvedProfileInitial = (profileInitial ||
        profileName?.trim()?.charAt(0) ||
        'U').toUpperCase();
    const utilityMenuLabel = tr('Tools and status', 'ابزارها و وضعیت');
    const quickActionsLabel = tr('Quick actions', 'اقدامات سریع');
    const appearanceLabel = tr('Appearance', 'ظاهر');
    const usersAccessLabel = tr('Users & Access', 'کاربران و دسترسی');
    const connectionTone = 'online';
    const connectionTitle = connectionTone === 'online'
        ? tr('Connection: Online', 'اتصال: آنلاین')
        : hasDeviceConnectionIssue
            ? tr('Connection: Offline', 'اتصال: آفلاین')
            : hasServerConnectionIssue
                ? tr('Connection: Server unavailable', 'اتصال: سرور غیرقابل دسترس')
                : tr('Sync: Error', 'همگام‌سازی: خطا');
    const connectionLabel = connectionTone === 'online'
        ? isBackgroundSyncing
            ? tr('Background sync', 'همگام‌سازی در پس‌زمینه')
            : tr('Online', 'آنلاین')
        : hasDeviceConnectionIssue
            ? tr('Offline', 'آفلاین')
            : hasServerConnectionIssue
                ? tr('Server unavailable', 'سرور غیرقابل دسترس')
                : tr('Sync error', 'خطای همگام‌سازی');
    const connectionSummary = connectionTone === 'online'
        ? isBackgroundSyncing
            ? tr('Data sync is running quietly in the background.', 'همگام‌سازی داده‌ها آرام در پس‌زمینه انجام می‌شود.')
            : tr('Live services are reachable.', 'سرویس‌های زنده در دسترس هستند.')
        : hasDeviceConnectionIssue
            ? tr('Connectivity needs attention.', 'اتصال نیاز به بررسی دارد.')
            : hasServerConnectionIssue
                ? tr('Server services are currently unreachable.', 'سرویس‌های سرور فعلاً در دسترس نیستند.')
                : tr('Connection is available, but sync needs attention.', 'اتصال برقرار است، اما همگام‌سازی نیاز به بررسی دارد.');
    const focusModeLabel = isZenMode
        ? tr('Exit focus mode', 'خروج از حالت تمرکز')
        : tr('Focus mode', 'حالت تمرکز');
    const focusModeShortcut = isZenMode ? 'Esc' : 'Ctrl + .';
    const searchButtonLabel = tr('Search anything...', 'جست‌وجوی سریع...');
    const assistantButtonLabel = tr('AI Assistant', 'دستیار هوشمند');
    const profileButtonLabel = tr('Profile', 'پروفایل');
    const endInset = hasNativeWindowControls
        ? 'calc(var(--wk-titlebar-padding-x) + var(--wk-native-controls-width) + var(--wk-titlebar-gap-sm))'
        : 'var(--wk-titlebar-padding-x)';
    const resolvedQuickAddItems = useMemo<ResolvedQuickAddItem[]>(() => (quickAddItems.length
        ? quickAddItems
        : [
            {
                id: 'default',
                label: tr('Quick add', 'افزودن سریع'),
                description: tr('Open the default quick-add target', 'مقصد پیش‌فرض افزودن سریع را باز می‌کند.'),
                onClick: () => onQuickAdd?.(),
            },
        ]).map((item) => ({
        ...item,
        icon: resolveQuickAddIcon(item.id),
    })), [quickAddItems, onQuickAdd, isEnglish]);
    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);
    useEffect(() => {
        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (utilityMenuRef.current && !utilityMenuRef.current.contains(target)) {
                setIsUtilityMenuOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsUtilityMenuOpen(false);
            }
        };
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
    return (<div className={classNames('wk-topbar-shell window-drag-handle relative flex h-[var(--wk-titlebar-height)] items-center justify-between border-b border-[#edf1f4] bg-white px-2.5 md:px-3', isUtilityMenuOpen ? 'z-[130]' : 'z-40', className)} data-testid="app-topbar-shell" dir="ltr" style={{
            paddingInlineStart: 'var(--wk-titlebar-padding-x)',
            paddingInlineEnd: endInset,
            columnGap: 'var(--wk-titlebar-gap-md)',
        }} onDoubleClick={() => {
            window.electronAPI?.maximize?.().catch(() => { });
        }}>
      <div className="relative z-[2] flex min-w-[34px] items-center gap-1.5" data-testid="app-topbar-brand-rail">
        {onToggleSidebar ? (<button type="button" onClick={onToggleSidebar} title={tr('Open menu', 'باز کردن منو')} aria-label={tr('Open menu', 'باز کردن منو')} className="no-drag inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[#e9edf2] bg-white text-slate-500 transition-colors hover:border-[#dfe5ec] hover:bg-[#fafbfc] hover:text-slate-700 lg:hidden">
            <span className="h-3.5 w-3.5">
              <ShellMenuIcon />
            </span>
          </button>) : null}
        <div className="hidden h-7 w-px rounded-full bg-transparent lg:block" aria-hidden="true"/>
      </div>

      <div className="wk-topbar-command-center pointer-events-none absolute left-1/2 top-1/2 z-[1] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2" data-testid="app-topbar-command-center">
        {false}

        <div className="flex min-w-0 flex-1 items-center justify-center px-0" data-testid="app-topbar-search-rail">
        <button type="button" onClick={onOpenCommandPalette} dir={localTextDir} title={searchButtonLabel} aria-label={searchButtonLabel} data-testid="app-topbar-search-trigger" className={classNames(shellSearchTriggerClass, 'wk-topbar-search-trigger-compact pointer-events-auto flex h-[30px] w-full items-center gap-2 rounded-full border border-[#e9edf2] bg-[#f8f9fb] px-3 text-slate-500 transition-colors hover:border-[#dfe5ec] hover:bg-white')}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span className="inline-flex shrink-0 items-center justify-center text-slate-400">
              <ShellIconSlot>
                <ShellSearchIcon />
              </ShellIconSlot>
            </span>
            <span data-testid="app-topbar-search-copy" className={classNames('flex-1 truncate whitespace-nowrap text-[0.74rem] font-medium text-slate-400', localTextAlignClass)} dir={localTextDir}>
              {searchButtonLabel}
            </span>
          </span>
          <span dir="ltr" className="hidden shrink-0 items-center justify-center rounded-full border border-[#e7ecf1] bg-white px-1.5 py-[3px] text-[0.55rem] font-semibold tracking-[0.02em] text-slate-400 xl:flex">
            {commandPaletteShortcutLabel}
          </span>
        </button>
        </div>
      </div>

      <div className="relative z-[2] flex min-w-0 items-center justify-end gap-1 md:gap-1.5" data-testid="app-topbar-action-rail">
        <ActionIconButton title={tr('Notifications', 'اعلان‌ها')} onClick={onOpenNotifications} badge={bellBadgeCount} badgeLabel={bellBadgeCount > 0
            ? (bellBadgeCount > 9
                ? (isEnglish ? '9+' : '۹+')
                : bellBadgeCount.toLocaleString(isEnglish ? 'en-US' : 'fa-AF'))
            : undefined} alert={bellHasAlert} testId="app-topbar-notifications-trigger">
          <ShellBellIcon />
        </ActionIconButton>

        {showQuickActions ? (<>
            <div className="hidden items-center md:flex" data-testid="app-topbar-status-cluster">
              {null}
            </div>

            <div className="flex items-center gap-1.5" data-testid="app-topbar-actions-cluster">
              <div ref={utilityMenuRef} className={classNames('relative z-[120] no-drag', isUtilityMenuOpen && 'z-[140]')}>
                <ActionIconButton title={utilityMenuLabel} ariaLabel={utilityMenuLabel} onClick={() => {
                setIsUtilityMenuOpen((current) => !current);
            }} hasPopup="menu" expanded={isUtilityMenuOpen} active={isUtilityMenuOpen} alert={false} testId="app-topbar-utility-trigger">
                  <ShellMoreIcon />
                </ActionIconButton>

                {isUtilityMenuOpen ? (<div role="menu" dir={localTextDir} aria-label={utilityMenuLabel} data-testid="app-topbar-utility-menu" className="wk-shell-menu-panel wk-shell-menu-panel--utility absolute right-0 top-[calc(100%+0.35rem)] z-[160]">
                    <div className={classNames('wk-shell-menu-section-label', isEnglish && 'uppercase tracking-[0.16em]')}>
                      {utilityMenuLabel}
                    </div>

                    {false}

                    {onOpenWorkspace ? (<button role="menuitem" type="button" onClick={() => {
                        setIsUtilityMenuOpen(false);
                        onOpenWorkspace();
                    }} className="wk-shell-menu-item mt-2" data-testid="app-topbar-theme-menu-item">
                        <span className="wk-shell-menu-icon text-slate-700">
                          <ShellIconSlot>
                            <ShellSunIcon />
                          </ShellIconSlot>
                        </span>
                        <div className={classNames('min-w-0 flex-1', localTextAlignClass)}>
                          <p className="text-sm font-black text-slate-800">{appearanceLabel}</p>
                        </div>
                      </button>) : null}

                    <div className="mt-2 space-y-1.5">
                      <div className={classNames('wk-shell-menu-section-label', isEnglish && 'uppercase tracking-[0.16em]')}>
                        {quickActionsLabel}
                      </div>
                      {resolvedQuickAddItems.map((item) => (<button key={item.id} role="menuitem" type="button" onClick={() => {
                        setIsUtilityMenuOpen(false);
                        item.onClick();
                    }} className="wk-shell-menu-item">
                          <span className="wk-shell-menu-icon text-brand-700">
                            <ShellIconSlot>{item.icon}</ShellIconSlot>
                          </span>
                          <div className={classNames('min-w-0 flex-1', localTextAlignClass)}>
                            <p className="truncate text-sm font-black text-slate-800">{item.label}</p>
                            {item.description ? (<p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>) : null}
                          </div>
                          <ShellIconSlot className="text-slate-400">
                            <ShellChevronIcon direction={isEnglish ? 'right' : 'left'}/>
                          </ShellIconSlot>
                        </button>))}

                      {onToggleZenMode ? (<button role="menuitem" type="button" onClick={() => {
                        setIsUtilityMenuOpen(false);
                        onToggleZenMode();
                    }} className="wk-shell-menu-item">
                          <span className="wk-shell-menu-icon text-slate-700">
                            <ShellIconSlot>
                              <ShellFocusIcon active={isZenMode}/>
                            </ShellIconSlot>
                          </span>
                          <div className={classNames('min-w-0 flex-1', localTextAlignClass)}>
                            <p className="text-sm font-black text-slate-800">{focusModeLabel}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{focusModeShortcut}</p>
                          </div>
                        </button>) : null}

                      {null}

                      {onOpenProfile ? (<button role="menuitem" type="button" onClick={() => {
                        setIsUtilityMenuOpen(false);
                        onOpenProfile();
                    }} className="wk-shell-menu-item">
                          <span className="wk-shell-menu-icon text-slate-700">
                            <ShellIconSlot>
                              <ShellUsersIcon />
                            </ShellIconSlot>
                          </span>
                          <div className={classNames('min-w-0 flex-1', localTextAlignClass)}>
                            <p className="text-sm font-black text-slate-800">
                              {usersAccessLabel}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {tr('Manage system users and permissions.', 'کاربران سیستم و سطح دسترسی‌ها را مدیریت کنید.')}
                            </p>
                          </div>
                        </button>) : null}

                      {onOpenSettings ? (<button role="menuitem" type="button" onClick={() => {
                        setIsUtilityMenuOpen(false);
                        onOpenSettings();
                    }} className="wk-shell-menu-item">
                          <span className="wk-shell-menu-icon text-slate-700">
                            <ShellIconSlot>
                              <ShellSettingsIcon />
                            </ShellIconSlot>
                          </span>
                          <div className={classNames('min-w-0 flex-1', localTextAlignClass)}>
                            <p className="text-sm font-black text-slate-800">
                              {tr('Settings', 'تنظیمات')}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {tr('Workspace preferences and configuration.', 'ترجیحات و پیکربندی فضای کاری.')}
                            </p>
                          </div>
                        </button>) : null}
                    </div>
                  </div>) : null}
              </div>
            </div>
          </>) : null}

        <button type="button" onClick={onOpenProfile ?? onOpenWorkspace} title={profileName ? `${profileButtonLabel} - ${profileName}` : profileButtonLabel} aria-label={profileButtonLabel} data-testid="app-topbar-profile-trigger" className="no-drag inline-flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-full border border-[#e9edf2] bg-white text-slate-700 transition-colors hover:border-[#dfe5ec] hover:bg-[#fafbfc]">
          <span className="wk-topbar-avatar" aria-hidden="true">
            {resolvedProfileInitial}
          </span>
        </button>

        <WindowControls className="ms-1 border-s border-slate-200/90 ps-2"/>
      </div>
    </div>);
};
