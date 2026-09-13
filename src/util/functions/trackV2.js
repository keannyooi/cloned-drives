"use strict";

/**
 * TRACK FILE v2 — one layout, many conditions, nothing typed by feel
 * ====================================================================
 * A v2 track file describes ONE layout once and lists the conditions it can
 * be raced in. The loader expands the file into runtime variants, one per
 * condition, so "Kenya Safari Rally Route (Dirt)" and "(Muddy)" are the same
 * file with two entries instead of two copies with hand-tweaked numbers.
 *
 * The layout is described by COUNTABLE FACTS — corners by type, straights,
 * the start, net climb — never by percentages. The share of a lap spent
 * launching, pulling, flat out, cornering and braking is COMPUTED by lapping
 * the layout with a fixed reference car (`referenceLap`). Authors count; the
 * engine decides what matters. Format reference: src/rrtest/README.md and
 * docs/race-engine-rework.md §3.3a.
 *
 *   const { validateLayout, expandLayout, referenceLap } = require("./trackV2.js");
 *   const report   = validateLayout(layout, { liveTrackIDs });   // { ok, errors, warnings }
 *   const variants = expandLayout(layout);                        // runtime tracks
 *   const lap      = referenceLap(layout);                        // { seconds, shares, ... }
 *
 * Variants carry the live-track fields the display code already reads
 * (trackName, weather, surface, speedbumps, humps, background, map) plus the
 * v2 fields the new engine and the driver conditions read. They carry NO
 * specsDistr on purpose.
 */

const { weatherVars } = require("../consts/consts.js");

const KINDS = ["circuit", "street", "stage", "hillclimb", "drag", "slalom", "oval", "timeTrial", "mphTarget", "rallycross"];
const PHASES = ["launch", "pull", "flatOut", "corners", "transitions"];
const STARTS = ["standing", "rolling"];
const OBSTACLES = ["speedbumps", "humps"];
const ID_PATTERN = /^rt\d{5}$/;
const CONDITION_KEYS = new Set(Object.keys(weatherVars));      // "Sunny Dirt", "Rainy Track", "TT OffRoad" …

// Corner types are defined by the speed a reference car carries through
// them; the arc is the distance spent AT that speed. These are engine
// constants, not something an author sets.
const CORNER_TYPES = {
    tight:  { mph: 35, arcMiles: 0.03 },     // hairpins, chicanes, 90° city corners (~50 m)
    medium: { mph: 60, arcMiles: 0.07 },     // the ordinary corner (~110 m)
    fast:   { mph: 90, arcMiles: 0.12 }      // sweepers, kinks taken with a lift (~190 m)
};

// The reference car that laps every layout to turn facts into shares. One
// car for all tracks so shares are comparable between tracks; its numbers
// are a mid-pack modern sports car and deliberately unremarkable.
const REFERENCE_CAR = { topSpeed: 190, zeroToSixty: 3.5, brakingG: 1.0, flatOutFraction: 0.85, launchUntilMph: 60 };

const MPH = 0.44704, MILE = 1609.344, G = 9.81;
const isInt = value => Number.isInteger(value);
const isNum = value => typeof value === "number" && Number.isFinite(value);
const isText = value => typeof value === "string" && value.trim() !== "";

function conditionKey(condition) {
    return `${condition.weather} ${condition.surface}`;
}

// ─── layout facts ────────────────────────────────────────────────────────────

function cornerArcMiles(corners) {
    return Object.entries(CORNER_TYPES).reduce((sum, [type, def]) => sum + (corners[type] || 0) * def.arcMiles, 0);
}

// Corners may take at most this share of a layout's distance at their standard
// arc lengths. On a road where corners are packed more densely (Pikes Peak: 156
// turns in 12.4 miles, one every 128 m), the arcs are shrunk to fit — the
// count is the fact, the arc length is the model's guess.
const MAX_ARC_SHARE = 0.8;

/** 1 when the standard arcs fit; smaller when corners are packed too densely. */
function arcScale(corners, distance) {
    const arcs = cornerArcMiles(corners || {});
    if (!isNum(distance) || distance <= 0 || arcs <= MAX_ARC_SHARE * distance) return 1;
    return MAX_ARC_SHARE * distance / arcs;
}

/**
 * The straights as a list of miles. Authors may give the list, or a summary
 * { count, longest }: then one straight is `longest` and the others share the
 * remaining distance (track length minus corner arcs) equally.
 */
