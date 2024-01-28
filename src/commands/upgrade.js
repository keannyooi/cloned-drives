"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { carSave, defaultChoiceTime, moneyEmojiID} = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const updateHands = require("../util/functions/updateHands.js");
const searchGarage = require("../util/functions/searchGarage.js");
const generateHud = require("../util/functions/generateHud.js");
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
                        let car = require(`../cars/${currentCar.carID}`), bmReference = car;
                        if (car["reference"]) {
                            bmReference = require(`../cars/${car["reference"]}`);
                        }

                        const carName = carNameGen({ currentCar: car });
                        let [moneyLimit] = definePrice(bmReference["cr"], upgrade, origUpgrade);
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

        function definePrice(cr, upgrade, origUpgrade) {
            let a = parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2]);
            let b = parseInt(origUpgrade[0]) + parseInt(origUpgrade[1]) + parseInt(origUpgrade[2]);
            let moneyMultiplier = 0;
            if (cr > 1500) { //BOSS 1500+
                moneyMultiplier = 20000000;
            }
			else if (cr > 1130 && cr <= 1499) { //1130-1499
				moneyMultiplier = 350000;
            }
			else if (cr > 1100 && cr <= 1129) { //1100-1129
				moneyMultiplier = 300000;
            }
            else if (cr > 1050 && cr <= 1099) { //1050-1099
                moneyMultiplier = 175000;
            }
            else if (cr > 1000 && cr <= 1049) { //1000-1049
                moneyMultiplier = 135000;
            }
            else if (cr > 950 && cr <= 999) { //950-999
                moneyMultiplier = 80000;
            }
            else if (cr > 900 && cr <= 949) { //900-949
                moneyMultiplier = 50000;
            }
			else if (cr > 850 && cr <= 899) { //850-899
				moneyMultiplier = 37500;
            }
            else if (cr > 800 && cr <= 849) { //800-849
                moneyMultiplier = 22500;
            }
            else if (cr > 750 && cr <= 799) { //750-799
                moneyMultiplier = 15000;
            }
            else if (cr > 700 && cr <= 749) { //700-749
                moneyMultiplier = 10000;
            }
            else if (cr > 600 && cr <= 699) { //600-699
                moneyMultiplier = 9000;
            }
            else if (cr > 500 && cr <= 599) { //500-599
                moneyMultiplier = 5000;
            }
            else if (cr > 400 && cr <= 499) { //400-499
                moneyMultiplier = 3750;
            }
            else if (cr > 300 && cr <= 399) { //300-399
                moneyMultiplier = 2000;
            }
            else if (cr > 200 && cr <= 299) { //200-299
                moneyMultiplier = 1500;
            }
            else if (cr > 100 && cr <= 199) { //100-199
                moneyMultiplier = 750;
            }
            else { //001-099
                moneyMultiplier = 500;
            }
            return [moneyMultiplier * (a - b)];
        }
    }
};