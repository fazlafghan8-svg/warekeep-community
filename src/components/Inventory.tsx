import React, { useEffect, useMemo, useState } from 'react';
import { Batch, Medicine, MedicineType, AppUser, Invoice, Customer, AppSettings, Expense, Purchase, Supplier, Partner, MedicineProcurementDraftRequest, InventoryLinkedSyncTargets } from '../types';
import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AddMedicineModal } from './AddMedicineModal';
import { MedicineDetailsModal } from './MedicineDetailsModal';
import { PriceListBuilderModal } from './PriceListBuilderModal';
import { WasteModal, type WasteConfirmPayload } from './WasteModal';
import { Button } from './ui/Button';
import { InlineAlert } from './ui/InlineAlert';
import { NewFeatureHint } from './ui/NewFeatureHint';
import { Modal } from './ui/Modal';
import { EmptyStateShell, LoadingSkeletonShell } from './ui/StateShell';
import { StatusBadge, type StatusBadgeTone } from './ui/StatusBadge';
import { FlatCard } from './ui/Surface';
import { getMedicineTypeLabel } from '../utils/localization';
import { ThreeDotsIcon, AiSparklesIcon } from './icons/Icons';
import { getTranslation } from '../utils/translations';
import { formatMedicineExpiryDate, getSalesModeLabel, resolveSalesModePrice } from '../lib/formatters';
import { checkLimit } from "../services/localAccessPolicy";
import { MEDICINE_TYPES } from '../constants/medicineTypes';
import { getMedicineUnitLabel, getMedicineUnitOptions, isPackageLikeMedicineUnit, normalizeMedicineUnitName, withCustomMedicineUnit } from '../constants/medicineUnits';
import { resolveDefaultSalesMode } from '../constants/sales';
import { ActiveFilterChip, FilterField, FilterSelectField, FilterSegmentedControl } from './ui/UnifiedFilterBar';
import { buildManufacturerDirectory, canonicalizeManufacturerName, matchesManufacturerSearch } from '../utils/manufacturerCanonicalization';
import { normalizeSaleUnits } from '../utils/unitConversion';
import { classNames } from '../utils/classNames';
import type { PriceListRowInput } from '../utils/priceListGenerator';
interface InventoryProps {
    medicines: Medicine[];
    addMedicine: (medicine: Omit<Medicine, 'id'>) => boolean | void | Promise<boolean | void>;
    onAddMedicineWithProcurementDraft?: (payload: MedicineProcurementDraftRequest) => boolean | void | Promise<boolean | void>;
    updateMedicine: (id: string, updatedData: Partial<Medicine>, syncTargets?: InventoryLinkedSyncTargets) => void;
    deleteMedicine?: (id: string) => void;
    restoreArchivedMedicine?: (id: string) => void;
    purgeArchivedMedicine?: (id: string) => void;
    updateBatch: (medicineId: string, batchId: string, updatedBatchData: Partial<Batch>, syncTargets?: InventoryLinkedSyncTargets) => void;
    addBatch: (medicineId: string, newBatchData: Omit<Batch, 'id' | 'history'>) => void;
    deleteBatch?: (medicineId: string, batchId: string) => void;
    activeAppUser?: AppUser | null;
    invoices?: Invoice[];
    customers?: Customer[];
    suppliers?: Supplier[];
    purchases?: Purchase[];
    partners?: Partner[];
    settings?: AppSettings;
    onSaveSettings?: (settings: AppSettings) => boolean | void | Promise<boolean | void>;
    onGoToSuppliers?: () => void;
    addExpense?: (expense: Omit<Expense, 'id'>) => void;
    onTransferInvoices?: (ids: string[], newUserId: string) => void;
    onReturnItem?: (invoiceId: string, itemIndex: number, options: {
        quantity: number;
        amountRefunded?: number;
        debtReduction?: number;
        reason?: string;
        paymentMethod?: 'cash' | 'card' | 'mixed' | 'credit';
    }) => void | Promise<void>;
    // NEW: Vendor Credit / Return hook stays optional so the existing waste flow remains intact.
    onRecordVendorReturn?: (args: {
        medicineId: string;
        medicineName: string;
        batchId: string;
        quantity: number;
        reason: string;
        description: string;
        purchasePrice: number;
        amount?: number;
        supplierId?: string;
        resolution?: 'vendor_credit' | 'refund' | 'replacement';
    }) => Promise<boolean>;
    onRecordStockWaste?: (args: {
        medicineId: string;
        batchId: string;
        quantity: number;
        reason: 'expired' | 'damaged' | 'lost' | 'internal_use';
        description?: string;
        costPerUnit: number;
        idempotencyKey: string;
    }) => Promise<boolean>;
    onStartPurchaseReceipt?: (context: {
        medicineId: string;
        medicineName: string;
        preferredSupplierId?: string;
    }) => void;
    requestedFilter?: InventoryFilter | null;
    onRequestedFilterApplied?: () => void;
    readOnly?: boolean;
    isGuestTrial?: boolean;
    canStartGuestAiRequest?: () => boolean;
    onGuestAiSuccess?: () => void;
}
const CATEGORIES: (MedicineType | 'ALL')[] = ['ALL', ...MEDICINE_TYPES];
const ITEMS_PER_PAGE = 50;
const EXPIRY_SOON_DAYS = 30;
const COMPOSITION_PREVIEW_SEGMENTS = 2;
const COMPOSITION_PREVIEW_CHARS = 54;
type IconProps = {
    className?: string;
};
type SecondaryTextPreview = {
    fullText: string;
    visibleText: string;
    isTruncated: boolean;
};
type InventoryMedicineRow = {
    medicine: Medicine;
    canonicalManufacturer: string;
    searchText: string;
    totalQuantity: number;
    nextExpiry: string | null;
    nearExpiry: boolean;
    averagePurchasePrice: number;
    totalPurchaseValue: number;
    secondaryPreview: SecondaryTextPreview;
};
type CompanyFilterLayout = {
    left: number;
    width: number;
    maxHeight: number;
    scrollerMaxHeight: number;
    placement: 'top' | 'bottom';
    top?: number;
    bottom?: number;
};
type CompositionTooltipLayout = {
    top: number;
    left: number;
    width: number;
    placement: 'top' | 'bottom';
};
type ActionMenuLayout = {
    top: number;
    left: number;
    width: number;
    placement: 'top' | 'bottom';
};
export type InventoryFilter = 'ALL' | 'AVAILABLE' | 'LOW' | 'EXPIRING' | 'OUT' | 'ARCHIVED';
type InventoryNotice = {
    tone: 'info' | 'success' | 'warning' | 'danger';
    title: string;
    message: string;
};
type InventoryTableViewMode = 'default' | 'zoom';
type CommandSurfacePreferenceKey = 'advancedFilters' | 'quickScope';
type InventoryCommandSurfacePreferenceState = {
    toggleCount: number;
    learned: boolean;
    isOpen: boolean;
};
type InventoryCommandSurfacePreferences = {
    advancedFilters: InventoryCommandSurfacePreferenceState;
    quickScope: InventoryCommandSurfacePreferenceState;
};
const COMPANY_FILTER_VIEWPORT_PADDING = 16;
const COMPANY_FILTER_GAP = 8;
const COMPANY_FILTER_HEADER_HEIGHT = 44;
const COMPANY_FILTER_TARGET_WIDTH = 420;
const COMPANY_FILTER_MAX_HEIGHT = 360;
const INVENTORY_COMMAND_SURFACE_STORAGE_KEY = 'wk.inventory.command-surface.v1';
const QUICK_CUSTOM_UNIT_VALUE = '__custom_unit__';
const SearchIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <circle cx="11" cy="11" r="7"/>
    <path d="m20 20-3.5-3.5" strokeLinecap="round"/>
  </svg>);
const PlusIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
  </svg>);
const PillIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M8.3 15.7a4.8 4.8 0 0 1 0-6.8l2.6-2.6a4.8 4.8 0 1 1 6.8 6.8l-2.6 2.6a4.8 4.8 0 0 1-6.8 0Z"/>
    <path d="m9.7 8.7 5.6 5.6" strokeLinecap="round"/>
  </svg>);
const ShelfIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <rect x="3.5" y="4" width="17" height="16" rx="3"/>
    <path d="M8 8h.01M12 8h.01M16 8h.01M7 13h10M7 17h6" strokeLinecap="round"/>
  </svg>);
const AlertIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M12 4 3.7 18.1c-.4.8.2 1.9 1.1 1.9h14.4c.9 0 1.5-1.1 1.1-1.9L12 4Z"/>
    <path d="M12 9v4M12 16h.01" strokeLinecap="round"/>
  </svg>);
const CalendarIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="3"/>
    <path d="M8 3.5V7M16 3.5V7M3.5 9.5h17M8 13h3M8 16h5" strokeLinecap="round"/>
  </svg>);
const FilterIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round"/>
  </svg>);
const QuickScopeIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M5 7h14M5 12h9M5 17h11" strokeLinecap="round"/>
    <circle cx="17" cy="7" r="1.25" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="12" r="1.25" fill="currentColor" stroke="none"/>
    <circle cx="18" cy="17" r="1.25" fill="currentColor" stroke="none"/>
  </svg>);
const ArchiveIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M5 8.5h14M7 8.5v10A2.5 2.5 0 0 0 9.5 21h5a2.5 2.5 0 0 0 2.5-2.5v-10M8 4h8l1.5 4.5h-15L8 4Z" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 13h4" strokeLinecap="round"/>
  </svg>);
const ReturnToInventoryIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M4.5 10 12 4.5 19.5 10" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6.5 9.5V19h11V9.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9.5 19v-5h5v5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15.5 12h-4.2A3.3 3.3 0 0 0 8 15.3" strokeLinecap="round"/>
    <path d="M12.8 9.7 15.5 12l-2.7 2.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
