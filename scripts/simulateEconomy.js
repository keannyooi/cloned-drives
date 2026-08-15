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
 *   - RACE WEEK model     mirrors src/commands/randomrace.js (generateMatchup /
 *                         computeWinPayout) — tuning imported DIRECTLY from
 *                         src/util/consts/raceWeek.js (ECON/DIFFICULTY/
 *                         BOSS_GATES/FILLER_25/EVENTS), so consts rebalances
 *                         propagate automatically; only the behavior around
 *                         them (skill/margin/skip models) lives here
 *   - LEGACY streak rr    mirrors the PRE-Race-Week randomrace.js
 *                         (randomize/smartGen + win/loss streak handling).
 *                         The live command was REPLACED by Race Week; the
 *                         legacy mirror is kept as the --raceweek "live rr"
 *                         T1 baseline and for the day-loop personas (not yet
 *                         ported to weekly cadence)
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
// Race Week single source of truth (pure data module — safe to import headless)
const {
    ECON: RW_ECON, DIFFICULTY: RW_DIFFICULTY, BOSS_GATES: RW_BOSS_GATE_LIST,
    FILLER_25: RW_FILLER_25, REQ_POOLS: RW_REQ_POOLS, EVENTS: RW_EVENTS
} = require("../src/util/consts/raceWeek.js");

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

// ─── LEGACY streak-rr generation — mirrors the PRE-Race-Week randomrace.js ──
// (randomize()/smartGen()). The live command was REPLACED by Race Week
// (generateMatchup + DIFFICULTY bands — see the RACE WEEK MODEL section below).
// Kept: the --raceweek run uses this as its "live rr" T1 baseline, and the
// day-loop personas still race on it (not yet ported to weekly cadence).

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

// ─── LEGACY streak-rr rewards — mirrors the PRE-Race-Week randomrace.js ─────
// win/loss streak handling. REPLACED live by computeWinPayout() (mirrored in
// rwWinPay below with consts from raceWeek.js ECON). Kept for the T1 baseline
// and the day-loop personas.

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

// ═════════════════════════════════════════════════════════════════════════════
// RACE WEEK MODEL — MIRRORS THE SHIPPED IMPLEMENTATION
//   matchup/payout: src/commands/randomrace.js (generateMatchup/computeWinPayout)
//   tuning consts:  src/util/consts/raceWeek.js (imported directly — ECON,
//                   DIFFICULTY, BOSS_GATES, REQ_POOLS, FILLER_25, EVENTS)
//   event layer:    src/util/functions/raceWeekEvents.js (EV approximation)
// ═════════════════════════════════════════════════════════════════════════════
// Weekly-cadence economy: flat per-win pay + clamped CR bonus, no decay, losses
// cost nothing, instant threshold ladder, difficulty plateau at 150 wins. This
// section does NOT touch the LEGACY streak-rr mirror above — that is reused
// unchanged as the "live rr" baseline for target T1.
//
// Run:  node scripts/simulateEconomy.js --raceweek
//       [--rwflat N] [--rwcrb N] [--rwclamp N] [--rwm25 N] [--rwtrials N]
//       (CLI overrides are what-if levers; defaults = the SHIPPED consts)
// Writes tuned constants + results to scripts/raceweek_tuning.json.
//
// Per-race outcome model (not closed-form):
//  - opponent CR drawn from real catalog cars ("normal" rr class) inside the
//    SHIPPED DIFFICULTY band for the player's current weeklyWins; boss gates
//    (BOSS_GATES — the car rungs 50/100/150/1000) draw from the real boss pool.
//  - req cadence per band (SHIPPED reqMode): none | crCap | soft | hard |
//    twist. crCap caps the HAND at oppCR + crCapSlack + rand(0..5) (mirrors
//    generateReqs). soft/hard/twist-req rounds carry a property req the
//    garage may not satisfy → per-archetype skip chance (reqSkip knob).
//    twist rounds are 50% property-req / 50% crMax (REQ_POOLS.twist shape):
//    crMax caps the hand at 350/400/450 — a forced deep-underdog round where
//    counted crDiff sits at the clamp for everyone.
//  - skips: ECON.skipFreePerDay free per UTC day (modeled as ×7 per week),
//    then ECON.skipFee each. Skips are not races; fees drain cash.
//  - player CR choice per archetype: counter-pickers race oppCR + N(deltaMean,
//    deltaSd) capped at their best car AND the hand CR cap; casuals race
//    their best car under the cap.
//  - win prob = archetype-skill base for the band, shifted 0.4%/CR of hand
//    delta (clamped 5–97%). Casual best-car play uses the base only (they
//    don't test-race; being outgunned still hurts them: min(0, shift)).
//    twist-crMax rounds use the band base UNSHIFTED (free deterministic Test
//    Race lets players pre-verify a winning cheap hand — verifier-measured
//    ~93% toolkit coverage; unfindable winners fold into the base loss rate)
//    with marginMean 50 (verifier-observed underdog domination uplift) and
//    isBM=false (cheap sub-450 toolkits are non-BM).
//  - win margin (for domination tiers) ~ Exponential(mean 20 + 0.25*delta,
//    clamped 8–120): stronger hands dominate, underdog wins are squeakers.
//  - payout mirrors computeWinPayout EXACTLY: card-type money bonus
//    (rrMoneyBonusPct — BM +25%, Diamond +100% gated by DIAMONDS_ENABLED)
//    joins the subtotal BEFORE domination/lucky (shipped stacking), then
//    domination tiers on the margin, then the lucky roll.

