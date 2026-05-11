/**
 * Utilitaires de mise en page responsive
 *
 * Basé sur une largeur de référence de 375 px (iPhone SE / petits Android).
 * Les valeurs s'adaptent automatiquement à tous les formats d'écran.
 *
 * Usage :
 *   import { rs, rf, wp, hp } from "@/utils/responsive";
 *
 *   fontSize: rf(16)      // 16 px sur 375px, scale proportionnel ailleurs
 *   padding:  rs(20)      // 20 px de référence, adapté
 *   width:    wp(90)      // 90 % de la largeur écran
 */

import { Dimensions, PixelRatio, Platform } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/** Largeur de référence (iPhone SE / petits Androids) */
const BASE_W = 375;

/**
 * Échelle un espace (padding, margin, taille fixe) selon la largeur de l'écran.
 * ex : rs(20) → 20 sur 375px, 22 sur 414px, 17 sur 320px
 */
export function rs(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * (SCREEN_W / BASE_W)));
}

/**
 * Échelle une taille de police.
 * Plafonnée à +25 % pour éviter les textes trop grands sur tablettes.
 */
export function rf(size: number): number {
  const ratio  = SCREEN_W / BASE_W;
  const capped = Math.min(ratio, 1.25);
  return Math.round(PixelRatio.roundToNearestPixel(size * capped));
}

/** Pourcentage de la largeur écran */
export const wp = (pct: number): number => Math.round(SCREEN_W * pct / 100);

/** Pourcentage de la hauteur écran */
export const hp = (pct: number): number => Math.round(SCREEN_H * pct / 100);

/** Vrai si l'écran est une tablette (≥ 768 px) */
export const isTablet: boolean = SCREEN_W >= 768;

/** Raccourcis plateforme */
export const isIOS     = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";
