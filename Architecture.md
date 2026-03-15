# Architecture — Réconciliation Facturation

## Vue d'ensemble

Site statique déployé sur GitHub Pages (`lallakenza/facturation`).
Architecture modulaire avec 8 fichiers JS + 1 fichier chiffré :

```
index.html            → UI (gate, crypto, events, year toggles)
data.js               → Données publiques (counterparts, transactions)
data-priv.enc.js      → Données privées chiffrées (AES-256-GCM)
render-helpers.js     → Utilitaires (formatage, badges, sum, yearToggle)
render-augustin.js    → Rendu Augustin 2025/2026
render-benoit.js      → Rendu Benoit générique (2025/2026 via renderBenoitYear)
render-fxp2p.js       → Pipeline FX P2P (3 legs EUR→AED→USDT→MAD)
render-gains.js       → Consolidation gains (commissions, spread, FX)
render-main.js        → TAB_CONFIG, buildTabs(), renderAll(), showTab()
encrypt.js            → Script Node pour (re)chiffrer les données privées
verify.js             → Script de vérification des données
```

## Accès & sécurité

### 3 niveaux d'accès

| Code        | Variable              | Accès                                                    |
|-------------|----------------------|----------------------------------------------------------|
| `BRIDGEVALE`| `ACCESS_MODE='full'` | Tous les onglets (Augustin + Benoit)                     |
| `COUPA`     | `ACCESS_MODE='benoit'`| Onglet Benoit uniquement (vue client)                    |
| `BINGA`     | `window.PRIV=true`   | Mode pro : dark theme + FX P2P + Mes Gains + taux marché |

### Chiffrement

Les données sensibles (taux marché, commissions PRIV, FX P2P) sont chiffrées dans `data-priv.enc.js` via AES-256-GCM (PBKDF2, 100k itérations, sel `facturation-augustin-2025`). Le déchiffrement se fait côté navigateur quand on tape `BINGA` dans le champ "Réf. dossier".

## Dynamic Tab System (`render-main.js`)

Les onglets sont générés dynamiquement depuis `TAB_CONFIG` :

```javascript
const TAB_CONFIG = [
  { id: 'augustin', label: 'Augustin', access: 'full' },
  { id: 'benoit',   label: 'Benoit',   access: 'all' },
  { id: 'fxp2p',    label: 'FX P2P',   access: 'priv' },
  { id: 'gains',    label: 'Mes Gains', access: 'priv' },
];
```

| access | Visibilité |
|--------|-----------|
| `'all'` | Toujours visible |
| `'full'` | `ACCESS_MODE === 'full'` uniquement |
| `'priv'` | `window.PRIV === true` uniquement |

Fonctions clés :
- `buildTabs()` — Génère les onglets/panels après authentification
- `refreshTabVisibility()` — Met à jour la visibilité quand PRIV change
- `showTab(id)` — Active un onglet
- `renderPanel(id)` — Rend un seul panel
- `renderAll()` — Rend tous les panels

## Structure des données (`data.js`)

### Objet global `DATA`

```javascript
const DATA = {
  augustin2025: { ... },   // Counterpart Augustin — année clôturée
  augustin2026: { ... },   // Counterpart Augustin — année en cours
  benoit2025:   { ... },   // Counterpart Benoit — année clôturée
  benoit2026:   { ... },   // Counterpart Benoit — année en cours
  // fxP2P: ENCRYPTED      // Pipeline FX (BINGA only)
};
```

### Convention de nommage

Les clés suivent le format `{counterpart}{année}` (ex: `benoit2025`, `augustin2026`).

---

## Modèle Augustin (EUR → DH via virements Maroc)

Augustin est un counterpart de type **gestion de revenus** : Amine reçoit des revenus (RTL), paie des sous-traitants (Ycarré, Baraka, Councils), et envoie de l'argent au Maroc.

### Données clé d'une année Augustin

```javascript
augustin2025: {
  title: "...",
  subtitle: "...",
  tauxMaroc: 10,                    // Taux fixe EUR/MAD (10 000 DH = 1 000€)
  report2025: -1683,                // (2026 only) Report de l'année précédente

  // Revenus
  rtl: [
    { ref: "INVRTL001", periode: "Jan", jours: 12, montant: 10200,
      datePaiement: "20/03", recu: 10200,
      statut: "ok"|"w"|"i", statutText: "..." }   // (2026: statut au lieu de recu)
  ],

  // Dépenses mensuelles (CLÔTURE ONLY — pas dans les années en cours)
  mois: [
    { nom: "Janvier", actuals: 18700, bym: 0, maroc: 0, divers: 0,
      commentaire: "...", badge: "ok"|"i"|"e", badgeText: "...",
      bymHighlight: false, marocCorrige: false, diversVerifie: false }
  ],

  // Sous-catégories de paiements (CLÔTURE ONLY)
  ycarre: [{ date: "02/06/2025", montant: 5400 }],
  councils: [{ date: "18/08/2025", excelHT: 5625, ebsHT: 5625 }],
  baraka: [{ date: "14/03/2025", montant: 10000 }],

  // Virements Maroc
  virementsMaroc: [
    // Clôture format:
    { mois: "Février", excelEUR: 1000, detail: "...", totalDH: 10000, corrige: false },
    // En cours format:
    { date: "02/01/2026", beneficiaire: "Jean Augustin", dh: 10000 }
  ],

  // Cash direct / divers
  divers: [
    // Clôture format:
    { mois: "Février", date: "—", montant: 400, label: "Vol pour Augustin",
      preuve: "ok", preuveText: "✓ EBS" },
    // En cours format:
    { label: "Augustin → Amine (via Zakaria)", montant: -1200 }
  ],
  diversVerifie: 9170,              // (CLÔTURE ONLY) Total vérifications en valeur absolue
  diversNonVerifie: 0,

  // Insights (analyses clés affichées en bas)
  insights: [
    { type: "pass"|"warn"|"fail"|"neutral",
      titre: "✅ Titre de l'insight",
      desc: "Description HTML avec <strong> etc." }
  ]
}
```

