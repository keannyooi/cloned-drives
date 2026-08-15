"use strict";

/**
 * RACE WEEK MANAGER
 * =================
 * Owns the weekly lifecycle of the Race Week mode: week keys, the weekly
 * prize map (serverStat.raceWeekState), the Monday rollover (archive →
 * top-3 prestige → mass reset → new prizes → announce), and the pure
 * threshold-ladder award calculator used by the race command on each win.
 *
 * checkRaceWeekRollover() is designed to be called every 3 minutes from
 * index.js — it is idempotent (week-key compare) and claim-based (a lock
 * field with 10-minute staleness; the weekKey itself only flips as the
 * FINAL rollover write), so overlapping ticks can never double-run a
 * rollover and a crash mid-rollover is retried, not skipped. Archive and
 * trophy steps are re-run-safe (existing-doc reuse + trophiesGranted flag).
 * It never throws.
 */

const bot = require("../../config/config.js");
const { readFileSync } = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const { BotError } = require("../classes/classes.js");
const { WEEK_KEY_FORMAT, LADDER, FILLER_25, PRIZE_POOLS } = require("../consts/raceWeek.js");
const { getCar, getPack, getDriver, getAllDrivers, getCarFiles, getPackFiles } = require("./dataManager.js");
const { getBaseType } = require("./cardType.js");
const carNameGen = require("./carNameGen.js");
const makeRewardID = require("./rewardID.js");
const { announceNewWeek } = require("./raceWeekAnnounce.js");
const rwEmoji = require("./rwEmoji.js");
const profileModel = require("../../models/profileSchema.js");
const serverStatModel = require("../../models/serverStatSchema.js");
const raceWeekResultModel = require("../../models/raceWeekResultSchema.js");

const TOP3_TROPHIES = [300, 200, 100];
const TOP3_ORIGIN = "Race Week (weekly top 3)";
const REWARD_ORIGIN = "Race Week";

// Refreshed by ensureRaceWeekState() / performRollover(); read via getPrizes().
let cachedPrizes = null;

/**
 * Luxon UTC ISO week key, e.g. "2026-W30". Accepts an optional DateTime
 * (converted to UTC); defaults to now.
 */
function getWeekKey(dt = DateTime.utc()) {
    return dt.toUTC().toFormat(WEEK_KEY_FORMAT);
}

// ─── Prize rolling ───────────────────────────────────────────────────────────

// daily.js getPackTier, replicated locally (daily's helpers are not exported).
function getPackTier(pack) {
    if (pack.tier) return pack.tier;
    const name = (pack.packName || "").toLowerCase();
    if (name.includes("elite")) return "elite";
    if (name.includes("booster")) return "booster";
    return "standard";
}

function rollPrizeCar(pool) {
    const candidates = getCarFiles().filter(file => {
        const car = getCar(file);
        // typeof check excludes reference cards (BM variants etc. carry no cr)
        if (!car || typeof car.cr !== "number") return false;
        if (!pool.cardTypes.includes(getBaseType(car))) return false;
        return car.cr >= pool.crMin && car.cr <= pool.crMax;
    });
    if (candidates.length === 0) {
        throw new Error(`Race Week: empty prize car pool (${pool.cardTypes.join("/")} cr ${pool.crMin}-${pool.crMax})`);
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return pick.slice(0, -5);
}

// Canonical driver display name: Name (Variant) (Year), variant omitted when empty.
function driverDisplayName(driver) {
    return `${driver.name}${driver.variant ? ` (${driver.variant})` : ""} (${driver.year})`;
}

// Rarity system v3 legacy mapping (design doc §5): driver JSONs written before
// the seven-tier system carry the old cosmetic tiers. Normalizing here keeps
// the manager correct whether or not a given file has been migrated yet.
const LEGACY_RARITY_MAP = { standard: "base", epic: "secret", legendary: "divine" };
function normalizeDriverRarity(rarity) {
    return LEGACY_RARITY_MAP[rarity] || rarity || "base";
}

// Weekly rung-250 rotation pool: every loaded driver with inRotation: true AND
// rarity base|rare (rarity v3 — higher tiers never rotate), sorted by driverID
// so the ISO-week index is stable regardless of load order.
function getRotationPool() {
    return getAllDrivers()
        .filter(driver => {
            if (!driver.inRotation) return false;
            // Recruit-exclusive drivers are bought, never awarded.
            if (driver.recruitExclusive === true) return false;
            const rarity = normalizeDriverRarity(driver.rarity);
            return rarity === "base" || rarity === "rare";
        })
        .sort((a, b) => a.driverID.localeCompare(b.driverID));
}

/**
 * Roll a random secret-rarity driver for the 1000-win rung (rarity v3):
 * inRotation is NOT required, serialised drivers are excluded (they normalize
 * to "serialised", never "secret"). Returns a driverID, or null when no secret
 * drivers are loaded (the rung then rolls car-only rather than blocking the
 * whole weekly rollover).
 */
function rollSecretDriver() {
    const pool = getAllDrivers().filter(driver =>
        normalizeDriverRarity(driver.rarity) === "secret" && driver.recruitExclusive !== true);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)].driverID;
}

