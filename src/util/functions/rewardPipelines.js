"use strict";

/**
 * REWARD PIPELINES — server-side versions of the cd-rewards writes, as
 * aggregation-pipeline update stages (2026-10-27).
 *
 * cd-rewards used to persist by writing the WHOLE garage back: once per pack
 * and again at the end, even for a money-only claim. That is an ~880 KB upload
 * for a veteran, so a 46-pack claim moved ~40 MB. These stages send only what
 * changed, and do the merge on the server:
 *
 *   - garageMergeStage: addCars, server side. A car the garage already holds
 *     gets its tune counts incremented; a car it does not hold is appended.
 *     "Holds" is decided against the SERVER's garage at write time, never the
 *     caller's copy, so this can never create a second row for a carID —
 *     duplicate rows break cd-sethand, cd-carinfo and cd-sell.
 *   - consumeNumericStages: consumeRewards.js, server side — the same
 *     per-entry decrement and fallback order, then the husk sweep.
 *
 * Every stage is plain data, so one updateOne can carry a pack's cars AND its
 * entry removal (one atomic write — the pack-loss fix), or a whole claim's
 * currencies, cars, drivers and consumption.
 *
 * Mongoose 9 rejects array updates unless the query sets
 * `{ updatePipeline: true }` (PIPELINE_OPTIONS). Literals go through $literal
 * so stored data can never be read as an expression.
 */

const { carSave } = require("../consts/consts.js");

const TUNES = Object.keys(carSave);
const PIPELINE_OPTIONS = { updatePipeline: true };

const zeroUpgrades = () => Object.fromEntries(TUNES.map(tune => [tune, 0]));
const arrayOf = field => ({ "$ifNull": [`$${field}`, []] });

/**
 * carID -> { tune: count }, in first-seen order. Tunes normalise exactly as
 * addCars does (unknown or missing -> "000").
 */
function countCars(cars) {
    const counts = new Map();
    for (const { carID, upgrade } of cars) {
        if (!carID) continue;
        const tune = TUNES.includes(upgrade) ? upgrade : "000";
        if (!counts.has(carID)) counts.set(carID, {});
        const tunes = counts.get(carID);
        tunes[tune] = (tunes[tune] || 0) + 1;
    }
    return counts;
}

/**
 * $set stage merging `cars` ([{ carID, upgrade }]) into the garage, matching
 * addCars: existing rows gain counts (a missing/invalid upgrades object is
 * healed to zeros first), new carIDs append as { carID, upgrades } with
 * zeroed tunes. Returns null when there is nothing to add.
 *
 * Assumes the stored garage has one row per carID (addCars' tripwire heals
 * duplicates in memory; callers fall back to a wholesale $set when it fires).
 */
function garageMergeStage(cars) {
    const counts = countCars(cars);
    if (counts.size === 0) return null;

    const branches = [];
    const newRows = [];
    for (const [carID, tunes] of counts) {
        const bumped = {};
        for (const [tune, count] of Object.entries(tunes)) {
            bumped[tune] = { "$add": [{ "$ifNull": [{ "$getField": { field: tune, input: "$$up" } }, 0] }, count] };
        }
        branches.push({
            case: { "$eq": ["$$car.carID", { "$literal": carID }] },
            then: { "$mergeObjects": ["$$car", { upgrades: { "$mergeObjects": ["$$up", bumped] } }] }
        });
        newRows.push({ carID, upgrades: { ...zeroUpgrades(), ...tunes } });
    }

    return {
        "$set": {
            garage: {
                "$concatArrays": [
                    {
                        "$map": {
                            input: arrayOf("garage"),
                            as: "car",
                            in: {
                                "$let": {
                                    vars: {
                                        up: {
                                            "$cond": [
                                                { "$eq": [{ "$type": "$$car.upgrades" }, "object"] },
                                                "$$car.upgrades",
                                                { "$literal": zeroUpgrades() }
                                            ]
                                        }
                                    },
                                    in: { "$switch": { branches, default: "$$car" } }
                                }
                            }
                        }
                    },
                    {
                        "$filter": {
                            input: { "$literal": newRows },
                            as: "row",
                            cond: { "$not": [{ "$in": ["$$row.carID", { "$ifNull": ["$garage.carID", []] }] }] }
                        }
                    }
                ]
            }
        }
    };
}

/**
 * $set stage for discoveredCars. With `replaceWith` (a profile whose list was
 * empty and got initialised from the garage in memory), writes that list
 * outright; otherwise appends whichever of `carIDs` are not discovered yet.
 */
function discoveredStage(carIDs, replaceWith = null) {
    if (replaceWith) return { "$set": { discoveredCars: { "$literal": replaceWith } } };
    const unique = [...new Set(carIDs)];
    if (unique.length === 0) return null;
    return {
        "$set": {
            discoveredCars: {
                "$concatArrays": [
                    arrayOf("discoveredCars"),
                    {
                        "$filter": {
                            input: { "$literal": unique },
                            as: "id",
                            cond: { "$not": [{ "$in": ["$$id", arrayOf("discoveredCars")] }] }
                        }
                    }
                ]
            }
        }
    };
}

/**
 * $set stage removing unclaimedRewards entries by rid, plus legacy rid-less
 * entries by exact match (what $pullAll did). Null when there is nothing to pull.
 */
