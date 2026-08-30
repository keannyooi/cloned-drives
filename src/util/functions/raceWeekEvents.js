"use strict";

/**
 * RACE WEEK — drivers & in-race random events layer.
 *
 * Drivers v2 (design doc §5, RARITY SYSTEM v3): data-driven collectibles
 * loaded from src/drivers/dXXXXX.json by dataManager. A driver carries
 * bonuses[] entries ({ description, cond, effects, minLevel? });
 * applyDriver() evaluates EVERY entry — minLevel-gated ones are skipped
 * below the player's level (driverXP dupes on the driver's RARITY_CURVES
 * curve, see getDriverLevel; recruiting a card is Level 0, and icon/
 * autograph/serialised drivers have every entry active on ownership) — and
 * applies all matching entries cumulatively to the createCar() carModule:
 * all adds first, then all mults, then any absolute `set` overrides
 * (misprints), per stat. accel/weight are lower-is-better (improvements are
 * negative adds / mults < 1 / sets below the base stat). Drawback entries
 * are first-class: effects may be net-negative, so "applied" must never be
 * read as "buffed" — netLines carry a ⚠ prefix on net-negative entries.
 * moneyMult effects multiply across active entries.
 *
 * cond vocabulary (ALL present keys must match — AND):
 *   filterCheck car criteria (make/tags/modelYear/cr/...) — routed through
 *   filterCheck on the hand's carID; statMin/statMax — thresholds on the
 *   TUNED carModule stats the race actually uses; carID — signature-car list;
 *   weather/surface — exact track JSON strings; bossRace/underdog — race ctx.
 *
 * Events (ideas doc Family I §I2, EVENTS table in consts/raceWeek.js):
 *   rollEvent() is called wherever a fresh matchup is generated; the winner of
 *   the weighted roll becomes raceWeekStats.activeEvent (instants apply
 *   immediately and are never stored). resolveWin()/resolveNonWin() settle the
 *   event when the race it attached to resolves. All reward entries follow the
 *   unclaimedRewards convention (ONE reward key per entry, reward key first).
 */

const { readFileSync } = require("fs");
const path = require("path");
const { getCar, getPack, getPackFiles, getDriver, getAllDrivers } = require("./dataManager.js");
const { EVENTS, BOSS_SLAYER_DRIVER_ID, RECRUIT } = require("../consts/raceWeek.js");
const makeRewardID = require("./rewardID.js");
const rwEmoji = require("./rwEmoji.js");
const { rrOpponentClass } = require("./cardType.js");
const filterCheck = require("./filterCheck.js");
const carNameGen = require("./carNameGen.js");
const unbritish = require("./unbritish.js");

const REWARD_ORIGIN = "Race Week";
const SHARD_PACK_ORIGIN = "Race Week (Pack Shards)";

// ─── Drivers ─────────────────────────────────────────────────────────────────

const DEFAULT_DRIVER_ID = "d00000";

const STAT_LABELS = {
    topSpeed: "top speed",
    accel: "0-60",
    handling: "handling",
    weight: "weight",
    mra: "MRA",
    ola: "OLA"
};

// accel (0-60 time), weight AND ola improve DOWNWARD — used to classify
// whether an effect helps or hurts (display keeps the raw signed change).
// ola's direction is confirmed intentional (2026-08-29): the race formula
// scores (opponent.ola - player.ola), and the engine tune digit deliberately
// TRADES ola away (+3/+5/+8) for better 0-60. Missing ola here let eight
// driver cards ship +ola "buffs" that were quietly self-nerfs.
const LOWER_IS_BETTER = { accel: true, weight: true, ola: true };

// ─── Rarity system v3 (design doc §5, 2026-07-24) ────────────────────────────

// Ascending power order — also the tier-DOWN re-roll ladder for the Driver
// Scout (walk toward index 0; below "base" the scout pays money instead).
const DRIVER_RARITIES = ["base", "rare", "secret", "divine", "icon", "autograph", "serialised"];

// v2's 4-tier cosmetic values, still present in older JSONs, mapped onto v3.
// ("rare" is both a legacy AND a v3 value — identical meaning either way.)
const LEGACY_RARITY_MAP = { standard: "base", rare: "rare", epic: "secret", legendary: "divine" };

// Spec-mandated re-rarities that override the legacy mapping while a file
// still carries a legacy value (Ragnar Voss "rare" → base). A file updated to
// a v3-only value ignores this table.
const LEGACY_RARITY_OVERRIDES = { d00012: "base" };

/**
 * CUMULATIVE dupes → level, per rarity (spec §5 v3). Index i = total dupes
 * needed for level i+1; max level = curve length. Recruiting a card is
 * LEVEL 0 (all entries without minLevel are active; minLevel: 1 needs one
 * dupe). Empty curve = "all active" rarity: max level 0, EVERY bonus entry
 * active on ownership regardless of minLevel, and any dupe converts straight
 * to DUPE_DRIVER_MONEY.
 */
const RARITY_CURVES = {
    base: [1, 6, 16],
    rare: [1, 6, 16, 31],
    secret: [1, 6, 16, 31, 50],
    divine: [1, 6, 16, 31, 50, 75],
    icon: [],
    autograph: [],
    serialised: []
};

// getDriverLevel sentinel for all-active rarities — Infinity clears every
// `level < entry.minLevel` gate without special-casing comparisons.
const ALL_ACTIVE_LEVEL = Infinity;

/**
 * Canonical v3 rarity for a driver object, a driverID ("dXXXXX"), or a raw
 * rarity string (legacy values mapped, unknown/missing → "base").
 */
