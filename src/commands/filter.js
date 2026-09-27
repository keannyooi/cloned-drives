"use strict";

const bot = require("../config/config.js");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID } = require("../util/consts/consts.js");
const { getTrack } = require("../util/functions/dataManager.js");
const editFilter = require("../util/functions/editFilter.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");
const championshipModel = require("../models/championshipsSchema.js");

/**
 * Where `applyreqs` can read requirements from (cd-applyreqs is a shortcut
 * to the same code).
 */
const REQ_SOURCE = {
    rr: "rr", randomrace: "rr",
    event: "event", events: "event", e: "event",
    championship: "championship", championships: "championship", champ: "championship", c: "championship"
};
/**
 * How each mode's race CHECKS a multi-value list: Random Race needs all of
 * them (randomrace.js calls filterCheck without applyOrLogic), events and
 * championships accept any one of them (playevent.js / playchampionship.js
 * pass applyOrLogic: true). The garage filter follows the player's own
 * filterlogic setting instead, so a mismatch gets a warning.
 */
const RACE_LOGIC = { rr: "and", event: "or", championship: "or" };

/** Same rule as viewing one: an inactive event or championship is for event makers only. */
async function isEventMaker(message) {
    if (!eventMakerRoleID || !bot.homeGuild) return false;
    const member = bot.homeGuild.members.cache.get(message.author.id)
        || await bot.homeGuild.members.fetch(message.author.id).catch(() => null);
    return !!(member && member.roles && member.roles.cache && member.roles.cache.has(eventMakerRoleID));
}

/**
 * A multi-value list means different things to the race and to the garage
 * when their logics differ. Say so, rather than leave a filter that quietly
 * shows nothing (or too much). cardType is always "any of" in filterCheck.
 */
function logicWarning(reqs, raceLogic, playerLogic) {
    if (raceLogic === playerLogic) return null;
    const lists = Object.entries(reqs)
        .filter(([key, value]) => Array.isArray(value) && value.length > 1 && key !== "cardType")
        .map(([key]) => `\`${key}\``);
    if (lists.length === 0) return null;
    const which = lists.join(", ");
    return raceLogic === "or"
        ? `⚠️ This round accepts **any one** of the values under ${which}, but your filter logic is \`and\`, so your garage will only show cars matching **all** of them. Switch with \`cd-settings filterlogic or\`.`
        : `⚠️ This race needs **all** of the values under ${which}, but your filter logic is \`or\`, so your garage will also show cars matching just one. Switch with \`cd-settings filterlogic and\`.`;
}

/**
 * `applyreqs <rr | event <name> | championship <name>>` — REPLACE the filter
 * with a race's requirements. Events and championships use the round the
 * player is on (playerProgress), exactly as cd-playevent / cd-playchampionship
 * would race it.
 */
