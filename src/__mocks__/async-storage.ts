/**
 * Mock de @react-native-async-storage/async-storage pour les tests Jest.
 */
const store = new Map<string, string>();

const AsyncStorage = {
  setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
  getItem: jest.fn(async (key: string): Promise<string | null> => store.get(key) ?? null),
  removeItem: jest.fn(async (key: string) => { store.delete(key); }),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => store.delete(k)); }),
  clear: jest.fn(async () => { store.clear(); }),
};

export function __resetStore() {
  store.clear();
  jest.clearAllMocks();
}

export default AsyncStorage;
