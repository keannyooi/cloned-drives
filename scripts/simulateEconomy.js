"use strict";

/**
 * PLAYER / ECONOMY SIMULATOR
 * ==========================
 * Simulates virtual players running the real gameplay loop headlessly (no Discord,
 * no Mongo) so you can watch the economy evolve over time: money supply, progression
 * speed, pack ROI, garage growth, streak walls.
 *
 * Where possible the bot's own pure modules are imported directly:
 *   - dataManager.js   (car/track/pack data)
 *   - calcTune.js      (tuned stats)
 *   - upgradePrice.js  (upgrade costs + sell prices)
 *   - consts.js        (weatherVars, hierarchies, starterGarage — pure data)
 *
 * Logic that lives inside Discord-coupled files is mirrored 1:1 below, each block
 * tagged "MIRRORS <file>" — if you rebalance the game, update the mirror too:
 *   - race score          mirrors src/util/functions/race.js (evalScore)
 *   - pack rolling        mirrors src/util/functions/openPack.js
 *   - random race gen     mirrors src/commands/randomrace.js (randomize/smartGen)
 *   - random race rewards mirrors src/commands/randomrace.js (win/loss handling)
 *   - daily rewards       mirrors src/commands/daily.js
 *   - req checking        mirrors src/util/functions/filterCheck.js (subset rr uses)
 *   - selling             mirrors src/commands/sell.js (bulk dupe sale, 20% refund)
 *   - BM car behavior     mirrors src/util/functions/createCar.js (BM cars race with
 *                         their reference car's stats/CR; only isBM=true differs)
 *   - black market shop   mirrors src/util/functions/regenBM.js (8 slots, trophy
 *                         prices by CR tier, 12h refresh → 2 catalogs/sim-day)
 *
 * Trophy income is NOT derivable from the simulated loop (it comes from events/PvP/
 * calendars/codes — admin content), so each persona has an abstract `trophiesPerDay`
 * knob representing their participation in that content.
 *
 * NOT simulated (admin-scheduled content): events, championships, PvP, pack battles,
 * dealership purchases, offers, trades.
 *
 * Usage:
 *   node simulateEconomy.js [--days 120] [--seed 1337] [--csv economy_sim.csv]
 */

const fs = require("fs");
const { initialize, getCar, getTrack, getPack, getCarFiles, getTrackFiles, getPackFiles } = require("../src/util/functions/dataManager.js");
const { calcTune } = require("../src/util/functions/calcTune.js");
const { getSellPrice, upgradeCost, costFromStock } = require("../src/util/functions/upgradePrice.js");
const ct = require("../src/util/functions/cardType.js");
const { driveHierarchy, gcHierarchy, weatherVars, starterGarage, DIAMONDS_ENABLED } = require("../src/util/consts/consts.js");

initialize("./src");

// ─── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function argVal(name, fallback) {
    const i = argv.indexOf(`--${name}`);
    if (i === -1 || i === argv.length - 1) return fallback;
    return argv[i + 1];
}
const DAYS = parseInt(argVal("days", "120"), 10);
const SEED = parseInt(argVal("seed", "1337"), 10);
const CSV_PATH = argVal("csv", "economy_sim.csv");

// ─── Seeded RNG (mulberry32) — per player, so personas don't perturb each other ──

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// ─── Static data pools ──────────────────────────────────────────────────────

const carFiles = getCarFiles();
const trackIDs = getTrackFiles().map(f => f.slice(0, 6));
const packIDs = getPackFiles().map(f => f.slice(0, 6));
const allCarIDs = carFiles.map(f => f.slice(0, 6));

// ─── Tuned stat cache (uses the game's own calcTune) ────────────────────────

// BM (black market) variants race entirely as their reference car — stats, CR,
// drivetrain, the lot — only isBM differs (worth +25% rr money). Same resolution
// the game uses (cardType.modifiedBase, incl. future per-card stat modifiers).
function effectiveCar(carID) {
    const car = getCar(carID);
    return car ? ct.modifiedBase(car) : car;
}

const tunedCache = new Map();
function getTuned(carID, tune) {
    const key = `${carID}|${tune}`;
    let hit = tunedCache.get(key);
    if (hit) return hit;
    const car = getCar(carID);
    const ref = effectiveCar(carID);
    const t = calcTune(ref, tune);
    hit = {
        carID,
        cr: ref.cr || 0,
        topSpeed: t.topSpeed,
        accel: t.accel,
        handling: t.handling,
        weight: t.weight,
        mra: t.mra,
        ola: t.ola,
        gc: ref.gc || "Medium",
        driveType: ref.driveType || "RWD",
        tyreType: ref.tyreType || "Standard",
        abs: ref.abs ? 1 : 0,
        tcs: ref.tcs ? 1 : 0,
        isBM: ct.isBMCar(car),
        isDiamond: ct.isDiamondCar(car)
    };
    tunedCache.set(key, hit);
    return hit;
}

// ─── Race scoring — MIRRORS race.js evalScore (v2.0 rebalanced) ─────────────

const ZERO_PENS = { drivePen: 0, absPen: 0, tcsPen: 0, tyrePen: {} };
const warnedWeather = new Set();

function evalScore(player, opponent, track) {
    const weatherKey = `${track.weather} ${track.surface}`;
    let pens = weatherVars[weatherKey];
    if (!pens) {
        if (!warnedWeather.has(weatherKey)) {
            console.warn(`(no weatherVars for "${weatherKey}", treating as neutral)`);
            warnedWeather.add(weatherKey);
        }
        pens = ZERO_PENS;
    }
    const { drivePen, absPen, tcsPen, tyrePen } = pens;

    let score = 0;
    score += (player.topSpeed - opponent.topSpeed) / 2 * (track.specsDistr.topSpeed / 100);
    score += (opponent.accel - player.accel) * 8 * (track.specsDistr["0to60"] / 100);
    score += (player.handling - opponent.handling) * 1.2 * (track.specsDistr.handling / 100);
    score += (opponent.weight - player.weight) / 30 * (track.specsDistr.weight / 100);
    score += (player.mra - opponent.mra) / 6 * (track.specsDistr.mra / 100);
    score += (opponent.ola - player.ola) / 10 * (track.specsDistr.ola / 100);

    if (player.gc.toLowerCase() === "low") score -= track.speedbumps * 10;
    if (opponent.gc.toLowerCase() === "low") score += track.speedbumps * 10;
    score += (gcHierarchy.indexOf(opponent.gc) - gcHierarchy.indexOf(player.gc)) * track.humps * 10;

    score += (driveHierarchy.indexOf(opponent.driveType) - driveHierarchy.indexOf(player.driveType)) * drivePen;
    score += (tyrePen[opponent.tyreType] || 0) - (tyrePen[player.tyreType] || 0);
    if (track.specsDistr.handling > 0) {
        score += (player.abs - opponent.abs) * absPen;
    }
    score += (player.tcs - opponent.tcs) * tcsPen;

    if (track.trackName.includes("MPH")) {
        let [startMPH, endMPH] = track.trackName.split("-");
        startMPH = parseInt(startMPH);
        endMPH = parseInt(endMPH);
        if ((opponent.topSpeed < startMPH && player.topSpeed >= startMPH) || (opponent.topSpeed < endMPH && player.topSpeed >= endMPH)) {
            score = 250;
        } else if ((opponent.topSpeed >= startMPH && player.topSpeed < startMPH) || (opponent.topSpeed >= endMPH && player.topSpeed < endMPH)) {
            score = -250;
        } else if (opponent.topSpeed < endMPH && player.topSpeed < endMPH) {
            score = player.topSpeed - opponent.topSpeed;
        }
    }

    return Math.round((score + Number.EPSILON) * 100) / 100;
}

