"use strict";

/**
 * CARD TYPE SYSTEM — single source of truth for car classification
 * ================================================================
 * Replaces the scattered boolean checks (isPrize / reference / active / diamond /
 * cr > 1500) with one behavior matrix. Commands never ask "what type is this?" —
 * they ask behavior questions: isPackable(car), isSellProtected(car), etc.
 * What each type MEANS lives here and nowhere else.
 *
 * HOW TO ADD A NEW TYPE
 * ---------------------
 * 1. Add one row to CARD_TYPES below, overriding only what differs from a
 *    normal car. Done — every command picks it up through the predicates.
 * 2. (Optional) teach admin tooling / filters the new name.
 * Unknown type names FAIL SAFE: they behave as fully locked (not packable,
 * not sellable, not tradable), so a typo can never leak a car into packs.
 *
 * Cosmetic editions (Foil, 999 Edition, ...) should be SEPARATE carIDs that
 * `reference` the base car for stats — the same machinery BM variants use —
 * each carrying its own single cardType. Editions are different cards, not
 * flags on the base card.
 *
 * MIGRATION
 * ---------
 * Phase 1 (now): car JSONs still carry legacy flags; deriveLegacyTypes()
 *   reconstructs the type. Behavior is identical to the old checks.
 * Phase 2: a script stamps `cardType: ["..."]` into every car JSON
 *   (use deriveLegacyTypes for the mapping). getCardTypes() prefers the
 *   explicit field automatically, so the two phases can coexist.
 * Census 2026-06: 7,410 Normal | 522 Prize | 154 ABM | 190 IBM | 31 BOSS.
 *
 * Deliberately NOT in this matrix:
 *   - Upgrade multiplier & sell PRICE stay CR-bracket-based (upgradePrice.js).
 *   - daily.js's "gift car must be CR ≤ 699" rule — that's the command's rule;
 *     the matrix only says which classes are eligible at all.
 *   - `reference` itself: it is the stats POINTER, not a type. Types only
 *     decide whether it is consulted (statsFromReference).
 */

const { calcTune } = require("./calcTune.js");
const { driveHierarchy, gcHierarchy } = require("../consts/consts.js");

// ─── Behavior columns ────────────────────────────────────────────────────────
// DEFAULTS describes a plain, fully obtainable car. Every type below overrides
// only the cells where it differs, so each row reads as "how this type departs
// from a normal car".

const DEFAULTS = {
    packable: true,            // may drop from normal pack rarity slots   (openPack.js)
    diamondRollable: false,    // in the diamond pre-roll pool             (openPack.js)
    bmRotation: false,         // may appear in black market refreshes     (regenBM.js)
    dealershipPool: true,      // may appear in dealership refreshes       (regenDealership.js)
    dailyGiftPool: true,       // may be the streak-5 daily free car       (daily.js)
    rrOpponent: "normal",      // random race opponent: "normal" | "boss" | false  (randomrace.js)
    sellable: true,            // cd-sell, single and bulk                 (sell.js, searchGarage.js)
    tradable: true,            // player-to-player trading (future feature)
    exchangePool: false,       // dupe-exchange eligibility: false | "prize" | "diamond"
    fuseable: true,            // cd-fuse, if/when re-enabled
    statsFromReference: false, // races with the referenced car's stats    (createCar.js)
    rrMoneyBonusPct: 0,        // bonus % on random race winnings (BM 25, Diamond 100)
    sellValueMult: 1,          // sell price multiplier for sellable types (sell.js)
    tag: null,                 // short display label                      (carNameGen.js)
};

// Shared shorthand for "removed from every acquisition pool and protected".
const LOCKED = {
    packable: false,
    dealershipPool: false,
    dailyGiftPool: false,
    sellable: false,
    tradable: false,
    fuseable: false,
};

// ─── The matrix ──────────────────────────────────────────────────────────────

