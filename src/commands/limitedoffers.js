"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, moneyEmojiID, fuseEmojiID, defaultPageLimit } = require("../util/consts/consts.js");
const { getCar, getPack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const listUpdate = require("../util/functions/listUpdate.js");
const offerModel = require("../models/offerSchema.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "limitedoffers",
    aliases: ["lo", "offers"],
    usage: ["", "[page number]", "[offer name]"],
    args: 0,
    category: "Gameplay",
    description: "Views all currently available offers.",
    async execute(message, args) {
        try {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            
            const allOffers = await offerModel.find();

            // Filter offers: show active offers, or inactive if user is event maker
            // Also filter out offers with no remaining stock for this user
            const offers = allOffers.filter(offer => {
                const isVisible = offer.isActive || guildMember.roles.cache.has(eventMakerRoleID);
                const purchases = offer.purchasedPlayers?.[message.author.id] ?? 0;
                const remainingStock = offer.stock - purchases;
                return isVisible && remainingStock > 0;
            });

            // Handle page number argument
            let page = 1;
            let isPageRequest = false;
            
            if (args.length > 0) {
                // Check if first arg is a page number
                if (!isNaN(args[0]) && args.length === 1) {
                    page = parseInt(args[0]);
                    isPageRequest = true;
                }
                // Check if last arg is a page number (for "offer name 2" syntax)
                else if (args.length > 1 && !isNaN(args[args.length - 1])) {
                    // This is "offer name [page]" - handled in viewOffer
                }
            }

            // Display offers list when no args or just a page number
            if (!args.length || isPageRequest) {
                // Handle empty offers list
                if (offers.length === 0) {
                    const infoMessage = new InfoMessage({
                        channel: message.channel,
                        title: "No Offers Available",
                        desc: "There are currently no offers available for you to purchase.",
                        author: message.author,
                        footer: "Check back later for new offers!"
                    });
                    return infoMessage.sendMessage();
                }

                const pageLimit = settings.listamount || defaultPageLimit;
                const totalPages = Math.ceil(offers.length / pageLimit);

                // Validate page number
                if (page < 1 || page > totalPages) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, page number requested invalid.",
                        desc: `The offers list ends at page ${totalPages}.`,
                        author: message.author
                    }).displayClosest(page);
                    return errorMessage.sendMessage();
                }

                try {
                    await listUpdate(offers, page, totalPages, listDisplay, settings);
                } catch (error) {
                    throw error;
                }

                function listDisplay(section, page, totalPages) {
                    const fields = [];

                    for (let i = 0; i < section.length; i++) {
                        const offer = section[i];
                        const userPurchases = offer.purchasedPlayers?.[message.author.id] ?? 0;
                        const remainingStock = offer.stock - userPurchases;
                        
                        // Build status line with offer name and remaining stock
                        let status = `${offer.name} (x${remainingStock})`;
                        
                        // Add time remaining if active and has deadline
                        if (offer.isActive && offer.deadline !== "unlimited") {
                            const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline));
                            if (interval.invalid === null) {
                                status += ` ${timeDisplay(interval)}`;
                            } else {
                                status += " `currently ending, no longer purchasable`";
                            }
                        } else if (offer.isActive && offer.deadline === "unlimited") {
                            status += " `unlimited time remaining`";
                        }
                        
                        // Add green indicator for event makers viewing active offers
                        if (guildMember.roles.cache.has(eventMakerRoleID)) {
                            status += offer.isActive ? " 🟢" : " 🔴";
                        }

                        fields.push({
                            name: status,
                            value: `${moneyEmoji}${offer.price.toLocaleString("en")}`,
                            inline: true
                        });
                    }

                    // Check if fields exceed Discord embed limits (1024 chars per field, 25 fields max)
                    const totalFieldChars = fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
                    if (totalFieldChars > 5500 || fields.length > 25) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "This page has too many characters and cannot be displayed.",
                            desc: "Try adjusting your list amount in `cd-settings` to show fewer items per page.",
                            author: message.author,
                            fields: [{ name: "Characters on this page", value: `\`${totalFieldChars}\`` }]
                        });
                        return errorMessage;
                    }

                    const infoMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Limited Offers (${offers.length} Available)`,
                        desc: offers.length > 0
                            ? "These offers are only for a limited time, be sure to get them before they disappear!"
                            : "There are currently no offers available for you to purchase.",
                        author: message.author,
                        fields: fields,
                        footer: `Page ${page} of ${totalPages} • Use cd-limitedoffers <offer name> for details.`
                    });

                    return infoMessage;
                }
            } else {
                // Search for specific offer
                const query = args.map(arg => arg.toLowerCase());
                
                await new Promise(resolve => resolve(search(message, query, offers, "offer")))
                    .then(async (response) => {
                        if (!Array.isArray(response)) return;
                        const [result, currentMessage] = response;
                        await displayOfferDetails(result, guildMember, message, moneyEmoji, fuseEmoji, currentMessage);
                    })
                    .catch(error => {
                        throw error;
                    });
            }
        } catch (error) {
            console.error("Error in limitedoffers command execution:", error);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "An error occurred while fetching offers.",
                desc: "Please try again later. If this persists, report it using the thumbs down button.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }
    },
};

/**
 * Displays detailed information about a specific offer
 */
async function displayOfferDetails(offer, guildMember, message, moneyEmoji, fuseEmoji, currentMessage) {
    // Check if user can view this offer
    if (!offer.isActive && !guildMember.roles.cache.has(eventMakerRoleID)) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, you do not have the necessary role to view this offer right now.",
            desc: `The offer you are trying to view is not active currently. You may only view this offer if you're an <@&${eventMakerRoleID}>.`,
            author: message.author,
        });
        return errorMessage.sendMessage({ currentMessage });
    }

    const fields = buildOfferFields(offer, fuseEmoji);
    const userPurchases = offer.purchasedPlayers?.[message.author.id] ?? 0;
    const remainingStock = offer.stock - userPurchases;

    // Calculate time remaining display
    let timeRemaining;
    if (offer.deadline && offer.deadline.length > 9) {
        const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline));
        timeRemaining = interval.invalid === null 
            ? timeDisplay(interval) 
            : "`expired`";
    } else {
        timeRemaining = offer.deadline || "unlimited";
    }

    const infoMessage = new InfoMessage({
        channel: message.channel,
        title: `${offer.name} (x${remainingStock} remaining)`,
        desc: `**This offer is currently ${offer.isActive ? "for sale!" : "not for sale."}**
Time Remaining: \`${timeRemaining}\`
Price: ${moneyEmoji}${offer.price.toLocaleString("en")}

__**Contents of Offer:**__`,
        author: message.author,
        fields,
        footer: `Offer ID: ${offer.offerID} • Use cd-buyoffer ${offer.name} to purchase`
    });
    
    return infoMessage.sendMessage({ currentMessage });
}

