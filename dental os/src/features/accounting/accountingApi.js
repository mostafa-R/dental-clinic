import api from '../../lib/axios';

export const accountingApi = {
  /* Summary */
  getSummary: (params) => api.get('/accounting/summary', { params }).then((r) => r.data.data),

  /* Expenses */
  listExpenses: (params) => api.get('/accounting/expenses', { params }).then((r) => r.data.data),
  createExpense: (payload) => api.post('/accounting/expenses', payload).then((r) => r.data.data),
  deleteExpense: (id) => api.delete(`/accounting/expenses/${id}`).then((r) => r.data.data),

  /* Owner drawings */
  listDrawings: (params) => api.get('/accounting/drawings', { params }).then((r) => r.data.data),
  createDrawing: (payload) => api.post('/accounting/drawings', payload).then((r) => r.data.data),
  deleteDrawing: (id) => api.delete(`/accounting/drawings/${id}`).then((r) => r.data.data),

  /* Commissions */
  listCommissions: (params) => api.get('/accounting/commissions', { params }).then((r) => r.data.data),
  updateCommission: (id, payload) => api.patch(`/accounting/commissions/${id}`, payload).then((r) => r.data.data),

  /* Wallet (patient-scoped) */
  getWallet: (patientId) => api.get(`/patients/${patientId}/wallet`).then((r) => r.data.data),
  addWalletTransaction: (patientId, payload) =>
    api.post(`/patients/${patientId}/wallet/transactions`, payload).then((r) => r.data.data),

  /* Installments (patient-scoped) */
  listInstallments: (patientId, params) =>
    api.get(`/patients/${patientId}/installments`, { params }).then((r) => r.data.data),
  createInstallment: (patientId, payload) =>
    api.post(`/patients/${patientId}/installments`, payload).then((r) => r.data.data),
  payInstallment: (patientId, planId, payload) =>
    api.post(`/patients/${patientId}/installments/${planId}/pay`, payload).then((r) => r.data.data),

  /* Generate invoice from treatment plan */
  generateInvoice: (patientId, planId, payload) =>
    api.post(`/patients/${patientId}/treatment-plans/${planId}/invoice`, payload).then((r) => r.data.data),
};
