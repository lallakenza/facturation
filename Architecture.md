# Architecture — Réconciliation Facturation

Site statique sur GitHub Pages (`lallakenza/2048`). Zéro backend,
déchiffrement client-side AES-256-GCM, auto-deploy branche `main`.

**Version actuelle** : `v5` (voir [`CHANGELOG.md`](./CHANGELOG.md)).

> Autres docs : [`README.md`](./README.md) • [`DATA_MODEL.md`](./DATA_MODEL.md)
> • [`UPDATE_GUIDE.md`](./UPDATE_GUIDE.md) • [`BUG_TRACKER.md`](./BUG_TRACKER.md)

---

## Vue d'ensemble

```
┌──────────────────────────────────────────────────────┐
│  index.html                                          │
│  ├─ Structure HTML + CSS                             │
│  ├─ Cover 2048 (façade)                              │
│  ├─ Login gate (3 pseudos) + AES-256-GCM decrypt     │
│  ├─ APP_VERSION, APP_VERSION_DATE (version badge)    │
│  └─ Event wiring (tabs, year toggles, BINGA overlay) │
│                                                      │
│  ⇩ Dynamic loader (cache-bust auto ?t=Date.now())    │
│                                                      │
│  game-2048.js          — Jeu façade                  │
│  data-enc.js           — Chiffré BRIDGEVALE + COUPA  │
│  data-priv.enc.js      — Chiffré BINGA               │
│  render-helpers.js     — fmt*, badge, sum, nick,     │
│                          computeBenoitSolde (shared) │
│  render-amine.js       — Dashboard + bridge networth │
│  render-augustin.js    — Onglet Augustin 25/26/All   │
│  render-benoit.js      — Onglet Benoit générique     │
│  render-radar.js       — Onglet Radar USDT live P2P  │ ← v1+
│  render-fxp2p.js       — Onglet FX P2P (3 legs)      │
│  render-gains.js       — Onglet Mes Gains consolidés │
│  render-main.js        — TAB_CONFIG, buildTabs,      │
│                          renderPanel, showTab        │
└──────────────────────────────────────────────────────┘

Build-time (Node):
  encrypt.js     — source de vérité des données → (data-enc.js + data-priv.enc.js)

Tools:
  verify.js      — Script de vérification data (optionnel)
```

---

## Accès & sécurité

### 4 niveaux d'accès (v5)

| Pseudo | Variable runtime | Déchiffre | Tab initial | Accès |
|---|---|---|---|---|
| `BRIDGEVALE` | `ACCESS_MODE='full'` | `ENCRYPTED_FULL` | Ma Position | Full (public tabs) |
| `COUPA` | `ACCESS_MODE='benoit'` | `ENCRYPTED_BENOIT` | Benoit | Vue Benoit only |
| `BINGA` | `PRIV=true`, `ACCESS_MODE='full'` | `ENCRYPTED_FULL` + `ENCRYPTED_PRIV` | Ma Position | Full + FX P2P + Mes Gains + Radar + dark |
| `BINANCE` | `PRIV=true`, `gotoTab='radar'` | `ENCRYPTED_FULL` + `ENCRYPTED_PRIV` | **Radar USDT** | Même que BINGA, va directement au Radar |

Tout autre pseudo → **cover 2048** (façade de camouflage, silencieuse).

### Chiffrement

- **Algo** : AES-256-GCM
- **Key derivation** : PBKDF2, 100 000 itérations, SHA-256
- **Salt** : `facturation-augustin-2025` (fixe, partagé)
- **IV** : aléatoire par chiffrement (12 bytes)
- **Auth tag** : 16 bytes, authentification intégrée au ciphertext
- **Password normalization** : UPPERCASE avant dérivation (le user peut
  taper `binga`, `Binga`, `BINGA` — même résultat)

```
Format base64 du blob stocké :
┌────────┬──────────┬─────────────────────────────┐
│ IV(12) │ TAG(16)  │ ciphertext (N bytes)        │
└────────┴──────────┴─────────────────────────────┘
```

Déchiffrement côté navigateur via Web Crypto API dans `index.html`
(`decryptBlob`). Aucune clé n'est stockée.

### Binance P2P & CORS

