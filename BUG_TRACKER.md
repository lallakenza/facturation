# Bug tracker

Historique des bugs détectés, leur root cause, le fix, et les tests de
régression pour éviter qu'ils reviennent. Ordonné par date (récent en haut).

## Format

Chaque entrée suit ce format :

> **BUG-NNN** — Titre court
> - **Détecté en** : version, date, comment
> - **Sévérité** : low/medium/high/critical
> - **Symptôme** : ce que le user voit
> - **Root cause** : vraie cause (pas juste le symptôme)
> - **Fix** : commit hash + description
> - **Régression** : comment tester que ça ne revienne pas

---

## BUG-011 — Binance P2P renvoie des offres parasites malgré `transAmount`

- **Détecté en** : v2 (2026-04-20), via capture user du tableau AED
- **Sévérité** : high (médiane/top price complètement faussés par micro-offres)
- **Symptôme** : Tableau des top 10 offres Binance P2P affichait des
  marchands avec max 101 AED (parasites) malgré l'envoi de `transAmount:
  10000` à l'API. La médiane calculée sur ces micro-offres donnait un prix
  artificiellement bas, rendant le verdict du gauge trompeur.
- **Root cause** : Le paramètre `transAmount` de l'API Binance P2P
  `/bapi/c2c/adv/search` ne filtre pas strictement "offres couvrant ce
  montant". Il semble être interprété comme "offres touchant ce volume"
  (où `min ≤ transAmount`). Donc une offre `min=100, max=101` passe
  le filtre serveur.
- **Fix** : `v3` (commit `ad85c52`) — ajout d'un filtre client-side en
  complément dans `radarFetchBinanceP2P` (`render-radar.js`) :
  ```js
  if (transAmount) {
    offers = offers.filter(o =>
      o.maxSingleTransAmount >= transAmount &&
      (o.minSingleTransAmount <= transAmount)
    );
  }
  ```
- **Régression** : Dans la console du Radar après login BINGA :
  `window._radarState.buyData.offers.every(o => o.maxSingleTransAmount >= 10000)`
  doit être `true`. Idem pour sellData avec 20000.

## BUG-010 — Saisie utilisateur écrasée à chaque auto-refresh

- **Détecté en** : v2, pendant la review du refactor always-visible gauges
- **Sévérité** : medium (UX cassée dès qu'on édite un prix)
- **Symptôme** : Si l'utilisateur tape une valeur custom dans "Prix observé"
  (ou dans le champ USD/MAD), l'auto-refresh de 60s écrasait cette valeur
  avec la nouvelle médiane Binance — perte silencieuse de la saisie.
- **Root cause** : `radarRenderContent()` faisait `window._radarState.buyPrice
  = defaultBuyPrice` à chaque appel, sans distinguer "premier render" de
  "refresh après saisie".
- **Fix** : `v3` — ajout de flags `buyPriceUserSet` / `sellPriceUserSet` /
  `usdMadUserSet` posés par les handlers `radarUpdateBuy/Sell/UsdMad`.
  `radarRenderContent` ne set la valeur que si le flag est `false`.
  L'auto-refresh continue à mettre à jour la valeur affichée dans la ligne
  "Marché Binance live" — user peut cliquer dessus pour re-sync.
- **Régression** : Taper `3.69` dans Prix observé, attendre 61 secondes sans
  toucher au champ → la valeur reste `3,69`. Puis cliquer sur le lien
  "Marché Binance live : 3,6830" → l'input se sync à la nouvelle valeur.

## BUG-009 — CORS bloque la récupération des offres Binance P2P

- **Détecté en** : v1 (2026-04-20), premier test live sur lallakenza.github.io
- **Sévérité** : critical (feature complètement cassée)
- **Symptôme** : Tableaux d'offres + verdict de marché vides. Message
  "✗ Binance P2P inatteignable — TypeError: Failed to fetch".
- **Root cause** : L'endpoint `p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search`
  ne renvoie pas d'en-tête `Access-Control-Allow-Origin`. Les navigateurs
  bloquent toute réponse de ce type pour une origine différente
  (`github.io`).
- **Fix** : `v2` (commit `72618b0`) — route la requête POST via
  `corsproxy.io` (testé : 200 OK + body JSON valide + CORS headers
  corrects). Fallback direct gardé pour localhost. Endpoints tentés dans
  l'ordre puis renvoyer le premier qui passe.
- **Régression** : Depuis `https://lallakenza.github.io/facturation/`, en mode
  BINGA, onglet Radar USDT : les 3 badges en haut à droite doivent être verts
  (`USD/MAD ✓ · Binance AED ✓ · Binance MAD ✓`). Si un seul n'est pas vert,
  tester `corsproxy.io` sur https://corsproxy.io manuellement.

## BUG-008 — Jauges invisibles quand Binance échoue

- **Détecté en** : v1, feedback user immédiat après BUG-009
- **Sévérité** : high (feature inutilisable si Binance down)
- **Symptôme** : Si le fetch Binance échouait, le Radar affichait un gros
  bloc "Binance inatteignable" et rien d'autre — pas de gauges, pas
  d'input, rien d'utilisable.
