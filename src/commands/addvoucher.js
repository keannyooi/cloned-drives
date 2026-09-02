"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getVoucher, getVoucherFiles } = require("../util/functions/dataManager.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "addvoucher",
    aliases: ["rmvvoucher", "removevoucher"],
    usage: ["<username> <voucher ID> [amount]", "(negative amount removes, e.g. -1)"],
    args: 2,
    category: "Admin",
    description: "Grants (or with a negative amount, removes) vouchers for a player. Voucher IDs look like v00001 — see cd-voucherinfo.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await applyVoucher(message.mentions.users.first());
            }
            else {
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase())))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await applyVoucher(await message.client.users.fetch(result.user.id), currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function applyVoucher(user, currentMessage) {
            const voucherID = args[1].toLowerCase();
            const voucher = getVoucher(voucherID);
            if (!voucher) {
                const known = getVoucherFiles().map(f => `\`${f.slice(0, -5)}\``).join(", ") || "(none loaded)";
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, voucher requested does not exist.",
                    desc: `Voucher IDs look like \`v00001\`. Loaded vouchers: ${known}`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            let amount = 1;
            if (args[2] !== undefined) {
                if (!/^-?\d+$/.test(args[2]) || parseInt(args[2]) === 0 || Math.abs(parseInt(args[2])) > 100) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, amount provided is invalid.",
                        desc: "Provide a non-zero whole number between -100 and 100 (negative removes).",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                amount = parseInt(args[2]);
            }

            const playerData = await profileModel.findOne({ userID: user.id }, { vouchers: 1 });
            if (!playerData) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: `Error, ${user.username} has no profile.`,
                    desc: "This user has never used the bot, so they have no profile to hold vouchers.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            const wallet = Array.isArray(playerData.vouchers) ? playerData.vouchers : [];
            const heldEntry = wallet.find(v => v && v.voucherID === voucherID);
            const heldNow = heldEntry && heldEntry.amount > 0 ? heldEntry.amount : 0;

            if (amount < 0 && heldNow === 0) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: `Error, ${user.username} does not hold that voucher.`,
                    desc: `They have no **${voucher.name}** to remove.`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            // Removing more than they hold clamps to what exists.
            const applied = amount < 0 ? Math.max(amount, -heldNow) : amount;
            const newTotal = heldNow + applied;

            if (heldEntry) {
                heldEntry.amount = newTotal;
            }
            else {
                wallet.push({ voucherID, amount: newTotal });
            }
            await profileModel.updateOne({ userID: user.id }, { vouchers: wallet.filter(v => v && v.amount > 0) });

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: applied > 0
                    ? `Successfully granted ${applied}× ${voucher.name} to ${user.username}!`
                    : `Successfully removed ${-applied}× ${voucher.name} from ${user.username}!`,
                desc: `${user.username} now holds **×${newTotal}** of this voucher. They redeem with \`cd-voucher\`.`,
                author: message.author,
                thumbnail: voucher.image
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};
