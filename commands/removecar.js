"use strict";

const { SuccessMessage, InfoMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { defaultChoiceTime } = require("./sharedfiles/consts.js");
const { carNameGen, selectUpgrade, calcTotal } = require("./sharedfiles/primary.js");
const { search, searchUser, confirm } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "removecar",
    aliases: ["rmvcar"],
    usage: "<username> | (optional) <amount> | <car name goes here>",
    args: 2,
    category: "Admin",
    description: "Removes one or more cars from someone's garage. (data transferring)",
    async execute(message, args) {
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
                    console.log(currentMessage);
                    await getCar(result.user, currentMessage);
                });
        }

        async function getCar(user, currentMessage) {
            const playerData = await profileModel.findOne({ userID: user.id });
            let carName;
            let amount = 1;
            if (isNaN(args[1]) || !args[2]) {
                carName = args.slice(1, args.length).map(i => i.toLowerCase());
            }
            else {
                amount = Math.ceil(parseInt(args[1]));
                carName = args.slice(2, args.length).map(i => i.toLowerCase());
            }

            const ownedCars = playerData.garage.map(c => c.carID);
            new Promise(resolve => resolve(search(message, carName, ownedCars, "car", currentMessage)))
                .then(async (hmm) => {
                    if (!Array.isArray(hmm)) return;
                    let [result, currentMessage] = hmm;
                    result = playerData.garage.find(c => c.carID === result);
                    await removeCar(user, result, amount, playerData, currentMessage);
                });
        }

        async function removeCar(user, currentCar, amount, playerData, currentMessage) {
            new Promise(resolve => resolve(selectUpgrade(message, currentCar, amount, currentMessage)))
                .then(async (upgrade) => {
                    if (isNaN(upgrade)) return;
                    const car = require(`./cars/${currentCar.carID}.json`);
                    const currentName = carNameGen(car, null, upgrade);
                    if (args[1].toLowerCase() === "all") {
                        amount = currentCar.upgrades[result];
                    }

                    const confirmationMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Are you sure you want to remove ${amount} of ${user.username}'s ${currentName} from their garage?`,
                        desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                        author: message.author,
                        thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                        image: car["card"]
                    });

                    await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);

                    async function acceptedFunction(currentMessage) {
                        if (playerData.hand) {
                            if (playerData.hand.carID === currentCar.carID) {
                                playerData.hand = { carID: "", upgrade: "000" };
                            }
                        }
                        for (let i = 0; i < playerData.decks.length; i++) {
                            let x = playerData.decks[i].hand.findIndex(c => c.carID === currentCar.carID && c.upgrade === upgrade);
                            if (x > -1) {
                                playerData.decks[i].hand[x] = "";
                                playerData.decks[i].tunes[x] = "000";
                            }
                        }

                        currentCar.upgrades[upgrade] -= amount;
                        if (calcTotal(currentCar) === 0) {
                            playerData.garage.splice(playerData.garage.indexOf(currentCar), 1);
                        }
                        await profileModel.updateOne({ userID: user.id }, {
                            garage: playerData.garage,
                            hand: playerData.hand,
                            decks: playerData.decks
                        });

                        const infoMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully removed ${amount} of ${user.username}'s ${currentName}!`,
                            desc: `Use \`cd-garage\` to check if the car has been removed from ${user.username}'s garage. If it hasn't, try running this command again.`,
                            author: message.author,
                            thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                            image: car["card"]
                        });
                        await infoMessage.sendMessage({ currentMessage });
                        return infoMessage.removeButtons();
                    }
                });
        }
    }
};