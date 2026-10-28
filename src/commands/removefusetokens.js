"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { fuseEmojiID } = require("../util/consts/consts.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const auditLog = require("../util/functions/auditLog.js");

module.exports = {
    name: "removefusetokens",
    aliases: ["rmvfusetokens", "rft"],
    usage: "<username> <amount here>",
    args: 2,
    category: "Admin",
    description: "Removes a certain amount of fuse tokens from someone.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await removeTokens(message.mentions.users.first());
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
                    await removeTokens(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function removeTokens(user, currentMessage) {
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
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
                { userID: user.id, fuseTokens: { "$gte": amount } },
                { "$inc": { fuseTokens: -amount } },
                { returnDocument: "after", projection: { fuseTokens: 1 } }
            );
            if (playerData) {
                const balance = playerData.fuseTokens;
                auditLog(message, { command: "removefusetokens", target: user, details: { amount, fuseTokens: balance } });
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully removed ${fuseEmoji}${amount.toLocaleString("en")} from ${user.username}'s fuse token balance!`,
                    desc: `Current Fuse Token Balance: ${fuseEmoji}${balance.toLocaleString("en")}`,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ extension: "png" })
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
                // Refused: no profile, or the balance is short of amount.
                playerData = await profileModel.findOne({ userID: user.id }, { fuseTokens: 1 });
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
                    desc: "The amount of fuse tokens that can be taken away should not be bigger than the user's fuse token balance.",
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ extension: "png" }),
                    fields: [
                        { name: `${user.username}'s Fuse Token Balance (${fuseEmoji})`, value: `\`${playerData.fuseTokens.toLocaleString("en")}\``, inline: true }
                    ]
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};