// ─── Pack filter + roll — MIRRORS openPack.js ───────────────────────────────

function mergeFilters(base, override) {
    return { ...(base || {}), ...(override || {}) };
}

function filterCard(card, filter, filterLogic) {
    // obtainability enforced at the call site (mirrors openPack's converted shape)
    const useOrLogic = filterLogic === "or";
    for (const criteria in filter) {
        const filterVal = filter[criteria];
        if (filterVal === "None") continue;
        const cardVal = card[criteria];
        if (Array.isArray(filterVal)) {
            let cardArray = Array.isArray(cardVal) ? cardVal : cardVal ? [cardVal] : [];
            cardArray = cardArray.map(v => typeof v === "string" ? v.toLowerCase() : v);
            const filterArray = filterVal.map(v => typeof v === "string" ? v.toLowerCase() : v);
            if (useOrLogic) {
                if (!filterArray.some(fv => cardArray.includes(fv))) return false;
            } else {
                if (!filterArray.every(fv => cardArray.includes(fv))) return false;
            }
        } else if (typeof filterVal === "object" && filterVal !== null && "start" in filterVal && "end" in filterVal) {
            if (cardVal == null || cardVal < filterVal.start || cardVal > filterVal.end) return false;
        } else if (typeof filterVal === "string") {
            if (Array.isArray(cardVal)) {
                if (!cardVal.some(v => typeof v === "string" && v.toLowerCase() === filterVal.toLowerCase())) return false;
            } else if (typeof cardVal === "string") {
                if (cardVal.toLowerCase() !== filterVal.toLowerCase()) return false;
            } else {
                return false;
            }
        } else if (typeof filterVal === "boolean") {
            if (cardVal !== filterVal) return false;
        }
    }
    return true;
}

const poolCache = new Map();
function getFilteredPool(filter, filterLogic) {
    const key = `${filterLogic}|${JSON.stringify(filter)}`;
    let hit = poolCache.get(key);
    if (hit) return hit;

    const byRarity = { standard: [], common: [], uncommon: [], rare: [], epic: [], exotic: [], legendary: [], mystic: [], diamond: [] };
    for (const file of carFiles) {
        const car = getCar(file);
        if (ct.isDiamondCar(car)) {
            if (!ct.isDiamondRollable(car)) continue;
            if (filterCard(car, filter, filterLogic)) byRarity.diamond.push(file);
            continue;
        }
        if (!ct.isPackable(car)) continue;
        if (!filterCard(car, filter, filterLogic)) continue;
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
    hit = byRarity;
    poolCache.set(key, hit);
    return hit;
}

const RARITY_FALLBACK = ["mystic", "legendary", "exotic", "epic", "rare", "uncommon", "common", "standard"];

function pickRandomCar(pool, pulledIDs, noDuplicates, rng) {
    if (!pool || pool.length === 0) return null;
    if (noDuplicates) {
        const available = pool.filter(f => !pulledIDs.has(f.slice(0, 6)));
        if (available.length > 0) return available[Math.floor(rng() * available.length)];
    }
    return pool[Math.floor(rng() * pool.length)];
}

function pickWithFallback(byRarity, rolledRarity, pulledIDs, noDuplicates, rng) {
    const result = pickRandomCar(byRarity[rolledRarity], pulledIDs, noDuplicates, rng);
    if (result) return result;
    const idx = RARITY_FALLBACK.indexOf(rolledRarity);
    const lower = RARITY_FALLBACK.slice(idx + 1);
    const higher = RARITY_FALLBACK.slice(0, idx).reverse();
    const fallbackOrder = [];
    const maxLen = Math.max(lower.length, higher.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < lower.length) fallbackOrder.push(lower[i]);
        if (i < higher.length) fallbackOrder.push(higher[i]);
    }
    for (const rarity of fallbackOrder) {
        const fallback = pickRandomCar(byRarity[rarity], pulledIDs, noDuplicates, rng);
        if (fallback) return fallback;
    }
    return null;
}

const DIAMOND_BASELINE_CHANCE = 0.001;

