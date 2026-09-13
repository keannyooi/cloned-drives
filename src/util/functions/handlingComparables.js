"use strict";

/**
 * HANDLING COMPARABLES — "where do cars like this sit?"
 * ======================================================
 * Creators set handling by eyeballing it against cars already in the game.
 * This makes that eyeballing explicit and repeatable: for a car (live, or a
 * submission paste without a handling line) it finds the nearest roster cars
 * on the SAME tyre type and reports the spread of their handling. It never
 * returns a single "correct" number — the band, the median and the cars
 * behind them are the answer, and the human still picks.
 *
 *   const { findComparables } = require("./handlingComparables.js");
 *   const result = findComparables(car, { excludeID: car.carID });
 *
 * How "nearest" is measured (a plain distance, no fitted weights): year,
 * weight, 0-60 (log), top speed, clearance, MRA and OLA, each scaled so one
 * unit is roughly a step a creator would call "a bit different"; plus fixed
 * penalties for a different body style (0–4 by kinship: a 550 Barchetta is a
 * sibling of a Rossa, a pickup is not), engine position (+2), drive (+1) and
 * BRAND (+3). On top of the brand penalty, same-brand cars that are
 * reasonably close always hold up to three of the seven band seats, so a
 * Ferrari is judged against Ferraris before Aston Martins (user, 2026-09-12:
 * "a Cayman should not be treated like a Nismo Z"). Tyre type is a hard
 * filter because it is the biggest single driver of handling in the roster.
 * Same-brand cars and same-model-line cars are also reported as their own
 * groups, with their own band. The only hierarchy reported is within the
 * model line (trims): class-wide "floor/ceiling" bounds were tried and
 * removed the same day — a GT3 RS is out-spec'd on every stat by cars it
 * out-handles, because cornering is not implied by straight-line stats.
 *
 * Tested leave-one-out on the live roster (2026-09-12, 976-car sample, brand
 * term on): the band median lands within 3 of the hand-set handling for 87%
 * of cars and within 5 for 94%; the car's own handling sits inside its band
 * for 89%. Better than any formula tried, and it explains itself.
 *
 * Pool: base cars only (BM variants reference a base), no BOSS, no Token /
 * April Fools cards, no novelty vehicles (handling ≤ 10, top speed < 60 mph,
 * weight < 300 kg) — those would poison the neighbourhood of light race cars.
 */

const dataManager = require("./dataManager.js");
const { getBaseType, isBMCar } = require("./cardType.js");

const K = 7;
const GC_INDEX = { Low: 0, Medium: 1, High: 2 };
const EXCLUDED_TAGS = new Set(["Token", "April Fools"]);
// Distance of the 5th-nearest car: below TIGHT the neighbourhood is "tight",
// above THIN it is "thin" (rare combination — read the band with care).
// Calibrated on the live roster 2026-09-12: median (4.0) and 90th percentile
// (8.6) of the 5th-neighbour distance across a 976-car sample.
const TIGHT = 4.0;
const THIN = 8.5;
// Seats in the band reserved for same-brand cars within THIN.
const BRAND_SEATS = 3;
// Body-style kinship: siblings on one platform cost little, unrelated shapes
// cost the full 4 (the game splits open cars into Convertible and Open Air,
// which must not count as different as a coupe and a pickup).
const BODY_KIN = {
    "Convertible|Open Air": 1, "Coupe|Convertible": 2, "Coupe|Open Air": 2,
    "Sedan|Wagon": 1, "Hatchback|Sedan": 2, "Hatchback|Wagon": 2, "Coupe|Hatchback": 2, "Coupe|Sedan": 3,
    "SUV|Wagon": 2, "SUV|Pickup": 2
};

function bodyPenalty(a, b) {
    if (a === b) return 0;
    return BODY_KIN[`${a}|${b}`] ?? BODY_KIN[`${b}|${a}`] ?? 4;
}

