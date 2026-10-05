import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategorySettings } from '../CategorySettings';
import type { CategoryIconMeta } from '../../../types';

const baseProps = {
    newCategory: '',
    setNewCategory: vi.fn(),
    onAddCategory: vi.fn(),
    onDeleteCategory: vi.fn(),
    onSetCategoryIcon: vi.fn()
};

describe('CategorySettings icon integration', () => {
    it('renders an icon chip for every category row', () => {
        const icons: Record<string, CategoryIconMeta> = {
            'برق': { icon: 'zap', color: 'amber', source: 'exact' }
        };
        const { container } = render(
            <CategorySettings {...baseProps} categories={['برق', 'کرایه']} categoryIcons={icons} />
        );
        // One chip button per row (title: تغییر آیکون), each containing an svg.
        const chipButtons = screen.getAllByTitle('تغییر آیکون');
        expect(chipButtons).toHaveLength(2);
        for (const button of chipButtons) {
            expect(button.querySelector('svg')).not.toBeNull();
        }
        // کرایه has no saved meta → resolved live via the offline matcher.
        expect(container.textContent).toContain('کرایه');
    });

    it('renders Persian digits for row numbers and the count badge in Dari', () => {
        render(<CategorySettings {...baseProps} categories={['برق', 'آب']} language="dari" />);
        expect(screen.getByText('۱')).toBeInTheDocument();
        expect(screen.getByText('۲')).toBeInTheDocument();
        expect(screen.getByText(/۲ دسته فعال/)).toBeInTheDocument();
    });

    it('opens the icon picker from a row chip and saves a manual pick', () => {
        const onSetCategoryIcon = vi.fn();
        render(
            <CategorySettings
                {...baseProps}
                onSetCategoryIcon={onSetCategoryIcon}
                categories={['برق']}
            />
        );
        fireEvent.click(screen.getByTitle('تغییر آیکون'));
        expect(screen.getByText('انتخاب آیکون و رنگ')).toBeInTheDocument();

        // Pick a color, search with normalizeFa-powered lookup, then pick the icon.
        fireEvent.click(screen.getByRole('button', { name: 'purple' }));
        fireEvent.change(screen.getByPlaceholderText(/جستجوی آیکون/), { target: { value: 'زیورات' } });
        fireEvent.click(screen.getByTitle('gem'));
        expect(onSetCategoryIcon).toHaveBeenCalledWith('برق', { icon: 'gem', color: 'purple', source: 'manual' });
    });

    it('keeps the delete flow working', () => {
        const onDeleteCategory = vi.fn();
        render(<CategorySettings {...baseProps} onDeleteCategory={onDeleteCategory} categories={['برق']} />);
        fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
        expect(onDeleteCategory).toHaveBeenCalledWith('برق');
    });
});
