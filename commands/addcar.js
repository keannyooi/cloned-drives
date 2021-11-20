"use strict";

const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { carNameGen } = require("./sharedfiles/primary.js");
const { search, searchUser } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "addcar",
    usage: "<username> | (optional) <amount> | <car name goes here>",
    args: 2,
    category: "Admin",
    description: "Adds a car into your garage. (data transferring)",
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
            availableUsers.filter(user => userSaves.find(f => f.userID === user.id));
            new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), availableUsers)))
                .then(async (hmm) => {
                    if (!Array.isArray(hmm)) return;
                    let [result, currentMessage] = hmm;
                    await getCar(result.user, currentMessage);
                });
        }

        async function getCar(user, currentMessage) {
            let carName;
            let amount = 1;
            if (isNaN(args[1]) || !args[2]) {
                carName = args.slice(1, args.length).map(i => i.toLowerCase());
            }
            else {
                amount = Math.ceil(parseInt(args[1]));
                carName = args.slice(2, args.length).map(i => i.toLowerCase());
            }
            if (amount < 1 || amount > 10) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, amount provided is invalid.",
                    desc: "The amount of cars added must be a positive number with a maximum limit of `10`.",
                    author: message.author
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }

            new Promise(resolve => resolve(search(message, carName, carFiles, "car", currentMessage)))
                .then(async (hmm) => {
                    if (!Array.isArray(hmm)) return;
                    let [result, currentMessage] = hmm;

                    const playerData = await profileModel.findOne({ userID: user.id });
                    const currentCar = require(`./cars/${result}`);
                    const currentName = carNameGen(currentCar);
                    const id = result.slice(0, 6);
                    const isInGarage = playerData.garage.findIndex(garageCar => garageCar.carID === id);
                    if (isInGarage !== -1) {
                        playerData.garage[isInGarage].upgrades["000"] += amount;
                    }
                    else {
                        playerData.garage.push({
                            carID: id,
                            upgrades: {
                                "000": amount,
                                "333": 0,
                                "666": 0,
                                "996": 0,
                                "969": 0,
                                "699": 0
                            }
                        });
                    }
                    await profileModel.updateOne({ userID: user.id }, { garage: playerData.garage });

                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully added ${amount} ${currentName} to ${user.username}'s garage!`,
                        desc: `Use \`cd-garage\` to check if the car has arrived at ${user.username}'s garage. If it hasn't, try running this command again.`,
                        author: message.author,
                        thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                        image: currentCar["card"]
                    });
                    return successMessage.sendMessage({ currentMessage });
                });
        }
    }
};