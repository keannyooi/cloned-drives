"use strict";

const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { starterGarage, defaultChoiceTime } = require("../util/consts/consts.js");
const searchUser = require("../util/functions/searchUser.js");
const confirm = require("../util/functions/confirm.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "reset",
    aliases: ["rs", "noneandquitthegame"],
    usage: ["<username> <money / fusetokens / trophies / garage / all>"],
    args: 2,
    category: "Admin",
    description: "Resets your stats.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await noneAndQuitTheGame(message.mentions.users.first());
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
                    await noneAndQuitTheGame(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function noneAndQuitTheGame(user, currentMessage) {
            let { settings } = await profileModel.findOne({ userID: message.author.id })
            let reset = args[1].toLowerCase(), title = "";
            switch (reset) {
                case "money":
                    title = `Are you sure you want to reset ${user.username}'s cash balance?`;
                    break;
                case "fusetokens":
                    title = `Are you sure you want to reset ${user.username}'s fuse token balance?`;
                    break;
                case "trophies":
                    title = `Are you sure you want to reset ${user.username}'s trophy balance?`;
                    break;
                case "garage":
                    title = `Are you sure you want to reset ${user.username}'s garage? (WARNING: THIS ACTION IS IRREVERSIBLE)`;
                    break;
                case "all":
                    title = `Are you sure you want to reset all of ${user.username}'s data? (WARNING: THIS ACTION IS IRREVERSIBLE)`;
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, reset criteria selected not found.",
                        desc: `Here is a list of reset criterias. 
                        \`money\` - Resets the user's money balance to 0.
                        \`fusetokens\` - Resets the user's fuse token balance to 0.
                        \`trophies\` - Resets the user's trophy balance to 0.
                        \`garage\` - Resets the user's garage to the five starter cars.
                        \`all\` - Performs a total data wipe for the user.`,
                        author: message.author,
                    }).displayClosest(reset);
                    return errorMessage.sendMessage({ currentMessage });
            };
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title,
                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
            });
            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                switch (reset) {
                    case "money":
                        await profileModel.updateOne({ userID: user.id }, { money: 0 });
                        title = `Successfully reset ${user.username}'s money balance!`;
                        break;
                    case "fusetokens":
                        await profileModel.updateOne({ userID: user.id }, { fuseTokens: 0 });
                        title = `Successfully reset ${user.username}'s fuse token balance!`;
                        break;
                    case "trophies":
                        await profileModel.updateOne({ userID: user.id }, { trophies: 0 });
                        title = `Successfully reset ${user.username}'s trophy count!`;
                        break;
                    case "garage":
                        console.log(starterGarage);
                        await profileModel.updateOne({ userID: user.id }, { garage: starterGarage });
                        title = `Successfully reset ${user.username}'s garage!`;
                        break;
                    case "all":
                        await profileModel.deleteOne({ userID: user.id });
                        await profileModel.create({ userID: user.id });
                        title = `Successfully reset ${user.username}'s data!`;
                        break;
                    default:
                        break;
                }

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                });
                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};