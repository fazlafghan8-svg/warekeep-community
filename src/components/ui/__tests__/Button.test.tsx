import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('wraps plain text children in a readable label slot', () => {
    render(<Button variant="primary">Create order</Button>);

    const button = screen.getByRole('button', { name: 'Create order' });
    const label = button.querySelector('.wk-btn-label');

    expect(button.className).toContain('wk-btn-primary');
    expect(label).not.toBeNull();
    expect(label).toHaveTextContent('Create order');
  });

  it('keeps icons and text labels together when both are provided', () => {
    render(
      <Button variant="secondary">
        <svg data-testid="button-icon" aria-hidden="true" />
        Export CSV
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Export CSV' });

    expect(screen.getByTestId('button-icon')).toBeInTheDocument();
    expect(button.querySelector('.wk-btn-label')).toHaveTextContent('Export CSV');
  });
});
