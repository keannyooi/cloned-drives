"use strict";

const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getVoucher, getVoucherFiles, getCar, getDriver } = require("../util/functions/dataManager.js");
const buildVoucherChoices = require("../util/functions/voucherChoices.js");
const { rarityOf, driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const carNameGen = require("../util/functions/carNameGen.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");

// Human rendering of one redeem-filter criterion (docs/voucher-system.md).
function describeCriterion(key, value) {
    if (value && typeof value === "object" && !Array.isArray(value) && value.start !== undefined) {
        return `${key}: ${value.start} – ${value.end}`;
    }
    if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
    return `${key}: ${value}`;
}

module.exports = {
    name: "voucherinfo",
    aliases: ["vinfo"],
    usage: ["<voucher name>", "-<voucher ID>"],
    args: 1,
    category: "Info",
    description: "Shows what a voucher is and exactly what it can be redeemed for.",
    async execute(message, args) {
        const voucherFiles = getVoucherFiles();
        if (voucherFiles.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, no vouchers exist yet.",
                desc: "There are no voucher files loaded.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // -v00001 style direct ID, otherwise all query words must appear in the name
        let matches;
        if (args[0].toLowerCase().startsWith("-v")) {
            const id = args[0].toLowerCase().slice(1);
            matches = voucherFiles.filter(file => file.slice(0, -5) === id);
        }
        else {
            const query = args.map(arg => arg.toLowerCase());
            matches = voucherFiles.filter(file => {
                const name = (getVoucher(file)?.name || "").toLowerCase();
                return query.every(word => name.includes(word));
            });
        }

        if (matches.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, voucher requested not found.",
                desc: `No voucher matches \`${args.join(" ")}\`. Vouchers that exist:\n${voucherFiles.map(f => `\`${f.slice(0, -5)}\` — ${getVoucher(f)?.name}`).join("\n")}`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        if (matches.length > 1) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, multiple vouchers match your query.",
                desc: `Be more specific, or use the ID directly:\n${matches.map(f => `\`-${f.slice(0, -5)}\` — ${getVoucher(f)?.name}`).join("\n")}`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const voucher = getVoucher(matches[0]);
        const playerData = await getProfile(message.author.id);
        const redeem = voucher.redeem || {};

        // Redeem terms, rendered human-readably
        const termLines = [];
        if (Array.isArray(redeem.list)) {
            termLines.push("Choose ONE of:");
            for (const id of redeem.list) {
                if (id.startsWith("c")) {
                    const car = getCar(id);
                    termLines.push(`• ${car ? carNameGen({ currentCar: car, rarity: true, removePrizeTag: true }) : id}`);
                }
                else {
                    const driver = getDriver(id);
                    termLines.push(`• Driver: ${driver ? `${driverDisplayName(driver)} (${rarityOf(driver)})` : id}`);
                }
            }
        }
        else {
            termLines.push(`Choose any ${redeem.pool === "drivers" ? "driver" : "car"} matching:`);
            for (const [key, value] of Object.entries(redeem.filter || {})) {
                termLines.push(`• ${describeCriterion(key, value)}`);
            }
            if (redeem.pool === "cars" && !redeem.filter?.cardType) {
                termLines.push("• Normal cards only");
            }
        }
        if (redeem.unownedOnly) {
            termLines.push("• Only offers choices you do NOT already own");
        }

        const available = buildVoucherChoices(voucher, playerData).length;
        const heldEntry = (Array.isArray(playerData.vouchers) ? playerData.vouchers : [])
            .find(v => v && v.voucherID === voucher.voucherID);
        const heldAmount = heldEntry && heldEntry.amount > 0 ? heldEntry.amount : 0;

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: `${voucher.name} (${voucher.voucherID})`,
            desc: voucher.description,
            author: message.author,
            thumbnail: voucher.image,
            fields: [
                { name: "Redeem Terms", value: termLines.join("\n").slice(0, 1024) },
                { name: "Choices Available to You", value: `${available}`, inline: true },
                { name: "You Hold", value: `×${heldAmount}`, inline: true }
            ],
            footer: "Redeem with cd-voucher — you CHOOSE what you get, no RNG."
        });
        return infoMessage.sendMessage();
    }
};
