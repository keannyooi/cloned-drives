"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
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
const { getProfile, writeWithHeavy } = require("../util/functions/profileCache.js");
const {
    garageMergeStage, discoveredStage, pullRewardsStage, addToSetStage, consumeNumericStages, PIPELINE_OPTIONS
} = require("../util/functions/rewardPipelines.js");

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
        // Currencies persist as deltas from these, never as the stale pre-read copy.
        const startCurrencies = { money: playerData.money, fuseTokens: playerData.fuseTokens, trophies: playerData.trophies };

        // Initialize discoveredCars (persisted wholesale by the first write below)
        let discoveredCars = playerData.discoveredCars || [];
        let discoveredNeedsSave = false;
        if (discoveredCars.length === 0 && playerData.garage.length > 0) {
            discoveredCars = playerData.garage.map(c => c.carID);
            discoveredNeedsSave = true;
        }
        // Garage writes are targeted (rewardPipelines.js: only the new cars go
        // over the wire, merged server side so a carID can never gain a second
        // row). They assume one row per carID — if a legacy duplicate turns up,
        // the claim heals it first (below), before any reveal, so no wholesale
        // garage write is ever built from a copy that is minutes old.
        const garageIsClean = new Set(playerData.garage.map(c => c && c.carID)).size === playerData.garage.length;
        let vouchersChanged = false;
        // The cacheStamp our copy matches; each write passes it on so the cache
        // refuses a voucher if anything else wrote this profile mid-claim.
        let cacheStamp = playerData.cacheStamp ?? null;

        // Voucher wallet (docs/voucher-system.md) — array-guarded for legacy profiles
        let walletVouchers = Array.isArray(playerData.vouchers) ? playerData.vouchers : [];

        if (playerData.unclaimedRewards.length > 0) {
            // Bookkeeping model: rewards are removed via $pullAll of the exact
            // entries we processed — never a wholesale array rewrite — so grants
            // $push-ed DURING the interactive claim window are untouched, and a
            // failed/deferred entry is "requeued" simply by NOT being pulled.
            // Concurrent double-claims are prevented by the per-user command
            // lock (bot.execList); as a second line of defence, each stamped
            // pack's write only lands while its rid is still unclaimed.
            const batch = playerData.unclaimedRewards;
            if (!garageIsClean) {
                // Duplicate rows: write the healed garage (addCars merges
                // duplicates even with nothing to add) back whole NOW, guarded
                // by the stamp like saveGarage's wholesale path — refused if
                // anything wrote since our read. From here on every garage
                // write is a server-side merge, so a second claim racing this
                // one can never overwrite the other's pack cars.
                const healedGarage = addCars(structuredClone(playerData.garage), []);
                const healFilter = cacheStamp !== null
                    ? { userID: message.author.id, cacheStamp }
                    : { userID: message.author.id };
                const heal = await writeWithHeavy(message.author.id, { garage: healedGarage }, () =>
                    profileModel.updateOne(healFilter, { "$set": { garage: healedGarage } }), cacheStamp);
                if (heal.result.matchedCount === 0) {
                    // Nothing claimed yet, so stopping here is free.
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, your profile changed while your rewards were being claimed.",
                        desc: "Nothing was claimed. Please run the command again.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }
                playerData.garage = healedGarage;
                cacheStamp = heal.stamp;
            }
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
            // Cars from "car" entries — merged into the garage by the final write.
            const grantedCars = [];
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
                        // Merged (and discovered) by the final write, not here:
                        // until then the in-memory garage must equal the stored
                        // one, because each pack write reports it to the cache.
                        grantedCars.push(reward.car);
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
                        // openPack marks new discoveries in discoveredCars as it
                        // reveals; snapshot it so a failed write can undo that.
                        const discoveredBefore = discoveredCars.slice();
                        let addedCars;
                        try {
                            addedCars = await openPack({ message, currentPack, discoveredCars });
                        }
                        catch (packError) {
                            discoveredCars = discoveredBefore;
                            throw packError;
                        }
                        if (!Array.isArray(addedCars)) {
                            // Pack couldn't be opened — keep it unclaimed and move on so
                            // the rest of the batch is still granted and persisted.
                            discoveredCars = discoveredBefore;
                            consume = false;
                            break;
                        }

                        // Merged into a COPY, adopted only once the write lands: a
                        // failed write must leave the in-memory garage equal to
                        // the stored one, or a later write would vouch phantom
                        // cars into the cache.
                        const nextGarage = addCars(structuredClone(playerData.garage), addedCars);
                        // INCREMENTAL PERSIST (pack-loss fix): the reveal just
                        // happened on screen, so this pack's cars + its consumed
                        // entry removal are written NOW in one atomic updateOne.
                        // A throw later in the batch can no longer void it.
                        // Targeted: only this pack's cars travel, merged server
                        // side (rewardPipelines.js); the cache is told the result.
                        // Never a wholesale garage $set: a run racing this one
                        // would overwrite the other's pack cars with its own
                        // stale copy. Rid-less legacy entries are pulled by
                        // exact match (as $pullAll did).
                        // A stamped entry is matched by its rid too: if it is
                        // no longer in unclaimedRewards (claimed by another run
                        // meanwhile) nothing is written, so a pack can never
                        // land twice.
                        const packFilter = reward.rid
                            ? { userID: message.author.id, "unclaimedRewards.rid": reward.rid }
                            : { userID: message.author.id };
                        let packWrite;
                        try {
                            const stages = [
                                garageMergeStage(addedCars),
                                discoveredStage(addedCars.map(car => car.carID), discoveredNeedsSave ? discoveredCars : null),
                                reward.rid ? pullRewardsStage([reward.rid]) : pullRewardsStage([], [reward])
                            ].filter(Boolean);
                            packWrite = await writeWithHeavy(message.author.id, { garage: nextGarage, discoveredCars }, () =>
                                profileModel.updateOne(packFilter, stages, PIPELINE_OPTIONS), cacheStamp);
                        }
                        catch (writeError) {
                            discoveredCars = discoveredBefore;
                            throw writeError;
                        }
                        if (packWrite.result && packWrite.result.matchedCount === 0) {
                            // Already claimed elsewhere: no cars were added, and
                            // nothing was written, so the stamp chain is unchanged.
                            console.log(`[rewards] pack ${reward.rid} for ${message.author.id} was already claimed, no cars added`);
                            discoveredCars = discoveredBefore;
                            consume = false;
                            line = `**${currentPack["packName"]}** from **${origin}** was already claimed — no cars added\n`;
                            break;
                        }
                        cacheStamp = packWrite.stamp;
                        playerData.garage = nextGarage;
                        discoveredNeedsSave = false;
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
                        vouchersChanged = true;
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
                                    ({ stamp: cacheStamp } = await writeWithHeavy(message.author.id, {}, () => profileModel.updateOne(
                                        { userID: message.author.id },
                                        {
                                            "$addToSet": { "raceWeekStats.ownedDrivers": { "$each": ["d00000", reward.driver] } },
                                            "$set": { [`raceWeekStats.driverXP.${reward.driver}`]: serialEntry },
                                            "$pullAll": { unclaimedRewards: [reward] }
                                        }
                                    ), cacheStamp));
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
                        // Tripwire: every writer should stamp a rid (rewardID.js);
                        // a rid-less entry falls back to the exact-match path.
                        if (!reward.rid) console.log(`[rewards] rid-less ${rewardKey} entry from ${origin}: its writer skips rewardID.js`);
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

            // ONE atomic pipeline write for everything not persisted above:
            // currencies, vouchers, drivers, "car" entries, entry removal and
            // numeric consumption. (These used to be up to 3 + N separate
            // writes, with a crash window between granting and consuming.)
            const stages = [];

            // Currencies as deltas, so a concurrent background $inc survives.
            const currencySet = {};
            for (const field of Object.keys(startCurrencies)) {
                const delta = playerData[field] - startCurrencies[field];
                if (delta !== 0) currencySet[field] = { "$add": [{ "$ifNull": [`$${field}`, 0] }, delta] };
            }
            if (Object.keys(currencySet).length > 0) stages.push({ "$set": currencySet });
            if (vouchersChanged) stages.push({ "$set": { vouchers: { "$literal": walletVouchers } } });

            // Driver grants use atomic dotted-path writes — never a full raceWeekStats
            // overwrite, which would clobber a concurrent Monday rollover reset or
            // an in-flight cd-rr write with this claim's stale pre-read copy.
            if (newDriverIDs.length > 0) stages.push(addToSetStage("raceWeekStats.ownedDrivers", ["d00000", ...newDriverIDs]));
            const driverXPSet = {};
            for (const [driverID, xpEntry] of Object.entries(driverXPWrites)) {
                driverXPSet[`raceWeekStats.driverXP.${driverID}`] = { "$literal": xpEntry };
            }
            if (Object.keys(driverXPSet).length > 0) stages.push({ "$set": driverXPSet });

            // "car" entries: merged now (see the car case).
            const heavyWritten = {};
            if (grantedCars.length > 0) {
                playerData.garage = addCars(playerData.garage, grantedCars);
                for (const car of grantedCars) {
                    if (!discoveredCars.includes(car.carID)) discoveredCars.push(car.carID);
                }
            }
            // (A duplicate-row garage was healed before the batch, so this is
            // always a targeted merge.)
            if (grantedCars.length > 0 || discoveredNeedsSave) {
                const merge = garageMergeStage(grantedCars);
                if (merge) stages.push(merge);
                const discovered = discoveredStage(grantedCars.map(car => car.carID), discoveredNeedsSave ? discoveredCars : null);
                if (discovered) stages.push(discovered);
                Object.assign(heavyWritten, { garage: playerData.garage, discoveredCars });
            }

            // Entry removal: by rid, or exact match for legacy rid-less entries.
            const pull = pullRewardsStage(
                consumedOther.filter(entry => entry.rid).map(entry => entry.rid),
                consumedOther.filter(entry => !entry.rid)
            );
            if (pull) stages.push(pull);
            // Numeric consumption (value-aware): decrement exactly what was
            // granted from an entry that holds it, then sweep spent husks. A
            // concurrent merge-style grant stays claimable.
            stages.push(...consumeNumericStages(consumedNumeric));

            if (stages.length > 0) {
                await writeWithHeavy(message.author.id, heavyWritten, () =>
                    profileModel.updateOne({ userID: message.author.id }, stages, PIPELINE_OPTIONS), cacheStamp);
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
