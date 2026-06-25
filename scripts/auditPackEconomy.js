"use strict";

/**
 * PACK ECONOMY AUDIT
 * ==================
 * For every pack with a `price` field, computes:
 *   - Expected sell value (EV) per opening, based on rarity probabilities and the
 *     average sell price of eligible cars (per the pack's filter) at each rarity.
 *   - The profit margin (EV vs price).
 *
 * For packs where EV > price (loss-making for the shop), suggests a new price
 * such that price = ceil(EV * 1.10) — gives the shop a 10% house edge.
 *
 * Notes:
 *   - Only considers cars passing the pack's filter (country, bodyStyle, etc.)
 *   - Skips diamond cars (separate roll bucket, ignored here)
 *   - Skips reference (BM variant) cars and isPrize cars — packs don't pull those
 *   - Cars are pulled at tune 000 (stock), so no upgrade refund factored in
 *   - Per-rarity filter overrides (`rarityFilters`) honoured
 *   - Repetition multiplied through
 *
 * Usage: node auditPackEconomy.js
 */

const { initialize, getAllCars, getPack, getCar } = require("../src/util/functions/dataManager.js");
const { getSellPrice } = require("../src/util/functions/upgradePrice.js");
const { isPackable, isDiamondCar, hasType } = require("../src/util/functions/cardType.js");

initialize("./src");

const allCars = getAllCars();

// Rarity buckets matching rarityCheck.js
function rarityNameOf(car) {
    if (isDiamondCar(car)) return null; // skip diamonds — separate roll path
    if (hasType(car, "BOSS")) return "boss";
    if (car.cr > 999)  return "mystic";
    if (car.cr > 849)  return "legendary";
    if (car.cr > 699)  return "exotic";
    if (car.cr > 549)  return "epic";
    if (car.cr > 399)  return "rare";
    if (car.cr > 249)  return "uncommon";
    if (car.cr > 99)   return "common";
    return "standard";
}

// Test a car against a pack/slot filter (subset of filterCheck — packs don't use the boolean isOwned etc.)
function carPassesFilter(car, filter) {
    if (!filter) return true;
    for (const [key, val] of Object.entries(filter)) {
        if (val === null || val === undefined) continue;
        if (key === "cr" || key === "modelYear" || key === "seatCount" || key === "topSpeed" || key === "0to60" || key === "handling" || key === "weight") {
            const v = car[key];
            if (typeof v !== "number" || v < val.start || v > val.end) return false;
        }
        else if (Array.isArray(val)) {
            const fv = car[key];
            if (fv === undefined || fv === null) return false;
            const list = Array.isArray(fv) ? fv : [fv];
            const lcv = val.map(x => String(x).toLowerCase());
            if (!list.some(x => lcv.includes(String(x).toLowerCase()))) return false;
        }
        else if (typeof val === "boolean") {
            if (car[key] !== val) return false;
        }
        else {
            const fv = car[key];
            if (fv === undefined || fv === null) return false;
            const list = Array.isArray(fv) ? fv : [fv];
            if (!list.some(x => String(x).toLowerCase() === String(val).toLowerCase())) return false;
        }
    }
    return true;
}

/**
 * Build a per-rarity average-sell-price map for a given filter.
 * Returns: { rare: avgPrice, epic: avgPrice, ..., counts: {rare: N, epic: N, ...} }
 * Returns null at a rarity if no cars match.
 */
function buildAvgSellByRarity(filter) {
    const sums = {};
    const counts = {};
    for (const car of allCars) {
        if (!isPackable(car)) continue;    // packs only pull packable cards
        const r = rarityNameOf(car);
        if (!r) continue;
        if (!carPassesFilter(car, filter)) continue;
        const price = getSellPrice(car.cr);
        sums[r] = (sums[r] || 0) + price;
        counts[r] = (counts[r] || 0) + 1;
    }
    const avg = {};
    for (const r of Object.keys(sums)) {
        avg[r] = sums[r] / counts[r];
    }
    return { avg, counts };
}

/** Merge two filter objects shallowly (override wins on conflict). */
function mergeFilters(base, override) {
    return { ...(base || {}), ...(override || {}) };
}

