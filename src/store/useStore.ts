import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authApi } from "../services/api";
import { setSecure, getSecure, deleteSecure, clearAuthTokens } from "../services/secureStorage";
import { fetchAndCache, fetchAndCacheSupervisor, getCached, clearCache, SyncPayload } from "../services/cache";
import { clearSessionLocalData, purgerSaisiesEnvoyees, setLocalOwner } from "../services/db";
import { flushQueue } from "../services/queue";
import { cancelAllSessionAlerts } from "../services/notifications";

const ACTIVE_SEANCE_KEY = "active_seance";

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
  mustChangePassword: boolean;

  // Sync / cache
  syncData:  SyncPayload | null;
  isOnline:  boolean;
  lastSync:  string | null;

  // Séance en cours
  activeSeance: ActiveSeance | null;

  // Actions
  login:             (identifier: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout:            () => Promise<void>;
  syncOffline:       (online: boolean) => Promise<void>;
  hydrateFromCache:  (token: string) => Promise<void>;
  setActiveSeance:   (s: ActiveSeance | null) => void;
  setIsOnline:       (v: boolean) => void;
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

  setIsOnline:       (v) => set({ isOnline: v }),
  setActiveSeance:   (s) => {
    set({ activeSeance: s });
    // Persister dans AsyncStorage pour survie au redémarrage / background kill
    if (s) {
      AsyncStorage.setItem(ACTIVE_SEANCE_KEY, JSON.stringify(s)).catch(() => {});
    } else {
      AsyncStorage.removeItem(ACTIVE_SEANCE_KEY).catch(() => {});
    }
  },
  clearPasswordFlag: () => set({ mustChangePassword: false }),

  /**
   * Hydrate le store depuis le cache local au redémarrage de l'app.
   * Appelé depuis index.tsx quand un token valide est trouvé dans SecureStore.
   * Sans ça, Zustand repart vide et NetworkWatcher ne peut pas syncer (token null).
   */
  hydrateFromCache: async (token: string) => {
    set({ token });
    try {
      const [cached, activeSeanceRaw] = await Promise.all([
        getCached(),
        AsyncStorage.getItem(ACTIVE_SEANCE_KEY),
      ]);
      if (cached) {
        set({ syncData: cached, user: cached.profile, lastSync: cached.synced_at });
        console.log("[Store] Hydraté depuis le cache local");
      } else {
        // Pas de cache enseignant (ex : superviseur) — on récupère le profil
        // directement pour que user ne soit pas null après un redémarrage.
        try {
          const { data: me } = await authApi.me();
          // APP-20 : le cache hors ligne d'un autre compte n'est jamais montré.
          try {
            const cached = await getCached();
            if (cached?.profile?.id && String(cached.profile.id) !== String(me.id)) await clearCache();
          } catch {}
          set({ user: me });
          console.log("[Store] Profil récupéré via /auth/me (pas de cache)");
        } catch {
          console.warn("[Store] Impossible de récupérer le profil au démarrage");
        }
      }
      if (activeSeanceRaw) {
        try {
          const activeSeance = JSON.parse(activeSeanceRaw);
          set({ activeSeance });
          console.log("[Store] Séance active restaurée :", activeSeance.id);
        } catch {}
      }
    } catch (e) {
      console.warn("[Store] Erreur lors de l'hydratation du cache :", e);
    }
  },

  login: async (identifier, password) => {
    set({ loading: true });
    try {
      const { data } = await authApi.login(identifier, password);
      await setSecure("access_token",  data.access_token);
      await setSecure("refresh_token", data.refresh_token);

      const mustChange = data.must_change_password ?? false;
      // APP-08 : mémorisé pour que l'app rouvre l'écran de changement au redémarrage.
      if (mustChange) await setSecure("must_change_password", "1");
      else await deleteSecure("must_change_password").catch(() => {});
      set({ token: data.access_token, loading: false, mustChangePassword: mustChange });

      if (!mustChange) {
        try {
          const { data: me } = await authApi.me();
          // APP-20 : le cache hors ligne d'un autre compte n'est jamais montré.
          try {
            const cached = await getCached();
            if (cached?.profile?.id && String(cached.profile.id) !== String(me.id)) await clearCache();
          } catch {}
          set({ user: me });
          await setSecure("user_role", me.role);
        } catch (meErr) {
          // L'appel /me a échoué : l'utilisateur est authentifié mais sans profil.
          // On log l'erreur et on laisse l'app continuer — l'écran home gèrera le cas.
          console.warn("[Store] Impossible de charger le profil après login :", meErr);
        }

        // syncOffline route lui-même vers la bonne sync (enseignant ou superviseur)
        if (get().user?.role) {
          await get().syncOffline(true);
        }
      }

      return { mustChangePassword: mustChange };
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  logout: async () => {
    // Tenter de révoquer le token d'accès ET le refresh token côté serveur (best-effort)
    try {
      const refreshToken = await getSecure("refresh_token").catch(() => null);
      await authApi.logout(refreshToken);
    } catch {}

    await cancelAllSessionAlerts(); // Annule les rappels de séance planifiés
    await clearAuthTokens();        // SecureStore : access_token, refresh_token, user_role
    await clearCache();             // AsyncStorage : snapshot JSON de sync
    // SQLite : caches uniquement. Les saisies NON ENVOYÉES (file hors ligne,
    // rapports non synchronisés, erreurs archivées) sont conservées, rattachées
    // à leur auteur, et reprendront à sa prochaine connexion.
    clearSessionLocalData();
    // Le mapping IDs offline → IDs serveur est conservé : il sert à réconcilier
    // les séances encore en attente d'envoi (identifiants aléatoires, sans risque).
    await AsyncStorage.removeItem(ACTIVE_SEANCE_KEY).catch(() => {});
    set({
      user: null,
      token: null,
      syncData: null,
      activeSeance: null,
      mustChangePassword: false,
    });
  },

  syncOffline: async (online) => {
    if (online) {
      // 1. Rafraîchir les données depuis le serveur — chaque rôle a sa sync :
      //    enseignant → /app/sync ; superviseur → /app/supervisor/sync.
      try {
        const role = get().user?.role ?? (await getSecure("user_role").catch(() => null));
        const payload = role === "superviseur"
          ? await fetchAndCacheSupervisor()
          : await fetchAndCache();
        set({ syncData: payload, user: payload.profile, lastSync: payload.synced_at });
      } catch {
        // Réseau défaillant → fallback cache local.
        // On ne sort PAS ici : si l'appareil est en ligne, la queue doit quand
        // même être vidée (flushQueue détecte lui-même les vraies erreurs réseau).
        const cached = await getCached();
        if (cached) set({ syncData: cached, user: cached.profile });
      }

      // 2. Vider la queue offline — toute la logique est dans queue.ts (source unique)
      try {
        const count = await flushQueue();
        if (count > 0) {
          console.log(`[Store] ${count} action(s) offline synchronisée(s)`);
        }
      } catch (e) {
        console.warn("[Store] Erreur lors du flush de la queue offline :", e);
      }

      // 3. APP-14 : purge des saisies déjà envoyées au-delà de la durée fixée par ARED.
      try {
        const n = purgerSaisiesEnvoyees((get().user as any)?.retention_saisies_jours);
        if (n > 0) console.log(`[Store] ${n} saisie(s) envoyée(s) supprimée(s) du téléphone (conservation)`);
      } catch (e) {
        console.warn("[Store] Purge de conservation impossible :", e);
      }

      return;
    }

    // Hors-ligne : charger depuis le cache local
    const cached = await getCached();
    if (cached) {
      set({ syncData: cached, user: cached.profile });
    }
  },
}));

// Le propriétaire des données locales suit toujours le compte connecté : la file
// hors ligne n'est jamais lue ni envoyée sous l'identité d'un autre utilisateur.
useStore.subscribe((state) => {
  setLocalOwner(state.user?.id ? String(state.user.id) : null);
});
