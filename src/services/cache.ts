/**
 * Service de cache offline.
 * Stocke le SyncPayload dans AsyncStorage pour utilisation sans connexion.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncApi } from "./api";

const SYNC_KEY      = "ared_sync_payload";
const SYNC_DATE_KEY = "ared_sync_date";

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

export async function clearCache(): Promise<void> {
  await AsyncStorage.multiRemove([SYNC_KEY, SYNC_DATE_KEY, "access_token", "refresh_token", "user_role"]);
}
