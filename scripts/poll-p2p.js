#!/usr/bin/env node
// ============================================================
// POLL-P2P.JS — Background poller Binance P2P + USD/MAD
// Usage: node scripts/poll-p2p.js
// Env: BINGA_PASSWORD (obligatoire — secret GitHub Actions)
//
// Fonctionnement:
// 1. Fetch Binance P2P AED BUY (transAmount=10000) → médiane + top
// 2. Fetch Binance P2P MAD SELL (transAmount=20000) → médiane + top
// 3. Fetch USD/MAD live (fawazahmed0/currency-api)
// 4. Calcule les spreads (buy vs peg 3.6725, sell vs USD/MAD)
// 5. Lit data-history.enc.js s'il existe, déchiffre avec BINGA pwd
// 6. Append la nouvelle entrée {ts, buy, sell, fx, spreads}
// 7. Cap à HISTORY_CAP entrées max (FIFO — supprime les + anciennes)
// 8. Re-chiffre et écrit data-history.enc.js
//
// Appelé par le workflow GitHub Actions toutes les 6h. Peut aussi
// tourner en local pour bootstrap / debug.
//
// Robustesse:
//   - Si Binance échoue: on log et on SKIP l'entrée (pas de commit vide)
//   - Si USD/MAD échoue: on récupère quand même le buy spread (peg fixe)
//     — sellSpread = null dans l'entrée
//   - Si déchiffrement de l'historique échoue: start fresh (ne bloque pas)
//
// Node natif seulement (crypto built-in, fetch global v18+). Zero dep.
// ============================================================

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SALT = 'facturation-augustin-2025';     // doit matcher encrypt.js
const PEG_AED_USD = 3.6725;                   // peg UAE central bank
const MIN_AED = 10000;                         // transAmount buy (filtre parasites)
const MIN_MAD = 20000;                         // transAmount sell
const HISTORY_FILE = path.join(__dirname, '..', 'data-history.enc.js');
const HISTORY_CAP = 1500;                     // ≈ 365 jours × 4 runs/jour

