"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "setrrwins",
    aliases: ["setwinstreak"],
    usage: ["<username> <weekly wins>"],
    args: 2,
    category: "Admin",
    description: "Sets a player's Race Week weekly win count to a certain number.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await editWeeklyWins(message.mentions.users.first());
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
                    await editWeeklyWins(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function editWeeklyWins(user, currentMessage) {
            if (isNaN(args[1]) || Math.ceil(parseInt(args[1])) < 0) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, win count requested is either not a number or inapplicable.",
                    desc: "Weekly win counts should be a number bigger or equal to 0.",
                    author: message.author
                }).displayClosest(args[1]);
                return errorMessage.sendMessage({ currentMessage });
            }

            // dotted $set lazy-creates raceWeekStats on old profiles; readers tolerate the partial object
            await profileModel.updateOne({ userID: user.id }, {
                "$set": {
                    "raceWeekStats.weeklyWins": parseInt(args[1])
                }
            });
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully set ${user.username}'s Race Week weekly wins to ${args[1]}!`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ format: "png", dynamic: true })
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};