function rollPrizePack(tier) {
    const candidates = getPackFiles().filter(file => {
        const pack = getPack(file);
        return pack && getPackTier(pack) === tier;
    });
    if (candidates.length === 0) {
        throw new Error(`Race Week: no packs of tier "${tier}" available`);
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return pick.slice(0, -5);
}

// ─── Configurable prize pools (src/raceweek/prizePools.json) ─────────────────
// Read FRESH on every roll (Monday rollover + admin reroll), so edits apply
// with no restart. Empty/missing pools fall back to the automatic rules.
const PRIZE_POOLS_PATH = path.join(__dirname, "../../raceweek/prizePools.json");

/** Whole parsed config (rungs + weeks). Unreadable file → automatic rules. */
function loadFullConfig() {
    try {
        const parsed = JSON.parse(readFileSync(PRIZE_POOLS_PATH, "utf8"));
        return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (error) {
        console.log(`[RaceWeek] prizePools.json unreadable (${error.message}) — automatic rules only`);
        return {};
    }
}

/**
 * Pre-programmed week lookup. Two key forms, most specific first:
 *   "2026-W44"  fires that exact week, once
 *   "44"        fires week 44 of EVERY year
 * Meta keys (_label / _description / _color) style the announcement; every
 * other numeric key overrides that rung for the week. Keys starting with "_"
 * are never treated as rungs, so "_example" in the file is inert documentation.
 * @returns {{meta: Object|null, rungs: Object}}
 */
function getScheduledWeek(dt = DateTime.utc(), cfg = loadFullConfig()) {
    const weeks = (cfg && typeof cfg.weeks === "object" && cfg.weeks) || {};
    const utc = dt.toUTC();
    const exactKey = utc.toFormat(WEEK_KEY_FORMAT);          // "2026-W44"
    // Accept "44" and "04" alike so a zero-padded key still matches.
    const recurringKeys = [String(utc.weekNumber), String(utc.weekNumber).padStart(2, "0")];
    const matchedKey = weeks[exactKey] ? exactKey : recurringKeys.find(key => weeks[key]);
    const block = matchedKey ? weeks[matchedKey] : null;
    if (!block || typeof block !== "object") return { meta: null, rungs: {} };

    const rungs = {};
    for (const [key, value] of Object.entries(block)) {
        if (key.startsWith("_")) continue;
        const wins = Number(key);
        if (!Number.isInteger(wins) || wins <= 0) {
            console.log(`[RaceWeek] scheduled week "${matchedKey}": ignoring non-rung key "${key}"`);
            continue;
        }
        rungs[key] = value;
    }
    return {
        meta: {
            key: matchedKey,
            label: typeof block._label === "string" ? block._label : "",
            description: typeof block._description === "string" ? block._description : "",
            color: typeof block._color === "string" ? block._color : ""
        },
        rungs
    };
}

/**
 * Base rung pools with the scheduled week's overrides applied on top. A
 * scheduled rung REPLACES that rung's normal config wholesale for the week —
 * any rung the schedule doesn't mention falls through to the normal pools.
 */
function getEffectiveConfig(dt = DateTime.utc()) {
    const full = loadFullConfig();
    const baseCfg = (full && typeof full.rungs === "object" && full.rungs) || {};
    const scheduled = getScheduledWeek(dt, full);
    return { cfg: { ...baseCfg, ...scheduled.rungs }, meta: scheduled.meta };
}

// Random valid entry from a configured pool, or null (→ automatic rule).
// Invalid IDs are skipped with a warning, never fatal.
function pickFromPool(pool, validator, label) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const valid = pool.filter(id => {
        if (validator(id)) return true;
        console.log(`[RaceWeek] prizePools: skipping invalid ${label} "${id}"`);
        return false;
    });
    if (valid.length === 0) return null;
    return valid[Math.floor(Math.random() * valid.length)];
}

// ANY existing car is poolable — including BM/reference cards and bosses; the
// admin curating the pool decides what's appropriate. (The automatic CR-band
// rules still apply their own cardType/cr filters as the fallback.)
const validPrizeCar = id => !!getCar(id);
const validPrizePack = id => !!getPack(id);
// Serialised drivers are never ladder prizes (mint-capped: scout/pack only).
const validPrizeDriver = id => {
    const driver = getDriver(id);
    return !!driver && normalizeDriverRarity(driver.rarity) !== "serialised";
};

// Ordered pick: LIST ORDER cycles by ISO week number. The same week index is
// used across every pool in a rung, so equal-length carPool/driverPool lists
// pair up week by week (themed car+driver weeks on the 1000 rung). The index
// runs over the RAW list — an invalid entry falls back to the automatic rule
// for its week rather than shifting (and desyncing) every later pairing.
function pickOrderedFromPool(pool, validator, label, dt) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const id = pool[dt.toUTC().weekNumber % pool.length];
    if (validator(id)) return id;
    console.log(`[RaceWeek] prizePools: ordered ${label} "${id}" is invalid — automatic rule fallback for this week (fix the entry to keep pairings aligned)`);
    return null;
}

