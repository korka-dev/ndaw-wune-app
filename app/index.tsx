import { Redirect } from "expo-router";
import { getSecure } from "../src/services/secureStorage";
import { useEffect, useState } from "react";

export default function Index() {
  const [ready,    setReady]    = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [role,     setRole]     = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSecure("access_token"),
      getSecure("user_role"),
    ]).then(([token, storedRole]) => {
      setHasToken(!!token);
      setRole(storedRole);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  if (__DEV__) return <Redirect href="/welcome" />;

  if (!hasToken) return <Redirect href="/welcome" />;

  // Redirect based on role
  if (role === "superviseur") return <Redirect href="/(supervisor-tabs)/presences" />;

  return <Redirect href="/(tabs)/home" />;
}
