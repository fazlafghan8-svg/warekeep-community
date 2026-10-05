import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, InvoiceTemplateId } from '../../types';

const syntheticEmail = 'synthetic-layout-owner@example.test';

describe('Community invoice design policy', () => {
 beforeEach(() => {
  vi.resetModules();
  // A public build must remain local even when an old shell supplies commercial values.
  vi.stubEnv('VITE_APP_EDITION', 'commercial');
  vi.stubEnv('VITE_INVOICE_FREE_LAYOUT_ONLY_EMAIL', syntheticEmail);
 });
 afterEach(() => vi.unstubAllEnvs());

 it.each(['modern', 'clean', 'legacy'] as InvoiceTemplateId[])('preserves the selected %s layout for every account instead of imposing an owner exception', async (templateId) => {
  const policy = await import('../invoiceDesignPolicy');
  const settings = { invoiceDesign: { templateId } } as AppSettings;
  for (const email of [syntheticEmail, '  ' + syntheticEmail.toUpperCase() + '  ', 'another@example.test', '', undefined, null]) {
   expect(policy.isSpecialInvoiceAccount(email)).toBe(false);
   expect(policy.enforceInvoiceDesignPolicy(settings, email)).toBe(settings);
   expect(policy.resolveInvoiceTemplateId(settings)).toBe(templateId);
  }
 });

 it.each([undefined, 'unsupported-layout'])('uses the standard legacy fallback when the selected layout is %s', async (templateId) => {
  const policy = await import('../invoiceDesignPolicy');
  const settings = { storeName: 'Synthetic local store', invoiceDesign: { templateId } } as unknown as AppSettings;
  const output = policy.enforceInvoiceDesignPolicy(settings, syntheticEmail);
  expect(output.invoiceDesign?.templateId).toBe('legacy');
  expect(output.storeName).toBe('Synthetic local store');
  expect(settings.invoiceDesign?.templateId).toBe(templateId);
 });

 it('keeps the chosen layout available with no inherited email setting', async () => {
  vi.stubEnv('VITE_INVOICE_FREE_LAYOUT_ONLY_EMAIL', '');
  const policy = await import('../invoiceDesignPolicy');
  const settings = { invoiceDesign: { templateId: 'modern' } } as AppSettings;
  expect(policy.isSpecialInvoiceAccount(syntheticEmail)).toBe(false);
  expect(policy.enforceInvoiceDesignPolicy(settings, syntheticEmail)).toBe(settings);
 });
});