function rarityOf(source) {
    let driver = null;
    if (typeof source === "string") {
        if (/^d\d+$/.test(source)) {
            driver = getDriver(source);
            if (!driver) return "base";
        }
        else {
            const raw = source.toLowerCase();
            if (RARITY_CURVES[raw]) return raw;
            return LEGACY_RARITY_MAP[raw] || "base";
        }
    }
    else if (source && typeof source === "object") {
        driver = source;
    }
    if (!driver) return "base";
    const raw = (driver.rarity || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LEGACY_RARITY_MAP, raw)
        && LEGACY_RARITY_OVERRIDES[driver.driverID]) {
        return LEGACY_RARITY_OVERRIDES[driver.driverID];
    }
    if (RARITY_CURVES[raw]) return raw;
    return LEGACY_RARITY_MAP[raw] || "base";
}

/** Icon/autograph/serialised — ownership activates every bonus entry. */
function isAllActiveRarity(rarityOrDriver) {
    return RARITY_CURVES[rarityOf(rarityOrDriver)].length === 0;
}

/** Max reachable level for a rarity/driver/driverID (0 for all-active tiers). */
function maxLevelFor(rarityOrDriver) {
    const curve = RARITY_CURVES[rarityOf(rarityOrDriver)];
    // 1-BASED: recruiting is Level 1, so each curve threshold adds one above it.
    return curve.length === 0 ? 0 : curve.length + 1;
}

/**
 * Level a cumulative dupe count corresponds to on the rarity's curve
 * (1..maxLevelFor). LEVELS ARE 1-BASED: owning a driver with zero duplicates
 * is Level 1, and each curve threshold passed adds one. rarityOrDriver accepts
 * the same shapes as rarityOf; omitted → the base curve.
 */
function levelFromDupes(dupes, rarityOrDriver) {
    const curve = RARITY_CURVES[rarityOf(rarityOrDriver)];
    let level = 1;
    for (const threshold of curve) {
        if ((dupes || 0) >= threshold) level++;
    }
    return level;
}

/**
 * Player's level for a driver, from the raceWeekStats.driverXP map
 * ({ "<driverID>": { dupes, level, serial? } }). LEVEL 0 baseline — owning a
 * never-duped driver is level 0. Icon/autograph/serialised drivers return
 * ALL_ACTIVE_LEVEL (Infinity — every minLevel gate passes). The driver's
 * rarity (and therefore curve/max) is resolved via getDriver. Tolerates
 * Mongoose-Map or plain-object storage and entries missing the cached level.
 */
function getDriverLevel(raceWeekStats, driverID) {
    const rarity = rarityOf(driverID);
    if (isAllActiveRarity(rarity)) return ALL_ACTIVE_LEVEL;
    const xp = raceWeekStats ? raceWeekStats.driverXP : null;
    const entry = xp && typeof xp.get === "function" ? xp.get(driverID) : (xp || {})[driverID];
    // No XP entry = owned but never duplicated = Level 1.
    if (!entry || typeof entry !== "object") return 1;
    // ALWAYS derive from dupes rather than trusting entry.level: the cached
    // value is a convenience, and any written under the old 0-based scheme
    // would otherwise read one level low forever.
    return levelFromDupes(entry.dupes, rarity);
}

/**
 * "Name (Variant) (Year)" — variant omitted when empty. Accepts a driver
 * object or a driverID string (unknown IDs → "an unknown driver" so stored
 * v1-era IDs never crash display paths).
 */
function driverDisplayName(driverOrID) {
    const driver = typeof driverOrID === "string" ? getDriver(driverOrID) : driverOrID;
    if (!driver) return "an unknown driver";
    return driver.variant
        ? `${driver.name} (${driver.variant})`
        : driver.name;
}

// Display/race rounding after driver effects (accel keeps 2dp like calcTune).
// Pre-round at 6dp so float artifacts (100 * 1.025 = 102.4999…) round up.
function roundStat(stat, value) {
    const clean = Math.round(value * 1e6) / 1e6;
    if (stat === "accel") return Math.round(clean * 100) / 100;
    return Math.round(clean);
}

// Cond keys resolved here from race context / tuned stats; every OTHER key is
// a filterCheck car criterion and is routed through filterCheck untouched.
const COND_CONTEXT_KEYS = ["statMin", "statMax", "carID", "weather", "surface", "trackID", "bossRace", "underdog"];

/**
 * ALL present cond keys must match (AND). Sources per key:
 * carID → the hand's raw card ID (signature cars); statMin/statMax → the
 * TUNED carModule stats race() consumes; weather/surface → track JSON strings
 * (exact case); trackID → specific venues by tXXXXX id (rename-proof — track
 * files carry their own trackID since 2026-08-27); underdog/bossRace → ctx;
 * anything else → filterCheck against
 * the hand's card (same criteria shapes as event reqs, values lowercased).
 */
function condMatches(cond, rawCar, carModule, track, ctx) {
    if (!cond) return true;
    if (Array.isArray(cond.carID) && !(rawCar && cond.carID.includes(rawCar.carID))) return false;
    if (cond.weather && !(track && cond.weather.includes(track.weather))) return false;
    if (cond.surface && !(track && cond.surface.includes(track.surface))) return false;
    if (cond.trackID && !(track && cond.trackID.includes(track.trackID))) return false;
    if (cond.underdog && !(ctx.playerCR < ctx.oppCR)) return false;
    if (cond.bossRace && !ctx.isBoss) return false;
    if (cond.statMin) {
        for (const [stat, min] of Object.entries(cond.statMin)) {
            if (!(typeof carModule[stat] === "number" && carModule[stat] >= min)) return false;
        }
    }
    if (cond.statMax) {
        for (const [stat, max] of Object.entries(cond.statMax)) {
            if (!(typeof carModule[stat] === "number" && carModule[stat] <= max)) return false;
        }
    }

    const criteria = {};
    for (const [key, value] of Object.entries(cond)) {
        if (!COND_CONTEXT_KEYS.includes(key)) criteria[key] = value;
    }
    if (Object.keys(criteria).length > 0) {
        if (!rawCar || !rawCar.carID) return false;
        try {
            if (!filterCheck({ car: { carID: rawCar.carID }, filter: criteria })) return false;
        }
        catch (err) {
            // Malformed author criteria (validated at load, but stay safe)
            console.warn(`⚠️ Driver cond filterCheck failed: ${err.message}`);
            return false;
        }
    }
    return true;
}

