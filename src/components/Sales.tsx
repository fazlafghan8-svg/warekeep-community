import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, AppUser, Customer, GuestTrialState, Invoice, Medicine, Partner, SalesDraft, SalesMode, Supplier } from '../types';
import { InvoicePrintModal } from './InvoicePrintModal';
import { getTranslation } from '../utils/translations';
import { formatAppDate, resolveSalesModePrice } from '../lib/formatters';
import { checkLimit } from "../services/localAccessPolicy";
import { calculateInvoiceLineDiscount, calculateInvoiceLineTotal, calculateInvoiceTotals, calculateInvoiceTotalsStaged, type InvoiceCalculationProgress } from '../utils/calculations';
import { Button } from './ui/Button';
import { InlineAlert } from './ui/InlineAlert';
import { NewFeatureBadge } from './ui/NewFeatureBadge';
import { EmptyStateShell } from './ui/StateShell';
import { FlatCard, PageSurface } from './ui/Surface';
import { StatusBadge } from './ui/StatusBadge';
import { classNames } from '@/utils/classNames';
import { formatInvoiceStockIssue, getFirstInvoiceStockIssue, validateInvoiceStock } from '../utils/invoiceStockValidation';
import { getInvalidInvoiceFinancialLineIndex, resolveInvoicePayment } from '../utils/invoiceAccounting';
import { formatInvoiceQuantityPolicyIssue, validateInvoiceQuantityPolicy } from '../utils/invoiceQuantityPolicy';
import { describeInvoiceItemUnit, getInvoiceItemBaseQuantity, getMedicineBaseUnit, getSaleUnitDisplayLabel, normalizeSaleUnits, resolveSaleUnit, toBaseQuantity } from '../utils/unitConversion';
import { buildInvoiceItemCommissionSnapshot } from '../utils/commissionRules';
import { allocateSaleAcrossBatches, createInvoiceDisplayGroupId, getInvoiceDisplayLineDiscount, getInvoiceDisplayLines, getInvoiceDisplayLineTotal, type InvoiceDisplayLine } from '../utils/invoiceBatchAllocation';
import { getFefoSortedBatches } from '../utils/batchUtils';
const InfoIconButton: React.FC<{
    label: string;
    className?: string;
}> = ({ label, className }) => (<button type="button" title={label} aria-label={label} className={classNames('inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand-100/85 bg-white/84 text-slate-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700', className)}>
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.1 9a3 3 0 1 1 5.8 1c-.35 1-1.2 1.45-2 1.9-.78.43-1.4.86-1.4 1.85V14"/>
      <path d="M12 17h.01"/>
      <circle cx="12" cy="12" r="9"/>
    </svg>
  </button>);