function rollPack(pack, rng) {
    const filterLogic = pack.filterLogic || "and";
    const packFilter = pack.filter || {};
    const noDupes = pack.noDuplicates || false;
    const repetition = pack.repetition || 1;

    const slots = [];
    for (const slotDef of pack.packSequence) {
        let rates, slotFilter, rarityFilters = {};
        if (slotDef.rates) {
            rates = slotDef.rates;
            slotFilter = slotDef.filter ? mergeFilters(packFilter, slotDef.filter) : packFilter;
            if (slotDef.rarityFilters && typeof slotDef.rarityFilters === "object") {
                for (const [rarity, override] of Object.entries(slotDef.rarityFilters)) {
                    rarityFilters[rarity] = mergeFilters(slotFilter, override);
                }
            }
        } else {
            rates = { ...slotDef };
            slotFilter = packFilter;
        }
        for (let r = 0; r < repetition; r++) slots.push({ rates, filter: slotFilter, rarityFilters });
    }

    const addedCars = [];
    const pulledCarIDs = new Set();
    let diamondPulled = false;

    for (const { rates, filter, rarityFilters } of slots) {
        let chosenCarID = null;
        let chosenUpgrade = "000";
        let fromPool = false;

        if (DIAMONDS_ENABLED) {
            const diamondChance = (rates.diamond !== undefined) ? rates.diamond : DIAMOND_BASELINE_CHANCE;
            if (!diamondPulled && diamondChance > 0 && rng() * 100 < diamondChance) {
                const br = getFilteredPool(filter, filterLogic);
                if (br.diamond.length > 0) {
                    chosenCarID = pickRandomCar(br.diamond, pulledCarIDs, noDupes, rng);
                    if (chosenCarID) diamondPulled = true;
                }
            }
        }

        const rand = Math.floor(rng() * 1000) / 10;
        let check = 0;
        if (!chosenCarID) {
            for (const key of Object.keys(rates)) {
                if (key === "diamond") continue;
                if (key === "pool") {
                    for (const entry of rates.pool) {
                        check += entry.weight;
                        if (check > rand) {
                            chosenCarID = entry.carID;
                            chosenUpgrade = entry.upgrade || "000";
                            fromPool = true;
                            break;
                        }
                    }
                    if (chosenCarID) break;
                } else {
                    check += rates[key];
                    if (check > rand) {
                        const effectiveFilter = (rarityFilters && rarityFilters[key]) || filter;
                        const byRarity = getFilteredPool(effectiveFilter, filterLogic);
                        chosenCarID = pickWithFallback(byRarity, key, pulledCarIDs, noDupes, rng);
                        break;
                    }
                }
            }
        }
        if (!chosenCarID) {
            const byRarity = getFilteredPool(filter, filterLogic);
            chosenCarID = pickWithFallback(byRarity, "standard", pulledCarIDs, noDupes, rng);
        }
        if (!chosenCarID) return null;

        if (!fromPool && chosenUpgrade === "000" && pack.upgradeChance) {
            const upgradeRoll = rng() * 100;
            let upgradeCheck = 0;
            for (const [upg, chance] of Object.entries(pack.upgradeChance)) {
                upgradeCheck += chance;
                if (upgradeRoll < upgradeCheck) { chosenUpgrade = upg; break; }
            }
        }

        const carID = chosenCarID.slice(0, 6);
        addedCars.push({ carID, upgrade: chosenUpgrade });
        pulledCarIDs.add(carID);
    }
    return addedCars;
}

// ─── Pack EV (sell value), faithful to the un-normalized roll walk ──────────
// Like auditPackEconomy.js but models the actual cumulative roll: rates that sum
// under 100 leak the remainder into the standard-fallback bucket, rates over 100
// never reach their tail keys. Used by the "evRatio" shopping policy.

const avgSellCache = new Map();
function avgSellByRarity(filter, filterLogic) {
    const key = `${filterLogic}|${JSON.stringify(filter)}`;
    let hit = avgSellCache.get(key);
    if (hit) return hit;
    const byRarity = getFilteredPool(filter, filterLogic);
    hit = {};
    for (const rarity of RARITY_FALLBACK) {
        const pool = byRarity[rarity];
        if (!pool || pool.length === 0) continue;
        let sum = 0;
        for (const f of pool) sum += getSellPrice(getCar(f).cr);
        hit[rarity] = sum / pool.length;
    }
    avgSellCache.set(key, hit);
    return hit;
}

