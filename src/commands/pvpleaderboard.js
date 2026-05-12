"use strict";

/**
 * cd-pvpleaderboard <event name> [page]
 *
 * Paginated leaderboard for a single PvP event.
 * Shows rank, username, score, matchesPlayed, W/L/D for every participant.
 * The viewer's own row is highlighted if they're on the page.
 */

const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const search = require("../util/functions/search.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");
const pvpEventModel = require("../models/pvpEventSchema.js");
const { buildLeaderboard } = require("../util/functions/pvpTickets.js");

module.exports = {
    name: "pvpleaderboard",
    aliases: ["pvplb", "pvpboard"],
    usage: ["<event name>", "<event name> <page>"],
    args: 1,
    category: "Gameplay",
    description: "Shows the leaderboard for a specific PvP event.",
    async execute(message, args) {
        const events = await pvpEventModel.find({ isActive: true });
        if (events.length === 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no active PvP events.",
                desc: "There are no active PvP events to show a leaderboard for.",
                author: message.author
            }).sendMessage();
        }

        // Strip a trailing page number if present
        let startPage = 1;
        let queryArgs = [...args];
        if (queryArgs.length > 1 && !isNaN(queryArgs[queryArgs.length - 1])) {
            startPage = Math.max(1, parseInt(queryArgs.pop(), 10));
        }
        const query = queryArgs.map(a => a.toLowerCase());

        const playerData = await profileModel.findOne({ userID: message.author.id });
        const settings = playerData?.settings || {};

        await new Promise(resolve => resolve(search(message, query, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                const [pvpEvent, currentMessage] = response;
                await displayLeaderboard(pvpEvent, currentMessage);
            })
            .catch(error => { throw error; });

        async function displayLeaderboard(pvpEvent, currentMessage) {
            const leaderboard = buildLeaderboard(pvpEvent.entries);
            if (leaderboard.length === 0) {
                return new InfoMessage({
                    channel: message.channel,
                    title: `${pvpEvent.name} — Leaderboard`,
                    desc: "_No participants yet — be the first to play a match!_",
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            const pageLimit = settings.listamount || defaultPageLimit;
            const totalPages = Math.max(1, Math.ceil(leaderboard.length / pageLimit));
            startPage = Math.min(startPage, totalPages);

            // Try to fetch usernames so the leaderboard reads nicely.
            // Fall back to <@id> mention if the user isn't cached.
            const userCache = new Map();
            for (const row of leaderboard) {
                if (userCache.has(row.userID)) continue;
                try {
                    const u = await message.client.users.fetch(row.userID);
                    userCache.set(row.userID, u?.username || row.userID);
                } catch {
                    userCache.set(row.userID, null); // mention will be used
                }
            }

            const myID = message.author.id;
            const myRow = leaderboard.find(r => r.userID === myID);

            function listDisplay(section, page, totalPages) {
                let body = "";
                for (const row of section) {
                    const isYou = row.userID === myID;
                    const medal = row.rank === 1 ? "🥇 " : row.rank === 2 ? "🥈 " : row.rank === 3 ? "🥉 " : "";
                    const username = userCache.get(row.userID) || `<@${row.userID}>`;
                    const wld = `${row.wins}W/${row.losses}L/${row.draws}D`;
                    const line = `${medal}**#${row.rank}** ${username}${isYou ? " ← _you_" : ""} — **${row.score} pts** • ${row.matchesPlayed} matches • ${wld}`;
                    body += line + "\n";
                }

                let footer = `Page ${page} / ${totalPages} • ${leaderboard.length} participant(s)`;
                if (myRow && (myRow.rank < (page - 1) * pageLimit + 1 || myRow.rank > page * pageLimit)) {
                    footer += ` • You're ranked #${myRow.rank}`;
                }

                return new InfoMessage({
                    channel: message.channel,
                    title: `${pvpEvent.name} — Leaderboard`,
                    desc: body,
                    author: message.author,
                    footer
                });
            }

            await listUpdate(leaderboard, startPage, totalPages, listDisplay, settings, currentMessage);
        }
    }
};
