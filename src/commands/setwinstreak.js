"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "setwinstreak",
    usage: ["<username> <win streak>"],
    args: 2,
    category: "Admin",
    description: "Sets a player's win streak to a certain number.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await editWinStreak(message.mentions.users.first());
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
                    await editWinStreak(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function editWinStreak(user, currentMessage) {
            if (isNaN(args[1]) || Math.ceil(parseInt(args[1])) < 0) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, win streak requested is either not a number or inapplicable.",
                    desc: "Win streaks should be a number bigger or equal to 0.",
                    author: message.author
                }).displayClosest(args[1]);
                return errorMessage.sendMessage({ currentMessage });
            }

            await profileModel.updateOne({ userID: user.id }, {
                "$set": {
                    "rrStats.streak": parseInt(args[1])
                }
            });
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully set ${user.username}'s win streak to ${args[1]}!`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ format: "png", dynamic: true })
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};