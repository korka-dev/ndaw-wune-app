/**
 * Visite guidée des fonctionnalités — affichée une seule fois,
 * juste après la première connexion, selon le rôle de l'utilisateur.
 *
 * Fonctionnement :
 *   • Superposition sombre au-dessus de l'app avec un "spotlight"
 *     qui met en évidence le vrai onglet, le header, ou une zone
 *     de l'écran affiché derrière la visite.
 *   • Chaque étape navigue vers l'écran réel correspondant, si bien
 *     que l'utilisateur découvre chaque fonctionnalité sur place.
 *   • Le flag AsyncStorage `feature_tour_done_<role>` évite de
 *     réafficher la visite aux lancements suivants.
 *
 * Relance manuelle : appeler startFeatureTour() (bouton du profil).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  ScrollView, useWindowDimensions, LayoutChangeEvent,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { measureTourTarget, TargetRect } from "./TourTarget";

/* ── Relance manuelle (ex : depuis le profil) ─────────────────── */
type Listener = () => void;
const listeners = new Set<Listener>();

/** Relance la visite guidée du layout actuellement monté. */
export function startFeatureTour() {
  listeners.forEach(l => l());
}

/* ── Définition des étapes ────────────────────────────────────── */
type TourStep = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
  /** Puces détaillées affichées sous la description */
  points?: string[];
  /** Route de l'onglet à afficher derrière la visite */
  href?: string;
  /** Index de l'onglet à mettre en évidence dans la tab bar */
  tabIndex?: number;
  /** Met en évidence le header (avatar, sync, hors-ligne) */
  highlightHeader?: boolean;
  /**
   * Id d'une cible <TourTarget> montée dans l'écran : le cadre est
   * mesuré sur l'élément réel. `spot` sert de repli si la cible
   * n'est pas affichée (contenu conditionnel).
   */
  target?: string;
  /** Zone approximative de repli du contenu de l'écran */
  spot?: "top" | "middle" | "bottom";
};

