import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, AppUser, CategoryIconMeta, ControlBootstrapResponse, Customer, DomainAuditEntry, Expense, GuestTrialState, Invoice, Medicine, Partner, Purchase, StockMovement, Supplier, UpdateInstallerProgress, UserProfile } from '../types';
import { matchCategoryIcon } from '../utils/iconMatcher';
import { getTranslation } from '../utils/translations';
import { DEFAULT_SUBSCRIPTION, canUseTeamMode, normalizeOperationMode, sanitizeSubscription } from "../services/localAccessPolicy";
import { UserManagement } from './settings/UserManagement';
import { MaintenanceSettings } from './settings/MaintenanceSettings';
import type { TreasuryScope } from '../services/treasuryLocal';
import { GeneralSettings } from './settings/GeneralSettings';
import { DateTimeSettings } from './settings/DateTimeSettings';
import { InvoiceDesignSettings } from './settings/InvoiceDesignSettings';
import { CategorySettings } from './settings/CategorySettings';
import { PageHeader } from './ui/PageHeader';
import { PageSurface } from './ui/Surface';
interface SettingsProps {
    settings: AppSettings;
    onSaveSettings: (settings: AppSettings) => void;
    onRestoreData: (data: any) => Promise<boolean | void> | boolean | void;
    onManualBackup: () => Promise<void>;
    onManualRestore: () => Promise<void>;
    googleUser: UserProfile | null;
    onLogin: () => void;
    onSystemReset: (options: any) => Promise<boolean | void> | boolean | void;
    invoices: Invoice[];
    medicines: Medicine[];
    customers: Customer[];
    expenses: Expense[];
    suppliers: Supplier[];
    purchases: Purchase[];
    partners: Partner[];
    auditEvents?: DomainAuditEntry[];
    stockMovements?: StockMovement[];
    treasuryTransactions?: any[];
    treasuryCashCounts?: any[];
    activeAppUser?: AppUser | null;
    requestedTab?: SettingsTab | null;
    onRequestedTabApplied?: () => void;
    readOnly?: boolean;
    guestTrialState?: GuestTrialState | null;
    onResetGuestTrial?: () => void;
    onUpgradeGuestToFree?: () => void;
    runtimeVersion?: string;
    controlPlaneState?: ControlBootstrapResponse | null;
    controlPlaneFetchError?: string | null;
    onRefreshUpdates?: () => Promise<void> | void;
    onInstallUpdate?: () => Promise<void> | void;
    onOpenUpdatePrompt?: () => void;
    onOpenMedicineArchive?: () => void;
    /** OA-1 legacy treasury export — passed straight through to MaintenanceSettings. */
    treasuryScope?: TreasuryScope | null;
    canManageLegacyTreasury?: boolean;
    isRefreshingUpdates?: boolean;
    isInstallingUpdate?: boolean;
    updateInstallProgress?: UpdateInstallerProgress | null;
}
const AccessDenied: React.FC<{
    isEnglish: boolean;
}> = ({ isEnglish }) => (<div className="flex h-64 flex-col items-center justify-center text-gray-500">
        <svg className="mb-3 h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        <p className="font-bold">{isEnglish ? 'Access denied' : 'دسترسی رد شد'}</p>
        <p className="text-sm">{isEnglish ? 'You do not have permission to access this section.' : 'شما اجازه دسترسی به این بخش را ندارید.'}</p>
    </div>);