// ---- ENCRYPTION (même scheme que encrypt.js) -----------------------
function encryptData(data, password) {
  const plaintext = JSON.stringify(data);
  const pwd = password.toUpperCase();
  const key = crypto.pbkdf2Sync(pwd, SALT, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(plaintext, 'utf8');
  enc = Buffer.concat([enc, cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decryptData(b64, password) {
  const pwd = password.toUpperCase();
  const key = crypto.pbkdf2Sync(pwd, SALT, 100000, 32, 'sha256');
  const raw = Buffer.from(b64, 'base64');
  const iv = raw.slice(0, 12);
  const tag = raw.slice(12, 28);
  const ct = raw.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let dec = decipher.update(ct, null, 'utf8');
  dec += decipher.final('utf8');
  return JSON.parse(dec);
}

// ---- FETCHERS (server-side, pas de CORS) ---------------------------
async function fetchBinanceP2P(fiat, tradeType, transAmount) {
  const body = {
    proMerchantAds: false,
    page: 1,
    rows: 20,
    payTypes: [],
    countries: [],
    publisherType: null,
    fiat,
    tradeType,
    asset: 'USDT',
    merchantCheck: false,
    transAmount: String(transAmount),
  };
  const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Binance ${fiat} ${tradeType}: HTTP ${res.status}`);
  const j = await res.json();
  const ads = (j.data || []).filter(a => a?.adv?.price);
  if (!ads.length) throw new Error(`Binance ${fiat} ${tradeType}: 0 ads`);

  // Safety-net client-side (cf BUG-011): Binance laisse passer des offres
  // dont max < transAmount malgré le filtre serveur.
  const offers = ads
    .map(a => ({
      price: parseFloat(a.adv.price),
      min: parseFloat(a.adv.minSingleTransAmount),
      max: parseFloat(a.adv.dynamicMaxSingleTransAmount || a.adv.maxSingleTransAmount),
      merchant: a.advertiser?.nickName || '—',
    }))
    .filter(o =>
      isFinite(o.price) && o.price > 0 &&
      isFinite(o.max) && o.max >= transAmount &&
      (!isFinite(o.min) || o.min <= transAmount)
    );
  if (!offers.length) throw new Error(`Binance ${fiat} ${tradeType}: no offers ≥ ${transAmount}`);

  offers.sort((a, b) => tradeType === 'BUY' ? a.price - b.price : b.price - a.price);
  const prices = offers.slice(0, 10).map(o => o.price);
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    topPrice:    prices[0],
    medianPrice: median,
    offerCount:  prices.length,
    transAmount,
  };
}

async function fetchUsdMad() {
  const urls = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
      const j = await r.json();
      const rate = j?.usd?.mad;
      if (rate && isFinite(rate)) return { usdMad: rate, date: j.date || null };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('USD/MAD fetch failed');
}

// ---- HISTORY IO -----------------------------------------------------
function readHistory(password) {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    const src = fs.readFileSync(HISTORY_FILE, 'utf8');
    const m = src.match(/ENCRYPTED_HISTORY\s*=\s*"([^"]+)"/);
    if (!m) return [];
    const data = decryptData(m[1], password);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch (e) {
    console.warn(`[poll] Lecture historique failed: ${e.message}. Starting fresh.`);
    return [];
  }
}

function writeHistory(entries, password) {
  const b64 = encryptData({ entries }, password);
  const content =
    `// Auto-generated by scripts/poll-p2p.js (GitHub Actions cron)\n` +
    `// Historique P2P chiffré (AES-256-GCM, BINGA password). DO NOT EDIT.\n` +
    `const ENCRYPTED_HISTORY = "${b64}";\n`;
  fs.writeFileSync(HISTORY_FILE, content);
}

// ---- MAIN -----------------------------------------------------------
async function main() {
  const pwd = process.env.BINGA_PASSWORD;
  if (!pwd) {
    console.error('✗ BINGA_PASSWORD env variable is required.');
    process.exit(2);
  }

  const ts = new Date().toISOString();
  console.log(`[poll] ${ts} — Fetching live P2P + FX…`);

  const [buyR, sellR, fxR] = await Promise.allSettled([
    fetchBinanceP2P('AED', 'BUY', MIN_AED),
    fetchBinanceP2P('MAD', 'SELL', MIN_MAD),
    fetchUsdMad(),
  ]);

  const buy  = buyR.status  === 'fulfilled' ? buyR.value  : null;
  const sell = sellR.status === 'fulfilled' ? sellR.value : null;
  const fx   = fxR.status   === 'fulfilled' ? fxR.value   : null;

  // Log chaque fetch pour debug dans les logs Actions
  console.log('[poll] buy  =', buyR.status,  buy  ? `median ${buy.medianPrice}`  : buyR.reason?.message);
  console.log('[poll] sell =', sellR.status, sell ? `median ${sell.medianPrice}` : sellR.reason?.message);
  console.log('[poll] fx   =', fxR.status,   fx   ? `usd/mad ${fx.usdMad}`       : fxR.reason?.message);

  // Si AUCUNE source n'a répondu: skip l'entrée (évite commits vides)
  if (!buy && !sell && !fx) {
    console.error('✗ All sources failed. Skipping entry.');
    process.exit(1);
  }

  // Spreads (null si donnée manquante)
  const buySpread  = buy  ? ((buy.medianPrice  - PEG_AED_USD) / PEG_AED_USD) * 100 : null;
  const sellSpread = (sell && fx) ? ((sell.medianPrice - fx.usdMad)    / fx.usdMad)    * 100 : null;

  const entry = {
    ts,
    buy,
    sell,
    fx,
    spreads: {
      buy:  buySpread  != null ? Math.round(buySpread  * 10000) / 10000 : null,
      sell: sellSpread != null ? Math.round(sellSpread * 10000) / 10000 : null,
    },
  };

  // Append + cap FIFO
  const history = readHistory(pwd);
  history.push(entry);
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);

  writeHistory(history, pwd);
  console.log(`[poll] Entry added. Total: ${history.length} (cap ${HISTORY_CAP}).`);
  console.log(`[poll] Last entry:`, JSON.stringify(entry));
}

main().catch(e => {
  console.error('✗ Fatal:', e.message);
  process.exit(1);
});
