"use strict";

const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const trackFiles = fs.readdirSync("./commands/tracks").filter(file => file.endsWith('.json'));
const { ErrorMessage, InfoMessage } = require("./sharedfiles/classes.js");
const { defaultWaitTime } = require("./sharedfiles/consts.js");
const { carNameGen, rarityCheck, selectUpgrade, race } = require("./sharedfiles/primary.js");
const { search, createCar } = require("./sharedfiles/secondary.js");
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
        const playerData = await profileModel.findOne({ userID: message.author.id });
        if (playerData.hand.carID === "") {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, it looks like your hand is empty.",
                desc: "Use `cd-sethand` to set a car as your hand.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        let query = args.map(i => i.toLowerCase()), searchBy = "track";
        if (args[0].toLowerCase() === "random") {
            return chooseOpponent(trackFiles[Math.floor(Math.random() * trackFiles.length)]);
        }
        else if (args[0].toLowerCase().startsWith("-t")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        new Promise(resolve => resolve(search(message, query, trackFiles, searchBy)))
            .then(async (hmm) => {
                if (!Array.isArray(hmm)) return;
                let [result, currentMessage] = hmm;
                try {
                    chooseOpponent(result, currentMessage);
                }
                catch (error) {
                    throw error;
                }
            });

        async function chooseOpponent(track, currentMessage) {
            const filter = response => response.author.id === message.author.id;
            const currentTrack = require(`./tracks/${track}`);
            const handCar = require(`./cars/${playerData.hand.carID}`);
            const chooseMessage = new InfoMessage({
                channel: message.channel,
                title: `${currentTrack["trackName"]} has been chosen!`,
                desc: `Choose a car to race with by typing out the name of the car.
				Your Hand: ${carNameGen({ currentCar: handCar, upgrade: playerData.hand.upgrade, rarity: rarityCheck(handCar) })}`,
                author: message.author,
                image: currentTrack["background"],
                thumbnail: currentTrack["map"],
                footer: `You have ${defaultWaitTime / 1000} seconds to consider.`
            });
            currentMessage = await chooseMessage.sendMessage({ currentMessage, preserve: true });

            try {
                let collected = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: defaultWaitTime,
                    errors: ["time"]
                });

                if (!message.channel.type.includes("DM")) {
                    collected.first().delete();
                }
                let query = collected.first().content.toLowerCase().split(" "), searchBy = "car";
                if (query[0].startsWith("-c")) {
                    query = [query[0].slice(1)];
                    searchBy = "id";
                }

                if (query[0].toLowerCase() === "random") {
                    selectTune(carFiles[Math.floor(Math.random() * carFiles.length)], currentTrack, currentMessage);
                }
                else {
                    new Promise(resolve => resolve(search(message, query, carFiles, searchBy, currentMessage)))
                        .then(async (response) => {
                            if (!Array.isArray(response)) return;
                            let [result, currentMessage] = response;
                            try {
                                selectTune(result, currentTrack, currentMessage);
                            }
                            catch (error) {
                                throw error;
                            }
                        });
                }
            }
            catch (error) {
                console.log(error);
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: "Action cancelled automatically.",
                    desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Act quicker next time.`,
                    author: message.author
                });
                return infoMessage.sendMessage({ currentMessage });
            }

            async function selectTune(opponent, currentTrack, currentMessage) {
                let chooseEverything = {
                    carID: opponent.slice(0, 6),
                    upgrades: {
                        "000": 1,
                        "333": 1,
                        "666": 1,
                        "699": 1,
                        "969": 1,
                        "996": 1,
                    }
                };

                new Promise(resolve => resolve(selectUpgrade(message, chooseEverything, 1, currentMessage)))
                    .then(async (response) => {
                        if (!Array.isArray(response)) return;
                        let [upgrade, currentMessage] = response;
                        const [playerCar, playerList] = createCar(playerData.hand, playerData.settings.unitpreference);
                        const [opponentCar, opponentList] = createCar({ carID: opponent.slice(0, 6), upgrade }, playerData.settings.unitpreference);
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
                        return race(message, playerCar, opponentCar, currentTrack, playerData.settings.disablegraphics);
                    });
            }
        }
    }
};