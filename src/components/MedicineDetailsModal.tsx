import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Medicine, Batch, MedicineClinicalSummary, MedicineType, MedicineUnit, AppSettings, Supplier, Partner, BatchOwnershipType, StockEntryType, Purchase, InventoryLinkedSyncTargets, MedicineCommissionRule } from '../types';
import { sanitizeMedicineClinicalSummary, sanitizeMedicineDescription } from "../services/medicineTextSanitization";
import { Modal } from './ui/Modal';
import { BatchHistoryModal } from './BatchHistoryModal';
import { NewFeatureBadge } from './ui/NewFeatureBadge';
import { normalizePersianNumbers, getMedicineTypeLabel } from '../utils/localization';
import { formatMedicineExpiryDate } from '../lib/formatters';
import { MEDICINE_TYPES } from '../constants/medicineTypes';
import { getMedicineUnitLabel, getMedicineUnitOptions } from '../constants/medicineUnits';
import { DEFAULT_SALES_MODE, resolveDefaultSalesMode } from '../constants/sales';
import { getMedicineLastPurchaseRate, getMedicinePurchasePriceHistory } from '../utils/purchaseUtils';
import { getInventoryLinkedSyncSettings, intersectInventorySyncTargetsWithLinkage, normalizeInventoryLinkedSyncTargets, resolveInventoryLinkage } from '../utils/inventoryLinkedSync';
import { buildManufacturerDirectory, canonicalizeManufacturerName, getManufacturerSuggestions } from '../utils/manufacturerCanonicalization';
import { normalizeSaleUnits } from '../utils/unitConversion';
import { createUniqueId } from '../utils/localIds';
import { normalizeCommissionAdjustmentPercent, normalizeMedicineCommissionRules } from '../utils/commissionRules';
interface MedicineDetailsModalProps {
    medicine: Medicine;
    medicines?: Medicine[];
    purchases?: Purchase[];
    onClose: () => void;
    onUpdateMedicine: (id: string, data: Partial<Medicine>, syncTargets?: InventoryLinkedSyncTargets) => void;
    onUpdateBatch: (medicineId: string, batchId: string, updatedBatchData: Partial<Batch>, syncTargets?: InventoryLinkedSyncTargets) => void;
    onAddBatch: (medicineId: string, newBatchData: Omit<Batch, 'id' | 'history'>) => void;
    onDeleteBatch?: (medicineId: string, batchId: string) => void;
    onDeleteMedicine?: (id: string) => void;
    readOnly?: boolean;
    canViewPurchasePrice?: boolean;
    settings?: AppSettings;
    suppliers?: Supplier[];
    partners?: Partner[];
    canManageCommissionRules?: boolean;
    initialMode?: 'view' | 'add_batch';
    onStartPurchaseReceipt?: (context: {
        medicineId: string;
        medicineName: string;
        preferredSupplierId?: string;
    }) => void;
}
type Translate = (en: string, fa: string) => string;
type InfoFormState = {
    name: string;
    genericName: string;
    manufacturer: string;
    type: MedicineType;
    unit: MedicineUnit;
    itemsPerBox: number | string;
    description: string;
    clinicalSummary?: MedicineClinicalSummary;
    lowStockThreshold: number | string;
    retail: number | string;
    wholesale: number | string;
    bulk: number | string;
};
type ClinicalSummaryFieldKey = 'composition' | 'use' | 'dose' | 'mechanism' | 'sideEffects' | 'caution';
type AutoSummaryStatus = 'idle' | 'generating' | 'failed';
type LinkedSyncSaveRequest = {
    kind: 'medicine';
    data: Partial<Medicine>;
    linkage: ReturnType<typeof resolveInventoryLinkage>;
} | {
    kind: 'batch';
    batchId: string;
    data: Partial<Batch>;
    linkage: ReturnType<typeof resolveInventoryLinkage>;
};
const FALLBACK_AI_SETTINGS: AppSettings = {
    storeName: '',
    storePhone: '',
    storeAddress: '',
    taxRate: 0,
    language: 'dari',
    defaultSalesMode: DEFAULT_SALES_MODE
};
const buildInfoForm = (medicine: Medicine): InfoFormState => ({
    name: medicine.name,
    genericName: medicine.genericName || '',
    manufacturer: medicine.manufacturer,
    type: medicine.type,
    unit: medicine.unit,
    itemsPerBox: medicine.itemsPerBox || 1,
    description: sanitizeMedicineDescription(medicine.description || ''),
    clinicalSummary: sanitizeMedicineClinicalSummary(medicine.clinicalSummary),
    lowStockThreshold: medicine.lowStockThreshold,
    retail: medicine.salePrices.retail,
    wholesale: medicine.salePrices.wholesale,
    bulk: medicine.salePrices.bulk
});
const CLINICAL_SUMMARY_FIELDS: ClinicalSummaryFieldKey[] = ['composition', 'use', 'dose', 'mechanism', 'sideEffects', 'caution'];
const hasClinicalSummaryContent = (summary?: MedicineClinicalSummary) => CLINICAL_SUMMARY_FIELDS.some((field) => (summary?.[field] || '').trim().length > 0);
const splitDescriptionSentences = (value: string): string[] => (value.match(/[^.!?؟]+[.!?؟]?/g) || [])
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
const pickSentence = (sentences: string[], pattern: RegExp): string => sentences.find((sentence) => pattern.test(sentence)) || '';
const joinUniqueParts = (parts: Array<string | undefined>): string => Array.from(new Set(parts.map((part) => (part || '').trim()).filter(Boolean))).join('. ');
const mergeClinicalSummaries = (primary?: MedicineClinicalSummary, fallback?: MedicineClinicalSummary): MedicineClinicalSummary | undefined => {
    const merged = sanitizeMedicineClinicalSummary({
        composition: primary?.composition || fallback?.composition || '',
        use: primary?.use || fallback?.use || '',
        dose: primary?.dose || fallback?.dose || '',
        mechanism: primary?.mechanism || fallback?.mechanism || '',
        sideEffects: primary?.sideEffects || fallback?.sideEffects || '',
        caution: primary?.caution || fallback?.caution || '',
        generatedAt: primary?.generatedAt || fallback?.generatedAt
    });
    return merged;
};
const buildFallbackClinicalSummary = (medicine: Medicine, description: string, isEnglish: boolean): MedicineClinicalSummary | undefined => {
    const cleanDescription = sanitizeMedicineDescription(description);
    const sentences = splitDescriptionSentences(cleanDescription);
    const compositionSentence = pickSentence(sentences, /contains|composition|ingredient|strength|mg|ml|mL|حاوی|ترکیب|ماده|میلی|گرام|هیدروکلراید/i);
    const useSentence = pickSentence(sentences, /used|use|indication|relief|treat|cough|pain|fever|استفاده|استعمال|مصرف|تسکین|درمان|سرفه|درد|تب|گلو|تحریک/i);
    const doseSentence = pickSentence(sentences, /dose|dosage|adult|take|daily|times|هر\s*\d|دوز|مقدار|بار|روزانه|بزرگسال|میلی\s*لیتر|قرص|کپسول/i);
    const mechanismSentence = pickSentence(sentences, /mechanism|works|effect|acts|reduces|blocks|loosens|calms|نحوه|اثر|عمل|کاهش|مهار|شل|آرام|تحریک/i);
    const sideEffectsSentence = pickSentence(sentences, /side effect|adverse|drowsiness|nausea|rash|dizziness|عوارض|جانبی|خواب|سرگیجه|تهوع|حساسیت|خارش|راش/i);
    const cautionSentence = pickSentence(sentences, /caution|warning|avoid|contra|interaction|storage|store|doctor|children|احتیاط|هشدار|اجتناب|نباید|تداخل|نگهداری|دستور پزشک|کودکان|دسترس|آفتاب|رطوبت/i);
    return sanitizeMedicineClinicalSummary({
        composition: joinUniqueParts([
            medicine.genericName,
            compositionSentence,
            isEnglish ? medicine.type : getMedicineTypeLabel(medicine.type),
            getMedicineUnitLabel(medicine.unit, isEnglish),
            medicine.manufacturer
        ]),
        use: useSentence || sentences[0] || '',
        dose: doseSentence,
        mechanism: mechanismSentence && mechanismSentence !== useSentence ? mechanismSentence : '',
        sideEffects: sideEffectsSentence,
        caution: cautionSentence
    });
};
const SummaryCompositionIcon: React.FC<{
    className?: string;
}> = ({ className }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="7" width="16" height="10" rx="5"/>
    <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/>
    <path d="M9 12h6"/>
  </svg>);
const SummaryUseIcon: React.FC<{
    className?: string;
}> = ({ className }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="7"/>
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 5v2"/>
    <path d="M12 17v2"/>
    <path d="M5 12h2"/>
    <path d="M17 12h2"/>
  </svg>);
const SummaryDoseIcon: React.FC<{
    className?: string;
}> = ({ className }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="8"/>
    <path d="M12 8v4l2.5 2.5"/>
    <path d="M12 4v1.5"/>
  </svg>);
const SummaryMechanismIcon: React.FC<{
    className?: string;
}> = ({ className }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M13 3 6 14h5l-1 7 8-12h-5l1-6Z"/>
  </svg>);
