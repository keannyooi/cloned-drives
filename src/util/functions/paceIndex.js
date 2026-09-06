"use strict";

/**
 * PACE INDEX (PI) — how good a car is right now, from the real race formula.
 * Design: docs/pace-index.md.
 *
 * Every term of evalScore (race.js / pgGenerator.js) is a difference of
 * per-car quantities, so race(A, B) = S(A) − S(B) for an exact per-car,
 * per-track score S. Ranking every car on every track is therefore a sort,
 * not a tournament: ~8k cars × 6 tunes × 225 tracks in well under a second.
 *
 *   PI      = PEAK: the mean finish percentile over the car's best ten
 *             tracks, percentile-ranked against every other car's best ten
 *             and scaled 0–9999 (ten = the size of the smallest discipline,
 *             the sprint set). "How good is this car at what it is best at."
 *             A drag king reads ~9200 even though it is last on 200 tracks.
 *   average = the mean finish percentile over ALL tracks × 9999 — the
 *             versatility number, shown beside PI. Both are relative by
 *             construction: a stronger newcomer lowers what it beats at the
 *             next compute, and neither inflates when tracks are added.
 *   stars   = VALUE, not pace: podium points inside requirement niches (one
 *             niche per family, weighted by the niche's share of cars) plus
 *             "best under each CR ceiling" points, ÷ tracks, banded into 10
 *             deciles among cars that scored at all. 0 = never the best pick
 *             for anything.
 *
 * Rated: base cars only. BM cards read their base car's entry; BOSS cars
 * (opponent-only) are excluded so they cannot hog podiums nobody can claim.
 * Computed once at startup (index.js). Nothing is persisted.
 */

const { getCarFiles, getCar, getTrackFiles, getTrack } = require("./dataManager.js");
const { modifiedBase, isBMCar, getBaseType } = require("./cardType.js");
const { calcTune, getAvailableTunes } = require("./calcTune.js");
const { weatherVars, driveHierarchy, gcHierarchy } = require("../consts/consts.js");

const PODIUM = [16, 9, 5, 2, 1];          // top 5 in a niche, per track
const SAVER = [3, 1.5, 1.2, 0.8, 0.3];     // top 5 under a CR ceiling, per track
const CEILING_MAX = 1500, CEILING_STEP = 10;
const TOP_TRACKS = 3, KING_LIST_CAP = 300;   // keep every crown — cd-pi reveals them behind a button
const PEAK_TRACKS = 10;                    // headline = mean over the car's best ten tracks

// Mirrors pgGenerator's RARITY_BRACKETS (CR bands)
const RARITY_BRACKETS = [
    ["Standard", 1, 99], ["Common", 100, 249], ["Uncommon", 250, 399], ["Rare", 400, 549],
    ["Epic", 550, 699], ["Exotic", 700, 849], ["Legendary", 850, 999], ["Mystic", 1000, Infinity]
];
function bracketOf(cr) {
    for (const [name, lo, hi] of RARITY_BRACKETS) if (cr >= lo && cr <= hi) return name;
    return "Standard";
}

// One niche per family — the axes an event requirement can name. Every car
// sits in exactly one niche per family, so no car can farm more podiums than
// another by membership alone (the reason the R Score needed thirty patches).
const FAMILIES = [
    { key: "global", label: "all cars", of: () => "all" },
    { key: "rarity", label: "rarity", of: c => bracketOf(c.cr || 0) },
    { key: "tyre", label: "tyre", of: c => c.tyreType || "Standard" },
    { key: "drive", label: "drive", of: c => c.driveType || "RWD" },
    { key: "gc", label: "ground clearance", of: c => c.gc || "Medium" },
    { key: "body", label: "body style", of: c => (Array.isArray(c.bodyStyle) ? c.bodyStyle[0] : c.bodyStyle) || "Other" },
    { key: "fuel", label: "fuel", of: c => c.fuelType || "Petrol" }
];

const SURFACE_LABELS = { asphalt: "Asphalt", wet: "Wet", loose: "Loose", drag: "Drag", timetrial: "Time Trial" };
function surfaceFamily(track) {
    const weather = String(track.weather), surface = String(track.surface);
    if (weather === "TT") return "timetrial";
    if (surface === "Drag") return "drag";
    if (surface === "Asphalt" || surface === "Track") return weather === "Rainy" ? "wet" : "asphalt";
    return "loose";   // Dirt / Gravel / Sand / Snow / Ice, any weather
}

let entries = new Map();      // base carID -> PI entry
let peakDistribution = [];    // sorted best-ten means of the live field (for rating outsiders)
let summary = { cars: 0, tracks: 0, ms: 0, computedAt: null };

