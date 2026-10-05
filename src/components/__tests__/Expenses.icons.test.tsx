import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoryIconsContext, CategoryTag } from '../expenses/CategoryTag';
import { CategorySelect } from '../expenses/CategorySelect';
import type { CategoryIconMeta } from '@/types';

const tr = (en: string, _fa: string) => en;

describe('expenses workspace icon integration', () => {
    it('CategoryTag resolves dictionary icons through the smart matcher', () => {
        const { container } = render(<CategoryTag category="برق" />);
        expect(container.querySelector('svg.lucide-zap')).not.toBeNull();
    });

    it('CategoryTag honors manual picks provided via CategoryIconsContext', () => {
        const icons: Record<string, CategoryIconMeta> = {
            'برق': { icon: 'gem', color: 'purple', source: 'manual' }
        };
        const { container } = render(
            <CategoryIconsContext.Provider value={icons}>
                <CategoryTag category="برق" />
            </CategoryIconsContext.Provider>
        );
        expect(container.querySelector('svg.lucide-gem')).not.toBeNull();
        expect(container.querySelector('svg.lucide-zap')).toBeNull();
    });

    it('CategoryTag falls back to the tag icon for unknown categories', () => {
        const { container } = render(<CategoryTag category="xqzwvutk" />);
        expect(container.querySelector('svg.lucide-tag')).not.toBeNull();
    });

    it('CategorySelect renders smart icon tags for every option', () => {
        const handleChange = vi.fn();
        const { container } = render(
            <CategorySelect value="برق" onChange={handleChange} categories={['برق', 'کرایه']} tr={tr} />
        );
        // Trigger shows the selected category's icon.
        expect(container.querySelector('svg.lucide-zap')).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /برق/ }));
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(2);
        expect(options[0].querySelector('svg.lucide-zap')).not.toBeNull();
        expect(options[1].querySelector('svg.lucide-house')).not.toBeNull();

        fireEvent.click(options[1]);
        expect(handleChange).toHaveBeenCalledWith('کرایه');
    });
});
