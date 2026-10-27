"use strict";

/**
 * GARAGE WRITE — save a garage change by sending only what changed (2026-10-27).
 *
 * Commands used to persist with `{ garage: playerData.garage, ... }`: the
 * WHOLE garage back, ~900 KB for a veteran, to change one tune count. This
 * diffs the garage the command READ against the garage it BUILT and sends
 * just the per-car tune deltas, applied on the server in one atomic write:
 *
 *   - rows are matched by carID ON THE SERVER, so a car the caller thought
 *     was new but the garage already holds gets its counts added — a carID
 *     can never gain a second row (duplicates break cd-sethand / cd-carinfo /
 *     cd-sell);
 *   - every decrement is GUARDED in the query filter (the stored count must
 *     still cover it), so a stale copy can never drive a count negative.
 *     A failed guard returns { ok: false } — the command's existing
 *     "your garage changed while you were deciding" path;
 *   - a row is removed only if the caller removed it AND its stored counts
 *     really reach zero;
 *   - money/fuse/trophies go as deltas ($add), never an absolute value built
 *     from a stale read.
 *
 * Retries are idempotent: each call stamps `lastGarageOp` with a one-time ID
 * and filters on it, so a retry after an ambiguous failure (applied, but
 * reported as an error) cannot apply the change twice.
 *
 * Two cases fall back to writing `after` whole:
 *   - a garage that already holds duplicate rows (callers' addCars heals them);
 *   - a diff of more than BIG_DIFF cars (bulk dupe sells): matching every row
 *     against the change list grows with rows × changes, and past ~1,000
 *     changes on a 7,800-row garage it is slower than the upload (measured:
 *     800 changes 0.5s, 3,000 changes 5.9s, wholesale 0.9-1.5s). That write is
 *     guarded by the profile's cacheStamp instead — refused if anything wrote
 *     since the caller's read — when the caller passes baseStamp.
 *
 * The profile cache is told the result (profileCache.writeWithHeavy), so the
 * player's next command still hits the cache.
 */

const crypto = require("crypto");
const profileModel = require("../../models/profileSchema.js");
const { writeWithHeavy, HEAVY_FIELDS } = require("./profileCache.js");
const { PIPELINE_OPTIONS } = require("./rewardPipelines.js");
const { carSave } = require("../consts/consts.js");

// A changed row with no usable upgrades object starts from every tune at 0 —
// exactly how addCars heals it — so server and caller agree on the shape.
const ZERO_UPGRADES = Object.fromEntries(Object.keys(carSave).map(tune => [tune, 0]));

const BIG_DIFF = 1000;

const rowsByID = garage => {
    const map = new Map();
    for (const row of garage || []) {
        if (row && row.carID) map.set(row.carID, row);
    }
    return map;
};
const countsOf = row => (row && row.upgrades && typeof row.upgrades === "object" ? row.upgrades : {});

/** True when two garage rows share a carID. */
function hasDuplicateRows(garage) {
    return rowsByID(garage).size !== (garage || []).filter(row => row && row.carID).length;
}

/**
 * The difference between two garages: per-carID tune deltas, the carIDs the
 * caller removed, and the rows the caller added (as built).
 */
function diffGarage(before, after) {
    const old = rowsByID(before), next = rowsByID(after);
    const changes = [];    // { carID, delta: { tune: n } }
    const removed = [];
    const added = [];
    for (const carID of new Set([...old.keys(), ...next.keys()])) {
        const was = countsOf(old.get(carID)), now = countsOf(next.get(carID));
        const delta = {};
        for (const tune of new Set([...Object.keys(was), ...Object.keys(now)])) {
            const d = (Number(now[tune]) || 0) - (Number(was[tune]) || 0);
            if (d !== 0) delta[tune] = d;
        }
        if (!next.has(carID)) removed.push(carID);
        if (!old.has(carID)) added.push(next.get(carID));
        if (Object.keys(delta).length > 0 || !old.has(carID)) changes.push({ carID, delta });
    }
    return { changes, removed, added };
}

/**
 * One pipeline $set stage applying a diff to the stored garage. Changed rows
 * are found with $indexOfArray (one lookup per row, however many cars change).
 */
