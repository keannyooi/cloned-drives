"use strict";

/**
 * RACE WEEK — MATCHUP FEASIBILITY ("sense check")
 * ===============================================
 * Answers one question: is there ANY car in the game, at ANY tune, that both
 * satisfies the round's requirements and actually beats the opponent on this
 * track? If not, the round is unwinnable and must never be handed to a player.
 *
 * This is not a heuristic. It scores candidates with the SAME evalScore the
 * real race uses (exported from pgGenerator, which mirrors race.js), against
 * the SAME tuned stat block, so a "winnable" verdict is a proof by example:
 * the winning car and tune are returned alongside it.
 *
 * Why this was needed — a real round players hit at 103 wins:
 *   requirements CR 1-400, opponent a CR 901 Ferrari 458 Grand-Am [996],
 *   track (TT) Handling (Onroad) at 100% handling weighting.
 *   Best result achievable across all 2,502 eligible cars × 6 tunes: -16.8.
 *
 * Scope: "possible for SOMEONE", not "possible for THIS player". A round that
 * needs a car the player has not collected is hard, not broken; a round no car
 * on earth can win is broken.
 */

const { getCar, getCarFiles } = require("./dataManager.js");
const { evalScore, getTuned } = require("./pgGenerator.js");
const { modifiedBase } = require("./cardType.js");
const filterCheck = require("./filterCheck.js");

// Every tune a player could bring. CR is read off the car's modifiedBase and is
// NOT tune-dependent (filterCheck compares bmReference.cr), so eligibility can
// be decided once per car and every tune stays available to it.
const TUNES = ["000", "333", "666", "699", "969", "996"];

/**
 * Best result any legal hand can achieve against this opponent, as a race
 * margin in points. Returns { score, carID, tune, eligible } where `score` > 0
 * means winnable and carID/tune name the car that proves it.
 *
 * Stops at the first winning car — the common case costs a handful of sims,
 * and only a genuinely impossible round pays for a full sweep.
 */
function bestPossibleResult({ opponent, track, reqs, applyOrLogic = false }) {
    const opp = getTuned(opponent.carID, opponent.upgrade);
    const best = { score: -Infinity, carID: null, tune: null, eligible: 0 };

    for (const file of getCarFiles()) {
        const carID = file.slice(0, 6);

        // A car with no usable stat block can't be a counterexample either way.
        const base = modifiedBase(getCar(carID));
        if (!base) continue;

        let legal;
        try {
            // applyOrLogic mirrors the caller's runtime check — championships filter
            // with OR logic (playchampionship.js), Race Week rounds with AND.
            legal = filterCheck({ car: { carID, upgrade: "000" }, filter: reqs, applyOrLogic });
        }
        catch (error) {
            // filterCheck throws on a malformed range rather than returning
            // false. Treat the whole requirement set as untrustworthy and bail
            // out "winnable" so a bad req can never hard-block the mode.
            console.log(`[RaceWeek] feasibility: unusable requirement set ${JSON.stringify(reqs)} — ${error.message}`);
            return { score: Infinity, carID: null, tune: null, eligible: -1 };
        }
        if (!legal) continue;
        best.eligible++;

        for (const tune of TUNES) {
            const score = evalScore(getTuned(carID, tune), opp, track);
            if (score > best.score) {
                best.score = score;
                best.carID = carID;
                best.tune = tune;
            }
            if (best.score > 0) return best;
        }
    }

    return best;
}

/** True when at least one legal hand beats this opponent on this track. */
function isWinnable(matchup) {
    return bestPossibleResult(matchup).score > 0;
}

module.exports = { isWinnable, bestPossibleResult, TUNES };
