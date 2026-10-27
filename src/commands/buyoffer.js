"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const { getCar, getPack, getDriver } = require("../util/functions/dataManager.js");
const { driverDisplayName, levelFromDupes, rarityOf } = require("../util/functions/raceWeekEvents.js");
const addCars = require("../util/functions/addCars.js");
const carNameGen = require("../util/functions/carNameGen.js");
const openPack = require("../util/functions/openPack.js");
const search = require("../util/functions/search.js");
const { trackMoneySpent, trackFuseTokensEarned, trackOfferBought } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");
const { saveGarage } = require("../util/functions/garageWrite.js");
const { addToSetStage } = require("../util/functions/rewardPipelines.js");
const offerModel = require("../models/offerSchema.js");

module.exports = {
    name: "buyoffer",
    usage: ["<offer name>"],
    args: 1,
    category: "Gameplay",
    cooldown: 4.388,
    description: "Buy limited offers with this command!",
    async execute(message, args) {
        const offers = await offerModel.find();
        let query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, offers, "offer")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await buyOffer(...response);
            })
            .catch(error => {
                throw error;
            });

        async function buyOffer(offer, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            // Only offers with cars or a pack touch the garage; the rest (money,
            // fuse tokens, drivers) read and write the light fields alone.
            const needsGarage = ["cars", "pack"].some(key => Object.prototype.hasOwnProperty.call(offer.offer, key));
            const playerData = needsGarage
                ? await getProfile(message.author.id)
                : await profileModel.findOne({ userID: message.author.id }, { garage: 0, discoveredCars: 0, decks: 0 }).lean();
            // Lean skips schema defaults.
            if (typeof playerData.money !== "number") playerData.money = 0;
            // Deep copy BEFORE addCars mutates the garage in place.
            const garageBefore = needsGarage ? structuredClone(playerData.garage) : null;
            const grantedCars = [];
            let fuseTokensGranted = 0;

            // Initialize discoveredCars
            let discoveredCars = playerData.discoveredCars || [];
            let discoveredInitialised = false;
            if (needsGarage && discoveredCars.length === 0 && playerData.garage.length > 0) {
                discoveredCars = playerData.garage.map(c => c.carID);
                discoveredInitialised = true;
            }
            // openPack pushes new discoveries onto discoveredCars in place.
            const discoveredBefore = discoveredCars.length;

            let amountBought = offer.purchasedPlayers[message.author.id] ?? 0;
            if (offer.isActive && offer.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline)).invalid !== null) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Looks like this offer has ended.",
                    desc: "Check out the other offers available using `cd-limitedoffers`.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            else if (amountBought >= offer.stock) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this offer is out of stock.",
                    desc: `You can only buy this offer ${offer.stock} time(s).`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            if (playerData.money >= offer.price) {
                const fields = [];
                let driverGrant = null;   // set by a "driver" entry, applied atomically below
                for (let [key, value] of Object.entries(offer.offer)) {
                    switch (key) {
                        case "fuseTokens":
                            fuseTokensGranted += value;
                            fields.push({ name: "Claimed Fuse Tokens", value: `${fuseEmoji}${value.toLocaleString("en")}`, inline: true });
                            break;
                        case "cars":
                            let carList = "";
                            for (let i = 0; i < value.length; i++) {
                                let currentCar = getCar(value[i]);
                                value[i] = {
                                    carID: value[i],
                                    upgrade: "000"
                                }
                                carList += `${carNameGen({ currentCar, rarity: true })}\n`;
                                // Track discovery
                                if (!discoveredCars.includes(value[i].carID)) {
                                    discoveredCars.push(value[i].carID);
                                }
                            }
                            playerData.garage = addCars(playerData.garage, value);
                            grantedCars.push(...value);
                            fields.push({ name: "Claimed Cars", value: carList, inline: true });
                            break;
                        case "pack":
                            let currentPack = getPack(value);
                            let addedCars = await openPack({ message, currentPack, discoveredCars });
                            if (!Array.isArray(addedCars)) return;

                            playerData.garage = addCars(playerData.garage, addedCars);
                            grantedCars.push(...addedCars);
                            fields.push({ name: "Claimed Pack", value: currentPack["packName"], inline: true });
                            break;
                        case "driver": {
                            // Offers are one of only two routes for a
                            // recruit-exclusive driver (the other is cd-recruit).
                            const offerDriver = getDriver(value);
                            if (!offerDriver) {
                                console.log(`buyoffer: unknown driver ID "${value}" in offer ${offer.offerID}, skipping`);
                                break;
                            }
                            driverGrant = { driverID: value, driver: offerDriver };
                            fields.push({ name: "Claimed Driver", value: driverDisplayName(offerDriver), inline: true });
                            break;
                        }
                        default:
                            break;
                    }
                }
                
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully bought the ${offer.name} offer for ${moneyEmoji}${offer.price.toLocaleString("en")}!`,
                    author: message.author,
                    fields
                });

                const set = {};
                set[`purchasedPlayers.${message.author.id}`] = amountBought + 1;
                // Money and fuse tokens go as deltas, guarded so the balance
                // can't go negative; never absolute values from the read.
                const inc = { money: -offer.price };
                if (fuseTokensGranted) inc.fuseTokens = fuseTokensGranted;
                const profileSet = {};
                if (discoveredInitialised || discoveredCars.length !== discoveredBefore) {
                    profileSet.discoveredCars = discoveredCars;
                }
                // Driver grants use atomic dotted paths so they can't clobber a
                // concurrent Race Week write with this command's stale snapshot.
                let newDriverID = null;
                if (driverGrant) {
                    const owned = Array.isArray(playerData.raceWeekStats?.ownedDrivers)
                        ? playerData.raceWeekStats.ownedDrivers : [];
                    if (!owned.includes(driverGrant.driverID)) {
                        newDriverID = driverGrant.driverID;
                    }
                    else {
                        const xp = playerData.raceWeekStats?.driverXP?.[driverGrant.driverID];
                        const dupes = ((xp && typeof xp.dupes === "number") ? xp.dupes : 0) + 1;
                        profileSet[`raceWeekStats.driverXP.${driverGrant.driverID}`] = {
                            dupes,
                            level: levelFromDupes(dupes, rarityOf(driverGrant.driver))
                        };
                    }
                }
                const moneyGuard = { money: { "$gte": offer.price } };

                let profileWrite;
                if (grantedCars.length > 0) {
                    // Cars changed: saveGarage sends only the granted rows (merged
                    // by carID on the server), not the whole garage.
                    profileWrite = saveGarage({
                        userID: message.author.id,
                        before: garageBefore,
                        after: playerData.garage,
                        inc,
                        set: profileSet,
                        stages: newDriverID ? [addToSetStage("raceWeekStats.ownedDrivers", ["d00000", newDriverID])] : [],
                        filter: moneyGuard,
                        baseStamp: playerData.cacheStamp
                    });
                }
                else {
                    // Garage untouched: a plain light write.
                    const profileUpdate = { "$inc": inc };
                    if (Object.keys(profileSet).length > 0) profileUpdate["$set"] = profileSet;
                    if (newDriverID) {
                        profileUpdate["$addToSet"] = {
                            "raceWeekStats.ownedDrivers": { "$each": ["d00000", newDriverID] }
                        };
                    }
                    profileWrite = profileModel.updateOne({ userID: message.author.id, ...moneyGuard }, profileUpdate)
                        .then(result => ({ ok: result.matchedCount > 0 }));
                }
                const [, saved] = await Promise.all([
                    offerModel.updateOne({ offerID: offer.offerID }, { "$set": set }),
                    profileWrite
                ]);
                if (!saved.ok) {
                    // The balance no longer covers it, so nothing was charged:
                    // undo the purchase count and show the usual error.
                    await offerModel.updateOne({ offerID: offer.offerID }, { "$set": { [`purchasedPlayers.${message.author.id}`]: amountBought } });
                    return insufficientMoney();
                }

                trackMoneySpent(offer.price);
                trackOfferBought();
                if (offer.offer.fuseTokens) trackFuseTokensEarned(offer.offer.fuseTokens);

                return successMessage.sendMessage({ currentMessage });
            }
            else {
                return insufficientMoney();
            }

            function insufficientMoney() {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, it looks like you don't have enough money for this purchase.",
                    author: message.author,
                    fields: [
                        { name: "Required Amount of Money", value: `${moneyEmoji}${offer.price.toLocaleString("en")}`, inline: true },
                        { name: "Your Money Balance", value: `${moneyEmoji}${playerData.money.toLocaleString("en")}`, inline: true }
                    ]
                });
                return errorMessage.sendMessage({ currentMessage })
            }
        }
    }
};
