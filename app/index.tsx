import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export default function Index() {
  const [ready,    setReady]    = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("access_token").then(t => {
      setHasToken(!!t);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  // En développement → toujours repartir de l'écran d'accueil (welcome)
  // pour re-tester le flux de connexion à chaque changement.
  if (__DEV__) return <Redirect href="/welcome" />;

  return hasToken
    ? <Redirect href="/(tabs)/home" />
    : <Redirect href="/welcome" />;
}