L'endpoint Binance P2P public (`/bapi/c2c/v2/friendly/c2c/adv/search`) ne
renvoie pas de CORS headers. Pour contourner depuis `github.io` :

1. **Requête via corsproxy.io** (testé OK en v2)
2. **Fallback direct** (pour localhost dev)
3. **Si tout échoue** : les gauges restent fonctionnelles (inputs manuels),
   le Binance market reference ne s'affiche juste pas.

Voir `render-radar.js::radarFetchBinanceP2P`.

---

## Dynamic Tab System (`render-main.js`)

```js
const TAB_CONFIG = [
  { id: 'amine',    label: 'Ma Position', access: 'full' },
  { id: 'augustin', label: 'Augustin',    access: 'full' },
  { id: 'benoit',   label: 'Benoit',      access: 'all'  },
  { id: 'radar',    label: 'Radar USDT',  access: 'priv' },
  { id: 'fxp2p',    label: 'FX P2P',      access: 'priv' },
  { id: 'gains',    label: 'Mes Gains',   access: 'priv' },
];
```

| `access` | Condition de visibilité |
|---|---|
| `'all'` | Toujours visible (même en COUPA) |
| `'full'` | `ACCESS_MODE === 'full'` (BRIDGEVALE ou BINGA ou BINANCE) |
| `'priv'` | `window.PRIV === true` (BINGA ou BINANCE) |

Fonctions clés :

| Fonction | Rôle |
|---|---|
| `buildTabs()` | Génère les tabs + panels après auth réussie |
| `refreshTabVisibility()` | Re-calcule la visibilité quand `PRIV` change |
| `showTab(id)` | Active un tab + son panel |
| `renderPanel(id)` | Délègue à `render<Name>()` selon l'id |
| `renderAll()` | Itère `TAB_CONFIG`, renderPanel chaque tab visible |

Un rendu via `innerHTML` : les scripts inline ne s'exécutent pas. Pour les
handlers dynamiques (ex: `radarLoad`), on expose `window.radarXxx` et on
utilise des inline `onclick`/`oninput`.

---

## Modules de rendu

### `render-helpers.js` — utilitaires partagés

```js
fmt(n, suffix='€')             // "1 234 €" ou "—"
fmtSigned(n, suffix='€')       // "+1 234 €" ou "−1 234 €"
fmtPlain(n)                    // "1 234" (absolu, sans signe)
fmtRate(r)                     // "10,500"
fmtDelta(d)                    // "+0,300" ou "−0,100"
badge(type, text)              // '<span class="b ok">✓ OK</span>'
sum(arr, key)                  // Σ arr[].key (ou key(x) si function)
nick(name)                     // "Jean Augustin" → "Augustin"
nickText(text)                 // Replace all vrai-noms dans un texte libre
yearToggle3(section, active)   // Toggle 3-way Tout/2025/2026
computeBenoitSolde()           // ⭐ Source de vérité du solde Benoit
toggleSection(id, btn)         // Expand/collapse d'une section
collapsible(title, html, opts) // Wrapper collapsible
```

`computeBenoitSolde()` est partagée entre `render-amine.js` (dashboard) et
`render-benoit.js` (tab) pour garantir la cohérence des chiffres (voir
BUG-002 dans BUG_TRACKER).

### `render-amine.js` — dashboard personnel

Vue consolidée "Ma Position". Calcule :
1. **Azarkan (Augustin) 2026** : 3 hero cards (Pro, Perso, MAD)
   - `posEntreprise = Σ RTL payées − Σ AZCS payés + report2025`
   - `posNetPro     = posEntreprise − virementsEUR − diversPro`
   - `PERSO_FACTOR  = 0.95` → `posNetPerso = posNetPro × 0.95`
   - `posNetMAD     = posNetPro × tauxMaroc`
2. **Benoit (Badre) 2026** : 1 hero card en DH (via `computeBenoitSolde`)
3. **Position globale** : 4 colonnes (Augustin, Benoit, Total EUR, Total MAD)

**Bridge localStorage** : écrit `facturation_positions` à chaque render pour
que `networth` récupère les valeurs en live (voir DATA_MODEL §Bridge).

### `render-augustin.js`

