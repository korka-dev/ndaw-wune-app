import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authApi } from "../services/api";
import { setSecure, getSecure, deleteSecure, clearAuthTokens } from "../services/secureStorage";
import { fetchAndCache, fetchAndCacheSupervisor, getCached, clearCache, SyncPayload, derniereSyncInchangee } from "../services/cache";
import { clearSessionLocalData, purgerSaisiesEnvoyees, setLocalOwner } from "../services/db";
import { flushQueue } from "../services/queue";
import { cancelAllSessionAlerts } from "../services/notifications";
import { estInspecteur, roleEspace } from "../utils/roleRoute";
import { cacheInspecteur } from "../services/inspecteurCache";

const ACTIVE_SEANCE_KEY = "active_seance";

/** Lot L8 : profil inspecteur reçu de /auth/me → cache du compte (un autre
 *  compte précédent est purgé par ouvrir()). */
/** Profil mis en cache par une sync : son rôle devient le rôle d'espace (cf. roleEspace). */
function profilEspace<T extends { role?: string | null }>(profile: T): T {
  return { ...profile, role: roleEspace(profile as any) ?? profile.role } as T;
}

async function memoriserProfilInspecteur(me: { id: unknown }): Promise<void> {
  await cacheInspecteur.ouvrir(String(me.id));
  cacheInspecteur.set("profil", me);
}

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
      const [cachedRaw, activeSeanceRaw, storedRole] = await Promise.all([
        getCached(),
        AsyncStorage.getItem(ACTIVE_SEANCE_KEY),
        getSecure("user_role").catch(() => null),
      ]);
      // Lot L8 : l'inspecteur n'a ni cache de sync ni séance — on ne réutilise
      // jamais un cache tuteur/superviseur pour lui.
      const inspecteur = estInspecteur(storedRole);
      const cached = inspecteur ? null : cachedRaw;
      if (inspecteur) {
        // Profil et données de l'IEF depuis le cache persistant du compte,
        // puis rafraîchissement si le réseau répond.
        const owner = await cacheInspecteur.dernierProprietaire();
        if (owner) {
          await cacheInspecteur.ouvrir(owner);
          const profil = cacheInspecteur.get<SyncPayload["profile"]>("profil");
          if (profil) set({ user: profil });
        }
        try {
          const { data: me } = await authApi.me();
          await memoriserProfilInspecteur(me);
          set({ user: me });
        } catch {
          console.warn("[Store] Inspecteur : profil hors ligne (cache)");
        }
      } else if (cached) {
        set({ syncData: cached, user: profilEspace(cached.profile), lastSync: cached.synced_at });
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
          const role = roleEspace(me) ?? me.role;
          set({ user: { ...me, role } });
          await setSecure("user_role", role).catch(() => {});
          console.log("[Store] Profil récupéré via /auth/me (pas de cache)");
        } catch {
          console.warn("[Store] Impossible de récupérer le profil au démarrage");
        }
      }
      if (activeSeanceRaw && !inspecteur) {
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
        // Le profil (et donc l'espace : tuteur, superviseur, inspecteur) est
        // indispensable : sans lui l'app ouvrait l'espace tuteur par défaut.
        // Un second essai couvre un réseau instable juste après la connexion.
        let me: any = null;
        let meErr: unknown = null;
        for (let essai = 0; essai < 2 && !me; essai++) {
          try { me = (await authApi.me()).data; } catch (e) { meErr = e; }
        }
        if (!me) {
          await clearAuthTokens().catch(() => {});
          set({ token: null });
          throw meErr ?? new Error("Profil indisponible");
        }
        const role = roleEspace(me);
        if (!role) {
          // Compte du seul tableau de bord (administrateur, évaluateur).
          await clearAuthTokens().catch(() => {});
          set({ token: null });
          throw Object.assign(new Error("Compte du tableau de bord"), {
            response: { data: { detail: "Ce compte sert au tableau de bord et n'a pas d'espace dans l'application. Contactez l'administrateur." } },
          });
        }
        const profil = { ...me, role };
        // APP-20 : le cache hors ligne d'un autre compte n'est jamais montré.
        try {
          const cached = await getCached();
          if (cached?.profile?.id && String(cached.profile.id) !== String(me.id)) await clearCache();
        } catch {}
        if (estInspecteur(role)) await memoriserProfilInspecteur(profil);
        else await cacheInspecteur.purger(); // jamais de données IEF pour un autre rôle
        set({ user: profil });
        await setSecure("user_role", role);

        // syncOffline route lui-même vers la bonne sync (enseignant ou superviseur)
        await get().syncOffline(true);
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
    await cacheInspecteur.purger(); // Lot L8 : cache (mémoire + téléphone) de l'espace inspecteur
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
      const role = get().user?.role ?? (await getSecure("user_role").catch(() => null));

      // Lot L8 : l'inspecteur consulte en lecture seule. Pas de /app/sync (403),
      // pas de file hors ligne, pas de purge : seul le profil est rafraîchi.
      if (estInspecteur(role)) {
        try {
          const { data: me } = await authApi.me();
          await memoriserProfilInspecteur(me);
          set({ user: me, lastSync: new Date().toISOString() });
        } catch (e) {
          console.warn("[Store] Profil inspecteur non rafraîchi :", e);
        }
        return;
      }

      try {
        const payload = role === "superviseur"
          ? await fetchAndCacheSupervisor()
          : await fetchAndCache();
        // Le profil de la sync superviseur garde l'espace superviseur (un ancien
        // compte coordonnateur y est rangé, cf. roleEspace).
        const profile = role === "superviseur" ? { ...payload.profile, role: "superviseur" } : payload.profile;
        // 304 (rien de changé) : on ne remplace pas syncData, les écrans ne se redessinent pas.
        if (derniereSyncInchangee && get().syncData) set({ lastSync: new Date().toISOString() });
        else set({ syncData: payload, user: profile as any, lastSync: payload.synced_at });
      } catch {
        // Réseau défaillant → fallback cache local.
        // On ne sort PAS ici : si l'appareil est en ligne, la queue doit quand
        // même être vidée (flushQueue détecte lui-même les vraies erreurs réseau).
        const cached = await getCached();
        if (cached) set({ syncData: cached, user: profilEspace(cached.profile) });
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

    // Hors-ligne : charger depuis le cache local (jamais pour un inspecteur)
    const role = get().user?.role ?? (await getSecure("user_role").catch(() => null));
    if (estInspecteur(role)) return;
    const cached = await getCached();
    if (cached) {
      set({ syncData: cached, user: profilEspace(cached.profile) });
    }
  },
}));

// Le propriétaire des données locales suit toujours le compte connecté : la file
// hors ligne n'est jamais lue ni envoyée sous l'identité d'un autre utilisateur.
useStore.subscribe((state) => {
  setLocalOwner(state.user?.id ? String(state.user.id) : null);
});
