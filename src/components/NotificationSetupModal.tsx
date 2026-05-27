/**
 * NotificationSetupModal — Guide de configuration des notifications (Android)
 * ────────────────────────────────────────────────────────────────────────────
 * Affiché une seule fois au premier lancement, il guide l'enseignant à travers
 * les 2–3 étapes nécessaires pour que les rappels arrivent à l'heure exacte :
 *
 *  1. Autoriser les notifications (POST_NOTIFICATIONS — Android 13+)
 *  2. Désactiver l'optimisation batterie (Doze mode — tous Android)
 *  3. Autoriser les alarmes exactes (SCHEDULE_EXACT_ALARM — Android 12+)
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
  NOTIF_SETUP_MODAL_KEY,
} from "../services/notifications";

/* ── Types ───────────────────────────────────────────────────── */
type StepState = "idle" | "loading" | "done";

interface StepDef {
  key: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  desc: string;
  btnLabel: string;
  show: boolean;
  onAction: () => Promise<void>;
}

/* ── Composant ───────────────────────────────────────────────── */
interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationSetupModal({ visible, onClose }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // État par étape : idle | loading | done
  const [states, setStates] = useState<Record<string, StepState>>({
    notif:   "idle",
    battery: "idle",
    alarm:   "idle",
  });

  // Fade-in à l'ouverture
  useEffect(() => {
    if (visible) {
      setStates({ notif: "idle", battery: "idle", alarm: "idle" });
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
    try {
      await setupNotifications();
    } catch {}
    setStep("notif", "done");
  };

  const doBattery = async () => {
    setStep("battery", "loading");
    try {
      await requestIgnoreBatteryOptimization();
    } catch {}
    setStep("battery", "done");
  };

  const doAlarm = async () => {
    setStep("alarm", "loading");
    try {
      await openExactAlarmSettings();
    } catch {}
    setStep("alarm", "done");
  };

  /* ── Définition des étapes ───────────────────────────────── */
  const steps: StepDef[] = [
    {
      key:      "notif",
      icon:     "bell",
      title:    "Autoriser les notifications",
      desc:     Platform.OS === "android" && Number(Platform.Version) >= 33
        ? "Android 13+ requiert votre accord explicite pour afficher des notifications. Appuyez sur « Autoriser » dans la boîte de dialogue."
        : "Autorisez Ndaw Wune à envoyer des rappels avant vos cours.",
      btnLabel: "Activer les notifications",
      show:     true,
      onAction: doNotif,
    },
    {
      key:      "battery",
      icon:     "battery-charging",
      title:    "Optimisation batterie",
      desc:     "Android peut endormir les alarmes pour économiser la batterie. Appuyez sur « Ne pas optimiser » dans la boîte de dialogue pour que vos rappels sonnent même en veille.",
      btnLabel: "Désactiver l'optimisation",
      show:     Platform.OS === "android",
      onAction: doBattery,
    },
    {
      key:      "alarm",
      icon:     "clock",
      title:    "Alarmes exactes",
      desc:     "Android 12 et supérieur nécessite une autorisation pour les alarmes à l'heure précise. Sans cela, vos rappels pourraient arriver en retard.",
      btnLabel: "Autoriser les alarmes exactes",
      show:     Platform.OS === "android" && Number(Platform.Version) >= 31,
      onAction: doAlarm,
    },
  ].filter(s => s.show);

  const totalDone   = steps.filter(s => states[s.key] === "done").length;
  const allDone     = totalDone === steps.length;

  /* ── Fermeture définitive ────────────────────────────────── */
  const handleClose = async () => {
    try {
      await AsyncStorage.setItem(NOTIF_SETUP_MODAL_KEY, "1");
    } catch {}
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  /* ── Rendu ───────────────────────────────────────────────── */
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
                        : <Text style={s.progressNum}>{i + 1}</Text>
                      }
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
            {steps.map(step => {
              const state = states[step.key];
              const isDone    = state === "done";
              const isLoading = state === "loading";

              return (
                <View key={step.key} style={[s.stepRow, isDone && s.stepRowDone]}>
                  {/* Icône de l'étape */}
                  <View style={[s.stepIconWrap, isDone && s.stepIconDone]}>
                    <Feather
                      name={isDone ? "check" : step.icon}
                      size={rf(18)}
                      color={isDone ? "#fff" : C.brand}
                    />
                  </View>

                  {/* Contenu */}
                  <View style={s.stepContent}>
                    <Text style={[s.stepTitle, isDone && s.stepTitleDone]}>
                      {step.title}
                    </Text>
                    {!isDone && (
                      <Text style={s.stepDesc}>{step.desc}</Text>
                    )}

                    {/* Bouton d'action */}
                    {!isDone && (
                      <TouchableOpacity
                        style={[s.stepBtn, isLoading && s.stepBtnLoading]}
                        onPress={step.onAction}
                        disabled={isLoading}
                        activeOpacity={0.8}
                      >
                        <Feather
                          name={isLoading ? "loader" : "arrow-right"}
                          size={rf(13)}
                          color="#fff"
                          style={{ marginRight: rs(6) }}
                        />
                        <Text style={s.stepBtnTxt}>
                          {isLoading ? "Ouverture…" : step.btnLabel}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* ── Pied de page ── */}
          <View style={s.footer}>
            {allDone ? (
              <TouchableOpacity
                style={s.doneBtn}
                onPress={handleClose}
                activeOpacity={0.85}
              >
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
    maxHeight:       "88%",
    padding:         rs(24),
    shadowColor:     "#000",
    shadowOpacity:   0.22,
    shadowOffset:    { width: 0, height: 8 },
    shadowRadius:    24,
    elevation:       16,
  },

  /* Header */
  header: {
    alignItems:    "center",
    marginBottom:  rs(20),
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
    flex:            1,
    height:          rs(2),
    backgroundColor: C.border,
    marginHorizontal: rs(4),
    maxWidth:        rs(40),
  },
  progressLineDone: {
    backgroundColor: C.brand,
  },

  /* Liste des étapes */
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
  stepDesc: {
    fontSize:     rf(13),
    color:        C.textMuted,
    lineHeight:   rf(18),
    marginBottom: rs(10),
  },
  stepBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: C.brand,
    borderRadius:    rs(10),
    paddingVertical: rs(9),
    paddingHorizontal: rs(14),
    alignSelf:       "flex-start",
  },
  stepBtnLoading: {
    opacity: 0.65,
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
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: C.brand,
    borderRadius:    rs(14),
    paddingVertical: rs(14),
    paddingHorizontal: rs(24),
    width:           "100%",
    justifyContent:  "center",
  },
  doneBtnTxt: {
    fontSize:   rf(16),
    fontWeight: "700",
    color:      "#fff",
  },
  skipTxt: {
    fontSize:   rf(14),
    color:      C.textMuted,
    textDecorationLine: "underline",
    paddingVertical: rs(8),
  },
});
