"use strict";

const bot = require("../config/config.js");
const { ActionRowBuilder } = require("discord.js");
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
    description: "Does a random race where you are faced with a randomly generated opponent on a randomly generated track.",
    async execute(message) {
        const profile = await profileModel.findOne({ userID: message.author.id });
        if (!profile) return;

        const { hand, rrStats, settings, unclaimedRewards } = profile;
        if (hand.carID === "") {
            return handMissingError(message);
        }

        let { streak, highestStreak, opponent, trackID, reqs } = rrStats;

        if (!carFiles.includes(`${opponent.carID}.json`) || (streak > 75 && Object.keys(reqs || {}).length === 0)) {
            await randomize();
        }

        const filter = (button) => button.user.id === message.author.id;
        const track = require(`../tracks/${trackID}.json`);

        const [playerCar, playerList] = createCar(hand, settings.unitpreference, settings.hideownstats);
        const [opponentCar, opponentList] = createCar(opponent, settings.unitpreference);

        const { yse, nop, skip } = getButtons("rr", settings.buttonstyle);
        const row = new ActionRowBuilder().addComponents(yse, nop, skip);

        // ✅ SAFE thumbnail (prevents undici crash)
        const safeThumbnail =
            typeof track.map === "string" && track.map.startsWith("http")
                ? track.map
                : null;

        const intermission = new InfoMessage({
            channel: message.channel,
            title: "Ready to Play?",
            desc: `Track: ${track.trackName}, Requirements: \`${reqDisplay(reqs, settings.filterlogic)}\``,
            author: message.author,
            thumbnail: safeThumbnail,
            fields: [
                { name: "Your Hand", value: playerList, inline: true },
                { name: "Opponent's Hand", value: opponentList, inline: true }
            ],
            footer: `Current streak: ${streak} (Highest streak: ${highestStreak})`
        });

        let reactionMessage;
        try {
            reactionMessage = await intermission.sendMessage({ buttons: [row], preserve: true });
        } catch (err) {
            console.error("Failed to send intermission message:", err);
            return;
        }

        let processed = false;
        const collector = message.channel.createMessageComponentCollector({ filter, time: defaultChoiceTime });

        collector.on("collect", async (button) => {
            if (processed) return;
            processed = true;

            try {
                switch (button.customId) {
                    case "yse":
                        reactionMessage?.removeButtons();

                        if (!filterCheck({ car: hand, filter: reqs })) {
                            intermission.editEmbed({ title: "Your hand does not meet the requirements." });
                            return intermission.sendMessage({ currentMessage: reactionMessage });
                        }

                        const result = await race(message, playerCar, opponentCar, track, settings.disablegraphics);

                        if (result > 0) {
                            streak++;

                            let reward = 0, crBonus = 0, crBonusBase = 0, bmBonus = 0;

                            if (streak <= 49) {
                                reward = streak * 375 + 15000;
                                crBonusBase = 375;
                            } else if (streak <= 98) {
                                reward = streak * 250 + 27000;
                                crBonusBase = 1000;
                            } else if (streak <= 198) {
                                reward = streak * 100 + 100000;
                                crBonusBase = 5000;
                            } else {
                                reward = streak * 100 + 125000;
                                crBonusBase = 50000;
                            }

                            reward *= 2;

                            if (playerCar.cr - opponentCar.cr <= 30) {
                                crBonus = (opponentCar.cr - playerCar.cr + 40) * crBonusBase;
                            }

                            const subtotal = reward + crBonus;
                            if (playerCar.isBM) {
                                bmBonus = Math.round(subtotal / 4);
                            }

                            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                            const index = unclaimedRewards.findIndex(e => e.origin === "Random Races");

                            if (index > -1) {
                                unclaimedRewards[index].money += subtotal + bmBonus;
                            } else {
                                unclaimedRewards.push({
                                    money: subtotal + bmBonus,
                                    origin: "Random Races"
                                });
                            }

                            await message.channel.send(
                                `**You earned ${moneyEmoji}${reward} (+${moneyEmoji}${crBonus}${bmBonus ? ` +${moneyEmoji}${bmBonus}` : ""})!**`
                            );
                        } else if (result < 0) {
                            streak = Math.floor(streak * 0.49);
                        }

                        if (streak > highestStreak) highestStreak = streak;

                        await Promise.all([
                            randomize(),
                            profileModel.updateOne(
                                { userID: message.author.id },
                                {
                                    "$set": {
                                        "rrStats.streak": streak,
                                        "rrStats.highestStreak": highestStreak
                                    },
                                    unclaimedRewards
                                }
                            )
                        ]);

                        return bot.deleteID(message.author.id);

                    case "nop":
                        intermission.editEmbed({ title: "Action cancelled." });
                        return intermission.sendMessage({ currentMessage: reactionMessage });

                    case "skip":
                        streak = 0;
                        await Promise.all([
                            randomize(),
                            profileModel.updateOne(
                                { userID: message.author.id },
                                {
                                    "$set": { "rrStats.streak": 0 },
                                    unclaimedRewards
                                }
                            )
                        ]);

                        const skipMessage = new InfoMessage({
                            channel: message.channel,
                            title: "Successfully skipped race.",
                            desc: "Your win streak has been reset.",
                            author: message.author
                        });

                        return skipMessage.sendMessage({ currentMessage: reactionMessage });
                }
            } catch (err) {
                console.error("Randomrace interaction error:", err);
            }
        });

        collector.on("end", () => {
            if (!processed) {
                intermission.editEmbed({ title: "Action cancelled automatically." });
                intermission.sendMessage({ currentMessage: reactionMessage }).catch(() => {});
            }
        });

        async function randomize() {
            trackID = tracks[Math.floor(Math.random() * tracks.length)];
            trackID = trackID.slice(0, 6);

            let opponentCarID, opponentCar;
            do {
                opponentCarID = carFiles[Math.floor(Math.random() * carFiles.length)];
                opponentCar = require(`../cars/${opponentCarID}`);
            } while (opponentCar.reference || smartGen(opponentCar));

            opponent = { carID: opponentCarID.slice(0, 6), upgrade: "000" };

            await profileModel.updateOne(
                { userID: message.author.id },
                {
                    "$set": {
                        "rrStats.opponent": opponent,
                        "rrStats.trackID": trackID,
                        "rrStats.reqs": {}
                    }
                }
            );
        }

        function smartGen(car) {
            return car.isPrize === true;
        }
    }
};
