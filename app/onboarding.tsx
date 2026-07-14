import React, { useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Animated, useWindowDimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { rs, rf } from "../src/utils/responsive";
import { C } from "../src/utils/theme";

export const ONBOARDING_KEY = "onboarding_done";

type Slide = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  colorSoft: string;
  title: string;
  desc: string;
};

const SLIDES: Slide[] = [
  {
    key: "planning",
    icon: "calendar",
    color: C.primary,
    colorSoft: C.primarySoft,
    title: "Votre planning en un coup d'œil",
    desc: "Consultez vos séances du jour et à venir : classe, matière, horaire. Tout votre emploi du temps ARED, directement sur votre téléphone.",
  },
  {
    key: "rapports",
    icon: "edit-3",
    color: C.brand,
    colorSoft: C.brandSoft,
    title: "Rapports journaliers simplifiés",
    desc: "Après chaque séance, remplissez votre rapport en quelques taps : présences, contenu enseigné, difficultés rencontrées.",
  },
  {
    key: "evaluations",
    icon: "bar-chart-2",
    color: C.success,
    colorSoft: C.successSoft,
    title: "Évaluations ASER",
    desc: "Évaluez le niveau de vos élèves en lecture et en calcul, et suivez leur progression tout au long de l'année.",
  },
  {
    key: "offline",
    icon: "wifi-off",
    color: C.warn,
    colorSoft: C.warnSoft,
    title: "Fonctionne sans connexion",
    desc: "Pas de réseau ? Aucun problème. Vos saisies sont enregistrées sur le téléphone et synchronisées automatiquement dès que la connexion revient.",
  },
  {
    key: "alertes",
    icon: "bell",
    color: C.danger,
    colorSoft: C.dangerSoft,
    title: "Rappels vocaux avant vos séances",
    desc: "Recevez une alerte vocale 30 minutes puis 5 minutes avant chaque séance, même si votre téléphone est verrouillé.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // "from=profile" : didacticiel rouvert depuis le profil (utilisateur connecté)
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    if (from === "profile") {
      router.back();
    } else {
      router.replace("/user-type");
    }
  }

  function next() {
    if (isLast) {
      finish();
    } else {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(i, SLIDES.length - 1)));
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={s.safe} edges={["top"]}>

        {/* ── Bouton "Passer" ── */}
        <View style={s.topBar}>
          {!isLast ? (
            <TouchableOpacity
              onPress={finish}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Text style={s.skipTxt}>Passer</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ height: rf(20) }} />
          )}
        </View>

        {/* ── Slides ── */}
        <Animated.FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={item => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item, index: i }) => {
            // Léger parallax : le contenu du slide glisse un peu plus vite
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const translateX = scrollX.interpolate({
              inputRange,
              outputRange: [width * 0.15, 0, -width * 0.15],
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.2, 1, 0.2],
            });

            return (
              <View style={[s.slide, { width }]}>
                <Animated.View style={[s.slideInner, { opacity, transform: [{ translateX }] }]}>
                  <View style={[s.iconBg, { backgroundColor: item.colorSoft }]}>
                    <Feather name={item.icon} size={rf(52)} color={item.color} />
                  </View>
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.desc}>{item.desc}</Text>
                </Animated.View>
              </View>
            );
          }}
        />

        {/* ── Points indicateurs ── */}
        {/* Le native driver ne supporte pas l'animation de `width` :
            on anime `scaleX` (transform), supporté nativement. */}
        <View style={s.dots}>
          {SLIDES.map((slide, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotScaleX = scrollX.interpolate({
              inputRange,
              outputRange: [1, 3, 1],
              extrapolate: "clamp",
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.35, 1, 0.35],
              extrapolate: "clamp",
            });
            return (
              <Animated.View
                key={slide.key}
                style={[
                  s.dot,
                  {
                    opacity: dotOpacity,
                    backgroundColor: slide.color,
                    transform: [{ scaleX: dotScaleX }],
                  },
                ]}
              />
            );
          })}
        </View>

        {/* ── Bouton bas de page ── */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, rs(16)) + rs(16) }]}>
          <TouchableOpacity style={s.btn} onPress={next} activeOpacity={0.85}>
            <Text style={s.btnTxt}>{isLast ? "C'est parti !" : "Suivant"}</Text>
            <Feather
              name={isLast ? "check" : "arrow-right"}
              size={rf(18)}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  safe:   { flex: 1 },

  topBar: {
    alignItems: "flex-end",
    paddingHorizontal: rs(24),
    paddingTop: rs(16),
  },
  skipTxt: {
    fontSize: rf(14),
    fontWeight: "600",
    color: C.textMuted,
  },

  slide: {
    justifyContent: "center",
    alignItems: "center",
  },
  slideInner: {
    alignItems: "center",
    paddingHorizontal: rs(36),
  },
  iconBg: {
    width: rs(120),
    height: rs(120),
    borderRadius: rs(60),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rs(32),
  },
  title: {
    fontSize: rf(24),
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
    marginBottom: rs(14),
    lineHeight: rf(32),
  },
  desc: {
    fontSize: rf(15),
    color: C.textMuted,
    textAlign: "center",
    lineHeight: rf(24),
  },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: rs(14),
    marginBottom: rs(28),
  },
  dot: {
    width: rs(8),
    height: rs(8),
    borderRadius: rs(4),
  },

  footer: {
    paddingHorizontal: rs(24),
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: rs(16),
    paddingVertical: rs(17),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    shadowColor: C.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  btnTxt: {
    color: "#fff",
    fontSize: rf(16),
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
