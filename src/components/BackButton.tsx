/**
 * Bouton « Retour » commun à tous les écrans.
 *
 * Les retours étaient de simples flèches grises de 20 px, sans fond ni
 * étiquette : peu visibles sur un écran en plein soleil, difficiles à
 * distinguer d'une icône décorative, et avec une zone tactile minuscule.
 *
 * Ce bouton les remplace par une pastille aux couleurs de l'app, avec le mot
 * « Retour » écrit à côté de la flèche — un tuteur n'a pas à deviner ce que
 * fait l'icône. La zone tactile déborde largement du visuel.
 *
 * Variante `compact` (icône seule, ronde) pour les en-têtes trop étroits ;
 * elle conserve le fond coloré et la grande zone tactile.
 */
import React from "react";
import { Text, TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

interface Props {
  onPress:   () => void;
  /** Texte affiché à droite de la flèche. `null` pour la variante ronde. */
  label?:    string | null;
  /** Icône seule, dans une pastille ronde. */
  compact?:  boolean;
  disabled?: boolean;
  style?:    ViewStyle;
}

const ZONE_TACTILE = { top: 12, bottom: 12, left: 12, right: 12 };

export default function BackButton({
  onPress, label = "Retour", compact = false, disabled = false, style,
}: Props) {
  const couleur = disabled ? C.textMuted : C.brand;
  const afficherLabel = !compact && !!label;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={ZONE_TACTILE}
      accessibilityRole="button"
      accessibilityLabel={label ?? "Retour"}
      style={[
        s.base,
        compact ? s.rond : s.pastille,
        disabled && s.inactif,
        style,
      ]}
    >
      <Feather name="arrow-left" size={rf(17)} color={couleur} />
      {afficherLabel && <Text style={[s.txt, { color: couleur }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.brandSoft,
    borderWidth: 1,
    borderColor: C.brand + "33",
  },
  pastille: {
    gap: rs(6),
    paddingLeft: rs(10), paddingRight: rs(13),
    paddingVertical: rs(8),
    borderRadius: rs(22),
  },
  rond: {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    justifyContent: "center",
  },
  inactif: { backgroundColor: C.surfaceAlt, borderColor: C.border },
  txt: { fontSize: rf(14), fontWeight: "700" },
});
