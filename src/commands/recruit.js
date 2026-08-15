"use strict";

/**
 * DRIVER RECRUITMENT SHOP
 * =======================
 * A permanent cash sink for selected drivers. The price of the NEXT copy
 * scales exponentially with the copies you already own, so levelling a driver
 * with money alone is a long, deliberate haul (see RECRUIT in consts/raceWeek).
 *
 * `cd-recruit`          — browse every recruitable driver, priced for YOU
 * `cd-recruit <name>`   — inspect one and buy it (confirmation required)
 *
 * A driver appears here iff its JSON carries `recruitPrice`. Drivers flagged
 * `recruitExclusive` are shop/offer purchases only — they're blocked from the
 * weekly rotation, Driver Scout, pack drops and every reward path.
 */

const bot = require("../config/config.js");
const { moneyEmojiID, defaultPageLimit } = require("../util/consts/consts.js");
const { getDriverFiles, getDriver } = require("../util/functions/dataManager.js");
const {
    rarityOf, isAllActiveRarity, maxLevelFor, levelFromDupes,
    recruitPriceFor, copiesOwnedOf, driverDisplayName
} = require("../util/functions/raceWeekEvents.js");
const { RARITY_COLORS } = require("../util/consts/raceWeek.js");
const { ErrorMessage, InfoMessage, SuccessMessage } = require("../util/classes/classes.js");
const listUpdate = require("../util/functions/listUpdate.js");
const confirm = require("../util/functions/confirm.js");
const profileModel = require("../models/profileSchema.js");

const { rarityEmoji } = require("../util/functions/rwEmoji.js");

/** Every driver currently sold in the shop, cheapest base price first. */
function recruitableDrivers() {
    return getDriverFiles()
        .map(file => getDriver(file))
        .filter(driver => driver && typeof driver.recruitPrice === "number")
        .sort((a, b) => a.recruitPrice - b.recruitPrice
            || driverDisplayName(a).localeCompare(driverDisplayName(b)));
}