/** Roll ONE rung's prize — configured pool first, automatic rule fallback. */
function rollRungPrize(rung, cfg, dt = DateTime.utc()) {
    const rungCfg = cfg[String(rung.wins)] || {};
    // "ordered": true on any rung cycles its pools by week instead of random.
    const pick = rungCfg.ordered === true
        ? (pool, validator, label) => pickOrderedFromPool(pool, validator, label, dt)
        : pickFromPool;
    switch (rung.kind) {
        case "car": {
            const pooledCar = pick(rungCfg.carPool, validPrizeCar, "carID");
            const prize = { car: { carID: pooledCar || rollPrizeCar(PRIZE_POOLS.car[rung.wins]) } };
            if (rung.exclusive) {
                const pooledDriver = pick(rungCfg.driverPool, validPrizeDriver, "driverID");
                const driverID = pooledDriver || rollSecretDriver();
                if (driverID) prize.driver = driverID;
                else console.log("[RaceWeek] no secret-rarity drivers loaded — 1000-win rung rolls car-only this week");
            }
            return prize;
        }
        case "pack": {
            const pooledPack = pick(rungCfg.packPool, validPrizePack, "packID");
            return { pack: pooledPack || rollPrizePack(PRIZE_POOLS.pack[rung.wins]) };
        }
        case "custom": {
            // Admin-added rung (any key in prizePools.json that isn't a built-in
            // LADDER rung) — assembled purely from its configured pools. Custom
            // rungs are normal races (never boss gates).
            const prize = {};
            const carID = pick(rungCfg.carPool, validPrizeCar, "carID");
            if (carID) prize.car = { carID };
            const driverID = pick(rungCfg.driverPool, validPrizeDriver, "driverID");
            if (driverID) prize.driver = driverID;
            const packID = pick(rungCfg.packPool, validPrizePack, "packID");
            if (packID) prize.pack = packID;
            if (typeof rungCfg.money === "number" && rungCfg.money > 0) prize.money = rungCfg.money;
            if (Object.keys(prize).length === 0) {
                console.log(`[RaceWeek] prizePools: custom rung ${rung.wins} has no valid prizes — skipped this roll`);
                return null;
            }
            return prize;
        }
        case "filler":
            return { money: (typeof rungCfg.money === "number" && rungCfg.money > 0) ? rungCfg.money : FILLER_25.money };
        case "driver": {
            // Configured pool: LIST ORDER is the rotation order (weekNumber
            // modulo) — admins control the driver-of-the-week sequence.
            const configured = Array.isArray(rungCfg.driverPool) ? rungCfg.driverPool.filter(id => validPrizeDriver(id)) : [];
            if (Array.isArray(rungCfg.driverPool) && rungCfg.driverPool.length > 0 && configured.length === 0) {
                console.log("[RaceWeek] prizePools: rung-250 pool has no valid drivers — using automatic rotation");
            }
            if (configured.length > 0) {
                return { driver: configured[dt.toUTC().weekNumber % configured.length] };
            }
            const rotation = getRotationPool();
            if (rotation.length === 0) {
                // Never abort the whole rollover over a missing rotation pool
                // (e.g. a deploy that forgot src/drivers/) — skip the rung.
                console.log("[RaceWeek] no base/rare inRotation drivers available — rung 250 skipped this week");
                return null;
            }
            return { driver: rotation[dt.toUTC().weekNumber % rotation.length].driverID };
        }
        default:
            throw new Error(`Race Week: unknown ladder rung kind "${rung.kind}" at ${rung.wins}`);
    }
}

