"use strict";

const { StringSelectMenuBuilder } = require("discord.js");
const bot = require("../config/config.js");

const { getDriverFiles, getDriver, getCar } = require("../util/functions/dataManager.js");
const { RARITY_CURVES, rarityOf, isAllActiveRarity, maxLevelFor, getDriverLevel } = require("../util/functions/raceWeekEvents.js");
const { RARITY_COLORS } = require("../util/consts/raceWeek.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const processResults = require("../util/functions/corefiles/processResults.js");
const renderDriverCard = require("../util/functions/driverCard.js");
const rwEmoji = require("../util/functions/rwEmoji.js");
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
// (accel and weight are lower-is-better). Tradeoff entries (some good, some bad) are
// NOT flagged — the description is expected to spell out the tradeoff.
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
    name: "driverinfo",
    aliases: ["dinfo"],
    usage: ["<driver name>", "-<driver ID>"],
    args: 1,
    category: "Info",
    description: "Shows info about a specified Race Week driver.",
    async execute(message, args) {
        const driverFiles = getDriverFiles();
        let query = args.map(i => i.toLowerCase()), searchByID = false;
        if (args[0].toLowerCase() === "random") {
            return displayInfo(driverFiles[Math.floor(Math.random() * driverFiles.length)]);
        }
        else if (args[0].toLowerCase().startsWith("-d")) {
            query = [args[0].toLowerCase().slice(1)];
            searchByID = true;
        }

        const searchResults = driverFiles.filter(file => {
            const driver = getDriver(file);
            if (!driver) return false;
            const matchName = searchByID ? file.slice(0, -5) : driverNameGen(driver);
            const test = matchName.replace(/[()"]/g, "").toLocaleLowerCase("en").split(" ");
            return query.every(part => test.includes(part.replace(/[()"']/g, "")));
        });

        if (searchResults.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, driver requested not found.",
                desc: "Well that sucks.",
                author: message.author
            }).displayClosest(query.join(" "), searchByID ? driverFiles.map(f => f.slice(0, -5)) : driverFiles.map(f => driverNameGen(getDriver(f)).toLowerCase()));
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
                await displayInfo(...response);
            })
            .catch(error => {
                throw error;
            });

        async function displayInfo(driverFile, currentMessage) {
            const { raceWeekStats } = await profileModel.findOne({ userID: message.author.id });
            const driver = getDriver(driverFile);
            const driverID = driverFile.slice(0, -5);

            // Lazy-init tolerant reads — old profiles may lack raceWeekStats entirely.
            const stats = (raceWeekStats && typeof raceWeekStats === "object") ? raceWeekStats : {};
            const ownedDrivers = Array.isArray(stats.ownedDrivers) ? stats.ownedDrivers : ["d00000"];
            const owned = ownedDrivers.includes(driverID);
            const xp = (stats.driverXP && typeof stats.driverXP === "object") ? stats.driverXP[driverID] : null;

            // Rarity v3 level semantics (1-BASED): recruiting = Level 1, where
            // every un-gated bonus is already active; duplicates climb the
            // per-rarity curve. Icon/autograph/serialised never level — owning
            // one activates every bonus (level = Infinity). Unowned reads as 0
            // so nothing shows as active.
            const rarity = rarityOf(driver.rarity);
            const allActive = isAllActiveRarity(rarity);
            const maxLevel = maxLevelFor(rarity);
            const curve = RARITY_CURVES[rarity];
            const level = allActive ? Infinity : (owned ? getDriverLevel(stats, driverID) : 0);
            const dupes = xp?.dupes ?? 0;

            let description = "None";
            if (driver.description && driver.description.length > 0) {
                description = driver.description;
            }

            // Each bonus leads with the level that unlocks it, mirroring the
            // Levelling list — so "what do I get, and when?" is one glance
            // rather than a parenthetical at the end of a long line.
            //   ✅ = active for you   🔒 = owned but not levelled far enough
            //   ▫️ = you don't own this driver
            let bonusList = "";
            for (const bonus of (driver.bonuses ?? [])) {
                const needLevel = bonus.minLevel ?? 1;   // 1 = active on ownership
                const active = owned && (allActive || level >= needLevel);
                const marker = !owned
                    ? "▫️"
                    : (active ? rwEmoji("levelUnlocked") : rwEmoji("levelLocked"));
                const warn = isNetNegative(bonus.effects) ? "⚠ " : "";

                // No duplicate cost here — the Levelling list directly above
                // already spells out what each level costs.
                let newLine = allActive
                    // These tiers never level — a level label would mislead.
                    ? `${marker} ${warn}${bonus.description}`
                    : `${marker} **Lv ${needLevel}** — ${warn}${bonus.description}`;

                newLine += "\n";
                if (bonusList.length + newLine.length > 1018) { // discord embed field value limit
                    bonusList += "...etc";
                    break;
                }
                bonusList += newLine;
            }
            if (!bonusList) {
                bonusList = "None";
            }

            const rarityDisplay = `${rarityEmoji(rarity)} ${rarity.charAt(0).toUpperCase() + rarity.slice(1)}`.trim();
            const fields = [
                { name: "Rarity", value: rarityDisplay, inline: true },
                { name: "In Rotation?", value: driver.inRotation ? "Yes" : "No", inline: true },
                { name: "Creator", value: driver.creator ?? "None", inline: true }
            ];
            if (driver.variant) {
                fields.push({ name: "Variant", value: driver.variant, inline: true });
            }
            if (driver.collection) {
                fields.push({ name: "Collection", value: driver.collection, inline: true });
            }
            if (rarity === "serialised" && owned && typeof xp?.serial === "number") {
                fields.push({ name: "Serial", value: `#${xp.serial} of ${driver.serialCap}`, inline: true });
            }

            // Levelling: spell out the whole curve so an UNOWNED card still
            // tells you what the journey costs, and an owned one shows exactly
            // how far along it you are. (Duplicate detail lives here rather
            // than in cd-paddock, which only has room for the level itself.)
            if (allActive) {
                fields.push({
                    name: "Levelling",
                    value: `${rarity.charAt(0).toUpperCase() + rarity.slice(1)} cards don't level — **owning one activates every bonus immediately**.`
                });
            }
            else {
                // Levels are 1-based: owning the card is Level 1, so curve[0]
                // (the first duplicate threshold) is what reaches Level 2.
                const reachedMark = rwEmoji("levelUnlocked");
                const steps = [`${owned ? reachedMark : "▫️"} Level 1 — recruit the driver`].concat(
                    curve.map((needed, index) => {
                        const stepLevel = index + 2;
                        const reached = owned && level >= stepLevel;
                        return `${reached ? reachedMark : "▫️"} Level ${stepLevel} — ${needed} dupe${needed === 1 ? "" : "s"}`;
                    })
                ).join("\n");
                let progress;
                if (!owned) {
                    progress = `Not owned yet. Recruiting them is **Level 1**; duplicates climb to a max of **Level ${maxLevel}**.`;
                }
                else if (level >= maxLevel) {
                    progress = `**MAX** — Level ${maxLevel} with ${dupes} duplicate${dupes === 1 ? "" : "s"}. Further copies convert to money.`;
                }
                else {
                    const nextNeeded = curve[level - 1];
                    progress = `Currently **Level ${level}/${maxLevel}** with **${dupes}** duplicate${dupes === 1 ? "" : "s"} — **${nextNeeded - dupes}** more to reach Level ${level + 1}.`;
                }
                fields.push({ name: "Levelling", value: `${progress}\n${steps}` });
            }

            // Bonuses tied to specific cars only get a pointer here — the full
            // list lives in cd-starcars, so a ten-car group can't bury the card.
            const starCarCount = (driver.bonuses ?? [])
                .filter(bonus => bonus.cond && Array.isArray(bonus.cond.carID) && bonus.cond.carID.length > 0)
                .reduce((sum, bonus) => sum + bonus.cond.carID.length, 0);
            if (starCarCount > 0) {
                const hint = `\n⭐ *${starCarCount} star car${starCarCount === 1 ? "" : "s"} — see them with* \`cd-starcars ${driver.name.toLowerCase()}\``;
                if (bonusList.length + hint.length <= 1024) bonusList += hint;
            }

            fields.push(
                { name: "Bonuses", value: bonusList },
                { name: "Description", value: description }
            );

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: driverNameGen(driver),
                desc: `Driver ID: \`${driverID}\``,
                author: message.author,
                image: driver.image,
                fields
            });

            // Tint the embed to the card's own rarity colour so the art and the
            // bot read as one object (RARITY_COLORS mirrors the card palette).
            if (RARITY_COLORS[rarity] !== undefined) {
                infoMessage.editEmbed({ color: RARITY_COLORS[rarity] });
            }

            if (owned) {
                const levelDisplay = allActive
                    ? "All bonuses active"
                    : `Level ${level}/${maxLevel} • ${dupes} dupe${dupes === 1 ? "" : "s"}`;
                infoMessage.editEmbed({ footer: `✅ You own this driver! (${levelDisplay})` });
            }
            else {
                infoMessage.editEmbed({ footer: "❌ You don't own this driver yet." });
            }

            // Serialised copies get their unique mint number stamped onto the
            // card art at render time — one image file serves every copy.
            // Falls back to the plain image URL if the render fails.
            if (rarity === "serialised" && owned && typeof xp?.serial === "number") {
                const stamped = await renderDriverCard(driver, xp.serial);
                if (stamped) {
                    return infoMessage.sendMessage({ currentMessage, attachment: stamped });
                }
            }
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};