const TEACHER_STEPS: TourStep[] = [
  {
    key: "intro",
    icon: "compass",
    title: "Bienvenue sur Ndaw Wune",
    desc: "Prenons quelques minutes pour découvrir ensemble, écran par écran, tout ce que votre application peut faire. Vous pouvez passer cette visite à tout moment et la relancer depuis votre profil.",
  },
  {
    key: "home",
    icon: "home",
    title: "Accueil : votre journée en un coup d'œil",
    desc: "C'est votre écran principal. Vous y retrouvez chaque jour votre planning : les activités prévues, leurs horaires et la classe concernée.",
    href: "/(tabs)/home",
    tabIndex: 0,
  },
  {
    key: "home-seance",
    target: "home.seance",
    icon: "play-circle",
    title: "Démarrer et suivre une activité",
    desc: "Quand une activité est prête, une carte « Prêt à démarrer » apparaît ici.",
    points: [
      "Touchez « Démarrer l'activité » au début de la séance : un chronomètre suit le temps restant.",
      "Vous pouvez mettre en pause puis « Reprendre » à tout moment.",
      "À la fin, touchez « Terminer » pour clôturer l'activité.",
    ],
    href: "/(tabs)/home",
    spot: "middle",
  },
  {
    key: "home-bilan",
    // Le bilan se rend dans le même emplacement que la carte d'activité
    target: "home.seance",
    icon: "check-circle",
    title: "Fin de journée : le point sur vos tâches",
    desc: "Une fois le planning du jour effectué, l'accueil vous propose un bilan.",
    points: [
      "« Voir les détails » récapitule les activités réalisées et manquées.",
      "« Rapport du jour » vous conduit directement au rapport à remplir.",
      "« Prochain planning » vous montre les activités du jour suivant.",
    ],
    href: "/(tabs)/home",
    spot: "bottom",
  },
  {
    key: "rapports",
    icon: "send",
    title: "Rapports : rendre compte de vos journées",
    desc: "Cet onglet regroupe tout ce qui concerne vos rapports journaliers : l'envoi d'un nouveau rapport et l'historique de vos envois.",
    href: "/(tabs)/rapports",
    tabIndex: 1,
  },
  {
    key: "rapports-envoi",
    target: "rapports.envoi",
    icon: "edit-3",
    title: "Envoyer un rapport",
    desc: "Touchez « Envoyer un rapport » puis remplissez le formulaire :",
    points: [
      "le nombre d'élèves présents,",
      "le bilan global de la journée,",
      "les difficultés rencontrées et un commentaire (optionnel).",
      "Sans connexion, le rapport part automatiquement à la reconnexion.",
    ],
    href: "/(tabs)/rapports",
    spot: "top",
  },
  {
    key: "rapports-historique",
    target: "rapports.historique",
    icon: "clock",
    title: "Suivre vos rapports envoyés",
    desc: "Dans « Historique », chaque rapport affiche son statut :",
    points: [
      "« En cours » : encore en train de partir vers le serveur.",
      "« En attente » : reçu, en cours de traitement par la coordination.",
      "« Validés » : approuvé — vos statistiques se mettent à jour.",
    ],
    href: "/(tabs)/rapports",
    spot: "middle",
  },
  {
    key: "evaluations",
    icon: "award",
    title: "Évaluations : la progression de vos élèves",
    desc: "Retrouvez ici les résultats de vos élèves aux évaluations ASER en lecture et en calcul. Chaque élève est classé selon son niveau :",
    points: [
      "« Acquis » : la compétence est maîtrisée.",
      "« En cours » : l'élève progresse.",
      "« À aider » : l'élève a besoin d'un accompagnement renforcé.",
    ],
    href: "/(tabs)/evaluations",
    tabIndex: 2,
  },
  {
    key: "ressources",
    icon: "book-open",
    title: "Ressources : la bibliothèque pédagogique ARED",
    desc: "Tous vos supports de cours, guides et fichiers audio sont rassemblés ici, classés par catégorie.",
    href: "/(tabs)/ressources",
    tabIndex: 3,
  },
  {
    key: "ressources-offline",
    target: "ressources.liste",
    icon: "download",
    title: "Emporter vos documents partout",
    desc: "Chaque document peut être téléchargé sur votre téléphone :",
    points: [
      "Une fois téléchargé, il se lit sans aucune connexion (PDF et audio).",
      "L'onglet « Hors-ligne » liste tout ce qui est disponible sur l'appareil.",
      "Vous pouvez supprimer un fichier local pour libérer de l'espace.",
    ],
    href: "/(tabs)/ressources",
    spot: "top",
  },
  {
    key: "header",
    icon: "user",
    title: "Profil, synchronisation et réseau",
    desc: "La barre du haut est toujours à portée de main :",
    points: [
      "Votre avatar (à droite) ouvre votre profil : vos informations, votre école, vos classes, la déconnexion.",
      "La flèche circulaire force une synchronisation immédiate.",
      "Un badge « Hors-ligne » apparaît dès que le réseau est coupé.",
    ],
    href: "/(tabs)/home",
    highlightHeader: true,
  },
  {
    key: "offline",
    icon: "wifi-off",
    title: "Tout fonctionne hors-ligne",
    desc: "Pas de réseau ? Continuez à travailler normalement.",
    points: [
      "Vos séances, rapports et saisies sont enregistrés sur le téléphone.",
      "Dès que la connexion revient, tout est envoyé automatiquement.",
      "En cas d'échec d'envoi, votre profil liste les actions concernées.",
    ],
  },
  {
    key: "fin",
    icon: "flag",
    title: "Vous êtes prêt !",
    desc: "Vous connaissez maintenant l'essentiel de Ndaw Wune. Pour revoir cette visite plus tard, ouvrez votre profil puis touchez « Revoir la visite guidée ». Bonne journée avec vos élèves !",
  },
];

