"use strict";

const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { searchUser } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "addfusetokens",
    aliases: ["aft"],
    usage: "<username> | <amount>",
    args: 2,
    category: "Admin",
    description: "Adds a certain amount of fuse tokens to someone's cash balance.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await addTokens(message.mentions.users.first());
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
                    await addTokens(result.user, currentMessage);
                });
        }

        async function addTokens(user, currentMessage) {
            const fuseEmoji = bot.emojis.cache.get("726018658635218955");
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

            const playerData = await profileModel.findOne({ userID: user.id });
            const balance = playerData.fuseTokens + amount;
            await profileModel.updateOne({ userID: user.id }, { fuseTokens: balance });

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully added ${fuseEmoji}${amount} to ${user.username}'s fuse token balance!`,
                desc: `Current Fuse Token Balance: ${fuseEmoji}${balance}`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ format: "png", dynamic: true })
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};