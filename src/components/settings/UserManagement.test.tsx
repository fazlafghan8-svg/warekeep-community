import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, AppUser } from '../../types';
import { UserManagement } from './UserManagement';
const baseSettings: AppSettings = {
    storeName: 'Test pharmacy',
    storePhone: '',
    storeAddress: '',
    taxRate: 0,
    language: 'english',
    operationMode: 'offline',
    teamMode: false,
    users: []
};
const adminUser: AppUser = {
    id: 'user-admin',
    name: 'Admin User',
    pinCode: '1234',
    role: 'admin',
    permissions: [],
    baseSalary: 0,
    commissionRate: 0,
    commissionTiers: []
};
const staffUser: AppUser = {
    id: 'user-staff',
    name: 'Staff User',
    pinCode: '5678',
    role: 'staff',
    permissions: ['view_dashboard'],
    baseSalary: 0,
    commissionRate: 0,
    commissionTiers: []
};
afterEach(() => {
    vi.restoreAllMocks();
});
describe('UserManagement', () => {
    it('keeps user creation available before team mode is enabled', () => {
        render(<UserManagement settings={baseSettings} onSaveSettings={vi.fn()}/>);
        const addButton = screen.getByRole('button', { name: /add new user/i });
        expect(addButton).toBeInTheDocument();
        fireEvent.click(addButton);
        expect(screen.getByRole('heading', { name: /add new user/i })).toBeInTheDocument();
    });
    it('keeps edit mode title for existing users', () => {
        render(<UserManagement settings={{ ...baseSettings, teamMode: true, users: [adminUser] }} onSaveSettings={vi.fn()}/>);
        fireEvent.click(screen.getByRole('button', { name: /edit & access/i }));
        expect(screen.getByRole('heading', { name: /edit user & permissions/i })).toBeInTheDocument();
    });
    it('keeps deleted local users out of the access list without blocking user creation', () => {
        render(<UserManagement settings={{ ...baseSettings, users: [adminUser, { ...staffUser, isDeleted: true }] }} onSaveSettings={vi.fn()}/>);
        expect(screen.queryByText('Staff User')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /add new user/i }));
        expect(screen.getByRole('heading', { name: /add new user/i })).toBeInTheDocument();
    });
    it('soft deletes users instead of removing their history record', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onSaveSettings = vi.fn();
        render(<UserManagement settings={{ ...baseSettings, users: [adminUser, staffUser] }} onSaveSettings={onSaveSettings}/>);
        fireEvent.click(screen.getByRole('button', { name: /delete staff user/i }));
        await waitFor(() => expect(onSaveSettings).toHaveBeenCalled());
        expect(onSaveSettings.mock.calls[0][0].users).toEqual([
            adminUser,
            expect.objectContaining({
                id: staffUser.id,
                isDeleted: true
            })
        ]);
    });
    it('blocks deleting the last active admin while team mode is enabled', () => {
        const onSaveSettings = vi.fn();
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        render(<UserManagement settings={{ ...baseSettings, teamMode: true, users: [adminUser] }} onSaveSettings={onSaveSettings}/>);
        fireEvent.click(screen.getByRole('button', { name: /delete admin user/i }));
        expect(alertSpy).toHaveBeenCalledWith('Local access protection needs an active administrator.');
        expect(onSaveSettings).not.toHaveBeenCalled();
    });
    it('exposes infrastructure permissions used by the app shell and operational modules', () => {
        render(<UserManagement settings={baseSettings} onSaveSettings={vi.fn()}/>);
        fireEvent.click(screen.getByRole('button', { name: /add new user/i }));
        expect(screen.getByText(/Manage users and permissions/i)).toBeInTheDocument();
        expect(screen.getByText(/Manage purchases and suppliers/i)).toBeInTheDocument();
        expect(screen.getByText(/View treasury and cash drawer/i)).toBeInTheDocument();
    });
});
