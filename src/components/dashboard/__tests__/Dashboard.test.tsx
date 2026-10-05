import type { ComponentProps, ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceDashboard as Dashboard } from '@/components/ReferenceDashboard';
import { getGuestDemoData } from '@/fixtures/guestDemoData';
vi.mock('recharts', async () => {
    const actual = await vi.importActual<typeof import('recharts')>('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: {
            children: ReactNode;
        }) => (<div style={{ width: 960, height: 420 }}>{children}</div>),
    };
});
class ResizeObserverMock {
    observe() { }
    unobserve() { }
    disconnect() { }
}
type DashboardOverrides = Partial<ComponentProps<typeof Dashboard>>;
const createDashboardProps = (overrides: DashboardOverrides = {}): ComponentProps<typeof Dashboard> => {
    const demo = getGuestDemoData('english');
    return {
        medicines: demo.medicines,
        invoices: demo.invoices,
        customers: demo.customers,
        expenses: demo.expenses,
        settings: demo.settings,
        setView: vi.fn(),
        ...overrides,
    };
};
const renderDashboard = (overrides: DashboardOverrides = {}) => {
    const props = createDashboardProps(overrides);
    return {
        ...render(<Dashboard {...props}/>),
        props,
    };
};
describe('ReferenceDashboard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        window.localStorage.removeItem('warekeep_dashboard_widgets');
    });
    afterEach(() => {
        vi.useRealTimers();
        window.localStorage.removeItem('warekeep_dashboard_widgets');
        vi.unstubAllGlobals();
    });
    it('renders the compact header controls and the four KPI cards', () => {
        renderDashboard();
        expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
        expect(screen.getByText('Sales')).toBeInTheDocument();
        expect(screen.getByText('Buyers')).toBeInTheDocument();
        expect(screen.getByText('Items Sold')).toBeInTheDocument();
        expect(screen.getByText('Invoices')).toBeInTheDocument();
    });
    it('keeps buyers tied to the selected range instead of falling back to all active customers', () => {
        renderDashboard();
        const buyersCard = screen.getByText('Buyers').closest('button');
        expect(buyersCard).toBeTruthy();
        expect(buyersCard).toHaveTextContent('0');
        expect(buyersCard).not.toHaveTextContent('2');
    });
    it('populates the best selling table and keeps the supporting cards visible', () => {
        const demo = getGuestDemoData('english');
        renderDashboard({
            invoices: demo.invoices.map((invoice, index) => ({
                ...invoice,
                date: index === 0 ? '2026-03-28T10:00:00.000Z' : '2026-03-29T10:00:00.000Z',
            })),
        });
        expect(screen.getByText('Best Selling Products')).toBeInTheDocument();
        expect(screen.getByText('Cough Syrup 120ml')).toBeInTheDocument();
        expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
        expect(screen.getByText('Most Day Active')).toBeInTheDocument();
        expect(screen.getByText('Repeat Customer Rate')).toBeInTheDocument();
        expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
    });
    it('keeps the peak sales summary above the chart layer', () => {
        renderDashboard();
        expect(screen.getByTestId('dashboard-peak-point')).toHaveClass('z-20');
    });
    it('opens the widget drawer and routes through widget selection', () => {
        const onNotify = vi.fn();
        renderDashboard({ onNotify });
        fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
        expect(screen.getByRole('heading', { name: 'Add Widget' })).toBeInTheDocument();
        const inventoryWidgetCard = screen.getByText('Inventory Health').closest('article');
        expect(inventoryWidgetCard).toBeTruthy();
        fireEvent.click(within(inventoryWidgetCard as HTMLElement).getByRole('button', { name: 'Add' }));
        expect(onNotify).toHaveBeenCalledTimes(1);
        expect(onNotify).toHaveBeenCalledWith('Inventory Health added to the dashboard.', 'success');
    });
    it('switches the dashboard range and keeps the selected preset operational', () => {
        renderDashboard();
        const rangeSelect = screen.getByRole('combobox', { name: 'Dashboard period' }) as HTMLSelectElement;
        expect(rangeSelect.value).toBe('30');
        fireEvent.change(rangeSelect, { target: { value: '7' } });
        expect(rangeSelect.value).toBe('7');
    });
    it('routes local sales and customer KPI cards while assistant actions remain absent', () => {
        const setView = vi.fn();
        renderDashboard({ setView });
        fireEvent.click(screen.getByText('Sales').closest('button') as HTMLButtonElement);
        expect(screen.queryByRole('button', { name: /Record sale/i })).toBeNull();
        fireEvent.click(screen.getByText('Buyers').closest('button') as HTMLButtonElement);
        expect(setView).toHaveBeenCalledWith('customers');
        expect(setView).toHaveBeenCalledWith('sales');
        expect(setView).toHaveBeenCalledTimes(2);
    });
    it('keeps the shell composition LTR while preserving localized action labels', () => {
        const demo = getGuestDemoData('dari');
        renderDashboard({
            medicines: demo.medicines,
            invoices: demo.invoices,
            customers: demo.customers,
            expenses: demo.expenses,
            settings: demo.settings,
        });
        expect(screen.getByRole('heading', { name: 'داشبورد مدیریتی' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'افزودن ویجت' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'خروجی' })).toBeInTheDocument();
        expect(screen.getByText('مجموع فروش')).toBeInTheDocument();
        expect(screen.getByText('خریداران')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'هرچه می‌خواهید بپرسید...' })).not.toBeInTheDocument();
        expect(document.querySelector('div[dir="ltr"]')).toBeTruthy();
    });
});
