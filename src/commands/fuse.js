"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, fuseEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const calcTotal = require("../util/functions/calcTotal.js");
const updateHands = require("../util/functions/updateHands.js");
const searchGarage = require("../util/functions/searchGarage.js");
const confirm = require("../util/functions/confirm.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "fuse",
    aliases: ["f"],
    usage: ["[amount / 'all'] | <car name goes here>", "[amount / 'all'] | -<car ID>"],
    args: 1,
    category: "Gameplay",
    description: "Converts one or more cars inside your garage into fuse tokens.",
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
        else if (isNaN(args[0]) || !args[1] || parseInt(args[0]) > 30) {
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
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                await fuse(result, amount, playerData, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function fuse(currentCar, amount, playerData, currentMessage) {
            await new Promise(resolve => resolve(selectUpgrade({ message, currentCar, amount, currentMessage, targetUpgrade: "699" })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [upgrade, currentMessage] = response;
                    const car = require(`../cars/${currentCar.carID}.json`);
                    const currentName = carNameGen({ currentCar: car, upgrade });
                    const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
                    if (args[0].toLowerCase() === "all") {
                        amount = currentCar.upgrades[upgrade];
                    }

                    let fuseTokens = 10, upgMultiplier = parseInt(upgrade[0]) / 3;
                    if (car["rq"] > 79) { //leggie
                        fuseTokens = 12500 + (upgMultiplier * 12500);
                    }
                    else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
                        fuseTokens = 2500 + (upgMultiplier * 2500);
                    }
                    else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
                        fuseTokens = 750 + (upgMultiplier * 750);
                    }
                    else if (car["rq"] > 39 && car["rq"] <= 49) { //super
                        fuseTokens = 350 + (upgMultiplier * 350);
                    }
                    else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
                        fuseTokens = 100 + (upgMultiplier * 100);
                    }
                    else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
                        fuseTokens = 30 + (upgMultiplier * 30);
                    }
                    else { //common
                        fuseTokens = 10 + (upgMultiplier * 10);
                    }
                    fuseTokens *= amount;

                    const confirmationMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Are you sure you want to fuse ${amount} of your ${currentName} for ${fuseEmoji}${fuseTokens}?`,
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
                        let balance = playerData.fuseTokens + fuseTokens;
                        updateHands(playerData, currentCar.carID, upgrade, "remove");
                        currentCar.upgrades[upgrade] -= amount;
                        if (calcTotal(currentCar) === 0) {
                            playerData.garage.splice(playerData.garage.indexOf(currentCar), 1);
                        }
                        await profileModel.updateOne({ userID: message.author.id }, {
                            fuseTokens: balance,
                            garage: playerData.garage,
                            hand: playerData.hand,
                            decks: playerData.decks
                        });

                        const infoMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully fused your ${currentName}!`,
                            desc: `You earned ${fuseEmoji}${fuseTokens}!`,
                            author: message.author,
                            image: car["card"],
                            fields: [
                                { name: "Your Fuse Tokens", value: `${fuseEmoji}${balance}` }
                            ]
                        });
                        await infoMessage.sendMessage({ currentMessage });
                        return infoMessage.removeButtons();
                    }
                });
        }
    }
};