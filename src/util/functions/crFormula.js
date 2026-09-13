"use strict";

/**
 * CR FORMULA — the spreadsheet formula that assigns a car's CR from its stats,
 * transcribed to code (docs/cr-formula.md). CR is NOT hand-set: every carfile's
 * `cr` comes from this. Two variants: normal cars, and Drag-tyre cars.
 *
 * Column map of the sheet: J = ola, K = 0-60, L = mra, M = topSpeed,
 * N = weight, O = gc, P/Q = abs/tcs ("No" = absent), R = tyreType,
 * S = driveType, T = handling.
 *
 *   const { computeCR } = require("./crFormula.js");
 *   computeCR(carObject) -> integer CR (or null if a stat is missing)
 *
 * Verified 2026-09-05: 93.3% of live base cars reproduce exactly; the rest are
 * BOSS cars and hand-nudged files. `node scripts/crFormula.js` re-runs that
 * check (or prints one car's breakdown) — the script is a thin CLI over this.
 * Runtime users: car submissions (carSubmissionValidator.js) compute a
 * creator's CR from their stats rather than trusting a typed number.
 */

// 0-60 penalty (K = seconds). Slower = bigger penalty; 2.4 s = 0; faster = bonus.
function accelPenalty(K, forDrag) {
    if (K > 24) return 61.75 + 4 / 3 + 7.5 / 0.7 + (K - 24) / 25;
    if (K > 18.5) return 59 + 4 / 3 + 7.5 / 0.7 + (K - 18.5) / 2;
    if (K > 11) return 59 + 4 / 3 + (K - 11) / 0.7;
    if (K > 9) return 53 + 2 / 3 + (K - 9) / 0.3;
    if (K > 7.5) return 47 + 2 / 3 + (K - 7.5) / (forDrag ? 0.5 : 0.25);   // the one piece that differs for drag cars
    if (K > 6.5) return 41 + (K - 6.5) / 0.15;
    return (K - 2.4) / 0.1;
}

// Handling penalty (T). 92 = 0; above 92 = bonus.
function handlingPenalty(T) {
    if (T < 55) return 22 + (55 - T) / 4;
    if (T < 70) return 14 + 2 / 3 + (70 - T) / 2.5;
    return (92 - T) / 1.5;
}

const DRIVE_PENALTY = { FWD: 3, RWD: 4, AWD: -2 };                    // 4WD = 0
const TYRE_PENALTY = { Standard: -7, "Off-Road": -18, "All-Surface": -11, Slick: -2 };   // Performance / Drag = 0

function weightPenalty(N) {
    return N > 2000 ? 5 / 350 + (N - 2000) / 750 : (N - 1995) / 350;
}

/** Full breakdown of the formula terms (in "points"; CR = points × 10, truncated). */
function breakdown(car) {
    const M = car.topSpeed, K = car["0to60"], T = car.handling, N = car.weight, L = car.mra, J = car.ola;
    for (const v of [M, K, T, N, L, J]) if (typeof v !== "number" || Number.isNaN(v)) return null;
    const isDrag = (car.tyreType || "Standard") === "Drag";
    const terms = {
        base: 100,
        topSpeed: -(261 - M) / 15,
        accel: -(M < 60 ? 74 : accelPenalty(K, isDrag)),
        mra: -(M < 100 ? 5 : (109.09 - L) / 20),
        ola: -(M < 60 ? 0 : (J - 91.67) / 20)
    };
    if (isDrag) {
        terms.gc = car.gc === "Medium" ? 3.5 : car.gc === "High" ? 5.5 : 0;
    }
    else {
        terms.handling = -handlingPenalty(T);
        terms.drive = -(DRIVE_PENALTY[car.driveType] ?? 0);
        terms.tyre = -(TYRE_PENALTY[car.tyreType] ?? 0);
        terms.weight = -weightPenalty(N);
        terms.tcs = car.tcs ? 0 : -0.5;
        terms.abs = car.abs ? 0 : -0.5;
        terms.gc = car.gc === "Medium" ? 7 : car.gc === "High" ? 11 : 0;
    }
    const points = Object.values(terms).reduce((a, b) => a + b, 0);
    let cr;
    if (isDrag) {
        // =TRUNC(((core*10)*1.0355)-153) + T/10 + N/-1000, then whole CR
        cr = Math.trunc(Math.trunc(points * 10 * 1.0355 - 153) + T / 10 - N / 1000);
    }
    else {
        cr = Math.trunc(points * 10);
    }
    // Practical floor: the sheet can go negative for pre-war cars and novelty
    // vehicles; those ship at CR 1.
    cr = Math.max(1, cr);
    return { isDrag, terms, points, cr };
}

function computeCR(car) {
    const b = breakdown(car);
    return b ? b.cr : null;
}

module.exports = { computeCR, breakdown, accelPenalty, handlingPenalty, weightPenalty, DRIVE_PENALTY, TYRE_PENALTY };
