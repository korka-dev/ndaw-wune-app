/**
 * Verrou applicatif biométrique/PIN.
 *
 * L'app met en cache hors-ligne des données réelles d'élèves/enseignants
 * (rapports, absences, noms) sur le téléphone. Sans verrou, un appareil
 * déverrouillé (ou dont le verrou OS est contourné) donnait un accès complet
 * à ces données ET permettait d'agir comme l'utilisateur connecté, sans
 * friction supplémentaire.
 *
 * Comportement :
 *   - Actif uniquement si une session est ouverte (inutile sur l'écran de login).
 *   - Actif uniquement si l'appareil a une biométrie/un code OS enregistré
 *     (hasHardwareAsync + isEnrolledAsync) — sinon transparent, pour ne pas
 *     bloquer un utilisateur sur un appareil sans méthode de verrouillage.
 *   - Se déclenche au démarrage à froid et à chaque retour au premier plan.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, AppState, AppStateStatus } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../store/useStore";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

export default function AppLockGate({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const token = useStore((s) => s.token);

  const [supported, setSupported] = useState<boolean | null>(null); // null = pas encore vérifié
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Vérifie une seule fois si l'appareil peut proposer un verrou (biométrie
  // ou code OS enregistré) — pas de blocage si aucune méthode disponible.
  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = hasHardware && await LocalAuthentication.isEnrolledAsync();
        setSupported(isEnrolled);
      } catch {
        setSupported(false);
      }
    })();
  }, []);

  // Verrouille au démarrage à froid si une session existe déjà (relance app).
  useEffect(() => {
    if (supported && token) setLocked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // Verrouille à chaque retour au premier plan depuis l'arrière-plan.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/background|inactive/) && next === "active" && supported && token) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [supported, token]);

  const unlock = useCallback(async () => {
    setAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Déverrouillez Ndaw Wune",
        cancelLabel: "Annuler",
        disableDeviceFallback: false, // autorise le code OS si la biométrie échoue/est absente
      });
      if (result.success) setLocked(false);
    } finally {
      setAuthenticating(false);
    }
  }, []);

  // Tente automatiquement une fois quand l'écran de verrouillage apparaît.
  useEffect(() => {
    if (locked && !authenticating) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // Les écrans restent montés en dessous (état de navigation préservé) — le
  // verrou s'affiche par-dessus en overlay opaque plutôt que de démonter
  // l'arbre de navigation.
  return (
    <>
      {children}
      {locked && token && (
        <View style={[s.container, { paddingTop: insets.top }]}>
          <View style={s.center}>
            <View style={s.iconCircle}>
              <Feather name="lock" size={rs(36)} color={C.brand} />
            </View>
            <Text style={s.title}>Application verrouillée</Text>
            <Text style={s.subtitle}>Déverrouillez avec votre empreinte, Face ID ou le code de votre téléphone.</Text>
            <TouchableOpacity style={s.btn} onPress={unlock} disabled={authenticating} activeOpacity={0.85}>
              <Text style={s.btnTxt}>{authenticating ? "Vérification…" : "Déverrouiller"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: rs(32) },
  iconCircle: { width: rs(80), height: rs(80), borderRadius: rs(40), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: rs(20) },
  title: { fontSize: rf(19), fontWeight: "800", color: C.text, marginBottom: rs(8) },
  subtitle: { fontSize: rf(13.5), color: C.textMuted, textAlign: "center", marginBottom: rs(28), lineHeight: rf(19) },
  btn: { backgroundColor: C.brand, borderRadius: rs(14), paddingVertical: rs(14), paddingHorizontal: rs(36) },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: rf(15) },
});
