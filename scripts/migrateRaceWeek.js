"use strict";

/**
 * Race Week one-shot migration — backfill profile.raceWeekStats + serverStat.raceWeekState
 * ========================================================================================
 * For every profile missing `raceWeekStats`, writes the canonical default block,
 * carrying `legacyHighestStreak` over from the old `rrStats.highestStreak`
 * (NOT `dailyStats.highestStreak`, which is an unrelated daily-login stat).
 * Also initializes the serverStat singleton's `raceWeekState` if missing.
 *
 * NOTE: the bot ALSO lazy-inits raceWeekStats at runtime the first time a player
 * touches Race Week, so this script is tidiness/bulk-backfill, not a hard
 * prerequisite — the game behaves the same whether it has run or not. Running it
 * just spares leaderboard/statistics queries from special-casing missing fields.
 *
 * Idempotent: profiles that already have raceWeekStats are skipped, and every
 * write re-checks `$exists: false` server-side, so racing against the live
 * bot's lazy init cannot clobber real progress.
 *
 * .env holds LIVE PRODUCTION credentials (MONGO_PW is a full connection URI) —
 * always do a --dry-run first.
 *
 * Usage (from the repo root — dotenv resolves .env against cwd):
 *   node scripts/migrateRaceWeek.js --dry-run   → counts only, writes nothing
 *   node scripts/migrateRaceWeek.js             → live backfill
 */

require("dotenv").config();
const mongoose = require("mongoose");
const profileModel = require("../src/models/profileSchema.js");
const serverStatModel = require("../src/models/serverStatSchema.js");

const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK_SIZE = 500;

// Canonical raceWeekStats default (must match the profileSchema default and the
// bot's runtime lazy-init exactly).
function buildRaceWeekStats(legacyHighestStreak) {
    return {
        weeklyWins: 0,
        weeklyLosses: 0,
        weeklyMargin: 0,
        claimedThresholds: [],
        dailySkips: 0,
        lastPlayedDay: "",
        opponent: {
            carID: "",
            upgrade: "000"
        },
        trackID: "",
        reqs: {},
        activeDriver: "d00000",
        ownedDrivers: ["d00000"],
        driverXP: {},
        usedCars: [],
        packShards: 0,
        recentLosses: [],
        activeEvent: null,
        bestWeek: 0,
        legacyHighestStreak
    };
}

const DEFAULT_RACE_WEEK_STATE = {
    weekKey: "",
    lastRollover: "",
    prizes: {}
};

async function main() {
    console.log("=".repeat(60));
    console.log("RACE WEEK MIGRATION");
    console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}`);
    console.log("=".repeat(60));
    console.log();

    if (!process.env.MONGO_PW) {
        console.error("MONGO_PW is not set — run from the repo root so dotenv can find .env:");
        console.error("  node scripts/migrateRaceWeek.js [--dry-run]");
        process.exit(1);
    }

    // Mongoose strict-mode update casting silently STRIPS $set paths the schema
    // doesn't declare — running this before the raceWeekStats/raceWeekState
    // schema fields are deployed would report success while writing nothing.
    const schemaReady = Boolean(profileModel.schema.path("raceWeekStats"))
        && Boolean(serverStatModel.schema.path("raceWeekState"));
    if (!schemaReady) {
        const msg = "profileSchema.raceWeekStats and/or serverStatSchema.raceWeekState are not declared yet — deploy the Race Week schema changes first.";
        if (DRY_RUN) {
            console.warn(`WARNING: ${msg} (continuing — dry-run counts are still valid)`);
            console.log();
        }
        else {
            console.error(`ABORTING: ${msg}`);
            process.exit(1);
        }
    }

    let weConnected = false;
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGO_PW);
        weConnected = true;
        console.log("database connect successful!");
        console.log();
    }

    let backfilled = 0, serverStatStatus = "already initialized";
    try {
        // ── Profiles ──
        const totalProfiles = await profileModel.countDocuments({});
        const missing = await profileModel.find(
            { raceWeekStats: { "$exists": false } },
            { userID: 1, "rrStats.highestStreak": 1 }
        ).lean();
        const alreadyMigrated = totalProfiles - missing.length;
        const withLegacyStreak = missing.filter(p => (p.rrStats?.highestStreak || 0) > 0).length;

        console.log(`Profiles total:            ${totalProfiles}`);
        console.log(`Already have raceWeekStats: ${alreadyMigrated} (skipped)`);
        console.log(`Missing raceWeekStats:      ${missing.length} (${withLegacyStreak} carry a nonzero legacy streak)`);
        console.log();

        if (!DRY_RUN && missing.length > 0) {
            const chunkCount = Math.ceil(missing.length / CHUNK_SIZE);
            for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
                const chunk = missing.slice(i, i + CHUNK_SIZE);
                const ops = chunk.map(p => ({
                    updateOne: {
                        // Re-check $exists in the filter: if the live bot lazy-inits
                        // this profile between our read and this write, we skip it.
                        filter: { userID: p.userID, raceWeekStats: { "$exists": false } },
                        update: { "$set": { raceWeekStats: buildRaceWeekStats(p.rrStats?.highestStreak || 0) } }
                    }
                }));
                const result = await profileModel.bulkWrite(ops, { ordered: false });
                backfilled += result.modifiedCount;
                console.log(`  chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${chunkCount}: ${result.modifiedCount}/${chunk.length} profiles backfilled`);
            }
            console.log();
        }

        // ── serverStat singleton ──
        const serverStat = await serverStatModel.findOne({}).lean();
        if (!serverStat) {
            serverStatStatus = "NO serverStat document found — skipped (the bot owns its creation)";
        }
        else if (serverStat.raceWeekState === undefined) {
            if (DRY_RUN) {
                serverStatStatus = "missing — would initialize";
            }
            else {
                await serverStatModel.updateOne(
                    { raceWeekState: { "$exists": false } },
                    { "$set": { raceWeekState: DEFAULT_RACE_WEEK_STATE } }
                );
                serverStatStatus = "initialized";
            }
        }

        // ── Summary ──
        console.log("=".repeat(60));
        console.log("SUMMARY");
        console.log("=".repeat(60));
        if (DRY_RUN) {
            console.log(`Would backfill:  ${missing.length} profiles`);
        }
        else {
            console.log(`Backfilled:      ${backfilled} profiles`);
            if (backfilled < missing.length) {
                console.log(`  (${missing.length - backfilled} skipped mid-run — lazy-initialized by the live bot, nothing lost)`);
            }
        }
        console.log(`Skipped:         ${alreadyMigrated} profiles (already migrated)`);
        console.log(`raceWeekState:   ${serverStatStatus}`);
        if (DRY_RUN) {
            console.log();
            console.log("DRY RUN — nothing was written.");
        }
    }
    finally {
        if (weConnected) {
            await mongoose.disconnect();
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
