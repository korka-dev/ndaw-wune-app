import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// const API_URL = "https://api.ndawwune.cloud/api/v1"; // Production Cloud
const API_URL = "http://192.168.1.108:8000/api/v1"; // Développement Local Wi-Fi

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = await AsyncStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refresh });
          await AsyncStorage.setItem("access_token",  data.access_token);
          await AsyncStorage.setItem("refresh_token", data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          await AsyncStorage.clear();
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login:          (identifier: string, password: string) =>
    api.post("/auth/login", { identifier, password }),
  me:             () => api.get("/auth/me"),
  resetPassword: (identifier: string, new_password: string, confirm_password: string) =>
    api.post("/auth/reset-password", { identifier, new_password, confirm_password }),
};

export const syncApi = {
  sync:       () => api.get("/app/sync"),
  invalidate: () => api.post("/app/sync/invalidate"),
};

export const seancesApi = {
  start:  (d: unknown) => api.post("/app/seances/start", d),
  finish: (id: string, d: unknown) => api.post(`/app/seances/${id}/finish`, d),
  active: () => api.get("/app/seances/active"),
  list:   () => api.get("/app/seances"),
};

export const rapportsApi = {
  submit: (d: unknown) => api.post("/app/rapports", d),
  list:   () => api.get("/app/rapports"),
};

export const rapportJournalierApi = {
  submit: (d: unknown) => api.post("/app/rapports/journalier", d),
  list:   (page = 0, limit = 20) =>
    api.get("/app/rapports/journalier", { params: { skip: page * limit, limit } }),
};

export const superviseurApi = {
  sync: () => api.get("/app/supervisor/sync"),
};