/**
 * "+5 top speed, -2.5% 0-60, MRA becomes 45, +5% payout" for one bonus
 * entry's effects. `set` entries (misprints) render as "<stat> becomes N" —
 * they're absolute overrides, so no sign prefix applies.
 */
function summarizeEffects(effects) {
    const bits = [];
    if (effects.add) {
        for (const [stat, value] of Object.entries(effects.add)) {
            bits.push(`${value > 0 ? "+" : ""}${value} ${STAT_LABELS[stat] || stat}`);
        }
    }
    if (effects.mult) {
        for (const [stat, value] of Object.entries(effects.mult)) {
            const pct = Math.round((value - 1) * 1000) / 10;
            bits.push(`${pct > 0 ? "+" : ""}${pct}% ${STAT_LABELS[stat] || stat}`);
        }
    }
    if (effects.set) {
        for (const [stat, value] of Object.entries(effects.set)) {
            bits.push(`${STAT_LABELS[stat] || stat} becomes ${value}`);
        }
    }
    if (typeof effects.moneyMult === "number" && effects.moneyMult !== 1) {
        const pct = Math.round((effects.moneyMult - 1) * 1000) / 10;
        bits.push(`${pct > 0 ? "+" : ""}${pct}% payout`);
    }
    return bits.join(", ");
}

// Count helping vs hurting effects (direction-aware for accel/weight) — an
// entry is flagged net-negative (⚠) when it hurts more than it helps.
// `set` overrides need the PRE-effect stats (baseStats) to know direction:
// a set that moves the stat the wrong way (e.g. lowers a higher-is-better
// stat) counts as hurting; without baseStats, sets count as neutral.
function effectGoodness(effects, baseStats) {
    let good = 0, bad = 0;
    const tally = (stat, isImprovement, isNeutral) => {
        if (isNeutral) return;
        if (isImprovement) good++;
        else bad++;
    };
    if (effects.add) {
        for (const [stat, value] of Object.entries(effects.add)) {
            tally(stat, LOWER_IS_BETTER[stat] ? value < 0 : value > 0, value === 0);
        }
    }
    if (effects.mult) {
        for (const [stat, value] of Object.entries(effects.mult)) {
            tally(stat, LOWER_IS_BETTER[stat] ? value < 1 : value > 1, value === 1);
        }
    }
    if (effects.set) {
        for (const [stat, value] of Object.entries(effects.set)) {
            const base = baseStats && typeof baseStats[stat] === "number" ? baseStats[stat] : null;
            tally(stat, base !== null && (LOWER_IS_BETTER[stat] ? value < base : value > base),
                base === null || value === base);
        }
    }
    if (typeof effects.moneyMult === "number") {
        tally("moneyMult", effects.moneyMult > 1, effects.moneyMult === 1);
    }
    return { good, bad };
}

/**
 * Resolve ctx.driverID and collect its ACTIVE bonus entries: minLevel-locked
 * entries (ctx.level, default 0 — recruiting is Level 0) are skipped, then
 * conds are evaluated against the PRE-effect carModule. Icon/autograph/
 * serialised drivers ignore minLevel entirely (every entry is level-eligible
 * on ownership). Returns { driver, active }.
 */
function evaluateDriver(carModule, rawCar, track, ctx) {
    const driver = ctx.driverID ? getDriver(ctx.driverID) : null;
    if (!driver) return { driver: null, active: [] };
    const level = isAllActiveRarity(driver)
        ? ALL_ACTIVE_LEVEL
        : (typeof ctx.level === "number" ? ctx.level : 0);
    const active = (driver.bonuses || []).filter(entry =>
        entry && entry.effects
        && !(entry.minLevel && level < entry.minLevel)
        && condMatches(entry.cond, rawCar, carModule, track, ctx));
    return { driver, active };
}

/**
 * Evaluate the active driver's bonuses[] and apply every matching entry to
 * the carModule in place — cumulative across entries, all adds first, then
 * all mults, then absolute `set` overrides (misprints — a set REPLACES the
 * add/mult result for that stat; entry order wins on collisions), rounded
 * per stat once at the end. Returns:
 *   applied      — at least one entry matched (NOT necessarily a buff!)
 *   statsChanged — a stat actually moved (drives the spec-block re-render)
 *   activeCount  — number of matching entries
 *   netLines     — per-entry effect summaries, ⚠-prefixed when net-negative
 *                  (sets compare against the PRE-effect stat: a set that
 *                  lowers a higher-is-better stat is flagged)
 *   moneyMult    — product of active entries' moneyMult effects (payout side)
 * ctx: { driverID, level, isBoss, playerCR, oppCR }.
 */
function applyDriver(carModule, rawCar, track, ctx) {
    const res = { applied: false, statsChanged: false, activeCount: 0, netLines: [], moneyMult: 1 };
    const { active } = evaluateDriver(carModule, rawCar, track, ctx);
    if (active.length === 0) return res;
    res.applied = true;
    res.activeCount = active.length;

    const adds = {}, mults = {}, sets = {};
    for (const entry of active) {
        const effects = entry.effects;
        if (effects.add) {
            for (const [stat, value] of Object.entries(effects.add)) {
                if (typeof carModule[stat] === "number") adds[stat] = (adds[stat] || 0) + value;
            }
        }
        if (effects.mult) {
            for (const [stat, value] of Object.entries(effects.mult)) {
                if (typeof carModule[stat] === "number") mults[stat] = (mults[stat] || 1) * value;
            }
        }
        if (effects.set) {
            for (const [stat, value] of Object.entries(effects.set)) {
                if (typeof carModule[stat] === "number" && typeof value === "number") sets[stat] = value;
            }
        }
        if (typeof effects.moneyMult === "number") res.moneyMult *= effects.moneyMult;
        // carModule is still pre-effect inside this loop — valid set baseline.
        const goodness = effectGoodness(effects, carModule);
        res.netLines.push(`${goodness.bad > goodness.good ? "⚠ " : ""}${summarizeEffects(effects)}`);
    }
    res.moneyMult = Math.round(res.moneyMult * 1e6) / 1e6;

    for (const stat of new Set([...Object.keys(adds), ...Object.keys(mults), ...Object.keys(sets)])) {
        const computed = sets[stat] !== undefined
            ? sets[stat]
            : (carModule[stat] + (adds[stat] || 0)) * (mults[stat] !== undefined ? mults[stat] : 1);
        const next = roundStat(stat, computed);
        if (next !== carModule[stat]) {
            carModule[stat] = next;
            res.statsChanged = true;
        }
    }
    return res;
}

