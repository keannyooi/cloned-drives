"use strict";

/**
 * PROFILE CACHE — the fix for "the bot is slow" (2026-09-02 diagnosis).
 *
 * The database link is throttled to ~90 KB/s, and a veteran's profile is
 * ~900 KB because of three arrays: garage (up to ~7,800 entries),
 * discoveredCars and decks. Every command used to pull the whole document
 * (10+ seconds for those players) before doing anything.
 *
 * This module caches ONLY those three arrays, in memory, validated by a
 * stamp:
 *   - every profile write bumps `cacheStamp` (query hooks in profileSchema.js
 *     — no write site needs to know about the cache);
 *   - getProfile() fetches everything EXCEPT the heavy arrays (a few KB,
 *     one round trip — that fetch includes the stamp), and serves the arrays
 *     from memory only when the stamp matches what was cached.
 * A stamp mismatch means someone else wrote the profile (a second bot
 * process on the shared DB, a script) — the arrays are re-fetched. Wrong
 * answers are impossible; the only failure mode is a cache miss.
 *
 * Write-through: a write that replaces a heavy array wholesale updates the
 * cached copy; any other touch of a heavy array (operators, dotted paths)
 * drops the entry. Reads hand out DEEP COPIES — a command that mutates its
 * garage and then fails to write must not leave a phantom in the cache.
 *
 * Returned profiles are plain objects (lean) with schema defaults applied,
 * never mongoose documents. Nothing in the codebase calls document methods
 * on profiles (audited 2026-09-02), and hydrating 7,800 subdocuments per
 * command was its own CPU problem on the shared host.
 */

const profileModel = require("../../models/profileSchema.js");

const HEAVY_FIELDS = ["garage", "discoveredCars", "decks"];
const LIGHT_PROJECTION = Object.fromEntries(HEAVY_FIELDS.map(f => [f, 0]));
const HEAVY_PROJECTION = Object.fromEntries(HEAVY_FIELDS.map(f => [f, 1]));
const MAX_ENTRIES = 400;                 // ~60 MB is the whole player base; this is plenty
const MAX_AGE_MS = 15 * 60 * 1000;       // safety net against any writer that bypasses the hooks

/** userID -> { stamp, at, heavy: { garage, discoveredCars, decks } } */
const cache = new Map();
const stats = { hits: 0, misses: 0, writeThroughs: 0, invalidations: 0 };

// Schema defaults for lean objects (mongoose only applies them on hydration).
// Object/array defaults are deep-cloned per profile so nothing is shared.
const DEFAULTS = [];
for (const [path, schemaType] of Object.entries(profileModel.schema.paths)) {
    if (path === "_id" || path === "__v") continue;
    const value = schemaType.getDefault(undefined, false);
    // getDefault() hands back Proxy-backed mongoose arrays — flatten once here.
    if (value !== undefined) DEFAULTS.push([path, clone(value)]);
}
function withDefaults(doc) {
    for (const [path, value] of DEFAULTS) {
        if (doc[path] === undefined) {
            doc[path] = (value !== null && typeof value === "object") ? clone(value) : value;
        }
    }
    return doc;
}

// Deep copy that also flattens mongoose values: after casting, an update's
// array is a Proxy-backed MongooseArray, which structuredClone refuses.
function clone(value) {
    if (value == null) return value;
    if (typeof value.toObject === "function") value = value.toObject({ depopulate: true });
    try {
        return structuredClone(value);
    }
    catch (_) {
        return JSON.parse(JSON.stringify(value));
    }
}

function remember(userID, stamp, heavy) {
    if (cache.size >= MAX_ENTRIES && !cache.has(userID)) {
        // Map iterates in insertion order — the first key is the oldest entry.
        cache.delete(cache.keys().next().value);
    }
    cache.delete(userID);   // re-insert so it becomes the newest
    cache.set(userID, { stamp, at: Date.now(), heavy });
}

