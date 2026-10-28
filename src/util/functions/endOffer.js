"use strict";

const bot = require("../../config/config.js");
const { InfoMessage, BotError } = require("../classes/classes.js");
const { currentOffersChannelID, moneyEmojiID, fuseEmojiID } = require("../consts/consts.js");
const { getCar, getPack } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const offerModel = require("../../models/offerSchema.js");

// Ends an offer: claims it and (if it was on sale) archives it in a thread.
// Resolves true if this call ended it, false if it was already gone — the
// 3-minute tick (prod and dev share the database) and cd-endoffer can both
// reach the same offer, and only one of them may archive it.
async function endOffer(offer) {
    // The claim: whoever's delete returns the document owns the ending, and
    // the archive uses that returned copy (current stock), not the caller's.
    const claimed = await offerModel.findOneAndDelete(offer._id ? { _id: offer._id } : { offerID: offer.offerID }).lean();
    if (!claimed) {
        console.log(`[endOffer] ${offer.offerID} (${offer.name}) was already ended elsewhere, skipping`);
        return false;
    }
    offer = claimed;

    if (offer.isActive) {
        // The offer is already gone at this point, so a Discord failure here
        // costs only the archive thread: report it rather than throw.
        try {
            await announceEnd(offer);
        } catch (err) {
            console.error(`[endOffer] ${offer.offerID} ended, but the archive thread failed: ${err.message}`);
            await new BotError({
                stack: `[endOffer] ${offer.offerID} (${offer.name}) ended, but its archive thread failed:\n${err?.stack ?? err}`,
                unknownSource: true
            }).sendReport();
        }
    }
    return true;
}

async function announceEnd(offer) {
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
                    let currentCar = getCar(value[i]);
                    carList += `${carNameGen({ currentCar, rarity: true })}\n`;
                }
                fields.push({ name: "Cars", value: carList, inline: true });
                break;
            case "pack":
                let pack = getPack(value);
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

module.exports = endOffer;
