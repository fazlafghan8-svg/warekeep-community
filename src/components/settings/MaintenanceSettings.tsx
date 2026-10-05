import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportData, importData } from '../../services/storageService';
import { clearWebLogs, exportWebLogs, getWebLogStats } from '../../services/webLogService';
import { DEFAULT_SUBSCRIPTION, canUseHybridMode, canUseTeamMode, normalizeOperationMode, sanitizeSubscription } from "../../services/localAccessPolicy";
import { Modal } from '../ui/Modal';
import { InlineAlert } from '../ui/InlineAlert';
import { dataIntegrityAuditToCsv, DataIntegrityAuditReport, runDataIntegrityAudit } from '../../utils/dataIntegrityAudit';
import { buildLegacyTreasuryExport, canPurgeLegacyTreasury, confirmLegacyTreasuryImported, getLegacyTreasuryPurgeStage, markLegacyTreasuryExported, purgeLegacyTreasuryBlob, readLegacyTreasuryBlob, summarizeLegacyTreasuryBlob, type LegacyTreasuryPurgeStage, type TreasuryScope } from '../../services/treasuryLocal';
interface MaintenanceSettingsProps {
    onRestoreData: (data: any) => Promise<boolean | void> | boolean | void;
    onSystemReset: (options: any) => Promise<boolean | void> | boolean | void;
    /**
     * OA-1. Identifies who/which device is exporting the legacy treasury blob. Absent for a session
     * with no signed-in user, which is exactly when the export card must not be offered.
     */
    treasuryScope?: TreasuryScope | null;
    /** Owner-only. The card is hidden outright for anyone else. */
    canManageLegacyTreasury?: boolean;
    medicines: any[];
    customers: any[];
    invoices: any[];
    expenses?: any[];
    suppliers?: any[];
    purchases?: any[];
    partners?: any[];
    auditEvents?: any[];
    stockMovements?: any[];
    treasuryTransactions?: any[];
    treasuryCashCounts?: any[];
    settings: any;
    onOpenMedicineArchive?: () => void;
}
export const MaintenanceSettings: React.FC<MaintenanceSettingsProps> = ({ onRestoreData, onSystemReset, treasuryScope = null, canManageLegacyTreasury = false, medicines, customers, invoices, expenses = [], suppliers = [], purchases = [], partners = [], auditEvents = [], stockMovements = [], treasuryTransactions = [], treasuryCashCounts = [], settings, onOpenMedicineArchive }) => {
    const isEnglish = (settings?.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const formatNumber = (value: number) => Math.round(value).toLocaleString(isEnglish ? 'en-US' : 'fa-AF');
    const activeMedicineCount = medicines.filter((medicine) => !medicine?.isDeleted).length;
    const archivedMedicineCount = medicines.filter((medicine) => medicine?.isDeleted).length;
    type CloudDbStatus = 'checking' | 'online' | 'offline' | 'auth_error' | 'error';
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');
    const [resetOptions, setResetOptions] = useState({
        medicines: false,
        customers: false,
        invoices: false,
        settings: false,
        expenses: false,
        partners: false,
        suppliers: false,
        purchases: false,
        auditEvents: false,
        stockMovements: false,
        treasury: false,
        clearTransactionsOnly: false
    });
    const [integrityAudit, setIntegrityAudit] = useState<DataIntegrityAuditReport | null>(null);
    const [webLogStats, setWebLogStats] = useState<{
        count: number;
        lastTs: string | null;
        sessionId: string;
    } | null>(null);
    const runtimeMode = normalizeOperationMode(settings?.operationMode);
    const runtimeSubscription = sanitizeSubscription(settings?.subscription || DEFAULT_SUBSCRIPTION);
    const runtimeCloudAllowed = runtimeMode === 'team'
        ? canUseTeamMode(runtimeSubscription)
        : runtimeMode === 'hybrid'
            ? canUseHybridMode(runtimeSubscription)
            : false;
    useEffect(() => {
        if (!window.electronAPI)
            setWebLogStats(getWebLogStats());
        const timer = setInterval(() => {
            if (!window.electronAPI)
                setWebLogStats(getWebLogStats());
        }, 3000);
        return () => clearInterval(timer);
    }, []);
    const handleExport = () => {
        exportData({ medicines, customers, invoices, expenses, suppliers, purchases, partners, auditEvents, stockMovements, treasuryTransactions, treasuryCashCounts, settings });
    };
    const downloadTextFile = (contents: string, fileName: string, mimeType: string) => {
        const blob = new Blob([contents], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        if (document.body.contains(link))
            document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    const handleRunIntegrityAudit = () => {
        const report = runDataIntegrityAudit({ medicines, customers, invoices, suppliers, purchases, stockMovements });
        setIntegrityAudit(report);
        const summary = report.summary;
        alert(tr(`Integrity audit completed: ${summary.critical} critical, ${summary.warning} warning.`, `بررسی یکپارچگی تکمیل شد: ${summary.critical} مورد بحرانی، ${summary.warning} هشدار.`));
    };
    // ── OA-1: legacy treasury export / import-confirm / purge ───────────────────────────────────
    //
    // Reads the LEGACY unscoped keys directly and always — that is the entire point of this card, and
    // why it keeps working after the records have been adopted into an account (the blob may still be
    // the only copy of rows that predate adoption, and the server-side import consumes THIS file).
    //
    // The three buttons are the per-device state machine, in order. Purge is the last one and is the
    // only destructive act in the card; it stays disabled until this device has both exported and had
    // that export confirmed as imported, because a device whose ledger was never exported has nowhere
    // else for that money to exist.
    const [legacyTreasuryStage, setLegacyTreasuryStage] = useState<LegacyTreasuryPurgeStage>(() => getLegacyTreasuryPurgeStage());
    const legacyTreasurySummary = useMemo(() => summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()), [legacyTreasuryStage]);
    const hasLegacyTreasury = legacyTreasurySummary.transactionCount > 0 || legacyTreasurySummary.cashCountCount > 0;
    const handleExportLegacyTreasury = () => {
        if (!treasuryScope)
            return;
        const payload = buildLegacyTreasuryExport(treasuryScope);
        const dateStr = new Date().toISOString().split('T')[0];
        downloadTextFile(JSON.stringify(payload, null, 2), `WareKeep_Treasury_OA1_${dateStr}.json`, 'application/json');
        markLegacyTreasuryExported(treasuryScope, legacyTreasurySummary);
        setLegacyTreasuryStage(getLegacyTreasuryPurgeStage());
    };
    const handleConfirmLegacyTreasuryImported = () => {
        if (!treasuryScope)
            return;
        if (!window.confirm(tr('Confirm ONLY if the exported file has been imported into the server and verified. This unlocks deleting the old device copy.', 'فقط در صورتی تأیید کنید که فایل صادرشده در سرور وارد و بررسی شده باشد. این کار امکان حذف نسخه قدیمی دستگاه را باز می‌کند.')))
            return;
        confirmLegacyTreasuryImported(treasuryScope);
        setLegacyTreasuryStage(getLegacyTreasuryPurgeStage());
    };
    const handlePurgeLegacyTreasury = () => {
        if (!window.confirm(tr('Permanently delete the old device treasury copy? This cannot be undone.', 'نسخه قدیمی خزانه در این دستگاه برای همیشه حذف شود؟ این کار قابل بازگشت نیست.')))
            return;
        const result = purgeLegacyTreasuryBlob();
        setLegacyTreasuryStage(getLegacyTreasuryPurgeStage());
        if (!result.purged) {
            alert(tr(`Deletion refused: ${result.reason}`, `حذف انجام نشد: ${result.reason}`));
        }
    };
    const handleExportIntegrityAuditJson = () => {
        if (!integrityAudit)
            return;
        const dateStr = new Date().toISOString().split('T')[0];
        downloadTextFile(JSON.stringify(integrityAudit, null, 2), `WareKeep_Integrity_Audit_${dateStr}.json`, 'application/json');
    };
    const handleExportIntegrityAuditCsv = () => {
        if (!integrityAudit)
            return;
        const dateStr = new Date().toISOString().split('T')[0];
        downloadTextFile(dataIntegrityAuditToCsv(integrityAudit), `WareKeep_Integrity_Audit_${dateStr}.csv`, 'text/csv;charset=utf-8');
    };
    const handleExportLogs = async () => {
        if (window.electronAPI?.exportLogs) {
            const result = await window.electronAPI.exportLogs();
            if (result.success && result.filePath) {
                alert(`${tr('Logs exported to', 'لاگ‌ها صادر شد به')}:\n${result.filePath}`);
            }
            else if (result.error) {
                alert(`${tr('Log export failed', 'صدور لاگ ناموفق بود')}: ${result.error}`);
            }
            return;
        }
        const webResult = exportWebLogs();
        if (webResult.ok) {
            setWebLogStats(getWebLogStats());
            alert(`${tr('Web logs exported as', 'لاگ‌های وب صادر شد با نام')}:\n${webResult.fileName}`);
            return;
        }
        if (webResult.reason === 'NO_LOGS') {
            alert(tr('No web logs available yet.', 'هنوز لاگ وب موجود نیست.'));
            return;
        }
        alert(tr('Web log export failed.', 'صدور لاگ وب ناموفق بود.'));
    };
    const handleClearWebLogs = () => {
        if (window.electronAPI)
            return;
        clearWebLogs();
        setWebLogStats(getWebLogStats());
        alert(tr('Web logs cleared.', 'لاگ‌های وب پاک شد.'));
    };
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        try {
            const data = await importData(file);
            const restored = await onRestoreData(data);
            if (restored === false) {
                alert(tr('Restore failed. Your current data was not changed.', 'بازیابی ناکام شد. داده‌های فعلی تغییر نکرد.'));
                return;
            }
            alert(tr('Data restored successfully.', 'داده‌ها با موفقیت بازگردانی شد.'));
        }
        catch {
            alert(tr('Invalid backup file.', 'فایل پشتیبان نامعتبر است.'));
        }
        finally {
            if (fileInputRef.current)
                fileInputRef.current.value = '';
        }
    };
    const handleResetSystem = async () => {
        if (resetConfirmText.toUpperCase() !== 'DELETE') {
            alert(tr('Please type DELETE to confirm.', 'برای تایید لطفاً DELETE را تایپ کنید.'));
            return;
        }
        const result = await onSystemReset(resetOptions);
        if (result === false)
            return;
        setShowResetModal(false);
        setResetConfirmText('');
        setResetOptions({
            medicines: false,
            customers: false,
            invoices: false,
            settings: false,
            expenses: false,
            partners: false,
            suppliers: false,
            purchases: false,
            auditEvents: false,
            stockMovements: false,
            treasury: false,
            clearTransactionsOnly: false
        });
    };
    return (<div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-fade-in items-start max-w-6xl mx-auto">
            {/* Backup & Restore Panel */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6 group">
                <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">
                    <div className="bg-sky-500/10 text-sky-600 p-2.5 rounded-2xl">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    </div>
                    {tr('Backup & Restore', 'پشتیبان‌گیری و بازیابی')}
                </h3>
                
                <div className="flex flex-col gap-4">
                    <button onClick={handleExport} className="bg-white/50 text-indigo-600 font-semibold px-6 py-4 rounded-2xl hover:bg-white hover:text-indigo-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-sm border border-white/60 transition-all duration-300 flex items-center justify-between group-hover:border-indigo-100/50">
                        <span className="flex items-center gap-3">
                             <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            {tr('Export Data', 'دریافت فایل پشتیبان (Export)')}
                        </span>
                        <span className="text-xs bg-indigo-50 text-indigo-500 px-2 py-1 rounded-lg">JSON</span>
                    </button>
                    
                    <button onClick={() => fileInputRef.current?.click()} className="bg-white/50 text-emerald-600 font-semibold px-6 py-4 rounded-2xl hover:bg-white hover:text-emerald-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-sm border border-white/60 transition-all duration-300 flex items-center justify-between group-hover:border-emerald-100/50">
                         <span className="flex items-center gap-3">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                            {tr('Import Data', 'بازیابی اطلاعات (Import)')}
                        </span>
                         <span className="text-xs bg-emerald-50 text-emerald-500 px-2 py-1 rounded-lg">RESTORE</span>
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json"/>
                </div>
            </div>

            {canManageLegacyTreasury && hasLegacyTreasury && (<div data-testid="maintenance-legacy-treasury-card" className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6">
                    <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">
                        <div className="bg-violet-500/10 text-violet-600 p-2.5 rounded-2xl">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                        </div>
                        {tr('Old Device Treasury Records', 'سوابق خزانه قدیمی دستگاه')}
                    </h3>

                    <p className="text-sm font-semibold leading-6 text-slate-500">
                        {tr('An older version stored treasury records on this device without recording which account they belong to. Export them for the server migration. They are never deleted automatically.', 'نسخه قدیمی‌تر، سوابق خزانه را بدون ثبت حساب مالک در این دستگاه ذخیره کرده بود. برای انتقال به سرور آن را صادر کنید. این سوابق هرگز به‌صورت خودکار حذف نمی‌شوند.')}
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/70 bg-white/55 p-4">
                            <p className="text-xs font-bold text-slate-500">{tr('Transactions', 'تراکنش‌ها')}</p>
                            <p data-testid="legacy-treasury-tx-count" className="wk-ltr-data mt-2 text-2xl font-black text-slate-900">{formatNumber(legacyTreasurySummary.transactionCount)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/70 bg-white/55 p-4">
                            <p className="text-xs font-bold text-slate-500">{tr('Cash counts', 'شمارش‌های نقدی')}</p>
                            <p data-testid="legacy-treasury-cc-count" className="wk-ltr-data mt-2 text-2xl font-black text-slate-900">{formatNumber(legacyTreasurySummary.cashCountCount)}</p>
                        </div>
                    </div>

                    <p data-testid="legacy-treasury-stage" className="text-xs font-bold text-slate-500">
                        {tr('Status: ', 'وضعیت: ')}
                        {legacyTreasuryStage === 'retained' && tr('Not exported yet', 'هنوز صادر نشده')}
                        {legacyTreasuryStage === 'exported' && tr('Exported — awaiting server import confirmation', 'صادر شد — در انتظار تأیید ورود به سرور')}
                        {legacyTreasuryStage === 'import_confirmed' && tr('Import confirmed — safe to delete the device copy', 'ورود تأیید شد — حذف نسخه دستگاه ایمن است')}
                        {legacyTreasuryStage === 'purged' && tr('Device copy deleted', 'نسخه دستگاه حذف شد')}
                    </p>

                    <div className="flex flex-col gap-3">
                        <button type="button" data-testid="legacy-treasury-export" onClick={handleExportLegacyTreasury} disabled={!treasuryScope} className="bg-white/50 text-violet-600 font-semibold px-6 py-4 rounded-2xl hover:bg-white hover:text-violet-700 border border-white/60 transition-all duration-300 flex items-center justify-between disabled:cursor-not-allowed disabled:text-slate-400">
                            <span>{tr('Export treasury records', 'صدور سوابق خزانه')}</span>
                            <span className="text-xs bg-violet-50 text-violet-500 px-2 py-1 rounded-lg">JSON</span>
                        </button>

                        <button type="button" data-testid="legacy-treasury-confirm-import" onClick={handleConfirmLegacyTreasuryImported} disabled={!treasuryScope || legacyTreasuryStage === 'retained' || legacyTreasuryStage === 'purged'} className="bg-white/50 text-sky-600 font-semibold px-6 py-4 rounded-2xl hover:bg-white hover:text-sky-700 border border-white/60 transition-all duration-300 disabled:cursor-not-allowed disabled:text-slate-400">
                            {tr('I confirm this export was imported into the server', 'تأیید می‌کنم این فایل در سرور وارد شده است')}
                        </button>

                        <button type="button" data-testid="legacy-treasury-purge" onClick={handlePurgeLegacyTreasury} disabled={!canPurgeLegacyTreasury()} className="bg-rose-500 text-white rounded-2xl py-4 text-sm font-bold hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 transition-all">
                            {tr('Delete old device copy', 'حذف نسخه قدیمی دستگاه')}
                        </button>
                        <p className="text-xs font-semibold text-slate-400">
                            {tr('Deletion stays locked until this device has exported its records and that export is confirmed imported.', 'حذف تا زمانی که این دستگاه سوابق خود را صادر نکند و ورود آن تأیید نشود قفل می‌ماند.')}
                        </p>
                    </div>
                </div>)}

            <div data-testid="maintenance-medicine-archive-card" className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6">
                <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">
                    <div className="bg-amber-500/10 text-amber-600 p-2.5 rounded-2xl">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M7 8v10a2 2 0 002 2h6a2 2 0 002-2V8M8 4h8l1 4H7l1-4zm2 8h4"/></svg>
                    </div>
                    {tr('Medicine Archive', 'بایگانی دواها')}
                </h3>

                <p className="text-sm font-semibold leading-6 text-slate-500">
                    {tr('Review medicines removed from active inventory and permanently delete them from the archive when needed.', 'دواهای حذف‌شده از فهرست فعال را بازبینی کنید و در صورت نیاز از خود نمای بایگانی کاملاً حذف کنید.')}
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/70 bg-white/55 p-4">
                        <p className="text-xs font-bold text-slate-500">{tr('Active medicines', 'دواهای فعال')}</p>
                        <p data-testid="maintenance-active-medicine-count" className="wk-ltr-data mt-2 text-2xl font-black text-slate-900">{formatNumber(activeMedicineCount)}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100/80 bg-amber-50/60 p-4">
                        <p className="text-xs font-bold text-amber-700">{tr('Archived medicines', 'دواهای بایگانی‌شده')}</p>
                        <p data-testid="maintenance-archived-medicine-count" className="wk-ltr-data mt-2 text-2xl font-black text-amber-800">{formatNumber(archivedMedicineCount)}</p>
                    </div>
                </div>

                <button type="button" data-testid="maintenance-open-medicine-archive" onClick={onOpenMedicineArchive} disabled={!onOpenMedicineArchive} className="mt-auto w-full bg-amber-500 text-white rounded-2xl py-4 text-sm font-bold hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 transition-all shadow-md shadow-amber-500/20">
                    {tr('Open Medicine Archive', 'باز کردن بایگانی دواها')}
                </button>
            </div>

            {/* Cloud Details */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6">
                <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">
                    <div className="bg-emerald-500/10 text-emerald-600 p-2.5 rounded-2xl">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/></svg>
                    </div>
                    {tr('System Diagnostic', 'وضعیت سیستم و پردازش‌ها')}
                </h3>
                
                <div className="flex flex-col gap-4 bg-white/50 backdrop-blur-sm rounded-[1.5rem] p-6 border border-white/60 shadow-[0_2px_8px_rgb(0,0,0,0.02)]">
                    {false}
                    <button onClick={handleRunIntegrityAudit} className="w-full bg-slate-900 text-white rounded-xl py-3 text-xs font-bold hover:bg-slate-700 transition-all shadow-md shadow-slate-900/10">
                        {tr('Run Data Integrity Audit', 'بررسی یکپارچگی داده')}
                    </button>
                    {integrityAudit && (<InlineAlert tone={integrityAudit.summary.critical > 0 ? 'danger' : integrityAudit.summary.warning > 0 ? 'warning' : 'success'} title={tr('Data integrity audit completed', 'بررسی یکپارچگی داده تکمیل شد')}>
                            <span dir="ltr" className="block text-xs leading-6">
                                critical={integrityAudit.summary.critical} | warning={integrityAudit.summary.warning} | total={integrityAudit.summary.total}
                            </span>
                        </InlineAlert>)}
                    {integrityAudit && integrityAudit.issues.length > 0 && (<div dir="ltr" className="bg-white/60 border border-slate-200/70 rounded-2xl p-4 text-left space-y-3">
                            <div className="space-y-2 max-h-44 overflow-auto pr-1">
                                {integrityAudit.issues.slice(0, 8).map((issue, index) => (<div key={`${issue.type}-${issue.entityId}-${index}`} className="text-[11px] leading-5 text-slate-700">
                                        <span className={`mr-2 px-2 py-0.5 rounded-full font-bold ${issue.severity === 'critical'
                    ? 'bg-rose-100 text-rose-700'
                    : issue.severity === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-500'}`}>
                                            {issue.severity}
                                        </span>
                                        <strong>{issue.type}</strong>: {issue.description}
                                    </div>))}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button onClick={handleExportIntegrityAuditJson} className="flex-1 px-3 py-2 rounded-xl text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-700 transition">
                                    Export JSON
                                </button>
                                <button onClick={handleExportIntegrityAuditCsv} className="flex-1 px-3 py-2 rounded-xl text-[11px] font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition">
                                    Export CSV
                                </button>
                            </div>
                        </div>)}
                    {null}
                    {null}
                     {false}
                    {false}
                </div>
            </div>

            {/* Error Logs */}
             <div className="bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6">
                <h3 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-3">
                    <div className="bg-indigo-500/10 text-indigo-600 p-2.5 rounded-2xl">
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    {tr('System Logs', 'لاگ‌های سیستم')}
                </h3>
               
                <div className="flex flex-col gap-4">
                    <button onClick={handleExportLogs} className="bg-white/50 text-slate-700 font-semibold px-6 py-4 rounded-2xl hover:bg-slate-800 hover:text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-sm border border-slate-200/50 transition-all duration-300 flex items-center justify-center gap-3 w-full">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        {tr('Export Logs (.txt)', 'دریافت فایل لاگ (.txt)')}
                    </button>
                    {!window.electronAPI && webLogStats && webLogStats.count > 0 && (<button onClick={handleClearWebLogs} className="bg-rose-50/50 text-rose-500 font-bold px-6 py-3 rounded-xl hover:bg-rose-100 transition-all duration-300 text-xs w-full mt-2">
                            {tr('Clear Web Logs', 'پاکسازی تاریخچه لاگ‌ها')}
                        </button>)}
                </div>
            </div>

            {/* Reset App Panel */}
             <div className="bg-rose-50/40 backdrop-blur-xl border border-rose-200/30 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-10 flex flex-col space-y-6">
                <h3 className="text-xl font-semibold text-rose-600 mb-2 flex items-center gap-3">
                    <div className="bg-rose-500/10 text-rose-600 p-2.5 rounded-2xl">
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </div>
                    {tr('Factory Reset', 'بازنشانی سیستم (Reset)')}
                </h3>
               
                <div className="flex flex-col gap-4 mt-auto">
                     <button onClick={() => setShowResetModal(true)} className="bg-rose-500 text-white font-semibold px-6 py-4 rounded-2xl hover:bg-rose-600 shadow-[0_4px_15px_rgba(244,63,94,0.3)] transition-all duration-300 w-full">
                        {tr('Reset Options', 'نشان دادن گزینه‌های بازنشانی')}
                    </button>
                </div>
            </div>

            {/* Reset Modal */}
            <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title={tr('System Reset (DANGER)', 'تنظیمات بازنشانی (خطرناک)')}>
                <div className="space-y-6 mt-4">
                    <div className="bg-rose-50 text-rose-700 p-6 rounded-[1.5rem] border border-rose-100 flex items-start gap-4">
                        <svg className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        <p className="text-sm font-semibold">{tr('Check what you want to delete:', 'موارد زیر جهت پاک شدن را انتخاب کنید:')}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.medicines} onChange={e => setResetOptions({ ...resetOptions, medicines: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('All Medicines', 'تمام داروها/کالاها')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.invoices} onChange={e => setResetOptions({ ...resetOptions, invoices: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('All Invoices', 'تمام فاکتورها')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.customers} onChange={e => setResetOptions({ ...resetOptions, customers: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('All Customers', 'لیست مشتریان')}</span>
                        </label>
                         <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.expenses} onChange={e => setResetOptions({ ...resetOptions, expenses: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('All Expenses', 'تمام هزینه‌ها')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.partners} onChange={e => setResetOptions({ ...resetOptions, partners: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('All Partners', 'تمام شرکا')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.suppliers} onChange={e => setResetOptions({ ...resetOptions, suppliers: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('All Suppliers', 'تمام تأمین‌کننده‌ها')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.purchases} onChange={e => setResetOptions({ ...resetOptions, purchases: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('All Purchases', 'تمام خریدها')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.auditEvents} onChange={e => setResetOptions({ ...resetOptions, auditEvents: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('Audit Trail', 'تاریخچه بازرسی')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.stockMovements} onChange={e => setResetOptions({ ...resetOptions, stockMovements: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('Stock Movement Ledger', 'دفتر گردش موجودی')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="checkbox" checked={resetOptions.treasury} onChange={e => setResetOptions({ ...resetOptions, treasury: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('Treasury Records', 'سوابق صندوق')}</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-200/50 cursor-pointer hover:bg-slate-50 transition-colors col-span-2">
                            <input type="checkbox" checked={resetOptions.settings} onChange={e => setResetOptions({ ...resetOptions, settings: e.target.checked })} className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"/>
                            <span className="text-sm font-semibold text-slate-700">{tr('Application Settings', 'تنظیمات برنامه')}</span>
                        </label>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <label className="block text-sm font-bold text-rose-600 mb-2">{tr('Type DELETE to confirm:', 'جهت تایید عبارت DELETE را تایپ کنید:')}</label>
                        <input type="text" value={resetConfirmText} onChange={e => setResetConfirmText(e.target.value.toUpperCase())} className="w-full px-6 py-4 border-2 border-rose-200 rounded-[1.5rem] bg-rose-50/30 text-rose-800 font-mono tracking-widest outline-hidden focus:border-rose-400" placeholder="DELETE" dir="ltr"/>
                    </div>

                    <div className="flex justify-end gap-3 pt-6">
                         <button onClick={handleResetSystem} disabled={resetConfirmText !== 'DELETE'} className="bg-rose-600 text-white px-8 py-3 rounded-2xl hover:bg-rose-700 disabled:opacity-50 disabled:shadow-none shadow-lg shadow-rose-600/30 transition-all font-semibold">
                            {tr('Permanently delete data', 'حذف دائمی اطلاعات')}
                        </button>
                        <button onClick={() => setShowResetModal(false)} className="bg-slate-100 text-slate-700 px-6 py-3 rounded-2xl hover:bg-slate-200 transition-all font-semibold">
                            {tr('Cancel', 'انصراف')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>);
};
