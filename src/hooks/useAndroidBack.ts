/**
 * Interception du bouton retour matériel (Android).
 *
 * Sans interception, le routeur dépile la navigation : comme l'écran de choix
 * « Tuteur / Superviseur » reste sous les onglets (user-type fait un `push`
 * vers login, et login un `replace` vers les onglets), un retour depuis un
 * onglet renvoyait l'utilisateur sur cet écran — ce qui donne l'impression
 * d'avoir été déconnecté alors que la session est intacte.
 *
 * Le handler doit renvoyer `true` pour indiquer que le retour a été traité
 * (la navigation par défaut est alors annulée), `false` pour la laisser suivre
 * son cours.
 *
 * No-op sur iOS, qui n'a pas de bouton retour matériel.
 */
import { useCallback } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";

export function useAndroidBack(handler: () => boolean): void {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", handler);
      return () => sub.remove();
    }, [handler]),
  );
}
