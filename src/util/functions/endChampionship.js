"use strict";

const bot = require("../../config/config.js");
const { InfoMessage } = require("../classes/classes.js");
const { currentEventsChannelID } = require("../consts/consts.js");
const { getCar, getTrack } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const listRewards = require("./listRewards.js");
const reqDisplay = require("./reqDisplay.js");
const championshipModel = require("../../models/championshipsSchema.js");

async function endChampionship(championship) {
    await championshipModel.deleteOne({ championshipID: championship.championshipID });
    if (championship.isActive) {
        const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
        await currentEventsChannel.send(`**The ${championship.name} championship has officially ended, thanks for playing and enjoy your rewards!**`);
        const thread = await currentEventsChannel.threads.create({
            name: `${championship.championshipID} - ${championship.name}`,
            autoArchiveDuration: 60,
            invitable: false
        });
        await thread.join();

        const fields1 = [], fields2 = [];
        for (let i = 0; i < championship.roster.length; i++) {
            let currentCar = getCar(championship.roster[i].carID);
            let track = getTrack(championship.roster[i].track);
            let field = {
                name: `Round ${i + 1}`,
                value: `Car: ${carNameGen({ currentCar, rarity: true, upgrade: championship.roster[i].upgrade })}
                Track: ${track["trackName"]}
                Reqs: ${reqDisplay(championship.roster[i].reqs)}
                Reward: ${listRewards(championship.roster[i].rewards)}`,
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
            title: championship.name,
            desc: `Championship ID: \`${championship.championshipID}\``,
            author: bot.user,
            fields: fields1
        });
        await message1.sendMessage();
        if (fields2.length > 0) {
            const message2 = new InfoMessage({
                channel: thread,
                title: championship.name,
                desc: `Championship ID: \`${championship.championshipID}\``,
                author: bot.user,
                fields: fields2
            });
            await message2.sendMessage();
        }
        await thread.setArchived(true);
    }
}

module.exports = endChampionship;