export type SettingsTab = 'general' | 'datetime' | 'updates' | 'ai' | 'design' | 'categories' | 'users' | 'subscription' | 'maintenance' | 'devices';
const COMMUNITY_SETTINGS_TABS: SettingsTab[] = ['general', 'datetime', 'design', 'categories', 'users', 'maintenance'];
const SETTINGS_TAB_META: Record<SettingsTab, {
    titleEn: string;
    titleFa: string;
    subtitleEn: string;
    subtitleFa: string;
    mode: 'form' | 'console';
}> = {
    general: {
        titleEn: 'General Settings',
        titleFa: 'تنظیمات عمومی',
        subtitleEn: 'Business defaults for store profile, sales behavior, currency, invoice rules, and workspace sync.',
        subtitleFa: 'تنظیمات کاری فروشگاه، رفتار فروش، ارز، قواعد فاکتور و همگام‌سازی فضای کاری را از اینجا کنترل کنید.',
        mode: 'form',
    },
    datetime: {
        titleEn: 'Date & Time',
        titleFa: 'تاریخ و زمان',
        subtitleEn: 'Set calendar display per section while keeping stored records stable and sortable.',
        subtitleFa: 'نمایش تقویم هر بخش را تنظیم کنید، در حالی که داده خام پایدار و قابل مرتب‌سازی می‌ماند.',
        mode: 'form',
    },
    updates: {
        titleEn: 'Update Center',
        titleFa: 'مرکز بروزرسانی',
        subtitleEn: 'Operational view of installed version, published release, installer readiness, and service health.',
        subtitleFa: 'وضعیت نسخه نصب‌شده، انتشار جدید، آمادگی نصب و سلامت سرویس را به‌صورت عملیاتی از اینجا ببینید.',
        mode: 'console',
    },
    ai: {
        titleEn: 'AI Router',
        titleFa: 'مسیر هوش مصنوعی',
        subtitleEn: 'Review backend AI health, Neokens text models, Groq vision models, and request limits from one place.',
        subtitleFa: 'سلامت backend هوش مصنوعی، مدل‌های متنی Neokens، مدل‌های بینایی Groq و محدودیت‌های درخواست را از یکجا بررسی کنید.',
        mode: 'form',
    },
    design: {
        titleEn: 'Invoice Design',
        titleFa: 'طراحی فاکتور',
        subtitleEn: 'Adjust branding assets, invoice appearance, and print-ready document details.',
        subtitleFa: 'لوگو، امضا و ظاهر فاکتور را برای نسخه چاپی و سند نهایی تنظیم کنید.',
        mode: 'form',
    },
    categories: {
        titleEn: 'Expense Categories',
        titleFa: 'دسته‌بندی مصارف',
        subtitleEn: 'Control reusable expense categories and keep accounting labels consistent.',
        subtitleFa: 'دسته‌های مصرف را یکدست نگه دارید و برچسب‌های حسابداری را از اینجا مدیریت کنید.',
        mode: 'form',
    },
    users: {
        titleEn: 'Users & Access',
        titleFa: 'کاربران و دسترسی',
        subtitleEn: 'Manage staff accounts, roles, secure access, and permission boundaries.',
        subtitleFa: 'کاربران، نقش‌ها، دسترسی امن و حدود مجوزها را از اینجا کنترل کنید.',
        mode: 'console',
    },
    subscription: {
        titleEn: 'Subscription',
        titleFa: 'اشتراک',
        subtitleEn: 'Review plan status, usage, billing actions, and license recovery in one place.',
        subtitleFa: 'وضعیت پلن، مصرف، عملیات پرداخت و بازیابی لایسنس را یکجا مدیریت کنید.',
        mode: 'form',
    },
    maintenance: {
        titleEn: 'Maintenance',
        titleFa: 'نگهداری',
        subtitleEn: 'Run diagnostics, export logs, back up data, restore safely, and handle recovery actions.',
        subtitleFa: 'تشخیص، لاگ‌ها، پشتیبان‌گیری، بازگردانی و عملیات بازیابی را از اینجا مدیریت کنید.',
        mode: 'console',
    },
    devices: {
        titleEn: 'Device Security',
        titleFa: 'امنیت دستگاه',
        subtitleEn: 'Review trusted devices, current session status, and revoke access when needed.',
        subtitleFa: 'دستگاه‌های معتبر، وضعیت نشست فعلی و لغو اعتماد را از اینجا بررسی کنید.',
        mode: 'console',
    },
};
export const Settings = memo<SettingsProps>(({ settings, onSaveSettings, onRestoreData, onSystemReset, googleUser, activeAppUser, invoices, medicines, customers, expenses, suppliers, purchases, partners, auditEvents = [], stockMovements = [], treasuryTransactions = [], treasuryCashCounts = [], requestedTab, onRequestedTabApplied, readOnly = false, guestTrialState = null, onResetGuestTrial, onUpgradeGuestToFree, runtimeVersion = '1.0.7', controlPlaneState = null, controlPlaneFetchError = null, onRefreshUpdates, onInstallUpdate, onOpenUpdatePrompt, onOpenMedicineArchive, treasuryScope = null, canManageLegacyTreasury = false, isRefreshingUpdates = false, isInstallingUpdate = false, updateInstallProgress = null, }) => {
    const t = getTranslation(settings.language || 'dari');
    const isEnglish = (settings.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const isReadOnly = !!readOnly;
    const showReadOnlyAlert = () => {
        alert(tr('Settings changes are disabled.', 'تغییرات تنظیمات غیرفعال است.'));
    };
    const canManageSettings = !activeAppUser || activeAppUser.role === 'admin' || activeAppUser.permissions.includes('manage_settings');
    const canManageUsers = !activeAppUser || activeAppUser.role === 'admin' || activeAppUser.permissions.includes('manage_users');
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [formData, setFormData] = useState<AppSettings>(settings);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [cloudStatus, setCloudStatus] = useState<'checking' | 'connected' | 'error' | 'disabled'>('checking');
    const [lastServerTime, setLastServerTime] = useState<string | null>(null);
    const [isSyncingManually, setIsSyncingManually] = useState(false);
    const [newCategory, setNewCategory] = useState('');
    const [apiKeyWarning, setApiKeyWarning] = useState('');
    const activeUsers = useMemo(() => (formData.users || []).filter((appUser) => !appUser.isDeleted), [formData.users]);
    const hasActiveAdminWithValidPin = useMemo(() => (activeUsers.some((appUser) => (appUser.role === 'admin' &&
        typeof appUser.pinCode === 'string' &&
        appUser.pinCode.trim().length >= 4))), [activeUsers]);
    const guestDaysRemaining = useMemo(() => {
        if (!guestTrialState?.meta?.expiresAt)
            return 0;
        const diffMs = new Date(guestTrialState.meta.expiresAt).getTime() - Date.now();
        return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    }, [guestTrialState?.meta?.expiresAt]);
    const operationMode = normalizeOperationMode(formData.operationMode);
    const runtimeSubscription = sanitizeSubscription(formData.subscription || DEFAULT_SUBSCRIPTION, googleUser?.email || undefined);
    const canToggleTeamMode = operationMode === 'team' && canUseTeamMode(runtimeSubscription);
    const teamModeHint = canToggleTeamMode
        ? ''
        : operationMode !== 'team'
            ? tr('Team Mode requires Team operation mode in installer/runtime policy.', 'حالت تیمی نیاز به Team mode در سیاست اجرا دارد.')
            : tr('Team Mode is locked. Activate a Team-capable license first.', 'حالت تیمی قفل است. ابتدا لایسنس سازگار را فعال کنید.');
    const secureModeHint = !formData.teamMode && !hasActiveAdminWithValidPin
        ? tr('Create at least one admin user with a valid PIN in Users & Access before enabling secure access.', 'قبل از فعال‌سازی دسترسی امن، در بخش کاربران و دسترسی حداقل یک مدیر با PIN معتبر بسازید.')
        :
            '';
    const availableTabs: Array<{
        id: SettingsTab;
        label: string;
    }> = COMMUNITY_SETTINGS_TABS.map((id) => ({
        id,
        label: tr(SETTINGS_TAB_META[id].titleEn, SETTINGS_TAB_META[id].titleFa),
    }));
    useEffect(() => {
        setFormData(settings);
        setHasUnsavedChanges(false);
    }, [settings]);
    useEffect(() => {
        if (!requestedTab)
            return;
        setActiveTab((COMMUNITY_SETTINGS_TABS.includes(requestedTab) ? requestedTab : 'general'));
        onRequestedTabApplied?.();
    }, [false, requestedTab, onRequestedTabApplied]);
    useEffect(() => {
        const checkCloud = async () => {
            {
                setCloudStatus('disabled');
                return;
            }
        };
        void checkCloud();
    }, [false]);
    const updateFormData = (updater: (prev: AppSettings) => AppSettings) => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        setHasUnsavedChanges(true);
        setFormData((prev) => updater(prev));
    };
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        const { name, value } = e.target;
        setHasUnsavedChanges(true);
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData((prev) => ({
                ...prev,
                [parent]: {
                    ...(prev[parent as keyof AppSettings] as any),
                    [child]: value
                }
            }));
            return;
        }
        if (name === 'taxRate') {
            setFormData((prev) => ({ ...prev, taxRate: Math.max(0, parseFloat(value) || 0) }));
            return;
        }
        if (name === 'maxStaffDiscount') {
            const parsed = parseFloat(value);
            const safe = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
            setFormData((prev) => ({ ...prev, maxStaffDiscount: safe }));
            return;
        }
        if (name === 'googleApiKey') {
            setFormData((prev) => ({ ...prev, googleApiKey: value }));
            if (value.trim().length > 0 && !value.trim().startsWith('AIza')) {
                setApiKeyWarning(tr('Warning: Google API keys usually start with AIza', 'هشدار: کلیدهای Google API معمولاً با AIza شروع می‌شوند.'));
            }
            else {
                setApiKeyWarning('');
            }
            return;
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
    };
    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        const { name, checked } = e.target;
        if (name === 'autoSync') {
            setHasUnsavedChanges(true);
            setFormData((prev) => ({
                ...prev,
                supabase: {
                    ...(prev.supabase || { url: '', key: '', autoSync: true }),
                    autoSync: checked
                }
            }));
            return;
        }
        if (name === 'teamMode') {
            if (checked && !hasActiveAdminWithValidPin) {
                alert(tr('Create at least one admin user with a valid PIN in Users & Access before enabling secure access.', 'قبل از فعال‌سازی دسترسی امن، در بخش کاربران و دسترسی حداقل یک مدیر با PIN معتبر بسازید.'));
                return;
            }
            setHasUnsavedChanges(true);
            setFormData((prev) => ({ ...prev, teamMode: checked }));
            return;
        }
        setHasUnsavedChanges(true);
        setFormData((prev) => ({ ...prev, [name]: checked }));
    };
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logo' | 'signature') => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setHasUnsavedChanges(true);
            setFormData((prev) => ({
                ...prev,
                invoiceDesign: { ...(prev.invoiceDesign || {}), [field]: reader.result as string }
            }));
        };
        reader.readAsDataURL(file);
    };
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e)
            e.preventDefault();
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        setIsSaving(true);
        await onSaveSettings(formData);
        setHasUnsavedChanges(false);
        setIsSaving(false);
    };
    const handleDiscardChanges = () => {
        setFormData(settings);
        setHasUnsavedChanges(false);
    };
    const handleSelectFolder = async () => {
        if (isReadOnly || !window.electronAPI) {
            if (isReadOnly)
                showReadOnlyAlert();
            return;
        }
        const path = await window.electronAPI.selectFolder();
        if (!path)
            return;
        updateFormData((prev) => ({ ...prev, defaultInvoiceSavePath: path }));
    };
    const handleManualSync = async () => {
        return;
    };
    // Fresh formData for async callbacks (the AI fallback resolves up to 4s later).
    const formDataRef = useRef(formData);
    useEffect(() => {
        formDataRef.current = formData;
    }, [formData]);
    // Layer 6 of the icon chain: online AI fallback, fired only after Add
    // (never while typing). The category is registered immediately with the
    // default icon; if a valid answer arrives it updates the row live.
    // Manual picks are sacred and are never overwritten.
    const triggerAiIconFallback = (categoryName: string) => {
        return;
    };
    const handleAddCategory = (manualIcon?: CategoryIconMeta): boolean => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return false;
        }
        const normalized = newCategory.trim();
        if (!normalized)
            return false;
        const current = formData.expenseCategories || [];
        if (current.includes(normalized))
            return false;
        const matched = manualIcon ?? (() => {
            const result = matchCategoryIcon(normalized);
            return { icon: result.icon, color: result.color, source: result.source };
        })();
        updateFormData((prev) => {
            const prevCategories = prev.expenseCategories || [];
            if (prevCategories.includes(normalized))
                return prev;
            return {
                ...prev,
                expenseCategories: [...prevCategories, normalized],
                expenseCategoryIcons: { ...(prev.expenseCategoryIcons || {}), [normalized]: matched }
            };
        });
        setNewCategory('');
        if (matched.source === 'default') {
            triggerAiIconFallback(normalized);
        }
        return true;
    };
    const handleDeleteCategory = (category: string) => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        updateFormData((prev) => {
            const nextIcons = { ...(prev.expenseCategoryIcons || {}) };
            delete nextIcons[category];
            return {
                ...prev,
                expenseCategories: (prev.expenseCategories || []).filter((item) => item !== category),
                expenseCategoryIcons: nextIcons
            };
        });
    };
    const handleSetCategoryIcon = (category: string, meta: CategoryIconMeta) => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        updateFormData((prev) => ({
            ...prev,
            expenseCategoryIcons: { ...(prev.expenseCategoryIcons || {}), [category]: meta }
        }));
    };
    const handleSubComponentSave = async (newSettings: AppSettings) => {
        if (isReadOnly) {
            showReadOnlyAlert();
            return;
        }
        setFormData(newSettings);
        await onSaveSettings(newSettings);
        setHasUnsavedChanges(false);
    };
    const currentTabMeta = SETTINGS_TAB_META[activeTab];
    const currentTabLabel = availableTabs.find((tab) => tab.id === activeTab)?.label || tr('Settings', 'تنظیمات');
    return (<PageSurface className="min-h-full overflow-y-auto p-4 pb-24 md:p-6">
            <PageHeader eyebrow={currentTabMeta.mode === 'form' ? tr('Form settings', 'تنظیمات فرم‌محور') : tr('Admin console', 'کنسول مدیریتی')} title={currentTabLabel} subtitle={activeTab === 'general'
            ? tr('Manage your store, sales, invoices, and local access.', 'فروشگاه، فروش، فاکتورها و دسترسی محلی را تنظیم کنید.')
            : isEnglish ? currentTabMeta.subtitleEn : currentTabMeta.subtitleFa} meta={(<div className="flex flex-wrap gap-2">
                        <span className="wk-status-badge wk-status-badge--neutral">
                            {tr('Mode', 'حالت')}: {currentTabMeta.mode === 'form' ? tr('Form tab', 'تب فرمی') : tr('Console tab', 'تب کنسولی')}
                        </span>
                        <span className="wk-status-badge wk-status-badge--neutral">
                            {tr('Workspace', 'فضای کاری')}: {isReadOnly ? tr('Read only', 'فقط‌خواندنی') : tr('Editable', 'قابل ویرایش')}
                        </span>
                        <span className="wk-status-badge wk-status-badge--neutral">
                            {tr('Active tab', 'تب فعال')}: {currentTabLabel}
                        </span>
                        {hasUnsavedChanges ? (<span className="wk-status-badge wk-status-badge--warning">
                                {tr('Unsaved changes', 'تغییرات ذخیره‌نشده')}
                            </span>) : null}
                    </div>)} tabs={availableTabs.map((tab) => ({
            id: tab.id,
            label: tab.label,
            active: activeTab === tab.id,
            onClick: () => setActiveTab(tab.id),
        }))} className="mb-4"/>
            {false}

            {isReadOnly && true && (<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    {tr('Settings are view-only.', 'تنظیمات فقط قابل مشاهده است.')}
                </div>)}

            <div className="min-h-[400px]">
                {activeTab === 'general' && (canManageSettings ? (<GeneralSettings formData={formData} t={t as Record<string, string>} isGuest={false} cloudStatus={cloudStatus} lastServerTime={lastServerTime} isSyncingManually={isSyncingManually} apiKeyWarning={apiKeyWarning} onChange={handleChange} onCheckboxChange={handleCheckboxChange} onManualSync={handleManualSync} onSelectFolder={handleSelectFolder} onUpdateForm={updateFormData} cloudSyncLocked={true} canToggleTeamMode={(!!formData.teamMode || hasActiveAdminWithValidPin)} teamModeHint={secureModeHint}/>) : <AccessDenied isEnglish={isEnglish}/>)}

                {activeTab === 'datetime' && (canManageSettings || false ? (<DateTimeSettings formData={formData} isReadOnly={isReadOnly || false} onUpdateForm={updateFormData}/>) : <AccessDenied isEnglish={isEnglish}/>)}

                {false}

                {false}

                {activeTab === 'design' && (canManageSettings ? (<InvoiceDesignSettings formData={formData} t={t as Record<string, string>} onUpdateForm={updateFormData} onImageUpload={handleImageUpload} accountEmail={googleUser?.email}/>) : <AccessDenied isEnglish={isEnglish}/>)}

                {activeTab === 'categories' && (canManageSettings ? (<CategorySettings categories={formData.expenseCategories || []} categoryIcons={formData.expenseCategoryIcons} newCategory={newCategory} setNewCategory={setNewCategory} onAddCategory={handleAddCategory} onDeleteCategory={handleDeleteCategory} onSetCategoryIcon={handleSetCategoryIcon} language={settings.language || 'dari'}/>) : <AccessDenied isEnglish={isEnglish}/>)}

                {activeTab === 'users' && (canManageUsers ? <UserManagement settings={formData} onSaveSettings={handleSubComponentSave} activeAppUser={activeAppUser} suppliers={suppliers}/> : <AccessDenied isEnglish={isEnglish}/>)}

                {false}

                {false}

                {activeTab === 'maintenance' && (canManageSettings ? (<MaintenanceSettings onRestoreData={onRestoreData} onSystemReset={onSystemReset} medicines={medicines} customers={customers} invoices={invoices} expenses={expenses} suppliers={suppliers} purchases={purchases} partners={partners} auditEvents={auditEvents} stockMovements={stockMovements} treasuryTransactions={treasuryTransactions} treasuryCashCounts={treasuryCashCounts} settings={formData} onOpenMedicineArchive={onOpenMedicineArchive} treasuryScope={treasuryScope} canManageLegacyTreasury={canManageLegacyTreasury}/>) : <AccessDenied isEnglish={isEnglish}/>)}
            </div>

            {hasUnsavedChanges && !isReadOnly && true && (<div className="fixed bottom-5 left-5 right-5 z-50 md:left-8 md:right-8">
                    <div className="wk-glass-card flex flex-col gap-3 border-slate-900/10 px-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-black text-slate-900">{tr('Unsaved changes', 'تغییرات ذخیره‌نشده')}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-600">
                                {tr('Review the current tab and save when you are ready.', 'تب فعلی را بازبینی کنید و وقتی آماده بودید ذخیره کنید.')}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={handleDiscardChanges} disabled={isSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                            {t.cancel}
                        </button>
                            <button onClick={() => void handleSubmit()} disabled={isSaving} className="rounded-xl bg-brand-600 px-6 py-2 font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-500 disabled:opacity-50">
                            {isSaving ? t.loading : t.save}
                        </button>
                        </div>
                    </div>
                </div>)}
        </PageSurface>);
});
