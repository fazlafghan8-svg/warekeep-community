import * as React from "react";
import { useEffect, useState } from 'react';
import { AppSettings, Currency, InventoryLinkedSyncMode } from '../../types';
import { classNames } from '../../utils/classNames';
import { resolveDefaultSalesMode } from '../../constants/sales';
import { normalizeInventoryLinkedSyncSettings } from '../../utils/inventoryLinkedSync';
import { isManualMedicineEntryAutoScrollEnabled, normalizeMedicineEntryAutomationSettings, readMedicineEntryAutomationLearningState, resetMedicineEntryAutomationLearningState } from '../../utils/medicineEntryAutomation';
import { normalizeMedicineProcurementAssistSettings, readMedicineProcurementAssistLearningState, resetMedicineProcurementAssistLearningState } from '../../utils/medicineProcurementAssist';
import { InlineAlert } from '../ui/InlineAlert';
import { SettingsStat } from './SettingsScaffold';
interface GeneralSettingsProps {
    formData: AppSettings;
    t: Record<string, string>;
    isGuest: boolean;
    cloudStatus: 'checking' | 'connected' | 'error' | 'disabled';
    lastServerTime: string | null;
    isSyncingManually: boolean;
    apiKeyWarning: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    onCheckboxChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onManualSync: () => Promise<void>;
    onSelectFolder: () => Promise<void>;
    onUpdateForm: (updater: (prev: AppSettings) => AppSettings) => void;
    cloudSyncLocked: boolean;
    canToggleTeamMode: boolean;
    teamModeHint: string;
}
const DEFAULT_RATES = {
    AFN: 1,
    USD: 70,
    EUR: 75,
    IRR: 0.001,
    PKR: 0.25,
    INR: 0.85
};
const inputClass = "bg-white/50 rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-brand-500/40 border-none transition-all outline-hidden w-full text-slate-800 text-sm";
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-wide text-slate-500';
const DisclosureChevronIcon: React.FC<{
    expanded?: boolean;
    className?: string;
}> = ({ expanded = false, className = 'h-4 w-4', }) => (<svg className={`${className} transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5"/>
    </svg>);
const FlowOptionsIcon: React.FC<{
    className?: string;
}> = ({ className = 'h-4 w-4' }) => (<svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5h12M6.5 10h7M8.5 14.5h3"/>
        <circle cx="5.5" cy="5.5" r="1.1" fill="currentColor" stroke="none"/>
        <circle cx="13.5" cy="10" r="1.1" fill="currentColor" stroke="none"/>
        <circle cx="10" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>
    </svg>);
interface CompactToggleRowProps {
    title: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}
const CompactToggleRow: React.FC<CompactToggleRowProps> = ({ title, description, checked, disabled, onChange, }) => (<label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
        <span className="min-w-0">
            <span className="block text-sm font-black text-slate-900">{title}</span>
            <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-500">{description}</span>
        </span>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600" disabled={disabled}/>
    </label>);
export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ formData, t, isGuest, cloudStatus, lastServerTime, isSyncingManually, apiKeyWarning, onChange, onCheckboxChange, onManualSync, onSelectFolder, onUpdateForm, cloudSyncLocked, canToggleTeamMode, teamModeHint }) => {
    const isEnglish = (formData.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const [isMedicineEntryAdvancedOpen, setIsMedicineEntryAdvancedOpen] = useState(false);
    const [isProcurementAssistAdvancedOpen, setIsProcurementAssistAdvancedOpen] = useState(false);
    const invoiceNumbering = formData.invoiceNumbering || { type: 'auto' as const, nextNumber: 1001 };
    const baseCurrency = formData.currencySettings?.baseCurrency || 'AFN';
    const storeNameMissing = !(formData.storeName || '').trim();
    const phoneDigits = String(formData.storePhone || '').replace(/\D/g, '');
    const phoneLooksShort = Boolean(phoneDigits) && phoneDigits.length < 8;
    const medicineEntryAutomation = normalizeMedicineEntryAutomationSettings(formData.medicineEntryAutomation);
    const medicineProcurementAssist = normalizeMedicineProcurementAssistSettings(formData.medicineProcurementAssist);
    const inventoryLinkedSync = normalizeInventoryLinkedSyncSettings(formData.inventoryLinkedSyncSettings);
    const [medicineEntryAutomationLearning, setMedicineEntryAutomationLearning] = useState(() => readMedicineEntryAutomationLearningState(medicineEntryAutomation.adaptiveThreshold));
    const [medicineProcurementAssistLearning, setMedicineProcurementAssistLearning] = useState(() => readMedicineProcurementAssistLearningState(medicineProcurementAssist.adaptiveThreshold));
    const cloudStatusConfig: Record<typeof cloudStatus, {
        label: string;
        chip: string;
    }> = {
        checking: {
            label: tr('Checking', 'در حال بررسی'),
            chip: 'bg-slate-100 text-slate-700'
        },
        connected: {
            label: tr('Connected', 'متصل'),
            chip: 'bg-emerald-100 text-emerald-700'
        },
        error: {
            label: tr('Disconnected', 'قطع ارتباط'),
            chip: 'bg-rose-100 text-rose-700'
        },
        disabled: {
            label: tr('Guest Mode', 'حالت مهمان'),
            chip: 'bg-amber-100 text-amber-700'
        }
    };
    const setInvoiceType = (type: 'auto' | 'manual') => {
        onUpdateForm((prev) => ({
            ...prev,
            invoiceNumbering: {
                type,
                nextNumber: prev.invoiceNumbering?.nextNumber || 1001
            }
        }));
    };
    const setNextInvoiceNumber = (nextNumber: number) => {
        onUpdateForm((prev) => ({
            ...prev,
            invoiceNumbering: {
                type: prev.invoiceNumbering?.type || 'auto',
                nextNumber: Math.max(1, Math.floor(nextNumber || 1001))
            }
        }));
    };
    const setBaseCurrency = (currency: Currency) => {
        onUpdateForm((prev) => ({
            ...prev,
            currencySettings: {
                ...(prev.currencySettings || {
                    rates: { ...DEFAULT_RATES }
                }),
                baseCurrency: currency
            }
        }));
    };
    useEffect(() => {
        setMedicineEntryAutomationLearning(readMedicineEntryAutomationLearningState(medicineEntryAutomation.adaptiveThreshold));
    }, [medicineEntryAutomation.adaptiveThreshold]);
    const isManualAutoScrollEnabled = isManualMedicineEntryAutoScrollEnabled(medicineEntryAutomation, medicineEntryAutomationLearning);
    useEffect(() => {
        setMedicineProcurementAssistLearning(readMedicineProcurementAssistLearningState(medicineProcurementAssist.adaptiveThreshold));
    }, [medicineProcurementAssist.adaptiveThreshold]);
    const updateMedicineEntryAutomation = (patch: Partial<typeof medicineEntryAutomation>) => {
        onUpdateForm((prev) => ({
            ...prev,
            medicineEntryAutomation: {
                ...normalizeMedicineEntryAutomationSettings(prev.medicineEntryAutomation),
                ...patch,
            },
        }));
    };
    const handleResetMedicineEntryAutomationLearning = () => {
        setMedicineEntryAutomationLearning(resetMedicineEntryAutomationLearningState());
    };
    const updateMedicineProcurementAssist = (patch: Partial<typeof medicineProcurementAssist>) => {
        onUpdateForm((prev) => ({
            ...prev,
            medicineProcurementAssist: {
                ...normalizeMedicineProcurementAssistSettings(prev.medicineProcurementAssist),
                ...patch,
            },
        }));
    };
    const handleResetMedicineProcurementAssistLearning = () => {
        setMedicineProcurementAssistLearning(resetMedicineProcurementAssistLearningState());
    };
    const updateInventoryLinkedSync = (patch: Partial<Omit<typeof inventoryLinkedSync, 'targets'>> & {
        targets?: Partial<typeof inventoryLinkedSync.targets>;
    }) => {
        onUpdateForm((prev) => ({
            ...prev,
            inventoryLinkedSyncSettings: {
                ...normalizeInventoryLinkedSyncSettings(prev.inventoryLinkedSyncSettings),
                ...patch,
                targets: {
                    ...normalizeInventoryLinkedSyncSettings(prev.inventoryLinkedSyncSettings).targets,
                    ...(patch.targets || {}),
                },
            },
        }));
    };
    return (<div className="space-y-3.5 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SettingsStat label={tr('Store', 'فروشگاه')} value={formData.storeName || tr('Not set', 'تنظیم نشده')} hint={formData.storePhone ? <span dir="ltr" className="tabular-nums">{formData.storePhone}</span> : tr('Phone missing', 'شماره ثبت نشده')} tone={storeNameMissing ? 'warning' : 'brand'}/>
                <div className="bg-white/50 backdrop-blur-sm border border-white/60 shadow-[0_2px_8px_rgb(0,0,0,0.02)] rounded-[1.5rem] p-5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block">{tr('Base Currency', 'ارز پایه')}</span>
                    <span className="text-xl font-black text-slate-800">{baseCurrency}</span>
                </div>
                <SettingsStat label={tr('Tax', 'مالیات')} value={<span className="tabular-nums">{formData.taxRate ?? 0}%</span>} hint={tr('Default invoice tax', 'مالیات پیش‌فرض فاکتور')}/>
                <SettingsStat label={tr('Invoice Rules', 'قواعد فاکتور')} value={invoiceNumbering.type === 'auto' ? tr('Automatic', 'خودکار') : tr('Manual', 'دستی')} hint={<span className="tabular-nums">{tr('Next', 'بعدی')}: {invoiceNumbering.nextNumber || 1001}</span>}/>
                {false}
            </div>

            {storeNameMissing ? (<InlineAlert tone="warning" title={tr('Store profile is incomplete', 'مشخصات فروشگاه کامل نیست')}>
                    {tr('Set the store name before relying on printed invoices and shared business settings.', 'پیش از استفاده از فاکتور چاپی و تنظیمات کاری مشترک، نام فروشگاه را ثبت کنید.')}
                </InlineAlert>) : null}

            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-12">
                <div className="space-y-3.5 xl:col-span-7">
                    <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6 col-span-1 xl:col-span-2">
    <div>
        <span className="mb-2 block text-[11px] font-black uppercase text-slate-400">{tr('Business identity', 'هویت کسب‌وکار')}</span>
        <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">{tr('Store Profile', 'مشخصات فروشگاه')}</h3>
        <></>
    </div>
    <div className="mt-4">
                        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <label className={labelClass}>{t.storeName}</label>
                                <input type="text" name="storeName" value={formData.storeName || ''} onChange={onChange} className={inputClass} disabled={isGuest}/>
                                <></>
                            </div>
                            <div>
                                <label className={labelClass}>{t.phoneNumber || tr('Phone', 'شماره تماس')}</label>
                                <input type="text" inputMode="tel" name="storePhone" value={formData.storePhone || ''} onChange={onChange} className={`${inputClass} wk-input--ltr font-mono`} dir="ltr" disabled={isGuest}/>
                                <></>
                            </div>
                            <div>
                                <label className={labelClass}>{t.language}</label>
                                <select name="language" value={formData.language || 'dari'} onChange={onChange} className={inputClass} disabled={isGuest}>
                                    <option value="dari">Dari</option>
                                    <option value="english">English</option>
                                </select>
                                </div>
                            <div>
                                <label className={labelClass}>{tr('Dashboard Numbers', 'نمایش اعداد در داشبورد')}</label>
                                <select name="numberDisplayMode" value={formData.numberDisplayMode || 'full'} onChange={onChange} className={inputClass}>
                                    <option value="full">{tr('Full numbers (16,431)', 'اعداد کامل (۱۶,۴۳۱)')}</option>
                                    <option value="compact">{tr('Compact (16.4K)', 'اعداد مختصر (۱۶.۴K)')}</option>
                                </select>
                                </div>
                            <div className="md:col-span-2">
                                <label className={labelClass}>{tr('Address', 'آدرس')}</label>
                                <textarea name="storeAddress" value={formData.storeAddress || ''} onChange={onChange} className={`${inputClass} min-h-[96px]`} disabled={isGuest}/>
                                </div>
                        </div>
                        </div>
    </div>

                    <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6 col-span-1 xl:col-span-2">
    <div>
        <span className="mb-2 block text-[11px] font-black uppercase text-slate-400">{tr('Operational defaults', 'پیش‌فرض‌های عملیاتی')}</span>
        <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">{tr('Sales Defaults', 'پیش‌فرض‌های فروش')}</h3>
        <></>
    </div>
    <div className="mt-4">
                        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                            <div>
                                <label className={labelClass}>{tr('Default Sales Mode', 'حالت پیش‌فرض فروش')}</label>
                                <select name="defaultSalesMode" value={resolveDefaultSalesMode(formData)} onChange={onChange} className={inputClass} disabled={isGuest}>
                                    <option value="retail">{t.retail}</option>
                                    <option value="wholesale">{t.wholesale}</option>
                                    <option value="bulk">{t.bulk}</option>
                                </select>
                                </div>
                            {false}
                            <div className="md:col-span-2 rounded-2xl border border-brand-100 bg-brand-50/50 p-3.5 shadow-sm">
                                <div className="flex flex-col gap-3 border-b border-brand-100/80 pb-3 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                        <label className={labelClass}>{tr('Inventory linked sync', 'هماهنگی انبار با خرید و شراکت')}</label>
                                        <p className="text-xs font-semibold leading-5 text-slate-600">
                                            {tr('Control whether inventory edits update linked purchases and partner accounting.', 'کنترل کنید که ویرایش‌های انبار، خریدهای مرتبط و حساب شراکت را تغییر بدهد یا خیر.')}
                                        </p>
                                    </div>
                                    <span className="inline-flex rounded-full border border-brand-200 bg-white px-3 py-1 text-[11px] font-black text-brand-700">
                                        {inventoryLinkedSync.mode === 'ask'
            ? tr('Ask each time', 'هر بار سوال شود')
            : inventoryLinkedSync.mode === 'always'
                ? tr('Automatic', 'خودکار')
                : tr('Inventory only', 'فقط انبار')}
                                    </span>
                                </div>

                                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <label className="block md:col-span-1">
                                        <span className="block text-xs font-black tracking-[0.08em] text-slate-500">
                                            {tr('Sync behavior', 'رفتار هماهنگی')}
                                        </span>
                                        <select value={inventoryLinkedSync.mode} onChange={(e) => updateInventoryLinkedSync({ mode: e.target.value as InventoryLinkedSyncMode })} className={`${inputClass} mt-2`} disabled={isGuest} data-testid="general-settings-inventory-sync-mode">
                                            <option value="ask">{tr('Always ask me', 'همیشه از من بپرس')}</option>
                                            <option value="always">{tr('Always sync automatically', 'همیشه خودکار هماهنگ کن')}</option>
                                            <option value="never">{tr('Never sync automatically', 'هیچ‌گاه هماهنگ نکن')}</option>
                                        </select>
                                    </label>
                                    <CompactToggleRow title={tr('Purchases & procurement', 'خرید و تدارکات')} description={tr('Update linked purchase lines, receipts, prices, quantity, batch, and supplier records.', 'ردیف خرید، رسید، قیمت، تعداد، batch و حساب تأمین‌کننده مرتبط به‌روز شود.')} checked={inventoryLinkedSync.targets.purchases} onChange={(checked) => updateInventoryLinkedSync({ targets: { purchases: checked } })} disabled={isGuest || inventoryLinkedSync.mode === 'never'}/>
                                    <CompactToggleRow title={tr('Partnership accounting', 'حساب شراکت')} description={tr('Update partner ownership and agreed partner value fields used by partner reports.', 'فیلدهای مالکیت شریک و ارزش توافقی که در گزارش شراکت استفاده می‌شود به‌روز شود.')} checked={inventoryLinkedSync.targets.partnerships} onChange={(checked) => updateInventoryLinkedSync({ targets: { partnerships: checked } })} disabled={isGuest || inventoryLinkedSync.mode === 'never'}/>
                                </div>
                            </div>
                            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 shadow-sm">
                                <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-3 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                        <label className={labelClass}>{tr('Add Medicine flow', 'جریان افزودن دوا')}</label>
                                        <></>
                                    </div>
                                    {medicineEntryAutomationLearning.learnedAutoScroll ? (<span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-black text-brand-700" data-testid="general-settings-medicine-entry-learned-badge">
                                            {tr('Learned on this device', 'یادگرفته‌شده روی این دستگاه')}
                                        </span>) : null}
                                </div>

                                <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                                    <CompactToggleRow title={tr('Manual auto-scroll', 'اسکرول خودکار دستی')} description={tr('Move down after typing starts in Brand Name.', 'بعد از شروع تایپ در نام تجارتی، پایین برود.')} checked={isManualAutoScrollEnabled} onChange={(checked) => updateMedicineEntryAutomation({
            enabled: checked,
            manualScrollUserConfigured: true
        })} disabled={isGuest}/>
                                    {false}
                                </div>

                                <div className="mt-3">
                                    <button type="button" aria-expanded={isMedicineEntryAdvancedOpen} aria-controls="general-settings-medicine-entry-advanced-panel" onClick={() => setIsMedicineEntryAdvancedOpen((prev) => !prev)} className={classNames('wk-inventory-command-trigger w-full', isMedicineEntryAdvancedOpen && 'wk-inventory-command-trigger--active', medicineEntryAutomationLearning.learnedAutoScroll && 'wk-inventory-command-trigger--learned')} data-testid="general-settings-medicine-entry-advanced-trigger">
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <span className="wk-inventory-command-trigger-icon" aria-hidden="true">
                                                <FlowOptionsIcon />
                                            </span>
                                            <span className="min-w-0 text-start">
                                                <span className="block truncate text-sm font-black text-slate-900">
                                                    {tr('Advanced flow options', 'تنظیمات پیشرفته جریان')}
                                                </span>
                                                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                                                    {tr('Trigger mode, learning, and local reset.', 'محرک، یادگیری، و ریست محلی.')}
                                                </span>
                                            </span>
                                        </span>
                                        <DisclosureChevronIcon className="h-4 w-4 shrink-0" expanded={isMedicineEntryAdvancedOpen}/>
                                    </button>

                                    <div id="general-settings-medicine-entry-advanced-panel" data-testid="general-settings-medicine-entry-advanced-panel" data-open={isMedicineEntryAdvancedOpen ? 'true' : 'false'} aria-hidden={!isMedicineEntryAdvancedOpen} hidden={!isMedicineEntryAdvancedOpen} className="wk-inventory-disclosure-panel mt-2.5">
                                        <div className="wk-inventory-disclosure-panel-inner">
                                            <div className="rounded-2xl border border-slate-200 bg-white/92 p-3.5 shadow-sm">
                                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                    <label className="block">
                                                        <span className="block text-xs font-black tracking-[0.08em] text-slate-500">
                                                            {tr('Manual scroll trigger', 'محرک اسکرول دستی')}
                                                        </span>
                                                        <select value={medicineEntryAutomation.trigger} onChange={(e) => updateMedicineEntryAutomation({ trigger: e.target.value as typeof medicineEntryAutomation.trigger })} className={`${inputClass} mt-2`} disabled={isGuest}>
                                                            <option value="typing">{tr('After typing starts', 'بعد از شروع تایپ')}</option>
                                                            <option value="focus">{tr('When field gets focus', 'وقتی فیلد فوکوس می‌گیرد')}</option>
                                                            <option value="blur">{tr('When field loses focus', 'وقتی از فیلد خارج می‌شود')}</option>
                                                        </select>
                                                    </label>

                                                    <CompactToggleRow title={tr('Learn from repeated scrolling', 'یادگیری از اسکرول تکراری')} description={tr('Adapt after repeated manual downward scrolling on this device.', 'بعد از اسکرول‌های دستی تکراری روی همین دستگاه سازگار می‌شود.')} checked={medicineEntryAutomation.adaptiveLearning} onChange={(checked) => updateMedicineEntryAutomation({ adaptiveLearning: checked })} disabled={isGuest}/>
                                                </div>

                                                <div className="mt-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-3.5 py-3 text-xs font-semibold text-slate-700" data-testid="general-settings-medicine-entry-learning-note">
                                                    <span className="font-black text-brand-700">{tr('Learned on this device', 'یادگرفته‌شده روی این دستگاه')}:</span>{' '}
                                                    {medicineEntryAutomationLearning.learnedAutoScroll
            ? tr('Active', 'فعال')
            : tr('Not learned yet', 'هنوز یاد نگرفته است')}
                                                    {' • '}
                                                    {tr('Manual downward scrolls', 'اسکرول‌های دستی رو به پایین')}: {medicineEntryAutomationLearning.manualScrollCount}
                                                </div>

                                                <div className="mt-3 flex justify-end">
                                                    <button type="button" onClick={handleResetMedicineEntryAutomationLearning} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-brand-200 hover:text-brand-700" data-testid="general-settings-reset-medicine-entry-learning">
                                                        {tr('Reset learned behavior', 'پاک‌کردن رفتار یادگرفته‌شده')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 border-t border-slate-200/80 pt-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0">
                                                <label className={labelClass}>{tr('Supplier procurement assist', 'دستیار ثبت خرید تأمین‌کننده')}</label>
                                                <></>
                                            </div>
                                            {medicineProcurementAssistLearning.learnedDefaultEnabled ? (<span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-black text-brand-700" data-testid="general-settings-procurement-assist-learned-badge">
                                                    {tr('Learned on this device', 'یادگرفته‌شده روی این دستگاه')}
                                                </span>) : null}
                                        </div>

                                        <div className="mt-3">
                                            <CompactToggleRow title={tr('Enable learned draft default', 'فعال‌سازی پیش‌فرض یادگرفته‌شده')} description={tr('When learned, Add Medicine may pre-check the supplier procurement toggle.', 'وقتی یاد گرفته شد، افزودن دوا می‌تواند گزینه خرید تأمین‌کننده را از قبل فعال کند.')} checked={medicineProcurementAssist.enabled} onChange={(checked) => updateMedicineProcurementAssist({ enabled: checked })} disabled={isGuest}/>
                                        </div>

                                        <div className="mt-3">
                                            <button type="button" aria-expanded={isProcurementAssistAdvancedOpen} aria-controls="general-settings-procurement-assist-advanced-panel" onClick={() => setIsProcurementAssistAdvancedOpen((prev) => !prev)} className={classNames('wk-inventory-command-trigger w-full', isProcurementAssistAdvancedOpen && 'wk-inventory-command-trigger--active', medicineProcurementAssistLearning.learnedDefaultEnabled && 'wk-inventory-command-trigger--learned')} data-testid="general-settings-procurement-assist-advanced-trigger">
                                                <span className="flex min-w-0 items-center gap-2.5">
                                                    <span className="wk-inventory-command-trigger-icon" aria-hidden="true">
                                                        <FlowOptionsIcon />
                                                    </span>
                                                    <span className="min-w-0 text-start">
                                                        <span className="block truncate text-sm font-black text-slate-900">
                                                            {tr('Procurement assist options', 'تنظیمات دستیار خرید')}
                                                        </span>
                                                        <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                                                            {tr('Learning, local default, and reset.', 'یادگیری، پیش‌فرض محلی، و ریست.')}
                                                        </span>
                                                    </span>
                                                </span>
                                                <DisclosureChevronIcon className="h-4 w-4 shrink-0" expanded={isProcurementAssistAdvancedOpen}/>
                                            </button>

                                            <div id="general-settings-procurement-assist-advanced-panel" data-testid="general-settings-procurement-assist-advanced-panel" data-open={isProcurementAssistAdvancedOpen ? 'true' : 'false'} aria-hidden={!isProcurementAssistAdvancedOpen} hidden={!isProcurementAssistAdvancedOpen} className="wk-inventory-disclosure-panel mt-2.5">
                                                <div className="wk-inventory-disclosure-panel-inner">
                                                    <div className="rounded-2xl border border-slate-200 bg-white/92 p-3.5 shadow-sm">
                                                        <CompactToggleRow title={tr('Learn from repeated procurement toggles', 'یادگیری از تیک‌های تکراری خرید')} description={tr('Count repeated manual enable actions on this device and turn them into a remembered default.', 'روشن‌کردن‌های تکراری دستی را روی همین دستگاه می‌شمارد و آن‌ها را به یک پیش‌فرض یادگرفته‌شده تبدیل می‌کند.')} checked={medicineProcurementAssist.adaptiveLearning} onChange={(checked) => updateMedicineProcurementAssist({ adaptiveLearning: checked })} disabled={isGuest}/>

                                                        <div className="mt-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-3.5 py-3 text-xs font-semibold text-slate-700" data-testid="general-settings-procurement-assist-learning-note">
                                                            <span className="font-black text-brand-700">{tr('Learned on this device', 'یادگرفته‌شده روی این دستگاه')}:</span>{' '}
                                                            {medicineProcurementAssistLearning.learnedDefaultEnabled
            ? tr('Active', 'فعال')
            : tr('Not learned yet', 'هنوز یاد نگرفته است')}
                                                            {' • '}
                                                            {tr('Manual enable count', 'تعداد روشن‌کردن دستی')}: {medicineProcurementAssistLearning.manualEnableCount}
                                                        </div>

                                                        <div className="mt-3 flex justify-end">
                                                            <button type="button" onClick={handleResetMedicineProcurementAssistLearning} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-brand-200 hover:text-brand-700" data-testid="general-settings-reset-procurement-assist-learning">
                                                                {tr('Reset learned behavior', 'پاک‌کردن رفتار یادگرفته‌شده')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
    </div>

                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                        <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6 col-span-1 xl:col-span-2">
    <div>
        <span className="mb-2 block text-[11px] font-black uppercase text-slate-400">{tr('Accounting defaults', 'پیش‌فرض‌های حسابداری')}</span>
        <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">{tr('Currency & Tax', 'ارز و مالیات')}</h3>
        <></>
    </div>
    <div className="mt-4">
                            <div className="space-y-4">
                                <div>
                                    <label className={labelClass}>{t.currencySettings || tr('Currency', 'ارز')}</label>
                                    <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value as Currency)} className={inputClass} disabled={isGuest}>
                                        <option value="AFN">AFN</option>
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="IRR">IRR</option>
                                        <option value="PKR">PKR</option>
                                        <option value="INR">INR</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>{t.tax} (%)</label>
                                    <input type="number" min={0} name="taxRate" value={formData.taxRate ?? 0} onChange={onChange} className={`${inputClass} wk-input--ltr`} disabled={isGuest}/>
                                    </div>
                            </div>
                            </div>
    </div>

                        <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6 col-span-1 xl:col-span-2">
    <div>
        <span className="mb-2 block text-[11px] font-black uppercase text-slate-400">{tr('Invoice control', 'کنترل فاکتور')}</span>
        <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">{tr('Invoice Rules', 'قواعد فاکتور')}</h3>
        <></>
    </div>
    <div className="mt-4">
                            <div className="space-y-4">
                                <div>
                                    <label className={labelClass}>{t.invoiceNumbering || tr('Invoice Numbering', 'شماره‌دهی فاکتور')}</label>
                                    <select value={invoiceNumbering.type} onChange={(e) => setInvoiceType(e.target.value as 'auto' | 'manual')} className={inputClass} disabled={isGuest}>
                                        <option value="auto">{t.autoIncrement || tr('Auto', 'خودکار')}</option>
                                        <option value="manual">{t.manualEntry || tr('Manual', 'دستی')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>{t.nextInvoiceNumber || tr('Next Number', 'شماره بعدی')}</label>
                                    <input type="number" min={1} value={invoiceNumbering.nextNumber || 1001} onChange={(e) => setNextInvoiceNumber(Number(e.target.value))} className={`${inputClass} wk-input--ltr`} disabled={isGuest || invoiceNumbering.type !== 'auto'}/>
                                    <></>
                                </div>
                            </div>
                            </div>
    </div>
                    </div>
                </div>

                <div className="space-y-3.5 xl:col-span-5">
                    {false}

                    <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6 col-span-1 xl:col-span-2">
    <div>
        <span className="mb-2 block text-[11px] font-black uppercase text-slate-400">{tr('Local security', 'امنیت محلی')}</span>
        <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">{tr('Secure Local Access', 'دسترسی امن محلی')}</h3>
        <></>
    </div>
    <div className="mt-4">
                        {!isGuest ? (<div className="space-y-3">
                                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div>
                                        <></>
                                        </div>
                                    <label className="inline-flex items-center cursor-pointer">
                                        <input type="checkbox" name="teamMode" checked={formData.teamMode || false} onChange={onCheckboxChange} disabled={!canToggleTeamMode && !(formData.teamMode || false)} className="sr-only peer"/>
                                        <span className="relative h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-focus:ring-2 peer-focus:ring-brand-300 peer-checked:bg-brand-500 peer-checked:after:translate-x-5"/>
                                    </label>
                                </div>
                                {teamModeHint ? (<InlineAlert tone="warning" title={tr('Secure mode is limited', 'حالت امن محدود است')}>
                                        {teamModeHint}
                                    </InlineAlert>) : null}
                            </div>) : (<InlineAlert tone="info" title={tr('Guest workspaces stay local', 'فضاهای مهمان محلی می‌مانند')}>
                                {tr('Guest mode does not support secure multi-user staff access.', 'در حالت مهمان، دسترسی چندکاربره امن برای پرسنل فعال نیست.')}
                            </InlineAlert>)}
                        </div>
    </div>

                    <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6 col-span-1 xl:col-span-2">
    <div>
        <span className="mb-2 block text-[11px] font-black uppercase text-slate-400">{tr('Local files', 'فایل‌های محلی')}</span>
        <></>
    </div>
    <div className="mt-4">
                        <div className="space-y-4">
                            {false}
                            <div>
                                <label className={labelClass}>{tr('Default Invoice Save Path', 'مسیر پیش‌فرض ذخیره فاکتور')}</label>
                                <div className="flex gap-2">
                                    <input type="text" value={formData.defaultInvoiceSavePath || ''} readOnly className={`${inputClass} wk-input--ltr bg-slate-50 text-xs text-slate-500`} placeholder={tr('No path selected', 'مسیر انتخاب نشده')} dir="ltr"/>
                                    <button type="button" onClick={onSelectFolder} disabled={isGuest} className="whitespace-nowrap rounded-xl bg-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50">
                                        {tr('Browse', 'انتخاب')}
                                    </button>
                                </div>
                            </div>
                        </div>
                        </div>
    </div>
                </div>
            </div>
        </div>);
};
