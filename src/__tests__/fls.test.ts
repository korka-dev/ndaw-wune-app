import { libelleFls } from "../utils/fls";

describe("libelleFls (profil, lot L10)", () => {
  it("affiche le type d'école", () => {
    expect(libelleFls(true)).toBe("École avec FLS");
    expect(libelleFls(false)).toBe("École sans FLS");
    expect(libelleFls(null)).toBe("Non renseigné");
    expect(libelleFls(undefined)).toBe("Non renseigné");
  });
});