/**
 * Payout multiplier across the driver's ACTIVE entries (product). Standalone
 * evaluator for callers that skipped applyDriver — pass the PRE-effect
 * carModule or stat-conditioned moneyMult entries may resolve differently.
 * Callers that already ran applyDriver should read result.moneyMult instead.
 */
function getMoneyMult(carModule, rawCar, track, ctx) {
    const { active } = evaluateDriver(carModule, rawCar, track, ctx);
    let mult = 1;
    for (const entry of active) {
        if (typeof entry.effects.moneyMult === "number") mult *= entry.effects.moneyMult;
    }
    return Math.round(mult * 1e6) / 1e6;
}

/**
 * Passive intermission line (no in-race driver swap in v2):
 * "Driver: Name (Year) ⚡ (+5 top speed | ⚠ -3% handling)" when any entry is
 * active, "Driver: Name (Year) 💤" otherwise.
 */
function driverLine(driverID, applyResult) {
    const driver = getDriver(driverID) || getDriver(DEFAULT_DRIVER_ID);
    const name = driverDisplayName(driver);
    if (!applyResult || !applyResult.applied) return `Driver: ${name} ${rwEmoji("driverIdle")}`;
    return `Driver: ${name} ${rwEmoji("driverActive")} (${applyResult.netLines.join(" | ")})`;
}

/**
 * Re-render the hand's spec block from a (driver-boosted) carModule so the
 * shown numbers match what race() will actually use. Mirrors createCar()'s
 * display block exactly — keep the two in sync if that format changes.
 */
function renderPlayerSpecs(rawCar, carModule, upgrade, unitPreference, hideStats) {
    let carSpecs = carNameGen({ currentCar: rawCar, rarity: true, upgrade: upgrade || "000" });
    if (hideStats) return carSpecs;

    if (unitPreference === "metric") {
        carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH (${unbritish(carModule.topSpeed, "topSpeed")}KM/H)\n`;
    }
    else {
        carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH\n`;
    }
    if (carModule.topSpeed < 60) {
        carSpecs += "0-60MPH: N/A\n";
    }
    else {
        if (unitPreference === "metric") {
            carSpecs += `0-60MPH: ${carModule.accel} sec (0-100KM/H: ${unbritish(carModule.accel, "0to60")} sec)\n`;
        }
        else {
            carSpecs += `0-60MPH: ${carModule.accel} sec\n`;
        }
    }

    carSpecs += `Handling: ${carModule.handling}
        ${carModule.enginePos} Engine, ${carModule.driveType}
        ${carModule.tyreType} Tyres\n`;

    if (unitPreference === "imperial") {
        const weightKg = carModule.weight !== undefined ? carModule.weight.toLocaleString("en") : "N/A";
        const weightLbs = carModule.weight !== undefined ? unbritish(carModule.weight, "weight").toLocaleString("en") : "N/A";
        carSpecs += `Weight: ${weightKg}kg (${weightLbs}lbs)\n`;
    }
    else {
        const weightKg = carModule.weight !== undefined ? carModule.weight.toLocaleString("en") : "N/A";
        carSpecs += `Weight: ${weightKg}kg\n`;
    }

    carSpecs += `Ground Clearance: ${carModule.gc}
        ${carModule.tcs ? "✅" : "❌"} TCS, ${carModule.abs ? "✅" : "❌"} ABS\n`;

    if (carModule.topSpeed < 100) {
        carSpecs += "MRA: N/A\n";
    }
    else {
        carSpecs += `MRA: ${carModule.mra}\n`;
    }
    if (carModule.topSpeed < 30) {
        carSpecs += "OLA: N/A\n";
    }
    else {
        carSpecs += `OLA: ${carModule.ola}\n`;
    }
    return carSpecs;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function eventConfig(id) {
    return EVENTS.table.find(entry => entry.id === id) || null;
}

// daily.js getPackTier, replicated (matches raceWeekManager's copy).
function getPackTier(pack) {
    if (pack.tier) return pack.tier;
    const name = (pack.packName || "").toLowerCase();
    if (name.includes("elite")) return "elite";
    if (name.includes("booster")) return "booster";
    return "standard";
}

function rollPackByTier(tier) {
    const candidates = getPackFiles().filter(file => {
        const pack = getPack(file);
        return pack && getPackTier(pack) === tier;
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)].slice(0, -5);
}

// Curated pack pools for the pack-granting in-race events — prizePools.json
// "events" section, read FRESH at every resolution so edits apply live with
// no restart. Empty/missing pool = automatic tier-based roll (which spans
// EVERY pack of that inferred tier, event/limited packs included).
const PRIZE_POOLS_PATH = path.join(__dirname, "../../raceweek/prizePools.json");

function rollEventPack(eventID, tier) {
    try {
        const parsed = JSON.parse(readFileSync(PRIZE_POOLS_PATH, "utf8"));
        const pool = parsed && parsed.events && parsed.events[eventID] && parsed.events[eventID].packPool;
        if (Array.isArray(pool) && pool.length > 0) {
            const valid = pool.filter(id => {
                if (getPack(id)) return true;
                console.log(`[RaceWeek] prizePools events.${eventID}: skipping invalid packID "${id}"`);
                return false;
            });
            if (valid.length > 0) return valid[Math.floor(Math.random() * valid.length)];
        }
    } catch (error) {
        console.log(`[RaceWeek] prizePools.json unreadable for events.${eventID} (${error.message}) — tier roll`);
    }
    return rollPackByTier(tier);
}

// ─── Driver Scout (rarity system v3) ─────────────────────────────────────────
// The scout signs a RANDOM driver of a rolled rarity — dupes are allowed
// (that's the point: dupes are progression). inRotation is REQUIRED (it gates
// all automatic sources): a high-tier driver only becomes a scout jackpot when
// an admin deliberately flags it inRotation: true — the base/rare rarity rule
// still keeps it out of the weekly rung-250 cycle.

/** Weighted rarity pick from a { rarity: weight } table (normalized implicitly). */
function pickScoutRarity(weights) {
    const entries = DRIVER_RARITIES
        .filter(rarity => weights && typeof weights[rarity] === "number" && weights[rarity] > 0)
        .map(rarity => [rarity, weights[rarity]]);
    if (entries.length === 0) return "base";
    let roll = Math.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [rarity, weight] of entries) {
        roll -= weight;
        if (roll < 0) return rarity;
    }
    return entries[entries.length - 1][0];
}