const SummarySideEffectsIcon: React.FC<{
    className?: string;
}> = ({ className }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M7.5 4.5h9"/>
    <path d="M9 4.5v5.1l-3.8 6.6A3.2 3.2 0 0 0 8 21h8a3.2 3.2 0 0 0 2.8-4.8L15 9.6V4.5"/>
    <path d="M8 16h8"/>
    <path d="M10 18.2h4"/>
  </svg>);
const SummaryCautionIcon: React.FC<{
    className?: string;
}> = ({ className }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3 4.5 7v5.5c0 4.2 2.7 6.9 7.5 8.5 4.8-1.6 7.5-4.3 7.5-8.5V7L12 3Z"/>
    <path d="M12 8v4"/>
    <circle cx="12" cy="15.5" r=".8" fill="currentColor" stroke="none"/>
  </svg>);
const formatBatchDate = (value: string, settings?: AppSettings) => {
    if (!value)
        return '-';
    return formatMedicineExpiryDate(value, settings || null);
};
const getAvailabilityTone = (status?: Batch['availabilityStatus']) => {
    switch (status) {
        case 'quarantine':
            return 'border-amber-200/80 bg-amber-50/85 text-amber-700';
        case 'rejected':
            return 'border-rose-200/80 bg-rose-50/85 text-rose-700';
        default:
            return 'border-emerald-200/80 bg-emerald-50/85 text-emerald-700';
    }
};
const getPartnerStockTypeLabel = (type: StockEntryType | undefined, ownershipType: BatchOwnershipType | undefined, tr: Translate) => {
    if (type === 'partner_consignment' || ownershipType === 'consignment')
        return tr('Consignment goods', 'جنس امانی شریک');
    if (type === 'partner_goods_capital' || ownershipType === 'partner')
        return tr('Goods capital', 'سرمایه جنسی شریک');
    return tr('Partner stock', 'موجودی شریک');
};
const BatchRow: React.FC<{
    batch: Batch;
    supplierName?: string;
    partnerName?: string;
    hasPurchaseLink: boolean;
    readOnly: boolean;
    canViewPurchasePrice: boolean;
    settings?: AppSettings;
    tr: Translate;
    onEdit: () => void;
    onHistory: () => void;
    onDelete: () => void;
}> = ({ batch, supplierName, partnerName, hasPurchaseLink, readOnly, canViewPurchasePrice, settings, tr, onEdit, onHistory, onDelete }) => (<tr className="transition hover:bg-brand-50/45">
    <td className="px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-black text-slate-800">{batch.batchNumber}</span>
        {hasPurchaseLink ? (<span className="w-fit rounded-full border border-brand-200/80 bg-brand-50/80 px-2 py-0.5 text-[10px] font-black text-brand-700">
            {tr('Linked purchase', 'متصل به خرید')}
          </span>) : null}
      </div>
    </td>
    <td className="px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-black text-slate-900">{batch.quantity}</span>
        <span className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-black ${getAvailabilityTone(batch.availabilityStatus)}`}>
          {batch.availabilityStatus === 'quarantine'
        ? tr('Quarantine', 'قرنطین')
        : batch.availabilityStatus === 'rejected'
            ? tr('Rejected', 'رد شده')
            : tr('Available', 'قابل استفاده')}
        </span>
      </div>
    </td>
    <td className="px-4 py-3.5 text-sm font-semibold text-slate-600">{formatBatchDate(batch.expiryDate, settings)}</td>
    <td className="px-4 py-3.5 text-sm font-semibold text-slate-600">
      {batch.location && (batch.location.rack || batch.location.shelf) ? `${batch.location.rack || '-'} / ${batch.location.shelf || '-'}` : '-'}
    </td>
    <td className="px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-brand-700">{supplierName || '-'}</span>
        {batch.ownerPartnerId ? (<span className="w-fit rounded-full border border-emerald-200/80 bg-emerald-50/85 px-2 py-0.5 text-[10px] font-black text-emerald-700">
            {tr('Partner', 'شریک')}: {partnerName || batch.ownerPartnerId}
          </span>) : null}
        {batch.ownerPartnerId ? (<span className="text-[10px] font-bold text-slate-500">
            {getPartnerStockTypeLabel(batch.sourceEntryType, batch.ownershipType, tr)}
          </span>) : null}
      </div>
    </td>
    {canViewPurchasePrice ? <td className="px-4 py-3.5 text-sm font-semibold text-slate-600">{batch.purchasePrice.toLocaleString()} AFN</td> : null}
    <td className="px-4 py-3.5">
      <div className={`flex flex-wrap gap-2 ${settings?.language === 'english' ? 'justify-end' : 'justify-start'}`}>
        {!readOnly ? (<button type="button" onClick={onEdit} className="rounded-full border border-brand-200/80 bg-white/85 px-3 py-1 text-[11px] font-black text-brand-700">
            {tr('Edit', 'ویرایش')}
          </button>) : null}
        <button type="button" onClick={onHistory} className="rounded-full border border-white/80 bg-white/82 px-3 py-1 text-[11px] font-black text-slate-600">
          {tr('History', 'تاریخچه')}
        </button>
        {!readOnly && !hasPurchaseLink ? (<button type="button" onClick={onDelete} className="rounded-full border border-rose-200/80 bg-rose-50/85 px-3 py-1 text-[11px] font-black text-rose-600">
            {tr('Delete', 'حذف')}
          </button>) : null}
      </div>
    </td>
  </tr>);
const EditBatchRow: React.FC<{
    batch: Partial<Batch>;
    suppliers: Supplier[];
    partners: Partner[];
    canViewPurchasePrice: boolean;
    tr: Translate;
    onSave: (batch: Partial<Batch>) => void;
    onCancel: () => void;
}> = ({ batch, suppliers, partners, canViewPurchasePrice, tr, onSave, onCancel }) => {
    const partnerOptions = useMemo(() => partners.filter((partner) => (!partner.isDeleted && partner.status !== 'inactive') || partner.id === batch.ownerPartnerId), [partners, batch.ownerPartnerId]);
    const [formData, setFormData] = useState({
        ...batch,
        quantity: batch.quantity?.toString() || '',
        purchasePrice: batch.purchasePrice?.toString() || '',
        supplierId: batch.supplierId || '',
        ownerPartnerId: batch.ownerPartnerId || '',
        ownershipType: batch.ownershipType || (batch.ownerPartnerId ? 'partner' : 'store'),
        sourceEntryType: batch.sourceEntryType || (batch.ownerPartnerId ? 'partner_goods_capital' : 'store_purchase'),
        agreedPartnerValue: batch.agreedPartnerValue?.toString() || '',
        suggestedSalePrice: batch.suggestedSalePrice?.toString() || '',
        sourceDocumentNumber: batch.sourceDocumentNumber || '',
        availabilityStatus: batch.availabilityStatus || 'available',
        availabilityReason: batch.availabilityReason || ''
    });
    const [rack, setRack] = useState(batch.location?.rack || '');
    const [shelf, setShelf] = useState(batch.location?.shelf || '');
    const batchNoRef = useRef<HTMLInputElement>(null);
    const qtyRef = useRef<HTMLInputElement>(null);
    const expiryRef = useRef<HTMLInputElement>(null);
    const rackRef = useRef<HTMLInputElement>(null);
    const shelfRef = useRef<HTMLInputElement>(null);
    const supplierRef = useRef<HTMLSelectElement>(null);
    const priceRef = useRef<HTMLInputElement>(null);
    const saveRef = useRef<HTMLButtonElement>(null);
    const isNew = !batch.id;
    const inputClass = 'h-10 w-full rounded-xl border border-white/82 bg-white/90 px-3 text-sm font-semibold text-slate-700 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-300/35';
    useEffect(() => {
        const timer = window.setTimeout(() => (isNew ? batchNoRef.current : qtyRef.current)?.focus(), 50);
        return () => window.clearTimeout(timer);
    }, [isNew]);
    const focusNext = (event: React.KeyboardEvent, nextRef: React.RefObject<HTMLElement>) => {
        if (event.key !== 'Enter')
            return;
        event.preventDefault();
        nextRef.current?.focus();
    };
    const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = event.target;
        if (name === 'quantity' || name === 'purchasePrice' || name === 'agreedPartnerValue' || name === 'suggestedSalePrice') {
            const normalized = normalizePersianNumbers(value);
            if (normalized === '' || /^\d*\.?\d*$/.test(normalized)) {
                setFormData((prev) => ({ ...prev, [name]: normalized }));
            }
            return;
        }
        if (name === 'ownerPartnerId') {
            const nextOwnerPartnerId = value.trim();
            setFormData((prev) => {
                const nextSourceEntryType = nextOwnerPartnerId
                    ? (prev.sourceEntryType === 'partner_consignment' ? 'partner_consignment' : 'partner_goods_capital')
                    : 'store_purchase';
                return {
                    ...prev,
                    ownerPartnerId: nextOwnerPartnerId,
                    ownershipType: nextOwnerPartnerId
                        ? (nextSourceEntryType === 'partner_consignment' ? 'consignment' : 'partner')
                        : 'store',
                    sourceEntryType: nextSourceEntryType
                };
            });
            return;
        }
        if (name === 'sourceEntryType') {
            const nextSourceEntryType = value === 'partner_consignment' ? 'partner_consignment' : 'partner_goods_capital';
            setFormData((prev) => ({
                ...prev,
                sourceEntryType: nextSourceEntryType,
                ownershipType: nextSourceEntryType === 'partner_consignment' ? 'consignment' : 'partner'
            }));
            return;
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
    };
    const handleSave = () => {
        if (isNew && !formData.batchNumber)
            return window.alert(tr('Batch number is required.', 'شماره سری ساخت الزامی است.'));
        const quantity = parseFloat(formData.quantity as string);
        if (!Number.isFinite(quantity) || quantity < 0)
            return window.alert(tr('Quantity must be valid.', 'تعداد باید معتبر باشد.'));
        if (!formData.expiryDate)
            return window.alert(tr('Expiry date is required.', 'تاریخ انقضا الزامی است.'));
        let purchasePrice = batch.purchasePrice || 0;
        if (canViewPurchasePrice) {
            purchasePrice = parseFloat(formData.purchasePrice as string);
            if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
                return window.alert(tr('Purchase price must be valid.', 'قیمت خرید باید معتبر باشد.'));
            }
        }
        const ownerPartnerId = String(formData.ownerPartnerId || '').trim();
        if (ownerPartnerId && !partnerOptions.some((partner) => partner.id === ownerPartnerId && !partner.isDeleted)) {
            return window.alert(tr('Selected partner is not available.', 'شریک انتخاب‌شده در دسترس نیست.'));
        }
        const sourceEntryType: StockEntryType = ownerPartnerId
            ? (formData.sourceEntryType === 'partner_consignment' ? 'partner_consignment' : 'partner_goods_capital')
            : 'store_purchase';
        const ownershipType: BatchOwnershipType = ownerPartnerId
            ? (sourceEntryType === 'partner_consignment' ? 'consignment' : 'partner')
            : 'store';
        const parsedAgreedPartnerValue = parseFloat(formData.agreedPartnerValue as string);
        const parsedSuggestedSalePrice = parseFloat(formData.suggestedSalePrice as string);
        const agreedPartnerValue = Number.isFinite(parsedAgreedPartnerValue) && parsedAgreedPartnerValue > 0
            ? parsedAgreedPartnerValue
            : purchasePrice;
        const suggestedSalePrice = Number.isFinite(parsedSuggestedSalePrice) && parsedSuggestedSalePrice > 0
            ? parsedSuggestedSalePrice
            : undefined;
        if (ownerPartnerId && agreedPartnerValue <= 0) {
            return window.alert(tr('Agreed partner value must be greater than zero.', 'ارزش توافقی شریک باید بیشتر از صفر باشد.'));
        }
        const sourceDocumentNumber = String(formData.sourceDocumentNumber || formData.batchNumber || '').trim();
        onSave({
            ...formData,
            quantity,
            purchasePrice,
            ownerPartnerId: ownerPartnerId || undefined,
            ownershipType,
            sourceEntryType,
            agreedPartnerValue: ownerPartnerId ? agreedPartnerValue : undefined,
            suggestedSalePrice: ownerPartnerId ? suggestedSalePrice : undefined,
            sourceDocumentNumber: ownerPartnerId ? (sourceDocumentNumber || undefined) : undefined,
            availabilityChangedAt: new Date().toISOString(),
            location: { rack: rack.trim(), shelf: shelf.trim() }
        });
    };
    return (<tr className="bg-brand-50/70">
      <td className="px-3 py-3"><input ref={batchNoRef} type="text" name="batchNumber" value={formData.batchNumber || ''} onChange={handleChange} onKeyDown={(e) => focusNext(e, qtyRef)} disabled={!isNew} className={inputClass} placeholder={tr('Batch number', 'شماره سری ساخت')}/></td>
      <td className="px-3 py-3"><input ref={qtyRef} type="text" name="quantity" inputMode="numeric" value={formData.quantity as string} onChange={handleChange} onKeyDown={(e) => focusNext(e, expiryRef)} className={`${inputClass} text-center`} placeholder="0"/></td>
      <td className="px-3 py-3"><input ref={expiryRef} type="date" name="expiryDate" value={formData.expiryDate || ''} onChange={handleChange} onKeyDown={(e) => focusNext(e, rackRef)} className={inputClass}/></td>
      <td className="px-3 py-3">
        <div className="grid gap-2">
          <input ref={rackRef} type="text" value={rack} onChange={(e) => setRack(e.target.value)} onKeyDown={(e) => focusNext(e, shelfRef)} className={inputClass} placeholder={tr('Rack', 'قفسه')}/>
          <input ref={shelfRef} type="text" value={shelf} onChange={(e) => setShelf(e.target.value)} onKeyDown={(e) => focusNext(e, supplierRef)} className={inputClass} placeholder={tr('Shelf', 'ردیف')}/>
        </div>
      </td>
      <td className="px-3 py-3">
        <select ref={supplierRef} name="supplierId" value={formData.supplierId} onChange={handleChange} onKeyDown={(e) => focusNext(e, canViewPurchasePrice ? priceRef : saveRef)} className={inputClass}>
          <option value="">{tr('Select supplier', 'انتخاب تأمین‌کننده')}</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
        <select name="availabilityStatus" value={String(formData.availabilityStatus || 'available')} onChange={handleChange} className={`${inputClass} mt-2`}>
          <option value="available">{tr('Available', 'قابل استفاده')}</option>
          <option value="quarantine">{tr('Quarantine', 'قرنطین')}</option>
          <option value="rejected">{tr('Rejected', 'رد شده')}</option>
        </select>
        <select name="ownerPartnerId" value={String(formData.ownerPartnerId || '')} onChange={handleChange} className={`${inputClass} mt-2`} disabled={!partnerOptions.length}>
          <option value="">{tr('Store-owned stock', 'موجودی دواخانه')}</option>
          {partnerOptions.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
        </select>
        {formData.ownerPartnerId ? (<div className="mt-2 grid gap-2">
            <select name="sourceEntryType" value={String(formData.sourceEntryType || 'partner_goods_capital')} onChange={handleChange} className={inputClass}>
              <option value="partner_goods_capital">{tr('Goods capital', 'سرمایه جنسی شریک')}</option>
              <option value="partner_consignment">{tr('Consignment goods', 'جنس امانی شریک')}</option>
            </select>
            <input type="text" name="agreedPartnerValue" inputMode="decimal" value={formData.agreedPartnerValue as string} onChange={handleChange} className={`${inputClass} text-center`} placeholder={tr('Agreed value', 'ارزش توافقی')}/>
            <input type="text" name="suggestedSalePrice" inputMode="decimal" value={formData.suggestedSalePrice as string} onChange={handleChange} className={`${inputClass} text-center`} placeholder={tr('Suggested sale price', 'قیمت فروش پیشنهادی')}/>
          </div>) : null}
      </td>
      {canViewPurchasePrice ? <td className="px-3 py-3"><input ref={priceRef} type="text" name="purchasePrice" inputMode="decimal" value={formData.purchasePrice as string} onChange={handleChange} onKeyDown={(e) => focusNext(e, saveRef)} className={`${inputClass} text-center`} placeholder="0"/></td> : null}
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button ref={saveRef} type="button" onClick={handleSave} className="rounded-full border border-emerald-200/80 bg-emerald-500 px-4 py-2 text-[11px] font-black text-white">{tr('Save', 'ذخیره')}</button>
          <button type="button" onClick={onCancel} className="rounded-full border border-white/80 bg-white/85 px-4 py-2 text-[11px] font-black text-slate-600">{tr('Cancel', 'انصراف')}</button>
        </div>
      </td>
    </tr>);
};
export const MedicineDetailsModal: React.FC<MedicineDetailsModalProps> = ({ medicine, medicines = [], purchases = [], onClose, onUpdateMedicine, onUpdateBatch, onAddBatch, onDeleteBatch, onDeleteMedicine, readOnly = false, canViewPurchasePrice = true, settings, suppliers = [], partners = [], canManageCommissionRules = false, initialMode = 'view', onStartPurchaseReceipt }) => {
    const aiSettings = settings || FALLBACK_AI_SETTINGS;
    const isEnglish = (settings?.language || 'dari') === 'english';
    const tr: Translate = (en, fa) => (isEnglish ? en : fa);
    const medicineUnitOptions = useMemo(() => getMedicineUnitOptions(settings, [medicine.unit, ...medicines.map((item) => item.unit)]), [medicine.unit, medicines, settings]);
    const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
    const [viewingHistoryBatch, setViewingHistoryBatch] = useState<Batch | null>(null);
    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [manufacturerHint, setManufacturerHint] = useState('');
    const [descriptionHint, setDescriptionHint] = useState('');
    const [autoSummaryStatus, setAutoSummaryStatus] = useState<AutoSummaryStatus>('idle');
    const [infoForm, setInfoForm] = useState<InfoFormState>(() => buildInfoForm(medicine));
    const [commissionRules, setCommissionRules] = useState<MedicineCommissionRule[]>(() => normalizeMedicineCommissionRules(medicine.commissionRules));
    const [commissionRuleUserId, setCommissionRuleUserId] = useState('');
    const [commissionRuleAdjustment, setCommissionRuleAdjustment] = useState('');
    const [commissionRuleNote, setCommissionRuleNote] = useState('');
    const [marginInfo, setMarginInfo] = useState({ margin: 0, mode: 'retail' as 'retail' | 'wholesale' | 'bulk' });
    const [pendingSyncSave, setPendingSyncSave] = useState<LinkedSyncSaveRequest | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const genericRef = useRef<HTMLInputElement>(null);
    const manufacturerRef = useRef<HTMLInputElement>(null);
    const typeRef = useRef<HTMLSelectElement>(null);
    const unitRef = useRef<HTMLSelectElement>(null);
    const itemsPerBoxRef = useRef<HTMLInputElement>(null);
    const thresholdRef = useRef<HTMLInputElement>(null);
    const retailRef = useRef<HTMLInputElement>(null);
    const wholesaleRef = useRef<HTMLInputElement>(null);
    const bulkRef = useRef<HTMLInputElement>(null);
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    const manufacturerSuggestionsId = 'medicine-details-manufacturer-suggestions';
    const manufacturerDirectory = useMemo(() => buildManufacturerDirectory(medicines.length > 0 ? medicines : [medicine]), [medicines, medicine]);
    const manufacturerSuggestions = useMemo(() => getManufacturerSuggestions(infoForm.manufacturer, manufacturerDirectory, 10), [infoForm.manufacturer, manufacturerDirectory]);
    const displayDescription = useMemo(() => sanitizeMedicineDescription(medicine.description || ''), [medicine.description]);
    const displayClinicalSummary = useMemo(() => sanitizeMedicineClinicalSummary(medicine.clinicalSummary), [medicine.clinicalSummary]);
    const fallbackClinicalSummary = useMemo(() => buildFallbackClinicalSummary(medicine, displayDescription, isEnglish), [medicine.name, medicine.genericName, medicine.manufacturer, medicine.type, medicine.unit, displayDescription, isEnglish]);
    const displaySummary = useMemo(() => mergeClinicalSummaries(displayClinicalSummary, fallbackClinicalSummary), [displayClinicalSummary, fallbackClinicalSummary]);
    const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
    const partnerById = useMemo(() => new Map(partners.map((partner) => [partner.id, partner])), [partners]);
    const activeUsers = useMemo(() => (settings?.users || []).filter((user) => user && !user.isDeleted), [settings?.users]);
    const userNameById = useMemo(() => new Map(activeUsers.map((user) => [user.id, user.name])), [activeUsers]);
    const canEditCommissionRules = canManageCommissionRules && !readOnly;
    const preferredSupplier = useMemo(() => (medicine.preferredSupplierId ? supplierById.get(medicine.preferredSupplierId) || null : null), [medicine.preferredSupplierId, supplierById]);
    const totalQuantity = useMemo(() => medicine.batches.reduce((sum, batch) => sum + batch.quantity, 0), [medicine.batches]);
    const linkedBatchCount = useMemo(() => medicine.batches.filter((batch) => !!batch.purchaseId).length, [medicine.batches]);
    const supplierCount = useMemo(() => new Set(medicine.batches.map((batch) => batch.supplierId).filter(Boolean)).size, [medicine.batches]);
    const totalPurchaseValue = useMemo(() => medicine.batches.reduce((sum, batch) => sum + batch.quantity * batch.purchasePrice, 0), [medicine.batches]);
    const nextExpiry = useMemo(() => [...medicine.batches].filter((batch) => !!batch.expiryDate).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0] || null, [medicine.batches]);
    const priceHistory = useMemo(() => getMedicinePurchasePriceHistory(medicine, supplierById).slice(0, 3), [medicine, supplierById]);
    const lastPurchaseRate = useMemo(() => getMedicineLastPurchaseRate(medicine, supplierById), [medicine, supplierById]);
    const hasStoredStructuredSummary = useMemo(() => hasClinicalSummaryContent(displayClinicalSummary), [displayClinicalSummary]);
    const hasStructuredSummary = useMemo(() => hasClinicalSummaryContent(displaySummary) || !!displayDescription, [displaySummary, displayDescription]);
    const linkedSyncSettings = useMemo(() => getInventoryLinkedSyncSettings(settings), [settings?.inventoryLinkedSyncSettings]);
    const medicineLinkage = useMemo(() => resolveInventoryLinkage({
        medicineId: medicine.id,
        batches: medicine.batches,
        purchases
    }), [medicine.batches, medicine.id, purchases]);
    const panelGlass = 'relative overflow-hidden rounded-[28px] border border-white/70 bg-white/62 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.58)] backdrop-blur-2xl';
    const insetGlass = 'rounded-[24px] border border-white/75 bg-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_30px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl';
    const inputClass = 'h-11 w-full rounded-2xl border border-white/82 bg-white/90 px-4 text-sm font-semibold text-slate-700 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-300/35';
    const labelClass = 'mb-1.5 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500';
    const secondaryButtonClass = 'rounded-full border border-white/80 bg-white/85 px-4 py-2 text-[11px] font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-55';
    const primaryButtonClass = 'rounded-full border border-brand-500/70 bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-60';
    const summarySections = useMemo(() => ([
        {
            key: 'composition' as const,
            label: tr('Composition / Form', 'ترکیب / فرم'),
            value: displaySummary?.composition || '',
            icon: SummaryCompositionIcon,
            tone: 'border-brand-200/80 bg-white/84 text-brand-700 shadow-[0_14px_28px_-24px_rgba(59,130,246,0.45)]',
            testId: 'medicine-summary-card-composition'
        },
        {
            key: 'use' as const,
            label: tr('Detailed Use', 'مورد استعمال'),
            value: displaySummary?.use || '',
            icon: SummaryUseIcon,
            tone: 'border-cyan-200/80 bg-cyan-50/75 text-cyan-700 shadow-[0_14px_28px_-24px_rgba(6,182,212,0.42)]',
            testId: 'medicine-summary-card-use'
        },
        {
            key: 'dose' as const,
            label: tr('Usual Dose', 'دوز معمول'),
            value: displaySummary?.dose || '',
            icon: SummaryDoseIcon,
            tone: 'border-emerald-200/80 bg-emerald-50/78 text-emerald-700 shadow-[0_14px_28px_-24px_rgba(16,185,129,0.42)]',
            testId: 'medicine-summary-card-dose'
        },
        {
            key: 'mechanism' as const,
            label: tr('How It Works', 'نحوه اثر'),
            value: displaySummary?.mechanism || '',
            icon: SummaryMechanismIcon,
            tone: 'border-amber-200/80 bg-amber-50/80 text-amber-700 shadow-[0_14px_28px_-24px_rgba(245,158,11,0.38)]',
            testId: 'medicine-summary-card-mechanism'
        },
        {
            key: 'sideEffects' as const,
            label: tr('Side Effects', 'عوارض جانبی'),
            value: displaySummary?.sideEffects || '',
            icon: SummarySideEffectsIcon,
            tone: 'border-fuchsia-200/80 bg-fuchsia-50/75 text-fuchsia-700 shadow-[0_14px_28px_-24px_rgba(217,70,239,0.36)]',
            testId: 'medicine-summary-card-side-effects'
        },
        {
            key: 'caution' as const,
            label: tr('Short Caution', 'احتیاط کوتاه'),
            value: displaySummary?.caution || '',
            icon: SummaryCautionIcon,
            tone: 'border-rose-200/80 bg-rose-50/82 text-rose-700 shadow-[0_14px_28px_-24px_rgba(244,63,94,0.4)]',
            testId: 'medicine-summary-card-caution'
        }
    ]), [displaySummary, tr]);
    useEffect(() => {
        setInfoForm(buildInfoForm(medicine));
        setCommissionRules(normalizeMedicineCommissionRules(medicine.commissionRules));
        setCommissionRuleUserId('');
        setCommissionRuleAdjustment('');
        setCommissionRuleNote('');
        setManufacturerHint('');
        setDescriptionHint('');
    }, [medicine]);
    useEffect(() => {
        if (initialMode === 'add_batch' && !readOnly)
            setEditingBatchId('new');
    }, [initialMode, readOnly]);
    useEffect(() => {
        const description = displayDescription.trim();
        const attemptKey = `${medicine.id}:${description}`;
        {
            if (hasStoredStructuredSummary)
                setAutoSummaryStatus('idle');
            return;
        }
    }, [
        aiSettings,
        false,
        displayDescription,
        hasStoredStructuredSummary,
        isEditingInfo,
        medicine.genericName,
        medicine.id,
        medicine.manufacturer,
        medicine.name,
        medicine.type,
        medicine.unit,
        onUpdateMedicine,
        readOnly
    ]);
    useEffect(() => {
        if (!isEditingInfo)
            return;
        const timer = window.setTimeout(() => nameRef.current?.focus(), 50);
        return () => window.clearTimeout(timer);
    }, [isEditingInfo]);
    useEffect(() => {
        const latestBatch = [...medicine.batches].sort((a, b) => new Date(b.history[0]?.date || b.id).getTime() - new Date(a.history[0]?.date || a.id).getTime())[0];
        const purchasePrice = latestBatch?.purchasePrice || 0;
        const mode = resolveDefaultSalesMode(settings);
        const salePrice = isEditingInfo ? Number(infoForm[mode]) || 0 : medicine.salePrices[mode];
        setMarginInfo({ margin: purchasePrice > 0 && salePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : 0, mode });
    }, [infoForm, isEditingInfo, medicine, settings?.defaultSalesMode]);
    const resetInfoEditor = () => {
        setInfoForm(buildInfoForm(medicine));
        setManufacturerHint('');
        setDescriptionHint('');
        setIsEditingInfo(false);
    };
    const getBatchLinkage = (batch: Partial<Batch>) => {
        return resolveInventoryLinkage({
            medicineId: medicine.id,
            batch,
            purchases
        });
    };
    const commitLinkedSyncSave = (request: LinkedSyncSaveRequest, targets: InventoryLinkedSyncTargets) => {
        const normalizedTargets = normalizeInventoryLinkedSyncTargets(targets);
        if (request.kind === 'medicine') {
            onUpdateMedicine(medicine.id, request.data, normalizedTargets);
            setIsEditingInfo(false);
            return;
        }
        onUpdateBatch(medicine.id, request.batchId, request.data, normalizedTargets);
        setEditingBatchId(null);
    };
    const requestLinkedSyncSave = (request: LinkedSyncSaveRequest) => {
        if (!request.linkage.purchases && !request.linkage.partnerships) {
            if (request.kind === 'medicine') {
                onUpdateMedicine(medicine.id, request.data);
                setIsEditingInfo(false);
            }
            else {
                onUpdateBatch(medicine.id, request.batchId, request.data);
                setEditingBatchId(null);
            }
            return;
        }
        if (linkedSyncSettings.mode === 'never') {
            commitLinkedSyncSave(request, { purchases: false, partnerships: false });
            return;
        }
        if (linkedSyncSettings.mode === 'always') {
            commitLinkedSyncSave(request, intersectInventorySyncTargetsWithLinkage(linkedSyncSettings.targets, request.linkage));
            return;
        }
        setPendingSyncSave(request);
    };
    const confirmPendingSyncSave = (targets: InventoryLinkedSyncTargets) => {
        if (!pendingSyncSave)
            return;
        const request = pendingSyncSave;
        setPendingSyncSave(null);
        commitLinkedSyncSave(request, intersectInventorySyncTargetsWithLinkage(targets, request.linkage));
    };
    const handleInfoChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = event.target;
        if (name === 'manufacturer')
            setManufacturerHint('');
        if (name === 'description')
            setDescriptionHint('');
        setInfoForm((prev) => ({
            ...prev,
            [name]: value,
            ...(name === 'description' ? { clinicalSummary: undefined } : {})
        }));
    };
    const handleNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        const normalized = normalizePersianNumbers(value);
        if (normalized === '' || /^\d*\.?\d*$/.test(normalized)) {
            setInfoForm((prev) => ({ ...prev, [name]: normalized }));
        }
    };
    const handleCommissionAdjustmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = normalizePersianNumbers(event.target.value);
        if (value === '' || value === '-' || value === '+' || /^[+-]?\d*\.?\d*$/.test(value)) {
            setCommissionRuleAdjustment(value);
        }
    };
    const addCommissionRule = () => {
        if (!canEditCommissionRules)
            return;
        const adjustmentPercent = normalizeCommissionAdjustmentPercent(commissionRuleAdjustment);
        if (adjustmentPercent === 0) {
            window.alert(tr('Enter a positive or negative adjustment percent.', 'یک فیصدی تعدیل مثبت یا منفی وارد کنید.'));
            return;
        }
        setCommissionRules((prev) => normalizeMedicineCommissionRules([
            ...prev,
            {
                id: createUniqueId('medcom'),
                userId: commissionRuleUserId || undefined,
                adjustmentPercent,
                enabled: true,
                note: commissionRuleNote.trim() || undefined,
                updatedAt: new Date().toISOString()
            }
        ]));
        setCommissionRuleUserId('');
        setCommissionRuleAdjustment('');
        setCommissionRuleNote('');
    };
    const removeCommissionRule = (ruleId: string) => {
        if (!canEditCommissionRules)
            return;
        setCommissionRules((prev) => prev.filter((rule) => rule.id !== ruleId));
    };
    const saveCommissionRules = () => {
        if (!canEditCommissionRules)
            return;
        onUpdateMedicine(medicine.id, {
            commissionRules: normalizeMedicineCommissionRules(commissionRules).map((rule) => ({
                ...rule,
                updatedAt: rule.updatedAt || new Date().toISOString()
            }))
        });
    };
    const applyCanonicalManufacturer = (rawValue: string) => {
        const canonical = canonicalizeManufacturerName(rawValue, manufacturerDirectory);
        const nextValue = canonical.displayName || rawValue.trim();
        setInfoForm((prev) => ({ ...prev, manufacturer: nextValue }));
        setManufacturerHint(nextValue && nextValue !== rawValue.trim() ? tr(`Matched to: ${nextValue}`, `به نام معتبر تبدیل شد: ${nextValue}`) : '');
        return nextValue;
    };
    const saveInfo = () => {
        if (!infoForm.name.trim())
            return window.alert(tr('Medicine name is required.', 'نام دارو الزامی است.'));
        const itemsPerBox = Number(infoForm.itemsPerBox) || 1;
        const baseUnit = infoForm.unit;
        requestLinkedSyncSave({
            kind: 'medicine',
            linkage: medicineLinkage,
            data: {
                name: infoForm.name.trim(),
                genericName: infoForm.genericName.trim(),
                manufacturer: applyCanonicalManufacturer(infoForm.manufacturer),
                type: infoForm.type,
                unit: infoForm.unit,
                baseUnit,
                saleUnits: normalizeSaleUnits({ unit: infoForm.unit, baseUnit, itemsPerBox }),
                itemsPerBox,
                description: sanitizeMedicineDescription(infoForm.description),
                clinicalSummary: sanitizeMedicineClinicalSummary(infoForm.clinicalSummary),
                lowStockThreshold: Number(infoForm.lowStockThreshold) || 0,
                salePrices: {
                    retail: Number(infoForm.retail) || 0,
                    wholesale: Number(infoForm.wholesale) || 0,
                    bulk: Number(infoForm.bulk) || 0
                }
            }
        });
    };
    const saveBatch = (updatedData: Partial<Batch>) => {
        const normalizedBatchData = {
            ...updatedData,
            availabilityStatus: updatedData.availabilityStatus || 'available',
            traceSource: updatedData.traceSource || (updatedData.purchaseId ? 'purchase_receipt' : 'manual')
        };
        if (editingBatchId === 'new') {
            const { id, history, ...newBatchData } = normalizedBatchData as Batch;
            onAddBatch(medicine.id, newBatchData);
            setEditingBatchId(null);
        }
        else if (editingBatchId) {
            const existingBatch = medicine.batches.find((batch) => batch.id === editingBatchId) || null;
            const linkage = getBatchLinkage({ ...(existingBatch || {}), ...normalizedBatchData });
            requestLinkedSyncSave({
                kind: 'batch',
                batchId: editingBatchId,
                data: normalizedBatchData,
                linkage
            });
        }
    };
    const deleteMedicine = () => {
        if (!onDeleteMedicine)
            return;
        const confirmed = window.confirm(tr(`Delete "${medicine.name}" permanently?`, `داروی "${medicine.name}" برای همیشه حذف شود؟`));
        if (!confirmed)
            return;
        onDeleteMedicine(medicine.id);
        onClose();
    };
    const summaryCards = [
        { label: tr('Total Stock', 'موجودی کل'), value: `${totalQuantity}`, tone: 'text-emerald-700 bg-emerald-50/75 border-emerald-100/90' },
        { label: tr('Batch Count', 'تعداد batch'), value: `${medicine.batches.length}`, tone: 'text-brand-700 bg-brand-50/75 border-brand-100/90' },
        { label: tr('Next Expiry', 'نزدیک‌ترین انقضا'), value: nextExpiry ? formatBatchDate(nextExpiry.expiryDate, settings) : tr('Not set', 'ثبت نشده'), tone: 'text-amber-700 bg-amber-50/75 border-amber-100/90' },
        { label: tr('Suppliers', 'تأمین‌کنندگان'), value: `${supplierCount}`, tone: 'text-slate-700 bg-slate-50/80 border-slate-200/90' }
    ];
    const pendingHasPurchaseLink = Boolean(pendingSyncSave?.linkage.purchases);
    const pendingHasPartnershipLink = Boolean(pendingSyncSave?.linkage.partnerships);
    const pendingHasBothLinks = pendingHasPurchaseLink && pendingHasPartnershipLink;
    const linkedSyncPromptText = pendingHasBothLinks
        ? tr('This record is linked to purchases and partnership accounting. Choose where this edit should be applied.', 'این رکورد به خرید و حساب شراکت وصل است. انتخاب کنید این تغییر در کدام بخش اعمال شود.')
        : pendingHasPurchaseLink
            ? tr('This record is linked to purchases and procurement. Choose whether to apply this edit there too.', 'این رکورد به خرید و تدارکات وصل است. انتخاب کنید آیا این تغییر آنجا هم اعمال شود.')
            : tr('This record is linked to partnership accounting. Choose whether to apply this edit there too.', 'این رکورد به حساب شراکت وصل است. انتخاب کنید آیا این تغییر آنجا هم اعمال شود.');
    return (<>
      <Modal isOpen={true} onClose={onClose} title={tr('Medicine Control', 'کنترول دارو')} maxWidthClassName="max-w-[min(1180px,96vw)]" overlayClassName="fixed inset-0 z-[140] flex items-start justify-center bg-slate-950/76 px-2 pb-2 pt-[calc(var(--wk-titlebar-height)+6px)] backdrop-blur-sm sm:px-4 sm:pt-[calc(var(--wk-titlebar-height)+12px)]" panelClassName="max-h-[calc(100dvh-var(--wk-titlebar-height)-16px)] overflow-hidden rounded-[30px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(243,248,253,0.9))] shadow-[0_34px_80px_-32px_rgba(15,23,42,0.72)]" headerClassName="flex items-center justify-between border-b border-white/[0.78] bg-white/[0.58] px-4 py-3 backdrop-blur-2xl md:px-6 md:py-4" bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_12%_8%,rgba(99,174,227,0.16),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(14,165,233,0.12),transparent_30%),linear-gradient(180deg,#f8fbff,#f2f7fc)] p-3 sm:p-4 md:p-5 custom-scrollbar" titleClassName="text-lg md:text-xl font-black tracking-tight text-slate-900" closeButtonClassName="rounded-full border border-white/[0.82] bg-white/[0.5] p-2 text-slate-600" animateClassName={false}>
        <div dir={isEnglish ? 'ltr' : 'rtl'} className={`space-y-5 ${isEnglish ? 'text-left' : 'text-right'}`} data-testid="medicine-details-modal-root">
          <div className={`${panelGlass} p-5 md:p-6`}>
            <div className="pointer-events-none absolute -left-16 top-0 h-36 w-36 rounded-full bg-brand-200/35 blur-3xl"/>
            <div className="pointer-events-none absolute -bottom-20 right-10 h-44 w-44 rounded-full bg-cyan-200/28 blur-3xl"/>
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-700">{tr('Medicine Control Center', 'مرکز مدیریت دارو')}</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 md:text-[2rem]">{medicine.name}</h2>
                {medicine.genericName ? <p className="mt-1 text-sm font-semibold text-slate-500">{medicine.genericName}</p> : null}
                {hasStructuredSummary ? (<div className="mt-4 max-w-4xl rounded-[26px] border border-white/80 bg-white/72 p-4 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-700">{tr('AI Clinical Snapshot', 'خلاصه بالینی AI')}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{tr('Structured medicine details for quick review inside inventory.', 'جزئیات ساخت‌یافته دارو برای مرور سریع در انبار.')}</p>
                      </div>
                      <div className={`flex flex-wrap gap-2 ${isEnglish ? 'justify-end' : 'justify-start'}`}>
                        {autoSummaryStatus === 'generating' ? (<span className="rounded-full border border-brand-200/80 bg-brand-50/90 px-3 py-1 text-[11px] font-black text-brand-700">
                            {tr('Building AI cards...', 'در حال ساخت کارت‌های AI...')}
                          </span>) : null}
                        {!hasStoredStructuredSummary && autoSummaryStatus !== 'generating' ? (<span className="rounded-full border border-white/80 bg-white/88 px-3 py-1 text-[11px] font-black text-slate-500">
                            {tr('Split from current note', 'تقسیم‌شده از توضیح موجود')}
                          </span>) : null}
                        {displayClinicalSummary?.generatedAt ? (<span className="rounded-full border border-white/80 bg-white/88 px-3 py-1 text-[11px] font-black text-slate-500">
                            {tr('AI generated · gpt-5.5', 'تولید AI · gpt-5.5')}
                          </span>) : null}
                      </div>
                    </div>
                    {displayDescription ? (<p className="mt-4 rounded-[20px] border border-white/75 bg-white/78 px-4 py-3 text-sm font-semibold leading-7 text-slate-600 whitespace-pre-line">
                        {displayDescription}
                      </p>) : null}
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="medicine-clinical-summary-grid">
                      {summarySections.map((section) => {
                const Icon = section.icon;
                return (<div key={section.key} className={`rounded-[22px] border p-4 backdrop-blur-md ${section.key === 'use' ? 'md:col-span-2 xl:col-span-2' : ''} ${section.tone}`} data-testid={section.testId}>
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 rounded-2xl border border-current/15 bg-white/72 p-2.5">
                                <Icon className="h-5 w-5"/>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">{section.label}</p>
                                <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                                  {section.value || tr('Not available', 'ثبت نشده')}
                                </p>
                              </div>
                            </div>
                          </div>);
            })}
                    </div>
                    {priceHistory.length ? (<div className="mt-3 rounded-[20px] border border-white/80 bg-white/80 p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Price History by Supplier', 'تاریخچه قیمت بر اساس شرکت')}</p>
                        <div className="mt-3 space-y-2">
                          {priceHistory.map((entry) => (<div key={`${entry.date}-${entry.supplierId || 'none'}`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="font-black text-slate-800">{entry.supplierName || tr('Unknown supplier', 'شرکت نامشخص')}</p>
                                <p className="text-xs font-semibold text-slate-500">{formatBatchDate(entry.date || entry.receivedAt || '', settings)}</p>
                              </div>
                              <p className="font-black text-slate-800">{canViewPurchasePrice ? `${entry.purchasePrice.toLocaleString()} AFN` : tr('Hidden', 'پنهان')}</p>
                            </div>))}
                        </div>
                      </div>) : null}
                  </div>) : (<p className="mt-4 max-w-3xl rounded-[22px] border border-white/75 bg-white/74 px-4 py-3 text-sm font-semibold leading-7 text-slate-600 backdrop-blur-md whitespace-pre-line" data-testid="medicine-description-display">
                    {displayDescription || tr('No clean description is available for this medicine yet.', 'برای این دارو هنوز توضیح تمیز ثبت نشده است.')}
                  </p>)}
              </div>
              <div className={`flex flex-wrap gap-2 ${isEnglish ? 'justify-end' : 'justify-start'}`}>
                <span className="rounded-full border border-brand-200/80 bg-brand-50/80 px-3 py-1 text-[11px] font-black text-brand-700">{tr('Manufacturer', 'تولیدکننده')}: {medicine.manufacturer || tr('Unknown', 'نامشخص')}</span>
                <span className="rounded-full border border-white/85 bg-white/82 px-3 py-1 text-[11px] font-black text-slate-600">{isEnglish ? medicine.type : getMedicineTypeLabel(medicine.type)} / {getMedicineUnitLabel(medicine.unit, isEnglish)}</span>
                <span className={`rounded-full px-3 py-1 text-[11px] font-black ${readOnly ? 'border border-amber-200/80 bg-amber-50/85 text-amber-700' : 'border border-emerald-200/80 bg-emerald-50/85 text-emerald-700'}`}>{readOnly ? tr('Read only', 'فقط مشاهده') : tr('Editable', 'قابل ویرایش')}</span>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {summaryCards.map((card) => <div key={card.label} className={`rounded-[22px] border px-4 py-3 backdrop-blur-md ${card.tone}`}><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">{card.label}</p><p className="mt-2 text-lg font-black tracking-tight">{card.value}</p></div>)}
            </div>
          </div>
          <div className={`${panelGlass} p-4 md:p-5`}>
            <div className="flex flex-col gap-3 border-b border-white/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-700">{tr('Commission Adjustment', 'تعدیل کمیسیون')}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{tr('Set medicine-wide or staff-specific commission changes for this medicine.', 'برای این دوا تعدیل عمومی یا مخصوص کارمند تعیین کنید.')}</p>
              </div>
              {canEditCommissionRules ? (<button type="button" onClick={saveCommissionRules} className={primaryButtonClass}>
                  {tr('Save Commission Rules', 'ذخیره قواعد کمیسیون')}
                </button>) : (<span className="rounded-full border border-white/80 bg-white/78 px-3 py-1 text-[11px] font-black text-slate-500">{tr('Payroll permission required', 'نیازمند صلاحیت معاش')}</span>)}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div className={`${insetGlass} p-4`}>
                {commissionRules.length ? (<div className="space-y-2">
                    {commissionRules.map((rule) => (<div key={rule.id} className="flex flex-col gap-3 rounded-[20px] border border-white/78 bg-white/78 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-800">
                            {rule.userId ? (userNameById.get(rule.userId) || tr('Selected staff', 'کارمند انتخاب‌شده')) : tr('All staff', 'همه کارمندان')}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{rule.note || tr('Direct medicine rule', 'قاعده مستقیم دوا')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`wk-ltr-data rounded-full border px-3 py-1 text-sm font-black ${rule.adjustmentPercent >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                            {rule.adjustmentPercent >= 0 ? '+' : ''}{rule.adjustmentPercent}%
                          </span>
                          {canEditCommissionRules ? (<button type="button" onClick={() => removeCommissionRule(rule.id)} className={secondaryButtonClass}>
                              {tr('Remove', 'حذف')}
                            </button>) : null}
                        </div>
                      </div>))}
                  </div>) : (<p className="rounded-[20px] border border-dashed border-slate-200 bg-white/70 p-5 text-sm font-semibold text-slate-500">
                    {tr('No direct commission adjustment is set for this medicine.', 'برای این دوا هنوز تعدیل مستقیم کمیسیون ثبت نشده است.')}
                  </p>)}
              </div>
              {canEditCommissionRules ? (<div className={`${insetGlass} p-4`}>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tr('Add rule', 'افزودن قاعده')}</p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className={labelClass}>{tr('Staff scope', 'محدوده کارمند')}</label>
                      <select value={commissionRuleUserId} onChange={(event) => setCommissionRuleUserId(event.target.value)} className={inputClass}>
                        <option value="">{tr('All staff', 'همه کارمندان')}</option>
                        {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>{tr('Adjustment (%)', 'تعدیل (%)')}</label>
                      <input type="text" inputMode="decimal" value={commissionRuleAdjustment} onChange={handleCommissionAdjustmentChange} className={`${inputClass} wk-ltr-data`} placeholder={tr('Example: +5 or -3', 'مثال: +5 یا -3')}/>
                    </div>
                    <div>
                      <label className={labelClass}>{tr('Note', 'یادداشت')}</label>
                      <input type="text" value={commissionRuleNote} onChange={(event) => setCommissionRuleNote(event.target.value)} className={inputClass} placeholder={tr('Optional label', 'برچسب اختیاری')}/>
                    </div>
                    <button type="button" onClick={addCommissionRule} className={primaryButtonClass}>
                      {tr('Add Commission Rule', 'افزودن قاعده کمیسیون')}
                    </button>
                  </div>
                </div>) : null}
            </div>
          </div>

          <div className={`${panelGlass} p-4 md:p-5`}>
            <div className="flex flex-col gap-3 border-b border-white/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-700">{tr('General Info & Pricing', 'مشخصات عمومی و قیمت‌گذاری')}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{tr('Review identity, pricing, AI summary, and stock rules.', 'هویت محصول، قیمت، خلاصه AI و قواعد موجودی را مدیریت کنید.')}</p>
              </div>
              {!readOnly ? (!isEditingInfo ? <button type="button" onClick={() => setIsEditingInfo(true)} className={primaryButtonClass}>{tr('Edit Info', 'ویرایش مشخصات')}</button> : <div className="flex flex-wrap gap-2"><button type="button" onClick={resetInfoEditor} className={secondaryButtonClass}>{tr('Cancel', 'انصراف')}</button><button type="button" onClick={saveInfo} className={primaryButtonClass}>{tr('Save Changes', 'ذخیره تغییرات')}</button></div>) : null}
            </div>
            {!isEditingInfo ? (<div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
                <div className={`${insetGlass} grid gap-3 p-4 sm:grid-cols-2`}>
                  {[
                { label: tr('Medicine Name', 'نام دارو'), value: medicine.name },
                { label: tr('Generic Name', 'نام جنریک'), value: medicine.genericName || tr('Not set', 'ثبت نشده') },
                { label: tr('Manufacturer', 'تولیدکننده'), value: medicine.manufacturer || tr('Unknown', 'نامشخص') },
                { label: tr('Form / Unit', 'نوع / واحد'), value: `${isEnglish ? medicine.type : getMedicineTypeLabel(medicine.type)} / ${getMedicineUnitLabel(medicine.unit, isEnglish)}` },
                { label: tr('Items per Pack', 'تعداد در بسته'), value: `${medicine.itemsPerBox || 1}` },
                { label: tr('Low Stock Threshold', 'حد هشدار کم‌موجودی'), value: `${medicine.lowStockThreshold}` }
            ].map((item) => <div key={item.label} className="rounded-[20px] border border-white/78 bg-white/75 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</p><p className="mt-2 text-sm font-black text-slate-800">{item.value}</p></div>)}
                </div>
                <div className="space-y-4">
                  <div className={`${insetGlass} p-4`}>
                    <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tr('Pricing Tiers', 'سطوح قیمت')}</p>{marginInfo.margin > 0 ? <span className="rounded-full border border-emerald-200/80 bg-emerald-50/85 px-3 py-1 text-[11px] font-black text-emerald-700">{tr('Estimated margin', 'حاشیه سود تخمینی')}: {marginInfo.margin.toFixed(1)}%</span> : null}</div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">{(['retail', 'wholesale', 'bulk'] as const).map((mode) => <div key={mode} className={`rounded-[22px] border p-4 ${marginInfo.mode === mode ? 'border-brand-200/90 bg-gradient-to-br from-brand-50 via-white to-cyan-50 text-brand-700' : 'border-white/75 bg-white/78 text-slate-700'}`}><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">{mode === 'retail' ? tr('Retail Price', 'قیمت پرچون') : mode === 'wholesale' ? tr('Wholesale Price', 'قیمت عمده') : tr('Carton Price', 'قیمت کارتنی')}</p><p className="mt-3 text-xl font-black tracking-tight">{medicine.salePrices[mode].toLocaleString()} AFN</p></div>)}</div>
                  </div>
                  <div className={`${insetGlass} p-4`}>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tr('Inventory Cost Snapshot', 'خلاصه ارزش انبار')}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[20px] border border-white/80 bg-white/80 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Linked Batches', 'batchهای متصل')}</p><p className="mt-2 text-lg font-black text-slate-800">{linkedBatchCount}</p></div>
                      <div className="rounded-[20px] border border-white/80 bg-white/80 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Purchase Value', 'ارزش خرید')}</p><p className="mt-2 text-lg font-black text-slate-800">{canViewPurchasePrice ? `${totalPurchaseValue.toLocaleString()} AFN` : tr('Hidden', 'پنهان')}</p></div>
                      <div className="rounded-[20px] border border-white/80 bg-white/80 p-4"><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Preferred Supplier', 'تأمین‌کننده ترجیحی')}</p><NewFeatureBadge /></div><p className="mt-2 text-sm font-black text-slate-800">{preferredSupplier?.name || tr('Not set', 'ثبت نشده')}</p></div>
                      <div className="rounded-[20px] border border-white/80 bg-white/80 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Last Purchase Rate', 'آخرین نرخ خرید')}</p><p className="mt-2 text-sm font-black text-slate-800">{lastPurchaseRate && canViewPurchasePrice ? `${lastPurchaseRate.purchasePrice.toLocaleString()} AFN` : tr('Not available', 'در دسترس نیست')}</p>{lastPurchaseRate?.supplierName ? <p className="mt-1 text-xs font-semibold text-slate-500">{lastPurchaseRate.supplierName}</p> : null}</div>
                    </div>
                  </div>
                </div>
              </div>) : (<div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-4">
                  <div className={`${insetGlass} p-4`}>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tr('Core Identity', 'هویت اصلی')}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div><label className={labelClass}>{tr('Medicine Name', 'نام دارو')}</label><input ref={nameRef} type="text" name="name" value={infoForm.name} onChange={handleInfoChange} className={inputClass}/></div>
                      <div><label className={labelClass}>{tr('Generic Name', 'نام جنریک')}</label><input ref={genericRef} type="text" name="genericName" value={infoForm.genericName} onChange={handleInfoChange} className={inputClass} placeholder={tr('Example: Paracetamol', 'مثال: Paracetamol')}/></div>
                      <div className="md:col-span-2"><label className={labelClass}>{tr('Manufacturer', 'تولیدکننده')}</label><input ref={manufacturerRef} type="text" name="manufacturer" value={infoForm.manufacturer} onChange={handleInfoChange} onBlur={(e) => applyCanonicalManufacturer(e.target.value)} list={manufacturerSuggestionsId} className={inputClass}/><datalist id={manufacturerSuggestionsId}>{manufacturerSuggestions.map((suggestion) => <option key={suggestion} value={suggestion}/>)}</datalist>{manufacturerHint ? <p className="mt-2 text-xs font-semibold text-brand-600">{manufacturerHint}</p> : null}</div>
                    </div>
                  </div>
                  <div className={`${insetGlass} p-4`}>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tr('Packaging & Stock Rules', 'بسته‌بندی و قواعد موجودی')}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div><label className={labelClass}>{tr('Medicine Type', 'نوع دارو')}</label><select ref={typeRef} name="type" value={infoForm.type} onChange={handleInfoChange} className={inputClass}>{MEDICINE_TYPES.map((type) => <option key={type} value={type}>{isEnglish ? type : getMedicineTypeLabel(type)}</option>)}</select></div>
                      <div><label className={labelClass}>{tr('Unit', 'واحد')}</label><select ref={unitRef} name="unit" value={infoForm.unit} onChange={handleInfoChange} className={inputClass}>{medicineUnitOptions.map((unit) => <option key={unit} value={unit}>{getMedicineUnitLabel(unit, isEnglish)}</option>)}</select></div>
                      <div><label className={labelClass}>{tr('Items per Pack', 'تعداد در بسته')}</label><input ref={itemsPerBoxRef} type="number" name="itemsPerBox" value={infoForm.itemsPerBox} onChange={handleNumberChange} className={inputClass}/></div>
                      <div><label className={labelClass}>{tr('Low Stock Threshold', 'حد هشدار کم‌موجودی')}</label><input ref={thresholdRef} type="number" name="lowStockThreshold" value={infoForm.lowStockThreshold} onChange={handleNumberChange} className={inputClass}/></div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className={`${insetGlass} p-4`}>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tr('Pricing Tiers', 'سطوح قیمت')}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[{ key: 'retail', ref: retailRef }, { key: 'wholesale', ref: wholesaleRef }, { key: 'bulk', ref: bulkRef }].map(({ key, ref }) => <div key={key} className={`rounded-[22px] border p-4 ${marginInfo.mode === key ? 'border-brand-200/90 bg-gradient-to-br from-brand-50 via-white to-cyan-50' : 'border-white/80 bg-white/82'}`}><label className={`${labelClass} ${marginInfo.mode === key ? 'text-brand-700' : ''}`}>{key === 'retail' ? tr('Retail', 'پرچون') : key === 'wholesale' ? tr('Wholesale', 'عمده') : tr('Carton', 'کارتنی')}</label><input ref={ref as React.RefObject<HTMLInputElement>} type="text" name={key} value={infoForm[key as 'retail' | 'wholesale' | 'bulk']} onChange={handleNumberChange} className={`${inputClass} text-center`}/></div>)}
                    </div>
                  </div>
                  <div className={`${insetGlass} p-4`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tr('Medicine Summary', 'خلاصه دارو')}</p><p className="mt-1 text-sm font-semibold text-slate-500">{tr('Keep this text clean and directly readable inside the inventory UI.', 'این متن باید تمیز و مستقیم قابل نمایش در رابط انبار باشد.')}</p></div>
                      {null}
                    </div>
                    {<p className="mt-3 text-xs font-semibold text-amber-700">{tr('AI description generation is unavailable in current settings.', 'تولید توضیح AI در تنظیمات فعلی در دسترس نیست.')}</p>}
                    {descriptionHint ? <p className="mt-3 text-xs font-semibold text-brand-600">{descriptionHint}</p> : null}
                    <textarea ref={descriptionRef} name="description" value={infoForm.description} onChange={handleInfoChange} rows={6} className="mt-4 min-h-[180px] w-full rounded-[24px] border border-white/82 bg-white/88 p-4 text-sm font-semibold leading-7 text-slate-700 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-300/35" placeholder={tr('Write or regenerate a clean medicine description here...', 'توضیح تمیز دارو را اینجا بنویسید یا با AI بازتولید کنید...')} data-testid="medicine-description-textarea"/>
                  </div>
                </div>
              </div>)}
          </div>
          <div className={`${panelGlass} p-4 md:p-5`}>
            <div className="flex flex-col gap-3 border-b border-white/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-700">{tr('Batch Operations', 'عملیات batch')}</p><p className="mt-1 text-sm font-semibold text-slate-500">{tr(`${medicine.batches.length} batch record(s), ${linkedBatchCount} linked to purchases.`, `${medicine.batches.length} رکورد batch، ${linkedBatchCount} مورد متصل به خرید.`)}</p></div>
              {!readOnly ? (<div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditingBatchId('new')} disabled={editingBatchId !== null || isEditingInfo} className={primaryButtonClass}>
                    {tr('Manual Batch', 'بچ دستی')}
                  </button>
                  <button type="button" onClick={() => onStartPurchaseReceipt?.({
                medicineId: medicine.id,
                medicineName: medicine.name,
                preferredSupplierId: medicine.preferredSupplierId
            })} disabled={isEditingInfo || !onStartPurchaseReceipt} className={secondaryButtonClass}>
                    <span className="inline-flex items-center gap-2">
                      <span>{tr('Purchase Receipt', 'دریافت خرید')}</span>
                      <NewFeatureBadge />
                    </span>
                  </button>
                </div>) : null}
            </div>
            <div className="mt-4 overflow-hidden rounded-[24px] border border-white/78 bg-white/68 backdrop-blur-xl">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-white/88 backdrop-blur-md"><tr>{[tr('Batch Number', 'شماره سری ساخت'), tr('Quantity', 'تعداد'), tr('Expiry Date', 'تاریخ انقضا'), tr('Location (Rack/Shelf)', 'موقعیت (قفسه/ردیف)'), tr('Supplier', 'تأمین‌کننده'), ...(canViewPurchasePrice ? [tr('Purchase Price (AFN)', 'قیمت خرید (AFN)')] : []), tr('Actions', 'عملیات')].map((header) => <th key={header} className="border-b border-white/80 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{header}</th>)}</tr></thead>
                  <tbody>
                    {editingBatchId === 'new' ? <EditBatchRow batch={{}} suppliers={suppliers} partners={partners} canViewPurchasePrice={canViewPurchasePrice} tr={tr} onSave={saveBatch} onCancel={() => setEditingBatchId(null)}/> : null}
                    {medicine.batches.map((batch) => editingBatchId === batch.id ? <EditBatchRow key={batch.id} batch={batch} suppliers={suppliers} partners={partners} canViewPurchasePrice={canViewPurchasePrice} tr={tr} onSave={saveBatch} onCancel={() => setEditingBatchId(null)}/> : <BatchRow key={batch.id} batch={batch} supplierName={suppliers.find((supplier) => supplier.id === batch.supplierId)?.name} partnerName={batch.ownerPartnerId ? partnerById.get(batch.ownerPartnerId)?.name : undefined} hasPurchaseLink={!!batch.purchaseId} readOnly={readOnly} canViewPurchasePrice={canViewPurchasePrice} settings={settings} tr={tr} onEdit={() => setEditingBatchId(batch.id)} onHistory={() => setViewingHistoryBatch(batch)} onDelete={() => onDeleteBatch && onDeleteBatch(medicine.id, batch.id)}/>)}
                    {!medicine.batches.length && editingBatchId !== 'new' ? <tr><td colSpan={canViewPurchasePrice ? 7 : 6} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">{tr('No batch records have been added for this medicine yet.', 'برای این دارو هنوز رکورد batch ثبت نشده است.')}</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {!readOnly && onDeleteMedicine ? <div className="relative overflow-hidden rounded-[28px] border border-rose-200/90 bg-gradient-to-br from-rose-50/92 via-white to-rose-100/72 p-4 shadow-[0_18px_40px_-28px_rgba(244,63,94,0.42)]"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-700">{tr('Danger Zone', 'ناحیه خطر')}</p><p className="mt-2 text-sm font-semibold leading-7 text-rose-700/90">{tr('Deleting this medicine removes its product record from the system. This action is permanent.', 'با حذف این دارو، رکورد محصول از سیستم حذف می‌شود. این عمل دائمی است.')}</p></div><button type="button" onClick={deleteMedicine} className="rounded-full border border-rose-400/70 bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-3 text-sm font-black text-white">{tr('Delete medicine from system', 'حذف کامل دارو از سیستم')}</button></div></div> : null}
        </div>
      </Modal>
      {viewingHistoryBatch ? <BatchHistoryModal batch={viewingHistoryBatch} onClose={() => setViewingHistoryBatch(null)} language={settings?.language || 'dari'} settings={settings}/> : null}
      {pendingSyncSave ? (<Modal isOpen={true} onClose={() => setPendingSyncSave(null)} title={tr('Apply linked changes?', 'این تغییرات هماهنگ شود؟')} maxWidthClassName="max-w-xl" overlayClassName="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" panelClassName="overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_28px_70px_-32px_rgba(15,23,42,0.7)]" headerClassName="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4" bodyClassName="p-5" lockScroll={false}>
          <div dir={isEnglish ? 'ltr' : 'rtl'} className={isEnglish ? 'text-left' : 'text-right'} data-testid="inventory-linked-sync-prompt">
            <p className="text-sm font-semibold leading-7 text-slate-600">
              {linkedSyncPromptText}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
              {pendingHasPurchaseLink ? <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-brand-700">{tr('Purchase link detected', 'اتصال خرید پیدا شد')}</span> : null}
              {pendingHasPartnershipLink ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">{tr('Partnership link detected', 'اتصال شراکت پیدا شد')}</span> : null}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {pendingHasBothLinks ? (<button type="button" onClick={() => confirmPendingSyncSave({ purchases: true, partnerships: true })} className="rounded-2xl border border-brand-200 bg-brand-600 px-4 py-3 text-sm font-black text-white shadow-sm" data-testid="sync-choice-both">
                  {tr('Apply to both', 'در هر دو اعمال شود')}
                </button>) : null}
              {pendingHasPurchaseLink ? (<button type="button" onClick={() => confirmPendingSyncSave({ purchases: true, partnerships: false })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm" data-testid="sync-choice-purchases">
                  {pendingHasBothLinks ? tr('Only purchases', 'فقط خرید و تدارکات') : tr('Apply to purchases', 'در خرید و تدارکات اعمال شود')}
                </button>) : null}
              {pendingHasPartnershipLink ? (<button type="button" onClick={() => confirmPendingSyncSave({ purchases: false, partnerships: true })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm" data-testid="sync-choice-partnerships">
                  {pendingHasBothLinks ? tr('Only partnerships', 'فقط شراکت') : tr('Apply to partnerships', 'در شراکت اعمال شود')}
                </button>) : null}
              <button type="button" onClick={() => confirmPendingSyncSave({ purchases: false, partnerships: false })} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 shadow-sm" data-testid="sync-choice-inventory-only">
                {tr('Inventory only', 'فقط انبار')}
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setPendingSyncSave(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">
                {tr('Cancel', 'انصراف')}
              </button>
            </div>
          </div>
        </Modal>) : null}
    </>);
};