// Tuned 2026-07-20, REVISED same day after adversarial refutation of T4:
// race outcomes in race.js are DETERMINISTIC (evalScore, zero RNG) and Test
// Race is free/unlimited, so the 0.4%/CR win-prob slope does not bind a
// strategic player — a ~25-car cheap toolkit (non-prize, CR 1–556, all
// buyable) test-verifies deep-underdog wins at ~93% winrate against the real
// plateau catalog. Under the old unclamped (oppCR−playerCR+40)×CBB formula
// that farmed 2.15x honest $/win and blew T2 (~$63–69M nolife week). The
// validated fix: COUNTED crDiff is clamped at +CR_DIFF_CLAMP (default +40),
// bounding crBonus at (clamp+40)×CBB regardless of how deep the underdog hand
// is. (+60 — the verifiers' example value — fails the paranoid exploit bound
// at 1.28x; +40 holds at 1.23x worst-case.) Other constants unchanged:
// FLAT_BASE 24000, CR_BONUS_BASE 65 (FIXED), MILESTONE_MONEY_25 750000 →
// nolife 1000-win week ≈ $33.8M (T2 25–35M), casual 50-win ≈ $2.33M (T3
// ≥1.5M). T4 now checked two ways: (a) in-model farm sweep extended to delta
// −300 (flattens at +4.8% under the clamp), (b) deterministic toolkit-exploit
// check calibrated to the verifiers' measurements. T1 (150-win
// ≈ live rr) remains structurally unreachable under the T2 cap: live rr pays
// ~$14.7M for the same 192 races — that faucet is what Race Week deliberately
// shrinks (150-win week lands at ~38% of live).
// SHIPPED 2026-07-20 as ECON/FILLER_25 in src/util/consts/raceWeek.js — the
// defaults below read the shipped consts, so a rebalance there flows through
// this model automatically (CLI flags remain as what-if overrides).
const RW_TUNE = {
    FLAT_BASE: parseInt(argVal("rwflat", String(RW_ECON.flatBase)), 10),
    CR_BONUS_BASE: parseInt(argVal("rwcrb", String(RW_ECON.crBonusBase)), 10),   // FIXED — never streak/win-scaled
    CR_DIFF_CLAMP: parseInt(argVal("rwclamp", String(RW_ECON.crDiffClamp)), 10), // counted (oppCR−playerCR) caps here
    // money portion of the 25-win rung (FILLER_25 — money-only since the fuse purge)
    MILESTONE_MONEY_25: parseInt(argVal("rwm25", String(RW_FILLER_25.money)), 10)
};
const RW_TRIALS = parseInt(argVal("rwtrials", "60"), 10);
const RW_BOSS_GATES = new Set(RW_BOSS_GATE_LIST);

// Difficulty schedule: the SHIPPED DIFFICULTY bands, used directly
// ({ min, max, oppCrMin, oppCrMax, reqMode, crCapSlack }).
function rwBandFor(wins) {
    return RW_DIFFICULTY.find(b => wins >= b.min && wins <= b.max) || RW_DIFFICULTY[RW_DIFFICULTY.length - 1];
}
// BM/Diamond win-bonus % pulled from the real cardType behavior matrix
// (mirrors computeWinPayout's rrMoneyBonusPct(rawHandCar) call).
const RW_BM_PCT = ct.rrMoneyBonusPct({ cardType: ["ABM"] });
const RW_DIAMOND_PCT = ct.rrMoneyBonusPct({ cardType: ["Diamond"] });
// Free skips modeled per week (ECON.skipFreePerDay × 7 UTC days).
const RW_FREE_SKIPS_PER_WEEK = RW_ECON.skipFreePerDay * 7;

// Archetypes: wins are the weekly target; races emerge from simulated losses.
// winBase = honest win prob per DIFFICULTY band index (loss rates ~5–20%).
// reqSkip = [softChance, hardChance]: chance a property-req round (soft/hard,
// and the property half of twist at the hard rate) doesn't fit the garage or
// the player's patience and gets skipped instead of raced.
const RW_ARCHETYPES = {
    casual:  { targetWins: 50,   bestCr: 650,  deltaMean: null, deltaSd: 0,  winBase: [0.92, 0.90, 0.88, 0.85, 0.82, 0.82], bossWin: 0.70, bmFrac: 0.00, reqSkip: [0.25, 0.40] },
    solid:   { targetWins: 150,  bestCr: 800,  deltaMean: 15,   deltaSd: 10, winBase: [0.94, 0.92, 0.90, 0.86, 0.82, 0.82], bossWin: 0.80, bmFrac: 0.15, reqSkip: [0.15, 0.25] },
    grinder: { targetWins: 300,  bestCr: 900,  deltaMean: 10,   deltaSd: 10, winBase: [0.95, 0.93, 0.92, 0.89, 0.85, 0.85], bossWin: 0.85, bmFrac: 0.30, reqSkip: [0.10, 0.18] },
    heavy:   { targetWins: 500,  bestCr: 950,  deltaMean: 8,    deltaSd: 10, winBase: [0.96, 0.94, 0.93, 0.90, 0.87, 0.87], bossWin: 0.90, bmFrac: 0.45, reqSkip: [0.08, 0.14] },
    nolife:  { targetWins: 1000, bestCr: 1000, deltaMean: 5,    deltaSd: 8,  winBase: [0.97, 0.95, 0.94, 0.91, 0.88, 0.88], bossWin: 0.92, bmFrac: 0.60, reqSkip: [0.06, 0.10] }
};

function rwClamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function rwGauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Opponent CR pools: real catalog cars, rr "normal" class, banded by CR.
const rwCrPoolCache = new Map();
function rwCrPool(lo, hi) {
    const key = `${lo}-${hi}`;
    let pool = rwCrPoolCache.get(key);
    if (pool) return pool;
    pool = [];
    for (const id of allCarIDs) {
        const car = getCar(id);
        if (ct.rrOpponentClass(car) !== "normal") continue;
        const cr = car.cr || 0;
        if (cr >= lo && cr <= hi) pool.push(cr);
    }
    rwCrPoolCache.set(key, pool);
    return pool;
}
// Boss pool via the legacy helper — the boss-class test (rrOpponentClass ===
// "boss") is identical in the shipped generateMatchup's rejectOpponent.
const rwBossCrs = rrOpponentPool(0, true).map(id => getCar(id).cr || 0);

// Race Week per-win payout — MIRRORS computeWinPayout() in randomrace.js
// (constants default to the shipped ECON; bonusPct is the cardType
// rrMoneyBonusPct of the hand: 0 normal, +25 BM, +100 Diamond when enabled).
function rwWinPay(playerCr, oppCr, bonusPct, margin, rng) {
    let crBonus = 0;
    if (playerCr - oppCr <= RW_ECON.crBonusEligibleDiff) {
        // Counted crDiff is CLAMPED: deep-underdog hands (test-verified wins are
        // deterministic + free, so they're always available) can never pay more
        // than (clamp+40)*CBB. Unclamped, this formula was farmable to 2.15x
        // honest $/win — see header note / raceweek_tuning.json exploitCheck.
        const counted = Math.min(oppCr - playerCr, RW_TUNE.CR_DIFF_CLAMP);
        crBonus = (counted + 40) * RW_TUNE.CR_BONUS_BASE;
    }
    const baseSubtotal = RW_TUNE.FLAT_BASE + crBonus;
    const cardBonus = Math.round(baseSubtotal * bonusPct / 100);
    // SHIPPED stacking: the card bonus joins the subtotal BEFORE domination and
    // lucky are computed (the legacy mirror added BM outside that base).
    const subtotal = baseSubtotal + cardBonus;
    let domBonus = 0;
    for (const tier of RW_ECON.dominationTiers) {
        if (margin >= tier.threshold) { domBonus = Math.floor(subtotal * tier.multiplier); break; }
    }
    const lucky = rng() < RW_ECON.luckyChance ? Math.floor(subtotal * RW_ECON.luckyMult) : 0;
    return { total: subtotal + domBonus + lucky, crBonus, subtotal };
}

// One simulated Race Week for one archetype.
// opts: { farmDelta, diamond, exploit: { pWin, marginMean, bmFrac } }.
// exploit models the DETERMINISTIC toolkit strategy (race outcomes have no
// RNG; Test Race is free): the player always fields a deep-underdog hand
// whose win was test-verified, so pWin is a flat toolkit-coverage rate (not
// slope-derived) and counted crBonus is always at the clamp.
function rwSimWeek(arch, opts, rng) {
    let wins = 0, losses = 0, races = 0, cash = 0, crBonusCash = 0, subtotalCash = 0;
    let skips = 0, skipFees = 0;
    const MAX_STEPS = 40000;
    for (let step = 0; step < MAX_STEPS && wins < arch.targetWins; step++) {
        const isBoss = RW_BOSS_GATES.has(wins + 1);
        const band = rwBandFor(wins);
        const bandIdx = RW_DIFFICULTY.indexOf(band);

        // Req cadence (shipped reqMode) → skip model. Boss gates are req-free.
        let twistCrMax = 0;
        if (!isBoss) {
            let propReqChance = 0;
            if (band.reqMode === "soft") propReqChance = arch.reqSkip[0];
            else if (band.reqMode === "hard") propReqChance = arch.reqSkip[1];
            else if (band.reqMode === "twist") {
                if (rng() < 0.5) {
                    // REQ_POOLS.twist crMax branch — the hand cap replaces crCap
                    const values = RW_REQ_POOLS.twist.find(t => t.type === "crMax").values;
                    twistCrMax = values[Math.floor(rng() * values.length)];
                } else {
                    propReqChance = arch.reqSkip[1];
                }
            }
            if (propReqChance > 0 && rng() < propReqChance) {
                skips++;   // skip = re-roll, not a race (never touches wins)
                if (skips > RW_FREE_SKIPS_PER_WEEK) {
                    skipFees += RW_ECON.skipFee;
                    cash -= RW_ECON.skipFee;
                }
                continue;
            }
        }

        races++;
        let oppCr, playerCr, pWin, delta, marginMean = null, isBM = false;
        if (isBoss) {
            oppCr = rwBossCrs[Math.floor(rng() * rwBossCrs.length)];
            playerCr = arch.bestCr;               // any hand allowed, race your best
            delta = playerCr - oppCr;
            pWin = arch.bossWin;
            isBM = rng() < arch.bmFrac;
        } else {
            const pool = rwCrPool(band.oppCrMin, band.oppCrMax);
            oppCr = pool[Math.floor(rng() * pool.length)];
            // Hand CR cap, mirrors generateReqs: oppCR + crCapSlack + rand(0..5);
            // a twist crMax round replaces it with the low cap.
            let capMax = Infinity;
            if (twistCrMax > 0) capMax = twistCrMax;
            else if (band.crCapSlack !== null) capMax = oppCr + band.crCapSlack + Math.floor(rng() * 6);

            if (opts.exploit) {
                // toolkit play: deep-underdog hand, win pre-verified via free Test Race
                playerCr = Math.max(1, Math.min(oppCr - 300, capMax));   // any depth — counted crDiff clamps
                delta = playerCr - oppCr;
                pWin = opts.exploit.pWin;
                marginMean = opts.exploit.marginMean;   // verifier-calibrated, not delta-derived
                isBM = rng() < opts.exploit.bmFrac;
            } else if (twistCrMax > 0 && opts.farmDelta == null) {
                // Forced-cheap-hand round: best sub-cap car, pre-verified via free
                // Test Race (coverage folds into the band base); counted crDiff at
                // the clamp; cheap toolkits are non-BM.
                playerCr = twistCrMax;
                delta = playerCr - oppCr;
                pWin = arch.winBase[bandIdx];
                marginMean = 50;                        // verifier-observed underdog uplift
            } else {
                let targetDelta;
                if (opts.farmDelta != null) targetDelta = opts.farmDelta + rwGauss(rng) * 10;
                else if (arch.deltaMean === null) targetDelta = arch.bestCr - oppCr;   // best-car play
                else targetDelta = arch.deltaMean + rwGauss(rng) * arch.deltaSd;
                playerCr = rwClamp(Math.round(oppCr + targetDelta), 1, Math.min(arch.bestCr, capMax));
                delta = playerCr - oppCr;
                const shift = 0.004 * (delta - 10);
                pWin = (arch.deltaMean === null && opts.farmDelta == null)
                    ? rwClamp(arch.winBase[bandIdx] + Math.min(0, shift), 0.05, 0.97)
                    : rwClamp(arch.winBase[bandIdx] + shift, 0.05, 0.97);
                isBM = rng() < arch.bmFrac;
            }
        }
        if (rng() < pWin) {
            wins++;
            if (marginMean === null) marginMean = rwClamp(20 + 0.25 * delta, 8, 120);
            const margin = -marginMean * Math.log(1 - rng());
            const bonusPct = opts.diamond ? RW_DIAMOND_PCT : (isBM ? RW_BM_PCT : 0);
            const pay = rwWinPay(playerCr, oppCr, bonusPct, margin, rng);
            cash += pay.total;
            crBonusCash += pay.crBonus;
            subtotalCash += pay.subtotal;
            if (wins === 25) cash += RW_TUNE.MILESTONE_MONEY_25;   // FILLER_25 money portion (cash)
        } else {
            losses++;
        }
    }
    return { wins, losses, races, cash, crBonusCash, subtotalCash, skips, skipFees };
}

