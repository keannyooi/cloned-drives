"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const addCars = require("../util/functions/addCars.js");
const carNameGen = require("../util/functions/carNameGen.js");
const openPack = require("../util/functions/openPack.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
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
            const playerData = await profileModel.findOne({ userID: message.author.id });
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
                playerData.money -= offer.price;
                for (let [key, value] of Object.entries(offer.offer)) {
                    switch (key) {
                        case "fuseTokens":
                            playerData.fuseTokens += value;
                            fields.push({ name: "Claimed Fuse Tokens", value: `${fuseEmoji}${value.toLocaleString("en")}`, inline: true });
                            break;
                        case "cars":
                            let carList = "";
                            for (let i = 0; i < value.length; i++) {
                                let currentCar = require(`../cars/${value[i]}`);
                                value[i] = {
                                    carID: value[i],
                                    upgrade: "000"
                                }
                                carList += `${carNameGen({ currentCar, rarity: true })}\n`;
                            }
                            playerData.garage = addCars(playerData.garage, value);
                            fields.push({ name: "Claimed Cars", value: carList, inline: true });
                            break;
                        case "pack":
                            let currentPack = require(`../packs/${value}`);
                            let addedCars = await openPack({ message, currentPack });
                            if (!Array.isArray(addedCars)) return;

                            playerData.garage = addCars(playerData.garage, addedCars);
                            fields.push({ name: "Claimed Pack", value: currentPack["packName"], inline: true });
                            break;
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
                await offerModel.updateOne({ offerID: offer.offerID }, { "$set": set });
                await profileModel.updateOne({ userID: message.author.id }, {
                    money: playerData.money,
                    fuseTokens: playerData.fuseTokens,
                    garage: playerData.garage
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
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