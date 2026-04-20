# Changelog

Toutes les versions substantielles du site. Le numéro de version est exposé
via `window.APP_VERSION` dans `index.html` et affiché dans le header après
login.

Le site a démarré sans versionnage ; l'introduction du système s'est faite en
`v1` (2026-04-19). Les entrées antérieures sont regroupées sous "pre-v1".

---

## `v5` — 2026-04-20

### Radar USDT
- **3 niveaux de marchands** (au lieu de 2 précédemment) :
  - ⭐ **Confirmé** — transaction *Completed* dans l'historique Binance
  - 🔸 **RIB validé** — orders passés (même cancellés) → RIB déjà enregistré
  - 🆕 **Nouveau** — jamais interagi → 4h de validation RIB nécessaire
- Extraction initiale depuis le Binance C2C Order History export :
  - AED : 29 marchands dont 9 confirmés
  - MAD : 42 marchands dont 38 confirmés
- Clic sur l'icône à gauche d'un marchand cycle : nouveau → RIB → confirmé
- Résumé en en-tête de table : `· 3 ⭐ confirmés · 2 🔸 RIB ok`
- Surlignage de ligne par niveau (vert pour confirmé, bleu pour RIB validé)

### Login
- **Shortcut `BINANCE`** dans le champ pseudo — même auth que BINGA
  mais navigue directement vers l'onglet Radar USDT après le unlock
  (au lieu de "Ma Position" par défaut).

### Données
- Réencryption complète (PRIV blob passe de 7.8k → 8.7k chars base64 à
  cause des listes de marchands).

### Docs
- `UPDATE_GUIDE.md` §9 : procédure complète d'extraction des marchands
  depuis l'export Excel Binance (script Python inclus).
- `DATA_MODEL.md` : schémas des 4 nouvelles arrays dans `PRIV_DATA.fxP2P`.

Commit : `6187c66`

---

## `v4` — 2026-04-20

### Radar USDT
- **Distinction marchands connus vs nouveaux** (version 2 niveaux).
  - ⭐ Connu = RIB validé → transaction rapide possible
  - 🆕 Nouveau = RIB à ajouter → ~4h de validation
  - Toggle ☆ ↔ ⭐ par clic, persisté dans `localStorage.radar_known_merchants`
  - Seed canonique possible via `PRIV_DATA.fxP2P.knownMerchantsAED/MAD`
- Note explicative affichée au-dessus de chaque table.
- Surlignage vert discret pour les lignes "connues".

### Docs
- Création de **README.md** : entry point, quick-start, structure repo,
  principes clés, conventions commits/signes/nicknames, tech stack,
  troubleshooting.

Commit : `76b8d20`

---

## `v3` — 2026-04-20

### Radar USDT
- **Filtre des offres parasites** (BUG-011) : `transAmount=10000` AED /
  `20000` MAD envoyé à Binance + filtre client-side en double sécurité
  (rejette toute offre dont `maxSingleTransAmount < seuil`).
- **Indicateur live/stale par carte** : `● live · 15:43:54` (vert, < 75s)
  ou `● stale · il y a 2 min` (jaune, > 75s). Tick toutes les 5s qui
  rafraîchit JUSTE le badge (pas la carte → pas de perte de focus
  dans les inputs).
- **Préservation des saisies utilisateur** (BUG-010) : flag user-set
  posé dès qu'on tape. L'auto-refresh continue à mettre à jour le lien
  "Marché Binance live" mais ne touche plus à l'input. Click sur le lien
  pour re-sync manuellement.
- Titres de tables : `(filtré ≥ 10 000 AED)` affiché explicitement.
- Résumé offres parasites : 10/10 offres filtrées valides (avant le fix,
  7/10 étaient des micro-offres à 100 AED max).

Commit : `ad85c52`

---

## `v2` — 2026-04-20

### Radar USDT
- **Fix CORS** (BUG-009) : routage des requêtes Binance P2P via
  `corsproxy.io`. Testé : direct fetch `Failed to fetch` → via proxy,
  200 OK. Fallback direct gardé pour localhost dev. Autres proxies
  testés (allorigins, thingproxy) rejetés car ne forwardent pas le POST
  body.
