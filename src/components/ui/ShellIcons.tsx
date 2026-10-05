import React from 'react';
import { classNames } from '@/utils/classNames';
type ShellIconSlotProps = {
    children: React.ReactNode;
    className?: string;
    scope?: 'action' | 'nav' | 'support';
};
type ShellStrokeIconProps = {
    children: React.ReactNode;
    className?: string;
    strokeWidth?: number;
};
const ShellStrokeIcon: React.FC<ShellStrokeIconProps> = ({ children, className, strokeWidth, }) => (<svg className={classNames('wk-shell-icon-svg', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>);
export const ShellIconSlot: React.FC<ShellIconSlotProps> = ({ children, className, scope = 'support', }) => (<span data-shell-icon-slot={scope} className={classNames('wk-shell-icon-slot', scope === 'nav' && 'wk-shell-nav-icon-slot', className)} aria-hidden="true">
    {children}
  </span>);
export const ShellChevronIcon: React.FC<{
    className?: string;
    direction?: 'down' | 'left' | 'right' | 'up';
}> = ({ className, direction = 'down' }) => {
    const path = direction === 'left'
        ? 'M14.5 7 9.5 12l5 5'
        : direction === 'right'
            ? 'M9.5 7 14.5 12l-5 5'
            : direction === 'up'
                ? 'M7 14.5 12 9.5l5 5'
                : 'M7 9.5 12 14.5l5-5';
    return (<ShellStrokeIcon className={className}>
      <path d={path}/>
    </ShellStrokeIcon>);
};
export const ShellSidebarToggleIcon: React.FC<{
    collapsed?: boolean;
}> = ({ collapsed = false, }) => (<ShellStrokeIcon>
    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2.5"/>
    <path d="M8.9 5.4v13.2"/>
    {collapsed ? <path d="m12.6 9 3.1 3-3.1 3"/> : <path d="m15.4 9-3.1 3 3.1 3"/>}
  </ShellStrokeIcon>);
export const ShellSearchIcon = () => (<ShellStrokeIcon>
    <circle cx="11" cy="11" r="6.3"/>
    <path d="m19.25 19.25-3.7-3.7"/>
  </ShellStrokeIcon>);
export const ShellBellIcon = () => (<ShellStrokeIcon>
    <path d="M12 4.25a4.6 4.6 0 0 0-4.6 4.6v2.05c0 .8-.22 1.58-.62 2.26L5.75 14.8h12.5l-1.03-1.64a4.4 4.4 0 0 1-.62-2.26V8.85A4.6 4.6 0 0 0 12 4.25Z"/>
    <path d="M9.4 17.4a2.8 2.8 0 0 0 5.2 0"/>
  </ShellStrokeIcon>);
export const ShellPlusIcon = () => (<ShellStrokeIcon>
    <path d="M12 5.5v13"/>
    <path d="M5.5 12h13"/>
  </ShellStrokeIcon>);
export const ShellUpdateIcon = () => (<ShellStrokeIcon>
    <path d="M12 4.5v9"/>
    <path d="m8.75 10.75 3.25 3.25 3.25-3.25"/>
    <path d="M5.25 16.75h13.5"/>
    <path d="M6.75 19.25h10.5"/>
  </ShellStrokeIcon>);
export const ShellMoreIcon = () => (<ShellStrokeIcon>
    <circle cx="5.75" cy="12" r="1.35" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/>
    <circle cx="18.25" cy="12" r="1.35" fill="currentColor" stroke="none"/>
  </ShellStrokeIcon>);
export const ShellConnectionIcon = () => (<ShellStrokeIcon>
    <circle cx="12" cy="12" r="2.2"/>
    <path d="M7.8 8.3a6.1 6.1 0 0 1 8.4 0"/>
    <path d="M6 5.95a8.75 8.75 0 0 1 12 0"/>
    <path d="M7.8 15.7a6.1 6.1 0 0 0 8.4 0"/>
  </ShellStrokeIcon>);
const ShellSimpleGearIcon: React.FC<{
    className?: string;
}> = ({ className }) => (<ShellStrokeIcon className={className} strokeWidth={1.78}>
    <path d="M10.82 4.7h2.36l.42 1.53c.47.12.93.31 1.35.56l1.42-.77 1.67 1.67-.77 1.42c.25.42.44.88.56 1.35l1.53.42v2.36l-1.53.42c-.12.47-.31.93-.56 1.35l.77 1.42-1.67 1.67-1.42-.77c-.42.25-.88.44-1.35.56l-.42 1.53h-2.36l-.42-1.53a6.04 6.04 0 0 1-1.35-.56l-1.42.77-1.67-1.67.77-1.42a6.04 6.04 0 0 1-.56-1.35l-1.53-.42v-2.36l1.53-.42c.12-.47.31-.93.56-1.35l-.77-1.42 1.67-1.67 1.42.77c.42-.25.88-.44 1.35-.56l.42-1.53Z"/>
    <circle cx="12" cy="12" r="2.65"/>
  </ShellStrokeIcon>);
export const ShellSettingsIcon = () => <ShellSimpleGearIcon />;
export const ShellFocusIcon: React.FC<{
    active?: boolean;
}> = ({ active = false }) => (<ShellStrokeIcon strokeWidth={1.8}>
    <path d="M9 5.25H7.55A2.3 2.3 0 0 0 5.25 7.55V9"/>
    <path d="M15 5.25h1.45a2.3 2.3 0 0 1 2.3 2.3V9"/>
    <path d="M18.75 15v1.45a2.3 2.3 0 0 1-2.3 2.3H15"/>
    <path d="M9 18.75H7.55a2.3 2.3 0 0 1-2.3-2.3V15"/>
    {active ? (<circle cx="12" cy="12" r="2.15" fill="currentColor" stroke="none"/>) : (<circle cx="12" cy="12" r="2.15"/>)}
  </ShellStrokeIcon>);
export const ShellCloseIcon = () => (<ShellStrokeIcon>
    <path d="M6.75 6.75 17.25 17.25"/>
    <path d="M17.25 6.75 6.75 17.25"/>
  </ShellStrokeIcon>);
export const ShellDashboardIcon = () => (<ShellStrokeIcon>
    <rect x="4.25" y="4.25" width="6.5" height="6.5" rx="1.8"/>
    <rect x="13.25" y="4.25" width="6.5" height="9.5" rx="1.8"/>
    <rect x="4.25" y="13.25" width="6.5" height="6.5" rx="1.8"/>
    <rect x="13.25" y="16.25" width="6.5" height="3.5" rx="1.2"/>
  </ShellStrokeIcon>);
export const ShellInventoryIcon = () => (<ShellStrokeIcon>
    <path d="m12 3.75 7.25 3.63L12 11 4.75 7.38 12 3.75Z"/>
    <path d="M4.75 7.38V16.6L12 20.25l7.25-3.65V7.38"/>
    <path d="M12 11v9.25"/>
  </ShellStrokeIcon>);
export const ShellPurchaseIcon = () => (<ShellStrokeIcon>
    <path d="M8.25 5h7.5a2 2 0 0 1 2 2v11.25a1 1 0 0 1-1.45.9L12 17.1l-4.3 2.05a1 1 0 0 1-1.45-.9V7a2 2 0 0 1 2-2Z"/>
    <path d="M9 8.5h6M9 12h4.5"/>
  </ShellStrokeIcon>);
export const ShellSalesIcon = () => (<ShellStrokeIcon>
    <path d="M7.25 4.75h7.2l3.3 3.3v10a1.7 1.7 0 0 1-1.7 1.7h-8.8a1.7 1.7 0 0 1-1.7-1.7v-11.6a1.7 1.7 0 0 1 1.7-1.7Z"/>
    <path d="M14.45 4.95v2.7a.9.9 0 0 0 .9.9h2.7"/>
    <path d="M9 11h6M9 14.5h6"/>
  </ShellStrokeIcon>);
export const ShellGlobeIcon = () => (<ShellStrokeIcon>
    <circle cx="12" cy="12" r="8.25"/>
    <path d="M3.75 12h16.5M12 3.75c2.35 2.2 3.65 5.23 3.65 8.25S14.35 18.05 12 20.25M12 3.75c-2.35 2.2-3.65 5.23-3.65 8.25S9.65 18.05 12 20.25"/>
  </ShellStrokeIcon>);
export const ShellCustomersIcon = () => (<ShellStrokeIcon>
    <path d="M15.5 18.5v-.8a3.7 3.7 0 0 0-7.4 0v.8"/>
    <circle cx="11.8" cy="9.1" r="2.7"/>
    <path d="M18.7 17.6v-.45a2.9 2.9 0 0 0-2.45-2.86M16.7 6.8a2.5 2.5 0 0 1 0 4.99"/>
  </ShellStrokeIcon>);
export const ShellWalletIcon = () => (<ShellStrokeIcon>
    <path d="M5.75 7.25h12.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H5.75a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5Z"/>
    <path d="M4.75 9h14.5"/>
    <path d="M14.5 13h2"/>
  </ShellStrokeIcon>);
export const ShellUsersIcon = () => (<ShellStrokeIcon>
    <circle cx="9" cy="9.1" r="2.6"/>
    <circle cx="16.4" cy="10.2" r="2.05"/>
    <path d="M4.9 18.5a4.2 4.2 0 0 1 8.2 0M14.45 18.5a3.35 3.35 0 0 1 5.05-2.9"/>
  </ShellStrokeIcon>);
export const ShellPartnershipIcon = () => (<ShellStrokeIcon>
    <circle cx="8.2" cy="8.8" r="2.2"/>
    <circle cx="15.8" cy="8.8" r="2.2"/>
    <path d="M4.6 18.4a3.8 3.8 0 0 1 7.2 0"/>
    <path d="M12.2 18.4a3.8 3.8 0 0 1 7.2 0"/>
    <path d="M9.95 13.2h4.1"/>
  </ShellStrokeIcon>);
export const ShellReportsIcon = () => (<ShellStrokeIcon>
    <path d="M5 18.5h14"/>
    <path d="M7.5 18.5v-5.25"/>
    <path d="M12 18.5V9.25"/>
    <path d="M16.5 18.5v-7.5"/>
    <path d="m7.5 10.25 4.5-3 4.5 2.25"/>
  </ShellStrokeIcon>);
export const ShellSystemIcon = () => <ShellSimpleGearIcon />;
export const ShellLockIcon = () => (<ShellStrokeIcon>
    <path d="M7.5 10.25h9a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.75v-6a1.5 1.5 0 0 1 1.5-1.5Z"/>
    <path d="M8.75 10.25V7.9a3.25 3.25 0 0 1 6.5 0v2.35"/>
    <path d="M12 13.75v2.25"/>
  </ShellStrokeIcon>);
export const ShellLogoutIcon = () => (<ShellStrokeIcon>
    <path d="M10.5 5.5H7.75A2.25 2.25 0 0 0 5.5 7.75v8.5a2.25 2.25 0 0 0 2.25 2.25h2.75"/>
    <path d="M13.5 8.5 17 12l-3.5 3.5"/>
    <path d="M17 12H9"/>
  </ShellStrokeIcon>);
export const ShellTreasuryIcon = () => (<ShellStrokeIcon>
    <rect x="4.25" y="7.5" width="15.5" height="11" rx="2.2"/>
    <path d="M7.75 7.5V5.75a2 2 0 0 1 2-2h4.5a2 2 0 0 1 2 2V7.5"/>
    <circle cx="12" cy="13" r="2.4"/>
    <path d="M12 11.8v2.4M11.1 13h1.8"/>
  </ShellStrokeIcon>);
