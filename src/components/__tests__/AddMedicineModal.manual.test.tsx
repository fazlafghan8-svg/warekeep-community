import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddMedicineModal } from '../AddMedicineModal';
import type { AppSettings, Medicine, Purchase, Supplier } from '../../types';
import { readMedicineEntryAutomationLearningState } from '../../utils/medicineEntryAutomation';
import { readMedicineProcurementAssistLearningState } from '../../utils/medicineProcurementAssist';
const baseSettings: AppSettings = {
    storeName: '',
    storePhone: '',
    storeAddress: '',
    taxRate: 0,
    language: 'english',
    aiLanguage: 'en',
    defaultSalesMode: 'retail',
    medicineAiDefaultInput: 'text'
};
const renderModal = (overrides?: Partial<React.ComponentProps<typeof AddMedicineModal>>) => {
    const onAddMedicine = overrides?.onAddMedicine ?? vi.fn();
    const onAddMedicineWithProcurementDraft = overrides?.onAddMedicineWithProcurementDraft ?? vi.fn();
    const onClose = overrides?.onClose ?? vi.fn();
    const view = render(<AddMedicineModal isOpen={true} onClose={onClose} onAddMedicine={onAddMedicine} onAddMedicineWithProcurementDraft={onAddMedicineWithProcurementDraft} medicines={[]} suppliers={[]} settings={baseSettings} {...overrides}/>);
    return {
        onAddMedicine,
        onAddMedicineWithProcurementDraft,
        onClose,
        ...view
    };
};
const getFieldFromLabel = (label: string) => {
    const labelNode = Array.from(document.querySelectorAll('label')).find((node) => node.textContent?.includes(label));
    if (!labelNode?.parentElement) {
        throw new Error(`No field wrapper found for ${label}`);
    }
    const field = labelNode.parentElement.querySelector('input, textarea, select');
    if (!field) {
        throw new Error(`No field found for ${label}`);
    }
    return field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
};
const scrollIntoViewMock = vi.fn();
const scrollToMock = vi.fn();
describe("Community manual medicine entry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        scrollToMock.mockClear();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoViewMock
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            value: scrollToMock
        });
    });
    it('shows a supplier empty-state helper and routes to suppliers when requested', () => {
        const onGoToSuppliers = vi.fn();
        const { onClose } = renderModal({ onGoToSuppliers });
        expect(screen.getByTestId('add-medicine-supplier-empty-state')).toHaveTextContent('No suppliers are registered for this workspace yet.');
        fireEvent.click(screen.getByTestId('add-medicine-open-suppliers'));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onGoToSuppliers).toHaveBeenCalledTimes(1);
    });
    it('keeps the supplier selector active when suppliers exist', () => {
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        renderModal({ suppliers });
        expect(screen.queryByTestId('add-medicine-supplier-empty-state')).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Acme Pharma' })).toBeInTheDocument();
    });
    it('NEW - keeps preferred supplier optional while saving the first batch as manual', async () => {
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        const { onAddMedicine } = renderModal({ suppliers });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol' }
        });
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        fireEvent.change(getFieldFromLabel('Retail'), {
            target: { value: '180' }
        });
        fireEvent.change(getFieldFromLabel('Quantity'), {
            target: { value: '12' }
        });
        fireEvent.change(getFieldFromLabel('Batch Number'), {
            target: { value: 'B-100' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Final Save' }));
        await waitFor(() => expect(onAddMedicine).toHaveBeenCalledTimes(1));
        const createdMedicine = (onAddMedicine as ReturnType<typeof vi.fn>).mock.calls[0][0] as Omit<Medicine, 'id'>;
        expect(createdMedicine.preferredSupplierId).toBeUndefined();
        expect(createdMedicine.batches[0]).toEqual(expect.objectContaining({
            batchNumber: 'B-100',
            quantity: 12,
            traceSource: 'manual',
            availabilityStatus: 'available'
        }));
        expect(createdMedicine.batches[0].supplierId).toBeUndefined();
    });
    it('calculates margin from the default wholesale price when wholesale is primary', async () => {
        renderModal({
            settings: {
                ...baseSettings,
                defaultSalesMode: 'wholesale',
            }
        });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol' }
        });
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        fireEvent.change(getFieldFromLabel('Purchase (AFN)'), {
            target: { value: '50' }
        });
        fireEvent.change(getFieldFromLabel('Wholesale'), {
            target: { value: '80' }
        });
        fireEvent.change(getFieldFromLabel('Retail'), {
            target: { value: '100' }
        });
        await waitFor(() => {
            expect(screen.getByText(/Margin: 37\.5% .*Wholesale price/i)).toBeInTheDocument();
        });
    });
    it('routes the item into the supplier draft when procurement assist is enabled', async () => {
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        const openDraft = {
            id: 'pur-open-1',
            supplierId: 'sup-1',
            invoiceNumber: 'OPEN-ACME',
            date: '2026-04-01',
            items: [],
            totalAmount: 0,
            paidAmount: 0,
            remainingAmount: 0,
            paymentMethod: 'credit',
            paymentStatus: 'unpaid',
            workflowStatus: 'draft',
            status: 'draft',
            payments: [],
            receipts: [],
            vendorCredits: [],
            inventoryCommitted: false,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z',
        } as Purchase;
        const { onAddMedicine, onAddMedicineWithProcurementDraft } = renderModal({ suppliers, purchases: [openDraft] });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol' }
        });
        fireEvent.change(getFieldFromLabel('Preferred Supplier'), {
            target: { value: 'sup-1' }
        });
        fireEvent.click(screen.getByTestId('add-medicine-procurement-assist-toggle'));
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        fireEvent.change(getFieldFromLabel('Purchase (AFN)'), {
            target: { value: '90' }
        });
        fireEvent.change(getFieldFromLabel('Retail'), {
            target: { value: '120' }
        });
        fireEvent.change(getFieldFromLabel('Quantity'), {
            target: { value: '8' }
        });
        fireEvent.change(getFieldFromLabel('Batch Number'), {
            target: { value: 'SUP-100' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Final Save' }));
        await waitFor(() => expect(onAddMedicineWithProcurementDraft).toHaveBeenCalledTimes(1));
        expect(onAddMedicine).not.toHaveBeenCalled();
        const payload = (onAddMedicineWithProcurementDraft as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(payload.supplierId).toBe('sup-1');
        expect(payload.targetPurchaseMode).toBe('open_supplier_draft');
        expect(payload.targetPurchaseId).toBe('pur-open-1');
        expect(payload.medicine.preferredSupplierId).toBe('sup-1');
        expect(payload.medicine.batches).toEqual([]);
        expect(payload.purchaseLineDraft).toEqual(expect.objectContaining({
            batchNumber: 'SUP-100',
            quantity: 8,
            purchasePrice: 90,
        }));
        expect(payload.quickReceipt).toEqual(expect.objectContaining({
            mode: 'all',
            quantity: 8,
        }));
    });
    it('can send the item to a new named supplier invoice with a partial quick receipt', async () => {
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        const { onAddMedicineWithProcurementDraft } = renderModal({ suppliers });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol' }
        });
        fireEvent.change(getFieldFromLabel('Preferred Supplier'), {
            target: { value: 'sup-1' }
        });
        fireEvent.click(screen.getByTestId('add-medicine-procurement-assist-toggle'));
        fireEvent.click(screen.getByRole('radio', { name: /Create new named invoice/i }));
        fireEvent.change(screen.getByPlaceholderText('Optional invoice name / number'), {
            target: { value: 'ACME-FAST-1' }
        });
        fireEvent.click(screen.getByRole('radio', { name: /Partial arrived/i }));
        fireEvent.change(getFieldFromLabel('Received quantity'), {
            target: { value: '3' }
        });
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        fireEvent.change(getFieldFromLabel('Purchase (AFN)'), {
            target: { value: '90' }
        });
        fireEvent.change(getFieldFromLabel('Retail'), {
            target: { value: '120' }
        });
        fireEvent.change(getFieldFromLabel('Quantity'), {
            target: { value: '8' }
        });
        fireEvent.change(getFieldFromLabel('Batch Number'), {
            target: { value: 'SUP-101' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Final Save' }));
        await waitFor(() => expect(onAddMedicineWithProcurementDraft).toHaveBeenCalledTimes(1));
        const payload = (onAddMedicineWithProcurementDraft as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(payload.targetPurchaseMode).toBe('new_invoice');
        expect(payload.targetPurchaseId).toBeUndefined();
        expect(payload.requestedInvoiceNumber).toBe('ACME-FAST-1');
        expect(payload.quickReceipt).toEqual(expect.objectContaining({
            mode: 'partial',
            quantity: 3,
        }));
        expect(payload.purchaseLineDraft).toEqual(expect.objectContaining({
            batchNumber: 'SUP-101',
            quantity: 8,
            purchasePrice: 90,
        }));
    });
    it('requires a valid buy price before creating a supplier draft', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        const { onAddMedicineWithProcurementDraft } = renderModal({ suppliers });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol' }
        });
        fireEvent.change(getFieldFromLabel('Preferred Supplier'), {
            target: { value: 'sup-1' }
        });
        fireEvent.click(screen.getByTestId('add-medicine-procurement-assist-toggle'));
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        fireEvent.change(getFieldFromLabel('Retail'), {
            target: { value: '120' }
        });
        fireEvent.change(getFieldFromLabel('Quantity'), {
            target: { value: '8' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Final Save' }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalled());
        expect(onAddMedicineWithProcurementDraft).not.toHaveBeenCalled();
    });
    it('keeps the modal open when supplier draft creation fails', async () => {
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        const onClose = vi.fn();
        const onAddMedicineWithProcurementDraft = vi.fn(async () => false);
        renderModal({ suppliers, onClose, onAddMedicineWithProcurementDraft });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol' }
        });
        fireEvent.change(getFieldFromLabel('Preferred Supplier'), {
            target: { value: 'sup-1' }
        });
        fireEvent.click(screen.getByTestId('add-medicine-procurement-assist-toggle'));
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        fireEvent.change(getFieldFromLabel('Purchase (AFN)'), {
            target: { value: '90' }
        });
        fireEvent.change(getFieldFromLabel('Retail'), {
            target: { value: '120' }
        });
        fireEvent.change(getFieldFromLabel('Quantity'), {
            target: { value: '8' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Final Save' }));
        await waitFor(() => expect(onAddMedicineWithProcurementDraft).toHaveBeenCalledTimes(1));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByTestId('add-medicine-form')).toBeInTheDocument();
    });
    it('keeps the learned procurement default overrideable for the current save', async () => {
        window.localStorage.setItem('warekeep:medicine-procurement-assist-learning', JSON.stringify({ manualEnableCount: 3, learnedDefaultEnabled: true }));
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        const { onAddMedicine, onAddMedicineWithProcurementDraft } = renderModal({ suppliers });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol' }
        });
        fireEvent.change(getFieldFromLabel('Preferred Supplier'), {
            target: { value: 'sup-1' }
        });
        const toggle = screen.getByTestId('add-medicine-procurement-assist-toggle') as HTMLInputElement;
        expect(toggle.checked).toBe(true);
        fireEvent.click(toggle);
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        fireEvent.change(getFieldFromLabel('Retail'), {
            target: { value: '180' }
        });
        fireEvent.change(getFieldFromLabel('Quantity'), {
            target: { value: '12' }
        });
        fireEvent.change(getFieldFromLabel('Batch Number'), {
            target: { value: 'B-100' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Final Save' }));
        await waitFor(() => expect(onAddMedicine).toHaveBeenCalledTimes(1));
        expect(onAddMedicineWithProcurementDraft).not.toHaveBeenCalled();
        const createdMedicine = (onAddMedicine as ReturnType<typeof vi.fn>).mock.calls[0][0] as Omit<Medicine, 'id'>;
        expect(createdMedicine.preferredSupplierId).toBe('sup-1');
        expect(createdMedicine.batches[0]).toEqual(expect.objectContaining({
            batchNumber: 'B-100',
            quantity: 12,
            traceSource: 'manual',
        }));
    });
    it('learns repeated procurement toggles and prechecks the option on the next mount', () => {
        const suppliers: Supplier[] = [{
                id: 'sup-1',
                name: 'Acme Pharma',
                phone: '0700000000',
                openingBalance: 0,
                balance: 0,
                status: 'active',
                transactions: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                createdBy: 'tester',
                updatedAt: '2026-04-01T00:00:00.000Z',
                updatedBy: 'tester',
                lastInteractionDate: '2026-04-01T00:00:00.000Z',
                auditTrail: []
            }];
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const view = renderModal({ suppliers });
            fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
                target: { value: `Panadol ${attempt}` }
            });
            fireEvent.change(getFieldFromLabel('Preferred Supplier'), {
                target: { value: 'sup-1' }
            });
            fireEvent.click(screen.getByTestId('add-medicine-procurement-assist-toggle'));
            view.unmount();
        }
        expect(readMedicineProcurementAssistLearningState(3)).toMatchObject({
            manualEnableCount: 3,
            learnedDefaultEnabled: true
        });
        renderModal({ suppliers });
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), {
            target: { value: 'Panadol learned' }
        });
        fireEvent.change(getFieldFromLabel('Preferred Supplier'), {
            target: { value: 'sup-1' }
        });
        expect((screen.getByTestId('add-medicine-procurement-assist-toggle') as HTMLInputElement).checked).toBe(true);
    });
    it('blocks moving to step 2 until the brand name is filled', async () => {
        renderModal();
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        expect(await screen.findByText('Brand name is required to continue.')).toBeInTheDocument();
        expect(screen.getByTestId('add-medicine-step-indicator')).toHaveTextContent('Step 1 of 2');
    });
    it('does not auto-scroll on brand-name focus when the trigger is typing', () => {
        renderModal({
            settings: {
                ...baseSettings,
                medicineEntryAutomation: {
                    enabled: true,
                    trigger: 'typing',
                    aiFillScroll: true,
                    adaptiveLearning: true,
                    adaptiveThreshold: 5
                }
            }
        });
        const brandInput = screen.getByPlaceholderText('e.g. Panadol');
        scrollToMock.mockClear();
        fireEvent.focus(brandInput);
        expect(scrollToMock).not.toHaveBeenCalled();
    });
    it('auto-scrolls after typing starts in brand name when manual auto-scroll is enabled', () => {
        renderModal({
            settings: {
                ...baseSettings,
                medicineEntryAutomation: {
                    enabled: true,
                    manualScrollUserConfigured: true,
                    trigger: 'typing',
                    aiFillScroll: true,
                    adaptiveLearning: true,
                    adaptiveThreshold: 5
                }
            }
        });
        scrollToMock.mockClear();
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), { target: { value: 'Panadol' } });
        expect(scrollToMock).toHaveBeenCalledTimes(1);
    });
    it('does not auto-scroll on typing when manual auto-scroll is disabled and not learned yet', () => {
        renderModal({
            settings: {
                ...baseSettings,
                medicineEntryAutomation: {
                    enabled: false,
                    trigger: 'typing',
                    aiFillScroll: true,
                    adaptiveLearning: true,
                    adaptiveThreshold: 5
                }
            }
        });
        scrollToMock.mockClear();
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), { target: { value: 'Panadol' } });
        expect(scrollToMock).not.toHaveBeenCalled();
    });
    it('does not auto-scroll by default after typing starts in brand name', () => {
        renderModal();
        scrollToMock.mockClear();
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), { target: { value: 'Panadol' } });
        expect(scrollToMock).not.toHaveBeenCalled();
    });
    it('learns repeated manual downward scrolling and restores auto-scroll on the next modal mount', () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const view = renderModal({
                settings: {
                    ...baseSettings,
                    medicineEntryAutomation: {
                        enabled: false,
                        trigger: 'typing',
                        aiFillScroll: true,
                        adaptiveLearning: true,
                        adaptiveThreshold: 5
                    }
                }
            });
            const form = screen.getByTestId('add-medicine-form');
            const scrollContainer = form.parentElement as HTMLElement;
            Object.defineProperty(scrollContainer, 'scrollTop', {
                configurable: true,
                value: 0,
                writable: true
            });
            scrollToMock.mockClear();
            fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), { target: { value: `Panadol ${attempt}` } });
            scrollContainer.scrollTop = 120;
            fireEvent.scroll(scrollContainer);
            view.unmount();
        }
        expect(readMedicineEntryAutomationLearningState(5)).toMatchObject({
            manualScrollCount: 5,
            learnedAutoScroll: true
        });
        renderModal({
            settings: {
                ...baseSettings,
                medicineEntryAutomation: {
                    enabled: false,
                    trigger: 'typing',
                    aiFillScroll: true,
                    adaptiveLearning: true,
                    adaptiveThreshold: 5
                }
            }
        });
        scrollToMock.mockClear();
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), { target: { value: 'Panadol learned' } });
        expect(scrollToMock).toHaveBeenCalledTimes(1);
    });
    it('uses Ctrl + Enter to move to step 2 when step one is valid', async () => {
        renderModal();
        fireEvent.change(screen.getByPlaceholderText('e.g. Panadol'), { target: { value: 'Panadol' } });
        fireEvent.keyDown(window, { key: 'Enter', code: 'Enter', ctrlKey: true });
        expect(await screen.findByTestId('add-medicine-step-indicator')).toHaveTextContent('Step 2 of 2');
    });
    it('keeps step one active when Ctrl + Enter hits the existing validation', async () => {
        renderModal();
        fireEvent.keyDown(window, { key: 'Enter', code: 'Enter', ctrlKey: true });
        expect(await screen.findByText('Brand name is required to continue.')).toBeInTheDocument();
        expect(screen.getByTestId('add-medicine-step-indicator')).toHaveTextContent('Step 1 of 2');
    });
    it('moves between steps while preserving the entered draft', async () => {
        renderModal();
        const brandInput = screen.getByPlaceholderText('e.g. Panadol');
        fireEvent.change(brandInput, { target: { value: 'Panadol' } });
        fireEvent.click(screen.getByTestId('add-medicine-next-step'));
        expect(await screen.findByTestId('add-medicine-step-indicator')).toHaveTextContent('Step 2 of 2');
        expect(screen.getByRole('button', { name: 'Previous Step' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save & New' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Final Save' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Previous Step' }));
        expect(await screen.findByTestId('add-medicine-step-indicator')).toHaveTextContent('Step 1 of 2');
        expect(screen.getByPlaceholderText('e.g. Panadol')).toHaveValue('Panadol');
        expect(screen.queryByRole('button', { name: 'Save & New' })).not.toBeInTheDocument();
    });
});
