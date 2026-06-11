/**
 * Service de cache offline.
 * Stocke le SyncPayload dans AsyncStorage pour utilisation sans connexion.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncApi } from "./api";

const SYNC_KEY      = "ared_sync_payload";
const SYNC_DATE_KEY = "ared_sync_date";
const SUP_EVALS_KEY  = "ared_supervisor_evaluations";
const SUP_ELEVES_KEY = "ared_supervisor_eleves";

export interface SyncPayload {
  synced_at: string;
  profile: {
    id: string; name: string; title: string | null;
    email: string | null; phone: string | null;
    role: string; school_id: string | null; classes: string[] | null;
    langue_enseignement?: string | null;
  };
  school: {
    id: string; name: string; region: string | null;
    city: string | null; director: string | null;
  } | null;
  active_session: {
    id: string; name: string; date_debut: string; date_fin: string;
    status: string; description: string | null;
  } | null;
  planning: {
    id: string; jour: number; heure_debut: string; heure_fin: string;
    classe: string; matiere: string | null;
    titre: string | null;          // titre du segment (ex: "Accueil & rituels")
  }[];
  eleves?: { id: string; nom: string; prenom: string | null; classe: string }[];
  stats?: {
    nb_eleves?: number;
    nb_tests?: number;
    nb_fiches?: number;
  };
}

export async function fetchAndCache(): Promise<SyncPayload> {
  const { data } = await syncApi.sync();
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(data));
  await AsyncStorage.setItem(SYNC_DATE_KEY, new Date().toISOString());
  return data as SyncPayload;
}

export async function getCached(): Promise<SyncPayload | null> {
  const raw = await AsyncStorage.getItem(SYNC_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as SyncPayload;
}

export async function getLastSyncDate(): Promise<string | null> {
  return AsyncStorage.getItem(SYNC_DATE_KEY);
}

/** Met à jour la langue d'enseignement dans le cache local (préférence appareil). */
export async function setCachedLangueEnseignement(langue: string): Promise<void> {
  const cached = await getCached();
  if (!cached) return;
  cached.profile.langue_enseignement = langue;
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(cached));
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.multiRemove([SYNC_KEY, SYNC_DATE_KEY, "access_token", "refresh_token", "user_role", SUP_EVALS_KEY, SUP_ELEVES_KEY]);
}

/** Cache local des classes/élèves du superviseur, pour consultation hors-ligne. */
export async function getCachedSupEleves(): Promise<any[] | null> {
  const raw = await AsyncStorage.getItem(SUP_ELEVES_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedSupEleves(classes: any[]): Promise<void> {
  await AsyncStorage.setItem(SUP_ELEVES_KEY, JSON.stringify(classes));
}

/**
 * Cache local des évaluations élèves (superviseur), pour relecture/écriture hors-ligne.
 * Stocké sous forme de paires [clé, résultat] — clé = "<competence>:<eleve_id>".
 */
export async function getCachedEvaluations(): Promise<[string, string][]> {
  const raw = await AsyncStorage.getItem(SUP_EVALS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function setCachedEvaluations(entries: [string, string][]): Promise<void> {
  await AsyncStorage.setItem(SUP_EVALS_KEY, JSON.stringify(entries));
}
