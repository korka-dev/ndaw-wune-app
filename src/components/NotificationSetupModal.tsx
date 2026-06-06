/**
 * NotificationSetupModal — Guide de configuration des notifications (Android)
 * ────────────────────────────────────────────────────────────────────────────
 * Affiché une seule fois au premier lancement, il guide l'enseignant à travers
 * les étapes nécessaires pour que les rappels arrivent à l'heure exacte :
 *
 *  1. Autoriser les notifications          (POST_NOTIFICATIONS — Android 13+)
 *  2. Désactiver l'optimisation batterie   (Doze mode — tous Android)
 *  3. Autoriser les alarmes exactes        (SCHEDULE_EXACT_ALARM — Android 12+)
 *  4. Démarrage automatique OEM            (Xiaomi / Huawei / Oppo / Realme / Vivo / Samsung)
 *
 * Étapes 3 et 4 sont conditionnelles selon la version Android et le fabricant.
 * L'étape 3 est vérifiée pour de vrai via checkExactAlarmPermission().
 *
 * Une fois les étapes complétées (ou ignorées), la clé NOTIF_SETUP_MODAL_KEY
 * est écrite dans AsyncStorage : le modal ne réapparaîtra plus jamais.
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import {
  setupNotifications,
  requestIgnoreBatteryOptimization,
  openExactAlarmSettings,
  checkExactAlarmPermission,
  detectAndroidManufacturer,
  oemLabel,
  openOemBatterySettings,
  NOTIF_SETUP_MODAL_KEY,
  type OemBrand,
} from "../services/notifications";

/* ── Types ───────────────────────────────────────────────────── */
type StepState = "idle" | "loading" | "verifying" | "done" | "failed";

interface StepDef {
  key:      string;
  icon:     string;   // validé au runtime par Feather
  title:    string;
  desc:     string;
  btnLabel: string;
  show:     boolean;
  onAction: () => Promise<void>;
}

/* ── Instructions OEM ────────────────────────────────────────── */
function oemInstructions(brand: OemBrand): string {
  switch (brand) {
    case "xiaomi":
      return "Paramètres → Applications → Ndaw Wune → Autorisations → Démarrage automatique → Activer.\n\nOu : Sécurité → Autorisations → Démarrage automatique → Ndaw Wune.";
    case "samsung":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Autoriser l'activité en arrière-plan.\n\nÉgalement : Paramètres → Entretien de l'appareil → Batterie → Limites d'utilisation → Ndaw Wune → Supprimer des limites.";
    case "huawei":
      return "Paramètres → Applications → Lancement d'applications → Ndaw Wune → Gérer manuellement → cocher Démarrage automatique, Secondaire et En arrière-plan.";
    case "oppo":
      return "Paramètres → Gestion des applications → Ndaw Wune → Utiliser la batterie → Autorisation en arrière-plan → Activer.\n\nOu : Sécurité → Autorisations → Démarrage automatique → Ndaw Wune.";
    case "realme":
      return "Paramètres → Gestion des applications → Ndaw Wune → Utiliser la batterie → Autorisation en arrière-plan → Activer.\n\nOu : Sécurité → Démarrage automatique → Ndaw Wune.";
    case "vivo":
      return "Paramètres → Batterie → Consommation en arrière-plan → Ndaw Wune → Autoriser.\n\nÉgalement : Gestionnaire des permissions → Démarrage automatique → Ndaw Wune → Activer.";
    case "tecno":
      return "Paramètres → Gestion des applications → Ndaw Wune → Batterie → Autoriser en arrière-plan.\n\nOu : Phone Master → Gestionnaire de démarrage → Ndaw Wune → Activer.";
    case "infinix":
      return "Paramètres → Gestion des applications → Ndaw Wune → Batterie → Autoriser en arrière-plan.\n\nOu : Phone Master → Gestionnaire de démarrage → Ndaw Wune → Activer.";
    case "itel":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Autoriser en arrière-plan.\n\nOu : Phone Master → Gestionnaire de démarrage → Ndaw Wune → Activer.";
    case "oneplus":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Autoriser l'activité en arrière-plan.\n\nOu (ColorOS) : Paramètres → Gestion des applications → Ndaw Wune → Utiliser la batterie → Démarrage automatique.";
    case "asus":
      return "Paramètres → Gestion d'alimentation → Applications → Ndaw Wune → Autoriser le démarrage automatique.\n\nOu : Paramètres → Applications → Ndaw Wune → Batterie → Non restreint.";
    case "wiko":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Non restreint (ou Aucune restriction).\n\nÉgalement désactiver l'optimisation de la batterie si l'option est présente.";
    case "zte":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Autoriser en arrière-plan.\n\nOu : Gestion de l'énergie → Paramètres des applications → Ndaw Wune → Aucune restriction.";
    case "motorola":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Non restreint.\n\nCe réglage est suffisant sur Motorola — Android stock bien géré.";
    case "lenovo":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Non restreint.\n\nÉgalement : Gestionnaire d'énergie → Applications protégées → Ajouter Ndaw Wune.";
    case "nokia":
      return "Paramètres → Applications → Ndaw Wune → Batterie → Non restreint.\n\nNokia utilise Android stock — le réglage batterie standard suffit généralement.";
    default:
      // Guide générique pour toute marque non reconnue
      return "Paramètres → Applications → Ndaw Wune → Batterie → choisir « Non restreint » ou « Autoriser l'activité en arrière-plan ».\n\nSi votre téléphone a un gestionnaire d'énergie ou de sécurité, cherchez « Démarrage automatique » et activez-le pour Ndaw Wune.";
  }
}

