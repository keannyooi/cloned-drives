"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getPack, getPackFiles, getDriver, getAllDrivers } = require("../util/functions/dataManager.js");
const { driverDisplayName, rarityOf } = require("../util/functions/raceWeekEvents.js");
const search = require("../util/functions/search.js");

const packFiles = getPackFiles();
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const offerModel = require("../models/offerSchema.js");

module.exports = {
    name: "givereward",
    usage: ["<username> pack <pack name>", "<username> driver <driver ID>", "<username> offer <offer name>"],
    args: 3,
    category: "Admin",
    description: "Gifts someone a pack, driver or offer. Those who are given a reward via this command can claim them through cd-rewards.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await addStuff(message.mentions.users.first());
            }
            else {
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase())))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await addStuff(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function addStuff(user, currentMessage) {
            // New entries are collected here and $pushed atomically at the end —
            // never a full-array $set that could clobber concurrent grants.
            const newRewards = [];
            let successMessage, operationFailed = false;
            switch (args[1].toLowerCase()) {
                case "pack":
                    let packName = args.slice(2, args.length).map(i => i.toLowerCase());
                    await new Promise(resolve => resolve(search(message, packName, packFiles, "pack")))
                        .then(response => {
                            if (!Array.isArray(response)) {
                                operationFailed = true;
                            }
                            else {
                                let [pack] = response;
                                newRewards.push({ pack: pack.slice(0, 6), origin: message.author.tag });
                                let currentPack = getPack(pack);
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully gifted 1 ${currentPack["packName"]} to ${user.username}!`,
                                    author: message.author,
                                    image: currentPack["pack"]
                                });
                            }
                        })
                        .catch(error => {
                            throw error;
                        });
                    break;
                case "driver":
                    let driverID = args[2].toLowerCase();
                    let giftDriver = getDriver(driverID);
                    if (!giftDriver) {
                        operationFailed = true;
                        const driverError = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, driver ID provided invalid.",
                            desc: `Valid driver IDs: \`${getAllDrivers().map(d => d.driverID).sort().join("`, `")}\``,
                            author: message.author
                        }).displayClosest(driverID);
                        await driverError.sendMessage({ currentMessage });
                    }
                    else if (rarityOf(giftDriver) === "serialised") {
                        operationFailed = true;
                        const serialisedError = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, serialised drivers cannot be awarded.",
                            desc: "Serialised drivers are mint-capped and can only drop from their dedicated sources (Driver Scout / pack driver drops).",
                            author: message.author
                        });
                        await serialisedError.sendMessage({ currentMessage });
                    }
                    else if (giftDriver.recruitExclusive === true) {
                        operationFailed = true;
                        const recruitError = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, recruit-exclusive drivers cannot be awarded.",
                            desc: "This driver is only obtainable from the recruitment shop (`cd-recruit`) or a limited offer.",
                            author: message.author
                        });
                        await recruitError.sendMessage({ currentMessage });
                    }
                    else {
                        newRewards.push({ driver: driverID, origin: message.author.tag });
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully gifted driver ${driverDisplayName(giftDriver)} to ${user.username}!`,
                            author: message.author
                        });
                    }
                    break;
                case "offer":
                    const offers = await offerModel.find();
                    let offerName = args.slice(2, args.length).map(i => i.toLowerCase());
                    await new Promise(resolve => resolve(search(message, offerName, offers, "offer")))
                        .then(async (response) => {
                            if (!Array.isArray(response)) {
                                operationFailed = true;
                            }
                            else {
                                let [giveOffer, currentMessage2] = response;
                                currentMessage = currentMessage2;
                                for (let [key, value] of Object.entries(giveOffer.offer)) {
                                    switch (key) {
                                        case "fuseTokens":
                                            let template = {};
                                            template[key] = value;
                                            template.origin = message.author.tag;
                                            newRewards.push(template);
                                            break;
                                        case "cars":
                                            for (let carID of value) {
                                                newRewards.push({
                                                    car: {
                                                        carID,
                                                        upgrade: "000"
                                                    },
                                                    origin: message.author.tag
                                                });
                                            }
                                            break;
                                        case "pack":
                                            newRewards.push({
                                                pack: value.slice(0, 6),
                                                origin: message.author.tag
                                            });
                                            break;
                                        default:
                                            break;
                                    }
                                }

                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully gifted 1 ${giveOffer.name} to ${user.username}!`,
                                    author: message.author,
                                });
                            }
                        })
                        .catch(error => {
                            throw error;
                        });
                    break;
                default:
                    operationFailed = true;
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: `Error, I don't know the kind of thing you want to gift to ${user.username}.`,
                        desc: "FYI, you can either gift a `pack`, a `driver` or an `offer`.",
                        author: message.author,
                    }).displayClosest(args[1].toLowerCase());
                    await errorMessage.sendMessage({ currentMessage });
            }

            if (!operationFailed) {
                if (newRewards.length > 0) {
                    await profileModel.updateOne(
                        { userID: user.id },
                        { "$push": { unclaimedRewards: { "$each": newRewards } } }
                    );
                }
                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};