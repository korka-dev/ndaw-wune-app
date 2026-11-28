jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: jest.fn(async (uri: string) => ({ uri: uri + ".small.jpg", base64: "QUJD" })),
}));
import { compresserPhoto, redimensionnement, LARGEUR_MAX_PHOTO } from "../utils/photo";
import { manipulateAsync } from "expo-image-manipulator";

describe("Photos réduites avant envoi", () => {
  test("seules les grandes photos sont redimensionnées", () => {
    expect(redimensionnement(4000, 3000)).toEqual({ width: LARGEUR_MAX_PHOTO });
    expect(redimensionnement(800, 600)).toBeNull();
    expect(redimensionnement(undefined, undefined)).toBeNull();
  });

  test("photo compressée, et original conservé si la compression échoue", async () => {
    expect(await compresserPhoto({ uri: "file:///a.jpg", width: 4000, height: 3000 }))
      .toEqual({ uri: "file:///a.jpg.small.jpg", base64: "QUJD" });
    (manipulateAsync as jest.Mock).mockRejectedValueOnce(new Error("x"));
    expect(await compresserPhoto({ uri: "file:///b.jpg", base64: "orig" })).toEqual({ uri: "file:///b.jpg", base64: "orig" });
  });
});
