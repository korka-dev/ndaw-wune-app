/**
 * Tests — app/user-type.tsx
 *
 * Vérifie la logique de navigation de la page de sélection du type d'utilisateur :
 *   1. "Nouvel utilisateur" redirige vers /forgot-password
 *   2. "J'ai déjà un compte" redirige vers /login
 *   3. Le bouton retour appelle router.back()
 *   4. La page se rend sans erreur (smoke test Android)
 */

import React from "react";
import { create, act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";

// ── Mock expo-router avec accès direct aux jest.fn() ──────────────────────────
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
  Link: () => null,
  Redirect: () => null,
}));

import UserTypeScreen from "../../app/user-type";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UserTypeScreen — navigation", () => {
  test("se rend sans erreur (smoke test Android)", () => {
    expect(() => {
      act(() => { create(<UserTypeScreen />); });
    }).not.toThrow();
  });

  test("bouton retour → router.back()", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<UserTypeScreen />); });

    const buttons = root!.root.findAllByType(TouchableOpacity);
    // Premier bouton = le bouton retour (flèche gauche)
    act(() => { buttons[0].props.onPress(); });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("'Nouvel utilisateur' → router.push('/forgot-password')", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<UserTypeScreen />); });

    const buttons = root!.root.findAllByType(TouchableOpacity);
    // Deuxième bouton = carte "Nouvel utilisateur"
    act(() => { buttons[1].props.onPress(); });

    expect(mockPush).toHaveBeenCalledWith("/forgot-password");
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("'J'ai déjà un compte' → router.push('/login')", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<UserTypeScreen />); });

    const buttons = root!.root.findAllByType(TouchableOpacity);
    // Troisième bouton = carte "J'ai déjà un compte"
    act(() => { buttons[2].props.onPress(); });

    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("'Nouvel utilisateur' ne déclenche pas /login", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<UserTypeScreen />); });

    const buttons = root!.root.findAllByType(TouchableOpacity);
    act(() => { buttons[1].props.onPress(); });

    expect(mockPush).not.toHaveBeenCalledWith("/login");
  });

  test("'J'ai déjà un compte' ne déclenche pas /forgot-password", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<UserTypeScreen />); });

    const buttons = root!.root.findAllByType(TouchableOpacity);
    act(() => { buttons[2].props.onPress(); });

    expect(mockPush).not.toHaveBeenCalledWith("/forgot-password");
  });
});

describe("UserTypeScreen — exactitude des routes", () => {
  test("exactement 3 zones touchables : retour, nouveau, ancien", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<UserTypeScreen />); });

    const buttons = root!.root.findAllByType(TouchableOpacity);
    expect(buttons).toHaveLength(3);
  });

  test("les deux cartes utilisent des routes différentes", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<UserTypeScreen />); });

    const buttons = root!.root.findAllByType(TouchableOpacity);

    act(() => { buttons[1].props.onPress(); });
    const firstRoute = mockPush.mock.calls[0][0];
    mockPush.mockClear();

    act(() => { buttons[2].props.onPress(); });
    const secondRoute = mockPush.mock.calls[0][0];

    expect(firstRoute).not.toBe(secondRoute);
    expect([firstRoute, secondRoute]).toContain("/forgot-password");
    expect([firstRoute, secondRoute]).toContain("/login");
  });
});
