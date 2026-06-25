"use strict";

/**
 * PROVING GROUNDS GENERATOR — template → verified event roster
 * =============================================================
 * The "provinggrounds" generator for the auto-event system (see autoEvents.js
 * for spawning/scheduling, and src/autoevents/_master.json for every template
 * option explained).
 *
 * What it guarantees, per generated round:
 *   - SOLVABLE: brute-force verified — at least one obtainable, non-prize card
 *     (in the theme's universe) beats the opponent on that track within reqs.
 *   - ON-CURVE: the number of cards that can win ("solvers") falls in a target
 *     band derived from the template's difficulty range, scaled to the theme
 *     universe's size. The finale is always absolute: 1-5 solver cards.
 *   - DISTINCT ANSWERS: tight rounds (solvers ≤ uniqueSolutionThreshold) have
 *     pairwise-disjoint solver sets — no single car can clear two of them.
 *
 * Pure module: no Discord, no Mongo. generate() returns data; the caller
 * persists and announces. Race scoring MIRRORS race.js evalScore v2.0 — keep
 * in sync with rebalances (same note as simulateEconomy.js).
 */

const { getCar, getTrack, getCarFiles, getTrackFiles, packExists, carExists } = require("./dataManager.js");
const { calcTune } = require("./calcTune.js");
const { isPackable, isPrizeLike, usesReferenceStats, isBMCar, hasType, modifiedBase } = require("./cardType.js");
const { driveHierarchy, gcHierarchy, weatherVars } = require("../consts/consts.js");

// ─── Race scoring — MIRRORS race.js evalScore (v2.0 rebalanced) ─────────────

const ZERO_PENS = { drivePen: 0, absPen: 0, tcsPen: 0, tyrePen: {} };

