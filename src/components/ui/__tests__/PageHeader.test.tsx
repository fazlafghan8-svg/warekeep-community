import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';
import { StatusBadge } from '../StatusBadge';

describe('PageHeader', () => {
  it('keeps the disabled primary action label rendered and accessible', () => {
    render(
      <PageHeader
        title="مدیریت مشتریان"
        primaryAction={{
          label: 'افزودن مشتری جدید',
          disabled: true,
        }}
      />
    );

    const action = screen.getByRole('button', { name: 'افزودن مشتری جدید' });

    expect(action).toBeDisabled();
    expect(action).toHaveTextContent('افزودن مشتری جدید');
    expect(action.className).toContain('wk-btn-primary');
  });

  it('does not render empty badges that would become blank pills', () => {
    const { container } = render(
      <PageHeader
        title="مدیریت مشتریان"
        meta={(
          <div>
            <StatusBadge tone="neutral">{'   '}</StatusBadge>
          </div>
        )}
      />
    );

    expect(container.querySelector('.wk-status-badge')).toBeNull();
  });

  it('does not render blank header actions or blank eyebrow pills', () => {
    const { container } = render(
      <PageHeader
        title="مدیریت مشتریان"
        eyebrow="   "
        primaryAction={{
          label: '   ',
        }}
      />
    );

    expect(container.querySelector('.wk-btn')).toBeNull();
    expect(container.querySelector('.wk-meta-text')).toBeNull();
  });
});
