/**
 * Verrou applicatif (rapport V2, APP-14 — version prudente).
 *
 * Quand l'application revient au premier plan après plus de
 * VERROU_APRES_MS en arrière-plan, et qu'un compte est connecté, l'écran est
 * masqué jusqu'à une authentification locale : biométrie ou, à défaut, code
 * de verrouillage de l'appareil (expo-local-authentication). Aucune donnée
 * n'est transmise ; rien n'est verrouillé si l'appareil n'a aucun moyen
 * d'authentification configuré (on ne bloque jamais l'accès aux saisies).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../store/useStore";
import { C } from "../utils/theme";
import { rf, rs } from "../utils/responsive";

export const VERROU_APRES_MS = 5 * 60 * 1000;

async function authentificationPossible(): Promise<boolean> {
  try {
    const niveau = await LocalAuthentication.getEnrolledLevelAsync();
    return niveau !== LocalAuthentication.SecurityLevel.NONE;
  } catch { return false; }
}

export default function AppLockGate() {
  const user = useStore(s => s.user);
  const [verrouille, setVerrouille] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const depart = useRef<number | null>(null);
  const enCours = useRef(false);

  const deverrouiller = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    setErreur(null);
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: "Déverrouiller Ndaw Wune",
        cancelLabel: "Annuler",
        disableDeviceFallback: false, // code de l'appareil accepté si la biométrie échoue
      });
      if (r.success) setVerrouille(false);
      else setErreur("Authentification non aboutie. Réessayez.");
    } catch {
      setErreur("Authentification indisponible. Réessayez.");
    } finally { enCours.current = false; }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (etat: AppStateStatus) => {
      if (etat === "background" || etat === "inactive") {
        if (depart.current === null) depart.current = Date.now();
        return;
      }
      if (etat === "active") {
        const absent = depart.current !== null ? Date.now() - depart.current : 0;
        depart.current = null;
        if (user && absent >= VERROU_APRES_MS && (await authentificationPossible())) {
          setVerrouille(true);
          deverrouiller();
        }
      }
    });
    return () => sub.remove();
  }, [user, deverrouiller]);

  // Déconnexion : plus rien à protéger à l'écran.
  useEffect(() => { if (!user) setVerrouille(false); }, [user]);

  if (!verrouille) return null;
  return (
    <View style={st.voile} accessibilityViewIsModal>
      <Feather name="lock" size={rs(44)} color={C.brand} />
      <Text style={st.titre}>Application verrouillée</Text>
      <Text style={st.texte}>Vos données restent protégées sur cet appareil. Déverrouillez avec votre empreinte, votre visage ou le code du téléphone.</Text>
      {erreur ? <Text style={st.erreur}>{erreur}</Text> : null}
      <TouchableOpacity style={st.btn} onPress={deverrouiller}>
        <Text style={st.btnTxt}>Déverrouiller</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  voile:  { ...StyleSheet.absoluteFill, zIndex: 9999, elevation: 9999, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: rs(28), gap: rs(14) },
  titre:  { fontSize: rf(20), fontWeight: "800", color: C.text },
  texte:  { fontSize: rf(14), color: C.textMuted, textAlign: "center", lineHeight: rf(21) },
  erreur: { fontSize: rf(13), color: C.danger, textAlign: "center" },
  btn:    { backgroundColor: C.brand, borderRadius: rs(12), paddingVertical: rs(13), paddingHorizontal: rs(28), marginTop: rs(8) },
  btnTxt: { color: "#fff", fontSize: rf(15), fontWeight: "800" },
});
