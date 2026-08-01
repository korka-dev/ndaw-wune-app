import { joursDisponibles } from "../utils/planning";

const seg = (jour: number) => ({ jour });

describe("Jours proposés dans le sélecteur de période", () => {
  test("propose les nb_jours configurés par l'admin, même sans créneau planifié", () => {
    expect(joursDisponibles([], 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(joursDisponibles([], 3)).toEqual([0, 1, 2]);
  });

  test("un planning limité à 3 jours ne bride plus la configuration à 7", () => {
    // Régression : avant, seuls les jours présents dans le planning étaient
    // proposés — la config admin nb_jours=7 était ignorée.
    const planning = [seg(0), seg(0), seg(1), seg(2)];
    expect(joursDisponibles(planning, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("un créneau au-delà de nb_jours reste proposé", () => {
    expect(joursDisponibles([seg(5)], 3)).toEqual([0, 1, 2, 5]);
  });

  test("dédoublonne et trie", () => {
    expect(joursDisponibles([seg(4), seg(1), seg(4)], 2)).toEqual([0, 1, 4]);
  });

  test("résiste à une configuration absurde", () => {
    expect(joursDisponibles([seg(2)], 0)).toEqual([2]);
    expect(joursDisponibles([], 0)).toEqual([]);
  });
});
