import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('keeps the default close button accessible and clickable', () => {
    const onClose = vi.fn();

    render(
      <Modal isOpen onClose={onClose} title="جزئیات هزینه">
        <p>متن آزمایشی</p>
      </Modal>
    );

    const closeButton = screen.getByRole('button', { name: /Close / });

    expect(closeButton).toBeVisible();

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();

    render(
      <Modal isOpen onClose={onClose} title="مدیریت فاکتورها">
        <button type="button">دیدن</button>
      </Modal>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('only lets the topmost dialog handle Escape', () => {
    const onParentClose = vi.fn();
    const onChildClose = vi.fn();

    render(
      <>
        <Modal isOpen onClose={onParentClose} title="Parent dialog">
          <button type="button">Parent action</button>
        </Modal>
        <Modal isOpen onClose={onChildClose} title="Child dialog">
          <button type="button">Child action</button>
        </Modal>
      </>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onChildClose).toHaveBeenCalledTimes(1);
    expect(onParentClose).not.toHaveBeenCalled();
  });

  it('traps focus inside the dialog', async () => {
    const onClose = vi.fn();

    render(
      <>
        <button type="button">Outside before</button>
        <Modal isOpen onClose={onClose} title="مدیریت فاکتورها" hideCloseButton>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </Modal>
        <button type="button">Outside after</button>
      </>
    );

    const firstAction = screen.getByRole('button', { name: 'First action' });
    const lastAction = screen.getByRole('button', { name: 'Last action' });

    await waitFor(() => expect(firstAction).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(lastAction).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(firstAction).toHaveFocus();
  });
});
