import axios from "axios";
import Constants from "expo-constants";
import { getSecure, setSecure, clearAuthTokens } from "./secureStorage";
import { dispatchAuthFailure } from "./authEvents";

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
  const token = await getSecure("access_token");
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
      const refresh = await getSecure("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, {
            refresh_token: refresh,
          });
          await setSecure("access_token",  data.access_token);
          await setSecure("refresh_token", data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          // Refresh expiré → effacer les tokens et forcer le retour au login
          await clearAuthTokens();
          dispatchAuthFailure();
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

  /** Enregistre une mise en pause (fire-and-forget, offline-queued si hors ligne). */
  pause: (id: string, paused_at: string) =>
    api.post(`/app/seances/${id}/pause`, { paused_at }),

  /** Ferme la dernière pause et recalcule le total. */
  resume: (id: string, resumed_at: string) =>
    api.post(`/app/seances/${id}/resume`, { resumed_at }),

  /**
   * Termine la séance. Inclut les pauses pour réconciliation offline.
   */
  finish: (id: string, d: {
    finished_at: string;
    duree_minutes: number;
    nb_eleves_presents?: number | null;
    pauses?: { paused_at: string; resumed_at?: string | null }[];
    total_paused_minutes?: number;
  }) => api.post(`/app/seances/${id}/finish`, d),

  active: () => api.get("/app/seances/active"),
  list:   () => api.get("/app/seances"),

  /** Signale un créneau planifié manqué (non démarré après son heure de fin). */
  reportMissed: (d: {
    session_id:           string;
    planning_segment_id?: string | null;
    classe:               string;
    matiere?:             string | null;
    date_seance:          string;
    heure_debut:          string;
    heure_fin:            string;
  }) => api.post("/app/seances/report-missed", d),
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

  /** Élèves par classe pour les enseignants assignés à ce superviseur. */
  eleves: () => api.get("/app/supervisor/eleves"),

  /** Liste les évaluations soumises par ce superviseur. */
  listEvaluations: (params?: { date_debut?: string; date_fin?: string; classe?: string }) =>
    api.get("/app/supervisor/evaluations", { params }),

  /**
   * Soumet un lot d'évaluations.
   * evaluations[] : { eleve_id, competence, resultat, date_eval, commentaire? }
   */
  submitEvaluations: (evaluations: {
    eleve_id:    string;
    competence:  string;
    resultat:    string;   // "acquis" | "en_cours" | "a_aider"
    date_eval:   string;   // YYYY-MM-DD
    commentaire?: string;
  }[]) => api.post("/app/supervisor/evaluations", { evaluations }),

  /** Pointage de présence des enseignants déjà enregistré pour une date (par défaut aujourd'hui). */
  getPresenceCheck: (date_jour?: string) =>
    api.get("/app/supervisor/presences", { params: date_jour ? { date_jour } : undefined }),

  /** Enregistre/valide le pointage de présence du jour (batch). */
  submitPresenceCheck: (date_jour: string, entries: {
    teacher_id: string;
    present:    boolean;
    motif?:     string | null;
  }[]) => api.post("/app/supervisor/presences", { date_jour, entries }),

  /** Difficultés signalées par les enseignants assignés (rapports journaliers). */
  getDifficultes: () => api.get("/app/supervisor/difficultes"),
};

// ── Ressources pédagogiques ───────────────────────────────────────────────────
export const ressourcesApi = {
  list: () => api.get("/app/ressources"),
  /** Retourne les données binaires du fichier (responseType: 'blob'). */
  download: (id: string) =>
    api.get(`/app/ressources/${id}/download`, { responseType: "blob" }),
  /** URL directe pour ouvrir via Linking (authentification par header non possible). */
  downloadUrl: (id: string) => `${api.defaults.baseURL}/app/ressources/${id}/download`,
};
