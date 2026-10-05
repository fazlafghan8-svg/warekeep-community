import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Medicine } from '../../types';
import { Settings } from '../Settings';
import { Sidebar } from '../Sidebar';
import { AppTopBar } from '../ui/AppTopBar';
import { MedicineDetailsModal } from '../MedicineDetailsModal';

vi.mock('../../hooks/useNativeWindowControls', () => ({ useNativeWindowControls: () => false }));

const settings: AppSettings = {
  storeName: 'Local pharmacy', storePhone: '', storeAddress: '', taxRate: 0,
  language: 'english', operationMode: 'offline', users: [],
};
const localProfile = { provider: 'local' as const, id: 'local-owner', name: 'Local owner', email: '' };
const settingsProps = {
  settings, googleUser: localProfile, onSaveSettings: vi.fn(), onRestoreData: vi.fn(),
  onManualBackup: vi.fn(), onManualRestore: vi.fn(), onLogin: vi.fn(), onSystemReset: vi.fn(),
  invoices: [], medicines: [], customers: [], expenses: [], suppliers: [], purchases: [], partners: [],
};

describe('Community offline interface', () => {
  const fetchMock = vi.fn(() => Promise.reject(new Error('Offline UI must not request a network resource.')));
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    try { expect(fetchMock).not.toHaveBeenCalled(); }
    finally { vi.unstubAllGlobals(); }
  });

  it('keeps settings editable and backup available without checking cloud services', async () => {
    render(<Settings {...settingsProps} />);
    const storeName = document.querySelector('input[name="storeName"]') as HTMLInputElement;
    expect(storeName).not.toBeDisabled();
    fireEvent.change(storeName, { target: { value: 'Updated local pharmacy' } });
    expect(screen.getAllByText('Unsaved changes')).not.toHaveLength(0);
    expect(screen.getByRole('tab', { name: 'Maintenance' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /subscription|updates|device security|ai router/i })).toBeNull();
    expect(screen.queryByText('Workspace Sync')).toBeNull();
    expect(screen.queryByText('Default AI input in Add Medicine')).toBeNull();
  });

  it('opens backup and restore while keeping cloud diagnostics inactive', async () => {
    render(<Settings {...settingsProps} requestedTab="maintenance" />);
    expect(await screen.findByRole('button', { name: /Export Data/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Import Data/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run Data Integrity Audit' })).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: /Deep Diagnostic|Auto Health/ })).toBeNull();
  });

  it('shows the complete reset confirmation in English and leaves deletion disabled', async () => {
    render(<Settings {...settingsProps} requestedTab="maintenance" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Options' }));
    expect(screen.getByText('Type DELETE to confirm:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Permanently delete data' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Cancel$/ })).toBeInTheDocument();
    expect(screen.queryByText('حذف دائمی اطلاعات')).toBeNull();
    expect(settingsProps.onSystemReset).not.toHaveBeenCalled();
  });

  it('shows English medicine form and unit labels while preserving an entered Dari medicine name', () => {
    const medicine = { id: 'test-medicine', name: 'نام شخصی دوا', manufacturer: 'Example',
      type: 'Tablet', unit: 'دانه', batches: [], lowStockThreshold: 2,
      salePrices: { retail: 10, wholesale: 9, bulk: 8 } } as Medicine;
    render(<MedicineDetailsModal medicine={medicine} settings={settings} onClose={vi.fn()}
      onUpdateMedicine={vi.fn()} onUpdateBatch={vi.fn()} onAddBatch={vi.fn()} />);
    expect(screen.getAllByText('Tablet / Pcs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('نام شخصی دوا').length).toBeGreaterThan(0);
    expect(screen.queryByText(/قرص \/ دانه/)).toBeNull();
    expect(medicine.name).toBe('نام شخصی دوا');
    expect(medicine.unit).toBe('دانه');
  });

  it('rejects a stale deep link to subscription settings', async () => {
    render(<Settings {...settingsProps} requestedTab="subscription" />);
    await waitFor(() => expect(document.querySelector('input[name="storeName"]')).not.toBeNull());
    expect(screen.queryByText('Recover License')).toBeNull();
  });

  it('keeps local navigation and removes cloud, assistant, upgrade, and logout links', () => {
    render(<Sidebar currentView="inventory" setView={vi.fn()} isOpen setIsOpen={vi.fn()}
      googleUser={localProfile} settings={settings} onLogout={vi.fn()} onOpenSubscription={vi.fn()} />);
    expect(screen.getByTestId('app-sidebar-nav-inventory')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-nav-purchases')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-nav-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar-nav-assistant')).toBeNull();
    expect(screen.queryByTestId('app-sidebar-nav-website_orders')).toBeNull();
    expect(screen.queryByRole('button', { name: /upgrade plan|subscription|log out|logout/i })).toBeNull();
  });

  it('does not treat missing internet as an error or offer AI and online updates', () => {
    render(<AppTopBar language="english" showQuickActions syncStatus="error" isDeviceOnline={false}
      isConnectionOnline={false} updateAvailable onOpenAssistant={vi.fn()} onOpenUpdates={vi.fn()}
      onOpenSettings={vi.fn()} onOpenNotifications={vi.fn()} />);
    expect(screen.queryByTestId('app-topbar-ai-trigger')).toBeNull();
    expect(screen.getByTestId('app-topbar-utility-trigger').querySelector('.bg-rose-400')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tools and status' }));
    expect(screen.queryByTestId('app-topbar-utility-status')).toBeNull();
    expect(screen.queryByText('Open updates')).toBeNull();
    expect(screen.queryByText('Connection status')).toBeNull();
  });
});
