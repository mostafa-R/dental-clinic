import api from '../../lib/axios';

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export const doctorDashboardApi = {
  getTodayAppointments(doctorId) {
    const { start } = todayRange();
    return api
      .get('/appointments', { params: { doctor: doctorId, date: start } })
      .then((r) => r.data.data.appointments);
  },

  getAllMyAppointments(doctorId) {
    return api
      .get('/appointments', { params: { doctor: doctorId, limit: 200 } })
      .then((r) => r.data.data);
  },

  getCommissions(doctorId) {
    return api
      .get('/accounting/commissions', { params: { doctor: doctorId, limit: 100 } })
      .then((r) => r.data.data);
  },

  getBillingSummary() {
    return api.get('/billing/summary').then((r) => r.data.data);
  },

  getLowStock() {
    return api
      .get('/inventory', { params: { lowStock: 'true', limit: 50 } })
      .then((r) => r.data.data);
  },

  getTreatmentPlans(patientId) {
    return api
      .get(`/patients/${patientId}/treatment-plans`, { params: { status: 'active', limit: 5 } })
      .then((r) => r.data.data.plans);
  },

  getAccountingSummary() {
    return api.get('/accounting/summary').then((r) => r.data.data);
  },
};
