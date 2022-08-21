"use strict";

const bot = require("../config/config.js");
const { MessageActionRow } = require("discord.js");
const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const tracks = readdirSync("./src/tracks").filter(file => file.endsWith(".json"));
const { InfoMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, moneyEmojiID } = require("../util/consts/consts.js");
const getButtons = require("../util/functions/getButtons.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const race = require("../util/functions/race.js");
const createCar = require("../util/functions/createCar.js");
const filterCheck = require("../util/functions/filterCheck.js");
const handMissingError = require("../util/commonerrors/handMissingError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "randomrace",
    aliases: ["rr"],
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "Does a random race where you are faced with a randomly generated opponent on a randomly generated track. May the RNG be with you.",
    async execute(message) {
        const { hand, rrStats, settings, unclaimedRewards } = await profileModel.findOne({ userID: message.author.id });
        if (hand.carID === "") {
            return handMissingError(message);
        }

        let { streak, highestStreak, opponent, trackID, reqs } = rrStats;
        if (!carFiles.includes(`${opponent.carID}.json`) || (streak > 75 && reqs === {})) {
            await randomize();
        }

        const filter = (button) => button.user.id === message.author.id;
        const track = require(`../tracks/${trackID}.json`);
        const [playerCar, playerList] = createCar(hand, settings.unitpreference, settings.hideownstats);
        const [opponentCar, opponentList] = createCar(opponent, settings.unitpreference);
        const { yse, nop, skip } = getButtons("rr", settings.buttonstyle);
        const row = new MessageActionRow({ components: [yse, nop, skip] });
        const intermission = new InfoMessage({
            channel: message.channel,
            title: "Ready to Play?",
            desc: `Track: ${track["trackName"]}, Requirements: \`${reqDisplay(reqs, settings.filterlogic)}\``,
            author: message.author,
            thumbnail: track["map"],
            fields: [
                { name: "Your Hand", value: playerList, inline: true },
                { name: "Opponent's Hand", value: opponentList, inline: true }
            ],
            footer: `Current streak: ${streak} (Highest streak: ${highestStreak})`
        });

        let processed = false;
        const reactionMessage = await intermission.sendMessage({ buttons: [row], preserve: true });
        const collector = message.channel.createMessageComponentCollector({ filter, time: defaultChoiceTime });
        collector.on("collect", async (button) => {
            if (!processed) {
                processed = true;
                switch (button.customId) {
                    case "yse":
                        reactionMessage.removeButtons();
                        if (!filterCheck({ car: hand, filter: reqs })) {
                            intermission.editEmbed({ title: "Your hand does not meet the requirements." });
                            return intermission.sendMessage({ currentMessage: reactionMessage });
                        }

                        const result = await race(message, playerCar, opponentCar, track, settings.disablegraphics);
                        if (result > 0) {
                            streak++;
                            let reward = 0, rqBonus = 0, rqBonusBase = 0, bmBonus = 0;
                            if (streak <= 58) {
                                reward = streak * 500 + 1000;
                                rqBonusBase = 100;
                            }
                            else if (streak > 58 && streak <= 98) {
                                reward = streak * 250 + 30000;
                                rqBonusBase = 500;
                            }
                            else if (streak > 98 && streak <= 198) {
                                reward = streak * 200 + 50000;
                                rqBonusBase = 1000;
                            }
                            else {
                                reward = streak * 100 + 100000;
                                rqBonusBase = 5000;
                            }
                            if (playerCar.rq - opponentCar.rq <= 3) {
                                rqBonus = (opponentCar.rq - playerCar.rq + 4) * rqBonusBase;
                            }

                            let subtotal = reward + rqBonus
                            if (playerCar.isBM) {
                                bmBonus = Math.round(subtotal / 4);
                            }

                            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                            let hasEntry = unclaimedRewards.findIndex(entry => entry.origin === "Random Races");
                            if (hasEntry > -1) {
                                unclaimedRewards[hasEntry].money += subtotal + bmBonus;
                            }
                            else {
                                unclaimedRewards.push({
                                    money: subtotal + bmBonus,
                                    origin: "Random Races"
                                });
                            }
                            message.channel.send(`**You have earned ${moneyEmoji}${reward} (+${moneyEmoji}${rqBonus} low RQ bonus${bmBonus !== 0 ? ` and ${moneyEmoji}${bmBonus} black market car bonus` : ""})! Claim your reward using \`cd-rewards\`.**`);
                        }
                        else if (result < 0) {
                            streak = 0;
                        }
                        if (streak > highestStreak) {
                            highestStreak = streak;
                        }

                        await Promise.all([
                            randomize(),
                            profileModel.updateOne({ userID: message.author.id }, {
                                "$set": {
                                    "rrStats.streak": streak,
                                    "rrStats.highestStreak": highestStreak
                                },
                                unclaimedRewards
                            })
                        ]);
                        return bot.deleteID(message.author.id);
                    case "nop":
                        intermission.editEmbed({ title: "Action cancelled." });
                        return intermission.sendMessage({ currentMessage: reactionMessage });
                    case "skip":
                        streak = 0;
                        await Promise.all([
                            randomize(),
                            profileModel.updateOne({ userID: message.author.id }, {
                                "$set": {
                                    "rrStats.streak": 0,
                                },
                                unclaimedRewards: unclaimedRewards
                            })
                        ]);
                        const skipMessage = new InfoMessage({
                            channel: message.channel,
                            title: "Successfully skipped race.",
                            desc: "Your win streak has been reset.",
                            author: message.author
                        });
                        return skipMessage.sendMessage({ currentMessage: reactionMessage });
                    default:
                        break;
                }
            }
        });
        collector.on("end", () => {
            if (!processed) {
                intermission.editEmbed({ title: "Action cancelled automatically." });
                return intermission.sendMessage({ currentMessage: reactionMessage });
            }
        });

        async function randomize() {
            trackID = tracks[Math.floor(Math.random() * tracks.length)];
            let track = require(`../tracks/${trackID}`);
            let offroad = Math.floor(Math.random() * 2);
            while ((track.surface === "Asphalt") != offroad) {
                track = require(`../tracks/${trackID}`);
                trackID = tracks[Math.floor(Math.random() * tracks.length)];
            }
            trackID = trackID.slice(0, 6);

            let opponentCarID = carFiles[Math.floor(Math.random() * carFiles.length)];
            let opponentCar = require(`../cars/${opponentCarID}`);
            let criteria = {};
            while (opponentCar["reference"] || smartGen(opponentCar) === true) {
                opponentCarID = carFiles[Math.floor(Math.random() * carFiles.length)];
                opponentCar = require(`../cars/${opponentCarID}`);
            }

            if (streak > 75 && streak <= 100) {
                criteria.rq = {
                    start: 1,
                    end: opponentCar["rq"] + Math.floor(Math.random() * 6) + 5
                };
            }
            else if (streak > 100 && streak <= 125) {
                criteria.rq = {
                    start: 1,
                    end: opponentCar["rq"] + Math.floor(Math.random() * 6) + 5
                };
                let reqs = ["tyreType", "driveType", "enginePos"];
                let req = reqs[Math.floor(Math.random() * reqs.length)];
                let reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                if (reqCar["reference"]) {
                    reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                }
                criteria[req] = reqCar[req].toLowerCase();
            }
            else if (streak > 125 && streak <= 175) {
                criteria.rq = {
                    start: 1,
                    end: opponentCar["rq"] + Math.floor(Math.random() * 6) + 2
                };
                let reqs = ["modelYear", "seatCount", "bodyStyle"];
                let req = reqs[Math.floor(Math.random() * reqs.length)];
                let reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                if (reqCar["reference"]) {
                    reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                }
                switch (req) {
                    case "bodyStyle":
                        criteria[req] = Array.isArray(reqCar[req]) ? [reqCar[req][0].toLowerCase()] : [reqCar[req].toLowerCase()];
                        break;
                    case "seatCount":
                        criteria[req] = { start: reqCar[req], end: reqCar[req] + 1 };
                        break;
                    case "modelYear":
                        let myStart = 1960 + (Math.floor(Math.random() * 6) * 10);
                        criteria[req] = { start: myStart, end: myStart + 10 };
                        break;
                    default:
                        break;
                }
            }
            else if (streak > 175) {
                criteria.rq = {
                    start: 1,
                    end: opponentCar["rq"] + Math.floor(Math.random() * 6) + 2
                };
                let reqs = ["make", "modelYear", "gc", "tags"];
                let req = reqs[Math.floor(Math.random() * reqs.length)];
                let reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                if (reqCar["reference"]) {
                    reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                }
                switch (req) {
                    case "make":
                    case "tags":
                        criteria[req] = Array.isArray(reqCar[req]) ? [reqCar[req][0].toLowerCase()] : [reqCar[req].toLowerCase()];
                        break;
                    case "gc":
                        criteria[req] = reqCar[req].toLowerCase();
                        break;
                    case "modelYear":
                        let myStart = 1960 + (Math.floor(Math.random() * 12) * 5);
                        criteria[req] = { start: myStart, end: myStart + 5 };
                        break;
                    default:
                        break;
                }
            }

            const upgradeIndex = Math.floor(Math.random() * 6);
            let upgrade = "000";
            switch (upgradeIndex) {
                case 0:
                    break;
                case 1:
                    upgrade = "333";
                    break;
                case 2:
                    upgrade = "666";
                    break;
                case 3:
                    upgrade = "699";
                    break;
                case 4:
                    upgrade = "969";
                    break;
                case 5:
                    upgrade = "996";
                    break;
                default:
                    break;
            }
            opponent = { carID: opponentCarID.slice(0, 6), upgrade };

            await profileModel.updateOne({ userID: message.author.id }, {
                "$set": {
                    "rrStats.opponent": opponent,
                    "rrStats.trackID": trackID,
                    "rrStats.reqs": criteria
                }
            });
        }

        function smartGen(car) {
            if (streak <= 5) {
                return car["isPrize"] === true || car["rq"] > 49;
            }
            else if (streak > 5 && streak <= 15) {
                return car["isPrize"] === true || car["rq"] < 20 || car["rq"] > 64;
            }
            else if (streak > 15 && streak <= 30) {
                return car["isPrize"] === true || car["rq"] < 30 || car["rq"] > 64;
            }
            else if (streak > 30 && streak <= 50) {
                return car["isPrize"] === true || car["rq"] < 40 || car["rq"] > 79;
            }
            else if (streak > 50 && streak <= 75) {
                return car["isPrize"] === true || car["rq"] < 50 || car["rq"] > 90;
            }
            else if (streak > 75 && streak <= 125) {
                return car["rq"] < 50;
            }
            else if (streak > 125 && streak <= 175) {
                return car["rq"] < 65;
            }
            else {
                return car["rq"] < 80;
            }
        }
    }
};