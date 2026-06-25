"use strict";

/**
 * PROVING GROUNDS — solvability-checked gauntlet generator (prototype)
 * ====================================================================
 * Generates a seeded weekly gauntlet of N rounds (opponent + track + reqs) where
 * EVERY round is verified winnable with obtainable, NON-PRIZE cars, and difficulty
 * ramps by shrinking the number of cars that can win:
 *
 *   round  1: thousands of cars can win   (warm-up)
 *   round 20: a handful of cars can win   (collection check)
 *
 * Unlike randomrace (which intentionally produces unwinnable rounds — that's what
 * the Skip button is for), each candidate round here is validated by brute force:
 * for every obtainable non-prize car, for every tune, does it pass the reqs AND
 * beat the opponent on this track? If no car does, the round is rejected and
 * rerolled. The solver count is the difficulty metric.
 *
 * Same seed → same gauntlet, so a weekly cron can publish one gauntlet for the
 * whole server and the bot can re-derive it from the week string alone.
 *
 * Mirrors the same game logic as simulateEconomy.js (race.js evalScore,
 * filterCheck.js req semantics) — keep in sync with rebalances.
 *
 * Usage:
 *   node provingGrounds.js [--rounds 20] [--week 2026-W24 | --seed 123]
 *                          [--out provingGrounds.json]
 */

const fs = require("fs");
const { initialize, getCar, getTrack, getCarFiles, getTrackFiles } = require("../src/util/functions/dataManager.js");
const { calcTune } = require("../src/util/functions/calcTune.js");
const { isPackable, isPrizeLike, usesReferenceStats } = require("../src/util/functions/cardType.js");
const { driveHierarchy, gcHierarchy, weatherVars } = require("../src/util/consts/consts.js");

initialize("./src");

// ─── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function argVal(name, fallback) {
    const i = argv.indexOf(`--${name}`);
    if (i === -1 || i === argv.length - 1) return fallback;
    return argv[i + 1];
}
const ROUNDS = parseInt(argVal("rounds", "20"), 10);
const OUT_PATH = argVal("out", "provingGrounds.json");

// Default seed = current ISO week, so "this week's gauntlet" is reproducible
function isoWeekString(d = new Date()) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
const WEEK = argVal("week", isoWeekString());
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const SEED = parseInt(argVal("seed", String(hashStr(WEEK))), 10);

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rng = mulberry32(SEED);

// ─── Mirrored game logic (same as simulateEconomy.js) ───────────────────────

const ZERO_PENS = { drivePen: 0, absPen: 0, tcsPen: 0, tyrePen: {} };