function evalScore(player, opponent, track) {
    const pens = weatherVars[`${track.weather} ${track.surface}`] || ZERO_PENS;
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

const TUNES = ["000", "333", "666", "699", "969", "996"];
const tunedCache = new Map();

// Stats resolve through modifiedBase so BM-universe themes evaluate correctly
// (a BM card races with its reference car's stats).
function getTuned(carID, tune) {
    const key = `${carID}|${tune}`;
    let hit = tunedCache.get(key);
    if (hit) return hit;
    const base = modifiedBase(getCar(carID));
    const t = calcTune(base, tune);
    hit = {
        carID, cr: base.cr || 0,
        topSpeed: t.topSpeed, accel: t.accel, handling: t.handling,
        weight: t.weight, mra: t.mra, ola: t.ola,
        gc: base.gc || "Medium", driveType: base.driveType || "RWD",
        tyreType: base.tyreType || "Standard",
        abs: base.abs ? 1 : 0, tcs: base.tcs ? 1 : 0
    };
    tunedCache.set(key, hit);
    return hit;
}

// Generation-time req matcher. MIRRORS filterCheck semantics for the keys this
// generator emits: ranges/strings/arrays check the card's modifiedBase (like
// filterCheck's bmReference), cardType checks the card itself.
function reqCheck(car, reqs) {
    const base = modifiedBase(car);
    for (const [key, value] of Object.entries(reqs)) {
        if (key === "cardType") {
            if (!value.some(t => hasType(car, t))) return false;
        } else if (Array.isArray(value)) {
            let arr = base[key];
            if (!Array.isArray(arr)) arr = [arr];
            arr = arr.map(t => t ? String(t).toLowerCase() : "");
            if (!value.every(tag => arr.includes(String(tag).toLowerCase()))) return false;
        } else if (typeof value === "object" && value !== null) {
            if (!(base[key] >= value.start && base[key] <= value.end)) return false;
        } else if (typeof value === "string") {
            const cv = base[key];
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

// ─── Solver analysis ─────────────────────────────────────────────────────────

// Counts cars in `pool` that can beat the opponent within reqs (any tune).
// Returns the solver carID list when small enough to matter for disjointness.
function analyzeRound(opponentStats, track, reqs, pool, listCap = 400) {
    let solvers = 0, bestMargin = -Infinity, tightest = Infinity;
    const list = [];
    for (const id of pool) {
        const car = getCar(id);
        if (!reqCheck(car, reqs)) continue;
        let carBest = -Infinity;
        for (const tune of TUNES) {
            const s = evalScore(getTuned(id, tune), opponentStats, track);
            if (s > carBest) carBest = s;
        }
        if (carBest > 0) {
            solvers++;
            if (carBest < tightest) tightest = carBest;
            if (carBest > bestMargin) bestMargin = carBest;
            if (list.length <= listCap) list.push(id);
        }
    }
    return { solvers, list: solvers <= listCap ? list : null, bestMargin, tightest };
}

// ─── Difficulty bands, scaled to the theme universe ─────────────────────────

// Level 1..10 → target solver count, geometric from ~12% of the universe down
// to ~3 cars. Bands are [50%, 180%] around the target; a finale at level ≥9 is
// always absolute 1-5 ("do you own THE answer").
function solverBand(level, universeSize, isFinale, maxLevel) {
    if (isFinale && maxLevel >= 9) return [1, 5];
    const sMax = Math.max(30, Math.round(universeSize * 0.12));
    const target = Math.round(sMax * Math.pow(3 / sMax, (level - 1) / 9));
    const lo = Math.max(1, Math.floor(target * 0.5));
    const hi = Math.max(lo + 1, Math.ceil(target * 1.8));
    return [lo, hi];
}

// ─── Theme system ────────────────────────────────────────────────────────────

const RARITY_BRACKETS = [
    { name: "Standard", start: 1, end: 99 },
    { name: "Common", start: 100, end: 249 },
    { name: "Uncommon", start: 250, end: 399 },
    { name: "Rare", start: 400, end: 549 },
    { name: "Epic", start: 550, end: 699 },
    { name: "Exotic", start: 700, end: 849 },
    { name: "Legendary", start: 850, end: 999 },
    { name: "Mystic", start: 1000, end: 1500 }
];

const THEME_NAME_PATTERNS = {
    rarity: r => `${r} Gauntlet`,
    make: m => `${m} Showcase`,
    country: c => `Made in ${c.toUpperCase()}`,
    decade: d => `${d}s Throwback`,
    cardType: () => "No Crutches"
};

/**
 * Resolve the template's theme into { name, baseReqs, excludedReqKeys } or null.
 *   theme: null/"none" → unthemed
 *   theme: "auto"      → roll from themeRecipes (weighted), validated viable
 *   theme: {...}       → fixed: { name, baseReqs, universe? ("bm") }
 */
function pickTheme(template, defaultUniverse) {
    const theme = template.theme;
    if (!theme || theme === "none") return null;
    if (typeof theme === "object") return { name: theme.name || "Special", baseReqs: theme.baseReqs || {}, universe: theme.universe };

    // auto
    const recipes = template.themeRecipes || { none: { weight: 1 } };
    const entries = Object.entries(recipes);
    const totalWeight = entries.reduce((s, [, r]) => s + (r.weight || 1), 0);

    for (let attempt = 0; attempt < 20; attempt++) {
        let roll = Math.random() * totalWeight;
        let kind = "none";
        for (const [k, r] of entries) {
            roll -= (r.weight || 1);
            if (roll <= 0) { kind = k; break; }
        }
        if (kind === "none") return null;
        const recipe = recipes[kind];
        const minCars = recipe.minCars || 100;
        const sample = () => getCar(defaultUniverse[Math.floor(Math.random() * defaultUniverse.length)]);

        let baseReqs = null, name = null;
        if (kind === "rarity") {
            const bracket = RARITY_BRACKETS[Math.floor(Math.random() * RARITY_BRACKETS.length)];
            baseReqs = { cr: { start: bracket.start, end: bracket.end } };
            name = THEME_NAME_PATTERNS.rarity(bracket.name);
        } else if (kind === "make") {
            const m = sample().make;
            const first = Array.isArray(m) ? m[0] : m;
            if (!first) continue;
            baseReqs = { make: [String(first).toLowerCase()] };
            name = THEME_NAME_PATTERNS.make(first);
        } else if (kind === "country") {
            const c = sample().country;
            if (!c) continue;
            baseReqs = { country: String(c).toLowerCase() };
            name = THEME_NAME_PATTERNS.country(c);
        } else if (kind === "decade") {
            const y = sample().modelYear;
            if (!y) continue;
            const d = Math.floor(y / 10) * 10;
            baseReqs = { modelYear: { start: d, end: d + 9 } };
            name = THEME_NAME_PATTERNS.decade(d);
        } else if (kind === "cardType") {
            const values = recipe.values || [["normal"]];
            const v = values[Math.floor(Math.random() * values.length)];
            baseReqs = { cardType: v };
            name = THEME_NAME_PATTERNS.cardType(v);
        } else {
            continue;
        }

        // viability: enough cars must satisfy the theme
        const count = defaultUniverse.reduce((n, id) => n + (reqCheck(getCar(id), baseReqs) ? 1 : 0), 0);
        if (count >= minCars) return { name, baseReqs };
    }
    return null; // no viable theme found — run unthemed
}

// ─── Requirements ────────────────────────────────────────────────────────────

const REQ_KEYS = ["make", "bodyStyle", "country", "driveType", "tyreType", "gc", "enginePos", "fuelType", "seatCount", "modelYear", "tags"];

function buildReq(key, reqCar, hard) {
    const v = modifiedBase(reqCar)[key];
    if (v === undefined || v === null) return null;
    switch (key) {
        case "make":
        case "bodyStyle":
        case "tags": {
            const first = Array.isArray(v) ? v[0] : v;
            if (!first) return null;
            return [String(first).toLowerCase()];
        }
        case "country":
        case "driveType":
        case "tyreType":
        case "gc":
        case "enginePos":
        case "fuelType":
            return String(v).toLowerCase();
        case "seatCount":
            return { start: v, end: hard ? v : v + 1 };
        case "modelYear": {
            const width = hard ? 5 : 10;
            const start = Math.floor(v / width) * width;
            return { start, end: start + width };
        }
        default:
            return null;
    }
}

// ─── Rewards assembly ────────────────────────────────────────────────────────

function pickFromPool(pool, avoid, usedThisEvent) {
    const candidates = pool.filter(id => !usedThisEvent.has(id) && (pool.length <= 1 || id !== avoid));
    const source = candidates.length > 0 ? candidates : pool;
    return source[Math.floor(Math.random() * source.length)];
}

/**
 * Resolve the template's milestone map into per-round reward objects.
 * Handles $CARPOOL/$PACKPOOL sentinels, $BUDGET money, the moneyCurve
 * allocator, and enforces moneyBudget as a hard cap.
 */
function assembleRewards(template, roundCount, context, warnings) {
    const cfg = template.rewards || {};
    const milestones = cfg.milestones || {};
    const budget = cfg.moneyBudget || 0;
    const carPool = cfg.carPool || [];
    const packPool = cfg.packPool || [];

    // validate pools up front
    for (const id of carPool) {
        if (!carExists(id)) throw new Error(`rewards.carPool entry "${id}" does not exist`);
        if (!isPrizeLike(getCar(id))) warnings.push(`carPool entry ${id} is not a Prize-type card`);
    }
    for (const id of packPool) {
        if (!packExists(id)) throw new Error(`rewards.packPool entry "${id}" does not exist`);
    }

    const usedCars = new Set(), usedPacks = new Set();
    let lastCarPick = context.lastCarPick, lastPackPick = context.lastPackPick;
    const perRound = {};   // roundNumber -> rewards object
    const budgetSlots = []; // rounds carrying "$BUDGET" money
    let explicitMoney = 0;

    for (const [roundStr, rewardDef] of Object.entries(milestones)) {
        const round = parseInt(roundStr);
        if (isNaN(round) || round < 1 || round > roundCount) {
            throw new Error(`rewards.milestones round "${roundStr}" is outside 1-${roundCount}`);
        }
        const rewards = {};
        for (const [key, value] of Object.entries(rewardDef)) {
            if (key === "car") {
                const carID = value === "$CARPOOL" ? pickFromPool(carPool, lastCarPick, usedCars) : value;
                if (!carID) throw new Error(`milestone ${round}: car reward requested but carPool is empty`);
                if (!carExists(carID)) throw new Error(`milestone ${round}: car "${carID}" does not exist`);
                usedCars.add(carID);
                if (value === "$CARPOOL") lastCarPick = carID;
                rewards.car = { carID, upgrade: "000" };
            } else if (key === "pack") {
                const packID = value === "$PACKPOOL" ? pickFromPool(packPool, lastPackPick, usedPacks) : value;
                if (!packID) throw new Error(`milestone ${round}: pack reward requested but packPool is empty`);
                if (!packExists(packID)) throw new Error(`milestone ${round}: pack "${packID}" does not exist`);
                usedPacks.add(packID);
                if (value === "$PACKPOOL") lastPackPick = packID;
                rewards.pack = packID;
            } else if (key === "money") {
                if (value === "$BUDGET") {
                    budgetSlots.push(round);
                    rewards.money = 0; // filled by the allocator below
                } else {
                    rewards.money = value;
                    explicitMoney += value;
                }
            } else if (key === "trophies" || key === "fuseTokens") {
                rewards[key] = value;
            } else {
                throw new Error(`milestone ${round}: unknown reward key "${key}"`);
            }
        }
        perRound[round] = rewards;
    }

    // Money: hard-cap validation + curve allocation
    if (explicitMoney > budget) {
        throw new Error(`explicit milestone money ($${explicitMoney.toLocaleString()}) exceeds moneyBudget ($${budget.toLocaleString()})`);
    }
    const remaining = budget - explicitMoney;
    if (budgetSlots.length > 0 && remaining > 0) {
        const curve = cfg.moneyCurve || "flat";
        const weights = budgetSlots.map(r => curve === "quadratic" ? r * r : curve === "finale" ? (r === Math.max(...budgetSlots) ? 1 : 0) : 1);
        const totalW = weights.reduce((a, b) => a + b, 0) || 1;
        let allocated = 0;
        budgetSlots.forEach((r, i) => {
            const share = i === budgetSlots.length - 1
                ? remaining - allocated
                : Math.floor(remaining * weights[i] / totalW);
            perRound[r].money = share;
            allocated += share;
        });
    }
    // drop zero-money keys so rounds don't show "$0" rewards
    for (const rewards of Object.values(perRound)) {
        if (rewards.money === 0) delete rewards.money;
    }

    return { perRound, statePatch: { lastCarPick, lastPackPick } };
}

// ─── Naming ──────────────────────────────────────────────────────────────────

function roman(n) {
    const table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let out = "";
    for (const [v, s] of table) {
        while (n >= v) { out += s; n -= v; }
    }
    return out || "I";
}

// ─── The generator ───────────────────────────────────────────────────────────

/**
 * @param {Object} template - an auto-event template (src/autoevents/*.json)
 * @param {Object} context  - spawn state: { counter, lastCarPick, lastPackPick }
 * @returns {{ name, roster, entryFee, eventType, themeName, statePatch, debug }}
 */
function generate(template, context = {}) {
    const roundCount = template.rounds || 20;
    if (roundCount < 1 || roundCount > 30) throw new Error("rounds must be 1-30 (event system limit)");
    const diff = template.difficulty || { start: 1, end: 10 };
    const threshold = template.uniqueSolutionThreshold ?? 50;
    const warnings = [];

    const carFiles = getCarFiles();
    const allCarIDs = carFiles.map(f => f.slice(0, 6));
    const trackIDs = getTrackFiles().map(f => f.slice(0, 6));

    // Default universe: every card a player can obtain without prizes.
    const defaultUniverse = allCarIDs.filter(id => {
        const c = getCar(id);
        return isPackable(c) && (c.cr || 0) > 0;
    });

    // Theme → universe
    const theme = pickTheme(template, defaultUniverse);
    let universe;
    if (theme?.universe === "bm") {
        universe = allCarIDs.filter(id => isBMCar(getCar(id)));
    } else if (theme) {
        universe = defaultUniverse.filter(id => reqCheck(getCar(id), theme.baseReqs));
    } else {
        universe = defaultUniverse;
    }
    if (universe.length < 30) throw new Error(`theme "${theme?.name}" universe too small (${universe.length} cars)`);

    const prizePool = allCarIDs.filter(id => isPrizeLike(getCar(id)));

    // Opponent pool: any standalone card. Themed opponents (when viable) for
    // property themes only — cardType themes keep the open pool so prize/boss
    // opponents stay available.
    const standalone = allCarIDs.filter(id => {
        const c = getCar(id);
        return !usesReferenceStats(c) && (c.cr || 0) > 0;
    });
    let opponentPool = standalone;
    if (template.themeOpponents !== false && theme && !theme.baseReqs.cardType && theme.universe !== "bm") {
        const themed = standalone.filter(id => reqCheck(getCar(id), theme.baseReqs));
        if (themed.length >= 60) opponentPool = themed;
    }
    const oppCrs = opponentPool.map(id => getCar(id).cr || 0).sort((a, b) => a - b);

    const themeReqKeys = theme ? Object.keys(theme.baseReqs) : [];
    const reqPalette = REQ_KEYS.filter(k => !themeReqKeys.includes(k));
    const themeCr = theme?.baseReqs?.cr;

    const MAX_ATTEMPTS = 800;
    const usedSolvers = new Set();
    const rounds = [];

    for (let round = 1; round <= roundCount; round++) {
        const t = roundCount === 1 ? 1 : (round - 1) / (roundCount - 1);
        const level = diff.start + t * (diff.end - diff.start);
        const hard = level > 5;
        const [lo, hi] = solverBand(level, universe.length, round === roundCount, diff.end);

        let chosen = null, best = null, attempts = 0;
        while (attempts < MAX_ATTEMPTS && !chosen) {
            attempts++;

            // opponent within a climbing CR window of its pool
            const winLo = oppCrs[Math.floor(t * 0.78 * (oppCrs.length - 1))];
            const winHi = winLo + 350;
            let oppID, oppCar, tries = 0;
            do {
                oppID = opponentPool[Math.floor(Math.random() * opponentPool.length)];
                oppCar = getCar(oppID);
                tries++;
            } while ((oppCar.cr < winLo || oppCar.cr > winHi) && tries < 3000);
            const tunePool = level < 4 ? TUNES : level < 7 ? ["333", "666", "699", "969", "996"] : ["699", "969", "996"];
            const oppTune = tunePool[Math.floor(Math.random() * tunePool.length)];
            const trackID = trackIDs[Math.floor(Math.random() * trackIDs.length)];

            // reqs: CR cap (tightening past the opponent) + property reqs
            const reqs = {};
            const capDelta = Math.round(80 - t * 160);
            let capStart = 1, capEnd = Math.max(100, oppCar.cr + capDelta);
            if (themeCr) {
                capStart = Math.max(capStart, themeCr.start);
                capEnd = Math.min(capEnd, themeCr.end);
                if (capEnd <= capStart) capEnd = themeCr.end;
            }
            reqs.cr = { start: capStart, end: capEnd };

            const reqCount = t < 0.3 ? 1 : t < 0.75 ? 2 : 3;
            const keys = [...reqPalette].sort(() => Math.random() - 0.5).slice(0, reqCount);
            let reqCarID, sampleTries = 0;
            do {
                reqCarID = universe[Math.floor(Math.random() * universe.length)];
                sampleTries++;
            } while (!reqCheck(getCar(reqCarID), { cr: reqs.cr }) && sampleTries < 200);
            for (const key of keys) {
                const built = buildReq(key, getCar(reqCarID), hard);
                if (built !== null) reqs[key] = built;
            }
            if (theme) Object.assign(reqs, structuredClone(theme.baseReqs), { cr: reqs.cr });
            // hard-round spice on unthemed events: plain cards only
            if (!theme && hard && Math.random() < 0.25) {
                reqs.cardType = ["normal"];
            }

            const track = getTrack(trackID);
            const oppStats = getTuned(oppID, oppTune);
            const result = analyzeRound(oppStats, track, reqs, universe);

            if (result.solvers === 0) continue;
            // disjointness for tight rounds: no car may answer two of them
            if (result.solvers <= threshold && result.list) {
                if (result.list.some(id => usedSolvers.has(id))) continue;
            }

            const candidate = { opponent: { carID: oppID, upgrade: oppTune }, trackID, reqs, result };
            if (result.solvers >= lo && result.solvers <= hi) {
                chosen = candidate;
            } else {
                const dist = result.solvers < lo ? lo - result.solvers : result.solvers - hi;
                if (!best || dist < best.dist) best = { ...candidate, dist };
            }
        }

        if (!chosen) chosen = best;
        if (!chosen) throw new Error(`round ${round}: no solvable candidate in ${MAX_ATTEMPTS} attempts (universe ${universe.length})`);
        if (chosen.result.solvers <= threshold && chosen.result.list) {
            for (const id of chosen.result.list) usedSolvers.add(id);
        }

        const prizeResult = analyzeRound(getTuned(chosen.opponent.carID, chosen.opponent.upgrade), getTrack(chosen.trackID), chosen.reqs, prizePool);
        rounds.push({
            carID: chosen.opponent.carID,
            upgrade: chosen.opponent.upgrade,
            track: chosen.trackID,
            reqs: chosen.reqs,
            rewards: {},
            pgStats: {
                solvers: chosen.result.solvers,
                prizeSolvers: prizeResult.solvers,
                bestMargin: chosen.result.bestMargin,
                tightestMargin: chosen.result.tightest
            }
        });
    }

    // rewards
    const { perRound, statePatch } = assembleRewards(template, roundCount, context, warnings);
    for (const [round, rewards] of Object.entries(perRound)) {
        rounds[parseInt(round) - 1].rewards = rewards;
    }

    // name
    const counter = (context.counter || 0) + 1;
    const subtitlePool = template.subtitles || [];
    // themed spawns use the theme as subtitle — unless it IS the template name
    // (fixed single-theme templates would read "X I: X" otherwise)
    const subtitle = theme && theme.name !== template.name
        ? theme.name
        : (subtitlePool.length > 0 ? subtitlePool[Math.floor(Math.random() * subtitlePool.length)] : null);
    const name = `${template.name} ${roman(counter)}${subtitle ? `: ${subtitle}` : ""}`;

    return {
        name,
        roster: rounds,
        entryFee: template.entryFee || 0,
        eventType: template.generator || "provinggrounds",
        themeName: theme ? theme.name : null,
        statePatch,
        debug: {
            solverRamp: rounds.map(r => r.pgStats.solvers),
            themeName: theme ? theme.name : null,
            universeSize: universe.length,
            warnings
        }
    };
}

module.exports = { generate };