/**
 * Recruit-exclusive drivers are shop/offer purchases ONLY — they must never
 * appear in the rung-250 rotation, the Driver Scout, pack driver-drops, or any
 * reward path. Accepts a driver object or a driverID.
 */
function isRecruitExclusive(driverOrID) {
    const driver = typeof driverOrID === "string" ? getDriver(driverOrID) : driverOrID;
    return !!(driver && driver.recruitExclusive === true);
}

/**
 * Price of the NEXT copy of a recruitable driver, given how many copies the
 * player already owns (0 = first purchase). Returns null when the driver isn't
 * sold in the shop.
 */
function recruitPriceFor(driverOrID, copiesOwned = 0) {
    const driver = typeof driverOrID === "string" ? getDriver(driverOrID) : driverOrID;
    if (!driver || typeof driver.recruitPrice !== "number") return null;
    const multiplier = typeof driver.recruitMultiplier === "number"
        ? driver.recruitMultiplier
        : RECRUIT.defaultMultiplier;
    const price = Math.round(driver.recruitPrice * Math.pow(multiplier, Math.max(0, copiesOwned)));
    return Math.min(price, RECRUIT.maxPrice);
}

/** Copies of a driver a player holds: 0, or 1 + banked duplicates. */
function copiesOwnedOf(raceWeekStats, driverID) {
    const stats = (raceWeekStats && typeof raceWeekStats === "object") ? raceWeekStats : {};
    const owned = Array.isArray(stats.ownedDrivers) ? stats.ownedDrivers : [];
    if (!owned.includes(driverID)) return 0;
    const xp = (stats.driverXP && typeof stats.driverXP === "object") ? stats.driverXP[driverID] : null;
    return 1 + ((xp && typeof xp.dupes === "number") ? xp.dupes : 0);
}

// Signable drivers of one exact rarity. Only serialised constrains further:
// a player can never receive a serialised driver they already own, and a
// serialised file without a usable serialCap can't mint. Mint EXHAUSTION
// lives in serverStat.driverSerials — checked by the caller at mint time,
// not here (this module never touches serverStat).
function scoutPoolFor(rarity, ownedDrivers) {
    const owned = ownedDrivers || [];
    return getAllDrivers()
        .filter(driver => {
            // Boss Slayer is earned by clearing all four gates in one week —
            // the scout must never hand him out.
            if (driver.driverID === BOSS_SLAYER_DRIVER_ID) return false;
            // Recruit-exclusive drivers are bought, never found.
            if (isRecruitExclusive(driver)) return false;
            // inRotation gates ALL automatic sources: rung-250 (base/rare by
            // rarity rule) AND the scout. High-tier drivers only become scout
            // jackpots when an admin deliberately flags them inRotation: true —
            // the rarity gate still keeps them out of the weekly cycle.
            if (!driver.inRotation) return false;
            if (rarityOf(driver) !== rarity) return false;
            if (rarity === "serialised") {
                if (owned.includes(driver.driverID)) return false;
                if (!(typeof driver.serialCap === "number" && driver.serialCap >= 1)) return false;
            }
            return true;
        })
        .map(driver => driver.driverID);
}

/**
 * Scout grant walk: try startRarity, then re-roll ONE TIER DOWN on every
 * failed pick (empty pool), repeating until a tier lands or "base" fails too.
 * Returns { driverID, rarity, needsSerial } or null (terminal money
 * fallback). needsSerial signals the caller to claim a serial atomically via
 * the manager's mint helper BEFORE granting; if the mint comes back
 * exhausted, the caller continues the same ladder with scoutTierDown().
 */
function scoutGrantFrom(stats, startRarity) {
    let idx = DRIVER_RARITIES.indexOf(startRarity);
    if (idx === -1) idx = 0;
    for (; idx >= 0; idx--) {
        const rarity = DRIVER_RARITIES[idx];
        const pool = scoutPoolFor(rarity, stats ? stats.ownedDrivers : null);
        if (pool.length > 0) {
            return {
                driverID: pool[Math.floor(Math.random() * pool.length)],
                rarity,
                needsSerial: rarity === "serialised"
            };
        }
    }
    return null;
}

/**
 * Full scout roll: weighted rarity pick (weights default to the driverscout
 * EVENTS entry's table), then the tier-down walk. Same return contract as
 * scoutGrantFrom.
 */