function rwRunTrials(archKey, arch, opts) {
    const acc = { wins: 0, losses: 0, races: 0, cash: 0, crBonusCash: 0, subtotalCash: 0, skips: 0, skipFees: 0 };
    for (let t = 0; t < RW_TRIALS; t++) {
        const rng = mulberry32(SEED ^ hashStr(`rw|${archKey}|${opts.tag || "honest"}|${t}`));
        const r = rwSimWeek(arch, opts, rng);
        for (const key of Object.keys(acc)) acc[key] += r[key];
    }
    const out = {};
    for (const key of Object.keys(acc)) out[key] = acc[key] / RW_TRIALS;
    return out;
}

// ── T1 baseline: the PRE-Race-Week (legacy) rr for the same race count ──────
// (What the replaced command WOULD have paid for equal activity.)
// Uses the LEGACY mirror's winReward/lossKeep/boss/milestone math UNCHANGED, with
// the same per-race skill/margin model as the RW sim so only the pay rules
// differ. 300-race warm-up reaches steady-state streak (live streaks persist
// across weeks); the next `raceCount` races are what a week of equal activity
// earns today. Known streak-125 divergence of the mirror is left as-is.
function liveDiffIndex(streak) {
    return streak <= 15 ? 0 : streak <= 30 ? 1 : streak <= 49 ? 2 :
           streak <= 74 ? 3 : streak <= 99 ? 4 : 5;
}
function liveSimRaces(arch, raceCount, rng) {
    let streak = 0, cash = 0;
    const WARMUP = 300;
    for (let i = 0; i < WARMUP + raceCount; i++) {
        const measuring = i >= WARMUP;
        const isBoss = streak === 50 || streak === 75 || streak === 100 || (streak > 100 && (streak - 100) % 5 === 0);
        const pool = rrOpponentPool(streak, isBoss);
        const oppCr = getCar(pool[Math.floor(rng() * pool.length)]).cr || 0;
        let playerCr, pWin, delta;
        if (isBoss) {
            playerCr = arch.bestCr;
            delta = playerCr - oppCr;
            pWin = arch.bossWin;
        } else {
            const targetDelta = arch.deltaMean === null
                ? (arch.bestCr - oppCr)
                : arch.deltaMean + rwGauss(rng) * arch.deltaSd;
            playerCr = rwClamp(Math.round(oppCr + targetDelta), 1, arch.bestCr);
            delta = playerCr - oppCr;
            const shift = 0.004 * (delta - 10);
            pWin = arch.deltaMean === null
                ? rwClamp(arch.winBase[liveDiffIndex(streak)] + Math.min(0, shift), 0.05, 0.97)
                : rwClamp(arch.winBase[liveDiffIndex(streak)] + shift, 0.05, 0.97);
        }
        if (rng() < pWin) {
            streak++;
            const marginMean = rwClamp(20 + 0.25 * delta, 8, 120);
            const margin = -marginMean * Math.log(1 - rng());
            const isBM = rng() < arch.bmFrac;
            const r = winReward(streak, { cr: playerCr, isBM, isDiamond: false }, { cr: oppCr }, margin, isBoss);
            let lucky = 0;
            if (streak >= 5 && rng() < 0.05) lucky = Math.floor(r.subtotal * 0.5);
            if (measuring) cash += r.deterministicTotal + lucky;
        } else {
            streak = Math.floor(streak * lossKeep(streak));
        }
    }
    return cash;
}
function liveBaseline(archKey, arch, raceCount) {
    let total = 0;
    for (let t = 0; t < RW_TRIALS; t++) {
        const rng = mulberry32(SEED ^ hashStr(`live|${archKey}|${t}`));
        total += liveSimRaces(arch, Math.round(raceCount), rng);
    }
    return total / RW_TRIALS;
}

