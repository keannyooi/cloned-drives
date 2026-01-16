"use strict";

const bot = require("../config/config.js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const tracks = readdirSync("./src/tracks").filter(file => file.endsWith(".json"));
const { InfoMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, moneyEmojiID, bossEmojiID } = require("../util/consts/consts.js");
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
        
        // Create a test button using ButtonBuilder (yellow/secondary color)
        const testButton = new ButtonBuilder()
            .setCustomId("test")
            .setLabel("Test Race")
            .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(yse, testButton, nop, skip);

        // Check if this is a boss round
        const isBossRound = streak === 50 || streak === 75 || streak === 100 || (streak > 100 && (streak - 100) % 5 === 0);
        
        const safeThumbnail =
            typeof track.map === "string" && track.map.startsWith("http")
                ? track.map
                : null;

        const intermission = new InfoMessage({
            channel: message.channel,
            title: isBossRound ? `${bot.emojis.cache.get(bossEmojiID)} BOSS ROUND!` : "Ready to Play?",
            desc: `Track: ${track.trackName}, Requirements: \`${reqDisplay(reqs, settings.filterlogic)}\`${isBossRound ? `\n\n**${bot.emojis.cache.get(bossEmojiID)} Defeat the boss for massive rewards!**` : ''}`,
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
                    case "test":
                        // 🧪 Test race - no consequences
                        if (!filterCheck({ car: hand, filter: reqs })) {
                            await button.reply({ content: "⚠️ Your hand does not meet the requirements for this race!", ephemeral: true });
                            processed = false;
                            return;
                        }

                        const testResult = await race(message, playerCar, opponentCar, track, settings.disablegraphics);
                        
                        let testMessage = "";
                        if (testResult > 0) {
                            testMessage = `🧪 **TEST RACE RESULT: WIN** ✅\nYou won by ${testResult} points!\n\n✨ This was a test - your streak and money are safe.`;
                        } else {
                            testMessage = `🧪 **TEST RACE RESULT: LOSS** ❌\nYou lost by ${Math.abs(testResult)} points.\n\n✨ This was a test - your streak is still ${streak}.`;
                        }
                        
                        testMessage += "\n\nWhat would you like to do?\n• Click **Race** to play this race for real\n• Click **Skip** to reset your streak to 0 and get a new opponent\n• Click **Cancel** to exit without racing";
                        
                        await button.reply({ content: testMessage, ephemeral: true });
                        processed = false; // Allow them to click another button
                        return;

                    case "yse":
                        reactionMessage?.removeButtons();

                        if (!filterCheck({ car: hand, filter: reqs })) {
                            intermission.editEmbed({ title: "Your hand does not meet the requirements." });
                            return intermission.sendMessage({ currentMessage: reactionMessage });
                        }

                        const result = await race(message, playerCar, opponentCar, track, settings.disablegraphics);

                        if (result > 0) {
                            streak++;

                            let reward = 0, crBonus = 0, crBonusBase = 0, bmBonus = 0, bossBonus = 0;

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

                            // CR Bonus
                            if (playerCar.cr - opponentCar.cr <= 30) {
                                crBonus = (opponentCar.cr - playerCar.cr + 40) * crBonusBase;
                            }

                            // BM Bonus
                            const subtotal = reward + crBonus;
                            if (playerCar.isBM) {
                                bmBonus = Math.round(subtotal / 4);
                            }

                            // 🎲 Random event bonuses (5% chance)
                            let eventBonus = 0;
                            let eventMessage = "";
                            if (Math.random() < 0.05 && streak >= 5) {
                                eventBonus = Math.floor(subtotal * 0.5);
                                eventMessage = `\n🌟 **LUCKY RACE!** +${bot.emojis.cache.get(moneyEmojiID)}${eventBonus.toLocaleString()}`;
                            }

                            // 💎 Tiered domination bonuses based on point difference
                            let perfectBonus = 0;
                            if (result >= 100) {
                                perfectBonus = Math.floor(subtotal * 0.5);
                                eventMessage += `\n💎 **TOTAL DOMINATION!** +${bot.emojis.cache.get(moneyEmojiID)}${perfectBonus.toLocaleString()}`;
                            } else if (result >= 50) {
                                perfectBonus = Math.floor(subtotal * 0.3);
                                eventMessage += `\n💎 **DOMINATION!** +${bot.emojis.cache.get(moneyEmojiID)}${perfectBonus.toLocaleString()}`;
                            } else if (result >= 20) {
                                perfectBonus = Math.floor(subtotal * 0.15);
                                eventMessage += `\n✨ **STRONG WIN!** +${bot.emojis.cache.get(moneyEmojiID)}${perfectBonus.toLocaleString()}`;
                            }

                            // ⚔️ Boss round bonus (streak has already been incremented)
                            if (isBossRound) {
                                if (streak === 51) {
                                    bossBonus = 1000000;
                                } else if (streak === 76) {
                                    bossBonus = 1500000;
                                } else if (streak === 101) {
                                    bossBonus = 2500000;
                                } else if (streak > 101 && (streak - 101) % 5 === 0) {
                                    bossBonus = 500000 + (Math.floor((streak - 101) / 5)) * 250000;
                                }
                                
                                eventMessage += `\n${bot.emojis.cache.get(bossEmojiID)} **BOSS DEFEATED!** +${bot.emojis.cache.get(moneyEmojiID)}${bossBonus.toLocaleString()}`;
                            }

                            // 🔥 Milestone bonuses
                            let milestoneBonus = 0;
                            if (streak === 10) {
                                milestoneBonus = 75000;
                                eventMessage += `\n🔥 **10-STREAK MILESTONE!** +${bot.emojis.cache.get(moneyEmojiID)}${milestoneBonus.toLocaleString()}`;
                            } else if (streak === 25) {
                                milestoneBonus = 250000;
                                eventMessage += `\n🔥 **25-STREAK MILESTONE!** +${bot.emojis.cache.get(moneyEmojiID)}${milestoneBonus.toLocaleString()}`;
                            } else if (streak === 150) {
                                milestoneBonus = 5000000;
                                eventMessage += `\n🔥 **150-STREAK MILESTONE!** +${bot.emojis.cache.get(moneyEmojiID)}${milestoneBonus.toLocaleString()}`;
                            } else if (streak === 200) {
                                milestoneBonus = 10000000;
                                eventMessage += `\n🔥 **200-STREAK MILESTONE!** +${bot.emojis.cache.get(moneyEmojiID)}${milestoneBonus.toLocaleString()}`;
                            }

                            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                            const totalEarned = subtotal + bmBonus + eventBonus + perfectBonus + bossBonus + milestoneBonus;
                            
                            const index = unclaimedRewards.findIndex(e => e.origin === "Random Races");

                            if (index > -1) {
                                unclaimedRewards[index].money += totalEarned;
                            } else {
                                unclaimedRewards.push({
                                    money: totalEarned,
                                    origin: "Random Races"
                                });
                            }

                            await message.channel.send(
                                `**You earned ${moneyEmoji}${reward.toLocaleString()} (+${moneyEmoji}${crBonus.toLocaleString()}${bmBonus ? ` +${moneyEmoji}${bmBonus.toLocaleString()}` : ""})!**${eventMessage}`
                            );
                        } else if (result < 0) {
                            // Loss penalty - keep more money at higher streaks
                            let keepPercentage = 0;
                            if (streak >= 100) keepPercentage = 0.75;
                            else if (streak >= 50) keepPercentage = 0.60;
                            else if (streak >= 25) keepPercentage = 0.51;
                            else keepPercentage = 0.49;
                            
                            streak = Math.floor(streak * keepPercentage);
                            
                            await message.channel.send(
                                `💥 You lost! Streak reduced to ${streak} (kept ${Math.floor(keepPercentage * 100)}%)`
                            );
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
            // Generate boss car when at boss streak
            const isBoss = streak === 50 || streak === 75 || streak === 100 || (streak > 100 && (streak - 100) % 5 === 0);
            
            do {
                opponentCarID = carFiles[Math.floor(Math.random() * carFiles.length)];
                opponentCar = require(`../cars/${opponentCarID}`);
                delete require.cache[require.resolve(`../cars/${opponentCarID}`)];
            } while (smartGen(opponentCar, isBoss));

            // Generate requirements based on streak
            let criteria = {};
            
            // Boss rounds have no CR requirements (allow any 1500+ CR car)
            if (!isBoss) {
                if (streak > 75 && streak <= 175) {
                    criteria.cr = {
                        start: 1,
                        end: opponentCar.cr + Math.floor(Math.random() * 6) + 30
                    };
                    let reqs = ["bodyStyle", "seatCount", "modelYear"];
                    let req = reqs[Math.floor(Math.random() * reqs.length)];
                    let reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                    
                    if (reqCar.reference) {
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
                } else if (streak > 175) {
                    criteria.cr = {
                        start: 1,
                        end: opponentCar.cr + Math.floor(Math.random() * 6) + 20
                    };
                    let reqs = ["make", "modelYear", "gc", "tags"];
                    let req = reqs[Math.floor(Math.random() * reqs.length)];
                    let reqCar = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
                    
                    if (reqCar.reference) {
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
            }

            // Upgrade selection
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

            await profileModel.updateOne(
                { userID: message.author.id },
                {
                    "$set": {
                        "rrStats.opponent": opponent,
                        "rrStats.trackID": trackID,
                        "rrStats.reqs": criteria
                    }
                }
            );
        }

        function smartGen(car, isBoss) {
            // Reject reference/BM cars
            if (car.reference) return true;
            
            // Get actual CR (handle missing CR values)
            const carCR = car.cr || 0;
            
            // Boss rounds: only allow CR 1500+ cars
            if (isBoss) {
                return carCR < 1500;
            }
            
            // Regular difficulty scaling
            if (streak <= 5) {
                return carCR > 499;
            } else if (streak > 5 && streak <= 15) {
                return carCR < 200 || carCR > 649;
            } else if (streak > 15 && streak <= 30) {
                return carCR < 300 || carCR > 649;
            } else if (streak > 30 && streak <= 49) {
                return carCR < 400 || carCR > 849;
            } else if (streak > 50 && streak <= 74) {
                return carCR < 549 || carCR > 990;
            } else if (streak > 75 && streak <= 99) {
                return carCR < 549;
            } else if (streak > 100 && streak <= 124) {
                return carCR < 799;
            } else if (streak > 125 && streak <= 175) {
                return carCR < 849;
            } else {
                return carCR < 949;
            }
        }
    }
};