/**
 * Version web (PWA) de react-native-pdf : le PDF est téléchargé avec le jeton
 * de connexion puis affiché par le lecteur PDF du navigateur.
 */
import React, { useEffect, useState } from "react";

type Props = {
  source: { uri: string; headers?: Record<string, string> };
  style?: unknown;
  onLoadComplete?: (pages: number) => void;
  onError?: (e: unknown) => void;
  [k: string]: unknown;
};

export default function Pdf({ source, onLoadComplete, onError }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    let objet: string | null = null;
    (async () => {
      try {
        const r = await fetch(source.uri, { headers: source.headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        objet = URL.createObjectURL(await r.blob());
        if (!annule) { setUrl(objet); onLoadComplete?.(1); }
      } catch (e) {
        if (!annule) onError?.(e);
      }
    })();
    return () => { annule = true; if (objet) URL.revokeObjectURL(objet); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.uri]);

  if (!url) return null;
  return React.createElement("iframe", {
    src: url, title: "Document PDF",
    style: { flex: 1, width: "100%", height: "100%", border: "none" },
  });
}
