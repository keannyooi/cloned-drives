"use strict";

const { SuccessMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { botUserError } = require("./sharedfiles/primary.js");
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
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase())))
                .then(async response => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await addTrophies(result.user, currentMessage);
                })
                .catch(error => {
                    throw error
                });
        }

        async function addTrophies(user, currentMessage) {
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

            const playerData = await profileModel.findOne({ userID: user.id });
            const balance = playerData.trophies + amount;
            await profileModel.updateOne({ userID: user.id }, { trophies: balance });

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully added ${trophyEmoji}${amount} to ${user.username}'s trophy amount!`,
                desc: `Current Trophy Amount: ${trophyEmoji}${balance}`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ format: "png", dynamic: true })
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};