// ── Threshold ladder item EV (separate from cash) ───────────────────────────
// Packs valued by sell-EV quantiles of the real priced shop packs (basic=p25,
// mid=p50, premium=p80); prize cars by getSellPrice at a representative CR for
// the tier. Sell value understates "chase" appeal (esp. the 1000 exclusive) —
// it's a floor, not a market price. Fuse tokens valued 0 (fusing disabled).
function rwLadderEV() {
    const evs = shopPacks.map(id => packSellEV(getPack(id))).sort((a, b) => a - b);
    const q = p => evs.length ? evs[Math.min(evs.length - 1, Math.floor(p * evs.length))] : 0;
    const packEV = { basic: q(0.25), mid: q(0.50), premium: q(0.80) };
    const carProxyCr = { 50: 625, 100: 775, 150: 925, 1000: 1050 };
    const ladder = [
        { wins: 10, type: "pack", value: packEV.basic },
        { wins: 25, type: "money", value: 0 },             // money portion counted as cash
        { wins: 50, type: "car (boss gate)", value: getSellPrice(carProxyCr[50]) },
        { wins: 100, type: "car (boss gate)", value: getSellPrice(carProxyCr[100]) },
        { wins: 150, type: "car (boss gate)", value: getSellPrice(carProxyCr[150]) },
        { wins: 200, type: "pack", value: packEV.mid },
        { wins: 250, type: "pack", value: packEV.mid },
        { wins: 300, type: "pack", value: packEV.mid },
        { wins: 500, type: "premium pack", value: packEV.premium },
        { wins: 700, type: "premium pack", value: packEV.premium },
        { wins: 888, type: "premium pack", value: packEV.premium },
        { wins: 1000, type: "exclusive car (boss gate)", value: getSellPrice(carProxyCr[1000]) }
    ];
    return { packEV, carProxyCr, ladder };
}

// ── In-race event table EV — SHIPPED EVENTS consts (raceWeek.js), settled by
// raceWeekEvents.js. Approximate money EV per RACE, layered ON TOP of cash —
// NOT a full event simulation. Assumptions:
//  - cadence: EVENTS.rollChance per matchup generation; boss-gate rounds never
//    roll (≈4 races/week — ignored); skips re-roll events too (extra rolls
//    ignored — slightly conservative). One event active at a time.
//  - driver grants valued $0 (drivers have no sell value); cashvein pays its
//    full races×moneyPerWin (multi-win buff survives losses/skips, so an
//    active player always mines it out); driverscout modeled at its all-owned
//    money fallback ×p (upper bound — assumes a complete roster).
//  - inputs measured from the archetype's honest run: p = overall win rate,
//    W = avg $ per win (race payouts only), S = avg subtotal per win.
//  - photofinish: P(margin < marginMax | win) under Exponential(mean 25)
//    ≈ 18% at marginMax 5. Deterministic margins mean a sandbagger could
//    force this — not modeled (bounded at +0.5×subtotal anyway).
//  - skiptoken: worth skips×skipFee only to archetypes actually paying skip
//    fees (weekly skips > free allowance), else $0.
//  - packshards: shards/shardsPerPack of a standard-tier pack per event,
//    valued at the basic pack sell-EV quantile.
//  - opt-ins (losses pay $0, so gambles are near-pure upside): doubleornothing
//    always accepted → p×(mult−1)×W; cursedrace accepted-then-tested (skip if
//    unwinnable) → 0.5×(mult−1)×W; convoy needs 2 straight wins → p²×(mult−1)
//    ×2W; underdogoffer won at 85% with a test-verified cheap hand (payout ≈ W
//    with clamped crBonus — approximated as W); showcase accepted and won at p.
//  - rare: goldenopponent = p × basic-pack EV; revengematch = p×bonusMult×W
//    (eligibility — a recent loss on file — ignored; actives nearly always
//    have one at 5-20% loss rates).
//  - eligibility filters (underdogoffer hard/twist-only) ignored; configured
//    weights used as-is over the full table.
function rwEventTableEV({ p, W, S, feePayer, packBasicEV }) {
    const cfg = id => RW_EVENTS.table.find(e => e.id === id) || {};
    const perEvent = {
        photofinish: p * (1 - Math.exp(-cfg("photofinish").marginMax / 25)) * cfg("photofinish").bonusMult * S,
        cashvein: cfg("cashvein").races * cfg("cashvein").moneyPerWin,
        skiptoken: feePayer ? cfg("skiptoken").skips * RW_ECON.skipFee : 0,
        packshards: (cfg("packshards").shards / cfg("packshards").shardsPerPack) * packBasicEV,
        driverscout: p * cfg("driverscout").moneyIfAllOwned,
        doubleornothing: p * (cfg("doubleornothing").mult - 1) * W,
        cursedrace: 0.5 * (cfg("cursedrace").mult - 1) * W,
        convoy: p * p * (cfg("convoy").mult - 1) * 2 * W,
        underdogoffer: 0.85 * (cfg("underdogoffer").mult - 1) * W,
        showcase: p * (cfg("showcase").mult - 1) * W,
        goldenopponent: p * packBasicEV,
        revengematch: p * cfg("revengematch").bonusMult * W
    };
    const totalWeight = RW_EVENTS.table.reduce((sum, e) => sum + e.weight, 0);
    let perRoll = 0;
    const breakdown = {};
    for (const e of RW_EVENTS.table) {
        const ev = perEvent[e.id] || 0;
        perRoll += (e.weight / totalWeight) * ev;
        breakdown[e.id] = Math.round(RW_EVENTS.rollChance * (e.weight / totalWeight) * ev);
    }
    return { perRace: RW_EVENTS.rollChance * perRoll, breakdown };
}