function straightList(layout, distance) {
    const straights = layout.layout.straights;
    if (Array.isArray(straights)) return straights.slice();
    const count = straights.count, longest = straights.longest;
    const arcs = cornerArcMiles(layout.layout.corners) * arcScale(layout.layout.corners, distance);
    const rest = distance - arcs - longest;
    if (count <= 1) return [Math.max(longest, distance - arcs)];
    return [longest, ...Array(count - 1).fill(Math.max(rest, 0) / (count - 1))];
}

/** Corners in the order they are met: types spread evenly so no straight sees only hairpins. */
function cornerSequence(corners) {
    const sequence = [];
    const remaining = Object.fromEntries(Object.keys(CORNER_TYPES).map(type => [type, corners[type] || 0]));
    const total = Object.values(remaining).reduce((a, b) => a + b, 0);
    for (let i = 0; i < total; i++) {
        let pick = null, worst = -Infinity;
        for (const type of Object.keys(CORNER_TYPES)) {
            if (!remaining[type]) continue;
            const behind = remaining[type] / (corners[type] || 1);
            if (behind > worst) { worst = behind; pick = type; }
        }
        sequence.push(pick);
        remaining[pick]--;
    }
    return sequence;
}

/**
 * Lap the layout with the reference car and return how the lap divides into
 * phases. Deterministic, cheap (a few thousand steps), and the same physics
 * shape the sandbox engine uses, so the shares an author sees while writing
 * the file are the shares the engine races on.
 *
 * Model: acceleration a(v) = a0·(1 − (v/vtop)²) − g·gradient; braking at
 * brakingG into every corner; corner time = arc / corner speed; `launch` is
 * time below 60 mph from a standing start; `flatOut` is time at or above
 * 85% of top speed; the rest of a straight is `pull`.
 */
function referenceLap(layout, car = REFERENCE_CAR, overrides = {}) {
    const facts = layout.layout;
    const start = overrides.start || facts.start;
    const distance = layout.distance;
    const corners = cornerSequence(facts.corners || {});
    const straights = straightList(layout, distance);
    const scale = arcScale(facts.corners, distance);
    const gradient = (facts.netClimb || 0) * 0.3048 / (distance * MILE);       // rise over run
    const vTop = car.topSpeed * MPH, a0 = 60 * MPH / car.zeroToSixty, dt = 0.05;
    const T = { launch: 0, pull: 0, flatOut: 0, corners: 0, transitions: 0 };

    // Corner i follows straight i; on a circuit (rolling start) the last corner feeds the first straight.
    const rolling = start !== "standing";
    let v = rolling && corners.length ? CORNER_TYPES[corners[corners.length - 1]].mph * MPH : 0;
    for (let i = 0; i < straights.length; i++) {
        let d = 0;
        const target = straights[i] * MILE;
        while (d < target) {
            const a = Math.max(0.2, a0 * (1 - (v / vTop) ** 2)) - G * gradient;
            v = Math.max(1, Math.min(vTop, v + a * dt));
            d += v * dt;
            if (!rolling && v < car.launchUntilMph * MPH) T.launch += dt;
            else if (v >= car.flatOutFraction * vTop) T.flatOut += dt;
            else T.pull += dt;
        }
        const corner = corners.length ? corners[i % corners.length] : null;
        if (corner) {
            const def = CORNER_TYPES[corner];
            const vc = def.mph * MPH;
            if (v > vc) T.transitions += (v - vc) / (car.brakingG * G);
            T.corners += def.arcMiles * scale * MILE / vc;
            v = vc;
        }
    }
    const seconds = Object.values(T).reduce((a, b) => a + b, 0);
    const parts = PHASES.map(key => { const share = seconds ? T[key] / seconds * 100 : 0; return { key, floor: Math.floor(share), rest: share - Math.floor(share) }; });
    let remainder = 100 - parts.reduce((a, p) => a + p.floor, 0);
    for (const p of [...parts].sort((a, b) => b.rest - a.rest)) { if (remainder <= 0) break; p.floor++; remainder--; }
    return {
        seconds: Math.round(seconds),
        averageMph: seconds ? Math.round(distance / (seconds / 3600)) : 0,
        shares: Object.fromEntries(parts.map(p => [p.key, p.floor])),
        straights: straights.length,
        cornerArcMiles: +(cornerArcMiles(facts.corners || {}) * scale).toFixed(2),
        arcScale: +scale.toFixed(2)
    };
}

