"use strict";

const { SuccessMessage } = require("./sharedfiles/classes.js");
const { carNameGen, selectUpgrade } = require("./sharedfiles/primary.js");
const { searchGarage } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "sethand",
    aliases: ["sh"],
    usage: ["<car name>", "-<car ID>"],
    args: 1,
    category: "Configuration",
    description: "Sets your hand for quick race, random race and event gamemodes.",
    async execute(message, args) {
        const { garage } = await profileModel.findOne({ userID: message.author.id });
        if (args[0].toLowerCase() === "random") {
            let randomCar = garage[Math.floor(Math.random() * garage.length)];
            let randomTune = Object.keys(randomCar.upgrades).filter(u => randomCar.upgrades[u] > 0);
            await setHand(randomCar, randomTune[Math.floor(Math.random() * randomTune.length)]);
        }
        else {
            let query, searchByID = false;
            if (args[0].toLowerCase().startsWith("-c")) {
                query = [args[0].toLowerCase().slice(1)];
                searchByID = true;
            }
            else {
                query = args.map(i => i.toLowerCase());
            }

            await new Promise(resolve => resolve(searchGarage({
                message,
                query,
                garage,
                amount: 1,
                searchByID
            })))
                .then(response => {
                    if (!Array.isArray(response)) return;
                    chooseTune(...response);
                })
                .catch(error => {
                    throw error;
                });
        }

        function chooseTune(currentCar, currentMessage) {
            new Promise(resolve => resolve(selectUpgrade(message, currentCar, 1, currentMessage)))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    await setHand(currentCar, ...response)
                })
                .catch(error => {
                    throw error;
                });
        }

        async function setHand(currentCar, upgrade, currentMessage) {
            const car = require(`./cars/${currentCar.carID}`);
            const currentName = carNameGen({ currentCar: car, upgrade });
            await profileModel.updateOne({ userID: message.author.id }, {
                hand: {
                    carID: currentCar.carID,
                    upgrade: upgrade
                }
            });

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully set your ${currentName} as your quick race, random race and event hand!`,
                author: message.author,
                image: car[`racehud${upgrade}`]
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};