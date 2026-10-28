"use strict";

/**
 * RACE SCORE — the one copy of the race formula
 * ==============================================
 * race.js (the live race), pgGenerator.js (Proving Grounds, Race Week
 * feasibility, cd-testrace), scripts/simulateEconomy.js and
 * scripts/provingGrounds.js all score through evalScore() here. paceIndex.js
 * keeps its own per-car decomposition of the same terms (it ranks the whole
 * field per track); change it alongside this file.
 *
 * Pure module: only consts.js, so the headless scripts can load it.
 *
 * Race Formula v2.0 - Balanced for 6-stat tune system
 *
 * Changes from v1.0:
 * - Top Speed: ÷4.2 → ÷2 (+110% value)
 * - 0-60: ×15 → ×8 (-47% value)
 * - Handling: ×1 → ×1.2 (+20% value)
 * - Weight: ÷50 → ÷30 (+67% value)
 * - MRA: ÷10 → ÷6 (+67% value)
 * - OLA: ÷10 → ÷10 (unchanged)
 *
 * This rebalancing ensures all three max tunes have viable niches:
 * - 996 (Drag): Wins on high TS + 0-60 tracks
 * - 969 (Balanced): Wins on mixed/balanced tracks
 * - 699 (Twisty): Wins on high handling + weight tracks
 *
 * STRICT vs LENIENT (the one intentional difference between the old copies):
 * the live race is strict — a track whose "weather surface" has no weatherVars
 * entry throws, and a tyre type missing from the table scores NaN, which
 * race.js reports to the devs as an erroneous result. The generators and
 * scripts pass { lenient: true }: a missing combo scores as neutral surface
 * (ZERO_PENS) and a missing tyre as 0, so one bad data file can't stop a
 * brute-force search. Keep the live path strict so authoring errors stay loud.
 */

const { weatherVars, driveHierarchy, gcHierarchy } = require("../consts/consts.js");

const ZERO_PENS = Object.freeze({ drivePen: 0, absPen: 0, tcsPen: 0, tyrePen: Object.freeze({}) });

/**
 * Surface/weather penalties for a track. Strict (default) throws on a combo
 * with no weatherVars entry; lenient returns ZERO_PENS instead.
 */
function trackPens(track, lenient = false) {
    const key = `${track["weather"]} ${track["surface"]}`;
    const pens = weatherVars[key];
    if (pens) return pens;
    if (lenient) return ZERO_PENS;
    throw new Error(`No weatherVars entry for "${key}" (track ${track["trackName"]})`);
}

/**
 * Score one race. Positive = player wins by that many points, rounded to 2dp.
 * `options.pens` skips the weatherVars lookup (callers that already resolved
 * it); `options.lenient` see the header.
 */
function evalScore(player, opponent, track, options = {}) {
    const lenient = options.lenient === true;
    const { tcsPen, absPen, drivePen, tyrePen } = options.pens || trackPens(track, lenient);
    const specs = track["specsDistr"];
    let score = 0;

    // === REBALANCED FORMULA v2.0 ===

    // Top Speed: ÷2 (was ÷4.2) - Major buff to high-speed cars
    score += (player.topSpeed - opponent.topSpeed) / 2 * (specs["topSpeed"] / 100);

    // 0-60: ×8 (was ×15) - Major nerf to launch-focused builds
    score += (opponent.accel - player.accel) * 8 * (specs["0to60"] / 100);

    // Handling: ×1.2 (was ×1) - Slight buff to cornering ability
    score += (player.handling - opponent.handling) * 1.2 * (specs["handling"] / 100);

    // Weight: ÷30 (was ÷50) - Buff to lightweight cars
    score += (opponent.weight - player.weight) / 30 * (specs["weight"] / 100);

    // MRA: ÷6 (was ÷10) - Buff to high-speed acceleration
    score += (player.mra - opponent.mra) / 6 * (specs["mra"] / 100);

    // OLA: ÷10 (unchanged) - Off-the-line acceleration
    score += (opponent.ola - player.ola) / 10 * (specs["ola"] / 100);

    // Ground clearance penalties (unchanged)
    if (player.gc.toLowerCase() === "low") {
        score -= (track["speedbumps"] * 10);
    }
    if (opponent.gc.toLowerCase() === "low") {
        score += (track["speedbumps"] * 10);
    }
    score += (gcHierarchy.indexOf(opponent.gc) - gcHierarchy.indexOf(player.gc)) * track["humps"] * 10;

    // Surface/weather modifiers (unchanged)
    score += (driveHierarchy.indexOf(opponent.driveType) - driveHierarchy.indexOf(player.driveType)) * drivePen;
    if (lenient) {
        score += (tyrePen[opponent.tyreType] || 0) - (tyrePen[player.tyreType] || 0);
    }
    else {
        score += (tyrePen[opponent.tyreType] - tyrePen[player.tyreType]);
    }
    if (specs["handling"] > 0) {
        score += (player.abs - opponent.abs) * absPen;
    }
    score += (player.tcs - opponent.tcs) * tcsPen;

    // MPH track special cases (unchanged)
    if (track["trackName"].includes("MPH")) {
        let [startMPH, endMPH] = track["trackName"].split("-");
        startMPH = parseInt(startMPH);
        endMPH = parseInt(endMPH);

        if ((opponent.topSpeed < startMPH && player.topSpeed >= startMPH) || (opponent.topSpeed < endMPH && player.topSpeed >= endMPH)) {
            score = 250;
        }
        else if ((opponent.topSpeed >= startMPH && player.topSpeed < startMPH) || (opponent.topSpeed >= endMPH && player.topSpeed < endMPH)) {
            score = -250;
        }
        else if (opponent.topSpeed < endMPH && player.topSpeed < endMPH) {
            score = player.topSpeed - opponent.topSpeed;
        }
    }

    return Math.round((score + Number.EPSILON) * 100) / 100;
}

module.exports = { evalScore, trackPens, ZERO_PENS };