function rarityValueWithFallback(avg, rarity) {
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

const packEVCache = new Map();
function packSellEV(pack) {
    let hit = packEVCache.get(pack.packName);
    if (hit !== undefined) return hit;
    const filterLogic = pack.filterLogic || "and";
    const packFilter = pack.filter || {};
    const repetition = pack.repetition || 1;
    let total = 0;

    for (const slotDef of pack.packSequence) {
        let rates, slotFilter, rarityFilters = {};
        if (slotDef.rates) {
            rates = slotDef.rates;
            slotFilter = slotDef.filter ? mergeFilters(packFilter, slotDef.filter) : packFilter;
            if (slotDef.rarityFilters) {
                for (const [rarity, override] of Object.entries(slotDef.rarityFilters)) {
                    rarityFilters[rarity] = mergeFilters(slotFilter, override);
                }
            }
        } else {
            rates = { ...slotDef };
            slotFilter = packFilter;
        }
        const slotAvg = avgSellByRarity(slotFilter, filterLogic);

        let slotEV = 0;
        let check = 0;
        for (const key of Object.keys(rates)) {
            if (key === "diamond") continue;
            if (key === "pool") {
                for (const entry of rates.pool) {
                    const lo = Math.min(check, 100), hi = Math.min(check + entry.weight, 100);
                    check += entry.weight;
                    if (hi <= lo) continue;
                    const car = getCar(entry.carID);
                    slotEV += ((hi - lo) / 100) * (car ? getSellPrice(car.cr) : 0);
                }
            } else {
                const lo = Math.min(check, 100), hi = Math.min(check + rates[key], 100);
                check += rates[key];
                if (hi <= lo) continue;
                const avg = rarityFilters[key] ? avgSellByRarity(rarityFilters[key], filterLogic) : slotAvg;
                slotEV += ((hi - lo) / 100) * rarityValueWithFallback(avg, key);
            }
        }
        if (check < 100) {
            slotEV += ((100 - check) / 100) * rarityValueWithFallback(slotAvg, "standard");
        }
        total += slotEV * repetition;
    }
    packEVCache.set(pack.packName, total);
    return total;
}

// ─── Random race generation — MIRRORS randomrace.js randomize()/smartGen() ──

// smartGen() rejection-samples the full car list; precomputing each streak
// bracket's qualifying pool and picking uniformly gives the same distribution.
const rrBracketCache = new Map();
function rrOpponentPool(streak, isBoss) {
    const key = isBoss ? "boss" : (
        streak <= 5 ? "b1" :
        streak <= 15 ? "b2" :
        streak <= 30 ? "b3" :
        streak <= 49 ? "b4" :
        streak <= 74 ? "b5" :
        streak <= 99 ? "b6" :
        streak <= 124 ? "b7" :
        streak <= 175 ? "b8" : "b9");
    let pool = rrBracketCache.get(key);
    if (pool) return pool;
    pool = allCarIDs.filter(id => {
        const car = getCar(id);
        const cls = ct.rrOpponentClass(car);
        if (isBoss) return cls === "boss";
        if (cls !== "normal") return false;   // BM, diamonds, bosses — boss rounds only
        const cr = car.cr || 0;
        switch (key) {
            case "b1": return cr <= 499;
            case "b2": return cr >= 200 && cr <= 649;
            case "b3": return cr >= 300 && cr <= 649;
            case "b4": return cr >= 400 && cr <= 849;
            case "b5": return cr >= 549 && cr <= 990;
            case "b6": return cr >= 549;
            case "b7": return cr >= 799;
            case "b8": return cr >= 849;
            default: return cr >= 949;
        }
    });
    rrBracketCache.set(key, pool);
    return pool;
}

const RR_TUNES = ["000", "333", "666", "699", "969", "996"];

function rrGenerate(streak, rng) {
    const isBoss = streak === 50 || streak === 75 || streak === 100 || (streak > 100 && (streak - 100) % 5 === 0);
    const trackID = trackIDs[Math.floor(rng() * trackIDs.length)];

    const pool = rrOpponentPool(streak, isBoss);
    const opponentCarID = pool[Math.floor(rng() * pool.length)];
    const opponentCar = getCar(opponentCarID);

    const criteria = {};
    if (!isBoss) {
        if (streak > 75 && streak <= 175) {
            criteria.cr = { start: 1, end: opponentCar.cr + Math.floor(rng() * 6) + 30 };
            const reqs = ["bodyStyle", "seatCount", "modelYear"];
            const req = reqs[Math.floor(rng() * reqs.length)];
            let reqCar, attempts = 0;
            do {
                reqCar = getCar(carFiles[Math.floor(rng() * carFiles.length)]);
                attempts++;
            } while (reqCar.reference && attempts < 50);
            if (reqCar[req] !== undefined && reqCar[req] !== null) {
                switch (req) {
                    case "bodyStyle":
                        criteria[req] = Array.isArray(reqCar[req]) ? [reqCar[req][0].toLowerCase()] : [reqCar[req].toLowerCase()];
                        break;
                    case "seatCount":
                        criteria[req] = { start: reqCar[req], end: reqCar[req] + 1 };
                        break;
                    case "modelYear": {
                        const myStart = 1960 + (Math.floor(rng() * 6) * 10);
                        criteria[req] = { start: myStart, end: myStart + 10 };
                        break;
                    }
                }
            }
        } else if (streak > 175) {
            criteria.cr = { start: 1, end: opponentCar.cr + Math.floor(rng() * 6) + 20 };
            const reqs = ["make", "modelYear", "gc", "tags"];
            const req = reqs[Math.floor(rng() * reqs.length)];
            let reqCar, attempts = 0;
            do {
                reqCar = getCar(carFiles[Math.floor(rng() * carFiles.length)]);
                attempts++;
            } while (reqCar.reference && attempts < 50);
            if (reqCar[req] !== undefined && reqCar[req] !== null) {
                switch (req) {
                    case "make":
                    case "tags":
                        criteria[req] = Array.isArray(reqCar[req]) ? [reqCar[req][0].toLowerCase()] : [reqCar[req].toLowerCase()];
                        break;
                    case "gc":
                        criteria[req] = reqCar[req].toLowerCase();
                        break;
                    case "modelYear": {
                        const myStart = 1960 + (Math.floor(rng() * 12) * 5);
                        criteria[req] = { start: myStart, end: myStart + 5 };
                        break;
                    }
                }
            }
        }
    }

    const upgrade = RR_TUNES[Math.floor(rng() * 6)];
    return { opponent: { carID: opponentCarID, upgrade }, trackID, reqs: criteria, isBoss };
}

// Req checking — MIRRORS filterCheck.js semantics for the keys rr generates
// (cr/seatCount/modelYear ranges, bodyStyle/make/tags arrays with AND logic,
// gc string; all case-insensitive).
function reqCheck(car, reqs) {
    for (const [key, value] of Object.entries(reqs)) {
        if (Array.isArray(value)) {
            let checkArray = car[key];
            if (!Array.isArray(checkArray)) checkArray = [checkArray];
            checkArray = checkArray.map(t => t ? String(t).toLowerCase() : "");
            if (!value.every(tag => checkArray.includes(String(tag).toLowerCase()))) return false;
        } else if (typeof value === "object" && value !== null) {
            if (!(car[key] >= value.start && car[key] <= value.end)) return false;
        } else if (typeof value === "string") {
            const cv = car[key];
            if (Array.isArray(cv)) {
                if (!cv.some(e => typeof e === "string" && e.toLowerCase() === value.toLowerCase())) return false;
            } else if (typeof cv === "string") {
                if (cv.toLowerCase() !== value.toLowerCase()) return false;
            } else {
                return false;
            }
        }
    }
    return true;
}

// ─── Random race rewards — MIRRORS randomrace.js win/loss handling ──────────

const BOSS_BONUSES = { 51: 1000000, 76: 1500000, 101: 2500000, base: 500000, increment: 250000 };
const DOMINATION_TIERS = [
    { threshold: 100, multiplier: 0.6 },
    { threshold: 50, multiplier: 0.4 },
    { threshold: 20, multiplier: 0.15 }
];
const MILESTONE_BONUSES = { 10: 75000, 25: 250000, 150: 5000000, 200: 10000000 };
const LOSS_PROTECTION = { 100: 0.67, 50: 0.60, 25: 0.53, default: 0.49 };

// Deterministic part of a win's payout (everything except the 5% lucky roll).
// streak must already be incremented, exactly like the command does.
function winReward(streak, playerCar, opponentCar, score, isBossRound) {
    let reward = 0, crBonusBase = 0;
    if (streak <= 49) { reward = streak * 375 + 15000; crBonusBase = 375; }
    else if (streak <= 98) { reward = streak * 250 + 27000; crBonusBase = 1000; }
    else if (streak <= 198) { reward = streak * 100 + 100000; crBonusBase = 5000; }
    else { reward = streak * 100 + 125000; crBonusBase = 50000; }
    reward *= 2;

    let crBonus = 0;
    if (playerCar.cr - opponentCar.cr <= 30) {
        crBonus = (opponentCar.cr - playerCar.cr + 40) * crBonusBase;
    }

    const baseSubtotal = reward + crBonus;
    const bmBonus = playerCar.isBM ? Math.round(baseSubtotal / 4) : 0;
    const diamondBonus = (DIAMONDS_ENABLED && playerCar.isDiamond) ? baseSubtotal : 0;
    const subtotal = baseSubtotal + diamondBonus;

    let perfectBonus = 0;
    for (const tier of DOMINATION_TIERS) {
        if (score >= tier.threshold) { perfectBonus = Math.floor(subtotal * tier.multiplier); break; }
    }

    let bossBonus = 0;
    if (isBossRound) {
        if (BOSS_BONUSES[streak]) bossBonus = BOSS_BONUSES[streak];
        else if (streak > 101 && (streak - 101) % 5 === 0) {
            bossBonus = BOSS_BONUSES.base + Math.floor((streak - 101) / 5) * BOSS_BONUSES.increment;
        }
    }

    const milestoneBonus = MILESTONE_BONUSES[streak] || 0;

    return { reward, crBonus, bmBonus, subtotal, perfectBonus, bossBonus, milestoneBonus,
             deterministicTotal: subtotal + bmBonus + perfectBonus + bossBonus + milestoneBonus };
}

function lossKeep(streak) {
    if (streak >= 100) return LOSS_PROTECTION[100];
    if (streak >= 50) return LOSS_PROTECTION[50];
    if (streak >= 25) return LOSS_PROTECTION[25];
    return LOSS_PROTECTION.default;
}

// ─── Daily rewards — MIRRORS daily.js ───────────────────────────────────────

function getPackCategories(pack) {
    if (pack.categories) return pack.categories;
    const cats = [];
    if (pack.price) cats.push("normal");
    cats.push("daily", "event", "limited", "reward", "calendar");
    return cats;
}
function getPackTier(pack) {
    if (pack.tier) return pack.tier;
    const name = (pack.packName || "").toLowerCase();
    if (name.includes("elite")) return "elite";
    if (name.includes("booster")) return "booster";
    return "standard";
}
function weightedRandomPack(packs, rng) {
    const weighted = packs.map(id => ({ id, weight: getPack(id).weight || 10 }));
    const totalWeight = weighted.reduce((s, p) => s + p.weight, 0);
    let roll = rng() * totalWeight;
    for (const p of weighted) {
        roll -= p.weight;
        if (roll <= 0) return p.id;
    }
    return weighted[weighted.length - 1].id;
}

const dailyElitePackPool = packIDs.filter(id => {
    const pack = getPack(id);
    if (!getPackCategories(pack).includes("daily")) return false;
    if (getPackTier(pack) !== "elite") return false;
    if (!pack.categories && (pack.repetition || 1) > 1) return false;
    return true;
});
function dailyNormalPackPool(isPatron) {
    return packIDs.filter(id => {
        const pack = getPack(id);
        const tier = getPackTier(pack);
        if (!getPackCategories(pack).includes("daily")) return false;
        if (tier === "elite" && !isPatron) return false;
        if (tier === "booster") return false;
        if (!pack.categories && (pack.repetition || 1) > 1) return false;
        return true;
    });
}
const dailyGiftCarPool = allCarIDs.filter(id => {
    const car = getCar(id);
    return ct.inDailyGiftPool(car) && car.cr <= 699;
});

// ─── Shop: packs purchasable with money (same assumption as auditPackEconomy) ──

const shopPacks = packIDs.filter(id => {
    const pack = getPack(id);
    return typeof pack.price === "number" && pack.price > 0;
});

// ─── Black market — MIRRORS regenBM.js (trophy-priced BM variants) ──────────
// Tier table: (randNum tier, slot index < 4) → CR range of the *reference* car,
// trophy price formula. Listings reject prize refs, inactive variants, duplicates.

const BM_TIERS = [
    { max: 20, lo: [1, 99], hi: [100, 249], loPrice: r => 25 + Math.floor(r() * 10), hiPrice: r => 75 + Math.floor(r() * 25) },
    { max: 40, lo: [100, 249], hi: [250, 399], loPrice: r => 50 + Math.floor(r() * 25), hiPrice: r => 200 + Math.floor(r() * 100) },
    { max: 60, lo: [250, 399], hi: [550, 699], loPrice: r => 100 + Math.floor(r() * 50), hiPrice: r => 400 + Math.floor(r() * 150) },
    { max: 80, lo: [400, 549], hi: [700, 849], loPrice: r => 200 + Math.floor(r() * 100), hiPrice: r => 700 + Math.floor(r() * 300) },
    { max: 100, lo: [850, 999], hi: [850, 999], loPrice: r => 1600 + Math.floor(r() * 600), hiPrice: r => 1600 + Math.floor(r() * 600) }
];

const bmRangeCache = new Map();
function bmPoolForRange(crStart, crEnd) {
    const key = `${crStart}-${crEnd}`;
    let pool = bmRangeCache.get(key);
    if (pool) return pool;
    pool = allCarIDs.filter(id => {
        const car = getCar(id);
        if (!ct.inBMRotation(car)) return false;
        const ref = getCar(car.reference);
        if (!ref || ct.isPrizeLike(ref)) return false;
        return ref.cr >= crStart && ref.cr <= crEnd;
    });
    bmRangeCache.set(key, pool);
    return pool;
}

function regenBMCatalog(rng) {
    const catalog = [];
    for (let i = 0; i < 8; i++) {
        const randNum = Math.floor(rng() * 100);
        const tier = BM_TIERS.find(t => randNum < t.max);
        const [crStart, crEnd] = i < 4 ? tier.lo : tier.hi;
        const price = i < 4 ? tier.loPrice(rng) : tier.hiPrice(rng);
        const pool = bmPoolForRange(crStart, crEnd).filter(id => !catalog.some(c => c.carID === id));
        if (pool.length === 0) continue;
        catalog.push({ carID: pool[Math.floor(rng() * pool.length)], price });
    }
    return catalog;
}

// ─── The simulated player ───────────────────────────────────────────────────

const EARN_KEYS = ["daily", "rrBase", "rrCrBonus", "rrBmBonus", "rrDomination", "rrBoss", "rrMilestone", "rrLucky", "sells", "packBonus"];
const SPEND_KEYS = ["packs", "upgrades"];

class SimPlayer {
    constructor(name, policy) {
        this.name = name;
        this.policy = policy;
        this.rng = mulberry32(SEED ^ hashStr(name));
        this.money = 0;
        this.trophies = 0;
        // garage: carID -> upgrades count map, same shape the profile stores
        this.garage = new Map();
        for (const entry of starterGarage) {
            this.garage.set(entry.carID, { ...entry.upgrades });
        }
        this.rrStreak = 0;
        this.rrHighest = 0;
        this.dailyStreak = 0;
        this.lastDailyDay = -10;
        this.earned = Object.fromEntries(EARN_KEYS.map(k => [k, 0]));
        this.spent = Object.fromEntries(SPEND_KEYS.map(k => [k, 0]));
        this.stats = { races: 0, wins: 0, losses: 0, ties: 0, skips: 0, luckies: 0,
                       bossWins: 0, bossLosses: 0, packsBought: 0, packsFree: 0, copiesSold: 0, daysPlayed: 0,
                       trophiesEarned: 0, trophiesSpent: 0, bmCarsBought: 0 };
    }

    addCar(carID, upgrade) {
        let entry = this.garage.get(carID);
        if (!entry) {
            entry = { "000": 0, "333": 0, "666": 0, "996": 0, "969": 0, "699": 0 };
            this.garage.set(carID, entry);
        }
        entry[upgrade] = (entry[upgrade] || 0) + 1;
    }

    garageCopies() {
        let n = 0;
        for (const upgrades of this.garage.values()) {
            for (const c of Object.values(upgrades)) n += c;
        }
        return n;
    }

    netWorth() {
        let worth = this.money;
        for (const [carID, upgrades] of this.garage) {
            const car = getCar(carID);
            // diamond + BM cars are sell-protected → no liquidation value
            if (!car || ct.isDiamondCar(car) || ct.isBMCar(car)) continue;
            const base = getSellPrice(car.cr);
            for (const [tune, count] of Object.entries(upgrades)) {
                if (count <= 0) continue;
                const refund = car.cr > 1500 ? 0 : costFromStock(car.cr, tune) * 0.20;
                worth += count * (base + refund);
            }
        }
        return Math.round(worth);
    }

    bestCr() {
        let best = 0;
        for (const carID of this.garage.keys()) {
            const car = effectiveCar(carID);
            if (car && car.cr > best) best = car.cr;
        }
        return best;
    }

    // Candidate hands: every owned (car, tune) combo passing the race reqs.
    // Reqs are checked against the reference car for BM variants (MIRRORS
    // filterCheck.js bmReference behavior).
    *eligibleHands(reqs) {
        const hasReqs = Object.keys(reqs).length > 0;
        for (const [carID, upgrades] of this.garage) {
            const car = effectiveCar(carID);
            if (!car) continue;
            if (hasReqs && !reqCheck(car, reqs)) continue;
            for (const tune of RR_TUNES) {
                if ((upgrades[tune] || 0) > 0) yield { carID, tune, cr: car.cr || 0 };
            }
        }
    }

    // Skill policies:
    //  "best-cr"    — race your shiniest eligible car, no counter-picking
    //  "max-score"  — counter-pick for the safest win (test-race optimizer)
    //  "max-reward" — among winning picks, maximize the deterministic payout
    //                 (low-CR underdog bonus + domination tier trade-off)
    pickHand(opponentStats, track, reqs, streakAfterWin, isBoss) {
        const skill = this.policy.skill;
        let best = null;

        if (skill === "best-cr") {
            for (const cand of this.eligibleHands(reqs)) {
                if (!best || cand.cr > best.cr) best = cand;
                else if (best && cand.carID === best.carID && cand.cr === best.cr) {
                    // among tunes of the same car, keep the higher tune sum
                    if (cand.tune > best.tune) best = cand;
                }
            }
            if (!best) return null;
            const stats = getTuned(best.carID, best.tune);
            return { ...best, score: evalScore(stats, opponentStats, track), stats };
        }

        let bestMetric = -Infinity;
        for (const cand of this.eligibleHands(reqs)) {
            const stats = getTuned(cand.carID, cand.tune);
            const score = evalScore(stats, opponentStats, track);
            let metric;
            if (skill === "max-reward") {
                metric = score > 0
                    ? 1e12 + winReward(streakAfterWin, stats, opponentStats, score, isBoss).deterministicTotal
                    : score;
            } else {
                metric = score;
            }
            if (metric > bestMetric) {
                bestMetric = metric;
                best = { ...cand, score, stats };
            }
        }
        return best;
    }

    playRandomRace() {
        const { opponent, trackID, reqs, isBoss } = rrGenerate(this.rrStreak, this.rng);
        const track = getTrack(trackID);
        const opponentStats = getTuned(opponent.carID, opponent.upgrade);

        const hand = this.pickHand(opponentStats, track, reqs, this.rrStreak + 1, isBoss);
        if (!hand) {
            // nothing in the garage meets the reqs — skip resets the streak
            this.rrStreak = 0;
            this.stats.skips++;
            return;
        }

        this.stats.races++;
        const score = hand.score;

        if (score > 0) {
            this.rrStreak++;
            const r = winReward(this.rrStreak, hand.stats, opponentStats, score, isBoss);
            let eventBonus = 0;
            if (this.rng() < 0.05 && this.rrStreak >= 5) {
                eventBonus = Math.floor(r.subtotal * 0.5);
                this.stats.luckies++;
            }
            this.money += r.deterministicTotal + eventBonus;
            this.earned.rrBase += r.reward;
            this.earned.rrCrBonus += r.crBonus;
            this.earned.rrBmBonus += r.bmBonus;
            this.earned.rrDomination += r.perfectBonus;
            this.earned.rrBoss += r.bossBonus;
            this.earned.rrMilestone += r.milestoneBonus;
            this.earned.rrLucky += eventBonus;
            this.stats.wins++;
            if (isBoss) this.stats.bossWins++;
            if (this.rrStreak > this.rrHighest) this.rrHighest = this.rrStreak;
        } else if (score < 0) {
            this.rrStreak = Math.floor(this.rrStreak * lossKeep(this.rrStreak));
            this.stats.losses++;
            if (isBoss) this.stats.bossLosses++;
        } else {
            this.stats.ties++;
        }
    }

    claimDaily(day, openPackFn) {
        if (day - this.lastDailyDay < 1) return;
        this.dailyStreak = (day - this.lastDailyDay > 1) ? 1 : this.dailyStreak + 1;
        this.lastDailyDay = day;

        if (this.dailyStreak % 20 === 0) {
            if (dailyElitePackPool.length > 0) {
                const packID = weightedRandomPack(dailyElitePackPool, this.rng);
                openPackFn(getPack(packID), true);
            }
        } else if (this.dailyStreak % 7 === 0) {
            const pool = dailyNormalPackPool(this.policy.isPatron);
            if (pool.length > 0) {
                const packID = weightedRandomPack(pool, this.rng);
                openPackFn(getPack(packID), true);
            }
        } else if (this.dailyStreak % 5 === 0) {
            const carID = dailyGiftCarPool[Math.floor(this.rng() * dailyGiftCarPool.length)];
            this.addCar(carID, "000");
        }

        let moneyReward = 7500 + ((this.dailyStreak - 1) * 4000);
        if (this.policy.isPatron) moneyReward *= 1.5;
        this.money += moneyReward;
        this.earned.daily += moneyReward;
    }

    openPack(pack, isFree) {
        const pulled = rollPack(pack, this.rng);
        if (!pulled) return false;
        for (const { carID, upgrade } of pulled) this.addCar(carID, upgrade);
        if (pack.bonusRewards) {
            if (pack.bonusRewards.money) {
                this.money += pack.bonusRewards.money;
                this.earned.packBonus += pack.bonusRewards.money;
            }
            if (pack.bonusRewards.trophies) this.trophies += pack.bonusRewards.trophies;
        }
        if (isFree) this.stats.packsFree++;
        return true;
    }

    shopPacks() {
        const strat = this.policy.packStrategy;
        if (strat === "none") return;
        for (let bought = 0; bought < this.policy.maxPacksPerDay; bought++) {
            const affordable = shopPacks.filter(id => {
                const p = getPack(id);
                return this.money - p.price >= this.policy.moneyReserve;
            });
            if (affordable.length === 0) return;
            let packID;
            if (strat === "evRatio") {
                packID = affordable.reduce((best, id) => {
                    const ratio = packSellEV(getPack(id)) / getPack(id).price;
                    return (!best || ratio > best.ratio) ? { id, ratio } : best;
                }, null).id;
            } else if (strat === "priciest") {
                // power acquisition: expensive packs carry the mystic-heavy pools
                packID = affordable.reduce((best, id) =>
                    (!best || getPack(id).price > getPack(best).price) ? id : best, null);
            } else {
                packID = affordable[Math.floor(this.rng() * affordable.length)];
            }
            const pack = getPack(packID);
            this.money -= pack.price;
            this.spent.packs += pack.price;
            this.stats.packsBought++;
            this.openPack(pack, false);
        }
    }

    // Bulk dupe sale — like cd-sell's dupes mode: only stock (000) copies are sold,
    // upgraded copies are protected, blocked while the garage holds ≤ 5 cars.
    sellDupes() {
        if (this.policy.keepCopies === Infinity) return;
        if (this.garage.size <= 5) return;
        for (const [carID, upgrades] of this.garage) {
            const car = getCar(carID);
            if (!car || ct.isDiamondCar(car) || ct.isBMCar(car) || ct.hasType(car, "BOSS")) continue;
            const extra = (upgrades["000"] || 0) - this.policy.keepCopies;
            if (extra <= 0) continue;
            const proceeds = extra * getSellPrice(car.cr);
            upgrades["000"] -= extra;
            this.money += proceeds;
            this.earned.sells += proceeds;
            this.stats.copiesSold += extra;
        }
    }

    // Spend trophies at the black market. The shop refreshes every 12h, so a
    // logged-in player sees two catalogs per day. Strategies:
    //   "top" — save for big-ticket listings (price ≥ bmMinPrice), buy priciest
    //   "all" — sweep every affordable listing not yet owned (BM cars are
    //           permanent +25% rr-money assets, cheap ones are great underdogs)
    shopBM() {
        const strat = this.policy.bmStrategy;
        if (!strat || strat === "none") return;
        for (let refresh = 0; refresh < 2; refresh++) {
            const catalog = regenBMCatalog(this.rng)
                .filter(l => !this.garage.has(l.carID))
                .sort((a, b) => b.price - a.price);
            for (const listing of catalog) {
                if (strat === "top" && listing.price < (this.policy.bmMinPrice || 0)) continue;
                if (this.trophies < listing.price) continue;
                this.trophies -= listing.price;
                this.stats.trophiesSpent += listing.price;
                this.stats.bmCarsBought++;
                this.addCar(listing.carID, "000");
                if (strat === "top") break;
            }
        }
    }

    // Convert stock copies of the top-CR cars into the persona's target tunes.
    doUpgrades() {
        const targets = this.policy.tuneTargets;
        if (!targets || targets.length === 0) return;
        const top = [...this.garage.entries()]
            .map(([carID, upgrades]) => ({ carID, upgrades, cr: effectiveCar(carID)?.cr || 0 }))
            .sort((a, b) => b.cr - a.cr)
            .slice(0, this.policy.upgradeTopN);
        for (const { carID, upgrades, cr } of top) {
            for (const target of targets) {
                if ((upgrades[target] || 0) > 0) continue;
                if ((upgrades["000"] || 0) <= 0) break;
                const cost = upgradeCost(cr, "000", target);
                if (this.money - cost < this.policy.moneyReserve) break;
                this.money -= cost;
                this.spent.upgrades += cost;
                upgrades["000"]--;
                upgrades[target] = (upgrades[target] || 0) + 1;
            }
        }
    }

    liveDay(day) {
        if (this.rng() > this.policy.loginChance) return false;
        this.stats.daysPlayed++;
        // abstract trophy income from events/PvP/calendars (not simulated directly)
        const t = this.policy.trophiesPerDay || 0;
        this.trophies += t;
        this.stats.trophiesEarned += t;
        this.claimDaily(day, (pack, free) => this.openPack(pack, free));
        for (let i = 0; i < this.policy.racesPerDay; i++) this.playRandomRace();
        this.sellDupes();
        this.shopPacks();
        this.shopBM();
        this.sellDupes();
        this.doUpgrades();
        return true;
    }
}

// ─── Personas ───────────────────────────────────────────────────────────────

const PERSONAS = {
    "Casual Carl": {
        desc: "logs in most days, ~20 races with his best car, never shops",
        loginChance: 0.8,
        racesPerDay: 20,
        skill: "best-cr",
        packStrategy: "none",
        maxPacksPerDay: 0,
        moneyReserve: 0,
        keepCopies: Infinity,     // never sells
        tuneTargets: ["666"],
        upgradeTopN: 1,
        trophiesPerDay: 0,        // doesn't touch event/PvP content
        bmStrategy: "none",
        isPatron: false
    },
    "Regular Rita": {
        desc: "daily player, 80 counter-picked races, packs + saves trophies for big BM cars",
        loginChance: 1,
        racesPerDay: 80,
        skill: "max-score",
        packStrategy: "random",
        maxPacksPerDay: 1,
        moneyReserve: 150000,
        keepCopies: 2,
        tuneTargets: ["996", "969"],
        upgradeTopN: 3,
        trophiesPerDay: 40,       // moderate event/PvP participation
        bmStrategy: "top",
        bmMinPrice: 400,          // only mid-tier+ listings are worth her trophies
        isPatron: false
    },
    "Grinder Greta": {
        desc: "lives at streak 100+: 250 reward-maximal races, sweeps the BM, sells dupes",
        loginChance: 1,
        racesPerDay: 250,
        skill: "max-reward",
        packStrategy: "priciest",
        maxPacksPerDay: 10,
        moneyReserve: 2000000,
        keepCopies: 1,
        tuneTargets: ["996", "969", "699"],
        upgradeTopN: 12,
        trophiesPerDay: 120,      // heavy event/PvP participation
        bmStrategy: "all",
        isPatron: false
    }
};

// ─── Run ────────────────────────────────────────────────────────────────────

console.log(`\nCLONED DRIVES ECONOMY SIMULATOR — ${DAYS} days, seed ${SEED}`);
console.log(`${allCarIDs.length} cars, ${trackIDs.length} tracks, ${shopPacks.length} priced packs in shop\n`);

const players = Object.entries(PERSONAS).map(([name, policy]) => new SimPlayer(name, policy));
const csvRows = ["day,persona,money,netWorth,garageCars,garageCopies,bestCr,rrStreak,races,wins,losses,skips,earnedTotal,spentTotal,trophies,bmCars"];
const SNAPSHOT_DAYS = new Set([1, 7, 14, 30, 60, 90, 120, 150, 180, 240, 300, 365].filter(d => d <= DAYS));
if (!SNAPSHOT_DAYS.has(DAYS)) SNAPSHOT_DAYS.add(DAYS);

const startTime = Date.now();
for (let day = 1; day <= DAYS; day++) {
    for (const p of players) {
        const racesBefore = p.stats.races, winsBefore = p.stats.wins,
              lossesBefore = p.stats.losses, skipsBefore = p.stats.skips;
        p.liveDay(day);
        const earnedTotal = Object.values(p.earned).reduce((a, b) => a + b, 0);
        const spentTotal = Object.values(p.spent).reduce((a, b) => a + b, 0);
        csvRows.push([
            day, JSON.stringify(p.name), p.money, p.netWorth(), p.garage.size, p.garageCopies(), p.bestCr(),
            p.rrStreak, p.stats.races - racesBefore, p.stats.wins - winsBefore,
            p.stats.losses - lossesBefore, p.stats.skips - skipsBefore, earnedTotal, spentTotal,
            p.trophies, p.stats.bmCarsBought
        ].join(","));
    }
    if (SNAPSHOT_DAYS.has(day)) {
        console.log(`── Day ${day} ${"─".repeat(70 - String(day).length)}`);
        for (const p of players) {
            console.log(`  ${p.name.padEnd(14)} money $${p.money.toLocaleString().padStart(13)} | worth $${p.netWorth().toLocaleString().padStart(14)} | garage ${String(p.garage.size).padStart(4)} cars | best CR ${String(p.bestCr()).padStart(4)} | streak ${String(p.rrStreak).padStart(3)} (hi ${p.rrHighest})`);
        }
    }
}
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// ─── Final report ───────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(78)}`);
console.log("FINAL REPORT");
console.log("═".repeat(78));

for (const p of players) {
    const earnedTotal = Object.values(p.earned).reduce((a, b) => a + b, 0);
    const spentTotal = Object.values(p.spent).reduce((a, b) => a + b, 0);
    const s = p.stats;
    const winRate = s.races > 0 ? (100 * s.wins / s.races).toFixed(1) : "0.0";
    const fmt = n => "$" + Math.round(n).toLocaleString();

    console.log(`\n▌ ${p.name} — ${p.policy.desc}`);
    console.log(`  played ${s.daysPlayed}/${DAYS} days | ${s.races} races: ${s.wins}W ${s.losses}L ${s.ties}T ${s.skips} skips (${winRate}% win)`);
    console.log(`  streak: ${p.rrStreak} now, ${p.rrHighest} peak | bosses ${s.bossWins}W/${s.bossLosses}L | lucky races ${s.luckies}`);
    console.log(`  money ${fmt(p.money)} | net worth ${fmt(p.netWorth())} | garage ${p.garage.size} cars / ${p.garageCopies()} copies | best CR ${p.bestCr()}`);
    console.log(`  EARNED ${fmt(earnedTotal)}:`);
    console.log(`    daily ${fmt(p.earned.daily)} | rr base ${fmt(p.earned.rrBase)} | cr bonus ${fmt(p.earned.rrCrBonus)} | bm bonus ${fmt(p.earned.rrBmBonus)} | domination ${fmt(p.earned.rrDomination)}`);
    console.log(`    boss ${fmt(p.earned.rrBoss)} | milestones ${fmt(p.earned.rrMilestone)} | lucky ${fmt(p.earned.rrLucky)} | car sales ${fmt(p.earned.sells)} | pack bonus ${fmt(p.earned.packBonus)}`);
    console.log(`  SPENT ${fmt(spentTotal)}: packs ${fmt(p.spent.packs)} (${s.packsBought} bought, ${s.packsFree} free) | upgrades ${fmt(p.spent.upgrades)}`);
    console.log(`  TROPHIES: earned ${s.trophiesEarned.toLocaleString()} | spent ${s.trophiesSpent.toLocaleString()} | held ${p.trophies.toLocaleString()} | BM cars owned ${s.bmCarsBought}`);
    console.log(`  → printed ${fmt((earnedTotal - p.earned.sells))} new money, destroyed ${fmt(spentTotal)} (net +${Math.round((earnedTotal - spentTotal) / Math.max(1, s.daysPlayed)).toLocaleString()}/day played)`);
}

// Money supply view: shop sell-backs create money too (the shop pays the player),
// pack prices and upgrade fees destroy it.
let created = 0, destroyed = 0;
for (const p of players) {
    created += Object.values(p.earned).reduce((a, b) => a + b, 0);
    destroyed += Object.values(p.spent).reduce((a, b) => a + b, 0);
}
console.log(`\n${"═".repeat(78)}`);
console.log(`MONEY SUPPLY (all ${players.length} players over ${DAYS} days)`);
console.log(`  created  $${created.toLocaleString()}   (faucets: daily, races, sell-backs, pack bonuses)`);
console.log(`  destroyed $${destroyed.toLocaleString()}   (sinks: pack prices, upgrade fees)`);
console.log(`  net inflation $${(created - destroyed).toLocaleString()}  (${(100 * destroyed / Math.max(1, created)).toFixed(1)}% of faucet output recaptured)`);
console.log(`\nNot modeled: events/championships/PvP/pack battles (admin-configured rewards —`);
console.log(`their trophy payouts are abstracted as each persona's trophiesPerDay knob),`);
console.log(`dealership purchases, offers, trades, fusing (disabled in-game).`);

fs.writeFileSync(CSV_PATH, csvRows.join("\n"));
console.log(`\nPer-day data written to ${CSV_PATH} (${csvRows.length - 1} rows) — sim took ${elapsed}s\n`);
