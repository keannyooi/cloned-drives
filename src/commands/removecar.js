"use strict";

const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const searchUser = require("../util/functions/searchUser.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const searchGarage = require("../util/functions/searchGarage.js");
const confirm = require("../util/functions/confirm.js");
const calcTotal = require("../util/functions/calcTotal.js");
const updateHands = require("../util/functions/updateHands.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");

module.exports = {
    name: "removecar",
    aliases: ["rmvcar"],
    usage: ["<username> | <car name goes here>", "<username> | <amount> | <car name goes here>"],
    args: 2,
    category: "Admin",
    description: "Removes one or more cars from someone's garage.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                try {
                    await getCarFunc(message.mentions.users.first());
                }
                catch (error) {
                    throw error;
                }
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
                    await getCarFunc(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        // getCarFunc, not getCar — a local named getCar would shadow the
        // dataManager import that removeCar() below needs for car data.
        async function getCarFunc(user, currentMessage) {
            const playerData = await getProfile(user.id);
            if (!playerData) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: `Error, ${user.username} has no profile.`,
                    desc: "This user has never used the bot, so they have no garage to remove cars from.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            let query, amount = 1, startFrom, searchByID = false;
            if (args[1].toLowerCase() === "all" && args[2]) {
                startFrom = 2;
            }
            else if (!/^\d+$/.test(args[1]) || !args[2] || parseInt(args[1]) > 30 || parseInt(args[1]) < 1) {
                startFrom = 1;
            }
            else {
                amount = Math.ceil(parseInt(args[1]));
                startFrom = 2;
            }
            if (args[startFrom].toLowerCase().startsWith("-c")) {
                query = [args[startFrom].toLowerCase().slice(1)];
                searchByID = true;
            }
            else {
                query = args.slice(startFrom, args.length).map(i => i.toLowerCase());
            }

            await new Promise(resolve => resolve(searchGarage({
                message,
                query,
                garage: playerData.garage,
                amount,
                searchByID,
                currentMessage
            })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await removeCar(user, result, amount, playerData, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function removeCar(user, currentCar, amount, playerData, currentMessage) {
            await new Promise(resolve => resolve(selectUpgrade({ message, currentCar, amount, currentMessage })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [upgrade, currentMessage] = response;
                    const car = getCar(currentCar.carID);
                    const currentName = carNameGen({ currentCar: car, upgrade });
                    if (args[1].toLowerCase() === "all") {
                        amount = currentCar.upgrades[upgrade];
                    }

                    const confirmationMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Are you sure you want to remove ${amount} of ${user.username}'s ${currentName} from their garage?`,
                        desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                        author: message.author,
                        thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                        image: car["racehud"]
                    });
                    await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);

                    async function acceptedFunction(currentMessage) {
                        // Re-fetch the target's profile so the write is built from FRESH data —
                        // another writer may have touched their garage while the dialog was open.
                        const freshData = await getProfile(user.id);
                        const freshCar = freshData ? freshData.garage.find(c => c.carID === currentCar.carID) : null;
                        if (!freshData || !freshCar || (freshCar.upgrades[upgrade] || 0) < amount) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: `Error, ${user.username}'s garage changed while you were deciding.`,
                                desc: "They no longer own enough copies of this car at this tune. Please run the command again.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        updateHands(freshData, freshCar.carID, upgrade, "remove");
                        freshCar.upgrades[upgrade] -= amount;
                        if (calcTotal(freshCar) === 0) {
                            freshData.garage.splice(freshData.garage.indexOf(freshCar), 1);
                        }
                        await profileModel.updateOne({ userID: user.id }, {
                            garage: freshData.garage,
                            hand: freshData.hand,
                            decks: freshData.decks
                        });

                        const successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully removed ${amount} of ${user.username}'s ${currentName}!`,
                            desc: `Use \`cd-garage\` to check if the car has been removed from ${user.username}'s garage. If it hasn't, try running this command again.`,
                            author: message.author,
                            thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                            image: car["racehud"]
                        });
                        await successMessage.sendMessage({ currentMessage });
                        return successMessage.removeButtons();
                    }
                });
        }
    }
};