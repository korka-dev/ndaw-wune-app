/**
 * Mock minimal d'expo-router pour les tests de composants.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

export const useRouter = jest.fn(() => ({
  push:    mockPush,
  back:    mockBack,
  replace: mockReplace,
  navigate: jest.fn(),
}));

export const useLocalSearchParams = jest.fn(() => ({}));
export const useFocusEffect       = jest.fn((_cb: () => unknown) => { /* no-op en test */ });
export const Link                 = () => null;
export const Redirect             = () => null;
export const Stack                = { Screen: () => null };
export const Tabs                 = { Screen: () => null };

/** Utilitaires de test */
export function __getMockRouter() {
  return { push: mockPush, back: mockBack, replace: mockReplace };
}
export function __resetRouter() {
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
}
