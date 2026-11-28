/**
 * Rafraîchit les données d'un écran quand l'utilisateur y revient : à chaque
 * retour sur l'écran (focus) et à chaque retour dans l'app, seulement si l'écran
 * est affiché, en ligne, et au plus une fois par `intervalleMs`.
 *
 * Les modifications faites dans le tableau de bord apparaissent ainsi sans geste
 * manuel, sans interroger le serveur en boucle (batterie, données mobiles).
 * Le premier chargement reste celui de l'écran (au montage) : pas de doublon.
 */
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useStore } from "../store/useStore";

export const RAFRAICHISSEMENT_MIN_MS = 60_000;

export function useRafraichissementAuto(recharger: () => unknown, intervalleMs = RAFRAICHISSEMENT_MIN_MS): void {
  const rechargerRef = useRef(recharger);
  rechargerRef.current = recharger;
  const dernier = useRef(Date.now());
  const affiche = useRef(false);

  const lancer = useCallback(() => {
    if (!affiche.current || !useStore.getState().isOnline) return;
    if (Date.now() - dernier.current < intervalleMs) return;
    dernier.current = Date.now();
    Promise.resolve().then(() => rechargerRef.current()).catch(() => {});
  }, [intervalleMs]);

  useFocusEffect(useCallback(() => {
    affiche.current = true;
    lancer();
    return () => { affiche.current = false; };
  }, [lancer]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (etat) => { if (etat === "active") lancer(); });
    return () => sub.remove();
  }, [lancer]);
}
