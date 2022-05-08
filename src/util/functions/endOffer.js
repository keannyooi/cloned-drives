"use strict";

const bot = require("../../config/config.js");
const { InfoMessage } = require("../classes/classes.js");
const { currentOffersChannelID, moneyEmojiID, fuseEmojiID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const offerModel = require("../../models/offerSchema.js");

async function endOffer(offer) {
    await offerModel.deleteOne({ offerID: offer.offerID });
    if (offer.isActive) {
        const currentOffersChannel = await bot.homeGuild.channels.fetch(currentOffersChannelID);
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
        await currentOffersChannel.send(`**The ${offer.name} offer is officially discontinued.**`);
        const thread = await currentOffersChannel.threads.create({
            name: `${offer.offerID} - ${offer.name}`,
            autoArchiveDuration: 60,
            invitable: false
        });
        await thread.join();

        const fields = [];
        for (let [key, value] of Object.entries(offer.offer)) {
            switch (key) {
                case "fuseTokens":
                    fields.push({ name: "Fuse Tokens", value: `${fuseEmoji}${value.toLocaleString("en")}`, inline: true });
                    break;
                case "cars":
                    let carList = "";
                    for (let i = 0; i < value.length; i++) {
                        let currentCar = require(`../../cars/${value[i]}`);
                        carList += `${carNameGen({ currentCar, rarity: true })}\n`;
                    }
                    fields.push({ name: "Cars", value: carList, inline: true });
                    break;
                case "pack":
                    let pack = require(`../../packs/${value}`);
                    fields.push({ name: "Pack", value: pack["packName"], inline: true });
                    break;
                default:
                    break;
            }
        }

        const archiveMessage = new InfoMessage({
            channel: thread,
            title:  `${offer.name} (${offer.stock} in stock)`,
            desc: `Price: ${moneyEmoji}${offer.price.toLocaleString("en")}
            __**Contents of Offer:**__`,
            author: bot.user,
            fields,
            footer: `Offer ID: \`${offer.offerID}\``
        });
        await archiveMessage.sendMessage();
        await thread.setArchived(true);
    }
}

module.exports = endOffer;