/**
 * Champ de date avec calendrier.
 *
 * Écrit entièrement en JavaScript, sans `@react-native-community/datetimepicker` :
 * ce module est natif, et l'ajouter imposerait de reconstruire un APK et de le
 * réinstaller sur tous les téléphones. Un calendrier maison part en OTA comme
 * le reste.
 *
 * La valeur circule au format `jj/mm/aaaa`, celui que lisent les superviseurs
 * et qui part dans le rapport.
 */
import React, { useState } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

/** "jj/mm/aaaa" → Date, ou aujourd'hui si la chaîne est vide ou invalide. */
function parse(valeur: string): Date {
  const m = valeur.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return new Date();
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? new Date() : d;
}

const format = (d: Date): string =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

const memeJour = (a: Date, b: Date): boolean =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

interface Props {
  value:       string;
  onChange:    (valeur: string) => void;
  placeholder?: string;
}

export default function DateField({ value, onChange, placeholder = "Choisir une date" }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [moisAffiche, setMoisAffiche] = useState(() => parse(value));

  const aujourdhui = new Date();
  const selection  = value ? parse(value) : null;

  const ouvrir = () => {
    setMoisAffiche(value ? parse(value) : new Date());
    setOuvert(true);
  };

  const choisir = (jour: number) => {
    const d = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), jour);
    onChange(format(d));
    setOuvert(false);
  };

  const decalerMois = (delta: number) =>
    setMoisAffiche(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  // Grille du mois : cases vides avant le 1er, puis les jours.
  const annee = moisAffiche.getFullYear();
  const mois  = moisAffiche.getMonth();
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  // getDay() : 0 = dimanche. La semaine commence lundi ici.
  const premierJour = (new Date(annee, mois, 1).getDay() + 6) % 7;
  const cases: (number | null)[] = [
    ...Array<null>(premierJour).fill(null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];

  return (
    <>
      <TouchableOpacity style={s.champ} onPress={ouvrir} activeOpacity={0.75}>
        <Feather name="calendar" size={rf(16)} color={C.brand} />
        <Text style={[s.champTxt, !value && s.champVide]}>{value || placeholder}</Text>
        <Feather name="chevron-down" size={rf(16)} color={C.textMuted} />
      </TouchableOpacity>

      <Modal visible={ouvert} transparent animationType="fade" statusBarTranslucent
             onRequestClose={() => setOuvert(false)}>
        <TouchableOpacity style={s.fond} activeOpacity={1} onPress={() => setOuvert(false)}>
          <TouchableOpacity style={s.carte} activeOpacity={1}>
            {/* Navigation de mois */}
            <View style={s.enTete}>
              <TouchableOpacity onPress={() => decalerMois(-1)} style={s.fleche}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="chevron-left" size={rf(20)} color={C.brand} />
              </TouchableOpacity>
              <Text style={s.moisTxt}>{MOIS[mois]} {annee}</Text>
              <TouchableOpacity onPress={() => decalerMois(1)} style={s.fleche}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="chevron-right" size={rf(20)} color={C.brand} />
              </TouchableOpacity>
            </View>

            <View style={s.ligneJours}>
              {JOURS.map((j, i) => <Text key={i} style={s.jourTxt}>{j}</Text>)}
            </View>

            <View style={s.grille}>
              {cases.map((jour, i) => {
                if (jour === null) return <View key={`v${i}`} style={s.case_} />;
                const d      = new Date(annee, mois, jour);
                const estSel = selection !== null && memeJour(d, selection);
                const estAuj = memeJour(d, aujourdhui);
                return (
                  <TouchableOpacity
                    key={jour}
                    style={[s.case_, estSel && s.caseSel, !estSel && estAuj && s.caseAuj]}
                    onPress={() => choisir(jour)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.caseTxt, estSel && s.caseTxtSel, !estSel && estAuj && s.caseTxtAuj]}>
                      {jour}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.pied}>
              <TouchableOpacity onPress={() => { onChange(format(new Date())); setOuvert(false); }}
                                style={s.btnAuj} activeOpacity={0.8}>
                <Text style={s.btnAujTxt}>Aujourd&apos;hui</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOuvert(false)} style={s.btnFermer} activeOpacity={0.8}>
                <Text style={s.btnFermerTxt}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  champ: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    borderWidth: 1.5, borderColor: C.border, borderRadius: rs(12),
    paddingHorizontal: rs(12), paddingVertical: rs(13),
    backgroundColor: C.bg,
  },
  champTxt:  { flex: 1, fontSize: rf(15), color: C.text, fontWeight: "600" },
  champVide: { color: C.textMuted, fontWeight: "400" },

  fond:  { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", paddingHorizontal: rs(24) },
  carte: { width: "100%", backgroundColor: C.surface, borderRadius: rs(20), padding: rs(16) },

  enTete:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(14) },
  fleche:  { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  moisTxt: { fontSize: rf(16), fontWeight: "800", color: C.text },

  ligneJours: { flexDirection: "row", marginBottom: rs(6) },
  jourTxt:    { flex: 1, textAlign: "center", fontSize: rf(12), fontWeight: "700", color: C.textMuted },

  grille: { flexDirection: "row", flexWrap: "wrap" },
  case_:  { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  caseSel:{ backgroundColor: C.brand, borderRadius: rs(10) },
  caseAuj:{ borderWidth: 1.5, borderColor: C.brand + "66", borderRadius: rs(10) },
  caseTxt:    { fontSize: rf(15), color: C.text, fontWeight: "600" },
  caseTxtSel: { color: "#fff", fontWeight: "800" },
  caseTxtAuj: { color: C.brand, fontWeight: "800" },

  pied:        { flexDirection: "row", gap: rs(10), marginTop: rs(14) },
  btnAuj:      { flex: 1, paddingVertical: rs(12), borderRadius: rs(12), backgroundColor: C.brand, alignItems: "center" },
  btnAujTxt:   { fontSize: rf(14), fontWeight: "800", color: "#fff" },
  btnFermer:   { flex: 1, paddingVertical: rs(12), borderRadius: rs(12), backgroundColor: C.surfaceAlt, alignItems: "center" },
  btnFermerTxt:{ fontSize: rf(14), fontWeight: "700", color: C.textMuted },
});
