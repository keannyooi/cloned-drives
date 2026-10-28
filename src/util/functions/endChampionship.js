"use strict";

const bot = require("../../config/config.js");
const { InfoMessage, BotError } = require("../classes/classes.js");
const { currentEventsChannelID } = require("../consts/consts.js");
const { getCar, getTrack } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const listRewards = require("./listRewards.js");
const reqDisplay = require("./reqDisplay.js");
const championshipModel = require("../../models/championshipsSchema.js");

// Ends a championship: claims it and (if it was running) announces it.
// Resolves true if this call ended it, false if it was already gone — the
// 3-minute tick (prod and dev share the database) and cd-endchampionship can
// both reach the same championship, and only one of them may archive it.
async function endChampionship(championship) {
    // The claim: whoever's delete returns the document owns the ending, and
    // everything below uses that returned copy, never the caller's (possibly
    // stale) one. By _id, so an ID collision can't delete the wrong document.
    const claimed = await championshipModel.findOneAndDelete(championship._id ? { _id: championship._id } : { championshipID: championship.championshipID }).lean();
    if (!claimed) {
        console.log(`[endChampionship] ${championship.championshipID} (${championship.name}) was already ended elsewhere, skipping`);
        return false;
    }
    championship = claimed;

    if (championship.isActive) {
        // The championship is already ended at this point, so a Discord failure
        // here costs only the announcement: report it rather than throw.
        try {
            await announceEnd(championship);
        } catch (err) {
            console.error(`[endChampionship] ${championship.championshipID} ended, but the announcement failed: ${err.message}`);
            await new BotError({
                stack: `[endChampionship] ${championship.championshipID} (${championship.name}) ended, but its announcement thread failed:\n${err?.stack ?? err}`,
                unknownSource: true
            }).sendReport();
        }
    }
    return true;
}

async function announceEnd(championship) {
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
                Track: ${track?.trackName ?? championship.roster[i].track}
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

module.exports = endChampionship;
