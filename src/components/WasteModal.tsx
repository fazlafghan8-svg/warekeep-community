import React, { useEffect, useMemo, useState } from 'react';
import { AppSettings, Medicine, Purchase, Supplier, VendorCreditResolution } from '../types';
import { Modal } from './ui/Modal';
import { NewFeatureBadge } from './ui/NewFeatureBadge';
import { normalizePersianNumbers } from '../utils/localization';
import { formatMedicineExpiryDate } from '../lib/formatters';
export interface WasteConfirmPayload {
    batchId: string;
    quantity: number;
    reason: string;
    description: string;
    addToExpenses: boolean;
    amount?: number;
    resolution?: VendorCreditResolution;
    supplierId?: string;
}
interface WasteModalProps {
    isOpen: boolean;
    onClose: () => void;
    medicine: Medicine;
    suppliers?: Supplier[];
    purchases?: Purchase[];
    onGoToSuppliers?: () => void;
    onStartPurchaseReceipt?: (context: {
        medicineId: string;
        medicineName: string;
        preferredSupplierId?: string;
    }) => void;
    onConfirm: (payload: WasteConfirmPayload) => boolean | void | Promise<boolean | void>;
    settings: AppSettings;
}
const parseMoneyInput = (value: string): number => {
    const normalized = normalizePersianNumbers(value || '').replace(/,/g, '').trim();
    if (!normalized)
        return 0;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};
