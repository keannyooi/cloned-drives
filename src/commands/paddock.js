"use strict";

const bot = require("../config/config.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { getDriver } = require("../util/functions/dataManager.js");
const { DRIVER_RARITIES, rarityOf, isAllActiveRarity, maxLevelFor, getDriverLevel } = require("../util/functions/raceWeekEvents.js");
const searchUser = require("../util/functions/searchUser.js");
const listUpdate = require("../util/functions/listUpdate.js");
const botUserError = require("../util/commonerrors/botUserError.js");
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
    name: "paddock",
    aliases: ["pdk", "drivers"],
    usage: ["[user]", "[user] [page number]"],
    args: 0,
    category: "Configuration",
    description: "Shows your (or other people's) Race Week driver roster.",
    async execute(message, args) {
        let user = message.author, page = 1;
        if (args[0] && isNaN(args[0])) {
            let userName;
            if (isNaN(args[args.length - 1])) {
                userName = args.join(" ").toLowerCase();
            }
            else {
                userName = args.slice(0, args.length - 1).join(" ").toLowerCase();
                page = parseInt(args[args.length - 1]);
            }

            if (message.mentions.users.first()) {
                if (!message.mentions.users.first().bot) {
                    try {
                        await loop(message.mentions.users.first(), page);
                    }
                    catch (error) {
                        throw error;
                    }
                }
                else {
                    return botUserError(message);
                }
            }
            else {
                await new Promise(resolve => resolve(searchUser(message, userName)))
                    .then(async response => {
                        if (!Array.isArray(response)) return;
                        let [result, currentMessage] = response;
                        await loop(result.user, page, currentMessage);
                    })
                    .catch(error => {
                        throw error;
                    });
            }
        }
        else {
            if (args[0]) {
                page = parseInt(args[0]);
            }
            try {
                await loop(user, page);
            }
            catch (error) {
                throw error;
            }
        }

        async function loop(user, page, currentMessage) {
            // Parallel fetch when viewing someone else's paddock, single fetch for own (garage H-06 idiom)
            let raceWeekStats, settings;
            if (user.id === message.author.id) {
                const profile = await profileModel.findOne({ userID: user.id });
                raceWeekStats = profile.raceWeekStats;
                settings = profile.settings;
            }
            else {
                const [targetProfile, authorProfile] = await Promise.all([
                    profileModel.findOne({ userID: user.id }),
                    profileModel.findOne({ userID: message.author.id })
                ]);
                raceWeekStats = targetProfile?.raceWeekStats;
                settings = authorProfile.settings;
            }

            // Lazy-init tolerant reads — old profiles may lack raceWeekStats entirely.
            const stats = (raceWeekStats && typeof raceWeekStats === "object") ? raceWeekStats : {};
            let ownedDrivers = Array.isArray(stats.ownedDrivers) ? stats.ownedDrivers : ["d00000"];
            if (!ownedDrivers.includes("d00000")) {
                ownedDrivers = ["d00000", ...ownedDrivers];
            }
            const driverXP = (stats.driverXP && typeof stats.driverXP === "object") ? stats.driverXP : {};

            // Drop IDs with no matching driver file (e.g. pre-migration v1 IDs), sort by rarity desc, then name.
            const roster = ownedDrivers
                .filter(driverID => getDriver(driverID))
                .sort((a, b) => {
                    const driverA = getDriver(a), driverB = getDriver(b);
                    const rarityDiff = (rarityOrder[rarityOf(driverB.rarity)] ?? 0) - (rarityOrder[rarityOf(driverA.rarity)] ?? 0);
                    if (rarityDiff !== 0) return rarityDiff;
                    return driverNameGen(driverA).localeCompare(driverNameGen(driverB));
                });
            const activeDriverID = (typeof stats.activeDriver === "string" && roster.includes(stats.activeDriver)) ? stats.activeDriver : "d00000";
            const activeDriver = getDriver(activeDriverID);

            const totalPages = Math.ceil(roster.length / (settings.listamount || defaultPageLimit));
            if (page < 1 || totalPages < page) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `${user.username}'s paddock ends at page ${totalPages}.`,
                    author: message.author
                }).displayClosest(page);
                return errorMessage.sendMessage({ currentMessage });
            }

            try {
                await listUpdate(roster, page, totalPages, listDisplay, settings, currentMessage);
            }
            catch (error) {
                throw error;
            }

            function listDisplay(section, page, totalPages) {
                let driverList = "", levelList = "";
                for (let i = 0; i < section.length; i++) {
                    driverList += `**${i + 1}.** `;
                    levelList += `**${i + 1}.** `;

                    const driverID = section[i];
                    const driver = getDriver(driverID);
                    driverList += driverNameGen(driver, true);
                    if (driverID === activeDriverID) {
                        driverList += " ⚡";
                    }
                    driverList += "\n";

                    // Roster view = level at a glance only ("Lv. 2/4", or MAX).
                    // Duplicate progress lives in cd-driverinfo, where there's
                    // room to show the whole curve.
                    const xp = driverXP[driverID];
                    const rarity = rarityOf(driver.rarity);
                    if (isAllActiveRarity(rarity)) {
                        levelList += (rarity === "serialised" && typeof xp?.serial === "number")
                            ? `\`Serial #${xp.serial} of ${driver.serialCap}\`\n`
                            : "`All bonuses active`\n";
                    }
                    else {
                        const level = getDriverLevel(stats, driverID), max = maxLevelFor(rarity);
                        levelList += level >= max
                            ? `\`Lv. ${level}/${max} — MAX\`\n`
                            : `\`Lv. ${level}/${max}\`\n`;
                    }
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
                    title: `${user.username}'s Paddock (${roster.length} Driver${roster.length === 1 ? "" : "s"})`,
                    desc: "⚡ = active driver. Use `cd-setdriver` to change drivers and `cd-driverinfo` for bonus details.",
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                    fields: [
                        { name: "Driver", value: driverList, inline: true },
                        { name: "Level", value: levelList, inline: true }
                    ],
                    footer: `Active Driver: ${activeDriver ? driverNameGen(activeDriver) : activeDriverID} | Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                });
            }
        }
    }
};
