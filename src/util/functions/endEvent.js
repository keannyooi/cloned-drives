"use strict";

const bot = require("../../config/config.js");
const { InfoMessage } = require("../classes/classes.js");
const { currentEventsChannelID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const listRewards = require("./listRewards.js");
const reqDisplay = require("./reqDisplay.js");
const eventModel = require("../../models/eventSchema.js");

async function endEvent(event) {
    await eventModel.deleteOne({ eventID: event.eventID });
    if (event.isActive) {
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
            let currentCar = require(`../../cars/${event.roster[i].carID}`);
            let track = require(`../../tracks/${event.roster[i].track}`);
            let field = {
                name: `Round ${i + 1}`,
                value: `Car: ${carNameGen({ currentCar, rarity: true, upgrade: event.roster[i].upgrade })}
                Track: ${track["trackName"]}
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
}

module.exports = endEvent;