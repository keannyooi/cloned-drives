"use strict";

const { MessageActionRow } = require("discord.js");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const tracks = fs.readdirSync("./commands/tracks").filter(file => file.endsWith(".json"));
const { ErrorMessage, InfoMessage } = require("./sharedfiles/classes.js");
const { defaultChoiceTime } = require("./sharedfiles/consts.js");
const { getButtons, race, handMissingError } = require("./sharedfiles/primary.js");
const { createCar } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "randomrace",
    aliases: ["rr"],
    usage: [],
    args: 0,
    category: "Testing", // actual category Gameplay
    description: "Does a random race where you are faced with a randomly generated opponent on a randomly generated track. May the RNG be with you.",
    async execute(message) {
        const playerData = await profileModel.findOne({ userID: message.author.id });
        if (playerData.hand.carID === "") {
            return handMissingError();
        }

        const filter = (button) => button.user.id === message.author.id;
        let { streak, highestStreak, opponent, trackID, reqs } = playerData.rrStats;
        let reqList = "";
        if (!carFiles.includes(`${opponent.carID}.json`) || (streak > 75 && reqs === {})) {
            await randomize();
        }

        for (let [key, value] of Object.entries(reqs)) {
            switch (typeof value) {
                case "object":
                    reqList += `\`${key}: ${value.start} ~ ${value.end}\`, `;
                    break;
                case "string":
                case "boolean":
                case "number":
                    if (key === "rq") {
                        reqList += `\`${key}: 1 ~ ${value}\`, `;
                    }
                    else {
                        reqList += `\`${key}: ${value}\`, `;
                    }
                    break;
                default:
                    break;
            }
        }
        if (reqList.length === 0) {
            reqList = "None";
        }
        else {
            reqList = reqList.slice(0, -2);
        }

        const track = require(`./tracks/${trackID}.json`);
        const [playerCar, playerList] = createCar(playerData.hand);
        const [opponentCar, opponentList] = createCar(opponent);
        const { yse, nop, skip } = getButtons("rr", playerData.settings.buttonstyle);
        const row = new MessageActionRow({ components: [yse, nop, skip] });

        const intermission = new InfoMessage({
            channel: message.channel,
            title: "Ready to Play?",
            desc: `Track: ${track["trackName"]}, Requirements: ${reqList}`,
            author: message.author,
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
                        let test = require(`./cars/${playerData.hand.carID}`), passed = true;
                        for (const [key, value] of Object.entries(reqs)) {
                            console.log(key, value);
                            switch (typeof value) {
                                case "object":
                                    if (test[`${key}`] < value.start || test[`${key}`] > value.end) {
                                        passed = false;
                                    }
                                    break;
                                case "string":
                                case "boolean":
                                    if (Array.isArray(test[`${key}`])) {
                                        if (test[`${key}`].find(e => e === value) === undefined) {
                                            passed = false;
                                        }
                                    }
                                    else {
                                        if (value.toLowerCase() !== test[`${key}`].toLowerCase()) {
                                            passed = false;
                                        }
                                    }
                                    break;
                                case "number":
                                    if (value < test[`${key}`]) {
                                        passed = false;
                                    }
                                    break;
                                default:
                                    break;
                            }
                        }
                        if (!passed) {
                            intermission.editEmbed({ title: "Your hand does not meet the requirements." });
                            return intermission.sendMessage({ currentMessage: reactionMessage });
                        }

                        const result = await race(message, playerCar, opponentCar, track, playerData.settings.enablegraphics);
                        if (result > 0) {
                            streak++;
                            let reward = 0, rqBonus = 0, rqBonusBase = 0;
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

                            const moneyEmoji = bot.emojis.cache.get("726017235826770021");
                            let hasEntry = playerData.unclaimedRewards.findIndex(entry => entry.origin === "Random Races");
                            if (hasEntry > -1) {
                                playerData.unclaimedRewards[hasEntry].money += reward + rqBonus;
                            }
                            else {
                                playerData.unclaimedRewards.push({
                                    money: reward + rqBonus,
                                    origin: "Random Races"
                                });   
                            }
                            message.channel.send(`**You have earned ${moneyEmoji}${reward} (+${moneyEmoji}${rqBonus} low RQ bonus)! Claim your reward using \`cd-rewards\`.**`);
                        }
                        else if (result < 0) {
                            streak = 0;
                        }

                        if (streak > highestStreak) {
                            highestStreak = streak;
                        }

                        await randomize();
                        await profileModel.updateOne({ userID: message.author.id }, {
                            "$inc": {
                                "rrStats.streak": 1,
                            },
                            "$set": {
                                "rrStats.highestStreak": highestStreak
                            },
                            unclaimedRewards: playerData.unclaimedRewards
                        });
                        return;
                    case "nop":
                        intermission.editEmbed({ title: "Action cancelled." });
                        return intermission.sendMessage({ currentMessage: reactionMessage });
                    case "skip":
                        streak = 0;
                        await randomize();
                        await profileModel.updateOne({ userID: message.author.id }, {
                            "$set": {
                                "rrStats.streak": 0,
                            },
                            unclaimedRewards: playerData.unclaimedRewards
                        });
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
            let track = require(`./tracks/${trackID}`);
            let offroad = Math.floor(Math.random() * 2);
            while ((track.surface === "Asphalt") != offroad) {
                track = require(`./tracks/${trackID}`);
                trackID = tracks[Math.floor(Math.random() * tracks.length)];
            }
            trackID = trackID.slice(0, 6);

            let opponentCarID = carFiles[Math.floor(Math.random() * carFiles.length)];
            let opponentCar = require(`./cars/${opponentCarID}`);
            let criteria = {};
            while (smartGen(opponentCar) === true) {
                opponentCarID = carFiles[Math.floor(Math.random() * carFiles.length)];
                opponentCar = require(`./cars/${opponentCarID}`);
            }

            if (streak > 75 && streak <= 100) {
                criteria = { rq: opponentCar["rq"] + Math.floor(Math.random() * 6) + 5 };
            }
            else if (streak > 100 && streak <= 125) {
                criteria = { rq: opponentCar["rq"] + Math.floor(Math.random() * 6) + 5 };
                let reqs = ["tyreType", "driveType", "enginePos"];
                let req = reqs[Math.floor(Math.random() * reqs.length)];
                let reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                if (reqCar[req].toLowerCase() === "Mixed") {
                    reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                }
                criteria[req] = reqCar[req];
            }
            else if (streak > 125 && streak <= 175) {
                criteria = { rq: opponentCar["rq"] + Math.floor(Math.random() * 6) };
                let reqs = ["modelYear", "seatCount", "bodyStyle"];
                let req = reqs[Math.floor(Math.random() * reqs.length)];
                switch (req) {
                    case "bodyStyle":
                    case "seatCount":
                        let reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                        criteria[req] = reqCar[req];
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
                criteria = { rq: opponentCar["rq"] + Math.floor(Math.random() * 6) };
                let reqs = ["make", "modelYear", "gc", "tags"];
                let req = reqs[Math.floor(Math.random() * reqs.length)];
                switch (req) {
                    case "make":
                    case "gc":
                    case "tags":
                        let reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                        if (Array.isArray(reqCar[req])) {
                            criteria[req] = reqCar[req][0];
                        }
                        else {
                            criteria[req] = reqCar[req];
                        }
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

            await profileModel.updateOne({ userID: message.author.id }, {
                "$set": {
                    "rrStats.opponent": { carID: opponentCarID.slice(0, 6), upgrade },
                    "rrStats.trackID": trackID,
                    "rrStats.reqs": {}
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