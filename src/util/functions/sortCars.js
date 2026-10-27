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

/**
 * Sorts `list` in place and returns it. Decorate-sort-undecorate: each
 * entry's sort key is computed once up front instead of on both sides of
 * every comparison (~108k of them for the full catalogue). The comparator
 * keeps the old semantics exactly — including the tie-break never returning
 * 0 — so the same TimSort run yields the same order, ties included.
 */
function sortCars(list, sort, order, garage) {
    // A 0/1-entry list never reaches the comparator, so compute nothing for it.
    if (list.length < 2) return list;
    const lowerIsBetter = LOWER_IS_BETTER.has(sort);
    const tuneKey = sortKeyMap[sort];
    const ascending = (order === "ascending") ? !lowerIsBetter : lowerIsBetter;

    // carID -> FIRST garage row with it, as garage.find returned (duplicate-row
    // garages exist). Exact match stands in for the old includes(): carIDs are 6 chars.
    let garageMap;
    if (sort === "duplicates" && garage) {
        garageMap = new Map();
        for (const row of garage) {
            if (row && !garageMap.has(row.carID)) garageMap.set(row.carID, row);
        }
    }

    // sort() moves undefined entries to the end without comparing them; keep that.
    const decorated = [];
    let undefinedCount = 0;
    for (const entry of list) {
        if (entry === undefined) {
            undefinedCount++;
            continue;
        }
        // Handle both string filenames and objects with carID
        const carID = typeof entry === "string" ? (entry.endsWith('.json') ? entry.slice(0, -5) : entry) : entry.carID;
        const car = getCar(carID);
        // Get base reference for BM cars
        const bmRef = modifiedBase(car);

        let crit;
        // Tunable stat: each car ranks by the best figure the player owns
        // across ALL their tunes of it (see bestTunedValue).
        if (tuneKey) {
            crit = bestTunedValue(entry, bmRef, tuneKey, lowerIsBetter);
        }
        else if (sort === "duplicates") {
            let row;
            if (garageMap) {
                // Bare strings key on their first 6 chars here, unlike getCar above.
                const dupID = typeof entry === "string" ? (entry.endsWith('.json') ? entry.slice(0, -5) : entry.slice(0, 6)) : entry.carID;
                row = garageMap.get(dupID);
            }
            crit = calcTotal(row ?? entry);
        }
        else {
            // Non-tunable stats (cr, driveType, etc.) - use base car values
            crit = bmRef[sort];
        }
        // name is only needed on ties; filled lazily.
        decorated.push({ entry, car, crit, name: undefined });
    }

    const nameOf = d => d.name ?? (d.name = carNameGen({ currentCar: d.car }));
    decorated.sort(function (a, b) {
        if (a.crit === b.crit) {
            return nameOf(a) > nameOf(b) ? 1 : -1;
        }
        return ascending ? a.crit - b.crit : b.crit - a.crit;
    });

    let i = 0;
    for (const d of decorated) list[i++] = d.entry;
    while (i < list.length) list[i++] = undefined;
    return list;
}

module.exports = sortCars;
module.exports.bestTunedValue = bestTunedValue;   // for tests
