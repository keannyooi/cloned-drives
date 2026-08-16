"use strict";

/**
 * REPAIR "undefined" TUNE SLOTS
 * =============================
 * Race Week rung prizes shipped without an `upgrade` field, so addCars() filed
 * those cars under the literal key "undefined" instead of "000". The player
 * owns the car, but in a tune slot that does not exist — it cannot be raced,
 * sold, upgraded or filtered, and cd-cinfo reports "You own 1x undefined".
 *
 * The bad value spreads to three places, so all three are repaired:
 *   1. garage[].upgrades.undefined   — folded into "000" (ADDED, never
 *                                      overwritten, so an existing stock copy
 *                                      is preserved), phantom key deleted
 *   2. hand.upgrade                  — cd-sh copies the tune off the garage
 *                                      entry, so setting a hand from a broken
 *                                      car persists "undefined" here too
 *   3. decks[].hand[].upgrade        — same, for every saved deck
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
const { connect, connection, disconnect } = require("mongoose");
const profileModel = require("../src/models/profileSchema.js");
const { carSave } = require("../src/util/consts/consts.js");

const APPLY = process.argv.includes("--apply");
const STOCK = "000";
const VALID = Object.keys(carSave);
const isValid = upgrade => VALID.includes(upgrade);

(async () => {
    // The bot connects with MONGO_PW, and that string carries the database name
    // in its path. MONGO_PW ONLY — an earlier version of this script preferred
    // MONGO_URI, which points at the same cluster with NO database in the path,
    // so it silently read the empty default DB and reported "nothing to repair"
    // while the corruption sat untouched in the real one.
    await connect(process.env.MONGO_PW);
    console.log(`connected to database: ${connection.name}`);

    // Streamed one document at a time. Loading the whole collection at once
    // exhausts the heap — garages run to thousands of cars per player.
    const cursor = profileModel
        .find({}, { userID: 1, garage: 1, hand: 1, decks: 1, unclaimedRewards: 1 })
        .lean()
        .batchSize(50)
        .cursor();

    const oddShapes = [];
    let scanned = 0, garageFixed = 0, handFixed = 0, deckFixed = 0, rewardFixed = 0, written = 0;
    // Only the human-readable summary is retained; garages are released as soon
    // as each profile is written, so memory stays flat over the whole run.
    const report = [];

    for await (const profile of cursor) {
        scanned++;
        const touched = [];
        const update = {};

        // Schema declares these as Array, but a few legacy documents store some
        // other shape. Iterating one blindly throws and kills the whole run, so
        // coerce and report instead.
        const asList = (value, label) => {
            if (Array.isArray(value)) return value;
            if (value === undefined || value === null) return [];
            oddShapes.push(`${profile.userID}: ${label} is ${typeof value}, not an array`);
            return [];
        };

        // 1. garage — fold every invalid tune key into stock
        const garage = asList(profile.garage, "garage");
        let garageDirty = false;
        for (const car of garage) {
            if (!car || !car.upgrades || typeof car.upgrades !== "object") continue;
            for (const key of Object.keys(car.upgrades)) {
                if (isValid(key)) continue;
                const count = car.upgrades[key];
                delete car.upgrades[key];
                if (count) {
                    car.upgrades[STOCK] = (car.upgrades[STOCK] || 0) + count;
                    touched.push(`garage ${car.carID} ×${count} [${key}]->${STOCK}`);
                    garageFixed++;
                }
                garageDirty = true;
            }
        }
        if (garageDirty) update.garage = garage;

        // 2. hand
        const hand = profile.hand;
        if (hand && hand.carID && !isValid(hand.upgrade)) {
            update.hand = { ...hand, upgrade: STOCK };
            touched.push(`hand ${hand.carID} [${hand.upgrade}]->${STOCK}`);
            handFixed++;
        }

        // 3. saved decks
        const decks = asList(profile.decks, "decks");
        let decksDirty = false;
        for (const deck of decks) {
            for (const card of (deck && deck.hand) || []) {
                if (!card || !card.carID || isValid(card.upgrade)) continue;
                touched.push(`deck "${deck.name}" ${card.carID} [${card.upgrade}]->${STOCK}`);
                card.upgrade = STOCK;
                decksDirty = true;
                deckFixed++;
            }
        }
        if (decksDirty) update.decks = decks;

        // 4. UNCLAIMED rewards — the prize is still queued, so the bad shape has
        //    not reached the garage yet. addCars now defaults it to stock, but
        //    only once the bot restarts; patching the queue makes the claim safe
        //    even against a process still running the old code.
        const queueFixes = [];
        for (const reward of asList(profile.unclaimedRewards, "unclaimedRewards")) {
            if (!reward || !reward.car || isValid(reward.car.upgrade)) continue;
            queueFixes.push(reward);
            touched.push(`reward ${reward.car.carID} [${reward.car.upgrade}]->${STOCK} (${reward.origin})`);
            rewardFixed++;
        }

        if (touched.length === 0) continue;

        report.push({ userID: profile.userID, touched });
        if (APPLY) {
            try {
                if (Object.keys(update).length > 0) {
                    await profileModel.updateOne({ userID: profile.userID }, { "$set": update });
                }
                // Queued rewards are patched field-by-field rather than by
                // rewriting the array: cd-rr and event payouts $push into this
                // same array continuously, and a whole-array $set would silently
                // drop anything that arrived since this document was read.
                for (const reward of queueFixes) {
                    if (reward.rid) {
                        await profileModel.updateOne(
                            { userID: profile.userID },
                            { "$set": { "unclaimedRewards.$[entry].car.upgrade": STOCK } },
                            { arrayFilters: [{ "entry.rid": reward.rid }] }
                        );
                    }
                    else {
                        // Pre-rid legacy entry: match on the element itself.
                        await profileModel.updateOne(
                            { userID: profile.userID, unclaimedRewards: { "$elemMatch": { "car.carID": reward.car.carID, origin: reward.origin } } },
                            { "$set": { "unclaimedRewards.$.car.upgrade": STOCK } }
                        );
                    }
                }
                written++;
            }
            catch (error) {
                console.log(`❌ ${profile.userID}: ${error.message}`);
            }
        }
    }

    // A wrong connection string reads as "0 profiles", which is indistinguishable
    // from a healthy database unless we say so out loud. Refuse to report a
    // clean bill of health on an empty collection.
    console.log(`profiles scanned: ${scanned}`);
    if (scanned === 0) {
        console.log("\n❌ ZERO profiles found — that is a connection problem, not a clean database.");
        console.log("   Check that MONGO_PW in .env includes the database name in its path.");
        await disconnect();
        process.exit(1);
    }

    console.log(`\nprofiles needing repair: ${report.length}`);
    console.log(`  garage entries: ${garageFixed}`);
    console.log(`  hands:          ${handFixed}`);
    console.log(`  deck slots:     ${deckFixed}`);
    console.log(`  queued rewards: ${rewardFixed}\n`);

    if (oddShapes.length > 0) {
        console.log(`⚠️  ${oddShapes.length} field(s) are not arrays despite the schema saying so:`);
        for (const line of oddShapes.slice(0, 10)) console.log(`      ${line}`);
        if (oddShapes.length > 10) console.log(`      … and ${oddShapes.length - 10} more`);
        console.log("    (skipped, not repaired — this script only fixes tune slots)\n");
    }

    if (report.length === 0) {
        console.log("✅ Nothing to repair (and the database really was read — see the count above).");
        await disconnect();
        process.exit(0);
    }

    for (const entry of report.slice(0, 25)) {
        console.log(`  ${entry.userID}`);
        for (const line of entry.touched) console.log(`      ${line}`);
    }
    if (report.length > 25) console.log(`  … and ${report.length - 25} more profile(s)`);

    if (!APPLY) {
        console.log("\n🔍 Dry run — nothing written. Re-run with --apply.");
        await disconnect();
        process.exit(0);
    }

    console.log(`\n🏁 Repaired ${written} profile(s).`);
    await disconnect();
    process.exit(0);
})().catch(error => {
    console.error("❌ Failed:", error.stack || error.message);
    process.exit(1);
});