- **Gauges toujours visibles** (BUG-008) : refactor `radarRenderContent`
  — les cards sont rendues même si Binance échoue. Inputs éditables pour
  "Prix observé" (AED/USDT ou MAD/USDT) et USD/MAD. Accept virgule ou
  point comme séparateur décimal.
- **Binance en bonus** : lien cliquable "Marché Binance live: 3,6830"
  qui sync l'input à la médiane d'un clic.
- **Status per-source** : remplacement du "✓ À jour" global par 3 badges
  (USD/MAD ✓ · Binance AED ✓ · Binance MAD ✓).
- Focus préservé pendant le re-render via `setSelectionRange`.

Commit : `72618b0`

---

## `v1` — 2026-04-19

### Nouveau : Radar USDT (page dédiée BINGA only)
- Fetch live Binance P2P (AED BUY + MAD SELL) + USD/MAD live
  (fawazahmed0/currency-api).
- Verdicts automatiques avec seuils calibrés sur l'historique Amine
  (BUY ≤0.35% = bon ; SELL ≥3% = bon).
- Gauge visuel banded (Excellent / Bon / Moyen / Mauvais-Faible) avec
  bulle flottante indiquant le spread courant, pour chaque côté.
- Top 10 offres live par côté (marchand, prix, spread, min-max, paiement,
  taux 30j).
- Contexte historique : meilleur/moyen/pire de tes trades + positioning
  vs la distribution historique.
- Auto-refresh 60s (paused si onglet inactif) + bouton manuel Rafraîchir.
- Fallback offline gracieux si Binance P2P rejette (CORS/rate-limit).

### Nouveau : Site versioning
- `window.APP_VERSION = 'v1'` + `APP_VERSION_DATE` (single source of truth).
- Badge visible dans le header après unlock : point vert pulsant + `v1 · 2026-04-19`.

### Nettoyage
- Section inline "Qualité des deals USDT" retirée de `render-fxp2p.js`
  (remplacée par la page Radar, plus complète).

Commit : `176bb04`

---

## pre-v1 (non versionné)

Historique des commits substantiels avant le système de versioning formel.

### Cover 2048 fixes (`0fe06e3`)
- Score live qui s'actualise (BUG-005)
- Bouton restart renommé "Nouvelle partie", hint "Retour à l'écran de pseudo"
  supprimé (BUG-006)
- Flash "Pseudo refusé" supprimé (BUG-007)

### Cover : 2048 au lieu de Riad Anwar (`bc6c82c`)
Remplacement de la façade — un jeu 2048 plausible comme fallback quand
un pseudo invalide est saisi. Les scores sont sauvegardés en localStorage
par taille de grille.

### Bridge facturation → networth (`963038d`)
`render-amine.js` écrit `localStorage.facturation_positions` pour que le
dashboard patrimonial `networth` récupère les valeurs en live au lieu de
les hardcoder (BUG-004).

### Documentation initiale (`3041ae1`)
En-têtes détaillés dans tous les modules `render-*.js` + extraction de
`computeBenoitSolde()` dans `render-helpers.js` pour éviter la duplication
entre dashboard et onglet Benoit (BUG-002).

### Initial encryption (commits plus anciens)
Passage de `data.js` en clair à `data-enc.js` + `data-priv.enc.js` chiffrés
AES-256-GCM avec 3 couches (BRIDGEVALE / COUPA / BINGA). Suppression de
`data.js` du repo.

---

## Format des versions

- **Version** : `vN` (incrément entier simple — pas de semver, trop d'overhead
  pour un site statique 1-dev).
- **Bumper** quand : changement fonctionnel visible, refactor significatif,
  nouvelle data encryptée, nouvelle page.
- **Ne PAS bumper** quand : typos doc, correction de commit message, rebase.
- **Toujours** :
  - Mettre `APP_VERSION` + `APP_VERSION_DATE` dans `index.html`
  - Ajouter une entrée ici dans `CHANGELOG.md`
  - Mentionner la version dans le message de commit (`vN: …`)