/**
 * Per-car half of evalScore for one tuned variant on one track. The MPH
 * threshold tracks are tiered exactly as the engine decides them: above the
 * end speed the normal formula applies, otherwise pure top speed, with a
 * crossed threshold beating any car that has not crossed it.
 */
function scoreVariant(v, track, pens, mph) {
    const d = track.specsDistr;
    let s = v.ts / 2 * (d.topSpeed / 100)
        - v.ac * 8 * (d["0to60"] / 100)
        + v.ha * 1.2 * (d.handling / 100)
        - v.we / 30 * (d.weight / 100)
        + v.mra / 6 * (d.mra / 100)
        - v.ola / 10 * (d.ola / 100);
    if (v.low) s -= track.speedbumps * 10;
    s -= v.gcI * track.humps * 10;
    s -= v.drI * pens.drivePen;
    s -= (pens.tyrePen[v.tyre] || 0);
    if (d.handling > 0) s += v.abs * pens.absPen;
    s += v.tcs * pens.tcsPen;
    if (mph) {
        if (v.ts >= mph.end) return 2e6 + s;
        if (v.ts >= mph.start) return 1e6 + v.ts;
        return v.ts;
    }
    return s;
}

function mphOf(track) {
    if (!/MPH/.test(track.trackName)) return null;
    const [a, b] = track.trackName.split("-");
    return { start: parseInt(a), end: parseInt(b) };
}

function variantsOf(car, tunes) {
    const base = modifiedBase(car);
    return tunes.map(tune => {
        const t = calcTune(base, tune);
        return {
            ts: t.topSpeed, ac: t.accel, ha: t.handling, we: t.weight, mra: t.mra, ola: t.ola,
            gcI: gcHierarchy.indexOf(base.gc), low: String(base.gc).toLowerCase() === "low",
            drI: driveHierarchy.indexOf(base.driveType), tyre: base.tyreType || "Standard",
            abs: base.abs ? 1 : 0, tcs: base.tcs ? 1 : 0
        };
    });
}

/** The live roster: base cars only (BM cards read their base; BOSS excluded). */
function liveRoster() {
    const cars = [];
    for (const file of getCarFiles()) {
        const car = getCar(file.slice(0, 6));
        if (!car || isBMCar(car) || getBaseType(car) === "BOSS") continue;
        cars.push(car);
    }
    return cars;
}
function liveTracks() {
    return getTrackFiles().map(file => getTrack(file.slice(0, -5))).filter(Boolean);
}

/**
 * Build the full table for an arbitrary field of cars — pure, no module
 * state. computePaceIndex() feeds it the live roster; scripts/pendingPI.js
 * feeds it live + staged cars to rate a whole batch as if it had shipped.
 */
