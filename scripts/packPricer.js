/*
 * packPricer.js — recommended-price calculator for packs.
 *
 * Prices a pack from the expected value the player gets back, divided by a
 * target ROI that tightens automatically the more the pack is filtered, with a
 * premium for (near-)guaranteed mystics.
 *
 *   effectiveValue = cardSellEV + upgradeEV + rebateEV     (diamonds EXCLUDED)
 *   targetROI      = TOP_ROI − PER_DECADE · log10(total/filtered pool)   [clamped]
 *   mysticMult     = 1 + MYSTIC_K · E[mystics per pack]
 *   recommended    = effectiveValue / targetROI · mysticMult
 *
 * Card EV mirrors openPack.js's cumulative rarity walk (incl. per-slot filters,
 * rarityFilters and pools); diamonds are skipped so they stay pure "bonuses".
 *
 * Usage:
 *   node scripts/packPricer.js                 # price every pack -> scripts/pack_prices.csv
 *   node scripts/packPricer.js <name or id>... # price just these, verbose
 */
const fs = require("fs");
const { initialize, getCar, getPack, getCarFiles, getPackFiles } = require("../src/util/functions/dataManager.js");
const { getSellPrice, costFromStock } = require("../src/util/functions/upgradePrice.js");
const ct = require("../src/util/functions/cardType.js");

initialize("./src");

// ─── TUNABLE KNOBS ──────────────────────────────────────────────────────────
const CFG = {
    TOP_ROI:       0.95,   // ROI for a fully UNfiltered pack (player recovers 95% of price in value)
    PER_DECADE:    0.075,  // ROI lost per 10x reduction in eligible pool (filter premium)
    FLOOR_ROI:     0.65,   // never price tighter than this
    MYSTIC_K:      0.25,   // price premium per unit of mystic-score (1.0 ≈ one guaranteed mystic)
    // Mystic score blends GUARANTEE (best single slot's mystic chance — captures
    // "is a mystic locked in?") with VOLUME (expected mystics per pack). Weights
    // sum to 1; guarantee is weighted heavier so a true guaranteed-mystic pack
    // costs far more than a high-volume-of-tiny-odds pack.
    MYSTIC_GUARANTEE_W: 0.75,
    MYSTIC_VOLUME_W:    0.25,
    UPGRADE_REFUND_RATE: 0.20, // matches cd-sell: resale value of a tune = 20% of its cost
    INCLUDE_UPGRADE: true, // value pre-upgraded pulls (upgradeChance)
    INCLUDE_REBATE:  true, // value money cashback (bonusRewards) — see TROPHY_VALUE for trophies
    TROPHY_VALUE:    0,     // money-equivalent of one bonus trophy (0 = ignore; report separately)
};

const RARITY_FALLBACK = ["mystic", "legendary", "exotic", "epic", "rare", "uncommon", "common", "standard"];
const carFiles = getCarFiles();