const isActivePurchase = (purchase: Purchase) => !purchase.isDeleted && (purchase.workflowStatus || purchase.status) !== 'cancelled';
export const WasteModal: React.FC<WasteModalProps> = ({ isOpen, onClose, medicine, suppliers = [], purchases = [], onGoToSuppliers, onStartPurchaseReceipt, onConfirm, settings, }) => {
    const [batchId, setBatchId] = useState<string>('');
    const [quantity, setQuantity] = useState<string>('');
    const [reason, setReason] = useState('internal_use');
    const [description, setDescription] = useState('');
    const [addToExpenses, setAddToExpenses] = useState(false);
    const [returnResolution, setReturnResolution] = useState<VendorCreditResolution>('vendor_credit');
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [returnAmount, setReturnAmount] = useState('');
    const [isReturnAmountTouched, setIsReturnAmountTouched] = useState(false);
    const isEnglish = (settings.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const availableBatches = medicine.batches.filter((batch) => batch.quantity > 0);
    const selectedBatch = medicine.batches.find((batch) => batch.id === batchId);
    const activePurchases = useMemo(() => purchases.filter((purchase) => isActivePurchase(purchase)), [purchases]);
    const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
    const sourcePurchase = useMemo(() => {
        if (!selectedBatch?.purchaseId)
            return null;
        return activePurchases.find((purchase) => purchase.id === selectedBatch.purchaseId) || null;
    }, [activePurchases, selectedBatch?.purchaseId]);
    const sourceSupplierId = selectedBatch?.supplierId || sourcePurchase?.supplierId || '';
    const sourceSupplier = sourceSupplierId ? supplierById.get(sourceSupplierId) || null : null;
    const sourcePurchaseIsStale = Boolean(selectedBatch?.purchaseId && !sourcePurchase);
    const enteredQuantity = parseInt(quantity, 10) || 0;
    const costEstimate = selectedBatch ? selectedBatch.purchasePrice * enteredQuantity : 0;
    const suggestedReturnAmount = selectedBatch ? selectedBatch.purchasePrice * enteredQuantity : 0;
    useEffect(() => {
        if (!selectedBatch) {
            setSelectedSupplierId('');
            setReturnAmount('');
            setIsReturnAmountTouched(false);
            return;
        }
        setSelectedSupplierId(sourceSupplierId);
        setReturnAmount(suggestedReturnAmount > 0 ? String(suggestedReturnAmount) : '');
        setIsReturnAmountTouched(false);
    }, [selectedBatch, sourceSupplierId, suggestedReturnAmount]);
    useEffect(() => {
        if (reason !== 'return_vendor' || isReturnAmountTouched)
            return;
        setReturnAmount(suggestedReturnAmount > 0 ? String(suggestedReturnAmount) : '');
    }, [isReturnAmountTouched, reason, suggestedReturnAmount]);
    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = normalizePersianNumbers(e.target.value);
        if (value === '' || /^\d+$/.test(value)) {
            setQuantity(value);
        }
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const qty = parseInt(quantity, 10);
        if (!batchId)
            return alert(tr('Please select a batch.', 'لطفاً یک سری ساخت (Batch) انتخاب کنید.'));
        if (isNaN(qty) || qty <= 0)
            return alert(tr('Invalid quantity.', 'تعداد نامعتبر است.'));
        if (selectedBatch && qty > selectedBatch.quantity) {
            return alert(tr(`Entered quantity is more than stock (stock: ${selectedBatch.quantity}).`, `تعداد وارد شده بیشتر از موجودی است (موجودی: ${selectedBatch.quantity}).`));
        }
        if (reason === 'return_vendor' && !description.trim()) {
            return alert(tr('Return note is required for supplier return.', 'برای مرجوعی به شرکت، یادداشت دلیل الزامی است.'));
        }
        const resolvedAmount = reason === 'return_vendor' ? parseMoneyInput(returnAmount) : undefined;
        if (reason === 'return_vendor' && !selectedSupplierId) {
            return alert(tr('Please select a supplier.', 'لطفاً تأمین‌کننده را انتخاب کنید.'));
        }
        if (reason === 'return_vendor' && (!resolvedAmount || resolvedAmount <= 0)) {
            return alert(tr('Return amount must be greater than zero.', 'مبلغ مرجوعی باید بیشتر از صفر باشد.'));
        }
        const confirmed = await Promise.resolve(onConfirm({
            batchId,
            quantity: qty,
            reason,
            description,
            addToExpenses,
            amount: reason === 'return_vendor' ? resolvedAmount : undefined,
            resolution: reason === 'return_vendor' ? returnResolution : undefined,
            supplierId: reason === 'return_vendor' ? selectedSupplierId : selectedBatch?.supplierId,
        }));
        if (confirmed === false)
            return;
        onClose();
        if (addToExpenses && reason === 'internal_use') {
            setTimeout(() => {
                alert(tr('Expense was recorded successfully.', 'هزینه با موفقیت ثبت شد.'));
            }, 200);
        }
    };
    return (<Modal isOpen={isOpen} onClose={onClose} title={tr('Waste / Usage Log (Stock Out)', 'ثبت ضایعات / مصرف (خروج کالا)')}>
      <form onSubmit={handleSubmit} className="space-y-5" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800">
          <span className="font-bold">{tr('Warning', 'هشدار')}:</span> {tr('Item stock will be reduced.', 'موجودی کالا در انبار کاهش می‌یابد.')}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{tr('Select Batch', 'انتخاب سری ساخت (Batch)')}</label>
          <select value={batchId} onChange={(event) => setBatchId(event.target.value)} className="w-full rounded-lg border bg-white p-2" required>
            <option value="">{tr('Select...', 'انتخاب کنید...')}</option>
            {availableBatches.map((batch) => (<option key={batch.id} value={batch.id}>
                {batch.batchNumber} - ({tr('Stock', 'موجودی')}: {batch.quantity}) - {tr('Expiry', 'انقضا')}: {formatMedicineExpiryDate(batch.expiryDate, settings)}
              </option>))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{tr('Quantity', 'تعداد')}</label>
            <input type="text" inputMode="numeric" value={quantity} onChange={handleQuantityChange} className="w-full rounded-lg border p-2 text-center font-bold" placeholder="0" required/>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{tr('Reason', 'علت خروج')}</label>
            <select value={reason} onChange={(event) => {
            const nextReason = event.target.value;
            setReason(nextReason);
            if (nextReason !== 'internal_use') {
                setAddToExpenses(false);
            }
            if (nextReason === 'return_vendor') {
                setIsReturnAmountTouched(false);
            }
        }} className="w-full rounded-lg border bg-white p-2">
              <option value="internal_use">{tr('Internal / Personal use', 'مصرف داخلی / شخصی')}</option>
              <option value="expired">{tr('Expired (Disposal)', 'تاریخ گذشته (امحا)')}</option>
              <option value="damaged">{tr('Broken / Damaged', 'شکسته / خراب شده')}</option>
              <option value="lost">{tr('Lost / Inventory shortage', 'مفقودی / کسری انبار')}</option>
              <option value="return_vendor">{tr('Return to Supplier', 'مرجوع به شرکت')}</option>
            </select>
          </div>
        </div>

        {reason === 'return_vendor' && selectedBatch ? (<div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/80 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-bold text-sky-900">
                {tr('Supplier Return Guidance', 'راهنمایی مرجوع به شرکت')}
              </label>
              <NewFeatureBadge />
            </div>

            <div className="grid gap-3 text-sm text-sky-900 md:grid-cols-2">
              <div className="rounded-lg border border-sky-200 bg-white/80 p-3">
                <p className="font-bold">{tr('Source Batch', 'بچ اصلی')}</p>
                <p className="mt-1">{selectedBatch.batchNumber || '-'}</p>
              </div>
              <div className="rounded-lg border border-sky-200 bg-white/80 p-3">
                <p className="font-bold">{tr('Source Purchase', 'فاکتور منبع')}</p>
                <p className="mt-1">{sourcePurchase?.invoiceNumber || selectedBatch.purchaseId || tr('No linked source', 'منبع لینک‌شده ندارد')}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{tr('Supplier', 'تأمین‌کننده')}</label>
                <select value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)} className="w-full rounded-lg border bg-white p-2">
                  <option value="">{tr('Select supplier...', 'تأمین‌کننده را انتخاب کنید...')}</option>
                  {suppliers.filter((supplier) => !supplier.isDeleted).map((supplier) => (<option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{tr('Resolution', 'نوع تسویه')}</label>
                <select value={returnResolution} onChange={(event) => setReturnResolution(event.target.value as VendorCreditResolution)} className="w-full rounded-lg border bg-white p-2">
                  <option value="vendor_credit">{tr('Vendor credit', 'اعتبار مرجوعی')}</option>
                  <option value="refund">{tr('Refund', 'استرداد پول')}</option>
                  <option value="replacement">{tr('Replacement', 'جایگزینی')}</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <span className="font-bold">{tr('Financial posting', 'ثبت مالی')}:</span>{' '}
              {tr('This return will always create a new purchase reference document. The original invoice remains only as a source link for traceability.', 'این مرجوعی همیشه روی یک سند مرجع خرید جدید ثبت می‌شود و فاکتور اصلی فقط به‌عنوان منبع رهگیری باقی می‌ماند.')}
            </div>

            {sourcePurchase ? (<div className="rounded-lg border border-sky-200 bg-white/80 p-3 text-sm text-slate-700">
                <p className="font-bold text-slate-900">{tr('Linked source summary', 'خلاصه منبع لینک‌شده')}</p>
                <p className="mt-1">
                  {tr('Supplier', 'تأمین‌کننده')}: {sourceSupplier?.name || sourceSupplierId || '-'}
                </p>
                <p className="mt-1">
                  {tr('Invoice', 'فاکتور')}: {sourcePurchase.invoiceNumber || sourcePurchase.id.slice(-6)}
                </p>
              </div>) : null}

            {sourcePurchaseIsStale ? (<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {tr('The previous purchase link for this batch is stale. Save will continue by creating a fresh return reference document.', 'لینک خرید قبلی این بچ معتبر نیست. هنگام ثبت، سیستم یک سند مرجع مرجوعی تازه می‌سازد.')}
              </div>) : null}

            {selectedSupplierId && sourceSupplierId && selectedSupplierId !== sourceSupplierId ? (<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {tr('A different supplier is selected. The new return reference will be created under the selected supplier, while the old link remains only as history.', 'تأمین‌کننده متفاوتی انتخاب شده است. سند مرجع جدید زیر همین تأمین‌کننده ساخته می‌شود و لینک قبلی فقط برای تاریخچه باقی می‌ماند.')}
              </div>) : null}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => {
                onClose();
                onGoToSuppliers?.();
            }} disabled={!onGoToSuppliers} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                {tr('Add supplier', 'افزودن تأمین‌کننده')}
              </button>
              <button type="button" onClick={() => {
                onClose();
                onStartPurchaseReceipt?.({
                    medicineId: medicine.id,
                    medicineName: medicine.name,
                    preferredSupplierId: selectedSupplierId || undefined,
                });
            }} disabled={!onStartPurchaseReceipt || !selectedSupplierId} className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {tr('Open Purchases > New', 'باز کردن خریدها > جدید')}
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{tr('Return amount', 'مبلغ مرجوعی')}</label>
              <input type="text" inputMode="decimal" value={returnAmount} onChange={(event) => {
                const nextValue = normalizePersianNumbers(event.target.value);
                if (nextValue === '' || /^\d*([.,]\d{0,2})?$/.test(nextValue)) {
                    setReturnAmount(nextValue);
                    setIsReturnAmountTouched(true);
                }
            }} className="w-full rounded-lg border bg-white p-2 text-center font-bold" placeholder={suggestedReturnAmount > 0 ? String(suggestedReturnAmount) : '0'}/>
              <p className="mt-1 text-xs font-semibold text-sky-700">
                {tr('Suggested from purchase price and quantity', 'پیشنهاده‌شده از قیمت خرید و تعداد')}: {suggestedReturnAmount.toLocaleString()}
              </p>
            </div>
          </div>) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{tr('Notes', 'توضیحات تکمیلی')}</label>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="h-20 w-full resize-none rounded-lg border p-2" placeholder={reason === 'return_vendor'
            ? tr('Reason, supplier note, refund/credit context...', 'علت مرجوعی، یادداشت شرکت، وضعیت refund/credit...')
            : tr('Example: used in injection section...', 'مثال: استفاده در بخش تزریقات...')}/>
        </div>

        {reason === 'internal_use' && selectedBatch ? (<div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <input type="checkbox" id="addToExpenses" checked={addToExpenses} onChange={(event) => setAddToExpenses(event.target.checked)} className="mt-1 h-5 w-5 rounded text-blue-600"/>
            <div>
              <label htmlFor="addToExpenses" className="block cursor-pointer text-sm font-bold text-blue-800">
                {tr('Record as store expense', 'ثبت به عنوان هزینه فروشگاه (Expense)')}
              </label>
              <p className="mt-1 text-xs text-blue-600">
                {tr('Amount', 'مبلغ')} <span className="font-bold">{costEstimate.toLocaleString()} AFN</span> {tr('(based on purchase price) will be added to running expenses.', '(بر اساس قیمت خرید) به لیست هزینه‌های جاری اضافه می‌شود.')}
              </p>
            </div>
          </div>) : null}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">{tr('Cancel', 'انصراف')}</button>
          <button type="submit" className="rounded-lg bg-red-600 px-6 py-2 font-bold text-white shadow-md hover:bg-red-700">{tr('Confirm', 'ثبت نهایی')}</button>
        </div>
      </form>
    </Modal>);
};
