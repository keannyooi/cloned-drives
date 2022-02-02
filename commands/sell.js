"use strict";

const { SuccessMessage, InfoMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { defaultChoiceTime } = require("./sharedfiles/consts.js");
const { carNameGen, selectUpgrade, calcTotal, updateHands } = require("./sharedfiles/primary.js");
const { searchGarage, confirm } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "sell",
    aliases: ["s"],
    usage: ["[amount / 'all'] | <car name goes here>", "[amount / 'all'] | -<car ID>"],
    description: "Sells one or more cars from your garage.",
    args: 1,
    category: "Gameplay",
    async execute(message, args) {
        const playerData = await profileModel.findOne({ userID: message.author.id });
        if (playerData.garage.length <= 5) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, 5 or less cars detected in your garage.",
                desc: "The minimum amount of cars you are supposed to have is 5. This is to prevent people selling/fusing their entire garage early on and getting stuck.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        let query, amount = 1, startFrom, searchByID = false;
        if (args[0].toLowerCase() === "all" && args[1]) {
            startFrom = 1;
        }
        else if (isNaN(args[0]) || !args[1] || parseInt(args[0]) > 10) {
            startFrom = 0;
        }
        else {
            amount = Math.ceil(parseInt(args[0]));
            startFrom = 1;
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
            restrictedMode: true
        })))
            .then(async response => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                await sell(result, amount, playerData, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function sell(currentCar, amount, playerData, currentMessage) {
            await new Promise(resolve => resolve(selectUpgrade(message, currentCar, amount, currentMessage)))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [upgrade, currentMessage] = response;
                    const car = require(`./cars/${currentCar.carID}.json`);
                    const currentName = carNameGen({ currentCar: car, upgrade });
                    const moneyEmoji = bot.emojis.cache.get("726017235826770021");
                    if (args[0].toLowerCase() === "all") {
                        amount = currentCar.upgrades[upgrade];
                    }

                    let money, upgMultiplier = parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2]);
                    if (car["rq"] > 79) { //leggie
                        money = 200000 + (upgMultiplier * 4500);
                    }
                    else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
                        money = 77500 + (upgMultiplier * 3750);
                    }
                    else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
                        money = 27500 + (upgMultiplier * 3000);
                    }
                    else if (car["rq"] > 39 && car["rq"] <= 49) { //super
                        money = 7500 + (upgMultiplier * 2250);
                    }
                    else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
                        money = 1000 + (upgMultiplier * 1500);
                    }
                    else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
                        money = 500 + (upgMultiplier * 750);
                    }
                    else { //common
                        money = 200 + (upgMultiplier * 500);
                    }
                    money *= amount;

                    const confirmationMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Are you sure you want to sell ${amount} of your ${currentName} for ${moneyEmoji}${money}?`,
                        desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                        author: message.author,
                        image: car["card"]
                    });
                    
                    try {
                        await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);
                    }
                    catch (error) {
                        throw error;
                    }

                    async function acceptedFunction(currentMessage) {
                        let balance = playerData.money + money;
                        updateHands(playerData, currentCar.carID, upgrade, "remove");
                        currentCar.upgrades[upgrade] -= amount;
                        if (calcTotal(currentCar) === 0) {
                            playerData.garage.splice(playerData.garage.indexOf(currentCar), 1);
                        }
                        await profileModel.updateOne({ userID: message.author.id }, {
                            money: balance,
                            garage: playerData.garage,
                            hand: playerData.hand,
                            decks: playerData.decks
                        });

                        const infoMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully sold your ${currentName}!`,
                            desc: `You earned ${moneyEmoji}${money}!`,
                            author: message.author,
                            image: car["card"],
                            fields: [
                                { name: "Your Money Balance", value: `${moneyEmoji}${balance}` }
                            ]
                        });
                        await infoMessage.sendMessage({ currentMessage });
                        return infoMessage.removeButtons();
                    }
                });
        }
    }
};