Onglet Augustin avec 3 vues toggle :
- `renderAugustin2025()` — clôture complète (12 mois, 5 catégories preuves)
- `renderAugustin2026()` — en cours (RTL, virements, divers)
- `renderAugustinAll()` — les deux stackés

### `render-benoit.js` — renderer générique

Une seule fonction `renderBenoitYear(dataKey, opts)` détecte automatiquement
si c'est une clôture ou une année en cours via `!d.councils[0]?.statut`.
Wrappers `renderBenoit2025()` / `renderBenoit2026()` / `renderBenoitAll()`
appellent juste cette fonction avec les bons paramètres.

Le carryforward 2025→2026 est calculé dynamiquement (pas stocké) via
`computeBenoitSolde()` — voir DATA_MODEL §Formules.

### `render-radar.js` — Radar USDT (v1+, enrichi v2-v5)

Page live d'évaluation du marché P2P Binance. Architecture :

```
renderRadar()                    — Skeleton + kickoff
 └─ radarLoad(manual)            — Promise.allSettled 3 fetches
     ├─ radarFetchBinanceP2P(AED, BUY, transAmount=10k)
     ├─ radarFetchBinanceP2P(MAD, SELL, transAmount=20k)
     └─ radarFetchUsdMad()       — fawazahmed0 via jsdelivr
 └─ radarRenderContent(buy, sell, fx)
     ├─ radarBuyCardHTML()       — Input + gauge + verdict
     ├─ radarSellCardHTML()      — Input + gauge + verdict + USD/MAD editable
     ├─ radarHistoricalContext() — Meilleur/moyen/pire de tes tx
     ├─ radarOffersTable('BUY')  — Top 10 + marchands classifiés
     └─ radarOffersTable('SELL') — Top 10 + marchands classifiés
 └─ radarStartAutoRefresh()      — setInterval 60s (paused si tab caché)
 └─ radarStartFreshnessTick()    — setInterval 5s (badges seulement)

Handlers inline (exposés via window) :
  window.radarLoad(manual)
  window.radarUpdateBuy(val)
  window.radarUpdateSell(val)
  window.radarUpdateUsdMad(val)
  window.radarToggleKnownMerchant(side, nickname)
```

**État runtime** (`window._radarState`, voir DATA_MODEL §runtime).

**Marchands 3 niveaux** (v5) : voir `radarClassifyMerchant()` — fusionne
`PRIV_DATA.fxP2P.{merchants,confirmedMerchants}{AED,MAD}` avec les updates
live de `localStorage.radar_known_merchants`.

### `render-fxp2p.js`

Onglet FX P2P (BINGA only). Pipeline 3 legs :
- **Leg 1** : EUR → AED (IFX)
- **Leg 2** : AED → USDT (Binance P2P buy)
- **Leg 3** : USDT → MAD (Binance P2P sell)

Pour chaque leg : spread vs marché, volumes pondérés, impact par 10k€.
Synthèse globale + 3-months window + 8 insights.

### `render-gains.js`

Onglet Mes Gains (BINGA only). Consolidation des 5 sources de gain Amine :
1. Virements Augustin (marge sur tauxMaroc)
2. Commission Ycarré (8%)
3. Commission Benoit (10%)
4. Écart taux appliqué vs marché Benoit
5. Spread P2P (extrait de `render-fxp2p`)

Toggle DH ↔ % via `window.gainsShowPct`.

### `render-main.js`

Orchestration. 123 lignes. Single source of truth pour le TAB_CONFIG.

---

## Cover 2048 (façade)

Le jeu 2048 n'est pas un easter egg — c'est une gate silencieuse :
- Pas de "Pseudo refusé" ni d'erreur visible (BUG-007)
- Pas de hint "Retour à l'écran de pseudo" (BUG-006)
- Score qui s'actualise en temps réel (BUG-005)
- Best score sauvegardé par taille de grille
- Design inspiré direct du 2048 original (Gabriele Cirulli)

Un visiteur non-autorisé qui tape son prénom se retrouve avec un jeu
pleinement fonctionnel, sans aucun signal que quelque chose d'autre existe.

Source : `game-2048.js`. Mounted par `index.html::showGame()` dans
`#gameHost` avec les refs du score box du header passées via opts.