interface SalesProps {
    customers: Customer[];
    medicines: Medicine[];
    partners?: Partner[];
    suppliers?: Supplier[];
    addInvoice: (invoice: Omit<Invoice, 'id'>) => Promise<Invoice | void>;
    addCustomer: (customer: Omit<Customer, 'id'>) => void;
    settings: AppSettings;
    activeAppUser?: AppUser | null;
    invoices?: Invoice[];
    draft: SalesDraft;
    onUpdateDraft: (updates: Partial<SalesDraft>) => void;
    readOnly?: boolean;
    guestTrialState?: GuestTrialState | null;
}
const modeBadgeTone: Record<SalesMode, 'info' | 'success' | 'warning'> = {
    retail: 'info',
    wholesale: 'warning',
    bulk: 'success'
};
export const Sales: React.FC<SalesProps> = ({ customers, medicines, partners = [], suppliers = [], addInvoice, addCustomer, settings, activeAppUser, invoices = [], draft, onUpdateDraft, readOnly = false, guestTrialState = null }) => {
    const t = getTranslation(settings.language || 'dari');
    const isEnglish = settings.language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const currencyCode = settings.currencySettings?.baseCurrency || 'AFN';
    const numberLocale = isEnglish ? 'en-US' : 'fa-AF';
    const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
    const { items: invoiceItems, customerId: selectedCustomerId, customerSearchTerm, discount, paymentType, amountPaidInput, cashAmountInput = 0, cardAmountInput = 0, salesMode, manualInvoiceNumber, dueDate, partnerId: selectedPartnerId } = draft;
    const guestInvoicesRemaining = guestTrialState
        ? Math.max(0, guestTrialState.limits.maxInvoices - guestTrialState.usage.invoiceCount)
        : null;
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    const [isCustomerQuickAddOpen, setIsCustomerQuickAddOpen] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [selectedMedicineId, setSelectedMedicineId] = useState('');
    const [quantity, setQuantity] = useState<number>(1);
    const [selectedSaleUnitName, setSelectedSaleUnitName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
    const [lastCompletedInvoice, setLastCompletedInvoice] = useState<Invoice | null>(null);
    const [customUnitPrice, setCustomUnitPrice] = useState('');
    const [lineDiscountAmount, setLineDiscountAmount] = useState('');
    const [lineDiscountPercent, setLineDiscountPercent] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [showMedicineSuggestions, setShowMedicineSuggestions] = useState(false);
    const [expiryWarning, setExpiryWarning] = useState<string | null>(null);
    const [customTaxRate, setCustomTaxRate] = useState<number>(settings.taxRate);
    const [isTotalsExpanded, setIsTotalsExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('wk_totals_expanded');
        return saved !== 'false';
    });
    const [isCustomerExpanded, setIsCustomerExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('wk_customer_expanded');
        return saved !== 'false';
    });
    const toggleTotals = () => {
        const next = !isTotalsExpanded;
        setIsTotalsExpanded(next);
        localStorage.setItem('wk_totals_expanded', String(next));
    };
    const toggleCustomer = () => {
        const next = !isCustomerExpanded;
        setIsCustomerExpanded(next);
        localStorage.setItem('wk_customer_expanded', String(next));
    };
    useEffect(() => {
        if (invoiceItems.length === 0) {
            setCustomTaxRate(settings.taxRate);
        }
    }, [invoiceItems.length, settings.taxRate]);
    const [invoiceTotals, setInvoiceTotals] = useState(() => calculateInvoiceTotals(invoiceItems, discount, customTaxRate, currencyCode));
    const [isCalculatingTotals, setIsCalculatingTotals] = useState(false);
    const [calculationProgress, setCalculationProgress] = useState(0);
    const [calculationStage, setCalculationStage] = useState<InvoiceCalculationProgress['stage']>('done');
    const [calculationError, setCalculationError] = useState<string | null>(null);
    const [actionFeedback, setActionFeedback] = useState<{
        text: string;
        tone: 'success' | 'warning' | 'error' | 'info';
    } | null>(null);
    const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);
    const triggerActionFeedback = (text: string, tone: 'success' | 'warning' | 'error' | 'info' = 'info') => {
        setActionFeedback({ text, tone });
        setTimeout(() => setActionFeedback(null), 3000);
    };
    const getInvoiceSubmissionErrorMessage = (error: unknown) => {
        const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
        const code = String(record.code || '').trim();
        if (code === 'INSUFFICIENT_STOCK') {
            return tr('Insufficient stock. The invoice was not saved.', 'موجودی کافی نیست. فاکتور ذخیره نشد.');
        }
        if (code === 'DUPLICATE_INVOICE_NUMBER' || code === '23505') {
            return tr('Invoice number already exists. Choose another number.', 'شماره فاکتور تکراری است. شماره دیگری انتخاب کنید.');
        }
        if (code === 'WAREHOUSE_PERMISSION_DENIED' || code === 'PERMISSION_DENIED') {
            return tr('You do not have permission to create this invoice.', 'شما اجازه ثبت این فاکتور را ندارید.');
        }
        const message = error instanceof Error ? error.message : String(error || '').trim();
        return message || tr('Invoice was not saved. Please try again.', 'فاکتور ذخیره نشد. لطفاً دوباره تلاش کنید.');
    };
    const customerInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const unitPriceRef = useRef<HTMLInputElement>(null);
    const quantityRef = useRef<HTMLInputElement>(null);
    const addButtonRef = useRef<HTMLButtonElement>(null);
    const amountPaidRef = useRef<HTMLInputElement>(null);
    const formatNumber = (value: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 6 }).format(Number.isFinite(value) ? value : 0);
    const formatMoneyNumber = (value: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
    const formatMoney = (value: number) => `${formatMoneyNumber(value)} ${currencyCode}`;
    const getSalesModeUnitPrice = (medicine: Medicine, mode: SalesMode, unitName?: string) => {
        const unit = resolveSaleUnit(medicine, unitName);
        return resolveSalesModePrice(medicine.salePrices, mode) * unit.conversionFactor;
    };
    const resolveCustomerIdFromInput = (term: string): string => {
        const normalized = term.trim().toLowerCase();
        if (!normalized)
            return '';
        const exactMatches = customers.filter((customer) => {
            if (customer.isDeleted)
                return false;
            const byName = customer.name.trim().toLowerCase() === normalized;
            const byPhone = (customer.phone || '').trim().toLowerCase() === normalized;
            return byName || byPhone;
        });
        return exactMatches.length === 1 ? exactMatches[0].id : '';
    };
    const effectiveCustomerId = selectedCustomerId || resolveCustomerIdFromInput(customerSearchTerm);
    const selectedCustomer = customers.find((customer) => !customer.isDeleted && customer.id === effectiveCustomerId) || null;
    const activePartners = useMemo(() => partners.filter((partner) => !partner.isDeleted && partner.status !== 'inactive'), [partners]);
    const partnerById = useMemo(() => new Map(partners.filter((partner) => !partner.isDeleted).map((partner) => [partner.id, partner])), [partners]);
    const batchOwnerById = useMemo(() => {
        const map = new Map<string, string>();
        medicines.forEach((medicine) => {
            (medicine.batches || []).forEach((batch) => {
                if (batch.ownerPartnerId) {
                    map.set(batch.id, batch.ownerPartnerId);
                }
            });
        });
        return map;
    }, [medicines]);
    const selectedMedicine = medicines.find((medicine) => medicine.id === selectedMedicineId) || null;
    const selectedSaleUnits = useMemo(() => normalizeSaleUnits(selectedMedicine), [selectedMedicine]);
    const selectedSaleUnit = useMemo(() => resolveSaleUnit(selectedMedicine, selectedSaleUnitName), [selectedMedicine, selectedSaleUnitName]);
    const selectedBaseQuantity = toBaseQuantity(quantity, selectedSaleUnit);
    const selectedMedicineStock = selectedMedicine
        ? getFefoSortedBatches(selectedMedicine.batches || []).reduce((sum, batch) => sum + batch.quantity, 0)
        : 0;
    const displayInvoiceLines = useMemo(() => getInvoiceDisplayLines(invoiceItems), [invoiceItems]);
    const formatSaleUnitOption = (unit: (typeof selectedSaleUnits)[number]) => {
        const label = getSaleUnitDisplayLabel(unit.label || unit.unitName, isEnglish);
        if (unit.conversionFactor === 1)
            return label;
        if (unit.conversionFactor < 1) {
            return `${label} (${formatNumber(unit.conversionFactor)} ${getSaleUnitDisplayLabel(getMedicineBaseUnit(selectedMedicine), isEnglish)})`;
        }
        return `${label} x${formatNumber(unit.conversionFactor)}`;
    };
    const currentInvoiceNumber = settings.invoiceNumbering?.type === 'manual'
        ? manualInvoiceNumber
        : settings.invoiceNumbering?.nextNumber || 1001;
    const resetWorkbench = () => {
        onUpdateDraft({
            items: [],
            customerId: '',
            customerSearchTerm: '',
            discount: 0,
            paymentType: 'cash',
            amountPaidInput: 0,
            cashAmountInput: 0,
            cardAmountInput: 0,
            manualInvoiceNumber: undefined,
            dueDate: undefined,
            partnerId: undefined
        });
        setSelectedMedicineId('');
        setQuantity(1);
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setCustomUnitPrice('');
        setLineDiscountAmount('');
        setLineDiscountPercent('');
        setHighlightedIndex(-1);
        setShowMedicineSuggestions(false);
        setShowCustomerSuggestions(false);
        setExpiryWarning(null);
        setIsCustomerQuickAddOpen(false);
        setNewClientName('');
        setNewClientPhone('');
        setTimeout(() => searchInputRef.current?.focus(), 80);
    };
    const cyclePaymentType = () => {
        if (paymentType === 'cash')
            onUpdateDraft({ paymentType: 'card' });
        else if (paymentType === 'card')
            onUpdateDraft({ paymentType: 'mixed' });
        else if (paymentType === 'mixed')
            onUpdateDraft({ paymentType: 'credit' });
        else if (paymentType === 'credit')
            onUpdateDraft({ paymentType: 'partial' });
        else
            onUpdateDraft({ paymentType: 'cash' });
    };
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'F2') {
                event.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            }
            if (event.key === 'F4') {
                event.preventDefault();
                customerInputRef.current?.focus();
                customerInputRef.current?.select();
            }
            if (event.key === 'F6') {
                event.preventDefault();
                cyclePaymentType();
            }
            if (event.key === 'F8' && paymentType === 'partial') {
                event.preventDefault();
                amountPaidRef.current?.focus();
                amountPaidRef.current?.select();
            }
            if (event.key === 'Escape') {
                setShowMedicineSuggestions(false);
                setShowCustomerSuggestions(false);
                setIsCustomerQuickAddOpen(false);
            }
            if (event.key === 'F10') {
                event.preventDefault();
                if (invoiceItems.length > 0 && effectiveCustomerId && !isCalculatingTotals && !isSubmittingInvoice) {
                    void handleSubmitInvoice();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [effectiveCustomerId, invoiceItems.length, isCalculatingTotals, isSubmittingInvoice, paymentType]);
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 180);
        return () => clearTimeout(timer);
    }, [searchTerm]);
    useEffect(() => {
        setExpiryWarning(null);
        if (!selectedMedicineId)
            return;
        const medicine = medicines.find((item) => item.id === selectedMedicineId);
        if (!medicine)
            return;
        const now = new Date();
        const threeMonthsLater = new Date();
        threeMonthsLater.setMonth(now.getMonth() + 3);
        const expiredBatch = medicine.batches.find((batch) => new Date(batch.expiryDate) <= now);
        const expiringBatch = medicine.batches.find((batch) => {
            const expiry = new Date(batch.expiryDate);
            return expiry > now && expiry < threeMonthsLater;
        });
        if (expiredBatch) {
            setExpiryWarning(tr('Selected item has expired batches.', 'برای این کالا batch منقضی‌شده وجود دارد.'));
        }
        else if (expiringBatch) {
            setExpiryWarning(tr('Selected item expires within the next 3 months.', 'این کالا در کمتر از سه ماه آینده منقضی می‌شود.'));
        }
    }, [isEnglish, medicines, selectedMedicineId]);
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        const runStagedCalculation = async () => {
            setIsCalculatingTotals(true);
            setCalculationError(null);
            setCalculationProgress(0);
            setCalculationStage('sanitize');
            try {
                const totals = await calculateInvoiceTotalsStaged(invoiceItems, discount, customTaxRate, currencyCode, {
                    mode: settings.calculationSafety?.mode ?? 'extreme',
                    stageDelayMs: settings.calculationSafety?.stageDelayMs,
                    chunkSize: settings.calculationSafety?.chunkSize,
                    verificationPasses: settings.calculationSafety?.verificationPasses,
                    signal: controller.signal,
                    onProgress: (progress) => {
                        if (!active)
                            return;
                        setCalculationStage(progress.stage);
                        setCalculationProgress(Math.round(progress.progress * 100));
                    }
                });
                if (!active)
                    return;
                setInvoiceTotals(totals);
            }
            catch (error) {
                if (!active || controller.signal.aborted)
                    return;
                setInvoiceTotals(calculateInvoiceTotals(invoiceItems, discount, customTaxRate, currencyCode));
                setCalculationError(tr('Secure staged calculation failed. Fallback totals are shown and the cart was preserved.', 'محاسبه امن مرحله‌ای ناموفق بود. جمع‌های پشتیبان نمایش داده شد و سبد فروش حفظ گردید.'));
            }
            finally {
                if (!active || controller.signal.aborted)
                    return;
                setIsCalculatingTotals(false);
            }
        };
        runStagedCalculation();
        return () => {
            active = false;
            controller.abort();
        };
    }, [
        invoiceItems,
        discount,
        customTaxRate,
        currencyCode,
        settings.calculationSafety?.mode,
        settings.calculationSafety?.stageDelayMs,
        settings.calculationSafety?.chunkSize,
        settings.calculationSafety?.verificationPasses,
        isEnglish
    ]);
    const { total, tax, finalAmount, lineDiscountTotal = 0 } = invoiceTotals;
    const filteredMedicines = useMemo(() => {
        if (!debouncedSearchTerm.trim())
            return [];
        const lowerTerm = debouncedSearchTerm.toLowerCase().trim();
        return medicines
            .filter((medicine) => !medicine.isDeleted && (medicine.name.toLowerCase().includes(lowerTerm)
            || medicine.genericName?.toLowerCase().includes(lowerTerm)
            || medicine.barcode?.includes(lowerTerm)))
            .sort((a, b) => {
            if (a.barcode === lowerTerm)
                return -1;
            if (b.barcode === lowerTerm)
                return 1;
            const aStarts = a.name.toLowerCase().startsWith(lowerTerm);
            const bStarts = b.name.toLowerCase().startsWith(lowerTerm);
            if (aStarts && !bStarts)
                return -1;
            if (!aStarts && bStarts)
                return 1;
            return a.name.localeCompare(b.name);
        })
            .slice(0, 20);
    }, [debouncedSearchTerm, medicines]);
    useEffect(() => {
        setHighlightedIndex(0);
        setShowMedicineSuggestions(!!searchTerm && !selectedMedicineId);
    }, [searchTerm, selectedMedicineId]);
    const filteredCustomers = useMemo(() => {
        const normalized = customerSearchTerm.trim().toLowerCase();
        const activeCustomers = customers.filter((customer) => !customer.isDeleted);
        if (!normalized)
            return activeCustomers.slice(0, 10);
        return activeCustomers
            .filter((customer) => customer.name.toLowerCase().includes(normalized)
            || (customer.phone || '').toLowerCase().includes(normalized))
            .slice(0, 10);
    }, [customerSearchTerm, customers]);
    const stageLabel = useMemo(() => {
        if (calculationStage === 'sanitize')
            return tr('Sanitizing inputs', 'پاک‌سازی داده‌ها');
        if (calculationStage === 'subtotal')
            return tr('Rebuilding subtotal', 'بازسازی جمع فرعی');
        if (calculationStage === 'tax')
            return tr('Applying discount and tax', 'اعمال تخفیف و مالیه');
        if (calculationStage === 'verify')
            return tr('Running safety verification', 'در حال بررسی نهایی');
        return tr('Completed', 'تکمیل شد');
    }, [calculationStage, isEnglish]);
    const paymentPreview = resolveInvoicePayment(finalAmount, paymentType, amountPaidInput, {
        cashAmountInput,
        cardAmountInput,
    });
    const paidPreview = paymentPreview.amountPaid;
    const remainingPreview = paymentPreview.remainingAmount;
    useEffect(() => {
        if (remainingPreview > 0 && !dueDate) {
            const due = new Date();
            due.setDate(due.getDate() + 10);
            onUpdateDraft({ dueDate: due.toISOString().split('T')[0] });
        }
        else if (remainingPreview <= 0 && dueDate) {
            onUpdateDraft({ dueDate: undefined });
        }
    }, [dueDate, onUpdateDraft, remainingPreview]);
    const canSubmit = invoiceItems.length > 0 && !!effectiveCustomerId && !isCalculatingTotals && !isSubmittingInvoice && !readOnly;
    const handleActionSubmit = () => {
        if (readOnly) {
            triggerActionFeedback(tr('Read-only demo mode: invoice creation is disabled.', 'حالت نمایشی فقط‌خواندنی است و ثبت فاکتور غیرفعال می‌باشد.'), 'error');
            return;
        }
        if (invoiceItems.length === 0) {
            triggerActionFeedback(tr('Add at least one line to the cart.', 'حداقل یک سطر به سبد اضافه کنید.'), 'error');
            return;
        }
        if (!effectiveCustomerId) {
            triggerActionFeedback(tr('Choose a customer before confirming the invoice.', 'پیش از تأیید فاکتور، مشتری را انتخاب کنید.'), 'error');
            return;
        }
        void handleSubmitInvoice();
    };
    const handleSelectMedicine = (medicine: Medicine) => {
        setSelectedMedicineId(medicine.id);
        setSearchTerm(medicine.name);
        const unit = resolveSaleUnit(medicine);
        setSelectedSaleUnitName(unit.unitName);
        setCustomUnitPrice(getSalesModeUnitPrice(medicine, salesMode, unit.unitName).toString());
        setShowMedicineSuggestions(false);
        setTimeout(() => {
            unitPriceRef.current?.focus();
            unitPriceRef.current?.select();
        }, 50);
    };
    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showMedicineSuggestions)
            return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightedIndex((current) => (current < filteredMedicines.length - 1 ? current + 1 : current));
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedIndex((current) => (current > 0 ? current - 1 : current));
        }
        else if (event.key === 'Enter') {
            event.preventDefault();
            if (filteredMedicines.length > 0) {
                handleSelectMedicine(filteredMedicines[Math.max(0, highlightedIndex)]);
            }
        }
        else if (event.key === 'Escape') {
            setShowMedicineSuggestions(false);
        }
    };
    const handleCustomerKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const exactMatchId = resolveCustomerIdFromInput(customerSearchTerm);
            if (exactMatchId) {
                const customer = customers.find((item) => item.id === exactMatchId);
                setSelectedCustomerIdState(exactMatchId);
                setCustomerSearchTermState(customer?.name || customerSearchTerm);
                setShowCustomerSuggestions(false);
                searchInputRef.current?.focus();
                return;
            }
            if (filteredCustomers.length > 0) {
                const customer = filteredCustomers[0];
                setSelectedCustomerIdState(customer.id);
                setCustomerSearchTermState(customer.name);
                setShowCustomerSuggestions(false);
                searchInputRef.current?.focus();
            }
            else if (customerSearchTerm.trim()) {
                setNewClientName(customerSearchTerm.trim());
                setIsCustomerQuickAddOpen(true);
            }
        }
        else if (event.key === 'Escape') {
            setShowCustomerSuggestions(false);
        }
    };
    const handleAddItem = () => {
        if (readOnly) {
            triggerActionFeedback(tr('Read-only demo mode: item editing is disabled.', 'حالت نمایشی فقط‌خواندنی است و ویرایش سطرها غیرفعال می‌باشد.'), 'error');
            return;
        }
        if (!selectedMedicineId || quantity <= 0)
            return;
        const medicine = medicines.find((item) => item.id === selectedMedicineId);
        if (!medicine)
            return;
        if (!medicine.batches || medicine.batches.length === 0) {
            triggerActionFeedback(tr('Out of stock. Add stock first.', 'موجودی کافی نیست. ابتدا موجودی را افزایش دهید.'), 'error');
            return;
        }
        const sellableBatches = getFefoSortedBatches(medicine.batches || []);
        const firstSellableBatch = sellableBatches[0] || null;
        if (!firstSellableBatch) {
            triggerActionFeedback(tr('No sellable batch is available. Check quarantine or rejected stock first.', 'هیچ batch قابل‌فروش موجود نیست. ابتدا موجودی قرنطین یا ردشده را بررسی کنید.'), 'error');
            return;
        }
        const sellPrice = parseFloat(customUnitPrice) || 0;
        const saleUnit = resolveSaleUnit(medicine, selectedSaleUnitName);
        const baseQuantity = toBaseQuantity(quantity, saleUnit);
        const itemDiscountAmount = Math.max(0, Number(lineDiscountAmount) || 0);
        const itemDiscountPercent = Math.max(0, Number(lineDiscountPercent) || 0);
        if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
            triggerActionFeedback(tr('Unit price must be greater than zero.', 'قیمت واحد باید بیشتر از صفر باشد.'), 'error');
            setTimeout(() => unitPriceRef.current?.focus(), 100);
            return;
        }
        const quantityPolicyCheck = validateInvoiceQuantityPolicy([{
                medicineId: selectedMedicineId,
                batchId: firstSellableBatch.id,
                quantity,
                baseQuantity,
                saleUnitName: saleUnit.unitName,
                saleUnitLabel: getSaleUnitDisplayLabel(saleUnit.label || saleUnit.unitName, isEnglish),
                saleUnitConversionFactor: saleUnit.conversionFactor,
                baseUnit: getMedicineBaseUnit(medicine),
                price: sellPrice,
            }], medicines);
        if (!quantityPolicyCheck.ok) {
            triggerActionFeedback(formatInvoiceQuantityPolicyIssue(quantityPolicyCheck.issues[0], isEnglish), 'error');
            quantityRef.current?.focus();
            return;
        }
        const allocationResult = allocateSaleAcrossBatches({
            medicine,
            existingItems: invoiceItems,
            requestedQuantity: quantity,
            requestedBaseQuantity: baseQuantity,
            saleUnitConversionFactor: saleUnit.conversionFactor,
            price: sellPrice,
            discountAmount: itemDiscountAmount,
            currency: currencyCode,
        });
        if (!allocationResult.ok) {
            triggerActionFeedback(tr(`Insufficient sellable stock. Requested ${formatNumber(allocationResult.requestedBaseQuantity)}, available ${formatNumber(allocationResult.availableBaseQuantity)}.`, `موجودی قابل‌فروش کافی نیست. مقدار درخواستی ${formatNumber(allocationResult.requestedBaseQuantity)} و موجودی قابل‌فروش ${formatNumber(allocationResult.availableBaseQuantity)} است.`), 'error');
            return;
        }
        const lineRevenue = calculateInvoiceLineTotal({
            price: sellPrice,
            quantity,
            discountAmount: itemDiscountAmount,
            discountPercent: itemDiscountPercent,
        }, currencyCode);
        const lineCost = allocationResult.allocations.reduce((sum, allocation) => sum + ((allocation.batch.purchasePrice || 0) * allocation.baseQuantity), 0);
        if (lineCost > 0 && lineRevenue < lineCost) {
            if (!window.confirm(tr(`Warning: Selling below cost!`, `هشدار: قیمت فروش (${sellPrice}) از قیمت خرید مجموع بچ‌ها کمتر است.\nآیا ادامه می‌دهید؟`))) {
                setTimeout(() => unitPriceRef.current?.focus(), 100);
                return;
            }
        }
        const displayGroupId = createInvoiceDisplayGroupId(selectedMedicineId);
        const isAutoBatchSplit = allocationResult.allocations.length > 1;
        const nextLineItems = allocationResult.allocations.map((allocation) => {
            const purchasePrice = allocation.batch.purchasePrice || 0;
            const commissionSnapshot = buildInvoiceItemCommissionSnapshot(medicine, settings, activeAppUser?.id || 'admin', {
                supplierId: allocation.batch.supplierId || medicine.preferredSupplierId,
                supplierName: supplierById.get(allocation.batch.supplierId || medicine.preferredSupplierId || '')?.name
            });
            return {
                medicineId: selectedMedicineId,
                batchId: allocation.batch.id,
                quantity: allocation.quantity,
                baseQuantity: allocation.baseQuantity,
                saleUnitName: saleUnit.unitName,
                saleUnitLabel: getSaleUnitDisplayLabel(saleUnit.label || saleUnit.unitName, isEnglish),
                saleUnitConversionFactor: saleUnit.conversionFactor,
                baseUnit: getMedicineBaseUnit(medicine),
                price: sellPrice,
                discountAmount: allocation.discountAmount,
                discountPercent: itemDiscountPercent,
                priceMode: salesMode,
                isManualPriceOverride: Math.abs(sellPrice - getSalesModeUnitPrice(medicine, salesMode, saleUnit.unitName)) > 0.0001,
                costPrice: purchasePrice,
                partnerCostPrice: purchasePrice,
                batchOwnershipType: allocation.batch.ownershipType || (allocation.batch.ownerPartnerId ? 'partner' : 'store'),
                partnerId: allocation.batch.ownerPartnerId || selectedPartnerId || undefined,
                displayGroupId,
                isAutoBatchSplit,
                ...commissionSnapshot
            };
        });
        const stockCheck = validateInvoiceStock([...invoiceItems, ...nextLineItems], medicines);
        if (!stockCheck.ok) {
            triggerActionFeedback(formatInvoiceStockIssue(getFirstInvoiceStockIssue(stockCheck), isEnglish), 'error');
            return;
        }
        onUpdateDraft({
            items: [
                ...invoiceItems,
                ...nextLineItems
            ]
        });
        setSelectedMedicineId('');
        setSelectedSaleUnitName('');
        setSearchTerm('');
        setQuantity(1);
        setCustomUnitPrice('');
        setLineDiscountAmount('');
        setLineDiscountPercent('');
        setExpiryWarning(null);
        setShowMedicineSuggestions(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
    };
    const handleRemoveDisplayLine = (line: InvoiceDisplayLine) => {
        if (readOnly) {
            triggerActionFeedback(tr('Read-only demo mode: item editing is disabled.', 'حالت نمایشی فقط‌خواندنی است و ویرایش سطرها غیرفعال می‌باشد.'), 'error');
            return;
        }
        const indexesToRemove = new Set(line.sourceIndexes);
        onUpdateDraft({ items: invoiceItems.filter((_, itemIndex) => !indexesToRemove.has(itemIndex)) });
        setTimeout(() => searchInputRef.current?.focus(), 50);
    };
    const handleQuickAddClient = (event: React.FormEvent) => {
        event.preventDefault();
        if (readOnly) {
            triggerActionFeedback(tr('Read-only demo mode: customer creation is disabled.', 'حالت نمایشی فقط‌خواندنی است و افزودن مشتری غیرفعال می‌باشد.'), 'error');
            return;
        }
        if (!newClientName.trim())
            return;
        addCustomer({
            name: newClientName.trim(),
            phone: newClientPhone.trim(),
            balance: 0,
            transactions: []
        });
        onUpdateDraft({ customerSearchTerm: newClientName.trim(), customerId: '' });
        setNewClientName('');
        setNewClientPhone('');
        setIsCustomerQuickAddOpen(false);
        setShowCustomerSuggestions(true);
        setTimeout(() => customerInputRef.current?.focus(), 100);
    };
    const handleSubmitInvoice = async () => {
        if (readOnly) {
            triggerActionFeedback(tr('Read-only demo mode: invoice creation is disabled.', 'حالت نمایشی فقط‌خواندنی است و ثبت فاکتور غیرفعال می‌باشد.'), 'error');
            return;
        }
        if (isSubmittingInvoice) {
            return;
        }
        if (isCalculatingTotals) {
            triggerActionFeedback(tr('Secure calculation is still running. Please wait.', 'محاسبه امن هنوز در حال اجرا است. لطفاً کمی صبر کنید.'), 'warning');
            return;
        }
        if (invoiceItems.length === 0) {
            triggerActionFeedback(tr('Add at least one line to the cart.', 'حداقل یک سطر به سبد اضافه کنید.'), 'error');
            return;
        }
        const invalidLineIndex = getInvalidInvoiceFinancialLineIndex(invoiceItems);
        if (invalidLineIndex >= 0) {
            triggerActionFeedback(tr(`Line ${invalidLineIndex + 1} has invalid quantity or price.`, `سطر ${invalidLineIndex + 1} تعداد یا قیمت معتبر ندارد.`), 'error');
            return;
        }
        const customerIdForInvoice = effectiveCustomerId;
        if (!customerIdForInvoice) {
            triggerActionFeedback(tr('Please select a customer from the list.', 'لطفاً مشتری را از فهرست انتخاب کنید.'), 'error');
            customerInputRef.current?.focus();
            return;
        }
        if (guestTrialState) {
            if (guestTrialState.usage.invoiceCount >= guestTrialState.limits.maxInvoices) {
                triggerActionFeedback(tr(`Guest Trial limit reached: only ${guestTrialState.limits.maxInvoices} invoices are allowed.`, `سقف نسخه مهمان تکمیل شد: فقط ${guestTrialState.limits.maxInvoices} فاکتور مجاز است.`), 'error');
                return;
            }
        }
        else {
            const now = new Date();
            const currentMonthInvoices = invoices.filter((invoice) => {
                const invoiceDate = new Date(invoice.date);
                return invoiceDate.getMonth() === now.getMonth() && invoiceDate.getFullYear() === now.getFullYear();
            }).length;
            const limitCheck = checkLimit(settings, 'maxInvoicesPerMonth', currentMonthInvoices);
            if (!limitCheck.allowed) {
                triggerActionFeedback(limitCheck.message || tr('Limit reached', 'محدودیت تکمیل شد'), 'error');
                return;
            }
        }
        if (activeAppUser && activeAppUser.role !== 'admin') {
            const maxDiscount = settings.maxStaffDiscount || 100;
            const discountPercentage = total > 0 ? ((discount + lineDiscountTotal) / total) * 100 : 0;
            if (discountPercentage > maxDiscount) {
                triggerActionFeedback(`${t.discountLimitError} (${maxDiscount}%)`, 'error');
                return;
            }
        }
        let finalInvoiceNumber = settings.invoiceNumbering?.nextNumber || 1001;
        if (settings.invoiceNumbering?.type === 'manual') {
            if (!manualInvoiceNumber) {
                triggerActionFeedback(tr('Please enter invoice number.', 'لطفاً شماره فاکتور را وارد کنید.'), 'error');
                return;
            }
            finalInvoiceNumber = manualInvoiceNumber;
        }
        if (!Number.isFinite(finalInvoiceNumber) || finalInvoiceNumber <= 0) {
            triggerActionFeedback(tr('Invalid invoice number.', 'شماره فاکتور معتبر نیست.'), 'error');
            return;
        }
        if (invoices.some((invoice) => !invoice.isDeleted && invoice.invoiceNumber === finalInvoiceNumber)) {
            triggerActionFeedback(tr('Invoice number already exists.', 'شماره فاکتور تکراری است.'), 'error');
            return;
        }
        const stockCheck = validateInvoiceStock(invoiceItems, medicines);
        if (!stockCheck.ok) {
            triggerActionFeedback(formatInvoiceStockIssue(getFirstInvoiceStockIssue(stockCheck), isEnglish), 'error');
            return;
        }
        const quantityPolicyCheck = validateInvoiceQuantityPolicy(invoiceItems, medicines);
        if (!quantityPolicyCheck.ok) {
            triggerActionFeedback(formatInvoiceQuantityPolicyIssue(quantityPolicyCheck.issues[0], isEnglish), 'error');
            return;
        }
        const resolvedPayment = resolveInvoicePayment(finalAmount, paymentType, amountPaidInput, {
            cashAmountInput,
            cardAmountInput,
        });
        const invoicePayload: Omit<Invoice, 'id'> = {
            customerId: customerIdForInvoice,
            items: invoiceItems,
            total,
            tax,
            taxRate: customTaxRate,
            discount,
            lineDiscountTotal,
            finalAmount,
            currency: currencyCode,
            paymentBreakdown: resolvedPayment.paymentBreakdown,
            paymentStatus: resolvedPayment.paymentStatus,
            amountPaid: resolvedPayment.amountPaid,
            remainingAmount: resolvedPayment.remainingAmount,
            date: new Date().toISOString(),
            dueDate,
            userId: activeAppUser?.id || 'admin',
            salesMode,
            invoiceNumber: finalInvoiceNumber
        };
        setIsSubmittingInvoice(true);
        try {
            const created = await addInvoice(invoicePayload);
            if (!created) {
                triggerActionFeedback(tr('Invoice was not saved. Please try again.', 'فاکتور ذخیره نشد. لطفاً دوباره تلاش کنید.'), 'error');
                return;
            }
            setCreatedInvoice(created);
            setLastCompletedInvoice(created);
            resetWorkbench();
            triggerActionFeedback(tr('Invoice successfully created.', 'فاکتور با موفقیت ثبت شد.'), 'success');
        }
        catch (error) {
            triggerActionFeedback(getInvoiceSubmissionErrorMessage(error), 'error');
        }
        finally {
            setIsSubmittingInvoice(false);
        }
    };
    const getMedicineName = (id: string) => medicines.find((medicine) => medicine.id === id)?.name || tr('Unknown item', 'قلم نامشخص');
    const setSalesMode = (mode: SalesMode) => {
        const nextItems = invoiceItems.map((item) => {
            if (item.isManualPriceOverride)
                return item;
            const medicine = medicines.find((entry) => entry.id === item.medicineId);
            if (!medicine)
                return { ...item, priceMode: mode };
            return {
                ...item,
                price: getSalesModeUnitPrice(medicine, mode, item.saleUnitName),
                priceMode: mode,
            };
        });
        onUpdateDraft({ salesMode: mode, items: nextItems });
        if (selectedMedicine) {
            setCustomUnitPrice(getSalesModeUnitPrice(selectedMedicine, mode, selectedSaleUnitName).toString());
        }
    };
    const setPaymentType = (type: SalesDraft['paymentType']) => onUpdateDraft({ paymentType: type });
    const setDiscount = (value: number) => onUpdateDraft({ discount: value });
    const setAmountPaidInput = (value: number) => onUpdateDraft({ amountPaidInput: value });
    const setCashAmountInput = (value: number) => onUpdateDraft({ cashAmountInput: value });
    const setCardAmountInput = (value: number) => onUpdateDraft({ cardAmountInput: value });
    const setCustomerSearchTermState = (value: string) => onUpdateDraft({ customerSearchTerm: value });
    const setSelectedCustomerIdState = (value: string) => onUpdateDraft({ customerId: value });
    const setManualInvoiceNumberState = (value?: number) => onUpdateDraft({ manualInvoiceNumber: value });
    const setDueDate = (value?: string) => onUpdateDraft({ dueDate: value });
    const setSelectedPartnerId = (value?: string) => onUpdateDraft({ partnerId: value || undefined });
    const selectedModeSummary = salesMode === 'retail'
        ? tr('Fast counter sale', 'فروش سریع صندوقدار')
        : salesMode === 'wholesale'
            ? tr('Wholesale pricing and due dates', 'قیمت‌گذاری عمده و سررسید')
            : tr('Bulk pricing workflow', 'جریان قیمت‌گذاری کارتنی');
    const linePreviewItem = {
        price: Number(customUnitPrice) || 0,
        quantity: quantity || 0,
        discountAmount: Number(lineDiscountAmount) || 0,
        discountPercent: Number(lineDiscountPercent) || 0,
    };
    const linePreviewTotal = calculateInvoiceLineTotal(linePreviewItem, currencyCode);
    const linePreviewDiscount = calculateInvoiceLineDiscount(linePreviewItem, currencyCode);
    const isStep1Active = invoiceItems.length === 0;
    const isStep2Active = invoiceItems.length > 0 && (!selectedCustomer && paymentType === 'cash' && !amountPaidInput);
    const isFinalStepActive = invoiceItems.length > 0 && (!!selectedCustomer || paymentType !== 'cash' || !!amountPaidInput);
    return (<PageSurface className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-screen-2xl space-y-4">
        <FlatCard className="p-5 shadow-sm border-neutral-200">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-black uppercase text-brand-600 tracking-wider mb-1">{tr('Operations', 'عملیات')}</p>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-black tracking-tight text-slate-900">{tr('Sales Workbench', 'میز کار فروش')}</h1>
                <InfoIconButton label={tr('Search first, add lines quickly, then confirm and print from the compact checkout panel.', 'ابتدا جستجو کنید، سطرها را سریع اضافه نمایید و سپس از پنل فشرده‌ی تسویه تأیید و چاپ کنید.')} className="h-9 w-9 bg-brand-50 border-brand-100"/>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone={modeBadgeTone[salesMode]} className="text-sm px-3 py-1.5">{selectedModeSummary}</StatusBadge>
              <div className="whitespace-nowrap rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 font-black text-neutral-700">
                <bdi>{formatAppDate(new Date(), settings, 'sales')}</bdi>
              </div>
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 font-bold text-neutral-600">F2 / F4 / F6 / F10</span>
            </div>
          </div>

          {readOnly ? (<div className="mt-3">
              <InlineAlert tone="warning" title={tr('Sales actions are locked in read-only mode', 'عملیات فروش در حالت فقط‌خواندنی قفل است')}>
                {tr('You can review the workbench, but adding items and confirming invoices are disabled.', 'می‌توانید میز کار را ببینید، اما افزودن قلم و تأیید فاکتور غیرفعال است.')}
              </InlineAlert>
            </div>) : null}

          {!readOnly && guestTrialState ? (<div className="mt-3">
              <InlineAlert tone="info" title={tr('Guest trial invoice limit', 'سقف فاکتور در حالت مهمان')}>
                {tr(`${guestInvoicesRemaining} invoice slot(s) remain on this device.`, `${guestInvoicesRemaining} فاکتور دیگر روی این دستگاه مجاز است.`)}
              </InlineAlert>
            </div>) : null}

          {lastCompletedInvoice ? (<div className="mt-3">
              <InlineAlert tone="success" title={tr('Last invoice was created successfully', 'آخرین فاکتور با موفقیت ثبت شد')} action={(<div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setCreatedInvoice(lastCompletedInvoice)}>
                      {tr('Reprint', 'چاپ دوباره')}
                    </Button>
                    <Button variant="ghost" onClick={resetWorkbench}>
                      {tr('New invoice', 'فاکتور جدید')}
                    </Button>
                  </div>)}>
                <span className="wk-ltr-data font-black text-slate-900">#{lastCompletedInvoice.invoiceNumber || lastCompletedInvoice.id}</span>
                <span className="mx-2">·</span>
                <span className="wk-ltr-data">{formatMoney(lastCompletedInvoice.finalAmount)}</span>
              </InlineAlert>
            </div>) : null}
        </FlatCard>

        <div className="wk-detail-split wk-detail-split--wide">
          <div className="space-y-3 xl:flex xl:min-h-0 xl:flex-col">
            <FlatCard className="relative overflow-visible p-3.5">
              <div className="flex flex-col gap-2 border-b border-neutral-200 pb-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                  <div className={classNames("flex h-7 items-center justify-center rounded-full px-3.5 transition-colors", isStep1Active
            ? "bg-gradient-to-r from-brand-600 to-brand-500 shadow-[0_2px_10px_-2px_rgba(var(--color-brand-600),0.4)]"
            : "bg-neutral-100 border border-neutral-200")}>
                    <span className={classNames("text-[11px] font-black", isStep1Active ? "text-white" : "text-neutral-500")}>
                      {tr('Step 1', 'مرحله ۱')}
                    </span>
                  </div>
                  <h2 className="text-[17px] font-black text-slate-900">{tr('Search and Add', 'جستجو و افزودن')}</h2>
                  <InfoIconButton label={tr('Scan or search, confirm quantity and price, then add the line immediately.', 'اسکن یا جستجو کنید، تعداد و قیمت را تأیید نمایید و سطر را فوری اضافه کنید.')}/>
                </div>

                <div className="flex gap-1.5 rounded-2xl border border-neutral-200 bg-neutral-50 p-0.5">
                  {(['retail', 'wholesale', 'bulk'] as SalesMode[]).map((mode) => (<button key={mode} type="button" onClick={() => setSalesMode(mode)} disabled={readOnly} className={classNames('wk-focus-ring rounded-xl px-2.5 py-1 text-[13px] font-black transition disabled:cursor-not-allowed disabled:opacity-50', salesMode === mode
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-white hover:text-slate-900')}>
                      {mode === 'retail' ? t.retail : mode === 'wholesale' ? t.wholesale : t.bulk}
                    </button>))}
                </div>
              </div>

              {expiryWarning ? (<div className="mt-3">
                  <InlineAlert tone="warning" title={tr('Selected item needs expiry review', 'قلم انتخاب‌شده نیاز به بازبینی انقضا دارد')}>
                    {expiryWarning}
                  </InlineAlert>
                </div>) : null}

              {selectedMedicine && selectedBaseQuantity > selectedMedicineStock ? (<div className="mt-3">
                  <InlineAlert tone="danger" title={tr('Requested quantity exceeds current stock', 'تعداد درخواستی از موجودی بیشتر است')}>
                    {tr(`Current stock: ${formatNumber(selectedMedicineStock)} ${getMedicineBaseUnit(selectedMedicine)}. Requested: ${formatNumber(selectedBaseQuantity)} base units.`, `موجودی فعلی: ${formatNumber(selectedMedicineStock)} ${getMedicineBaseUnit(selectedMedicine)}. مقدار پایه درخواستی: ${formatNumber(selectedBaseQuantity)}`)}
                  </InlineAlert>
                </div>) : null}

              <div className="wk-sales-entry-grid mt-3">
                <div className="relative">
                  <label className="block text-[13px] font-black text-slate-500">{tr('Search / scan medicine', 'جستجو / اسکن دوا')}</label>
                  <input ref={searchInputRef} type="text" placeholder={tr('Medicine name or barcode', 'نام دوا یا بارکد')} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={handleSearchKeyDown} autoFocus autoComplete="off" className="wk-input mt-2"/>

                  {showMedicineSuggestions ? (<div className="absolute z-40 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-[0_22px_48px_-28px_rgba(15,23,42,0.35)]">
                      {filteredMedicines.length > 0 ? filteredMedicines.map((medicine, index) => {
                const stock = (medicine.batches || []).reduce((sum, batch) => sum + batch.quantity, 0);
                return (<button key={medicine.id} type="button" onClick={() => handleSelectMedicine(medicine)} className={classNames('flex w-full items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 text-right transition last:border-b-0', index === highlightedIndex ? 'bg-brand-50' : 'hover:bg-neutral-50')}>
                            <span className="min-w-0">
                              <span className="block truncate font-black text-slate-900">{medicine.name}</span>
                              <span className="mt-1 block text-[13px] font-semibold text-slate-500">{medicine.genericName || medicine.manufacturer || '-'}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-[13px]">
                              {medicine.barcode ? <span className="wk-ltr-data rounded-full bg-neutral-100 px-2 py-1 font-black text-neutral-600">{medicine.barcode}</span> : null}
                              <span className={classNames('wk-ltr-data font-black', stock < medicine.lowStockThreshold ? 'text-danger-700' : 'text-success-700')}>
                                {t.stock}: {formatNumber(stock)}
                              </span>
                            </span>
                          </button>);
            }) : (<div className="p-4">
                          <EmptyStateShell title={tr('No matching medicine found', 'دوای مطابق پیدا نشد')} description={tr('Try another name or barcode, then continue once a medicine is found.', 'نام یا بارکد دیگری را امتحان کنید و بعد از یافتن دوا ادامه دهید.')} className="py-8"/>
                        </div>)}
                    </div>) : null}
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-500">{t.sellPrice} ({currencyCode})</label>
                  <input ref={unitPriceRef} type="text" value={customUnitPrice} onChange={(event) => setCustomUnitPrice(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                quantityRef.current?.focus();
                quantityRef.current?.select();
            }
        }} className="wk-input wk-ltr-data mt-2 text-center"/>
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-500">{t.qty}</label>
                  <input ref={quantityRef} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} onKeyDown={(event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addButtonRef.current?.focus();
            }
        }} className="wk-input wk-ltr-data mt-2 text-center"/>
                  {selectedMedicine ? (<p className="mt-1 text-[11px] font-bold text-slate-500">
                      {tr('Base stock quantity', 'مقدار پایه موجودی')}: <span className="wk-ltr-data">{formatNumber(selectedBaseQuantity)} {getMedicineBaseUnit(selectedMedicine)}</span>
                    </p>) : null}
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-500">{tr('Sale unit', 'واحد فروش')}</label>
                  <select value={selectedSaleUnit.unitName} onChange={(event) => {
            const nextUnit = resolveSaleUnit(selectedMedicine, event.target.value);
            setSelectedSaleUnitName(nextUnit.unitName);
            if (selectedMedicine) {
                setCustomUnitPrice(String(getSalesModeUnitPrice(selectedMedicine, salesMode, nextUnit.unitName)));
            }
        }} disabled={!selectedMedicine || readOnly} className="wk-select mt-2">
                    {selectedSaleUnits.map((unit) => (<option key={unit.unitName} value={unit.unitName}>
                        {formatSaleUnitOption(unit)}
                      </option>))}
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-500">{tr('Line discount', 'تخفیف سطر')}</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="number" value={lineDiscountAmount} onChange={(event) => setLineDiscountAmount(event.target.value)} className="wk-input wk-ltr-data text-center" min="0" placeholder={tr('Amount', 'مبلغ')}/>
                    <input type="number" value={lineDiscountPercent} onChange={(event) => setLineDiscountPercent(event.target.value)} className="wk-input wk-ltr-data text-center" min="0" max="100" step="0.1" placeholder="%"/>
                  </div>
                </div>

                <div className="flex items-end">
                  <Button ref={addButtonRef} onClick={handleAddItem} disabled={!selectedMedicineId || readOnly} variant="primary" className="w-full justify-center py-2.5 text-[15px] font-black">
                    {tr('Add line', 'افزودن سطر')}
                  </Button>
                </div>
              </div>

              {selectedMedicine ? (<div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/85 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-900">{selectedMedicine.name}</span>
                    {selectedMedicine.barcode ? <span className="wk-ltr-data rounded-full border border-neutral-200 bg-white px-2 py-1 text-[11px] font-black text-neutral-600">{selectedMedicine.barcode}</span> : null}
                    <span className="text-[13px] font-semibold text-slate-500">{selectedMedicine.genericName || selectedMedicine.manufacturer || '-'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600">
                    <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1">{tr('Stock', 'موجودی')}: <span className="wk-ltr-data font-black text-slate-900">{formatNumber(selectedMedicineStock)}</span></span>
                    {linePreviewDiscount > 0 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1">{tr('Discount', 'تخفیف')}: <span className="wk-ltr-data font-black text-amber-800">{formatMoney(linePreviewDiscount)}</span></span> : null}
                    <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1">{tr('Preview', 'پیش‌نمایش')}: <span className="wk-ltr-data font-black text-slate-900">{formatMoney(linePreviewTotal)}</span></span>
                    <span className="inline-flex items-center gap-1">
                      <NewFeatureBadge data-testid="sales-fefo-new-badge"/>
                      <InfoIconButton label={tr('FEFO suggests the nearest expiry batch first.', 'FEFO نزدیک‌ترین batch دارای انقضا را اول پیشنهاد می‌کند.')} className="h-7 w-7"/>
                    </span>
                  </div>
                </div>) : null}
            </FlatCard>
            <FlatCard className="overflow-hidden p-0 xl:flex xl:min-h-0 xl:flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-black text-slate-900">{tr('Cart', 'سبد فروش')}</h2>
                  <InfoIconButton label={tr('The cart stays visible beside checkout so the cashier sees line items and the final amount together.', 'سبد کنار تسویه می‌ماند تا صندوقدار سطرها و مبلغ نهایی را هم‌زمان ببیند.')}/>
                </div>
                {invoiceItems.length > 0 ? (<Button variant="ghost" size="sm" onClick={() => onUpdateDraft({ items: [] })} disabled={readOnly}>
                    {tr('Clear cart', 'پاک‌کردن سبد')}
                  </Button>) : null}
              </div>

              <div className="overflow-x-auto xl:min-h-0 xl:flex-1 xl:max-h-[calc(100dvh-22rem)] xl:overflow-auto">
                <table className="min-w-full text-[15px]">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-right text-[13px] font-black uppercase tracking-[0.16em] text-slate-500">{t.medicineName}</th>
                      <th className="px-4 py-3 text-center text-[13px] font-black uppercase tracking-[0.16em] text-slate-500">{t.qty}</th>
                      <th className="px-4 py-3 text-center text-[13px] font-black uppercase tracking-[0.16em] text-slate-500">{t.sellPrice}</th>
                      <th className="px-4 py-3 text-center text-[13px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Discount', 'تخفیف')}</th>
                      <th className="px-4 py-3 text-center text-[13px] font-black uppercase tracking-[0.16em] text-slate-500">{t.total}</th>
                      <th className="px-4 py-3 text-center text-[13px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Partner', 'شریک')}</th>
                      <th className="px-4 py-3 text-center text-[13px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Action', 'اقدام')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {displayInvoiceLines.map((displayLine) => {
            const item = displayLine.item;
            const medicine = medicines.find((entry) => entry.id === item.medicineId);
            const batch = medicine?.batches.find((entry) => entry.id === item.batchId) || medicine?.batches[0];
            const itemDiscount = getInvoiceDisplayLineDiscount(displayLine, currencyCode);
            const itemLineTotal = getInvoiceDisplayLineTotal(displayLine, currencyCode);
            const itemCostTotal = displayLine.sourceItems.reduce((sum, sourceItem) => {
                const sourceBatch = medicine?.batches.find((entry) => entry.id === sourceItem.batchId);
                const cost = typeof sourceItem.costPrice === 'number' ? sourceItem.costPrice : (sourceBatch?.purchasePrice || 0);
                return sum + (cost * getInvoiceItemBaseQuantity(sourceItem));
            }, 0);
            const isLoss = itemCostTotal > 0 && itemLineTotal < itemCostTotal;
            const batchIds = Array.from(new Set(displayLine.sourceItems.map((sourceItem) => sourceItem.batchId).filter(Boolean)));
            const ownershipKeys = new Set(displayLine.sourceItems.map((sourceItem) => (sourceItem.partnerId || batchOwnerById.get(sourceItem.batchId) || 'store')));
            const onlyOwnershipKey = ownershipKeys.size === 1 ? Array.from(ownershipKeys)[0] : '';
            const linePartner = onlyOwnershipKey && onlyOwnershipKey !== 'store'
                ? partnerById.get(onlyOwnershipKey) || null
                : null;
            return (<tr key={displayLine.key} className={classNames('align-top transition hover:bg-brand-50/40', isLoss && 'bg-danger-50/70')}>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-slate-900">{getMedicineName(item.medicineId)}</span>
                              {isLoss ? <StatusBadge tone="danger">{t.sellingLoss}</StatusBadge> : null}
                              {displayLine.isGrouped || item.isAutoBatchSplit ? <StatusBadge tone="info">{tr('Auto batch split', 'تقسیم خودکار بچ')}</StatusBadge> : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-[13px] font-semibold text-slate-500">
                              {batchIds.length > 1 ? (<span>{tr(`${batchIds.length} batches`, `${formatNumber(batchIds.length)} بچ`)}</span>) : batch?.batchNumber ? <span className="wk-ltr-data">{batch.batchNumber}</span> : null}
                              {medicine?.barcode ? <span className="wk-ltr-data">{medicine.barcode}</span> : null}
                            </div>
                          </td>
                          <td className="wk-ltr-data px-4 py-3 text-center font-black text-slate-900">
                            {formatNumber(item.quantity)}
                            <span className="ml-1 text-[11px] font-bold text-slate-500">{describeInvoiceItemUnit(item, isEnglish)}</span>
                          </td>
                          <td className="wk-ltr-data px-4 py-3 text-center font-semibold text-slate-700">{formatMoney(item.price)}</td>
                          <td className="wk-ltr-data px-4 py-3 text-center font-semibold text-amber-700">{itemDiscount > 0 ? formatMoney(itemDiscount) : '-'}</td>
                          <td className="wk-ltr-data px-4 py-3 text-center font-black text-brand-700">{formatMoney(itemLineTotal)}</td>
                          <td className="px-4 py-3 text-center">
                            {ownershipKeys.size > 1 ? (<StatusBadge tone="warning">{tr('Mixed', 'ترکیبی')}</StatusBadge>) : linePartner ? (<StatusBadge tone="info">{linePartner.name}</StatusBadge>) : (<span className="text-xs font-semibold text-slate-400">{tr('Store', 'فروشگاه')}</span>)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveDisplayLine(displayLine)} disabled={readOnly} className="px-2 text-danger-700 hover:bg-danger-50">
                              {tr('Remove', 'حذف')}
                            </Button>
                          </td>
                        </tr>);
        })}

                    {invoiceItems.length === 0 ? (<tr>
                        <td colSpan={7} className="px-4 py-7">
                          <EmptyStateShell title={tr('Cart is empty', 'سبد خالی است')} description={tr('Use the search field above and add the first line.', 'از فیلد جستجوی بالا استفاده کنید و اولین سطر را اضافه نمایید.')} className="py-8"/>
                        </td>
                      </tr>) : null}
                  </tbody>
                </table>
              </div>
            </FlatCard>
          </div>

          <div className="space-y-3 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-8.5rem)] xl:self-start xl:overflow-auto xl:pr-1">
            <FlatCard className="p-3.5">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-black text-slate-900">{tr('Checkout', 'تسویه')}</h2>
                  <InfoIconButton label={tr('Customer, totals, payment, and confirmation stay together here in one compact panel.', 'مشتری، جمع‌ها، پرداخت و تأیید نهایی در یک پنل فشرده کنار هم نگه داشته شده‌اند.')}/>
                </div>
                <div className="wk-ltr-data rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[15px] font-black text-slate-700">
                  {settings.invoiceNumbering?.type === 'manual' ? (<input type="number" placeholder="#" value={manualInvoiceNumber || ''} onChange={(event) => setManualInvoiceNumberState(Number.isFinite(parseInt(event.target.value, 10)) ? parseInt(event.target.value, 10) : undefined)} className="w-24 bg-transparent text-center outline-hidden"/>) : (<span>#{currentInvoiceNumber}</span>)}
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <div className="relative">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[13px] font-black text-slate-500">{t.customer}</label>
                    <div className={classNames("flex h-7 items-center justify-center rounded-full px-3.5 transition-colors", isStep2Active ? "bg-gradient-to-r from-brand-600 to-brand-500 shadow-[0_2px_10px_-2px_rgba(var(--color-brand-600),0.4)]" : "bg-neutral-100 border border-neutral-200")}><span className={classNames("text-[11px] font-black", isStep2Active ? "text-white" : "text-neutral-500")}>
                      {selectedCustomer ? tr('Step 2 done', 'مرحله ۲ کامل') : tr('Step 2', 'مرحله ۲')}
                    </span>
                  </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input ref={customerInputRef} type="text" value={customerSearchTerm} onChange={(event) => {
            const nextValue = event.target.value;
            setCustomerSearchTermState(nextValue);
            setSelectedCustomerIdState(resolveCustomerIdFromInput(nextValue));
            setShowCustomerSuggestions(true);
        }} onKeyDown={handleCustomerKeyDown} placeholder={tr('Name or phone number', 'نام یا شماره تلفن')} className="wk-input"/>
                    <Button variant="secondary" disabled={readOnly} onClick={() => {
            setNewClientName(customerSearchTerm);
            setIsCustomerQuickAddOpen((current) => !current);
            setShowCustomerSuggestions(false);
        }} className="shrink-0 px-3" title={t.addNewCustomer}>
                      +
                    </Button>
                  </div>

                  {showCustomerSuggestions ? (<div className="absolute z-40 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-[0_22px_48px_-28px_rgba(15,23,42,0.35)]">
                      {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (<button key={customer.id} type="button" onClick={() => {
                    setSelectedCustomerIdState(customer.id);
                    setCustomerSearchTermState(customer.name);
                    setShowCustomerSuggestions(false);
                    searchInputRef.current?.focus();
                }} className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 text-right transition hover:bg-brand-50 last:border-b-0">
                          <span className="font-black text-slate-900">{customer.name}</span>
                          <span className="wk-ltr-data text-[13px] font-semibold text-slate-500">{customer.phone || '-'}</span>
                        </button>)) : (<button type="button" onClick={() => {
                    setNewClientName(customerSearchTerm);
                    setIsCustomerQuickAddOpen(true);
                    setShowCustomerSuggestions(false);
                }} className="w-full px-4 py-4 text-right text-[15px] font-black text-brand-700 transition hover:bg-brand-50">
                          {tr('Add this customer quickly', 'افزودن سریع این مشتری')}
                        </button>)}
                    </div>) : null}
                </div>

                {isCustomerQuickAddOpen ? (<FlatCard className="rounded-2xl border-neutral-200 bg-neutral-50/80 p-3">
                    <form onSubmit={handleQuickAddClient} className="space-y-3">
                      <div>
                        <label className="block text-[13px] font-black text-slate-500">{t.customerName}</label>
                        <input type="text" value={newClientName} onChange={(event) => setNewClientName(event.target.value)} className="wk-input mt-2" placeholder={tr('Customer name', 'نام مشتری')} autoFocus required disabled={readOnly}/>
                      </div>
                      <div>
                        <label className="block text-[13px] font-black text-slate-500">{t.phoneNumber}</label>
                        <input type="text" value={newClientPhone} onChange={(event) => setNewClientPhone(event.target.value)} className="wk-input wk-ltr-data mt-2" dir="ltr" placeholder="07..." disabled={readOnly}/>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" type="button" onClick={() => setIsCustomerQuickAddOpen(false)}>
                          {t.cancel}
                        </Button>
                        <Button variant="primary" type="submit" disabled={readOnly}>
                          {t.save}
                        </Button>
                      </div>
                    </form>
                  </FlatCard>) : null}

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3">
                  <label className="block text-[13px] font-black text-slate-500">{tr('Partner account', 'حساب شریک')}</label>
                  <select value={selectedPartnerId || ''} onChange={(event) => setSelectedPartnerId(event.target.value)} className="wk-select mt-2" disabled={readOnly}>
                    <option value="">{tr('Auto from batch / store stock', 'خودکار از بچ / موجودی فروشگاه')}</option>
                    {activePartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                  </select>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    {tr('Lines inherit the partner from the sold batch; this field only applies to stock without a partner.', 'سطرها شریک را از بچِ فروخته‌شده می‌گیرند؛ این انتخاب فقط برای موجودی بدون شریک استفاده می‌شود.')}
                  </p>
                </div>

                {(!isCustomerExpanded && !isTotalsExpanded) ? (<div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                    <div onClick={toggleCustomer} className="flex flex-col justify-between cursor-pointer rounded-xl border border-neutral-200 bg-white p-2.5 transition-colors hover:bg-neutral-50 shadow-sm">
                      <div className="flex w-full items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black text-slate-900">{tr('Customer', 'مشتری')}</span>
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-slate-500">
                           <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                      </div>
                      <div className="flex items-center justify-start rounded-lg bg-neutral-50 border border-neutral-100 px-2 py-1.5">
                        <span className="truncate text-[13px] font-bold text-slate-700">
                          {selectedCustomer ? selectedCustomer.name : tr('None', '-')}
                        </span>
                      </div>
                    </div>

                    <div onClick={toggleTotals} className="flex flex-col justify-between cursor-pointer rounded-xl border border-neutral-200 bg-white p-2.5 transition-colors hover:bg-neutral-50 shadow-sm">
                      <div className="flex w-full items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black text-slate-900">{tr('Totals', 'جمع‌ها')}</span>
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-50 border border-neutral-100 text-slate-500">
                           <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                      </div>
                      <div className="flex items-center justify-start rounded-lg bg-neutral-50 border border-neutral-100 px-2 py-1.5">
                        <span className="wk-ltr-data truncate text-[13px] font-black text-brand-700">
                          {formatMoney(finalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>) : (<div className="flex flex-col gap-2 animate-in fade-in duration-200">
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3 transition-all duration-300">
                      <div className="flex cursor-pointer items-center justify-between gap-2" onClick={toggleCustomer}>
                        <div className="flex items-center gap-3 w-full justify-between pr-2">
                          <h3 className="text-[15px] font-black text-slate-900">{tr('Customer', 'مشتری')}</h3>
                          {!isCustomerExpanded && selectedCustomer && (<span className="truncate text-[13px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-neutral-200">
                              {selectedCustomer.name}
                            </span>)}
                        </div>
                        <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-slate-500 hover:bg-neutral-100 transition-colors" title={isCustomerExpanded ? tr('Collapse', 'بستن') : tr('Expand', 'باز کردن')}>
                          {isCustomerExpanded ? (<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>) : (<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>)}
                        </button>
                      </div>

                      {selectedCustomer ? (<div className={classNames("mt-2 flex flex-row items-center justify-between gap-3", !isCustomerExpanded && "hidden")}>
                          <div className="flex flex-col flex-1 truncate">
                            <p className="truncate font-black text-slate-900" title={selectedCustomer.name}>{selectedCustomer.name}</p>
                            <StatusBadge className="mt-1 w-max" tone={selectedCustomer.balance > 0 ? 'warning' : selectedCustomer.balance < 0 ? 'success' : 'neutral'}>   
                              {selectedCustomer.balance > 0 ? tr('Outstanding', 'مانده حساب') : selectedCustomer.balance < 0 ? tr('Advance', 'بستانکار') : tr('Settled', 'تسویه')}
                            </StatusBadge>
                          </div>
                          <p className="wk-ltr-data text-[15px] font-black text-slate-900 shrink-0 whitespace-nowrap bg-white px-3 py-1.5 rounded-xl border border-neutral-200">
                            {formatMoney(Math.abs(selectedCustomer.balance || 0))}
                          </p>
                        </div>) : (<div className={classNames("mt-2 text-[13px] font-semibold text-slate-500", !isCustomerExpanded && "hidden")}>
                          {tr('No customer', 'انتخاب نشده')}
                        </div>)}
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 transition-all duration-300">
                      <div className="flex cursor-pointer items-center justify-between gap-1" onClick={toggleTotals}>
                        <div className="flex items-center gap-3 w-full justify-between pr-2">
                          <h3 className="text-[15px] font-black text-slate-900">{tr('Totals', 'جمع‌ها')}</h3>
                          {!isTotalsExpanded && (<span className="wk-ltr-data text-[13px] font-black text-brand-700 bg-white px-2 py-0.5 rounded-md border border-brand-100">
                              {formatMoney(finalAmount)}
                            </span>)}
                        </div>
                        <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-slate-500 hover:bg-neutral-100 transition-colors" title={isTotalsExpanded ? tr('Collapse', 'بستن') : tr('Expand', 'باز کردن')}>
                          {isTotalsExpanded ? (<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>) : (<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>)}
                        </button>
                      </div>
                      
                      {isTotalsExpanded ? (<div className="mt-3 text-[13px] font-semibold text-slate-600 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 gap-3 items-center">
                          <div className="flex flex-col gap-2 p-2 bg-white rounded-xl border border-neutral-200">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">{t.total}</span>
                            <span className="wk-ltr-data font-black text-slate-900">{formatMoney(total)}</span>
                          </div>
                          <div className="flex flex-col gap-2 p-2 bg-white rounded-xl border border-neutral-200">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">{tr('Final', 'نهایی')}</span>
                            <span className="wk-ltr-data font-black text-brand-700">{formatMoney(finalAmount)}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-neutral-200">
                             <span className="text-slate-500">{t.discount}</span>
                             <input type="number" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} placeholder="0" className="wk-input wk-ltr-data w-20 p-1 text-center bg-neutral-50 !border-transparent" min="0"/>
                        </div>
                        {lineDiscountTotal > 0 ? (<div className="mt-2 flex items-center justify-between gap-2 p-2 bg-amber-50 rounded-xl border border-amber-200">
                            <span className="text-amber-700">{tr('Line discounts', 'تخفیف سطرها')}</span>
                            <span className="wk-ltr-data font-black text-amber-800">{formatMoney(lineDiscountTotal)}</span>
                          </div>) : null}
                        <div className="mt-2 flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-neutral-200">
                             <span className="text-slate-500">{tr('Tax(%)', '% مالیه')}</span>
                             <input type="number" value={customTaxRate} onChange={(event) => setCustomTaxRate(Number(event.target.value))} placeholder="0" className="wk-input wk-ltr-data w-16 p-1 text-center bg-neutral-50 !border-transparent" step="0.1" min="0" max="100"/>
                        </div>

                        {calculationError && (<div className="mt-2 rounded-xl border border-danger-200 bg-danger-50 p-2 text-[10px] text-danger-700">
                            {calculationError}
                          </div>)}
                      </div>) : null}
                    </div>
                  </div>)}

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-black text-slate-900">{tr('Payment and Confirmation', 'پرداخت و تأیید')}</h3>
                      <InfoIconButton label={tr('Choose payment type, optionally enter received amount and due date, then print the invoice.', 'نوع پرداخت را انتخاب کنید، در صورت نیاز مبلغ دریافتی و سررسید را وارد نمایید و سپس فاکتور را چاپ کنید.')} className="h-7 w-7"/>
                    </div>
                    
                    <div className={classNames("flex h-7 items-center justify-center rounded-full px-3.5 transition-colors", isFinalStepActive
            ? "bg-gradient-to-r from-brand-600 to-brand-500 shadow-[0_2px_10px_-2px_rgba(var(--color-brand-600),0.4)]"
            : "bg-neutral-100 border border-neutral-200")}>
                      <span className={classNames("text-[11px] font-black", isFinalStepActive ? "text-white" : "text-neutral-500")}>
                        {tr('Final Step', 'مرحله آخر')}
                      </span>
                    </div>

                  </div>
                  <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-[13px] font-black text-slate-500">{t.paymentType}</label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(['cash', 'card', 'mixed', 'credit', 'partial'] as SalesDraft['paymentType'][]).map((type) => (<button key={type} type="button" disabled={readOnly} onClick={() => setPaymentType(type)} className={classNames('wk-focus-ring rounded-xl border px-2.5 py-2 text-[13px] font-black transition disabled:cursor-not-allowed disabled:opacity-50', paymentType === type
                ? type === 'cash'
                    ? 'border-success-500 bg-success-500 text-white'
                    : type === 'card'
                        ? 'border-sky-500 bg-sky-500 text-white'
                        : type === 'mixed'
                            ? 'border-violet-500 bg-violet-500 text-white'
                            : type === 'credit'
                                ? 'border-danger-500 bg-danger-500 text-white'
                                : 'border-warning-500 bg-warning-500 text-white'
                : 'border-neutral-200 bg-white text-slate-600 hover:bg-neutral-50')}>
                        {type === 'cash'
                ? t.cash
                : type === 'card'
                    ? tr('Card', 'کارت')
                    : type === 'mixed'
                        ? tr('Mixed', 'ترکیبی')
                        : type === 'credit'
                            ? t.credit
                            : t.partial}
                      </button>))}
                  </div>
                </div>

                {paymentType === 'partial' ? (<div>
                    <label className="block text-[13px] font-black text-slate-500">{tr('Received amount', 'مبلغ دریافتی')}</label>
                    <input ref={amountPaidRef} type="number" value={amountPaidInput} onChange={(event) => setAmountPaidInput(Number(event.target.value))} className="wk-input wk-ltr-data mt-2 text-center" placeholder="0"/>
                  </div>) : null}

                {paymentType === 'mixed' ? (<div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[13px] font-black text-slate-500">{tr('Cash amount', 'مبلغ نقد')}</label>
                      <input type="number" value={cashAmountInput} onChange={(event) => setCashAmountInput(Number(event.target.value))} className="wk-input wk-ltr-data mt-2 text-center" min="0" placeholder="0"/>
                    </div>
                    <div>
                      <label className="block text-[13px] font-black text-slate-500">{tr('Card amount', 'مبلغ کارت')}</label>
                      <input type="number" value={cardAmountInput} onChange={(event) => setCardAmountInput(Number(event.target.value))} className="wk-input wk-ltr-data mt-2 text-center" min="0" placeholder="0"/>
                    </div>
                  </div>) : null}

                {remainingPreview > 0 ? (<div>
                    <label className="block text-[13px] font-black text-slate-500">{t.dueDate}</label>
                    <input type="date" value={dueDate || ''} onChange={(event) => setDueDate(event.target.value)} className="wk-input wk-ltr-data mt-2"/>
                  </div>) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Paid amount', 'مبلغ پرداختی')}</p>
                    <p className="wk-ltr-data mt-1.5 text-[17px] font-black text-slate-900">{formatMoney(paidPreview)}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Remaining amount', 'مانده')}</p>
                    <p className="wk-ltr-data mt-1.5 text-[17px] font-black text-slate-900">{formatMoney(remainingPreview)}</p>
                  </div>
                </div>

                {actionFeedback && (<div className={classNames('rounded-2xl border px-3 py-2 text-[15px] font-semibold animate-in fade-in slide-in-from-top-1', actionFeedback.tone === 'success'
                ? 'border-success-200 bg-success-50/80 text-success-800'
                : actionFeedback.tone === 'warning'
                    ? 'border-warning-200 bg-warning-50/80 text-warning-800'
                    : 'border-danger-200 bg-danger-50/80 text-danger-800')}>
                    {actionFeedback.text}
                  </div>)}

                <Button onClick={handleActionSubmit} variant="primary" disabled={!canSubmit} aria-label={`${t.print} (F10)`} className="w-full justify-center py-3 text-[17px] font-black">
                  {isSubmittingInvoice
            ? tr('Saving...', 'در حال ذخیره...')
            : isCalculatingTotals
                ? tr('Calculating...', 'در حال محاسبه...')
                : `${t.print} (F10)`}
                </Button>
                  </div>
                </div>
              </div>
            </FlatCard>
          </div>
        </div>

        {createdInvoice ? (<InvoicePrintModal invoice={createdInvoice} customer={customers.find((customer) => customer.id === createdInvoice.customerId)!} medicines={medicines} onClose={() => setCreatedInvoice(null)} settings={settings} autoPrint={true}/>) : null}
      </div>
    </PageSurface>);
};
