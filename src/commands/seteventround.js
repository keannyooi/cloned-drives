"use strict";

const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const search = require("../util/functions/search.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "seteventround",
    aliases: ["ser"],
    usage: ["<player name> <event name> <round>"],
    args: 3,
    category: "Events",
    description: "Sets a player's round progress in an event to whatever.",
    async execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await findEvent(message.mentions.users.first());
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
                    await findEvent(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function findEvent(user, currentMessage) {
            const events = await eventModel.find();
            let query = args.slice(1, args.length - 1).map(i => i.toLowerCase());
            await new Promise(resolve => resolve(search(message, query, events, "event", currentMessage)))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [event, currentMessage] = response;
                    let round = args[args.length - 1];
                    if (isNaN(round) || Math.ceil(parseInt(round)) < 1 || Math.ceil(parseInt(round)) > event.roster.length) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, round requested invalid.",
                            desc: "Round numbers should be a number bigger than 0 and smaller or equal to the event's amount of rounds.",
                            author: message.author
                        }).displayClosest(event.roster.length);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    round = Math.ceil(parseInt(round));

                    const set = {};
                    if (round === 1) {
                        set[`playerProgress.${user.id}`] = event.playerProgress[user.id];
                        await eventModel.updateOne({ eventID: event.eventID }, {
                            "$unset": set
                        });
                    }
                    else {
                        set[`playerProgress.${user.id}`] = round;
                        await eventModel.updateOne({ eventID: event.eventID }, {
                            "$set": set
                        });
                    }

                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set ${user.username}'s progress on ${event.name} to round ${round}!`,
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