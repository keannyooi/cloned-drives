"use strict";

const bot = require("../config/config.js");
const { getPackFiles, getPack } = require("../util/functions/dataManager.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const addCars = require("../util/functions/addCars.js");
const search = require("../util/functions/search.js");
const openPack = require("../util/functions/openPack.js");
const { trackMoneySpent, trackTrophiesEarned, trackPackOpened } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "openpack",
    aliases: ["buypack", "op"],
    usage: ["<pack name>", "-<pack id>"],
    args: 1,
    category: "Gameplay",
    cooldown: 5,
    description: "Opens a pack.",
    async execute(message, args) {
        // Hoisted so the catch block can log the exact roll for support re-grants.
        let addedCars = null;
        let packId = null;
        // Set once the garage write is VERIFIED — flips the failure message from
        // "nothing happened" to "your cards are safe, only the confirmation failed".
        let persisted = false;
        try {
            const packFiles = getPackFiles();
            const query = args.map(i => i.toLowerCase());

            // Only show packs with category "normal" (or price for backward compat) that have a price
            const packs = packFiles.filter(packFile => {
                const packId = packFile.endsWith('.json') ? packFile.slice(0, -5) : packFile;
                const contents = getPack(packId);
                if (!contents || !contents.price) return false;
                return getPackCategories(contents).includes("normal");
            });

            const response = await search(message, query, packs, "pack");
            if (!Array.isArray(response)) return;
            let [result, currentMessage] = response;
            packId = result.endsWith('.json') ? result.slice(0, -5) : result;

            const playerData = await profileModel.findOne({ userID: message.author.id });
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const currentPack = getPack(packId);

            if (playerData.money < currentPack.price) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, it looks like you don't have enough money for this purchase.",
                    author: message.author,
                    fields: [
                        { name: "Required Amount of Money", value: `${moneyEmoji}${currentPack.price.toLocaleString("en")}`, inline: true },
                        { name: "Your Money Balance", value: `${moneyEmoji}${playerData.money.toLocaleString("en")}`, inline: true }
                    ]
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            // Initialize discoveredCars from garage if this is the first time
            let discoveredCars = playerData.discoveredCars || [];
            if (discoveredCars.length === 0 && playerData.garage.length > 0) {
                discoveredCars = playerData.garage.map(c => c.carID);
            }

            // Open the pack. allowDriverDrops opts THIS caller into the pack's
            // driverDrops config (drivers v2) — the returned array may then mix
            // { driverDrop: "<driverID>" } entries in with the car objects.
            addedCars = await openPack({
                message, currentPack, currentMessage, discoveredCars,
                allowDriverDrops: true,
                ownedDriverIDs: (playerData.raceWeekStats && Array.isArray(playerData.raceWeekStats.ownedDrivers))
                    ? playerData.raceWeekStats.ownedDrivers
                    : []
            });
            if (!Array.isArray(addedCars)) return;

            // Split the roll: cars go to the garage, drivers to the paddock.
            const pulledCars = addedCars.filter(entry => entry.carID);
            const driverPulls = addedCars.filter(entry => entry.driverDrop);

            // Calculate new balance
            let balance = playerData.money - currentPack.price;

            // Apply bonus rewards if the pack has them
            const successFields = [
                { name: "Your Money Balance", value: `${moneyEmoji}${balance.toLocaleString("en")}`, inline: true }
            ];
            let bonusTrophies = 0;

            if (currentPack.bonusRewards) {
                const bonusMoney = resolveBonusReward(currentPack.bonusRewards.money);
                if (bonusMoney > 0) {
                    balance += bonusMoney;
                    successFields.push({
                        name: "Bonus Money",
                        value: `${moneyEmoji}${bonusMoney.toLocaleString("en")}`,
                        inline: true
                    });
                    // Update balance field
                    successFields[0].value = `${moneyEmoji}${balance.toLocaleString("en")}`;
                }
                const bonusTrophyReward = resolveBonusReward(currentPack.bonusRewards.trophies);
                if (bonusTrophyReward > 0) {
                    const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);
                    bonusTrophies = bonusTrophyReward;
                    successFields.push({
                        name: "Bonus Trophies",
                        value: `${trophyEmoji}${bonusTrophies.toLocaleString("en")}`,
                        inline: true
                    });
                }
            }

            // Resolve driver drops (drivers v2) — same in-memory pattern as
            // cd-rewards: ownedDrivers additions + driverXP dotted-path writes
            // folded into the SAME atomic updateOne as the garage/money write.
            const driverGrants = await resolveDriverGrants(playerData, driverPulls, moneyEmoji);
            if (driverGrants.bonusMoney > 0) {
                balance += driverGrants.bonusMoney;
                successFields[0].value = `${moneyEmoji}${balance.toLocaleString("en")}`;
            }
            if (driverGrants.lines.length > 0) {
                successFields.push({
                    name: "Driver Cards",
                    value: driverGrants.lines.join("\n")
                });
            }

            // Single DB update: subtract price, add bonus rewards, add cars, save
            // discoveries, and grant any dropped drivers.
            const setObj = {
                money: balance,
                garage: addCars(playerData.garage, pulledCars),
                discoveredCars
            };
            if (bonusTrophies > 0) {
                setObj.trophies = playerData.trophies + bonusTrophies;
            }
            for (const [driverID, xpEntry] of Object.entries(driverGrants.xpWrites)) {
                setObj[`raceWeekStats.driverXP.${driverID}`] = xpEntry;
            }
            const updateObj = { "$set": setObj };
            if (driverGrants.newDriverIDs.length > 0) {
                updateObj["$addToSet"] = {
                    "raceWeekStats.ownedDrivers": { "$each": ["d00000", ...driverGrants.newDriverIDs] }
                };
            }

            // Verified write with ONE retry — covers both a thrown driver error
            // and a "matched nothing" result. A transient failure here used to be
            // swallowed silently AFTER the full reveal ("pack didn't transact").
            let writeError = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const writeResult = await profileModel.updateOne({ userID: message.author.id }, updateObj);
                    const matched = writeResult.matchedCount !== undefined ? writeResult.matchedCount : writeResult.n;
                    if (matched) {
                        writeError = null;
                        break;
                    }
                    writeError = new Error(`profile not matched on garage write (userID ${message.author.id})`);
                } catch (err) {
                    writeError = err;
                }
                if (attempt === 1) {
                    console.error(`[openpack] write attempt 1 failed for ${message.author.id} (${packId}), retrying once:`, writeError.message);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            if (writeError) {
                throw writeError; // outer catch sends the ErrorMessage + logs the grant trail
            }
            persisted = true;

            trackMoneySpent(currentPack.price);
            trackPackOpened(currentPack["packName"]);
            if (bonusTrophies > 0) trackTrophiesEarned(bonusTrophies);

            // Pack Battle tracking (non-fatal — never breaks normal pack opening)
            try {
                const { processPackOpening } = require("../util/functions/packBattleManager.js");
                await processPackOpening(message.author.id, packId, pulledCars);
            } catch (err) {
                console.error("[PackBattle] Tracking failed (non-fatal):", err.message);
            }

            // Sent immediately AFTER the verified write. The old 5s-delayed
            // floating message could arrive during the NEXT pack's reveal and
            // be misattributed to it.
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully bought a ${currentPack["packName"]}!`,
                author: message.author,
                fields: successFields
            });
            await successMessage.sendMessage();

        } catch (error) {
            // Loud failure: log the exact roll for support re-grants, and TELL
            // the player (the old silent catch is how packs "didn't transact").
            console.error(`[openpack] FAILED for user ${message.author.id}:`, error);
            if (Array.isArray(addedCars) && addedCars.length > 0) {
                // Structured re-grant trail — one greppable line with everything
                // support needs (includes { driverDrop } entries when present).
                console.log(`[openpack] GRANT-TRAIL ${JSON.stringify({
                    userID: message.author.id,
                    packID: packId,
                    persisted,
                    rolled: addedCars
                })}`);
            }
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Something went wrong finalizing this pack.",
                desc: persisted
                    ? "Your pulls **were saved** — only the confirmation message failed. Check your garage; everything from this pack is yours."
                    : "You have **not** been charged and nothing was added. Please try again — if this keeps happening, report it (the details have been logged).",
                author: message.author
            });
            await errorMessage.sendMessage().catch(() => {});
        }
    }
};

/**
 * Resolve driver drops from an opened pack into profile mutations, mirroring
 * the cd-rewards in-memory grant pattern (RARITY SYSTEM v3 / level-0 semantics):
 *   • new driver         → ownedDrivers add + driverXP { dupes: 0, level: 0 }
 *   • dupe (levelable)   → dupes+1, level = levelFromDupes(dupes, driver)
 *   • dupe past max / any icon-autograph dupe → DUPE_DRIVER_MONEY
 *   • serialised         → atomic claimDriverSerial FIRST; exhausted mint
 *                          (lost race since the roll) → DUPE_DRIVER_MONEY
 *
 * @returns {Promise<{bonusMoney: number, lines: string[], newDriverIDs: string[], xpWrites: Object}>}
 *   xpWrites maps driverID → driverXP entry for dotted-path $set;
 *   newDriverIDs feed the $addToSet on raceWeekStats.ownedDrivers.
 */
async function resolveDriverGrants(playerData, driverPulls, moneyEmoji) {
    const result = { bonusMoney: 0, lines: [], newDriverIDs: [], xpWrites: {} };
    if (!Array.isArray(driverPulls) || driverPulls.length === 0) return result;

    // Lazy requires — only openings that actually dropped a driver pay for these.
    const { getDriver } = require("../util/functions/dataManager.js");
    const { rarityOf, isAllActiveRarity, maxLevelFor, levelFromDupes, driverDisplayName } = require("../util/functions/raceWeekEvents.js");
    const { claimDriverSerial } = require("../util/functions/raceWeekManager.js");
    const { DUPE_DRIVER_MONEY } = require("../util/consts/raceWeek.js");

    const stats = playerData.raceWeekStats || {};
    const owned = new Set(Array.isArray(stats.ownedDrivers) ? stats.ownedDrivers : []);
    const xpMap = (stats.driverXP && typeof stats.driverXP === "object") ? stats.driverXP : {};
    const dupeMoneyText = `${moneyEmoji}${DUPE_DRIVER_MONEY.toLocaleString("en")}`;

    for (const pull of driverPulls) {
        const driverID = pull.driverDrop;
        const driver = getDriver(driverID);
        if (!driver) continue; // defensive: driver file unloaded since the roll

        const rarity = rarityOf(driver);
        const name = `🏁 **${driverDisplayName(driver)}** [${rarity}]`;

        if (rarity === "serialised" && owned.has(driverID)) {
            // Defensive: openPack's pool excludes owned serialised drivers, but
            // if one slips through, never mint again (it would burn a serial
            // AND overwrite the player's existing serial number) — dupe money.
            result.bonusMoney += DUPE_DRIVER_MONEY;
            result.lines.push(`${name} — duplicate, converted to ${dupeMoneyText}`);
        } else if (rarity === "serialised") {
            // openPack pre-filters owned + exhausted mints, but the mint is
            // GLOBAL — claim atomically now and downgrade to dupe money if we
            // lost the race between roll and grant.
            const serial = await claimDriverSerial(driverID, driver.serialCap);
            if (serial === null) {
                result.bonusMoney += DUPE_DRIVER_MONEY;
                result.lines.push(`${name} — mint sold out, converted to ${dupeMoneyText}`);
            } else {
                // Trail line: if the profile write later fails, support can see
                // this serial was claimed and re-grant it manually.
                console.log(`[openpack] SERIAL-CLAIM ${JSON.stringify({ userID: playerData.userID, driverID, serial })}`);
                owned.add(driverID);
                result.newDriverIDs.push(driverID);
                result.xpWrites[driverID] = { dupes: 0, level: 0, serial };
                result.lines.push(`${name} — **Serial #${serial} of ${driver.serialCap}**!`);
            }
        } else if (!owned.has(driverID)) {
            owned.add(driverID);
            result.newDriverIDs.push(driverID);
            result.xpWrites[driverID] = { dupes: 0, level: 0 };
            result.lines.push(`${name} — **NEW** driver recruited!`);
        } else if (isAllActiveRarity(rarity)) {
            // icon / autograph: any dupe → money
            result.bonusMoney += DUPE_DRIVER_MONEY;
            result.lines.push(`${name} — duplicate, converted to ${dupeMoneyText}`);
        } else {
            const entry = result.xpWrites[driverID] || xpMap[driverID] || { dupes: 0, level: 0 };
            const maxLevel = maxLevelFor(driver);
            if (levelFromDupes(entry.dupes, driver) >= maxLevel) {
                result.bonusMoney += DUPE_DRIVER_MONEY;
                result.lines.push(`${name} — duplicate (already Level ${maxLevel}), converted to ${dupeMoneyText}`);
            } else {
                const dupes = (entry.dupes || 0) + 1;
                const newLevel = levelFromDupes(dupes, driver);
                result.xpWrites[driverID] = { ...entry, dupes, level: newLevel };
                result.lines.push(newLevel > (entry.level || 0)
                    ? `${name} — dupe, now **Level ${newLevel}**!`
                    : `${name} — dupe (${dupes} total)`);
            }
        }
    }
    return result;
}

// === Backward-compatible category helper ===
function getPackCategories(pack) {
    if (pack.categories) return pack.categories;
    // Infer from legacy properties
    const cats = [];
    if (pack.price) cats.push("normal");
    cats.push("daily", "event", "limited", "reward", "calendar");
    return cats;
}

/**
 * Resolve a bonus reward value that may be flat or chance-based.
 *   • number             → always granted, returned as-is.
 *   • { chance, amount } → `amount` granted with `chance`% probability, else 0.
 *                          `chance` defaults to 100 (always) if omitted.
 * Returns the amount to grant for this opening (0 if the roll missed / no reward).
 */
function resolveBonusReward(val) {
    if (!val) return 0;
    if (typeof val === "number") return val;
    if (typeof val === "object" && typeof val.amount === "number") {
        const chance = (typeof val.chance === "number") ? val.chance : 100;
        return (Math.random() * 100 < chance) ? val.amount : 0;
    }
    return 0;
}