/**
 * Build a full prizes map (rung string → prize object) for the week containing
 * `dt`. Shapes follow the raceWeekState contract:
 * { pack: "pXXXXX" } | { money } | { car: { carID } } | { driver }
 * The exclusive 1000 rung carries BOTH keys: { car: { carID }, driver } —
 * the weekly exclusive car plus a secret-rarity driver.
 */
/**
 * The active ladder = built-in LADDER rungs + any custom rungs configured in
 * prizePools.json (numeric keys with at least one non-empty pool / money that
 * aren't built-ins). Custom rungs award like any other threshold but are
 * never boss gates. Sorted by wins.
 */
function getActiveLadder(cfg = getEffectiveConfig().cfg) {
    const ladder = LADDER.map(rung => ({ ...rung }));
    const known = new Set(LADDER.map(rung => rung.wins));
    for (const key of Object.keys(cfg)) {
        const wins = Number(key);
        if (!Number.isInteger(wins) || wins <= 0 || known.has(wins)) continue;
        const rungCfg = cfg[key] || {};
        const hasAny = ["carPool", "packPool", "driverPool"].some(poolKey => Array.isArray(rungCfg[poolKey]) && rungCfg[poolKey].length > 0)
            || (typeof rungCfg.money === "number" && rungCfg.money > 0);
        if (!hasAny) continue;
        ladder.push({ wins, kind: "custom" });
    }
    return ladder.sort((a, b) => a.wins - b.wins);
}

function rollPrizes(dt = DateTime.utc()) {
    const { cfg, meta } = getEffectiveConfig(dt);
    if (meta) {
        console.log(`[RaceWeek] scheduled week "${meta.key}"${meta.label ? ` (${meta.label})` : ""} active`);
    }
    const prizes = {};
    for (const rung of getActiveLadder(cfg)) {
        const prize = rollRungPrize(rung, cfg, dt);
        if (prize) prizes[String(rung.wins)] = prize;
    }
    return prizes;
}

/**
 * Admin reroll (cd-raceweekprizes): re-roll one rung (by wins number) or all
 * rungs, persist into the CURRENT week's raceWeekState, refresh the cache and
 * return the updated map. Players who already claimed a rung keep what they
 * got (claims are per-player); later claimers get the new prize.
 */
