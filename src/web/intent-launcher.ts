/** Version web (PWA) d'expo-intent-launcher : sans objet dans le navigateur. */
export async function startActivityAsync(): Promise<never> {
  throw new Error("Ouverture d'une autre application impossible depuis le navigateur.");
}
