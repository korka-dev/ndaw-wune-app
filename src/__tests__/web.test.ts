import { base64DepuisDataUri, estWeb } from "../utils/web";

describe("aides web (PWA)", () => {
  it("n'est pas actif sur le téléphone", () => {
    expect(estWeb).toBe(false);
  });
  it("extrait le base64 d'une image data:", () => {
    expect(base64DepuisDataUri("data:image/jpeg;base64,QUJD")).toBe("QUJD");
    expect(base64DepuisDataUri("file:///photo.jpg")).toBeNull();
  });
});
