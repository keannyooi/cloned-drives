/*
 * packROI.js — expected sell-back value (EV) and ROI for a pack at a given price.
 *
 * Reuses the real game helpers (dataManager, cardType, getSellPrice) and mirrors
 * the EV walk in simulateEconomy.js (packSellEV): for each slot it walks the
 * cumulative rarity rates, weights each rarity by the average sell price of the
 * packable cars in that rarity bucket, leaks any sub-100 remainder into the
 * standard fallback, and multiplies by the pack's repetition.
 *
 * Usage: node scripts/packROI.js <packID> [price]
 *   e.g. node scripts/packROI.js p00129 5000000
 */
const { initialize, getCar, getPack, getCarFiles } = require("../src/util/functions/dataManager.js");
const { getSellPrice } = require("../src/util/functions/upgradePrice.js");
const ct = require("../src/util/functions/cardType.js");

initialize("./src");

const carFiles = getCarFiles();
const RARITY_FALLBACK = ["mystic", "legendary", "exotic", "epic", "rare", "uncommon", "common", "standard"];

// ── rarity buckets over all packable cars (mirrors getFilteredPool, no filter) ──
const byRarity = { standard: [], common: [], uncommon: [], rare: [], epic: [], exotic: [], legendary: [], mystic: [] };
for (const file of carFiles) {
    const car = getCar(file);
    if (ct.isDiamondCar(car)) continue;       // diamonds handled separately in-game; ignore for this pack
    if (!ct.isPackable(car)) continue;
    const cr = car.cr;
    if (cr >= 1000) byRarity.mystic.push(file);
    else if (cr >= 850) byRarity.legendary.push(file);
    else if (cr >= 700) byRarity.exotic.push(file);
    else if (cr >= 550) byRarity.epic.push(file);
    else if (cr >= 400) byRarity.rare.push(file);
    else if (cr >= 250) byRarity.uncommon.push(file);
    else if (cr >= 100) byRarity.common.push(file);
    else if (cr >= 1) byRarity.standard.push(file);
}

const avg = {};
for (const rarity of RARITY_FALLBACK) {
    const pool = byRarity[rarity];
    if (!pool || pool.length === 0) continue;
    let sum = 0;
    for (const f of pool) sum += getSellPrice(getCar(f).cr);
    avg[rarity] = sum / pool.length;
}

function rarityValueWithFallback(rarity) {
    if (avg[rarity] !== undefined) return avg[rarity];
    const idx = RARITY_FALLBACK.indexOf(rarity);
    const lower = RARITY_FALLBACK.slice(idx + 1);
    const higher = RARITY_FALLBACK.slice(0, idx).reverse();
    const maxLen = Math.max(lower.length, higher.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < lower.length && avg[lower[i]] !== undefined) return avg[lower[i]];
        if (i < higher.length && avg[higher[i]] !== undefined) return avg[higher[i]];
    }
    return 0;
}

const packID = process.argv[2] || "p00129";
const price = parseFloat(process.argv[3] || "5000000");
const pack = getPack(packID);
const repetition = pack.repetition || 1;

let total = 0;
const slotBreakdown = [];
for (const slotDef of pack.packSequence) {
    const rates = slotDef.rates ? slotDef.rates : { ...slotDef };
    let slotEV = 0, check = 0;
    const parts = [];
    for (const key of Object.keys(rates)) {
        if (key === "diamond" || key === "pool") continue;
        const lo = Math.min(check, 100), hi = Math.min(check + rates[key], 100);
        check += rates[key];
        if (hi <= lo) continue;
        const v = rarityValueWithFallback(key);
        const contrib = ((hi - lo) / 100) * v;
        slotEV += contrib;
        parts.push({ key, pct: hi - lo, avg: v, contrib });
    }
    if (check < 100) {
        const v = rarityValueWithFallback("standard");
        const contrib = ((100 - check) / 100) * v;
        slotEV += contrib;
        parts.push({ key: "standard(leak)", pct: 100 - check, avg: v, contrib });
    }
    total += slotEV * repetition;
    slotBreakdown.push({ slotEV, parts });
}

const fmt = n => Math.round(n).toLocaleString("en-US");
const cardsPerPack = pack.packSequence.length * repetition;

console.log(`\nPack: ${pack.packName} (${packID})`);
console.log(`Cards per pack: ${pack.packSequence.length} slots x ${repetition} repetition = ${cardsPerPack}\n`);

console.log("Rarity buckets (packable, non-diamond):");
for (const r of ["epic", "exotic", "legendary", "mystic"]) {
    console.log(`  ${r.padEnd(10)} pool=${String(byRarity[r].length).padStart(4)}  avg sell=${fmt(avg[r] || 0)}`);
}

const uniform = slotBreakdown.every(s => Math.abs(s.slotEV - slotBreakdown[0].slotEV) < 1e-6);
console.log(uniform ? "\nPer-slot EV (all slots identical):" : "\nPer-slot EV (slots differ — shown individually):");
for (let i = 0; i < slotBreakdown.length; i++) {
    const s = slotBreakdown[i];
    if (!uniform) console.log(`  slot ${i + 1}:`);
    const pad = uniform ? "  " : "    ";
    for (const p of s.parts) {
        console.log(`${pad}${p.key.padEnd(16)} ${String(p.pct).padStart(5)}%  x avg ${fmt(p.avg).padStart(9)}  = ${fmt(p.contrib)}`);
    }
    console.log(`${pad}slot EV = ${fmt(s.slotEV)}`);
    if (uniform) break; // all slots identical — one is enough
}
console.log(`  avg per card = ${fmt(total / cardsPerPack)}`);

console.log("\n── RESULT ──");
console.log(`Expected sell-back value (${cardsPerPack} cards): ${fmt(total)}`);
console.log(`Price:                               ${fmt(price)}`);
console.log(`Net EV (value - price):              ${fmt(total - price)}`);
console.log(`ROI:                                 ${((total - price) / price * 100).toFixed(1)}%`);
console.log(`Return ratio (value / price):        ${(total / price).toFixed(3)}x\n`);
