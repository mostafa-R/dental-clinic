import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL || "/api/site",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let queue = [];

function redirectToLogin() {
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

// Response interceptor - unwrap the sendSuccess envelope and handle auth errors.
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (
      body &&
      typeof body === "object" &&
      body.success === true &&
      Object.prototype.hasOwnProperty.call(body, "data")
    ) {
      response.data = body.data;
    }
    return response;
  },
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") || url.includes("/auth/refresh");

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        })
          .then(() => api(original))
          .catch((e) => Promise.reject(e));
      }

      original._retry = true;
      isRefreshing = true;
      try {
        await api.post("/auth/refresh");
        queue.forEach((p) => p.resolve());
        queue = [];
        return api(original);
      } catch (refreshError) {
        queue.forEach((p) => p.reject(refreshError));
        queue = [];
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 401 && url.includes("/auth/refresh")) {
      redirectToLogin();
    }

    return Promise.reject(error);
  },
);

export default api;
