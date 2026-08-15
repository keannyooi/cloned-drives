"use strict";

const { StringSelectMenuBuilder } = require("discord.js");
const bot = require("../config/config.js");

const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { getDriver } = require("../util/functions/dataManager.js");
const { rarityOf, isAllActiveRarity, maxLevelFor, getDriverLevel } = require("../util/functions/raceWeekEvents.js");
const processResults = require("../util/functions/corefiles/processResults.js");
const profileModel = require("../models/profileSchema.js");

// Driver tier emotes come from the shared resolver (util/functions/rwEmoji.js).
const { rarityEmoji } = require("../util/functions/rwEmoji.js");

// Display name convention (design doc §5): Name (Variant) (Year), variant omitted when empty.
function driverNameGen(driver, rarity = false) {
    let currentName = `${driver.name}${driver.variant ? ` (${driver.variant})` : ""}`;
    if (rarity) {
        currentName = `${rarityEmoji(driver.rarity)} ${currentName}`;
    }
    return currentName;
}

// A bonus entry is a pure drawback when every non-neutral effect makes the car worse
// (accel and weight are lower-is-better).
function isNetNegative(effects) {
    let hasGood = false, hasBad = false;
    const lowerIsBetter = ["accel", "weight"];
    for (const [stat, value] of Object.entries(effects?.add ?? {})) {
        if (value === 0) continue;
        (lowerIsBetter.includes(stat) ? value < 0 : value > 0) ? hasGood = true : hasBad = true;
    }
    for (const [stat, value] of Object.entries(effects?.mult ?? {})) {
        if (value === 1) continue;
        (lowerIsBetter.includes(stat) ? value < 1 : value > 1) ? hasGood = true : hasBad = true;
    }
    if (typeof effects?.moneyMult === "number" && effects.moneyMult !== 1) {
        effects.moneyMult > 1 ? hasGood = true : hasBad = true;
    }
    return hasBad && !hasGood;
}

module.exports = {
    name: "setdriver",
    aliases: ["sd", "setdrv"],
    usage: ["<driver name>", "-<driver ID>", "random"],
    args: 1,
    category: "Configuration",
    description: "Sets your active driver for the random race (Race Week) gamemode.",
    async execute(message, args) {
        const { raceWeekStats } = await profileModel.findOne({ userID: message.author.id });

        // Lazy-init tolerant reads — old profiles may lack raceWeekStats entirely.
        const stats = (raceWeekStats && typeof raceWeekStats === "object") ? raceWeekStats : {};
        let ownedDrivers = Array.isArray(stats.ownedDrivers) ? stats.ownedDrivers : ["d00000"];
        if (!ownedDrivers.includes("d00000")) {
            ownedDrivers = ["d00000", ...ownedDrivers];
        }
        const driverXP = (stats.driverXP && typeof stats.driverXP === "object") ? stats.driverXP : {};
        // Drop IDs with no matching driver file (e.g. pre-migration v1 IDs).
        const roster = ownedDrivers.filter(driverID => getDriver(driverID));
        if (roster.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, no drivers found in your roster.",
                desc: "This shouldn't happen — even The Rookie seems to have walked out. Please report this using `cd-report`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        if (args[0].toLowerCase() === "random") {
            await setDriver(roster[Math.floor(Math.random() * roster.length)]);
        }
        else {
            let query, searchByID = false;
            if (args[0].toLowerCase().startsWith("-d")) {
                query = [args[0].toLowerCase().slice(1)];
                searchByID = true;
            }
            else {
                query = args.map(i => i.toLowerCase());
            }

            const searchResults = roster.filter(driverID => {
                if (searchByID) {
                    return driverID === query[0];
                }
                const name = driverNameGen(getDriver(driverID)).replace(/[()"]/g, "").toLocaleLowerCase("en").split(" ");
                return query.every(part => name.includes(part.replace(/[()"]/g, "")));
            });

            if (searchResults.length === 0) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, it looks like you don't own a driver like that.",
                    desc: "Check your roster with `cd-paddock`; recruit new drivers through Race Week and events.",
                    author: message.author
                }).displayClosest(query.join(" "), searchByID ? roster : roster.map(driverID => driverNameGen(getDriver(driverID)).toLowerCase()));
                return errorMessage.sendMessage();
            }

            await new Promise(resolve => resolve(processResults(message, searchResults, () => {
                const options = [];
                for (let i = 0; i < searchResults.length; i++) {
                    const driver = getDriver(searchResults[i]);
                    options.push({
                        label: driverNameGen(driver),
                        description: (driver.description || "").slice(0, 100),
                        value: `${i + 1}`
                    });
                }

                return new StringSelectMenuBuilder()
                    .setCustomId("search")
                    .setPlaceholder("Select a driver...")
                    .addOptions(...options);
            }, null)))
                .then(async response => {
                    if (!Array.isArray(response)) return;
                    await setDriver(...response);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function setDriver(driverID, currentMessage) {
            const driver = getDriver(driverID);
            // Rarity v3 level semantics: recruiting = Level 0 (no-minLevel
            // bonuses active), dupes climb the per-rarity curve. Icon/
            // autograph/serialised never level — owning one activates every
            // bonus (getDriverLevel returns Infinity for those tiers).
            const allActive = isAllActiveRarity(driver);
            const level = getDriverLevel({ driverXP }, driverID);

            // Dotted $set is lazy-init tolerant — creates raceWeekStats.activeDriver
            // without clobbering concurrent Race Week writes.
            await profileModel.updateOne({ userID: message.author.id }, {
                "$set": { "raceWeekStats.activeDriver": driverID }
            });

            let bonusList = "";
            for (const bonus of (driver.bonuses ?? [])) {
                const locked = (bonus.minLevel ?? 0) > level;
                let prefix = `${locked ? "🔒 " : ""}${isNetNegative(bonus.effects) ? "⚠ " : ""}`;
                if (!prefix) prefix = "• ";
                let newLine = `${prefix}${bonus.description}`;
                if (locked) {
                    newLine += ` *(unlocks at Level ${bonus.minLevel})*`;
                }
                newLine += "\n";
                if (bonusList.length + newLine.length > 1018) { // discord embed field value limit
                    bonusList += "...etc";
                    break;
                }
                bonusList += newLine;
            }
            if (!bonusList) {
                bonusList = "None — this one races on vibes alone.";
            }

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully set ${driverNameGen(driver, true)} as your random race driver!`,
                desc: allActive
                    ? "Driver Level: `all bonuses active`"
                    : `Driver Level: \`${level}/${maxLevelFor(driver)}\``,
                author: message.author,
                image: driver.image,
                fields: [{ name: "Bonuses", value: bonusList }]
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};
