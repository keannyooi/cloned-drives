"use strict";

const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { starterGarage, defaultChoiceTime } = require("../util/consts/consts.js");
const searchUser = require("../util/functions/searchUser.js");
const confirm = require("../util/functions/confirm.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const auditLog = require("../util/functions/auditLog.js");

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
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), undefined, { strict: true })))
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
                thumbnail: user.displayAvatarURL({ extension: "png" }),
            });
            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                // Balances log the value they replaced. garage/all are
                // irreversible, so the wiped data is snapshotted into the audit
                // log first, and the wipe is aborted if that copy didn't land.
                let before;
                const snapshotFailed = () => new ErrorMessage({
                    channel: message.channel,
                    title: "Error, could not save a backup of the data, reset aborted.",
                    desc: "Nothing was changed. Please try again.",
                    author: message.author,
                }).sendMessage({ currentMessage });
                switch (reset) {
                    case "money":
                        before = await profileModel.findOneAndUpdate({ userID: user.id }, { money: 0 }, { projection: { money: 1 } });
                        auditLog(message, { command: "reset", target: user, details: { reset, money: before?.money } });
                        title = `Successfully reset ${user.username}'s money balance!`;
                        break;
                    case "fusetokens":
                        before = await profileModel.findOneAndUpdate({ userID: user.id }, { fuseTokens: 0 }, { projection: { fuseTokens: 1 } });
                        auditLog(message, { command: "reset", target: user, details: { reset, fuseTokens: before?.fuseTokens } });
                        title = `Successfully reset ${user.username}'s fuse token balance!`;
                        break;
                    case "trophies":
                        before = await profileModel.findOneAndUpdate({ userID: user.id }, { trophies: 0 }, { projection: { trophies: 1 } });
                        auditLog(message, { command: "reset", target: user, details: { reset, trophies: before?.trophies } });
                        title = `Successfully reset ${user.username}'s trophy count!`;
                        break;
                    case "garage":
                        console.log(starterGarage);
                        before = await profileModel.findOne({ userID: user.id }, { garage: 1 }).lean();
                        if (!await auditLog(message, { command: "reset", target: user, details: { reset, garageRows: before?.garage?.length ?? 0, snapshot: before } })) return snapshotFailed();
                        await profileModel.updateOne({ userID: user.id }, { garage: starterGarage });
                        title = `Successfully reset ${user.username}'s garage!`;
                        break;
                    case "all":
                        before = await profileModel.findOne({ userID: user.id }).lean();
                        if (!await auditLog(message, { command: "reset", target: user, details: { reset, garageRows: before?.garage?.length ?? 0, snapshot: before } })) return snapshotFailed();
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
                    thumbnail: user.displayAvatarURL({ extension: "png" }),
                });
                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};