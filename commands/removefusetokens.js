"use strict";

const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { searchUser } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "removefusetokens",
    aliases: ["rmvfusetokens", "rft"],
    usage: "<username> <amount here>",
    args: 2,
    category: "Admin",
    description: "Removes a certain amount of fuse tokens from someone.",
    execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await removeTokens(message.mentions.users.first());
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, user requested is a bot.",
                    desc: "Bots can't play Cloned Drives.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
        }
        else {
            const userSaves = await profileModel.find({});
            const availableUsers = await message.guild.members.fetch();
            availableUsers.filter(user => userSaves.find(f => f.userID = user.id));
            new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), availableUsers)))
                .then(async (hmm) => {
                    if (!Array.isArray(hmm)) return;
                    let [result, currentMessage] = hmm;
                    await removeTokens(result.user, currentMessage);
                });
        }

        async function removeTokens(user, currentMessage) {
            const fuseEmoji = bot.emojis.cache.get("726018658635218955");
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

            const playerData = await profileModel.findOne({ userID: user.id });
            if (amount <= playerData.fuseTokens) {
                playerData.fuseTokens -= amount;
                await playerData.save();
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully removed ${fuseEmoji}${amount} from ${user.username}'s fuse token balance!`,
                    desc: `Current Fuse Token Balance: ${fuseEmoji}${playerData.fuseTokens}`,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true })
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, a user's balance cannot be in the negatives.",
                    desc: "The amount of fuse tokens that can be taken away should not be bigger than the user's fuse token balance.",
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                    fields: [
                        { name: `${user.username}'s Fuse Token Balance (${fuseEmoji})`, value: `\`${playerData.fuseTokens}\``, inline: true }
                    ]
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};