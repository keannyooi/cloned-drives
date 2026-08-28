"use strict";

/**
 * REPAIR DUPLICATED GARAGE ENTRIES
 * ================================
 * A scan on 2026-08-28 found 7 profiles carrying two garage entries for the
 * same carID (16 duplicated IDs). Every known garage writer merges through
 * addCars(), which cannot create these — the origin is unidentified, and
 * addCars now carries a tripwire that logs + self-heals if it sees one again.
 *
 * This script fixes the existing damage: duplicate entries for a carID are
 * merged into one, upgrade counts SUMMED (nothing is ever discarded — a
 * player with 000×1 on one entry and 996×2 on the other ends with both).
 *
 * Usage:
 *   node scripts/repairDupedGarages.js            preview (default)
 *   node scripts/repairDupedGarages.js --apply    write the fix
 */

require("dotenv").config();
const { connect, connection, disconnect } = require("mongoose");
const profileModel = require("../src/models/profileSchema.js");

const APPLY = process.argv.includes("--apply");

(async () => {
    // MONGO_PW only — MONGO_URI points at the same cluster with no database in
    // its path and silently reads the empty default DB (see db-scripts memory).
    await connect(process.env.MONGO_PW);
    console.log(`connected to database: ${connection.name}`);

    const cursor = profileModel.find({}, { userID: 1, garage: 1 }).lean().batchSize(50).cursor();
    let scanned = 0, fixedProfiles = 0, mergedEntries = 0;
    const report = [];

    for await (const profile of cursor) {
        scanned++;
        const garage = Array.isArray(profile.garage) ? profile.garage : [];
        const counts = new Map();
        for (const car of garage) {
            if (car && car.carID) counts.set(car.carID, (counts.get(car.carID) || 0) + 1);
        }
        const duped = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
        if (duped.length === 0) continue;

        const lines = [];
        for (const id of duped) {
            const entries = garage.filter(car => car && car.carID === id);
            const primary = entries[0];
            const before = JSON.stringify(primary.upgrades);
            for (const extra of entries.slice(1)) {
                for (const [tune, count] of Object.entries(extra.upgrades || {})) {
                    if (typeof count === "number" && count > 0) {
                        primary.upgrades[tune] = (primary.upgrades[tune] || 0) + count;
                    }
                }
                garage.splice(garage.indexOf(extra), 1);
                mergedEntries++;
            }
            lines.push(`${id}: ${before} + dupes -> ${JSON.stringify(primary.upgrades)}`);
        }

        fixedProfiles++;
        report.push({ userID: profile.userID, lines });
        if (APPLY) {
            await profileModel.updateOne({ userID: profile.userID }, { "$set": { garage } });
        }
    }

    console.log(`profiles scanned: ${scanned}`);
    if (scanned === 0) { console.log("❌ ZERO profiles — connection problem, not a clean DB."); process.exit(1); }
    console.log(`profiles with duplicates: ${fixedProfiles}   entries merged: ${mergedEntries}\n`);
    for (const entry of report) {
        console.log(`  ${entry.userID}`);
        for (const line of entry.lines) console.log(`      ${line}`);
    }
    if (fixedProfiles === 0) console.log("✅ Nothing to repair.");
    else console.log(APPLY ? `\n🏁 Repaired ${fixedProfiles} profile(s).` : "\n🔍 Dry run — nothing written. Re-run with --apply.");
    await disconnect();
    process.exit(0);
})().catch(error => {
    console.error("❌ Failed:", error.stack || error.message);
    process.exit(1);
});
