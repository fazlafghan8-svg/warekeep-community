import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader actions', () => {
  it('renders primary and secondary actions with explicit button labels', () => {
    render(
      <PageHeader
        title="Purchase history"
        primaryAction={{ label: 'Create purchase draft' }}
        secondaryActions={[{ label: 'Export CSV' }]}
      />
    );

    const primary = screen.getByRole('button', { name: 'Create purchase draft' });
    const secondary = screen.getByRole('button', { name: 'Export CSV' });

    expect(primary.className).toContain('wk-btn-primary');
    expect(secondary.className).toContain('wk-btn-secondary');
    expect(primary.querySelector('.wk-btn-label')).toHaveTextContent('Create purchase draft');
    expect(secondary.querySelector('.wk-btn-label')).toHaveTextContent('Export CSV');
  });
});
