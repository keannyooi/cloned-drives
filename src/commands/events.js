"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, defaultPageLimit } = require("../util/consts/consts.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const listUpdate = require("../util/functions/listUpdate.js");
const listRewards = require("../util/functions/listRewards.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

const FIELD_CHAR_LIMIT = 1024;

module.exports = {
    name: "events",
    aliases: ["e", "event"],
    usage: ["", "[page number]", "[event name]", "[event name] [page number]"],
    args: 0,
    category: "Gameplay",
    description: "Views all active and inactive events.",
    async execute(message, args) {
        const events = await eventModel.find();
        const { settings } = await profileModel.findOne({ userID: message.author.id });
        
        // Check if first arg is a page number (for event list pagination)
        let listPage = 1;
        let isListPageRequest = false;
        if (args.length === 1 && !isNaN(args[0])) {
            listPage = parseInt(args[0]);
            isListPageRequest = true;
        }
        
        if (!args.length || events.length === 0 || isListPageRequest) {
            // Sort and separate events
            let activeEvents = events
                .filter(event => event.isActive === true)
                .sort((a, b) => {
                    // Sort by deadline (soonest first)
                    // "unlimited" deadlines go to the end
                    if (a.deadline === "unlimited" && b.deadline === "unlimited") return 0;
                    if (a.deadline === "unlimited") return 1;
                    if (b.deadline === "unlimited") return -1;
                    
                    const dateA = DateTime.fromISO(a.deadline);
                    const dateB = DateTime.fromISO(b.deadline);
                    
                    if (!dateA.isValid && !dateB.isValid) return 0;
                    if (!dateA.isValid) return 1;
                    if (!dateB.isValid) return -1;
                    
                    return dateA.toMillis() - dateB.toMillis();
                });
            
            let inactiveEvents = events.filter(event => event.isActive === false);
            
            // Build display strings to check length
            const activeEventList = buildEventList(activeEvents, message.author.id);
            const inactiveEventList = buildEventList(inactiveEvents, message.author.id);
            
            // Check if either field would overflow
            const needsPagination = activeEventList.length > FIELD_CHAR_LIMIT || 
                                   inactiveEventList.length > FIELD_CHAR_LIMIT;
            
            if (!needsPagination) {
                // Simple display - no pagination needed
                let listMessage = new InfoMessage({
                    channel: message.channel,
                    title: "Cloned Drives Events",
                    author: message.author,
                    fields: [
                        { name: `Active Events (${activeEvents.length})`, value: activeEventList || "No active events." },
                        { name: `Inactive Events (${inactiveEvents.length})`, value: inactiveEventList || "No inactive events." }
                    ],
                    footer: "More info about an event can be found by using cd-events <event name>."
                });
                return listMessage.sendMessage();
            } else {
                // Pagination needed - combine into single sorted list
                // Active events first (sorted by deadline), then inactive
                const combinedEvents = [...activeEvents, ...inactiveEvents];
                const pageLimit = settings.listamount || defaultPageLimit;
                const totalPages = Math.ceil(combinedEvents.length / pageLimit);
                
                // Validate page number
                if (listPage < 1 || listPage > totalPages) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, page number requested invalid.",
                        desc: `The events list ends at page ${totalPages}.`,
                        author: message.author
                    }).displayClosest(listPage);
                    return errorMessage.sendMessage();
                }
                
                try {
                    await listUpdate(combinedEvents, listPage, totalPages, eventListDisplay, settings);
                } catch (error) {
                    throw error;
                }
                
                function eventListDisplay(section, page, totalPages) {
                    const fields = [];
                    
                    for (let i = 0; i < section.length; i++) {
                        const event = section[i];
                        const progress = event.playerProgress[message.author.id] ?? 1;
                        const completed = progress > event.roster.length;
                        
                        let statusLine = "";
                        let timeInfo = "";
                        
                        if (event.isActive) {
                            if (event.deadline !== "unlimited") {
                                const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline));
                                if (interval.invalid === null) {
                                    timeInfo = timeDisplay(interval);
                                } else {
                                    timeInfo = "`ending soon`";
                                }
                            } else {
                                timeInfo = "`unlimited`";
                            }
                            statusLine = `🟢 ${timeInfo}`;
                        } else {
                            statusLine = "🔴 Inactive";
                        }
                        
                        fields.push({
                            name: `${event.name} ${completed ? "✅" : ""}`,
                            value: `${statusLine}\nRounds: ${progress - 1}/${event.roster.length}`,
                            inline: true
                        });
                    }
                    
                    const infoMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Cloned Drives Events (${combinedEvents.length} Total)`,
                        desc: "Events are sorted by deadline (ending soonest first).",
                        author: message.author,
                        fields,
                        footer: `Page ${page} of ${totalPages} • Use cd-events <event name> for details.`
                    });
                    
                    return infoMessage;
                }
            }
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
                        let currentCar = getCar(section[i].carID);
                        let track = getTrack(section[i].track);

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
                        Time Remaining: \`${event.deadline && event.deadline.length > 9 ? timeDisplay(Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline))) : event.deadline}\``,
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

        /**
         * Builds event list string for a category
         */
        function buildEventList(events, userId) {
            if (events.length === 0) {
                return "There are currently no events under this category.\n";
            }
            
            let eventList = "";
            for (let event of events) {
                let intervalString = "";
                let progress = event.playerProgress[userId] ?? 1;
                
                if (event.isActive && event.deadline !== "unlimited") {
                    let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline));
                    if (interval.invalid === null) {
                        intervalString = `${timeDisplay(interval)} ${progress > event.roster.length ? "✅" : ""}`;
                    } else {
                        intervalString = `\`currently ending, no longer playable\` ${progress > event.roster.length ? "✅" : ""}`;
                    }
                } else if (event.isActive) {
                    intervalString = `\`unlimited time remaining\` ${progress > event.roster.length ? "✅" : ""}`;
                }
                
                eventList += `${event.name} ${intervalString}\n`;
            }
            
            return eventList;
        }
    }
};
