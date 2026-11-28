/**
 * Messages (Alert.alert) sur la version web / iPhone.
 *
 * Sur le web, react-native-web ne fait rien quand on appelle Alert.alert : les
 * messages d'erreur et de succès (connexion refusée, envoi réussi…) restaient
 * invisibles. Ce module remplace Alert.alert, sur le web uniquement, par une
 * fenêtre dans l'app, avec les mêmes boutons et les mêmes actions. Sur Android
 * rien ne change : la boîte de dialogue native reste utilisée.
 */
import { useEffect, useState } from "react";
import { Alert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { AlertButton } from "react-native";

export type AlerteWebMessage = { titre: string; message?: string; boutons: AlertButton[]; annulable: boolean };

let file: AlerteWebMessage[] = [];
const abonnes = new Set<(f: AlerteWebMessage[]) => void>();
const diffuser = () => abonnes.forEach((fn) => fn(file));

export function afficherAlerteWeb(titre: string, message?: string, boutons?: AlertButton[], options?: { cancelable?: boolean }) {
  const liste = boutons && boutons.length > 0 ? boutons : [{ text: "OK" }];
  file = [...file, { titre: titre ?? "", message, boutons: liste, annulable: options?.cancelable ?? false }];
  diffuser();
}

function fermer(bouton?: AlertButton) {
  file = file.slice(1);
  diffuser();
  // Action du bouton après la fermeture, comme la boîte native.
  if (bouton?.onPress) setTimeout(() => bouton.onPress?.(), 0);
}

let installe = false;
/** Branche Alert.alert sur la fenêtre web. Sans effet hors web. */
export function installerAlerteWeb() {
  if (installe || Platform.OS !== "web") return;
  installe = true;
  (Alert as any).alert = afficherAlerteWeb;
}
installerAlerteWeb();

export default function AlerteWebHote() {
  const [liste, setListe] = useState<AlerteWebMessage[]>(file);
  useEffect(() => {
    abonnes.add(setListe);
    setListe(file);
    return () => { abonnes.delete(setListe); };
  }, []);

  if (Platform.OS !== "web") return null;
  const courant = liste[0];
  if (!courant) return null;

  const annulation = courant.boutons.find((b) => b.style === "cancel");
  const fermerParFond = () => {
    if (annulation) fermer(annulation);
    else if (courant.annulable || courant.boutons.length === 1) fermer(courant.boutons[0]);
  };
  const enLigne = courant.boutons.length <= 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={fermerParFond}>
      <View style={s.fond}>
        <View style={s.carte} accessibilityRole="alert">
          {!!courant.titre && <Text style={s.titre}>{courant.titre}</Text>}
          {!!courant.message && <Text style={s.texte}>{courant.message}</Text>}
          <View style={[s.boutons, enLigne ? s.ligne : s.colonne]}>
            {courant.boutons.map((b, i) => {
              const principal = b.style !== "cancel" && i === courant.boutons.length - 1;
              const danger = b.style === "destructive";
              return (
                <TouchableOpacity
                  key={`${b.text}-${i}`}
                  style={[s.bouton, enLigne && s.boutonLigne, principal && s.principal, danger && s.danger]}
                  activeOpacity={0.8}
                  onPress={() => fermer(b)}
                >
                  <Text style={[s.boutonTexte, (principal || danger) && s.boutonTexteFort]}>{b.text ?? "OK"}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  carte: { width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderRadius: 20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 16 },
  titre: { fontSize: 17, fontWeight: "800", color: "#1F1A10", textAlign: "center" },
  texte: { fontSize: 14.5, color: "#6B6252", textAlign: "center", lineHeight: 21, marginTop: 8 },
  boutons: { marginTop: 18, gap: 8 },
  ligne: { flexDirection: "row" },
  colonne: { flexDirection: "column" },
  bouton: { paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#F3EEE2" },
  boutonLigne: { flex: 1 },
  principal: { backgroundColor: "#8B6F1F" },
  danger: { backgroundColor: "#B3261E" },
  boutonTexte: { fontSize: 15, fontWeight: "600", color: "#4A4233" },
  boutonTexteFort: { color: "#FFFFFF", fontWeight: "800" },
});