function normMake(make) {
    return String(make).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makesOf(car) {
    return (Array.isArray(car.make) ? car.make : [car.make]).map(normMake).filter(Boolean);
}

/** First word of the model, generation suffixes stripped: "911 Carrera S (992)" → "911". */
function familyToken(car) {
    return String(car.model || "").toLowerCase().replace(/\(.*?\)/g, "").trim().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
}

function nameOf(car) {
    return `${Array.isArray(car.make) ? car.make[0] : car.make} ${car.model} (${car.modelYear})`;
}

function vectorOf(car) {
    const num = value => (typeof value === "number" && Number.isFinite(value) ? value : NaN);
    return [
        (num(car.modelYear) - 2000) / 8,
        num(car.weight) / 250,
        Math.log(Math.max(num(car["0to60"]), 0.5)) * 6,
        num(car.topSpeed) / 25,
        (GC_INDEX[car.gc] ?? 1) * 2,
        num(car.mra) / 12,
        num(car.ola) / 10
    ];
}

let pool = null;

function buildPool() {
    const list = [];
    for (const file of dataManager.getCarFiles()) {
        const car = dataManager.getCar(file.replace(/\.json$/, ""));
        if (!car || isBMCar(car)) continue;
        const base = getBaseType(car);
        if (!base || /boss/i.test(base)) continue;
        if (typeof car.handling !== "number" || typeof car.topSpeed !== "number" || typeof car.weight !== "number") continue;
        if (car.handling <= 10 || car.topSpeed < 60 || car.weight < 300) continue;
        if ((car.tags || []).some(tag => EXCLUDED_TAGS.has(tag))) continue;
        list.push({ car, vec: vectorOf(car), makes: makesOf(car), fam: familyToken(car) });
    }
    pool = list;
    return pool;
}

/** Built on first use; call with `true` after a roster reload. */
function getPool(force = false) {
    if (!pool || force) buildPool();
    return pool;
}

/** Squared distance; dimensions either side lacks (no MRA yet, say) are skipped. */
function distance(query, entry) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        const a = query.vec[i], b = entry.vec[i];
        if (Number.isNaN(a) || Number.isNaN(b)) continue;
        const d = a - b;
        sum += d * d;
    }
    const car = entry.car;
    sum += bodyPenalty(query.car.bodyStyle, car.bodyStyle);
    if (car.enginePos !== query.car.enginePos) sum += 2;
    if (car.driveType !== query.car.driveType) sum += 1;
    if (!entry.makes.some(make => query.makes.includes(make))) sum += 3;
    return sum;
}

/** a is at least as good as b in every engine stat, strictly better in one, same setup. */
function dominates(a, b) {
    if (a.tyreType !== b.tyreType || a.bodyStyle !== b.bodyStyle || a.gc !== b.gc || a.driveType !== b.driveType) return false;
    const notWorse = a.weight <= b.weight && a["0to60"] <= b["0to60"] && (a.ola || 0) <= (b.ola || 0)
        && a.topSpeed >= b.topSpeed && (a.mra || 0) >= (b.mra || 0);
    const strictlyBetter = a.weight < b.weight || a["0to60"] < b["0to60"] || a.topSpeed > b.topSpeed;
    return notWorse && strictlyBetter;
}

function summarise(entry, extra = {}) {
    const car = entry.car;
    return {
        carID: car.carID, name: nameOf(car), handling: car.handling, weight: car.weight,
        "0to60": car["0to60"], topSpeed: car.topSpeed, gc: car.gc, ...extra
    };
}

/** One embed line: `**91** · TechArt Cayenne Turbo GT (2022) · 2,280 kg · 2.9 s · 186 mph` (+ "· loose fit" when far). */
function formatLine(summary) {
    const far = typeof summary.distance === "number" && summary.distance > THIN ? " · loose fit" : "";
    return `**${summary.handling}** · ${summary.name} · ${summary.weight.toLocaleString("en")} kg · ${summary["0to60"]} s · ${summary.topSpeed} mph${far}`;
}

function bandOf(list) {
    const values = list.map(n => n.entry.car.handling).sort((a, b) => a - b);
    return values.length ? { min: values[0], max: values[values.length - 1], median: values[Math.floor(values.length / 2)], count: values.length } : null;
}

