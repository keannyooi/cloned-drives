"use strict";

/**
 * STAR CARS
 * =========
 * Lists the specific cars a driver's `carID` bonuses key off, grouped by the
 * level that unlocks each group. Split out of cd-driverinfo so a driver with a
 * ten-car star group doesn't bury the rest of their card.
 */

const { getDriverFiles, getDriver, getCar } = require("../util/functions/dataManager.js");
const { rarityOf, isAllActiveRarity, driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const { RARITY_COLORS } = require("../util/consts/raceWeek.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { rarityEmoji } = require("../util/functions/rwEmoji.js");
const rwEmoji = require("../util/functions/rwEmoji.js");
const carNameGen = require("../util/functions/carNameGen.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "starcars",
    aliases: ["stars", "signaturecars"],
    usage: ["<driver name>", "-<driver ID>"],
    args: 1,
    category: "Info",
    description: "Lists the specific cars a driver's bonuses are tied to, grouped by unlock level.",
    async execute(message, args) {
        const drivers = getDriverFiles().map(file => getDriver(file)).filter(Boolean);
        const query = args.join(" ").toLowerCase().replace(/^-/, "");

        const matches = drivers.filter(driver => {
            if (driver.driverID.toLowerCase() === query) return true;
            const haystack = `${driver.name} ${driver.variant || ""} ${driver.rarity}`.toLowerCase();
            return haystack.includes(query);
        });

        if (matches.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, driver requested not found.",
                desc: "Check the roster with `cd-driverlist`.",
                author: message.author
            }).displayClosest(query, drivers.map(driver => driverDisplayName(driver).toLowerCase()));
            return errorMessage.sendMessage();
        }
        if (matches.length > 1) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, multiple drivers matched.",
                desc: `Be more specific:\n${matches.slice(0, 10).map(driver => `• ${driverDisplayName(driver)} \`(${driver.driverID})\``).join("\n")}`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const driver = matches[0];
        const rarity = rarityOf(driver.rarity);
        const allActive = isAllActiveRarity(rarity);

        // What level has the player reached? Drives the unlocked/locked marks.
        const { raceWeekStats } = await profileModel.findOne({ userID: message.author.id });
        const stats = (raceWeekStats && typeof raceWeekStats === "object") ? raceWeekStats : {};
        const owned = (Array.isArray(stats.ownedDrivers) ? stats.ownedDrivers : []).includes(driver.driverID);
        const xp = (stats.driverXP && typeof stats.driverXP === "object") ? stats.driverXP[driver.driverID] : null;
        const { levelFromDupes } = require("../util/functions/raceWeekEvents.js");
        const level = owned ? (allActive ? Infinity : levelFromDupes(xp?.dupes ?? 0, rarity)) : 0;

        // One field per carID-keyed bonus, in level order.
        const groups = (driver.bonuses ?? [])
            .filter(bonus => bonus.cond && Array.isArray(bonus.cond.carID) && bonus.cond.carID.length > 0)
            .sort((a, b) => (a.minLevel ?? 1) - (b.minLevel ?? 1));

        if (groups.length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `${rarityEmoji(driver)} ${driverDisplayName(driver)}`,
                desc: "This driver has no star cars — none of their bonuses are tied to specific cars.",
                author: message.author
            });
            if (RARITY_COLORS[rarity] !== undefined) infoMessage.editEmbed({ color: RARITY_COLORS[rarity] });
            return infoMessage.sendMessage();
        }

        const fields = groups.slice(0, 24).map(bonus => {
            const needLevel = bonus.minLevel ?? 1;
            const unlocked = owned && (allActive || level >= needLevel);
            const marker = !owned ? "▫️" : (unlocked ? rwEmoji("levelUnlocked") : rwEmoji("levelLocked"));

            let value = "";
            let omitted = 0;
            const names = bonus.cond.carID
                .map(id => {
                    const car = getCar(id);
                    return car ? carNameGen({ currentCar: car, rarity: true, removePrizeTag: true }) : `\`${id}\` *(missing)*`;
                })
                .sort((a, b) => a.localeCompare(b));
            for (const name of names) {
                if (value.length + name.length + 1 > 1000) { omitted++; continue; }
                value += (value ? "\n" : "") + name;
            }
            if (omitted > 0) value += `\n*…and ${omitted} more*`;

            return {
                name: allActive
                    ? `${marker} ${bonus.description}`.slice(0, 250)
                    : `${marker} Lv ${needLevel} — ${bonus.description}`.slice(0, 250),
                value: value || "None"
            };
        });

        const totalCars = groups.reduce((sum, bonus) => sum + bonus.cond.carID.length, 0);
        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: `⭐ Star Cars — ${driverDisplayName(driver)}`,
            desc: `${rarityEmoji(driver)} **${rarity.charAt(0).toUpperCase() + rarity.slice(1)}** • `
                + `${totalCars} star car${totalCars === 1 ? "" : "s"} across ${groups.length} bonus${groups.length === 1 ? "" : "es"}.\n`
                + (owned ? "" : "*You don't own this driver yet.*"),
            author: message.author,
            fields
        });
        if (RARITY_COLORS[rarity] !== undefined) infoMessage.editEmbed({ color: RARITY_COLORS[rarity] });
        return infoMessage.sendMessage();
    }
};
