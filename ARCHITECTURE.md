# Facturation — Architecture & Mode d'emploi

## Vue d'ensemble

Site statique hébergé sur GitHub Pages (lallakenza/facturation) permettant la réconciliation de facturation entre plusieurs parties. Données publiques en clair + données privées chiffrées (AES-256-GCM, Web Crypto API).

---

## Personnes & Nicknames

| Nickname (site) | Personne réelle | Rôle |
|---|---|---|
| **Augustin** | Mohammed Azarkan | Consultant SAP chez RTL via Bairok Consulting LLC (EAU) |
| **Benoit** / **Benoit Chevalier** | Badre | Bénéficiaire des paiements Councils, tracking en DH |
| **Amine** | Amine (propriétaire du site) | Gestionnaire facturation, retient commissions |
| **Jean Augustin** | Bénéficiaire virements Maroc | Azarkan côté DH |
| **Nezha** | Femme d'Amine | Émettrice des virements perso EUR |
| **Hanane** | Femme d'Azarkan | Réceptrice des virements perso EUR |
| **Oumaima** | Intermédiaire | Transfert cash Amine → Augustin |
| **Zakaria Belghiti** | Intermédiaire | Transfert cash Augustin → Amine |

## Entités de facturation

| Entité | Description |
|---|---|
| **Bairok Consulting LLC** | Société d'Azarkan aux EAU (Sharjah). Facture RTL en HT (TVA 0%). IBAN IFX Payments (GB). |
| **CLT-UFA S.A. (RTL Group)** | Client final au Luxembourg. Paie les factures Bairok. |
| **Councils / Majalis / BridgeVale** | Clients qui paient Azarkan en EUR (TTC en Belgique, TVA 21%). On comptabilise en HT. |

---

## Modes d'accès

Le site a 3 niveaux d'accès contrôlés par un "gate" (mot de passe) :

| Mode | Code d'accès | `ACCESS_MODE` | `PRIV` | Thème | Contenu visible |
|---|---|---|---|---|---|
| **BRIDGEVALE** | `BRIDGEVALE` | `full` | `false` | Clair | Tous les onglets (Augustin + Benoit + FX P2P + Gains) |
| **COUPA** | `COUPA` | `benoit` | `false` | Clair | Benoit uniquement |
| **BINGA** | Champ caché `#dref` | `full` | `true` | Sombre | Tous les onglets + données privées (taux marché, commissions FX, gains détaillés) |

### Fonctionnement du gate
- L'input principal accepte BRIDGEVALE ou COUPA (keydown Enter)
- Un input caché `#dref` déclenche le mode BINGA (event input) avec déchiffrement AES-256-GCM des données privées (`data-priv.enc.js`)

---

## Structure des fichiers

```
site/
├── index.html            # HTML principal + CSS + gate + crypto + year toggles
├── data.js               # Données publiques (augustin2025/2026, benoit2025/2026)
├── data-priv.enc.js      # Données privées chiffrées (FX P2P, taux marché, spreads)
├── render-helpers.js     # Fonctions utilitaires (fmtPlain, fmtSigned, badge, sum, yearToggle3, tri)
├── render-augustin.js    # Rendu onglet Augustin (2025 clôturé + 2026 en cours)
├── render-benoit.js      # Rendu onglet Benoit (2025 clôturé + 2026 en cours)
├── render-fxp2p.js       # Rendu onglet FX P2P (3 legs : EUR→AED, AED→USDT, USDT→MAD)
├── render-gains.js       # Rendu onglet Mes Gains (consolidation commissions + FX)
├── render-main.js        # Système d'onglets dynamique (TAB_CONFIG, buildTabs, showTab)
└── ARCHITECTURE.md       # Ce fichier
```

### Cache busting
Chaque `<script>` a un paramètre `?v=N`. Incrémenter N après chaque déploiement pour forcer le rafraîchissement CDN de GitHub Pages.

---

## Structure des données (data.js)

