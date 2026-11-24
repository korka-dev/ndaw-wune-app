import axios from "axios";
import Constants from "expo-constants";
import { getSecure, setSecure, clearAuthTokens } from "./secureStorage";
import {
  dispatchAuthFailure,
  dispatchPasswordChangeRequired,
  dispatchUpdateRequired,
} from "./authEvents";
import { APP_VERSION, isPasswordChangeRequiredError, isUpdateRequiredError } from "./appVersion";
import { corpsSignalement, doitSignaler, nouvelIdRequete } from "./support";

/**
 * URL de base de l'API.
 * Priorité :
 *   1. Variable d'environnement EXPO_PUBLIC_API_URL (définie dans .env.local)
 *   2. Extra dans app.json (legacy)
 *   3. Fallback développement local
 *
 * En production : EXPO_PUBLIC_API_URL de .env.production, identique aux profils
 * d'eas.json (contrôle : npm run verifier:bundle, APP-42).
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
  // APP-46 : l'API peut refuser (426) une version trop ancienne.
  config.headers["X-App-Version"] = APP_VERSION;
  // APP-45 : référence de requête, reprise dans les journaux de l'API.
  config.headers["X-Request-ID"] = nouvelIdRequete();
  return config;
});

// ── Rafraîchissement mutualisé ────────────────────────────────────────────────
// Plusieurs requêtes peuvent échouer en 401 au même instant (expiration du
// token pendant que plusieurs écrans appellent l'API en parallèle). Sans
// mutex, chacune déclencherait son propre POST /auth/refresh avec le même
// refresh token — inutile, et risqué si le backend venait à faire tourner les
// refresh tokens à usage unique (un seul des appels concurrents réussirait,
// les autres provoqueraient une déconnexion forcée alors que la session était
// valide). Toutes les requêtes en attente partagent donc la même promesse.
let refreshPromise: Promise<{ access_token: string; refresh_token: string }> | null = null;

/** Marque une erreur de refresh comme « session réellement invalide », par
 *  opposition à un simple incident réseau ou serveur. */
export class SessionInvalide extends Error {}

/**
 * Faut-il déconnecter l'utilisateur après un échec du refresh ?
 *
 * OUI uniquement si le serveur a explicitement rejeté la session (401/403) ou
 * s'il n'y a plus de refresh token en mémoire.
 * NON en cas d'incident réseau (aucune réponse), de timeout ou d'erreur 5xx :
 * la session reste valide, seul le réseau a fait défaut.
 */
export function doitDeconnecter(e: unknown): boolean {
  if (e instanceof SessionInvalide) return true;
  const status = (e as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

async function performSharedRefresh(): Promise<{ access_token: string; refresh_token: string }> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = await getSecure("refresh_token");
      if (!refresh) throw new SessionInvalide("Aucun refresh token disponible.");
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {
        refresh_token: refresh,
      }, { timeout: 15000, headers: { "X-App-Version": APP_VERSION } });
      await setSecure("access_token",  data.access_token);
      await setSecure("refresh_token", data.refresh_token);
      return data;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ── Intercepteur réponse : refresh automatique sur 401 ───────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // APP-45 : panne serveur signalée au support (sans attendre, sans bloquer).
    if (doitSignaler(error)) {
      axios.post(`${API_URL}/client-errors`, corpsSignalement(error, APP_VERSION), {
        timeout: 5000, headers: { "X-App-Version": APP_VERSION },
      }).catch(() => {});
    }

    // APP-46 : version trop ancienne → écran de mise à jour (file conservée).
    if (isUpdateRequiredError(error)) {
      const d = error.response?.data ?? {};
      dispatchUpdateRequired({
        minVersion:    d.min_version ?? null,
        latestVersion: d.latest_version ?? null,
      });
      return Promise.reject(error);
    }

    // APP-08 : compte non activé → changement du mot de passe temporaire.
    if (isPasswordChangeRequiredError(error)) {
      dispatchPasswordChangeRequired();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const data = await performSharedRefresh();
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch (e) {
        // Ne déconnecter QUE si le serveur a explicitement rejeté la session.
        //
        // Auparavant, tout échec du refresh effaçait les tokens : une coupure
        // réseau au mauvais moment, un timeout, ou un 502 pendant un
        // redéploiement du backend renvoyaient l'utilisateur au login alors que
        // sa session était parfaitement valide — et il perdait sa saisie en
        // cours. Sur le terrain, avec une connexion instable, cela se produit
        // dès que le token d'accès expire pendant une zone blanche.
        if (doitDeconnecter(e)) {
          await clearAuthTokens();
          dispatchAuthFailure();
        }
        // Sinon (pas de réponse = réseau, ou 5xx = serveur indisponible) : on
        // garde la session. La requête échoue, l'app bascule sur son cache
        // hors-ligne et réessaiera au prochain appel.
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

  /** Déconnexion : révoque le token d'accès côté serveur. */
  /** Envoie aussi le refresh_token pour qu'il soit révoqué côté serveur, pas
   *  seulement le token d'accès — sinon un refresh token volé survivrait au logout. */
  logout: (refresh_token?: string | null) =>
    api.post("/auth/logout", refresh_token ? { refresh_token } : {}),

  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }),
};