const SUPERVISOR_STEPS: TourStep[] = [
  {
    key: "intro",
    icon: "compass",
    title: "Bienvenue sur Ndaw Wune",
    desc: "Prenons quelques minutes pour découvrir ensemble, écran par écran, vos outils de supervision. Vous pouvez passer cette visite à tout moment et la relancer depuis votre profil.",
  },
  {
    key: "presences",
    icon: "home",
    title: "Présences : le pointage quotidien",
    desc: "C'est votre écran principal. Chaque jour, la liste des enseignants de votre zone s'affiche ici pour le pointage des présences.",
    href: "/(supervisor-tabs)/presences",
    tabIndex: 0,
  },
  {
    key: "presences-periode",
    target: "sup.presences.liste",
    icon: "calendar",
    title: "Choisir la semaine et le jour",
    desc: "Avant de commencer, indiquez la semaine du programme et le jour de la semaine :",
    points: [
      "Sélectionnez le numéro de semaine (1 à 8 selon votre programme).",
      "Choisissez le jour correspondant dans la liste.",
      "Touchez « Commencer le pointage » pour afficher la liste des enseignants.",
    ],
    href: "/(supervisor-tabs)/presences",
    spot: "middle",
  },
  {
    key: "presences-marquage",
    target: "sup.presences.liste",
    icon: "user-check",
    title: "Marquer présents et absents",
    desc: "Pour chaque enseignant de la liste :",
    points: [
      "Touchez la carte ou le bouton ✓ pour le marquer présent.",
      "« Absent » demande un motif : maladie, raison personnelle, formation, retard, ou non justifié.",
      "Quand tout le monde est pointé, touchez « Confirmer la liste » pour valider.",
    ],
    href: "/(supervisor-tabs)/presences",
    spot: "middle",
  },
  {
    key: "evaluation",
    icon: "shuffle",
    title: "Évaluation : les élèves tirés au sort",
    desc: "L'administrateur crée les sujets d'évaluation et le programme tire automatiquement des élèves au sort dans vos classes. Vous n'avez qu'à ouvrir un sujet et suivre les étapes.",
    href: "/(supervisor-tabs)/evaluation",
    tabIndex: 1,
  },
  {
    key: "evaluation-presence",
    target: "sup.evaluation.contenu",
    icon: "check-square",
    title: "Étape 1 — Pointer les élèves tirés",
    desc: "La liste des élèves sélectionnés s'affiche. Pour chacun :",
    points: [
      "Touchez ✓ (vert) s'il est présent en classe.",
      "Touchez ✗ (rouge) s'il est absent — il sera ignoré.",
      "Validez une fois tous les élèves pointés pour passer à l'étape suivante.",
    ],
    href: "/(supervisor-tabs)/evaluation",
    spot: "middle",
  },
  {
    key: "evaluation-dossier",
    icon: "file-text",
    title: "Étape 2 — Choisir le dossier d'évaluation",
    desc: "Sélectionnez le dossier correspondant à la langue du test (Wolof, Pulaar, Seereer…). Ce dossier affiche les lettres, syllabes, mots et opérations à faire lire à l'élève.",
    href: "/(supervisor-tabs)/evaluation",
    spot: "top",
  },
  {
    key: "evaluation-notation",
    target: "sup.evaluation.contenu",
    icon: "award",
    title: "Étape 3 — Évaluer chaque élève",
    desc: "Pour chaque élève présent, lisez le dossier à voix haute et observez sa réponse. Touchez le résultat correspondant :",
    points: [
      "« Réussi » : l'élève lit et calcule correctement.",
      "« Intermédiaire » : l'élève répond partiellement.",
      "« Pas réussi » : l'élève n'y parvient pas.",
      "Utilisez « Suivant » pour passer à l'élève suivant, puis « Envoyer » pour tout valider.",
    ],
    href: "/(supervisor-tabs)/evaluation",
    spot: "bottom",
  },
  {
    key: "difficultes",
    icon: "alert-triangle",
    title: "Difficultés : ce qui remonte du terrain",
    desc: "Retrouvez ici les problèmes signalés par les enseignants dans leurs rapports journaliers.",
    points: [
      "Filtrez par enseignant ou affichez « Tous les enseignants ».",
      "Chaque signalement est daté pour suivre son évolution dans le temps.",
    ],
    href: "/(supervisor-tabs)/difficultes",
    tabIndex: 2,
  },
  {
    key: "rapports",
    icon: "send",
    title: "Rapports de supervision",
    desc: "Cet onglet regroupe l'envoi de vos rapports et l'historique de vos envois.",
    href: "/(supervisor-tabs)/rapports",
    tabIndex: 3,
  },
  {
    key: "rapports-envoi",
    target: "sup.rapports.envoi",
    icon: "edit-3",
    title: "Envoyer un rapport de supervision",
    desc: "Touchez « Envoyer un rapport » puis renseignez :",
    points: [
      "Le bilan global de la journée (Bien / Moyen / Difficile).",
      "Les classes ayant terminé leur planning.",
      "Le détail d'un incident éventuel (obligatoire si un incident s'est produit).",
      "Sans connexion, le rapport part automatiquement à la reconnexion.",
    ],
    href: "/(supervisor-tabs)/rapports",
    spot: "top",
  },
  {
    key: "rapports-suivi",
    target: "sup.rapports.historique",
    icon: "clock",
    title: "Suivre vos rapports",
    desc: "Chaque rapport envoyé affiche son statut — « En attente » puis « Validé » — et vos statistiques se construisent au fil de vos envois.",
    href: "/(supervisor-tabs)/rapports",
    spot: "middle",
  },
  {
    key: "header",
    icon: "user",
    title: "Profil, synchronisation et réseau",
    desc: "La barre du haut est toujours à portée de main :",
    points: [
      "Votre avatar (à droite) ouvre votre profil : nom, école, déconnexion, et relancer ce guide.",
      "La flèche circulaire force une synchronisation immédiate vers le serveur.",
      "Un badge « Hors-ligne » apparaît dès que le réseau est coupé.",
    ],
    href: "/(supervisor-tabs)/presences",
    highlightHeader: true,
  },
  {
    key: "offline",
    icon: "wifi-off",
    title: "Tout fonctionne hors-ligne",
    desc: "Pas de réseau ? Continuez à travailler normalement.",
    points: [
      "Présences, évaluations et rapports sont sauvegardés sur votre téléphone.",
      "Dès que la connexion revient, tout est envoyé automatiquement au serveur.",
    ],
  },
  {
    key: "fin",
    icon: "flag",
    title: "Vous êtes prêt !",
    desc: "Vous connaissez maintenant l'essentiel de vos outils de supervision. Pour revoir cette visite plus tard, ouvrez votre profil puis touchez « Revoir la visite guidée ». Bonne supervision !",
  },
];

