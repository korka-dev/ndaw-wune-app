/**
 * Alerte de mise à jour OTA (EAS Update).
 *
 * Dès que l'utilisateur entre dans l'app — au lancement comme au retour depuis
 * l'arrière-plan — une vérification est lancée. Si une nouvelle version JS/TS
 * existe, elle est téléchargée silencieusement en arrière-plan, puis une boîte
 * de dialogue s'affiche avec un bouton « Faire la mise à jour » qui redémarre
 * l'app sur la nouvelle version (aucun APK, aucun passage par un store).
 *
 * L'utilisateur peut reporter : la mise à jour s'applique alors d'elle-même au
 * prochain lancement. « Plus tard » ne réaffiche pas la même version pendant la
 * session en cours, pour ne pas harceler un tuteur en pleine saisie.
 *
 * No-op silencieux en développement (Expo Go / dev client), où expo-updates est
 * désactivé : `Updates.isEnabled` vaut false.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, AppState, AppStateStatus,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

export default function UpdateModal() {
  const { isUpdatePending, isUpdateAvailable, isDownloading } = Updates.useUpdates();

  // Version reportée par l'utilisateur — évite de réafficher la même alerte
  // en boucle pendant la session.
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  /* ── Vérification à l'entrée dans l'app ──────────────────────────────── */
  const check = useCallback(() => {
    if (!Updates.isEnabled) return;
    Updates.checkForUpdateAsync().catch(() => {
      /* silencieux : hors-ligne, ou serveur injoignable */
    });
  }, []);

  // Au montage (lancement de l'app)
  useEffect(() => { check(); }, [check]);

  // Au retour depuis l'arrière-plan — un tuteur laisse souvent l'app ouverte
  // plusieurs jours sans jamais la relancer vraiment.
  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const cameToForeground = appState.current.match(/inactive|background/) && next === "active";
      appState.current = next;
      if (cameToForeground) check();
    });
    return () => sub.remove();
  }, [check]);

  /* ── Téléchargement automatique dès qu'une version est disponible ────── */
  useEffect(() => {
    if (isUpdateAvailable && !isUpdatePending && !isDownloading) {
      Updates.fetchUpdateAsync().catch(() => {
        /* silencieux */
      });
    }
  }, [isUpdateAvailable, isUpdatePending, isDownloading]);

  /* ── Application de la mise à jour ───────────────────────────────────── */
  const applyUpdate = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      // Le redémarrage a échoué : on referme pour ne pas bloquer l'app, la
      // mise à jour s'appliquera au prochain lancement.
      setRestarting(false);
      setDismissed(true);
    }
  };

  const visible = Updates.isEnabled && isUpdatePending && !dismissed;
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDismissed(true)}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Feather name="download" size={rf(26)} color={C.brand} />
          </View>

          <Text style={s.title}>Mise à jour disponible</Text>
          <Text style={s.msg}>
            Une nouvelle version de Ndaw Wune est prête. L&apos;installation prend
            quelques secondes et ne consomme pas de données supplémentaires.
          </Text>

          <TouchableOpacity
            style={[s.primaryBtn, restarting && s.primaryBtnDisabled]}
            onPress={applyUpdate}
            disabled={restarting}
            activeOpacity={0.85}
          >
            {restarting ? (
              <>
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: rs(8) }} />
                <Text style={s.primaryTxt}>Mise à jour en cours…</Text>
              </>
            ) : (
              <>
                <Feather name="refresh-cw" size={rf(16)} color="#fff" style={{ marginRight: rs(8) }} />
                <Text style={s.primaryTxt}>Faire la mise à jour</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.laterBtn}
            onPress={() => setDismissed(true)}
            disabled={restarting}
            activeOpacity={0.7}
          >
            <Text style={s.laterTxt}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: rs(28),
  },
  card: {
    width: "100%", backgroundColor: C.surface, borderRadius: rs(22),
    paddingHorizontal: rs(22), paddingTop: rs(26), paddingBottom: rs(16),
    alignItems: "center",
  },
  iconWrap: {
    width: rs(58), height: rs(58), borderRadius: rs(29),
    backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center",
    marginBottom: rs(16),
  },
  title: { fontSize: rf(19), fontWeight: "800", color: C.text, textAlign: "center" },
  msg: {
    fontSize: rf(14.5), color: C.textMuted, textAlign: "center",
    lineHeight: rf(21), marginTop: rs(8), marginBottom: rs(22),
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    width: "100%", backgroundColor: C.brand,
    borderRadius: rs(14), paddingVertical: rs(15),
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryTxt: { color: "#fff", fontSize: rf(16), fontWeight: "800" },
  laterBtn:   { paddingVertical: rs(13), paddingHorizontal: rs(20), marginTop: rs(4) },
  laterTxt:   { fontSize: rf(15), fontWeight: "600", color: C.textMuted },
});
