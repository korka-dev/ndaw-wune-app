# Recette terrain du lot L2 et protection locale (rapport V2)

Le lot L2 est accepté quand **aucune saisie n'est perdue** lors d'une coupure,
d'un redémarrage, d'une expiration de session, d'une déconnexion ou d'un
changement de compte, et que les conflits de séance sont explicites. Les tests
automatiques le vérifient sur base simulée (mobile) et sur PostgreSQL réel
(API). Cette fiche décrit la **recette physique**, à faire sur le téléphone de
référence avec une API de recette, jamais avec des données réelles.

## 1. Scénarios à rejouer (cocher, dater, noter le modèle de téléphone)

| # | Fiche | Scénario | Résultat attendu |
|---|---|---|---|
| 1 | APP-16 | Mode avion, saisir un rapport journalier, réactiver le réseau pendant l'envoi, puis couper de nouveau ; redémarrer le téléphone | Un seul rapport côté admin ; « Tout est envoyé » dans Profil → Synchronisation |
| 2 | APP-16 | Terminer une séance en ligne en coupant le réseau juste après l'appui sur « Terminer » | Séance clôturée une seule fois, aucun « échec » affiché |
| 3 | APP-17 | Retour réseau + retour au premier plan + « Synchroniser maintenant » en même temps | Chaque saisie envoyée une seule fois |
| 4 | APP-18 | Séance B ouverte en ligne et jamais arrêtée ; le lendemain, faire une séance A hors ligne puis synchroniser | A créée à part avec sa vraie durée ; B intacte |
| 5 | APP-21 | Démarrer une séance alors que B est restée ouverte | Message « Ancienne séance restée ouverte » ; « Clôturer l'ancienne » → B sans durée dans l'admin, mention « Oubliée · clôturée par le tuteur » ; trace dans l'historique |
| 6 | APP-21 | Laisser une séance ouverte plus de 4 h (horloge du serveur de recette) | Clôture automatique sans durée ; si le téléphone envoie ensuite l'arrêt, la durée mesurée apparaît (« Arrêt reçu en retard ») |
| 7 | APP-19 | Hors ligne, saisir un rapport, se déconnecter | Le message de déconnexion annonce « 1 saisie pas encore envoyée » ; après reconnexion du même compte, le rapport part |
| 8 | APP-20 | A saisit hors ligne, sa session expire ; B se connecte sur le même téléphone | B ne voit ni n'envoie rien de A (« 1 saisie d'un autre compte » seulement) ; A retrouve son travail en se reconnectant |
| 9 | APP-16 | Faire refuser un envoi (ex. classe supprimée côté admin) | La saisie apparaît dans « À vérifier » avec le motif ; « Réessayer » et « Supprimer » (avec confirmation) fonctionnent |
| 10 | APP-37 | Ouvrir l'historique des rapports avec photos sur réseau 3G dégradé | Liste rapide (sans images) ; photos chargées à l'ouverture d'un rapport |
| 11 | APP-46 | Fixer `MIN_APP_VERSION` au-dessus de la version installée | Écran « Mise à jour obligatoire » ; saisies conservées et envoyées après mise à jour |

## 2. Protection locale du téléphone (APP-14) — état et décision attendue

Inventaire des données stockées sur le téléphone :

| Donnée | Emplacement | Protection actuelle |
|---|---|---|
| Jetons de session, rôle, indicateur d'activation | SecureStore (Keystore Android / Trousseau iOS) | Chiffré par le système |
| Instantané de synchronisation (élèves, planning, profils) et caches superviseur | AsyncStorage | **Chiffré AES**, clé dans SecureStore (`cryptoStorage.ts`) |
| File d'envoi, rapports journaliers non envoyés, erreurs, pointages | SQLite `ared_offline.db` | **Non chiffré** ; isolé par auteur (`owner_id`) |
| Photos de classe prises dans l'app | Fichiers de l'app | Non chiffrés, supprimés à la désinstallation |
| Ressources pédagogiques téléchargées | `documentDirectory` | Non chiffrées (contenus non nominatifs) |

Ce qui est fait dans le code :
- toutes les saisies et tous les caches appartiennent à leur auteur ;
- un autre compte ne les voit ni ne les envoie ;
- la purge totale n'existe que sur une action volontaire.

**Décisions ARED attendues** (le code suivra la politique retenue) :
1. Chiffrer aussi SQLite (SQLCipher, ce qui implique une montée de SDK et une
   recette complète) ou accepter le risque, compte tenu du verrouillage du
   téléphone imposé par la politique des appareils.
2. Exiger un verrou d'ouverture de l'application (code ou biométrie,
   `expo-local-authentication` est déjà installé) sur les téléphones partagés.
3. Fixer la durée de conservation des saisies déjà envoyées sur le téléphone.
4. Interdire ou non la sauvegarde système des données de l'application.