async function rerollPrizes(rungWins = null) {
    const stat = await serverStatModel.findOne({});
    if (!stat || !stat.raceWeekState || !stat.raceWeekState.weekKey) {
        throw new Error("Race Week state is not initialized yet");
    }
    const { cfg } = getEffectiveConfig();
    const activeLadder = getActiveLadder(cfg);
    const targets = rungWins === null ? activeLadder : activeLadder.filter(rung => rung.wins === rungWins);
    if (targets.length === 0) throw new Error(`No ladder rung at ${rungWins} wins (built-in or configured)`);
    // Reroll-all rebuilds from scratch so custom rungs REMOVED from the pools
    // file drop out of the live map; single-rung rerolls patch in place.
    const prizes = rungWins === null ? {} : { ...(stat.raceWeekState.prizes || {}) };
    for (const rung of targets) {
        const prize = rollRungPrize(rung, cfg);
        if (prize) prizes[String(rung.wins)] = prize;
        else delete prizes[String(rung.wins)];
    }
    await serverStatModel.updateOne({}, { "$set": { "raceWeekState.prizes": prizes } });
    cachedPrizes = prizes;
    return prizes;
}

// ─── State bootstrap ─────────────────────────────────────────────────────────

/**
 * Fetch serverStat.raceWeekState, initializing it (prizes + current weekKey)
 * on first run. Returns the state object.
 */
async function ensureRaceWeekState() {
    const stat = await serverStatModel.findOne({});
    if (!stat) throw new Error("Race Week: serverStat document not found");
    let state = stat.raceWeekState || {};
    if (!state.weekKey) {
        const now = DateTime.utc();
        const fresh = {
            weekKey: getWeekKey(now),
            lastRollover: now.toISO(),
            prizes: rollPrizes(now)
        };
        // Compare-and-set on the empty weekKey so a concurrent first-run
        // init can't clobber this one (loser re-reads the winner's state).
        const claimed = await serverStatModel.findOneAndUpdate(
            { "raceWeekState.weekKey": { "$in": ["", null] } },
            { "$set": { raceWeekState: fresh } },
            { new: true }
        );
        state = claimed ? fresh : ((await serverStatModel.findOne({})).raceWeekState || fresh);
    }
    cachedPrizes = state.prizes || {};
    return state;
}

/** Cached prizes map for the current week (ensures state on first call). */
async function getPrizes() {
    if (!cachedPrizes) {
        await ensureRaceWeekState();
    }
    return cachedPrizes;
}

// ─── Rollover ────────────────────────────────────────────────────────────────

/**
 * Called every 3 minutes. No-op while the stored weekKey is current; on a new
 * ISO week, claims the rollover atomically and runs it. Never throws — DB
 * failures are reported through the BotError channel (same pattern as the
 * 12h dealership cron).
 */
async function checkRaceWeekRollover() {
    try {
        const stat = await serverStatModel.findOne({});
        if (!stat) return;
        const state = stat.raceWeekState || {};
        if (!state.weekKey) {
            await ensureRaceWeekState();
            return;
        }
        const currentKey = getWeekKey();
        if (currentKey === state.weekKey) {
            if (!cachedPrizes) cachedPrizes = state.prizes || {};
            return;
        }
        // CLAIM: take a lock field instead of flipping weekKey — the flip only
        // happens as performRollover's FINAL write, so a crash mid-rollover
        // leaves weekKey stale and a later tick retries (lock goes stale after
        // 10 minutes). ISO strings compare lexicographically, so $lt works.
        const staleBefore = DateTime.utc().minus({ minutes: 10 }).toISO();
        const claimed = await serverStatModel.findOneAndUpdate(
            {
                "raceWeekState.weekKey": state.weekKey,
                "$or": [
                    { "raceWeekState.rolloverLock": { "$exists": false } },
                    { "raceWeekState.rolloverLock": null },
                    { "raceWeekState.rolloverLock": { "$lt": staleBefore } }
                ]
            },
            { "$set": { "raceWeekState.rolloverLock": DateTime.utc().toISO() } }
        );
        if (!claimed) return;   // another tick holds a fresh claim
        await performRollover(state, currentKey);
    } catch (error) {
        console.log(error.stack);
        try {
            const errorReport = new BotError({
                stack: error.stack,
                unknownSource: true
            });
            errorReport.sendReport();
        } catch (_) {}
    }
}

/**
 * The Monday sequence for the week that just ended (`prevState`):
 * archive standings → top-3 trophies → mass weekly reset → roll + persist the
 * new week's prizes → best-effort announcement. Announce runs last so its
 * failure can never abort the rollover.
 */
