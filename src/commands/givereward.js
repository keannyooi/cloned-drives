"use strict";

const { readdirSync } = require("fs");
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith(".json"));
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const search = require("../util/functions/search.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const offerModel = require("../models/offerSchema.js");

module.exports = {
    name: "givereward",
    usage: ["<username> pack <pack name>", "<username> offer <offer name>"],
    args: 3,
    category: "Admin",
    description: "Gifts someone a pack or offer. Those who are given a pack/offer via this command can claim them through cd-rewards.",
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
            const { unclaimedRewards } = await profileModel.findOne({ userID: user.id });
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
                                unclaimedRewards.push({ pack: pack.slice(0, 6), origin: message.author.tag });
                                let currentPack = require(`../packs/${pack}`);
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
                                            unclaimedRewards.push(template);
                                            break;
                                        case "cars":
                                            for (let carID of value) {
                                                unclaimedRewards.push({
                                                    car: {
                                                        carID,
                                                        upgrade: "000"
                                                    },
                                                    origin: message.author.tag
                                                });
                                            }
                                            break;
                                        case "pack":
                                            unclaimedRewards.push({
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
                        desc: "FYI, you can either gift a `pack` or an `offer`.",
                        author: message.author,
                    }).displayClosest(args[1].toLowerCase());
                    await errorMessage.sendMessage({ currentMessage });
            }

            if (!operationFailed) {
                await profileModel.updateOne({ userID: user.id }, { unclaimedRewards });
                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};