---

## Site versioning (v1+)

Single source of truth dans `index.html` :
```html
<script>
  window.APP_VERSION = 'v5';
  window.APP_VERSION_DATE = '2026-04-20';
</script>
```

Affiché dans le header après login via le badge `#versionBadge` :
```
┌───────────────────────────────────────────┐
│ Réconciliation Facturation 2025–2026      │
│                        [● v5 · 2026-04-20] │ ← injecté par tryAccess
└───────────────────────────────────────────┘
```

Bump à chaque commit substantiel. Historique : [`CHANGELOG.md`](./CHANGELOG.md).

---

## Bridge networth

Les deux sites (repo `2048` + repo `networth`) partagent l'origine
`lallakenza.github.io` → `localStorage` commun.

`render-amine.js` écrit `localStorage.facturation_positions` à chaque render.
`networth/js/engine.js` lit cette clé pour override les créances/dettes
Augustin/Benoit au lieu des valeurs hardcoded.

Voir DATA_MODEL §Bridge pour le schéma exact.

---

## Déploiement

```bash
# Éditer encrypt.js → re-encrypter
vim encrypt.js
node encrypt.js                    # Produit data-enc.js + data-priv.enc.js

# Bumper version
sed -i '' "s/v5/v6/" index.html    # ou édition manuelle

# Commit + push
git add encrypt.js data-enc.js data-priv.enc.js index.html
git -c user.name="Amine" -c user.email="amine.koraibi@gmail.com" \
  commit -m "v6: Description"
git push origin main
```

GitHub Pages auto-deploy en 30–90 s. Cache-busting par `?t=Date.now()` dans
le dynamic loader → toujours fresh à chaque reload.

Procédures détaillées : [`UPDATE_GUIDE.md`](./UPDATE_GUIDE.md).

---

## Évolutions passées et décisions

### Pourquoi 3 blobs chiffrés distincts (au lieu d'un seul) ?

Parce que chaque pseudo correspond à une **audience différente** :
- `BRIDGEVALE` = Amine, vue complète publique
- `COUPA` = Benoit, ne doit PAS voir les counterparts Augustin
- `BINGA` = Amine, mode pro avec taux marché + FX P2P + Radar

Un seul blob forcerait à partager le mdp Benoit → il pourrait décrypter
BRIDGEVALE. Isolation = 3 blobs séparés chiffrés avec 3 mdp différents.

### Pourquoi `encrypt.js` est la source de vérité, pas `data-enc.js` ?

Parce que `data-enc.js` est juste du base64 opaque. Toutes les modifs
passent par `encrypt.js` (éditable, commenté, versionnable en diff). Le
script lui-même régénère les blobs. Règle absolue : ne jamais éditer
`data-enc.js` ou `data-priv.enc.js` à la main.

### Pourquoi `corsproxy.io` et pas un serveur Cloudflare ?

Zero-infra : pas de serveur à maintenir, pas de clé API. Downside : si
`corsproxy.io` tombe, le fetch Binance échoue — mais grâce à v2, les
gauges restent fonctionnelles avec saisie manuelle.

Migration possible vers un Cloudflare Worker gratuit si corsproxy devient
unreliable : 10 lignes de code Worker, fetch vers Binance, renvoie avec
CORS headers.

### Pourquoi pas un framework ?

- Site 6 pages, ~9 modules, ~140kb total
- Un dev (Amine)
- Zero dependency → zero supply chain risk
- Chaque fichier est un module auto-contenu lisible en 30 secondes
- Pas de build step → edit + commit + push = deploy

Le jour où ça devient ingérable, migration vers un static site generator
(Astro, 11ty) serait le meilleur upgrade — pas React.

### Pourquoi un filesystem case-insensitive pose problème

macOS default HFS+ / APFS est case-insensitive. Si on a à la fois
`ARCHITECTURE.md` (créé un jour) et `Architecture.md` (utilisé dans les
liens), git les traite comme le même fichier mais expose les deux noms.
Pour éviter : staging sélectif (`git add Architecture.md` jamais
`ARCHITECTURE.md`), ou nettoyage one-shot (supprimer le nom non-canonique
via `git mv`).
