"use strict";

const bot = require("../config/config.js");
const {
    ButtonBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType: { Button, StringSelect },
    ButtonStyle: { Primary, Secondary },
} = require("discord.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const offerModel = require("../models/offerSchema.js");
const { defaultPageLimit } = require("../util/consts/consts.js");

module.exports = {
    name: "limitedoffers",
    aliases: ["lo", "offers"],
    usage: ["[offer name]"],
    args: 0,
    category: "Gameplay",
    description: "Views all currently available offers.",
    async execute(message, args) {
        try {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            let offers = await offerModel.find();

            // Filter inactive offers for non-event makers
            if (!args[0] && !guildMember.roles.cache.has(eventMakerRoleID)) {
                offers = offers.filter(offer => offer.isActive);
            }

            // Display offers list or specific offer details
            if (!args[0]) {
                return displayOffersList(offers, guildMember, message, moneyEmoji);
            } else {
                const query = args.map(arg => arg.toLowerCase());
                const searchResults = await search(message, query, offers, "offer");

                if (Array.isArray(searchResults)) {
                    return displayOfferDetails(searchResults[0], guildMember, message, moneyEmoji, fuseEmoji, searchResults[1]);
                }
            }
        } catch (error) {
            console.error("Error in limitedoffers command execution:", error);
        }
    },
};

async function displayOffersList(offers, guildMember, message, moneyEmoji) {
    const fields = offers.map(offer => {
        let status = `${offer.name} (x${offer.stock - (offer.purchasedPlayers[message.author.id] ?? 0)})`;
        if (offer.isActive && offer.deadline !== "unlimited") {
            const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline));
            status += interval.invalid === null ? ` ${timeDisplay(interval)}` : " `currently ending, no longer purchasable`";
        }
        if (guildMember.roles.cache.has(eventMakerRoleID) && offer.isActive) {
            status += " 🟢";
        }
        return {
            name: status,
            value: `${moneyEmoji}${offer.price.toLocaleString("en")}`,
        };
    });

    const infoMessage = new InfoMessage({
        channel: message.channel,
        title: "Limited Offers",
        desc: offers.length > 0
            ? "These offers are only for a limited time, be sure to get them before they disappear!"
            : "There are currently no offers available.",
        author: message.author,
        fields: fields.length > 0 ? fields : null,
        footer: "Type cd-limitedoffers <offer name> to find out more about an offer.",
    });
    return infoMessage.sendMessage();
}

async function displayOfferDetails(offer, guildMember, message, moneyEmoji, fuseEmoji, currentMessage) {
    if (offer.isActive || guildMember.roles.cache.has(eventMakerRoleID)) {
        const fields = buildOfferFields(offer, fuseEmoji);

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: `${offer.name} (x${offer.stock - (offer.purchasedPlayers[message.author.id] ?? 0)} remaining)`,
            desc: `**This offer's currently ${offer.isActive ? "for sale!" : "not for sale."}**
                Time Remaining: \`${offer.deadline.length > 9 ? timeDisplay(Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline))) : offer.deadline}\`
                Price: ${moneyEmoji}${offer.price.toLocaleString("en")}
                __**Contents of Offer:**__`,
            author: message.author,
            fields,
            footer: `Offer ID: ${offer.offerID}`,
        });
        return infoMessage.sendMessage({ currentMessage });
    } else {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, you do not have the necessary role to view this offer right now.",
            desc: `The offer you are trying to view is not active currently. You may only view this offer if you're an <@&${eventMakerRoleID}>.`,
            author: message.author,
        });
        return errorMessage.sendMessage({ currentMessage });
    }
}

function buildOfferFields(offer, fuseEmoji) {
    const fields = [];

    for (const [key, value] of Object.entries(offer.offer)) {
        switch (key) {
            case "fuseTokens":
                fields.push({
                    name: "Fuse Tokens",
                    value: `${fuseEmoji}${value.toLocaleString("en")}`,
                    inline: true,
                });
                break;

            case "cars":
                const carList = value
                    .map(carID => {
                        const currentCar = require(`../cars/${carID}`);
                        return carNameGen({ currentCar, rarity: true });
                    })
                    .join("\n");
                fields.push({ name: "Cars", value: carList, inline: true });
                break;

            case "pack":
                const pack = require(`../packs/${value}`);
                fields.push({ name: "Pack", value: pack.packName, inline: true });
                break;

            default:
                console.warn(`Unknown offer item type: ${key}`);
                break;
        }
    }

    return fields;
}




--------------------------------------------------------- +removed offer if bought all from list gen:

async function displayOffersList(offers, guildMember, message, moneyEmoji) {
    const fields = offers
        .filter(offer => {
            const purchases = offer.purchasedPlayers[message.author.id] ?? 0;
            return purchases < offer.stock; // Exclude offers fully purchased by the user
        })
        .map(offer => {
            let status = `${offer.name} (x${offer.stock - (offer.purchasedPlayers[message.author.id] ?? 0)})`;
            if (offer.isActive && offer.deadline !== "unlimited") {
                const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline));
                status += interval.invalid === null ? ` ${timeDisplay(interval)}` : " `currently ending, no longer purchasable`";
            }
            if (guildMember.roles.cache.has(eventMakerRoleID) && offer.isActive) {
                status += " 🟢";
            }
            return {
                name: status,
                value: `${moneyEmoji}${offer.price.toLocaleString("en")}`,
            };
        });

    const infoMessage = new InfoMessage({
        channel: message.channel,
        title: "Limited Offers",
        desc: fields.length > 0
            ? "These offers are only for a limited time, be sure to get them before they disappear!"
            : "There are currently no offers available for you to purchase.",
        author: message.author,
        fields: fields.length > 0 ? fields : null,
        footer: "Type cd-limitedoffers <offer name> to find out more about an offer.",
    });
    return infoMessage.sendMessage();
}



------------------ OLD -------------------


"use strict";

const bot = require("../config/config.js");
const { ButtonBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType: { Button, StringSelect }, ButtonStyle: { Primary, Secondary } } = require("discord.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const offerModel = require("../models/offerSchema.js");
const listUpdate = require("../util/functions/listUpdate.js");
const { defaultPageLimit } = require("../util/consts/consts.js");

module.exports = {
    name: "limitedoffers",
    aliases: ["lo", "offers"],
    usage: ["[offer name]"],
    args: 0,
    category: "Gameplay",
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
                let str = `${offer.name} (x${offer.stock - (offer.purchasedPlayers[message.author.id] ?? 0)})`;
                if (offer.isActive && offer.deadline !== "unlimited") {
                    let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline));
                    if (interval.invalid === null) {
                        str += ` ${timeDisplay(interval)}\n`;
                    }
                    else {
                        str += ` \`currently ending, no longer purchasable\`\n`;
                    }
                }
                if (guildMember.roles.cache.has(eventMakerRoleID) && offer.isActive) {
                    str += " 🟢";
                }
                fields.push({
                    name: str,
                    value: `${moneyEmoji}${offer.price.toLocaleString("en")}`
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
                            fields.push({ name: "Fuse Tokens", value: `${fuseEmoji}${value.toLocaleString("en")}`, inline: true });
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
                    Price: ${moneyEmoji}${offer.price.toLocaleString("en")}
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