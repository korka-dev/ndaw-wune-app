/**
 * Composant invisible — surveille la connectivité réseau.
 *
 * Compatible Android 5+ (API 21) et iOS 13+.
 * isInternetReachable peut être null sur certains Android (anciens ou sans Google Play) ;
 * on considère alors l'appareil en ligne si isConnected est vrai.
 *
 * Au retour en ligne :
 *   1. Vide la file d'attente hors-ligne (rapports, fins de séances).
 *   2. Resynchronise le cache (planning, session active, profil).
 */
import { useEffect, useRef } from "react";
import * as Network from "expo-network";
import { useStore } from "../store/useStore";
import { flushQueue } from "../services/queue";

export default function NetworkWatcher() {
  const { setIsOnline, syncOffline } = useStore();
  // Ref pour éviter les boucles de sync infinies
  const lastOnline = useRef<boolean>(true);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const check = async () => {
      try {
        const state = await Network.getNetworkStateAsync();

        // isInternetReachable peut être null sur Android ancien → fallback sur isConnected
        const online =
          !!state.isConnected &&
          (state.isInternetReachable === null ? true : !!state.isInternetReachable);

        const wasOffline = !lastOnline.current;
        lastOnline.current = online;
        setIsOnline(online);

        if (online && wasOffline) {
          console.log("[Network] Connexion rétablie — démarrage de la synchronisation");
          // 1. Vider la file d'attente en priorité
          const synced = await flushQueue();
          if (synced > 0) {
            console.log(`[Network] ${synced} action(s) synchronisée(s) depuis la file`);
          }
          // 2. Resynchroniser le cache (planning, session, profil)
          await syncOffline(true);
        }
      } catch (e) {
        // Ne jamais planter l'app si la vérification réseau échoue
        console.warn("[Network] Erreur lors de la vérification réseau :", e);
      }
    };

    check();
    interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