async function performRollover(prevState, currentKey) {
    const endingKey = prevState.weekKey;
    const now = DateTime.utc();

    // Crash-safe re-run support: if a previous attempt archived this week
    // already, reuse its standings (the live stats may have been reset by
    // that attempt) and never double-grant trophies.
    const existing = await raceWeekResultModel.findOne({ weekKey: endingKey }).lean();
    let standings;
    let totals;

    if (existing) {
        standings = existing.standings || [];
        // Crash-retry path: reuse the archived totals so the completion log
        // (and anything else downstream) never dereferences undefined.
        totals = existing.totals || { participants: standings.length, totalWins: 0 };
    }
    else {
        // (1) archive: top 100 by wins (tiebreak fewer losses, then margin — §4c)
        const winners = await profileModel.find(
            { "raceWeekStats.weeklyWins": { "$gt": 0 } },
            { userID: 1, "raceWeekStats.weeklyWins": 1, "raceWeekStats.weeklyLosses": 1, "raceWeekStats.weeklyMargin": 1 }
        )
            .sort({ "raceWeekStats.weeklyWins": -1, "raceWeekStats.weeklyLosses": 1, "raceWeekStats.weeklyMargin": -1 })
            .limit(100)
            .lean();

        standings = winners.map((profile, index) => {
            const stats = profile.raceWeekStats || {};
            const user = bot.users.cache.get(profile.userID);
            return {
                userID: profile.userID,
                // Fall back to the userID (not "Unknown") — still identifiable
                // when the member wasn't in the cache at archive time.
                username: user ? user.username : profile.userID,
                weeklyWins: stats.weeklyWins || 0,
                weeklyLosses: stats.weeklyLosses || 0,
                weeklyMargin: stats.weeklyMargin || 0,
                rank: index + 1
            };
        });

        const [participants, winsAgg] = await Promise.all([
            profileModel.countDocuments({ "raceWeekStats.weeklyWins": { "$gt": 0 } }),
            profileModel.aggregate([
                { "$match": { "raceWeekStats.weeklyWins": { "$gt": 0 } } },
                { "$group": { _id: null, totalWins: { "$sum": "$raceWeekStats.weeklyWins" } } }
            ])
        ]);
        totals = { participants, totalWins: (winsAgg[0] && winsAgg[0].totalWins) || 0 };

        // Upsert keyed on the (unique) weekKey so a partial re-run can't E11000.
        await raceWeekResultModel.updateOne(
            { weekKey: endingKey },
            {
                "$set": {
                    archivedAt: now.toISO(),
                    prizes: prevState.prizes || {},
                    standings,
                    totals,
                    trophiesGranted: false
                }
            },
            { upsert: true }
        );
    }

    // (2) top-3 prestige (trophies only — the board itself pays nothing, §4c).
    // Flag-guarded so a crashed re-run can't double-grant.
    if (!existing || existing.trophiesGranted !== true) {
        for (let i = 0; i < Math.min(3, standings.length); i++) {
            await profileModel.updateOne(
                { userID: standings[i].userID },
                { "$push": { unclaimedRewards: { trophies: TOP3_TROPHIES[i], origin: TOP3_ORIGIN } } }
            );
        }
        await raceWeekResultModel.updateOne({ weekKey: endingKey }, { "$set": { trophiesGranted: true } });
    }

    // (3) roll the NEW week's prizes BEFORE the mass reset — rollPrizes can
    // throw on a mis-configured pool, and that throw must land while the old
    // week's stats are still intact: a post-reset throw would make every
    // 10-minute lock-expiry retry re-zero the week in an endless reset loop.
    const prizes = rollPrizes(now);

    // (4) mass weekly reset — one updateMany. Persistent fields (ownedDrivers,
    // activeDriver, packShards, bestWeek, legacyHighestStreak, dailySkips) are
    // deliberately untouched. The $exists filter keeps dotted $sets from
    // manufacturing partial raceWeekStats objects on unmigrated profiles
    // (those have nothing to reset; runtime lazy-init covers them).
    await profileModel.updateMany(
        { raceWeekStats: { "$exists": true } },
        {
            "$set": {
                "raceWeekStats.weeklyWins": 0,
                "raceWeekStats.weeklyLosses": 0,
                "raceWeekStats.weeklyMargin": 0,
                "raceWeekStats.claimedThresholds": [],
                "raceWeekStats.activeEvent": null,
                "raceWeekStats.opponent": { carID: "", upgrade: "000" },
                "raceWeekStats.trackID": "",
                "raceWeekStats.reqs": {},
                // The showcase event's "unused this week" ring must clear weekly,
                // and revenge matches must not target last week's opponents.
                "raceWeekStats.usedCars": [],
                "raceWeekStats.recentLosses": []
            }
        }
    );

    // (5) the weekKey flip — this full-object $set is the atomic COMPLETION of
    // the rollover (it also clears rolloverLock). Until it lands, weekKey stays
    // stale and a later tick retries the whole thing.
    await serverStatModel.updateOne({}, {
        "$set": {
            raceWeekState: {
                weekKey: currentKey,
                lastRollover: now.toISO(),
                prizes
            }
        }
    });
    cachedPrizes = prizes;
    console.log(`[RaceWeek] rolled over ${endingKey} -> ${currentKey} (${totals.participants} participants, ${totals.totalWins} wins archived)`);

    // (5) announce — best-effort, failure never un-rolls the week
    try {
        // Read from prevState: step (5) above replaced raceWeekState wholesale,
        // so last week's pin and champion only survive on the snapshot we were
        // handed. The announcer writes the new pair back immediately below.
        const posted = await announceNewWeek({
            currentKey,
            prizes,
            standings,
            totals,
            meta: getScheduledWeek(now).meta,
            nextMeta: getScheduledWeek(now.plus({ weeks: 1 })).meta,
            prevAnnouncementID: prevState.lastAnnouncementID || "",
            prevChampionID: prevState.lastChampionID || ""
        });
        if (posted) {
            await serverStatModel.updateOne({}, {
                "$set": {
                    "raceWeekState.lastAnnouncementID": posted.announcementID,
                    "raceWeekState.lastChampionID": posted.championID
                }
            });
        }
    } catch (error) {
        console.log(`[RaceWeek] announce failed (rollover completed regardless): ${error.message}`);
    }
}