const ExpandViewIcon: React.FC<IconProps> = ({ className = 'h-[18px] w-[18px]' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} aria-hidden="true">
    <path d="M8 4.75H5.75v2.5M18.25 7.25v-2.5H16M7.25 18.25h-2.5v-2.5M16.75 18.25h2.5v-2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
const PriceListIcon: React.FC<IconProps> = ({ className = 'h-[18px] w-[18px]' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M5 4.75h14A1.75 1.75 0 0 1 20.75 6.5v11A1.75 1.75 0 0 1 19 19.25H5A1.75 1.75 0 0 1 3.25 17.5v-11A1.75 1.75 0 0 1 5 4.75Z"/>
    <path d="M7 8.5h10M7 12h5M7 15.5h3M15.5 12.25c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5h-.5a1.5 1.5 0 0 0 0 3h2" strokeLinecap="round"/>
  </svg>);
const CompanyIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
    <path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-4h6v4M9 11h.01M15 11h.01" strokeLinecap="round"/>
  </svg>);
const ChevronIcon: React.FC<IconProps & {
    expanded?: boolean;
}> = ({ className = 'h-4 w-4', expanded = false }) => (<svg className={`${className} transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
const SelectChevronIcon: React.FC<IconProps & {
    expanded?: boolean;
}> = ({ className = 'h-4 w-4', expanded = false }) => (<svg className={`${className} transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path d="m5 7 5 6 5-6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
const trimPreviewText = (value: string, maxChars: number) => {
    if (value.length <= maxChars)
        return value;
    const slice = value.slice(0, maxChars + 1).trim();
    const boundary = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf(' + '), slice.lastIndexOf(' '));
    const cutIndex = boundary >= Math.floor(maxChars * 0.55) ? boundary : maxChars;
    const trimmed = slice
        .slice(0, cutIndex)
        .trim()
        .replace(/[,+\s]+$/g, '')
        .trim();
    return trimmed || value.slice(0, maxChars).trim();
};
const getPreferredTextDirection = (value: string, fallback: 'ltr' | 'rtl'): 'ltr' | 'rtl' => {
    for (const char of value) {
        if (/[A-Za-z]/.test(char))
            return 'ltr';
        if (/[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(char))
            return 'rtl';
    }
    return fallback;
};
export const buildInventorySecondaryPreview = (value?: string | null, maxSegments = COMPOSITION_PREVIEW_SEGMENTS, maxChars = COMPOSITION_PREVIEW_CHARS): SecondaryTextPreview => {
    const fullText = (value || '').replace(/\s+/g, ' ').trim();
    if (!fullText)
        return { fullText: '', visibleText: '', isTruncated: false };
    const segments = fullText
        .split(/\s*(?:,|\+)\s*/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (segments.length > 1) {
        const joiner = fullText.includes(',') ? ', ' : ' + ';
        const segmentPreview = segments.slice(0, maxSegments).join(joiner).trim();
        if (segments.length > maxSegments) {
            return {
                fullText,
                visibleText: trimPreviewText(segmentPreview, maxChars),
                isTruncated: true
            };
        }
    }
    if (fullText.length <= maxChars) {
        return { fullText, visibleText: fullText, isTruncated: false };
    }
    return {
        fullText,
        visibleText: trimPreviewText(fullText, maxChars),
        isTruncated: true
    };
};
const createDefaultCommandSurfacePreferences = (): InventoryCommandSurfacePreferences => ({
    advancedFilters: { toggleCount: 0, learned: false, isOpen: false },
    quickScope: { toggleCount: 0, learned: false, isOpen: false }
});
const normalizeCommandSurfacePreference = (value: unknown): InventoryCommandSurfacePreferenceState => {
    if (!value || typeof value !== 'object') {
        return { toggleCount: 0, learned: false, isOpen: false };
    }
    const candidate = value as Partial<InventoryCommandSurfacePreferenceState>;
    const rawToggleCount = Number(candidate.toggleCount);
    const toggleCount = Number.isFinite(rawToggleCount) ? Math.max(0, Math.trunc(rawToggleCount)) : 0;
    const learned = candidate.learned === true || toggleCount >= 3;
    const isOpen = candidate.isOpen === true;
    return {
        toggleCount,
        learned,
        isOpen: learned ? isOpen : false
    };
};
const readInventoryCommandSurfacePreferences = (): InventoryCommandSurfacePreferences => {
    const defaults = createDefaultCommandSurfacePreferences();
    if (typeof window === 'undefined') {
        return defaults;
    }
    try {
        const raw = window.localStorage.getItem(INVENTORY_COMMAND_SURFACE_STORAGE_KEY);
        if (!raw)
            return defaults;
        const parsed = JSON.parse(raw) as Partial<InventoryCommandSurfacePreferences>;
        return {
            advancedFilters: normalizeCommandSurfacePreference(parsed?.advancedFilters),
            quickScope: normalizeCommandSurfacePreference(parsed?.quickScope)
        };
    }
    catch {
        return defaults;
    }
};
const writeInventoryCommandSurfacePreferences = (preferences: InventoryCommandSurfacePreferences) => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(INVENTORY_COMMAND_SURFACE_STORAGE_KEY, JSON.stringify(preferences));
    }
    catch {
        // Keep the in-memory preference only when persistence is unavailable.
    }
};
export const Inventory: React.FC<InventoryProps> = ({ medicines = [], addMedicine, onAddMedicineWithProcurementDraft, updateMedicine, deleteMedicine, restoreArchivedMedicine, purgeArchivedMedicine, updateBatch, addBatch, deleteBatch, activeAppUser, invoices = [], customers = [], suppliers = [], purchases = [], partners = [], settings, onSaveSettings, onGoToSuppliers, addExpense, onTransferInvoices, onReturnItem, onRecordVendorReturn, onRecordStockWaste, onStartPurchaseReceipt, readOnly = false, requestedFilter = null, onRequestedFilterApplied, isGuestTrial = false, canStartGuestAiRequest, onGuestAiSuccess }) => {
    const t = getTranslation(settings?.language || 'dari');
    const isEnglish = (settings?.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const primarySalesMode = resolveDefaultSalesMode(settings);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [detailsMedicine, setDetailsMedicine] = useState<Medicine | null>(null);
    const [detailsMode, setDetailsMode] = useState<'view' | 'add_batch'>('view');
    const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null);
    const [medicineToRestore, setMedicineToRestore] = useState<Medicine | null>(null);
    const [medicineToPurge, setMedicineToPurge] = useState<Medicine | null>(null);
    const [analysisMedicine, setAnalysisMedicine] = useState<Medicine | null>(null);
    const [wasteMedicine, setWasteMedicine] = useState<Medicine | null>(null);
    const [isInventoryZoomOpen, setIsInventoryZoomOpen] = useState(false);
    const [isPriceListBuilderOpen, setIsPriceListBuilderOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<MedicineType | 'ALL'>('ALL');
    const [selectedCompany, setSelectedCompany] = useState('ALL');
    const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('ALL');
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    const [companyFilterLayout, setCompanyFilterLayout] = useState<CompanyFilterLayout | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [quickUnitEditMedicineId, setQuickUnitEditMedicineId] = useState<string | null>(null);
    const [quickCustomUnitMedicineId, setQuickCustomUnitMedicineId] = useState<string | null>(null);
    const [quickCustomUnitValue, setQuickCustomUnitValue] = useState('');
    const [actionMenuLayout, setActionMenuLayout] = useState<ActionMenuLayout | null>(null);
    const [expandedMedicineId, setExpandedMedicineId] = useState<string | null>(null);
    const [hoveredCompositionId, setHoveredCompositionId] = useState<string | null>(null);
    const [pinnedCompositionId, setPinnedCompositionId] = useState<string | null>(null);
    const [compositionTooltipLayout, setCompositionTooltipLayout] = useState<CompositionTooltipLayout | null>(null);
    const [revealedPurchaseRows, setRevealedPurchaseRows] = useState<Record<string, boolean>>({});
    const [currentPage, setCurrentPage] = useState(1);
    const [pageNotice, setPageNotice] = useState<InventoryNotice | null>(null);
    const [commandSurfacePreferences, setCommandSurfacePreferences] = useState<InventoryCommandSurfacePreferences>(() => readInventoryCommandSurfacePreferences());
    const companyFilterTriggerRef = useRef<HTMLButtonElement>(null);
    const actionMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const compositionPopoverRefs = useRef<Record<string, HTMLSpanElement | null>>({});
    const zoomSearchInputRef = useRef<HTMLInputElement>(null);
    const isReadOnly = !!readOnly;
    const isAdmin = !activeAppUser || activeAppUser.role === 'admin';
    const canCreate = !isReadOnly && (isAdmin || activeAppUser.permissions.includes('create_medicine'));
    const canEdit = !isReadOnly && (isAdmin || activeAppUser.permissions.includes('manage_inventory') || activeAppUser.permissions.includes('edit_medicine'));
    const canDelete = !isReadOnly && !isGuestTrial && (isAdmin || activeAppUser.permissions.includes('delete_medicine'));
    const canManageCommissionRules = !isReadOnly && (isAdmin || activeAppUser.permissions.includes('manage_payroll'));
    const canStockOut = canEdit && !isGuestTrial;
    const canViewPurchasePrice = isAdmin || activeAppUser.permissions.includes('view_purchase_price');
    const canViewDetails = isAdmin || activeAppUser.permissions.includes('view_medicine_details');
    const activeMedicines = useMemo(() => medicines.filter((medicine) => !medicine.isDeleted), [medicines]);
    const archivedMedicines = useMemo(() => medicines.filter((medicine) => medicine.isDeleted), [medicines]);
    const medicineUnitOptions = useMemo(() => getMedicineUnitOptions(settings, medicines.map((medicine) => medicine.unit)), [medicines, settings]);
    const medicineRowsSource = inventoryFilter === 'ARCHIVED' ? archivedMedicines : activeMedicines;
    const activeMedicineCount = activeMedicines.length;
    const archivedMedicineCount = archivedMedicines.length;
    const isFiltering = searchTerm !== debouncedSearchTerm;
    const applyInventoryFilter = useCallback((filter: InventoryFilter) => {
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setSelectedCategory('ALL');
        setSelectedCompany('ALL');
        setInventoryFilter(filter);
        setIsCompanyFilterOpen(false);
        setOpenMenuId(null);
        setHoveredCompositionId(null);
        setPinnedCompositionId(null);
        setCurrentPage(1);
    }, []);
    useEffect(() => {
        if (!requestedFilter)
            return;
        applyInventoryFilter(requestedFilter);
        onRequestedFilterApplied?.();
    }, [applyInventoryFilter, onRequestedFilterApplied, requestedFilter]);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
        return () => window.clearTimeout(timer);
    }, [searchTerm]);
    useEffect(() => {
        if (!pageNotice || (pageNotice.tone !== 'success' && pageNotice.tone !== 'info')) {
            return;
        }
        const timer = window.setTimeout(() => setPageNotice(null), 4200);
        return () => window.clearTimeout(timer);
    }, [pageNotice]);
    useEffect(() => {
        if (!isInventoryZoomOpen)
            return;
        const timer = window.setTimeout(() => {
            zoomSearchInputRef.current?.focus();
        }, 40);
        return () => window.clearTimeout(timer);
    }, [isInventoryZoomOpen]);
    useEffect(() => {
        setCurrentPage(1);
        setExpandedMedicineId(null);
    }, [debouncedSearchTerm, selectedCategory, selectedCompany, inventoryFilter]);
    useEffect(() => {
        setHoveredCompositionId(null);
        setPinnedCompositionId(null);
        setIsCompanyFilterOpen(false);
    }, [debouncedSearchTerm, selectedCategory, selectedCompany, inventoryFilter, currentPage]);
    const setCompositionPopoverRef = useCallback((medicineId: string, node: HTMLSpanElement | null) => {
        if (node) {
            compositionPopoverRefs.current[medicineId] = node;
            return;
        }
        delete compositionPopoverRefs.current[medicineId];
    }, []);
    const setActionMenuButtonRef = useCallback((medicineId: string, node: HTMLButtonElement | null) => {
        if (node) {
            actionMenuButtonRefs.current[medicineId] = node;
            return;
        }
        delete actionMenuButtonRefs.current[medicineId];
    }, []);
    const buildActionMenuLayout = useCallback((anchor: HTMLElement | null): ActionMenuLayout | null => {
        if (typeof window === 'undefined' || !anchor) {
            return null;
        }
        const rect = anchor.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportPadding = 12;
        const gap = 8;
        const width = 224;
        const estimatedHeight = 220;
        const placeAbove = viewportHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
        const leftBase = isEnglish ? rect.right - width : rect.left;
        const left = Math.max(viewportPadding, Math.min(leftBase, viewportWidth - width - viewportPadding));
        return {
            top: placeAbove ? rect.top - gap : rect.bottom + gap,
            left,
            width,
            placement: placeAbove ? 'top' : 'bottom',
        };
    }, [isEnglish]);
    const syncActionMenuLayout = useCallback((medicineId: string | null) => {
        if (!medicineId) {
            setActionMenuLayout(null);
            return;
        }
        setActionMenuLayout(buildActionMenuLayout(actionMenuButtonRefs.current[medicineId] || null));
    }, [buildActionMenuLayout]);
    useEffect(() => {
        syncActionMenuLayout(openMenuId);
    }, [openMenuId, syncActionMenuLayout]);
    useEffect(() => {
        if (!openMenuId) {
            return;
        }
        const updateLayout = () => syncActionMenuLayout(openMenuId);
        updateLayout();
        window.addEventListener('resize', updateLayout);
        window.addEventListener('scroll', updateLayout, true);
        return () => {
            window.removeEventListener('resize', updateLayout);
            window.removeEventListener('scroll', updateLayout, true);
        };
    }, [openMenuId, syncActionMenuLayout]);
    const syncCompositionTooltipLayout = useCallback((medicineId: string) => {
        if (typeof window === 'undefined') {
            setCompositionTooltipLayout(null);
            return;
        }
        const anchor = compositionPopoverRefs.current[medicineId];
        if (!anchor) {
            setCompositionTooltipLayout(null);
            return;
        }
        const direction = anchor.dataset.direction === 'rtl' ? 'rtl' : 'ltr';
        const rect = anchor.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportPadding = 16;
        const gap = 10;
        const width = Math.min(320, viewportWidth - viewportPadding * 2);
        const leftBase = direction === 'rtl' ? rect.right - width : rect.left;
        const left = Math.max(viewportPadding, Math.min(leftBase, viewportWidth - width - viewportPadding));
        const placeAbove = viewportHeight - rect.bottom < 156 && rect.top > 156;
        const top = placeAbove ? rect.top - gap : rect.bottom + gap;
        setCompositionTooltipLayout({
            top,
            left,
            width,
            placement: placeAbove ? 'top' : 'bottom'
        });
    }, []);
    useEffect(() => {
        const onDocClick = (event: MouseEvent) => {
            const target = event.target as Element;
            if (openMenuId && !target.closest('.action-menu-container'))
                setOpenMenuId(null);
            if (pinnedCompositionId &&
                !target.closest('.composition-popover-container') &&
                !target.closest('.composition-tooltip-portal')) {
                setPinnedCompositionId(null);
            }
            if (isCompanyFilterOpen && !target.closest('.company-filter-container'))
                setIsCompanyFilterOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [isCompanyFilterOpen, openMenuId, pinnedCompositionId]);
    useEffect(() => {
        const activeCompositionId = pinnedCompositionId || hoveredCompositionId;
        if (!activeCompositionId) {
            setCompositionTooltipLayout(null);
            return;
        }
        const sync = () => syncCompositionTooltipLayout(activeCompositionId);
        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('scroll', sync, true);
        };
    }, [hoveredCompositionId, pinnedCompositionId, syncCompositionTooltipLayout]);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape')
                return;
            setOpenMenuId(null);
            setHoveredCompositionId(null);
            setPinnedCompositionId(null);
            setIsCompanyFilterOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);
    const updateCommandSurfacePreference = useCallback((key: CommandSurfacePreferenceKey, nextOpenState?: boolean) => {
        setCommandSurfacePreferences((current) => {
            const previous = current[key];
            const isOpen = typeof nextOpenState === 'boolean' ? nextOpenState : !previous.isOpen;
            const toggleCount = previous.toggleCount + 1;
            const learned = previous.learned || toggleCount >= 3;
            const nextState = {
                ...current,
                [key]: {
                    toggleCount,
                    learned,
                    isOpen
                }
            };
            writeInventoryCommandSurfacePreferences(nextState);
            return nextState;
        });
    }, []);
    const getUnitLabel = (unit: string) => getMedicineUnitLabel(unit, isEnglish);
    const manufacturerDirectory = useMemo(() => buildManufacturerDirectory(medicineRowsSource), [medicineRowsSource]);
    const companyOptions = useMemo(() => manufacturerDirectory.canonicalNames, [manufacturerDirectory]);
    const inventoryRows = useMemo<InventoryMedicineRow[]>(() => {
        const nowTs = Date.now();
        const soonTs = nowTs + EXPIRY_SOON_DAYS * 24 * 60 * 60 * 1000;
        return medicineRowsSource.map((medicine) => {
            const canonicalManufacturer = canonicalizeManufacturerName(medicine.manufacturer || '', manufacturerDirectory).displayName;
            const batches = medicine.batches || [];
            const secondaryLabel = medicine.genericName?.trim() || medicine.manufacturer?.trim() || '';
            let totalQuantity = 0;
            let totalPurchaseValue = 0;
            let nextExpiryTs = Number.POSITIVE_INFINITY;
            let nextExpiry: string | null = null;
            batches.forEach((batch) => {
                const quantity = typeof batch.quantity === 'number' ? batch.quantity : 0;
                totalQuantity += quantity;
                totalPurchaseValue += quantity * (batch.purchasePrice || 0);
                if (quantity <= 0 || !batch.expiryDate)
                    return;
                const expiryTs = new Date(batch.expiryDate).getTime();
                if (!Number.isFinite(expiryTs) || expiryTs >= nextExpiryTs)
                    return;
                nextExpiryTs = expiryTs;
                nextExpiry = batch.expiryDate;
            });
            return {
                medicine,
                canonicalManufacturer,
                searchText: [
                    medicine.name,
                    medicine.genericName,
                    medicine.manufacturer,
                    canonicalManufacturer,
                    medicine.barcode
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase(),
                totalQuantity,
                nextExpiry,
                nearExpiry: nextExpiryTs >= nowTs && nextExpiryTs <= soonTs,
                averagePurchasePrice: totalQuantity > 0 ? Math.round(totalPurchaseValue / totalQuantity) : 0,
                totalPurchaseValue,
                secondaryPreview: buildInventorySecondaryPreview(secondaryLabel)
            };
        });
    }, [medicineRowsSource, manufacturerDirectory]);
    const filteredRows = useMemo(() => {
        const term = debouncedSearchTerm.toLowerCase();
        return inventoryRows.filter((row) => {
            const { medicine } = row;
            const matchesSearch = term.length === 0 ||
                row.searchText.includes(term) ||
                matchesManufacturerSearch(medicine.manufacturer || '', term, manufacturerDirectory);
            const matchesCategory = selectedCategory === 'ALL' || medicine.type === selectedCategory;
            const matchesCompany = selectedCompany === 'ALL' || row.canonicalManufacturer === selectedCompany;
            if (!matchesSearch || !matchesCategory || !matchesCompany)
                return false;
            if (inventoryFilter === 'ARCHIVED')
                return true;
            if (inventoryFilter === 'LOW')
                return row.totalQuantity > 0 && row.totalQuantity < medicine.lowStockThreshold;
            if (inventoryFilter === 'EXPIRING')
                return row.nearExpiry;
            if (inventoryFilter === 'OUT')
                return row.totalQuantity === 0;
            if (inventoryFilter === 'AVAILABLE')
                return row.totalQuantity > 0;
            return true;
        });
    }, [inventoryRows, debouncedSearchTerm, selectedCategory, selectedCompany, inventoryFilter, manufacturerDirectory]);
    const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);
    const paginatedRows = useMemo(() => filteredRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE), [filteredRows, currentPage]);
    const totalInventoryValue = useMemo(() => {
        if (!canViewPurchasePrice)
            return 0;
        return filteredRows.reduce((sum, row) => sum + row.totalPurchaseValue, 0);
    }, [filteredRows, canViewPurchasePrice]);
    const priceListRows = useMemo<PriceListRowInput[]>(() => filteredRows.map((row) => ({
        medicine: row.medicine,
        canonicalManufacturer: row.canonicalManufacturer,
        totalQuantity: row.totalQuantity,
        nextExpiry: row.nextExpiry,
        averagePurchasePrice: row.averagePurchasePrice,
        totalPurchaseValue: row.totalPurchaseValue
    })), [filteredRows]);
    const inventoryInsights = useMemo(() => {
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let nearExpiryCount = 0;
        let totalUnits = 0;
        filteredRows.forEach((row) => {
            totalUnits += row.totalQuantity;
            if (row.totalQuantity === 0)
                outOfStockCount += 1;
            if (row.totalQuantity < row.medicine.lowStockThreshold)
                lowStockCount += 1;
            if (row.nearExpiry)
                nearExpiryCount += 1;
        });
        const healthScore = Math.max(0, Math.min(100, Math.round(100 -
            (lowStockCount / Math.max(1, filteredRows.length)) * 55 -
            (nearExpiryCount / Math.max(1, filteredRows.length)) * 32 -
            (outOfStockCount / Math.max(1, filteredRows.length)) * 18)));
        return {
            lowStockCount,
            outOfStockCount,
            nearExpiryCount,
            totalUnits,
            healthScore
        };
    }, [filteredRows]);
    const hasActiveFilters = debouncedSearchTerm.trim().length > 0 || selectedCategory !== 'ALL' || selectedCompany !== 'ALL' || inventoryFilter !== 'ALL';
    const selectedCompanyLabel = selectedCompany === 'ALL' ? tr('All Companies', 'همه شرکت‌ها') : selectedCompany;
    const isAdvancedFiltersOpen = commandSurfacePreferences.advancedFilters.isOpen;
    const isQuickScopeOpen = commandSurfacePreferences.quickScope.isOpen;
    const isArchiveView = inventoryFilter === 'ARCHIVED';
    const isInventoryEmpty = medicineRowsSource.length === 0;
    const quickScopeAvailable = activeMedicines.length > 0 || archivedMedicines.length > 0;
    const quickScopePanelOpen = quickScopeAvailable && isQuickScopeOpen;
    const isCommandSurfaceCompact = !isAdvancedFiltersOpen && !quickScopePanelOpen;
    useEffect(() => {
        if (!isAdvancedFiltersOpen) {
            setIsCompanyFilterOpen(false);
        }
    }, [isAdvancedFiltersOpen]);
    const updateCompanyFilterLayout = useCallback(() => {
        const trigger = companyFilterTriggerRef.current;
        if (!trigger)
            return;
        const rect = trigger.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom - COMPANY_FILTER_VIEWPORT_PADDING;
        const spaceAbove = rect.top - COMPANY_FILTER_VIEWPORT_PADDING;
        const shouldOpenUpward = spaceBelow < 260 && spaceAbove > spaceBelow;
        const chosenSpace = Math.max(140, shouldOpenUpward ? spaceAbove : spaceBelow);
        const maxHeight = Math.min(COMPANY_FILTER_MAX_HEIGHT, chosenSpace - COMPANY_FILTER_GAP);
        const scrollerMaxHeight = Math.max(96, maxHeight - COMPANY_FILTER_HEADER_HEIGHT);
        const preferredHorizontalRoom = isEnglish
            ? viewportWidth - rect.left - COMPANY_FILTER_VIEWPORT_PADDING
            : rect.right - COMPANY_FILTER_VIEWPORT_PADDING;
        const width = Math.min(Math.max(rect.width, Math.min(COMPANY_FILTER_TARGET_WIDTH, preferredHorizontalRoom)), viewportWidth - COMPANY_FILTER_VIEWPORT_PADDING * 2);
        let left = isEnglish ? rect.left : rect.right - width;
        left = Math.max(COMPANY_FILTER_VIEWPORT_PADDING, Math.min(left, viewportWidth - COMPANY_FILTER_VIEWPORT_PADDING - width));
        setCompanyFilterLayout({
            left,
            width,
            maxHeight,
            scrollerMaxHeight,
            placement: shouldOpenUpward ? 'top' : 'bottom',
            top: shouldOpenUpward ? undefined : rect.bottom + COMPANY_FILTER_GAP,
            bottom: shouldOpenUpward ? viewportHeight - rect.top + COMPANY_FILTER_GAP : undefined
        });
    }, [isEnglish]);
    useEffect(() => {
        if (!isCompanyFilterOpen) {
            setCompanyFilterLayout(null);
            return;
        }
        const updateLayout = () => updateCompanyFilterLayout();
        updateLayout();
        window.addEventListener('resize', updateLayout);
        window.addEventListener('scroll', updateLayout, true);
        return () => {
            window.removeEventListener('resize', updateLayout);
            window.removeEventListener('scroll', updateLayout, true);
        };
    }, [isCompanyFilterOpen, updateCompanyFilterLayout]);
    const headerShell = 'wk-inventory-hero p-4 md:p-[18px]';
    const filterShell = classNames('wk-inventory-filter-shell p-4 md:p-5', isCommandSurfaceCompact && 'wk-inventory-filter-shell--compact');
    const tableShell = 'wk-inventory-table-shell overflow-hidden';
    const softButton = 'inline-flex items-center justify-center gap-2 rounded-[14px] border border-neutral-200/95 bg-white/92 px-3 py-2 text-xs font-black text-slate-600 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.35)] transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/90 hover:text-brand-700';
    const rowActionPrimary = 'inline-flex min-h-[32px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border border-brand-200/80 bg-brand-50/92 px-2.5 py-1.5 text-[10.5px] font-black text-brand-700 transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-100/85 hover:text-brand-800';
    const rowActionRestoreButton = 'inline-flex min-h-[32px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border border-emerald-200/85 bg-emerald-50/92 px-2.5 py-1.5 text-[10.5px] font-black text-emerald-700 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100/85 hover:text-emerald-800';
    const rowActionDangerButton = 'inline-flex min-h-[32px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border border-rose-200/85 bg-rose-50/92 px-2.5 py-1.5 text-[10.5px] font-black text-rose-700 transition duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100/85 hover:text-rose-800';
    const rowActionMoreButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-neutral-200 bg-white/92 p-1.5 text-slate-500 transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/82 hover:text-brand-700';
    const tableMetaPill = 'inline-flex min-h-[30px] items-center rounded-full border border-white/75 bg-white/78 px-3 text-[11px] font-bold text-slate-600 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.32)]';
    const quickStatIconShell = 'inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/80 bg-white/82 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.24)]';
    const formatNumber = (value: number) => Math.round(value).toLocaleString(isEnglish ? 'en-US' : 'fa-AF');
    const inventoryArchiveTriggerLabel = tr(`Archived medicines: ${formatNumber(archivedMedicineCount)}`, `دواهای بایگانی‌شده: ${formatNumber(archivedMedicineCount)}`);
    const filterLabels: Record<InventoryFilter, string> = {
        ALL: tr('All Items', 'همه دواها'),
        AVAILABLE: tr('Available', 'موجود'),
        LOW: tr('Low Stock', 'موجودی کم'),
        EXPIRING: tr('Near Expiry', 'نزدیک انقضا'),
        OUT: tr('Unavailable', 'ناموجود'),
        ARCHIVED: tr('Archived', 'بایگانی')
    };
    const getStatusMeta = (row: InventoryMedicineRow) => {
        const total = row.totalQuantity;
        if (row.medicine.isDeleted) {
            return {
                primary: { label: tr('Archived', 'بایگانی'), tone: 'warning' as StatusBadgeTone },
                secondary: null
            };
        }
        if (total === 0) {
            return {
                primary: { label: tr('Unavailable', 'ناموجود'), tone: 'danger' as StatusBadgeTone },
                secondary: row.nearExpiry ? { label: tr('Near Expiry', 'نزدیک انقضا'), tone: 'warning' as StatusBadgeTone } : null
            };
        }
        if (total < row.medicine.lowStockThreshold) {
            return {
                primary: { label: t.lowStock, tone: 'warning' as StatusBadgeTone },
                secondary: row.nearExpiry ? { label: tr('Near Expiry', 'نزدیک انقضا'), tone: 'danger' as StatusBadgeTone } : null
            };
        }
        if (row.nearExpiry) {
            return {
                primary: { label: tr('Near Expiry', 'نزدیک انقضا'), tone: 'warning' as StatusBadgeTone },
                secondary: { label: tr('Available', 'موجود'), tone: 'success' as StatusBadgeTone }
            };
        }
        return {
            primary: { label: tr('Available', 'موجود'), tone: 'success' as StatusBadgeTone },
            secondary: null
        };
    };
    const getExpiryLabel = (value: string | null) => {
        if (!value)
            return '—';
        return formatMedicineExpiryDate(value, settings || null);
    };
    const handleAddClick = () => {
        if (isGuestTrial) {
            const maxMedicines = settings?.guestTrial?.limits.maxMedicines || 10;
            if (activeMedicineCount >= maxMedicines) {
                setPageNotice({
                    tone: 'warning',
                    title: tr('Guest limit reached', 'سقف نسخه مهمان تکمیل شد'),
                    message: tr(`Only ${maxMedicines} medicines are allowed in Guest Trial.`, `در نسخه مهمان فقط ${maxMedicines} دوا مجاز است.`)
                });
                return;
            }
        }
        if (settings && !isGuestTrial) {
            const limitCheck = checkLimit(settings, 'maxMedicines', activeMedicineCount);
            if (!limitCheck.allowed) {
                setPageNotice({
                    tone: 'warning',
                    title: tr('Plan limit reached', 'سقف پلن تکمیل شد'),
                    message: limitCheck.message || tr('The current plan has reached its medicine limit.', 'ظرفیت دارو در پلن فعلی تکمیل شده است.')
                });
                return;
            }
        }
        setIsAddModalOpen(true);
    };
    const handleResetFilters = () => {
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setSelectedCategory('ALL');
        setSelectedCompany('ALL');
        setInventoryFilter('ALL');
        setIsCompanyFilterOpen(false);
        setCurrentPage(1);
    };
    const handleSelectInventoryFilter = (filter: InventoryFilter) => {
        if (filter === 'ARCHIVED') {
            applyInventoryFilter('ARCHIVED');
            return;
        }
        setInventoryFilter(filter);
    };
    const handleOpenArchiveView = () => {
        applyInventoryFilter('ARCHIVED');
    };
    const handleReturnToInventoryView = () => {
        applyInventoryFilter('ALL');
    };
    const handleRowClick = (medicine: Medicine) => {
        setHoveredCompositionId(null);
        setPinnedCompositionId(null);
        setExpandedMedicineId((current) => (current === medicine.id ? null : medicine.id));
    };
    const handleCompositionPreviewEnter = (medicineId: string) => {
        if (pinnedCompositionId && pinnedCompositionId !== medicineId)
            return;
        setHoveredCompositionId(medicineId);
    };
    const handleCompositionPreviewLeave = (medicineId: string) => {
        setHoveredCompositionId((current) => (current === medicineId ? null : current));
    };
    const handleCompositionPreviewToggle = (event: React.MouseEvent<HTMLButtonElement>, medicineId: string) => {
        event.stopPropagation();
        setHoveredCompositionId(null);
        setPinnedCompositionId((current) => (current === medicineId ? null : medicineId));
    };
    const handleWasteConfirm = async ({ batchId, quantity, reason, description, addToExpenses, resolution, supplierId, amount, }: WasteConfirmPayload) => {
        if (isReadOnly || isGuestTrial)
            return false;
        if (!wasteMedicine)
            return false;
        const batch = wasteMedicine.batches.find((entry) => entry.id === batchId);
        if (!batch)
            return false;
        const reasonLabels: Record<string, string> = {
            internal_use: tr('Internal use', 'مصرف داخلی'),
            expired: tr('Expired', 'تاریخ گذشته'),
            damaged: tr('Damaged / Waste', 'ضایعات/خراب'),
            lost: tr('Lost', 'مفقودی'),
            return_vendor: tr('Returned to vendor', 'مرجوعی'),
        };
        const logDetails = `${reasonLabels[reason] || reason} - ${tr('Qty', 'تعداد')}: ${quantity} ${description ? `(${description})` : ''}`;
        if (reason === 'return_vendor') {
            if (!onRecordVendorReturn) {
                setPageNotice({
                    tone: 'danger',
                    title: tr('Supplier return unavailable', 'مرجوعی به تأمین‌کننده در دسترس نیست'),
                    message: tr('This workspace cannot record supplier returns from inventory right now.', 'این محیط فعلاً نمی‌تواند مرجوعی به تأمین‌کننده را از بخش انبار ثبت کند.'),
                });
                return false;
            }
            const recorded = await onRecordVendorReturn({
                medicineId: wasteMedicine.id,
                medicineName: wasteMedicine.name,
                batchId,
                quantity,
                reason,
                description,
                purchasePrice: batch.purchasePrice || 0,
                amount,
                supplierId,
                resolution,
            });
            if (!recorded)
                return false;
            setPageNotice({
                tone: 'success',
                title: tr('Supplier return recorded', 'مرجوعی ثبت شد'),
                message: tr('The supplier return updated stock, procurement, and supplier account records.', 'مرجوعی، موجودی، خرید و تدارکات و حساب تأمین‌کننده را همزمان به‌روزرسانی کرد.'),
            });
            return true;
        }
        const idempotencyKey = `stock-waste-${wasteMedicine.id}-${batchId}-${Date.now()}`;
        if (onRecordStockWaste) {
            const recorded = await onRecordStockWaste({
                medicineId: wasteMedicine.id,
                batchId,
                quantity,
                reason: reason as 'expired' | 'damaged' | 'lost' | 'internal_use',
                description,
                costPerUnit: batch.purchasePrice || 0,
                idempotencyKey,
            });
            if (!recorded)
                return false;
        }
        else {
            const newQuantity = Math.max(0, batch.quantity - quantity);
            updateBatch(wasteMedicine.id, batchId, {
                quantity: newQuantity,
                lastMovementAt: new Date().toISOString(),
                history: [...batch.history, { date: new Date().toISOString(), action: tr('Stock out', 'خروج کالا'), details: logDetails }],
            });
        }
        if (addExpense && (addToExpenses || reason !== 'internal_use')) {
            addExpense({
                title: `${reasonLabels[reason] || tr('Stock loss', 'ضرر موجودی')}: ${wasteMedicine.name}`,
                amount: batch.purchasePrice * quantity,
                category: reason === 'internal_use'
                    ? tr('Personal / Internal use', 'مصرف شخصی / داخلی')
                    : tr('Stock Loss', 'ضرر موجودی'),
                date: new Date().toISOString().split('T')[0],
                description: `[${idempotencyKey}] Batch: ${batch.batchNumber} - Qty: ${quantity}. ${description}`,
                userId: activeAppUser?.id || 'admin',
            });
        }
        setPageNotice({
            tone: 'success',
            title: tr('Stock updated', 'موجودی به‌روزرسانی شد'),
            message: tr('The stock-out was recorded successfully.', 'خروج کالا با موفقیت ثبت شد.'),
        });
        return true;
    };
    const openMedicineDetails = (medicine: Medicine, mode: 'view' | 'add_batch' = 'view') => {
        if (!canViewDetails && mode === 'view') {
            setPageNotice({
                tone: 'warning',
                title: tr('Permission required', 'مجوز لازم است'),
                message: tr('You do not have permission to view medicine details.', 'شما مجوز مشاهده جزئیات این دارو را ندارید.')
            });
            return;
        }
        setDetailsMedicine(medicine);
        setDetailsMode(mode);
    };
    const persistCustomUnitIfNeeded = async (unitName: string): Promise<boolean> => {
        if (!settings || !onSaveSettings)
            return true;
        const nextSettings = withCustomMedicineUnit(settings, unitName);
        if (nextSettings === settings)
            return true;
        const result = await onSaveSettings(nextSettings);
        return result !== false;
    };
    const commitQuickUnitChange = async (medicine: Medicine, rawUnitName: string) => {
        const nextUnit = normalizeMedicineUnitName(rawUnitName);
        if (!nextUnit)
            return;
        setQuickCustomUnitMedicineId(null);
        setQuickCustomUnitValue('');
        setQuickUnitEditMedicineId(null);
        if (nextUnit.toLowerCase() === normalizeMedicineUnitName(medicine.unit).toLowerCase()) {
            return;
        }
        const settingsSaved = await persistCustomUnitIfNeeded(nextUnit);
        if (!settingsSaved) {
            setPageNotice({
                tone: 'warning',
                title: tr('Unit was not saved', 'واحد ذخیره نشد'),
                message: tr('Could not save the custom unit. Try again.', 'واحد دلخواه ذخیره نشد. دوباره کوشش کنید.')
            });
            return;
        }
        const nextItemsPerBox = isPackageLikeMedicineUnit(nextUnit) ? (medicine.itemsPerBox || 1) : 1;
        const nextBaseUnit = nextUnit;
        await Promise.resolve(updateMedicine(medicine.id, {
            unit: nextUnit,
            baseUnit: nextBaseUnit,
            itemsPerBox: nextItemsPerBox,
            saleUnits: normalizeSaleUnits({
                unit: nextUnit,
                baseUnit: nextBaseUnit,
                itemsPerBox: nextItemsPerBox
            })
        }));
        setPageNotice({
            tone: 'success',
            title: tr('Unit updated', 'واحد تغییر کرد'),
            message: tr(`${medicine.name} unit changed to ${nextUnit}.`, `واحد ${medicine.name} به ${nextUnit} تغییر کرد.`)
        });
    };
    const handleQuickUnitSelect = (medicine: Medicine, value: string) => {
        if (value === QUICK_CUSTOM_UNIT_VALUE) {
            setQuickUnitEditMedicineId(medicine.id);
            setQuickCustomUnitMedicineId(medicine.id);
            setQuickCustomUnitValue('');
            return;
        }
        void commitQuickUnitChange(medicine, value);
    };
    const handleQuickCustomUnitSubmit = (event: React.FormEvent<HTMLFormElement>, medicine: Medicine) => {
        event.preventDefault();
        void commitQuickUnitChange(medicine, quickCustomUnitValue);
    };
    const currentDetails = detailsMedicine ? medicines.find((m) => m.id === detailsMedicine.id) : null;
    const currentDetailsArchived = !!currentDetails?.isDeleted;
    const rowStartAlign = isEnglish ? 'text-left' : 'text-right';
    const canOpenInventoryZoom = filteredRows.length > 0;
    const expandedMedicine = expandedMedicineId
        ? paginatedRows.find((row) => row.medicine.id === expandedMedicineId)?.medicine ?? null
        : null;
    const showTableToolbar = paginatedRows.length > 0 && (!isGuestTrial || !!expandedMedicine);
    const companyFilterLabel = tr('Company filter', 'فیلتر شرکت');
    const activeFilterChips: Array<{
        key: string;
        label: string;
        clear: () => void;
    }> = [
        ...(debouncedSearchTerm.trim()
            ? [{
                    key: 'search',
                    label: `${tr('Search', 'جستجو')}: ${debouncedSearchTerm}`,
                    clear: () => {
                        setSearchTerm('');
                        setDebouncedSearchTerm('');
                    }
                }]
            : []),
        ...(selectedCategory !== 'ALL'
            ? [{
                    key: 'category',
                    label: `${tr('Type', 'نوع')}: ${isEnglish ? selectedCategory : getMedicineTypeLabel(selectedCategory)}`,
                    clear: () => setSelectedCategory('ALL')
                }]
            : []),
        ...(selectedCompany !== 'ALL'
            ? [{
                    key: 'company',
                    label: `${tr('Company', 'شرکت')}: ${selectedCompany}`,
                    clear: () => setSelectedCompany('ALL')
                }]
            : []),
        ...(inventoryFilter !== 'ALL'
            ? [{
                    key: 'status',
                    label: `${tr('Status', 'وضعیت')}: ${filterLabels[inventoryFilter]}`,
                    clear: () => setInventoryFilter('ALL')
                }]
            : [])
    ];
    const quickStats: Array<{
        id: string;
        label: string;
        value: string;
        caption: string;
        tone: string;
        icon: React.ReactNode;
    }> = [
        {
            id: 'medicines',
            label: tr('Visible Items', 'اقلام قابل نمایش'),
            value: formatNumber(filteredRows.length),
            caption: tr(`${formatNumber(activeMedicines.length)} active items in inventory`, `${formatNumber(activeMedicines.length)} قلم فعال در انبار`),
            tone: 'text-brand-700 bg-brand-50/70 border-brand-200/70',
            icon: <PillIcon className="h-4 w-4"/>
        },
        {
            id: 'units',
            label: tr('Total Units', 'مجموع یونیت'),
            value: formatNumber(inventoryInsights.totalUnits),
            caption: tr('Units visible in the current result set', 'یونیت‌های قابل مشاهده در نتیجه فعلی'),
            tone: 'text-cyan-700 bg-cyan-50/70 border-cyan-200/70',
            icon: <ShelfIcon className="h-4 w-4"/>
        },
        {
            id: canViewPurchasePrice ? 'value' : 'low',
            label: canViewPurchasePrice ? tr('Visible Value', 'ارزش قابل نمایش') : tr('Low Stock', 'موجودی کم'),
            value: canViewPurchasePrice ? formatNumber(totalInventoryValue) : formatNumber(inventoryInsights.lowStockCount),
            caption: canViewPurchasePrice
                ? tr('Purchase-side value available in this view', 'ارزش خرید قابل مشاهده در این نما')
                : tr('Items already below their minimum level', 'اقلامی که از حداقل موجودی پایین‌ترند'),
            tone: canViewPurchasePrice ? 'text-emerald-700 bg-emerald-50/70 border-emerald-200/70' : 'text-amber-700 bg-amber-50/70 border-amber-200/70',
            icon: canViewPurchasePrice ? <CompanyIcon className="h-4 w-4"/> : <AlertIcon className="h-4 w-4"/>
        },
        {
            id: 'expiring',
            label: tr('Near Expiry', 'نزدیک انقضا'),
            value: formatNumber(inventoryInsights.nearExpiryCount),
            caption: tr('Items expiring within the next 30 days', 'اقلامی که در 30 روز آینده منقضی می‌شوند'),
            tone: 'text-rose-700 bg-rose-50/70 border-rose-200/70',
            icon: <CalendarIcon className="h-4 w-4"/>
        }
    ];
    const activeRiskCount = inventoryInsights.lowStockCount + inventoryInsights.outOfStockCount;
    const showHeaderMetrics = filteredRows.length > 0;
    const primaryQuickStats = [
        quickStats[0],
        {
            id: 'attention',
            label: tr('Need Attention', 'نیازمند اقدام'),
            value: formatNumber(activeRiskCount),
            caption: tr('Low stock and unavailable items', 'اقلام کم‌موجود و ناموجود'),
            tone: 'text-amber-700 bg-amber-50/70 border-amber-200/70',
            icon: <AlertIcon className="h-4 w-4"/>
        }
    ];
    const secondaryQuickStats = [
        quickStats[1],
        canViewPurchasePrice
            ? quickStats[2]
            : {
                id: 'expiring-mini',
                label: tr('Near Expiry', 'نزدیک انقضا'),
                value: formatNumber(inventoryInsights.nearExpiryCount),
                caption: tr('Within 30 days', 'تا 30 روز آینده'),
                tone: 'text-rose-700 bg-rose-50/70 border-rose-200/70',
                icon: <CalendarIcon className="h-4 w-4"/>
            }
    ];
    const resultSummaryLabel = tr(`${formatNumber(filteredRows.length)} items visible`, `${formatNumber(filteredRows.length)} قلم در دید`);
    const pageSummaryLabel = totalPages > 1
        ? tr(`Page ${formatNumber(currentPage)} of ${formatNumber(totalPages)}`, `صفحه ${formatNumber(currentPage)} از ${formatNumber(totalPages)}`)
        : null;
    const tableSummaryLabel = isGuestTrial ? null : pageSummaryLabel || resultSummaryLabel;
    const commandSummaryLabel = showTableToolbar ? null : resultSummaryLabel;
    const searchInputLabel = tr('Search inventory', 'جستجوی انبار');
    const searchInputPlaceholder = tr('Search inventory', 'جستجو در انبار');
    const inventoryZoomTriggerLabel = tr('Open enlarged medicine list', 'باز کردن نمای بزرگ دواها');
    const inventoryZoomTitle = tr('Focused Medicine List', 'نمای بزرگ فهرست دواها');
    const inventoryZoomSearchLabel = tr('Search medicines in focused view', 'جستجوی دواها در نمای بزرگ');
    const priceListTriggerLabel = tr('Build Price List', 'ساخت پرایس‌لیست');
    const contextNotice = pageNotice ||
        (isReadOnly
            ? {
                tone: 'info' as const,
                title: tr('Read-only mode', 'حالت فقط‌خواندنی'),
                message: tr('Inventory changes are disabled in this workspace.', 'تغییرات انبار در این فضای کاری غیرفعال است.')
            }
            : isGuestTrial
                ? {
                    tone: 'warning' as const,
                    title: tr('Guest restrictions apply', 'محدودیت‌های نسخه مهمان فعال است'),
                    message: tr('Add and edit are available, but delete and stock-out stay locked.', 'افزودن و ویرایش فعال است، اما حذف و خروج کالا قفل می‌ماند.')
                }
                : null);
    const archiveContextNotice = isArchiveView
        ? {
            tone: 'warning' as const,
            title: tr('Medicine archive', 'بایگانی دواها'),
            message: tr('Restore returns a medicine to active inventory. Permanent deletion cannot be undone and old sync snapshots will be blocked from restoring it.', 'بازیابی، دوا را به فهرست فعال برمی‌گرداند. حذف کامل غیرقابل برگشت است و snapshotهای قدیمی اجازه برگرداندن آن را ندارند.')
        }
        : null;
    const renderInventoryTableRows = (viewMode: InventoryTableViewMode) => paginatedRows.map((row, index) => {
        const { medicine, totalQuantity, secondaryPreview, nextExpiry, averagePurchasePrice } = row;
        const statusMeta = getStatusMeta(row);
        const rowIsArchived = !!medicine.isDeleted;
        const isExpanded = expandedMedicineId === medicine.id;
        const isZoomView = viewMode === 'zoom';
        const isQuickUnitEditing = quickUnitEditMedicineId === medicine.id && canEdit && !rowIsArchived;
        const isQuickCustomUnitEditing = quickCustomUnitMedicineId === medicine.id;
        const isCompositionTooltipVisible = pinnedCompositionId === medicine.id || (!pinnedCompositionId && hoveredCompositionId === medicine.id);
        const medicineTextAlign = isEnglish ? 'items-start text-left' : 'items-end text-right';
        const medicineInlineAlign = isEnglish ? 'justify-start flex-row' : 'justify-end flex-row-reverse';
        const compositionDirection = getPreferredTextDirection(secondaryPreview.fullText || secondaryPreview.visibleText, isEnglish ? 'ltr' : 'rtl');
        const compositionTextAlign = compositionDirection === 'ltr' ? 'text-left' : 'text-right';
        const barcodeValue = medicine.barcode?.trim() || '';
        const rowOverflowActions: Array<{
            id: string;
            label: string;
            onClick: () => void;
            tone?: 'default' | 'accent' | 'danger';
            bordered?: boolean;
        }> = [];
        if (canEdit && !rowIsArchived) {
            rowOverflowActions.push({
                id: 'stock-in',
                label: tr('Stock In', 'ورود کالا'),
                onClick: () => {
                    setOpenMenuId(null);
                    openMedicineDetails(medicine, 'add_batch');
                },
                tone: 'default'
            });
        }
        if (canStockOut && !rowIsArchived) {
            rowOverflowActions.push({
                id: 'stock-out',
                label: tr('Stock Out', 'خروج کالا'),
                onClick: () => {
                    setOpenMenuId(null);
                    setWasteMedicine(medicine);
                },
                tone: 'default'
            });
        }
        if (settings && !rowIsArchived) {
            rowOverflowActions.push({
                id: 'quick-analysis',
                label: t.quickAnalysis,
                onClick: () => void 0,
                tone: 'accent',
                bordered: rowOverflowActions.length > 0
            });
        }
        if (canDelete && !rowIsArchived && deleteMedicine) {
            rowOverflowActions.push({
                id: 'delete',
                label: t.delete,
                onClick: () => {
                    setMedicineToDelete(medicine);
                    setOpenMenuId(null);
                },
                tone: 'danger',
                bordered: rowOverflowActions.length > 0
            });
        }
        if (canDelete && rowIsArchived && purgeArchivedMedicine) {
            rowOverflowActions.push({
                id: 'purge',
                label: tr('Delete from archive permanently', 'حذف کامل از بایگانی'),
                onClick: () => {
                    setMedicineToPurge(medicine);
                    setOpenMenuId(null);
                },
                tone: 'danger',
                bordered: rowOverflowActions.length > 0
            });
        }
        return (<React.Fragment key={medicine.id}>
          <tr onClick={() => handleRowClick(medicine)} data-state={isExpanded ? 'expanded' : undefined} className={classNames('wk-inventory-row group cursor-pointer border-b border-neutral-200/80', rowIsArchived && 'bg-amber-50/45', isZoomView && 'wk-inventory-row--zoom')}>
            <td className="px-5 py-3 align-top">
              <div className={`flex items-start gap-2.5 ${isEnglish ? '' : 'flex-row-reverse'}`}>
                <button onClick={(e) => {
                e.stopPropagation();
                setExpandedMedicineId((p) => (p === medicine.id ? null : medicine.id));
            }} className="mt-0.5 rounded-[12px] border border-neutral-200 bg-white/92 p-1.5 text-slate-500 transition duration-200 hover:border-brand-200 hover:text-brand-700">
                  <ChevronIcon expanded={isExpanded}/>
                </button>

                <div data-testid={`medicine-name-block-${medicine.id}`} className={`flex min-w-0 flex-1 flex-col ${medicineTextAlign}`}>
                  <p className="w-full truncate text-[15px] font-black leading-5 tracking-tight text-slate-800">{medicine.name}</p>
                  {rowIsArchived ? (<span className="mt-1 inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                      {tr('Archived', 'بایگانی')}
                    </span>) : null}
                  {secondaryPreview.visibleText && (<div className={`mt-1 flex w-full min-w-0 ${isEnglish ? 'justify-start' : 'justify-end'}`}>
                      <div data-testid={`medicine-secondary-row-${medicine.id}`} className={`flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium leading-5 text-slate-500 ${medicineInlineAlign}`}>
                        <span data-testid={`composition-label-${medicine.id}`} dir={compositionDirection} className={classNames('wk-inventory-secondary-clamp max-w-[28ch] min-w-0 flex-1 text-inherit', compositionTextAlign)}>
                          {secondaryPreview.visibleText}
                        </span>

                        {secondaryPreview.isTruncated && (<span ref={(node) => setCompositionPopoverRef(medicine.id, node)} className="composition-popover-container relative inline-flex shrink-0" data-direction={compositionDirection} onMouseEnter={() => handleCompositionPreviewEnter(medicine.id)} onMouseLeave={() => handleCompositionPreviewLeave(medicine.id)}>
                            <button type="button" aria-expanded={pinnedCompositionId === medicine.id} aria-label={tr('Show full composition', 'نمایش کامل ترکیب')} data-testid={`composition-trigger-${medicine.id}`} onClick={(event) => handleCompositionPreviewToggle(event, medicine.id)} onFocus={() => handleCompositionPreviewEnter(medicine.id)} onBlur={() => handleCompositionPreviewLeave(medicine.id)} className="rounded px-0.5 text-[11px] font-black leading-none text-slate-400 transition hover:text-brand-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/35">
                              ...
                            </button>

                            {isCompositionTooltipVisible && (typeof document !== 'undefined' && compositionTooltipLayout
                        ? createPortal(<div role="tooltip" dir={compositionDirection} data-testid={`composition-tooltip-${medicine.id}`} onMouseEnter={() => handleCompositionPreviewEnter(medicine.id)} onMouseLeave={() => handleCompositionPreviewLeave(medicine.id)} onClick={(event) => event.stopPropagation()} style={{
                                position: 'fixed',
                                top: compositionTooltipLayout.top,
                                left: compositionTooltipLayout.left,
                                width: compositionTooltipLayout.width,
                                maxWidth: 'calc(100vw - 2rem)',
                                transform: compositionTooltipLayout.placement === 'top'
                                    ? 'translateY(-100%)'
                                    : undefined,
                                zIndex: 80
                            }} className={classNames('composition-tooltip-portal rounded-xl border border-slate-200 bg-white p-3 text-[12px] font-semibold leading-6 text-slate-700 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)]', compositionTextAlign)}>
                                      {secondaryPreview.fullText}
                                    </div>, document.body)
                        : null)}
                          </span>)}
                      </div>
                    </div>)}
                </div>
              </div>
            </td>

            <td className={`px-4 py-3 align-top text-sm ${rowStartAlign}`}>
              <p className="truncate text-sm font-bold leading-5 text-slate-700">{row.canonicalManufacturer || tr('Unknown', 'نامشخص')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="rounded-lg border border-brand-200/75 bg-brand-50/72 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                  {isEnglish ? medicine.type : getMedicineTypeLabel(medicine.type)}
                </span>
                {isQuickUnitEditing ? (<span className="inline-flex max-w-full flex-col gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <select autoFocus data-testid={`inventory-quick-unit-select-${medicine.id}`} aria-label={tr('Quick edit unit', 'ویرایش سریع واحد')} value={medicine.unit} onChange={(event) => handleQuickUnitSelect(medicine, event.target.value)} onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setQuickUnitEditMedicineId(null);
                        setQuickCustomUnitMedicineId(null);
                        setQuickCustomUnitValue('');
                    }
                }} className="h-8 max-w-[150px] rounded-lg border border-brand-200 bg-white px-2 text-[11px] font-black text-slate-700 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-300/35">
                      {medicineUnitOptions.map((unit) => (<option key={unit} value={unit}>{getUnitLabel(unit)}</option>))}
                      <option value={QUICK_CUSTOM_UNIT_VALUE}>{tr('Custom unit...', 'واحد دلخواه...')}</option>
                    </select>
                    {isQuickCustomUnitEditing ? (<form data-testid={`inventory-custom-unit-form-${medicine.id}`} onSubmit={(event) => handleQuickCustomUnitSubmit(event, medicine)} className="flex items-center gap-1">
                        <input type="text" autoFocus value={quickCustomUnitValue} onChange={(event) => setQuickCustomUnitValue(event.target.value)} placeholder={tr('New unit', 'واحد جدید')} className="h-8 w-24 rounded-lg border border-brand-100 bg-white px-2 text-[11px] font-bold text-slate-700 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-300/35"/>
                        <button type="submit" className="h-8 rounded-lg bg-brand-600 px-2 text-[11px] font-black text-white transition hover:bg-brand-700">
                          {tr('Save', 'ذخیره')}
                        </button>
                      </form>) : null}
                  </span>) : canEdit && !rowIsArchived ? (<button type="button" data-testid={`inventory-quick-unit-trigger-${medicine.id}`} title={tr('Quick edit unit', 'ویرایش سریع واحد')} onClick={(event) => {
                    event.stopPropagation();
                    setQuickUnitEditMedicineId(medicine.id);
                    setQuickCustomUnitMedicineId(null);
                    setQuickCustomUnitValue('');
                }} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/35">
                    {getUnitLabel(medicine.unit)}
                  </button>) : (<span className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    {getUnitLabel(medicine.unit)}
                  </span>)}
              </div>
              {barcodeValue ? (<p className={`wk-meta-text mt-1 ${isEnglish ? 'text-left' : 'text-right'}`}>
                  {tr('Barcode', 'بارکد')}: <span className="wk-ltr-data">{barcodeValue}</span>
                </p>) : null}
            </td>

            <td className="px-4 py-3 text-center align-top">
              <p className="wk-ltr-data text-sm font-black text-slate-700">
                {formatNumber(totalQuantity)} {getUnitLabel(medicine.unit)}
              </p>
              <p className="wk-meta-text mt-1">
                {tr('Min', 'حداقل')} <span className="wk-ltr-data">{formatNumber(medicine.lowStockThreshold)}</span>
              </p>
            </td>

            <td className="px-4 py-3 text-center align-top">
              <div data-testid={`inventory-expiry-cell-${medicine.id}`} className="inline-flex flex-col items-center gap-1 whitespace-nowrap">
                <p className="wk-ltr-data text-sm font-black text-slate-700">{getExpiryLabel(nextExpiry)}</p>
                <p className="wk-meta-text">
                  {tr('Batches', 'سری ساخت')} <span className="wk-ltr-data">{formatNumber(medicine.batches.length)}</span>
                </p>
              </div>
            </td>

            <td className="px-4 py-3 text-center align-top">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <StatusBadge tone={statusMeta.primary.tone}>{statusMeta.primary.label}</StatusBadge>
                {statusMeta.secondary ? <StatusBadge tone={statusMeta.secondary.tone}>{statusMeta.secondary.label}</StatusBadge> : null}
              </div>
            </td>

            <td className="px-4 py-3 text-center align-top">
              <span className="wk-ltr-data text-sm font-black text-brand-700">
                {formatNumber(resolveSalesModePrice(medicine.salePrices, primarySalesMode))}
              </span>
            </td>

            <td className={`action-menu-container relative px-5 py-3 align-middle ${isEnglish ? 'text-right' : 'text-left'}`}>
              <div data-testid={`inventory-row-actions-${medicine.id}`} className={classNames('flex items-center gap-1.5', rowIsArchived ? 'flex-wrap' : 'flex-nowrap', isEnglish ? 'justify-end' : 'justify-start')}>
                <button type="button" onClick={(e) => {
                e.stopPropagation();
                openMedicineDetails(medicine);
            }} className={rowActionPrimary}>
                  {t.viewDetails}
                </button>
                {rowIsArchived && canEdit && restoreArchivedMedicine ? (<button type="button" data-testid={`inventory-restore-archived-${medicine.id}`} onClick={(e) => {
                    e.stopPropagation();
                    setMedicineToRestore(medicine);
                    setOpenMenuId(null);
                }} className={rowActionRestoreButton}>
                    {tr('Restore', 'بازیابی')}
                  </button>) : null}
                {rowIsArchived && canDelete && purgeArchivedMedicine ? (<button type="button" data-testid={`inventory-purge-archived-${medicine.id}`} onClick={(e) => {
                    e.stopPropagation();
                    setMedicineToPurge(medicine);
                    setOpenMenuId(null);
                }} className={rowActionDangerButton}>
                    {tr('Delete permanently', 'حذف کامل')}
                  </button>) : null}
                {rowOverflowActions.length > 0 ? (<button type="button" aria-label={tr('More actions', 'اقدام‌های بیشتر')} ref={(node) => setActionMenuButtonRef(medicine.id, node)} onClick={(e) => {
                    e.stopPropagation();
                    if (openMenuId === medicine.id) {
                        setOpenMenuId(null);
                        setActionMenuLayout(null);
                        return;
                    }
                    setActionMenuLayout(buildActionMenuLayout(e.currentTarget));
                    setOpenMenuId(medicine.id);
                }} className={rowActionMoreButton}>
                    <ThreeDotsIcon />
                  </button>) : null}
              </div>

              {rowOverflowActions.length > 0 && openMenuId === medicine.id && actionMenuLayout && typeof document !== 'undefined'
                ? createPortal(<div className="action-menu-container" data-testid={`inventory-row-overflow-menu-${medicine.id}`} onClick={(e) => e.stopPropagation()} style={{
                        position: 'fixed',
                        top: actionMenuLayout.top,
                        left: actionMenuLayout.left,
                        width: actionMenuLayout.width,
                        maxWidth: 'calc(100vw - 1.5rem)',
                        transform: actionMenuLayout.placement === 'top' ? 'translateY(-100%)' : undefined,
                        zIndex: 90
                    }}>
                      <div className="overflow-hidden rounded-[18px] border border-neutral-200 bg-white/96 shadow-[0_24px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                        {rowOverflowActions.map((action) => (<button key={action.id} onClick={action.onClick} className={classNames(`w-full px-4 py-3 text-sm font-semibold transition ${rowStartAlign}`, action.bordered && 'border-t border-slate-100', action.tone === 'danger'
                            ? 'text-rose-700 hover:bg-rose-50'
                            : action.tone === 'accent'
                                ? 'text-indigo-700 hover:bg-indigo-50'
                                : 'text-slate-700 hover:bg-slate-50')}>
                            {action.id === 'quick-analysis' ? (<span className={`inline-flex items-center ${isEnglish ? 'gap-2' : 'flex-row-reverse gap-2'}`}>
                                <AiSparklesIcon />
                                {action.label}
                              </span>) : (action.label)}
                          </button>))}
                      </div>
                    </div>, document.body)
                : null}
            </td>
          </tr>

          {isExpanded ? (<tr>
              <td colSpan={7} className="px-5 pb-4 pt-0.5">
                <div className="wk-inventory-detail-tray grid gap-4 rounded-[22px] p-4 text-sm xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                  <div className="wk-inventory-detail-group space-y-3">
                    <div>
                      <p className="wk-meta-text">{tr('Composition / source', 'ترکیب / منبع')}</p>
                      <p className={`mt-1 text-sm font-black leading-6 text-slate-700 ${rowStartAlign}`}>
                        {secondaryPreview.fullText || row.canonicalManufacturer || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="wk-inventory-detail-group">
                      <p className="wk-meta-text">{tr('Wholesale Price', 'قیمت عمده')}</p>
                      <p className="wk-ltr-data mt-1 text-sm font-black text-indigo-700">{formatNumber(medicine.salePrices.wholesale)}</p>
                    </div>
                    <div className="wk-inventory-detail-group">
                      <p className="wk-meta-text">{tr('Bulk Price', 'قیمت کارتنی')}</p>
                      <p className="wk-ltr-data mt-1 text-sm font-black text-brand-700">{formatNumber(medicine.salePrices.bulk)}</p>
                    </div>
                    {canViewPurchasePrice ? (<div className="wk-inventory-detail-group">
                        <div className="flex items-center justify-between">
                          <p className="wk-meta-text">{t.purchasePrice}</p>
                          <button onClick={() => setRevealedPurchaseRows((p) => ({ ...p, [medicine.id]: !p[medicine.id] }))} className="text-xs font-bold text-emerald-700 hover:underline">
                            {revealedPurchaseRows[medicine.id] ? tr('Hide', 'مخفی') : tr('Show', 'نمایش')}
                          </button>
                        </div>
                        <p className="wk-ltr-data mt-1 text-sm font-black text-emerald-700">{revealedPurchaseRows[medicine.id] ? formatNumber(averagePurchasePrice) : '•••••'}</p>
                      </div>) : null}
                  </div>
                </div>
              </td>
            </tr>) : null}
        </React.Fragment>);
    });
    const renderInventoryTableContent = (viewMode: InventoryTableViewMode) => {
        const isZoomView = viewMode === 'zoom';
        const tableScrollClassName = classNames('wk-table-scroll overflow-x-auto', isZoomView && 'wk-table-scroll--zoom');
        if (isFiltering) {
            return <LoadingSkeletonShell className={classNames('m-5 min-h-[320px]', isZoomView && 'min-h-[420px]')} lines={6}/>;
        }
        if (medicineRowsSource.length === 0) {
            return (<div className="p-5">
          <EmptyStateShell title={isArchiveView ? tr('Archive is empty', 'بایگانی خالی است') : tr('No medicines yet', 'هنوز دوایی ثبت نشده')} description={isArchiveView
                    ? tr('Archived medicines will appear here after they are removed from the active inventory.', 'دواهای بایگانی‌شده پس از حذف از فهرست فعال، در اینجا دیده می‌شوند.')
                    : tr('Add the first medicine to start tracking stock, expiry, and sell price in one view.', 'برای شروع پایش موجودی، انقضا و قیمت فروش، اولین دوا را ثبت کنید.')}/>
        </div>);
        }
        if (filteredRows.length === 0) {
            return (<div className="p-5">
          <EmptyStateShell title={tr('No medicine matches these filters', 'هیچ دوا با این فیلترها پیدا نشد')} description={tr('Clear or adjust the active filters to widen the result set.', 'برای دیدن نتایج بیشتر، فیلترهای فعال را پاک یا تنظیم کنید.')} action={<Button variant="secondary" onClick={handleResetFilters}>
                {tr('Reset Filters', 'پاک‌سازی فیلترها')}
              </Button>}/>
        </div>);
        }
        return (<>
        <div className={tableScrollClassName} data-testid={isZoomView ? 'inventory-zoom-table-view' : undefined}>
          <table data-testid={isZoomView ? 'inventory-zoom-data-table' : 'inventory-data-table'} className={classNames('min-w-[var(--wk-inventory-table-min-width)] w-full table-fixed border-separate border-spacing-0', isZoomView && 'wk-inventory-table--zoom')}>
            <colgroup>
              <col style={{ width: '28%' }}/>
              <col style={{ width: '19%' }}/>
              <col style={{ width: '10%' }}/>
              <col style={{ width: '12%' }}/>
              <col style={{ width: '10%' }}/>
              <col style={{ width: '8%' }}/>
              <col style={{ width: '13%' }}/>
            </colgroup>
            <thead className="wk-inventory-table-head sticky top-0 z-10">
              <tr>
                <th className={`px-5 py-3.5 text-xs font-black uppercase tracking-[0.16em] text-slate-500 ${rowStartAlign}`}>{t.medicineName}</th>
                <th className={`px-4 py-3.5 text-xs font-black uppercase tracking-[0.16em] text-slate-500 ${rowStartAlign}`}>{tr('Company / Type', 'شرکت / نوع')}</th>
                <th className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500 whitespace-nowrap">{t.stock}</th>
                <th className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500 whitespace-nowrap">{tr('Next Expiry', 'نزدیک‌ترین انقضا')}</th>
                <th className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500 whitespace-nowrap">{t.status}</th>
                <th className="px-4 py-3.5 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500 whitespace-nowrap">{tr(`${getSalesModeLabel(primarySalesMode, 'english')} Price`, `قیمت ${getSalesModeLabel(primarySalesMode, settings?.language || 'dari')}`)}</th>
                <th className={`px-5 py-3.5 text-xs font-black uppercase tracking-[0.16em] text-slate-500 whitespace-nowrap ${isEnglish ? 'text-right' : 'text-left'}`}>{t.operation}</th>
              </tr>
            </thead>

            <tbody>{renderInventoryTableRows(viewMode)}</tbody>
          </table>
        </div>
        {totalPages > 1 ? (<div className="flex flex-wrap items-center justify-center gap-3 border-t border-neutral-200/80 bg-[linear-gradient(180deg,rgba(248,251,255,0.94),rgba(255,255,255,0.95))] p-4">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className={`${softButton} disabled:opacity-50`}>
              {tr('Previous', 'قبلی')}
            </button>
            <span className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600">
              {tr('Page', 'صفحه')} <span className="wk-ltr-data">{currentPage}</span> {tr('of', 'از')} <span className="wk-ltr-data">{totalPages}</span>
            </span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={`${softButton} disabled:opacity-50`}>
              {tr('Next', 'بعدی')}
            </button>
          </div>) : null}
      </>);
    };
    return (<div className="wk-page-shell animate-fade-in">
      <div className="wk-page-stack">
        <section className={headerShell}>
          <div className="relative z-[1] flex flex-col gap-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
                  <div className="min-w-0">
                    <h1 className="text-[clamp(1.85rem,1.24rem+0.75vw,2.3rem)] font-black tracking-[-0.05em] text-slate-950">
                      {tr('Inventory & Stock', 'گدام و دواها')}
                    </h1>
                    <p className="mt-1.5 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                      {tr('See what needs attention, find it fast, and act on the right row.', 'ببینید چه چیزی نیاز به توجه دارد، سریع آن را پیدا کنید و روی ردیف درست عمل کنید.')}
                    </p>
                  </div>

                  {showHeaderMetrics ? (<div className={`flex flex-wrap items-center gap-2 ${isEnglish ? 'justify-start' : 'justify-end'}`}>
                      <StatusBadge tone={inventoryInsights.healthScore >= 80 ? 'success' : inventoryInsights.healthScore >= 60 ? 'warning' : 'danger'} dot>
                        {tr('Health', 'سلامت')} {inventoryInsights.healthScore}%
                      </StatusBadge>
                      <StatusBadge tone={inventoryInsights.nearExpiryCount > 0 ? 'warning' : 'neutral'}>
                        {tr('30-day expiry', 'انقضای 30 روزه')} {formatNumber(inventoryInsights.nearExpiryCount)}
                      </StatusBadge>
                    </div>) : null}
                </div>
              </div>

              {canCreate || priceListRows.length > 0 ? (<div className={`flex shrink-0 flex-wrap items-start gap-2 ${isEnglish ? 'justify-end' : 'justify-start'}`}>
                  {priceListRows.length > 0 && settings ? (<Button variant="secondary" onClick={() => setIsPriceListBuilderOpen(true)} data-testid="inventory-price-list-cta" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800">
                      <PriceListIcon />
                      {priceListTriggerLabel}
                    </Button>) : null}
                  {canCreate ? (<Button variant="secondary" onClick={handleAddClick} data-testid="inventory-add-medicine-cta" className="wk-inventory-add-cta">
                    <span className="wk-inventory-add-cta__icon" aria-hidden="true">
                      <PlusIcon className="h-[18px] w-[18px]"/>
                    </span>
                    {t.addMedicine}
                  </Button>) : null}
                </div>) : null}
            </div>

            {showHeaderMetrics ? (<div className="grid gap-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                <div className="grid gap-3 sm:grid-cols-2">
                  {primaryQuickStats.map((item) => (<FlatCard key={item.id} className={`wk-inventory-kpi-card wk-inventory-kpi-card--primary px-4 py-3.5 ${item.tone}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-current">{item.label}</p>
                          <p className="mt-2 text-[27px] font-black tracking-[-0.04em] text-slate-900">{item.value}</p>
                          <p className="mt-1.5 text-[11px] font-semibold leading-5 text-slate-500">{item.caption}</p>
                        </div>
                        <span className={quickStatIconShell}>
                          {item.icon}
                        </span>
                      </div>
                    </FlatCard>))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {secondaryQuickStats.map((item) => (<div key={item.id} className={`wk-inventory-compact-stat ${item.tone}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-current">{item.label}</p>
                          <p className="mt-1.5 text-[22px] font-black tracking-[-0.04em] text-slate-900">{item.value}</p>
                          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">{item.caption}</p>
                        </div>
                        <span className={quickStatIconShell}>
                          {item.icon}
                        </span>
                      </div>
                    </div>))}
                </div>
              </div>) : isInventoryEmpty ? (<div className="wk-inventory-empty-note">
                <p className="text-sm font-black text-slate-900">
                  {isArchiveView ? tr('Archive is empty', 'بایگانی خالی است') : tr('No medicines yet', 'هنوز دوایی ثبت نشده')}
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  {isArchiveView
                ? tr('Medicines removed from the active inventory will appear here for review and permanent deletion.', 'دواهایی که از فهرست فعال حذف شوند، برای بازبینی و حذف کامل در اینجا دیده می‌شوند.')
                : tr('Use the add action above to activate stock, expiry, and pricing workflows.', 'برای فعال شدن جریان موجودی، انقضا و قیمت، از دکمه افزودن بالای صفحه استفاده کنید.')}
                </p>
              </div>) : null}
          </div>
        </section>

        {contextNotice ? (<InlineAlert tone={contextNotice.tone} title={contextNotice.title}>
            {contextNotice.message}
          </InlineAlert>) : null}

        {archiveContextNotice ? (<InlineAlert data-testid="inventory-archive-context-notice" tone={archiveContextNotice.tone} title={archiveContextNotice.title}>
            {archiveContextNotice.message}
          </InlineAlert>) : null}

        <NewFeatureHint title={tr('NEW stock traceability and vendor return guidance', 'راهنمای تازهٔ رهگیری موجودی و مرجوعی تأمین‌کننده')} data-testid="inventory-feature-guide">
          {tr('Batches now keep clearer supplier and purchase links, and return-to-vendor can feed vendor credit when the original batch is linked.', 'batchها اکنون پیوند روشن‌تری با تأمین‌کننده و خرید نگه می‌دارند و مرجوعی به تأمین‌کننده می‌تواند در صورت وجود پیوند اصلی، اعتبار مرجوعی بسازد.')}
        </NewFeatureHint>

        <section className={filterShell}>
          <div data-testid="inventory-command-shell" data-layout={isCommandSurfaceCompact ? 'compact' : 'expanded'} className={classNames('flex flex-col', isCommandSurfaceCompact ? 'gap-3' : 'gap-4')}>
            <div className="wk-inventory-command-topbar">
              <div data-testid="inventory-search-slot" data-state={isAdvancedFiltersOpen ? 'balanced' : 'wide'} className={classNames('wk-inventory-command-search-slot', !isAdvancedFiltersOpen && 'wk-inventory-command-search-slot--wide')}>
                <FilterField className="h-full" search>
                  <div className="wk-control-affix-shell">
                    <span className="wk-control-affix wk-control-affix--inline-left text-slate-400">
                      <SearchIcon className="h-5 w-5"/>
                    </span>
                    <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={searchInputPlaceholder} dir={isEnglish ? 'ltr' : 'rtl'} aria-label={searchInputLabel} className={classNames('wk-input text-sm font-bold', isEnglish && 'wk-input--ltr', 'wk-input--with-inline-left-affix', isCommandSurfaceCompact ? 'h-11 bg-white/94' : 'h-12 bg-white/94')}/>
                  </div>
                </FilterField>
              </div>

              <div className="wk-inventory-command-actions">
                <button type="button" data-testid="inventory-advanced-filters-trigger" aria-expanded={isAdvancedFiltersOpen} aria-controls="inventory-advanced-filters-panel" dir={isEnglish ? 'ltr' : 'rtl'} onClick={() => updateCommandSurfacePreference('advancedFilters')} className={classNames('wk-inventory-command-trigger', isAdvancedFiltersOpen && 'wk-inventory-command-trigger--active', commandSurfacePreferences.advancedFilters.learned && 'wk-inventory-command-trigger--learned')}>
                  <span className="wk-inventory-command-trigger-icon" aria-hidden="true">
                    <FilterIcon className="h-4 w-4"/>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start">{tr('Filters', 'فیلترها')}</span>
                  <span className="shrink-0 text-slate-400" aria-hidden="true">
                    <SelectChevronIcon className="h-4 w-4" expanded={isAdvancedFiltersOpen}/>
                  </span>
                </button>

                <button type="button" data-testid="inventory-quick-scope-trigger" aria-expanded={quickScopePanelOpen} aria-controls="inventory-quick-scope-panel" disabled={!quickScopeAvailable} dir={isEnglish ? 'ltr' : 'rtl'} onClick={() => updateCommandSurfacePreference('quickScope')} className={classNames('wk-inventory-command-trigger', quickScopePanelOpen && 'wk-inventory-command-trigger--active', commandSurfacePreferences.quickScope.learned && 'wk-inventory-command-trigger--learned')}>
                  <span className="wk-inventory-command-trigger-icon" aria-hidden="true">
                    <QuickScopeIcon className="h-4 w-4"/>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start">{tr('Quick View', 'نمایی سریع')}</span>
                  <span className="shrink-0 text-slate-400" aria-hidden="true">
                    <SelectChevronIcon className="h-4 w-4" expanded={quickScopePanelOpen}/>
                  </span>
                </button>

                <button type="button" data-testid="inventory-archive-open-trigger" aria-pressed={isArchiveView} aria-label={inventoryArchiveTriggerLabel} dir={isEnglish ? 'ltr' : 'rtl'} onClick={handleOpenArchiveView} className={classNames('wk-inventory-command-trigger', isArchiveView && 'wk-inventory-command-trigger--active')}>
                  <span className="wk-inventory-command-trigger-icon" aria-hidden="true">
                    <ArchiveIcon className="h-4 w-4"/>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start">{tr('Archive', 'بایگانی')}</span>
                  <span className="wk-ltr-data rounded-full bg-white/78 px-2 py-0.5 text-[11px] text-slate-500">
                    {formatNumber(archivedMedicineCount)}
                  </span>
                </button>

                {isArchiveView ? (<button type="button" data-testid="inventory-archive-return-trigger" dir={isEnglish ? 'ltr' : 'rtl'} onClick={handleReturnToInventoryView} className="wk-inventory-command-trigger">
                    <span className="wk-inventory-command-trigger-icon" aria-hidden="true">
                      <ReturnToInventoryIcon className="h-4 w-4"/>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-start">{tr('Back to inventory', 'بازگشت به گدام')}</span>
                  </button>) : null}
              </div>
            </div>

            <div id="inventory-advanced-filters-panel" data-testid="inventory-advanced-filters-panel" data-open={isAdvancedFiltersOpen ? 'true' : 'false'} aria-hidden={!isAdvancedFiltersOpen} hidden={!isAdvancedFiltersOpen} className="wk-inventory-disclosure-panel">
              <div className="wk-inventory-disclosure-panel-inner">
                <div className="grid gap-3 md:grid-cols-2">
                  <FilterSelectField label={tr('Category', 'دسته‌بندی')} ariaLabel={tr('Category', 'دسته‌بندی')} value={selectedCategory} onChange={(value) => setSelectedCategory(value as MedicineType | 'ALL')} options={CATEGORIES.map((category) => ({
            value: category,
            label: category === 'ALL' ? t.allCategories : isEnglish ? category : getMedicineTypeLabel(category)
        }))} className="h-full" selectClassName="h-12 bg-white/92 font-bold" disabled={!isAdvancedFiltersOpen}/>

                  <FilterField className="company-filter-container relative h-full" label={tr('Company', 'شرکت')}>
                    <button ref={companyFilterTriggerRef} type="button" role="combobox" aria-label={companyFilterLabel} aria-expanded={isAdvancedFiltersOpen && isCompanyFilterOpen} aria-controls="inventory-company-filter-listbox" aria-haspopup="listbox" disabled={!isAdvancedFiltersOpen} data-testid="company-filter-trigger" dir={isEnglish ? 'ltr' : 'rtl'} onClick={() => setIsCompanyFilterOpen((current) => !current)} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setIsCompanyFilterOpen(true);
            }
        }} className={classNames('wk-select flex h-12 items-center bg-white/92 font-bold disabled:cursor-not-allowed disabled:opacity-60', isEnglish && 'wk-select--ltr')}>
                      <span className="min-w-0 flex-1 truncate text-start">{selectedCompanyLabel}</span>
                      <span data-testid="company-filter-icon-rail" className="inline-flex shrink-0 items-center gap-2 text-slate-400">
                        <CompanyIcon className="h-4 w-4"/>
                        <SelectChevronIcon className="h-4 w-4" expanded={isCompanyFilterOpen}/>
                      </span>
                    </button>
                  </FilterField>
                </div>
              </div>
            </div>

            <div id="inventory-quick-scope-panel" data-testid="inventory-quick-scope-panel" data-open={quickScopePanelOpen ? 'true' : 'false'} aria-hidden={!quickScopePanelOpen} hidden={!quickScopePanelOpen} className="wk-inventory-disclosure-panel">
              <div className="wk-inventory-disclosure-panel-inner">
                <FilterSegmentedControl className="w-full" items={(['ALL', 'AVAILABLE', 'LOW', 'EXPIRING', 'OUT', 'ARCHIVED'] as InventoryFilter[]).map((filterKey) => ({
            id: filterKey,
            label: (<span className="inline-flex items-center gap-1.5">
                        <FilterIcon className="h-3.5 w-3.5"/>
                        <span>{filterLabels[filterKey]}</span>
                      </span>),
            active: inventoryFilter === filterKey,
            onClick: () => handleSelectInventoryFilter(filterKey),
            disabled: !quickScopePanelOpen
        }))}/>
              </div>
            </div>

            {commandSummaryLabel || hasActiveFilters ? (<div className="flex flex-col gap-2.5 border-t border-brand-100/80 pt-2.5 xl:flex-row xl:items-center xl:justify-between">
                {commandSummaryLabel ? (<div className="flex flex-wrap items-center gap-2">
                    <span className="wk-inventory-command-meta">{commandSummaryLabel}</span>
                  </div>) : (<div />)}

                {hasActiveFilters ? (<div className={`flex flex-wrap items-center gap-2 xl:max-w-[52%] ${isEnglish ? 'xl:justify-end' : 'xl:justify-start'}`}>
                    {activeFilterChips.map((chip) => (<ActiveFilterChip key={chip.key} label={chip.label} onClear={chip.clear} className="border-neutral-200 bg-white text-neutral-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"/>))}
                    <button onClick={handleResetFilters} className="wk-inventory-reset-link">
                      <FilterIcon className="h-4 w-4"/>
                      {tr('Reset Filters', 'پاک‌سازی فیلترها')}
                    </button>
                  </div>) : null}
              </div>) : null}
          </div>
        </section>

        {isAdvancedFiltersOpen && isCompanyFilterOpen && companyFilterLayout
            ? createPortal(<div className="company-filter-container">
                <div id="inventory-company-filter-listbox" role="listbox" aria-label={tr('Company filter', 'فیلتر شرکت')} data-testid="company-filter-listbox" style={{
                    position: 'fixed',
                    left: companyFilterLayout.left,
                    width: companyFilterLayout.width,
                    maxHeight: companyFilterLayout.maxHeight,
                    top: companyFilterLayout.top,
                    bottom: companyFilterLayout.bottom,
                    zIndex: 70
                }} className={`overflow-hidden rounded-[22px] border border-brand-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,249,255,0.94))] shadow-[0_28px_54px_-28px_rgba(15,23,42,0.38)] backdrop-blur-xl ${companyFilterLayout.placement === 'top' ? 'origin-bottom' : 'origin-top'}`}>
                  <div className="border-b border-brand-100/70 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-4 py-3 text-xs font-black tracking-[0.16em] text-white">
                    {tr('Select Company', 'انتخاب شرکت')}
                  </div>
                  <div className="custom-scrollbar overflow-y-auto py-2" style={{ maxHeight: companyFilterLayout.scrollerMaxHeight }}>
                    {[
                    { value: 'ALL', label: tr('All Companies', 'همه شرکت‌ها') },
                    ...companyOptions.map((company) => ({ value: company, label: company }))
                ].map((company) => {
                    const selected = selectedCompany === company.value;
                    return (<button key={company.value} type="button" role="option" aria-selected={selected} onClick={() => {
                            setSelectedCompany(company.value);
                            setIsCompanyFilterOpen(false);
                        }} className={`flex w-full items-start gap-3 px-4 py-2.5 text-sm font-semibold transition ${selected ? 'bg-brand-50/85 text-brand-700' : 'text-slate-600 hover:bg-slate-50/90 hover:text-slate-800'} ${isEnglish ? 'text-left' : 'text-right'}`}>
                          <span aria-hidden="true" className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand-300 bg-brand-500/12' : 'border-slate-200 bg-white'}`}>
                            <span className={`h-2 w-2 rounded-full ${selected ? 'bg-brand-500' : 'bg-transparent'}`}/>
                          </span>
                          <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{company.label}</span>
                        </button>);
                })}
                  </div>
                </div>
              </div>, document.body)
            : null}

        <section className={tableShell}>
          {showTableToolbar ? (<div data-testid="inventory-table-toolbar" className="wk-inventory-table-toolbar px-4 py-3 md:px-5">
              <div className="wk-inventory-table-toolbar-inner">
                {canOpenInventoryZoom ? (<button type="button" data-testid="inventory-zoom-trigger" aria-label={inventoryZoomTriggerLabel} title={inventoryZoomTriggerLabel} onClick={() => {
                    setOpenMenuId(null);
                    setHoveredCompositionId(null);
                    setPinnedCompositionId(null);
                    setIsInventoryZoomOpen(true);
                }} className="wk-inventory-zoom-trigger">
                    <ExpandViewIcon />
                  </button>) : null}

                <div className={classNames('wk-inventory-table-toolbar-content', canOpenInventoryZoom && 'wk-inventory-table-toolbar-content--zoomable')}>
                  {isGuestTrial && expandedMedicine ? (<div data-testid="inventory-selected-actions" className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={tableMetaPill}>
                        {expandedMedicine.name}
                      </span>
                    </div>) : tableSummaryLabel ? (<div className="flex flex-wrap items-center gap-2">
                      <span className={tableMetaPill}>{tableSummaryLabel}</span>
                    </div>) : null}
                </div>
              </div>
            </div>) : null}

          {renderInventoryTableContent('default')}
        </section>
      </div>

      <Modal isOpen={isInventoryZoomOpen} onClose={() => setIsInventoryZoomOpen(false)} title={inventoryZoomTitle} maxWidthClassName="max-w-[min(96vw,1700px)]" overlayClassName="wk-inventory-zoom-overlay fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(15,23,42,0.48)] p-3 backdrop-blur-md transition-opacity" panelClassName="wk-page-surface wk-inventory-zoom-panel max-h-[calc(100dvh-var(--wk-titlebar-height)-10px)] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,248,253,0.95))] shadow-[0_34px_80px_-32px_rgba(15,23,42,0.72)]" headerClassName="wk-inventory-zoom-header flex items-center justify-between border-b border-neutral-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,255,0.92))] px-5 py-4 md:px-6" bodyClassName="wk-inventory-zoom-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-0" titleClassName="wk-section-title text-base md:text-lg">
        <div data-testid="inventory-zoom-modal" className="wk-inventory-zoom-surface">
          <div className="wk-inventory-zoom-search-shell">
            <FilterField className="h-full" search>
              <div className="wk-control-affix-shell">
                <span className="wk-control-affix wk-control-affix--inline-left text-slate-400">
                  <SearchIcon className="h-5 w-5"/>
                </span>
                <input ref={zoomSearchInputRef} type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={searchInputPlaceholder} dir={isEnglish ? 'ltr' : 'rtl'} aria-label={inventoryZoomSearchLabel} data-testid="inventory-zoom-search-input" className={classNames('wk-input wk-inventory-zoom-search-input text-base font-bold', isEnglish && 'wk-input--ltr', 'wk-input--with-inline-left-affix')}/>
              </div>
            </FilterField>
          </div>

          <section className={`${tableShell} wk-inventory-table-shell--zoom`}>
            {renderInventoryTableContent('zoom')}
          </section>
        </div>
      </Modal>

      {settings ? (<PriceListBuilderModal isOpen={isPriceListBuilderOpen} onClose={() => setIsPriceListBuilderOpen(false)} rows={priceListRows} settings={settings} canViewPurchasePrice={canViewPurchasePrice}/>) : null}

      {canCreate && (<AddMedicineModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddMedicine={addMedicine} onAddMedicineWithProcurementDraft={onAddMedicineWithProcurementDraft} medicines={medicines} suppliers={suppliers} purchases={purchases} partners={partners} onEditExisting={(m) => {
                if (!canEdit)
                    return;
                setIsAddModalOpen(false);
                setDetailsMedicine(m);
                setDetailsMode('view');
            }} onGoToSuppliers={onGoToSuppliers} settings={settings} isGuestTrial={isGuestTrial} canManageCommissionRules={canManageCommissionRules} canStartGuestAiRequest={canStartGuestAiRequest} onGuestAiSuccess={onGuestAiSuccess}/>)}
      {currentDetails && <MedicineDetailsModal medicine={currentDetails} medicines={medicines} purchases={purchases} suppliers={suppliers} partners={partners} onClose={() => setDetailsMedicine(null)} onUpdateMedicine={updateMedicine} onUpdateBatch={updateBatch} onAddBatch={addBatch} onDeleteBatch={deleteBatch} onDeleteMedicine={canDelete && !currentDetailsArchived ? (id) => { deleteMedicine?.(id); setDetailsMedicine(null); } : undefined} readOnly={!canEdit || currentDetailsArchived} canViewPurchasePrice={canViewPurchasePrice} canManageCommissionRules={canManageCommissionRules && !currentDetailsArchived} settings={settings} initialMode={detailsMode} onStartPurchaseReceipt={currentDetailsArchived ? undefined : onStartPurchaseReceipt}/>}
      {analysisMedicine && settings && (null)}
      {wasteMedicine && settings && (<WasteModal isOpen={true} onClose={() => setWasteMedicine(null)} medicine={wasteMedicine} suppliers={suppliers} purchases={purchases} onGoToSuppliers={onGoToSuppliers} onStartPurchaseReceipt={onStartPurchaseReceipt} settings={settings} onConfirm={handleWasteConfirm}/>)}

      {medicineToDelete && (<Modal isOpen={true} onClose={() => setMedicineToDelete(null)} title={t.delete}>
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="font-bold text-red-800">{tr(`Are you sure you want to archive medicine "${medicineToDelete.name}"?`, `آیا از بایگانی داروی "${medicineToDelete.name}" اطمینان دارید؟`)}</p>
              <p className="mt-2 text-sm text-red-600">{tr('This medicine will be hidden from the active inventory list. Related stock history stays available for reports and audit review.', 'این دارو از فهرست فعال انبار بایگانی می‌شود. سوابق موجودی و رکوردهای مرتبط برای گزارش‌گیری و بررسی باقی می‌ماند.')}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setMedicineToDelete(null)} className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800 hover:bg-gray-300">{t.cancel}</button>
              <button onClick={() => {
                if (medicineToDelete && deleteMedicine) {
                    deleteMedicine(medicineToDelete.id);
                    setMedicineToDelete(null);
                }
            }} className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700">{t.delete}</button>
            </div>
          </div>
        </Modal>)}

      {medicineToRestore && (<Modal isOpen={true} onClose={() => setMedicineToRestore(null)} title={tr('Restore medicine', 'بازیابی دوا')}>
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-bold text-emerald-800">{tr(`Restore archived medicine "${medicineToRestore.name}"?`, `دوای بایگانی‌شده "${medicineToRestore.name}" بازیابی شود؟`)}</p>
              <p className="mt-2 text-sm text-emerald-700">{tr('This medicine will return to the active inventory list. It can be edited and used in stock workflows again.', 'این دوا دوباره به فهرست فعال انبار برمی‌گردد و بعد از آن قابل ویرایش و استفاده در جریان موجودی است.')}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setMedicineToRestore(null)} className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800 hover:bg-gray-300">{t.cancel}</button>
              <button onClick={() => {
                if (medicineToRestore && restoreArchivedMedicine) {
                    restoreArchivedMedicine(medicineToRestore.id);
                    setMedicineToRestore(null);
                }
            }} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700">{tr('Restore', 'بازیابی')}</button>
            </div>
          </div>
        </Modal>)}

      {medicineToPurge && (<Modal isOpen={true} onClose={() => setMedicineToPurge(null)} title={tr('Delete from archive', 'حذف از بایگانی')}>
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="font-bold text-rose-800">{tr(`Permanently delete archived medicine "${medicineToPurge.name}"?`, `دوای بایگانی‌شده "${medicineToPurge.name}" کاملاً حذف شود؟`)}</p>
              <p className="mt-2 text-sm text-rose-600">{tr('This action cannot be undone. The full medicine record will be removed from local storage, and a deletion marker stays so old sync snapshots cannot restore it.', 'این عمل قابل برگشت نیست. رکورد کامل دوا از ذخیره محلی پاک می‌شود و فقط یک نشان حذف باقی می‌ماند تا snapshotهای قدیمی دوباره آن را برنگردانند.')}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setMedicineToPurge(null)} className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800 hover:bg-gray-300">{t.cancel}</button>
              <button onClick={() => {
                if (medicineToPurge && purgeArchivedMedicine) {
                    purgeArchivedMedicine(medicineToPurge.id);
                    setMedicineToPurge(null);
                }
            }} className="rounded-lg bg-rose-600 px-4 py-2 font-bold text-white hover:bg-rose-700">{tr('Delete permanently', 'حذف کامل')}</button>
            </div>
          </div>
        </Modal>)}
    </div>);
};
