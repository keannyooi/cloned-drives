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
const { modifiedBase } = require("../util/functions/cardType.js");
const confirm = require("../util/functions/confirm.js");
const { getProfile } = require("../util/functions/profileCache.js");
const { saveGarage, snapshotHandDecks, handDeckChanges } = require("../util/functions/garageWrite.js");

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

        const playerData = await getProfile(message.author.id);
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
                        let car = getCar(currentCar.carID);
                        const bmReference = modifiedBase(car);

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
                                // saveGarage guards the tune decrement and the balance on the
                                // server, so a change made while the dialog was open fails the
                                // write instead of being overwritten — no fresh re-read needed.
                                const before = structuredClone(playerData.garage);
                                const handDecks = snapshotHandDecks(playerData);
                                const ownedCar = playerData.garage.find(c => c.carID === currentCar.carID);
                                const changedError = () => new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, your garage or balance changed while you were deciding.",
                                    desc: "You no longer own this car at the selected tune, or you can no longer afford this upgrade. Please run the command again.",
                                    author: message.author
                                }).sendMessage({ currentMessage });
                                if (!ownedCar || (ownedCar.upgrades[origUpgrade] || 0) < 1) return changedError();

                                ownedCar.upgrades[upgrade] = (ownedCar.upgrades[upgrade] || 0) + 1;
                                ownedCar.upgrades[origUpgrade]--;
                                updateHands(playerData, ownedCar.carID, origUpgrade, upgrade);

                                const [{ ok, doc }, attachment] = await Promise.all([
                                    saveGarage({
                                        userID: message.author.id,
                                        before,
                                        after: playerData.garage,
                                        inc: { money: -moneyLimit },
                                        // hand/decks only when updateHands changed them, and only if still as read.
                                        ...handDeckChanges(playerData, handDecks),
                                        filter: { money: { $gte: moneyLimit } },
                                        returning: ["money"],
                                        baseStamp: playerData.cacheStamp
                                    }),
                                    generateHud(car, upgrade)
                                ]);
                                if (!ok) return changedError();
                                // The stored balance, read back by the same write.
                                const moneyBalance = doc && typeof doc.money === "number" ? doc.money : playerData.money - moneyLimit;

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