// ── Synchronisation offline ───────────────────────────────────────────────────
export const versionApi = {
  /** Politique de version publiée par l'API (publique). */
  policy: () => api.get<{ min_version: string | null; latest_version: string | null }>("/app-version"),
};

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
    client_seance_id?: string | null;   // identifiant local stable (APP-16/18)
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

  /** Séance faite hors ligne envoyée en une fois (idempotente, APP-16/18). */
  complete: (d: Record<string, unknown>) => api.post("/app/seances/complete", d),

  /** Clôture d'une séance oubliée, sans durée mesurée (APP-21). */
  recover: (id: string, motif?: string | null) =>
    api.post(`/app/seances/${id}/cloturer-oubli`, { motif: motif ?? null }),
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
  /** Clé d'opération (APP-16) : l'identifiant local du rapport, stable entre
   *  l'envoi direct et les rejeux de la file — un seul rapport côté serveur. */
  submit: (d: Record<string, unknown>) => {
    const { local_id, ...body } = d as { local_id?: string } & Record<string, unknown>;
    const client_op_id = (body.client_op_id as string | undefined) ?? local_id;
    return api.post("/app/rapports/journalier", client_op_id ? { ...body, client_op_id } : body);
  },
  /** URL d'une photo d'un rapport (chargée à la demande avec le jeton, APP-37). */
  photoUrl: (server_id: string, index: number) =>
    `${API_URL}/app/rapports/journalier/${server_id}/photo/${index}`,
  list: (page = 0, limit = 20) =>
    api.get("/app/rapports/journalier", { params: { skip: page * limit, limit } }),
  /** APP-31 : un rapport envoyé ne se supprime plus. Annulation motivée : le
   *  rapport reste en base (statut « annule ») et sort des indicateurs. */
  annuler: (server_id: string, motif: string) =>
    api.post(`/app/rapports/journalier/${server_id}/annuler`, { motif }),
  /** APP-31 : correction motivée — nouvelle version, l'ancienne est conservée. */
  corriger: (server_id: string, d: Record<string, unknown> & { motif: string }) =>
    api.put(`/app/rapports/journalier/${server_id}`, d),
};

