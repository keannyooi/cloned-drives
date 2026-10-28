"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID } = require("../util/consts/consts.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const auditLog = require("../util/functions/auditLog.js");

module.exports = {
    name: "removemoney",
    aliases: ["rmvmoney"],
    usage: "<username> <amount here>",
    args: 2,
    category: "Admin",
    description: "Removes a certain amount of money from someone.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await removeMoney(message.mentions.users.first());
            }
            else {
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), undefined, { strict: true })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await removeMoney(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function removeMoney(user, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const amount = Math.ceil(parseInt(args[1]));
            if (isNaN(amount) || parseInt(amount) < 1) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, money amount provided is not a positive number.",
                    desc: "The amount of money you want to add should always be a positive number, i.e: `133`, `7`, etc.",
                    author: message.author
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }

            // Atomic guarded $inc, not an absolute write from a fresh read: a
            // player's own win or purchase landing mid-command is no longer
            // overwritten, and the balance still can't go below 0.
            let playerData = await profileModel.findOneAndUpdate(
                { userID: user.id, money: { "$gte": amount } },
                { "$inc": { money: -amount } },
                { returnDocument: "after", projection: { money: 1 } }
            );
            if (playerData) {
                const balance = playerData.money;
                auditLog(message, { command: "removemoney", target: user, details: { amount, money: balance } });
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully removed ${moneyEmoji}${amount.toLocaleString("en")} from ${user.username}'s cash balance!`,
                    desc: `Current Money Balance: ${moneyEmoji}${balance.toLocaleString("en")}`,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ extension: "png" })
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
                // Refused: no profile, or the balance is short of amount.
                playerData = await profileModel.findOne({ userID: user.id }, { money: 1 });
                if (!playerData) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: `Error, ${user.username} has no profile.`,
                        desc: "This user hasn't started playing yet, so there is no balance to change.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, a user's balance cannot be in the negatives.",
                    desc: "The amount of money that can be taken away should not be bigger than the user's money balance.",
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ extension: "png" }),
                    fields: [
                        { name: `${user.username}'s Money Balance (${moneyEmoji})`, value: `\`${playerData.money.toLocaleString("en")}\``, inline: true }
                    ]
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};