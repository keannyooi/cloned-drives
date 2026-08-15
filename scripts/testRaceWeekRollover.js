"use strict";

/**
 * TEST RACE WEEK ROLLOVER
 * =======================
 * Rewinds the stored week key by one ISO week, so the running bot's next
 * 3-minute check performs a REAL rollover — archive, top-3 trophies, weekly
 * reset, fresh prizes, announcement. Lets you verify the whole Monday
 * sequence without waiting for Monday.
 *
 * ⚠️  THIS IS DESTRUCTIVE ONCE PLAYERS HAVE WINS.
 *     A rollover ZEROES everyone's weekly wins/losses/claimed rungs. Running
 *     it mid-week throws away real progress. It is safe ONLY while nobody has
 *     accumulated anything yet (i.e. right after launch, before players race).
 *     The script refuses to run if it finds players with wins unless you pass
 *     --force.
 *
 * Usage (from repo root):
 *     node scripts/testRaceWeekRollover.js              # dry run: report only
 *     node scripts/testRaceWeekRollover.js --arm        # actually rewind
 *     node scripts/testRaceWeekRollover.js --arm --force  # rewind even with wins
 *
 * After --arm: leave the bot running and watch the console for
 *     [RaceWeek] rolled over <old> -> <new> (N participants, M wins archived)
 * within ~3 minutes, plus the announcement in the events channel.
 */

require("dotenv").config();
const { connect, connection, disconnect } = require("mongoose");
const { DateTime } = require("luxon");
const { WEEK_KEY_FORMAT } = require("../src/util/consts/raceWeek.js");
const profileModel = require("../src/models/profileSchema.js");
const serverStatModel = require("../src/models/serverStatSchema.js");

const ARM = process.argv.includes("--arm");
const FORCE = process.argv.includes("--force");

(async () => {
    console.log("=== Race Week rollover test ===");
    console.log(ARM ? "MODE: ARM (will rewind the week key)" : "MODE: dry run (no writes)\n");

    const weConnected = connection.readyState === 0;
    if (weConnected) await connect(process.env.MONGO_PW);

    const stat = await serverStatModel.findOne({});
    if (!stat) {
        console.log("❌ No serverStat document — start the bot once first.");
        if (weConnected) await disconnect();
        process.exit(1);
    }

    const state = stat.raceWeekState || {};
    if (!state.weekKey) {
        console.log("❌ raceWeekState isn't initialised yet — start the bot once so it seeds the first week.");
        if (weConnected) await disconnect();
        process.exit(1);
    }

    const now = DateTime.utc();
    const currentKey = now.toFormat(WEEK_KEY_FORMAT);
    const rewoundKey = now.minus({ weeks: 1 }).toFormat(WEEK_KEY_FORMAT);

    console.log(`stored week key : ${state.weekKey}`);
    console.log(`current week key: ${currentKey}`);
    console.log(`would rewind to : ${rewoundKey}`);
    console.log(`prizes on record: ${Object.keys(state.prizes || {}).length} rungs`);

    // How much real progress would a rollover destroy?
    const withWins = await profileModel.countDocuments({ "raceWeekStats.weeklyWins": { "$gt": 0 } });
    const agg = await profileModel.aggregate([
        { "$match": { "raceWeekStats.weeklyWins": { "$gt": 0 } } },
        { "$group": { _id: null, total: { "$sum": "$raceWeekStats.weeklyWins" } } }
    ]);
    const totalWins = (agg[0] && agg[0].total) || 0;
    console.log(`\nplayers with wins this week: ${withWins} (${totalWins} wins total)`);

    if (withWins > 0 && !FORCE) {
        console.log("\n⚠️  REFUSING TO ARM — a rollover would wipe this progress.");
        console.log("    Test before players start racing, or pass --force if you accept the loss.");
        if (weConnected) await disconnect();
        process.exit(1);
    }

    if (!ARM) {
        console.log("\nDry run only. Re-run with --arm to rewind the week key.");
        if (weConnected) await disconnect();
        process.exit(0);
    }

    await serverStatModel.updateOne({}, { "$set": { "raceWeekState.weekKey": rewoundKey } });
    console.log(`\n✅ Week key rewound to ${rewoundKey}.`);
    console.log("   Leave the bot RUNNING. Within ~3 minutes you should see:");
    console.log(`     [RaceWeek] rolled over ${rewoundKey} -> ${currentKey} (...)`);
    console.log("   (If the bot is offline, it will roll over on next startup instead.)");
    console.log("");
    if (process.env.RACEWEEK_DEV_ANNOUNCE === "true") {
        console.log("   📣 RACEWEEK_DEV_ANNOUNCE=true — the announcement will be POSTED to the");
        console.log("      Race Week channel as a render-only preview:");
        console.log("        • no @Race Week Updates ping   • no pin swap   • no champion role granted");
        console.log("      Delete the message when you're done; nothing else was touched.");
    }
    else {
        console.log("   The announcement will be PRINTED to this console, not posted.");
        console.log("   To see how it actually renders, set RACEWEEK_DEV_ANNOUNCE=true in .env,");
        console.log("   restart the bot, and run this again — it posts a preview with every");
        console.log("   side effect suppressed (no pings, no pin, no role changes).");
    }

    if (weConnected) await disconnect();
    process.exit(0);
})().catch(error => {
    console.error("❌ Failed:", error.message);
    process.exit(1);
});
