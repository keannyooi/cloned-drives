"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { fuseEmojiID } = require("../util/consts/consts.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const auditLog = require("../util/functions/auditLog.js");

module.exports = {
    name: "addfusetokens",
    aliases: ["aft"],
    usage: ["<username> <amount of fuse tokens>"],
    args: 2,
    category: "Admin",
    description: "Adds a certain amount of fuse tokens to someone's cash balance.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await addTokens(message.mentions.users.first());
            }
            else {
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), undefined, { strict: true })))
                .then(async (hmm) => {
                    if (!Array.isArray(hmm)) return;
                    let [result, currentMessage] = hmm;
                    await addTokens(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function addTokens(user, currentMessage) {
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            const amount = Math.ceil(parseInt(args[1]));
            if (isNaN(amount) || amount < 1) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, token amount provided is not a positive number.",
                    desc: "The amount of tokens you want to add should always be a positive number, i.e: `4`, `20`, etc.",
                    author: message.author
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }

            // Atomic $inc, not an absolute write from a fresh read: a player's own
            // win or purchase landing mid-command is no longer overwritten.
            const playerData = await profileModel.findOneAndUpdate(
                { userID: user.id },
                { "$inc": { fuseTokens: amount } },
                { returnDocument: "after", projection: { fuseTokens: 1 } }
            );
            if (!playerData) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: `Error, ${user.username} has no profile.`,
                    desc: "This user hasn't started playing yet, so there is no balance to change.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            const balance = playerData.fuseTokens;
            auditLog(message, { command: "addfusetokens", target: user, details: { amount, fuseTokens: balance } });

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully added ${fuseEmoji}${amount.toLocaleString("en")} to ${user.username}'s fuse token balance!`,
                desc: `Current Fuse Token Balance: ${fuseEmoji}${balance.toLocaleString("en")}`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ extension: "png" })
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};