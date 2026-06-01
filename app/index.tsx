import { Redirect } from "expo-router";
import { getSecure } from "../src/services/secureStorage";
import { useEffect, useState } from "react";
import LoadingScreen from "../src/components/LoadingScreen";
import { useStore } from "../src/store/useStore";

export default function Index() {
  const [ready,    setReady]    = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [role,     setRole]     = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const [token, storedRole] = await Promise.all([
        getSecure("access_token"),
        getSecure("user_role"),
      ]);

      if (token) {
        // Restaurer le token + les données du cache local dans le store Zustand.
        // Sans ça, NetworkWatcher voit token=null et ne synce jamais au redémarrage.
        await useStore.getState().hydrateFromCache(token);
      }

      setHasToken(!!token);
      setRole(storedRole);
      setReady(true);
    }
    init();
  }, []);

  if (!ready) return <LoadingScreen />;

  if (__DEV__) return <Redirect href="/welcome" />;

  if (!hasToken) return <Redirect href="/welcome" />;

  // Redirect based on role
  if (role === "superviseur") return <Redirect href="/(supervisor-tabs)/presences" />;

  return <Redirect href="/(tabs)/home" />;
}