const CARD_TYPES = {
    // Plain obtainable car. (Cars with no cardType and no legacy flags.)
    Normal: {},

    // Pulled from circulation (seasonal / vaulted) but otherwise an ordinary
    // car: still sellable, tradable, raceable. What "Limited Edition" means
    // mechanically once its sale window closes.
    Retired: {
        packable: false,
        dealershipPool: false,
        dailyGiftPool: false,
        tag: "Retired",
    },

    // Event/reward car. Locked, but dupes can be swapped via cd-exchange.
    Prize: {
        ...LOCKED,
        exchangePool: "prize",
        tag: "Prize",
    },

    // Like Prize, but no exchange either — the "you were there" card.
    CollectorsEdition: {
        ...LOCKED,
        tag: "CE",
    },

    // Boss cars: race-only opponents in boss rounds, fully locked as property.
    // (Previously implied by cr > 1500 + isPrize. Note: this row REMOVES the
    // old boss↔boss cd-exchange loophole — set exchangePool: "prize" to restore.)
    BOSS: {
        ...LOCKED,
        rrOpponent: "boss",
        tag: "BOSS",
    },

    // ── Black market family — stats come from the referenced car, +25% rr money ──

    // Active BM: currently purchasable in the trophy shop rotation.
    ABM: {
        ...LOCKED,
        bmRotation: true,
        rrOpponent: false,
        statsFromReference: true,
        rrMoneyBonusPct: 25,
        tag: "BM",
    },

    // Inactive BM: was in rotation, currently vaulted.
    IBM: {
        ...LOCKED,
        rrOpponent: false,
        statsFromReference: true,
        rrMoneyBonusPct: 25,
        tag: "BM",
    },

    // Prize BM: never enters rotation; granted via events/rewards only.
    PBM: {
        ...LOCKED,
        rrOpponent: false,
        statsFromReference: true,
        rrMoneyBonusPct: 25,
        tag: "BM",
    },

    // ── Diamond family — chase rarity, sell/fuse-protected, own exchange ──

    // Rollable via the diamond pre-roll while featured.
    Diamond: {
        ...LOCKED,
        diamondRollable: true,
        rrOpponent: false,
        exchangePool: "diamond",
        rrMoneyBonusPct: 100,
        tag: "Diamond",
    },

    // Rotated out of the pre-roll pool (the old `diamond + active:false`).
    RetiredDiamond: {
        ...LOCKED,
        rrOpponent: false,
        exchangePool: "diamond",
        rrMoneyBonusPct: 100,
        tag: "Diamond",
    },

    // Never rollable — event-granted only (the diamond analog of PBM).
    EventDiamond: {
        ...LOCKED,
        rrOpponent: false,
        exchangePool: "diamond",
        rrMoneyBonusPct: 100,
        tag: "Diamond",
    },

    // ── Future cosmetic/crafted editions (separate carIDs that `reference` ──
    // ── the base car; per-card statModifiers live in the card JSON itself) ──
    //
    // Foil: {
    //     ...LOCKED,
    //     statsFromReference: true,
    //     tag: "Foil",
    // },
    //
    // WorksEdition: {                 // crafted one-offs: sellable for a premium
    //     ...LOCKED,
    //     statsFromReference: true,
    //     sellable: true,             // overrides LOCKED — spread order wins
    //     sellValueMult: 1.5,
    //     tag: "Works",
    // },
};

// Fail-safe row for unrecognized type names (see header).
const UNKNOWN_TYPE_BEHAVIOR = Object.freeze({ ...DEFAULTS, ...LOCKED, rrOpponent: false });

// ─── Resolve + validate the matrix once at load ──────────────────────────────
// A typo'd behavior key in a row throws at startup instead of silently doing
// nothing — adding a column to DEFAULTS automatically legalizes it everywhere.

