const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Version web (PWA, lot L12) : la base locale expo-sqlite tourne en WebAssembly.
config.resolver.assetExts.push("wasm");

// Modules propres au téléphone remplacés, sur le web uniquement, par un
// équivalent navigateur (src/web/). L'APK n'est pas concerné.
const WEB_SHIMS = {
  "expo-secure-store": "src/web/secure-store.ts",
  "expo-local-authentication": "src/web/local-authentication.ts",
  "expo-intent-launcher": "src/web/intent-launcher.ts",
  "react-native-pdf": "src/web/react-native-pdf.tsx",
};
const resolveRequestParent = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_SHIMS[moduleName]) {
    return { type: "sourceFile", filePath: path.join(__dirname, WEB_SHIMS[moduleName]) };
  }
  return (resolveRequestParent ?? context.resolveRequest)(context, moduleName, platform);
};

// expo-sqlite web (SharedArrayBuffer) exige l'isolation cross-origin, y
// compris en développement (`npx expo start --web`).
config.server = config.server ?? {};
const enhanceParent = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const base = enhanceParent ? enhanceParent(middleware, server) : middleware;
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    return base(req, res, next);
  };
};

module.exports = config;
