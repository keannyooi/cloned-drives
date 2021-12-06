"use strict";

const { SuccessMessage, InfoMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { carNameGen, selectUpgrade } = require("./sharedfiles/primary.js");
const { search, confirm } = require("./sharedfiles/secondary.js");
const { carSave, defaultChoiceTime } = require("./sharedfiles/consts.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "upgrade",
    aliases: ["tune", "u"],
    usage: "<car name goes here> | <upgrade pattern>",
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
        const ownedCars = playerData.garage.map(c => c.carID);
        let carName = args.slice(0, args.length - 1).map(i => i.toLowerCase());
        new Promise(resolve => resolve(search(message, carName, ownedCars, "car")))
            .then(async (hmm) => {
                if (!Array.isArray(hmm)) return;
                let [result, currentMessage] = hmm;
                result = playerData.garage.find(c => c.carID === result);
                try {
                    await upgradeCar(result, playerData, currentMessage);
                }
                catch (error) {
                    throw error;
                }
            });

        async function upgradeCar(currentCar, playerData, currentMessage) {
            let upgrade = args[args.length - 1];
            new Promise(resolve => resolve(selectUpgrade(message, currentCar, 1, currentMessage, upgrade)))
                .then(async (origUpgrade) => {
                    if (isNaN(origUpgrade)) return;
                    try {
                        const moneyEmoji = bot.emojis.cache.get("726017235826770021");
                        const fuseEmoji = bot.emojis.cache.get("726018658635218955");
                        const car = require(`./cars/${currentCar.carID}`);
                        const carName = carNameGen({ currentCar: car });
                        let [moneyLimit, fuseTokenLimit] = definePrice(car["rq"], upgrade, origUpgrade);

                        if (playerData.money >= moneyLimit && playerData.fuseTokens >= fuseTokenLimit) {
                            const confirmationMessage = new InfoMessage({
                                channel: message.channel,
                                title: `Are you sure you want to upgrade your ${carName} from \`${origUpgrade}\` to \`${upgrade}\` with ${moneyEmoji}${moneyLimit} and ${fuseEmoji}${fuseTokenLimit}?`,
                                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                                author: message.author,
                                image: car[`racehud${origUpgrade}`]
                            });

                            await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);

                            async function acceptedFunction(currentMessage) {
                                currentCar.upgrades[upgrade]++;
                                currentCar.upgrades[origUpgrade]--;
                                if (playerData.hand?.carID === currentCar.carID) {
                                    playerData.upgrade = upgrade;
                                }
                                for (let i = 0; i < playerData.decks.length; i++) {
                                    let x = playerData.decks[i].hand.findIndex(c => c.carID === currentCar.carID && c.upgrade === upgrade);
                                    if (x > -1) playerData.decks[i].tunes[x] = upgrade;
                                }

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
                                        { name: "Current Money Balance", value: `${moneyEmoji}${moneyBalance}`, inline: true },
                                        { name: "Current Fuse Token Balance", value: `${fuseEmoji}${fuseBalance}`, inline: true }
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
                                desc: `You currently have ${moneyEmoji}${playerData.money}, ${fuseEmoji}${playerData.fuseTokens}.`,
                                author: message.author,
                                fields: [
                                    { name: "Required Amount of Money", value: `${moneyEmoji}${moneyLimit}`, inline: true },
                                    { name: "Required Amount of Fuse Tokens", value: `${fuseEmoji}${fuseTokenLimit}`, inline: true }
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