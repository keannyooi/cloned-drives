"use strict";

/**
 * RACE WEEK (Random Race 2.0) — core mode.
 * Weekly win-count ladder replacing the old infinite streak. Wins only climb;
 * losses re-roll the opponent and cost nothing. Threshold prizes are computed
 * by raceWeekManager and land instantly in unclaimedRewards (origin "Race Week").
 *
 * Extension points for the drivers/random-events layers (module-scope):
 *   computeWinPayout, generateMatchup, generateReqs, buildIntermission,
 *   buildEarningsMessage, persistMoneyReward, normalizeRaceWeekStats,
 *   nextRungInfo, prizeName, utcToday.
 * Reward persistence is ATOMIC by design: money via persistMoneyReward
 * ($inc/$push), entries via $push $each, counters via $inc/$max — never a
 * full-array or absolute-counter $set that could clobber concurrent writes.
 *
 * Layered on top (src/util/functions/raceWeekEvents.js):
 *   drivers v2 — the active driver's bonuses[] (data-driven, src/drivers/)
 *   are applied to the player carModule before display and race(); the
 *   intermission shows a PASSIVE driver line only (⚡ active / 💤 idle) — no
 *   in-race swap, use cd-setdriver between races. Dupes feed driverXP levels.
 *   in-race events — rolled via settleNextEvent() wherever a matchup is
 *   generated, stored in raceWeekStats.activeEvent, settled at payout time
 *   (resolveWin) or on loss/skip/draw/regen (resolveNonWin).
 */

