"use strict";

const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const calendarModel = require("../models/calendarSchema.js");

module.exports = {
    name: "endcalendar",
    aliases: ["removecalendar", "rmvcalendar"],
    usage: ["<calendar name>"],
    args: 1,
    category: "Events",
    description: "Ends a calendar event (deactivates it but keeps data).",
    async execute(message, args) {
        const calendars = await calendarModel.find();
        const query = args.map(arg => arg.toLowerCase());
        
        await new Promise(resolve => resolve(search(message, query, calendars, "calendar")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await endCalendar(...response);
            })
            .catch(error => {
                throw error;
            });
        
        async function endCalendar(calendar, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            
            // Calculate some stats for the confirmation message
            const playerCount = Object.keys(calendar.playerProgress || {}).length;
            let totalCompletions = 0;
            let fullCompletions = 0;
            
            for (const progress of Object.values(calendar.playerProgress || {})) {
                const completed = progress.completedDays?.length || 0;
                totalCompletions += completed;
                if (completed === calendar.days.length) {
                    fullCompletions++;
                }
            }
            
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to end the "${calendar.name}" calendar?`,
                desc: `You have ${defaultChoiceTime / 1000} seconds to decide.\n\n**This will deactivate the calendar but preserve all data.**`,
                author: message.author,
                fields: [
                    { name: "Status", value: calendar.isActive ? "🟢 Active" : "🔴 Inactive", inline: true },
                    { name: "Total Days", value: `${calendar.days.length}`, inline: true },
                    { name: "Players", value: `${playerCount}`, inline: true },
                    { name: "Total Day Completions", value: `${totalCompletions}`, inline: true },
                    { name: "Full Completions", value: `${fullCompletions}`, inline: true }
                ],
                footer: `Calendar ID: ${calendar.calendarID}`
            });
            
            try {
                await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);
            } catch (error) {
                throw error;
            }
            
            async function acceptedFunction(currentMessage) {
                // Deactivate the calendar
                await calendarModel.updateOne(
                    { calendarID: calendar.calendarID },
                    { 
                        "$set": { 
                            isActive: false 
                        } 
                    }
                );
                
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully ended the "${calendar.name}" calendar!`,
                    desc: "The calendar has been deactivated. Player progress has been preserved.",
                    author: message.author,
                    fields: [
                        { name: "Players Participated", value: `${playerCount}`, inline: true },
                        { name: "Full Completions", value: `${fullCompletions}`, inline: true }
                    ]
                });
                
                await successMessage.sendMessage({ currentMessage });
                return successMessage.removeButtons();
            }
        }
    }
};