function computeTable(cars, tracks) {
    const t0 = Date.now();
    const tunes = getAvailableTunes();
    const n = cars.length;
    const T = tracks.length;
    if (n === 0 || T === 0) return { entries: new Map(), peakSorted: [], n, T, ms: 0 };

    const variants = cars.map(car => variantsOf(car, tunes));
    const cr = new Int32Array(n);
    const niche = FAMILIES.map(() => new Array(n));
    const nicheSize = FAMILIES.map(() => new Map());
    for (let i = 0; i < n; i++) {
        cr[i] = cars[i].cr || 0;
        FAMILIES.forEach((f, fi) => {
            const key = f.of(cars[i]);
            niche[fi][i] = key;
            nicheSize[fi].set(key, (nicheSize[fi].get(key) || 0) + 1);
        });
    }

    // accumulators
    const pctSum = new Float64Array(n);
    const bestTen = Array.from({ length: n }, () => []);   // ascending, ≤ PEAK_TRACKS entries
    const famSum = {}, famCount = {};
    for (const key of Object.keys(SURFACE_LABELS)) { famSum[key] = new Float64Array(n); famCount[key] = 0; }
    const kingCount = new Int32Array(n), kingTracks = Array.from({ length: n }, () => []), kingTied = Array.from({ length: n }, () => []);
    const value = new Float64Array(n);
    const nicheWins = FAMILIES.map(() => new Int32Array(n));
    const nichePct = FAMILIES.map(() => new Float64Array(n));
    const bestCeiling = new Int32Array(n), bestCeilingTracks = new Int32Array(n);
    const top = Array.from({ length: n }, () => []);
    const ceilings = [];
    for (let c = CEILING_MAX; c >= CEILING_STEP; c -= CEILING_STEP) ceilings.push(c);

    const S = new Float64Array(n);
    const order = new Int32Array(n);
    const ceilState = ceilings.map(() => ({ count: 0, lastS: NaN, lastPos: 0, closed: false }));

    for (const track of tracks) {
        const pens = weatherVars[`${track.weather} ${track.surface}`] || { drivePen: 0, absPen: 0, tcsPen: 0, tyrePen: {} };
        const mph = mphOf(track);
        for (let i = 0; i < n; i++) {
            let best = -Infinity;
            for (const v of variants[i]) { const s = scoreVariant(v, track, pens, mph); if (s > best) best = s; }
            S[i] = best;
            order[i] = i;
        }
        order.sort((a, b) => S[b] - S[a]);

        const family = surfaceFamily(track);
        famCount[family]++;
        const leaderS = S[order[0]];
        let leaders = 1;
        while (leaders < n && S[order[leaders]] === leaderS) leaders++;
        // per family: niche -> { count, lastS, lastPos } so tied members share a position
        const seen = FAMILIES.map(() => new Map());
        let rank = 1;
        for (let k = 0; k < n; k++) {
            const i = order[k];
            if (k > 0 && S[i] < S[order[k - 1]]) rank = k + 1;   // competitive ranking, ties share
            const tied = (k > 0 && S[i] === S[order[k - 1]]) || (k + 1 < n && S[order[k + 1]] === S[i]);
            const pct = 1 - (rank - 1) / n;
            pctSum[i] += pct;
            famSum[family][i] += pct;
            // best-ten window for the peak headline
            const ten = bestTen[i];
            if (ten.length < PEAK_TRACKS) { ten.push(pct); if (ten.length === PEAK_TRACKS) ten.sort((a, b) => a - b); }
            else if (pct > ten[0]) {
                let k = 1;
                while (k < PEAK_TRACKS && ten[k] < pct) { ten[k - 1] = ten[k]; k++; }
                ten[k - 1] = pct;
            }
            if (rank === 1) {
                kingCount[i]++;
                if (kingTracks[i].length < KING_LIST_CAP) { kingTracks[i].push(track.trackName); kingTied[i].push(leaders > 1); }
            }
            // top tracks: best RANK first, then closest to the leader — an elite
            // car is #5 on a hundred tracks, so raw percentile ties them all
            const list = top[i];
            const gap = leaderS - S[i];
            const last = list[list.length - 1];
            if (list.length < TOP_TRACKS || rank < last.rank || (rank === last.rank && gap < last.gap)) {
                list.push({ trackName: track.trackName, pct, rank, gap, tied });
                list.sort((a, b) => a.rank - b.rank || a.gap - b.gap);
                if (list.length > TOP_TRACKS) list.pop();
            }
            // niche podiums + within-niche percentile
            for (let fi = 0; fi < FAMILIES.length; fi++) {
                const key = niche[fi][i];
                let st = seen[fi].get(key);
                if (!st) { st = { count: 0, lastS: NaN, lastPos: 0 }; seen[fi].set(key, st); }
                st.count++;
                const pos = st.count > 1 && S[i] === st.lastS ? st.lastPos : st.count;
                st.lastS = S[i]; st.lastPos = pos;
                const size = nicheSize[fi].get(key);
                nichePct[fi][i] += 1 - (pos - 1) / size;
                if (pos === 1) nicheWins[fi][i]++;
                if (pos <= 5) value[i] += PODIUM[pos - 1] * (size / n);
            }
        }
        // CR savers: walking best-first, a car takes the next position of every
        // ceiling at or above its CR; an equal score shares the previous position
        for (const st of ceilState) { st.count = 0; st.lastS = NaN; st.lastPos = 0; st.closed = false; }
        let open = ceilings.length;
        for (let k = 0; k < n && open > 0; k++) {
            const i = order[k];
            for (let ci = 0; ci < ceilings.length; ci++) {
                const st = ceilState[ci];
                if (st.closed || ceilings[ci] < cr[i]) continue;
                st.count++;
                const pos = st.count > 1 && S[i] === st.lastS ? st.lastPos : st.count;
                st.lastS = S[i]; st.lastPos = pos;
                if (pos > 5) { st.closed = true; open--; continue; }
                value[i] += SAVER[pos - 1];
                if (pos === 1) {
                    const c = ceilings[ci];
                    if (c > bestCeiling[i]) { bestCeiling[i] = c; bestCeilingTracks[i] = 1; }
                    else if (c === bestCeiling[i]) bestCeilingTracks[i]++;
                }
            }
        }
    }

    // peak headline: mean of the best ten, ranked against the field (ties share)
    const peakRaw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const ten = bestTen[i];
        peakRaw[i] = ten.length ? ten.reduce((a, b) => a + b, 0) / ten.length : 0;
    }
    const peakSorted = Array.from(peakRaw).sort((a, b) => a - b);
    const rankPeak = v => {
        let lo = 0, hi = peakSorted.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (peakSorted[m] < v) lo = m + 1; else hi = m; }
        return Math.round(((lo + 1) / (peakSorted.length + 1)) * 9999);
    };

    // stars: deciles of value among cars that scored at all
    const scorers = [];
    for (let i = 0; i < n; i++) if (value[i] > 0) scorers.push(i);
    scorers.sort((a, b) => value[a] - value[b]);
    const stars = new Int32Array(n);
    for (let r = 0; r < scorers.length; r++) {
        // ties share the higher band via "count strictly below"
        let below = r;
        while (below > 0 && value[scorers[below - 1]] === value[scorers[r]]) below--;
        stars[scorers[r]] = Math.max(1, Math.ceil(((below + 1) / scorers.length) * 10));
    }

    const next = new Map();
    for (let i = 0; i < n; i++) {
        const surfaces = {};
        for (const key of Object.keys(SURFACE_LABELS)) {
            surfaces[key] = famCount[key] > 0 ? Math.round(famSum[key][i] / famCount[key] * 9999) : null;
        }
        // best niche: most #1 finishes; if none, the best average standing
        let bestNiche = null;
        for (let fi = 1; fi < FAMILIES.length; fi++) {
            const wins = nicheWins[fi][i];
            if (wins > 0 && (!bestNiche || wins > bestNiche.wins)) {
                bestNiche = { family: FAMILIES[fi].label, niche: niche[fi][i], size: nicheSize[fi].get(niche[fi][i]), wins };
            }
        }
        if (!bestNiche) {
            let bestAvg = -1, at = 1;
            for (let fi = 1; fi < FAMILIES.length; fi++) {
                const avg = nichePct[fi][i] / T;
                if (avg > bestAvg) { bestAvg = avg; at = fi; }
            }
            bestNiche = { family: FAMILIES[at].label, niche: niche[at][i], size: nicheSize[at].get(niche[at][i]), wins: 0, topPct: Math.max(1, Math.round((1 - bestAvg) * 100)) };
        }
        next.set(cars[i].carID, {
            pi: rankPeak(peakRaw[i]),
            average: Math.round(pctSum[i] / T * 9999),
            peakRaw: Math.round(peakRaw[i] * 9999),
            stars: stars[i],
            value: Math.round(value[i] / T * 1000) / 1000,
            surfaces,
            trackKing: { count: kingCount[i], tracks: kingTracks[i], tied: kingTied[i] },
            bestNiche,
            bestCeiling: bestCeiling[i] > 0 ? { ceiling: bestCeiling[i], tracks: bestCeilingTracks[i] } : null,
            topTracks: top[i].map(t => ({ trackName: t.trackName, pct: Math.round(t.pct * 9999), rank: t.rank, gap: Math.round(t.gap * 10) / 10, tied: t.tied })),
            field: n
        });
    }
    return { entries: next, peakSorted, n, T, ms: Date.now() - t0 };
}

