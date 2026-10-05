import legacyTheme from './tailwind.legacy-theme.mjs';
const colorVar = (name) => `rgb(var(${name}) / <alpha-value>)`;
/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './src/**/*.{js,ts,jsx,tsx}'
    ],
    theme: {
        ...legacyTheme,
        extend: {
            fontFamily: {
                sans: ['Vazirmatn', 'Segoe UI Variable Text', 'Segoe UI', 'ui-sans-serif', 'system-ui'],
            },
            colors: {
                brand: {
                    50: colorVar('--wk-color-brand-50'),
                    100: colorVar('--wk-color-brand-100'),
                    200: colorVar('--wk-color-brand-200'),
                    300: colorVar('--wk-color-brand-300'),
                    400: colorVar('--wk-color-brand-400'),
                    500: colorVar('--wk-color-brand-500'),
                    600: colorVar('--wk-color-brand-600'),
                    700: colorVar('--wk-color-brand-700'),
                    800: colorVar('--wk-color-brand-800'),
                    900: colorVar('--wk-color-brand-900'),
                    950: colorVar('--wk-color-brand-950'),
                },
                success: {
                    50: colorVar('--wk-color-success-50'),
                    100: colorVar('--wk-color-success-100'),
                    500: colorVar('--wk-color-success-500'),
                    700: colorVar('--wk-color-success-700'),
                },
                warning: {
                    50: colorVar('--wk-color-warning-50'),
                    100: colorVar('--wk-color-warning-100'),
                    500: colorVar('--wk-color-warning-500'),
                    700: colorVar('--wk-color-warning-700'),
                },
                danger: {
                    50: colorVar('--wk-color-danger-50'),
                    100: colorVar('--wk-color-danger-100'),
                    500: colorVar('--wk-color-danger-500'),
                    700: colorVar('--wk-color-danger-700'),
                },
                info: {
                    50: colorVar('--wk-color-info-50'),
                    100: colorVar('--wk-color-info-100'),
                    500: colorVar('--wk-color-info-500'),
                    700: colorVar('--wk-color-info-700'),
                },
                neutral: {
                    0: colorVar('--wk-color-neutral-0'),
                    25: colorVar('--wk-color-neutral-25'),
                    50: colorVar('--wk-color-neutral-50'),
                    100: colorVar('--wk-color-neutral-100'),
                    150: colorVar('--wk-color-neutral-150'),
                    200: colorVar('--wk-color-neutral-200'),
                    300: colorVar('--wk-color-neutral-300'),
                    400: colorVar('--wk-color-neutral-400'),
                    500: colorVar('--wk-color-neutral-500'),
                    600: colorVar('--wk-color-neutral-600'),
                    700: colorVar('--wk-color-neutral-700'),
                    800: colorVar('--wk-color-neutral-800'),
                    850: colorVar('--wk-color-neutral-850'),
                    900: colorVar('--wk-color-neutral-900'),
                    950: colorVar('--wk-color-neutral-950'),
                },
                surface: {
                    page: colorVar('--wk-color-surface-page'),
                    canvas: colorVar('--wk-color-surface-canvas'),
                    raised: colorVar('--wk-color-surface-raised'),
                    subtle: colorVar('--wk-color-surface-subtle'),
                    sunken: colorVar('--wk-color-surface-sunken'),
                    strong: colorVar('--wk-color-surface-strong'),
                },
                shell: {
                    900: colorVar('--wk-color-shell-900'),
                    950: colorVar('--wk-color-shell-950'),
                },
                slate: {
                    850: colorVar('--wk-color-neutral-850'),
                }
            },
            spacing: {
                'wk-1': 'var(--wk-space-1)',
                'wk-2': 'var(--wk-space-2)',
                'wk-3': 'var(--wk-space-3)',
                'wk-4': 'var(--wk-space-4)',
                'wk-5': 'var(--wk-space-5)',
                'wk-6': 'var(--wk-space-6)',
                'wk-8': 'var(--wk-space-8)',
                'wk-10': 'var(--wk-space-10)',
                'wk-12': 'var(--wk-space-12)',
            },
            borderRadius: {
                'wk-xs': 'var(--wk-radius-1)',
                'wk-sm': 'var(--wk-radius-2)',
                'wk-md': 'var(--wk-radius-3)',
                'wk-lg': 'var(--wk-radius-4)',
                'wk-xl': 'var(--wk-radius-5)',
            },
            boxShadow: {
                'wk-1': 'var(--wk-shadow-1)',
                'wk-2': 'var(--wk-shadow-2)',
                'wk-3': 'var(--wk-shadow-3)',
                'wk-shell': 'var(--wk-shadow-shell)',
            },
            fontSize: {
                'wk-page-title': ['var(--wk-font-size-page-title)', { lineHeight: 'var(--wk-line-height-display)' }],
                'wk-section-title': ['var(--wk-font-size-section-title)', { lineHeight: 'var(--wk-line-height-heading)' }],
                'wk-body': ['var(--wk-font-size-body)', { lineHeight: 'var(--wk-line-height-body)' }],
                'wk-meta': ['var(--wk-font-size-meta)', { lineHeight: 'var(--wk-line-height-meta)' }],
            }
        },
    },
    plugins: [],
};
