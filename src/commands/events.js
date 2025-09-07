"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultPageLimit, eventMakerRoleID } = require("../util/consts/consts.js");
const listUpdate = require("../util/functions/listUpdate.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");
const carNameGen = require("../util/functions/carNameGen.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const listRewards = require("../util/functions/listRewards.js");

module.exports = {
    name: "events",
    aliases: ["e", "event"],
    args: 0,
    category: "Gameplay",
    description: "Views all active and inactive events.",
    async execute(message, args) {
        const events = await eventModel.find();
        const perPage = defaultPageLimit;

        // ---------------------
        // FLOW 1: List all events (no args)
        // ---------------------
        if (!args.length) {
            if (!events.length) {
                return new InfoMessage({
                    channel: message.channel,
                    title: "Cloned Drives Events",
                    desc: "There are currently no events.",
                    author: message.author
                }).sendMessage();
            }

            // Convert to plain objects only for the event list
            const activeEvents = events
                .filter(e => e.isActive)
                .sort((a, b) => (new Date(a.deadline) - new Date(b.deadline)))
                .map(e => ({ ...e.toObject(), _isActive: true }));

            const inactiveEvents = events
                .filter(e => !e.isActive)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(e => ({ ...e.toObject(), _isActive: false }));

            const totalPages = 1 + Math.ceil(inactiveEvents.length / perPage);

            await listUpdate(
                [...activeEvents, ...inactiveEvents],
                1,
                totalPages,
                (section, page) => {
                    let pageSection = page === 1
                        ? activeEvents.slice(0, perPage)
                        : inactiveEvents.slice((page - 2) * perPage, (page - 2) * perPage + perPage);

                    const fields = pageSection.map(event => {
                        const progress = event.playerProgress?.[message.author.id] ?? 1;
                        let intervalString = "";

                        if (event._isActive && event.deadline && event.deadline !== "unlimited") {
                            const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline));
                            intervalString = interval.invalid ? "`currently ending`" : timeDisplay(interval);
                            if (progress > (event.roster?.length ?? 0)) intervalString += " ✅";
                        } else if (event._isActive) {
                            intervalString = "`unlimited time remaining`";
                            if (progress > (event.roster?.length ?? 0)) intervalString += " ✅";
                        }

                        return {
                            name: `${event.name} ${event._isActive ? "(Active)" : "(Inactive)"}`,
                            value: `Rounds: ${event.roster?.length ?? 0}\n${intervalString}`,
                            inline: false
                        };
                    });

                    return new InfoMessage({
                        channel: message.channel,
                        title: "Cloned Drives Events",
                        author: message.author,
                        fields,
                        footer: `Page ${page} of ${totalPages} - Use the buttons to navigate.`
                    });
                },
                { listamount: perPage }
            );

            return;
        }

        // ---------------------
        // FLOW 2: View a specific event
        // ---------------------
        let page = 1;
        if (args.length > 1 && !isNaN(args[args.length - 1])) page = parseInt(args.pop());
        const query = args.map(i => i.toLowerCase());

        const searchResult = await search(message, query, events, "event");
        if (!Array.isArray(searchResult)) return;

        const [event, currentMessage] = searchResult;

        // Pass the Mongoose document directly here
        await viewEvent(event, page, currentMessage);

        // ---------------------
        // Helper: View rounds of an event
        // ---------------------
        async function viewEvent(event, page, currentMessage) {
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);

            if (!event.isActive && !guildMember.roles.cache.has(eventMakerRoleID)) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error: Insufficient permissions",
                    desc: `You cannot view this inactive event unless you have the <@&${eventMakerRoleID}> role.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const perPageLocal = settings.listamount || defaultPageLimit;
            const list = event.roster || [];

            const totalPages = Math.ceil(list.length / perPageLocal);
            if (page < 1 || page > totalPages) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error: Page number invalid",
                    desc: `This event has ${totalPages} pages of rounds.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            const slices = Array.from({ length: totalPages }, (_, i) =>
                list.slice(i * perPageLocal, (i + 1) * perPageLocal)
            );

            await listUpdate(
                slices,
                page,
                totalPages,
                (section, page) => {
                    const fields = section.map((roundData, i) => {
                        const roundNum = (page - 1) * perPageLocal + i + 1;

                        let currentCar = null;
                        let track = null;

                        try { if (roundData?.carID) currentCar = require(`../cars/${roundData.carID}`); } catch {}
                        try { if (roundData?.track) track = require(`../tracks/${roundData.track}`); } catch {}

                        const reqs = roundData?.reqs ? reqDisplay(roundData.reqs, settings.filterlogic) : "N/A";
                        const rewards = roundData?.rewards ? listRewards(roundData.rewards) : "None";

                        return {
                            name: `Round ${roundNum} ${roundNum < (event.playerProgress?.[message.author.id] ?? 1) ? "✅" : ""}`,
                            value: `Car: ${currentCar ? carNameGen({ currentCar, rarity: true, upgrade: roundData.upgrade }) : "Data missing"}\n` +
                                   `Track: ${track ? track.trackName : "Data missing"}\n` +
                                   `Reqs: \`${reqs}\`\n` +
                                   `Reward: ${rewards}`,
                            inline: true
                        };
                    });

                    return new InfoMessage({
                        channel: message.channel,
                        title: `${event.name}`,
                        author: message.author,
                        fields,
                        footer: `Page ${page} of ${totalPages} - Interact with the buttons to navigate.`
                    });
                },
                { listamount: perPageLocal },
                currentMessage
            );
        }
    }
};
