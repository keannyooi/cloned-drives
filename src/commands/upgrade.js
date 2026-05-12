"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { carSave, defaultChoiceTime, moneyEmojiID} = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const updateHands = require("../util/functions/updateHands.js");
const searchGarage = require("../util/functions/searchGarage.js");
const generateHud = require("../util/functions/generateHud.js");
const { isValidTune, getAvailableTunes } = require("../util/functions/calcTune.js");
const { upgradeCost } = require("../util/functions/upgradePrice.js");
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
        if (!isValidTune(args[args.length - 1])) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, invalid upgrade provided.",
                desc: `Valid tunes: ${getAvailableTunes().join(", ")}`,
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
                        let car = getCar(currentCar.carID), bmReference = car;
                        if (car["reference"]) {
                            bmReference = getCar(car["reference"]);
                        }

                        const carName = carNameGen({ currentCar: car });
                        const moneyLimit = upgradeCost(bmReference["cr"], origUpgrade, upgrade);
                        if (playerData.money >= moneyLimit) {
                            const confirmationMessage = new InfoMessage({
                                channel: message.channel,
                                title: `Are you sure you want to upgrade your ${carName} from \`${origUpgrade}\` to \`${upgrade}\` with ${moneyEmoji}${moneyLimit.toLocaleString("en")}?`,
                                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                                author: message.author,
                                image: car["racehud"]
                            });

                            await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);

                            async function acceptedFunction(currentMessage) {
                                currentCar.upgrades[upgrade]++;
                                currentCar.upgrades[origUpgrade]--;
                                updateHands(playerData, currentCar.carID, origUpgrade, upgrade);

                                let moneyBalance = playerData.money - moneyLimit;
                                const [, attachment] = await Promise.all([
                                    profileModel.updateOne({ userID: message.author.id }, {
                                        money: moneyBalance,
                                        garage: playerData.garage,
                                        hand: playerData.hand,
                                        decks: playerData.decks
                                    }),
                                    generateHud(car, upgrade)
                                ]);

                                const successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully upgraded your ${carName}!`,
                                    desc: "Current upgrade status:",
                                    author: message.author,
                                    fields: [
                                        { name: "Gearing Upgrade", value: `\`${origUpgrade[0]} => ${upgrade[0]}\``, inline: true },
                                        { name: "Engine Upgrade", value: `\`${origUpgrade[1]} => ${upgrade[1]}\``, inline: true },
                                        { name: "Chassis Upgrade", value: `\`${origUpgrade[2]} => ${upgrade[2]}\``, inline: true },
                                        { name: "Current Money Balance", value: `${moneyEmoji}${moneyBalance.toLocaleString("en")}`, inline: true }
                                    ]
                                });
                                return successMessage.sendMessage({ attachment, currentMessage });
                            }
                        }
                        else {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, it looks like you don't have enough money",
                                desc: `You currently have ${moneyEmoji}${playerData.money.toLocaleString("en")}.`,
                                author: message.author,
                                fields: [
                                    { name: "Required Amount of Money", value: `${moneyEmoji}${moneyLimit.toLocaleString("en")}`, inline: true },
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

    }
};
