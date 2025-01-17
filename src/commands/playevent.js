"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, sandboxRoleID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const createCar = require("../util/functions/createCar.js");
const confirm = require("../util/functions/confirm.js");
const filterCheck = require("../util/functions/filterCheck.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const race = require("../util/functions/race.js");
const search = require("../util/functions/search.js");
const handMissingError = require("../util/commonerrors/handMissingError.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "playevent",
    aliases: ["pe"],
    usage: "<event name>",
    args: 1,
    category: "Gameplay",
    cooldown: 10,
    description: "Participates in an event by doing a race.",
    async execute(message, args) {
        //if (message.channel.type !== 1) {
            //const errorMessage = new ErrorMessage({
                //channel: message.channel,
                //title: "Sorry, this command can only be used in DMs.",
               // desc: "This is to avoid people from leaking event solutions and, as a result, making events trivial.",
                //author: message.author
            //});
           // return errorMessage.sendMessage();
       // } - Play DM Only

        const events = await eventModel.find();
        const { hand, unclaimedRewards, settings } = await profileModel.findOne({ userID: message.author.id });
        if (hand.carID === "") {
            return handMissingError(message);
        }

        let query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await playEvent(...response);
            })
            .catch(error => {
                throw error;
            });

        async function playEvent(event, currentMessage) {
            // console.log(event);
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            let round = event.playerProgress[message.author.id] ?? 1;
            if (round > event.roster.length) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "You have already completed this event.",
                    desc: "Try out the other events, if available.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
			else if (guildMember.roles.cache.has(sandboxRoleID)) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this is not available for Sandbox Alts.",
                    desc: `Unfortunately the commnad you are trying to use is not a available for accounts with the <@&${sandboxRoleID}> role.`,
                    author: message.author,
                });
                return errorMessage.sendMessage();
            }

            if (!filterCheck({ car: hand, filter: event.roster[round - 1].reqs, applyOrLogic: true })) {
                let currentCar = require(`../cars/${hand.carID}`);
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, it looks like your hand does not meet the event round's requirements.",
                    desc: `**Round ${round} (Reqs: \`${reqDisplay(event.roster[round - 1].reqs)}\`)**
					**Current Hand:** ${carNameGen({ currentCar, rarity: true, upgrade: hand.upgrade })}`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            if (event.isActive || guildMember.roles.cache.has(eventMakerRoleID)) {
                const track = require(`../tracks/${event.roster[round - 1].track}.json`);
                const [playerCar, playerList] = createCar(hand, settings.unitpreference, settings.hideownstats);
                const [opponentCar, opponentList] = createCar(event.roster[round - 1], settings.unitpreference);

                const intermission = new InfoMessage({
                    channel: message.channel,
                    title: "Ready to Play?",
                    desc: `Track: ${track["trackName"]}, Requirements: \`${reqDisplay(event.roster[round - 1].reqs, settings.filterlogic)}\``,
                    author: message.author,
                    thumbnail: track["map"],
                    fields: [
                        { name: "Your Hand", value: playerList, inline: true },
                        { name: "Opponent's Hand", value: opponentList, inline: true }
                    ],
                    footer: `Event: ${event.name} (Round ${round})`
                });
                await confirm(message, intermission, acceptedFunction, settings.buttonstyle, currentMessage);

                async function acceptedFunction(currentMessage) {
                    if (event.isActive && event.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline)).invalid !== null) {
                        intermission.editEmbed({ title: "Looks like this event just ended.", desc: "That's just sad." });
                        return intermission.sendMessage({ currentMessage });
                    }
                    currentMessage.removeButtons();
                    const result = await race(message, playerCar, opponentCar, track, settings.enablegraphics);

                    if (result > 0) {
                        for (let [key, value] of Object.entries(event.roster[round - 1].rewards)) {
                            switch (key) {
                                case "money":
                                case "fuseTokens":
                                case "trophies":
                                    let hasEntry = unclaimedRewards.findIndex(entry => entry.origin === event.name && entry[key] !== undefined);
                                    if (hasEntry > -1) {
                                        unclaimedRewards[hasEntry][key] += value;
                                    }
                                    else {
                                        let template = {};
                                        template[key] = value;
                                        template.origin = event.name;
                                        unclaimedRewards.push(template);
                                    }
                                    break;
                                case "car":
                                    unclaimedRewards.push({
                                        car: {
                                            carID: value.carID.slice(0, 6),
                                            upgrade: value.upgrade
                                        },
                                        origin: event.name
                                    });
                                    break;
                                case "pack":
                                    unclaimedRewards.push({
                                        pack: value.slice(0, 6),
                                        origin: event.name
                                    });
                                    break;
                                default:
                                    break;
                            }
                        }

                        message.channel.send(`**You have beaten Round ${round}! Claim your reward using \`cd-rewards\`.**`);
                        const set = {};
                        set[`playerProgress.${message.author.id}`] = round + 1;
                        await Promise.all([
                            eventModel.updateOne({ eventID: event.eventID }, { "$set": set }),
                            profileModel.updateOne({ userID: message.author.id }, { unclaimedRewards })
                        ]);
                    }
                    return bot.deleteID(message.author.id);
                }
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you may not play this event yet.",
                    desc: `The event you are trying to view is not active currently. You may only view this event if you're an <@&${eventMakerRoleID}>.`,
                    author: message.author,
                });
                return message.channel.send(errorMessage);
            }
        }
    }
};