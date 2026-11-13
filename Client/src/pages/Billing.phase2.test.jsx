import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

const mocks = vi.hoisted(() => ({
  fetchBillingSummary: vi.fn(() => ({ type: 'billing/fetchSummary/requested' })),
  fetchInvoices: vi.fn(() => ({ type: 'billing/fetchList/requested' })),
}));

vi.mock('../features/billing/billingSlice', async () => {
  const actual = await vi.importActual('../features/billing/billingSlice');
  return {
    ...actual,
    fetchBillingSummary: (...args) => mocks.fetchBillingSummary(...args),
    fetchInvoices: (...args) => mocks.fetchInvoices(...args),
  };
});

vi.mock('../lib/socket', () => ({
  useSocketEvent: () => {},
}));
vi.mock('../lib/socketEvents', () => ({
  SOCKET_EVENTS: { INVOICE_CREATED: 'invoice:created', INVOICE_UPDATED: 'invoice:updated' },
}));
vi.mock('../lib/roles', () => ({
  useCanViewBilling: () => true,
  useCanCreateInvoices: () => true,
}));
vi.mock('../lib/i18n', () => ({
  useT: () => ({ t: (k) => k }),
}));
vi.mock('../features/ui/uiSlice', () => ({
  showErrorDialog: (e) => ({ type: 'ui/showErrorDialog', payload: e }),
}));
vi.mock('../features/billing/BillingSummary', () => ({
  default: () => <div data-testid="billing-summary">SUMMARY</div>,
}));
vi.mock('../features/billing/AgingReport', () => ({ default: () => null }));
vi.mock('../features/billing/InvoiceFormModal', () => ({ default: () => null }));
vi.mock('../features/billing/InvoiceDetailModal', () => ({ default: () => null }));
vi.mock('../features/billing/PaymentModal', () => ({ default: () => null }));
vi.mock('../features/billing/RefundModal', () => ({ default: () => null }));
vi.mock('../features/billing/VoidConfirmModal', () => ({ default: () => null }));
vi.mock('../features/billing/InvoicesTable', () => ({ default: () => <div data-testid="invoices-table" /> }));

import Billing from './Billing';
import billingReducer from '../features/billing/billingSlice';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBilling({ billing } = {}) {
  const store = configureStore({
    reducer: { billing: billingReducer },
    preloadedState: billing ? { billing } : undefined,
  });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/billing']}>
        <Billing />
      </MemoryRouter>
    </Provider>,
  );
}

describe('Client Billing summary failure UI (Phase 2.1)', () => {
  it('displays retry action when summary load fails', () => {
    renderBilling({
      billing: {
        items: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 1 },
        query: { search: '', status: undefined, patient: undefined, page: 1, limit: 20 },
        status: 'idle',
        error: null,
        currentRequestId: null,
        summary: null,
        summaryStatus: 'failed',
        formStatus: 'idle',
        formError: null,
        paymentStatus: 'idle',
        paymentError: null,
        refundStatus: 'idle',
        refundError: null,
        voidStatus: 'idle',
        voidError: null,
        aging: null,
        agingStatus: 'idle',
      },
    });

    expect(screen.getByText('billing.loadFailed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'common.tryAgain' })).toBeTruthy();
  });

  it('retry invokes billing summary fetch action', () => {
    renderBilling({
      billing: {
        items: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 1 },
        query: { search: '', status: undefined, patient: undefined, page: 1, limit: 20 },
        status: 'idle',
        error: null,
        currentRequestId: null,
        summary: null,
        summaryStatus: 'failed',
        formStatus: 'idle',
        formError: null,
        paymentStatus: 'idle',
        paymentError: null,
        refundStatus: 'idle',
        refundError: null,
        voidStatus: 'idle',
        voidError: null,
        aging: null,
        agingStatus: 'idle',
      },
    });

    mocks.fetchBillingSummary.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'common.tryAgain' }));
    expect(mocks.fetchBillingSummary).toHaveBeenCalled();
  });
});
