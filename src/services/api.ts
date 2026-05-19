import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/**
 * URL de base de l'API.
 * Priorité :
 *   1. Variable d'environnement EXPO_PUBLIC_API_URL (définie dans .env.local)
 *   2. Extra dans app.json (legacy)
 *   3. Fallback développement local
 *
 * En production, définir EXPO_PUBLIC_API_URL=https://api.ndawwune.cloud/api/v1
 * dans le fichier .env ou via les variables d'environnement EAS Build.
 */
const API_URL: string =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "http://10.0.2.2:8000/api/v1"; // Fallback émulateur Android (local)

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// ── Intercepteur requête : injection du Bearer token ─────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Intercepteur réponse : refresh automatique sur 401 ───────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = await AsyncStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, {
            refresh_token: refresh,
          });
          await AsyncStorage.setItem("access_token", data.access_token);
          await AsyncStorage.setItem("refresh_token", data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          // Refresh expiré → effacer les tokens et forcer le login
          await AsyncStorage.multiRemove(["access_token", "refresh_token", "user_role"]);
        }
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (identifier: string, password: string) =>
    api.post("/auth/login", { identifier, password }),

  me: () => api.get("/auth/me"),

  /** Changement de mot de passe (utilisateur connecté : premier login ou volontaire). */
  changePassword: (new_password: string) =>
    api.post("/auth/change-password", { new_password }),

  /**
   * Réinitialisation de mot de passe sans authentification.
   * Utilisé depuis l'écran "Mot de passe oublié".
   * Envoie : identifier (téléphone), new_password, confirm_password.
   */
  resetPassword: (identifier: string, new_password: string, confirm_password: string) =>
    api.post("/auth/reset-password", { identifier, new_password, confirm_password }),

  /** Déconnexion : révoque le token d'accès côté serveur. */
  logout: () => api.post("/auth/logout"),

  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }),
};

// ── Synchronisation offline ───────────────────────────────────────────────────
export const syncApi = {
  sync:       () => api.get("/app/sync"),
  invalidate: () => api.post("/app/sync/invalidate"),
};

// ── Séances (timer) ───────────────────────────────────────────────────────────
export const seancesApi = {
  /**
   * Démarre une séance. Le payload doit inclure :
   *   classe, session_id, date_seance, started_at
   *   + optionnels : matiere, planning_segment_id, nb_eleves_total
   */
  start: (d: {
    classe: string;
    session_id: string;
    date_seance: string;   // ISO 8601
    started_at: string;    // ISO 8601
    matiere?: string | null;
    planning_segment_id?: string | null;
    nb_eleves_total?: number | null;
  }) => api.post("/app/seances/start", d),

  finish: (id: string, d: {
    finished_at: string;   // ISO 8601
    duree_minutes: number;
    nb_eleves_presents?: number | null;
  }) => api.post(`/app/seances/${id}/finish`, d),

  active: () => api.get("/app/seances/active"),
  list:   () => api.get("/app/seances"),
};

// ── Rapports de séance ────────────────────────────────────────────────────────
export const rapportsApi = {
  submit: (d: {
    seance_id: string;
    contenu: string;
    points_positifs?: string | null;
    difficultes?: string | null;
    soumis_en_offline?: boolean;
  }) => api.post("/app/rapports", d),

  list: () => api.get("/app/rapports"),
};

// ── Rapports journaliers (tuteur / superviseur) ───────────────────────────────
export const rapportJournalierApi = {
  submit: (d: unknown) => api.post("/app/rapports/journalier", d),
  list: (page = 0, limit = 20) =>
    api.get("/app/rapports/journalier", { params: { skip: page * limit, limit } }),
};

// ── Superviseur ───────────────────────────────────────────────────────────────
export const superviseurApi = {
  sync: () => api.get("/app/supervisor/sync"),
};
