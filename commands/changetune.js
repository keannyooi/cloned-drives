"use strict";

const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { carNameGen, selectUpgrade, updateHands } = require("./sharedfiles/primary.js");
const { searchGarage, searchUser } = require("./sharedfiles/secondary.js");
const { carSave } = require("./sharedfiles/consts.js");
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
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, user requested is a bot.",
                    desc: "Bots can't play Cloned Drives.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
        }
        else {
            const userSaves = await profileModel.find({});
            const availableUsers = await message.guild.members.fetch();
            availableUsers.filter(user => userSaves.find(f => f.userID = user.id));
            new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), availableUsers)))
                .then(async (hmm) => {
                    if (!Array.isArray(hmm)) return;
                    let [result, currentMessage] = hmm;
                    await getCar(result.user, currentMessage);
                });
        }

        async function getCar(user, currentMessage) {
            const playerData = await profileModel.findOne({ userID: user.id });
            let query, amount = 1, startFrom, searchByID = false;
            if (args[1].toLowerCase() === "all" && args[2]) {
                startFrom = 2;
            }
            else if (isNaN(args[1]) || !args[2]) {
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
                query = args.slice(startFrom, args.length - 1).map(i => i.toLowerCase());
            }

            new Promise(resolve => resolve(searchGarage({
                message,
                query,
                garage: playerData.garage,
                amount,
                searchByID,
                currentMessage
            })))
                .then(async (hmm) => {
                    if (!Array.isArray(hmm)) return;
                    let [result, currentMessage] = hmm;
                    try {
                        await changeTune(user, result, playerData, currentMessage);
                    }
                    catch (error) {
                        throw error;
                    }
                });
        }

        async function changeTune(user, currentCar, playerData, currentMessage) {
            new Promise(resolve => resolve(selectUpgrade(message, currentCar, 1, currentMessage)))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [origUpgrade, currentMessage] = response;
                    let upgrade = args[args.length - 1];
                    currentCar.upgrades[upgrade]++;
                    currentCar.upgrades[origUpgrade]--;
                    updateHands(playerData, currentCar.carID, origUpgrade, upgrade);
                    
                    const car = require(`./cars/${currentCar.carID}`);
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