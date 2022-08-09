"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith('.json'));
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const carNameGen = require("../util/functions/carNameGen.js");
const addCars = require("../util/functions/addCars.js");
const search = require("../util/functions/search.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "addcar",
    usage: ["<username> [amount] <car name>"],
    args: 2,
    category: "Admin",
    description: "Adds a car into your garage.",
    async execute(message, args) {
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
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await getCar(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
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
            if (amount < 1 || amount > 30) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, amount provided is invalid.",
                    desc: "The amount of cars added must be a positive number not more than `30`.",
                    author: message.author
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }

            await new Promise(resolve => resolve(search(message, carName, carFiles, "carWithBM", currentMessage)))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;

                    const { garage } = await profileModel.findOne({ userID: user.id });
                    const currentCar = require(`../cars/${result}`);
                    const currentName = carNameGen({ currentCar });

                    let addedCars = [];
                    for (let i = 0; i < amount; i++) {
                        addedCars.push({ carID: result.slice(0, 6), upgrade: "000" });
                    }
                    await profileModel.updateOne({ userID: user.id }, { garage: addCars(garage, addedCars) });

                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully added ${amount} ${currentName} to ${user.username}'s garage!`,
                        desc: `Use \`cd-garage\` to check if the car has arrived at ${user.username}'s garage. If it hasn't, try running this command again.`,
                        author: message.author,
                        thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                        image: currentCar["card"]
                    });
                    return successMessage.sendMessage({ currentMessage });
                })
                .catch(error => {
                    throw error;
                })
        }
    }
};