/** Version web (PWA) d'expo-local-authentication : pas d'empreinte dans le navigateur,
 *  le verrou applicatif ne s'active donc jamais (comme un appareil sans code). */
export enum SecurityLevel { NONE = 0, SECRET = 1, BIOMETRIC_WEAK = 2, BIOMETRIC_STRONG = 3 }
export async function getEnrolledLevelAsync(): Promise<SecurityLevel> { return SecurityLevel.NONE; }
export async function hasHardwareAsync(): Promise<boolean> { return false; }
export async function isEnrolledAsync(): Promise<boolean> { return false; }
export async function authenticateAsync(): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}
