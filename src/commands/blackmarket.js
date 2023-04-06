"use strict";

const bot = require("../config/config.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { trophyEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const profileModel = require("../models/profileSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "blackmarket",
    aliases: ["bm"],
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "Check what's on sale in the black market here!",
    async execute(message) {
        const { trophies } = await profileModel.findOne({ userID: message.author.id });
        const { bmCatalog } = await serverStatModel.findOne({});
        const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);
        const fields = [];
        for (let i = 0; i < bmCatalog.length; i++) {
            let currentCar = require(`../cars/${bmCatalog[i].carID}`);
            fields.push({
                name: `${i + 1} - ${carNameGen({ currentCar, rarity: true, removeBMTag: true })} (ID: \`${bmCatalog[i].carID}\`)`,
                value: `Price: ${trophyEmoji}${bmCatalog[i].price.toLocaleString("en")}\nStock Remaining: ${bmCatalog[i].stock.toLocaleString("en")}`,
                inline: true
            });
        }

        const dealerMessage = new InfoMessage({
            channel: message.channel,
            title: "Welcome to the black market, where special editions of cars are ~~smuggled~~ sold!",
            desc: `The catalog refreshes every day! Buy a car from here using \`cd-buycar bm\`!
            **Current Trophy Balance**: ${trophyEmoji}${trophies.toLocaleString("en")}`,
            author: message.author,
            fields
        });
        return dealerMessage.sendMessage();
    }
};