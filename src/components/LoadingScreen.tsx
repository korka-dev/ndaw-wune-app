/**
 * Écran de chargement JS — affiché pendant l'init async (vérif token, DB…).
 * Prend le relais visuellement après que le splash screen natif se cache.
 */
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { C } from "../utils/theme";
import { rf, rs } from "../utils/responsive";

export default function LoadingScreen() {
  const opacity = useRef(new Animated.Value(0)).current;

  // Fondu d'entrée doux
  useEffect(() => {
    Animated.timing(opacity, {
      toValue:         1,
      duration:        350,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.content}>
        <Image
          source={require("../../assets/splash-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <ActivityIndicator
          size="large"
          color={C.brand}
          style={styles.spinner}
        />
        <Text style={styles.label}>Chargement…</Text>
      </View>

      {/* Pied de page discret */}
      <Text style={styles.footer}>ARED NdawWune</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: C.bg,
    alignItems:      "center",
    justifyContent:  "center",
  },
  content: {
    alignItems: "center",
    gap:        rs(20),
  },
  logo: {
    width:        rs(190),
    height:       rs(190),
    borderRadius: rs(38),
  },
  spinner: {
    marginTop: rs(4),
  },
  label: {
    fontSize:   rf(14),
    fontWeight: "500",
    color:      C.textMuted,
    letterSpacing: 0.3,
  },
  footer: {
    position:   "absolute",
    bottom:     rs(32),
    fontSize:   rf(11),
    color:      C.border,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
