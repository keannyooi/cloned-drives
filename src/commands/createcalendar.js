"use strict";

const { getCarFiles, getTrackFiles } = require("../util/functions/dataManager.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const sortCars = require("../util/functions/sortCars.js");
const { getAvailableTunes } = require("../util/functions/calcTune.js");
const calendarModel = require("../models/calendarSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createcalendar",
    aliases: ["newcalendar"],
    usage: ["<number of days> <calendar name>"],
    args: 2,
    category: "Events",
    description: "Creates a calendar event with daily unlocking rounds.",
    async execute(message, args) {
        const carFiles = getCarFiles();
        const trackFiles = getTrackFiles();
        
        const calendars = await calendarModel.find();
        const serverStats = await serverStatModel.findOne({});
        const totalCalendars = serverStats.totalCalendars || 0;
        
        const calendarName = args.slice(1).join(" ");
        const numDays = parseInt(args[0]);
        
        // Validate number of days
        if (isNaN(numDays) || numDays < 1 || numDays > 31) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, day count provided is either not a number or not supported.",
                desc: "The number of days in a calendar is restricted to 1 ~ 31 days.",
                author: message.author
            }).displayClosest(args[0]);
            return errorMessage.sendMessage();
        }
        
        // Check for duplicate names
        if (calendars.find(cal => cal.name.toLowerCase() === calendarName.toLowerCase())) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, calendar name already taken.",
                desc: "Check the list of calendars using the command `cd-calendar`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        
        // Generate random opponents sorted by CR
        let opponentIDs = [];
        for (let i = 0; i < numDays; i++) {
            opponentIDs.push(carFiles[Math.floor(Math.random() * carFiles.length)].slice(0, 6));
        }
        opponentIDs = sortCars(opponentIDs, "cr", "ascending");
        
        // Build days array
        const upgrades = getAvailableTunes();
        const days = opponentIDs.map((carID, index) => ({
            day: index + 1,
            carID: carID,
            upgrade: upgrades[Math.floor(Math.random() * upgrades.length)],
            track: trackFiles[Math.floor(Math.random() * trackFiles.length)].slice(0, 6),
            reqs: {},
            rewards: {}
        }));
        
        // Create the calendar
        await calendarModel.create({
            calendarID: `cal${totalCalendars + 1}`,
            name: calendarName,
            days: days,
            unlockTime: "00:00",
            timezone: "UTC"
        });
        
        // Update server stats
        await serverStatModel.updateOne({}, { "$set": { totalCalendars: totalCalendars + 1 } });
        
        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully created a new calendar named "${calendarName}"!`,
            desc: `This calendar has **${numDays} days** of content.\nUse \`cd-editcalendar\` to customize days, rewards, and timing.\nUse \`cd-startcalendar\` when ready to launch.`,
            author: message.author,
            fields: [
                { name: "Calendar ID", value: `\`cal${totalCalendars + 1}\``, inline: true },
                { name: "Days", value: `\`${numDays}\``, inline: true },
                { name: "Duration", value: "`unlimited`", inline: true },
                { name: "Unlock Time", value: "`00:00 UTC`", inline: true }
            ]
        });
        return successMessage.sendMessage();
    }
};
