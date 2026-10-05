import React, { useEffect, useState } from 'react';
import { AppSettings, AppUser, AppView, Permission, SyncStatus, UserProfile } from '@/types';
import { ShellChevronIcon, ShellCustomersIcon, ShellDashboardIcon, ShellIconSlot, ShellInventoryIcon, ShellLockIcon, ShellLogoutIcon, ShellPartnershipIcon, ShellPurchaseIcon, ShellReportsIcon, ShellSalesIcon, ShellSettingsIcon, ShellTreasuryIcon, ShellUsersIcon, ShellWalletIcon } from './ui/ShellIcons';
import { Logo } from './ui/Logo';
import { getTranslation } from '@/utils/translations';
import { getPlanName, sanitizeSubscription } from "@/services/localAccessPolicy";
import { HelpSupportModal } from './HelpSupportModal';
interface SidebarProps {
    currentView: AppView;
    setView: (view: AppView) => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    googleUser: UserProfile | null;
    activeAppUser?: AppUser | null;
    onLogout: () => void;
    onLock?: () => void;
    onCloseShift?: () => void;
    settings: AppSettings;
    syncStatus?: SyncStatus;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    onOpenSubscription?: () => void;
}
interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
    badge?: number;
    collapsed?: boolean;
    testId?: string;
}
const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, onClick, badge, collapsed = false, testId }) => (<li>
    <button type="button" onClick={onClick} title={collapsed ? label : undefined} data-testid={testId} className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-[12px] border ${collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'} text-start transition-all duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#93b8f5] ${isActive
        ? 'border-[#dbe8ff] bg-[#eef4ff] text-[#2563eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]'
        : 'border-transparent text-slate-500 hover:border-[#edf1f4] hover:bg-[#f8fafc] hover:text-slate-800'}`}>
      <span className={`absolute bottom-[7px] left-0 top-[7px] w-[2px] rounded-r-full transition-colors ${isActive ? 'bg-[#2563eb]' : 'bg-transparent'}`}/>
      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center transition-colors duration-150 ${isActive
        ? 'text-[#2563eb]'
        : 'text-slate-400 group-hover:text-slate-600'}`}>
        <ShellIconSlot scope="nav">{icon}</ShellIconSlot>
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate text-[0.78rem] font-semibold leading-5">{label}</span>}
      {!collapsed && badge != null && badge > 0 && (<span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#f3f5f8] px-1.5 py-0.5 text-[0.66rem] font-semibold text-slate-500">
          {badge}
        </span>)}
    </button>
  </li>);
