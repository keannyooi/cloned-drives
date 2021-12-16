"use strict";

const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { searchUser } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "addtrophies",
    usage: ["<username> | <amount of trophies>"],
    args: 2,
    category: "Admin",
    description: "Adds a certain amount of trophies to someone.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await addTrophies(message.mentions.users.first());
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
                    const trophyEmoji = bot.emojis.cache.get("775636479145148418");
                    const amount = Math.ceil(parseInt(args[1]));
                    if (isNaN(amount) || amount < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, trophy amount provided is not a positive number.",
                            desc: "The amount of trophies you want to add should always be a positive number, i.e: `69`, `727`, etc.",
                            author: message.author
                        }).displayClosest(amount);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    const playerData = await profileModel.findOne({ userID: result.user.id });
                    const balance = playerData.trophies + amount;
                    await profileModel.updateOne({ userID: result.user.id }, { trophies: balance });

                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully added ${trophyEmoji}${amount} to ${result.user.username}'s trophy amount!`,
                        desc: `Current Trophy Amount: ${trophyEmoji}${balance}`,
                        author: message.author,
                        thumbnail: result.user.displayAvatarURL({ format: "png", dynamic: true })
                    });
                    return successMessage.sendMessage({ currentMessage });
                });
        }
    }
};