// ── Superviseur ───────────────────────────────────────────────────────────────
export const superviseurApi = {
  sync: () => api.get("/app/supervisor/sync"),

  // ── Visites pédagogiques et demandes d'appui (rapport V2, D2.3 / D9.3) ──
  /** Grilles de visite publiées utilisables pour la campagne active. */
  grillesVisite: () => api.get("/app/supervisor/grilles-visite"),
  /** Visites envoyées par ce superviseur (les plus récentes d'abord). */
  mesVisites: (params?: { skip?: number; limit?: number }) => api.get("/app/supervisor/visites", { params }),
  /** Envoi d'une visite — idempotent par client_op_id (rejeu de la file sans doublon). */
  envoyerVisite: (body: object) => api.post("/app/supervisor/visites", body),
  /** Demandes d'appui du périmètre du superviseur (ouvertes par défaut). */
  demandesAppui: (statut: string = "ouvertes") => api.get("/app/supervisor/demandes-appui", { params: { statut } }),
  agirDemande: (id: string, body: { statut?: string; commentaire?: string | null }) =>
    api.patch(`/app/supervisor/demandes-appui/${id}`, body),

  // ── Lot L7 : suivi des tuteurs affectés ──────────────────────────────────
  /** RET13 : fraîcheur des données de chaque tuteur (dernière synchro, rapports récents). */
  tuteursActivite: () => api.get("/app/supervisor/tuteurs-activite"),
  /** RET05 : rapports journaliers des tuteurs affectés (sans photos). */
  rapportsTuteurs: (params?: { teacher_id?: string; date_debut?: string; date_fin?: string; limit?: number }) =>
    api.get("/app/supervisor/rapports-tuteurs", { params }),
  /** RET05 : retour écrit du superviseur, visible par le tuteur. */
  retourRapport: (id: string, texte: string) =>
    api.put(`/app/supervisor/rapports-tuteurs/${id}/retour`, { texte }),
  /** RET03 : demandes de remplacement des tuteurs. */
  remplacementsTuteurs: (statut?: string) =>
    api.get("/app/supervisor/remplacements", { params: statut ? { statut } : undefined }),
  deciderRemplacement: (id: string, decision: "valider" | "refuser", motif?: string) =>
    api.post(`/app/supervisor/remplacements/${id}/decision`, { decision, motif }),
  /** RET13 : messages des tuteurs adressés au superviseur. */
  messages: () => api.get("/app/supervisor/messages"),
  repondreMessage: (id: string, texte: string) =>
    api.post(`/app/supervisor/messages/${id}/reponse`, { texte }),

  /** Enseignants + métadonnées de classes (sans élèves) — chargement initial. */
  eleves: () => api.get("/app/supervisor/eleves"),

  /** Élèves d'une classe spécifique — chargement à la demande. */
  classeEleves: (teacher_id: string, classe: string) =>
    api.get("/app/supervisor/classe-eleves", { params: { teacher_id, classe } }),

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
  }[], absents: { eleve_id: string; date_eval: string }[] = []) =>
    api.post("/app/supervisor/evaluations", { evaluations, absents }),

  /** Pointage de présence des enseignants déjà enregistré pour une date (par défaut aujourd'hui). */
  getPresenceCheck: (date_jour?: string) =>
    api.get("/app/supervisor/presences", { params: date_jour ? { date_jour } : undefined }),

  /** Enregistre/valide le pointage de présence du jour (batch), avec la période choisie. */
  submitPresenceCheck: (date_jour: string, entries: {
    teacher_id: string;
    present:    boolean;
    motif?:     string | null;
  }[], periode?: { semaine?: number | null; jour_cours?: number | null }) =>
    api.post("/app/supervisor/presences", {
      date_jour,
      semaine:    periode?.semaine ?? null,
      jour_cours: periode?.jour_cours ?? null,
      entries,
    }),

  /** Difficultés signalées par les enseignants assignés (rapports journaliers). */
  getDifficultes: () => api.get("/app/supervisor/difficultes"),

  /** Marque une difficulté individuelle d'un rapport comme résolue/non résolue. */
  resolveDifficulte: (
    rapportId: string,
    difficulteLabel: string,
    resolue: boolean,
    commentaireResolution?: string
  ) =>
    api.patch(`/app/supervisor/difficultes/${rapportId}/resolve`, {
      difficulte_label: difficulteLabel,
      resolue,
      commentaire_resolution: commentaireResolution,
    }),

  /** Progression (semaine/jour) des enseignants assignés, dérivée du dernier rapport soumis. */
  getProgression: () => api.get("/app/supervisor/progression"),

  /** Sujets d'évaluation avec les élèves assignés à ce superviseur. */
  evaluationSujets: () => api.get("/app/supervisor/evaluation-sujets"),

  /** Marque en lot la présence/absence des élèves tirés au sort (avant l'évaluation). */
  setTiragesPresences: (entries: { tirage_id: string; present: boolean }[]) =>
    api.post("/app/supervisor/evaluation-tirages/presences", { entries }),

  /** Soumet le résultat d'un tirage (FormData avec résultat + audio optionnel). */
  submitTirage: (tirageId: string, formData: FormData) =>
    api.post(`/app/supervisor/evaluation-tirages/${tirageId}/submit`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  /** URL directe de l'audio d'évaluation. */
  audioUrl: (filename: string) =>
    `${api.defaults.baseURL}/app/supervisor/evaluation-audio/${filename}`,

  /** Dossiers d'évaluation actifs (Seereer, Pulaar, Wolof…). */
  evaluationDocs: () => api.get("/app/supervisor/evaluation-docs"),
};

// ── Évaluations (vue enseignant) ──────────────────────────────────────────────
export const teacherEvalApi = {
  /** Évaluations des élèves de l'enseignant faites par les superviseurs. */
  listEvaluations: () => api.get("/app/teacher/evaluations"),
};

/** RET07 — le tuteur propose un changement de groupe ; l'équipe programme décide. */
export const propositionsGroupeApi = {
  mes: () => api.get("/app/propositions-groupe"),
  proposer: (d: { eleve_id: string; domaine: "lecture" | "maths"; nouveau_groupe: string; motif: string }) =>
    api.post("/app/propositions-groupe", d),
};

// ── Logs d'utilisation (fonctionnalités ouvertes) ─────────────────────────────
export const usageApi = {
  record: (events: { feature: string; at?: string }[]) =>
    api.post("/app/usage", { events }),
};

// ── Remarques / signalement de problèmes (hors application) ──────────────────
export const remarquesApi = {
  submit: (d: {
    categorie: string; message: string; ecole?: string | null;
    destinataire?: string; contexte_type?: string; contexte_id?: string;   // RET13
  }) => api.post("/app/remarques", d),
  list: () => api.get("/app/remarques"),
};