/** A stamp unique enough that two writers in the same millisecond still differ. */
function newStamp() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

/**
 * Full profile for one player, as a plain object with defaults applied.
 * Heavy arrays come from the cache when the stamp proves they are current.
 * @returns {Promise<Object|null>} null when the player has no profile
 */
async function getProfile(userID) {
    const light = await profileModel.findOne({ userID }, LIGHT_PROJECTION).lean();
    if (!light) return null;

    const entry = cache.get(userID);
    const fresh = entry
        && light.cacheStamp !== undefined
        && entry.stamp === light.cacheStamp
        && Date.now() - entry.at < MAX_AGE_MS;

    let heavy;
    if (fresh) {
        stats.hits++;
        heavy = entry.heavy;
    }
    else {
        stats.misses++;
        heavy = await profileModel.findOne({ userID }, HEAVY_PROJECTION).lean() || {};
        let stamp = light.cacheStamp;
        if (stamp === undefined) {
            // Never stamped (pre-cache profile): stamp it now so the next read
            // can hit. The write hook records the stamp on this entry.
            remember(userID, null, heavy);
            await profileModel.updateOne({ userID }, { cacheStamp: newStamp() });
        }
        else {
            remember(userID, stamp, heavy);
        }
    }

    const profile = { ...light };
    for (const field of HEAVY_FIELDS) {
        if (heavy[field] !== undefined) profile[field] = clone(heavy[field]);
    }
    return withDefaults(profile);
}

/**
 * Called by profileSchema.js query hooks AFTER a successful write.
 * @param {Object} filter   the query filter
 * @param {Object} update   the update (raw, as passed by the caller)
 * @param {number} stamp    the cacheStamp the pre-hook injected
 * @param {boolean} modified whether the write matched/modified anything
 */
function onWrite(filter, update, stamp, modified) {
    if (!modified) return;
    const userID = filter && typeof filter.userID === "string" ? filter.userID : null;
    if (!userID) {
        // Multi-user or unusual filter (updateMany rollovers) — start over.
        if (cache.size > 0) stats.invalidations += cache.size;
        cache.clear();
        return;
    }
    const entry = cache.get(userID);
    if (!entry) return;

    if (!update || Array.isArray(update)) {   // aggregation-pipeline update: can't reason about it
        cache.delete(userID);
        stats.invalidations++;
        return;
    }
    // Wholesale replacements ({ garage: [...] } or { $set: { garage: [...] } })
    // update the cached copy; anything else touching a heavy field drops it.
    const replaced = {};
    let touchedOtherwise = false;
    for (const [key, value] of Object.entries(update)) {
        const isOperator = key.startsWith("$");
        const fields = isOperator && value && typeof value === "object" ? Object.keys(value) : [key];
        for (const field of fields) {
            const root = field.split(".")[0];
            if (!HEAVY_FIELDS.includes(root)) continue;
            if (field === root && (key === "$set" || !isOperator)) {
                replaced[root] = isOperator ? value[root] : value;
            }
            else {
                touchedOtherwise = true;
            }
        }
    }
    if (touchedOtherwise) {
        cache.delete(userID);
        stats.invalidations++;
        return;
    }
    for (const [field, value] of Object.entries(replaced)) {
        entry.heavy[field] = clone(value);
    }
    if (Object.keys(replaced).length > 0) stats.writeThroughs++;
    entry.stamp = stamp;
    entry.at = Date.now();
}

/** Called by profileSchema.js after deletes. */
function onDelete(filter) {
    const userID = filter && typeof filter.userID === "string" ? filter.userID : null;
    if (userID) cache.delete(userID);
    else cache.clear();
}

function invalidate(userID) {
    if (userID === undefined) cache.clear();
    else cache.delete(userID);
}

function cacheStats() {
    return { ...stats, entries: cache.size };
}

module.exports = { getProfile, onWrite, onDelete, invalidate, newStamp, cacheStats, HEAVY_FIELDS };
