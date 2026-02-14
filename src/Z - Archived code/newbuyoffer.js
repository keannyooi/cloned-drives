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
        try {
            const offers = await offerModel.find();
            const query = args.map(arg => arg.toLowerCase());
            const searchResults = await search(message, query, offers, "offer");

            if (!Array.isArray(searchResults)) return;
            await handleOfferPurchase(searchResults[0], searchResults[1]);
        } catch (error) {
            console.error("Error in buyoffer command execution:", error);
        }

        async function handleOfferPurchase(offer, currentMessage) {
            try {
                const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
                const playerData = await profileModel.findOne({ userID: message.author.id });
                const amountBought = offer.purchasedPlayers[message.author.id] ?? 0;

                // Validate offer availability
                if (!offer.isActive || (offer.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline)).invalid !== null)) {
                    return sendError("Looks like this offer has ended.", "Check out the other offers available using `cd-limitedoffers`.", currentMessage);
                }

                if (amountBought >= offer.stock) {
                    return sendError("This offer is out of stock.", `You can only buy this offer ${offer.stock} time(s).`, currentMessage);
                }

                // Validate user funds
                if (playerData.money < offer.price) {
                    return sendError(
                        "Insufficient funds for this purchase.",
                        null,
                        currentMessage,
                        [
                            { name: "Required Amount of Money", value: `${moneyEmoji}${offer.price.toLocaleString("en")}`, inline: true },
                            { name: "Your Money Balance", value: `${moneyEmoji}${playerData.money.toLocaleString("en")}`, inline: true },
                        ]
                    );
                }

                // Deduct the cost and process the offer
                playerData.money -= offer.price;
                const fields = await processOfferItems(offer, playerData);

                // Update databases
                await Promise.all([
                    offerModel.updateOne({ offerID: offer.offerID }, { $set: { [`purchasedPlayers.${message.author.id}`]: amountBought + 1 } }),
                    profileModel.updateOne({ userID: message.author.id }, {
                        money: playerData.money,
                        fuseTokens: playerData.fuseTokens,
                        garage: playerData.garage,
                    }),
                ]);

                // Success message
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully bought the ${offer.name} offer for ${moneyEmoji}${offer.price.toLocaleString("en")}!`,
                    author: message.author,
                    fields,
                });
                return successMessage.sendMessage({ currentMessage });
            } catch (error) {
                console.error("Error during handleOfferPurchase:", error);
            }
        }

        async function processOfferItems(offer, playerData) {
            const fields = [];

            for (const [key, value] of Object.entries(offer.offer)) {
                switch (key) {
                    case "fuseTokens":
                        playerData.fuseTokens += value;
                        fields.push({ name: "Claimed Fuse Tokens", value: `${bot.emojis.cache.get(fuseEmojiID)}${value.toLocaleString("en")}`, inline: true });
                        break;

                    case "cars":
                        const carList = value.map(carID => {
                            const currentCar = require(`../cars/${carID}`);
                            playerData.garage = addCars(playerData.garage, [{ carID, upgrade: "000" }]);
                            return carNameGen({ currentCar, rarity: true });
                        }).join("\n");
                        fields.push({ name: "Claimed Cars", value: carList, inline: true });
                        break;

                    case "pack":
                        const currentPack = require(`../packs/${value}`);
                        const addedCars = await openPack({ message, currentPack });
                        if (Array.isArray(addedCars)) {
                            playerData.garage = addCars(playerData.garage, addedCars);
                        }
                        fields.push({ name: "Claimed Pack", value: currentPack.packName, inline: true });
                        break;

                    default:
                        console.warn(`Unknown offer item type: ${key}`);
                        break;
                }
            }

            return fields;
        }

        function sendError(title, description, currentMessage, fields = []) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title,
                desc: description,
                author: message.author,
                fields,
            });
            return errorMessage.sendMessage({ currentMessage });
        }
    },
};
