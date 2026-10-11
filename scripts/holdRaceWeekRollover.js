"use strict";

/**
 * HOLD RACE WEEK ROLLOVER
 * =======================
 * Makes the current Race Week run long: the Monday rollover (archive, top-3
 * trophies, weekly reset, new prizes, announcement) is skipped for N weeks and
 * then happens as normal. Wins, claimed rungs and this week's prizes all carry
 * on untouched in the meantime.
 *
 * How: the rollover only runs after claiming raceWeekState.rolloverLock, and a
 * lock younger than 10 minutes counts as "someone else is on it". This script
 * writes a lock dated 10 minutes before the Monday the rollover should come
 * back, so every tick until then backs off. No restart, no deploy — the
 * running bot reads the lock from the database on its next 3-minute check.
 *
 * ⚠️  Do NOT try to do this by editing raceWeekState.weekKey. Any stored key
 *     that differs from the real week triggers a rollover on the next tick
 *     (that is exactly what testRaceWeekRollover.js --arm relies on).
 *
 * What the long week looks like afterwards:
 *   - It archives as ONE entry under its original week key; the skipped weeks
 *     never get an archive of their own (a gap in cd-raceweekhistory).
 *   - The new week's prizes are rolled for the week the rollover lands in, so
 *     any scheduled week in prizePools.json must be keyed to THAT week.
 *
 * Usage (from repo root):
 *     node scripts/holdRaceWeekRollover.js                    # dry run: report only
 *     node scripts/holdRaceWeekRollover.js --apply            # skip the next rollover
 *     node scripts/holdRaceWeekRollover.js --apply --weeks 2  # skip the next two
 *     node scripts/holdRaceWeekRollover.js --release          # drop the hold
 *
 * --release clears the lock. If the week is already overdue by then, the
 * rollover runs on the bot's next tick (within ~3 minutes).
 */

require("dotenv").config();
const { connect, connection, disconnect } = require("mongoose");
const { DateTime } = require("luxon");
const { WEEK_KEY_FORMAT } = require("../src/util/consts/raceWeek.js");
const profileModel = require("../src/models/profileSchema.js");
const serverStatModel = require("../src/models/serverStatSchema.js");

// Mirrors the staleness window in raceWeekManager.checkRaceWeekRollover().
const LOCK_STALE_MINUTES = 10;

const APPLY = process.argv.includes("--apply");
const RELEASE = process.argv.includes("--release");
const weeksArg = process.argv.indexOf("--weeks");
const WEEKS = weeksArg === -1 ? 1 : Number(process.argv[weeksArg + 1]);

async function finish(code) {
    await disconnect();
    process.exit(code);
}

(async () => {
    console.log("=== Race Week rollover hold ===");
    if (APPLY && RELEASE) {
        console.log("❌ Pick one of --apply or --release.");
        process.exit(1);
    }
    if (!Number.isInteger(WEEKS) || WEEKS < 1 || WEEKS > 8) {
        console.log("❌ --weeks must be a whole number from 1 to 8.");
        process.exit(1);
    }
    console.log(RELEASE ? "MODE: RELEASE (will clear the hold)" : APPLY ? "MODE: APPLY (will write the hold)" : "MODE: dry run (no writes)");

    await connect(process.env.MONGO_PW);
    console.log(`database        : ${connection.name}\n`);

    const stat = await serverStatModel.findOne({});
    const state = (stat && stat.raceWeekState) || {};
    if (!state.weekKey) {
        console.log("❌ No serverStat / raceWeekState found — wrong database, or the bot has never started.");
        await finish(1);
    }

    const now = DateTime.utc();
    const currentKey = now.toFormat(WEEK_KEY_FORMAT);
    const staleBefore = now.minus({ minutes: LOCK_STALE_MINUTES }).toISO();
    const lock = typeof state.rolloverLock === "string" ? state.rolloverLock : null;
    const lockLive = !!lock && lock >= staleBefore;
    const heldUntil = lockLive ? DateTime.fromISO(lock, { zone: "utc" }).plus({ minutes: LOCK_STALE_MINUTES }) : null;
    const isHold = lockLive && lock > now.toISO();

    const nextMonday = now.startOf("week").plus({ weeks: 1 });
    const resumeAt = nextMonday.plus({ weeks: WEEKS });
    const newLock = resumeAt.minus({ minutes: LOCK_STALE_MINUTES }).toISO();

    const withWins = await profileModel.countDocuments({ "raceWeekStats.weeklyWins": { "$gt": 0 } });

    console.log(`now (UTC)       : ${now.toFormat("ccc d LLL yyyy HH:mm")}`);
    console.log(`stored week key : ${state.weekKey}`);
    console.log(`current week key: ${currentKey}`);
    console.log(`rollover lock   : ${lock || "(none)"}${isHold ? `  <- HOLD, rollover resumes ${heldUntil.toFormat("ccc d LLL HH:mm")} UTC` : lockLive ? "  <- a rollover is running right now" : ""}`);
    console.log(`players with wins this week: ${withWins}`);

    if (RELEASE) {
        if (!isHold) {
            console.log("\nNo hold is set — nothing to release.");
            await finish(0);
        }
        await serverStatModel.updateOne({ "raceWeekState.rolloverLock": lock }, { "$unset": { "raceWeekState.rolloverLock": "" } });
        console.log("\n✅ Hold released.");
        console.log(state.weekKey === currentKey
            ? `   The rollover runs as normal on ${nextMonday.toFormat("ccc d LLL")} 00:00 UTC.`
            : "   The week is overdue, so the rollover runs on the bot's next tick (within ~3 minutes).");
        await finish(0);
    }

    // A live lock that isn't a hold means a rollover is mid-flight: the reset
    // may already have happened, and parking the lock would strand it half done.
    if (lockLive && !isHold) {
        console.log("\n❌ A rollover is in progress. Wait a few minutes and run this again.");
        await finish(1);
    }
    if (state.weekKey !== currentKey && !isHold) {
        console.log("\n❌ This week's rollover is already due and not held — it will run on the bot's next tick. Too late to hold it.");
        await finish(1);
    }

    console.log(`\nwould hold until: ${resumeAt.toFormat("ccc d LLL yyyy HH:mm")} UTC (lock ${newLock})`);
    console.log(`  ${state.weekKey} keeps running until then, then rolls straight into ${resumeAt.toFormat(WEEK_KEY_FORMAT)}.`);

    if (!APPLY) {
        console.log("\nDry run only. Re-run with --apply to set the hold.");
        await finish(0);
    }

    // Conditional on what we just read, so a rollover that claimed the lock in
    // between can't be overwritten.
    const result = await serverStatModel.updateOne(
        { "raceWeekState.weekKey": state.weekKey, "raceWeekState.rolloverLock": lock === null ? { "$in": [null] } : lock },
        { "$set": { "raceWeekState.rolloverLock": newLock } }
    );
    if (result.modifiedCount !== 1) {
        console.log("\n❌ Nothing was written — the state changed while this ran. Run it again.");
        await finish(1);
    }

    const after = (await serverStatModel.findOne({})).raceWeekState || {};
    console.log(`\n✅ Hold set. rolloverLock is now ${after.rolloverLock}`);
    console.log(`   No rollover until ${resumeAt.toFormat("ccc d LLL yyyy")} 00:00 UTC. Undo with --release.`);
    await finish(0);
})().catch(async error => {
    console.error("❌ Failed:", error.message);
    await disconnect().catch(() => {});
    process.exit(1);
});