### Calculs Augustin

| Calcul | Formule |
|--------|---------|
| Total actuals | `Σ mois[].actuals` |
| Total dépenses | `Σ mois[].bym + mois[].maroc + mois[].divers` |
| Solde Excel | `actuals(Fév-Déc) − dépenses(Fév-Déc)` (exclut Janvier) |
| Delta 2026 | `Amine reçu(RTL payé) − Augustin reçu(virements÷taux) + report2025` |

---

## Modèle Benoit (Councils EUR → DH avec commission)

Benoit est un counterpart de type **sous-traitance** : il facture des Councils en EUR, Amine les convertit en DH au taux appliqué, retient une commission, et paie le net en DH.

### Rendu générique — `renderBenoitYear(dataKey, opts)`

Les deux années partagent un seul renderer générique :

```javascript
function renderBenoitYear(dataKey, opts = {}) {
  const { embedded = false, year = 2025, report = 0 } = opts;
  const d = DATA[dataKey];
  const rate = d.commissionRate || 0;
  const isClotured = !d.councils[0]?.statut;  // Détection auto
  // ...
}
```

Les wrappers `renderBenoit2025()` et `renderBenoit2026()` appellent `renderBenoitYear()` avec les bons paramètres. Le rendu s'adapte automatiquement : colonnes, notes, statuts, gains FX.

### Données clé d'une année Benoit

```javascript
benoit2025: {
  title: "...",
  subtitle: "...",
  commissionRate: 0.10,             // Taux de commission (dynamique, pas hardcodé)

  councils: [
    { date: "18/08/2025",           // ou mois: "Janvier" (2026)
      htEUR: 5625,                  // Montant HT en EUR
      tauxApplique: 10.500,         // Taux EUR/MAD par transaction
      // tauxMarche: ENCRYPTED      // Taux marché (injecté par BINGA)
      statut: "ok"|"w",             // (2026 only) Statut du paiement
      statutText: "Paid 11/02"      // (2026 only)
    }
  ],

  virements: [
    { date: "28/07/2025", beneficiaire: "Benoit Chevalier",
      dh: 50000, motif: "Prêt personnel" }
  ],

  notes: [                          // (optional) Notes affichées en footer
    "Le virement du 06/03/2026 (31 750 DH) a été comptabilisé..."
  ]
}
```

### Calculs Benoit

| Calcul | Formule |
|--------|---------|
| DH brut par transaction | `Math.round(htEUR × tauxApplique)` |
| Commission par transaction | `Math.round(DH brut × commissionRate)` |
| Net Benoit par transaction | `DH brut − commission` |
| Total net dû | `Σ netBenoit` |
| Total payé | `Σ virements[].dh` |
| Solde / Carryforward | `total net dû − total payé` |
| Report N+1 (2026) | `solde 2025` (calculé dynamiquement depuis `benoit2025`) |

#### Carryforward automatique

Le report 2025→2026 n'est **pas stocké dans les données**. Il est **calculé dynamiquement** dans `renderBenoit2026()` :

```javascript
const b25 = DATA.benoit2025;
const rate25 = b25.commissionRate || 0;
const net25 = b25.councils.reduce((s, m) => {
  const dh = Math.round(m.htEUR * m.tauxApplique);
  return s + dh - Math.round(dh * rate25);
}, 0);
const paye25 = sum(b25.virements, 'dh');
const report = net25 - paye25;  // Carryforward automatique
```

#### Détection clôture vs en-cours

```javascript
const isClotured = !d.councils[0]?.statut;
// 2025 (clôture): pas de champ statut → date field = "Date EBS"
// 2026 (en-cours): statut: "ok"|"w" → date field = "Mois"
```

---

## Mode PRIV (BINGA) — Données supplémentaires

Quand `window.PRIV = true`, les données privées sont déchiffrées et injectées :

