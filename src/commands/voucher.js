"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultWaitTime, defaultChoiceTime, trophyEmojiID, defaultPageLimit } = require("../util/consts/consts.js");
const { getCar, getVoucher } = require("../util/functions/dataManager.js");
const buildVoucherChoices = require("../util/functions/voucherChoices.js");
const { rarityOf, driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const carNameGen = require("../util/functions/carNameGen.js");
const addCars = require("../util/functions/addCars.js");
const confirm = require("../util/functions/confirm.js");
const paginate = require("../util/functions/paginate.js");
const getButtons = require("../util/functions/getButtons.js");
const { trackVoucherRedeemed } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");

const VOUCHER_PAGE_SIZE = 25; // Discord select menus cap at 25 options

module.exports = {
    name: "voucher",
    aliases: ["token", "usetoken", "vouchers"],
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "View and redeem your vouchers — each lets you CHOOSE a car or driver from its listed pool. Vouchers come from events, codes and specials.",
    async execute(message, args) {
        const playerData = await getProfile(message.author.id);
        const settings = playerData.settings;
        const pageLimit = settings.listamount || defaultPageLimit;

        // Held vouchers, resolved against the loaded voucher roster. Unknown
        // voucherIDs (file removed after a grant) are kept out of the UI but
        // NEVER deleted from the profile — restoring the file restores them.
        const held = [];
        const walletRaw = Array.isArray(playerData.vouchers) ? playerData.vouchers : [];
        for (const entry of walletRaw) {
            if (!entry || typeof entry.voucherID !== "string" || !(entry.amount > 0)) continue;
            const voucher = getVoucher(entry.voucherID);
            if (!voucher) {
                console.log(`[voucher] ${message.author.id} holds unknown voucher "${entry.voucherID}" — hidden until its file returns`);
                continue;
            }
            held.push({ voucherID: entry.voucherID, amount: entry.amount, voucher, choices: buildVoucherChoices(voucher, playerData) });
        }

        if (held.length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "You have no vouchers right now.",
                desc: "Vouchers are awarded from events, codes and specials. Each one lets you **choose** a car or driver from its pool — check one out with `cd-voucherinfo` when you get one!",
                author: message.author
            });
            return infoMessage.sendMessage();
        }

        const usable = held.filter(h => h.choices.length > 0);
        if (usable.length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "None of your vouchers have available choices right now.",
                desc: held.map(h => `**${h.voucher.name}** ×${h.amount} — no eligible choices`).join("\n")
                    + "\n\nThis usually means the voucher only grants things you don't own yet, and you already own them all.",
                author: message.author
            });
            return infoMessage.sendMessage();
        }

        // ── Screen state machine (mirrors cd-exchange) ───────────────────────
        // Screen 1 is skipped when exactly one voucher kind is usable — there
        // is nothing on it the player would miss.
        const skipScreenOne = usable.length === 1;
        let screen = skipScreenOne ? 2 : 1;
        let chosen = skipScreenOne ? usable[0] : null;
        let voucherPage = 1, choicePage = 1;
        let currentMessage = null;
        const filter = i => i.user.id === message.author.id;

        const choiceLabel = c => c.kind === "car"
            ? carNameGen({ currentCar: c.item, removePrizeTag: true })
            : `${driverDisplayName(c.item)} (Driver)`;
        const choiceLine = c => c.kind === "car"
            ? `${carNameGen({ currentCar: c.item, rarity: true, removePrizeTag: true })}${c.owned ? " ✅" : ""}`
            : `**Driver:** ${driverDisplayName(c.item)} (${rarityOf(c.item)})${c.owned ? " ✅" : ""}`;

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
                row.addComponents(new ButtonBuilder().setCustomId("vBack").setLabel("← Back").setStyle(ButtonStyle.Secondary));
            }
            row.addComponents(new ButtonBuilder().setCustomId("vCancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary));
            return row;
        };

        const renderScreenOne = () => {
            const totalPages = Math.ceil(usable.length / VOUCHER_PAGE_SIZE);
            const section = paginate(usable, voucherPage, VOUCHER_PAGE_SIZE);
            const lines = section.map((h, i) =>
                `**${(voucherPage - 1) * VOUCHER_PAGE_SIZE + i + 1}.** ${h.voucher.name} ×${h.amount} — **${h.choices.length} choice${h.choices.length === 1 ? "" : "s"}**`);

            const fields = [];
            const unusable = held.filter(h => h.choices.length === 0);
            if (unusable.length > 0 && voucherPage === 1) {
                let value = unusable.map(h => `${h.voucher.name} ×${h.amount}`).join(", ");
                if (value.length > 1000) value = value.slice(0, 1000) + "…";
                fields.push({ name: "No eligible choices right now", value });
            }

            const dropdown = new StringSelectMenuBuilder()
                .setCustomId("vVoucherSelect")
                .setPlaceholder("Select a voucher to redeem...")
                .addOptions(...section.map((h, i) => ({
                    label: `${h.voucher.name} (x${h.amount})`.slice(0, 100),
                    description: `${h.choices.length} choice${h.choices.length === 1 ? "" : "s"} available`,
                    value: `${(voucherPage - 1) * VOUCHER_PAGE_SIZE + i}`,
                    emoji: "🎟️"
                })));

            const embed = new InfoMessage({
                channel: message.channel,
                title: "Your Vouchers",
                desc: "Pick a voucher to redeem — each lets you **choose** what you get, no RNG.\n\n" + lines.join("\n"),
                author: message.author,
                fields,
                footer: `${totalPages > 1 ? `Page ${voucherPage} of ${totalPages} • ` : ""}Inspect any voucher with cd-voucherinfo • ${defaultWaitTime / 1000}s to choose`
            });
            const rows = [new ActionRowBuilder().addComponents(dropdown)];
            if (totalPages > 1) rows.push(navRow(voucherPage, totalPages));
            rows.push(backCancelRow(false));
            return { embed, rows, totalPages };
        };

        const renderScreenTwo = () => {
            const { voucher, amount, choices } = chosen;
            const totalPages = Math.ceil(choices.length / pageLimit);
            const section = paginate(choices, choicePage, pageLimit);
            const lines = section.map((c, i) =>
                `**${(choicePage - 1) * pageLimit + i + 1}.** ${choiceLine(c)}`);

            const dropdown = new StringSelectMenuBuilder()
                .setCustomId("vChoiceSelect")
                .setPlaceholder("Select what you want to receive...")
                .addOptions(...section.map(c => ({
                    label: choiceLabel(c).slice(0, 100),
                    description: c.kind === "car"
                        ? `CR: ${c.item.cr} | ${c.item.tyreType || "Standard"} tyres${c.owned ? " | owned" : ""}`
                        : `Driver | ${rarityOf(c.item)} rarity${c.owned ? " | owned (dupe → XP)" : ""}`,
                    value: c.id,
                    emoji: c.kind === "car" ? `<trophies:${trophyEmojiID}>` : "👤"
                })));

            const embed = new InfoMessage({
                channel: message.channel,
                title: `Redeem: ${voucher.name} (×${amount})`,
                desc: `**${choices.length} choice${choices.length === 1 ? "" : "s"}** — pick one from the dropdown. ✅ = already owned.\n${voucher.description}\n\n` + lines.join("\n"),
                author: message.author,
                thumbnail: voucher.image,
                footer: `${totalPages > 1 ? `Page ${choicePage} of ${totalPages} • ` : ""}${defaultWaitTime / 1000}s to choose`
            });
            const rows = [new ActionRowBuilder().addComponents(dropdown)];
            if (totalPages > 1) rows.push(navRow(choicePage, totalPages));
            rows.push(backCancelRow(!skipScreenOne));
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
                    if (screen === 1) voucherPage = 1; else choicePage = 1;
                    break;
                case "prevPage":
                    if (screen === 1) voucherPage = Math.max(1, voucherPage - 1); else choicePage = Math.max(1, choicePage - 1);
                    break;
                case "nextPage":
                    if (screen === 1) voucherPage = Math.min(totalPages, voucherPage + 1); else choicePage = Math.min(totalPages, choicePage + 1);
                    break;
                case "lastPage":
                    if (screen === 1) voucherPage = totalPages; else choicePage = totalPages;
                    break;
                case "vBack":
                    screen = 1;
                    chosen = null;
                    break;
                case "vCancel": {
                    const cancelMessage = new InfoMessage({
                        channel: message.channel,
                        title: "Redemption cancelled.",
                        desc: "Your vouchers are untouched.",
                        author: message.author
                    });
                    return cancelMessage.sendMessage({ currentMessage });
                }
                case "vVoucherSelect":
                    chosen = usable[parseInt(interaction.values[0])];
                    screen = 2;
                    choicePage = 1;
                    break;
                case "vChoiceSelect": {
                    const choice = chosen.choices.find(c => c.id === interaction.values[0]);
                    if (choice) return confirmRedemption(chosen, choice, currentMessage);
                    break;
                }
                default:
                    break;
            }
        }

        // ── Screen 3: confirm and execute ────────────────────────────────────
        async function confirmRedemption(heldEntry, choice, currentMessage) {
            const { voucher } = heldEntry;
            const receivingLine = choice.kind === "car"
                ? `**Receiving:** ${carNameGen({ currentCar: choice.item, rarity: true, upgrade: "000" })}`
                : `**Receiving:** Driver **${driverDisplayName(choice.item)}** (${rarityOf(choice.item)}) *(lands in \`cd-rewards\` to claim)*`;

            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: "Confirm Voucher Redemption",
                desc: `**Consuming:** 1× ${voucher.name}\n${receivingLine}`,
                author: message.author,
                image: choice.kind === "car" ? choice.item.racehud : undefined,
                thumbnail: voucher.image,
                footer: `You have ${defaultChoiceTime / 1000} seconds to confirm.`
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                // Re-fetch so the write is built from FRESH data — the wallet may
                // have changed while the dialog was open.
                const freshData = await getProfile(message.author.id);
                const freshWallet = Array.isArray(freshData.vouchers) ? freshData.vouchers : [];
                const freshEntry = freshWallet.find(v => v && v.voucherID === heldEntry.voucherID);
                if (!freshEntry || !(freshEntry.amount > 0)) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, you no longer hold this voucher.",
                        desc: "It was spent or removed while you were deciding. Please run the command again.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }

                // Consume one copy; drop the entry entirely at zero.
                freshEntry.amount -= 1;
                const newWallet = freshWallet.filter(v => v && v.amount > 0);

                const update = { "$set": { vouchers: newWallet } };
                let successDesc;

                if (choice.kind === "car") {
                    // addCars merges by carID into an existing entry — never a
                    // duplicate garage row (see addCars' 2026-08-28 tripwire).
                    freshData.garage = addCars(freshData.garage, [{ carID: choice.id, upgrade: "000" }]);
                    // Record discovery (powers the NEW indicator in pack openings),
                    // with the same lazy-init heal every acquisition path uses.
                    let discoveredCars = freshData.discoveredCars || [];
                    if (discoveredCars.length === 0 && freshData.garage.length > 0) {
                        discoveredCars = freshData.garage.map(c => c.carID);
                    }
                    if (!discoveredCars.includes(choice.id)) discoveredCars.push(choice.id);
                    update["$set"].garage = freshData.garage;
                    update["$set"].discoveredCars = discoveredCars;
                    successDesc = `You redeemed **${voucher.name}** for a brand new ${carNameGen({ currentCar: choice.item, rarity: true })}!`;
                }
                else {
                    // Drivers materialize through cd-rewards' claim machinery
                    // (ownership, dupe→XP, level-ups) — same as code drivers.
                    update["$push"] = { unclaimedRewards: { driver: choice.id, origin: `Voucher: ${voucher.name}` } };
                    successDesc = `You redeemed **${voucher.name}** for driver **${driverDisplayName(choice.item)}**!\nClaim them with \`cd-rewards\`.`;
                }

                await profileModel.updateOne({ userID: message.author.id }, update);
                trackVoucherRedeemed();

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: "🎟️ Voucher redeemed!",
                    desc: successDesc,
                    author: message.author,
                    image: choice.kind === "car" ? choice.item.racehud : undefined,
                    thumbnail: voucher.image
                });
                await successMessage.sendMessage({ currentMessage });
                return successMessage.removeButtons();
            }
        }
    }
};