/** Compute expected sell value for a single slot definition. */
function evaluateSlot(slotDef, packFilter, baseRarityAvg) {
    let rates, slotFilter, rarityFilters;
    if (slotDef.rates) {
        rates = slotDef.rates;
        slotFilter = slotDef.filter ? mergeFilters(packFilter, slotDef.filter) : packFilter;
        rarityFilters = slotDef.rarityFilters || {};
    }
    else {
        rates = slotDef;
        slotFilter = packFilter;
        rarityFilters = {};
    }

    // Total weight for normalisation (slot rates may not sum to exactly 100)
    let totalWeight = 0;
    for (const [key, w] of Object.entries(rates)) {
        if (key === "diamond" || key === "pool") continue;
        totalWeight += w;
    }
    if (totalWeight === 0) return 0;

    // Pre-compute per-rarity-filter avg sell prices if any rarity has a custom filter
    const customAvgCache = {};
    for (const [r, f] of Object.entries(rarityFilters)) {
        const mergedFilter = mergeFilters(slotFilter, f);
        customAvgCache[r] = buildAvgSellByRarity(mergedFilter).avg;
    }

    // Slot-level filter avg (used when no per-rarity override)
    const slotAvg = (slotFilter && JSON.stringify(slotFilter) !== JSON.stringify(packFilter))
        ? buildAvgSellByRarity(slotFilter).avg
        : baseRarityAvg;

    let ev = 0;
    for (const [r, w] of Object.entries(rates)) {
        if (r === "diamond" || r === "pool") continue;
        const prob = w / totalWeight;
        let avg;
        if (rarityFilters[r]) {
            avg = customAvgCache[r][r] ?? 0;
        }
        else {
            avg = slotAvg[r] ?? 0;
        }
        ev += prob * avg;
    }
    return ev;
}

function evaluatePack(pack) {
    const repetition = pack.repetition || 1;
    const baseRarityAvg = buildAvgSellByRarity(pack.filter || {}).avg;
    let totalEV = 0;
    for (const slotDef of pack.packSequence) {
        const slotEV = evaluateSlot(slotDef, pack.filter || {}, baseRarityAvg);
        totalEV += slotEV;
    }
    totalEV *= repetition;
    return totalEV;
}

// ─── Run the audit ──────────────────────────────────────────────────────────

const fs = require("fs");
const packFiles = fs.readdirSync("./src/packs").filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
const results = [];

for (const id of packFiles) {
    const pack = getPack(id);
    if (!pack || typeof pack.price !== "number" || pack.price <= 0) continue;
    const ev = evaluatePack(pack);
    const profitPerc = ((ev - pack.price) / pack.price) * 100;
    const suggestedPrice = ev > pack.price ? Math.ceil(ev * 1.10 / 1000) * 1000 : null;
    results.push({ id, name: pack.packName, price: pack.price, ev: Math.round(ev), profitPerc, suggestedPrice });
}

// Sort by profit margin descending (most profitable for the player first)
results.sort((a, b) => b.profitPerc - a.profitPerc);

// Header
console.log("\n══════════════════════════════════════════════════════════════════════════════════");
console.log("                            PACK ECONOMY AUDIT REPORT");
console.log("══════════════════════════════════════════════════════════════════════════════════");
console.log(`Found ${results.length} priced packs. Sorted by profit margin (worst-for-shop first).\n`);
console.log("Profitable for PLAYER (sell value > buy price) — SHOP LOSES MONEY:");
console.log("──────────────────────────────────────────────────────────────────────────────────");

const PROFIT_THRESHOLD = 0;
const profitable = results.filter(r => r.profitPerc > PROFIT_THRESHOLD);
const losing     = results.filter(r => r.profitPerc <= PROFIT_THRESHOLD);

if (profitable.length === 0) {
    console.log("  (none — all packs are loss-making or break-even for the player)\n");
}
else {
    for (const r of profitable) {
        const arrow = r.profitPerc >= 50 ? "🔴" : r.profitPerc >= 20 ? "🟠" : "🟡";
        const profitStr = `+${r.profitPerc.toFixed(1)}%`;
        const suggest = r.suggestedPrice ? `→ Suggest price: $${r.suggestedPrice.toLocaleString()}` : "";
        console.log(`  ${arrow} ${r.id}  ${r.name.padEnd(40)} buy $${r.price.toLocaleString().padStart(10)} → sell $${r.ev.toLocaleString().padStart(10)}  ${profitStr.padStart(8)}  ${suggest}`);
    }
}

console.log("\nUnprofitable for player (sell value ≤ buy price) — SHOP IS FINE:");
console.log("──────────────────────────────────────────────────────────────────────────────────");
if (losing.length === 0) {
    console.log("  (none)");
}
else {
    for (const r of losing) {
        const lossStr = `${r.profitPerc.toFixed(1)}%`;
        console.log(`  🟢 ${r.id}  ${r.name.padEnd(40)} buy $${r.price.toLocaleString().padStart(10)} → sell $${r.ev.toLocaleString().padStart(10)}  ${lossStr.padStart(8)}`);
    }
}

console.log("\n──────────────────────────────────────────────────────────────────────────────────");
console.log("Suggestion formula: new_price = ceil(EV * 1.10) rounded up to nearest $1,000");
console.log("Gives a 10% house edge — slight loss for the player on sell, but not punitive.");
console.log("──────────────────────────────────────────────────────────────────────────────────\n");

// Summary block at the end
console.log(`SUMMARY: ${profitable.length} packs need a price bump | ${losing.length} packs are fine\n`);