| Donnée | Description |
|--------|-------------|
| `benoit2025.commissionRate` | Écrasé par la valeur encryptée (backup) |
| `benoit2025.councils[].tauxMarche` | Taux marché EUR/MAD par transaction |
| `benoit2026.tauxApplique` | Taux appliqué 2026 (écrasé) |
| `benoit2026.commissionRate` | Commission 2026 (écrasé) |
| `benoit2026.councils[].tauxMarche` | Taux marché par transaction |
| `DATA.fxP2P` | Pipeline FX complète (3 legs) |
| `DATA._ycarreCommission` | Commissions Ycarré |

### Colonnes additionnelles en PRIV

- **Benoit** : Taux marché, Δ taux, Gain FX, Consolidation gains Amine
- **FX P2P** : 3 legs (EUR→AED→USDT→MAD), spreads, taux effectif
- **Mes Gains** : Consolidation de tous les gains + DH/% toggle

---

## Modules de rendu

### render-helpers.js — Utilitaires partagés

| Fonction | Usage |
|----------|-------|
| `fmtPlain(n)` | Nombre formaté FR sans signe (ex: `198 475`) |
| `fmtSigned(n, suffix)` | Nombre avec signe (ex: `+4 754 DH`) |
| `fmtRate(r)` | Taux avec 3 décimales (ex: `10,600`) |
| `fmtDelta(d)` | Delta taux avec signe (ex: `−0,100`) |
| `badge(type, text)` | Badge coloré (ok/w/e/i) |
| `sum(arr, key)` | Somme avec key string ou function |
| `yearToggle3(section, activeYear)` | Toggle Tout/2025/2026 |

### render-augustin.js

| Fonction | Description |
|----------|-------------|
| `renderAugustin2025(embedded)` | Clôture complète (12 mois, 5 catégories) |
| `renderAugustin2026(embedded)` | En cours (factures RTL, virements) |
| `renderAugustinAll()` | Vue combinée (2026 + 2025 stacked) |

### render-benoit.js

| Fonction | Description |
|----------|-------------|
| `renderBenoitYear(dataKey, opts)` | Renderer générique (détecte clôture/en-cours) |
| `renderBenoit2025(embedded)` | Wrapper → `renderBenoitYear('benoit2025', ...)` |
| `renderBenoit2026(embedded)` | Wrapper avec report calculé dynamiquement |
| `renderBenoitAll()` | Vue combinée |

### render-fxp2p.js

Pipeline FX P2P (EUR→AED→USDT→MAD). Rendu conditionnel `window.PRIV`.

### render-gains.js

Consolidation gains avec 5 sources : Virements Augustin, Commission Ycarré, Commission Benoit, Écart taux Benoit, Spread P2P Benoit. Inclut un toggle DH/% via `window.gainsShowPct`.

### render-main.js

Orchestration : `TAB_CONFIG`, `buildTabs()`, `refreshTabVisibility()`, `showTab()`, `renderPanel()`, `renderAll()`.

---

## Guide de mise à jour

### Ajouter un nouveau paiement Councils (Benoit)

1. Ouvrir `data.js`
2. Trouver `benoit2026.councils`
3. Ajouter une ligne :
```javascript
{ mois: "Mars", htEUR: 5000, tauxApplique: 10.600, statut: "w", statutText: "Invoiced" },
```
4. Quand le paiement est confirmé, changer `statut: "ok"` et `statutText: "Paid DD/MM"`

### Ajouter un virement DH (Benoit)

1. Ouvrir `data.js`
2. Trouver `benoit2026.virements`
3. Ajouter :
```javascript
{ date: "15/04/2026", beneficiaire: "Benoit Chevalier", dh: 50000, motif: "Remboursement" },
```

### Passer à une nouvelle année (ex: Benoit 2027)

1. Dans `data.js`, ajouter `benoit2027: { ... }` avec la même structure que `benoit2026`
2. Le `renderBenoitYear()` fonctionnera automatiquement (détecte clôture vs en-cours)
3. Ajouter un wrapper `renderBenoit2027()` dans `render-benoit.js`
4. Le report 2026→2027 se calculera automatiquement
5. Mettre à jour le yearToggle pour inclure 2027

### Ajouter un nouveau counterpart

1. Dans `data.js`, ajouter `nouveauClient2026: { ... }`
2. Créer un fichier `render-nouveauClient.js` avec la logique de rendu
3. Dans `render-main.js`, ajouter à `TAB_CONFIG` :
```javascript
{ id: 'nouveauClient', label: 'Nouveau Client', access: 'full' },
```
4. Ajouter un `case` dans `renderPanel()` pour le nouveau panel
5. Charger le script dans `index.html` et bumper le cache version

---

## Déploiement

```bash
# Depuis /site
git add -A
git commit -m "Description du changement"
git push origin main

# Cache bust (IMPORTANT — GitHub Pages CDN)
# Incrémenter le ?v=N dans index.html pour tous les scripts
sed -i 's/v=26/v=27/g' index.html
```

Le site se met à jour en ~30 secondes après le push. Si l'ancienne version persiste, ajouter un query param unique à l'URL (ex: `?deploy=v27`).

## Chiffrement des données privées

```bash
# Générer/mettre à jour data-priv.enc.js
node encrypt.js
# Le mot de passe est BINGA
# Le fichier de sortie est data-priv.enc.js
```
