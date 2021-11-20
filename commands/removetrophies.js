"use strict";

const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { searchUser } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "removetrophies",
    aliases: ["rmvtrophies"],
    usage: "<username> <amount here>",
    args: 2,
    category: "Admin",
    description: "Removes a certain amount of trophies from someone.",
    execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await removeTrophies(message.mentions.users.first());
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
                    await removeTrophies(result.user, currentMessage);
                });
        }

        async function removeTrophies(user, currentMessage) {
            const trophyEmoji = bot.emojis.cache.get("775636479145148418");
            const amount = Math.ceil(parseInt(args[1]));
            if (isNaN(amount) || parseInt(amount) < 1) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, trophy amount provided is not a positive number.",
                    desc: "The amount of trophies you want to add should always be a positive number, i.e: `133`, `7`, etc.",
                    author: message.author
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }

            const playerData = await profileModel.findOne({ userID: user.id });
            if (amount <= playerData.trophies) {
                const balance = playerData.trophies - amount;
                await profileModel.updateOne({ userID: user.id }, { trophies: balance });
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully removed ${trophyEmoji}${amount} from ${user.username}'s trophy amount!`,
                    desc: `Current Trophy Amount: ${trophyEmoji}${balance}`,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true })
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, a user's trophy amount cannot be in the negatives.",
                    desc: "The amount of trophies that can be taken away should not be bigger than the user's trophy amount.",
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                    fields: [
                        { name: `${user.username}'s Trophy Amount (${trophyEmoji})`, value: `\`${playerData.trophies}\``, inline: true }
                    ]
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};