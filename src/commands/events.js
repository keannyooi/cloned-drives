"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, defaultPageLimit } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const listUpdate = require("../util/functions/listUpdate.js");
const listRewards = require("../util/functions/listRewards.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "events",
    aliases: ["e", "event"],
    usage: ["[event name]", "[event name] [page number]"],
    args: 0,
    category: "Gameplay",
    description: "Views all active and inactive events.",
    async execute(message, args) {
        const events = await eventModel.find();
        if (!args.length || events.length === 0) {
            let activeEvents = events.filter(event => event.isActive === true);
            let inactiveEvents = events.filter(event => event.isActive === false);
            let activeEventList = eventDisplay(activeEvents);
            let inactiveEventList = eventDisplay(inactiveEvents);
            let listMessage = new InfoMessage({
                channel: message.channel,
                title: "Cloned Drives Events",
                author: message.author,
                fields: [
                    { name: "Active Events", value: activeEventList },
                    { name: "Inactive Events", value: inactiveEventList }
                ],
                footer: "More info about an event can be found by using cd-events <event name>."
            });
            return listMessage.sendMessage();
        }
        else {
            let page = 1;
            if (args.length > 1 && !isNaN(args[args.length - 1])) {
                page = parseInt(args.pop());
            }
            let query = args.map(i => i.toLowerCase());

            await new Promise(resolve => resolve(search(message, query, events, "event")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await viewEvent(result, page, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function viewEvent(event, page, currentMessage) {
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            console.log(event);

            if (event.isActive || guildMember.roles.cache.has(eventMakerRoleID)) {
                const { settings } = await profileModel.findOne({ userID: message.author.id });
                let list = event.roster;
                const totalPages = Math.ceil(list.length / (settings.listamount || defaultPageLimit));
                if (page < 1 || totalPages < page) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, page number requested invalid.",
                        desc: `The event view ends at page ${totalPages}.`,
                        author: message.author
                    }).displayClosest(page);
                    return errorMessage.sendMessage({ currentMessage });
                }

                try {
                    await listUpdate(list, page, totalPages, listDisplay, settings, currentMessage);
                }
                catch (error) {
                    throw error;
                }

                function listDisplay(section, page, totalPages) {
                    const fields = [];
                    for (let i = 0; i < section.length; i++) {
                        let round = (page - 1) * (settings.listamount || defaultPageLimit) + i + 1;
                        let currentCar = require(`../cars/${section[i].carID}`);
                        let track = require(`../tracks/${section[i].track}`);

                        fields.push({
                            name: `Round ${round} ${round < event.playerProgress[message.author.id] ? "✅" : ""}`,
                            value: `Car: ${carNameGen({ currentCar, rarity: true, upgrade: section[i].upgrade })}
                            Track: ${track["trackName"]}
                            Reqs: \`${reqDisplay(section[i].reqs, settings.filterlogic)}\`
                            Reward: ${listRewards(section[i].rewards)}`,
                            inline: true
                        });
                    }

                    const infoMessage = new InfoMessage({
                        channel: message.channel,
                        title: `${event.name} \`(ID: ${event.eventID})\``,
                        desc: `**This event is ${event.isActive ? "active!" : "not active."}**
                        Time Remaining: \`${event.deadline.length > 9 ? timeDisplay(Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline))) : event.deadline}\``,
                        author: message.author,
                        fields,
                        footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                    });
                    return infoMessage;
                }
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you do not have the necessary role to view this event right now.",
                    desc: `The event you are trying to view is not active currently. You may only view this event if you're an <@&${eventMakerRoleID}>.`,
                    author: message.author,
                });
                return errorMessage.sendMessage({ currentMessage });
            }
        }

        function eventDisplay(events) {
            if (events.length > 0) {
                let eventList = "";
                for (let event of events) {
                    let intervalString = "";
                    let progress = event.playerProgress[message.author.id] ?? 1;
                    if (event.isActive && event.deadline !== "unlimited") {
                        let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline));
                        if (interval.invalid === null) {
                            intervalString = `${timeDisplay(interval)} ${progress > event.roster.length ? "✅" : ""}`;
                        }
                        else {
                            intervalString = `\`currently ending, no longer playable\` ${progress > event.roster.length ? "✅" : ""}`;
                        }
                    }
                    else if (event.isActive) {
                        intervalString = `\`unlimited time remaining\` ${progress > event.roster.length ? "✅" : ""}`;
                    }
                    eventList += `${event.name} ${intervalString}\n`;
                }
                return eventList;
            }
            else {
                return "There are currently no events under this category.\n";
            }
        }
    }
};