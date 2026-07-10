import api from "../../lib/axios";

export const authApi = {
  login: async (email, password) => {
    const response = await api.post("/auth/login", { email, password });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get("/auth/me");
    return response.data;
  },

  updateProfile: async (data) => {
    const response = await api.put("/auth/profile", data);
    return response.data;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await api.put("/auth/password", {
      currentPassword,
      newPassword,
    });
    return response.data;
  },
};