function garageDiffStage({ changes, removed, added }) {
    if (changes.length === 0 && removed.length === 0) return null;
    const ids = changes.map(change => change.carID);
    const deltas = changes.map(change => change.delta);
    // Value of key $$k in an object given as $objectToArray pairs, else 0.
    const valueIn = pairs => ({
        "$ifNull": [{ "$arrayElemAt": [{ "$map": { input: { "$filter": { input: pairs, as: "p", cond: { "$eq": ["$$p.k", "$$k"] } } }, as: "p", in: "$$p.v" } }, 0] }, 0]
    });
    const applied = {
        "$map": {
            input: "$$orig",
            as: "car",
            in: {
                "$let": {
                    vars: { i: { "$indexOfArray": [{ "$literal": ids }, "$$car.carID"] } },
                    in: {
                        "$cond": [{ "$lt": ["$$i", 0] }, "$$car", {
                            "$let": {
                                vars: {
                                    up: { "$objectToArray": { "$cond": [{ "$eq": [{ "$type": "$$car.upgrades" }, "object"] }, "$$car.upgrades", { "$literal": ZERO_UPGRADES }] } },
                                    dl: { "$objectToArray": { "$arrayElemAt": [{ "$literal": deltas }, "$$i"] } }
                                },
                                in: {
                                    "$mergeObjects": ["$$car", {
                                        upgrades: {
                                            "$arrayToObject": {
                                                "$concatArrays": [
                                                    // existing tunes, in place, plus their delta
                                                    { "$map": { input: "$$up", as: "u", in: { "$let": { vars: { k: "$$u.k" }, in: { k: "$$u.k", v: { "$add": [{ "$ifNull": ["$$u.v", 0] }, valueIn("$$dl")] } } } } } },
                                                    // tunes the row did not have yet, appended (as addCars does)
                                                    { "$filter": { input: "$$dl", as: "d", cond: { "$not": [{ "$in": ["$$d.k", "$$up.k"] }] } } }
                                                ]
                                            }
                                        }
                                    }]
                                }
                            }
                        }]
                    }
                }
            }
        }
    };
    const total = { "$sum": { "$map": { input: { "$objectToArray": { "$cond": [{ "$eq": [{ "$type": "$$row.upgrades" }, "object"] }, "$$row.upgrades", {}] } }, as: "t", in: "$$t.v" } } };
    const kept = removed.length === 0 ? applied : {
        "$filter": {
            input: applied,
            as: "row",
            cond: { "$not": [{ "$and": [{ "$in": ["$$row.carID", { "$literal": removed }] }, { "$lte": [total, 0] }] }] }
        }
    };
    return {
        "$set": {
            garage: {
                "$let": {
                    vars: { orig: { "$ifNull": ["$garage", []] } },
                    in: {
                        "$concatArrays": [kept, {
                            "$filter": { input: { "$literal": added }, as: "new", cond: { "$not": [{ "$in": ["$$new.carID", { "$ifNull": ["$$orig.carID", []] }] }] } }
                        }]
                    }
                }
            }
        }
    };
}

/** Query-filter clauses proving every decrement is still covered by the stored counts. */
function decrementGuards(changes) {
    const guards = [];
    for (const { carID, delta } of changes) {
        const need = {};
        for (const [tune, d] of Object.entries(delta)) {
            if (d < 0) need[`upgrades.${tune}`] = { "$gte": -d };
        }
        if (Object.keys(need).length > 0) guards.push({ garage: { "$elemMatch": { carID, ...need } } });
    }
    return guards;
}

/**
 * Persist a garage change (plus any light-field changes) in one write.
 *
 * @param {Object}  args
 * @param {string}  args.userID
 * @param {Array}   args.before   the garage as READ (deep copy taken before mutating)
 * @param {Array}   args.after    the garage the command built
 * @param {Object} [args.inc]     numeric deltas, e.g. { money: -500, trophies: 2 }
 * @param {Object} [args.set]     fields to overwrite (dotted paths ok), e.g. { hand, decks }
 * @param {Object} [args.push]    arrays to append to, e.g. { unclaimedRewards: [entry] }
 * @param {Array}  [args.stages]  extra pipeline $set stages (rewardPipelines helpers)
 * @param {Object} [args.filter]  extra query conditions, e.g. { money: { $gte: cost } }
 * @param {Object} [args.expect]  fields that must still hold the value the caller READ, e.g.
 *   { hand: handAsRead, decks: decksAsRead } — pass this for every field in `set` built from
 *   the read, so a change that landed in between is refused instead of overwritten.
 * @param {Array}  [args.returning] fields to read back from the written document in the same
 *   round trip (e.g. ["money"] for an exact balance to display); returned as `doc`.
 * @param {number} [args.baseStamp] cacheStamp the caller's copy came from (see writeWithHeavy)
 * @returns {Promise<{ ok: boolean, stamp: number|null, doc?: Object }>} ok=false when a guard
 *   failed (the stored garage/balance/expected fields no longer match) — nothing was written.
 */
