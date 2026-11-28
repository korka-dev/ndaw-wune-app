/**
 * Composant invisible — surveille la connectivité réseau et synchronise
 * les données en temps quasi-réel.
 *
 * Stratégie (économie de batterie et de données) :
 *   • Rien ne tourne quand l'app est en arrière-plan : minuteries arrêtées.
 *   • Au premier plan : vérification réseau toutes les 30 s, synchronisation
 *     toutes les 5 min. Si rien n'a changé, le serveur répond 304 (sans corps).
 *   • Sync immédiate au retour dans l'app (dernière sync > 1 min) : les
 *     modifications faites dans le tableau de bord arrivent dès l'ouverture.
 *   • Sync immédiate au retour en ligne (flush queue + fetch fresh data).
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
import { scheduleSessionAlerts, updateCachedSegments, configurerRappels } from "../services/notifications";
import { syncRessourcesOffline } from "../services/ressources";
import { onAuthFailure, onPasswordChangeRequired } from "../services/authEvents";
import { setSecure } from "../services/secureStorage";
import { estInspecteur } from "../utils/roleRoute";
import { cacheInspecteur } from "../services/inspecteurCache";

const NETWORK_CHECK_MS   = 30_000;      // 30 s — vérification connectivité (premier plan)
const SYNC_INTERVAL_MS   = 5 * 60_000;  // 5 min — sync périodique (premier plan)
const SYNC_AU_RETOUR_MS  = 60_000;      // retour dans l'app : sync si la dernière date de plus d'1 min
const RESSOURCES_MS      = 60 * 60_000; // téléchargement auto des ressources : au plus 1 fois par heure

export default function NetworkWatcher() {
  const { setIsOnline, syncOffline } = useStore();

  const lastOnline  = useRef<boolean>(true);
  const isSyncing   = useRef<boolean>(false);   // anti-doublon
  const lastSyncAt  = useRef<number>(0);         // timestamp de la dernière sync
  const lastRessources = useRef<number>(0);      // dernier passage du téléchargement auto

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
      // Lot L8 : l'inspecteur n'a ni planning, ni rappel de séance, ni ressource
      // tuteur à télécharger — rien d'autre à faire que le profil (syncOffline).
      if (estInspecteur(useStore.getState().user?.role)) return;
      // Replanifier les alertes vocales avec le planning frais
      const freshPlanning = useStore.getState().syncData?.planning ?? [];
      configurerRappels(useStore.getState().syncData?.parametres_terrain?.rappels_max_par_jour);
      updateCachedSegments(freshPlanning);
      scheduleSessionAlerts(freshPlanning).catch(() => {});
      // Téléchargement automatique des ressources (Wi-Fi) : au plus 1 fois par heure.
      if (Date.now() - lastRessources.current > RESSOURCES_MS) {
        lastRessources.current = Date.now();
        syncRessourcesOffline().catch(() => {});
      }
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
      cacheInspecteur.purger().catch(() => {});
      useStore.setState({
        user:               null,
        token:              null,
        syncData:           null,
        activeSeance:       null,
        mustChangePassword: false,
      });
      router.replace("/login");
    });

    // APP-08 : l'API exige le changement du mot de passe temporaire.
    onPasswordChangeRequired(() => {
      setSecure("must_change_password", "1").catch(() => {});
      useStore.setState({ mustChangePassword: true });
      router.replace("/change-password");
    });

    // ── 1. Vérification réseau ───────────────────────────────────────────────
    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const online =
          !!state.isConnected &&
          (state.isInternetReachable === null ? true : !!state.isInternetReachable);

        const wasOffline = !lastOnline.current;
        lastOnline.current = online;
        // Pas de mise à jour du store si rien ne change (évite de redessiner les écrans).
        if (useStore.getState().isOnline !== online) setIsOnline(online);

        if (online && wasOffline) {
          // Retour en ligne : doSync fait lui-même le flush + fetch dans syncOffline
          console.log("[Network] Connexion rétablie — synchronisation");
          await doSync("retour en ligne");
        }
      } catch (e) {
        console.warn("[Network] Erreur vérification réseau :", e);
      }
    };

    // ── 2. Minuteries actives seulement au premier plan ──────────────────────
    let netTimer: ReturnType<typeof setInterval> | null = null;
    let syncTimer: ReturnType<typeof setInterval> | null = null;
    const demarrer = () => {
      if (!netTimer)  netTimer  = setInterval(checkNetwork, NETWORK_CHECK_MS);
      if (!syncTimer) syncTimer = setInterval(() => doSync("périodique 5 min"), SYNC_INTERVAL_MS);
    };
    const arreter = () => {
      if (netTimer)  { clearInterval(netTimer);  netTimer = null; }
      if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    };

    // ── 3. AppState — reprise au premier plan, pause en arrière-plan ─────────
    const appStateSub = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          demarrer();
          checkNetwork().then(() => {
            if (Date.now() - lastSyncAt.current > SYNC_AU_RETOUR_MS) doSync("retour premier plan");
          });
        } else if (state === "background") {
          arreter();
        }
      }
    );

    // Démarrage : vérification réseau immédiate + sync si déjà en ligne au cold start
    checkNetwork().then(() => {
      // lastOnline démarre à true, donc wasOffline=false dans checkNetwork —
      // la sync sur "retour en ligne" n'est pas déclenchée. On la force ici.
      if (lastOnline.current) doSync("démarrage à froid");
    });
    if (AppState.currentState !== "background") demarrer();

    return () => {
      arreter();
      appStateSub.remove();
      onAuthFailure(null);
      onPasswordChangeRequired(null);  // évite la fuite si NetworkWatcher démonte (ex: logout)
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