// ─── Filtered pool (packable, non-diamond) bucketed by rarity — mirrors openPack ──
const poolCache = new Map();
function getFilteredPool(filter, logic) {
    const key = `${logic}|${JSON.stringify(filter)}`;
    if (poolCache.has(key)) return poolCache.get(key);
    const byRarity = { standard: [], common: [], uncommon: [], rare: [], epic: [], exotic: [], legendary: [], mystic: [] };
    const filtered = [];
    for (const file of carFiles) {
        const car = getCar(file);
        if (ct.isDiamondCar(car)) continue;          // diamonds excluded from pricing entirely
        if (!ct.isPackable(car)) continue;
        if (!filterCard(car, filter, logic)) continue;
        filtered.push(file);
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
    const res = { filtered, byRarity };
    poolCache.set(key, res);
    return res;
}

function filterCard(c, filter, logic) {
    const orL = logic === "or";
    for (const k in filter) {
        const fv = filter[k]; if (fv === "None") continue;
        const cv = c[k];
        if (Array.isArray(fv)) {
            let ca = Array.isArray(cv) ? cv : cv ? [cv] : [];
            ca = ca.map(v => typeof v === "string" ? v.toLowerCase() : v);
            const fa = fv.map(v => typeof v === "string" ? v.toLowerCase() : v);
            if (orL) { if (!fa.some(x => ca.includes(x))) return false; }
            else { if (!fa.every(x => ca.includes(x))) return false; }
        } else if (typeof fv === "object" && fv !== null && "start" in fv && "end" in fv) {
            if (cv == null || cv < fv.start || cv > fv.end) return false;
        } else if (typeof fv === "string") {
            if (Array.isArray(cv)) { if (!cv.some(v => typeof v === "string" && v.toLowerCase() === fv.toLowerCase())) return false; }
            else if (typeof cv === "string") { if (cv.toLowerCase() !== fv.toLowerCase()) return false; }
            else return false;
        } else if (typeof fv === "boolean") { if (cv !== fv) return false; }
    }
    return true;
}
function mergeFilters(base, over) { return { ...base, ...over }; }

// avg sell price and avg tune-cost-base, per rarity, for a given filter
const avgCache = new Map();
function avgByRarity(filter, logic) {
    const key = `${logic}|${JSON.stringify(filter)}`;
    if (avgCache.has(key)) return avgCache.get(key);
    const { byRarity } = getFilteredPool(filter, logic);
    const sell = {}, upgBase = {};
    for (const rarity of RARITY_FALLBACK) {
        const pool = byRarity[rarity];
        if (!pool || !pool.length) continue;
        let s = 0, u = 0;
        for (const f of pool) { const cr = getCar(f).cr; s += getSellPrice(cr); u += costFromStock(cr, "999"); } // "999"=digitsum 27 base
        sell[rarity] = s / pool.length;
        upgBase[rarity] = u / pool.length / 27; // per-digit tune-cost multiplier, averaged
    }
    const res = { sell, upgBase };
    avgCache.set(key, res);
    return res;
}
function withFallback(map, rarity) {
    if (map[rarity] !== undefined) return map[rarity];
    const idx = RARITY_FALLBACK.indexOf(rarity);
    const lower = RARITY_FALLBACK.slice(idx + 1), higher = RARITY_FALLBACK.slice(0, idx).reverse();
    const n = Math.max(lower.length, higher.length);
    for (let i = 0; i < n; i++) {
        if (i < lower.length && map[lower[i]] !== undefined) return map[lower[i]];
        if (i < higher.length && map[higher[i]] !== undefined) return map[higher[i]];
    }
    return 0;
}
function tuneDigitSum(t) { return (!t || t.length !== 3) ? 0 : (+t[0]) + (+t[1]) + (+t[2]); }

// expected per-card upgrade refund value given pack.upgradeChance and a rarity's tune-cost base
function upgradeValuePerCard(upgradeChance, upgBasePerDigit) {
    if (!upgradeChance) return 0;
    let v = 0;
    for (const [tune, chance] of Object.entries(upgradeChance)) {
        v += (chance / 100) * CFG.UPGRADE_REFUND_RATE * tuneDigitSum(tune) * upgBasePerDigit;
    }
    return v;
}

// ─── Core: expected value of a pack (diamonds excluded) ─────────────────────
function packValue(pack) {
    const logic = pack.filterLogic || "and";
    const packFilter = pack.filter || {};
    const rep = pack.repetition || 1;
    let cardEV = 0, upgradeEV = 0, expMystics = 0, maxSlotMystic = 0;

    for (const slotDef of pack.packSequence) {
        let slotMystic = 0;   // mystic probability within THIS slot (guarantee signal)
        let rates, slotFilter, rarityFilters = {};
        if (slotDef.rates) {
            rates = slotDef.rates;
            slotFilter = slotDef.filter ? mergeFilters(packFilter, slotDef.filter) : packFilter;
            if (slotDef.rarityFilters && !Array.isArray(slotDef.rarityFilters)) {
                for (const [r, o] of Object.entries(slotDef.rarityFilters)) rarityFilters[r] = mergeFilters(slotFilter, o);
            } else if (Array.isArray(slotDef.rarityFilters)) {
                // weighted form: blend the per-rarity filters by weight (EV approximation)
                for (const entry of slotDef.rarityFilters) {
                    const w = typeof entry.weight === "number" ? entry.weight : 1;
                    for (const [r, o] of Object.entries(entry)) {
                        if (r === "weight") continue;
                        (rarityFilters[r] = rarityFilters[r] || []).push({ filter: mergeFilters(slotFilter, o), w });
                    }
                }
            }
        } else { rates = { ...slotDef }; slotFilter = packFilter; }

        const slotAvg = avgByRarity(slotFilter, logic);
        let slotEV = 0, slotUpg = 0, check = 0;

        for (const key of Object.keys(rates)) {
            if (key === "diamond") continue;               // EXCLUDE diamonds
            if (key === "pool") {
                for (const entry of rates.pool) {
                    const lo = Math.min(check, 100), hi = Math.min(check + entry.weight, 100);
                    check += entry.weight; if (hi <= lo) continue;
                    const p = (hi - lo) / 100, car = getCar(entry.carID);
                    if (!car) continue;
                    slotEV += p * getSellPrice(car.cr);
                    if (car.cr >= 1000) slotMystic += p;
                    // pool cards carry their own fixed upgrade; value it as refund
                    if (entry.upgrade && entry.upgrade !== "000")
                        slotUpg += p * CFG.UPGRADE_REFUND_RATE * costFromStock(car.cr, entry.upgrade);
                }
            } else {
                const lo = Math.min(check, 100), hi = Math.min(check + rates[key], 100);
                check += rates[key]; if (hi <= lo) continue;
                const p = (hi - lo) / 100;
                // resolve avg sell + upgrade base for this rarity (handle rarityFilters forms)
                let sellAvg, upgBase;
                if (Array.isArray(rarityFilters[key])) {
                    const tot = rarityFilters[key].reduce((s, e) => s + e.w, 0);
                    sellAvg = 0; upgBase = 0;
                    for (const e of rarityFilters[key]) {
                        const a = avgByRarity(e.filter, logic);
                        sellAvg += (e.w / tot) * withFallback(a.sell, key);
                        upgBase += (e.w / tot) * withFallback(a.upgBase, key);
                    }
                } else if (rarityFilters[key]) {
                    const a = avgByRarity(rarityFilters[key], logic);
                    sellAvg = withFallback(a.sell, key); upgBase = withFallback(a.upgBase, key);
                } else {
                    sellAvg = withFallback(slotAvg.sell, key); upgBase = withFallback(slotAvg.upgBase, key);
                }
                slotEV += p * sellAvg;
                slotUpg += p * upgradeValuePerCard(pack.upgradeChance, upgBase);
                if (key === "mystic") slotMystic += p;
            }
        }
        if (check < 100) { // leak → standard fallback
            const p = (100 - check) / 100;
            slotEV += p * withFallback(slotAvg.sell, "standard");
            slotUpg += p * upgradeValuePerCard(pack.upgradeChance, withFallback(slotAvg.upgBase, "standard"));
        }
        cardEV += slotEV * rep;
        upgradeEV += slotUpg * rep;
        expMystics += slotMystic * rep;                    // volume across all (repeated) slots
        maxSlotMystic = Math.max(maxSlotMystic, slotMystic); // guarantee = best single slot
    }

    // rebate EV (bonusRewards) — flat number or {chance, amount}
    let rebateEV = 0, expTrophies = 0;
    if (CFG.INCLUDE_REBATE && pack.bonusRewards) {
        rebateEV += expectReward(pack.bonusRewards.money);
        expTrophies = expectReward(pack.bonusRewards.trophies);
        rebateEV += expTrophies * CFG.TROPHY_VALUE;
    }
    if (!CFG.INCLUDE_UPGRADE) upgradeEV = 0;

    return { cardEV, upgradeEV, rebateEV, expMystics, maxSlotMystic, expTrophies };
}
function expectReward(val) {
    if (!val) return 0;
    if (typeof val === "number") return val;
    if (typeof val === "object" && typeof val.amount === "number")
        return ((typeof val.chance === "number" ? val.chance : 100) / 100) * val.amount;
    return 0;
}

const TOTAL_POOL = getFilteredPool({}, "and").filtered.length;
function targetROI(pack) {
    const logic = pack.filterLogic || "and";
    const filtered = getFilteredPool(pack.filter || {}, logic).filtered.length || 1;
    const decades = Math.log10(TOTAL_POOL / filtered);
    return { roi: Math.max(CFG.FLOOR_ROI, CFG.TOP_ROI - CFG.PER_DECADE * decades), filtered, decades };
}

function recommend(pack) {
    const v = packValue(pack);
    const { roi, filtered, decades } = targetROI(pack);
    const value = v.cardEV + v.upgradeEV + v.rebateEV;
    const mysticScore = CFG.MYSTIC_GUARANTEE_W * v.maxSlotMystic + CFG.MYSTIC_VOLUME_W * v.expMystics;
    const mysticMult = 1 + CFG.MYSTIC_K * mysticScore;
    const price = value / roi * mysticMult;
    return { ...v, value, roi, filtered, decades, mysticScore, mysticMult, price };
}

// ─── CLI ────────────────────────────────────────────────────────────────────
const fmt = n => Math.round(n).toLocaleString("en-US");
const args = process.argv.slice(2);
const packFiles = getPackFiles();

// strip // comments (string-aware) so a .jsonc draft can be priced directly
function loadJsonc(p) {
    let s = fs.readFileSync(p, "utf8"), out = "", inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) { const c = s[i], n = s[i + 1];
        if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; out += c; continue; }
        if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
        out += c; }
    return JSON.parse(out);
}

