import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AppTopBar } from '../AppTopBar';
vi.mock('../../../hooks/useNativeWindowControls', () => ({
    useNativeWindowControls: () => false,
}));
const buildProps = (overrides: Partial<React.ComponentProps<typeof AppTopBar>> = {}) => ({
    language: 'english' as const,
    showQuickActions: true,
    syncStatus: 'ok' as const,
    notificationCount: 12,
    updateAvailable: true,
    profileName: 'Demo User',
    workspaceName: 'Synthetic local workspace',
    workspaceMeta: 'Operational workspace',
    onToggleSidebar: vi.fn(),
    onToggleZenMode: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenProfile: vi.fn(),
    onOpenUpdates: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onOpenAssistant: vi.fn(),
    ...overrides,
});
const queryUtilityAlertDot = () => screen.getByTestId('app-topbar-utility-trigger').querySelector('.bg-rose-400');
describe('AppTopBar shell regressions', () => {
    it('keeps the compact 36px shell and exposes the profile and utility triggers', () => {
        render(<AppTopBar {...buildProps()}/>);
        const topbar = screen.getByTestId('app-topbar-shell');
        expect(topbar.className).toContain('h-[var(--wk-titlebar-height)]');
        expect(topbar.className).not.toContain('h-[56px]');
        expect(screen.getByTestId('app-topbar-brand-rail')).toBeTruthy();
        expect(screen.getByTestId('app-topbar-command-center').className).toContain('wk-topbar-command-center');
        expect(screen.getByTestId('app-topbar-search-rail')).toBeTruthy();
        expect(screen.getByTestId('app-topbar-action-rail')).toBeTruthy();
        expect(screen.getByTestId('app-topbar-status-cluster')).toBeTruthy();
        expect(screen.getByTestId('app-topbar-actions-cluster')).toBeTruthy();
        expect(screen.getByLabelText('Profile')).toBeTruthy();
        expect(screen.queryByTestId('app-topbar-ai-trigger')).toBeNull();
        expect(screen.queryByTestId('app-topbar-theme-trigger')).toBeNull();
        expect(screen.getByLabelText('Tools and status')).toBeTruthy();
        const searchTrigger = screen.getByTestId('app-topbar-search-trigger');
        expect(searchTrigger.className).toContain('wk-topbar-search-trigger-compact');
        expect(searchTrigger.className).not.toContain('max-w-[260px]');
        expect(screen.getByText('9+')).toBeTruthy();
    });
    it('does not render a topbar connection alert for ok status', () => {
        render(<AppTopBar {...buildProps({
            notificationCount: 0,
            updateAvailable: false,
        })}/>);
        expect(screen.queryByRole('status')).toBeNull();
        expect(queryUtilityAlertDot()).toBeNull();
    });
    it('ignores inherited sync progress and keeps the local utility menu available', () => {
 render(<AppTopBar {...buildProps({ syncStatus: 'syncing', notificationCount: 0, updateAvailable: false })} />);
 expect(screen.queryByRole('status')).toBeNull();
 expect(queryUtilityAlertDot()).toBeNull();
 fireEvent.click(screen.getByLabelText('Tools and status'));
 const menu = screen.getByRole('menu', { name: 'Tools and status' });
 expect(within(menu).queryByText('Background sync')).toBeNull();
 expect(within(menu).getByText('Settings')).toBeTruthy();
 expect(within(menu).getByText('Focus mode')).toBeTruthy();
});
    it('does not treat a raw offline sync state as a connection issue while connectivity is healthy', () => {
        render(<AppTopBar {...buildProps({
            syncStatus: 'offline',
            isConnectionOnline: true,
            notificationCount: 0,
            updateAvailable: false,
        })}/>);
        expect(screen.queryByRole('status')).toBeNull();
        expect(queryUtilityAlertDot()).toBeNull();
    });
    it.each([
 { syncStatus: 'offline' as const, isDeviceOnline: true, isConnectionOnline: false },
 { syncStatus: 'error' as const, isDeviceOnline: true, isConnectionOnline: true },
])('keeps remote connection indicators absent for legacy %s props', (status) => {
 render(<AppTopBar {...buildProps({ ...status, notificationCount: 0, updateAvailable: false })} />);
 expect(screen.queryByRole('status')).toBeNull();
 expect(queryUtilityAlertDot()).toBeNull();
 fireEvent.click(screen.getByLabelText('Tools and status'));
 const menu = screen.getByRole('menu', { name: 'Tools and status' });
 expect(within(menu).queryByText(/Server unavailable|Sync error|Background sync/i)).toBeNull();
 expect(within(menu).getByText('Users & Access')).toBeTruthy();
});
    it('keeps local settings usable when inherited server availability is false', () => {
 const onOpenSettings = vi.fn();
 render(<AppTopBar {...buildProps({ syncStatus: 'offline', isDeviceOnline: true, isConnectionOnline: false, onOpenSettings, notificationCount: 0, updateAvailable: false })} />);
 expect(screen.queryByRole('status')).toBeNull();
 fireEvent.click(screen.getByLabelText('Tools and status'));
 const menu = screen.getByRole('menu', { name: 'Tools and status' });
 expect(within(menu).queryByText('Server unavailable')).toBeNull();
 fireEvent.click(within(menu).getByText('Settings'));
 expect(onOpenSettings).toHaveBeenCalledTimes(1);
});
    it('does not restore cloud error or online service labels from legacy props', () => {
 render(<AppTopBar {...buildProps({ syncStatus: 'error', isDeviceOnline: true, isConnectionOnline: true, notificationCount: 0, updateAvailable: false })} />);
 expect(screen.queryByRole('status')).toBeNull();
 fireEvent.click(screen.getByLabelText('Tools and status'));
 const menu = screen.getByRole('menu', { name: 'Tools and status' });
 expect(within(menu).queryByText(/^(Sync error|Offline|Online|Background sync)$/i)).toBeNull();
 expect(within(menu).getByText('Appearance')).toBeTruthy();
});
    it('keeps the offline local shell usable without displaying cloud warnings', () => {
 const onOpenProfile = vi.fn();
 render(<AppTopBar {...buildProps({ syncStatus: 'offline', isDeviceOnline: false, isConnectionOnline: false, onOpenProfile, notificationCount: 0, updateAvailable: false })} />);
 expect(screen.queryByRole('status')).toBeNull();
 expect(queryUtilityAlertDot()).toBeNull();
 fireEvent.click(screen.getByLabelText('Profile'));
 expect(onOpenProfile).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByLabelText('Tools and status'));
 expect(within(screen.getByRole('menu', { name: 'Tools and status' })).queryByText('Offline')).toBeNull();
});
    it('keeps the assistant absent and opens local command search instead', () => {
 const onOpenAssistant = vi.fn();
 const onOpenCommandPalette = vi.fn();
 render(<AppTopBar {...buildProps({ onOpenAssistant, onOpenCommandPalette })} />);
 expect(screen.queryByTestId('app-topbar-ai-trigger')).toBeNull();
 expect(screen.queryByRole('button', { name: /AI Assistant/i })).toBeNull();
 fireEvent.click(screen.getByTestId('app-topbar-search-trigger'));
 expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
 expect(onOpenAssistant).not.toHaveBeenCalled();
});
    it('moves appearance into the utility menu', () => {
        const onOpenWorkspace = vi.fn();
        render(<AppTopBar {...buildProps({ onOpenWorkspace })}/>);
        fireEvent.click(screen.getByLabelText('Tools and status'));
        const menu = screen.getByRole('menu', { name: 'Tools and status' });
        const appearanceItem = within(menu).getByRole('menuitem', { name: /Appearance/i });
        expect(within(menu).getByTestId('app-topbar-theme-menu-item')).toBeTruthy();
        fireEvent.click(appearanceItem);
        expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu', { name: 'Tools and status' })).toBeNull();
    });
    it('raises the topbar stacking layer while the utility menu is open', () => {
        render(<AppTopBar {...buildProps()}/>);
        const topbar = screen.getByTestId('app-topbar-shell');
        expect(topbar.className).toContain('z-40');
        expect(topbar.className).not.toContain('z-[130]');
        fireEvent.click(screen.getByLabelText('Tools and status'));
        expect(topbar.className).toContain('z-[130]');
        expect(screen.getByTestId('app-topbar-utility-menu').className).toContain('z-[160]');
    });
    it('keeps RTL utility navigation accessible while users and access moves into the three-dot menu', () => {
        render(<AppTopBar {...buildProps({
            language: 'dari',
            syncStatus: 'syncing',
            notificationCount: 0,
            updateAvailable: false,
            profileName: 'کاربر',
        })}/>);
        expect(screen.getByTestId('app-topbar-search-trigger').getAttribute('dir')).toBe('rtl');
        expect(screen.getByTestId('app-topbar-search-copy').getAttribute('dir')).toBe('rtl');
        fireEvent.click(screen.getByLabelText('ابزارها و وضعیت'));
        const menu = screen.getByRole('menu', { name: 'ابزارها و وضعیت' });
        expect(menu.getAttribute('dir')).toBe('rtl');
        expect(within(menu).getByText('اقدامات سریع')).toBeTruthy();
        expect(within(menu).getByText('کاربران و دسترسی')).toBeTruthy();
        expect(within(menu).getByText('تنظیمات')).toBeTruthy();
        expect(within(menu).queryByText('همگام‌سازی در پس‌زمینه')).toBeNull();
        expect(within(menu).getByText('حالت تمرکز')).toBeTruthy();
    });
    it('keeps users-and-access and focus mode inside the utility menu', () => {
        const onOpenProfile = vi.fn();
        const onToggleZenMode = vi.fn();
        render(<AppTopBar {...buildProps({
            onOpenProfile,
            onToggleZenMode,
        })}/>);
        fireEvent.click(screen.getByLabelText('Profile'));
        fireEvent.click(screen.getByLabelText('Tools and status'));
        const menu = screen.getByRole('menu', { name: 'Tools and status' });
        fireEvent.click(within(menu).getByText('Users & Access'));
        fireEvent.click(screen.getByLabelText('Tools and status'));
        fireEvent.click(within(screen.getByRole('menu', { name: 'Tools and status' })).getByText('Focus mode'));
        expect(onOpenProfile).toHaveBeenCalledTimes(2);
        expect(onToggleZenMode).toHaveBeenCalledTimes(1);
    });
    it('keeps quick add dropdown actions working after the topbar reshuffle', () => {
        const onQuickSale = vi.fn();
        render(<AppTopBar {...buildProps({
            quickAddItems: [
                {
                    id: 'quick-sale',
                    label: 'New sale',
                    description: 'Open the fast billing workspace.',
                    onClick: onQuickSale,
                },
            ],
        })}/>);
        fireEvent.click(screen.getByLabelText('Tools and status'));
        const menu = screen.getByRole('menu', { name: 'Tools and status' });
        fireEvent.click(within(menu).getByRole('menuitem', { name: /New sale/i }));
        expect(onQuickSale).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu', { name: 'Tools and status' })).toBeNull();
    });
});
