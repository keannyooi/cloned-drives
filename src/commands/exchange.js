"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultWaitTime, defaultChoiceTime, trophyEmojiID, defaultPageLimit } = require("../util/consts/consts.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const { exchangePool } = require("../util/functions/cardType.js");
const carNameGen = require("../util/functions/carNameGen.js");
const calcTotal = require("../util/functions/calcTotal.js");
const updateHands = require("../util/functions/updateHands.js");
const addCars = require("../util/functions/addCars.js");
const confirm = require("../util/functions/confirm.js");
const listUpdate = require("../util/functions/listUpdate.js");
const paginate = require("../util/functions/paginate.js");
const getButtons = require("../util/functions/getButtons.js");
const { getAvailableTunes } = require("../util/functions/calcTune.js");
const { trackExchange } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");

const DUPE_PAGE_SIZE = 25; // Discord select menus cap at 25 options

module.exports = {
    name: "exchange",
    aliases: ["ex", "prizeexchange"],
    usage: ["", "market", "market [page number]"],
    args: 0,
    category: "Gameplay",
    description: "Exchange a duplicate prize car for another currently-exchangeable prize car you don't own (within 50 CR). `cd-exchange market` browses everything currently exchangeable.",
    async execute(message, args) {
        const playerData = await getProfile(message.author.id);
        const settings = playerData.settings;
        const pageLimit = settings.listamount || defaultPageLimit;

        // EXCHANGE TAG (2026-09-01, user design): a prize car is a legal
        // exchange TARGET only while its carfile carries "Exchange" in
        // hiddenTag. New prize cars ship untagged, so nothing is reachable
        // before its event has run (246 of 524 were, before this); the admin
        // opens a car by adding the tag and can re-lock it by removing it
        // (e.g. before re-running an event). GIVING a dupe away is never
        // restricted — only what it can become. Raw ownership was tried and
        // rejected as the signal: old-exchange leaks left cars owned by 1-2
        // players that were never actually awarded.
        const isExchangeOpen = car => (car.hiddenTag || []).some(tag => String(tag).toLowerCase() === "exchange");

        // The market: every exchange-open prize car, best (highest CR) first.
        const taggedPool = [];
        for (const file of getCarFiles()) {
            const carID = file.slice(0, 6);
            const car = getCar(carID);
            if (car && exchangePool(car) === "prize" && isExchangeOpen(car)) {
                taggedPool.push({ carID, car });
            }
        }
        taggedPool.sort((a, b) => b.car.cr - a.car.cr);

        const ownsCopy = carID => {
            const owned = playerData.garage.find(c => c.carID === carID);
            return owned && calcTotal(owned) > 0;
        };

        // ── Read-only market browser: cd-exchange market [page] ──────────────
        if (args[0] && ["market", "list"].includes(args[0].toLowerCase())) {
            return showMarket(args[1] ? parseInt(args[1]) : 1);
        }

        // ── Interactive flow ─────────────────────────────────────────────────
        // Every duplicate prize car, with its personal target list precomputed
        // (tag-gated, ±50 CR, not already owned) so screen 1 can show what each
        // dupe unlocks BEFORE the player commits to one.
        const duplicates = [];
        for (const garageCar of playerData.garage) {
            const carData = getCar(garageCar.carID);
            // Prize-pool cards only — diamonds have their own exchange
            // (cd-diamondexchange) and BOSS cars are exchange-locked.
            if (exchangePool(carData) !== "prize") continue;
            const totalOwned = calcTotal(garageCar);
            if (totalOwned < 2) continue;
            const targets = taggedPool.filter(({ carID, car }) =>
                Math.abs(car.cr - carData.cr) <= 50 && !ownsCopy(carID));
            duplicates.push({ garageCar, carData, totalOwned, targets });
        }
        duplicates.sort((a, b) => b.carData.cr - a.carData.cr);

        if (duplicates.length === 0) {
            // Not a dead end: show the market anyway so players learn what's
            // worth hunting dupes for.
            return showMarket(1, "You have no duplicate prize cars to trade in right now — here's what's currently on the market.");
        }

        const tradeable = duplicates.filter(d => d.targets.length > 0);
        if (tradeable.length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "None of your duplicates can be exchanged right now.",
                desc: duplicates.map(d => `${carNameGen({ currentCar: d.carData, rarity: true, removePrizeTag: true })} ×${d.totalOwned} — no targets in range`).join("\n")
                    + "\n\nNothing currently exchangeable sits within ±50 CR of these that you don't already own. Browse the market with `cd-exchange market`.",
                author: message.author
            });
            return infoMessage.sendMessage();
        }

        // ── Screen state machine ─────────────────────────────────────────────
        // Screen 1: pick a dupe (shows what each unlocks). Screen 2: browse
        // that dupe's market, pages of `pageLimit`, pick from a dropdown —
        // typing is gone, so typo/owned/CR errors are structurally impossible.
        // Back on screen 2 returns to screen 1 without re-running the command.
        let screen = 1, dupePage = 1, targetPage = 1, chosenDupe = null;
        let currentMessage = null;
        const filter = i => i.user.id === message.author.id;

        const navRow = (page, totalPages) => {
            const { firstPage, prevPage, nextPage, lastPage } = getButtons("menu", settings.buttonstyle);
            firstPage.setDisabled(page === 1);
            prevPage.setDisabled(page === 1);
            nextPage.setDisabled(page === totalPages);
            lastPage.setDisabled(page === totalPages);
            return new ActionRowBuilder().addComponents(firstPage, prevPage, nextPage, lastPage);
        };
        const backCancelRow = withBack => {
            const row = new ActionRowBuilder();
            if (withBack) {
                row.addComponents(new ButtonBuilder().setCustomId("exBack").setLabel("← Back").setStyle(ButtonStyle.Secondary));
            }
            row.addComponents(new ButtonBuilder().setCustomId("exCancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary));
            return row;
        };

        const renderScreenOne = () => {
            const totalPages = Math.ceil(tradeable.length / DUPE_PAGE_SIZE);
            const section = paginate(tradeable, dupePage, DUPE_PAGE_SIZE);
            const lines = section.map((d, i) =>
                `**${(dupePage - 1) * DUPE_PAGE_SIZE + i + 1}.** ${carNameGen({ currentCar: d.carData, rarity: true, removePrizeTag: true })} ×${d.totalOwned} — **${d.targets.length} option${d.targets.length === 1 ? "" : "s"}**`);

            const fields = [];
            const untradeable = duplicates.filter(d => d.targets.length === 0);
            if (untradeable.length > 0 && dupePage === 1) {
                let value = untradeable.map(d => `${carNameGen({ currentCar: d.carData, removePrizeTag: true })} ×${d.totalOwned}`).join(", ");
                if (value.length > 1000) value = value.slice(0, 1000) + "…";
                fields.push({ name: "Not exchangeable right now (no targets in range)", value });
            }

            const dropdown = new StringSelectMenuBuilder()
                .setCustomId("exDupeSelect")
                .setPlaceholder("Select a duplicate to trade in...")
                .addOptions(...section.map((d, i) => ({
                    label: `${carNameGen({ currentCar: d.carData, removePrizeTag: true })} (x${d.totalOwned})`.slice(0, 100),
                    description: `CR: ${d.carData.cr} | ${d.targets.length} option${d.targets.length === 1 ? "" : "s"} available`,
                    value: `${(dupePage - 1) * DUPE_PAGE_SIZE + i}`,
                    emoji: `<trophies:${trophyEmojiID}>`
                })));

            const embed = new InfoMessage({
                channel: message.channel,
                title: "Prize Car Exchange",
                desc: "Pick a duplicate to trade in — each shows how many cars it can currently get you.\n\n" + lines.join("\n"),
                author: message.author,
                fields,
                footer: `${totalPages > 1 ? `Page ${dupePage} of ${totalPages} • ` : ""}Browse everything with cd-exchange market • ${defaultWaitTime / 1000}s to choose`
            });
            const rows = [new ActionRowBuilder().addComponents(dropdown)];
            if (totalPages > 1) rows.push(navRow(dupePage, totalPages));
            rows.push(backCancelRow(false));
            return { embed, rows, totalPages };
        };

        const renderScreenTwo = () => {
            const { carData, totalOwned, targets } = chosenDupe;
            const totalPages = Math.ceil(targets.length / pageLimit);
            const section = paginate(targets, targetPage, pageLimit);
            const lines = section.map(({ car }, i) =>
                `**${(targetPage - 1) * pageLimit + i + 1}.** ${carNameGen({ currentCar: car, rarity: true, removePrizeTag: true })}`);

            const dropdown = new StringSelectMenuBuilder()
                .setCustomId("exTargetSelect")
                .setPlaceholder("Select the car you want to receive...")
                .addOptions(...section.map(({ carID, car }) => ({
                    label: carNameGen({ currentCar: car, removePrizeTag: true }).slice(0, 100),
                    description: `CR: ${car.cr} | ${car.tyreType || "Standard"} tyres`,
                    value: carID,
                    emoji: `<trophies:${trophyEmojiID}>`
                })));

            const embed = new InfoMessage({
                channel: message.channel,
                title: `Trade in: ${carNameGen({ currentCar: carData, removePrizeTag: true })} (x${totalOwned})`,
                desc: `**${targets.length} car${targets.length === 1 ? "" : "s"}** available for it — CR ${carData.cr - 50} to ${carData.cr + 50}, best first. Pick one from the dropdown.\n\n` + lines.join("\n"),
                author: message.author,
                thumbnail: carData.racehud,
                footer: `${totalPages > 1 ? `Page ${targetPage} of ${totalPages} • ` : ""}${defaultWaitTime / 1000}s to choose`
            });
            const rows = [new ActionRowBuilder().addComponents(dropdown)];
            if (totalPages > 1) rows.push(navRow(targetPage, totalPages));
            rows.push(backCancelRow(true));
            return { embed, rows, totalPages };
        };

        while (true) {
            const { embed, rows, totalPages } = screen === 1 ? renderScreenOne() : renderScreenTwo();
            currentMessage = await embed.sendMessage({ currentMessage, buttons: rows, preserve: true });
            if (!currentMessage) return;

            let interaction;
            try {
                interaction = await currentMessage.message.awaitMessageComponent({ filter, time: defaultWaitTime });
                await interaction.deferUpdate();
            }
            catch (timeError) {
                const cancelMessage = new InfoMessage({
                    channel: message.channel,
                    title: "Action cancelled automatically.",
                    desc: "You didn't choose anything in time. Please try again.",
                    author: message.author
                });
                return cancelMessage.sendMessage({ currentMessage });
            }

            switch (interaction.customId) {
                case "firstPage":
                    if (screen === 1) dupePage = 1; else targetPage = 1;
                    break;
                case "prevPage":
                    if (screen === 1) dupePage = Math.max(1, dupePage - 1); else targetPage = Math.max(1, targetPage - 1);
                    break;
                case "nextPage":
                    if (screen === 1) dupePage = Math.min(totalPages, dupePage + 1); else targetPage = Math.min(totalPages, targetPage + 1);
                    break;
                case "lastPage":
                    if (screen === 1) dupePage = totalPages; else targetPage = totalPages;
                    break;
                case "exBack":
                    screen = 1;
                    chosenDupe = null;
                    break;
                case "exCancel": {
                    const cancelMessage = new InfoMessage({
                        channel: message.channel,
                        title: "Exchange cancelled.",
                        desc: "Nothing was traded.",
                        author: message.author
                    });
                    return cancelMessage.sendMessage({ currentMessage });
                }
                case "exDupeSelect":
                    chosenDupe = tradeable[parseInt(interaction.values[0])];
                    screen = 2;
                    targetPage = 1;
                    break;
                case "exTargetSelect":
                    return confirmExchange(chosenDupe, interaction.values[0], currentMessage);
                default:
                    break;
            }
        }

        // ── Screen 3: confirm and execute ────────────────────────────────────
        async function confirmExchange(dupe, desiredCarID, currentMessage) {
            const desiredCar = getCar(desiredCarID);
            const upgradeOrder = getAvailableTunes();
            // Advisory display of which copy gets consumed (stock first, then
            // lowest tune) — the accepted handler recomputes this from fresh data.
            const copyToGive = upgradeOrder.find(upg => dupe.garageCar.upgrades[upg] > 0) || "000";

            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: "Confirm Prize Car Exchange",
                desc: `**Giving:** ${carNameGen({ currentCar: dupe.carData, rarity: true, upgrade: copyToGive })} (your ${copyToGive === "000" ? "stock" : `${copyToGive}-tuned`} copy)\n**Receiving:** ${carNameGen({ currentCar: desiredCar, rarity: true, upgrade: "000" })}`,
                author: message.author,
                image: desiredCar.racehud,
                thumbnail: dupe.carData.racehud,
                footer: `You have ${defaultChoiceTime / 1000} seconds to confirm.`
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                // Re-fetch the profile so the write is built from FRESH data —
                // another writer may have touched the garage while the dialog was open.
                const freshData = await getProfile(message.author.id);
                const freshGarageCar = freshData.garage.find(c => c.carID === dupe.garageCar.carID);
                const freshDesired = freshData.garage.find(c => c.carID === desiredCarID);
                if (!freshGarageCar || calcTotal(freshGarageCar) < 2 || (freshDesired && calcTotal(freshDesired) > 0)) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, your garage changed while you were deciding.",
                        desc: "You no longer own a duplicate of the selected prize car, or you now own the desired car. Please run the command again.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }

                // Find the upgrade to remove (prefer stock, then lowest upgrade)
                const upgradeToRemove = upgradeOrder.find(upg => freshGarageCar.upgrades[upg] > 0);
                if (!upgradeToRemove) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, could not find a car to remove.",
                        desc: "Something went wrong. Please try again.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }

                // Remove one of the duplicate prize cars
                updateHands(freshData, freshGarageCar.carID, upgradeToRemove, "remove");
                freshGarageCar.upgrades[upgradeToRemove] -= 1;

                // If no more of this car, remove from garage
                if (calcTotal(freshGarageCar) === 0) {
                    freshData.garage.splice(freshData.garage.indexOf(freshGarageCar), 1);
                }

                // Add the new prize car (stock upgrade)
                freshData.garage = addCars(freshData.garage, [{ carID: desiredCarID, upgrade: "000" }]);

                // Record discovery (powers the NEW indicator in pack openings),
                // with the same lazy-init heal every acquisition path uses.
                let discoveredCars = freshData.discoveredCars || [];
                if (discoveredCars.length === 0 && freshData.garage.length > 0) {
                    discoveredCars = freshData.garage.map(c => c.carID);
                }
                if (!discoveredCars.includes(desiredCarID)) discoveredCars.push(desiredCarID);

                // Save to database
                await profileModel.updateOne({ userID: message.author.id }, {
                    garage: freshData.garage,
                    hand: freshData.hand,
                    decks: freshData.decks,
                    discoveredCars
                });

                trackExchange();

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: "🎉 Congratulations! Exchange Successful!",
                    desc: `You exchanged your ${carNameGen({ currentCar: dupe.carData, rarity: true })} for a brand new ${carNameGen({ currentCar: desiredCar, rarity: true })}!`,
                    author: message.author,
                    image: desiredCar.racehud
                });
                await successMessage.sendMessage({ currentMessage });
                return successMessage.removeButtons();
            }
        }

        // ── The market: read-only paginated view of the whole tagged pool ────
        async function showMarket(page, noteLine) {
            if (taggedPool.length === 0) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: "The exchange market is empty right now.",
                    desc: "No prize cars are currently open for exchange. Check back later!",
                    author: message.author
                });
                return infoMessage.sendMessage();
            }

            const totalPages = Math.ceil(taggedPool.length / pageLimit);
            if (isNaN(page) || page < 1 || page > totalPages) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `The exchange market ends at page ${totalPages}.`,
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            try {
                await listUpdate(taggedPool, page, totalPages, listDisplay, settings);
            }
            catch (error) {
                throw error;
            }

            function listDisplay(section, pg, total) {
                const lines = section.map(({ carID, car }, i) =>
                    `**${(pg - 1) * pageLimit + i + 1}.** ${carNameGen({ currentCar: car, rarity: true, removePrizeTag: true })}${ownsCopy(carID) ? " ✅" : ""}`);
                return new InfoMessage({
                    channel: message.channel,
                    title: `Prize Exchange Market (${taggedPool.length} car${taggedPool.length === 1 ? "" : "s"} currently exchangeable)`,
                    desc: `${noteLine ? noteLine + "\n\n" : ""}Trade a duplicate prize car within ±50 CR for any of these with \`cd-exchange\`. ✅ = already in your garage.\n\n` + lines.join("\n"),
                    author: message.author,
                    footer: `Page ${pg} of ${total}`
                });
            }
        }
    }
};
