"use strict";

const { SuccessMessage, InfoMessage } = require("./sharedfiles/classes.js");
const { defaultChoiceTime } = require("./sharedfiles/consts.js");
const { carNameGen, selectUpgrade, calcTotal } = require("./sharedfiles/primary.js");
const { searchGarage, confirm } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "fuse",
    aliases: ["f"],
    usage: "(optional) <amount> | <car name goes here>",
    args: 1,
    category: "Gameplay",
    description: "Converts one or more cars inside your garage into fuse tokens.",
    async execute(message, args) {
        const playerData = await profileModel.findOne({ userID: message.author.id });
        let query, amount = 1, startFrom, searchByID = false;
        if (args[0].toLowerCase() === "all" && args[1]) {
            startFrom = 1;
        }
        else if (isNaN(args[0]) || !args[1]) {
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

        new Promise(resolve => resolve(searchGarage({
            message,
            query,
            garage: playerData.garage,
            amount,
            searchByID,
            restrictedMode: true
        })))
            .then(async (hmm) => {
                if (!Array.isArray(hmm)) return;
                let [result, currentMessage] = hmm;
                try {
                    await fuse(result, amount, playerData, currentMessage);
                }
                catch (error) {
                    throw error;
                }
            });

        async function fuse(currentCar, amount, playerData, currentMessage) {
            new Promise(resolve => resolve(selectUpgrade(message, currentCar, amount, currentMessage)))
                .then(async (upgrade) => {
                    if (isNaN(upgrade)) return;
                    const car = require(`./cars/${currentCar.carID}.json`);
                    const currentName = carNameGen({ currentCar: car, upgrade });
                    const fuseEmoji = bot.emojis.cache.get("726018658635218955");
                    if (args[0].toLowerCase() === "all") {
                        amount = currentCar.upgrades[upgrade];
                    }

                    let fuseTokens = 10;
                    if (car["rq"] > 79) { //leggie
                        fuseTokens = 12500;
                    }
                    else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
                        fuseTokens = 2500;
                    }
                    else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
                        fuseTokens = 750;
                    }
                    else if (car["rq"] > 39 && car["rq"] <= 49) { //super
                        fuseTokens = 350;
                    }
                    else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
                        fuseTokens = 100;
                    }
                    else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
                        fuseTokens = 30;
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
                        if (playerData.hand?.carID === currentCar.carID) {
                            playerData.hand = { carID: "", upgrade: "000" };
                        }
                        for (let i = 0; i < playerData.decks.length; i++) {
                            let x = playerData.decks[i].hand.findIndex(c => c.carID === currentCar.carID && c.upgrade === upgrade);
                            if (x > -1) {
                                playerData.decks[i].hand[x] = "";
                                playerData.decks[i].tunes[x] = "000";
                            }
                        }

                        let balance = playerData.fuseTokens + fuseTokens;
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