function rollScoutGrant(stats, weights) {
    const cfg = eventConfig("driverscout");
    return scoutGrantFrom(stats, pickScoutRarity(weights || (cfg && cfg.rarities)));
}

/**
 * Caller-side continuation after a FAILED pick at `failedRarity` (in
 * practice: a serialised mint that came back exhausted) — resumes the walk
 * one tier below. Returns a grant or null (money fallback).
 */
function scoutTierDown(stats, failedRarity) {
    const idx = DRIVER_RARITIES.indexOf(failedRarity);
    if (idx <= 0) return null;
    return scoutGrantFrom(stats, DRIVER_RARITIES[idx - 1]);
}

// Revenge candidates: still-loadable, normal-class only — a boss-gate loss
// can't come back as a regular-round opponent (the gate-consistency check
// would immediately re-roll the matchup and void the event).
function revengePool(stats) {
    return (stats.recentLosses || []).filter(entry => {
        if (!entry) return false;
        const car = getCar(entry.carID);
        return !!car && rrOpponentClass(car) === "normal";
    });
}

function buildEvent(cfg, stats) {
    switch (cfg.id) {
        case "photofinish":
            return { id: cfg.id, tier: cfg.tier, marginMax: cfg.marginMax, bonusMult: cfg.bonusMult };
        case "cashvein":
            return { id: cfg.id, tier: cfg.tier, winsLeft: cfg.races, moneyPerWin: cfg.moneyPerWin };
        case "skiptoken":
            return { id: cfg.id, tier: cfg.tier, instant: true, skips: cfg.skips };
        case "packshards":
            return { id: cfg.id, tier: cfg.tier, instant: true, shards: cfg.shards, shardsPerPack: cfg.shardsPerPack };
        case "driverscout":
            return { id: cfg.id, tier: cfg.tier, moneyIfAllOwned: cfg.moneyIfAllOwned };
        case "doubleornothing":
            return { id: cfg.id, tier: cfg.tier, accepted: false, mult: cfg.mult };
        case "cursedrace":
            return { id: cfg.id, tier: cfg.tier, accepted: false, mult: cfg.mult, oppCrBoost: cfg.oppCrBoost };
        case "convoy":
            return { id: cfg.id, tier: cfg.tier, accepted: false, mult: cfg.mult, stage: 1, bank: 0, trackID: "" };
        case "underdogoffer":
            return { id: cfg.id, tier: cfg.tier, accepted: false, mult: cfg.mult, handCrMax: cfg.handCrMax };
        case "showcase":
            return { id: cfg.id, tier: cfg.tier, accepted: false, mult: cfg.mult };
        case "goldenopponent":
            return { id: cfg.id, tier: cfg.tier, pack: cfg.pack };
        case "revengematch": {
            const pool = revengePool(stats);
            if (pool.length === 0) return null;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            return { id: cfg.id, tier: cfg.tier, bonusMult: cfg.bonusMult, opponent: { carID: pick.carID, upgrade: pick.upgrade } };
        }
        default:
            return null;
    }
}

/**
 * Weighted event roll for a freshly generated matchup. Honors:
 * one-active-event (ctx.carriedEvent passes straight through), no events on
 * boss gates, and per-event eligibility (revengematch needs a valid recent
 * loss; underdogoffer only in reqMode "twist"/"hard" bands). Returns the new
 * activeEvent object, or null.
 */
function rollEvent(stats, ctx) {
    if (ctx.carriedEvent) return ctx.carriedEvent;
    if (ctx.isBossGate) return null;
    if (Math.random() >= EVENTS.rollChance) return null;

    const eligible = EVENTS.table.filter(cfg => {
        switch (cfg.id) {
            case "revengematch":
                return revengePool(stats).length > 0;
            case "underdogoffer":
                return ctx.reqMode === "twist" || ctx.reqMode === "hard";
            default:
                return true;
        }
    });
    if (eligible.length === 0) return null;

    let roll = Math.random() * eligible.reduce((sum, cfg) => sum + cfg.weight, 0);
    for (const cfg of eligible) {
        roll -= cfg.weight;
        if (roll < 0) return buildEvent(cfg, stats);
    }
    return buildEvent(eligible[eligible.length - 1], stats);
}

/** Validate a stored activeEvent on load — unknown/instant shapes drop to null. */
function normalizeActiveEvent(raw) {
    if (!raw || typeof raw !== "object" || !raw.id) return null;
    if (!eventConfig(raw.id)) return null;
    if (raw.instant) return null;
    return raw;
}

function isPendingOptIn(event) {
    return !!(event && event.tier === "optin" && !event.accepted);
}

