import { Redirect } from "expo-router";
import { getSecure } from "../src/services/secureStorage";
import { useEffect, useState } from "react";
import LoadingScreen from "../src/components/LoadingScreen";
import { useStore } from "../src/store/useStore";
import { routeAccueilPourRole } from "../src/utils/roleRoute";

export default function Index() {
  const [ready,    setReady]    = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [role,     setRole]     = useState<string | null>(null);
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    async function init() {
      const [token, storedRole, mustChangeFlag] = await Promise.all([
        getSecure("access_token"),
        getSecure("user_role"),
        getSecure("must_change_password"),
      ]);

      if (token) {
        // Restaurer le token + les données du cache local dans le store Zustand.
        // Sans ça, NetworkWatcher voit token=null et ne synce jamais au redémarrage.
        await useStore.getState().hydrateFromCache(token);
      }

      setHasToken(!!token);
      setRole(storedRole);
      setMustChange(mustChangeFlag === "1");
      setReady(true);
    }
    init();
  }, []);

  if (!ready) return <LoadingScreen />;

  if (__DEV__) return <Redirect href="/welcome" />;

  if (!hasToken) return <Redirect href="/welcome" />;

  // APP-08 : mot de passe temporaire pas encore changé → aucun accès aux écrans.
  if (mustChange) return <Redirect href="/change-password" />;

  // Redirect based on role (tuteur, superviseur, inspecteur — lot L8)
  return <Redirect href={routeAccueilPourRole(role) as any} />;
}