function resolvePacks(queries) {
    const all = packFiles.map(f => f.replace(/\.json$/, ""));
    const out = [];
    for (const q of queries) {
        if (/\.(json|jsonc)$/i.test(q) || q.includes("/") || q.includes("\\")) {
            try { out.push({ pack: loadJsonc(q), label: q }); } catch (e) { console.log(`(could not load ${q}: ${e.message})`); }
            continue;
        }
        const ql = q.toLowerCase();
        const hit = all.find(id => id === ql) ||
            all.find(id => (getPack(id).packName || "").toLowerCase() === ql) ||
            all.find(id => (getPack(id).packName || "").toLowerCase().includes(ql));
        if (hit) out.push(hit); else console.log(`(no pack matched "${q}")`);
    }
    return out;
}

if (args.length) {
    for (const entry of resolvePacks(args)) {
        const p = (typeof entry === "string") ? getPack(entry) : entry.pack;
        const id = (typeof entry === "string") ? entry : entry.label;
        const r = recommend(p);
        console.log(`\n${p.packName}  (${id})`);
        console.log(`  eligible pool: ${r.filtered}/${TOTAL_POOL}  (${r.decades.toFixed(2)} decades filtered)  → target ROI ${(r.roi * 100).toFixed(1)}%`);
        console.log(`  card sell EV ........ ${fmt(r.cardEV)}`);
        if (r.upgradeEV) console.log(`  upgrade-chance EV ... ${fmt(r.upgradeEV)}`);
        if (r.rebateEV)  console.log(`  rebate EV ........... ${fmt(r.rebateEV)}` + (r.expTrophies ? `  (+${r.expTrophies.toFixed(2)} trophies)` : ""));
        console.log(`  effective value ..... ${fmt(r.value)}`);
        console.log(`  mystic: guarantee ${(r.maxSlotMystic * 100).toFixed(1)}% (best slot) · volume ${r.expMystics.toFixed(2)}/pack → score ${r.mysticScore.toFixed(3)} → ×${r.mysticMult.toFixed(3)}`);
        console.log(`  ──> RECOMMENDED PRICE: ${fmt(r.price)}` + (p.price ? `   (current: ${fmt(p.price)}, ${(p.price / r.price * 100).toFixed(0)}%)` : "   (currently unpriced)"));
    }
} else {
    const rows = [["packID", "packName", "pool", "ROI%", "cardEV", "upgEV", "rebateEV", "value", "mysticX", "recommended", "current"]];
    for (const f of packFiles) {
        const id = f.replace(/\.json$/, ""), p = getPack(id);
        if (!p.packSequence) continue;
        const r = recommend(p);
        rows.push([id, `"${(p.packName || "").replace(/"/g, "'")}"`, r.filtered, (r.roi * 100).toFixed(1),
            Math.round(r.cardEV), Math.round(r.upgradeEV), Math.round(r.rebateEV), Math.round(r.value),
            r.mysticMult.toFixed(3), Math.round(r.price), p.price || ""]);
    }
    fs.writeFileSync("scripts/pack_prices.csv", rows.map(r => r.join(",")).join("\n") + "\n");
    console.log(`Priced ${rows.length - 1} packs → scripts/pack_prices.csv`);
}