// ─── Threshold ladder awards (pure) ──────────────────────────────────────────

function safeCarName(carID) {
    const car = getCar(carID);
    if (!car) return carID;
    try {
        return carNameGen({ currentCar: car, removePrizeTag: true });
    } catch (_) {
        return `${Array.isArray(car.make) ? car.make[0] : car.make} ${car.model} (${car.modelYear})`;
    }
}

/**
 * Pure calculator for ladder rungs crossed in (prevWins, newWins] that are not
 * already claimed. Returns:
 *   entries      — unclaimedRewards-convention entries (ONE reward key each,
 *                  reward key first, origin "Race Week"). The caller may
 *                  aggregate money into an existing same-origin entry.
 *   lines        — celebration strings (prize names resolved).
 *   claimed      — the rung win-numbers to append to claimedThresholds.
 *   driverGrants — driver IDs to grant (NOT entries: the caller adds them to
 *                  ownedDrivers, or converts a dupe to DUPE_DRIVER_MONEY money).
 *
 * A prize object may carry SEVERAL award keys (the 1000 rung holds both car
 * and driver) — every present key is awarded, each with its own line.
 */
function computeThresholdAwards(prevWins, newWins, claimedThresholds, prizes) {
    const claimedSet = new Set(claimedThresholds || []);
    const entries = [], lines = [], claimed = [], driverGrants = [];
    // Iterate the WEEK'S PRIZE MAP (not the static LADDER) so admin-configured
    // custom rungs award like any built-in threshold.
    const rungWinsList = Object.keys(prizes || {})
        .map(Number)
        .filter(wins => Number.isInteger(wins) && wins > 0)
        .sort((a, b) => a - b);
    for (const wins of rungWinsList) {
        if (wins <= prevWins || wins > newWins || claimedSet.has(wins)) continue;
        const prize = prizes[String(wins)];
        if (!prize) continue;   // missing prize roll — skip rather than crash a race
        claimed.push(wins);
        const exclusive = !!(LADDER.find(rung => rung.wins === wins) || {}).exclusive;

        if (prize.car && prize.car.carID) {
            entries.push({ car: { carID: prize.car.carID }, origin: REWARD_ORIGIN, rid: makeRewardID() });
            lines.push(`${rwEmoji("winner")} **${wins} wins!** Prize car earned: **${safeCarName(prize.car.carID)}**${exclusive ? " — this week's exclusive!" : ""}`);
        }
        if (prize.driver) {
            driverGrants.push(prize.driver);
            // getDriver tolerates unknown IDs (old stored prize maps may hold
            // v1 keys post-migration) — fall back to the raw ID string.
            const driver = getDriver(prize.driver);
            lines.push(`${rwEmoji("winner")} **${wins} wins!** Driver unlocked: **${driver ? driverDisplayName(driver) : prize.driver}**${exclusive ? " — this week's secret driver!" : ""}`);
        }
        if (prize.pack) {
            const pack = getPack(prize.pack);
            entries.push({ pack: prize.pack, origin: REWARD_ORIGIN, rid: makeRewardID() });
            lines.push(`${rwEmoji("winner")} **${wins} wins!** Pack earned: **${pack ? pack.packName : prize.pack}**`);
        }
        if (prize.money) {
            entries.push({ money: prize.money, origin: REWARD_ORIGIN });
            lines.push(`${rwEmoji("winner")} **${wins} wins!** Earned $${prize.money.toLocaleString("en")}!`);
        }
    }
    return { entries, lines, claimed, driverGrants };
}