- **Root cause** : Design initial supposait que les gauges ne pouvaient se
  calculer qu'avec le prix Binance. Mais les gauges n'ont besoin que du
  taux de référence (peg fixe AED/USD, USD/MAD live) — le prix observé
  peut venir d'un input manuel.
- **Fix** : `v2` — refactor `radarRenderContent` pour toujours rendre les
  cards avec inputs éditables. Binance n'est qu'une pré-remplissage. Si
  down, message discret "⚠ Binance indisponible — saisis le prix observé"
  et les gauges restent fonctionnelles.
- **Régression** : Bloquer Binance dans devtools (Network → block
  `*binance.com*`), rafraîchir, vérifier que les gauges sont toujours là
  et que taper une valeur dans Prix observé met à jour la gauge + verdict
  + conseil.

## BUG-007 — Message "Pseudo refusé" trahit la gate

- **Détecté en** : v0 (avant v1), feedback user
- **Sévérité** : medium (leak d'info sur l'existence d'un allowlist)
- **Symptôme** : Quand un pseudo non-reconnu était saisi, un flash
  "Pseudo refusé" apparaissait ~600ms avant de charger le jeu 2048 —
  trahissant qu'il y avait un allowlist derrière le champ.
- **Root cause** : `tryAccess()` appelait `flashError(fakeErrors[...])` +
  `setTimeout(showGame, 600)` pour les pseudos invalides. Pattern clean
  pour un vrai site, mauvais pour une façade.
- **Fix** : Commit `0fe06e3` (pre-v1) — suppression du flashError et du
  setTimeout, appel direct de `showGame(trimmed)`. Un visiteur normal qui
  tape son prénom voit directement le jeu, sans signal.
- **Régression** : Taper un pseudo random (ex: "Toto") → on arrive DIRECT
  sur le jeu 2048, sans flash d'erreur. Pas de `setTimeout`, pas de div
  `.cover-error.show` intermédiaire.

## BUG-006 — Bouton Restart trahit "Retour à l'écran de pseudo"

- **Détecté en** : v0 (avant v1), feedback user
- **Sévérité** : medium (leak indirect)
- **Symptôme** : Sous le bouton Restart du jeu 2048, un hint gris
  affichait "Retour à l'écran de pseudo" — ce qui indiquait à un observateur
  qu'il existait une gate pseudo et qu'on pouvait y retourner.
- **Root cause** : Design overthinking du hint text pendant le dev initial.
- **Fix** : Commit `0fe06e3` — suppression du `<span class="restart-hint">`,
  renommage bouton "Restart" → "Nouvelle partie".
- **Régression** : Aller sur la cover en ayant saisi un pseudo invalide,
  inspecter le DOM `#gamePanel` → aucun élément `.restart-hint`, bouton
  libellé "Nouvelle partie".

## BUG-005 — Score 2048 ne s'actualise pas en temps réel

- **Détecté en** : v0, feedback user
- **Sévérité** : low (cosmétique, jeu de toute façon une façade)
- **Symptôme** : Les score boxes en haut ("Score" et "Best") restaient
  bloquées à 0 pendant le jeu.
- **Root cause** : `game-2048.js` cherchait les score nodes via
  `mountEl.querySelector('.g-score-val')` — mais les éléments `gameScore` /
  `gameBest` sont dans le header `.cover-title` (hors de `mountEl`).
- **Fix** : Commit `0fe06e3` — ajout d'opts `scoreEl` et `bestEl` passées
  par `showGame()` à `Game2048.start()`. Les refs sont capturées au module
  niveau et utilisées directement dans `render()`, sans `querySelector`.
  Nettoyées dans `stop()`.
- **Régression** : Lancer une partie, faire un mouvement qui produit une
  fusion → le Score doit incrémenter immédiatement.

## BUG-004 — Dashboard networth montre les anciennes positions Augustin/Benoit

- **Détecté en** : avant la mise en place du bridge (non daté)
- **Sévérité** : medium (valeurs fausses dans le NW)
- **Symptôme** : Les créances Augustin/Benoit dans le dashboard patrimonial
  `networth` étaient hardcodées dans `data.js` et ne reflétaient pas les
  dernières valeurs calculées dynamiquement dans `facturation`.
- **Root cause** : Pas de bridge entre les deux sites. Chaque repo avait
  ses propres chiffres.
- **Fix** : Commit `963038d` (pre-v1) — `render-amine.js` écrit
  `localStorage.facturation_positions` après chaque rendu. Même origine
  (`lallakenza.github.io`) → `networth/js/engine.js` lit ce localStorage
  pour override les hardcoded values.
- **Régression** :
  1. Ouvrir facturation en mode BINGA, onglet "Ma Position"
  2. Ouvrir la console : `JSON.parse(localStorage.facturation_positions)`
  3. Vérifier que `augustin.proEUR`, `benoit.dh`, `combined.eur/mad` sont
     bien remplis
  4. Ouvrir networth dans un autre onglet → hard refresh → les créances
     Augustin/Benoit doivent matcher

## BUG-003 — Accès BENOIT (COUPA) affiche le champ "Réf. dossier"

- **Détecté en** : v0 (non daté)
- **Sévérité** : low (petit leak cosmétique)
- **Symptôme** : En mode COUPA (vue partagée avec Benoit), le footer
  montrait le champ `Réf. dossier` qui est la porte dérobée BINGA. Aucun
  risque de sécurité (décryptage seulement si le bon mdp est saisi) mais
  présence suspecte.
- **Root cause** : Le champ est rendu inconditionnellement dans
  `index.html`.
- **Fix** : Dans `tryAccess`, si `mode === 'benoit'`, on cache l'élément
  parent du `#dref` : `drefEl.parentElement.style.display = 'none'`.
- **Régression** : Se connecter avec COUPA, scroller tout en bas → aucun
  champ "Réf. dossier" visible. Avec BRIDGEVALE ou BINGA, le champ est
  visible (même si masqué après login BINGA).

## BUG-002 — `computeBenoitSolde` dupliqué entre renders

- **Détecté en** : refactor pre-v1
- **Sévérité** : medium (source de bugs si le calcul diverge)
- **Symptôme** : `render-amine.js` (dashboard) et `render-benoit.js`
  (onglet Benoit) calculaient chacun le solde Benoit avec leur propre
  formule — risque de divergence.
- **Root cause** : Pas de fonction partagée. Refactor historique avait
  oublié d'extraire.
- **Fix** : Commit `3041ae1` (pre-v1) — fonction unique
  `computeBenoitSolde()` dans `render-helpers.js`. Appelée par les deux
  renderers. Retourne `{ report25, netPaid26, totalPaye26, solde,
  paidCount }`.
- **Régression** : Faire varier `benoit2025.commissionRate` d'`encrypt.js`
  (ex: 0.10 → 0.12), re-chiffrer, recharger → le solde doit être
  identique dans "Ma Position" et dans l'onglet Benoit.

## BUG-001 — Taux marché (BINGA) fuité dans data.js non-chiffré

- **Détecté en** : avant le passage au chiffrement
- **Sévérité** : critical (data confidentielle exposée publiquement)
- **Symptôme** : `data.js` était pushé en clair sur GitHub Pages avec les
  taux marché, commissions, pipeline FX P2P — accessible via view-source.
- **Root cause** : Pas de séparation public / privé au début.
- **Fix** : Commits initiaux — chiffrement AES-256-GCM avec 3 couches
  (BRIDGEVALE, COUPA, BINGA). `data.js` supprimé du repo. Les données
  sensibles vivent dans `PRIV_DATA` → `ENCRYPTED_PRIV` dans
  `data-priv.enc.js`, déchiffrées côté client seulement avec BINGA.
- **Régression** :
  1. `curl https://lallakenza.github.io/facturation/data-priv.enc.js | head -5`
  2. Vérifier que c'est juste du base64 opaque (`const ENCRYPTED_PRIV =
     "..."`) — aucun nom clair, aucun montant, aucun taux.
  3. `git log --all -p -- data.js` ne doit rien retourner (ou seulement
     l'ancien fichier dans les commits initiaux).

---

## Pièges récurrents (à ne pas rejouer)

### 1. Oublier de re-chiffrer après avoir édité `encrypt.js`
Symptôme : "Échec de connexion. Réessaie." au login. Les blobs chiffrés
ont divergé de la source. Fix : `node encrypt.js` avant commit.

### 2. Oublier de bumper `window.APP_VERSION`
Symptôme : le badge en haut affiche la vieille version après un push.
Fix : `sed -i '' "s/vN/vN+1/" index.html` (ou édition manuelle) dans le
même commit.

### 3. Focus perdu dans les inputs pendant un re-render
Symptôme : on tape 3.69, le re-render de 60s (auto-refresh ou freshness
tick) casse la saisie et la caret jump. Fix appliqué dans v2/v3 :
- Auto-refresh : ne touche pas aux input values si user-set (BUG-010)
- Freshness tick : re-render SEULEMENT les badges (`#radarBadge-*`), pas
  les cards entières.

### 4. Case-insensitive filesystem collision (macOS)
`ARCHITECTURE.md` vs `Architecture.md` → `git status` montre toujours
`ARCHITECTURE.md` modifié même si on édite `Architecture.md`. Fix :
staging sélectif (`git add Architecture.md`), ou corriger une fois pour
toutes en supprimant la variante non-canonique.

### 5. Lire encrypt.js pour les données au runtime
Piège : coder `DATA.fxP2P.merchantsAED` alors que `encrypt.js` n'est pas
chargé côté client — seul `data-priv.enc.js` l'est (après déchiffrement
BINGA). Règle : au runtime, toujours lire via `window.DATA.*` et supposer
qu'un champ peut être absent si le user n'a pas activé BINGA.

### 6. Nouveau tab pas rendu par `renderAll()`
Symptôme : on ajoute un nouveau tab dans `TAB_CONFIG` mais l'onglet
affiche "undefined" ou vide. Fix : ajouter aussi un `case` dans
`renderPanel()` (`render-main.js`).
