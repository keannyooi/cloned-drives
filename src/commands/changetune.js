"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { carSave } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const updateHands = require("../util/functions/updateHands.js");
const searchGarage = require("../util/functions/searchGarage.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "changetune",
    aliases: ["ct"],
    usage: "<username goes here> | <car name goes here> | <upgrade pattern>",
    args: 3,
    category: "Admin",
    description: "Changes a tune of a car in someone's garage.",
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

        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await getCar(message.mentions.users.first());
            }
            else {
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase())))
                .then(async response => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await getCar(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function getCar(user, currentMessage) {
            const playerData = await profileModel.findOne({ userID: user.id });
            let query, searchByID = false;
            if (args[1].toLowerCase().startsWith("-c")) {
                query = [args[1].toLowerCase().slice(1)];
                searchByID = true;
            }
            else {
                query = args.slice(1, args.length - 1).map(i => i.toLowerCase());
            }

            await new Promise(resolve => resolve(searchGarage({
                message,
                query,
                garage: playerData.garage,
                amount: 1,
                searchByID,
                currentMessage
            })))
                .then(response => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    changeTune(user, result, playerData, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        function changeTune(user, currentCar, playerData, currentMessage) {
            new Promise(resolve => resolve(selectUpgrade({ message, currentCar, amount: 1, currentMessage })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [origUpgrade, currentMessage] = response;
                    let upgrade = args[args.length - 1];
                    currentCar.upgrades[upgrade]++;
                    currentCar.upgrades[origUpgrade]--;
                    updateHands(playerData, currentCar.carID, origUpgrade, upgrade);
                    
                    const car = require(`../cars/${currentCar.carID}`);
                    await profileModel.updateOne({ userID: user.id }, {
                        garage: playerData.garage,
                        hand: playerData.hand,
                        decks: playerData.decks
                    });

                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed tune for ${user.username}'s ${carNameGen({ currentCar: car })}!`,
                        desc: "Current upgrade status:",
                        author: message.author,
                        fields: [
                            { name: "Gearing Upgrade", value: `\`${origUpgrade[0]} => ${upgrade[0]}\``, inline: true },
                            { name: "Engine Upgrade", value: `\`${origUpgrade[1]} => ${upgrade[1]}\``, inline: true },
                            { name: "Chassis Upgrade", value: `\`${origUpgrade[2]} => ${upgrade[2]}\``, inline: true }
                        ],
                        image: car[`racehud${upgrade}`]
                    });
                    return successMessage.sendMessage({ currentMessage });
                });
        }
    }
};