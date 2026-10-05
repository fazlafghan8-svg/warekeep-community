import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../types';
import { GeneralSettings } from '../settings/GeneralSettings';
import { DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS, readMedicineEntryAutomationLearningState } from '../../utils/medicineEntryAutomation';
import { DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS, readMedicineProcurementAssistLearningState } from '../../utils/medicineProcurementAssist';
const translations = {
    storeName: 'Store Name',
    phoneNumber: 'Phone',
    language: 'Language',
    retail: 'Retail',
    wholesale: 'Wholesale',
    bulk: 'Bulk',
    currencySettings: 'Currency',
    tax: 'Tax',
    invoiceNumbering: 'Invoice Numbering',
    autoIncrement: 'Auto',
    manualEntry: 'Manual',
    nextInvoiceNumber: 'Next Number'
};
const baseSettings: AppSettings = {
    storeName: 'Test Store',
    storePhone: '0700000000',
    storeAddress: '',
    taxRate: 0,
    language: 'english',
    aiLanguage: 'en',
    defaultSalesMode: 'retail',
    medicineAiDefaultInput: 'upload',
    medicineEntryAutomation: {
        ...DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS,
        enabled: true
    },
    medicineProcurementAssist: {
        ...DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS,
        enabled: true
    }
};
const Harness: React.FC = () => {
    const [formData, setFormData] = React.useState<AppSettings>(baseSettings);
    return (<GeneralSettings formData={formData} t={translations} isGuest={false} cloudStatus="connected" lastServerTime={null} isSyncingManually={false} apiKeyWarning="" onChange={(e) => {
            const { name, value } = e.target;
            setFormData((prev) => ({ ...prev, [name]: value }));
        }} onCheckboxChange={(e) => {
            const { name, checked } = e.target;
            setFormData((prev) => ({ ...prev, [name]: checked }));
        }} onManualSync={async () => { }} onSelectFolder={async () => { }} onUpdateForm={(updater) => setFormData((prev) => updater(prev))} cloudSyncLocked={false} canToggleTeamMode={true} teamModeHint=""/>);
};
describe('GeneralSettings medicine entry automation controls', () => {
    it('updates inventory linked sync behavior and targets', () => {
        render(<Harness />);
        const modeSelect = screen.getByTestId('general-settings-inventory-sync-mode');
        expect(modeSelect).toHaveValue('ask');
        fireEvent.change(modeSelect, { target: { value: 'always' } });
        expect(modeSelect).toHaveValue('always');
        const purchasesToggle = screen.getByRole('checkbox', { name: /Purchases & procurement/i });
        const partnershipsToggle = screen.getByRole('checkbox', { name: /Partnership accounting/i });
        expect(purchasesToggle).toBeChecked();
        expect(partnershipsToggle).toBeChecked();
        fireEvent.click(purchasesToggle);
        expect(purchasesToggle).not.toBeChecked();
        expect(partnershipsToggle).toBeChecked();
        fireEvent.change(modeSelect, { target: { value: 'never' } });
        expect(modeSelect).toHaveValue('never');
        expect(purchasesToggle).toBeDisabled();
        expect(partnershipsToggle).toBeDisabled();
    });
    it('shows a compact summary, reveals advanced controls on demand, and clears learned local behavior', () => {
        window.localStorage.setItem('warekeep:medicine-entry-automation-learning', JSON.stringify({ manualScrollCount: 5, learnedAutoScroll: true }));
        window.localStorage.setItem('warekeep:medicine-procurement-assist-learning', JSON.stringify({ manualEnableCount: 3, learnedDefaultEnabled: true }));
        expect(readMedicineEntryAutomationLearningState(5)).toMatchObject({
            manualScrollCount: 5,
            learnedAutoScroll: true
        });
        expect(readMedicineProcurementAssistLearningState(3)).toMatchObject({
            manualEnableCount: 3,
            learnedDefaultEnabled: true
        });
        render(<Harness />);
        expect(screen.getByTestId('general-settings-medicine-entry-learned-badge')).toHaveTextContent('Learned on this device');
        expect(screen.getByTestId('general-settings-procurement-assist-learned-badge')).toHaveTextContent('Learned on this device');
        expect(screen.getByTestId('general-settings-medicine-entry-advanced-panel')).toHaveAttribute('data-open', 'false');
        const manualAutoScrollToggle = screen.getByRole('checkbox', { name: /Manual auto-scroll/i });
        expect(screen.queryByRole('checkbox', { name: /Scroll after AI fill/i })).not.toBeInTheDocument();
        const advancedTrigger = screen.getByRole('button', { name: /Advanced flow options/i });
        expect(manualAutoScrollToggle).toBeChecked();
        expect(advancedTrigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('checkbox', { name: /Learn from repeated scrolling/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: /Manual scroll trigger/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Reset learned behavior/i })).not.toBeInTheDocument();
        fireEvent.click(advancedTrigger);
        const adaptiveLearningToggle = screen.getByRole('checkbox', { name: /Learn from repeated scrolling/i });
        const triggerSelect = screen.getByRole('combobox', { name: /Manual scroll trigger/i });
        const learningNote = screen.getByTestId('general-settings-medicine-entry-learning-note');
        expect(advancedTrigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('general-settings-medicine-entry-advanced-panel')).toHaveAttribute('data-open', 'true');
        expect(adaptiveLearningToggle).toBeChecked();
        expect(triggerSelect).toHaveValue('typing');
        expect(learningNote).toHaveTextContent('Active');
        fireEvent.click(manualAutoScrollToggle);
        fireEvent.click(adaptiveLearningToggle);
        fireEvent.change(triggerSelect, { target: { value: 'blur' } });
        expect(manualAutoScrollToggle).not.toBeChecked();
        expect(adaptiveLearningToggle).not.toBeChecked();
        expect(triggerSelect).toHaveValue('blur');
        fireEvent.click(screen.getByRole('button', { name: /Reset learned behavior/i }));
        expect(readMedicineEntryAutomationLearningState(5)).toMatchObject({
            manualScrollCount: 0,
            learnedAutoScroll: false
        });
        expect(learningNote).toHaveTextContent('Not learned yet');
        expect(screen.queryByTestId('general-settings-medicine-entry-learned-badge')).not.toBeInTheDocument();
        const procurementEnableToggle = screen.getByRole('checkbox', { name: /Enable learned draft default/i });
        const procurementAdvancedTrigger = screen.getByRole('button', { name: /Procurement assist options/i });
        expect(procurementEnableToggle).toBeChecked();
        expect(procurementAdvancedTrigger).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(procurementEnableToggle);
        expect(procurementEnableToggle).not.toBeChecked();
        fireEvent.click(procurementAdvancedTrigger);
        const procurementAdaptiveToggle = screen.getByRole('checkbox', { name: /Learn from repeated procurement toggles/i });
        const procurementLearningNote = screen.getByTestId('general-settings-procurement-assist-learning-note');
        expect(procurementAdaptiveToggle).toBeChecked();
        expect(procurementLearningNote).toHaveTextContent('Active');
        fireEvent.click(procurementAdaptiveToggle);
        expect(procurementAdaptiveToggle).not.toBeChecked();
        fireEvent.click(screen.getByTestId('general-settings-reset-procurement-assist-learning'));
        expect(readMedicineProcurementAssistLearningState(3)).toMatchObject({
            manualEnableCount: 0,
            learnedDefaultEnabled: false
        });
        expect(procurementLearningNote).toHaveTextContent('Not learned yet');
    });
});

describe('Community settings isolation', () => {
 it('does not expose cloud or AI controls even when inherited settings mention them', () => {
  render(<Harness />);
  expect(screen.queryByRole('checkbox', { name: /Scroll after AI fill/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Manual sync|Sync now|Cloud sync/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/API key|AI language/i)).not.toBeInTheDocument();
  expect(screen.getByTestId('general-settings-inventory-sync-mode')).toBeInTheDocument();
 });
});
