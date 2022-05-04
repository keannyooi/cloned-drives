"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const offerModel = require("../models/offerSchema.js");

module.exports = {
    name: "limitedoffers",
    aliases: ["lo", "offers"],
    usage: ["[offer name]"],
    args: 0,
    category: "Testing", // Gameplay
    description: "Views all currently available offers.",
    async execute(message, args) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
        const guildMember = await bot.homeGuild.members.fetch(message.author.id);
        let offers = await offerModel.find();

        if (!args[0]) {
            if (!guildMember.roles.cache.has(eventMakerRoleID)) {
                offers = offers.filter(offer => {
                    return offer.isActive === true;
                });
            }

            const fields = [];
            for (let offer of offers) {
                let str = `${offer.name} (x${offer.stock})`;
                if (offer.isActive && offer.deadline !== "unlimited") {
                    let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline));
                    if (interval.invalid === null) {
                        str += ` \`${timeDisplay(interval)} remaining\`\n`;
                    }
                    else {
                        str += ` \`currently ending, no longer purchasable\`\n`;
                    }
                }
                if (guildMember.roles.cache.has(eventMakerRoleID)) {
                    str += " 🟢";
                }
                fields.push({
                    name: str,
                    value: `${moneyEmoji}${offer.price}`
                });
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "Limited Offers",
                desc: offers.length > 0 ? "These offers are only for a limited time, be sure to get them before they disappear!" : "There are currently no offers available.",
                author: message.author,
                fields: fields.length > 0 ? fields : null,
                footer: "Type cd-limitedoffers <offer name> to find out more about an offer."
            });
            return infoMessage.sendMessage();
        }
        else {
            let query = args.map(i => i.toLowerCase());
            await new Promise(resolve => resolve(search(message, query, offers, "offer")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    await displayInfo(...response);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function displayInfo(offer, currentMessage) {
            console.log(offer);
            if (offer.isActive || guildMember.roles.cache.has(eventMakerRoleID)) {
                const fields = [];
                for (let [key, value] of Object.entries(offer.offer)) {
                    switch (key) {
                        case "fuseTokens":
                            fields.push({ name: "Fuse Tokens", value: `${fuseEmoji}${value}`, inline: true });
                            break;
                        case "cars":
                            let carList = "";
                            for (let i = 0; i < value.length; i++) {
                                let currentCar = require(`../cars/${value[i]}`);
                                carList += `${carNameGen({ currentCar, rarity: true })}\n`;
                            }
                            fields.push({ name: "Cars", value: carList, inline: true });
                            break;
                        case "pack":
                            let pack = require(`../packs/${value}`);
                            fields.push({ name: "Pack", value: pack["packName"], inline: true });
                            break;
                        default:
                            break;
                    }
                }

                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `${offer.name} (x${offer.stock - (offer.purchasedPlayers[message.author.id] ?? 0)} remaining)`,
                    desc: `**This offer's currently ${offer.isActive ? "for sale!" : "not for sale."}**
                    Time Remaining: \`${offer.deadline.length > 9 ? timeDisplay(Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline))) : offer.deadline}\`
                    Price: ${moneyEmoji}${offer.price}
                    __**Contents of Offer:**__`,
                    author: message.author,
                    fields,
                    footer: `Offer ID: ${offer.offerID}`
                });
                return infoMessage.sendMessage({ currentMessage });
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you do not have the necessary role to view this offer right now.",
                    desc: `The offer you are trying to view is not active currently. You may only view this offer if you're an <@&${eventMakerRoleID}>.`,
                    author: message.author,
                });
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};