/* ── Composant ────────────────────────────────────────────────── */
interface Props {
  role: "enseignant" | "superviseur";
  /** Nombre d'onglets visibles dans la tab bar */
  tabCount: number;
}

const OVERLAY = "rgba(15,12,5,0.82)";
const OVERLAY_LIGHT = "rgba(15,12,5,0.55)";

export default function FeatureTour({ role, tabCount }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  /*
   * Sur Android, la hauteur "window" inclut ou exclut la barre de statut /
   * de navigation selon l'appareil et le mode (gestes ou boutons).
   * On mesure donc le conteneur réel avec onLayout : c'est la seule
   * référence fiable pour aligner les découpes du spotlight partout.
   */
  const [box, setBox] = useState({ w: 0, h: 0 });
  const boxRef = useRef(box);
  boxRef.current = box;
  const onRootLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  };
  const W = box.w || win.width;
  const H = box.h || win.height;

  const steps  = role === "superviseur" ? SUPERVISOR_STEPS : TEACHER_STEPS;
  const accent = role === "superviseur" ? C.brand : C.primary;
  // v2 : visite enrichie (étapes par écran) — réaffichée une fois aux anciens installés
  const storageKey = `feature_tour_done_${role}_v2`;

  const [visible, setVisible] = useState(false);
  const [index, setIndex]     = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  /* Rect mesuré de la cible réelle de l'étape courante (coordonnées fenêtre) */
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const rootRef    = useRef<View>(null);
  const measureSeq = useRef(0);

  /**
   * Mesure la cible de l'étape après un court délai (le temps que la
   * navigation monte l'écran), puis convertit en coordonnées locales
   * du conteneur de la visite.
   */
  function measureStep(i: number, stepsArr: TourStep[]) {
    const seq = ++measureSeq.current;
    setTargetRect(null);
    const t = stepsArr[i]?.target;
    if (!t) return;

    const attempt = (delay: number, retry: boolean) => setTimeout(async () => {
      if (seq !== measureSeq.current) return; // étape déjà changée
      const rect = await measureTourTarget(t);
      if (seq !== measureSeq.current) return;
      if (!rect) {
        // Écran pas encore monté (appareil lent) → seconde tentative
        if (retry) attempt(650, false);
        return;
      }
      // Origine du conteneur de la visite dans la fenêtre
      rootRef.current?.measureInWindow((ox, oy) => {
        if (seq !== measureSeq.current) return;
        const local = { x: rect.x - ox, y: rect.y - oy, w: rect.w, h: rect.h };
        // Cible défilée hors de vue → on garde la zone de repli
        const winH = boxRef.current.h || win.height;
        const visible = Math.min(local.y + local.h, winH) - Math.max(local.y, 0);
        if (visible < rs(40)) return;
        setTargetRect(local);
      });
    }, delay);

    attempt(350, true);
  }

  /* Premier lancement : afficher si jamais vue */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await AsyncStorage.getItem(storageKey);
      if (!done && !cancelled) {
        // Petit délai pour laisser l'écran d'accueil se monter
        setTimeout(() => { if (!cancelled) open(); }, 700);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Relance manuelle via startFeatureTour() */
  useEffect(() => {
    const l: Listener = () => open();
    listeners.add(l);
    return () => { listeners.delete(l); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open() {
    setIndex(0);
    setVisible(true);
    measureStep(0, steps);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }

  async function close() {
    await AsyncStorage.setItem(storageKey, "1");
    Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(() => setVisible(false));
  }

  function goTo(i: number) {
    const step = steps[i];
    if (step.href) router.navigate(step.href as never);
    setIndex(i);
    measureStep(i, steps);
  }

  function next() {
    if (index >= steps.length - 1) close();
    else goTo(index + 1);
  }

  function prev() {
    if (index > 0) goTo(index - 1);
  }

  if (!visible) return null;

  const step   = steps[index];
  const isLast = index === steps.length - 1;

  /* ── Géométrie des zones mises en évidence ── */
  // Mêmes formules que les layouts d'onglets
  const tabBarH  = rs(58) + insets.bottom;
  const headerH  = (insets.top > 0 ? insets.top : rs(14)) + rs(64);
  const tabW     = W / tabCount;
  const tabX     = (step.tabIndex ?? 0) * tabW;

  // Zone de contenu entre le header et la tab bar
  const contentTop = headerH;
  const contentH   = H - tabBarH - contentTop;

  const hasMeasured   = step.target !== undefined && targetRect !== null;
  const hasTabSpot    = step.tabIndex !== undefined;
  const hasHeaderSpot = step.highlightHeader === true;
  const hasZoneSpot   = hasMeasured || step.spot !== undefined;

  // Rectangle de la zone de contenu mise en évidence
  let zoneY = contentTop;
  let zoneH = contentH;
  let zoneX = rs(8);
  let zoneW = W - rs(16);
  if (hasMeasured && targetRect) {
    // Cadre mesuré sur l'élément réel de l'écran (prioritaire)
    zoneY = Math.max(rs(4), targetRect.y - rs(6));
    zoneH = Math.min(targetRect.h + rs(12), H - zoneY - rs(4));
    zoneX = Math.max(rs(4), targetRect.x - rs(6));
    zoneW = Math.min(targetRect.w + rs(12), W - zoneX - rs(4));
  } else {
    // Repli : zone approximative de l'écran
    if (step.spot === "top")    { zoneY = contentTop + rs(6);           zoneH = contentH * 0.42; }
    if (step.spot === "middle") { zoneY = contentTop + contentH * 0.26; zoneH = contentH * 0.44; }
    if (step.spot === "bottom") { zoneY = contentTop + contentH * 0.55; zoneH = contentH * 0.42; }
  }

  // La carte se place du côté où il y a le plus d'espace libre
  const zoneCenter = zoneY + zoneH / 2;
  const cardBelowZone = zoneCenter < H / 2;

  /*
   * Hauteur maximale de la carte selon son emplacement, pour qu'elle ne
   * déborde jamais — petits écrans (320 px) comme grandes polices système.
   * Le corps de la carte devient défilant si le contenu dépasse.
   */
  const M = rs(22); // marge entre la carte et la zone visée
  let cardMaxH: number;
  if (hasTabSpot) {
    // Ancrée en bas au-dessus de la tab bar → espace jusqu'en haut
    cardMaxH = H - tabBarH - M - (insets.top + rs(12));
  } else if (hasHeaderSpot) {
    // Ancrée en haut sous le header → espace jusqu'en bas
    cardMaxH = H - headerH - M - (insets.bottom + rs(12));
  } else if (hasZoneSpot) {
    cardMaxH = cardBelowZone
      ? H - (zoneY + zoneH) - M - (insets.bottom + rs(12)) // sous la zone
      : zoneY - M - (insets.top + rs(12));                 // au-dessus de la zone
  } else {
    // Carte centrée
    cardMaxH = H - insets.top - insets.bottom - rs(72);
  }
  cardMaxH = Math.max(cardMaxH, rs(220)); // garde-fou

  return (
    <Animated.View
      ref={rootRef as never}
      style={[s.root, { opacity: fade }]}
      pointerEvents="auto"
      onLayout={onRootLayout}
    >

      {/* ── Superposition sombre avec découpe "spotlight" ── */}
      {hasTabSpot ? (
        <>
          <View style={[s.dim, { top: 0, left: 0, right: 0, height: H - tabBarH }]} />
          <View style={[s.dim, { bottom: 0, left: 0, width: tabX, height: tabBarH }]} />
          <View style={[s.dim, { bottom: 0, left: tabX + tabW, right: 0, height: tabBarH }]} />
          {/* Cadre autour de l'onglet mis en évidence */}
          <View
            pointerEvents="none"
            style={[s.spotFrame, {
              left: tabX + rs(4),
              width: tabW - rs(8),
              bottom: rs(4),
              height: tabBarH - rs(8),
              borderColor: accent,
            }]}
          />
        </>
      ) : hasHeaderSpot ? (
        <>
          <View style={[s.dim, { top: headerH, left: 0, right: 0, bottom: 0 }]} />
          <View
            pointerEvents="none"
            style={[s.spotFrame, {
              left: rs(4),
              right: rs(4),
              top: rs(4),
              height: headerH - rs(8),
              borderColor: accent,
            }]}
          />
        </>
      ) : hasZoneSpot ? (
        <>
          {/* Voile léger sur la zone visée (elle reste lisible), sombre ailleurs */}
          <View style={[s.dim, { top: 0, left: 0, right: 0, height: zoneY }]} />
          <View style={[s.dimLight, { top: zoneY, left: 0, right: 0, height: zoneH }]} />
          <View style={[s.dim, { top: zoneY + zoneH, left: 0, right: 0, bottom: 0 }]} />
          <View
            pointerEvents="none"
            style={[s.spotFrame, {
              left: zoneX,
              width: zoneW,
              top: zoneY,
              height: zoneH,
              borderColor: accent,
            }]}
          />
        </>
      ) : (
        <View style={[s.dim, { top: 0, left: 0, right: 0, bottom: 0 }]} />
      )}

      {/* ── Flèche vers la zone mise en évidence ── */}
      {hasTabSpot && (
        <View
          pointerEvents="none"
          style={[s.arrowDown, {
            left: tabX + tabW / 2 - rs(9),
            bottom: tabBarH + rs(6),
            borderTopColor: C.surface,
          }]}
        />
      )}
      {hasHeaderSpot && (
        <View
          pointerEvents="none"
          style={[s.arrowUp, {
            right: rs(36),
            top: headerH + rs(6),
            borderBottomColor: C.surface,
          }]}
        />
      )}

      {/* ── Carte de l'étape ── */}
      <View
        style={[
          s.cardWrap,
          hasTabSpot
            ? { bottom: tabBarH + rs(22) }
            : hasHeaderSpot
              ? { top: headerH + rs(22) }
              : hasZoneSpot
                ? (cardBelowZone
                    ? { top: zoneY + zoneH + rs(14) }  // carte sous la zone
                    : { bottom: H - zoneY + rs(14) })  // carte au-dessus de la zone
                : { top: 0, bottom: 0, justifyContent: "center" },
        ]}
        pointerEvents="box-none"
      >
        <View style={[s.card, { maxHeight: cardMaxH }]}>
          <View style={s.cardHead}>
            <View style={[s.iconBg, { backgroundColor: accent + "1A" }]}>
              <Feather name={step.icon} size={rf(24)} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepCount}>
                Étape {index + 1} sur {steps.length}
              </Text>
              <Text style={s.title}>{step.title}</Text>
            </View>
          </View>

          {/* Corps défilant si le contenu dépasse la hauteur disponible */}
          <ScrollView
            style={{ flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={s.desc}>{step.desc}</Text>

            {/* Puces détaillées */}
            {step.points && (
              <View style={s.pointsBox}>
                {step.points.map((p, i) => (
                  <View key={i} style={s.pointRow}>
                    <View style={[s.pointDot, { backgroundColor: accent }]} />
                    <Text style={s.pointTxt}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Barre de progression */}
          <View style={s.progressTrack}>
            <View
              style={[s.progressFill, {
                backgroundColor: accent,
                width: `${((index + 1) / steps.length) * 100}%`,
              }]}
            />
          </View>

          {/* Boutons */}
          <View style={s.btnRow}>
            {index > 0 ? (
              <TouchableOpacity
                style={[s.prevBtn, { borderColor: C.border }]}
                onPress={prev}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={rf(18)} color={C.textMuted} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={close} activeOpacity={0.7} style={s.skipBtn}>
                <Text style={s.skipTxt}>Passer</Text>
              </TouchableOpacity>
            )}

            {index > 0 && !isLast && (
              <TouchableOpacity onPress={close} activeOpacity={0.7} style={s.skipBtn}>
                <Text style={s.skipTxt}>Passer</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.nextBtn, { backgroundColor: accent }]}
              onPress={next}
              activeOpacity={0.85}
            >
              <Text style={s.nextTxt}>{isLast ? "Terminer" : "Suivant"}</Text>
              <Feather
                name={isLast ? "check" : "arrow-right"}
                size={rf(16)}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/* ── Styles ───────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 24,
  },
  dim: {
    position: "absolute",
    backgroundColor: OVERLAY,
  },
  dimLight: {
    position: "absolute",
    backgroundColor: OVERLAY_LIGHT,
  },
  spotFrame: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: rs(12),
  },

  arrowDown: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: rs(9),
    borderRightWidth: rs(9),
    borderTopWidth: rs(10),
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  arrowUp: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: rs(9),
    borderRightWidth: rs(9),
    borderBottomWidth: rs(10),
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },

  cardWrap: {
    position: "absolute",
    left: rs(16),
    right: rs(16),
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: rs(20),
    padding: rs(18),
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    marginBottom: rs(10),
  },
  iconBg: {
    width: rs(46),
    height: rs(46),
    borderRadius: rs(14),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepCount: {
    fontSize: rf(10),
    fontWeight: "700",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: rs(2),
  },
  title: {
    fontSize: rf(16),
    fontWeight: "800",
    color: C.text,
    lineHeight: rf(21),
  },
  desc: {
    fontSize: rf(13),
    color: C.textMuted,
    lineHeight: rf(19),
    marginBottom: rs(10),
  },

  pointsBox: {
    gap: rs(7),
    marginBottom: rs(12),
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
  },
  pointDot: {
    width: rs(6),
    height: rs(6),
    borderRadius: rs(3),
    marginTop: rs(6),
    flexShrink: 0,
  },
  pointTxt: {
    flex: 1,
    fontSize: rf(12.5),
    color: C.text,
    lineHeight: rf(18),
  },

  progressTrack: {
    height: rs(4),
    borderRadius: rs(2),
    backgroundColor: C.border,
    overflow: "hidden",
    marginBottom: rs(14),
  },
  progressFill: {
    height: "100%",
    borderRadius: rs(2),
  },

  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skipBtn: {
    paddingVertical: rs(10),
    paddingHorizontal: rs(4),
  },
  skipTxt: {
    fontSize: rf(13),
    fontWeight: "600",
    color: C.textMuted,
  },
  prevBtn: {
    width: rs(42),
    height: rs(42),
    borderRadius: rs(12),
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    borderRadius: rs(12),
    paddingVertical: rs(12),
    paddingHorizontal: rs(20),
  },
  nextTxt: {
    color: "#fff",
    fontSize: rf(14),
    fontWeight: "700",
  },
});
