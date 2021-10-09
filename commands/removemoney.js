"use strict";

const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { searchUser } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

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
                    await removeMoney(result.user, currentMessage);
                });
        }

        async function removeMoney(user, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get("726017235826770021");
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
            if (amount <= playerData.money) {
                playerData.money -= amount;
                await playerData.save();
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully removed ${moneyEmoji}${amount} from ${user.username}'s cash balance!`,
                    desc: `Current Money Balance: ${moneyEmoji}${playerData.money}`,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true })
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, a user's balance cannot be in the negatives.",
                    desc: "The amount of money that can be taken away should not be bigger than the user's money balance.",
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                    fields: [
                        { name: `${user.username}'s Money Balance (${moneyEmoji})`, value: `\`${playerData.money}\``, inline: true }
                    ]
                }).displayClosest(amount);
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};