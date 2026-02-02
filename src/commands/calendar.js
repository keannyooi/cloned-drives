"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, defaultPageLimit } = require("../util/consts/consts.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const listUpdate = require("../util/functions/listUpdate.js");
const listRewards = require("../util/functions/listRewards.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const calendarModel = require("../models/calendarSchema.js");

module.exports = {
    name: "calendar",
    aliases: ["cal", "calendars"],
    usage: ["", "[calendar name]", "[calendar name] [page number]"],
    args: 0,
    category: "Gameplay",
    description: "Views all active calendar events or details of a specific calendar.",
    async execute(message, args) {
        const calendars = await calendarModel.find();
        const guildMember = await bot.homeGuild.members.fetch(message.author.id);
        const { settings } = await profileModel.findOne({ userID: message.author.id });
        const isEventMaker = guildMember.roles.cache.has(eventMakerRoleID);
        
        // No args - show calendar list
        if (!args.length) {
            const activeCalendars = calendars.filter(cal => cal.isActive);
            const inactiveCalendars = calendars.filter(cal => !cal.isActive);
            
            if (activeCalendars.length === 0 && (!isEventMaker || inactiveCalendars.length === 0)) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: "Calendar Events",
                    desc: "There are no active calendar events at the moment.",
                    author: message.author,
                    footer: "Check back later for new calendar events!"
                });
                return infoMessage.sendMessage();
            }
            
            const fields = [];
            
            // Active calendars
            if (activeCalendars.length > 0) {
                let activeList = "";
                for (const cal of activeCalendars) {
                    const progress = cal.playerProgress[message.author.id];
                    const completedDays = progress?.completedDays?.length || 0;
                    const currentDay = getCurrentDay(cal);
                    const totalDays = cal.days.length;
                    
                    activeList += `**${cal.name}**\n`;
                    
                    // Time remaining
                    if (cal.deadline && cal.deadline !== "unlimited") {
                        const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(cal.deadline));
                        if (interval.invalid === null) {
                            activeList += `⏳ ${timeDisplay(interval)} • `;
                        } else {
                            activeList += `⏳ \`ending soon\` • `;
                        }
                    }
                    
                    activeList += `📅 Day ${currentDay}/${totalDays} unlocked • `;
                    activeList += `✅ ${completedDays}/${totalDays} completed`;
                    if (completedDays === totalDays) {
                        activeList += " 🏆";
                    }
                    activeList += "\n\n";
                }
                fields.push({ name: `🟢 Active Calendars (${activeCalendars.length})`, value: activeList.trim() });
            }
            
            // Inactive calendars (event makers only)
            if (isEventMaker && inactiveCalendars.length > 0) {
                let inactiveList = "";
                for (const cal of inactiveCalendars) {
                    inactiveList += `${cal.name} (${cal.days.length} days)\n`;
                }
                fields.push({ name: `🔴 Inactive Calendars (${inactiveCalendars.length})`, value: inactiveList.trim() });
            }
            
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "Calendar Events",
                desc: "Calendar events unlock one day at a time. Complete days to earn rewards!",
                author: message.author,
                fields,
                footer: "Use cd-calendar <name> to view details • cd-playcalendar <name> to play"
            });
            return infoMessage.sendMessage();
        }
        
        // With args - show specific calendar details
        let page = 1;
        if (args.length > 1 && !isNaN(args[args.length - 1])) {
            page = parseInt(args.pop());
        }
        
        const query = args.map(i => i.toLowerCase());
        
        await new Promise(resolve => resolve(search(message, query, calendars, "calendar")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                const [calendar, currentMessage] = response;
                await viewCalendar(calendar, page, currentMessage);
            })
            .catch(error => {
                throw error;
            });
        
        async function viewCalendar(calendar, page, currentMessage) {
            // Check if user can view this calendar
            if (!calendar.isActive && !isEventMaker) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this calendar is not active.",
                    desc: `You may only view this calendar if you're an <@&${eventMakerRoleID}>.`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            
            const pageLimit = settings.listamount || defaultPageLimit;
            const totalPages = Math.ceil(calendar.days.length / pageLimit);
            
            if (page < 1 || page > totalPages) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `The calendar view ends at page ${totalPages}.`,
                    author: message.author
                }).displayClosest(page);
                return errorMessage.sendMessage({ currentMessage });
            }
            
            const progress = calendar.playerProgress[message.author.id] || {
                completedDays: [],
                currentStreak: 0,
                longestStreak: 0
            };
            const currentDay = getCurrentDay(calendar);
            const completedDays = progress.completedDays || [];
            
            try {
                await listUpdate(calendar.days, page, totalPages, listDisplay, settings, currentMessage);
            } catch (error) {
                throw error;
            }
            
            function listDisplay(section, page, totalPages) {
                const fields = [];
                
                for (let i = 0; i < section.length; i++) {
                    const day = section[i];
                    const dayNum = day.day;
                    const car = getCar(day.carID);
                    const track = getTrack(day.track);
                    
                    const isUnlocked = dayNum <= currentDay;
                    const isCompleted = completedDays.includes(dayNum);
                    
                    // Status emoji
                    let statusEmoji = "";
                    if (isCompleted) {
                        statusEmoji = "✅";
                    } else if (isUnlocked) {
                        statusEmoji = "🔓";
                    } else {
                        statusEmoji = "🔒";
                    }
                    
                    // Build field value
                    let value = "";
                    if (isUnlocked || isEventMaker) {
                        value = `${carNameGen({ currentCar: car, rarity: true, upgrade: day.upgrade })}\n`;
                        value += `Track: ${track?.trackName || "Unknown"}\n`;
                        if (Object.keys(day.reqs).length > 0) {
                            value += `Reqs: \`${reqDisplay(day.reqs)}\`\n`;
                        }
                        if (Object.keys(day.rewards).length > 0) {
                            value += `Reward: ${listRewards(day.rewards)}`;
                        } else {
                            value += `Reward: None`;
                        }
                    } else {
                        value = `*Unlocks in ${dayNum - currentDay} day${dayNum - currentDay > 1 ? "s" : ""}*`;
                    }
                    
                    fields.push({
                        name: `Day ${dayNum} ${statusEmoji}`,
                        value: value,
                        inline: true
                    });
                }
                
                // Build description with stats
                let desc = "";
                if (calendar.isActive) {
                    desc = `**Day ${currentDay}/${calendar.days.length}** currently unlocked\n`;
                    
                    // Time remaining
                    if (calendar.deadline && calendar.deadline !== "unlimited") {
                        const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(calendar.deadline));
                        if (interval.invalid === null) {
                            desc += `**Time Remaining:** ${timeDisplay(interval)}\n`;
                        } else {
                            desc += `**Time Remaining:** \`ending soon\`\n`;
                        }
                    } else {
                        desc += `**Time Remaining:** \`unlimited\`\n`;
                    }
                    
                    desc += `**Progress:** ${completedDays.length}/${calendar.days.length} days completed\n`;
                    desc += `**Current Streak:** ${progress.currentStreak || 0} days\n`;
                    
                    if (calendar.streakBonus?.enabled) {
                        desc += `**Streak Bonus:** Every ${calendar.streakBonus.interval} days\n`;
                    }
                    if (calendar.completionBonus?.enabled) {
                        desc += `**Completion Bonus:** Complete all days!\n`;
                    }
                } else {
                    desc = `**Status:** Inactive\n`;
                    desc += `**Total Days:** ${calendar.days.length}\n`;
                    desc += `**Duration:** ${calendar.deadline === "unlimited" ? "Unlimited" : calendar.deadline}\n`;
                    desc += `**Unlock Time:** ${calendar.unlockTime} UTC\n`;
                }
                
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `📅 ${calendar.name}`,
                    desc: desc,
                    author: message.author,
                    fields,
                    footer: `Page ${page} of ${totalPages} • Calendar ID: ${calendar.calendarID}`
                });
                
                return infoMessage;
            }
        }
        
        /**
         * Calculate which day is currently unlocked based on start date
         */
        function getCurrentDay(calendar) {
            if (!calendar.isActive || !calendar.startDate) {
                return 0;
            }
            
            const startDate = DateTime.fromISO(calendar.startDate).startOf("day");
            const now = DateTime.now();
            
            // Parse unlock time
            const [unlockHour, unlockMinute] = (calendar.unlockTime || "00:00").split(":").map(Number);
            
            // Calculate days since start
            const daysSinceStart = Math.floor(now.diff(startDate, "days").days);
            
            // Check if we've passed today's unlock time
            const todayUnlockTime = now.startOf("day").plus({ hours: unlockHour, minutes: unlockMinute });
            const passedTodayUnlock = now >= todayUnlockTime;
            
            // Day 1 unlocks on start date at unlock time
            // Day 2 unlocks on start date + 1 at unlock time, etc.
            let currentDay = daysSinceStart + (passedTodayUnlock ? 1 : 0);
            
            // Clamp to valid range
            return Math.max(1, Math.min(currentDay, calendar.days.length));
        }
    }
};

/**
 * Helper function exported for other modules
 */
function getCurrentDay(calendar) {
    if (!calendar.isActive || !calendar.startDate) {
        return 0;
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

module.exports.getCurrentDay = getCurrentDay;