/**
 * @param {Object} car   a carfile-shaped object (handling may be absent)
 * @param {Object} [options]
 * @param {string} [options.excludeID]  the car's own ID, so it is not its own neighbour
 * @param {number} [options.k]          neighbours in the band (default 7)
 */
function findComparables(car, options = {}) {
    const k = options.k || K;
    const query = { car, vec: vectorOf(car), makes: makesOf(car), fam: familyToken(car) };
    const excludeID = options.excludeID || car.carID || null;
    const sameTyre = getPool().filter(entry => entry.car.tyreType === car.tyreType && entry.car.carID !== excludeID);

    const scored = sameTyre
        .map(entry => ({ entry, d: distance(query, entry), sameBrand: entry.makes.some(make => query.makes.includes(make)) }))
        .sort((a, b) => a.d - b.d);
    // The band: the k closest cars, except that same-brand cars within THIN
    // always take up to BRAND_SEATS of the seats (brand first).
    const seated = scored.filter(n => n.sameBrand && n.d <= THIN).slice(0, BRAND_SEATS);
    const seatIDs = new Set(seated.map(n => n.entry.car.carID));
    const neighbours = [...seated, ...scored.filter(n => !seatIDs.has(n.entry.car.carID))].slice(0, k).sort((a, b) => a.d - b.d);
    const band = bandOf(neighbours);

    const brand = scored.filter(n => n.sameBrand).slice(0, 5);
    const brandBand = brand.length >= 2 ? bandOf(brand) : null;
    const line = scored
        .filter(n => n.sameBrand && query.fam && n.entry.fam === query.fam && Math.abs(n.entry.car.modelYear - car.modelYear) <= 6)
        .sort((a, b) => b.entry.car.handling - a.entry.car.handling);
    const family = line.slice(0, 8);

    // Model-line check — the one hierarchy that holds. Among trims of the
    // same model line (same brand, same first model word, within six years,
    // same tyres), a trim rated ABOVE another trim that beats it on every
    // stat is worth a look. Nothing wider than that: straight-line stats do
    // not bound cornering — a GT3 RS is slower than many cars it out-handles
    // — so there is deliberately no class-wide floor or ceiling (user,
    // 2026-09-12). The car itself joins the check when it has a handling.
    const lineCars = line.map(n => n.entry.car);
    const candidates = typeof car.handling === "number" ? [car, ...lineCars] : lineCars;
    const inversions = [];
    for (const a of candidates) {
        for (const b of candidates) {
            if (a === b || Math.abs(a.modelYear - b.modelYear) > 6) continue;
            if (!dominates(a, b) || !(a.handling < b.handling)) continue;
            inversions.push({ stronger: summarise({ car: a }), higher: summarise({ car: b }), gap: b.handling - a.handling, own: a === car || b === car });
        }
    }
    // The car's own inversions first, then the biggest elsewhere in the line.
    inversions.sort((x, y) => (y.own - x.own) || (y.gap - x.gap));

    const fifth = neighbours[4] ? neighbours[4].d : Infinity;
    const tightness = fifth <= TIGHT ? "tight" : fifth <= THIN ? "loose" : "thin";
    let position = null;
    if (typeof car.handling === "number" && band) {
        position = car.handling < band.min ? "below" : car.handling > band.max ? "above" : "inside";
    }

    return {
        name: nameOf(car),
        tyreType: car.tyreType,
        poolSize: sameTyre.length,
        band,
        brandBand,
        tightness,
        position,
        neighbours: neighbours.map(n => summarise(n.entry, { distance: n.d, sameBrand: n.sameBrand })),
        brand: brand.map(n => summarise(n.entry, { distance: n.d, sameBrand: true })),
        family: family.map(n => summarise(n.entry, { distance: n.d, sameBrand: true })),
        lineCheck: {
            checked: lineCars.length,
            own: inversions.filter(inv => inv.own).slice(0, 3),
            others: inversions.filter(inv => !inv.own).slice(0, 2)
        }
    };
}

module.exports = { findComparables, formatLine, getPool, vectorOf, distance, dominates, nameOf, K, TIGHT, THIN };
