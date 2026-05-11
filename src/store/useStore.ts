import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authApi } from "../services/api";
import { fetchAndCache, getCached, clearCache, SyncPayload } from "../services/cache";
import { clearAllLocalData } from "../services/db";

interface ActiveSeance {
  id:         string;
  classe:     string;
  matiere:    string | null;
  started_at: string;
  session_id: string;
}

interface AppStore {
  // Auth
  user:               SyncPayload["profile"] | null;
  token:              string | null;
  loading:            boolean;
  mustChangePassword: boolean;   // ← flag premier connexion

  // Sync / cache
  syncData:  SyncPayload | null;
  isOnline:  boolean;
  lastSync:  string | null;

  // Séance en cours
  activeSeance: ActiveSeance | null;

  // Actions
  login:            (identifier: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout:           () => Promise<void>;
  syncOffline:      (online: boolean) => Promise<void>;
  setActiveSeance:  (s: ActiveSeance | null) => void;
  setIsOnline:      (v: boolean) => void;
  clearPasswordFlag: () => void;
}

export const useStore = create<AppStore>((set, get) => ({
  user:               null,
  token:              null,
  loading:            false,
  mustChangePassword: false,
  syncData:           null,
  isOnline:           true,
  lastSync:           null,
  activeSeance:       null,

  setIsOnline:      (v) => set({ isOnline: v }),
  setActiveSeance:  (s) => set({ activeSeance: s }),
  clearPasswordFlag: () => set({ mustChangePassword: false }),

  login: async (identifier, password) => {
    set({ loading: true });
    try {
      const { data } = await authApi.login(identifier, password);
      await AsyncStorage.setItem("access_token",  data.access_token);
      await AsyncStorage.setItem("refresh_token", data.refresh_token);

      const mustChange = data.must_change_password ?? false;
      set({ token: data.access_token, loading: false, mustChangePassword: mustChange });

      // Ne pas syncer offline si l'utilisateur doit d'abord changer son mot de passe
      if (!mustChange) {
        await get().syncOffline(true);
      }

      return { mustChangePassword: mustChange };
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  logout: async () => {
    await clearCache();          // AsyncStorage (tokens + snapshot JSON)
    clearAllLocalData();         // SQLite (queue offline + rapports cache)
    set({ user: null, token: null, syncData: null, activeSeance: null, mustChangePassword: false });
  },

  syncOffline: async (online) => {
    if (online) {
      try {
        const payload = await fetchAndCache();
        set({ syncData: payload, user: payload.profile, lastSync: payload.synced_at });
        return;
      } catch {
        // fallback cache si réseau défaillant
      }
    }
    const cached = await getCached();
    if (cached) {
      set({ syncData: cached, user: cached.profile });
    }
  },
}));