const RESOLVED = {};
for (const [name, row] of Object.entries(CARD_TYPES)) {
    for (const key of Object.keys(row)) {
        if (!(key in DEFAULTS)) {
            throw new Error(`cardType.js: unknown behavior "${key}" in type "${name}" — add it to DEFAULTS first`);
        }
    }
    RESOLVED[name] = Object.freeze({ ...DEFAULTS, ...row });
}
const TYPE_NAMES = Object.keys(RESOLVED);
const NAME_LOOKUP = new Map(TYPE_NAMES.map(n => [n.toLowerCase(), n]));

// ─── Type resolution ─────────────────────────────────────────────────────────

/** Canonical type name for any casing ("abm" → "ABM"), or null if unknown. */
function normalizeTypeName(name) {
    return NAME_LOOKUP.get(String(name).toLowerCase()) || null;
}

/**
 * Reconstruct the type from pre-migration boolean flags. Used as the fallback
 * while car JSONs still carry legacy flags, and by the Phase-2 migration script.
 * (PBM, Retired, CollectorsEdition are unrepresentable in legacy data — they
 * only exist once cardType is stamped explicitly.)
 */
function deriveLegacyTypes(car) {
    if (car.reference) return [car.active === true ? "ABM" : "IBM"];
    if (car.diamond === true) {
        if (car.active === false) return ["RetiredDiamond"];
        if (car.isPrize === true) return ["EventDiamond"];
        return ["Diamond"];
    }
    if (car.isPrize === true) return (car.cr || 0) > 1500 ? ["BOSS"] : ["Prize"];
    return ["Normal"];
}

const warnedUnknown = new Set();

/**
 * The car's type list. Explicit `cardType` field wins; legacy flags otherwise.
 * First entry is the base type (drives all behavior); extra entries are
 * informational labels.
 */
function getCardTypes(car) {
    if (!car) return [];    // null/deleted car → no recognized type → fail-safe locked behavior
    let raw = car.cardType;
    if (typeof raw === "string") raw = [raw];
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map(n => {
            const canonical = normalizeTypeName(n);
            if (!canonical && !warnedUnknown.has(n)) {
                console.warn(`cardType.js: car ${car.carID || "?"} has unknown cardType "${n}" — treating as locked`);
                warnedUnknown.add(n);
            }
            return canonical || String(n);
        });
    }
    return deriveLegacyTypes(car);
}

/** The base (behavior-driving) type name. Unknown names stay as-is (locked). */
function getBaseType(car) {
    return getCardTypes(car)[0];
}

/** Full resolved behavior row for this car. */
function behavior(car) {
    return RESOLVED[getBaseType(car)] || UNKNOWN_TYPE_BEHAVIOR;
}

/** True if the car carries the given type (base or label), any casing. */
function hasType(car, typeName) {
    const canonical = normalizeTypeName(typeName) || typeName;
    return getCardTypes(car).includes(canonical);
}

// ─── Behavior predicates — what command code actually calls ─────────────────

const isPackable = (car) => behavior(car).packable;
const isDiamondRollable = (car) => behavior(car).diamondRollable;
const inBMRotation = (car) => behavior(car).bmRotation;
const inDealershipPool = (car) => behavior(car).dealershipPool;
const inDailyGiftPool = (car) => behavior(car).dailyGiftPool;

/** Random race opponent class: "normal", "boss", or false (never an opponent). */
const rrOpponentClass = (car) => behavior(car).rrOpponent;

const isSellProtected = (car) => !behavior(car).sellable;
const isTradeProtected = (car) => !behavior(car).tradable;
const isFuseProtected = (car) => !behavior(car).fuseable;

/** Which dupe exchange accepts this car: false | "prize" | "diamond". */
const exchangePool = (car) => behavior(car).exchangePool;

/** Bonus % applied to random race winnings (BM 25, Diamond 100). */
const rrMoneyBonusPct = (car) => behavior(car).rrMoneyBonusPct;