function pullRewardsStage(rids = [], legacyEntries = []) {
    if (rids.length === 0 && legacyEntries.length === 0) return null;
    const keep = [];
    if (rids.length > 0) keep.push({ "$not": [{ "$in": ["$$entry.rid", { "$literal": rids }] }] });
    for (const legacy of legacyEntries) keep.push({ "$ne": ["$$entry", { "$literal": legacy }] });
    return {
        "$set": {
            unclaimedRewards: {
                "$filter": { input: arrayOf("unclaimedRewards"), as: "entry", cond: { "$and": keep } }
            }
        }
    };
}

/**
 * $set stage adding `values` to the array at dotted `path` (created when
 * missing), skipping ones already there — what `$addToSet: { $each }` did.
 */
function addToSetStage(path, values) {
    const unique = [...new Set(values)];
    if (unique.length === 0) return null;
    const current = { "$ifNull": [`$${path}`, []] };
    return {
        "$set": {
            [path]: {
                "$concatArrays": [current, {
                    "$filter": { input: { "$literal": unique }, as: "v", cond: { "$not": [{ "$in": ["$$v", current] }] } }
                }]
            }
        }
    };
}

/**
 * Index of the first entry of `list` (a $$ variable) satisfying `predicate`,
 * which reads the candidate as $$x; -1 when none does.
 */
const firstIndex = (list, predicate) => ({
    "$indexOfArray": [{ "$map": { input: list, as: "x", in: predicate } }, true]
});

/**
 * One consumption ($$c = { key, amount, origin }) applied to $$list, for a
 * known reward key (field names must be constants in agg expressions).
 * Decrements the FIRST entry of that origin holding >= amount; failing that
 * the first holding > 0, then the first with the key at all — the old
 * per-entry loop's fallback order. A missing origin matches entries with no
 * origin (null and missing compare equal through $ifNull).
 */
function consumeOne(key) {
    const field = `$$x.${key}`;
    const sameOrigin = { "$eq": [{ "$ifNull": ["$$x.origin", null] }, { "$ifNull": ["$$c.origin", null] }] };
    const holds = { "$and": [sameOrigin, { "$isNumber": field }, { "$gte": [field, "$$c.amount"] }] };
    const positive = { "$and": [sameOrigin, { "$isNumber": field }, { "$gt": [field, 0] }] };
    const present = { "$and": [sameOrigin, { "$ne": [{ "$type": field }, "missing"] }] };
    const index = {
        "$let": {
            vars: { a: firstIndex("$$list", holds) },
            in: {
                "$cond": [{ "$gte": ["$$a", 0] }, "$$a", {
                    "$let": {
                        vars: { b: firstIndex("$$list", positive) },
                        in: { "$cond": [{ "$gte": ["$$b", 0] }, "$$b", firstIndex("$$list", present)] }
                    }
                }]
            }
        }
    };
    return {
        "$let": {
            vars: { i: index },
            in: {
                "$cond": [{ "$lt": ["$$i", 0] }, "$$list", {
                    "$map": {
                        input: { "$range": [0, { "$size": "$$list" }] },
                        as: "j",
                        in: {
                            "$let": {
                                vars: { entry: { "$arrayElemAt": ["$$list", "$$j"] } },
                                in: {
                                    "$cond": [
                                        { "$eq": ["$$j", "$$i"] },
                                        // $mergeObjects keeps the key in place, so the
                                        // entry stays reward-key-first (rewards.js reads Object.keys(entry)[0]).
                                        { "$mergeObjects": ["$$entry", { [key]: { "$subtract": [{ "$ifNull": [`$$entry.${key}`, 0] }, "$$c.amount"] } }] },
                                        "$$entry"
                                    ]
                                }
                            }
                        }
                    }
                }]
            }
        }
    };
}

/**
 * consumeRewards.js, server side, as TWO stages however many entries were
 * claimed (this Atlas tier rejects update pipelines longer than 50 stages):
 *   1. $reduce over the consumed list ({ key, amount, origin }), applying each
 *      consumption in order — so two same-origin entries are consumed one
 *      each, exactly as the old per-entry loop did;
 *   2. the husk sweep: drop entries whose value for a consumed key fell to
 *      <= 0, as `$pull { key: { $lte: 0 } }` did (numbers only).
 */
function consumeNumericStages(consumedNumeric) {
    if (consumedNumeric.length === 0) return [];
    const keys = [...new Set(consumedNumeric.map(num => num.key))];
    const consumptions = consumedNumeric.map(({ key, amount, origin }) => (origin === undefined ? { key, amount } : { key, amount, origin }));
    return [
        {
            "$set": {
                unclaimedRewards: {
                    "$reduce": {
                        input: { "$literal": consumptions },
                        initialValue: arrayOf("unclaimedRewards"),
                        in: {
                            "$let": {
                                vars: { list: "$$value", c: "$$this" },
                                in: {
                                    "$switch": {
                                        branches: keys.map(key => ({ case: { "$eq": ["$$c.key", key] }, then: consumeOne(key) })),
                                        default: "$$list"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        {
            "$set": {
                unclaimedRewards: {
                    "$filter": {
                        input: arrayOf("unclaimedRewards"),
                        as: "entry",
                        cond: {
                            "$not": [{
                                "$or": keys.map(key => ({ "$and": [{ "$isNumber": `$$entry.${key}` }, { "$lte": [`$$entry.${key}`, 0] }] }))
                            }]
                        }
                    }
                }
            }
        }
    ];
}

module.exports = { garageMergeStage, discoveredStage, pullRewardsStage, addToSetStage, consumeNumericStages, countCars, PIPELINE_OPTIONS };
