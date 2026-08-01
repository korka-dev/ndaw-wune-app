import { segDureeLabel, dureeLabel, segDurMin } from "../utils/duree";

describe("Durées du planning (aucun horaire affiché)", () => {
  test("segDureeLabel formate la durée d'un créneau", () => {
    expect(segDureeLabel("08:00", "08:30")).toBe("30 min");
    expect(segDureeLabel("08:00:00", "09:00:00")).toBe("1 h");
    expect(segDureeLabel("09:15", "10:45")).toBe("1 h 30");
    expect(segDureeLabel("07:30", "09:05")).toBe("1 h 35");
    expect(segDureeLabel("08:00", "08:00")).toBe("0 min");
  });

  test("une fin antérieure au début ne produit jamais de durée négative", () => {
    expect(segDurMin("09:00", "08:00")).toBe(0);
  });

  test("dureeLabel cumule les durées longues", () => {
    expect(dureeLabel(0)).toBe("0 min");
    expect(dureeLabel(59)).toBe("59 min");
    expect(dureeLabel(120)).toBe("2 h");
    expect(dureeLabel(245)).toBe("4 h 05");
  });
});
