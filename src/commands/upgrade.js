"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { carSave, defaultChoiceTime, moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const updateHands = require("../util/functions/updateHands.js");
const searchGarage = require("../util/functions/searchGarage.js");
const confirm = require("../util/functions/confirm.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "upgrade",
    aliases: ["tune", "u"],
    usage: ["<car name> <upgrade>"],
    args: 2,
    category: "Gameplay",
    description: "Upgrades a car in your garage.",
    async execute(message, args) {
        if (!Object.keys(carSave).includes(args[args.length - 1])) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, invalid upgrade provided.",
                desc: "Upgrades are limited to `333`, `666`, `699`, `969` and `996` for simplicity sake.",
                author: message.author
            }).displayClosest(args[args.length - 1]);
            return errorMessage.sendMessage();
        }

        const playerData = await profileModel.findOne({ userID: message.author.id });
        let query, searchByID = false;
        if (args[0].toLowerCase().startsWith("-c")) {
            query = [args[0].toLowerCase().slice(1)];
            searchByID = true;
        }
        else {
            query = args.slice(0, args.length - 1).map(i => i.toLowerCase());
        }

        await new Promise(resolve => resolve(searchGarage({
            message,
            query,
            garage: playerData.garage,
            amount: 1,
            searchByID
        })))
            .then(async response => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                await upgradeCar(result, playerData, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function upgradeCar(currentCar, playerData, currentMessage) {
            let upgrade = args[args.length - 1];
            await new Promise(resolve => resolve(selectUpgrade({ message, currentCar, amount: 1, currentMessage, targetUpgrade: upgrade })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [origUpgrade, currentMessage] = response;
                    try {
                        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
                        const car = require(`../cars/${currentCar.carID}`);
                        const carName = carNameGen({ currentCar: car });
                        let [moneyLimit, fuseTokenLimit] = definePrice(car["rq"], upgrade, origUpgrade);

                        if (playerData.money >= moneyLimit && playerData.fuseTokens >= fuseTokenLimit) {
                            const confirmationMessage = new InfoMessage({
                                channel: message.channel,
                                title: `Are you sure you want to upgrade your ${carName} from \`${origUpgrade}\` to \`${upgrade}\` with ${moneyEmoji}${moneyLimit.toLocaleString("en")} and ${fuseEmoji}${fuseTokenLimit.toLocaleString("en")}?`,
                                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                                author: message.author,
                                image: car[`racehud${origUpgrade}`]
                            });

                            await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);

                            async function acceptedFunction(currentMessage) {
                                currentCar.upgrades[upgrade]++;
                                currentCar.upgrades[origUpgrade]--;
                                updateHands(playerData, currentCar.carID, origUpgrade, upgrade);

                                let moneyBalance = playerData.money - moneyLimit, fuseBalance = playerData.fuseTokens - fuseTokenLimit;
                                await profileModel.updateOne({ userID: message.author.id }, {
                                    money: moneyBalance,
                                    fuseTokens: fuseBalance,
                                    garage: playerData.garage,
                                    hand: playerData.hand,
                                    decks: playerData.decks
                                });

                                const successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully upgraded your ${carName}!`,
                                    desc: "Current upgrade status:",
                                    author: message.author,
                                    fields: [
                                        { name: "Gearing Upgrade", value: `\`${origUpgrade[0]} => ${upgrade[0]}\``, inline: true },
                                        { name: "Engine Upgrade", value: `\`${origUpgrade[1]} => ${upgrade[1]}\``, inline: true },
                                        { name: "Chassis Upgrade", value: `\`${origUpgrade[2]} => ${upgrade[2]}\``, inline: true },
                                        { name: "Current Money Balance", value: `${moneyEmoji}${moneyBalance.toLocaleString("en")}`, inline: true },
                                        { name: "Current Fuse Token Balance", value: `${fuseEmoji}${fuseBalance.toLocaleString("en")}`, inline: true }
                                    ],
                                    image: car[`racehud${upgrade}`]
                                });
                                return successMessage.sendMessage({ currentMessage });
                            }
                        }
                        else {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, it looks like you don't have enough money and/or fuse tokens.",
                                desc: `You currently have ${moneyEmoji}${playerData.money.toLocaleString("en")}, ${fuseEmoji}${playerData.fuseTokens.toLocaleString("en")}.`,
                                author: message.author,
                                fields: [
                                    { name: "Required Amount of Money", value: `${moneyEmoji}${moneyLimit.toLocaleString("en")}`, inline: true },
                                    { name: "Required Amount of Fuse Tokens", value: `${fuseEmoji}${fuseTokenLimit.toLocaleString("en")}`, inline: true }
                                ]
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                    }
                    catch (error) {
                        throw error;
                    }
                });
        }

        function definePrice(rq, upgrade, origUpgrade) {
            let a = parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2]);
            let b = parseInt(origUpgrade[0]) + parseInt(origUpgrade[1]) + parseInt(origUpgrade[2]);
            let moneyMultiplier = 0, fuseMultiplier = 0;
            if (rq > 79) { //leggie
                moneyMultiplier = 4500;
                fuseMultiplier = 1200;
            }
            else if (rq > 64 && rq <= 79) { //epic
                moneyMultiplier = 3750;
                fuseMultiplier = 700;
            }
            else if (rq > 49 && rq <= 64) { //ultra
                moneyMultiplier = 3000;
                fuseMultiplier = 275;
            }
            else if (rq > 39 && rq <= 49) { //super
                moneyMultiplier = 2250;
                fuseMultiplier = 100;
            }
            else if (rq > 29 && rq <= 39) { //rare
                moneyMultiplier = 1500;
                fuseMultiplier = 35;
            }
            else if (rq > 19 && rq <= 29) { //uncommon
                moneyMultiplier = 750;
                fuseMultiplier = 10;
            }
            else { //common
                moneyMultiplier = 500;
                fuseMultiplier = 10;
            }
            return [moneyMultiplier * (a - b), fuseMultiplier * (a - b - (a >= 18 && b >= 9 ? 0 : 9)) / 3];
        }
    }
};