/** Intermission banner line for the active event (null when none). */
function eventLine(event) {
    if (!event) return null;
    switch (event.id) {
        case "photofinish":
            return `${rwEmoji("photofinish")} **Photo Finish** — win by fewer than ${event.marginMax} points for +${Math.round(event.bonusMult * 100)}% pay!`;
        case "cashvein":
            return `${rwEmoji("cashvein")} **Sponsor Challenge** — a sponsor backs your next ${event.winsLeft} win${event.winsLeft === 1 ? "" : "s"}: $${event.moneyPerWin.toLocaleString("en")} bonus each!`;
        case "driverscout":
            return `${rwEmoji("driverscout")} **Driver Scout** — a talent scout is watching this race. Win to impress them!`;
        case "doubleornothing":
            return event.accepted
                ? `${rwEmoji("doubleornothing")} **Double or Nothing** accepted — ×${event.mult} payout riding on this race!`
                : `${rwEmoji("doubleornothing")} **Double or Nothing** — a stranger offers ×${event.mult} payout on this win. Accept?`;
        case "cursedrace":
            return event.accepted
                ? `${rwEmoji("cursedrace")} **Demon Challenge** accepted — slay the demon for ×${event.mult} pay!`
                : `${rwEmoji("cursedrace")} **Demon Challenge** — a demon-tuned rival demands a duel. Slay it for ×${event.mult} pay. Accept… if you dare.`;
        case "convoy":
            if (!event.accepted) {
                return `${rwEmoji("convoy")} **Convoy** — beat 2 back-to-back opponents on this track for ×${event.mult} total pay. Accept?`;
            }
            return event.stage === 1
                ? `${rwEmoji("convoy")} **Convoy** — leg 1 of 2. Win here to move the convoy on!`
                : `${rwEmoji("convoy")} **Convoy** — final leg! Win to bank ×${event.mult} total pay!`;
        case "underdogoffer":
            return event.accepted
                ? `${rwEmoji("underdogoffer")} **Underdog Offer** accepted — win with your sub-${event.handCrMax} CR hand for ×${event.mult} pay!`
                : `${rwEmoji("underdogoffer")} **Underdog Offer** — race with a hand of ${event.handCrMax} CR or less for ×${event.mult} pay. Accept?`;
        case "showcase":
            return event.accepted
                ? `${rwEmoji("showcase")} **Showcase** accepted — fresh wheels, ×${event.mult} pay on a win!`
                : `${rwEmoji("showcase")} **Showcase** — race a car you haven't used recently for ×${event.mult} pay. Accept?`;
        case "goldenopponent":
            return `${rwEmoji("goldenopponent")} **SHINY HUNT** — a shiny rival has appeared! Catch the win for a free pack — nothing lost on a loss!`;
        case "revengematch":
            return `${rwEmoji("revengematch")} **REVENGE MATCH** — this opponent beat you earlier this week. Beat them back for +${Math.round(event.bonusMult * 100)}% pay!`;
        default:
            return null;
    }
}

/** Accept-time validation for opt-in events. Returns { ok, reason? }. */
function validateAccept(event, { hand, stats }) {
    switch (event.id) {
        case "underdogoffer":
            if (!filterCheck({ car: hand, filter: { cr: { start: 1, end: event.handCrMax } } })) {
                return {
                    ok: false,
                    reason: `Your hand is over ${event.handCrMax} CR. Set a cheaper car with \`cd-sethand\`, then run \`cd-rr\` again — the offer waits with the race.`
                };
            }
            return { ok: true };
        case "showcase":
            if ((stats.usedCars || []).includes(hand.carID)) {
                return {
                    ok: false,
                    reason: "You've raced this car recently. Set a fresh hand with `cd-sethand`, then run `cd-rr` again — the offer waits with the race."
                };
            }
            return { ok: true };
        default:
            return { ok: true };
    }
}

/**
 * Apply an instant event (skiptoken/packshards) at roll time. Mutates `stats`
 * in memory and returns { lines, set, rewardsTouched } — `set` keys are
 * raceWeekStats-relative field names merged into the caller's $set payload
 * (AFTER its own dailySkips writes, so refunds win).
 */
function applyInstantEvent(event, { usedSkipsToday, today, stats, unclaimedRewards }) {
    const lines = [], set = {};
    let rewardsTouched = false;

    if (event.id === "skiptoken") {
        // Deliberately allowed below 0 — a refund at 0 used banks extra skips.
        const newUsed = usedSkipsToday - event.skips;
        stats.dailySkips = newUsed;
        stats.lastPlayedDay = today;
        set.dailySkips = newUsed;
        set.lastPlayedDay = today;
        lines.push(`${rwEmoji("skiptoken")} **SKIP TOKEN!** ${event.skips} extra free skips added for today.`);
    }
    else if (event.id === "packshards") {
        let shards = (stats.packShards || 0) + event.shards;
        if (shards >= event.shardsPerPack) {
            const packID = rollEventPack("packshards", "standard");
            if (packID) {
                shards -= event.shardsPerPack;
                unclaimedRewards.push({ pack: packID, origin: SHARD_PACK_ORIGIN, rid: makeRewardID() });
                rewardsTouched = true;
                const pack = getPack(packID);
                lines.push(`${rwEmoji("packshards")} **PACK SHARD!** That completes the set — **${pack ? pack.packName : "a pack"}** added to your unclaimed rewards!`);
            }
            else {
                lines.push(`${rwEmoji("packshards")} **PACK SHARD!** (${shards} collected)`);
            }
        }
        else {
            lines.push(`${rwEmoji("packshards")} **PACK SHARD!** (${shards}/${event.shardsPerPack} toward a free pack)`);
        }
        stats.packShards = shards;
        set.packShards = shards;
    }
    return { lines, set, rewardsTouched };
}

/**
 * Settle the active event on a WIN of the race it attached to.
 * `payout.total` must already include the driver moneyMult; the caller then
 * applies the returned moneyMult and flatBonus on top:
 *   final = round(payout.total * moneyMult) + flatBonus
 * Returns { moneyMult, flatBonus, lines, nextEvent, sameTrackID, driverGrant,
 * needsSerial, clearRecentLoss }. driverGrant is a driverID string;
 * needsSerial = true means it's a serialised driver — the caller MUST claim
 * a serial via the manager's atomic mint helper before granting, and on an
 * exhausted mint continue the ladder with scoutTierDown() (terminal fallback:
 * the driverscout moneyIfAllOwned amount). Pack entries are pushed into
 * unclaimedRewards directly; money grants go through the
 * aggregate(key, amount) callback.
 */