async function saveGarage({ userID, before, after, inc = {}, set = {}, push = {}, stages: extra = [], filter = {}, expect = {}, returning = null, baseStamp }) {
    const opID = crypto.randomUUID();
    const duplicateRows = hasDuplicateRows(before);
    let diff = duplicateRows ? null : diffGarage(before, after);
    const bigDiff = diff !== null && diff.changes.length > BIG_DIFF;
    if (bigDiff) diff = null;

    // userID stays top-level: profileCache.onWrite reads it to scope the cache
    // update (a filter without it would clear the whole cache). Wholesale
    // writes get no per-row guards; both kinds (a duplicate-row garage, a big
    // diff) are guarded by the stamp instead, so a write that landed during
    // the caller's dialog is never overwritten.
    const clauses = [{ lastGarageOp: { "$ne": opID } }];
    if (Object.keys(filter).length > 0) clauses.push(filter);
    for (const [field, value] of Object.entries(expect)) {
        if (value !== undefined) clauses.push({ [field]: value });
    }
    if (diff) clauses.push(...decrementGuards(diff.changes));
    else if ((bigDiff || duplicateRows) && baseStamp !== undefined && baseStamp !== null) clauses.push({ cacheStamp: baseStamp });
    const query = { userID, "$and": clauses };

    const stages = [];
    if (diff) {
        const garageStage = garageDiffStage(diff);
        if (garageStage) stages.push(garageStage);
    }
    else {
        stages.push({ "$set": { garage: { "$literal": after } } });
    }
    const incSet = {};
    for (const [field, d] of Object.entries(inc)) {
        if (d) incSet[field] = { "$add": [{ "$ifNull": [`$${field}`, 0] }, d] };
    }
    const plainSet = { lastGarageOp: opID };
    for (const [field, value] of Object.entries(set)) plainSet[field] = { "$literal": value };
    for (const [field, values] of Object.entries(push)) {
        if (values.length > 0) plainSet[field] = { "$concatArrays": [{ "$ifNull": [`$${field}`, []] }, { "$literal": values }] };
    }
    stages.push({ "$set": { ...incSet, ...plainSet } });
    stages.push(...extra.filter(Boolean));

    const heavy = { garage: after };
    for (const field of Object.keys(set)) {
        if (HEAVY_FIELDS.includes(field)) heavy[field] = set[field];
    }

    let stamp = baseStamp ?? null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const { result, stamp: newStamp } = await writeWithHeavy(userID, heavy, () => (returning
                ? profileModel.findOneAndUpdate(query, stages, {
                    ...PIPELINE_OPTIONS, returnDocument: "after", lean: true,
                    projection: Object.fromEntries(returning.map(field => [field, 1]))
                })
                : profileModel.updateOne(query, stages, PIPELINE_OPTIONS)), stamp);
            const matched = returning ? result !== null : result.matchedCount > 0;
            if (matched) return { ok: true, stamp: newStamp, ...(returning ? { doc: result } : {}) };
            // Matched nothing: either a guard failed, or an earlier attempt
            // already landed (its opID is now stored) — tell them apart.
            if (attempt > 1) {
                const stored = await profileModel.findOne({ userID }, { lastGarageOp: 1 }).lean();
                if (stored && stored.lastGarageOp === opID) {
                    const doc = returning ? await profileModel.findOne({ userID }, Object.fromEntries(returning.map(field => [field, 1]))).lean() : undefined;
                    return { ok: true, stamp: null, ...(returning ? { doc } : {}) };
                }
            }
            return { ok: false, stamp };
        }
        catch (error) {
            lastError = error;
            stamp = null;   // unknown outcome — never chain a voucher from it
            if (attempt === 1) console.error(`[garageWrite] write for ${userID} failed, retrying once:`, error.message);
        }
    }
    throw lastError;
}

/**
 * hand/decks around a garage change: snapshot them before updateHands runs,
 * then get the saveGarage `set` + `expect` for whichever of them it changed.
 * Only changed fields are written, and only if they still hold the value the
 * command read — so a cd-sethand/cd-deck that landed during the confirm dialog
 * is refused (the "changed while you were deciding" path), never reverted.
 */
function snapshotHandDecks(profile) {
    return { hand: JSON.stringify(profile.hand), decks: JSON.stringify(profile.decks) };
}
function handDeckChanges(profile, snapshot) {
    const set = {}, expect = {};
    for (const field of ["hand", "decks"]) {
        if (JSON.stringify(profile[field]) !== snapshot[field]) {
            set[field] = profile[field];
            if (snapshot[field] !== undefined) expect[field] = JSON.parse(snapshot[field]);
        }
    }
    return { set, expect };
}

module.exports = { saveGarage, diffGarage, garageDiffStage, decrementGuards, hasDuplicateRows, snapshotHandDecks, handDeckChanges };
