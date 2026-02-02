"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { ErrorMessage, InfoMessage, SuccessMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, sandboxRoleID } = require("../util/consts/consts.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const createCar = require("../util/functions/createCar.js");
const confirm = require("../util/functions/confirm.js");
const filterCheck = require("../util/functions/filterCheck.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const listRewards = require("../util/functions/listRewards.js");
const race = require("../util/functions/race.js");
const search = require("../util/functions/search.js");
const handMissingError = require("../util/commonerrors/handMissingError.js");
const profileModel = require("../models/profileSchema.js");
const calendarModel = require("../models/calendarSchema.js");

module.exports = {
    name: "playcalendar",
    aliases: ["pcal"],
    usage: ["<calendar name>", "<calendar name> <day number>"],
    args: 1,
    category: "Gameplay",
    cooldown: 10,
    description: "Play a calendar event day. Plays the next incomplete unlocked day, or specify a day number.",
    async execute(message, args) {
        const calendars = await calendarModel.find();
        const { hand, unclaimedRewards, settings } = await profileModel.findOne({ userID: message.author.id });
        
        if (hand.carID === "") {
            return handMissingError(message);
        }
        
        // Check if last arg is a day number
        let requestedDay = null;
        if (args.length > 1 && !isNaN(args[args.length - 1])) {
            requestedDay = parseInt(args.pop());
        }
        
        const query = args.map(i => i.toLowerCase());
        
        await new Promise(resolve => resolve(search(message, query, calendars, "calendar")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                const [calendar, currentMessage] = response;
                await playCalendar(calendar, requestedDay, currentMessage);
            })
            .catch(error => {
                throw error;
            });
        
        async function playCalendar(calendar, requestedDay, currentMessage) {
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            
            // Check sandbox role
            if (guildMember.roles.cache.has(sandboxRoleID)) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this is not available for Sandbox Alts.",
                    desc: `Unfortunately this command is not available for accounts with the <@&${sandboxRoleID}> role.`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            
            // Check if calendar is active
            if (!calendar.isActive && !guildMember.roles.cache.has(eventMakerRoleID)) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this calendar is not active.",
                    desc: `You may only play this calendar if you're an <@&${eventMakerRoleID}>.`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            
            // Check if deadline has passed
            if (calendar.isActive && calendar.deadline && calendar.deadline !== "unlimited") {
                const deadlineDate = DateTime.fromISO(calendar.deadline);
                if (DateTime.now() > deadlineDate) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, this calendar has ended.",
                        desc: "The deadline for this calendar has passed. You can no longer play.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
            }
            
            // Get current day and player progress
            const currentDay = getCurrentDay(calendar);
            const progress = calendar.playerProgress[message.author.id] || {
                completedDays: [],
                currentStreak: 0,
                longestStreak: 0,
                lastCompletedDay: 0,
                lastPlayedDate: null
            };
            const completedDays = progress.completedDays || [];
            
            // Determine which day to play
            let dayToPlay;
            
            if (requestedDay !== null) {
                // Player specified a day
                if (requestedDay < 1 || requestedDay > calendar.days.length) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, invalid day number.",
                        desc: `This calendar has days 1 through ${calendar.days.length}.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                
                if (requestedDay > currentDay && !guildMember.roles.cache.has(eventMakerRoleID)) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, this day is not yet unlocked.",
                        desc: `Day ${requestedDay} unlocks in ${requestedDay - currentDay} day${requestedDay - currentDay > 1 ? "s" : ""}.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                
                if (completedDays.includes(requestedDay)) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, you have already completed this day.",
                        desc: `Try another day or wait for new days to unlock.`,
                        author: message.author,
                        fields: [{ name: "Completed Days", value: completedDays.sort((a, b) => a - b).join(", ") || "None" }]
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                
                dayToPlay = requestedDay;
            } else {
                // Find next incomplete unlocked day
                const unlockedDays = [];
                for (let i = 1; i <= currentDay; i++) {
                    if (!completedDays.includes(i)) {
                        unlockedDays.push(i);
                    }
                }
                
                if (unlockedDays.length === 0) {
                    // All unlocked days completed
                    if (currentDay >= calendar.days.length) {
                        const successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: "🏆 Congratulations! You've completed all days!",
                            desc: `You finished the ${calendar.name} calendar!`,
                            author: message.author,
                            fields: [
                                { name: "Days Completed", value: `${completedDays.length}/${calendar.days.length}`, inline: true },
                                { name: "Longest Streak", value: `${progress.longestStreak || 0} days`, inline: true }
                            ]
                        });
                        return successMessage.sendMessage({ currentMessage });
                    } else {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "All unlocked days completed!",
                            desc: `Day ${currentDay + 1} unlocks tomorrow at ${calendar.unlockTime} UTC.`,
                            author: message.author,
                            fields: [
                                { name: "Completed", value: `${completedDays.length}/${calendar.days.length} days`, inline: true },
                                { name: "Current Streak", value: `${progress.currentStreak || 0} days`, inline: true }
                            ]
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                }
                
                // Play the earliest incomplete day
                dayToPlay = Math.min(...unlockedDays);
            }
            
            // Get the day data
            const dayData = calendar.days.find(d => d.day === dayToPlay);
            if (!dayData) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, day data not found.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            
            // Check requirements
            if (!filterCheck({ car: hand, filter: dayData.reqs, applyOrLogic: true })) {
                const currentCar = getCar(hand.carID);
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, your hand does not meet the day's requirements.",
                    desc: `**Day ${dayToPlay} Requirements:** \`${reqDisplay(dayData.reqs)}\`\n**Current Hand:** ${carNameGen({ currentCar, rarity: true, upgrade: hand.upgrade })}`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            
            // Set up the race
            const track = getTrack(dayData.track);
            const [playerCar, playerList] = createCar(hand, settings.unitpreference, settings.hideownstats);
            const [opponentCar, opponentList] = createCar(dayData, settings.unitpreference);
            
            const intermission = new InfoMessage({
                channel: message.channel,
                title: `📅 ${calendar.name} - Day ${dayToPlay}`,
                desc: `Track: ${track?.trackName || "Unknown"}\nRequirements: \`${reqDisplay(dayData.reqs)}\`\n\nReward: ${listRewards(dayData.rewards) || "None"}`,
                author: message.author,
                thumbnail: track?.map,
                fields: [
                    { name: "Your Hand", value: playerList, inline: true },
                    { name: "Opponent's Hand", value: opponentList, inline: true }
                ],
                footer: `Day ${dayToPlay} of ${calendar.days.length} • ${completedDays.length} days completed`
            });
            
            await confirm(message, intermission, acceptedFunction, settings.buttonstyle, currentMessage);
            
            async function acceptedFunction(currentMessage) {
                // Check if deadline passed while confirming
                if (calendar.isActive && calendar.deadline && calendar.deadline !== "unlimited") {
                    const deadlineDate = DateTime.fromISO(calendar.deadline);
                    if (DateTime.now() > deadlineDate) {
                        intermission.editEmbed({ title: "Looks like this calendar just ended.", desc: "The deadline passed while you were deciding." });
                        return intermission.sendMessage({ currentMessage });
                    }
                }
                
                currentMessage.removeButtons();
                const result = await race(message, playerCar, opponentCar, track, settings.enablegraphics);
                
                if (result > 0) {
                    // Victory!
                    const now = DateTime.now();
                    const today = now.toFormat("yyyy-MM-dd");
                    
                    // Update completed days
                    if (!completedDays.includes(dayToPlay)) {
                        completedDays.push(dayToPlay);
                    }
                    
                    // Calculate streak
                    let newStreak = progress.currentStreak || 0;
                    const lastPlayedDate = progress.lastPlayedDate;
                    
                    if (lastPlayedDate) {
                        const lastPlayed = DateTime.fromISO(lastPlayedDate);
                        const daysSinceLastPlay = Math.floor(now.diff(lastPlayed, "days").days);
                        
                        if (daysSinceLastPlay <= 1) {
                            // Consecutive day - increment streak
                            newStreak += 1;
                        } else {
                            // Streak broken - reset to 1
                            newStreak = 1;
                        }
                    } else {
                        // First play
                        newStreak = 1;
                    }
                    
                    const newLongestStreak = Math.max(progress.longestStreak || 0, newStreak);
                    
                    // Process rewards
                    const rewards = dayData.rewards || {};
                    for (const [key, value] of Object.entries(rewards)) {
                        switch (key) {
                            case "money":
                            case "fuseTokens":
                            case "trophies":
                                let hasEntry = unclaimedRewards.findIndex(entry => 
                                    entry.origin === `${calendar.name} (Day ${dayToPlay})` && entry[key] !== undefined
                                );
                                if (hasEntry > -1) {
                                    unclaimedRewards[hasEntry][key] += value;
                                } else {
                                    let template = {};
                                    template[key] = value;
                                    template.origin = `${calendar.name} (Day ${dayToPlay})`;
                                    unclaimedRewards.push(template);
                                }
                                break;
                            case "car":
                                unclaimedRewards.push({
                                    car: {
                                        carID: value.carID.slice(0, 6),
                                        upgrade: value.upgrade
                                    },
                                    origin: `${calendar.name} (Day ${dayToPlay})`
                                });
                                break;
                            case "pack":
                                unclaimedRewards.push({
                                    pack: value.slice(0, 6),
                                    origin: `${calendar.name} (Day ${dayToPlay})`
                                });
                                break;
                        }
                    }
                    
                    // Check for streak bonus
                    if (calendar.streakBonus?.enabled && newStreak > 0 && newStreak % calendar.streakBonus.interval === 0) {
                        const streakRewards = calendar.streakBonus.rewards || {};
                        for (const [key, value] of Object.entries(streakRewards)) {
                            if (["money", "fuseTokens", "trophies"].includes(key)) {
                                let hasEntry = unclaimedRewards.findIndex(entry => 
                                    entry.origin === `${calendar.name} (${calendar.streakBonus.interval}-Day Streak)` && entry[key] !== undefined
                                );
                                if (hasEntry > -1) {
                                    unclaimedRewards[hasEntry][key] += value;
                                } else {
                                    let template = {};
                                    template[key] = value;
                                    template.origin = `${calendar.name} (${calendar.streakBonus.interval}-Day Streak)`;
                                    unclaimedRewards.push(template);
                                }
                            }
                        }
                        message.channel.send(`🔥 **${calendar.streakBonus.interval}-Day Streak Bonus!** Claim your reward with \`cd-rewards\`!`);
                    }
                    
                    // Check for completion bonus
                    if (completedDays.length === calendar.days.length && calendar.completionBonus?.enabled) {
                        const compRewards = calendar.completionBonus.rewards || {};
                        for (const [key, value] of Object.entries(compRewards)) {
                            switch (key) {
                                case "money":
                                case "fuseTokens":
                                case "trophies":
                                    unclaimedRewards.push({
                                        [key]: value,
                                        origin: `${calendar.name} (Completion Bonus)`
                                    });
                                    break;
                                case "car":
                                    unclaimedRewards.push({
                                        car: {
                                            carID: value.carID.slice(0, 6),
                                            upgrade: value.upgrade
                                        },
                                        origin: `${calendar.name} (Completion Bonus)`
                                    });
                                    break;
                                case "pack":
                                    unclaimedRewards.push({
                                        pack: value.slice(0, 6),
                                        origin: `${calendar.name} (Completion Bonus)`
                                    });
                                    break;
                            }
                        }
                        message.channel.send(`🏆 **Calendar Complete!** You've finished all ${calendar.days.length} days! Claim your completion bonus with \`cd-rewards\`!`);
                    }
                    
                    // Update database
                    const progressUpdate = {
                        completedDays,
                        currentStreak: newStreak,
                        longestStreak: newLongestStreak,
                        lastCompletedDay: dayToPlay,
                        lastPlayedDate: today
                    };
                    
                    const set = {};
                    set[`playerProgress.${message.author.id}`] = progressUpdate;
                    
                    await Promise.all([
                        calendarModel.updateOne({ calendarID: calendar.calendarID }, { "$set": set }),
                        profileModel.updateOne({ userID: message.author.id }, { unclaimedRewards })
                    ]);
                    
                    let victoryMsg = `**Day ${dayToPlay} complete!**`;
                    if (Object.keys(rewards).length > 0) {
                        victoryMsg += ` Claim your reward with \`cd-rewards\`.`;
                    }
                    victoryMsg += `\n🔥 Current streak: ${newStreak} day${newStreak > 1 ? "s" : ""}`;
                    
                    message.channel.send(victoryMsg);
                }
                
                return bot.deleteID(message.author.id);
            }
        }
        
        /**
         * Calculate which day is currently unlocked
         */
        function getCurrentDay(calendar) {
            if (!calendar.isActive || !calendar.startDate) {
                return calendar.days.length; // Event makers can play all days
            }
            
            const startDate = DateTime.fromISO(calendar.startDate).startOf("day");
            const now = DateTime.now();
            
            const [unlockHour, unlockMinute] = (calendar.unlockTime || "00:00").split(":").map(Number);
            
            const daysSinceStart = Math.floor(now.diff(startDate, "days").days);
            const todayUnlockTime = now.startOf("day").plus({ hours: unlockHour, minutes: unlockMinute });
            const passedTodayUnlock = now >= todayUnlockTime;
            
            let currentDay = daysSinceStart + (passedTodayUnlock ? 1 : 0);
            
            return Math.max(1, Math.min(currentDay, calendar.days.length));
        }
    }
};