// ── Remplacement d'élève (vue enseignant) ─────────────────────────────────────
export const remplacementsApi = {
  /**
   * Remplace un titulaire par un remplaçant déjà recensé dans la même
   * classe (Base NWV 2026 / RCT). Effet immédiat sur le roster.
   */
  create: (d: {
    ancien_eleve_id: string;
    nouveau_eleve_id: string;
    motif: string;
  }) => api.post("/app/remplacements", d),
  /** RET03 : historique des remplacements du tuteur (statut, motif, décision). */
  historique: () => api.get("/app/remplacements"),
};

// ── Remplaçants (vivier — vue enseignant) ─────────────────────────────────────
export const remplacantsApi = {
  /**
   * Le tuteur recense lui-même un remplaçant pour une de ses classes (rejoint
   * le même vivier que la Base NWV 2026 / RCT).
   */
  create: (d: {
    nom: string;
    prenom: string;
    classe: string;
  }) => api.post("/app/remplacants", d),
};

// ── Ressources pédagogiques ───────────────────────────────────────────────────
export const ressourcesApi = {
  list: () => api.get("/app/ressources"),
  /** Retourne les données binaires du fichier (responseType: 'blob'). */
  download: (id: string) =>
    api.get(`/app/ressources/${id}/download`, { responseType: "blob" }),
  /** URL directe pour ouvrir via Linking (authentification par header non possible). */
  downloadUrl: (id: string) => `${api.defaults.baseURL}/app/ressources/${id}/download`,
  /** Jeton de téléchargement de courte durée (2 min, scopé à ce document) — à utiliser
   *  dans downloadUrl() pour une ouverture externe, jamais le token d'accès complet. */
  getDownloadToken: (id: string) =>
    api.post<{ token: string; expires_in: number }>(`/app/ressources/${id}/download-token`),
};

// ── Inspecteur d'IEF (lot L8, lecture seule) ──────────────────────────────────
export interface InspecteurResume {
  ief: string | null;
  nb_ecoles: number;
  nb_tuteurs: number;
  nb_superviseurs: number;
  rapports_7_jours: number;
  besoins_appui_7_jours: number;
  dernier_rapport: string | null;
  /** API 5ed6beb : noms des absents visibles par les inspecteurs (false par défaut). */
  noms_absents_visibles?: boolean;
  support_contact?: string | null;
}

export interface InspecteurEcole {
  id: string;
  nom: string;
  commune: string | null;
  code_ecole: number | string | null;
  directeur: string | null;
  nb_tuteurs: number;
  nb_superviseurs: number;
  rapports_7_jours: number;
  besoins_appui_7_jours: number;
  dernier_rapport: string | null;
}

export interface InspecteurPersonne {
  id: string;
  nom: string;
  role: "tuteur" | "superviseur";
  telephone: string | null;
  classes: string[];
  dernier_rapport: string | null;
  rapports_7_jours: number;
}

/** Même forme que les éléments de GET /app/rapports/journalier. */
export interface RapportJournalierListItem {
  id: string;
  date_rapport: string;
  ief: string | null;
  commune: string | null;
  ecole: string | null;
  superviseur: string | null;
  nom_tuteur: string | null;
  nb_absences: number;
  absents: string | null;
  semaine: number | null;
  jour_cours: number | null;
  difficultes: string[] | string | null;
  autres_difficultes: string | null;
  description_difficultes: string | null;
  directeur_venu: boolean;
  besoin_appui: boolean;
  domaines_appui: string | null;
  has_observations: boolean;
  commentaires: string | null;
  reponses_questions?: Record<string, unknown> | unknown[] | null;
  statut?: string | null;
  version?: number | null;
  statut_motif?: string | null;
  nb_photos?: number | null;
  submitted_at?: string | null;
  created_at?: string | null;
  retour_superviseur?: string | null;
  retour_le?: string | null;
  retour_par?: string | null;
}

export interface InspecteurRapportsFiltres {
  skip?: number;
  limit?: number;
  ecole_id?: string;
  auteur_id?: string;
  date_debut?: string;
  date_fin?: string;
  besoin_appui?: boolean;
  inclure_annules?: boolean;
}

export const inspecteurApi = {
  resume: () => api.get<InspecteurResume>("/app/inspecteur/resume"),
  ecoles: () => api.get<InspecteurEcole[]>("/app/inspecteur/ecoles"),
  personnes: (ecoleId: string) =>
    api.get<InspecteurPersonne[]>(`/app/inspecteur/ecoles/${ecoleId}/personnes`),
  rapports: (filtres: InspecteurRapportsFiltres = {}) =>
    api.get<{ total: number; skip: number; limit: number; items: RapportJournalierListItem[] }>(
      "/app/inspecteur/rapports", { params: filtres }),
  rapport: (id: string) => api.get<RapportJournalierListItem>(`/app/inspecteur/rapports/${id}`),
  /** URL d'une photo (chargée avec le jeton dans les en-têtes, comme APP-37). */
  photoUrl: (id: string, index: number) => `${API_URL}/app/inspecteur/rapports/${id}/photo/${index}`,
};
