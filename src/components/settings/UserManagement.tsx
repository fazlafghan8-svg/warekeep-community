import React, { useMemo, useState } from 'react';
import { AppSettings, AppUser, Permission, ProductCommissionAdjustmentRule, Supplier } from '../../types';
import { Modal } from '../ui/Modal';
import { checkLimit } from "../../services/localAccessPolicy";
import { DEFAULT_SUBSCRIPTION, canUseStaffAccess, normalizeOperationMode } from "../../services/localAccessPolicy";
import { createUniqueId } from '../../utils/localIds';
import { MEDICINE_TYPES } from '../../constants/medicineTypes';
import { clampCommissionRate, normalizeCommissionAdjustmentPercent, normalizeProductCommissionAdjustmentRules } from '../../utils/commissionRules';
interface UserManagementProps {
    settings: AppSettings;
    onSaveSettings: (settings: AppSettings) => Promise<void> | void;
    activeAppUser?: AppUser | null;
    suppliers?: Supplier[];
}
const buildPermissionGroups = (isEnglish: boolean): {
    name: string;
    permissions: {
        key: Permission;
        label: string;
    }[];
}[] => {
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    return [
        {
            name: tr('Inventory & Items', 'مدیریت انبار و کالا'),
            permissions: [
                { key: 'view_inventory_only', label: tr('View medicine list (read-only)', 'مشاهده لیست داروها (فقط خواندنی)') },
                { key: 'view_medicine_details', label: tr('View medicine details (history, batches)', 'مشاهده جزئیات دارو (تاریخچه، سری‌ها)') },
                { key: 'create_medicine', label: tr('Create new medicine', 'ایجاد داروی جدید') },
                { key: 'edit_medicine', label: tr('Edit medicines / increase stock', 'ویرایش داروهای موجود / افزایش موجودی') },
                { key: 'manage_inventory', label: tr('Manage stock, batches, and inventory adjustments', 'مدیریت موجودی، بچ‌ها و اصلاحات انبار') },
                { key: 'manage_purchases', label: tr('Manage purchases and suppliers', 'مدیریت خریدها و تأمین‌کنندگان') },
                { key: 'view_purchase_price', label: tr('View purchase price (confidential)', 'مشاهده قیمت خرید (محرمانه)') },
                { key: 'delete_medicine', label: tr('Delete item (dangerous)', 'حذف کالا (خطرناک)') },
            ]
        },
        {
            name: tr('Sales & Cash Desk', 'فروش و صندوق'),
            permissions: [
                { key: 'create_invoice', label: tr('Create new invoice', 'ثبت فاکتور جدید') },
                { key: 'view_invoices', label: tr('View sales history', 'مشاهده تاریخچه فروش') },
                { key: 'edit_invoice', label: tr('Edit invoices safely', 'ویرایش امن فاکتور') },
                { key: 'delete_invoice', label: tr('Delete invoice (sales rollback)', 'حذف فاکتور (برگشت از فروش)') },
                { key: 'return_sale', label: tr('Record sales returns', 'ثبت برگشتی فروش') },
                { key: 'apply_discount', label: tr('Permission to apply discount', 'مجوز اعمال تخفیف') },
            ]
        },
        {
            name: tr('Accounting & Customers', 'حسابداری و مشتریان'),
            permissions: [
                { key: 'view_customers', label: tr('View customers list', 'مشاهده لیست مشتریان') },
                { key: 'manage_customers', label: tr('Create new customer', 'تعریف مشتری جدید') },
                { key: 'manage_debt', label: tr('Manual debt/credit records', 'ثبت دستی بدهی/طلب') },
                { key: 'view_expenses', label: tr('View expenses', 'مشاهده هزینه‌ها') },
                { key: 'manage_expenses', label: tr('Manage expenses', 'مدیریت هزینه‌ها') },
                { key: 'view_treasury', label: tr('View treasury and cash drawer', 'مشاهده خزانه و صندوق') },
                { key: 'manage_treasury', label: tr('Manage treasury transactions', 'مدیریت تراکنش‌های خزانه') },
                { key: 'view_partnerships', label: tr('View partnerships', 'مشاهده شراکت') },
                { key: 'manage_partnerships', label: tr('Manage partnerships', 'مدیریت شراکت') },
            ]
        },
        {
            name: tr('Reports & System', 'گزارشات و مدیریت سیستم'),
            permissions: [
                { key: 'view_dashboard', label: tr('View dashboard', 'مشاهده داشبورد') },
                { key: 'view_reports', label: tr('View general reports', 'مشاهده گزارشات عمومی') },
                { key: 'view_profit', label: tr('View net profit (confidential)', 'مشاهده سود خالص (محرمانه)') },
                { key: 'manage_settings', label: tr('Access settings', 'دسترسی به تنظیمات') },
                { key: 'manage_users', label: tr('Manage users and permissions', 'مدیریت کاربران و صلاحیت‌ها') },
                { key: 'backup_restore', label: tr('Backup and restore', 'پشتیبان‌گیری و بازیابی') },
                { key: 'view_payroll', label: tr('View payroll', 'مشاهده حقوق و پرسنل') },
                { key: 'manage_payroll', label: tr('Manage and pay payroll', 'مدیریت و پرداخت حقوق') },
            ]
        }
    ];
};
const getActiveUsers = (users: AppUser[] = []) => users.filter((user) => user && !user.isDeleted);
const hasValidPin = (user: Partial<AppUser>) => typeof user.pinCode === 'string' && user.pinCode.trim().length >= 4;
const normalizeMoneyValue = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};
const normalizePercentValue = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0)
        return 0;
    return Math.min(100, numeric);
};
export const UserManagement: React.FC<UserManagementProps> = ({ settings, onSaveSettings, activeAppUser, suppliers = [] }) => {
    const isEnglish = (settings.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const permissionGroups = useMemo(() => buildPermissionGroups(isEnglish), [isEnglish]);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<Partial<AppUser>>({});
    const [showPin, setShowPin] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Tier Form State
    const [newTierThreshold, setNewTierThreshold] = useState('');
    const [newTierRate, setNewTierRate] = useState('');
    const [groupRuleTarget, setGroupRuleTarget] = useState<ProductCommissionAdjustmentRule['target']>('medicineType');
    const [groupRuleTargetValue, setGroupRuleTargetValue] = useState('');
    const [groupRuleTargetLabel, setGroupRuleTargetLabel] = useState('');
    const [groupRuleUserId, setGroupRuleUserId] = useState('');
    const [groupRuleMode, setGroupRuleMode] = useState<ProductCommissionAdjustmentRule['mode']>('adjustment');
    const [groupRuleAdjustment, setGroupRuleAdjustment] = useState('');
    const [groupRuleNote, setGroupRuleNote] = useState('');
    const users = settings.users || [];
    const activeUsers = useMemo(() => getActiveUsers(users), [users]);
    const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier && !supplier.isDeleted), [suppliers]);
    const productCommissionRules = useMemo(() => normalizeProductCommissionAdjustmentRules(settings.commissionRules), [settings.commissionRules]);
    const allPermissions = useMemo(() => permissionGroups.flatMap(g => g.permissions.map(p => p.key)), [permissionGroups]);
    const validPermissionSet = useMemo(() => new Set<Permission>(allPermissions), [allPermissions]);
    const activeAdminUsers = activeUsers.filter((user) => user.role === 'admin');
    const adminCount = activeAdminUsers.length;
    const staffCount = activeUsers.length - adminCount;
    const isEditingExistingUser = !!editingUser.id && activeUsers.some((user) => user.id === editingUser.id);
    const canManageProductCommissionRules = !activeAppUser || activeAppUser.role === 'admin' || activeAppUser.permissions.includes('manage_payroll');
    const toggleTeamMode = async () => {
        const newMode = !settings.teamMode;
        if (newMode) {
            const operationMode = normalizeOperationMode(settings.operationMode);
            if (operationMode !== 'team' && !canUseStaffAccess(settings.subscription || DEFAULT_SUBSCRIPTION)) {
                alert(tr('Team mode is locked. Select Team operation mode and validate license first.', 'حالت تیمی قفل است. ابتدا حالت کاری Team را انتخاب و لایسنس را اعتبارسنجی کنید.'));
                return;
            }
            const subscription = settings.subscription || DEFAULT_SUBSCRIPTION;
            if (!canUseStaffAccess(subscription)) {
                alert(tr('Team mode requires a valid Team license.', 'حالت تیمی نیازمند لایسنس معتبر Team است.'));
                return;
            }
            // Safety Check: Ensure there is at least one admin
            const hasAdmin = activeUsers.some(u => u.role === 'admin' && hasValidPin(u));
            if (!hasAdmin) {
                alert(tr('Create an administrator with a PIN before enabling local access protection.', 'برای فعال‌سازی دسترسی امن محلی، ابتدا یک مدیر با رمز بسازید.'));
                return;
            }
        }
        await onSaveSettings({
            ...settings,
            teamMode: newMode,
            updatedAt: new Date().toISOString()
        });
    };
    const handleAddUser = () => {
        const usersCount = activeUsers.length;
        const limitCheck = checkLimit(settings, 'maxUsers', usersCount);
        if (!limitCheck.allowed) {
            alert(limitCheck.message);
            return;
        }
        setEditingUser({
            id: createUniqueId('user'),
            name: '',
            pinCode: '',
            role: 'staff',
            permissions: ['view_dashboard', 'create_invoice', 'view_inventory_only'],
            baseSalary: 0,
            commissionRate: 0,
            commissionTiers: []
        });
        setShowUserModal(true);
        setShowPin(false);
    };
    const handleEditUser = (user: AppUser) => {
        setEditingUser({ ...user, commissionTiers: user.commissionTiers || [] });
        setShowUserModal(true);
        setShowPin(false);
    };
    const togglePermission = (key: Permission) => {
        if (!editingUser.permissions)
            return;
        const newPermissions = editingUser.permissions.includes(key)
            ? editingUser.permissions.filter(p => p !== key)
            : [...editingUser.permissions, key];
        setEditingUser({ ...editingUser, permissions: newPermissions });
    };
    const handleRoleChange = (role: 'admin' | 'staff') => {
        if (role === 'admin') {
            setEditingUser({ ...editingUser, role, permissions: allPermissions });
        }
        else {
            setEditingUser({ ...editingUser, role, permissions: ['view_dashboard', 'create_invoice', 'view_inventory_only'] });
        }
    };
    const handleGroupRuleAdjustmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value.trim();
        if (value === '' || value === '-' || value === '+' || /^[+-]?\d*\.?\d*$/.test(value)) {
            setGroupRuleAdjustment(value);
        }
    };
    const saveProductCommissionRules = async (rules: ProductCommissionAdjustmentRule[]) => {
        await onSaveSettings({
            ...settings,
            commissionRules: normalizeProductCommissionAdjustmentRules(rules),
            updatedAt: new Date().toISOString()
        });
    };
    const addProductCommissionRule = async () => {
        if (!canManageProductCommissionRules)
            return;
        const targetValue = groupRuleTargetValue.trim();
        const adjustmentPercent = groupRuleMode === 'override'
            ? clampCommissionRate(groupRuleAdjustment)
            : normalizeCommissionAdjustmentPercent(groupRuleAdjustment);
        if (!targetValue) {
            alert(tr('Choose or enter a supplier, manufacturer, or medicine type.', 'تامین‌کننده، شرکت سازنده یا نوع دوا را انتخاب/وارد کنید.'));
            return;
        }
        if (!groupRuleAdjustment.trim() || groupRuleAdjustment === '+' || groupRuleAdjustment === '-') {
            alert(tr('Enter a commission percent.', 'فیصدی کمیسیون را وارد کنید.'));
            return;
        }
        if (groupRuleMode !== 'override' && adjustmentPercent === 0) {
            alert(tr('Enter a positive or negative adjustment percent.', 'یک فیصدی تعدیل مثبت یا منفی وارد کنید.'));
            return;
        }
        await saveProductCommissionRules([
            ...productCommissionRules,
            {
                id: createUniqueId('prodcom'),
                target: groupRuleTarget,
                targetValue,
                targetLabel: groupRuleTargetLabel.trim() || undefined,
                userId: groupRuleUserId || undefined,
                adjustmentPercent,
                mode: groupRuleMode,
                enabled: true,
                note: groupRuleNote.trim() || undefined,
                updatedAt: new Date().toISOString()
            }
        ]);
        setGroupRuleTargetValue('');
        setGroupRuleTargetLabel('');
        setGroupRuleUserId('');
        setGroupRuleMode('adjustment');
        setGroupRuleAdjustment('');
        setGroupRuleNote('');
    };
    const removeProductCommissionRule = async (ruleId: string) => {
        if (!canManageProductCommissionRules)
            return;
        await saveProductCommissionRules(productCommissionRules.filter((rule) => rule.id !== ruleId));
    };
    const handleAddTier = () => {
        const threshold = parseInt(newTierThreshold, 10);
        const rate = parseFloat(newTierRate);
        if (isNaN(threshold) || isNaN(rate) || threshold <= 0 || rate <= 0 || rate > 100) {
            alert(tr('Please enter valid sales amount and commission rate.', 'لطفاً مبلغ فروش و درصد معتبر وارد کنید.'));
            return;
        }
        const currentTiers = editingUser.commissionTiers || [];
        // Prevent duplicates for same threshold
        if (currentTiers.some(t => t.threshold === threshold)) {
            alert(tr('This sales tier already exists.', 'این پله فروش قبلاً تعریف شده است.'));
            return;
        }
        const updatedTiers = [...currentTiers, { threshold, rate }].sort((a, b) => a.threshold - b.threshold);
        setEditingUser({ ...editingUser, commissionTiers: updatedTiers });
        setNewTierThreshold('');
        setNewTierRate('');
    };
    const handleRemoveTier = (threshold: number) => {
        const currentTiers = editingUser.commissionTiers || [];
        const updatedTiers = currentTiers.filter(t => t.threshold !== threshold);
        setEditingUser({ ...editingUser, commissionTiers: updatedTiers });
    };
    const saveUser = async () => {
        const normalizedName = (editingUser.name || '').trim();
        const normalizedPin = (editingUser.pinCode || '').replace(/\D/g, '');
        const normalizedRole = editingUser.role === 'admin' ? 'admin' : 'staff';
        if (!normalizedName || !normalizedPin)
            return alert(tr('Name and PIN are required.', 'نام و رمز عبور الزامی است.'));
        if (normalizedPin.length < 4)
            return alert(tr('PIN must be at least 4 digits.', 'رمز عبور باید حداقل ۴ رقم باشد.'));
        const duplicateActiveName = activeUsers.some((user) => (user.id !== editingUser.id &&
            user.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase()));
        if (duplicateActiveName) {
            return alert(tr('Another active user already has this name.', 'یک کاربر فعال دیگر با این نام وجود دارد.'));
        }
        const existingUser = users.find((user) => user.id === editingUser.id);
        const isDowngradingLastTeamAdmin = !!settings.teamMode &&
            existingUser?.role === 'admin' &&
            normalizedRole !== 'admin' &&
            activeAdminUsers.filter((user) => user.id !== existingUser.id).length === 0;
        if (isDowngradingLastTeamAdmin) {
            return alert(tr('Local access protection needs an active administrator.', 'دسترسی امن محلی به یک مدیر فعال نیاز دارد.'));
        }
        setIsSaving(true);
        try {
            const normalizedPermissions = normalizedRole === 'admin'
                ? allPermissions
                : Array.from(new Set((editingUser.permissions || []).filter((permission): permission is Permission => validPermissionSet.has(permission as Permission))));
            const newUser = {
                ...editingUser,
                name: normalizedName,
                pinCode: normalizedPin,
                role: normalizedRole,
                permissions: normalizedPermissions.length > 0 ? normalizedPermissions : ['view_dashboard'],
                baseSalary: normalizeMoneyValue(editingUser.baseSalary),
                commissionRate: normalizePercentValue(editingUser.commissionRate),
                commissionTiers: (editingUser.commissionTiers || [])
                    .filter((tier) => Number.isFinite(tier.threshold) && Number.isFinite(tier.rate) && tier.threshold > 0 && tier.rate > 0 && tier.rate <= 100)
                    .map((tier) => ({ threshold: Math.round(tier.threshold), rate: normalizePercentValue(tier.rate) }))
                    .sort((a, b) => a.threshold - b.threshold),
                isDeleted: false,
                updatedAt: new Date().toISOString()
            } as AppUser;
            const currentUsers = settings.users ? [...settings.users] : [];
            const existingIndex = currentUsers.findIndex(u => u.id === newUser.id);
            let updatedUsers;
            if (existingIndex >= 0) {
                updatedUsers = [...currentUsers];
                updatedUsers[existingIndex] = newUser;
            }
            else {
                updatedUsers = [...currentUsers, newUser];
            }
            const newSettings = {
                ...settings,
                users: updatedUsers,
                updatedAt: new Date().toISOString() // Also update parent settings timestamp
            };
            await onSaveSettings(newSettings);
            setShowUserModal(false);
        }
        catch (e) {
            console.error("Failed to save user", e);
            alert(tr('Failed to save user.', 'خطا در ذخیره کاربر.'));
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleDeleteUser = async (userId: string) => {
        const userToDelete = activeUsers.find((user) => user.id === userId);
        if (!userToDelete)
            return;
        if (settings.teamMode &&
            userToDelete.role === 'admin' &&
            activeAdminUsers.filter((user) => user.id !== userId).length === 0) {
            alert(tr('Local access protection needs an active administrator.', 'دسترسی امن محلی به یک مدیر فعال نیاز دارد.'));
            return;
        }
        if (!window.confirm(tr('Are you sure you want to delete this user?', 'آیا از حذف این کاربر اطمینان دارید؟')))
            return;
        setIsSaving(true);
        try {
            const currentUsers = settings.users ? [...settings.users] : [];
            const updatedUsers = currentUsers.map((user) => (user.id === userId
                ? { ...user, isDeleted: true, updatedAt: new Date().toISOString() }
                : user));
            const newSettings = {
                ...settings,
                users: updatedUsers,
                updatedAt: new Date().toISOString() // Update timestamp for sync
            };
            await onSaveSettings(newSettings);
        }
        catch (e) {
            console.error("Failed to delete user", e);
            alert(tr('Failed to delete user.', 'خطا در حذف کاربر.'));
        }
        finally {
            setIsSaving(false);
        }
    };
    return (<div className="grid grid-cols-1 gap-10 animate-fade-in items-start max-w-6xl mx-auto pb-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/50 backdrop-blur-sm border border-white/60 shadow-[0_2px_8px_rgb(0,0,0,0.02)] rounded-[1.5rem] p-5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block">{tr('Total Users', 'همه کاربران')}</span>
                    <span className="text-xl font-black text-slate-800">{activeUsers.length}</span>
                </div>
                <div className="bg-amber-50/50 backdrop-blur-sm border border-amber-100 shadow-[0_2px_8px_rgb(0,0,0,0.02)] rounded-[1.5rem] p-5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1 block">{tr('Admins', 'مدیران')}</span>
                    <span className="text-xl font-black text-amber-700">{adminCount}</span>
                </div>
                <div className="bg-brand-50/50 backdrop-blur-sm border border-brand-100 shadow-[0_2px_8px_rgb(0,0,0,0.02)] rounded-[1.5rem] p-5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-500 mb-1 block">{tr('Staff', 'پرسنل')}</span>
                    <span className="text-xl font-black text-brand-700">{staffCount}</span>
                </div>
                <div className={`backdrop-blur-sm border shadow-[0_2px_8px_rgb(0,0,0,0.02)] rounded-[1.5rem] p-5 ${settings.teamMode ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white/50 border-white/60'}`}>
                    <span className={`text-[10px] font-black uppercase tracking-wider mb-1 block ${settings.teamMode ? 'text-emerald-500' : 'text-slate-400'}`}>{tr('Secure Mode', 'حالت امن')}</span>
                    <span className={`text-xl font-black ${settings.teamMode ? 'text-emerald-700' : 'text-slate-800'}`}>{settings.teamMode ? tr('Enabled', 'فعال') : tr('Disabled', 'غیرفعال')}</span>
                </div>
            </div>

            {/* Team Mode Header Banner */}
            <div className={`rounded-[2rem] p-10 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-500 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border ${settings.teamMode
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-white/40 border-white/60'}`}>
                <div className="flex flex-col gap-2 relative">
                    <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-3">
                        <div className={settings.teamMode ? "bg-emerald-500/20 text-emerald-600 p-2.5 rounded-2xl" : "bg-indigo-500/10 text-indigo-600 p-2.5 rounded-2xl"}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                        </div>
                        {tr('Secure Local Access', 'دسترسی امن محلی')}
                    </h3>
                </div>

                        <button type="button" onClick={toggleTeamMode} aria-pressed={!!settings.teamMode} aria-label={settings.teamMode ? tr('Disable local access protection', 'غیرفعال‌کردن دسترسی امن محلی') : tr('Enable local access protection', 'فعال‌کردن دسترسی امن محلی')} disabled={isSaving} className={`relative w-20 h-10 rounded-full transition-colors duration-500 flex items-center shrink-0 border ${settings.teamMode
            ? 'bg-emerald-500/20 border-emerald-500/30 shadow-[inset_0_2px_4px_rgba(16,185,129,0.2)]'
            : 'bg-slate-200/50 border-slate-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]'}`}>
                    <div className={`absolute w-8 h-8 rounded-full shadow-sm transform transition-transform duration-500 flex items-center justify-center top-0.5 ${settings.teamMode ? 'translate-x-[2.7rem] bg-emerald-500 shadow-emerald-500/50' : 'translate-x-1 bg-white'}`}>
                        {settings.teamMode ? (<svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>) : (<svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>)}
                    </div>
                </button>
            </div>

            <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-6 flex flex-col gap-5 relative overflow-hidden">
                <div className="relative z-10 flex flex-col gap-2">
                    <h3 className="text-lg font-semibold text-slate-800">{tr('Medicine group commission rules', 'قواعد گروهی کمیسیون دواها')}</h3>
                    <p className="text-sm font-semibold text-slate-500">{tr('Apply one active rule for supplier, manufacturer, or medicine type after the employee base/tier rate.', 'پس از نرخ پایه یا پلکانی کارمند، یک قاعده فعال برای تامین‌کننده، شرکت سازنده یا نوع دوا اعمال می‌شود.')}</p>
                    {!canManageProductCommissionRules ? (<p className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm font-semibold text-amber-700">
                            {tr('Only admins or users with payroll management permission can change these rules.', 'فقط مدیر یا کاربر دارای صلاحیت مدیریت معاش می‌تواند این قواعد را تغییر دهد.')}
                        </p>) : null}
                </div>

                <div className="relative z-10 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_0.8fr]">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{tr('Target', 'هدف')}</label>
                        <select value={groupRuleTarget} onChange={(event) => {
            const target = event.target.value as ProductCommissionAdjustmentRule['target'];
            setGroupRuleTarget(target);
            setGroupRuleTargetValue('');
            setGroupRuleTargetLabel('');
        }} className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden">
                            <option value="medicineType">{tr('Medicine type', 'نوع دوا')}</option>
                            <option value="manufacturer">{tr('Manufacturer', 'شرکت سازنده')}</option>
                            <option value="supplier">{tr('Supplier', 'تامین‌کننده')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{tr('Value', 'مقدار')}</label>
                        {groupRuleTarget === 'medicineType' ? (<select value={groupRuleTargetValue} onChange={(event) => setGroupRuleTargetValue(event.target.value)} className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden">
                                <option value="">{tr('Choose type', 'نوع را انتخاب کنید')}</option>
                                {MEDICINE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>) : groupRuleTarget === 'supplier' ? (<select value={groupRuleTargetValue} onChange={(event) => {
                const supplier = activeSuppliers.find((item) => item.id === event.target.value);
                setGroupRuleTargetValue(event.target.value);
                setGroupRuleTargetLabel(supplier?.name || '');
            }} className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden">
                                <option value="">{tr('Choose supplier', 'تامین‌کننده را انتخاب کنید')}</option>
                                {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                            </select>) : (<input type="text" value={groupRuleTargetValue} onChange={(event) => setGroupRuleTargetValue(event.target.value)} className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden" placeholder={tr('Manufacturer name', 'نام شرکت سازنده')}/>)}
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{tr('Staff', 'کارمند')}</label>
                        <select value={groupRuleUserId} onChange={(event) => setGroupRuleUserId(event.target.value)} className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden">
                            <option value="">{tr('All staff', 'همه کارمندان')}</option>
                            {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{tr('Calculation', 'نوع محاسبه')}</label>
                        <select value={groupRuleMode} onChange={(event) => setGroupRuleMode(event.target.value as ProductCommissionAdjustmentRule['mode'])} className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden">
                            <option value="adjustment">{tr('Adjust base rate', 'تعدیل روی نرخ پایه')}</option>
                            <option value="override">{tr('Fixed final rate', 'نرخ نهایی ثابت')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                            {groupRuleMode === 'override' ? tr('Final rate (%)', 'نرخ نهایی (%)') : tr('Adjustment (%)', 'تعدیل (%)')}
                        </label>
                        <input type="text" inputMode="decimal" value={groupRuleAdjustment} onChange={handleGroupRuleAdjustmentChange} className="wk-ltr-data w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden" placeholder={groupRuleMode === 'override' ? tr('5 or 15', '5 یا 15') : tr('+5 or -3', '+5 یا -3')}/>
                    </div>
                    <div className="lg:col-span-4">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{tr('Note', 'یادداشت')}</label>
                        <input type="text" value={groupRuleNote} onChange={(event) => setGroupRuleNote(event.target.value)} className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 outline-hidden" placeholder={tr('Optional label for payroll explanation', 'برچسب اختیاری برای توضیح معاش')}/>
                    </div>
                    <div className="flex items-end">
                        <button type="button" onClick={addProductCommissionRule} disabled={isSaving || !canManageProductCommissionRules} className="w-full rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-600 disabled:opacity-60">
                            {tr('Add rule', 'افزودن قاعده')}
                        </button>
                    </div>
                </div>

                <div className="relative z-10 grid gap-3 md:grid-cols-2">
                    {productCommissionRules.length === 0 ? (<div className="rounded-2xl border border-dashed border-slate-200 bg-white/55 p-5 text-sm font-semibold text-slate-500 md:col-span-2">
                            {tr('No group commission rules yet.', 'هنوز قاعده گروهی کمیسیون ثبت نشده است.')}
                        </div>) : productCommissionRules.map((rule) => {
            const userName = rule.userId ? activeUsers.find((user) => user.id === rule.userId)?.name || tr('Selected staff', 'کارمند انتخاب‌شده') : tr('All staff', 'همه کارمندان');
            const targetName = rule.target === 'supplier'
                ? tr('Supplier', 'تامین‌کننده')
                : rule.target === 'manufacturer'
                    ? tr('Manufacturer', 'شرکت سازنده')
                    : tr('Medicine type', 'نوع دوا');
            const displayValue = rule.targetLabel || rule.targetValue;
            return (<div key={rule.id} className="rounded-2xl border border-white/70 bg-white/55 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-slate-800">{targetName}: {displayValue}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">{userName} · {rule.mode === 'override' ? tr('Fixed final rate', 'نرخ نهایی ثابت') : tr('Adjustment', 'تعدیل')} · {rule.note || tr('Group rule', 'قاعده گروهی')}</p>
                                    </div>
                                    <span className={`wk-ltr-data rounded-full border px-3 py-1 text-sm font-black ${rule.mode === 'override' || rule.adjustmentPercent >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                                        {rule.mode === 'override' ? '' : rule.adjustmentPercent >= 0 ? '+' : ''}{rule.adjustmentPercent}%
                                    </span>
                                </div>
                                {canManageProductCommissionRules ? (<button type="button" onClick={() => removeProductCommissionRule(rule.id)} className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-600">
                                        {tr('Remove', 'حذف')}
                                    </button>) : null}
                            </div>);
        })}
                </div>
            </div>

            <>
                <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-400/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <h4 className="text-lg font-semibold text-slate-800">{tr('System Users', 'لیست کاربران سیستم')}</h4>
                        <button type="button" onClick={handleAddUser} disabled={isSaving} className="bg-indigo-500 text-white px-6 py-3 rounded-2xl hover:bg-indigo-600 font-medium shadow-lg shadow-indigo-500/30 transition-all duration-300 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                            {tr('Add New User', 'افزودن کاربر جدید')}
                        </button>
                    </div>

                    {activeUsers.length === 0 ? (<div className="relative z-10 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm font-semibold text-slate-500">
                            {tr('No active users yet.', 'هنوز کاربر فعالی ثبت نشده است.')}
                        </div>) : (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                        {activeUsers.map(user => (<div key={user.id} className="bg-white/50 backdrop-blur-md rounded-[1.5rem] p-6 border border-white/50 shadow-[0_4px_15px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgb(0,0,0,0.04)] transition-all duration-300 relative overflow-hidden group hover:-translate-y-1">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-16 -mt-16 transition-opacity opacity-0 group-hover:opacity-100"></div>
                                <div className="relative z-10 flex flex-col gap-5">
                                    <div className="flex items-center justify-between border-b border-white/50 pb-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shadow-sm ${user.role === 'admin'
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'}`}>
                                                {user.name.charAt(0)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{user.name}</span>
                                                <span className={`text-xs font-semibold px-3 py-1 rounded-full w-fit mt-1 border ${user.role === 'admin'
                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                    : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                                    {user.role === 'admin' ? tr('Master Admin', 'مدیر سیستم') : tr('Staff', 'کارمند')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {user.commissionTiers && user.commissionTiers.length > 0 && (<div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100/50 flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                            <span className="text-xs font-semibold text-emerald-700">{isEnglish ? `Tier bonus enabled (${user.commissionTiers.length} tiers)` : `دارای پاداش پلکانی (${user.commissionTiers.length} سطح)`}</span>
                                        </div>)}

                                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
                                        <div className="rounded-xl border border-white/70 bg-white/50 px-3 py-2">
                                            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{tr('PIN', 'PIN')}</span>
                                            <span className={hasValidPin(user) ? 'text-emerald-600' : 'text-rose-500'}>{hasValidPin(user) ? tr('Ready', 'آماده') : tr('Missing', 'ناقص')}</span>
                                        </div>
                                        <div className="rounded-xl border border-white/70 bg-white/50 px-3 py-2">
                                            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{tr('Access', 'دسترسی')}</span>
                                            <span>{user.role === 'admin' ? tr('Full', 'کامل') : `${user.permissions?.length || 0}`}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                        <button type="button" onClick={() => handleEditUser(user)} className="text-sm bg-white/60 text-indigo-600 font-semibold px-5 py-2.5 rounded-xl hover:bg-white hover:shadow-sm transition-all border border-white/80 flex-1 flex justify-center items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"/></svg>
                                            {tr('Edit & Access', 'ویرایش و دسترسی')}
                                        </button>
                                        <button type="button" onClick={() => handleDeleteUser(user.id)} className="bg-white/60 text-rose-500 hover:text-white hover:bg-rose-500 px-3.5 py-2.5 rounded-xl transition-all border border-white/80 shrink-0 shadow-sm" title={tr('Delete user', 'حذف کاربر')} aria-label={tr(`Delete ${user.name}`, `حذف ${user.name}`)}>
                                            <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>))}
                    </div>)}
                </div>
            </>

            {/* MODALS (User) */}
            <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title={isEditingExistingUser ? tr('Edit User & Permissions', 'ویرایش کاربر و تعیین صلاحیت‌ها') : tr('Add New User', 'افزودن کاربر جدید')}>
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* LEFT COLUMN: Basic Info & Money */}
                        <div className="flex-1 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">{tr('Full Name', 'نام کامل')}</label>
                                        <input type="text" value={editingUser.name || ''} onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white no-drag shadow-sm relative z-10" placeholder={tr('Example: Ahmad Ahmadi', 'مثال: احمد احمدی')} autoFocus/>
                                    </div>
                                    <div className="relative">
                                        <label className="block text-sm font-bold text-gray-700 mb-1">{tr('PIN Code', 'رمز عبور (PIN)')}</label>
                                        <input type={showPin ? "text" : "password"} value={editingUser.pinCode || ''} onChange={e => setEditingUser({ ...editingUser, pinCode: e.target.value.replace(/\D/g, '') })} className="w-full p-2.5 border rounded-lg text-center tracking-widest text-lg font-bold bg-white focus:ring-2 focus:ring-blue-500 no-drag pr-10 shadow-sm relative z-10" placeholder="1234" maxLength={6} inputMode="numeric"/>
                                        <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-2 top-[34px] text-gray-400 hover:text-blue-600 no-drag z-20">
                                            {showPin ? (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>) : (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>)}
                                        </button>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">{tr('User Role', 'نقش کاربری')}</label>
                                        <div className="flex gap-2">
                                            <label className="flex-1 flex items-center gap-2 cursor-pointer bg-white px-3 py-2.5 rounded border border-gray-300 hover:bg-blue-50 no-drag transition">
                                                <input type="radio" name="role" checked={editingUser.role === 'admin'} onChange={() => handleRoleChange('admin')} className="w-4 h-4 text-blue-600 no-drag"/>
                                                <span className="font-medium text-gray-800 text-sm">{tr('Admin (Full)', 'مدیر (کامل)')}</span>
                                            </label>
                                            <label className="flex-1 flex items-center gap-2 cursor-pointer bg-white px-3 py-2.5 rounded border border-gray-300 hover:bg-blue-50 no-drag transition">
                                                <input type="radio" name="role" checked={editingUser.role === 'staff'} onChange={() => handleRoleChange('staff')} className="w-4 h-4 text-blue-600 no-drag"/>
                                                <span className="font-medium text-gray-800 text-sm">{tr('Staff (Limited)', 'پرسنل (محدود)')}</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                                <h4 className="font-bold text-emerald-800 text-sm mb-3 border-b border-emerald-200 pb-2">{tr('Salary & Bonus', 'حقوق و پاداش')}</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">{tr('Base Salary (AFN)', 'حقوق ثابت (AFN)')}</label>
                                        <input type="number" value={editingUser.baseSalary || 0} onChange={e => setEditingUser({ ...editingUser, baseSalary: Number(e.target.value) })} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 bg-white relative z-10"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">{tr('Base Commission (%)', 'کمیسیون پایه (%)')}</label>
                                        <input type="number" value={editingUser.commissionRate || 0} onChange={e => setEditingUser({ ...editingUser, commissionRate: Math.min(100, Math.max(0, Number(e.target.value))) })} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 bg-white relative z-10" placeholder={tr('e.g. 5', 'مثلاً 5')}/>
                                    </div>
                                </div>

                                {/* TIERED COMMISSION SECTION */}
                                <div className="mt-4 pt-4 border-t border-emerald-200">
                                    <label className="block text-xs font-bold text-emerald-800 mb-2">{tr('Tiered Bonus System', 'سیستم پاداش پلکانی')}</label>
                                    <div className="flex gap-2 mb-2 items-end">
                                        <div className="flex-1">
                                            <input type="number" value={newTierThreshold} onChange={(e) => setNewTierThreshold(e.target.value)} className="w-full p-2 text-sm border rounded relative z-10" placeholder={tr('Sales above...', 'فروش بیشتر از...')}/>
                                        </div>
                                        <div className="w-20">
                                            <input type="number" value={newTierRate} onChange={(e) => setNewTierRate(e.target.value)} className="w-full p-2 text-sm border rounded font-bold text-center relative z-10" placeholder="%"/>
                                        </div>
                                        <button type="button" onClick={handleAddTier} className="bg-emerald-600 text-white px-3 py-2 rounded text-sm hover:bg-emerald-700 h-[38px]" aria-label={tr('Add commission tier', 'افزودن پله کمیسیون')}>+</button>
                                    </div>

                                    {/* Tiers List */}
                                    {editingUser.commissionTiers && editingUser.commissionTiers.length > 0 && (<div className="bg-white rounded border border-gray-200 mt-2 overflow-hidden">
                                            <table className="w-full text-sm text-right">
                                                <tbody>
                                                    {editingUser.commissionTiers.map((tier, idx) => (<tr key={idx} className="border-t border-gray-100 first:border-0">
                                                            <td className="p-2 text-xs">{isEnglish ? `Above ${tier.threshold.toLocaleString()}` : ` بالای ${tier.threshold.toLocaleString()}`}</td>
                                                            <td className="p-2 text-center font-bold text-emerald-600 text-xs">{tier.rate}%</td>
                                                            <td className="p-2 text-center w-8">
                                                                <button type="button" onClick={() => handleRemoveTier(tier.threshold)} className="text-red-500 hover:bg-red-50 p-1 rounded font-bold" aria-label={tr('Remove commission tier', 'حذف پله کمیسیون')}>×</button>
                                                            </td>
                                                        </tr>))}
                                                </tbody>
                                            </table>
                                        </div>)}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Permissions */}
                        <div className="flex-1 flex flex-col">
                            {editingUser.role !== 'admin' ? (<div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex-1 flex flex-col h-full">
                                    <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm">
                                        {tr('Access Permissions', 'تعیین سطح دسترسی (Permissions)')}
                                    </div>
                                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1 min-h-[300px]">
                                        <div className="grid grid-cols-1 gap-6">
                                            {permissionGroups.map((group) => (<div key={group.name} className="space-y-2">
                                                    <h4 className="font-bold text-xs text-blue-600 border-b border-blue-100 pb-1 mb-2">{group.name}</h4>
                                                    {group.permissions.map((perm) => (<label key={perm.key} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded transition no-drag">
                                                            <div className="relative flex items-center mt-0.5">
                                                                <input type="checkbox" className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 transition-all no-drag relative z-10" checked={editingUser.permissions?.includes(perm.key) || false} onChange={() => togglePermission(perm.key)}/>
                                                                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                                                </span>
                                                            </div>
                                                            <span className="text-xs text-gray-700 font-medium leading-tight">{perm.label}</span>
                                                        </label>))}
                                                </div>))}
                                        </div>
                                    </div>
                                </div>) : (<div className="bg-blue-50 border border-blue-100 rounded-lg p-6 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                                    <div className="bg-blue-100 p-4 rounded-full mb-4">
                                        <svg className="w-12 h-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                                        </svg>
                                    </div>
                                    <h3 className="font-bold text-blue-900 text-lg mb-2">{tr('Full Access', 'دسترسی کامل')}</h3>
                                    <p className="text-blue-700 text-sm">{tr('System admin has full access to all sections and does not need separate permission setup.', 'کاربر با نقش مدیر سیستم به تمامی بخش‌های نرم‌افزار دسترسی کامل دارد و نیازی به تنظیم مجوزهای جداگانه نیست.')}</p>
                                </div>)}
                        </div>
                    </div>
                    
                    <div className="flex justify-end pt-4 border-t gap-3">
                        <button type="button" onClick={() => setShowUserModal(false)} className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition no-drag font-medium">{tr('Cancel', 'انصراف')}</button>
                        <button type="button" onClick={saveUser} disabled={isSaving} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 transition no-drag transform active:scale-95">
                            {isSaving ? tr('Saving...', 'در حال ذخیره...') : tr('Save User', 'ذخیره کاربر')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>);
};
