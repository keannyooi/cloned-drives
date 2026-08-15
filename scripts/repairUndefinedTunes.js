"use strict";

/**
 * REPAIR "undefined" TUNE SLOTS
 * =============================
 * Race Week rung prizes shipped without an `upgrade` field, so addCars() filed
 * those cars under the literal key "undefined" instead of "000". The player
 * owns the car, but in a tune slot that does not exist — it cannot be raced,
 * sold, upgraded or filtered.
 *
 * This folds any `upgrades.undefined` count into `upgrades["000"]` (stock) and
 * deletes the phantom key. Counts are ADDED, never overwritten, so a player who
 * already owned a stock copy keeps both.
 *
 * The source is fixed in two places, so this only ever needs running once:
 *   • raceWeekManager now emits { carID, upgrade: "000" }
 *   • addCars now defaults an unknown/missing upgrade to "000"
 *
 * Usage:
 *   node scripts/repairUndefinedTunes.js            preview (default)
 *   node scripts/repairUndefinedTunes.js --apply    write the fix
 */

require("dotenv").config();
const { connect, disconnect } = require("mongoose");
const profileModel = require("../src/models/profileSchema.js");

const APPLY = process.argv.includes("--apply");
const PHANTOM = "undefined";
const STOCK = "000";

(async () => {
    await connect(process.env.MONGO_URI || process.env.MONGO_PW);

    // Only profiles that actually have the phantom key — a targeted query, not
    // a full-collection scan.
    const affected = await profileModel.find(
        { "garage.upgrades.undefined": { "$exists": true } },
        { userID: 1, garage: 1 }
    ).lean();

    console.log(`profiles with a phantom tune slot: ${affected.length}`);
    if (affected.length === 0) {
        console.log("✅ Nothing to repair.");
        await disconnect();
        process.exit(0);
    }

    let carsFixed = 0;
    const plan = [];
    for (const profile of affected) {
        const garage = profile.garage || [];
        const touched = [];
        for (const car of garage) {
            const count = car.upgrades && car.upgrades[PHANTOM];
            if (!count) continue;
            car.upgrades[STOCK] = (car.upgrades[STOCK] || 0) + count;
            delete car.upgrades[PHANTOM];
            touched.push(`${car.carID} ×${count} -> ${STOCK}`);
            carsFixed++;
        }
        if (touched.length > 0) plan.push({ userID: profile.userID, garage, touched });
    }

    console.log(`cars to fix: ${carsFixed}\n`);
    for (const entry of plan.slice(0, 20)) {
        console.log(`  ${entry.userID}  ${entry.touched.join(", ")}`);
    }
    if (plan.length > 20) console.log(`  … and ${plan.length - 20} more profile(s)`);

    if (!APPLY) {
        console.log("\n🔍 Dry run — nothing written. Re-run with --apply.");
        await disconnect();
        process.exit(0);
    }

    let written = 0;
    for (const entry of plan) {
        try {
            await profileModel.updateOne({ userID: entry.userID }, { "$set": { garage: entry.garage } });
            written++;
        }
        catch (error) {
            console.log(`❌ ${entry.userID}: ${error.message}`);
        }
    }
    console.log(`\n🏁 Repaired ${written} profile(s), ${carsFixed} car entr(ies).`);
    await disconnect();
    process.exit(0);
})().catch(error => {
    console.error("❌ Failed:", error.message);
    process.exit(1);
});
