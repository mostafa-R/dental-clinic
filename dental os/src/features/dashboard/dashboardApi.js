import api from '../../lib/axios';

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats').then((r) => r.data.data),
};
