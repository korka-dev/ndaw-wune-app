/**
 * Bandeau de mise à jour OTA (EAS Update).
 *
 * Affiche un bandeau en haut de l'écran dès qu'une nouvelle version JS/TS a été
 * téléchargée en arrière-plan, avec un bouton pour l'appliquer immédiatement
 * (redémarrage instantané de l'app, sans passer par le Play Store / un nouvel
 * APK). Sans action de l'utilisateur, la mise à jour s'applique de toute façon
 * au prochain lancement normal de l'app.
 *
 * No-op silencieux en développement (Expo Go / dev client) où expo-updates
 * est désactivé.
 */
import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

export default function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { isUpdatePending, isUpdateAvailable, isDownloading, isRestarting } = Updates.useUpdates();

  // Vérifie manuellement au montage (en plus du check automatique au lancement) —
  // utile si l'app reste ouverte longtemps sans redémarrer.
  useEffect(() => {
    if (!Updates.isEnabled) return;
    Updates.checkForUpdateAsync().catch(() => {
      /* silencieux — pas de connexion ou update désactivé */
    });
  }, []);

  // Dès qu'une mise à jour est disponible mais pas encore téléchargée, on la
  // télécharge en arrière-plan sans attendre d'action de l'utilisateur.
  useEffect(() => {
    if (isUpdateAvailable && !isUpdatePending && !isDownloading) {
      Updates.fetchUpdateAsync().catch(() => {
        /* silencieux */
      });
    }
  }, [isUpdateAvailable, isUpdatePending, isDownloading]);

  if (!Updates.isEnabled || !isUpdatePending) return null;

  const applyUpdate = () => {
    Updates.reloadAsync().catch(() => {});
  };

  return (
    <View style={[s.banner, { paddingTop: insets.top + rs(8) }]}>
      <Text style={s.text}>Une nouvelle version de l&apos;application est prête</Text>
      <TouchableOpacity style={s.btn} onPress={applyUpdate} disabled={isRestarting} activeOpacity={0.8}>
        <Text style={s.btnTxt}>{isRestarting ? "Redémarrage…" : "Redémarrer"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 999,
    backgroundColor: C.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingBottom: rs(10),
    ...Platform.select({ android: { elevation: 6 }, ios: {} }),
  },
  text:  { color: "#fff", fontSize: rf(12.5), fontWeight: "600", flex: 1, marginRight: rs(10) },
  btn:   { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: rs(8), paddingHorizontal: rs(14), paddingVertical: rs(7) },
  btnTxt:{ color: "#fff", fontWeight: "700", fontSize: rf(12.5) },
});
