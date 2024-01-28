"use strict";

const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const search = require("../util/functions/search.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const championshipModel = require("../models/championshipsSchema.js");

module.exports = {
    name: "setchampionshipround",
    aliases: ["scr"],
    usage: ["<player name> <championship name> <round>"],
    args: 3,
    category: "Admin",
    description: "Sets a player's round progress in an championship to whatever.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await findChampionship(message.mentions.users.first());
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
                    await findChampionship(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function findChampionship(user, currentMessage) {
            const championships = await championshipModel.find();
            let query = args.slice(1, args.length - 1).map(i => i.toLowerCase());
            await new Promise(resolve => resolve(search(message, query, championships, "championships", currentMessage)))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [championship, currentMessage] = response;
                    let round = args[args.length - 1];
                    if (isNaN(round) || Math.ceil(parseInt(round)) < 1 || Math.ceil(parseInt(round)) > championship.roster.length) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, round requested invalid.",
                            desc: "Round numbers should be a number bigger than 0 and smaller or equal to the championship's amount of rounds.",
                            author: message.author
                        }).displayClosest(championship.roster.length);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    round = Math.ceil(parseInt(round));

                    const set = {};
                    if (round === 1) {
                        set[`playerProgress.${user.id}`] = championship.playerProgress[user.id];
                        await championshipModel.updateOne({ championshipID: championship.championshipID }, {
                            "$unset": set
                        });
                    }
                    else {
                        set[`playerProgress.${user.id}`] = round;
                        await championshipModel.updateOne({ championshipID: championship.championshipID }, {
                            "$set": set
                        });
                    }

                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set ${user.username}'s progress on ${championship.name} to round ${round}!`,
                        author: message.author
                    });
                    return successMessage.sendMessage({ currentMessage });
                })
                .catch(error => {
                    throw error;
                });
        }
    }
};