function runRaceWeek() {
    const fmt = n => "$" + Math.round(n).toLocaleString();
    console.log(`\nRACE WEEK MODEL (mirrors SHIPPED randomrace.js + raceWeek.js consts) — ${RW_TRIALS} trials/archetype, seed ${SEED}`);
    console.log(`FLAT_BASE=${RW_TUNE.FLAT_BASE}  CR_BONUS_BASE=${RW_TUNE.CR_BONUS_BASE}  CR_DIFF_CLAMP=+${RW_TUNE.CR_DIFF_CLAMP}  MILESTONE_MONEY_25=${RW_TUNE.MILESTONE_MONEY_25}  skips ${RW_ECON.skipFreePerDay}/day free then ${RW_ECON.skipFee}\n`);

    const { packEV, carProxyCr, ladder } = rwLadderEV();
    const results = [];

    console.log("archetype   wins   races  lossR%   cash        $/win    skips(fees)   liveRR(same races)  RW/live");
    for (const [key, arch] of Object.entries(RW_ARCHETYPES)) {
        const r = rwRunTrials(key, arch, {});
        const live = liveBaseline(key, arch, r.races);
        const cashPerWin = r.cash / r.wins;
        const lossRate = 100 * r.losses / r.races;
        // Event-table EV inputs, measured from this honest run: race payouts
        // only (back out skip fees and the 25-rung money from cash).
        const milestoneCash = r.wins >= 25 ? RW_TUNE.MILESTONE_MONEY_25 : 0;
        const avgWinPay = (r.cash + r.skipFees - milestoneCash) / r.wins;
        const evt = rwEventTableEV({
            p: r.wins / r.races,
            W: avgWinPay,
            S: r.subtotalCash / r.wins,
            feePayer: r.skips > RW_FREE_SKIPS_PER_WEEK,
            packBasicEV: packEV.basic
        });
        const eventEVWeekly = evt.perRace * r.races;
        results.push({
            archetype: key, wins: Math.round(r.wins), races: Math.round(r.races),
            cashTotal: Math.round(r.cash), cashPerWin: Math.round(cashPerWin),
            crBonusShare: +(r.crBonusCash / r.cash).toFixed(3),
            skips: Math.round(r.skips), skipFees: Math.round(r.skipFees),
            eventEVPerRace: Math.round(evt.perRace), eventEVWeekly: Math.round(eventEVWeekly),
            cashPlusEventEV: Math.round(r.cash + eventEVWeekly),
            eventBreakdownPerRace: evt.breakdown,
            liveRRCash: Math.round(live), vsCurrentRR: +(r.cash / live).toFixed(2)
        });
        console.log(`${key.padEnd(10)} ${String(Math.round(r.wins)).padStart(5)} ${String(Math.round(r.races)).padStart(7)} ${lossRate.toFixed(1).padStart(6)}  ${fmt(r.cash).padStart(12)} ${fmt(cashPerWin).padStart(9)}  ${String(Math.round(r.skips)).padStart(4)}(${fmt(r.skipFees)})  ${fmt(live).padStart(14)}      ${(r.cash / live).toFixed(2)}`);
    }

    // Ladder item EV per archetype (cumulative rungs reached)
    console.log(`\nLADDER ITEM EV (sell-value floor; packs basic/mid/premium = ${fmt(packEV.basic)}/${fmt(packEV.mid)}/${fmt(packEV.premium)}; prize-car CR proxies ${JSON.stringify(carProxyCr)})`);
    const itemEVByArch = {};
    for (const res of results) {
        const ev = ladder.filter(l => l.wins <= res.wins).reduce((s, l) => s + l.value, 0);
        itemEVByArch[res.archetype] = Math.round(ev);
        console.log(`  ${res.archetype.padEnd(10)} rungs ≤${res.wins}: item EV ${fmt(ev)}  (cash ${fmt(res.cashTotal)} → total ${fmt(ev + res.cashTotal)})`);
    }

    // In-race event table EV (SHIPPED EVENTS consts — approximation, see
    // rwEventTableEV assumptions; fuse/drivers valued $0)
    console.log(`\nEVENT TABLE EV (rollChance ${RW_EVENTS.rollChance}; approx money EV layered on top of cash)`);
    for (const res of results) {
        console.log(`  ${res.archetype.padEnd(10)} ${fmt(res.eventEVPerRace)}/race × ${res.races} races = ${fmt(res.eventEVWeekly)}/week  →  cash+events ${fmt(res.cashPlusEventEV)}`);
    }
    const nolifeRes = results.find(res => res.archetype === "nolife");
    if (nolifeRes && nolifeRes.cashPlusEventEV > 38000000) {
        console.log(`\n  ⚠⚠⚠ FLAG: nolife cash+eventEV ${fmt(nolifeRes.cashPlusEventEV)} EXCEEDS the ~$38M guardrail`);
        console.log(`  ⚠⚠⚠ (cash ${fmt(nolifeRes.cashTotal)} + event EV ${fmt(nolifeRes.eventEVWeekly)}) — consider retuning EVENTS weights/mults.`);
    }

    // T4: crBonus farming — deliberately racing far-below-CR hands.
    // Sweep target deltas; farmer has nolife's garage/skill. cash/win is the
    // guard metric (losses pay nothing, so per-win is the farmer-optimistic view).
    const honest = results.find(r => r.archetype === "nolife");
    console.log(`\nDEGENERATE CHECK — crBonus farming (nolife garage), honest $/win = ${fmt(honest.cashPerWin)}`);
    const sweep = [];
    for (const d of [-300, -200, -120, -80, -40, 0]) {
        const r = rwRunTrials("nolife", RW_ARCHETYPES.nolife, { farmDelta: d, tag: `farm${d}` });
        const perWin = r.cash / r.wins;
        sweep.push({ targetDelta: d, cashPerWin: Math.round(perWin), winRatePct: +(100 * r.wins / r.races).toFixed(1),
                     races: Math.round(r.races), ratioVsHonest: +(perWin / honest.cashPerWin).toFixed(3) });
        console.log(`  delta ${String(d).padStart(4)}: $/win ${fmt(perWin).padStart(9)} (${(100 * r.wins / r.races).toFixed(1)}% win, ${Math.round(r.races)} races) → ${(100 * (perWin / honest.cashPerWin - 1)).toFixed(1)}% vs honest`);
    }
    const worst = sweep.reduce((a, b) => b.ratioVsHonest > a.ratioVsHonest ? b : a);

    // T4b: DETERMINISTIC toolkit exploit (adversarial finding, 2026-07-20).
    // race.js outcomes are pure evalScore (zero RNG) and Test Race is free and
    // unlimited, so the win-prob slope above does NOT bind a strategic player:
    // a ~25-car cheap toolkit (non-prize, CR 1–556, all verified buyable)
    // yields a test-verified winning deep-underdog hand in ~93% of plateau
    // races. Calibration from the verifiers' real-catalog measurement:
    // pWin 0.93; marginMean 50 ≈ their observed exploit domination uplift
    // (~+22%); bmFrac swept 0/0.3/0.6 (cheap non-prize toolkits skew low-BM —
    // 0.6 is the paranoid bound). The crDiff clamp is the only thing bounding
    // this channel; it must hold at the paranoid bound too.
    console.log(`\nDETERMINISTIC TOOLKIT EXPLOIT (pWin 0.93, counted crDiff at clamp +${RW_TUNE.CR_DIFF_CLAMP})`);
    const exploitRows = [];
    for (const bm of [0, 0.3, 0.6]) {
        const r = rwRunTrials("nolife", RW_ARCHETYPES.nolife, { exploit: { pWin: 0.93, marginMean: 50, bmFrac: bm }, tag: `exploit${bm}` });
        const perWin = r.cash / r.wins;
        exploitRows.push({ bmFrac: bm, cashPerWin: Math.round(perWin), races: Math.round(r.races),
                           ratioVsHonest: +(perWin / honest.cashPerWin).toFixed(3) });
        console.log(`  bmFrac ${bm.toFixed(1)}: $/win ${fmt(perWin).padStart(9)} (${Math.round(r.races)} races) → ${(100 * (perWin / honest.cashPerWin - 1)).toFixed(1)}% vs honest`);
    }
    const worstExploit = exploitRows.reduce((a, b) => b.ratioVsHonest > a.ratioVsHonest ? b : a);

    // Diamond sensitivity (DIAMONDS_ENABLED=false in the model; what if ON?)
    const dia = rwRunTrials("nolife", RW_ARCHETYPES.nolife, { diamond: true, tag: "diamond" });
    console.log(`\nDIAMOND SENSITIVITY (if 2x ever enabled, all-diamond nolife): ${fmt(dia.cash)} (${(dia.cash / honest.cashTotal).toFixed(2)}x honest)`);

    const out = {
        FLAT_BASE: RW_TUNE.FLAT_BASE,
        CR_BONUS_BASE: RW_TUNE.CR_BONUS_BASE,
        CR_DIFF_CLAMP: RW_TUNE.CR_DIFF_CLAMP,
        MILESTONE_MONEY_25: RW_TUNE.MILESTONE_MONEY_25,
        assumptions: {
            perRaceModel: "opponent CR drawn from real catalog cars in the SHIPPED DIFFICULTY band (imported from src/util/consts/raceWeek.js) for current weeklyWins; boss gates (BOSS_GATES car rungs) from real boss pool; player CR = oppCR + N(deltaMean,deltaSd) capped at archetype bestCr AND the shipped hand-CR cap (casual: races bestCr car under the cap)",
            reqAndSkipModel: "req cadence mirrors shipped reqMode per band: soft/hard/twist-property rounds skipped with per-archetype reqSkip chance (garage can't meet the rolled property req); twist rounds 50% crMax (hand forced to 350/400/450, counted crDiff at the clamp, win prob = band base unshifted via free deterministic Test Race pre-verification, marginMean 50, non-BM hand); skips are free 10/UTC-day (modeled 70/week) then 25k each, fees deducted from cash",
            winProb: "archetype skill base per band (losses ~5-20% by band), shifted +0.4%/CR of hand delta, clamped 5-97%; boss win prob fixed per archetype (0.70-0.92)",
            marginModel: "win margin ~ Exponential(mean = clamp(20 + 0.25*delta, 8, 120)) vs domination thresholds 20/50/100",
            multipliers: "card-type money bonus via rrMoneyBonusPct (BM +25%, bmFrac 0/0.15/0.30/0.45/0.60 by archetype; Diamond +100% gated off) joins the subtotal BEFORE domination/lucky per the SHIPPED computeWinPayout stacking; domination +15/40/60%; lucky ECON.luckyChance for +ECON.luckyMult subtotal",
            cashCounting: "cashTotal includes the 25-rung money portion (MILESTONE_MONEY_25); item rungs valued separately in itemEV",
            liveBaseline: "same skill/margin model fed through the UNTOUCHED live-rr mirror (winReward/lossKeep/boss/milestones/lucky), 300-race warm-up to steady-state streak, then the same race count as the Race Week archetype; mirror's known streak-125 divergence left as-is",
            itemValuation: "packs = sell-EV quantiles of real priced shop packs (basic p25, mid p50, premium p80); prize cars = getSellPrice at tier-proxy CR; fuse tokens = 0 (fusing disabled); sell value is a floor, not market value",
            crBonusFormula: "eligible when playerCR - oppCR <= 30; crBonus = (min(oppCR - playerCR, CR_DIFF_CLAMP) + 40) * CR_BONUS_BASE — the clamp is load-bearing: race outcomes are deterministic and Test Race is free, so unclamped delta-scaling is farmable to 2.15x honest $/win (refuted 2026-07-20)",
            exploitCalibration: "toolkit exploit check: pWin 0.93 (verifier-measured coverage of a 25-car cheap non-prize CR 1-556 toolkit vs the real plateau catalog), marginMean 50 (matches verifier-observed ~+22% domination uplift), bmFrac swept 0/0.3/0.6",
            forcedLowCrReqs: "the design's sub-350-CR twist rounds vs plateau opponents force counted crDiff to the clamp for EVERYONE — under the clamp that's a bounded (clamp+40)*CBB per-win kicker (~$6.5k at defaults), not the ~$22k the unclamped formula paid; not separately modeled",
            notModeled: "drivers (The Closer's x1.05 win payout is a flat +5% upper bound on cash; stat drivers only move win rates), full event-state simulation (approximated in eventTableEV instead), weekly prize-car rotation value differences, CR-1 catalog anomalies (c00004/c02759/c03810 deterministically beat CR 650-999 opponents on some tracks — audit separately; the clamp bounds their payout either way)",
            archetypes: RW_ARCHETYPES
        },
        results,
        itemEV: {
            packEVQuantiles: { basic: Math.round(packEV.basic), mid: Math.round(packEV.mid), premium: Math.round(packEV.premium) },
            carSellProxies: Object.fromEntries(Object.entries(carProxyCr).map(([w, cr]) => [w, { cr, sellValue: getSellPrice(cr) }])),
            fullLadderEV: Math.round(ladder.reduce((s, l) => s + l.value, 0)),
            byArchetype: itemEVByArch,
            weeklyEventIncomeContext: "weekly event income ~7M + cars; ladder item EV is intentionally on top of cash targets"
        },
        eventTableEV: {
            source: "SHIPPED EVENTS consts (src/util/consts/raceWeek.js), settled by raceWeekEvents.js",
            method: "closed-form approximation per race (see rwEventTableEV comment): rollChance x weighted per-event money EV; fuse/drivers $0; opt-in gambles near-pure upside since losses pay nothing; boss-gate/skip re-roll cadence effects ignored",
            byArchetype: Object.fromEntries(results.map(res => [res.archetype, {
                perRace: res.eventEVPerRace,
                weekly: res.eventEVWeekly,
                cashPlusEventEV: res.cashPlusEventEV,
                perRaceBreakdown: res.eventBreakdownPerRace
            }])),
            nolifeGuardrail38M: !(nolifeRes && nolifeRes.cashPlusEventEV > 38000000)
        },
        degenerateStrategyCheck: {
            strategy: "deliberately racing far-below-CR hands to farm crBonus (nolife garage)",
            honestCashPerWin: honest.cashPerWin,
            sweep,
            worstRatioVsHonest: worst.ratioVsHonest,
            note: "in-model sweep (slope-based pWin), extended to delta -300; under the crDiff clamp the payout flattens with depth instead of growing unboundedly"
        },
        exploitCheck: {
            strategy: "deterministic toolkit exploit: zero-RNG race outcomes + free unlimited Test Race → pre-verified deep-underdog wins at ~93% coverage; counted crBonus pinned at the clamp",
            honestCashPerWin: honest.cashPerWin,
            byBmFrac: exploitRows,
            worstRatioVsHonest: worstExploit.ratioVsHonest,
            note: "this, not the slope-based sweep, is the binding T4 scenario; the CR_DIFF_CLAMP is what bounds it"
        },
        passesT4: worst.ratioVsHonest <= 1.25 && worstExploit.ratioVsHonest <= 1.25,
        diamondSensitivity: {
            enabled: false,
            allDiamondNolifeCash: Math.round(dia.cash),
            multiplierVsHonest: +(dia.cash / honest.cashTotal).toFixed(2)
        }
    };
    fs.writeFileSync("scripts/raceweek_tuning.json", JSON.stringify(out, null, 2));
    console.log(`\nWrote scripts/raceweek_tuning.json`);
}

if (argv.includes("--raceweek")) {
    runRaceWeek();
    process.exit(0);
}

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
