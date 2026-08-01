import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { rs } from "../utils/responsive";

interface Props {
  size?: number;
}

export default function AredLogo({ size = 100 }: Props) {
  return (
    <View style={[s.wrap, { width: rs(size), height: rs(size) }]}>
      <Image
        source={require("../../assets/logo.png")}
        style={{ width: rs(size), height: rs(size), borderRadius: rs(size * 0.2) }}
        resizeMode="contain"
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