function resolveWin({ event, payout, result, stats, hand, unclaimedRewards, aggregate }) {
    const res = {
        moneyMult: 1, flatBonus: 0, lines: [],
        nextEvent: null, sameTrackID: null, driverGrant: null, needsSerial: false,
        clearRecentLoss: null
    };
    if (!event) return res;

    switch (event.id) {
        case "photofinish":
            if (result < event.marginMax) {
                res.flatBonus = Math.floor(payout.subtotal * event.bonusMult);
                res.lines.push(`${rwEmoji("photofinish")} **PHOTO FINISH!** Won by just ${result} — +${res.flatBonus.toLocaleString("en")} drama bonus!`);
            }
            break;
        case "cashvein": {
            aggregate("money", event.moneyPerWin);
            const left = event.winsLeft - 1;
            if (left > 0) {
                res.nextEvent = { ...event, winsLeft: left };
                res.lines.push(`${rwEmoji("cashvein")} **Sponsor Challenge:** +$${event.moneyPerWin.toLocaleString("en")}! (${left} sponsored win${left === 1 ? "" : "s"} left)`);
            }
            else {
                res.lines.push(`${rwEmoji("cashvein")} **Sponsor Challenge:** +$${event.moneyPerWin.toLocaleString("en")} — contract complete, the sponsor is satisfied!`);
            }
            break;
        }
        case "driverscout": {
            // v3: random driver by rarity weight table, dupes allowed. The
            // grant is NOT written here — the caller grants it (and mints the
            // serial first when needsSerial, falling back via scoutTierDown).
            const grant = rollScoutGrant(stats, event.rarities);
            if (grant) {
                res.driverGrant = grant.driverID;
                res.needsSerial = grant.needsSerial;
                res.lines.push(`${rwEmoji("driverscout")} **DRIVER SCOUT!** Impressed by that win, the scout signs **${driverDisplayName(grant.driverID)}**!`);
            }
            else {
                const money = event.moneyIfAllOwned || 0;
                aggregate("money", money);
                res.lines.push(`${rwEmoji("driverscout")} **DRIVER SCOUT!** The scout found nobody left to sign — +$${money.toLocaleString("en")} instead.`);
            }
            break;
        }
        case "doubleornothing":
            if (event.accepted) {
                res.moneyMult *= event.mult;
                res.lines.push(`${rwEmoji("doubleornothing")} **DOUBLE OR NOTHING!** The stranger pays up — payout ×${event.mult}!`);
            }
            break;
        case "cursedrace":
            if (event.accepted) {
                res.moneyMult *= event.mult;
                res.lines.push(`${rwEmoji("cursedrace")} **DEMON SLAIN!** Payout ×${event.mult}!`);
            }
            break;
        case "convoy":
            if (event.accepted) {
                if (event.stage === 1) {
                    res.nextEvent = { ...event, stage: 2, bank: payout.total };
                    res.sameTrackID = event.trackID;
                    res.lines.push(`${rwEmoji("convoy")} **Convoy leg 1 complete!** Same track next — one more win for the full haul!`);
                }
                else {
                    // Floor — mult 2.5 would otherwise write fractional money
                    res.flatBonus = Math.floor((event.bank + payout.total) * (event.mult - 1));
                    res.lines.push(`${rwEmoji("convoy")} **CONVOY COMPLETE!** ×${event.mult} total pay — +${res.flatBonus.toLocaleString("en")} bonus!`);
                }
            }
            break;
        case "underdogoffer":
            // Re-check the cap at payout — the hand may have changed since accept.
            if (event.accepted) {
                if (filterCheck({ car: hand, filter: { cr: { start: 1, end: event.handCrMax } } })) {
                    res.moneyMult *= event.mult;
                    res.lines.push(`${rwEmoji("underdogoffer")} **UNDERDOG DELIVERS!** Payout ×${event.mult}!`);
                }
                else {
                    res.lines.push(`${rwEmoji("underdogoffer")} **Underdog offer forfeited** — your hand is over ${event.handCrMax} CR (it changed after you accepted).`);
                }
            }
            break;
        case "showcase":
            // Re-check "unused this week" at payout — accepting with a fresh car
            // and swapping to a used meta car before racing must not pay the ×2.
            if (event.accepted) {
                if (!(stats.usedCars || []).includes(hand.carID)) {
                    res.moneyMult *= event.mult;
                    res.lines.push(`${rwEmoji("showcase")} **SHOWCASE!** Fresh wheels take the win — payout ×${event.mult}!`);
                }
                else {
                    res.lines.push(`${rwEmoji("showcase")} **Showcase forfeited** — you swapped back to a recently raced car after accepting.`);
                }
            }
            break;
        case "goldenopponent": {
            const packID = rollEventPack("goldenopponent", event.pack || "standard");
            if (packID) {
                unclaimedRewards.push({ pack: packID, origin: REWARD_ORIGIN, rid: makeRewardID() });
                const pack = getPack(packID);
                res.lines.push(`${rwEmoji("goldenopponent")} **SHINY CAUGHT!** **${pack ? pack.packName : "A pack"}** added to your unclaimed rewards!`);
            }
            break;
        }
        case "revengematch":
            res.moneyMult *= 1 + event.bonusMult;
            res.clearRecentLoss = event.opponent || null;
            res.lines.push(`${rwEmoji("revengematch")} **REVENGE IS SWEET!** Payout ×${1 + event.bonusMult}!`);
            break;
        default:
            break;
    }
    return res;
}

/**
 * Event survival when the attached race resolves without a win (loss, skip,
 * draw re-roll, stale-matchup regeneration): only multi-win buffs persist —
 * everything else, opt-in or not, expires with the race it attached to.
 */
function resolveNonWin(event) {
    if (!event) return null;
    if (event.id === "cashvein") return event;
    return null;
}

module.exports = {
    DEFAULT_DRIVER_ID,
    DRIVER_RARITIES,
    RARITY_CURVES,
    ALL_ACTIVE_LEVEL,
    rarityOf,
    isAllActiveRarity,
    maxLevelFor,
    levelFromDupes,
    getDriverLevel,
    driverDisplayName,
    isRecruitExclusive,
    recruitPriceFor,
    copiesOwnedOf,
    rollScoutGrant,
    scoutTierDown,
    applyDriver,
    getMoneyMult,
    driverLine,
    renderPlayerSpecs,
    rollEvent,
    normalizeActiveEvent,
    isPendingOptIn,
    eventLine,
    validateAccept,
    applyInstantEvent,
    resolveWin,
    resolveNonWin
};