// ─── Serialised-driver mint ledger (rarity v3) ───────────────────────────────

/**
 * Atomically claim the next serial for a serialised driver against the global
 * mint ledger (serverStat.driverSerials, driverID → minted count). Returns the
 * claimed 1-based serial number, or null when the mint is exhausted.
 *
 * Concurrency: the $lt-cap condition + $inc make each claim atomic — two
 * simultaneous claims of the last serial can never both succeed. The
 * missing-key first-mint race is handled by a $exists-guarded init to 0
 * (only one writer can create the key; everyone then competes on the $inc).
 */
async function claimDriverSerial(driverID, cap) {
    if (typeof cap !== "number" || cap < 1) return null;
    const field = `driverSerials.${driverID}`;
    const claim = () => serverStatModel.findOneAndUpdate(
        { [field]: { "$exists": true, "$lt": cap } },
        { "$inc": { [field]: 1 } },
        { new: true }
    );

    let claimed = await claim();
    if (!claimed) {
        // Either the key doesn't exist yet (first mint) or the cap is reached.
        // Init the counter to 0 only when the key is missing — the $exists
        // guard means concurrent initializers can't reset an active counter —
        // then retry the atomic claim once.
        await serverStatModel.updateOne(
            { [field]: { "$exists": false } },
            { "$set": { [field]: 0 } }
        );
        claimed = await claim();
    }
    // Post-$inc counter value IS the 1-based serial just claimed.
    return claimed ? claimed.driverSerials[driverID] : null;
}

/**
 * Whether `driverID` can still be granted with respect to the serial mint:
 * true for any non-serialised driver; for serialised ones, true while the
 * global mint counter is below the driver's serialCap. Unknown drivers or
 * serialised drivers without a valid serialCap → false.
 * (Per-player "already owns this serialised driver" checks are the caller's
 * job — this helper only covers the global ledger.)
 */
async function isSerialAvailable(driverID) {
    const driver = getDriver(driverID);
    if (!driver) return false;
    if (normalizeDriverRarity(driver.rarity) !== "serialised") return true;
    if (typeof driver.serialCap !== "number" || driver.serialCap < 1) return false;
    const stat = await serverStatModel.findOne({}, { driverSerials: 1 }).lean();
    const minted = (stat && stat.driverSerials && stat.driverSerials[driverID]) || 0;
    return minted < driver.serialCap;
}

module.exports = {
    getWeekKey,
    ensureRaceWeekState,
    rollPrizes,
    rerollPrizes,
    getActiveLadder,
    getScheduledWeek,
    getEffectiveConfig,
    checkRaceWeekRollover,
    performRollover,
    getPrizes,
    computeThresholdAwards,
    claimDriverSerial,
    isSerialAvailable
};
