"use strict";

/**
 * GARAGE INTEGRITY SCAN — read-only, never writes.
 *
 * Finds the corrupt garage entries that make addCars throw after a pack
 * reveal (the "pack didn't transact" repeat-reporter case):
 *   - entries missing carID
 *   - entries with a missing / non-object `upgrades` field
 *   - entries whose carID has no car file (deleted/renamed cars)
 *
 * Usage (from repo root, .env is LIVE PROD — this script only reads):
 *   node scripts/scanGarageIntegrity.js
 */

require("dotenv").config();
const { connect, connection, disconnect } = require("mongoose");
const { initialize, carExists } = require("../src/util/functions/dataManager.js");
const profileModel = require("../src/models/profileSchema.js");

(async () => {
    console.log("=== Garage Integrity Scan (read-only) ===");
    initialize("./src");

    const weConnected = connection.readyState === 0;
    if (weConnected) {
        await connect(process.env.MONGO_PW);
    }

    const cursor = profileModel.find({}, { userID: 1, garage: 1 }).lean().cursor();
    let profiles = 0, flaggedProfiles = 0, badUpgrades = 0, badCarID = 0, unknownCar = 0;

    for await (const profile of cursor) {
        profiles++;
        const problems = [];
        const garage = Array.isArray(profile.garage) ? profile.garage : [];
        for (let i = 0; i < garage.length; i++) {
            const entry = garage[i];
            if (!entry || typeof entry !== "object" || !entry.carID) {
                badCarID++;
                problems.push(`[${i}] missing/invalid carID: ${JSON.stringify(entry)}`);
                continue;
            }
            if (!entry.upgrades || typeof entry.upgrades !== "object") {
                badUpgrades++;
                problems.push(`[${i}] ${entry.carID}: missing/invalid upgrades (${JSON.stringify(entry.upgrades)})`);
            }
            if (!carExists(entry.carID)) {
                unknownCar++;
                problems.push(`[${i}] ${entry.carID}: no such car file`);
            }
        }
        if (problems.length > 0) {
            flaggedProfiles++;
            console.log(`\nuser ${profile.userID} — ${problems.length} problem(s):`);
            for (const p of problems) console.log(`  ${p}`);
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`profiles scanned:        ${profiles}`);
    console.log(`profiles with problems:  ${flaggedProfiles}`);
    console.log(`missing/invalid upgrades: ${badUpgrades}  <- these players hit the addCars crash on dupes (now healed at runtime, but worth fixing in data)`);
    console.log(`missing/invalid carID:    ${badCarID}`);
    console.log(`unknown car files:        ${unknownCar}`);

    if (weConnected) await disconnect();
    process.exit(0);
})().catch(err => {
    console.error("Scan failed:", err);
    process.exit(1);
});
