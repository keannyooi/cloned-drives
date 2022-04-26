"use strict";

const { DateTime } = require("luxon");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "setdailystreak",
    usage: ["<username> <amount>"],
    args: 2,
    category: "Admin",
    description: "Sets a player's daily reward streak to a certain number.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await editDailyStreak(message.mentions.users.first());
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
                    if (isNaN(args[1]) || Math.ceil(parseInt(args[1])) < 0) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, daily reward streak requested invalid.",
                            desc: "Daily reward streaks should be a number bigger or equal to 0.",
                            author: message.author
                        }).displayClosest(args[1]);
                        return errorMessage.sendMessage({ currentMessage });
                    }
        
                    await profileModel.updateOne({ userID: result.user.id }, {
                        "$set": {
                            "dailyStats.streak": parseInt(args[1]) - 1,
                            "dailyStats.lastDaily": DateTime.now().minus({ days: 1 }).toISO(),
                            "dailyStats.notifReceived": true
                        }
                    });
                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set ${result.user.username}'s daily reward streak to ${args[1]}!`,
                        author: message.author,
                        thumbnail: result.user.displayAvatarURL({ format: "png", dynamic: true })
                    });
                    return successMessage.sendMessage({ currentMessage });
                })
                .catch(error => {
                    throw error;
                });
        }
    }
};