### augustin2025 (clôturé)
- `rtl[]` : Factures RTL 2025 (INVRTL001→012), toutes payées
- `mois[]` : Réconciliation mois par mois (actuals, B+Y+M, Maroc, divers)
- `ycarre[]`, `councils[]`, `baraka[]` : Paiements EBS par catégorie
- `virementsMaroc[]` : Virements DH vers Augustin
- `divers[]` : Transactions diverses (vols, iPhone, prêts, virements)
- `insights[]` : Analyses clés

### augustin2026 (en cours)
- `report2025` : Solde reporté de 2025 (négatif = Augustin doit à Amine)
- `tauxMaroc` : Taux EUR/MAD fixe (10)
- `rtl[]` : Factures RTL 2026 avec `dateFacture`, `dateDue`, `statut`
  - Statuts : `ok` = payé, `w` = invoiced/en attente, `i` = à facturer
- `virementsMaroc[]` : Virements DH (date, bénéficiaire, montant DH)
- `divers[]` : Cash direct + virements personnels
  - `commissionRate` : si présent, le montant est net et le brut = montant / (1 - rate)

### benoit2025 / benoit2026
- `commissionRate` : Taux de commission Amine (0.10 = 10%)
- `tvaRate` : TVA belge (0.21 = 21%). Azarkan reçoit TTC, on comptabilise HT
- `councils[]` : Paiements Councils
  - `htEUR` : Montant hors taxes
  - `tauxApplique` : Taux EUR/MAD appliqué
  - `tauxMarche` : (PRIV) Taux marché réel au moment du paiement
  - `statut` / `statutText` : (2026 only) état du paiement
- `virements[]` : Virements DH vers Benoit
- Le **report** (carryforward) est calculé dynamiquement depuis l'année précédente, jamais stocké

### Données privées (chiffrées)
- `fxP2P` : Pipeline FX en 3 étapes (EUR→AED via IFX, AED→USDT via Binance P2P, USDT→MAD via P2P sell)
- `tauxMarche` injecté dans les transactions Benoit au runtime
- Spreads, gains FX, taux effectifs

---

## Calculs clés

### Commission Benoit
```
DH = Math.round(htEUR × tauxApplique)
commission = Math.round(DH × commissionRate)
netBenoit = DH - commission
```

### Commission virements personnels (6%)
```
brut = montantNet / (1 - commissionRate)
commission = brut - montantNet
// Ex: 3000€ net → brut = 3000/0.94 = 3191€, commission = 191€
```

### Report (carryforward)
```
report = netDûAnnéePrécédente - totalPayéAnnéePrécédente
```
Calculé dynamiquement dans `renderBenoit2026()` à partir des données 2025.

### HT / TTC (Councils en Belgique)
```
TTC = HT × (1 + tvaRate)    // Ex: 5000 × 1.21 = 6050€
```
Azarkan reçoit le TTC. Le site comptabilise en HT. La colonne TTC est affichée à titre indicatif.

---

## Fonctionnalités UI

- **Year toggle** : Tout / 2025 / 2026 par section (via `yearToggle3()`)
- **Tri des tableaux** : Clic sur les en-têtes `th[data-sort]` pour trier (asc/desc). Types : `num` (nombres) et `date` (dates FR : DD/MM/YYYY, mois français, ISO)
- **Toggle DH / %** : Dans Mes Gains, bascule entre montants absolus et pourcentages
- **Badges** : `ok` (vert), `w` (jaune), `i` (bleu), `fail` (rouge)
- **Cards** : KPIs en haut de chaque section
- **Insights** : Analyses narratives avec classes `pass`, `warn`, `fail`, `neutral`

---

## Déploiement

1. Modifier les fichiers dans `site/`
2. Incrémenter `?v=N` dans index.html pour tous les scripts
3. `git add` + `git commit` + `git push`
4. GitHub Pages déploie automatiquement (~30s)
5. Si CDN cache l'ancien HTML : ajouter `?deploy=vXXx` à l'URL pour forcer le rafraîchissement
