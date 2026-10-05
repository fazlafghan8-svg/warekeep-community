import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Medicine, MedicineClinicalSummary, MedicineType, MedicineUnit, AppSettings, Supplier, Purchase, Partner, BatchOwnershipType, StockEntryType, MedicineAiInputMode, MedicineProcurementDraftRequest } from '../types';
import { sanitizeMedicineClinicalSummary, sanitizeMedicineDescription, IdentifyScanProfile } from "../services/medicineTextSanitization";
import { Modal } from './ui/Modal';
import { NewFeatureBadge } from './ui/NewFeatureBadge';
import { normalizePersianNumbers, getMedicineTypeLabel } from '../utils/localization';
import { isManualMedicineEntryAutoScrollEnabled, incrementMedicineEntryAutomationLearningState, normalizeMedicineEntryAutomationSettings, readMedicineEntryAutomationLearningState } from '../utils/medicineEntryAutomation';
import { incrementMedicineProcurementAssistLearningState, normalizeMedicineProcurementAssistSettings, readMedicineProcurementAssistLearningState } from '../utils/medicineProcurementAssist';
import { MEDICINE_TYPES } from '../constants/medicineTypes';
import { DEFAULT_MEDICINE_UNITS, getMedicineUnitLabel, getMedicineUnitOptions } from '../constants/medicineUnits';
import { resolveDefaultSalesMode } from '../constants/sales';
import { buildManufacturerDirectory, canonicalizeManufacturerName, getManufacturerSuggestions } from '../utils/manufacturerCanonicalization';
import { createUniqueId } from '../utils/localIds';
import { normalizeSaleUnits, toBaseQuantity } from '../utils/unitConversion';
import { resolveSalesModePrice } from '../lib/formatters';
import { normalizeCommissionAdjustmentPercent } from '../utils/commissionRules';
interface AddMedicineModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddMedicine: (medicine: Omit<Medicine, 'id'>) => boolean | void | Promise<boolean | void>;
    onAddMedicineWithProcurementDraft?: (payload: MedicineProcurementDraftRequest) => boolean | void | Promise<boolean | void>;
    medicines?: Medicine[];
    suppliers?: Supplier[];
    purchases?: Purchase[];
    partners?: Partner[];
    onEditExisting?: (medicine: Medicine) => void;
    onGoToSuppliers?: () => void;
    settings?: AppSettings;
    isGuestTrial?: boolean;
    canManageCommissionRules?: boolean;
    canStartGuestAiRequest?: () => boolean;
    onGuestAiSuccess?: () => void;
}
const normalizeMedicineLookupValue = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();
type ScannerEngine = 'native' | 'fallback' | 'none';
type CameraStartResult = 'started' | 'retry' | 'fatal';
type ScanSource = 'native' | 'fallback' | 'manual' | 'auto';
type LocalBarcodeDetection = {
    code: string;
    source: Extract<ScanSource, 'native' | 'fallback'> | null;
};
type AiCardDensity = 'compact' | 'comfortable';
type ScanHistoryItem = {
    id: string;
    code: string;
    confidence: number;
    source: ScanSource;
    timestamp: number;
};
type SubmitMedicineDraftResult = {
    ok: boolean;
    duplicate: Medicine | null;
};
type ProcurementDraftTargetMode = 'open_supplier_draft' | 'new_invoice';
type ProcurementReceiptMode = 'all' | 'partial' | 'none';
type DraftSnapshot = {
    name: string;
    genericName: string;
    manufacturer: string;
    type: MedicineType;
    unit: MedicineUnit;
    itemsPerBox: number;
    description: string;
    clinicalSummary?: MedicineClinicalSummary;
    barcode: string;
    batchNumber: string;
    quantity: number;
    expMonth: string;
    expYear: string;
    rack: string;
    shelf: string;
    supplierId: string;
    purchasePrice: string;
    retailPrice: string;
    wholesalePrice: string;
    bulkPrice: string;
    commissionAdjustmentPercent: string;
    lowStockThreshold: number;
    allowFractionalQuantity: boolean;
};
type AddMedicineStep = 1 | 2;
type StepValidationErrors = {
    name?: string;
};
type ModeButtonProps = {
    mode: MedicineAiInputMode;
    activeMode: MedicineAiInputMode;
    label: string;
    onClick: (mode: MedicineAiInputMode) => void;
    children: React.ReactNode;
};
const AI_CARD_DENSITY_STORAGE_KEY = 'warekeep:ai-card-density';
const AI_SCAN_PROFILE_STORAGE_KEY = 'warekeep:ai-scan-profile';
const MANUAL_SCROLL_LEARNING_DELTA_PX = 48;
const PROGRAMMATIC_SCROLL_GUARD_MS = 500;
const SECTION_SCROLL_OFFSET_PX = 12;
type ClinicalSummaryFieldKey = 'composition' | 'use' | 'dose' | 'mechanism' | 'sideEffects' | 'caution';
export const AddMedicineModal: React.FC<AddMedicineModalProps> = ({ isOpen, onClose, onAddMedicine, onAddMedicineWithProcurementDraft, medicines = [], suppliers = [], purchases = [], partners = [], onEditExisting, onGoToSuppliers, settings, isGuestTrial = false, canManageCommissionRules = false, canStartGuestAiRequest, onGuestAiSuccess }) => {
    const isEnglish = (settings?.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const hasSuppliers = suppliers.length > 0;
    const medicineEntryAutomation = normalizeMedicineEntryAutomationSettings(settings?.medicineEntryAutomation);
    const procurementAssistSettings = normalizeMedicineProcurementAssistSettings(settings?.medicineProcurementAssist);
    const getUnitLabel = (unitValue: string) => getMedicineUnitLabel(unitValue, isEnglish);
    const medicineUnitOptions = useMemo(() => getMedicineUnitOptions(settings, medicines.map((medicine) => medicine.unit)), [medicines, settings]);
    // Core Info
    const [name, setName] = useState('');
    const [genericName, setGenericName] = useState('');
    const [manufacturer, setManufacturer] = useState('');
    const [manufacturerHint, setManufacturerHint] = useState('');
    const [type, setType] = useState<MedicineType>('Tablet');
    const [unit, setUnit] = useState<MedicineUnit>(DEFAULT_MEDICINE_UNITS[0]);
    const [itemsPerBox, setItemsPerBox] = useState<number>(1);
    const [description, setDescription] = useState('');
    const [clinicalSummary, setClinicalSummary] = useState<MedicineClinicalSummary | undefined>(undefined);
    const [barcode, setBarcode] = useState('');
    const [allowFractionalQuantity, setAllowFractionalQuantity] = useState(false);
    // Batch & Stock
    const [batchNumber, setBatchNumber] = useState('');
    const [quantity, setQuantity] = useState(0);
    // Date Logic
    const [expMonth, setExpMonth] = useState('');
    const [expYear, setExpYear] = useState('');
    const [rack, setRack] = useState('');
    const [shelf, setShelf] = useState('');
    const [supplierId, setSupplierId] = useState('');
    // Pricing
    const [purchasePrice, setPurchasePrice] = useState<string>('');
    const [retailPrice, setRetailPrice] = useState<string>('');
    const [wholesalePrice, setWholesalePrice] = useState<string>('');
    const [bulkPrice, setBulkPrice] = useState<string>('');
    const [commissionAdjustmentPercent, setCommissionAdjustmentPercent] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lowStockThreshold, setLowStockThreshold] = useState(10);
    const [currentStep, setCurrentStep] = useState<AddMedicineStep>(1);
    const [stepValidationErrors, setStepValidationErrors] = useState<StepValidationErrors>({});
    // AI & Logic State
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [existingMedicine, setExistingMedicine] = useState<Medicine | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [aiInputMode, setAiInputMode] = useState<MedicineAiInputMode>("upload");
    const [liveScannerHint, setLiveScannerHint] = useState('');
    const [aiConfidence, setAiConfidence] = useState(0);
    const [aiProgress, setAiProgress] = useState(0);
    const [usedWebSearch, setUsedWebSearch] = useState(false);
    const [autoSavedByAi, setAutoSavedByAi] = useState(false);
    const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
    const [medicineEntryAutomationLearning, setMedicineEntryAutomationLearning] = useState(() => readMedicineEntryAutomationLearningState(medicineEntryAutomation.adaptiveThreshold));
    const isManualAutoScrollEnabled = isManualMedicineEntryAutoScrollEnabled(medicineEntryAutomation, medicineEntryAutomationLearning);
    const [procurementAssistLearning, setProcurementAssistLearning] = useState(() => readMedicineProcurementAssistLearningState(procurementAssistSettings.adaptiveThreshold));
    const [procurementAssistEnabled, setProcurementAssistEnabled] = useState(false);
    const [procurementAssistTouched, setProcurementAssistTouched] = useState(false);
    const [procurementTargetMode, setProcurementTargetMode] = useState<ProcurementDraftTargetMode>('open_supplier_draft');
    const [procurementInvoiceNumber, setProcurementInvoiceNumber] = useState('');
    const [procurementReceiptMode, setProcurementReceiptMode] = useState<ProcurementReceiptMode>('all');
    const [procurementReceivedQuantity, setProcurementReceivedQuantity] = useState('');
    const [partnerStockEnabled, setPartnerStockEnabled] = useState(false);
    const [partnerStockPartnerId, setPartnerStockPartnerId] = useState('');
    const [partnerStockEntryType, setPartnerStockEntryType] = useState<Extract<StockEntryType, 'partner_goods_capital' | 'partner_consignment'>>('partner_goods_capital');
    const [partnerAgreedValue, setPartnerAgreedValue] = useState('');
    const [partnerSuggestedSalePrice, setPartnerSuggestedSalePrice] = useState('');
    const [aiCardDensity, setAiCardDensity] = useState<AiCardDensity>(() => {
        try {
            const raw = localStorage.getItem(AI_CARD_DENSITY_STORAGE_KEY);
            return raw === 'compact' || raw === 'comfortable' ? raw : 'comfortable';
        }
        catch {
            return 'comfortable';
        }
    });
    const [scanSpeedProfile, setScanSpeedProfile] = useState<IdentifyScanProfile>(() => {
        try {
            const raw = localStorage.getItem(AI_SCAN_PROFILE_STORAGE_KEY);
            return raw === 'fast' || raw === 'balanced' || raw === 'accurate' ? raw : 'balanced';
        }
        catch {
            return 'balanced';
        }
    });
    // Margin Stats
    const [marginPercent, setMarginPercent] = useState(0);
    // --- Refs for Enter Key Navigation ---
    const formRef = useRef<HTMLFormElement>(null);
    const coreDetailsRef = useRef<HTMLDivElement>(null);
    const packagingPlacementRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const genericInputRef = useRef<HTMLInputElement>(null);
    const manufacturerInputRef = useRef<HTMLInputElement>(null);
    const typeSelectRef = useRef<HTMLSelectElement>(null);
    const barcodeInputRef = useRef<HTMLInputElement>(null);
    const unitSelectRef = useRef<HTMLSelectElement>(null);
    const thresholdInputRef = useRef<HTMLInputElement>(null);
    const rackInputRef = useRef<HTMLInputElement>(null);
    const shelfInputRef = useRef<HTMLInputElement>(null);
    const purchasePriceRef = useRef<HTMLInputElement>(null);
    const wholesalePriceRef = useRef<HTMLInputElement>(null);
    const bulkPriceRef = useRef<HTMLInputElement>(null);
    const retailPriceRef = useRef<HTMLInputElement>(null);
    const quantityRef = useRef<HTMLInputElement>(null);
    const expMonthRef = useRef<HTMLInputElement>(null);
    const expYearRef = useRef<HTMLInputElement>(null);
    const batchRef = useRef<HTMLInputElement>(null);
    const supplierRef = useRef<HTMLSelectElement>(null);
    const saveAndNewBtnRef = useRef<HTMLButtonElement>(null);
    const nextStepBtnRef = useRef<HTMLButtonElement>(null);
    const aiQueryInputRef = useRef<HTMLInputElement>(null);
    const medicinesRef = useRef<Medicine[]>(medicines);
    const brandInteractionStartedRef = useRef(false);
    const brandScrollObservationArmedRef = useRef(false);
    const brandScrollObservationCountedRef = useRef(false);
    const brandScrollObservationStartTopRef = useRef(0);
    const brandAutoScrollDoneRef = useRef(false);
    const programmaticScrollGuardUntilRef = useRef(0);
    const manufacturerSuggestionsId = 'manufacturer-canonical-suggestions';
    const manufacturerDirectory = useMemo(() => buildManufacturerDirectory(medicines), [medicines]);
    const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
    const activePartners = useMemo(() => partners.filter((partner) => !partner.isDeleted && partner.status !== 'inactive'), [partners]);
    const partnerById = useMemo(() => new Map(activePartners.map((partner) => [partner.id, partner])), [activePartners]);
    const selectedSupplierOpenDraft = useMemo(() => {
        if (!supplierId)
            return null;
        return [...purchases]
            .filter((purchase) => (!purchase.isDeleted
            && purchase.supplierId === supplierId
            && (purchase.workflowStatus || purchase.status) !== 'cancelled'
            && !purchase.shortClosedAt
            && ((purchase.workflowStatus || purchase.status) === 'draft'
                || (purchase.notes || '').includes('Created from medicine entry'))))
            .sort((left, right) => new Date(right.updatedAt || right.createdAt || right.date || 0).getTime() - new Date(left.updatedAt || left.createdAt || left.date || 0).getTime())[0] || null;
    }, [purchases, supplierId]);
    const manufacturerSuggestions = useMemo(() => getManufacturerSuggestions(manufacturer, manufacturerDirectory, 10), [manufacturer, manufacturerDirectory]);
    const selectedSupplierName = supplierId ? supplierById.get(supplierId)?.name || '' : '';
    const selectedPartner = partnerById.get(partnerStockPartnerId) || null;
    const partnerOwnershipType: BatchOwnershipType = partnerStockEntryType === 'partner_consignment' ? 'consignment' : 'partner';
    const partnerSourceDocumentNumber = partnerStockEnabled && partnerStockPartnerId
        ? (procurementInvoiceNumber.trim() || batchNumber.trim() || undefined)
        : undefined;
    const partnerLineFields = partnerStockEnabled && partnerStockPartnerId
        ? {
            partnerId: partnerStockPartnerId,
            ownerPartnerId: partnerStockPartnerId,
            stockEntryType: partnerStockEntryType,
            ownershipType: partnerOwnershipType,
            agreedPartnerValue: parseFloat(partnerAgreedValue) || undefined,
            suggestedSalePrice: parseFloat(partnerSuggestedSalePrice) || undefined,
            sourceDocumentNumber: partnerSourceDocumentNumber,
        }
        : {};
    const resetBrandInteractionTracking = useCallback(() => {
        brandInteractionStartedRef.current = false;
        brandScrollObservationArmedRef.current = false;
        brandScrollObservationCountedRef.current = false;
        brandScrollObservationStartTopRef.current = 0;
        brandAutoScrollDoneRef.current = false;
    }, []);
    const getModalScrollContainer = useCallback(() => formRef.current?.parentElement as HTMLDivElement | null, []);
    const scrollSectionIntoView = useCallback((target: React.RefObject<HTMLElement>) => {
        if (!target.current)
            return;
        programmaticScrollGuardUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_GUARD_MS;
        const scrollContainer = getModalScrollContainer();
        if (!scrollContainer) {
            target.current.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
            return;
        }
        const targetRect = target.current.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const nextScrollTop = Math.max(0, scrollContainer.scrollTop + (targetRect.top - containerRect.top) - SECTION_SCROLL_OFFSET_PX);
        const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        const boundedScrollTop = Math.min(maxScrollTop, nextScrollTop);
        scrollContainer.scrollTo({ top: boundedScrollTop, behavior: 'auto' });
        if (Math.abs(scrollContainer.scrollTop - boundedScrollTop) > 1) {
            scrollContainer.scrollTop = boundedScrollTop;
        }
    }, [getModalScrollContainer]);
    const armBrandScrollObservation = useCallback(() => {
        if (!medicineEntryAutomation.adaptiveLearning || currentStep !== 1)
            return;
        const scrollContainer = getModalScrollContainer();
        brandScrollObservationArmedRef.current = true;
        brandScrollObservationCountedRef.current = false;
        brandScrollObservationStartTopRef.current = scrollContainer?.scrollTop || 0;
    }, [currentStep, getModalScrollContainer, medicineEntryAutomation.adaptiveLearning]);
    const maybeRunManualEntryAutoScroll = useCallback((trigger: typeof medicineEntryAutomation.trigger) => {
        if (!isOpen || currentStep !== 1)
            return;
        if (medicineEntryAutomation.trigger !== trigger)
            return;
        if (brandAutoScrollDoneRef.current)
            return;
        if (!isManualAutoScrollEnabled)
            return;
        brandAutoScrollDoneRef.current = true;
        scrollSectionIntoView(coreDetailsRef);
    }, [
        currentStep,
        isOpen,
        medicineEntryAutomation.trigger,
        isManualAutoScrollEnabled,
        scrollSectionIntoView,
    ]);
    const applyCanonicalManufacturer = useCallback((rawValue: string) => {
        const canonical = canonicalizeManufacturerName(rawValue, manufacturerDirectory);
        const trimmedValue = rawValue.trim();
        const nextValue = canonical.displayName || trimmedValue;
        setManufacturer(nextValue);
        if (!trimmedValue) {
            setManufacturerHint('');
            return '';
        }
        if (canonical.matchedCanonical && canonical.displayName !== canonical.cleanedValue) {
            setManufacturerHint(tr(`Matched to existing manufacturer: ${canonical.displayName}`, `به نام معتبر موجود یکسان شد: ${canonical.displayName}`));
            return nextValue;
        }
        if (canonical.cleanedValue && canonical.cleanedValue !== trimmedValue) {
            setManufacturerHint(tr('Manufacturer name was cleaned and standardized.', 'نام تولیدکننده پاک‌سازی و یک‌دست شد.'));
            return nextValue;
        }
        setManufacturerHint('');
        return nextValue;
    }, [manufacturerDirectory, tr]);
    useEffect(() => {
        medicinesRef.current = medicines;
    }, [medicines]);
    useEffect(() => {
        setMedicineEntryAutomationLearning(readMedicineEntryAutomationLearningState(medicineEntryAutomation.adaptiveThreshold));
    }, [medicineEntryAutomation.adaptiveThreshold]);
    useEffect(() => {
        setProcurementAssistLearning(readMedicineProcurementAssistLearningState(procurementAssistSettings.adaptiveThreshold));
    }, [procurementAssistSettings.adaptiveThreshold]);
    useEffect(() => {
        if (!supplierId) {
            setProcurementAssistEnabled(false);
            setProcurementAssistTouched(false);
            return;
        }
        if (procurementAssistTouched)
            return;
        setProcurementAssistEnabled(procurementAssistSettings.enabled && procurementAssistLearning.learnedDefaultEnabled);
    }, [
        procurementAssistLearning.learnedDefaultEnabled,
        procurementAssistSettings.enabled,
        procurementAssistTouched,
        supplierId,
    ]);
    useEffect(() => {
        if (!isOpen)
            return;
        const scrollContainer = getModalScrollContainer();
        if (!scrollContainer)
            return;
        const onScroll = () => {
            if (!medicineEntryAutomation.adaptiveLearning)
                return;
            if (!brandScrollObservationArmedRef.current || brandScrollObservationCountedRef.current)
                return;
            if (Date.now() < programmaticScrollGuardUntilRef.current)
                return;
            if (scrollContainer.scrollTop <= brandScrollObservationStartTopRef.current + MANUAL_SCROLL_LEARNING_DELTA_PX)
                return;
            brandScrollObservationCountedRef.current = true;
            brandScrollObservationArmedRef.current = false;
            setMedicineEntryAutomationLearning(incrementMedicineEntryAutomationLearningState(medicineEntryAutomation.adaptiveThreshold));
        };
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', onScroll);
    }, [
        getModalScrollContainer,
        isOpen,
        medicineEntryAutomation.adaptiveLearning,
        medicineEntryAutomation.adaptiveThreshold,
    ]);
    // Auto-focus and default AI mode when modal opens.
    useEffect(() => {
        if (!isOpen) {
            resetBrandInteractionTracking();
            return;
        }
        resetBrandInteractionTracking();
        setMedicineEntryAutomationLearning(readMedicineEntryAutomationLearningState(medicineEntryAutomation.adaptiveThreshold));
        setCurrentStep(1);
        setStepValidationErrors({});
        setTimeout(() => {
            {
                nameInputRef.current?.focus();
            }
        }, 120);
        return () => {
        };
    }, [isOpen, "upload"]);
    // Check for duplicates (DEBOUNCED to fix lag)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!name || name.length < 2) {
                setExistingMedicine(null);
                return;
            }
            const normalizedInput = normalizeMedicineLookupValue(name);
            const match = medicines.find((medicine) => normalizeMedicineLookupValue(medicine?.name) === normalizedInput);
            setExistingMedicine(match || null);
        }, 500);
        return () => clearTimeout(timer);
    }, [name, medicines]);
    // Calculate Margin (DEBOUNCED)
    useEffect(() => {
        const timer = setTimeout(() => {
            const buy = parseFloat(purchasePrice) || 0;
            const mode = resolveDefaultSalesMode(settings);
            const sell = resolveSalesModePrice({
                retail: parseFloat(retailPrice) || 0,
                wholesale: parseFloat(wholesalePrice) || 0,
                bulk: parseFloat(bulkPrice) || 0,
            }, mode);
            if (buy > 0 && sell > 0) {
                const margin = ((sell - buy) / sell) * 100;
                setMarginPercent(margin);
            }
            else {
                setMarginPercent(0);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [bulkPrice, purchasePrice, retailPrice, settings?.defaultSalesMode, wholesalePrice]);
    const generateBarcode = () => {
        const prefix = "626";
        const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        setBarcode(prefix + random);
    };
    const findExactDuplicateMedicine = useCallback((candidateName: string, candidateBarcode: string): Medicine | null => {
        const normalizedName = normalizeMedicineLookupValue(candidateName);
        const normalizedBarcode = candidateBarcode.trim();
        return medicines.find((medicine) => {
            const sameName = normalizedName.length > 0 && normalizeMedicineLookupValue(medicine.name || '') === normalizedName;
            const sameBarcode = normalizedBarcode.length > 0 && (medicine.barcode || '').trim() === normalizedBarcode;
            return sameName || sameBarcode;
        }) || null;
    }, [medicines, normalizeMedicineLookupValue]);
    const handleResetForm = () => {
        resetBrandInteractionTracking();
        setCurrentStep(1);
        setStepValidationErrors({});
        setName('');
        setGenericName('');
        setManufacturer('');
        setManufacturerHint('');
        setBarcode('');
        setAllowFractionalQuantity(false);
        setBatchNumber('');
        setQuantity(0);
        setExpMonth('');
        setExpYear('');
        setRack('');
        setShelf('');
        setPurchasePrice('');
        setRetailPrice('');
        setWholesalePrice('');
        setBulkPrice('');
        setCommissionAdjustmentPercent('');
        setExistingMedicine(null);
        setClinicalSummary(undefined);
        setSupplierId('');
        setProcurementAssistEnabled(false);
        setProcurementAssistTouched(false);
        setProcurementTargetMode('open_supplier_draft');
        setProcurementInvoiceNumber('');
        setProcurementReceiptMode('all');
        setProcurementReceivedQuantity('');
        setPartnerStockEnabled(false);
        setPartnerStockPartnerId('');
        setPartnerStockEntryType('partner_goods_capital');
        setPartnerAgreedValue('');
        setPartnerSuggestedSalePrice('');
        setItemsPerBox(1);
        if (aiQueryInputRef.current) {
            aiQueryInputRef.current.value = '';
        }
        nameInputRef.current?.focus();
    };
    const buildCurrentDraftSnapshot = useCallback((overrides?: Partial<DraftSnapshot>): DraftSnapshot => ({
        name,
        genericName,
        manufacturer,
        type,
        unit,
        itemsPerBox,
        description,
        clinicalSummary,
        barcode,
        allowFractionalQuantity,
        batchNumber,
        quantity,
        expMonth,
        expYear,
        rack,
        shelf,
        supplierId,
        purchasePrice,
        retailPrice,
        wholesalePrice,
        bulkPrice,
        commissionAdjustmentPercent,
        lowStockThreshold,
        ...overrides
    }), [
        allowFractionalQuantity,
        barcode,
        batchNumber,
        bulkPrice,
        commissionAdjustmentPercent,
        description,
        expMonth,
        expYear,
        genericName,
        itemsPerBox,
        clinicalSummary,
        lowStockThreshold,
        manufacturer,
        name,
        purchasePrice,
        quantity,
        rack,
        retailPrice,
        shelf,
        supplierId,
        type,
        unit,
        wholesalePrice
    ]);
    const resolveDraftBatchNumber = useCallback((draft: DraftSnapshot) => {
        return draft.batchNumber.trim() || `AUTO-${Math.floor(Math.random() * 10000)}`;
    }, []);
    const resolveDraftExpiryDate = useCallback((draft: DraftSnapshot) => {
        if (draft.expMonth && draft.expYear) {
            const fullYear = draft.expYear.length === 2 ? `20${draft.expYear}` : draft.expYear;
            const monthInt = parseInt(draft.expMonth, 10);
            const lastDay = new Date(parseInt(fullYear, 10), monthInt, 0).getDate();
            return `${fullYear}-${draft.expMonth.padStart(2, '0')}-${lastDay}`;
        }
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1);
        return date.toISOString().split('T')[0];
    }, []);
    const handleProcurementAssistToggle = useCallback((checked: boolean) => {
        setProcurementAssistTouched(true);
        if (checked
            && !procurementAssistEnabled
            && procurementAssistSettings.adaptiveLearning) {
            setProcurementAssistLearning(incrementMedicineProcurementAssistLearningState(procurementAssistSettings.adaptiveThreshold));
        }
        setProcurementAssistEnabled(checked);
    }, [
        procurementAssistEnabled,
        procurementAssistSettings.adaptiveLearning,
        procurementAssistSettings.adaptiveThreshold,
    ]);
    const submitMedicineDraft = useCallback(async (e: React.SyntheticEvent | null, options?: {
        keepOpen?: boolean;
        promptOnDuplicate?: boolean;
        duplicateOverride?: Medicine | null;
        draftOverride?: Partial<DraftSnapshot>;
    }): Promise<SubmitMedicineDraftResult> => {
        e?.preventDefault();
        const keepOpen = options?.keepOpen === true;
        const promptOnDuplicate = options?.promptOnDuplicate !== false;
        const draft = buildCurrentDraftSnapshot(options?.draftOverride);
        const duplicate = options?.duplicateOverride === undefined
            ? findExactDuplicateMedicine(draft.name, draft.barcode)
            : options.duplicateOverride;
        if (duplicate) {
            setExistingMedicine(duplicate);
            if (promptOnDuplicate) {
                if (!window.confirm(tr('This medicine already exists. Continue?', 'این دوا قبلا ثبت شده است. ادامه می‌دهید؟'))) {
                    return { ok: false, duplicate };
                }
            }
            else {
                return { ok: false, duplicate };
            }
        }
        const finalManufacturer = applyCanonicalManufacturer(draft.manufacturer) || tr('Unknown', 'نامشخص');
        const trimmedName = draft.name.trim();
        if (!trimmedName) {
            alert(tr('Medicine name is required.', 'نام دوا الزامی است.'));
            nameInputRef.current?.focus();
            return { ok: false, duplicate };
        }
        const finalBatchNumber = resolveDraftBatchNumber(draft);
        const finalExpiryDate = resolveDraftExpiryDate(draft);
        const shouldUseProcurementDraft = procurementAssistEnabled && !!onAddMedicineWithProcurementDraft;
        const baseUnit = draft.unit;
        const saleUnits = normalizeSaleUnits({ unit: draft.unit, baseUnit, itemsPerBox: draft.itemsPerBox });
        const draftBaseQuantity = toBaseQuantity(draft.quantity, { conversionFactor: 1 });
        if (partnerStockEnabled && !partnerStockPartnerId) {
            alert(tr('Choose a partner before registering this stock under a partner account.', 'برای ثبت این موجودی به نام شریک، اول شریک را انتخاب کنید.'));
            return { ok: false, duplicate };
        }
        const nowIso = new Date().toISOString();
        const medicineCommissionAdjustment = canManageCommissionRules
            ? normalizeCommissionAdjustmentPercent(draft.commissionAdjustmentPercent)
            : 0;
        const commissionRules = medicineCommissionAdjustment === 0
            ? []
            : [{
                    id: createUniqueId('medcom'),
                    adjustmentPercent: medicineCommissionAdjustment,
                    enabled: true,
                    note: tr('Default medicine commission adjustment', 'تعدیل عمومی کمیسیون دوا'),
                    updatedAt: nowIso
                }];
        const newMedicine: Omit<Medicine, 'id'> = {
            name: trimmedName,
            genericName: draft.genericName.trim(),
            manufacturer: finalManufacturer,
            type: draft.type,
            unit: draft.unit,
            baseUnit,
            saleUnits,
            itemsPerBox: draft.itemsPerBox,
            description: sanitizeMedicineDescription(draft.description),
            clinicalSummary: sanitizeMedicineClinicalSummary(draft.clinicalSummary),
            barcode: draft.barcode,
            allowFractionalQuantity: draft.allowFractionalQuantity,
            preferredSupplierId: draft.supplierId || undefined,
            lowStockThreshold: draft.lowStockThreshold,
            salePrices: {
                retail: parseFloat(draft.retailPrice) || 0,
                wholesale: parseFloat(draft.wholesalePrice) || 0,
                bulk: parseFloat(draft.bulkPrice) || 0,
            },
            commissionRules,
            batches: shouldUseProcurementDraft ? [] : [{
                    id: createUniqueId('batch'),
                    batchNumber: finalBatchNumber,
                    quantity: draftBaseQuantity,
                    expiryDate: finalExpiryDate,
                    purchasePrice: parseFloat(draft.purchasePrice) || 0,
                    ownershipType: partnerStockEnabled && partnerStockPartnerId ? partnerOwnershipType : 'store',
                    ownerPartnerId: partnerStockEnabled && partnerStockPartnerId ? partnerStockPartnerId : undefined,
                    agreedPartnerValue: partnerStockEnabled && partnerStockPartnerId
                        ? (parseFloat(partnerAgreedValue) || parseFloat(draft.purchasePrice) || undefined)
                        : undefined,
                    suggestedSalePrice: partnerStockEnabled && partnerStockPartnerId
                        ? (parseFloat(partnerSuggestedSalePrice) || parseFloat(draft.retailPrice) || undefined)
                        : undefined,
                    sourceEntryType: partnerStockEnabled && partnerStockPartnerId ? partnerStockEntryType : 'store_purchase',
                    sourceDocumentNumber: partnerSourceDocumentNumber,
                    receivedQuantity: draftBaseQuantity,
                    receivedAt: nowIso,
                    traceSource: 'manual',
                    lastMovementAt: nowIso,
                    availabilityStatus: 'available',
                    location: { rack: draft.rack.trim(), shelf: draft.shelf.trim() },
                    history: [{ date: nowIso, action: tr('Created', 'ایجاد شد'), details: tr('Initial registration as manual batch', 'ثبت اولیه به‌صورت batch دستی') }],
                }],
        };
        if (shouldUseProcurementDraft) {
            const quantityValue = Number(draft.quantity || 0);
            const purchasePriceValue = parseFloat(draft.purchasePrice) || 0;
            if (!draft.supplierId) {
                alert(tr('Choose a supplier before sending this item into procurement.', 'پیش از فرستادن این قلم به خرید، یک تأمین‌کننده انتخاب کنید.'));
                supplierRef.current?.focus();
                return { ok: false, duplicate };
            }
            if (quantityValue <= 0) {
                alert(tr('Quantity must be greater than zero before creating a supplier draft.', 'پیش از ساخت پیش‌نویس تأمین‌کننده، تعداد باید بیشتر از صفر باشد.'));
                quantityRef.current?.focus();
                return { ok: false, duplicate };
            }
            if (purchasePriceValue <= 0) {
                alert(tr('Purchase price must be greater than zero before creating a supplier draft.', 'پیش از ساخت پیش‌نویس تأمین‌کننده، قیمت خرید باید بیشتر از صفر باشد.'));
                purchasePriceRef.current?.focus();
                return { ok: false, duplicate };
            }
            const receivedQuantityValue = procurementReceiptMode === 'all'
                ? quantityValue
                : procurementReceiptMode === 'partial'
                    ? parseFloat(procurementReceivedQuantity) || 0
                    : 0;
            if (procurementReceiptMode === 'partial' && (receivedQuantityValue <= 0 || receivedQuantityValue > quantityValue)) {
                alert(tr('Received quantity must be between 1 and the ordered quantity.', 'مقدار رسیده باید از ۱ تا مقدار سفارش باشد.'));
                quantityRef.current?.focus();
                return { ok: false, duplicate };
            }
            const procurementResult = await onAddMedicineWithProcurementDraft({
                medicine: newMedicine,
                supplierId: draft.supplierId,
                targetPurchaseMode: procurementTargetMode,
                targetPurchaseId: procurementTargetMode === 'open_supplier_draft' ? selectedSupplierOpenDraft?.id : undefined,
                requestedInvoiceNumber: procurementTargetMode === 'new_invoice' ? procurementInvoiceNumber.trim() : undefined,
                purchaseLineDraft: {
                    batchNumber: finalBatchNumber,
                    expiryDate: finalExpiryDate,
                    quantity: quantityValue,
                    baseQuantity: quantityValue,
                    purchasePrice: purchasePriceValue,
                    barcode: draft.barcode || undefined,
                    unit: draft.unit || undefined,
                    purchaseUnitName: draft.unit || undefined,
                    purchaseUnitConversionFactor: 1,
                    baseUnit,
                    notes: tr('Created from Add Medicine form', 'از فورم افزودن دوا ساخته شد'),
                    ...partnerLineFields,
                },
                quickReceipt: {
                    mode: procurementReceiptMode,
                    quantity: receivedQuantityValue,
                    date: new Date().toISOString(),
                    note: tr('Quick receipt from Add Medicine form', 'دریافت سریع از فورم افزودن دوا')
                }
            });
            if (procurementResult === false) {
                return { ok: false, duplicate };
            }
        }
        else {
            const addMedicineResult = await onAddMedicine(newMedicine);
            if (addMedicineResult === false) {
                return { ok: false, duplicate };
            }
        }
        if (keepOpen) {
            handleResetForm();
        }
        else {
            onClose();
        }
        return { ok: true, duplicate };
    }, [
        applyCanonicalManufacturer,
        buildCurrentDraftSnapshot,
        canManageCommissionRules,
        findExactDuplicateMedicine,
        handleResetForm,
        onAddMedicineWithProcurementDraft,
        onAddMedicine,
        onClose,
        procurementInvoiceNumber,
        procurementReceiptMode,
        procurementReceivedQuantity,
        procurementAssistEnabled,
        procurementTargetMode,
        partnerAgreedValue,
        partnerLineFields,
        partnerOwnershipType,
        partnerSourceDocumentNumber,
        partnerStockEnabled,
        partnerStockEntryType,
        partnerStockPartnerId,
        partnerSuggestedSalePrice,
        resolveDraftBatchNumber,
        resolveDraftExpiryDate,
        selectedSupplierOpenDraft?.id,
        tr,
    ]);
    // --- Helper for Enter Navigation ---
    const handleBrandNameFocus = () => {
        if (!brandInteractionStartedRef.current) {
            brandAutoScrollDoneRef.current = false;
            brandScrollObservationCountedRef.current = false;
        }
        if (medicineEntryAutomation.trigger === 'focus') {
            maybeRunManualEntryAutoScroll('focus');
        }
    };
    const handleBrandNameBlur = (value: string) => {
        if (medicineEntryAutomation.trigger === 'blur' && value.trim()) {
            maybeRunManualEntryAutoScroll('blur');
        }
        brandInteractionStartedRef.current = false;
        brandScrollObservationArmedRef.current = false;
        brandScrollObservationCountedRef.current = false;
        brandScrollObservationStartTopRef.current = 0;
        brandAutoScrollDoneRef.current = false;
    };
    const handleBrandNameChange = (value: string) => {
        setName(value);
        if (stepValidationErrors.name) {
            setStepValidationErrors((prev) => ({ ...prev, name: undefined }));
        }
        if (!value.trim()) {
            return;
        }
        if (!brandInteractionStartedRef.current) {
            brandInteractionStartedRef.current = true;
            armBrandScrollObservation();
        }
        if (medicineEntryAutomation.trigger === 'typing') {
            maybeRunManualEntryAutoScroll('typing');
        }
    };
    const handleEnter = (e: React.KeyboardEvent, nextRef: React.RefObject<HTMLElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextRef.current?.focus();
            if (nextRef.current instanceof HTMLInputElement) {
                nextRef.current.select();
            }
        }
    };
    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = normalizePersianNumbers(e.target.value).replace(/\D/g, '');
        if (val.length > 2)
            val = val.slice(0, 2);
        if (parseInt(val) > 12 && val.length === 2)
            val = '12';
        setExpMonth(val);
        if (val.length === 2)
            expYearRef.current?.focus();
    };
    const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = normalizePersianNumbers(e.target.value).replace(/\D/g, '');
        if (val.length > 2)
            val = val.slice(0, 2);
        setExpYear(val);
        if (val.length === 2)
            batchRef.current?.focus();
    };
    const handleSubmitForm = useCallback(async (e: React.SyntheticEvent, keepOpen: boolean = false) => {
        if (isSubmitting)
            return;
        setIsSubmitting(true);
        try {
            await submitMedicineDraft(e, {
                keepOpen,
                promptOnDuplicate: true,
                duplicateOverride: existingMedicine
            });
        }
        finally {
            setIsSubmitting(false);
        }
    }, [existingMedicine, isSubmitting, submitMedicineDraft]);
    const validateStepOne = useCallback(() => {
        const nextErrors: StepValidationErrors = {};
        if (!name.trim()) {
            nextErrors.name = tr('Brand name is required to continue.', 'برای ادامه نام تجارتی الزامی است.');
        }
        setStepValidationErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }, [name, tr]);
    const handleNextStep = useCallback(() => {
        if (!validateStepOne()) {
            nameInputRef.current?.focus();
            return;
        }
        setCurrentStep(2);
    }, [validateStepOne]);
    const handlePrevStep = useCallback(() => {
        resetBrandInteractionTracking();
        setStepValidationErrors({});
        setCurrentStep(1);
    }, [resetBrandInteractionTracking]);
    useEffect(() => {
        if (!isOpen)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key === 'Enter') {
                if (currentStep !== 1)
                    return;
                event.preventDefault();
                handleNextStep();
                return;
            }
            if (!event.altKey)
                return;
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [currentStep, handleNextStep, isOpen]);
    useEffect(() => {
        if (!isOpen)
            return;
        const timer = window.setTimeout(() => {
            if (currentStep === 2) {
                purchasePriceRef.current?.focus();
                return;
            }
            nameInputRef.current?.focus();
        }, 90);
        return () => window.clearTimeout(timer);
    }, [aiInputMode, currentStep, isOpen, resetBrandInteractionTracking]);
    const handleNumericInput = (setter: React.Dispatch<React.SetStateAction<number>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = normalizePersianNumbers(e.target.value);
        const number = parseInt(value.replace(/[^0-9]/g, ''), 10);
        setter(isNaN(number) ? 0 : number);
    };
    const handleDecimalInput = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = normalizePersianNumbers(e.target.value);
        if (value === '' || /^\d*\.?\d*$/.test(value))
            setter(value);
    };
    const handleSignedPercentInput = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = normalizePersianNumbers(e.target.value);
        if (value === '' || value === '-' || value === '+' || /^[+-]?\d*\.?\d*$/.test(value))
            setter(value);
    };
    const inputClass = 'block h-11 w-full rounded-2xl border border-slate-200/88 bg-white/96 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_16px_24px_-22px_rgba(15,23,42,0.14)] outline-hidden transition placeholder:font-medium placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-200/32';
    const labelClass = 'mb-1.5 block text-[11px] font-black tracking-[0.01em] text-slate-600';
    const helperTextClass = 'mt-1.5 text-[11px] font-medium leading-5 text-slate-500';
    const sectionCardClass = 'rounded-[26px] border border-slate-200/88 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.16)] sm:p-5';
    const sectionTitleClass = 'text-sm font-black tracking-[0.01em] text-slate-800';
    const sectionSubtitleClass = 'mt-1 text-[11px] font-medium leading-5 text-slate-500';
    const sectionHeaderClass = 'mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between';
    const secondaryBadgeClass = 'inline-flex items-center rounded-full border border-slate-200/90 bg-white/82 px-3 py-1 text-[10px] font-black tracking-[0.02em] text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]';
    const mode = resolveDefaultSalesMode(settings);
    const getPriceFieldStyle = (fieldMode: string) => {
        if (mode === fieldMode) {
            return `${inputClass} border-brand-300 bg-brand-50/88 font-black text-brand-700`;
        }
        return inputClass;
    };
    const getPriceLabelStyle = (fieldMode: string) => {
        if (mode === fieldMode) {
            return 'mb-1.5 block text-[11px] font-black tracking-[0.01em] text-brand-700';
        }
        return 'mb-1.5 block text-[11px] font-black tracking-[0.01em] text-slate-600';
    };
    const getLabelText = (enLabel: string, faLabel: string, fieldMode: string) => {
        const label = tr(enLabel, faLabel);
        if (mode === fieldMode)
            return `${label} ${tr('(Primary sale) *', '(فروش پیش‌فرض) *')}`;
        return label;
    };
    const compactCard = aiCardDensity === 'compact';
    const assistantModeLabel = tr('Upload', 'آپلود');
    const assistantProfileLabel = scanSpeedProfile === 'fast'
        ? tr('Fast', 'سریع')
        : scanSpeedProfile === 'accurate'
            ? tr('Accurate', 'دقیق')
            : tr('Balanced', 'متوسط');
    const assistantModeGuideItems = [
        {
            key: 'upload',
            label: tr('Upload', 'آپلود'),
            description: tr('Use one clear package photo or label.', 'یک عکس واضح از بسته یا لیبل دوا استفاده کنید.')
        },
        {
            key: 'text',
            label: tr('Text', 'متن'),
            description: tr('Type the medicine name and press Enter.', 'نام دوا را بنویسید و Enter را بزنید.')
        },
        {
            key: 'camera',
            label: tr('Camera', 'دوربین'),
            description: tr('Use live scan for a package or barcode.', 'برای بسته یا بارکد از اسکن زنده استفاده کنید.')
        }
    ];
    const assistantModeSpecificHelp = tr('For package images, paste from clipboard is also supported.', 'برای تصویر بسته، پیست از کلیپ‌بورد هم پشتیبانی می‌شود.');
    const isAssistantExpanded = aiLoading ||
        !!aiError ||
        aiConfidence > 0 ||
        !!previewImage ||
        scanHistory.length > 0;
    const assistantShellClass = `relative overflow-hidden rounded-[28px] border p-3.5 shadow-[0_28px_60px_-34px_rgba(31,92,194,0.22)] transition-all duration-300 ${isAssistantExpanded
        ? 'border-brand-300/90 bg-[linear-gradient(135deg,rgba(var(--wk-color-brand-50),0.98),rgba(var(--wk-color-surface-subtle),0.97),rgba(var(--wk-color-brand-100),0.94))]'
        : 'border-brand-200/90 bg-[linear-gradient(135deg,rgba(var(--wk-color-surface-raised),0.98),rgba(var(--wk-color-surface-subtle),0.96),rgba(var(--wk-color-brand-50),0.92))]'}`;
    const assistantPanelClass = `relative rounded-[24px] border border-brand-100/85 bg-[rgba(var(--wk-color-surface-raised),0.82)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_36px_-32px_rgba(15,23,42,0.18)] ${compactCard ? 'p-3' : 'p-4'}`;
    const assistantUploadTileClass = `group relative flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[22px] border-2 border-dashed border-brand-200/85 bg-[linear-gradient(180deg,rgba(var(--wk-color-surface-raised),0.96),rgba(var(--wk-color-brand-50),0.88))] text-center text-brand-800 transition hover:border-brand-300 hover:bg-[linear-gradient(180deg,rgba(var(--wk-color-surface-raised),0.98),rgba(var(--wk-color-brand-100),0.82))] ${compactCard ? 'min-h-[136px] p-3' : 'min-h-[156px] p-4'}`;
    const progressPercent = Math.max(0, Math.min(100, Math.round(aiProgress * 100)));
    const aiQueryPlaceholder = tr('Type medicine name for smart identify', 'نام دوا را برای تشخیص هوشمند بنویسید');
    const aiQueryShortcutLabel = tr('Enter', 'کلید Enter');
    const currentStepLabel = currentStep === 1 ? tr('Step 1 of 2', 'مرحله 1 از 2') : tr('Step 2 of 2', 'مرحله 2 از 2');
    const currentStepTitle = currentStep === 1
        ? tr("Enter the medicine identity.", "\u0645\u0634\u062E\u0635\u0627\u062A \u0627\u0635\u0644\u06CC \u062F\u0648\u0627 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.")
        : tr('Finish pricing and opening stock in one pass.', 'قیمت و موجودی اولیه را یک‌جا نهایی کنید.');
    const currentStepSubtitle = currentStep === 1
        ? tr("Confirm the core medicine details below.", "\u0645\u0634\u062E\u0635\u0627\u062A \u0627\u0635\u0644\u06CC \u062F\u0648\u0627 \u0631\u0627 \u062F\u0631 \u067E\u0627\u06CC\u06CC\u0646 \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0646\u06CC\u062F.")
        : tr('This page is kept short so the last pricing and batch details fit faster on screen.', 'این مرحله کوتاه نگه داشته شده تا قیمت و بچ اولیه سریع‌تر در یک صفحه تکمیل شوند.');
    const showAssistantStatus = aiLoading || aiConfidence > 0 || usedWebSearch || autoSavedByAi || !!aiError || !!liveScannerHint;
    return (<Modal isOpen={isOpen} onClose={onClose} title={tr('Add New Medicine', 'افزودن دوا جدید')} maxWidthClassName="max-w-[min(1120px,95vw)]" overlayClassName="fixed inset-0 z-[140] flex items-start justify-center bg-[rgba(var(--wk-color-shell-950),0.66)] px-2 pb-2 pt-[calc(var(--wk-titlebar-height)+8px)] backdrop-blur-md sm:px-3 sm:pb-3 sm:pt-[calc(var(--wk-titlebar-height)+12px)]" panelClassName="max-h-[calc(100dvh-var(--wk-titlebar-height)-14px)] overflow-hidden rounded-[30px] border border-white/90 bg-white shadow-[0_42px_90px_-36px_rgba(8,18,36,0.5)]" headerClassName="relative flex items-center justify-between shrink-0 border-b border-slate-200/90 bg-white px-4 py-3.5 shadow-[0_10px_24px_-22px_rgba(8,18,36,0.18)] md:px-6" bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,rgb(var(--wk-color-surface-subtle)),rgb(var(--wk-color-surface-page))_52%,rgb(var(--wk-color-surface-canvas)))] p-3 sm:p-4 md:p-5 custom-scrollbar" footerClassName="shrink-0 border-t border-slate-200/90 bg-white px-3 py-3 shadow-[0_-10px_24px_-22px_rgba(8,18,36,0.14)] sm:px-4" titleClassName="text-lg md:text-xl font-black tracking-tight text-slate-900 [text-shadow:0_1px_0_rgba(255,255,255,0.55)]" closeButtonClassName="rounded-full border border-slate-200/90 bg-white p-2 text-slate-600 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.24)] transition hover:border-slate-300 hover:bg-slate-50 hover:text-rose-600" animateClassName={false} footer={currentStep === 1 ? (<div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-2xl border border-white/85 bg-white/84 px-4 py-2 text-sm font-bold text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)] transition hover:border-brand-200 hover:text-brand-700">
                {tr('Close', 'بستن')}
              </button>
              <button type="button" onClick={handleResetForm} className="rounded-2xl px-3 py-2 text-xs font-black tracking-[0.02em] text-slate-500 transition hover:bg-white/72 hover:text-slate-700">
                {tr('Reset form', 'ریست فورم')}
              </button>
            </div>
            <button ref={nextStepBtnRef} data-testid="add-medicine-next-step" type="button" onClick={handleNextStep} title={tr('Next Step (Ctrl + Enter)', 'مرحله بعد (Ctrl + Enter)')} aria-keyshortcuts="Control+Enter" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-brand-700 bg-brand-700 px-5 py-2.5 text-sm font-black text-white shadow-[0_18px_32px_-18px_rgba(14,43,92,0.58)] transition hover:bg-brand-800">
              <span>{tr('Next Step', 'مرحله بعد')}</span>
              <svg className={`h-4 w-4 ${isEnglish ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6"/>
              </svg>
            </button>
          </div>) : (<div className="flex flex-wrap items-center justify-between gap-3">
            <button data-testid="add-medicine-prev-step" type="button" onClick={handlePrevStep} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white/88 px-4 py-2 text-sm font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)] transition hover:border-brand-200 hover:text-brand-700">
              <svg className={`h-4 w-4 ${isEnglish ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6"/>
              </svg>
              <span>{tr('Previous Step', 'مرحله قبل')}</span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button ref={saveAndNewBtnRef} type="button" data-testid="add-medicine-save-new" onClick={(e) => void handleSubmitForm(e, true)} disabled={isSubmitting} className="flex items-center justify-center gap-2 rounded-2xl border border-brand-200/90 bg-white/84 px-4 py-2.5 text-sm font-black text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] transition hover:border-brand-300 hover:bg-brand-50/85">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                {isSubmitting ? tr('Saving...', 'در حال ذخیره...') : tr('Save & New', 'ذخیره و جدید')}
              </button>
              <button type="button" data-testid="add-medicine-final-save" onClick={(e) => void handleSubmitForm(e, false)} disabled={isSubmitting} className="rounded-2xl border border-brand-700 bg-brand-700 px-6 py-2.5 text-sm font-black text-white shadow-[0_18px_32px_-18px_rgba(14,43,92,0.58)] transition hover:bg-brand-800">
                {isSubmitting ? tr('Saving...', 'در حال ذخیره...') : tr('Final Save', 'ذخیره نهایی')}
              </button>
            </div>
          </div>)}>
      <form ref={formRef} data-testid="add-medicine-form" className="relative space-y-4">
        <section data-testid="add-medicine-step-header" className="rounded-[24px] border border-slate-200/88 bg-white/86 p-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.2)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <span data-testid="add-medicine-step-indicator" className="inline-flex items-center rounded-full border border-brand-100/90 bg-brand-50/92 px-3 py-1 text-[11px] font-black tracking-[0.08em] text-brand-700">
                {currentStepLabel}
              </span>
              <h4 className="mt-2 text-base font-black tracking-[-0.02em] text-slate-900">{currentStepTitle}</h4>
              <p className="mt-1 text-sm font-medium text-slate-500">{currentStepSubtitle}</p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200/90 bg-slate-50/90 p-1.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${currentStep === 1 ? 'bg-brand-600 text-white shadow-[0_10px_18px_-14px_rgba(37,99,235,0.9)]' : 'bg-white text-slate-500'}`}>1</span>
              <span className="h-px w-8 bg-slate-200"/>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${currentStep === 2 ? 'bg-brand-600 text-white shadow-[0_10px_18px_-14px_rgba(37,99,235,0.9)]' : 'bg-white text-slate-500'}`}>2</span>
            </div>
          </div>
        </section>
        {currentStep === 1 ? (<>
        {null}

        {/* MAIN INFO */}
        <div ref={coreDetailsRef} data-testid="add-medicine-core-details" className={sectionCardClass} style={{ scrollMarginTop: 16 }}>
          <div className={sectionHeaderClass}>
            <div>
              <h4 className={sectionTitleClass}>{tr('Core Medicine Details', 'مشخصات اصلی دوا')}</h4>
              <p className={sectionSubtitleClass}>
                {tr('Keep the product name and manufacturer clean before moving to pricing.', 'پیش از رفتن به قیمت‌گذاری، نام و تولیدکننده را تمیز و یک‌دست ثبت کنید.')}
              </p>
            </div>
            {aiConfidence > 0 && (<span className={`${secondaryBadgeClass} text-brand-700 border-brand-200/80 bg-brand-50/82`}>
                {tr('AI', 'هوش مصنوعی')}: {Math.round(aiConfidence * 100)}%
              </span>)}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className={labelClass}>{tr('Brand Name', 'نام تجارتی')} <span className="text-rose-500">*</span></label>
              <input ref={nameInputRef} data-testid="add-medicine-brand-name" type="text" value={name} onChange={e => handleBrandNameChange(e.target.value)} onFocus={handleBrandNameFocus} onBlur={(e) => handleBrandNameBlur(e.target.value)} onKeyDown={(e) => handleEnter(e, genericInputRef)} className={`${inputClass} ${stepValidationErrors.name ? 'border-rose-300 focus:border-rose-300 focus:ring-rose-200/40' : ''}`} required placeholder={tr('e.g. Panadol', 'مثال: Panadol')} aria-invalid={stepValidationErrors.name ? 'true' : 'false'}/>
              {stepValidationErrors.name && (<p className="mt-1.5 text-[11px] font-semibold text-rose-600">{stepValidationErrors.name}</p>)}
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>{tr('Generic Name', 'نام جنریک')}</label>
              <input ref={genericInputRef} data-testid="add-medicine-generic-name" type="text" value={genericName} onChange={e => setGenericName(e.target.value)} onKeyDown={(e) => handleEnter(e, manufacturerInputRef)} className={inputClass} placeholder={tr('e.g. Paracetamol', 'مثال: Paracetamol')}/>
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>{tr('Manufacturer', 'تولیدکننده')}</label>
              <input ref={manufacturerInputRef} data-testid="add-medicine-manufacturer" type="text" value={manufacturer} onChange={e => {
                setManufacturer(e.target.value);
                if (manufacturerHint)
                    setManufacturerHint('');
            }} onBlur={() => applyCanonicalManufacturer(manufacturer)} onKeyDown={(e) => handleEnter(e, typeSelectRef)} list={manufacturerSuggestionsId} className={inputClass}/>
              <datalist id={manufacturerSuggestionsId}>
                {manufacturerSuggestions.map((suggestion) => (<option key={suggestion} value={suggestion}/>))}
              </datalist>
              {manufacturerHint && (<p className="mt-1 text-[11px] font-semibold text-brand-600">{manufacturerHint}</p>)}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>{tr('Type', 'نوع')}</label>
              <select ref={typeSelectRef} value={type} onChange={e => setType(e.target.value as MedicineType)} onKeyDown={(e) => handleEnter(e, barcodeInputRef)} className={inputClass}>
                {MEDICINE_TYPES.map(t => <option key={t} value={t}>{isEnglish ? t : getMedicineTypeLabel(t)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {existingMedicine && (<div className="flex items-center justify-between rounded-[24px] border border-amber-200/80 bg-amber-50/82 p-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <span className="font-bold text-amber-800">{tr('This medicine already exists', 'این دوا قبلا ثبت شده است')} ({tr('Stock', 'موجودی')}: {existingMedicine.batches.reduce((s, b) => s + b.quantity, 0)})</span>
                {onEditExisting && <button type="button" onClick={() => onEditExisting(existingMedicine!)} className="rounded-xl border border-amber-300 bg-white/70 px-3 py-1.5 font-bold text-amber-800 transition hover:bg-amber-100">{tr('Edit Existing', 'ویرایش مورد موجود')}</button>}
            </div>)}

        <div ref={packagingPlacementRef} data-testid="add-medicine-packaging-placement" className={`${sectionCardClass} space-y-4`} style={{ scrollMarginTop: 16 }}>
          <div className={sectionHeaderClass}>
            <div>
              <h4 className={sectionTitleClass}>{tr('Packaging & Placement', 'بسته‌بندی و جای‌گذاری')}</h4>
              <p className={sectionSubtitleClass}>
                {tr('Set barcode, unit, pack size, stock threshold, and shelf position in one place.', 'بارکد، واحد، اندازه بسته، حداقل موجودی، و جای قفسه را یک‌جا تنظیم کنید.')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className={labelClass}>{tr('Barcode', 'بارکد')}</label>
              <div className="flex gap-1">
                <input ref={barcodeInputRef} type="text" value={barcode} onChange={e => setBarcode(e.target.value)} onKeyDown={(e) => handleEnter(e, unitSelectRef)} className={inputClass}/>
                <button type="button" onClick={generateBarcode} className="rounded-lg border border-white/80 bg-white/72 px-2.5 text-[11px] font-bold text-slate-600 transition hover:border-brand-200 hover:text-brand-700" title={tr('Generate', 'تولید')}>
                  {tr('Generate', 'تولید')}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>{tr('Unit', 'واحد')}</label>
              <select ref={unitSelectRef} value={unit} onChange={e => setUnit(e.target.value as MedicineUnit)} onKeyDown={(e) => handleEnter(e, thresholdInputRef)} className={inputClass}>
                {medicineUnitOptions.map(u => <option key={u} value={u}>{getUnitLabel(u)}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>{tr('Items per pack', 'تعداد در هر بسته')}</label>
              <input type="number" value={itemsPerBox} onChange={handleNumericInput(setItemsPerBox)} className={inputClass} placeholder="1"/>
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>{tr('Low stock threshold', 'حداقل موجودی')}</label>
              <input ref={thresholdInputRef} type="number" value={lowStockThreshold} onChange={handleNumericInput(setLowStockThreshold)} onKeyDown={(e) => handleEnter(e, rackInputRef)} className={inputClass}/>
            </div>
            <div className="md:col-span-4">
              <label className="mt-7 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                <input type="checkbox" checked={allowFractionalQuantity} onChange={(event) => setAllowFractionalQuantity(event.target.checked)} className="h-4 w-4 accent-brand-600"/>
                <span>{tr('Allow fractional sale quantity', 'اجازه فروش با تعداد اعشاری')}</span>
              </label>
            </div>
          </div>
          <div className="h-px bg-slate-200/70"/>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <label className={labelClass}>{tr('Rack / Shelf', 'قفسه / طبقه')}</label>
              <div className="flex gap-1">
                <input ref={rackInputRef} type="text" value={rack} onChange={e => setRack(e.target.value)} onKeyDown={(e) => handleEnter(e, shelfInputRef)} className={`${inputClass} text-center`} placeholder="R"/>
                <input ref={shelfInputRef} type="text" value={shelf} onChange={e => setShelf(e.target.value)} onKeyDown={(e) => handleEnter(e, hasSuppliers ? supplierRef : nextStepBtnRef)} className={`${inputClass} text-center`} placeholder="S"/>
              </div>
            </div>
            <div className="md:col-span-7">
              <label className={`${labelClass} flex flex-wrap items-center gap-2`}>
                <span>{tr('Preferred Supplier (optional)', 'تأمین‌کننده ترجیحی (اختیاری)')}</span>
                <NewFeatureBadge data-testid="preferred-supplier-new-badge"/>
              </label>
              <select ref={supplierRef} value={supplierId} onChange={e => setSupplierId(e.target.value)} onKeyDown={(e) => handleEnter(e, nextStepBtnRef)} className={inputClass} disabled={!hasSuppliers} aria-disabled={!hasSuppliers}>
                <option value="">
                  {hasSuppliers
                ? tr('Select...', 'انتخاب کنید...')
                : tr('No suppliers added yet', 'هنوز تامین‌کننده‌ای ثبت نشده')}
                </option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {!hasSuppliers && (<div data-testid="add-medicine-supplier-empty-state" className="mt-2 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-[11px] leading-5 text-amber-900">
                  <p className="font-black">
                    {tr('No suppliers are registered for this workspace yet.', 'برای این فضای کاری هنوز هیچ تأمین‌کننده‌ای ثبت نشده است.')}
                  </p>
                  <p className="mt-1 text-amber-800/90">
                    {tr('You can leave this optional field empty, or add one from Purchases > Suppliers.', 'می‌توانید این بخش اختیاری را خالی بگذارید، یا از خریدها > تأمین‌کننده‌ها یک مورد اضافه کنید.')}
                  </p>
                  {onGoToSuppliers && (<button type="button" data-testid="add-medicine-open-suppliers" onClick={() => {
                        onClose();
                        onGoToSuppliers();
                    }} className="mt-2 inline-flex items-center rounded-xl border border-amber-300/80 bg-white/90 px-3 py-1.5 text-[11px] font-black text-amber-900 transition hover:border-amber-400 hover:bg-white">
                      {tr('Open Suppliers', 'باز کردن تامین‌کننده‌ها')}
                    </button>)}
                </div>)}
              {hasSuppliers ? (<p className="mt-2 text-[11px] font-semibold text-slate-500" data-testid="preferred-supplier-helper">
                  {procurementAssistEnabled && supplierId
                    ? tr(`This item will go into ${selectedSupplierName || 'the selected supplier'} procurement invoice. Stock is added only for the quantity you mark as received.`, `این قلم داخل فاکتور خرید ${selectedSupplierName || 'تأمین‌کننده انتخاب‌شده'} می‌رود. موجودی فقط به اندازه‌ای اضافه می‌شود که به‌عنوان رسیده ثبت کنید.`)
                    : tr('This saves the usual supplier for future buying. It does not create supplier debt for the first manual batch.', 'این فیلد فقط شرکت ترجیحی را برای خریدهای بعدی نگه می‌دارد و برای batch اولیه بدهی تأمین‌کننده نمی‌سازد.')}
                </p>) : null}
              <div data-testid="add-medicine-partner-stock-card" className={`mt-3 rounded-2xl border px-3.5 py-3 shadow-sm ${partnerStockEnabled
                ? 'border-violet-200 bg-violet-50/75'
                : 'border-slate-200 bg-white/88'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-slate-900">
                        {tr('Register stock under partner account', 'ثبت موجودی به نام شریک')}
                      </p>
                      <span className="inline-flex items-center rounded-full border border-violet-200 bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">
                        {tr('Partner goods', 'سرمایه جنسی')}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-600">
                      {partnerStockEnabled && selectedPartner
                ? tr(`This opening stock will be owned by ${selectedPartner.name} and shown in partner reports.`, `این موجودی ابتدایی به نام ${selectedPartner.name} ثبت و در حساب شریک محاسبه می‌شود.`)
                : tr('Use this when the first stock belongs to a partner, not the store.', 'وقتی موجودی ابتدایی مال شریک است، نه دکان، این گزینه را روشن کنید.')}
                    </p>
                  </div>
                  <input type="checkbox" checked={partnerStockEnabled} onChange={(event) => {
                const checked = event.target.checked;
                setPartnerStockEnabled(checked);
                if (checked && !partnerStockPartnerId && activePartners[0]) {
                    setPartnerStockPartnerId(activePartners[0].id);
                }
            }} className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600" aria-label={tr('Register stock under partner account', 'ثبت موجودی به نام شریک')}/>
                </div>
                {partnerStockEnabled ? (<div className="mt-3 grid gap-3 rounded-2xl border border-white/70 bg-white/82 p-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Partner', 'شریک')}</label>
                      <select value={partnerStockPartnerId} onChange={(event) => setPartnerStockPartnerId(event.target.value)} className={inputClass} disabled={activePartners.length === 0}>
                        <option value="">
                          {activePartners.length > 0 ? tr('Choose partner', 'انتخاب شریک') : tr('No active partner', 'شریک فعال موجود نیست')}
                        </option>
                        {activePartners.map((partner) => (<option key={partner.id} value={partner.id}>{partner.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Entry type', 'نوع ثبت')}</label>
                      <select value={partnerStockEntryType} onChange={(event) => setPartnerStockEntryType(event.target.value as typeof partnerStockEntryType)} className={inputClass}>
                        <option value="partner_goods_capital">{tr('Goods capital', 'سرمایه جنسی شریک')}</option>
                        <option value="partner_consignment">{tr('Consignment goods', 'جنس امانی شریک')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Agreed unit value', 'ارزش توافقی هر واحد')}</label>
                      <input type="text" inputMode="decimal" value={partnerAgreedValue} onChange={handleDecimalInput(setPartnerAgreedValue)} className={inputClass} placeholder={tr('Defaults to buy price', 'پیش‌فرض: قیمت خرید')}/>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Suggested sale price', 'قیمت پیشنهادی فروش')}</label>
                      <input type="text" inputMode="decimal" value={partnerSuggestedSalePrice} onChange={handleDecimalInput(setPartnerSuggestedSalePrice)} className={inputClass} placeholder={tr('Optional', 'اختیاری')}/>
                    </div>
                    {activePartners.length === 0 ? (<p className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                        {tr('Create a partner first from Partnerships, then return here.', 'اول از بخش شرکات یک شریک بسازید، سپس اینجا برگردید.')}
                      </p>) : null}
                  </div>) : null}
              </div>
              {supplierId ? (<div data-testid="add-medicine-procurement-assist-card" className={`mt-3 rounded-2xl border px-3.5 py-3 shadow-sm ${procurementAssistEnabled
                    ? 'border-brand-200/80 bg-brand-50/75'
                    : 'border-slate-200 bg-white/88'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-slate-900">
                          {tr('Register this item in supplier procurement', 'این قلم را در خرید تأمین‌کننده ثبت کن')}
                        </p>
                        <span className="inline-flex items-center rounded-full border border-brand-200 bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-brand-700">
                          {tr('Draft Purchase', 'پیش‌نویس خرید')}
                        </span>
                        {procurementAssistLearning.learnedDefaultEnabled && procurementAssistSettings.enabled ? (<span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700" data-testid="add-medicine-procurement-assist-learned-badge">
                            {tr('Learned', 'یادگرفته')}
                          </span>) : null}
                      </div>
                      <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-600">
                        {tr(`Keep ${selectedSupplierName || 'this supplier'} as the usual source and place this opening item inside the same purchase draft.`, `هم ${selectedSupplierName || 'این تأمین‌کننده'} را منبع معمول نگه می‌دارد و هم این قلم ابتدایی را داخل همان پیش‌نویس خرید می‌گذارد.`)}
                      </p>
                    </div>
                    <input type="checkbox" checked={procurementAssistEnabled} onChange={(event) => handleProcurementAssistToggle(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600" aria-label={tr('Register this item in supplier procurement', 'این قلم را در خرید تأمین‌کننده ثبت کن')} data-testid="add-medicine-procurement-assist-toggle"/>
                  </div>
                  <p className={`mt-3 rounded-2xl px-3 py-2 text-[11px] font-semibold leading-5 ${procurementAssistEnabled
                    ? 'bg-white/78 text-brand-800'
                    : 'bg-slate-50 text-slate-500'}`}>
                    {procurementAssistEnabled
                    ? tr('The medicine will be saved without a manual opening batch. Quantity and buy price go into the supplier invoice, and only the received quantity becomes stock.', 'دوا بدون batch ابتداییِ دستی ذخیره می‌شود. تعداد و قیمت خرید داخل فاکتور تأمین‌کننده می‌رود و فقط مقدار رسیده به موجودی تبدیل می‌شود.')
                    : tr('Leave this off to keep the current behavior: save the medicine with a manual opening batch and only remember the preferred supplier.', 'اگر خاموش بماند، رفتار فعلی حفظ می‌شود: دوا با batch ابتدایی دستی ذخیره می‌شود و فقط تأمین‌کننده ترجیحی به یاد می‌ماند.')}
                  </p>
                  {procurementAssistEnabled ? (<div className="mt-3 grid gap-3 rounded-2xl border border-white/70 bg-white/82 p-3">
                      <div>
                        <p className="text-[11px] font-black text-slate-600">
                          {tr('Purchase invoice choice', 'انتخاب فاکتور خرید')}
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className={`flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold leading-5 transition ${procurementTargetMode === 'open_supplier_draft' ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                            <input type="radio" name="procurement-target-mode" value="open_supplier_draft" checked={procurementTargetMode === 'open_supplier_draft'} onChange={() => setProcurementTargetMode('open_supplier_draft')} className="mt-1 h-3.5 w-3.5 accent-brand-600"/>
                            <span>
                              {selectedSupplierOpenDraft
                        ? tr(`Add to open invoice ${selectedSupplierOpenDraft.invoiceNumber || selectedSupplierOpenDraft.id.slice(-6)}`, `افزودن به فاکتور باز ${selectedSupplierOpenDraft.invoiceNumber || selectedSupplierOpenDraft.id.slice(-6)}`)
                        : tr('Use supplier open invoice', 'استفاده از فاکتور باز تأمین‌کننده')}
                            </span>
                          </label>
                          <label className={`flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold leading-5 transition ${procurementTargetMode === 'new_invoice' ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                            <input type="radio" name="procurement-target-mode" value="new_invoice" checked={procurementTargetMode === 'new_invoice'} onChange={() => setProcurementTargetMode('new_invoice')} className="mt-1 h-3.5 w-3.5 accent-brand-600"/>
                            <span>{tr('Create new named invoice', 'ساخت فاکتور جدید با نام دلخواه')}</span>
                          </label>
                        </div>
                        {procurementTargetMode === 'new_invoice' ? (<input type="text" value={procurementInvoiceNumber} onChange={(event) => setProcurementInvoiceNumber(event.target.value)} className={`${inputClass} mt-2`} placeholder={tr('Optional invoice name / number', 'نام یا شماره دلخواه فاکتور (اختیاری)')}/>) : null}
                      </div>

                      <div>
                        <p className="text-[11px] font-black text-slate-600">
                          {tr('Quick receipt', 'دریافت سریع')}
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          {([
                        ['all', tr('All arrived', 'همه رسیده')],
                        ['partial', tr('Partial arrived', 'بخشی رسیده')],
                        ['none', tr('Not arrived yet', 'هنوز نرسیده')]
                    ] as Array<[
                        ProcurementReceiptMode,
                        string
                    ]>).map(([modeValue, label]) => (<label key={modeValue} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold transition ${procurementReceiptMode === modeValue ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                              <input type="radio" name="procurement-receipt-mode" value={modeValue} checked={procurementReceiptMode === modeValue} onChange={() => setProcurementReceiptMode(modeValue)} className="h-3.5 w-3.5 accent-emerald-600"/>
                              <span>{label}</span>
                            </label>))}
                        </div>
                        {procurementReceiptMode === 'partial' ? (<div className="mt-2">
                            <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Received quantity', 'مقدار رسیده')}</label>
                            <input type="text" inputMode="decimal" value={procurementReceivedQuantity} onChange={handleDecimalInput(setProcurementReceivedQuantity)} className={`${inputClass} text-center`} placeholder={tr('Received now', 'رسیده فعلی')}/>
                          </div>) : null}
                      </div>
                    </div>) : null}
                </div>) : null}
            </div>
          </div>
        </div>

          </>) : (<div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className={`${sectionCardClass} border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.88),rgba(255,255,255,0.86),rgba(236,254,255,0.84))]`}>
            <div className={sectionHeaderClass}>
                <div>
                    <h4 className="text-sm font-black text-emerald-800">{tr('Pricing & Profitability', 'قیمت‌گذاری و سودآوری')}</h4>
                    <p className="mt-1 text-[11px] font-medium leading-5 text-emerald-700/75">
                        {tr('Set purchase cost first, then finish the price tier that matches your default sales workflow.', 'ابتدا قیمت خرید را ثبت کنید، سپس سطح قیمت‌گذاری مناسب با روند فروش پیش‌فرض خود را نهایی کنید.')}
                    </p>
                </div>
                {marginPercent > 0 && (<span className={`rounded-full px-2 py-0.5 text-xs font-black ${marginPercent < 10 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {tr('Margin', 'حاشیه سود')}: {marginPercent.toFixed(1)}% ({tr('based on', 'براساس')} {mode === 'retail' ? tr('Retail', 'پرچون') : mode === 'wholesale' ? tr('Wholesale', 'عمده') : tr('Bulk', 'کلی')} {tr('price', 'قیمت')})
                    </span>)}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">{tr('Purchase (AFN)', 'خرید (افغانی)')}</label>
                    <input ref={purchasePriceRef} type="text" inputMode="decimal" value={purchasePrice} onChange={handleDecimalInput(setPurchasePrice)} onKeyDown={(e) => handleEnter(e, wholesalePriceRef)} className={`${inputClass} border-emerald-200/80`} placeholder="0"/>
                </div>
                <div>
                    <label className={getPriceLabelStyle('wholesale')}>{getLabelText('Wholesale', 'عمده', 'wholesale')}</label>
                    <input ref={wholesalePriceRef} type="text" inputMode="decimal" value={wholesalePrice} onChange={handleDecimalInput(setWholesalePrice)} onKeyDown={(e) => handleEnter(e, bulkPriceRef)} className={getPriceFieldStyle('wholesale')} placeholder="0" required={mode === 'wholesale'}/>
                </div>
                <div>
                    <label className={getPriceLabelStyle('bulk')}>{getLabelText('Bulk', 'کلی', 'bulk')}</label>
                    <input ref={bulkPriceRef} type="text" inputMode="decimal" value={bulkPrice} onChange={handleDecimalInput(setBulkPrice)} onKeyDown={(e) => handleEnter(e, retailPriceRef)} className={getPriceFieldStyle('bulk')} placeholder="0" required={mode === 'bulk'}/>
                </div>
                <div>
                    <label className={getPriceLabelStyle('retail')}>{getLabelText('Retail', 'پرچون', 'retail')}</label>
                    <input ref={retailPriceRef} type="text" inputMode="decimal" value={retailPrice} onChange={handleDecimalInput(setRetailPrice)} onKeyDown={(e) => handleEnter(e, quantityRef)} className={getPriceFieldStyle('retail')} required={mode === 'retail'} placeholder="0"/>
                </div>
                {canManageCommissionRules ? (<div className="sm:col-span-2">
                        <label className="mb-1 block text-[10px] font-semibold text-slate-500">{tr('Commission adjustment (%)', 'تعدیل کمیسیون (%)')}</label>
                        <input type="text" inputMode="decimal" value={commissionAdjustmentPercent} onChange={handleSignedPercentInput(setCommissionAdjustmentPercent)} className={`${inputClass} border-sky-200/80`} placeholder={tr('Example: +5 or -3', 'مثال: +5 یا -3')}/>
                        <p className={helperTextClass}>{tr('Applied on top of the employee base or tier rate for this medicine.', 'روی نرخ پایه یا پلکانی کارمند برای همین دوا جمع/کم می‌شود.')}</p>
                    </div>) : null}
            </div>
        </div>

        <div className={sectionCardClass}>
            <div className={sectionHeaderClass}>
                <div>
                    <h4 className={sectionTitleClass}>{tr('Initial Stock (First Batch)', 'موجودی اولیه (بچ اول)')}</h4>
                    <p className={sectionSubtitleClass}>
                        {tr('Record the first quantity, expiry, and batch number before saving.', 'مقدار اول، تاریخ انقضا، و شماره بچ را پیش از ذخیره ثبت کنید.')}
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Quantity', 'مقدار')}</label>
                    <input ref={quantityRef} type="text" inputMode="numeric" value={quantity || ''} onChange={handleNumericInput(setQuantity)} onKeyDown={(e) => handleEnter(e, expMonthRef)} className={`${inputClass} text-center font-bold`} required placeholder="0"/>
                </div>
                <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Expiry (Month / Year)', 'تاریخ انقضا (ماه / سال)')}</label>
                    <div className="flex gap-1" dir="ltr">
                        <input ref={expMonthRef} type="text" maxLength={2} value={expMonth} onChange={handleMonthChange} onKeyDown={(e) => handleEnter(e, expYearRef)} className={`${inputClass} text-center`} placeholder="MM"/>
                        <span className="self-center">/</span>
                        <input ref={expYearRef} type="text" maxLength={2} value={expYear} onChange={handleYearChange} onKeyDown={(e) => handleEnter(e, batchRef)} className={`${inputClass} text-center`} placeholder="YY"/>
                    </div>
                </div>
                <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-600">{tr('Batch Number', 'شماره بچ')}</label>
                    <input ref={batchRef} type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} onKeyDown={(e) => handleEnter(e, saveAndNewBtnRef)} className={inputClass} placeholder={tr('Auto', 'خودکار')}/>
                </div>
            </div>
        </div>
        </div>)}
      </form>
    </Modal>);
};