/**
 * Builds the embed fields for offer contents (cars, packs, fuse tokens)
 */
function buildOfferFields(offer, fuseEmoji) {
    const fields = [];

    if (!offer.offer || typeof offer.offer !== 'object') {
        return fields;
    }

    for (const [key, value] of Object.entries(offer.offer)) {
        switch (key) {
            case "fuseTokens":
                if (typeof value === 'number' && value > 0) {
                    fields.push({
                        name: "Fuse Tokens",
                        value: `${fuseEmoji}${value.toLocaleString("en")}`,
                        inline: true,
                    });
                }
                break;

            case "cars":
                if (Array.isArray(value) && value.length > 0) {
                    const carList = value
                        .map(carID => {
                            const currentCar = getCar(carID);
                            if (!currentCar) {
                                console.warn(`Car not found in offer: ${carID}`);
                                return `Unknown Car (${carID})`;
                            }
                            return carNameGen({ currentCar, rarity: true });
                        })
                        .join("\n");
                    
                    // Handle long car lists that might exceed field limits
                    if (carList.length > 1024) {
                        // Split into multiple fields if necessary
                        const carLines = carList.split("\n");
                        let currentField = "";
                        let fieldCount = 1;
                        
                        for (const line of carLines) {
                            if ((currentField + line + "\n").length > 1000) {
                                fields.push({ 
                                    name: fieldCount === 1 ? "Cars" : `Cars (cont.)`, 
                                    value: currentField.trim(), 
                                    inline: true 
                                });
                                currentField = line + "\n";
                                fieldCount++;
                            } else {
                                currentField += line + "\n";
                            }
                        }
                        if (currentField.trim()) {
                            fields.push({ 
                                name: fieldCount === 1 ? "Cars" : `Cars (cont.)`, 
                                value: currentField.trim(), 
                                inline: true 
                            });
                        }
                    } else {
                        fields.push({ name: "Cars", value: carList, inline: true });
                    }
                }
                break;

            case "pack":
                if (value) {
                    const pack = getPack(value);
                    if (pack) {
                        fields.push({ name: "Pack", value: pack.packName, inline: true });
                    } else {
                        console.warn(`Pack not found in offer: ${value}`);
                        fields.push({ name: "Pack", value: `Unknown Pack (${value})`, inline: true });
                    }
                }
                break;

            case "money":
                if (typeof value === 'number' && value > 0) {
                    const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                    fields.push({
                        name: "Money",
                        value: `${moneyEmoji}${value.toLocaleString("en")}`,
                        inline: true,
                    });
                }
                break;

            default:
                console.warn(`Unknown offer item type: ${key}`);
                break;
        }
    }

    return fields;
}