/** Short display label for this car's type, or null for normal cars. */
const typeTag = (car) => behavior(car).tag;

/**
 * The car whose stats this card races with: the referenced base car for
 * BM-style variants, itself otherwise. (What createCar/filterCheck call
 * `bmReference`.)
 */
function statsSource(car) {
    if (!car) return car;
    if (behavior(car).statsFromReference && car.reference) {
        // lazy require: dataManager is the layer below this one, and some of its
        // consumers load before it finishes initializing — avoids a require cycle
        const { getCar } = require("./dataManager.js");
        return getCar(car.reference) || car;
    }
    return car;
}

// ─── Type-family helpers ─────────────────────────────────────────────────────
// For the few places that genuinely ask "what is it" (display tags, filter
// vocabulary) rather than "what can it do". Everything else should use the
// behavior predicates above.

const BM_TYPES = new Set(["ABM", "IBM", "PBM"]);
const DIAMOND_TYPES = new Set(["Diamond", "RetiredDiamond", "EventDiamond"]);
// What the user-facing `isPrize` filter has always meant: locked reward cards.
const PRIZE_LIKE_TYPES = new Set(["Prize", "BOSS", "CollectorsEdition", "EventDiamond"]);

const isBMCar = (car) => BM_TYPES.has(getBaseType(car));
const isDiamondCar = (car) => DIAMOND_TYPES.has(getBaseType(car));
const isPrizeLike = (car) => PRIZE_LIKE_TYPES.has(getBaseType(car));
/** True when this card races with another card's stats (BM family, editions). */
const usesReferenceStats = (car) => behavior(car).statsFromReference;

// ─── Per-card modifiers ──────────────────────────────────────────────────────
// Type rows answer "which game systems does this card participate in".
// Card-SPECIFIC numeric tweaks live in the card's own JSON instead, because two
// cards of the same type can differ ("+5% top speed" vs "-20 MPH"):
//
//   "statModifiers":      { "topSpeed": "+5%", "0to60": "-0.5", "weight": "-10%" }
//   "attributeOverrides": { "tyreType": "Slick", "gc": "Low", "tcs": false }
//   "crModifier":         25
//
// Plain numbers and "±N" strings are flat; "±N%" strings are percentages.
// Modifiers only take effect on types with statsFromReference (edition cards
// built on a base car) — a normal car's stats should just be edited directly.
// effectiveStats() is the single pipeline: base car → modifiers → calcTune.

const STAT_KEYS = ["topSpeed", "0to60", "handling", "weight", "mra", "ola"];
const TYRE_TYPES = ["Standard", "Performance", "All-Surface", "Off-Road", "Slick", "Drag"];
const ATTR_RULES = {
    driveType: driveHierarchy,      // ["AWD", "4WD", "FWD", "RWD"]
    gc: gcHierarchy,                // ["High", "Medium", "Low"]
    tyreType: TYRE_TYPES,
    abs: "boolean",
    tcs: "boolean",
    seatCount: "number",
    enginePos: "string",
};

/** "+5" / -0.5 → flat; "+5%" → percentage. Returns null on junk. */
function parseModifier(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) return { flat: raw, pct: 0 };
    if (typeof raw === "string") {
        const m = raw.trim().match(/^([+-]?\d+(?:\.\d+)?)(%?)$/);
        if (m) {
            const n = parseFloat(m[1]);
            return m[2] ? { flat: 0, pct: n } : { flat: n, pct: 0 };
        }
    }
    return null;
}

/**
 * The card's effective BASE car: the referenced car with this card's
 * statModifiers / attributeOverrides / crModifier applied. This is what
 * req-checking and stat displays should treat as the card's identity.
 */