// ─── validation ──────────────────────────────────────────────────────────────

/**
 * @param {Object} layout                     parsed v2 file
 * @param {Object} [options]
 * @param {Set|string[]} [options.liveTrackIDs]  when given, equivalentTrackID must be one of them
 */
function validateLayout(layout, options = {}) {
    const errors = [], warnings = [];
    const error = message => errors.push(message);
    const warn = message => warnings.push(message);
    const live = options.liveTrackIDs ? new Set(options.liveTrackIDs) : null;
    const thisYear = new Date().getUTCFullYear();

    if (!layout || typeof layout !== "object") return { ok: false, errors: ["not an object"], warnings };

    if (!ID_PATTERN.test(String(layout.layoutID))) error(`layoutID must look like rt00001, got ${JSON.stringify(layout.layoutID)}`);
    if (!isText(layout.name)) error("name is missing");
    else if (/\((dirt|muddy|sunny|rainy|snowy|gravel|ice|wet|dry)\)\s*$/i.test(layout.name)) warn("name carries a weather/surface suffix — that belongs to the condition label now");
    if (!KINDS.includes(layout.kind)) error(`kind must be one of ${KINDS.join(", ")}, got ${JSON.stringify(layout.kind)}`);

    if (layout.fictional !== true && !/^[A-Z]{2}$/.test(String(layout.country))) error("country must be a two-letter code like the car files (or set fictional: true)");
    if (layout.city !== undefined && !isText(layout.city)) error("city must be text when present");
    if (layout.realName !== undefined && !isText(layout.realName)) error("realName must be text when present");

    const needsDistance = !["mphTarget", "timeTrial"].includes(layout.kind);
    if (layout.distance !== undefined) {
        if (!isNum(layout.distance) || layout.distance <= 0) error("distance must be a positive number of MILES");
        else if (layout.distance > 100) warn(`distance ${layout.distance} miles — is that miles, not km?`);
    }
    else if (needsDistance) error("distance (miles) is missing");

    if (layout.opened !== undefined && !(isInt(layout.opened) && layout.opened >= 1885 && layout.opened <= thisYear + 1)) error("opened must be a year");
    if (layout.altitude !== undefined && !(isNum(layout.altitude) && layout.altitude >= -1500 && layout.altitude <= 20000)) error("altitude must be a number of FEET");
    if (layout.tags !== undefined && !(Array.isArray(layout.tags) && layout.tags.every(isText))) error("tags must be a list of words");

    const obstacles = layout.obstacles || {};
    for (const key of OBSTACLES) {
        if (obstacles[key] !== undefined && !(isInt(obstacles[key]) && obstacles[key] >= 0)) error(`obstacles.${key} must be a whole number ≥ 0`);
    }

    // ── the layout facts ──
    for (const key of ["phases", "cornerMix", "longestStraight", "elevation", "specsDistr"]) {
        if (layout[key] !== undefined) error(`${key} is not a v2 field — shares are computed from the layout facts, nothing is typed by feel`);
    }
    const facts = layout.layout;
    const needsLayout = !["mphTarget", "timeTrial"].includes(layout.kind);
    if (!facts || typeof facts !== "object") { if (needsLayout) error("layout is missing (start, corners, straights, netClimb)"); }
    else {
        if (!STARTS.includes(facts.start)) error(`layout.start must be ${STARTS.join(" or ")} (the default; a condition may override it)`);
        const corners = facts.corners || {};
        for (const type of Object.keys(corners)) if (!CORNER_TYPES[type]) error(`layout.corners.${type} is not a corner type (${Object.keys(CORNER_TYPES).join(", ")})`);
        for (const type of Object.keys(CORNER_TYPES)) if (corners[type] !== undefined && !(isInt(corners[type]) && corners[type] >= 0)) error(`layout.corners.${type} must be a whole number ≥ 0`);
        const cornerCount = Object.keys(CORNER_TYPES).reduce((sum, type) => sum + (corners[type] || 0), 0);
        if (facts.corners === undefined) error("layout.corners is missing — use zeros for a drag strip");

        const straights = facts.straights;
        let straightCount = 0, straightTotal = null;
        if (Array.isArray(straights)) {
            if (!straights.length || !straights.every(s => isNum(s) && s > 0)) error("layout.straights must be a list of positive lengths in miles");
            else { straightCount = straights.length; straightTotal = straights.reduce((a, b) => a + b, 0); }
        }
        else if (straights && typeof straights === "object") {
            if (!(isInt(straights.count) && straights.count >= 1)) error("layout.straights.count must be a whole number ≥ 1");
            if (!(isNum(straights.longest) && straights.longest > 0)) error("layout.straights.longest must be a positive number of miles");
            else straightCount = straights.count;
        }
        else error("layout.straights must be a list of miles or { count, longest }");

        if (isNum(layout.distance) && facts.corners) {
            const arcs = cornerArcMiles(corners);
            if (straightTotal !== null) {
                const total = straightTotal + arcs;
                if (Math.abs(total - layout.distance) > Math.max(0.1, 0.1 * layout.distance)) warn(`straights (${straightTotal.toFixed(2)} mi) plus corner arcs (${arcs.toFixed(2)} mi) make ${total.toFixed(2)} mi, but distance says ${layout.distance}`);
            }
            else if (straights && isNum(straights.longest)) {
                const scale = arcScale(corners, layout.distance);
                const fitted = arcs * scale;
                if (scale < 1) warn(`corners are packed densely: ${arcs.toFixed(2)} mi of standard arcs on a ${layout.distance} mi road, so arcs are shrunk to ${Math.round(scale * 100)}% (${fitted.toFixed(2)} mi) to leave room for straights`);
                const rest = layout.distance - fitted - straights.longest;
                if (rest < 0) error(`the longest straight (${straights.longest} mi) does not fit next to ${fitted.toFixed(2)} mi of corners in ${layout.distance} mi`);
                else if (straightCount > 1 && rest / (straightCount - 1) < 0.01) warn("the other straights come out under 50 ft each — too many straights or too many corners for the distance");
            }
            if (cornerCount && straightCount && Math.abs(cornerCount - straightCount) > Math.max(2, 0.25 * cornerCount)) warn(`${cornerCount} corners but ${straightCount} straights — a lap normally has about one straight per corner`);
        }
        if (facts.netClimb !== undefined && !(isNum(facts.netClimb) && Math.abs(facts.netClimb) <= 20000)) error("layout.netClimb must be a number of FEET (negative for a downhill)");
        for (const key of Object.keys(facts)) if (!["start", "corners", "straights", "netClimb"].includes(key)) error(`layout.${key} is not a layout fact (start, corners, straights, netClimb)`);
    }

    if (layout.kind === "mphTarget") {
        const target = layout.mphTarget;
        if (!target || !isInt(target.start) || !isInt(target.end) || target.end <= target.start) error("mphTarget kind needs mphTarget: { start, end } in mph");
    }
    else if (layout.mphTarget !== undefined) warn("mphTarget is only read when kind is mphTarget");

    if (!Array.isArray(layout.conditions) || layout.conditions.length === 0) error("conditions must be a non-empty list");
    else {
        const ids = new Set(), labels = new Set(), keys = new Set();
        layout.conditions.forEach((condition, index) => {
            const at = `conditions[${index}]`;
            if (!isText(condition.id)) error(`${at}.id is missing`);
            else if (ids.has(condition.id)) error(`${at}.id "${condition.id}" is used twice`);
            else ids.add(condition.id);
            if (!isText(condition.label)) error(`${at}.label is missing (the suffix shown after the name)`);
            else if (labels.has(condition.label)) error(`${at}.label "${condition.label}" is used twice`);
            else labels.add(condition.label);
            const key = conditionKey(condition);
            if (!CONDITION_KEYS.has(key)) error(`${at}: "${key}" is not a weather + surface the engine knows (${[...CONDITION_KEYS].join(", ")})`);
            else if (keys.has(key)) warn(`${at}: "${key}" appears twice — two variants with the same conditions`);
            else keys.add(key);
            if (condition.equivalentTrackID !== undefined) {
                if (!/^t\d{5}$/.test(String(condition.equivalentTrackID))) error(`${at}.equivalentTrackID must look like t00120`);
                else if (live && !live.has(condition.equivalentTrackID)) error(`${at}.equivalentTrackID ${condition.equivalentTrackID} is not a live track`);
            }
            if (condition.obstacles !== undefined) {
                for (const key of OBSTACLES) {
                    if (condition.obstacles[key] !== undefined && !(isInt(condition.obstacles[key]) && condition.obstacles[key] >= 0)) error(`${at}.obstacles.${key} must be a whole number ≥ 0`);
                }
                for (const key of Object.keys(condition.obstacles)) if (!OBSTACLES.includes(key)) error(`${at}.obstacles.${key} is not an obstacle`);
            }
            if (condition.start !== undefined && !STARTS.includes(condition.start)) error(`${at}.start must be ${STARTS.join(" or ")}`);
            if (condition.mix !== undefined) {
                if (!condition.mix || typeof condition.mix !== "object" || Array.isArray(condition.mix)) error(`${at}.mix must be an object like { "Gravel": 0.4 }`);
                else {
                    let total = 0;
                    for (const [surface, share] of Object.entries(condition.mix)) {
                        if (surface === condition.surface) error(`${at}.mix: ${surface} is already the main surface`);
                        else if (!CONDITION_KEYS.has(`${condition.weather} ${surface}`)) error(`${at}.mix: "${condition.weather} ${surface}" is not a weather + surface the engine knows`);
                        if (!(isNum(share) && share > 0 && share < 1)) error(`${at}.mix.${surface} must be a share between 0 and 1 (0.4 = 40% of the lap)`);
                        else total += share;
                    }
                    if (total > 0.9) error(`${at}.mix adds up to ${total} — the main surface must keep at least 10%`);
                }
            }
            for (const key of ["background", "map"]) if (condition[key] !== undefined && !isText(condition[key])) error(`${at}.${key} must be a URL when present`);
            for (const key of Object.keys(condition)) {
                if (!["id", "label", "surface", "weather", "equivalentTrackID", "obstacles", "start", "mix", "background", "map"].includes(key)) error(`${at}.${key} is not a condition field — the layout never varies by weather (only start, obstacles, mix and artwork may be set per condition)`);
            }
        });
    }

    for (const key of ["background", "map"]) {
        if (!isText(layout[key])) error(`${key} is missing`);
        else if (/Temp\.png$/i.test(layout[key])) warn(`${key} is the placeholder image`);
    }

    return { ok: errors.length === 0, errors, warnings };
}

