import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SmartCategoryInput } from '../SmartCategoryInput';

const DEBOUNCE_MS = 150;

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const typeAndSettle = (input: HTMLElement, value: string) => {
    fireEvent.change(input, { target: { value } });
    act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS + 20);
    });
};

describe('SmartCategoryInput', () => {
    it('shows a live icon preview after the debounce', () => {
        const { container, rerender } = render(
            <SmartCategoryInput value="" onChange={() => undefined} onAdd={() => undefined} />
        );
        // Empty field → dashed placeholder chip, no pop animation.
        expect(container.querySelector('.wk-chip-pop')).toBeNull();

        rerender(<SmartCategoryInput value="برق" onChange={() => undefined} onAdd={() => undefined} />);
        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS + 20);
        });
        const chip = container.querySelector('.wk-chip-pop');
        expect(chip).not.toBeNull();
        expect(chip!.querySelector('svg')).not.toBeNull();
    });

    it('renders the spelling-correction hint for a misspelled name and fixes it on click', () => {
        const handleChange = vi.fn();
        const { rerender } = render(
            <SmartCategoryInput value="" onChange={handleChange} onAdd={() => undefined} />
        );
        rerender(<SmartCategoryInput value="برغ" onChange={handleChange} onAdd={() => undefined} />);
        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS + 20);
        });

        expect(screen.getByText('«برق»')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'اصلاح نام' }));
        expect(handleChange).toHaveBeenCalledWith('برق');
    });

    it('calls onAdd on Enter without a manual icon by default', () => {
        const handleAdd = vi.fn();
        render(<SmartCategoryInput value="برق" onChange={() => undefined} onAdd={handleAdd} />);
        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS + 20);
        });
        fireEvent.keyDown(screen.getByDisplayValue('برق'), { key: 'Enter' });
        expect(handleAdd).toHaveBeenCalledWith(undefined);
    });

    it('renders the English spelling hint and fixes the name with preserved casing', () => {
        const handleChange = vi.fn();
        const { rerender } = render(
            <SmartCategoryInput value="" onChange={handleChange} onAdd={() => undefined} language="english" />
        );
        rerender(
            <SmartCategoryInput value="Internit" onChange={handleChange} onAdd={() => undefined} language="english" />
        );
        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS + 20);
        });

        expect(screen.getByText(/Did you mean/)).toBeInTheDocument();
        expect(screen.getByText('"Internet"')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Fix name' }));
        expect(handleChange).toHaveBeenCalledWith('Internet');
    });

    it('issues zero network requests while typing', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const { rerender } = render(
            <SmartCategoryInput value="" onChange={() => undefined} onAdd={() => undefined} />
        );
        for (const partial of ['ب', 'بر', 'برق', 'برق ج', 'برق جدید']) {
            rerender(<SmartCategoryInput value={partial} onChange={() => undefined} onAdd={() => undefined} />);
            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS + 20);
            });
        }
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
