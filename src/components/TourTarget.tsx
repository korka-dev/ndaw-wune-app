/**
 * Cibles de la visite guidée (FeatureTour).
 *
 * Un écran enveloppe une section clé avec <TourTarget id="...">.
 * La visite guidée mesure ensuite la position réelle de cette section
 * à l'écran (measureInWindow) pour y placer son cadre "spotlight"
 * exactement — quel que soit l'appareil, le scroll ou le contenu.
 *
 * Si la cible n'est pas montée (contenu conditionnel), la visite
 * retombe sur une zone approximative de l'écran.
 */
import React, { useEffect, useRef } from "react";
import { View, ViewStyle, StyleProp } from "react-native";

export type TargetRect = { x: number; y: number; w: number; h: number };

const nodes = new Map<string, View>();

function register(id: string, node: View | null) {
  if (node) nodes.set(id, node);
  else nodes.delete(id);
}

/**
 * Mesure la position d'une cible dans la fenêtre.
 * Résout null si la cible n'est pas montée ou pas encore mesurable.
 */
export function measureTourTarget(id: string): Promise<TargetRect | null> {
  const node = nodes.get(id);
  if (!node) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      node.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) resolve({ x, y, w, h });
        else resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

interface Props {
  id: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function TourTarget({ id, children, style }: Props) {
  const ref = useRef<View>(null);

  useEffect(() => {
    register(id, ref.current);
    return () => register(id, null);
  }, [id]);

  return (
    // collapsable={false} : indispensable sur Android, sinon la View
    // est optimisée/fusionnée et measureInWindow ne renvoie rien.
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