// ─── expansion ───────────────────────────────────────────────────────────────

/** Runtime variants, one per condition. Pure — the loader and the harness both call it. */
function expandLayout(layout) {
    const base = layout.obstacles || {};
    return layout.conditions.map(condition => {
        const obstacles = { ...base, ...(condition.obstacles || {}) };
        const start = condition.start || (layout.layout ? layout.layout.start : null);
        const lap = layout.layout && isNum(layout.distance) ? referenceLap(layout, REFERENCE_CAR, { start }) : null;
        return {
            trackID: `${layout.layoutID}:${condition.id}`,
            layoutID: layout.layoutID,
            conditionID: condition.id,
            trackName: `${layout.name} (${condition.label})`,
            name: layout.name,
            weather: condition.weather,
            surface: condition.surface,
            mix: condition.mix ? { ...condition.mix } : null,          // secondary surfaces by share of the lap (rallycross)
            speedbumps: obstacles.speedbumps || 0,
            humps: obstacles.humps || 0,
            kind: layout.kind,
            country: layout.country || null,
            city: layout.city || null,
            realName: layout.realName || null,
            fictional: layout.fictional === true,
            distance: layout.distance ?? null,
            opened: layout.opened ?? null,
            altitude: layout.altitude ?? null,
            tags: Array.isArray(layout.tags) ? [...layout.tags] : [],
            start,
            layout: layout.layout ? { ...JSON.parse(JSON.stringify(layout.layout)), start } : null,
            phases: lap ? { ...lap.shares } : null,          // computed, never authored
            referenceLapSeconds: lap ? lap.seconds : null,
            mphTarget: layout.mphTarget ? { ...layout.mphTarget } : null,
            equivalentTrackID: condition.equivalentTrackID || null,
            background: condition.background || layout.background,
            map: condition.map || layout.map,
            creator: layout.creator || null
        };
    });
}

module.exports = { validateLayout, expandLayout, referenceLap, conditionKey, cornerArcMiles, arcScale, straightList, cornerSequence, KINDS, PHASES, STARTS, CORNER_TYPES, REFERENCE_CAR, OBSTACLES };