const bot = require("../config/config.js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { DateTime } = require("luxon");
const { getCarFiles, getTrackFiles, getCar, getTrack, getPack, getDriver, driverExists } = require("../util/functions/dataManager.js");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, moneyEmojiID, bossEmojiID, DIAMONDS_ENABLED } = require("../util/consts/consts.js");
const { ECON, LADDER, BOSS_GATES, DIFFICULTY, REQ_POOLS, DUPE_DRIVER_MONEY, BOSS_SLAYER_DRIVER_ID } = require("../util/consts/raceWeek.js");
const { rrOpponentClass, usesReferenceStats, rrMoneyBonusPct } = require("../util/functions/cardType.js");
const { checkRaceWeekRollover, getPrizes, computeThresholdAwards, claimDriverSerial } = require("../util/functions/raceWeekManager.js");
const {
    DEFAULT_DRIVER_ID, RARITY_CURVES, rarityOf, isAllActiveRarity, maxLevelFor,
    levelFromDupes, scoutTierDown,
    getDriverLevel, driverDisplayName, applyDriver, driverLine, renderPlayerSpecs,
    rollEvent, normalizeActiveEvent, isPendingOptIn, eventLine,
    validateAccept, applyInstantEvent, resolveWin, resolveNonWin
} = require("../util/functions/raceWeekEvents.js");
const getButtons = require("../util/functions/getButtons.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const race = require("../util/functions/race.js");
const createCar = require("../util/functions/createCar.js");
const filterCheck = require("../util/functions/filterCheck.js");
const carNameGen = require("../util/functions/carNameGen.js");
const rwEmoji = require("../util/functions/rwEmoji.js");
const handMissingError = require("../util/commonerrors/handMissingError.js");
const profileModel = require("../models/profileSchema.js");

const REWARD_ORIGIN = "Race Week";
const OPPONENT_UPGRADES = ["000", "333", "666", "699", "969", "996"];
const RECENT_LOSSES_MAX = 5;
// Ring of recently raced hand carIDs (showcase event) — approximates
// "unused this week": capped, and cleared by the Monday rollover reset.
const USED_CARS_MAX = 15;
// BOSS_SLAYER_DRIVER_ID (imported from consts/raceWeek.js) is granted when all
// four boss gates are claimed within a single week (BOSS_SLAYER_RULE) —
// d00012 Ragnar Voss, inRotation false by design.

const utcToday = () => DateTime.utc().toFormat("yyyy-MM-dd");

// Canonical raceWeekStats defaults — factory so callers never share array/object refs.
function raceWeekDefaults() {
    return {
        weeklyWins: 0,
        weeklyLosses: 0,
        weeklyMargin: 0,
        claimedThresholds: [],
        dailySkips: 0,
        lastPlayedDay: "",
        opponent: { carID: "", upgrade: "000" },
        trackID: "",
        reqs: {},
        activeDriver: DEFAULT_DRIVER_ID,
        ownedDrivers: [DEFAULT_DRIVER_ID],
        driverXP: {},
        packShards: 0,
        recentLosses: [],
        activeEvent: null,
        usedCars: [],
        bestWeek: 0,
        legacyHighestStreak: 0
    };
}

/**
 * Lazy-init helper: tolerates missing/partial raceWeekStats on old profiles.
 * Returns { stats, needsInit } — when needsInit, the caller $sets the merged
 * object once so subsequent dotted-path updates always have a full shape.
 */
function normalizeRaceWeekStats(raw) {
    const defaults = raceWeekDefaults();
    const stats = { ...defaults, ...(raw || {}) };
    stats.opponent = { ...defaults.opponent, ...(stats.opponent || {}) };
    const needsInit = !raw || Object.keys(defaults).some(key => raw[key] === undefined);
    return { stats, needsInit };
}

/**
 * Atomically add money to the player's "Race Week"-origin unclaimedRewards
 * entry ($inc on the matched element; $push a fresh entry when none exists).
 * Never rewrites the whole array, so concurrent background grants survive.
 */
async function persistMoneyReward(userID, amount) {
    if (!amount || amount <= 0) return;
    const res = await profileModel.updateOne(
        { userID, unclaimedRewards: { "$elemMatch": { origin: REWARD_ORIGIN, money: { "$exists": true } } } },
        { "$inc": { "unclaimedRewards.$.money": amount } }
    );
    const modified = res.modifiedCount !== undefined ? res.modifiedCount : res.nModified;
    if (!modified) {
        await profileModel.updateOne(
            { userID },
            { "$push": { unclaimedRewards: { money: amount, origin: REWARD_ORIGIN } } }
        );
    }
}

/**
 * In-memory driver grant (rarity system v3): first copy joins ownedDrivers at
 * LEVEL 0 (all no-minLevel bonuses active); a dupe adds +1 driverXP dupe,
 * leveling on the driver's per-rarity RARITY_CURVES curve. Dupes past max
 * level — and ANY dupe of an all-active rarity (icon/autograph/serialised) —
 * convert to DUPE_DRIVER_MONEY. Serialised recruits pass their freshly minted
 * serial via opts.serial; it's stored on the driverXP entry ({ dupes, level,
 * serial }) and celebrated as "Serial #N of cap". Returns { line, ownedDirty,
 * xpDirty, money } — the caller persists ownedDrivers/driverXP and aggregates
 * any money. Level is recomputed from dupes each grant, so stale legacy
 * (1-based) cached levels self-heal on the next dupe.
 */
function grantDriver(stats, driverID, opts) {
    const serial = opts && typeof opts.serial === "number" ? opts.serial : null;
    const name = driverDisplayName(driverID);
    const rarity = rarityOf(driverID);
    if (!stats.ownedDrivers.includes(driverID)) {
        stats.ownedDrivers.push(driverID);
        let line = null, xpDirty = false;
        if (serial !== null) {
            if (typeof stats.driverXP !== "object" || stats.driverXP === null) stats.driverXP = {};
            stats.driverXP[driverID] = { dupes: 0, level: 0, serial };
            xpDirty = true;
            const def = getDriver(driverID);
            const cap = def && typeof def.serialCap === "number" ? def.serialCap : "?";
            line = `${rwEmoji("serial")} **${name}** — **Serial #${serial} of ${cap}** — all bonuses active from day one!`;
        }
        else if (isAllActiveRarity(rarity)) {
            line = `✨ **${name}** joins the paddock — ${rarity} card, all bonuses active from day one!`;
        }
        return { line, ownedDirty: true, xpDirty, money: 0 };
    }
    if (isAllActiveRarity(rarity)) {
        // icon/autograph/serialised: ownership already unlocks everything —
        // any dupe goes straight to money. (Serialised dupes can't normally
        // occur — pools exclude owned serialised cards — defensive.)
        return {
            line: `${rwEmoji("maxed")} Duplicate **${name}** — converted to **$${DUPE_DRIVER_MONEY.toLocaleString("en")}**.`,
            ownedDirty: false, xpDirty: false, money: DUPE_DRIVER_MONEY
        };
    }
    if (typeof stats.driverXP !== "object" || stats.driverXP === null) stats.driverXP = {};
    const entry = stats.driverXP[driverID] || { dupes: 0, level: 0 };
    const prevLevel = levelFromDupes(entry.dupes, rarity);
    if (prevLevel >= maxLevelFor(rarity)) {
        return {
            line: `${rwEmoji("maxed")} **${name}** is already at max level — converted to **$${DUPE_DRIVER_MONEY.toLocaleString("en")}**.`,
            ownedDirty: false, xpDirty: false, money: DUPE_DRIVER_MONEY
        };
    }
    entry.dupes += 1;
    const newLevel = levelFromDupes(entry.dupes, rarity);
    entry.level = newLevel;
    stats.driverXP[driverID] = entry;
    let line;
    if (newLevel > prevLevel) {
        line = `${rwEmoji("levelUp")} **${name}** reaches **Level ${newLevel}**!`;
    }
    else {
        // newLevel < max here (a level-up would have fired otherwise), so the
        // cumulative curve always has a next threshold to show.
        const nextThreshold = RARITY_CURVES[rarity][newLevel];
        line = `${rwEmoji("progress")} Duplicate **${name}** — ${entry.dupes}/${nextThreshold} dupes toward Level ${newLevel + 1}.`;
    }
    return { line, ownedDirty: false, xpDirty: true, money: 0 };
}

// ─── Opponent / requirement generation ───────────────────────────────────────

function rejectOpponent(car, band, isBossGate) {
    const oppClass = rrOpponentClass(car);
    // Boss gates: boss-class cars only. Non-gate rounds NEVER roll boss-class.
    if (isBossGate) return oppClass !== "boss";
    if (oppClass !== "normal") return true;
    const carCR = car.cr || 0;
    return carCR < band.oppCrMin || carCR > band.oppCrMax;
}

// Sample one criteria property off a random (non-reference) car — same value
// shapes filterCheck expects: arrays lowercased, ranges for seatCount/modelYear.
function addPropertyReq(criteria, pool, wideYears) {
    const carFiles = getCarFiles();
    const req = pool[Math.floor(Math.random() * pool.length)];

    if (req === "modelYear") {
        if (wideYears) {
            const start = 1960 + (Math.floor(Math.random() * 6) * 10);
            criteria.modelYear = { start, end: start + 10 };
        }
        else {
            const start = 1960 + (Math.floor(Math.random() * 12) * 5);
            criteria.modelYear = { start, end: start + 5 };
        }
        return;
    }

    let reqCar, attempts = 0;
    do {
        reqCar = getCar(carFiles[Math.floor(Math.random() * carFiles.length)]);
        attempts++;
    } while (usesReferenceStats(reqCar) && attempts < 50);

    const value = reqCar[req];
    if (value === undefined || value === null) return;
    if (Array.isArray(value) && value.length === 0) return;

    switch (req) {
        case "bodyStyle":
        case "make":
        case "tags":
            criteria[req] = Array.isArray(value) ? [value[0].toLowerCase()] : [value.toLowerCase()];
            break;
        case "seatCount":
            criteria[req] = { start: value, end: value + 1 };
            break;
        case "gc":
            criteria[req] = value.toLowerCase();
            break;
        default:
            break;
    }
}

/**
 * Build the hand requirements for a difficulty band. Boss gates never call
 * this (they are req-free). Twist mode may replace the CR cap with a low
 * crMax hand cap — the "make cheap cars useful" lever.
 */
function generateReqs(band, opponentCar) {
    const criteria = {};
    if (band.reqMode === "none") return criteria;

    if (band.crCapSlack !== null) {
        criteria.cr = { start: 1, end: opponentCar.cr + Math.floor(Math.random() * 6) + band.crCapSlack };
    }
    if (band.reqMode === "crCap") return criteria;

    if (band.reqMode === "twist") {
        const twist = REQ_POOLS.twist[Math.floor(Math.random() * REQ_POOLS.twist.length)];
        if (twist.type === "crMax") {
            criteria.cr = { start: 1, end: twist.values[Math.floor(Math.random() * twist.values.length)] };
        }
        else {
            addPropertyReq(criteria, twist.pool, false);
        }
        return criteria;
    }

    // "soft" / "hard"
    addPropertyReq(criteria, REQ_POOLS[band.reqMode], band.reqMode === "soft");
    return criteria;
}

/**
 * Roll a full matchup for the round at weeklyWins + 1. Pure of DB writes —
 * the caller persists opponent/trackID/reqs (single updateOne per resolution).
 * Returns { opponent: { carID, upgrade }, trackID, reqs, isBossGate }.
 */
function generateMatchup(weeklyWins) {
    const carFiles = getCarFiles();
    const trackFiles = getTrackFiles();
    const isBossGate = BOSS_GATES.includes(weeklyWins + 1);
    const band = DIFFICULTY.find(b => weeklyWins >= b.min && weeklyWins <= b.max) || DIFFICULTY[DIFFICULTY.length - 1];

    const trackID = trackFiles[Math.floor(Math.random() * trackFiles.length)].slice(0, 6);

    let opponentCarID, opponentCar, attempts = 0;
    do {
        opponentCarID = carFiles[Math.floor(Math.random() * carFiles.length)];
        opponentCar = getCar(opponentCarID);
        // Safety valve: a mis-tuned band can't hang the command forever —
        // past 25k samples accept any correctly-classed car regardless of CR.
        if (++attempts > 25000 && rrOpponentClass(opponentCar) === (isBossGate ? "boss" : "normal")) {
            console.log(`[RaceWeek] generateMatchup: band ${band.min}-${band.max} unmatched after 25k samples — widened to any ${isBossGate ? "boss" : "normal"} car`);
            break;
        }
    } while (rejectOpponent(opponentCar, band, isBossGate));

    const reqs = isBossGate ? {} : generateReqs(band, opponentCar);
    const upgrade = OPPONENT_UPGRADES[Math.floor(Math.random() * OPPONENT_UPGRADES.length)];
    return { opponent: { carID: opponentCarID.slice(0, 6), upgrade }, trackID, reqs, isBossGate };
}

const bandFor = (wins) => DIFFICULTY.find(b => wins >= b.min && wins <= b.max) || DIFFICULTY[DIFFICULTY.length - 1];

/**
 * Event bookkeeping for a freshly generated matchup: carry a surviving
 * multi-race event, or run the weighted roll. Instants (skip token / pack
 * shards) apply immediately and are never stored; a fresh revenge match
 * overrides the matchup's opponent (and re-fits reqs to the returning rival).
 * Returns { active, lines, set, rewardsTouched } — `set` keys are
 * raceWeekStats-relative fields to merge into the caller's $set payload
 * AFTER its own dailySkips writes (so skip-token refunds win).
 */
function settleNextEvent({ stats, matchup, wins, survivor, usedSkipsToday, today, unclaimedRewards }) {
    const outcome = { active: survivor || null, lines: [], set: {}, rewardsTouched: false };
    if (outcome.active) return outcome;

    const rolled = rollEvent(stats, { isBossGate: matchup.isBossGate, reqMode: bandFor(wins).reqMode });
    if (!rolled) return outcome;

    if (rolled.instant) {
        const applied = applyInstantEvent(rolled, { usedSkipsToday, today, stats, unclaimedRewards });
        outcome.lines.push(...applied.lines);
        Object.assign(outcome.set, applied.set);
        outcome.rewardsTouched = applied.rewardsTouched;
        return outcome;
    }

    if (rolled.id === "revengematch" && rolled.opponent && getCar(rolled.opponent.carID)) {
        matchup.opponent = { carID: rolled.opponent.carID, upgrade: rolled.opponent.upgrade };
        matchup.reqs = generateReqs(bandFor(wins), getCar(rolled.opponent.carID));
    }
    outcome.active = rolled;
    return outcome;
}

// ─── Payout (v2.2 formula — see docs/race-week-design.md §4a) ────────────────

/**
 * Flat per-win pay + clamped CR-differential bonus, then the card-type money
 * bonus (BM +25% via rrMoneyBonusPct; Diamond gated by DIAMONDS_ENABLED),
 * domination tiers on the subtotal, and the 5% lucky-race roll.
 */
function computeWinPayout({ playerCar, opponentCar, rawHandCar, result }) {
    const flat = ECON.flatBase;

    let crBonus = 0;
    if (playerCar.cr - opponentCar.cr <= ECON.crBonusEligibleDiff) {
        // counted crDiff clamps at +40 — bounds the farmable deep-underdog channel
        crBonus = (Math.min(opponentCar.cr - playerCar.cr, ECON.crDiffClamp) + 40) * ECON.crBonusBase;
    }
    const baseSubtotal = flat + crBonus;

    let bonusPct = rawHandCar ? rrMoneyBonusPct(rawHandCar) : 0;
    // Race Week rule (spec §4a): the diamond 2× money bonus stays OFF here
    // REGARDLESS of the global DIAMONDS_ENABLED flag — an all-diamond nolife
    // week at 2× would blow the weekly economy target (~$63M sim'd).
    if (playerCar.isDiamond) bonusPct = 0;
    const cardBonus = Math.round(baseSubtotal * bonusPct / 100);
    const subtotal = baseSubtotal + cardBonus;

    let dominationBonus = 0, dominationLabel = null;
    for (const tier of ECON.dominationTiers) {
        if (result >= tier.threshold) {
            dominationBonus = Math.floor(subtotal * tier.multiplier);
            dominationLabel = tier.label;
            break;
        }
    }

    const lucky = Math.random() < ECON.luckyChance;
    const luckyBonus = lucky ? Math.floor(subtotal * ECON.luckyMult) : 0;

    return {
        flat, crBonus, bonusPct, cardBonus, subtotal, dominationBonus, dominationLabel,
        lucky, luckyBonus, total: subtotal + dominationBonus + luckyBonus
    };
}

function buildEarningsMessage(payout, newWins) {
    const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
    let msg = `**💰 RACE EARNINGS — Win ${newWins} this week**\n`;
    msg += `Base Pay: ${moneyEmoji}${payout.flat.toLocaleString("en")}\n`;
    if (payout.crBonus > 0) msg += `CR Bonus: +${moneyEmoji}${payout.crBonus.toLocaleString("en")}\n`;
    if (payout.cardBonus > 0) {
        msg += `${payout.bonusPct >= 100 ? "Diamond" : "BM"} Bonus (+${payout.bonusPct}%): +${moneyEmoji}${payout.cardBonus.toLocaleString("en")}\n`;
    }
    msg += `**Subtotal: ${moneyEmoji}${payout.subtotal.toLocaleString("en")}**`;
    if (payout.dominationBonus > 0) msg += `\n${rwEmoji("domination")} **${payout.dominationLabel}!** +${moneyEmoji}${payout.dominationBonus.toLocaleString("en")}`;
    if (payout.luckyBonus > 0) msg += `\n${rwEmoji("lucky")} **LUCKY RACE!** +${moneyEmoji}${payout.luckyBonus.toLocaleString("en")}`;
    if (payout.total > payout.subtotal) {
        msg += `\n\n**TOTAL EARNED: ${moneyEmoji}${payout.total.toLocaleString("en")}** 🎉`;
    }
    return msg;
}

// ─── Intermission embed ──────────────────────────────────────────────────────

function prizeName(prize) {
    if (!prize) return "???";
    if (prize.car && prize.car.carID) {
        const car = getCar(prize.car.carID);
        return car ? carNameGen({ currentCar: car, removePrizeTag: true }) : "???";
    }
    if (prize.pack) {
        const pack = getPack(prize.pack);
        return pack ? pack.packName : "a pack";
    }
    if (prize.driver) {
        // Tolerates unknown/legacy IDs in old stored prize maps.
        return driverExists(prize.driver) ? `Driver: ${driverDisplayName(getDriver(prize.driver))}` : "a driver";
    }
    const bits = [];
    if (prize.money) bits.push(`$${prize.money.toLocaleString("en")}`);
    return bits.join(" + ") || "???";
}

/** First unclaimed ladder rung above weeklyWins, with its rolled prize. */
function nextRungInfo(weeklyWins, claimedThresholds, prizes) {
    const claimedSet = new Set(claimedThresholds || []);
    // The week's prize map is the rung authority (it includes admin-configured
    // custom rungs beyond the static LADDER).
    const rungWinsList = Object.keys(prizes || {})
        .map(Number)
        .filter(wins => Number.isInteger(wins) && wins > 0)
        .sort((a, b) => a - b);
    for (const wins of rungWinsList) {
        if (wins <= weeklyWins || claimedSet.has(wins)) continue;
        return { rung: LADDER.find(entry => entry.wins === wins) || { wins, kind: "custom" }, prize: prizes[String(wins)] };
    }
    return null;
}

function buildIntermission({ message, stats, prizes, track, reqs, playerList, opponentList, settings, isBossGate, freeSkipsLeft, driverInfo, event }) {
    const bossEmoji = bot.emojis.cache.get(bossEmojiID);
    const nextWin = stats.weeklyWins + 1;

    const descLines = [];
    const next = nextRungInfo(stats.weeklyWins, stats.claimedThresholds, prizes);
    if (next) {
        const away = next.rung.wins - stats.weeklyWins;
        const gateTag = BOSS_GATES.includes(next.rung.wins) ? ` — ${bossEmoji} **BOSS GATE**` : "";
        descLines.push(`Next prize: **${prizeName(next.prize)}** at ${next.rung.wins} wins (${away} win${away === 1 ? "" : "s"} away)${gateTag}`);
    }
    else {
        descLines.push(`Ladder complete — every prize this week is claimed. ${rwEmoji("winner")}`);
    }
    descLines.push(`Track: ${track.trackName}, Requirements: \`${reqDisplay(reqs, settings.filterlogic)}\``);
    if (driverInfo) descLines.push(driverInfo);
    const eventBanner = eventLine(event);
    if (eventBanner) descLines.push(eventBanner);
    if (isBossGate) {
        descLines.push(`\n**${bossEmoji} BOSS GATE — beat the boss to claim the ${nextWin}-win prize! Any hand allowed.**`);
    }

    const safeThumbnail =
        typeof track.map === "string" && track.map.startsWith("http")
            ? track.map
            : null;

    return new InfoMessage({
        channel: message.channel,
        title: isBossGate ? `${bossEmoji} Race Week — Win ${nextWin}: BOSS GATE!` : `${rwEmoji("raceweek")} Race Week — Win ${nextWin}`,
        desc: descLines.join("\n"),
        author: message.author,
        thumbnail: safeThumbnail,
        fields: [
            { name: "Your Hand", value: playerList, inline: true },
            { name: "Opponent's Hand", value: opponentList, inline: true }
        ],
        footer: `This week: ${stats.weeklyWins}W / ${stats.weeklyLosses}L | Free skips left today: ${freeSkipsLeft}`
    });
}

// ─── Command ─────────────────────────────────────────────────────────────────

module.exports = {
    name: "randomrace",
    aliases: ["rr"],
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "Race Week: climb the weekly win ladder against randomly generated opponents. Threshold prizes land instantly; losses never cost you wins.",
    async execute(message) {
        // Idempotent weekly-rollover guard — cheap no-op while the week is current.
        await checkRaceWeekRollover();

        const profile = await profileModel.findOne({ userID: message.author.id });
        if (!profile) return;

        const { hand, settings } = profile;
        if (hand.carID === "") {
            return handMissingError(message);
        }

        const { stats, needsInit } = normalizeRaceWeekStats(profile.raceWeekStats);
        if (needsInit) {
            // Carry the legacy rr streak on first init — the migration script
            // does this in bulk, but lazy-init must not bury it at 0 for
            // profiles the bot touches before the script runs.
            stats.legacyHighestStreak = Math.max(
                stats.legacyHighestStreak || 0,
                (profile.rrStats && profile.rrStats.highestStreak) || 0
            );
            await profileModel.updateOne({ userID: message.author.id }, { "$set": { raceWeekStats: stats } });
        }

        const prizes = await getPrizes();
        const carFiles = getCarFiles();
        const isBossGate = BOSS_GATES.includes(stats.weeklyWins + 1);

        let activeEvent = normalizeActiveEvent(stats.activeEvent);

        let { opponent, trackID, reqs } = stats;
        const savedValid = carFiles.includes(`${opponent.carID}.json`) && !!getTrack(trackID);
        const savedMatchesGate = savedValid && ((rrOpponentClass(getCar(opponent.carID)) === "boss") === isBossGate);
        if (!savedValid || !savedMatchesGate) {
            // Regenerate AND use the fresh values immediately (fixes the legacy
            // stale-reqs bug where the old matchup was displayed/checked).
            const fresh = generateMatchup(stats.weeklyWins);
            const regenToday = utcToday();
            // New reward entries go through $push (never a full-array $set) so
            // concurrent background grants can't be clobbered.
            const regenPending = [];
            const settled = settleNextEvent({
                stats, matchup: fresh, wins: stats.weeklyWins,
                survivor: resolveNonWin(activeEvent),
                usedSkipsToday: stats.lastPlayedDay === regenToday ? stats.dailySkips : 0,
                today: regenToday, unclaimedRewards: regenPending
            });
            activeEvent = settled.active;
            ({ opponent, trackID, reqs } = fresh);
            stats.opponent = opponent;
            stats.trackID = trackID;
            stats.reqs = reqs;
            stats.activeEvent = activeEvent;
            const regenSet = {
                "raceWeekStats.opponent": opponent,
                "raceWeekStats.trackID": trackID,
                "raceWeekStats.reqs": reqs,
                "raceWeekStats.activeEvent": activeEvent
            };
            for (const [key, value] of Object.entries(settled.set)) regenSet[`raceWeekStats.${key}`] = value;
            const regenUpdate = { "$set": regenSet };
            if (regenPending.length > 0) regenUpdate["$push"] = { unclaimedRewards: { "$each": regenPending } };
            await profileModel.updateOne({ userID: message.author.id }, regenUpdate);
            if (settled.lines.length > 0) {
                await message.channel.send(settled.lines.join("\n")).catch(() => {});
            }
        }

        const track = getTrack(trackID);
        const rawHandCar = getCar(hand.carID);

        let [opponentCar, opponentList] = createCar(opponent, settings.unitpreference);

        // Drivers layer: active bonuses are baked into the player carModule
        // (race uses it) AND the shown stat block. No in-race swap in v2 —
        // the driver is set via cd-setdriver; rebuilt only on opponent re-roll.
        const activeDriverID = driverExists(stats.activeDriver) ? stats.activeDriver : DEFAULT_DRIVER_ID;
        const activeDriverLevel = getDriverLevel(stats, activeDriverID);
        let playerCar, playerList, driverState;
        const buildPlayerSide = () => {
            const [car, list] = createCar(hand, settings.unitpreference, settings.hideownstats);
            driverState = applyDriver(car, rawHandCar, track, {
                driverID: activeDriverID, level: activeDriverLevel,
                isBoss: isBossGate, playerCR: car.cr, oppCR: opponentCar.cr
            });
            playerCar = car;
            playerList = driverState.statsChanged
                ? renderPlayerSpecs(rawHandCar, car, hand.upgrade, settings.unitpreference, settings.hideownstats)
                : list;
        };
        buildPlayerSide();

        const skipsUsedToday = stats.lastPlayedDay === utcToday() ? stats.dailySkips : 0;
        const freeSkipsLeft = Math.max(0, ECON.skipFreePerDay - skipsUsedToday);

        let intermission = buildIntermission({
            message, stats, prizes, track, reqs, playerList, opponentList, settings, isBossGate, freeSkipsLeft,
            driverInfo: driverLine(activeDriverID, driverState), event: activeEvent
        });

        const { yse, nop } = getButtons("rr", settings.buttonstyle);
        const testButton = new ButtonBuilder()
            .setCustomId("test")
            .setLabel("Test Race")
            .setStyle(ButtonStyle.Secondary);
        // Local skip button — getButtons' rr skip label still references streaks.
        const skipButton = settings.buttonstyle === "classic"
            ? new ButtonBuilder().setCustomId("skip").setEmoji("⏩").setStyle(ButtonStyle.Secondary)
            : new ButtonBuilder()
                .setCustomId("skip")
                .setLabel(freeSkipsLeft > 0 ? `Skip (${freeSkipsLeft} free left)` : `Skip (${ECON.skipFee.toLocaleString("en")} fee)`)
                .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(yse, testButton, nop, skipButton);
        // Row 2: events layer only (Accept, pending opt-ins) — the drivers
        // layer is passive here in v2 (swap drivers with cd-setdriver).
        const buttonRows = () => {
            if (!isPendingOptIn(activeEvent)) return [row];
            return [row, new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("eventaccept").setLabel("Accept Offer").setStyle(ButtonStyle.Success)
            )];
        };

        let reactionMessage;
        try {
            reactionMessage = await intermission.sendMessage({ buttons: buttonRows(), preserve: true });
        } catch (err) {
            console.error("Failed to send intermission message:", err);
            return;
        }
        if (!reactionMessage) return;

        // Re-renders the intermission in place (event accept); never consumes
        // the race — the collector stays live throughout.
        const rerenderIntermission = async () => {
            intermission = buildIntermission({
                message, stats, prizes, track, reqs, playerList, opponentList, settings, isBossGate, freeSkipsLeft,
                driverInfo: driverLine(activeDriverID, driverState), event: activeEvent
            });
            await intermission.sendMessage({ currentMessage: reactionMessage, buttons: buttonRows(), preserve: true });
        };

        // Awaited-Promise collector (pvpplay pattern) so the execList lock holds
        // through the entire button flow; message-scoped so other component
        // messages in the channel can't leak clicks into this collector.
        await new Promise((resolve) => {
            let processed = false;
            let raceCompleted = false;
            // Tracks the currently running button handler so the end-handler can
            // await it — otherwise a collector timeout during a long settlement
            // would release the execList lock while DB writes are still in flight.
            let inFlight = Promise.resolve();
            const collector = reactionMessage.message.createMessageComponentCollector({
                filter: (button) => button.user.id === message.author.id,
                time: defaultChoiceTime
            });

            const handleButton = async (button) => {
                if (raceCompleted || processed) return;
                processed = true;

                try {
                    switch (button.customId) {
                        case "test": {
                            // 🧪 Test race — no consequences
                            if (!isBossGate && !filterCheck({ car: hand, filter: reqs })) {
                                await button.reply({ content: "⚠️ Your hand does not meet the requirements for this race!", ephemeral: true });
                                processed = false;
                                return;
                            }

                            await button.deferReply({ ephemeral: true }).catch(() => {});
                            const testResult = await race(message, playerCar, opponentCar, track, settings.disablegraphics);

                            let testMessage = testResult > 0
                                ? `🧪 **TEST RACE RESULT: WIN** ✅\nYou won by ${testResult} points!\n\n✨ This was a test — your wins and money are untouched.`
                                : `🧪 **TEST RACE RESULT: LOSS** ❌\nYou lost by ${Math.abs(testResult)} points.\n\n✨ This was a test — your wins and money are untouched.`;
                            testMessage += "\n\nWhat would you like to do?\n• Click **Race** to play this race for real\n• Click **Skip** to re-roll the opponent (never touches your wins)\n• Click **Cancel** to exit without racing";

                            await button.editReply({ content: testMessage });
                            processed = false; // allow another button click
                            return;
                        }

                        case "yse": {
                            raceCompleted = true;
                            await button.deferUpdate().catch(() => {});
                            reactionMessage?.removeButtons();

                            if (!isBossGate && !filterCheck({ car: hand, filter: reqs })) {
                                intermission.editEmbed({ title: "Your hand does not meet the requirements." });
                                await intermission.sendMessage({ currentMessage: reactionMessage, preserve: true });
                                collector.stop();
                                return;
                            }

                            const result = await race(message, playerCar, opponentCar, track, settings.disablegraphics);
                            const today = utcToday();
                            const dayRolled = stats.lastPlayedDay !== today;

                            if (result > 0) {
                                const prevWins = stats.weeklyWins;
                                const newWins = prevWins + 1;
                                stats.weeklyWins = newWins;
                                stats.weeklyMargin = Math.round((stats.weeklyMargin + result) * 100) / 100;
                                if (newWins > stats.bestWeek) stats.bestWeek = newWins;

                                const payout = computeWinPayout({ playerCar, opponentCar, rawHandCar, result });
                                const extraLines = [];
                                // Money and entry grants collect into pending buffers
                                // and persist via $inc/$push — never a full-array $set,
                                // so concurrent grants (rollover trophies, PvP fan-out,
                                // admin gifts) can't be clobbered by this session.
                                const pendingEntries = [];
                                let pendingMoney = 0;
                                // Driver moneyMult first (evaluated with the race by
                                // applyDriver), then event mult/bonus on top.
                                const driverMult = driverState ? driverState.moneyMult : 1;
                                if (driverMult !== 1) {
                                    payout.total = Math.round(payout.total * driverMult);
                                    extraLines.push(`💰 **${driverDisplayName(activeDriverID)}'s cut:** payout ×${driverMult}!`);
                                }
                                const evRes = resolveWin({
                                    event: activeEvent, payout, result, stats, hand, unclaimedRewards: pendingEntries,
                                    aggregate: (key, amount) => {
                                        if (key === "money") pendingMoney += amount;
                                        else pendingEntries.push({ [key]: amount, origin: REWARD_ORIGIN });
                                    }
                                });
                                // Serialised scout grants must claim a serial from the
                                // global mint ledger BEFORE granting; an exhausted mint
                                // walks the rarity ladder down via scoutTierDown
                                // (terminal fallback: the scout's money amount). Only
                                // the scout can roll serialised — ladder driverGrants
                                // never carry a serial.
                                let scoutGrant = evRes.driverGrant
                                    ? { driverID: evRes.driverGrant, needsSerial: evRes.needsSerial }
                                    : null;
                                let scoutSerial = null;
                                while (scoutGrant && scoutGrant.needsSerial) {
                                    const scoutDef = getDriver(scoutGrant.driverID);
                                    scoutSerial = await claimDriverSerial(scoutGrant.driverID, scoutDef ? scoutDef.serialCap : 0);
                                    if (scoutSerial !== null) break;
                                    scoutGrant = scoutTierDown(stats, "serialised");
                                }
                                if (evRes.driverGrant && (!scoutGrant || scoutGrant.driverID !== evRes.driverGrant)) {
                                    // Downgraded after an exhausted mint — swap
                                    // resolveWin's celebration line for the real outcome.
                                    const scoutMoney = (activeEvent && activeEvent.moneyIfAllOwned) || 0;
                                    const replacement = scoutGrant
                                        ? `🔭 **DRIVER SCOUT!** The serialised card is fully minted — the scout signs **${driverDisplayName(scoutGrant.driverID)}** instead!`
                                        : `🔭 **DRIVER SCOUT!** The serialised card is fully minted and nobody else is available — +$${scoutMoney.toLocaleString("en")} instead.`;
                                    const scoutLineIdx = evRes.lines.findIndex(line => line.includes("DRIVER SCOUT"));
                                    if (scoutLineIdx > -1) evRes.lines.splice(scoutLineIdx, 1, replacement);
                                    else evRes.lines.push(replacement);
                                    if (!scoutGrant) pendingMoney += scoutMoney;
                                }
                                if (evRes.moneyMult !== 1) payout.total = Math.round(payout.total * evRes.moneyMult);
                                if (evRes.flatBonus > 0) payout.total += evRes.flatBonus;
                                extraLines.push(...evRes.lines);
                                pendingMoney += payout.total;

                                // Instant threshold prizes (contract: money aggregates,
                                // car/pack push one entry each, drivers grant separately)
                                const awards = computeThresholdAwards(prevWins, newWins, stats.claimedThresholds, prizes);
                                for (const entry of awards.entries) {
                                    const key = Object.keys(entry)[0];
                                    if (key === "money") {
                                        pendingMoney += entry[key];
                                    }
                                    else {
                                        pendingEntries.push(entry);
                                    }
                                }
                                const celebrationLines = awards.lines.slice();

                                // Driver grants (ladder rung + Driver Scout event) —
                                // dupes feed driverXP levels, past-max dupes → money.
                                let ownedDirty = false, driverXPDirty = false;
                                const settleGrant = (grant, lines) => {
                                    if (grant.money > 0) pendingMoney += grant.money;
                                    if (grant.line) lines.push(grant.line);
                                    ownedDirty = ownedDirty || grant.ownedDirty;
                                    driverXPDirty = driverXPDirty || grant.xpDirty;
                                };
                                for (const driverID of awards.driverGrants) {
                                    settleGrant(grantDriver(stats, driverID), celebrationLines);
                                }
                                // Scout's own celebration line is already in extraLines
                                // (post-mint corrected above); scoutSerial is non-null
                                // exactly when the grant is serialised.
                                if (scoutGrant) {
                                    settleGrant(grantDriver(stats, scoutGrant.driverID, { serial: scoutSerial }), extraLines);
                                }

                                // Boss Slayer: all four gates claimed within one week
                                const mergedClaimed = stats.claimedThresholds.concat(awards.claimed);
                                if (driverExists(BOSS_SLAYER_DRIVER_ID) && BOSS_GATES.every(gate => mergedClaimed.includes(gate))
                                    && !stats.ownedDrivers.includes(BOSS_SLAYER_DRIVER_ID)) {
                                    stats.ownedDrivers.push(BOSS_SLAYER_DRIVER_ID);
                                    ownedDirty = true;
                                    celebrationLines.push(`${rwEmoji("bossSlayer")} **BOSS SLAYER!** All four boss gates cleared this week — driver **${driverDisplayName(BOSS_SLAYER_DRIVER_ID)}** unlocked!`);
                                }

                                // Revenge served — retire that recent-loss entry
                                if (evRes.clearRecentLoss) {
                                    const lossIndex = stats.recentLosses.findIndex(entry =>
                                        entry.carID === evRes.clearRecentLoss.carID && entry.upgrade === evRes.clearRecentLoss.upgrade);
                                    if (lossIndex > -1) stats.recentLosses.splice(lossIndex, 1);
                                }

                                // Showcase ring: remember this hand as recently raced
                                let usedCars = Array.isArray(stats.usedCars) ? stats.usedCars.slice() : [];
                                if (!usedCars.includes(hand.carID)) {
                                    usedCars.push(hand.carID);
                                    if (usedCars.length > USED_CARS_MAX) usedCars = usedCars.slice(-USED_CARS_MAX);
                                }
                                stats.usedCars = usedCars;

                                const next = generateMatchup(newWins);
                                let survivor = evRes.nextEvent;
                                if (survivor && survivor.id === "convoy") {
                                    if (next.isBossGate) {
                                        survivor = null;
                                        extraLines.push("🚚 The convoy disbands — a boss gate blocks the route ahead.");
                                    }
                                    else if (evRes.sameTrackID && getTrack(evRes.sameTrackID)) {
                                        next.trackID = evRes.sameTrackID;
                                    }
                                }
                                const settled = settleNextEvent({
                                    stats, matchup: next, wins: newWins, survivor,
                                    usedSkipsToday: dayRolled ? 0 : stats.dailySkips,
                                    today, unclaimedRewards: pendingEntries
                                });
                                extraLines.push(...settled.lines);

                                const setPayload = {
                                    "raceWeekStats.opponent": next.opponent,
                                    "raceWeekStats.trackID": next.trackID,
                                    "raceWeekStats.reqs": next.reqs,
                                    "raceWeekStats.lastPlayedDay": today,
                                    "raceWeekStats.activeEvent": settled.active,
                                    "raceWeekStats.usedCars": usedCars
                                };
                                if (dayRolled) setPayload["raceWeekStats.dailySkips"] = 0;
                                for (const [key, value] of Object.entries(settled.set)) setPayload[`raceWeekStats.${key}`] = value;
                                if (ownedDirty) setPayload["raceWeekStats.ownedDrivers"] = stats.ownedDrivers;
                                if (driverXPDirty) setPayload["raceWeekStats.driverXP"] = stats.driverXP;
                                if (evRes.clearRecentLoss) setPayload["raceWeekStats.recentLosses"] = stats.recentLosses;
                                // Counters go through $inc/$max so a concurrent Monday
                                // rollover reset can never be resurrected by this write.
                                const update = {
                                    "$set": setPayload,
                                    "$inc": {
                                        "raceWeekStats.weeklyWins": 1,
                                        "raceWeekStats.weeklyMargin": Math.round(result * 100) / 100
                                    },
                                    "$max": { "raceWeekStats.bestWeek": newWins }
                                };
                                const pushOps = {};
                                if (awards.claimed.length > 0) pushOps["raceWeekStats.claimedThresholds"] = { "$each": awards.claimed };
                                if (pendingEntries.length > 0) pushOps.unclaimedRewards = { "$each": pendingEntries };
                                if (Object.keys(pushOps).length > 0) update["$push"] = pushOps;
                                await profileModel.updateOne({ userID: message.author.id }, update);
                                await persistMoneyReward(message.author.id, pendingMoney);

                                let earningsMsg = buildEarningsMessage(payout, newWins);
                                if (isBossGate) {
                                    earningsMsg = `${bot.emojis.cache.get(bossEmojiID)} **BOSS DEFEATED!**\n${earningsMsg}`;
                                }
                                if (extraLines.length > 0) {
                                    earningsMsg += `\n${extraLines.join("\n")}`;
                                }
                                await message.channel.send(earningsMsg);
                                if (celebrationLines.length > 0) {
                                    await message.channel.send(celebrationLines.join("\n"));
                                }
                            }
                            else if (result < 0) {
                                stats.weeklyLosses++;
                                stats.recentLosses.push({ carID: opponent.carID, upgrade: opponent.upgrade });
                                if (stats.recentLosses.length > RECENT_LOSSES_MAX) {
                                    stats.recentLosses = stats.recentLosses.slice(-RECENT_LOSSES_MAX);
                                }

                                const lossLines = [];
                                if (activeEvent && activeEvent.tier === "optin" && activeEvent.accepted) {
                                    lossLines.push("❌ The event offer expires unfulfilled.");
                                }

                                // Showcase ring: losses count as having raced the car too
                                let usedCars = Array.isArray(stats.usedCars) ? stats.usedCars.slice() : [];
                                if (!usedCars.includes(hand.carID)) {
                                    usedCars.push(hand.carID);
                                    if (usedCars.length > USED_CARS_MAX) usedCars = usedCars.slice(-USED_CARS_MAX);
                                }
                                stats.usedCars = usedCars;

                                const next = generateMatchup(stats.weeklyWins);
                                const lossPending = [];
                                const settled = settleNextEvent({
                                    stats, matchup: next, wins: stats.weeklyWins,
                                    survivor: resolveNonWin(activeEvent),
                                    usedSkipsToday: dayRolled ? 0 : stats.dailySkips,
                                    today, unclaimedRewards: lossPending
                                });
                                lossLines.push(...settled.lines);

                                const setPayload = {
                                    "raceWeekStats.recentLosses": stats.recentLosses,
                                    "raceWeekStats.opponent": next.opponent,
                                    "raceWeekStats.trackID": next.trackID,
                                    "raceWeekStats.reqs": next.reqs,
                                    "raceWeekStats.lastPlayedDay": today,
                                    "raceWeekStats.activeEvent": settled.active,
                                    "raceWeekStats.usedCars": usedCars
                                };
                                if (dayRolled) setPayload["raceWeekStats.dailySkips"] = 0;
                                for (const [key, value] of Object.entries(settled.set)) setPayload[`raceWeekStats.${key}`] = value;
                                const lossUpdate = {
                                    "$set": setPayload,
                                    "$inc": { "raceWeekStats.weeklyLosses": 1 }
                                };
                                if (lossPending.length > 0) lossUpdate["$push"] = { unclaimedRewards: { "$each": lossPending } };
                                await profileModel.updateOne({ userID: message.author.id }, lossUpdate);

                                let lossMsg = "💨 You lost — but no wins lost, your ladder progress is safe. Opponent re-rolled, straight back in!";
                                if (lossLines.length > 0) lossMsg += `\n${lossLines.join("\n")}`;
                                await message.channel.send(lossMsg);
                            }
                            else {
                                // Dead heat — no stat change, fresh opponent (the
                                // attached event re-rolls with the race, like a skip)
                                const next = generateMatchup(stats.weeklyWins);
                                const drawPending = [];
                                const settled = settleNextEvent({
                                    stats, matchup: next, wins: stats.weeklyWins,
                                    survivor: resolveNonWin(activeEvent),
                                    usedSkipsToday: dayRolled ? 0 : stats.dailySkips,
                                    today, unclaimedRewards: drawPending
                                });
                                const setPayload = {
                                    "raceWeekStats.opponent": next.opponent,
                                    "raceWeekStats.trackID": next.trackID,
                                    "raceWeekStats.reqs": next.reqs,
                                    "raceWeekStats.activeEvent": settled.active
                                };
                                for (const [key, value] of Object.entries(settled.set)) setPayload[`raceWeekStats.${key}`] = value;
                                const drawUpdate = { "$set": setPayload };
                                if (drawPending.length > 0) drawUpdate["$push"] = { unclaimedRewards: { "$each": drawPending } };
                                await profileModel.updateOne({ userID: message.author.id }, drawUpdate);
                                if (settled.lines.length > 0) {
                                    await message.channel.send(settled.lines.join("\n")).catch(() => {});
                                }
                            }

                            collector.stop();
                            return;
                        }

                        case "nop": {
                            raceCompleted = true;
                            await button.deferUpdate().catch(() => {});
                            collector.stop();
                            intermission.editEmbed({ title: "Action cancelled." });
                            await intermission.sendMessage({ currentMessage: reactionMessage, preserve: true });
                            return;
                        }

                        case "skip": {
                            const today = utcToday();
                            const usedToday = stats.lastPlayedDay === today ? stats.dailySkips : 0;
                            const isFree = usedToday < ECON.skipFreePerDay;

                            if (!isFree && profile.money < ECON.skipFee) {
                                await button.deferUpdate().catch(() => {});
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, you can't afford to skip this race.",
                                    desc: `You've used all ${ECON.skipFreePerDay} free skips today; further skips cost ${bot.emojis.cache.get(moneyEmojiID)}${ECON.skipFee.toLocaleString("en")}. Race, test or cancel instead.`,
                                    author: message.author
                                });
                                await errorMessage.sendMessage({ preserve: true });
                                processed = false; // no skip — buttons stay live
                                return;
                            }

                            raceCompleted = true;
                            await button.deferUpdate().catch(() => {});

                            const newDailySkips = isFree ? usedToday + 1 : usedToday;
                            stats.dailySkips = newDailySkips;
                            stats.lastPlayedDay = today;
                            const next = generateMatchup(stats.weeklyWins);
                            // Skips re-roll the race AND its attached event (cash
                            // sponsor challenges persist); the fresh race may roll its own.
                            const skipPending = [];
                            const settled = settleNextEvent({
                                stats, matchup: next, wins: stats.weeklyWins,
                                survivor: resolveNonWin(activeEvent),
                                usedSkipsToday: newDailySkips,
                                today, unclaimedRewards: skipPending
                            });
                            const skipSet = {
                                "raceWeekStats.opponent": next.opponent,
                                "raceWeekStats.trackID": next.trackID,
                                "raceWeekStats.reqs": next.reqs,
                                "raceWeekStats.dailySkips": newDailySkips,
                                "raceWeekStats.lastPlayedDay": today,
                                "raceWeekStats.activeEvent": settled.active
                            };
                            for (const [key, value] of Object.entries(settled.set)) skipSet[`raceWeekStats.${key}`] = value;
                            const update = { "$set": skipSet };
                            if (!isFree) update["$inc"] = { money: -ECON.skipFee };
                            if (skipPending.length > 0) update["$push"] = { unclaimedRewards: { "$each": skipPending } };
                            await profileModel.updateOne({ userID: message.author.id }, update);

                            const finalDailySkips = skipSet["raceWeekStats.dailySkips"];
                            const freeLeft = Math.max(0, ECON.skipFreePerDay - finalDailySkips);
                            let skipDesc = isFree
                                ? `New opponent rolled — your wins are untouched. ${freeLeft} free skip${freeLeft === 1 ? "" : "s"} left today.`
                                : `New opponent rolled — your wins are untouched. Skip fee of ${bot.emojis.cache.get(moneyEmojiID)}${ECON.skipFee.toLocaleString("en")} charged.`;
                            if (settled.lines.length > 0) skipDesc += `\n${settled.lines.join("\n")}`;
                            const skipMessage = new InfoMessage({
                                channel: message.channel,
                                title: "Successfully skipped race.",
                                desc: skipDesc,
                                author: message.author
                            });

                            collector.stop();
                            await skipMessage.sendMessage({ currentMessage: reactionMessage, preserve: true });
                            return;
                        }

                        case "eventaccept": {
                            if (!isPendingOptIn(activeEvent)) {
                                await button.deferUpdate().catch(() => {});
                                processed = false;
                                return;
                            }
                            const verdict = validateAccept(activeEvent, { hand, stats });
                            if (!verdict.ok) {
                                await button.reply({ content: `⚠️ ${verdict.reason}`, ephemeral: true }).catch(() => {});
                                processed = false;
                                return;
                            }
                            await button.deferUpdate().catch(() => {});
                            activeEvent.accepted = true;
                            if (activeEvent.id === "convoy") activeEvent.trackID = trackID;
                            const acceptSet = { "raceWeekStats.activeEvent": activeEvent };
                            if (activeEvent.id === "cursedrace") {
                                // Conjure a meaner rival: normal-class, CR at least
                                // current + boost (floor relaxes if that pool is empty)
                                let crFloor = opponentCar.cr + activeEvent.oppCrBoost;
                                let candidates = [];
                                while (candidates.length === 0 && crFloor > 0) {
                                    candidates = carFiles.filter(file => {
                                        const car = getCar(file);
                                        return car && rrOpponentClass(car) === "normal"
                                            && typeof car.cr === "number" && car.cr >= crFloor;
                                    });
                                    crFloor -= 50;
                                }
                                if (candidates.length > 0) {
                                    const pick = candidates[Math.floor(Math.random() * candidates.length)];
                                    opponent = {
                                        carID: pick.slice(0, 6),
                                        upgrade: OPPONENT_UPGRADES[Math.floor(Math.random() * OPPONENT_UPGRADES.length)]
                                    };
                                    stats.opponent = opponent;
                                    acceptSet["raceWeekStats.opponent"] = opponent;
                                    ([opponentCar, opponentList] = createCar(opponent, settings.unitpreference));
                                    buildPlayerSide();   // underdog-driver state may flip vs the new CR
                                }
                            }
                            await profileModel.updateOne({ userID: message.author.id }, { "$set": acceptSet });
                            await rerenderIntermission();
                            processed = false;
                            return;
                        }

                        default:
                            processed = false;
                            return;
                    }
                } catch (err) {
                    console.error("Randomrace interaction error:", err);
                    // A thrown error in a non-terminal branch must not dead-lock
                    // the remaining buttons until timeout.
                    if (!raceCompleted) processed = false;
                }
            };

            collector.on("collect", (button) => {
                // ACCUMULATE, never replace — a second click (e.g. a spam-click
                // returning instantly on the processed guard) must not clobber
                // the promise the end-handler awaits before releasing the lock.
                const handled = handleButton(button);
                inFlight = inFlight.then(() => handled, () => handled);
            });

            collector.on("end", async () => {
                // Never release the command lock while a settlement is mid-write.
                await inFlight.catch(() => {});
                if (!raceCompleted && !processed) {
                    intermission.editEmbed({ title: "Action cancelled automatically." });
                    await intermission.sendMessage({ currentMessage: reactionMessage, preserve: true });
                }
                resolve();
            });
        });

        return bot.deleteID(message.author.id);
    }
};
