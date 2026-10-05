import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it } from 'vitest';
import preserveWareKeepCascade from '../tailwind-v3-cascade.mjs';

const compile = (css, optimize = false) => postcss([
  tailwind({ optimize }), preserveWareKeepCascade(),
]).process(css, { from: path.resolve('src/index.css') });

describe('the migrated compiler preserves the established WareKeep appearance', () => {
  for (const optimize of [false, true]) {
    it(`keeps app overrides, gradients, sibling spacing, and opacity semantics (${optimize ? 'production' : 'development'})`, async () => {
      const result = await compile(`
        @import "tailwindcss" source(none);
        @config "../tailwind.config.js";
        @source inline("bg-gradient-to-r from-blue-500 to-blue-600 space-y-4 space-x-2 bg-white/96 bg-white/80 bg-white/[.96] bg-brand-500 bg-brand-500/12 p-4");
        @layer components { .card { padding: 3rem; color: red; } }
        @layer utilities { .card { padding: 1rem; } }
        .card { padding: 8px; }
      `, optimize);
      const cardRules = [];
      result.root.walkRules('.card', rule => cardRules.push(rule));
      expect(cardRules.map(rule => rule.nodes.find(node => node.prop === 'padding')?.value))
        .toEqual(['3rem', '1rem', '8px']);
      const rules = [];
      result.root.walkRules(rule => rules.push(rule));
      const gradient = rules.find(rule => rule.selector === '.bg-gradient-to-r');
      expect(gradient?.nodes.find(node => node.prop === '--tw-gradient-position')?.value).toBe('to right');
      expect(gradient?.nodes.find(node => node.prop === 'background-image')?.value)
        .toBe('linear-gradient(var(--tw-gradient-stops))');
      const vertical = rules.find(rule => rule.selector === '.space-y-4 > :not([hidden]) ~ :not([hidden])');
      const horizontal = rules.find(rule => rule.selector === '.space-x-2 > :not([hidden]) ~ :not([hidden])');
      expect(vertical?.nodes.find(node => node.prop === 'margin-top')?.value)
        .toBe('calc(1rem * calc(1 - var(--tw-space-y-reverse)))');
      expect(horizontal?.nodes.find(node => node.prop === 'margin-left')?.value)
        .toMatch(/^calc\(0?\.5rem \* calc\(1 - var\(--tw-space-x-reverse\)\)\)$/);
      expect(vertical?.nodes.every(node => Boolean(node.source?.input?.file))).toBe(true);
      expect(rules.some(rule => rule.selector === '.bg-white\\/96')).toBe(false);
      expect(rules.some(rule => rule.selector === '.bg-white\\/80')).toBe(true);
      expect(rules.some(rule => rule.selector.includes('bg-white\\/\\['))).toBe(true);
      expect(rules.some(rule => postcss.list.comma(rule.selector).includes('.bg-brand-500'))).toBe(true);
      expect(rules.some(rule => rule.selector.includes('bg-brand-500\\/12'))).toBe(false);
      const layers = [];
      result.root.walkAtRules('layer', rule => layers.push(rule));
      expect(layers).toEqual([]);
      result.root.walkRules(rule => {
        if (!rule.selector.includes('[hidden]')) return;
        rule.walkDecls('display', declaration => expect(declaration.important).toBeFalsy());
      });
    });
  }

  it('fails visibly when a new layer needs review instead of silently changing its cascade', async () => {
    await expect(postcss([preserveWareKeepCascade()])
      .process('@layer new-feature { .card { color: blue; } }', { from: undefined }))
      .rejects.toThrow('Unsupported CSS layer');
  });
});
