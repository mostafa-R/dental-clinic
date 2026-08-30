import axios from 'axios';

const siteApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

let isRefreshing = false;
let queue = [];

function redirectToPlatformLogin() {
  if (window.location.pathname !== '/platform/login') {
    window.location.href = '/platform/login';
  }
}

siteApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || '';
    const isAuthEndpoint =
      url.includes('/v1/site/auth/login') ||
      url.includes('/v1/site/auth/refresh') ||
      url.includes('/v1/site/2fa/verify-login');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        })
          .then(() => siteApi(original))
          .catch((e) => Promise.reject(e));
      }

      original._retry = true;
      isRefreshing = true;
      try {
        await siteApi.post('/v1/site/auth/refresh');
        queue.forEach((p) => p.resolve());
        queue = [];
        return siteApi(original);
      } catch (refreshError) {
        queue.forEach((p) => p.reject(refreshError));
        queue = [];
        redirectToPlatformLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 401 && url.includes('/v1/site/auth/refresh')) {
      redirectToPlatformLogin();
    }

    return Promise.reject(error);
  },
);

export default siteApi;