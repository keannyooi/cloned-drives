"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime } = require("../util/consts/consts.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const listRewards = require("../util/functions/listRewards.js");
const profileModel = require("../models/profileSchema.js");
const calendarModel = require("../models/calendarSchema.js");

module.exports = {
    name: "startcalendar",
    aliases: ["launchcalendar"],
    usage: ["<calendar name>"],
    args: 1,
    category: "Events",
    description: "Starts an inactive calendar event.",
    async execute(message, args) {
        const calendars = await calendarModel.find({ isActive: false });
        let query = args.map(i => i.toLowerCase());
        
        await new Promise(resolve => resolve(search(message, query, calendars, "calendar")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await startCalendar(...response);
            })
            .catch(error => {
                throw error;
            });
        
        async function startCalendar(calendar, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            
            // Preview the calendar
            const previewFields = [];
            const maxPreview = Math.min(5, calendar.days.length);
            
            for (let i = 0; i < maxPreview; i++) {
                const day = calendar.days[i];
                const car = getCar(day.carID);
                const track = getTrack(day.track);
                
                previewFields.push({
                    name: `Day ${day.day}`,
                    value: `${carNameGen({ currentCar: car, rarity: true })} (${day.upgrade})\n${track?.trackName || "Unknown Track"}`,
                    inline: true
                });
            }
            
            if (calendar.days.length > 5) {
                previewFields.push({
                    name: "...",
                    value: `And ${calendar.days.length - 5} more days`,
                    inline: true
                });
            }
            
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Start the "${calendar.name}" calendar?`,
                desc: `**${calendar.days.length} days** of content\n**Unlock Time:** ${calendar.unlockTime} UTC\n**Duration:** ${calendar.deadline === "unlimited" ? "Unlimited" : calendar.deadline}\n\nYou have ${defaultChoiceTime / 1000} seconds to decide.`,
                author: message.author,
                fields: previewFields,
                footer: `Calendar ID: ${calendar.calendarID}`
            });
            
            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);
            
            async function acceptedFunction(currentMessage) {
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                
                // Set start date to now
                calendar.isActive = true;
                calendar.startDate = DateTime.now().toISO();
                
                // Convert duration to deadline date if not unlimited
                if (calendar.deadline && calendar.deadline !== "unlimited" && calendar.deadline.endsWith("d")) {
                    const days = parseInt(calendar.deadline.replace("d", ""));
                    calendar.deadline = DateTime.now().plus({ days }).toISO();
                }
                
                // Build announcement message
                let announcementDesc = `📅 **${calendar.days.length} days** of daily challenges!\n`;
                announcementDesc += `⏰ **New day unlocks:** ${calendar.unlockTime} UTC daily\n`;
                if (calendar.deadline !== "unlimited") {
                    const deadlineDate = DateTime.fromISO(calendar.deadline);
                    announcementDesc += `⏳ **Ends:** ${deadlineDate.toFormat("MMMM d, yyyy 'at' HH:mm")} UTC\n`;
                }
                announcementDesc += `🎯 **Catch-up allowed:** Play any past unlocked day\n\n`;
                
                if (calendar.streakBonus?.enabled) {
                    announcementDesc += `🔥 **Streak Bonus:** Every ${calendar.streakBonus.interval} consecutive days!\n`;
                }
                if (calendar.completionBonus?.enabled) {
                    announcementDesc += `🏆 **Completion Bonus:** Complete all days for a special reward!\n`;
                }
                
                announcementDesc += `\nUse \`cd-calendar ${calendar.name}\` to view details and \`cd-playcalendar ${calendar.name}\` to play!`;
                
                await currentEventsChannel.send({
                    content: `**🗓️ The ${calendar.name} calendar event has officially started!**`,
                    embeds: [{
                        color: 0x34aeeb,
                        title: calendar.name,
                        description: announcementDesc,
                        footer: { text: `Calendar ID: ${calendar.calendarID} • Day 1 is now available!` },
                        timestamp: new Date().toISOString()
                    }]
                });
                
                await calendarModel.updateOne({ calendarID: calendar.calendarID }, calendar);
                
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the "${calendar.name}" calendar!`,
                    desc: `Day 1 is now available for players.`,
                    author: message.author,
                    fields: [
                        { name: "Total Days", value: `${calendar.days.length}`, inline: true },
                        { name: "Unlock Time", value: `${calendar.unlockTime} UTC`, inline: true },
                        { name: "Start Date", value: DateTime.now().toFormat("yyyy-MM-dd"), inline: true }
                    ]
                });
                
                await successMessage.sendMessage({ currentMessage });
                return successMessage.removeButtons();
            }
        }
    }
};
