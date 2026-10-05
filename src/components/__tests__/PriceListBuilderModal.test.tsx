import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceListBuilderModal } from '../PriceListBuilderModal';
import type { AppSettings, Medicine } from '../../types';
import type { PriceListRowInput } from '../../utils/priceListGenerator';

const settings: AppSettings = {
  storeName: 'Kabul Pharmacy',
  storePhone: '0700000000',
  storeAddress: 'Kabul',
  taxRate: 0,
  language: 'english',
  aiLanguage: 'en',
  invoiceDesign: {
    primaryColor: '#2563eb'
  },
  currencySettings: {
    baseCurrency: 'AFN',
    rates: { AFN: 1, USD: 70, EUR: 76, IRR: 0.0017, PKR: 0.25, INR: 0.84 }
  }
};

const makeMedicine = (overrides: Partial<Medicine> = {}): Medicine => ({
  id: 'med-1',
  name: 'Aspirin',
  genericName: 'Acetylsalicylic acid',
  manufacturer: 'Example Pharma',
  type: 'Tablet',
  unit: 'دانه' as Medicine['unit'],
  barcode: 'ABC-123',
  description: 'Pain relief',
  batches: [
    {
      id: 'batch-1',
      batchNumber: 'B-001',
      quantity: 10,
      expiryDate: '2027-01-01',
      purchasePrice: 20,
      history: []
    }
  ],
  salePrices: {
    retail: 50,
    wholesale: 45,
    bulk: 40
  },
  lowStockThreshold: 3,
  ...overrides
});

const rows: PriceListRowInput[] = [
  { medicine: makeMedicine(), canonicalManufacturer: 'Example Pharma', totalQuantity: 10, nextExpiry: '2027-01-01', averagePurchasePrice: 20, totalPurchaseValue: 200 },
  { medicine: makeMedicine({ id: 'med-2', name: 'Out Stock', batches: [{ id: 'batch-2', batchNumber: 'B-002', quantity: 0, expiryDate: '2028-01-01', purchasePrice: 10, history: [] }] }), totalQuantity: 0, nextExpiry: null, averagePurchasePrice: 0, totalPurchaseValue: 0 }
];

