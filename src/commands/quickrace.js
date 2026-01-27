"use strict";

const bot = require("../config/config.js");
const { getCarFiles, getTrackFiles, getCar, getTrack } = require("../util/functions/dataManager.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { defaultWaitTime } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const race = require("../util/functions/race.js");
const search = require("../util/functions/search.js");
const createCar = require("../util/functions/createCar.js");
const handMissingError = require("../util/commonerrors/handMissingError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "quickrace",
    aliases: ["qr"],
    usage: ["<track name goes here>"],
    args: 1,
    category: "Gameplay",
    cooldown: 10,
    description: "Does a quick race where you can choose the trackset and the opponent car. Great for testing out cars.",
    async execute(message, args) {
        const carFiles = getCarFiles();
        const trackFiles = getTrackFiles();
        
        const { hand, settings } = await profileModel.findOne({ userID: message.author.id });
        if (hand.carID === "") {
            return handMissingError(message);
        }

        let query = args.map(i => i.toLowerCase()), searchBy = "track";
        if (args[0].toLowerCase() === "random") {
            const randomTrackFile = trackFiles[Math.floor(Math.random() * trackFiles.length)];
            const trackId = randomTrackFile.endsWith('.json') ? randomTrackFile.slice(0, -5) : randomTrackFile;
            return chooseOpponent(trackId);
        }
        else if (args[0].toLowerCase().startsWith("-t")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        await new Promise(resolve => resolve(search(message, query, trackFiles, searchBy)))
            .then(async response => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                // Result might be filename or ID, normalize it
                const trackId = result.endsWith('.json') ? result.slice(0, -5) : result;
                await chooseOpponent(trackId, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function chooseOpponent(trackId, currentMessage) {
            const filter = response => response.author.id === message.author.id;
            const currentTrack = getTrack(trackId);
            const handCar = getCar(hand.carID);
            const chooseMessage = new InfoMessage({
                channel: message.channel,
                title: `${currentTrack["trackName"]} has been chosen!`,
                desc: "Choose a car to race with by typing out the name of the car.",
                author: message.author,
                image: currentTrack["background"],
                thumbnail: currentTrack["map"],
                fields: [{ name: "Your Hand", value: carNameGen({ currentCar: handCar, upgrade: hand.upgrade, rarity: true }) }],
                footer: `You have ${defaultWaitTime / 1000} seconds to consider.`
            });
            currentMessage = await chooseMessage.sendMessage({ currentMessage, preserve: true });

            await message.channel.awaitMessages({
                filter,
                max: 1,
                time: defaultWaitTime,
                errors: ["time"]
            })
                .then(async collected => {
                    if (message.channel.type !== 1) {
                        collected.first().delete();
                    }
                    let query = collected.first().content.toLowerCase().split(" "), searchBy = "car";
                    if (query[0].startsWith("-c")) {
                        query = [query[0].slice(1)];
                        searchBy = "id";
                    }

                    if (query[0].toLowerCase() === "random") {
                        const randomCarFile = carFiles[Math.floor(Math.random() * carFiles.length)];
                        const carId = randomCarFile.endsWith('.json') ? randomCarFile.slice(0, -5) : randomCarFile;
                        selectTune(carId, currentTrack, currentMessage);
                    }
                    else {
                        await new Promise(resolve => resolve(search(message, query, carFiles, searchBy, currentMessage)))
                            .then(async response => {
                                if (!Array.isArray(response)) return;
                                let [result, currentMessage] = response;
                                // Result might be filename or ID, normalize it
                                const carId = result.endsWith('.json') ? result.slice(0, -5) : result;
                                await selectTune(carId, currentTrack, currentMessage);
                            });
                    }
                })
                .catch(error => {
                    if (error instanceof Error) {
                        throw error;
                    }
                    else {
                        const infoMessage = new InfoMessage({
                            channel: message.channel,
                            title: "Action cancelled automatically.",
                            desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Act quicker next time.`,
                            author: message.author
                        });
                        return infoMessage.sendMessage({ currentMessage });
                    }
                });
        }

        async function selectTune(opponentId, currentTrack, currentMessage) {
            let chooseEverything = {
                carID: opponentId,
                upgrades: {
                    "000": 1,
                    "333": 1,
                    "666": 1,
                    "699": 1,
                    "969": 1,
                    "996": 1,
                }
            };

            await new Promise(resolve => resolve(selectUpgrade({ message, currentCar: chooseEverything, amount: 1, currentMessage })))
                .then(async response => {
                    if (!Array.isArray(response)) return;
                    let [upgrade, currentMessage] = response;
                    const [playerCar, playerList] = createCar(hand, settings.unitpreference, settings.hideownstats);
                    const [opponentCar, opponentList] = createCar({ carID: opponentId, upgrade }, settings.unitpreference);
                    const intermission = new InfoMessage({
                        channel: message.channel,
                        title: "Ready to Play!",
                        desc: `Selected Trackset: ${currentTrack["trackName"]}`,
                        author: message.author,
                        thumbnail: currentTrack["map"],
                        fields: [
                            { name: "Your Hand", value: playerList, inline: true },
                            { name: "Opponent's Hand", value: opponentList, inline: true }
                        ]
                    });

                    await intermission.sendMessage({ currentMessage, preserve: true });
                    await race(message, playerCar, opponentCar, currentTrack, settings.disablegraphics);
                    return bot.deleteID(message.author.id);
                });
        }
    }
};
