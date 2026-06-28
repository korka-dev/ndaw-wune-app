/**
 * Tests — SupRapportsScreen : menu de sélection du type de rapport (Android)
 *
 * Vérifie la machine d'états view ('menu' | 'rapport') :
 *   1. Vue initiale = 'menu'
 *   2. Cliquer "Rapport" passe view → 'rapport'
 *   3. resetForm() depuis le formulaire retourne view → 'menu'
 *   4. "Rapports pédagogiques" n'est pas cliquable (pas de onPress)
 *   5. La page menu se rend sans erreur (smoke test)
 *   6. La page rapport se rend sans erreur après transition
 */

import React from "react";
import { create, act } from "react-test-renderer";
import { TouchableOpacity, Text, View } from "react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock("expo-secure-store");
jest.mock("../services/api", () => ({
  rapportJournalierApi: { submit: jest.fn() },
  superviseurApi:       { sync: jest.fn(), getPresenceCheck: jest.fn() },
}));
jest.mock("../store/useStore", () => ({
  useStore: jest.fn(() => ({
    user:        { name: "Test Superviseur" },
    isOnline:    true,
    syncOffline: jest.fn(),
  })),
}));
jest.mock("../services/db", () => ({
  getRapportsJournalier:       jest.fn(() => []),
  insertRapportJournalier:     jest.fn(),
  markRapportJournalierSynced: jest.fn(),
  enqueueAction:               jest.fn(),
}));
jest.mock("../components/AppHeader",   () => () => null);
jest.mock("../components/ProfileSheet", () => () => null);

import SupRapportsScreen from "../screens/supervisor/SupRapportsScreen";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getAllTexts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAllByType(Text)
    .map((t) => String(t.props.children ?? ""))
    .filter(Boolean);
}

function findTouchableByLabel(root: ReturnType<typeof create>, label: string) {
  const touchables = root.root.findAllByType(TouchableOpacity);
  return touchables.find((t) => {
    try {
      return t.findAll((node) =>
        node.type === Text && String(node.props.children ?? "").includes(label),
      ).length > 0;
    } catch { return false; }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("SupRapportsScreen — vue initiale (menu)", () => {
  test("se rend sans erreur (smoke test)", () => {
    expect(() => {
      act(() => { create(<SupRapportsScreen />); });
    }).not.toThrow();
  });

  test("la vue initiale affiche le titre 'Rapports'", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Rapports"))).toBe(true);
  });

  test("la vue initiale contient l'option 'Rapport'", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const texts = getAllTexts(root!);
    expect(texts.some((t) => t === "Rapport")).toBe(true);
  });

  test("la vue initiale contient 'Rapports pédagogiques'", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Rapports pédagogiques") || t.includes("pédagogiques"))).toBe(true);
  });

  test("la vue initiale contient le badge 'Bientôt'", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Bientôt"))).toBe(true);
  });

  test("la vue menu N'affiche PAS 'Mes rapports' (contenu rapport caché)", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Mes rapports"))).toBe(false);
  });
});

describe("SupRapportsScreen — transition menu → rapport", () => {
  test("cliquer 'Rapport' affiche la vue rapport ('Mes rapports')", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const rapportBtn = findTouchableByLabel(root!, "Rapport");
    expect(rapportBtn).toBeDefined();

    act(() => { rapportBtn!.props.onPress(); });

    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Mes rapports"))).toBe(true);
  });

  test("cliquer 'Rapport' masque le menu (titre 'Rapports' de sélection absent)", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const rapportBtn = findTouchableByLabel(root!, "Rapport");
    act(() => { rapportBtn!.props.onPress(); });

    const texts = getAllTexts(root!);
    // "Sélectionnez le type de rapport" ne doit plus apparaître
    expect(texts.some((t) => t.includes("Sélectionnez"))).toBe(false);
  });

  test("cliquer 'Rapport' fait apparaître le bouton 'Envoyer un rapport'", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const rapportBtn = findTouchableByLabel(root!, "Rapport");
    act(() => { rapportBtn!.props.onPress(); });

    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Envoyer un rapport"))).toBe(true);
  });

  test("le lien 'Rapports' (retour menu) est visible dans la vue rapport", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    const rapportBtn = findTouchableByLabel(root!, "Rapport");
    act(() => { rapportBtn!.props.onPress(); });

    const texts = getAllTexts(root!);
    // Le lien retour affiche "Rapports"
    expect(texts.some((t) => t === "Rapports")).toBe(true);
  });
});

describe("SupRapportsScreen — retour au menu", () => {
  test("cliquer le lien retour depuis la vue rapport ramène au menu", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    // 1. Aller à la vue rapport
    const rapportBtn = findTouchableByLabel(root!, "Rapport");
    act(() => { rapportBtn!.props.onPress(); });

    // 2. Cliquer le lien retour "Rapports"
    const backBtn = findTouchableByLabel(root!, "Rapports");
    expect(backBtn).toBeDefined();
    act(() => { backBtn!.props.onPress(); });

    // 3. Le menu doit réapparaître
    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Sélectionnez"))).toBe(true);
    expect(texts.some((t) => t.includes("Mes rapports"))).toBe(false);
  });

  test("annuler le formulaire (page 1) retourne au menu", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    // 1. Aller à la vue rapport
    const rapportBtn = findTouchableByLabel(root!, "Rapport");
    act(() => { rapportBtn!.props.onPress(); });

    // 2. Cliquer "Envoyer un rapport" pour ouvrir le formulaire (page 1)
    const sendBtn = findTouchableByLabel(root!, "Envoyer un rapport");
    act(() => { sendBtn!.props.onPress(); });

    // Le formulaire page 1 est ouvert (contient "Suivant")
    expect(getAllTexts(root!).some((t) => t.includes("Suivant"))).toBe(true);

    // 3. Cliquer le bouton retour du formulaire (arrow-left)
    const backBtn = root!.root.findAllByType(TouchableOpacity)[0];
    act(() => { backBtn.props.onPress(); });

    // Le menu doit réapparaître
    const texts = getAllTexts(root!);
    expect(texts.some((t) => t.includes("Sélectionnez"))).toBe(true);
  });
});

describe("SupRapportsScreen — 'Rapports pédagogiques' non disponible", () => {
  test("'Rapports pédagogiques' N'a PAS de handler onPress (carte désactivée)", () => {
    let root: ReturnType<typeof create>;
    act(() => { root = create(<SupRapportsScreen />); });

    // La card "Rapports pédagogiques" doit être un View, pas un TouchableOpacity
    const texts = root!.root.findAllByType(Text);
    const pedaNode = texts.find((t) =>
      String(t.props.children ?? "").includes("pédagogiques"),
    );
    expect(pedaNode).toBeDefined();

    // Remonter au parent direct et vérifier qu'il s'agit d'un View (pas TouchableOpacity)
    // Le View parent ne doit pas avoir de onPress
    const allTouchables = root!.root.findAllByType(TouchableOpacity);
    const hasPedaClickable = allTouchables.some((tb) => {
      try {
        return tb.findAll((n) =>
          n.type === Text && String(n.props.children ?? "").includes("pédagogiques"),
        ).length > 0;
      } catch { return false; }
    });
    expect(hasPedaClickable).toBe(false);
  });
});