function modifiedBase(card) {
    if (!card) return card;
    const base = statsSource(card);
    if (!behavior(card).statsFromReference) return base;    // modifiers ignored on non-edition types
    if (!card.statModifiers && !card.attributeOverrides && card.crModifier === undefined) return base;

    const merged = { ...base };
    for (const [key, raw] of Object.entries(card.statModifiers || {})) {
        const p = parseModifier(raw);
        if (!STAT_KEYS.includes(key) || !p || typeof merged[key] !== "number") continue;
        merged[key] = merged[key] * (1 + p.pct / 100) + p.flat;
    }
    for (const [key, val] of Object.entries(card.attributeOverrides || {})) {
        if (key in ATTR_RULES) merged[key] = val;
    }
    if (typeof card.crModifier === "number") {
        merged.cr = (merged.cr || 0) + card.crModifier;
    }
    return merged;
}

/**
 * Full race-ready stat block for a card at a tune — the one pipeline every
 * consumer (createCar, simulators, future commands) should use:
 *   base car → per-card modifiers → calcTune.
 */
function effectiveStats(card, tune = "000") {
    const base = modifiedBase(card);
    const tuned = calcTune(base, tune);
    return {
        ...tuned,                       // topSpeed, accel, handling, weight, mra, ola
        cr: base.cr || 0,
        gc: base.gc || "Medium",
        driveType: base.driveType,
        tyreType: base.tyreType,
        abs: !!base.abs,
        tcs: !!base.tcs,
    };
}

/** Sell price multiplier for this card's type (sell.js applies it). */
const sellValueMult = (card) => behavior(card).sellValueMult;

/**
 * Lint a card's modifier fields. Returns a list of human-readable issues —
 * empty list = clean. For createcar/editcar tooling and validateCars.js.
 */
function validateCardModifiers(card) {
    const issues = [];
    const hasMods = card.statModifiers || card.attributeOverrides || card.crModifier !== undefined;
    if (hasMods && !behavior(card).statsFromReference) {
        issues.push(`modifiers present but type "${getBaseType(card)}" has no statsFromReference — they are ignored`);
    }
    for (const [key, raw] of Object.entries(card.statModifiers || {})) {
        if (!STAT_KEYS.includes(key)) {
            issues.push(`unknown stat "${key}" (valid: ${STAT_KEYS.join(", ")})`);
            continue;
        }
        const p = parseModifier(raw);
        if (!p) issues.push(`bad modifier for ${key}: "${raw}" (use 5, "-0.5" or "+5%")`);
        else if (Math.abs(p.pct) > 25) issues.push(`${key} swing of ${p.pct}% exceeds ±25% — balance check`);
    }
    for (const [key, val] of Object.entries(card.attributeOverrides || {})) {
        const rule = ATTR_RULES[key];
        if (!rule) issues.push(`unknown attribute "${key}" (valid: ${Object.keys(ATTR_RULES).join(", ")})`);
        else if (Array.isArray(rule) && !rule.includes(val)) issues.push(`${key}="${val}" not one of [${rule.join(", ")}]`);
        else if (typeof rule === "string" && rule !== "string" && typeof val !== rule) issues.push(`${key} must be a ${rule}`);
    }
    return issues;
}

module.exports = {
    // type resolution
    getCardTypes,
    getBaseType,
    hasType,
    normalizeTypeName,
    deriveLegacyTypes,
    // behavior predicates
    isPackable,
    isDiamondRollable,
    inBMRotation,
    inDealershipPool,
    inDailyGiftPool,
    rrOpponentClass,
    isSellProtected,
    isTradeProtected,
    isFuseProtected,
    exchangePool,
    rrMoneyBonusPct,
    typeTag,
    statsSource,
    sellValueMult,
    // type-family helpers
    isBMCar,
    isDiamondCar,
    isPrizeLike,
    usesReferenceStats,
    // per-card modifiers
    modifiedBase,
    effectiveStats,
    validateCardModifiers,
    // introspection (admin tooling, migration script, debugging)
    TYPE_NAMES,
    BEHAVIOR_MATRIX: RESOLVED,
};