function evalScore(player, opponent, track) {     // MIRRORS race.js evalScore v2.0
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
function getTuned(carID, tune) {
    const key = `${carID}|${tune}`;
    let hit = tunedCache.get(key);
    if (hit) return hit;
    const car = getCar(carID);
    const t = calcTune(car, tune);
    hit = {
        carID, cr: car.cr || 0,
        topSpeed: t.topSpeed, accel: t.accel, handling: t.handling,
        weight: t.weight, mra: t.mra, ola: t.ola,
        gc: car.gc || "Medium", driveType: car.driveType || "RWD",
        tyreType: car.tyreType || "Standard",
        abs: car.abs ? 1 : 0, tcs: car.tcs ? 1 : 0
    };
    tunedCache.set(key, hit);
    return hit;
}

function reqCheck(car, reqs) {                    // MIRRORS filterCheck.js semantics
    for (const [key, value] of Object.entries(reqs)) {
        if (Array.isArray(value)) {
            let arr = car[key];
            if (!Array.isArray(arr)) arr = [arr];
            arr = arr.map(t => t ? String(t).toLowerCase() : "");
            if (!value.every(tag => arr.includes(String(tag).toLowerCase()))) return false;
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

// ─── Car pools ──────────────────────────────────────────────────────────────

const allCarIDs = getCarFiles().map(f => f.slice(0, 6));
const trackIDs = getTrackFiles().map(f => f.slice(0, 6));

// "Obtainable non-prize": what any player can hold without event/prize exclusives.
// Excludes BM variants (race as their base car anyway), prize cars, inactive cars,
// and diamonds (feature disabled).
const obtainable = allCarIDs.filter(id => {
    const c = getCar(id);
    return isPackable(c) && (c.cr || 0) > 0;
});
const prizeCars = allCarIDs.filter(id => {
    const c = getCar(id);
    return isPrizeLike(c);
});

// Opponents can be anything with stats (incl. prize/boss cars — they're AI)
const opponentPool = allCarIDs.filter(id => {
    const c = getCar(id);
    return !usesReferenceStats(c) && (c.cr || 0) > 0;
});

function carName(id) {
    const c = getCar(id);
    const make = Array.isArray(c.make) ? c.make[0] : c.make;
    return `${c.modelYear} ${make} ${c.model} (CR ${c.cr})`;
}

// ─── Round solvability analysis — the check randomrace doesn't have ─────────
// A car "solves" a round if it passes the reqs and ANY tune beats the opponent.

function analyzeRound(opponentStats, track, reqs, pool) {
    let solvers = 0, bestMargin = -Infinity, tightest = Infinity;
    const examples = [];
    for (const id of pool) {
        const car = getCar(id);
        if (!reqCheck(car, reqs)) continue;
        let carBest = -Infinity, carBestTune = null;
        for (const tune of TUNES) {
            const s = evalScore(getTuned(id, tune), opponentStats, track);
            if (s > carBest) { carBest = s; carBestTune = tune; }
        }
        if (carBest > 0) {
            solvers++;
            if (carBest < tightest) tightest = carBest;
            if (carBest > bestMargin) bestMargin = carBest;
            if (examples.length < 400) examples.push({ carID: id, tune: carBestTune, margin: carBest });
        }
    }
    examples.sort((a, b) => b.margin - a.margin);
    return { solvers, bestMargin, tightest, examples };
}

// ─── Requirement templates ──────────────────────────────────────────────────
// Like randomrace, req values are sampled from a real car so they're never
// vacuous — but unlike randomrace, the solvability check has the final word.

const REQ_KEYS = ["make", "bodyStyle", "country", "driveType", "tyreType", "gc", "enginePos", "fuelType", "seatCount", "modelYear", "tags"];

function buildReq(key, reqCar, hard) {
    const v = reqCar[key];
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

function generateCandidate(roundNum, totalRounds) {
    const f = (roundNum - 1) / Math.max(1, totalRounds - 1);    // 0 → 1 difficulty
    const hard = f > 0.5;

    // Opponent: CR band climbs with difficulty; tunes get meaner late
    const minCr = Math.round(250 + f * 950);                    // r1 ~250 → r20 ~1200
    const maxCr = minCr + 300;
    let oppID, oppCar, tries = 0;
    do {
        oppID = opponentPool[Math.floor(rng() * opponentPool.length)];
        oppCar = getCar(oppID);
        tries++;
    } while ((oppCar.cr < minCr || oppCar.cr > maxCr) && tries < 4000);
    const tunePool = f < 0.35 ? TUNES : f < 0.7 ? ["333", "666", "699", "969", "996"] : ["699", "969", "996"];
    const oppTune = tunePool[Math.floor(rng() * tunePool.length)];

    const trackID = trackIDs[Math.floor(rng() * trackIDs.length)];

    // Reqs: 1 key early, up to 3 late, plus a CR cap that tightens past the
    // opponent (late rounds demand underdog wins)
    const reqs = {};
    const crDelta = Math.round(80 - f * 160);                   // +80 → −80
    reqs.cr = { start: 1, end: Math.max(100, oppCar.cr + crDelta) };

    const reqCount = f < 0.3 ? 1 : f < 0.75 ? 2 : 3;
    const keys = [...REQ_KEYS].sort(() => rng() - 0.5).slice(0, reqCount);
    let reqCarID;
    do { reqCarID = obtainable[Math.floor(rng() * obtainable.length)]; }
    while (!reqCheck(getCar(reqCarID), { cr: reqs.cr }));       // sample req values from a car inside the CR cap
    const reqCar = getCar(reqCarID);
    for (const key of keys) {
        const built = buildReq(key, reqCar, hard);
        if (built !== null) reqs[key] = built;
    }

    return { opponent: { carID: oppID, upgrade: oppTune }, trackID, reqs };
}

// Difficulty schedule: target band of NON-PRIZE solver counts per round
function solverBand(roundNum, totalRounds) {
    const f = (roundNum - 1) / Math.max(1, totalRounds - 1);
    if (f < 0.25) return [800, Infinity];
    if (f < 0.50) return [200, 800];
    if (f < 0.70) return [50, 200];
    if (f < 0.85) return [10, 50];
    if (f < 0.97) return [3, 12];
    return [1, 5];
}

// ─── Generate the gauntlet ──────────────────────────────────────────────────

console.log(`\nPROVING GROUNDS GENERATOR — week ${WEEK}, seed ${SEED}`);
console.log(`Solver universe: ${obtainable.length} obtainable non-prize cars (${prizeCars.length} prize cars excluded from the guarantee)\n`);

const MAX_ATTEMPTS = 600;
const gauntlet = [];
const t0 = Date.now();

for (let round = 1; round <= ROUNDS; round++) {
    const [lo, hi] = solverBand(round, ROUNDS);
    let best = null;        // closest candidate with ≥1 solver, as fallback
    let chosen = null;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS && !chosen) {
        attempts++;
        const cand = generateCandidate(round, ROUNDS);
        const track = getTrack(cand.trackID);
        const oppStats = getTuned(cand.opponent.carID, cand.opponent.upgrade);
        const result = analyzeRound(oppStats, track, cand.reqs, obtainable);

        if (result.solvers === 0) continue;                     // impossible — reroll
        if (result.solvers >= lo && result.solvers <= hi) {
            chosen = { ...cand, result };
        } else {
            const dist = result.solvers < lo ? lo - result.solvers : result.solvers - hi;
            if (!best || dist < best.dist) best = { ...cand, result, dist };
        }
    }

    if (!chosen && best) {
        chosen = best;
        chosen.relaxed = true;
    }
    if (!chosen) {
        console.error(`Round ${round}: could not generate ANY solvable candidate in ${MAX_ATTEMPTS} attempts — widen templates`);
        process.exit(1);
    }

    // How much do prize cars trivialize this round?
    const prizeResult = analyzeRound(getTuned(chosen.opponent.carID, chosen.opponent.upgrade), getTrack(chosen.trackID), chosen.reqs, prizeCars);
    chosen.prizeSolvers = prizeResult.solvers;
    chosen.attempts = attempts;
    chosen.round = round;
    gauntlet.push(chosen);

    const track = getTrack(chosen.trackID);
    const reqDesc = Object.entries(chosen.reqs)
        .map(([k, v]) => {
            if (Array.isArray(v)) return `${k}=${v.join(",")}`;
            if (typeof v === "object") return `${k} ${v.start}-${v.end}`;
            return `${k}=${v}`;
        }).join(" | ");
    const ex = chosen.result.examples[0];
    const tight = chosen.result.examples[chosen.result.examples.length - 1];
    console.log(`R${String(round).padStart(2)} ${chosen.relaxed ? "⚠" : " "} [${String(chosen.result.solvers).padStart(4)} solvers, ${chosen.attempts} tries] ${track.trackName} (${track.weather} ${track.surface})`);
    console.log(`      vs ${carName(chosen.opponent.carID)} [${chosen.opponent.upgrade}]`);
    console.log(`      reqs: ${reqDesc}`);
    console.log(`      best: ${carName(ex.carID)} [${ex.tune}] +${ex.margin} | tightest: ${carName(tight.carID)} [${tight.tune}] +${tight.margin} | prize-car solvers: +${chosen.prizeSolvers}`);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

// ─── Persist for the bot to consume ─────────────────────────────────────────

const out = {
    week: WEEK,
    seed: SEED,
    generated: new Date().toISOString(),
    rounds: gauntlet.map(g => ({
        round: g.round,
        trackID: g.trackID,
        trackName: getTrack(g.trackID).trackName,
        opponent: g.opponent,
        reqs: g.reqs,
        stats: {
            nonPrizeSolvers: g.result.solvers,
            prizeSolvers: g.prizeSolvers,
            bestMargin: g.result.bestMargin,
            tightestMargin: g.result.tightest,
            // admin spoilers: top winning picks
            solutions: g.result.examples.slice(0, 5)
        }
    }))
};
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`\nGauntlet verified: every round winnable with non-prize cars.`);
console.log(`Written to ${OUT_PATH} — generated in ${elapsed}s\n`);
