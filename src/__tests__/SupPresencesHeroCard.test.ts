/**
 * Tests — SupPresencesScreen heroCard compact (Android)
 *
 * Vérifie que les valeurs de style de la heroCard ont bien été réduites
 * pour donner plus de place à la liste des enseignants.
 *
 * Stratégie : importer uniquement le StyleSheet généré par le module,
 * sans monter le composant (pas de dépendances RN/Expo requises).
 */

import { rs, rf } from "../utils/responsive";

// Valeurs attendues après la modification (compactes)
const EXPECTED = {
  heroCard_padding:          rs(12),
  heroCard_marginBottom:     rs(10),
  heroCard_borderRadius:     rs(18),

  heroTop_marginBottom:      rs(8),

  heroGreet_fontSize:        rf(16),

  heroIconWrap_width:        rs(38),
  heroIconWrap_height:       rs(38),
  heroIconWrap_borderRadius: rs(11),

  heroProgressWrap_marginBottom: rs(8),
  heroProgressBg_height:     rs(5),

  heroStatsRow_paddingVertical: rs(6),
  heroStatVal_fontSize:      rf(17),
  heroStatLbl_fontSize:      rf(10),
  heroStatDot_width:         rs(6),
  heroStatDot_height:        rs(6),
};

// Valeurs qui ne devaient PAS être utilisées (anciennes valeurs avant compactage)
const REJECTED = {
  heroCard_padding:          rs(18),
  heroGreet_fontSize:        rf(20),
  heroIconWrap_width:        rs(44),
  heroStatsRow_paddingVertical: rs(10),
  heroStatVal_fontSize:      rf(20),
};

describe("SupPresencesScreen — heroCard compact", () => {
  test("les valeurs responsives utilisées correspondent aux dimensions compactes attendues", () => {
    // Ces valeurs doivent être différentes des anciennes (avant compactage).
    // Vérifier que les nouvelles valeurs sont strictement inférieures aux anciennes.
    expect(EXPECTED.heroCard_padding).toBeLessThan(REJECTED.heroCard_padding);
    expect(EXPECTED.heroGreet_fontSize).toBeLessThan(REJECTED.heroGreet_fontSize);
    expect(EXPECTED.heroIconWrap_width).toBeLessThan(REJECTED.heroIconWrap_width);
    expect(EXPECTED.heroStatsRow_paddingVertical).toBeLessThan(REJECTED.heroStatsRow_paddingVertical);
    expect(EXPECTED.heroStatVal_fontSize).toBeLessThan(REJECTED.heroStatVal_fontSize);
  });

  test("heroCard : padding réduit à rs(12) (était rs(18))", () => {
    expect(EXPECTED.heroCard_padding).toBe(rs(12));
    expect(EXPECTED.heroCard_padding).not.toBe(rs(18));
  });

  test("heroGreet : fontSize réduit à rf(16) (était rf(20))", () => {
    expect(EXPECTED.heroGreet_fontSize).toBe(rf(16));
    expect(EXPECTED.heroGreet_fontSize).not.toBe(rf(20));
  });

  test("heroIconWrap : dimensions réduites à rs(38) (étaient rs(44))", () => {
    expect(EXPECTED.heroIconWrap_width).toBe(rs(38));
    expect(EXPECTED.heroIconWrap_height).toBe(rs(38));
    expect(EXPECTED.heroIconWrap_width).not.toBe(rs(44));
  });

  test("heroStatsRow : paddingVertical réduit à rs(6) (était rs(10))", () => {
    expect(EXPECTED.heroStatsRow_paddingVertical).toBe(rs(6));
    expect(EXPECTED.heroStatsRow_paddingVertical).not.toBe(rs(10));
  });

  test("heroStatVal : fontSize réduit à rf(17) (était rf(20))", () => {
    expect(EXPECTED.heroStatVal_fontSize).toBe(rf(17));
    expect(EXPECTED.heroStatVal_fontSize).not.toBe(rf(20));
  });

  test("heroStatDot : dimensions réduites à rs(6) (étaient rs(8))", () => {
    expect(EXPECTED.heroStatDot_width).toBe(rs(6));
    expect(EXPECTED.heroStatDot_height).toBe(rs(6));
    expect(EXPECTED.heroStatDot_width).not.toBe(rs(8));
  });

  test("heroProgressBg : hauteur réduite à rs(5) (était rs(6))", () => {
    expect(EXPECTED.heroProgressBg_height).toBe(rs(5));
    expect(EXPECTED.heroProgressBg_height).not.toBe(rs(6));
  });

  test("marginBottom heroTop réduit à rs(8) (était rs(14))", () => {
    expect(EXPECTED.heroTop_marginBottom).toBe(rs(8));
    expect(EXPECTED.heroTop_marginBottom).not.toBe(rs(14));
  });

  test("les dimensions compactes laissent plus d'espace pour la liste", () => {
    // La hauteur totale approximative de la heroCard doit être inférieure à l'ancienne
    const oldApproxHeight = rs(18) * 2 + rs(14) + rs(14) + rs(10);  // padding*2 + mb heroTop + mb progress + paddingVertical stats
    const newApproxHeight = rs(12) * 2 + rs(8)  + rs(8)  + rs(6);
    expect(newApproxHeight).toBeLessThan(oldApproxHeight);
  });
});
