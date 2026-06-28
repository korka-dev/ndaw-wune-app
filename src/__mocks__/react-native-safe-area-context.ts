/**
 * Mock de react-native-safe-area-context pour les tests.
 */
export const useSafeAreaInsets = jest.fn(() => ({
  top: 0, bottom: 0, left: 0, right: 0,
}));

export const SafeAreaProvider = ({ children }: { children: React.ReactNode }) => children;
export const SafeAreaView     = ({ children }: { children: React.ReactNode }) => children;

import React from "react";
