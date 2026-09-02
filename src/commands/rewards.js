"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCar, getPack, getDriver, getVoucher } = require("../util/functions/dataManager.js");
const { DUPE_DRIVER_MONEY } = require("../util/consts/raceWeek.js");
// Shared rarity v3 curve/display helpers — single source of truth.
const { RARITY_CURVES, rarityOf, isAllActiveRarity, maxLevelFor, levelFromDupes, driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const { claimDriverSerial } = require("../util/functions/raceWeekManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const rwEmoji = require("../util/functions/rwEmoji.js");
const addCars = require("../util/functions/addCars.js");
const openPack = require("../util/functions/openPack.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");

module.exports = {
    name: "rewards",
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "Collects your rewards from random races, events and challenges.",
    async execute(message) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
        const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);

        const playerData = await getProfile(message.author.id);

        // Initialize discoveredCars
        let discoveredCars = playerData.discoveredCars || [];
        if (discoveredCars.length === 0 && playerData.garage.length > 0) {
            discoveredCars = playerData.garage.map(c => c.carID);
        }

        // Voucher wallet (docs/voucher-system.md) — array-guarded for legacy profiles
        let walletVouchers = Array.isArray(playerData.vouchers) ? playerData.vouchers : [];

        if (playerData.unclaimedRewards.length > 0) {
            // Bookkeeping model: rewards are removed via $pullAll of the exact
            // entries we processed — never a wholesale array rewrite — so grants
            // $push-ed DURING the interactive claim window are untouched, and a
            // failed/deferred entry is "requeued" simply by NOT being pulled.
            // Concurrent double-claims are prevented by the per-user command
            // lock (bot.execList).
            const batch = playerData.unclaimedRewards;
            // Crash insurance: log the batch so support can re-grant if the
            // process dies mid-claim.
            console.log(`[rewards] claiming batch for ${message.author.id}: ${JSON.stringify(batch)}`);

            let rewardLog = "", line = "", limitExceeded = false;
            const newDriverIDs = [], driverXPWrites = {};
            // Entries successfully granted in-memory this run. Packs are NOT in
            // here: they persist (cars + entry removal) incrementally the moment
            // they open, so a later mid-batch throw can never strand a reveal.
            // Numeric entries (money/fuse/trophies) are consumed by atomic
            // DECREMENT of exactly what was granted — a concurrent $inc landing
            // mid-claim survives as a positive, still-claimable remainder.
            // Non-numeric entries pull by rid when stamped (exact per-entry
            // removal), exact-match $pullAll only for legacy rid-less entries.
            const consumedNumeric = [], consumedOther = [];
            for (let reward of batch) {
                let { origin } = reward;
                line = "";
                // Whether this entry should be pulled in the FINAL write.
                // false = either already persisted+pulled incrementally (packs)
                // or left in place to be retried on the next claim.
                let consume = true;
                try {
                switch (Object.keys(reward)[0]) {
                    case "money":
                        playerData.money += reward.money;
                        line = `Received **${moneyEmoji}${reward.money.toLocaleString("en")}** from **${origin}**\n`;
                        break;
                    case "fuseTokens":
                        playerData.fuseTokens += reward.fuseTokens;
                        line = `Received **${fuseEmoji}${reward.fuseTokens.toLocaleString("en")}** from **${origin}**\n`;
                        break;
                    case "trophies":
                        playerData.trophies += reward.trophies;
                        line = `Received **${trophyEmoji}${reward.trophies.toLocaleString("en")}** from **${origin}**\n`;
                        break;
                    case "car":
                        let currentCar = getCar(reward.car && reward.car.carID);
                        if (!currentCar) {
                            // Car file removed/renamed after the grant — keep the
                            // entry claimable and, crucially, do NOT touch the
                            // garage (a phantom carID would corrupt it).
                            console.log(`rewards: unknown carID "${reward.car && reward.car.carID}" from ${origin}, keeping unclaimed`);
                            consume = false;
                            break;
                        }
                        playerData.garage = addCars(playerData.garage, [reward.car]);
                        // Track discovery
                        if (!discoveredCars.includes(reward.car.carID)) {
                            discoveredCars.push(reward.car.carID);
                        }
                        line = `Received **1x ${carNameGen({ currentCar, rarity: true, upgrade: reward.car.upgrade })}** from **${origin}**\n`;
                        break;
                    case "pack":
                        let currentPack = getPack(reward.pack);
                        if (!currentPack) {
                            // Pack file removed/renamed after the grant — keep it
                            // claimable instead of crashing the whole batch.
                            console.log(`rewards: unknown pack ID "${reward.pack}" from ${origin}, keeping unclaimed`);
                            consume = false;
                            break;
                        }
                        let addedCars = await openPack({ message, currentPack, discoveredCars });
                        if (!Array.isArray(addedCars)) {
                            // Pack couldn't be opened — keep it unclaimed and move on so
                            // the rest of the batch is still granted and persisted.
                            consume = false;
                            break;
                        }

                        playerData.garage = addCars(playerData.garage, addedCars);
                        // INCREMENTAL PERSIST (pack-loss fix): the reveal just
                        // happened on screen, so this pack's cars + its consumed
                        // entry removal are written NOW in one atomic updateOne.
                        // A throw later in the batch can no longer void it.
                        // ($set garage is safe here — the per-user command lock
                        // holds, and pulling the exact entry leaves concurrent
                        // $push grants alone.)
                        await profileModel.updateOne(
                            { userID: message.author.id },
                            reward.rid
                                ? { "$set": { garage: playerData.garage, discoveredCars }, "$pull": { unclaimedRewards: { rid: reward.rid } } }
                                : { "$set": { garage: playerData.garage, discoveredCars }, "$pullAll": { unclaimedRewards: [reward] } }
                        );
                        consume = false; // already pulled above
                        line = `Received **1x ${currentPack["packName"]}** from **${origin}**\n`;
                        break;
                    case "voucher": {
                        const grant = reward.voucher || {};
                        const voucherDef = getVoucher(grant.voucherID);
                        if (!voucherDef) {
                            // Voucher file removed/renamed after the grant — keep
                            // the entry claimable rather than voiding it.
                            console.log(`rewards: unknown voucher ID "${grant.voucherID}" from ${origin}, keeping unclaimed`);
                            consume = false;
                            break;
                        }
                        const grantAmount = Number.isInteger(grant.amount) && grant.amount > 0 ? grant.amount : 1;
                        const walletEntry = walletVouchers.find(entry => entry && entry.voucherID === grant.voucherID);
                        if (walletEntry) {
                            walletEntry.amount = (walletEntry.amount || 0) + grantAmount;
                        }
                        else {
                            walletVouchers.push({ voucherID: grant.voucherID, amount: grantAmount });
                        }
                        line = `Received **${grantAmount}× ${voucherDef.name}** 🎟️ from **${origin}** *(redeem via \`cd-voucher\`)*\n`;
                        break;
                    }
                    case "driver": {
                        let driverDef = getDriver(reward.driver);
                        if (!driverDef) {
                            // Unknown driver ID (roster file missing?) — keep it unclaimed
                            // so restoring the file lets the player claim it later.
                            console.log(`rewards: unknown driver ID "${reward.driver}" from ${origin}, keeping unclaimed`);
                            consume = false;
                            break;
                        }

                        // Lazy-init: old profiles may lack raceWeekStats (or parts of it).
                        if (!playerData.raceWeekStats || typeof playerData.raceWeekStats !== "object") {
                            playerData.raceWeekStats = {};
                        }
                        if (!Array.isArray(playerData.raceWeekStats.ownedDrivers)) {
                            playerData.raceWeekStats.ownedDrivers = ["d00000"];
                        }
                        if (!playerData.raceWeekStats.driverXP || typeof playerData.raceWeekStats.driverXP !== "object") {
                            playerData.raceWeekStats.driverXP = {};
                        }

                        let driverName = driverDisplayName(driverDef);
                        let rarity = rarityOf(driverDef);
                        if (!playerData.raceWeekStats.ownedDrivers.includes(reward.driver)) {
                            // RECRUIT — rarity v3: cards join at Level 0.
                            if (rarity === "serialised") {
                                // Mint BEFORE granting: the global ledger is the
                                // authority on whether a copy still exists.
                                let serial = await claimDriverSerial(reward.driver, driverDef.serialCap);
                                if (serial === null) {
                                    // Mint exhausted — the card can never drop again.
                                    playerData.money += DUPE_DRIVER_MONEY;
                                    line = `Received **${moneyEmoji}${DUPE_DRIVER_MONEY.toLocaleString("en")}** from **${origin}** — every serial of **${driverName}** has already been claimed!\n`;
                                }
                                else {
                                    playerData.raceWeekStats.ownedDrivers.push(reward.driver);
                                    let serialEntry = { dupes: 0, level: 0, serial };
                                    playerData.raceWeekStats.driverXP[reward.driver] = serialEntry;
                                    // INCREMENTAL PERSIST: the serial is already
                                    // minted on the global ledger (irreversible),
                                    // so the grant + entry removal land NOW — a
                                    // later mid-batch throw can't leak the serial.
                                    await profileModel.updateOne(
                                        { userID: message.author.id },
                                        {
                                            "$addToSet": { "raceWeekStats.ownedDrivers": { "$each": ["d00000", reward.driver] } },
                                            "$set": { [`raceWeekStats.driverXP.${reward.driver}`]: serialEntry },
                                            "$pullAll": { unclaimedRewards: [reward] }
                                        }
                                    );
                                    consume = false; // already pulled above
                                    line = `🎉 Recruited driver **${driverName}** from **${origin}** — **Serial #${serial} of ${driverDef.serialCap}**! All bonuses active!\n`;
                                }
                            }
                            else {
                                playerData.raceWeekStats.ownedDrivers.push(reward.driver);
                                newDriverIDs.push(reward.driver);
                                if (isAllActiveRarity(rarity)) {
                                    // Icon/autograph: ownership unlocks every bonus entry.
                                    line = `🎉 Recruited driver **${driverName}** from **${origin}** — all bonuses active!\n`;
                                }
                                else {
                                    line = `Recruited driver **${driverName}** from **${origin}**\n`;
                                }
                            }
                        }
                        else if (isAllActiveRarity(rarity)) {
                            // Icon/autograph/serialised: ANY dupe converts to money
                            // (levels don't exist on these tiers).
                            playerData.money += DUPE_DRIVER_MONEY;
                            line = `Received **${moneyEmoji}${DUPE_DRIVER_MONEY.toLocaleString("en")}** (duplicate **${driverName}**) from **${origin}**\n`;
                        }
                        else {
                            // Dupe → driver XP on the rarity's own curve. Level 0 = owned;
                            // a missing driverXP entry means 0 dupes.
                            let curve = RARITY_CURVES[rarity];
                            let maxLevel = maxLevelFor(rarity);
                            let maxDupes = curve[curve.length - 1];
                            let driverEntry = playerData.raceWeekStats.driverXP[reward.driver] || { dupes: 0, level: 0 };
                            let oldLevel = levelFromDupes(driverEntry.dupes, rarity);
                            if (oldLevel >= maxLevel) {
                                // Dupes past max level convert to money.
                                playerData.money += DUPE_DRIVER_MONEY;
                                line = `Received **${moneyEmoji}${DUPE_DRIVER_MONEY.toLocaleString("en")}** (duplicate **${driverName}**, already Level ${maxLevel}) from **${origin}**\n`;
                            }
                            else {
                                driverEntry.dupes += 1;
                                let newLevel = levelFromDupes(driverEntry.dupes, rarity);
                                driverEntry.level = newLevel;
                                playerData.raceWeekStats.driverXP[reward.driver] = driverEntry;
                                driverXPWrites[reward.driver] = driverEntry;
                                line = `**${driverName}** gained a duplicate from **${origin}** (${driverEntry.dupes}/${maxDupes} dupes)\n`;
                                if (newLevel > oldLevel) {
                                    line += `${rwEmoji("levelUp")} **${driverName}** reached Level ${newLevel}!\n`;
                                    // Announce bonus entries this level-up just unlocked
                                    // (no minLevel = active from Level 0 / ownership).
                                    let unlockedBonuses = (driverDef.bonuses || []).filter(b => (b.minLevel || 0) > oldLevel && (b.minLevel || 0) <= newLevel);
                                    for (let unlockedBonus of unlockedBonuses) {
                                        line += `${rwEmoji("levelUnlocked")} Unlocked bonus: ${unlockedBonus.description}\n`;
                                    }
                                }
                            }
                        }
                        break;
                    }
                    default:
                        break;
                }
                } catch (rewardError) {
                    // One bad reward must never strand the rest of the batch —
                    // leave it unconsumed (auto-requeued) and keep going.
                    console.error(`[rewards] reward failed for ${message.author.id}, requeued:`, rewardError.message, JSON.stringify(reward));
                    line = "";
                    consume = false;
                }
                if (consume) {
                    const rewardKey = Object.keys(reward)[0];
                    if (rewardKey === "money" || rewardKey === "fuseTokens" || rewardKey === "trophies") {
                        consumedNumeric.push({ key: rewardKey, amount: reward[rewardKey], origin: reward.origin });
                    }
                    else {
                        consumedOther.push(reward);
                    }
                }

                if (rewardLog.length + line.length < 4096) { // discord embed desc limit
                    rewardLog += line;
                }
                else if (!limitExceeded) {
                    limitExceeded = true;
                    rewardLog += "...etc";
                }
            }

            const profileUpdate = {
                money: playerData.money,
                fuseTokens: playerData.fuseTokens,
                trophies: playerData.trophies,
                garage: playerData.garage,
                discoveredCars,
                vouchers: walletVouchers
            };
            const update = { "$set": profileUpdate };
            // Driver grants use atomic dotted-path ops — never a full raceWeekStats
            // overwrite, which would clobber a concurrent Monday rollover reset or
            // an in-flight cd-rr write with this claim's stale pre-read copy.
            if (newDriverIDs.length > 0) {
                update["$addToSet"] = { "raceWeekStats.ownedDrivers": { "$each": ["d00000", ...newDriverIDs] } };
            }
            for (const [driverID, xpEntry] of Object.entries(driverXPWrites)) {
                profileUpdate[`raceWeekStats.driverXP.${driverID}`] = xpEntry;
            }
            // Legacy rid-less entries are the only exact-match pulls left.
            const ridsToPull = consumedOther.filter(entry => entry.rid).map(entry => entry.rid);
            const legacyPull = consumedOther.filter(entry => !entry.rid);
            if (legacyPull.length > 0) {
                update["$pullAll"] = { unclaimedRewards: legacyPull };
            }
            await profileModel.updateOne({ userID: message.author.id }, update);
            if (ridsToPull.length > 0) {
                await profileModel.updateOne(
                    { userID: message.author.id },
                    { "$pull": { unclaimedRewards: { rid: { "$in": ridsToPull } } } }
                );
            }
            // Numeric consumption: decrement exactly what was granted, then
            // sweep spent (<= 0) husks per key. A concurrent grant that $inc-ed
            // the same entry mid-claim stays positive and claimable.
            for (const num of consumedNumeric) {
                await profileModel.updateOne(
                    { userID: message.author.id, unclaimedRewards: { "$elemMatch": { origin: num.origin, [num.key]: { "$exists": true } } } },
                    { "$inc": { [`unclaimedRewards.$.${num.key}`]: -num.amount } }
                );
            }
            for (const huskKey of [...new Set(consumedNumeric.map(num => num.key))]) {
                await profileModel.updateOne(
                    { userID: message.author.id },
                    { "$pull": { unclaimedRewards: { [huskKey]: { "$lte": 0 } } } }
                );
            }

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: "Successfully claimed your rewards!",
                desc: rewardLog,
                author: message.author
            });
            return successMessage.sendMessage();
        }
        else {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "It looks like you don't have any unclaimed rewards.",
                desc: "Please come back here when you have pending rewards!",
                author: message.author
            });
            return infoMessage.sendMessage();
        }
    }
};
