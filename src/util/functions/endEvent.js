"use strict";

const bot = require("../../config/config.js");
const { InfoMessage, BotError } = require("../classes/classes.js");
const { currentEventsChannelID } = require("../consts/consts.js");
const { getCar, getTrack } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const listRewards = require("./listRewards.js");
const reqDisplay = require("./reqDisplay.js");
const eventModel = require("../../models/eventSchema.js");
const eventResultModel = require("../../models/eventResultSchema.js");

// Ends an event: claims it, saves its results and (if it was running)
// announces it. Resolves true if this call ended it, false if it was already
// gone — the 3-minute tick (prod and dev share the database) and cd-endevent
// can both reach the same event, and only one of them may archive it.
async function endEvent(event, endedBy) {
    // The claim: whoever's delete returns the document owns the ending, and
    // everything below uses that returned copy, never the caller's (possibly
    // stale) one. By _id, because eventIDs have collided before and a delete
    // by eventID could take the other, still-running event with it.
    const claimed = await eventModel.findOneAndDelete(event._id ? { _id: event._id } : { eventID: event.eventID }).lean();
    if (!claimed) {
        console.log(`[endEvent] ${event.eventID} (${event.name}) was already ended elsewhere, skipping`);
        return false;
    }
    event = claimed;

    // Save results to the archive
    const progress = event.playerProgress || {};
    const participants = Object.keys(progress).length;
    const totalRounds = event.roster.length;
    const completions = Object.values(progress).filter(r => r > totalRounds).length;

    try {
        await eventResultModel.create({
            eventID: event.eventID,
            eventName: event.name,
            endedAt: new Date(),
            endedBy: endedBy || "system",
            wasActive: event.isActive || false,
            totalRounds,
            totalParticipants: participants,
            totalCompletions: completions,
            playerProgress: progress,
            roster: event.roster || [],
            eventConfig: {
                isVIP: event.isVIP || false,
                deadline: event.deadline || "unlimited"
            }
        });
    } catch (err) {
        console.error(`Failed to save event results for ${event.eventID}: ${err.message}`);
    }

    if (event.isActive) {
        // The event is already ended at this point, so a Discord failure here
        // costs only the announcement: report it rather than throw.
        try {
            await announceEnd(event);
        } catch (err) {
            console.error(`[endEvent] ${event.eventID} ended, but the announcement failed: ${err.message}`);
            await new BotError({
                stack: `[endEvent] ${event.eventID} (${event.name}) ended, but its announcement thread failed:\n${err?.stack ?? err}`,
                unknownSource: true
            }).sendReport();
        }
    }
    return true;
}

async function announceEnd(event) {
    const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
    await currentEventsChannel.send(`**The ${event.name} event has officially ended, thanks for playing and enjoy your rewards!**`);
    const thread = await currentEventsChannel.threads.create({
        name: `${event.eventID} - ${event.name}`,
        autoArchiveDuration: 60,
        invitable: false
    });
    await thread.join();

    const fields1 = [], fields2 = [];
    for (let i = 0; i < event.roster.length; i++) {
        let currentCar = getCar(event.roster[i].carID);
        let track = getTrack(event.roster[i].track);
        let field = {
            name: `Round ${i + 1}`,
            value: `Car: ${carNameGen({ currentCar, rarity: true, upgrade: event.roster[i].upgrade })}
                Track: ${track?.trackName ?? event.roster[i].track}
                Reqs: ${reqDisplay(event.roster[i].reqs)}
                Reward: ${listRewards(event.roster[i].rewards)}`,
            inline: true
        };
        if (i < 25) {
            fields1.push(field);
        }
        else {
            fields2.push(field);
        }
    }

    const message1 = new InfoMessage({
        channel: thread,
        title: event.name,
        desc: `Event ID: \`${event.eventID}\``,
        author: bot.user,
        fields: fields1
    });
    await message1.sendMessage();
    if (fields2.length > 0) {
        const message2 = new InfoMessage({
            channel: thread,
            title: event.name,
            desc: `Event ID: \`${event.eventID}\``,
            author: bot.user,
            fields: fields2
        });
        await message2.sendMessage();
    }
    await thread.setArchived(true);
}

module.exports = endEvent;
