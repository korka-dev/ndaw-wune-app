/**
 * Composant invisible — surveille la connectivité réseau et synchronise
 * les données en temps quasi-réel.
 *
 * Stratégie :
 *   • Vérification réseau toutes les 15 s (détection offline/online rapide).
 *   • Synchronisation complète toutes les 30 s quand l'app est en ligne
 *     (planning, profil, session active). Le serveur répond depuis son cache
 *     Redis en < 5 ms si rien n'a changé → très léger.
 *   • Sync immédiate au retour en ligne (flush queue + fetch fresh data).
 *   • Sync immédiate quand l'app revient au premier plan (AppState "active").
 *   • Protection anti-doublon : une seule sync à la fois (isSyncing).
 *
 * Compatible Android 5+ (API 21) et iOS 13+.
 * isInternetReachable peut être null sur certains Android anciens ;
 * on considère alors l'appareil en ligne si isConnected est vrai.
 */
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Network from "expo-network";
import { router } from "expo-router";
import { useStore } from "../store/useStore";
import { scheduleSessionAlerts, updateCachedSegments } from "../services/notifications";
import { syncRessourcesOffline } from "../services/ressources";
import { onAuthFailure } from "../services/authEvents";

const NETWORK_CHECK_MS = 15_000;   // 15 s — vérification connectivité
const SYNC_INTERVAL_MS = 30_000;   // 30 s — sync données quand online

export default function NetworkWatcher() {
  const { setIsOnline, syncOffline } = useStore();

  const lastOnline  = useRef<boolean>(true);
  const isSyncing   = useRef<boolean>(false);   // anti-doublon
  const lastSyncAt  = useRef<number>(0);         // timestamp de la dernière sync

  // ── Sync protégée contre les appels simultanés ─────────────────────────────
  const doSync = async (reason: string) => {
    if (isSyncing.current) return;
    const { token, isOnline: online } = useStore.getState();
    if (!token || !online) return;

    isSyncing.current = true;
    console.log(`[Sync] Déclenchement — ${reason}`);
    try {
      await syncOffline(true);
      lastSyncAt.current = Date.now();
      // Replanifier les alertes vocales avec le planning frais
      const freshPlanning = useStore.getState().syncData?.planning ?? [];
      updateCachedSegments(freshPlanning);
      scheduleSessionAlerts(freshPlanning).catch(() => {});
      // Téléchargement automatique des ressources en arrière-plan
      syncRessourcesOffline().catch(() => {});
    } catch (e) {
      console.warn("[Sync] Erreur :", e);
    } finally {
      isSyncing.current = false;
    }
  };

  useEffect(() => {
    // ── 0. Auth failure — refresh token expiré ────────────────────────────────
    // Quand l'intercepteur axios ne peut plus rafraîchir le token, il émet un
    // événement plutôt que de naviguer directement (pas d'accès au router depuis
    // axios). On réagit ici : on vide le store et on renvoie vers l'accueil.
    onAuthFailure(() => {
      useStore.setState({
        user:               null,
        token:              null,
        syncData:           null,
        activeSeance:       null,
        mustChangePassword: false,
      });
      router.replace("/login");
    });

    // ── 1. AppState — sync quand l'app revient au premier plan ────────────────
    const appStateSub = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          // Sync seulement si la dernière remonte à plus de 30 s
          if (Date.now() - lastSyncAt.current > SYNC_INTERVAL_MS) {
            doSync("retour premier plan");
          }
        }
      }
    );

    // ── 2. Vérification réseau toutes les 15 s ────────────────────────────────
    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const online =
          !!state.isConnected &&
          (state.isInternetReachable === null ? true : !!state.isInternetReachable);

        const wasOffline = !lastOnline.current;
        lastOnline.current = online;
        setIsOnline(online);

        if (online && wasOffline) {
          // Retour en ligne : doSync fait lui-même le flush + fetch dans syncOffline
          console.log("[Network] Connexion rétablie — synchronisation");
          await doSync("retour en ligne");
        }
      } catch (e) {
        console.warn("[Network] Erreur vérification réseau :", e);
      }
    };

    // ── 3. Sync périodique toutes les 30 s quand en ligne ────────────────────
    const periodicSync = () => doSync("polling 30 s");

    // Démarrage
    checkNetwork();
    const netTimer  = setInterval(checkNetwork,  NETWORK_CHECK_MS);
    const syncTimer = setInterval(periodicSync,   SYNC_INTERVAL_MS);

    return () => {
      clearInterval(netTimer);
      clearInterval(syncTimer);
      appStateSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