const SectionLabel: React.FC<{
    collapsed?: boolean;
    children: React.ReactNode;
}> = ({ collapsed = false, children }) => {
    if (collapsed) {
        return <div className="mx-auto my-2.5 h-px w-8 rounded-full bg-[#e8edf2]"/>;
    }
    return (<div className="px-3 pb-1.5 pt-3 text-[0.58rem] font-bold uppercase tracking-[0.15em] text-slate-500">
      {children}
    </div>);
};
export const ReferenceSidebar: React.FC<SidebarProps> = ({ currentView, setView, isOpen, setIsOpen, googleUser, onLogout, activeAppUser, onLock, onCloseShift, settings, isCollapsed = false, onOpenSubscription, }) => {
    const [financesExpanded, setFinancesExpanded] = useState(() => {
        try {
            const stored = typeof window !== 'undefined' ? window.localStorage.getItem('wk.sidebar.financeExpanded') : null;
            if (stored === '1')
                return true;
            if (stored === '0')
                return false;
        }
        catch {
            // ignore storage failures (private mode / quota)
        }
        return currentView === 'expenses' || currentView === 'reports' || currentView === 'treasury' || currentView === 'partnerships';
    });
    const toggleFinancesExpanded = () => setFinancesExpanded((prev) => {
        const next = !prev;
        try {
            window.localStorage.setItem('wk.sidebar.financeExpanded', next ? '1' : '0');
        }
        catch {
            // ignore storage failures
        }
        return next;
    });
    const [isSubscriptionDrawerOpen, setIsSubscriptionDrawerOpen] = useState(true);
    const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
    const t = getTranslation(settings?.language || 'dari');
    const isEnglish = (settings?.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const subscription = sanitizeSubscription(settings?.subscription);
    const planName = getPlanName(subscription.tier, subscription);
    const isFreePlan = subscription.tier === 'free';
    const freePlanBadgeLabel = tr('Current plan', 'پلن فعال');
    useEffect(() => {
        if (isFreePlan) {
            setIsSubscriptionDrawerOpen(true);
        }
    }, [isFreePlan]);
    const mainNavItems: Array<{
        view: AppView;
        label: string;
        icon: React.ReactNode;
        permission?: Permission;
        adminOnly?: boolean;
    }> = [
        { view: 'dashboard', label: t.dashboard, icon: <ShellDashboardIcon />, permission: 'view_dashboard' },
        { view: 'sales', label: t.sales, icon: <ShellSalesIcon />, permission: 'create_invoice' },
        { view: 'inventory', label: t.inventory, icon: <ShellInventoryIcon /> },
        { view: 'customers', label: t.customers, icon: <ShellCustomersIcon />, permission: 'view_customers' },
        { view: 'purchases', label: t.purchases, icon: <ShellPurchaseIcon />, permission: 'manage_purchases' },
        ...([]),
    ];
    const financeNavItems: Array<{
        view: AppView;
        label: string;
        icon: React.ReactNode;
        permission?: Permission;
    }> = [
        { view: 'expenses', label: t.expenses, icon: <ShellWalletIcon />, permission: 'view_expenses' },
        { view: 'treasury', label: t.treasury, icon: <ShellTreasuryIcon />, permission: 'view_treasury' },
        { view: 'partnerships', label: t.partnerships || tr('Partnerships', 'شراکت'), icon: <ShellPartnershipIcon />, permission: 'view_partnerships' },
        { view: 'reports', label: t.reports, icon: <ShellReportsIcon />, permission: 'view_reports' },
    ];
    const workspaceNavItems: Array<{
        view: AppView;
        label: string;
        icon: React.ReactNode;
        permission?: Permission;
    }> = [
        { view: 'payroll', label: t.payroll, icon: <ShellUsersIcon />, permission: 'view_payroll' },
        ...([]),
    ];
    const canShow = (item: {
        permission?: Permission;
        adminOnly?: boolean;
    }) => {
        if (item.adminOnly && true)
            return false;
        if (!activeAppUser)
            return true;
        if (activeAppUser.role === 'admin')
            return true;
        if (!item.permission)
            return true;
        const permissions = activeAppUser.permissions;
        if (item.permission === 'manage_inventory') {
            return permissions.includes('view_inventory_only') || permissions.includes('create_medicine') || permissions.includes('edit_medicine') || permissions.includes('manage_inventory');
        }
        if (item.permission === 'manage_purchases') {
            return permissions.includes('manage_purchases') || permissions.includes('manage_inventory');
        }
        if (item.permission === 'view_customers') {
            return permissions.includes('view_customers') || permissions.includes('manage_customers') || permissions.includes('manage_debt');
        }
        if (item.permission === 'view_expenses') {
            return permissions.includes('view_expenses') || permissions.includes('manage_expenses');
        }
        if (item.permission === 'view_payroll') {
            return permissions.includes('view_payroll') || permissions.includes('manage_payroll');
        }
        if (item.permission === 'view_treasury') {
            return permissions.includes('view_treasury') || permissions.includes('manage_treasury') || permissions.includes('manage_expenses');
        }
        if (item.permission === 'view_partnerships') {
            return permissions.includes('view_partnerships') || permissions.includes('manage_partnerships') || permissions.includes('view_reports');
        }
        return permissions.includes(item.permission);
    };
    const canShowSettings = !activeAppUser || activeAppUser.role === 'admin' || activeAppUser.permissions.includes('manage_settings') || activeAppUser.permissions.includes('manage_users');
    const handleNavItemClick = (view: AppView) => {
        setView(view);
        if (window.innerWidth < 1024) {
            setIsOpen(false);
        }
    };
    const accountRoleLabel = activeAppUser?.role === 'admin' ? tr('Administrator', 'مدیر') : tr('Team member', 'کارمند');
    return (<>
      {isOpen && (<div className="fixed inset-0 z-40 bg-slate-950/20 lg:hidden" onClick={() => setIsOpen(false)}/>)}

      <aside data-testid="app-sidebar" className={`fixed inset-y-0 left-0 z-50 flex h-full ${isCollapsed ? 'w-[82px]' : 'w-[224px]'} max-w-[88vw] flex-col border-r border-[#edf1f4] bg-white transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 lg:shadow-none`} dir="ltr">
        <div className="flex h-full flex-col">
          <div className={`${isCollapsed ? 'px-3 pt-4' : 'px-4 pt-4'} pb-3`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f8fbff] ring-1 ring-[#dbe5f2] shadow-[0_10px_20px_-16px_rgba(15,23,42,0.35)]">
                  <Logo className="h-full w-full"/>
                </div>
                {!isCollapsed && (<p className="truncate text-[1rem] font-semibold tracking-[-0.04em] text-slate-900">WareKeep</p>)}
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label={tr('Close menu', 'بستن منو')} title={tr('Close menu', 'بستن منو')} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#e9edf2] bg-white text-slate-500 transition-colors hover:border-[#dfe5ec] hover:bg-[#fafbfc] hover:text-slate-700 lg:hidden">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 6l12 12"/>
                  <path d="M18 6L6 18"/>
                </svg>
              </button>
            </div>
          </div>

          <nav className={`${isCollapsed ? 'px-2' : 'px-3'} flex-1 overflow-y-auto pb-3`}>
            <SectionLabel collapsed={isCollapsed}>{tr('Main menu', 'منوی اصلی')}</SectionLabel>
            <ul className="space-y-0.5">
              {mainNavItems.filter(canShow).map((item) => (<NavItem key={item.view} icon={item.icon} label={item.label} isActive={currentView === item.view} onClick={() => handleNavItemClick(item.view)} collapsed={isCollapsed} testId={`app-sidebar-nav-${item.view}`}/>))}
            </ul>

            {financeNavItems.filter(canShow).length > 0 && (<>
                <div className="mt-2 border-t border-[#f1f4f6]">
                  {!isCollapsed ? (<button type="button" onClick={toggleFinancesExpanded} aria-expanded={financesExpanded} className="flex w-full items-center justify-between rounded-[12px] px-3 pb-1.5 pt-3 text-[0.58rem] font-bold uppercase tracking-[0.15em] text-slate-500 transition-colors hover:text-slate-800">
                      <span>{tr('Finance', 'مالی')}</span>
                      <ShellIconSlot scope="action" className={`text-slate-400 transition-transform ${financesExpanded ? 'rotate-180' : ''}`}>
                        <ShellChevronIcon />
                      </ShellIconSlot>
                    </button>) : (<div className="mx-auto my-0.5 h-px w-8 rounded-full bg-slate-200/80"/>)}
                  {(financesExpanded || isCollapsed) && (<ul className="space-y-0.5 pt-1">
                      {financeNavItems.filter(canShow).map((item) => (<NavItem key={item.view} icon={item.icon} label={item.label} isActive={currentView === item.view} onClick={() => handleNavItemClick(item.view)} collapsed={isCollapsed} testId={`app-sidebar-nav-${item.view}`}/>))}
                    </ul>)}
                </div>
              </>)}

            <SectionLabel collapsed={isCollapsed}>{tr('Workspace', 'فضای کاری')}</SectionLabel>
            <ul className="space-y-0.5">
              {workspaceNavItems.filter(canShow).map((item) => (<NavItem key={item.view} icon={item.icon} label={item.label} isActive={currentView === item.view} onClick={() => handleNavItemClick(item.view)} collapsed={isCollapsed} testId={`app-sidebar-nav-${item.view}`}/>))}
            </ul>

            {activeAppUser && onCloseShift && (<button type="button" onClick={() => {
                onCloseShift();
                if (window.innerWidth < 1024) {
                    setIsOpen(false);
                }
            }} className={`mt-3 flex w-full items-center gap-2.5 rounded-[12px] border border-rose-100 bg-[#fff7f8] ${isCollapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'} text-[0.76rem] font-semibold text-rose-600 transition-colors hover:bg-rose-50`} title={isCollapsed ? t.closeShift : undefined}>
                <span className="h-[18px] w-[18px] shrink-0">
                  <ShellLogoutIcon />
                </span>
                {!isCollapsed && t.closeShift}
              </button>)}

            <SectionLabel collapsed={isCollapsed}>{tr('Utilities', 'ابزارها')}</SectionLabel>
            <ul className="space-y-0.5">
              {canShowSettings && (<NavItem icon={<ShellSettingsIcon />} label={t.settings} isActive={currentView === 'settings'} onClick={() => handleNavItemClick('settings')} collapsed={isCollapsed} testId="app-sidebar-nav-settings"/>)}
            </ul>
            {!isCollapsed && (<button type="button" onClick={() => setIsSupportModalOpen(true)} className="mt-3 flex w-full items-center justify-between rounded-[12px] border border-[#edf1f4] bg-[#fbfcfd] px-3 py-1.5 text-[0.72rem] font-semibold text-slate-500 hover:bg-[#edf1f4] transition-colors">
                <span>{tr('Help & Support', 'راهنما و پشتیبانی')}</span>
                <ShellIconSlot scope="action" className="text-slate-300">
                  <ShellChevronIcon direction="right"/>
                </ShellIconSlot>
              </button>)}

            {false}
          </nav>

          <div className={`${isCollapsed ? 'p-2' : 'p-3'} border-t border-[#edf1f4] bg-white`}>
            {(!isCollapsed && <p className="px-2 text-xs font-semibold text-slate-500" dir={isEnglish ? 'ltr' : 'rtl'}>
                {tr('Community · Offline workspace', 'نسخهٔ آزاد · فضای کاری آفلاین')}
              </p>)}

            {activeAppUser && (<div className={`mt-3 flex min-h-11 items-center rounded-[14px] text-slate-500 ${isCollapsed
                ? 'justify-center p-1.5'
                : 'gap-2.5 border border-slate-100 bg-slate-50/70 px-2 py-1.5'}`}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[0.78rem] font-black text-[#2563eb]">
                  {activeAppUser.name.charAt(0).toUpperCase()}
                </div>
                {!isCollapsed && (<>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.75rem] font-semibold text-slate-700">{activeAppUser.name}</p>
                      <p className="truncate text-[0.67rem] text-slate-400">{accountRoleLabel}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {onLock && (<button type="button" onClick={onLock} data-testid="app-sidebar-lock-button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-slate-400 transition hover:bg-white hover:text-slate-700" title={tr('Lock app', 'قفل برنامه')}>
                          <ShellIconSlot scope="action">
                            <ShellLockIcon />
                          </ShellIconSlot>
                        </button>)}
                    </div>
                  </>)}
              </div>)}
          </div>
        </div>
      </aside>

      <HelpSupportModal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} isEnglish={isEnglish}/>
    </>);
};