function computePaceIndex() {
    const table = computeTable(liveRoster(), liveTracks());
    entries = table.entries;
    peakDistribution = table.peakSorted;
    summary = { cars: table.n, tracks: table.T, ms: table.ms, computedAt: new Date() };
    return summary;
}

/** PI entry for any car (BM cards resolve to their base car); null if unrated. */
function getPI(carID) {
    if (!carID) return null;
    const id = carID.endsWith(".json") ? carID.slice(0, -5) : carID.slice(0, 6);
    const car = getCar(id);
    if (!car) return null;
    const key = isBMCar(car) && car.reference ? car.reference : id;
    return entries.get(key) || null;
}

function getPaceSummary() {
    return { ...summary };
}

/** All entries — for the export script only. Never surface this as a ranking. */
function _allEntries() {
    return entries;
}

/**
 * Rank an outsider's best-ten mean (0..1) against the live field — used by
 * scripts/pendingPI.js to rate cars that are not in the game yet.
 */
function rankPeakAgainstField(peakMean) {
    let lo = 0, hi = peakDistribution.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (peakDistribution[m] < peakMean) lo = m + 1; else hi = m; }
    return Math.round(((lo + 1) / (peakDistribution.length + 2)) * 9999);
}

module.exports = {
    computePaceIndex, computeTable, liveRoster, liveTracks, getPI, getPaceSummary, surfaceFamily, SURFACE_LABELS, FAMILIES, PODIUM, SAVER, CEILING_MAX, CEILING_STEP, PEAK_TRACKS, rankPeakAgainstField,
    // internals shared with scripts/tests (scripts/pendingPI.js rates cars that are not in the game yet)
    _allEntries, _scoreVariant: scoreVariant, _variantsOf: variantsOf, _mphOf: mphOf,
    _scoreVariantForTest: scoreVariant, _variantsForTest: variantsOf, _mphForTest: mphOf
};