/* ── Composant ───────────────────────────────────────────────── */
interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationSetupModal({ visible, onClose }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [oem, setOem] = useState<OemBrand>("other");

  // État par étape
  const [states, setStates] = useState<Record<string, StepState>>({
    notif:   "idle",
    battery: "idle",
    alarm:   "idle",
    oem:     "idle",
  });

  // Détecter le fabricant au montage
  useEffect(() => {
    setOem(detectAndroidManufacturer());
  }, []);

  // Fade-in à l'ouverture
  useEffect(() => {
    if (visible) {
      setStates({ notif: "idle", battery: "idle", alarm: "idle", oem: "idle" });
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]); // eslint-disable-line

  const setStep = (key: string, s: StepState) =>
    setStates(prev => ({ ...prev, [key]: s }));

  /* ── Actions ─────────────────────────────────────────────── */
  const doNotif = async () => {
    setStep("notif", "loading");
    try { await setupNotifications(); } catch {}
    setStep("notif", "done");
  };

  const doBattery = async () => {
    setStep("battery", "loading");
    try { await requestIgnoreBatteryOptimization(); } catch {}
    setStep("battery", "done");
  };

  const doAlarm = async () => {
    setStep("alarm", "loading");
    try { await openExactAlarmSettings(); } catch {}

    // Vérification réelle : la permission est-elle maintenant accordée ?
    setStep("alarm", "verifying");
    try {
      const ok = await checkExactAlarmPermission();
      setStep("alarm", ok ? "done" : "failed");
    } catch {
      setStep("alarm", "done"); // fail-open
    }
  };

  const doOem = async () => {
    setStep("oem", "loading");
    try { await openOemBatterySettings(); } catch {}
    setStep("oem", "done");
  };

  /* ── Définition des étapes ───────────────────────────────── */
  const androidVersion = Platform.OS === "android" ? Number(Platform.Version) : 0;
  // Toujours afficher l'étape OEM sur Android — même pour les marques non reconnues
  // qui ont souvent des restrictions batterie propriétaires inconnues.
  const showOemStep    = Platform.OS === "android";

  const steps: StepDef[] = [
    {
      key:      "notif",
      icon:     "bell",
      title:    "Autoriser les notifications",
      desc:     androidVersion >= 33
        ? "Android 13+ requiert votre accord explicite. Appuyez sur « Autoriser » dans la boîte de dialogue."
        : "Autorisez Ndaw Wune à envoyer des rappels avant vos cours.",
      btnLabel: "Activer les notifications",
      show:     true,
      onAction: doNotif,
    },
    {
      key:      "battery",
      icon:     "battery-charging",
      title:    "Désactiver l'optimisation batterie",
      desc:     "Android peut retarder les alarmes en veille. Appuyez sur « Ne pas optimiser » dans la boîte de dialogue pour que vos rappels sonnent même écran éteint.",
      btnLabel: "Désactiver l'optimisation",
      show:     Platform.OS === "android",
      onAction: doBattery,
    },
    {
      key:      "alarm",
      icon:     "clock",
      title:    "Alarmes exactes",
      desc:     "Android 12+ requiert une autorisation pour déclencher les rappels à l'heure précise. Sans cela, les notifications peuvent arriver en retard.",
      btnLabel: "Autoriser les alarmes exactes",
      show:     Platform.OS === "android" && androidVersion >= 31,
      onAction: doAlarm,
    },
    {
      key:      "oem",
      icon:     "smartphone",
      title:    oem !== "other"
        ? `Démarrage automatique (${oemLabel(oem)})`
        : "Activité en arrière-plan",
      desc:     oem !== "other"
        ? `Votre téléphone ${oemLabel(oem)} utilise un système de gestion d'énergie propriétaire qui peut bloquer les notifications malgré les réglages précédents.\n\n${oemInstructions(oem)}\n\nLe bouton ci-dessous ouvre directement la bonne page.`
        : `${oemInstructions(oem)}\n\nLe bouton ci-dessous ouvre les paramètres de votre application.`,
      btnLabel: "Ouvrir les paramètres",
      show:     showOemStep,
      onAction: doOem,
    },
  ].filter(s => s.show);

  const totalDone = steps.filter(s => states[s.key] === "done").length;
  const allDone   = totalDone === steps.length;

  /* ── Fermeture définitive ────────────────────────────────── */
  const handleClose = async () => {
    try { await AsyncStorage.setItem(NOTIF_SETUP_MODAL_KEY, "1"); } catch {}
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  /* ── Rendu d'une étape ───────────────────────────────────── */
  const renderStep = (step: StepDef) => {
    const state     = states[step.key];
    const isDone    = state === "done";
    const isFailed  = state === "failed";
    const isLoading = state === "loading" || state === "verifying";

    return (
      <View key={step.key} style={[s.stepRow, isDone && s.stepRowDone, isFailed && s.stepRowFailed]}>
        {/* Icône */}
        <View style={[s.stepIconWrap, isDone && s.stepIconDone, isFailed && s.stepIconFailed]}>
          <Feather
            name={(isDone ? "check" : isFailed ? "alert-triangle" : step.icon) as React.ComponentProps<typeof Feather>["name"]}
            size={rf(18)}
            color={isDone || isFailed ? "#fff" : C.brand}
          />
        </View>

        {/* Contenu */}
        <View style={s.stepContent}>
          <Text style={[s.stepTitle, isDone && s.stepTitleDone, isFailed && s.stepTitleFailed]}>
            {step.title}
          </Text>

          {/* Description — toujours visible pour l'étape OEM (instructions longues) */}
          {(!isDone || step.key === "oem") && (
            <Text style={s.stepDesc}>{step.desc}</Text>
          )}

          {/* Message d'échec vérification alarme exacte */}
          {isFailed && (
            <Text style={s.failMsg}>
              ⚠️ Permission non accordée. Retournez dans Paramètres → Applications → Ndaw Wune → Alarmes et rappels, puis activez l'option.
            </Text>
          )}

          {/* Bouton d'action */}
          {!isDone && (
            <TouchableOpacity
              style={[s.stepBtn, isLoading && s.stepBtnLoading, isFailed && s.stepBtnRetry]}
              onPress={step.onAction}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Feather
                name={isLoading ? "loader" : isFailed ? "refresh-cw" : "arrow-right"}
                size={rf(13)}
                color="#fff"
                style={{ marginRight: rs(6) }}
              />
              <Text style={s.stepBtnTxt}>
                {state === "verifying"
                  ? "Vérification…"
                  : isLoading
                    ? "Ouverture…"
                    : isFailed
                      ? "Réessayer"
                      : step.btnLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  /* ── Rendu principal ─────────────────────────────────────── */
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <View style={s.card}>
          {/* ── En-tête ── */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <Feather name="bell" size={rf(26)} color={C.brand} />
            </View>
            <Text style={s.title}>Activer les rappels</Text>
            <Text style={s.subtitle}>
              Quelques réglages Android pour que vos rappels de cours arrivent
              toujours à l'heure, même quand le téléphone est en veille.
            </Text>
          </View>

          {/* ── Barre de progression ── */}
          {steps.length > 1 && (
            <View style={s.progressRow}>
              {steps.map((step, i) => {
                const done = states[step.key] === "done";
                return (
                  <React.Fragment key={step.key}>
                    <View style={[s.progressStep, done && s.progressStepDone]}>
                      {done
                        ? <Feather name="check" size={rf(10)} color="#fff" />
                        : <Text style={s.progressNum}>{i + 1}</Text>}
                    </View>
                    {i < steps.length - 1 && (
                      <View style={[s.progressLine, done && s.progressLineDone]} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* ── Liste des étapes ── */}
          <ScrollView
            style={s.stepsScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: rs(12) }}
          >
            {steps.map(step => renderStep(step))}
          </ScrollView>

          {/* ── Pied de page ── */}
          <View style={s.footer}>
            {allDone ? (
              <TouchableOpacity style={s.doneBtn} onPress={handleClose} activeOpacity={0.85}>
                <Feather name="check-circle" size={rf(17)} color="#fff" style={{ marginRight: rs(8) }} />
                <Text style={s.doneBtnTxt}>Tout est configuré — Continuer</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                <Text style={s.skipTxt}>Ignorer pour l'instant</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const s = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent:  "center",
    alignItems:      "center",
    padding:         rs(20),
  },
  card: {
    backgroundColor: C.surface,
    borderRadius:    rs(24),
    width:           "100%",
    maxHeight:       "92%",
    padding:         rs(24),
    shadowColor:     "#000",
    shadowOpacity:   0.22,
    shadowOffset:    { width: 0, height: 8 },
    shadowRadius:    24,
    elevation:       16,
  },

  /* Header */
  header: {
    alignItems:   "center",
    marginBottom: rs(20),
  },
  iconWrap: {
    width:           rs(60),
    height:          rs(60),
    borderRadius:    rs(30),
    backgroundColor: C.primarySoft ?? "#e8efff",
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    rs(14),
  },
  title: {
    fontSize:     rf(20),
    fontWeight:   "800",
    color:        C.text,
    marginBottom: rs(8),
    textAlign:    "center",
  },
  subtitle: {
    fontSize:   rf(14),
    color:      C.textMuted,
    textAlign:  "center",
    lineHeight: rf(20),
  },

  /* Barre de progression */
  progressRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   rs(20),
  },
  progressStep: {
    width:           rs(26),
    height:          rs(26),
    borderRadius:    rs(13),
    backgroundColor: C.border,
    alignItems:      "center",
    justifyContent:  "center",
  },
  progressStepDone: {
    backgroundColor: C.brand,
  },
  progressNum: {
    fontSize:   rf(11),
    fontWeight: "700",
    color:      C.textMuted,
  },
  progressLine: {
    flex:             1,
    height:           rs(2),
    backgroundColor:  C.border,
    marginHorizontal: rs(4),
    maxWidth:         rs(40),
  },
  progressLineDone: {
    backgroundColor: C.brand,
  },

  /* Étapes */
  stepsScroll: {
    flexShrink: 1,
  },
  stepRow: {
    flexDirection:   "row",
    alignItems:      "flex-start",
    backgroundColor: C.bg,
    borderRadius:    rs(16),
    borderWidth:     1.5,
    borderColor:     C.border,
    padding:         rs(14),
    gap:             rs(12),
  },
  stepRowDone: {
    borderColor:     C.brand + "44",
    backgroundColor: C.brand + "0a",
  },
  stepRowFailed: {
    borderColor:     "#ef444466",
    backgroundColor: "#ef444408",
  },
  stepIconWrap: {
    width:           rs(38),
    height:          rs(38),
    borderRadius:    rs(19),
    backgroundColor: C.primarySoft ?? "#e8efff",
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  stepIconDone: {
    backgroundColor: C.brand,
  },
  stepIconFailed: {
    backgroundColor: "#ef4444",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize:     rf(15),
    fontWeight:   "700",
    color:        C.text,
    marginBottom: rs(4),
  },
  stepTitleDone: {
    color: C.brand,
  },
  stepTitleFailed: {
    color: "#ef4444",
  },
  stepDesc: {
    fontSize:     rf(13),
    color:        C.textMuted,
    lineHeight:   rf(19),
    marginBottom: rs(10),
  },
  failMsg: {
    fontSize:     rf(12),
    color:        "#ef4444",
    lineHeight:   rf(17),
    marginBottom: rs(10),
  },
  stepBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   C.brand,
    borderRadius:      rs(10),
    paddingVertical:   rs(9),
    paddingHorizontal: rs(14),
    alignSelf:         "flex-start",
  },
  stepBtnLoading: {
    opacity: 0.65,
  },
  stepBtnRetry: {
    backgroundColor: "#ef4444",
  },
  stepBtnTxt: {
    fontSize:   rf(13),
    fontWeight: "700",
    color:      "#fff",
  },

  /* Footer */
  footer: {
    marginTop:  rs(20),
    alignItems: "center",
  },
  doneBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   C.brand,
    borderRadius:      rs(14),
    paddingVertical:   rs(14),
    paddingHorizontal: rs(24),
    width:             "100%",
    justifyContent:    "center",
  },
  doneBtnTxt: {
    fontSize:   rf(16),
    fontWeight: "700",
    color:      "#fff",
  },
  skipTxt: {
    fontSize:           rf(14),
    color:              C.textMuted,
    textDecorationLine: "underline",
    paddingVertical:    rs(8),
  },
});