module.exports = {
    name: "recruit",
    aliases: ["recruitment", "drivershop"],
    usage: ["", "[page number]", "<driver name>"],
    args: 0,
    category: "Gameplay",
    description: "Browse the driver recruitment shop, or recruit a driver. Prices rise the more copies of that driver you own.",
    async execute(message, args) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const roster = recruitableDrivers();

        if (roster.length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "The recruitment office is empty.",
                desc: "No drivers are currently available to recruit. Check back soon!",
                author: message.author
            });
            return infoMessage.sendMessage();
        }

        const playerData = await profileModel.findOne({ userID: message.author.id });
        const stats = (playerData.raceWeekStats && typeof playerData.raceWeekStats === "object") ? playerData.raceWeekStats : {};
        const settings = playerData.settings || {};

        // ── BROWSE ───────────────────────────────────────────────────────────
        // No args, or a lone page number.
        if (args.length === 0 || (args.length === 1 && !isNaN(args[0]))) {
            const page = args.length ? parseInt(args[0]) : 1;
            const totalPages = Math.ceil(roster.length / (settings.listamount || defaultPageLimit));
            if (isNaN(page) || page < 1 || totalPages < page) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `The recruitment list ends at page ${totalPages}.`,
                    author: message.author
                }).displayClosest(page);
                return errorMessage.sendMessage();
            }
            return listUpdate(roster, page, totalPages, listDisplay, settings);
        }

        // ── RECRUIT ONE ──────────────────────────────────────────────────────
        const query = args.join(" ").toLowerCase();
        const matches = roster.filter(driver => {
            const haystack = `${driver.name} ${driver.variant || ""} ${driver.rarity} ${driver.driverID}`.toLowerCase();
            return haystack.includes(query) || driver.driverID.toLowerCase() === query.replace(/^-/, "");
        });

        if (matches.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, no recruitable driver found.",
                desc: "Run `cd-recruit` to see who's available. Drivers not listed there can't be recruited with money.",
                author: message.author
            }).displayClosest(query, roster.map(driver => driverDisplayName(driver).toLowerCase()));
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
        const copies = copiesOwnedOf(stats, driver.driverID);
        const price = recruitPriceFor(driver, copies);
        const rarity = rarityOf(driver);
        const owned = copies > 0;

        // Already maxed? Buying further copies would only convert to money.
        const dupes = Math.max(0, copies - 1);
        const level = isAllActiveRarity(rarity) ? null : levelFromDupes(dupes, rarity);
        const maxLevel = maxLevelFor(driver);
        const maxedOut = !isAllActiveRarity(rarity) && level >= maxLevel;

        if (maxedOut) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: `${driverDisplayName(driver)} is already at maximum level.`,
                desc: `You've taken them to **Level ${maxLevel}** — there's nothing left to unlock, so recruiting another copy would be wasted money.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        if (playerData.money < price) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, you can't afford this driver.",
                author: message.author,
                fields: [
                    { name: "Recruitment Fee", value: `${moneyEmoji}${price.toLocaleString("en")}`, inline: true },
                    { name: "Your Balance", value: `${moneyEmoji}${playerData.money.toLocaleString("en")}`, inline: true },
                    { name: "Short By", value: `${moneyEmoji}${(price - playerData.money).toLocaleString("en")}`, inline: true }
                ]
            });
            return errorMessage.sendMessage();
        }

        const nextPrice = recruitPriceFor(driver, copies + 1);
        // Lead the description with the driver's name: confirm() replaces the
        // TITLE with "Action cancelled.", so anything only in the title is lost
        // the moment someone backs out.
        const outcome = owned
            ? `**${driverDisplayName(driver)}** — copy **#${copies + 1}**, banking a duplicate toward **Level ${Math.min((level ?? 0) + 1, maxLevel)}**.`
            : `**${driverDisplayName(driver)}** — your **first copy**. They'll join your paddock immediately.`;

        const fields = [
            { name: "Rarity", value: `${rarityEmoji(driver)} ${rarity.charAt(0).toUpperCase() + rarity.slice(1)}`, inline: true },
            { name: "Recruitment Fee", value: `${moneyEmoji}${price.toLocaleString("en")}`, inline: true },
            { name: "Your Balance", value: `${moneyEmoji}${playerData.money.toLocaleString("en")}`, inline: true },
            { name: "You Own", value: owned ? `${copies} cop${copies === 1 ? "y" : "ies"}${level !== null ? ` (Level ${level}/${maxLevel})` : ""}` : "None", inline: true },
            { name: "Next Copy Costs", value: `${moneyEmoji}${nextPrice.toLocaleString("en")}`, inline: true }
        ];
        if (driver.bonuses && driver.bonuses.length) {
            fields.push({
                name: "Bonuses",
                value: driver.bonuses.map(bonus => `• ${bonus.description}`).join("\n").slice(0, 1018) || "None"
            });
        }

        const confirmationMessage = new InfoMessage({
            channel: message.channel,
            title: `Recruit ${driverDisplayName(driver)}?`,
            desc: outcome,
            author: message.author,
            image: driver.image || null,
            fields
        });
        if (RARITY_COLORS[rarity] !== undefined) {
            confirmationMessage.editEmbed({ color: RARITY_COLORS[rarity] });
        }

        await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle);

        async function acceptedFunction(reactionMessage) {
            // Re-read: the confirmation window is live, and money/copies can
            // move underneath us (a race win paying out, another purchase).
            const fresh = await profileModel.findOne({ userID: message.author.id });
            const freshStats = (fresh.raceWeekStats && typeof fresh.raceWeekStats === "object") ? fresh.raceWeekStats : {};
            const freshCopies = copiesOwnedOf(freshStats, driver.driverID);
            const freshPrice = recruitPriceFor(driver, freshCopies);

            if (fresh.money < freshPrice) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you can no longer afford this driver.",
                    desc: `The fee is ${moneyEmoji}${freshPrice.toLocaleString("en")} and your balance is ${moneyEmoji}${fresh.money.toLocaleString("en")}.`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage: reactionMessage });
            }

            const update = { "$inc": { money: -freshPrice } };
            let resultLine;
            if (freshCopies === 0) {
                update["$addToSet"] = { "raceWeekStats.ownedDrivers": { "$each": ["d00000", driver.driverID] } };
                resultLine = `**${driverDisplayName(driver)}** joins your paddock! Put them in the seat with \`cd-setdriver\`.`;
            }
            else {
                const newDupes = Math.max(0, freshCopies - 1) + 1;
                const newLevel = levelFromDupes(newDupes, rarityOf(driver));
                update["$set"] = { [`raceWeekStats.driverXP.${driver.driverID}`]: { dupes: newDupes, level: newLevel } };
                const oldLevel = levelFromDupes(newDupes - 1, rarityOf(driver));
                resultLine = newLevel > oldLevel
                    ? `⬆️ **${driverDisplayName(driver)}** reaches **Level ${newLevel}**!`
                    : `📈 Duplicate banked — **${driverDisplayName(driver)}** now has ${newDupes} duplicate${newDupes === 1 ? "" : "s"}.`;
            }
            await profileModel.updateOne({ userID: message.author.id }, update);

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully recruited ${driverDisplayName(driver)}!`,
                desc: resultLine,
                author: message.author,
                // Show off the card they just paid for (once art exists).
                image: driver.image || null,
                fields: [
                    { name: "Fee Paid", value: `${moneyEmoji}${freshPrice.toLocaleString("en")}`, inline: true },
                    { name: "Your Balance", value: `${moneyEmoji}${(fresh.money - freshPrice).toLocaleString("en")}`, inline: true },
                    { name: "Next Copy Costs", value: `${moneyEmoji}${recruitPriceFor(driver, freshCopies + 1).toLocaleString("en")}`, inline: true }
                ]
            });
            return successMessage.sendMessage({ currentMessage: reactionMessage });
        }

        function listDisplay(section, page, totalPages) {
            let list = "";
            for (let i = 0; i < section.length; i++) {
                const entry = section[i];
                const copiesHeld = copiesOwnedOf(stats, entry.driverID);
                const entryPrice = recruitPriceFor(entry, copiesHeld);
                list += `**${i + 1}.** ${rarityEmoji(entry)} ${driverDisplayName(entry)} — ${moneyEmoji}${entryPrice.toLocaleString("en")}`;
                if (copiesHeld > 0) list += ` \`(owned ×${copiesHeld})\``;
                list += "\n";
            }
            if (list.length > 1024) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "This page has too many characters and thus cannot be shown due to Discord's embed limitations.",
                    desc: "Try turning on `Shortened Lists` in `cd-settings`.",
                    author: message.author
                });
            }
            return new InfoMessage({
                channel: message.channel,
                title: "Driver Recruitment",
                desc: "Prices shown are **your** next-copy price — each copy you own makes the next one dearer.\nRecruit with `cd-recruit <driver name>`.",
                author: message.author,
                fields: [{ name: `Available Drivers (Page ${page} of ${totalPages})`, value: list }],
                footer: `Your balance: ${playerData.money.toLocaleString("en")}`
            });
        }
    }
};
