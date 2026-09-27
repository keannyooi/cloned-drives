"use strict";

const { getCar } = require("./dataManager.js");
const { calcTune, isValidTune } = require("./calcTune.js");
const { modifiedBase } = require("./cardType.js");
const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js");

// Map sort keys to calcTune result keys
const sortKeyMap = {
    "topSpeed": "topSpeed",
    "0to60": "accel",
    "handling": "handling",
    "weight": "weight",
    "mra": "mra",
    "ola": "ola"
};
// Lower is better for: 0-60, weight, ola (lower = faster launch)
const LOWER_IS_BETTER = new Set(["0to60", "weight", "ola"]);

/**
 * The tunes a list entry holds copies of. Garage entries carry `upgrades`;
 * a few legacy callers pass the tune counts on the object itself; bare IDs
 * (catalogue lists) hold nothing.
 */
function ownedTunes(entry) {
    if (!entry || typeof entry !== "object") return [];
    const counts = entry.upgrades && typeof entry.upgrades === "object" ? entry.upgrades : entry;
    return Object.keys(counts).filter(tune => isValidTune(tune) && counts[tune] > 0);
}

/**
 * A car's value for a tunable stat = the BEST figure among the tunes the
 * player actually owns. Not the highest tune's figure: the engine digit
 * trades OLA for 0-60 (and the chassis digit weight for handling), so a
 * stock Jimny's 61.9 OLA beats its own 996's 69.9 — and a player holding
 * both has a 61.9-OLA car. Catalogue entries and copy-less husks read stock.
 * Unreadable stats sort last in either direction.
 */
function bestTunedValue(entry, base, tuneKey, lowerIsBetter) {
    const tunes = ownedTunes(entry);
    if (tunes.length === 0) tunes.push("000");
    let best = null;
    for (const tune of tunes) {
        const value = calcTune(base, tune)[tuneKey];
        if (typeof value !== "number" || Number.isNaN(value)) continue;
        if (best === null || (lowerIsBetter ? value < best : value > best)) best = value;
    }
    if (best === null) return lowerIsBetter ? Infinity : -Infinity;
    return best;
}

function sortCars(list, sort, order, garage) {
    const lowerIsBetter = LOWER_IS_BETTER.has(sort);
    return list.sort(function (a, b) {
        // Handle both string filenames and objects with carID
        let carIdA = typeof a === "string" ? (a.endsWith('.json') ? a.slice(0, -5) : a) : a.carID;
        let carIdB = typeof b === "string" ? (b.endsWith('.json') ? b.slice(0, -5) : b) : b.carID;
        
        let carA = getCar(carIdA);
        let carB = getCar(carIdB);
        
        // Get base reference for BM cars
        let bmRefA = modifiedBase(carA);
        let bmRefB = modifiedBase(carB);

        let critA, critB;
        
        // Tunable stat: each car ranks by the best figure the player owns
        // across ALL their tunes of it (see bestTunedValue).
        if (sortKeyMap[sort]) {
            const tuneKey = sortKeyMap[sort];
            critA = bestTunedValue(a, bmRefA, tuneKey, lowerIsBetter);
            critB = bestTunedValue(b, bmRefB, tuneKey, lowerIsBetter);
        }
        else if (sort === "duplicates") {
            let upgA, upgB;
            if (garage) {
                const aId = typeof a === "string" ? (a.endsWith('.json') ? a.slice(0, -5) : a.slice(0, 6)) : a.carID;
                const bId = typeof b === "string" ? (b.endsWith('.json') ? b.slice(0, -5) : b.slice(0, 6)) : b.carID;
                upgA = garage.find(c => aId.includes(c.carID));
                upgB = garage.find(c => bId.includes(c.carID));
            }

            if (upgA === 0 && upgB === 0) {
                critA = critB = 0;
            }
            else {
                critA = calcTotal(upgA ?? a);
                critB = calcTotal(upgB ?? b);
            }
        }
        else {
            // Non-tunable stats (cr, driveType, etc.) - use base car values
            critA = bmRefA[sort];
            critB = bmRefB[sort];
        }

        if (critA === critB) {
            return carNameGen({ currentCar: carA }) > carNameGen({ currentCar: carB }) ? 1 : -1;
        }
        else {
            if ((order === "ascending") ? !lowerIsBetter : lowerIsBetter) {
                return critA - critB;
            }
            else {
                return critB - critA;
            }
        }
    });
}

module.exports = sortCars;
module.exports.bestTunedValue = bestTunedValue;   // for tests
