/**
 * Écran « Mise à jour obligatoire » (rapport V2, APP-46).
 *
 * Affiché quand l'API refuse la version installée (426 APP_UPDATE_REQUIRED),
 * ou au lancement si la politique publiée (/app-version) l'exige.
 *
 * Les saisies non envoyées restent sur le téléphone : la file n'est ni vidée
 * ni pénalisée, elle repartira automatiquement après la mise à jour. Le tuteur
 * peut continuer à travailler hors ligne en attendant.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, AppState, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";
import { onUpdateRequired, UpdateRequiredPayload } from "../services/authEvents";
import { APP_VERSION, etatMiseAJour, INTERVALLE_VERIF_VERSION_MS } from "../services/appVersion";
import { versionApi } from "../services/api";
import { countUnsentForOwner } from "../services/db";

export default function AppUpdateRequired() {
  const [info, setInfo]           = useState<UpdateRequiredPayload | null>(null);
  const [hidden, setHidden]       = useState(false);
  const [checking, setChecking]   = useState(false);
  const [message, setMessage]     = useState<string | null>(null);
  const [unsent, setUnsent]       = useState(0);

  const show = useCallback((p: UpdateRequiredPayload) => {
    try { setUnsent(countUnsentForOwner()); } catch { setUnsent(0); }
    setInfo(p);
    setHidden(false);
  }, []);

  // 426 reçu par n'importe quel appel API
  useEffect(() => onUpdateRequired(show), [show]);

  // Vérification au lancement PUIS à chaque retour dans l'app (au plus toutes
  // les 30 min, la réponse fait quelques octets) : une nouvelle version publiée
  // est proposée dès l'ouverture, une version trop ancienne est bloquée.
  const derniereVerif = useRef(0);
  const verifier = useCallback((force = false) => {
    const maintenant = Date.now();
    if (!force && maintenant - derniereVerif.current < INTERVALLE_VERIF_VERSION_MS) return;
    derniereVerif.current = maintenant;
    versionApi.policy()
      .then(({ data }) => {
        const etat = etatMiseAJour(APP_VERSION, data);
        if (etat) {
          show({ minVersion: data.min_version, latestVersion: data.latest_version,
                 mode: etat, downloadUrl: data.download_url ?? null });
        }
      })
      .catch(() => {}); // hors ligne : silencieux
  }, [show]);

  useEffect(() => {
    verifier(true);
    const sub = AppState.addEventListener("change", (etat) => { if (etat === "active") verifier(); });
    return () => sub.remove();
  }, [verifier]);

  const disponible = info?.mode === "disponible";

  const tryUpdate = async () => {
    setMessage(null);
    // Version web (PWA) : la nouvelle version est déjà en ligne, il suffit de recharger.
    if (Platform.OS === "web") {
      try { (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* sans service worker */ }
      window.location.reload();
      return;
    }
    setChecking(true);
    try {
      // 1. Mise à jour « à chaud » (EAS Update) si elle existe : rien à réinstaller.
      if (Updates.isEnabled) {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      }
      // 2. Sinon, nouvel APK : lien publié par le serveur.
      if (info?.downloadUrl) {
        await Linking.openURL(info.downloadUrl);
        return;
      }
      setMessage("Installez la nouvelle version depuis le lien fourni par votre coordonnateur.");
    } catch {
      setMessage("Vérification impossible (réseau ?). Réessayez quand vous avez du réseau.");
    } finally {
      setChecking(false);
    }
  };

  if (!info || hidden) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHidden(true)}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Feather name="alert-triangle" size={rf(26)} color={C.brand} />
          </View>
          <Text style={s.title}>{disponible ? "Nouvelle version disponible" : "Mise à jour obligatoire"}</Text>
          <Text style={s.msg}>
            {disponible
              ? `La version ${info.latestVersion} est disponible (vous avez la ${APP_VERSION}). Installez-la pour profiter des dernières corrections.`
              : `Cette version (${APP_VERSION}) n'est plus acceptée par le serveur${info.minVersion ? ` (minimum ${info.minVersion})` : ""}.`}
            {"\n"}
            {unsent > 0
              ? `Vos ${unsent} saisie(s) non envoyée(s) sont conservées sur le téléphone et partiront après la mise à jour.`
              : "Vos saisies restent enregistrées sur le téléphone."}
          </Text>
          {message && <Text style={s.note}>{message}</Text>}

          <TouchableOpacity
            style={[s.primaryBtn, checking && s.primaryBtnDisabled]}
            onPress={tryUpdate}
            disabled={checking}
            activeOpacity={0.85}
          >
            {checking
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.primaryTxt}>Mettre à jour</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.laterBtn} onPress={() => setHidden(true)} disabled={checking} activeOpacity={0.7}>
            <Text style={s.laterTxt}>{disponible ? "Plus tard" : "Continuer hors ligne"}</Text>
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
    lineHeight: rf(21), marginTop: rs(8), marginBottom: rs(16),
  },
  note: { fontSize: rf(13), color: C.text, textAlign: "center", marginBottom: rs(14) },
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