const renderModal = (props: Partial<React.ComponentProps<typeof PriceListBuilderModal>> = {}) =>
  render(
    <PriceListBuilderModal
      isOpen
      onClose={vi.fn()}
      rows={rows}
      settings={settings}
      canViewPurchasePrice={false}
      {...props}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('PriceListBuilderModal', () => {
  it('starts with all filtered medicines selected and can restrict to available stock', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByTestId('price-list-export-status')).toHaveTextContent('2 of 2 medicines selected');
    });

    fireEvent.click(screen.getByLabelText('Only available'));

    expect(screen.getByTestId('price-list-export-status')).toHaveTextContent('1 of 1 medicines selected');
    expect(screen.queryByText('Out Stock')).not.toBeInTheDocument();
  });

  it('selects only the visible search results when selecting all filtered medicines', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.change(screen.getByLabelText('Search medicines'), { target: { value: 'Out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select All Filtered' }));

    expect(screen.getByTestId('price-list-export-status')).toHaveTextContent('1 of 2 medicines selected');
    const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
    expect(srcDoc).toContain('Out Stock');
    expect(srcDoc).not.toContain('Aspirin');
  });

  it('lets the user select fields and hides internal preset without permission', () => {
    renderModal();

    expect(screen.queryByRole('button', { name: 'Internal List' })).not.toBeInTheDocument();
    const barcode = screen.getByLabelText('Barcode') as HTMLInputElement;
    expect(barcode.checked).toBe(false);

    fireEvent.click(barcode);

    expect(barcode.checked).toBe(true);
  });

  it('exports PDF through the desktop bridge when available', async () => {
    const generateReportPdf = vi.spyOn(window.electronAPI, 'generateReportPdf').mockResolvedValue({
      success: true,
      filePath: 'C:\\price-list.pdf'
    });
    renderModal({ canViewPurchasePrice: true });

    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));

    await waitFor(() => {
      expect(generateReportPdf).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('price-list-export-status')).toHaveTextContent('C:\\price-list.pdf');
  });

  it('renders modern icon buttons with aria labels and tooltips', () => {
    renderModal({ canViewPurchasePrice: true });

    const pdfButton = screen.getByRole('button', { name: 'PDF' });
    expect(pdfButton).toHaveAttribute('title', 'Save as PDF');
    expect(pdfButton.querySelector('svg')).toBeTruthy();

    const htmlButton = screen.getByRole('button', { name: 'HTML' });
    expect(htmlButton).toHaveAttribute('title', 'Save HTML');
    expect(htmlButton.querySelector('svg')).toBeTruthy();

    const selectAllButton = screen.getByRole('button', { name: 'Select All Filtered' });
    expect(selectAllButton).toHaveAttribute('title', 'Select All Filtered');
    expect(selectAllButton.querySelector('svg')).toBeTruthy();

    fireEvent.click(screen.getByTestId('price-list-workflow-edit'));

    const resetMoveButton = screen.getByTestId('price-list-reset-move');
    expect(resetMoveButton).toHaveAttribute('aria-label', 'Reset Move');
    expect(resetMoveButton).toHaveAttribute('title', 'Reset Move');
    expect(resetMoveButton.querySelector('svg')).toBeTruthy();

    const resetSizeButton = screen.getByTestId('price-list-reset-size');
    expect(resetSizeButton).toHaveAttribute('aria-label', 'Reset Size');
    expect(resetSizeButton).toHaveAttribute('title', 'Reset Size');
    expect(resetSizeButton.querySelector('svg')).toBeTruthy();

    const moveUpButton = screen.getByTestId('price-list-move-up');
    expect(moveUpButton).toHaveAttribute('aria-label', 'Move up');
    expect(moveUpButton).toHaveAttribute('title', 'Move up');

    const alignCenterButton = screen.getByTestId('price-list-align-center');
    expect(alignCenterButton).toHaveAttribute('aria-label', 'Center');
    expect(alignCenterButton).toHaveAttribute('title', 'Center');

    const tooltipLabels = screen.getAllByRole('tooltip').map((node) => node.textContent);
    expect(tooltipLabels).toEqual(expect.arrayContaining(['Reset Size', 'Reset Move', 'Move up', 'Center', 'Save as PDF']));
  });

  it('uses workflow and mobile view controls to reduce panel density', () => {
    renderModal();

    expect(screen.getByTestId('price-list-workflow-content')).toHaveClass('bg-brand-600');
    expect(screen.getByTestId('price-list-settings-panel')).toHaveClass('block');
    expect(screen.getByTestId('price-list-preview-panel')).toHaveClass('hidden');

    fireEvent.click(screen.getByTestId('price-list-mobile-preview'));
    expect(screen.getByTestId('price-list-preview-panel')).toHaveClass('block');
    expect(screen.getByTestId('price-list-settings-panel')).toHaveClass('hidden');

    fireEvent.click(screen.getByTestId('price-list-mobile-settings'));
    fireEvent.click(screen.getByTestId('price-list-workflow-design'));
    expect(screen.getByTestId('price-list-workflow-design')).toHaveClass('bg-brand-600');
  });

  it('keeps only one icon tooltip active at a time', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('price-list-workflow-edit'));

    const moveUpButton = screen.getByTestId('price-list-move-up');
    const alignCenterButton = screen.getByTestId('price-list-align-center');
    const moveUpTooltip = moveUpButton.querySelector('[role="tooltip"]');
    const alignCenterTooltip = alignCenterButton.querySelector('[role="tooltip"]');

    fireEvent.focus(moveUpButton);
    expect(moveUpTooltip).toHaveClass('opacity-100');
    expect(alignCenterTooltip).toHaveClass('opacity-0');

    fireEvent.focus(alignCenterButton);
    expect(moveUpTooltip).toHaveClass('opacity-0');
    expect(alignCenterTooltip).toHaveClass('opacity-100');
  });

  it('updates preview when digit and watermark design controls change', async () => {
    renderModal();

    expect(screen.getByTestId('price-list-preview').getAttribute('srcdoc')).toContain('WareKeep');

    fireEvent.click(screen.getByTestId('price-list-workflow-design'));
    fireEvent.change(screen.getByTestId('price-list-numeral-style'), { target: { value: 'persian' } });
    fireEvent.change(screen.getByTestId('price-list-watermark-text'), { target: { value: 'WK Studio' } });

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('۵۰ AFN');
      expect(srcDoc).toContain('WK Studio');
    });
  });

  it('applies page orientation changes to preview and generated HTML', async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('price-list-workflow-design'));
    fireEvent.change(screen.getByTestId('price-list-page-orientation'), { target: { value: 'landscape' } });

    await waitFor(() => {
      const preview = screen.getByTestId('price-list-preview') as HTMLIFrameElement;
      expect(preview.getAttribute('srcdoc')).toContain('@page { size: A4 landscape;');
      expect(preview.style.height).toBe('210mm');
    });
  });

  it('edits the selected document part text, color, and alignment', async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('price-list-workflow-edit'));
    fireEvent.change(screen.getByTestId('price-list-selected-part-text'), {
      target: { value: 'Customer Offer Sheet' }
    });
    fireEvent.change(screen.getByTestId('price-list-selected-part-color'), {
      target: { value: '#dc2626' }
    });
    fireEvent.change(screen.getByTestId('price-list-selected-part-font-size'), {
      target: { value: '32' }
    });
    fireEvent.click(screen.getByTestId('price-list-align-center'));

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('Customer Offer Sheet');
      expect(srcDoc).toContain('color: #dc2626');
      expect(srcDoc).toContain('font-size: 32px');
      expect(srcDoc).toContain('text-align: center');
    });
  });

  it('selects the address from preview and changes its text size independently', async () => {
    renderModal();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'warekeep:price-list-select',
          part: 'address'
        }
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('price-list-selected-part-text')).toHaveValue('Kabul');
    });

    fireEvent.change(screen.getByTestId('price-list-selected-part-text'), {
      target: { value: 'Maimana Main Road' }
    });
    fireEvent.change(screen.getByTestId('price-list-selected-part-font-size'), {
      target: { value: '14' }
    });

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('data-wk-edit-part="address"');
      expect(srcDoc).toContain('Address: Maimana Main Road');
      expect(srcDoc).toContain('font-size: 14px');
    });
  });

  it('selects a preview cell and overrides the price for the price list only', async () => {
    renderModal();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'warekeep:price-list-select',
          part: 'tableCell',
          rowId: 'med-1',
          field: 'retailPrice'
        }
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('price-list-selected-part-text')).toHaveValue('50');
    });

    fireEvent.change(screen.getByTestId('price-list-selected-part-text'), {
      target: { value: '99' }
    });

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('99 AFN');
    });
  });

  it('selects a preview header through the iframe message and edits the column title', async () => {
    renderModal();
    const preview = screen.getByTestId('price-list-preview') as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'warekeep:price-list-select',
          part: 'tableHeader',
          field: 'wholesalePrice'
        },
        source: preview.contentWindow
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('price-list-selected-part-text')).toHaveValue('Wholesale Price');
    });

    fireEvent.change(screen.getByTestId('price-list-selected-part-text'), {
      target: { value: 'Dealer Price' }
    });

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('Dealer Price');
      expect(srcDoc).toContain('wk-selected');
    });
  });

  it('moves and resets the selected part without changing its text', async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('price-list-workflow-edit'));
    fireEvent.click(screen.getByTestId('price-list-move-right'));
    fireEvent.click(screen.getByTestId('price-list-move-down'));

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('transform: translate(4mm, 4mm)');
    });

    fireEvent.click(screen.getByTestId('price-list-reset-move'));

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).not.toContain('transform: translate(4mm, 4mm)');
      expect(srcDoc).toContain('Medicine Price List');
    });
  });

  it('moves a selected logo in the generated preview output', async () => {
    renderModal();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'warekeep:price-list-select',
          part: 'logo'
        }
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('price-list-logo-size')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('price-list-move-right'));
    fireEvent.click(screen.getByTestId('price-list-move-down'));

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('data-wk-edit-part="logo"');
      expect(srcDoc).toContain('wk-selected');
      expect(srcDoc).toContain('transform: translate(4mm, 4mm)');
    });
  });

  it('edits row text and prices from the row editor', async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('price-list-workflow-edit'));
    fireEvent.change(screen.getByTestId('price-list-row-edit-name'), {
      target: { value: 'Aspirin Promo' }
    });
    fireEvent.change(screen.getByTestId('price-list-row-edit-wholesalePrice'), {
      target: { value: '77' }
    });

    await waitFor(() => {
      const srcDoc = screen.getByTestId('price-list-preview').getAttribute('srcdoc') || '';
      expect(srcDoc).toContain('Aspirin Promo');
      expect(srcDoc).toContain('77 AFN');
    });
  });

  it('reports export cancel and saves clean HTML without preview selection highlight', async () => {
    const saveInvoiceHtml = vi.spyOn(window.electronAPI, 'saveInvoiceHtml').mockResolvedValueOnce({
      success: false,
      canceled: true
    } as any).mockResolvedValueOnce({
      success: true,
      filePath: 'C:\\price-list.html'
    });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'HTML' }));

    await waitFor(() => {
      expect(screen.getByTestId('price-list-export-status')).toHaveTextContent('HTML export canceled.');
    });

    fireEvent.click(screen.getByRole('button', { name: 'HTML' }));

    await waitFor(() => {
      expect(saveInvoiceHtml).toHaveBeenCalledTimes(2);
    });
    expect(saveInvoiceHtml.mock.calls[1][0]).not.toMatch(/class="[^"]*wk-selected/);
    expect(screen.getByTestId('price-list-export-status')).toHaveTextContent('C:\\price-list.html');
  });

  it('reports PDF failures instead of failing silently', async () => {
    vi.spyOn(window.electronAPI, 'generateReportPdf').mockResolvedValue({
      success: false,
      error: 'PDF_EXPORT_FAILED'
    });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));

    await waitFor(() => {
      expect(screen.getByTestId('price-list-export-status')).toHaveTextContent('PDF failed. Use Print and choose Save as PDF.');
    });
  });
});
