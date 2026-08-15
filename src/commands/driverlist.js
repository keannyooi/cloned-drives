"use strict";

const bot = require("../config/config.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const { getDriverFiles, getDriver } = require("../util/functions/dataManager.js");
const { DRIVER_RARITIES, rarityOf } = require("../util/functions/raceWeekEvents.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");

// Rarity v3: sort weight from the canonical ascending tier list
// (base < rare < secret < divine < icon < autograph < serialised).
const rarityOrder = Object.fromEntries(DRIVER_RARITIES.map((rarity, i) => [rarity, i]));

// L-02 idiom: cache emoji lookups at module level (populated on first call).
// The four levelling tiers reuse the car-rarity colour ramp (base→standard,
// rare→rare, secret→epic, divine→legendary — same mapping as the legacy
// migration); the three chase tiers have no custom emojis yet, so they get
// distinct unicode marks instead.
const { rarityEmoji } = require("../util/functions/rwEmoji.js");

// Display name convention (design doc §5): Name (Variant) (Year), variant omitted when empty.
function driverNameGen(driver, rarity = false) {
    let currentName = `${driver.name}${driver.variant ? ` (${driver.variant})` : ""}`;
    if (rarity) {
        currentName = `${rarityEmoji(driver.rarity)} ${currentName}`;
    }
    return currentName;
}

module.exports = {
    name: "driverlist",
    aliases: ["alldrivers", "dlist"],
    usage: ["", "[page number]", "[collection]", "[collection] [page number]"],
    args: 0,
    category: "Info",
    description: "Shows all the Race Week drivers that are available in Cloned Drives in list form. Optionally filters by collection.",
    async execute(message, args) {
        const driverFiles = getDriverFiles();

        // Arg shape: a trailing number is always the page; any non-numeric
        // words before (or without) it form a collection filter.
        let page = 1, collectionQuery = null;
        if (args.length) {
            let words = args;
            if (!isNaN(args[args.length - 1])) {
                page = parseInt(args[args.length - 1]);
                words = args.slice(0, -1);
            }
            if (words.length) {
                collectionQuery = words.join(" ").toLowerCase();
            }
        }

        let collectionName = null;
        if (collectionQuery !== null) {
            const match = driverFiles
                .map(file => getDriver(file))
                .find(driver => typeof driver?.collection === "string" && driver.collection.toLowerCase() === collectionQuery);
            if (!match) {
                const collections = [...new Set(driverFiles
                    .map(file => getDriver(file)?.collection)
                    .filter(collection => typeof collection === "string" && collection.length > 0))];
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, driver collection requested not found.",
                    desc: collections.length
                        ? `Available collections: ${collections.map(collection => `\`${collection}\``).join(", ")}`
                        : "No driver collections exist yet.",
                    author: message.author
                }).displayClosest(collectionQuery, collections.map(collection => collection.toLowerCase()));
                return errorMessage.sendMessage();
            }
            collectionName = match.collection;
        }

        const { raceWeekStats, settings } = await profileModel.findOne({ userID: message.author.id });
        const stats = (raceWeekStats && typeof raceWeekStats === "object") ? raceWeekStats : {};
        const ownedDrivers = Array.isArray(stats.ownedDrivers) ? stats.ownedDrivers : ["d00000"];

        // Filter by collection (when requested), then sort by rarity
        // (descending, chase tiers first), then by display name.
        const list = driverFiles
            .filter(file => {
                if (collectionQuery === null) return true;
                const driver = getDriver(file);
                return typeof driver?.collection === "string" && driver.collection.toLowerCase() === collectionQuery;
            })
            .sort((a, b) => {
                const driverA = getDriver(a), driverB = getDriver(b);
                const rarityDiff = (rarityOrder[rarityOf(driverB.rarity)] ?? 0) - (rarityOrder[rarityOf(driverA.rarity)] ?? 0);
                if (rarityDiff !== 0) return rarityDiff;
                return driverNameGen(driverA).localeCompare(driverNameGen(driverB));
            });
        const ownedCount = list.filter(file => ownedDrivers.includes(file.slice(0, -5))).length;

        const totalPages = Math.ceil(list.length / (settings.listamount || defaultPageLimit));
        if (isNaN(page) || page < 1 || totalPages < page) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested invalid.",
                desc: `The driver list ends at page ${totalPages}.`,
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }

        try {
            await listUpdate(list, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let driverList = "";
            for (let i = 0; i < section.length; i++) {
                const driverFile = section[i];
                const driver = getDriver(driverFile);
                driverList += `**${i + 1}.** ${driverNameGen(driver, true)}`;
                // Collection tag — redundant while already filtering to one collection.
                if (driver.collection && collectionQuery === null) {
                    driverList += ` \`[${driver.collection}]\``;
                }
                if (driver.inRotation) {
                    driverList += " 🔄";
                }
                driverList += ownedDrivers.includes(driverFile.slice(0, -5)) ? " ✅\n" : "\n";
            }
            if (driverList.length > 1024) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "This page has too many characters and thus cannot be shown due to Discord's embed limitations.",
                    desc: "Try turning on `Shortened Lists` in `cd-settings`.",
                    author: message.author,
                    fields: [{ name: `Amount of Characters in Page ${page}`, value: `\`${driverList.length}\` (> 1024)` }]
                });
                return errorMessage;
            }

            return new InfoMessage({
                channel: message.channel,
                title: collectionName
                    ? `List of Drivers in the "${collectionName}" Collection (${ownedCount}/${list.length} Drivers Owned)`
                    : `List of All Drivers in Cloned Drives (${ownedCount}/${list.length} Drivers Owned)`,
                desc: "🔄 = in the weekly rotation (rung-250 prize / Driver Scout pool).\nUse `cd-driverinfo` to view a driver's bonuses.",
                author: message.author,
                thumbnail: message.author.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [{ name: "Driver", value: driverList, inline: true }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
        }
    }
};
