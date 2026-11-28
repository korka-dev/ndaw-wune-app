/**
 * Configuration dynamique : reprend app.json tel quel.
 * Version web servie sous un sous-chemin (ex. https://ndawwune.ared-edu.org/app/) :
 * deploy_pwa.sh définit EXPO_WEB_BASE_URL=/app. Sans cette variable (APK, EAS),
 * rien ne change.
 */
module.exports = ({ config }) => {
  const base = process.env.EXPO_WEB_BASE_URL;
  if (!base) return config;
  return { ...config, experiments: { ...(config.experiments || {}), baseUrl: base } };
};