async function applyRequirements(message, args, filter, raceWeekStats, settings) {
    const categoryWord = (args[0] || "").toLowerCase();
    const kind = REQ_SOURCE[categoryWord];
    if (!kind) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, filter application category provided doesn't exist.",
            desc: "Apply the requirements of:\n"
                + "`rr` / `randomrace` — your current Random Race\n"
                + "`event <event name>` — the round you're on in an event\n"
                + "`championship <championship name>` — the round you're on in a championship",
            author: message.author
        }).displayClosest(categoryWord, ["rr", "randomrace", "event", "championship"]);
        return errorMessage.sendMessage();
    }

    let reqs, title, where = null, currentMessage;
    if (kind === "rr") {
        // raceWeekStats is lazy-initialized; old profiles may lack it entirely
        reqs = raceWeekStats?.reqs ?? {};
        if (!reqs || Object.keys(reqs).length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, no requirements found.",
                desc: "There are no active requirements to apply to your filter.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        title = "Successfully applied requirements to filter!";
    }
    else {
        const isEvent = kind === "event";
        const noun = isEvent ? "event" : "championship";
        const model = isEvent ? eventModel : championshipModel;
        const query = args.slice(1).map(word => word.toLowerCase()).filter(Boolean);
        // Only what this needs: names for the search, each round's reqs and
        // track, and THIS player's progress (not every player's).
        const list = await model.find({}, {
            name: 1, isActive: 1, "roster.reqs": 1, "roster.track": 1,
            [`playerProgress.${message.author.id}`]: 1
        }).lean();

        if (query.length === 0) {
            const active = list.filter(item => item.isActive).map(item => item.name);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: `Error, which ${noun}?`,
                desc: `Name it: \`cd-applyreqs ${noun} <${noun} name>\`.\n`
                    + (active.length > 0
                        ? `Active right now: ${active.slice(0, 10).join(", ")}${active.length > 10 ? ", …" : ""}`
                        : `There are no active ${noun}s right now.`),
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const response = await search(message, query, list, isEvent ? "event" : "championships");
        if (!Array.isArray(response)) return;
        let item;
        [item, currentMessage] = response;

        if (!item.isActive && !(await isEventMaker(message))) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: `Error, you do not have the necessary role to view this ${noun} right now.`,
                desc: `The ${noun} you are trying to view is not active currently. You may only view this ${noun} if you're an <@&${eventMakerRoleID}>.`,
                author: message.author
            });
            return errorMessage.sendMessage({ currentMessage });
        }

        const roster = Array.isArray(item.roster) ? item.roster : [];
        const round = (item.playerProgress || {})[message.author.id] ?? 1;
        if (round > roster.length) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: `You have already completed this ${noun}.`,
                desc: `Every round of **${item.name}** is done, so there are no requirements left to apply.`,
                author: message.author
            });
            return errorMessage.sendMessage({ currentMessage });
        }

        reqs = roster[round - 1].reqs || {};
        const track = roster[round - 1].track ? getTrack(roster[round - 1].track) : null;
        where = `**${item.name}**, Round ${round} of ${roster.length}${track ? ` · ${track.trackName}` : ""}`;
        if (Object.keys(reqs).length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Round ${round} of ${item.name} has no requirements.`,
                desc: "Any car can enter, so your filter was left as it is.",
                author: message.author
            });
            return infoMessage.sendMessage({ currentMessage });
        }
        title = `Applied Round ${round} of ${item.name} to your filter!`;
    }

    // REPLACE the filter, don't merge into it. Leftover criteria from an
    // earlier search hid cars that fit the race, so players were running
    // `cd-filter remove all` before every applyreqs.
    const clearedCount = Object.keys(filter || {}).filter(key => !(key in reqs)).length;
    const next = { ...reqs };
    await profileModel.updateOne({ userID: message.author.id }, { filter: next });

    const playerLogic = settings.filterlogic === "or" ? "or" : "and";
    const fields = [];
    for (let [key, value] of Object.entries(next)) {
        if (typeof value === "object" && value !== null) {
            value = Array.isArray(value) ? value.join(` ${playerLogic} `) : `${value.start} ~ ${value.end}`;
        }
        fields.push({ name: key, value: `\`${value}\``, inline: true });
    }
    const lines = [];
    if (where) lines.push(where);
    if (clearedCount > 0) lines.push(`Your previous filter was replaced — ${clearedCount} other criteri${clearedCount === 1 ? "on" : "a"} cleared.`);
    const warning = logicWarning(next, RACE_LOGIC[kind], playerLogic);
    if (warning) lines.push(warning);

    const infoMessage = new InfoMessage({
        channel: message.channel,
        title,
        desc: lines.length > 0 ? lines.join("\n") : null,
        author: message.author,
        fields
    });
    return infoMessage.sendMessage({ currentMessage });
}

module.exports = {
    name: "filter",
    usage: [
        "<make / country / drivetype / tyretype / gc / bodystyle / enginepos / fueltype / tags / collection / search> <corresponding value>",
        "<cr / modelyear / seatcount> <starting value> [ending value]",
        "<isprize / isstock / isupgraded / ismaxed / isowned> <true / false>",
        "<remove / disable> <make / country / tags / collection / tyretype> <corresponding value>",
        "<remove / disable> <make / country / tags / collection / tyretype> all",
        "<remove / disable> <cr / modelyear / seatcount / drivetype / tyretype / gc / bodystyle / enginepos / fueltype / abs / tcs / isprize / isstock / isupgraded / ismaxed / isowned / search>",
        "<remove / disable> all",
        "applyreqs rr",
        "applyreqs event <event name>",
        "applyreqs championship <championship name>"
    ],
    args: 0,
    category: "Configuration",
    description: "Sets up a filter for garages and car lists.",
    async execute(message, args) {
        let { filter, raceWeekStats, settings } = await profileModel.findOne({ userID: message.author.id }, { filter: 1, raceWeekStats: 1, settings: 1 });
        let infoMessage;

        if (!args[0]) {
            const fields = [];
            for (let [key, value] of Object.entries(filter)) {
                switch (typeof value) {
                    case "object":
                        if (Array.isArray(value)) {
                            value = value.join(settings.filterlogic ? " or " : " and ");
                        }
                        else {
                            value = `${value.start} ~ ${value.end}`;
                        }
                        break;
                    case "string":
                    case "boolean":
                        break;
                    default:
                        break;
                }
                fields.push({ name: key, value: `\`${value}\``, inline: true });
            }

            infoMessage = new InfoMessage({
                channel: message.channel,
                title: "Current Filter",
                desc: fields.length > 0 ? null : "There are currently no activated filters.",
                author: message.author,
                fields
            });
        }
        else {
            if (!args[1]) {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, arguments provided incomplete.",
                    desc: "Please refer to the help section by typing `cd-help filter`.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            if (args[0].toLowerCase() === "applyreqs") {
                return applyRequirements(message, args.slice(1), filter, raceWeekStats, settings);
            }

            const response = editFilter(message, filter, args);
            if (!Array.isArray(response)) return;
            ([filter, infoMessage] = response);
            await profileModel.updateOne({ userID: message.author.id }, { filter });
        }
        return infoMessage.sendMessage();
    },
    // exported for tests
    logicWarning
};
