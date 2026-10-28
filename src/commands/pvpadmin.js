"use strict";

/**
 * cd-pvpadmin — owner-only PvP event admin tools.
 *
 * Subcommands:
 *   grant <user mention/id> <event name> <amount>   — grant tickets to a player for one event
 *
 * The OWNER_ID is defined in src/util/consts/consts.js.
 */

const { DateTime } = require("luxon");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { OWNER_ID } = require("../util/consts/consts.js");
const search = require("../util/functions/search.js");
const searchUser = require("../util/functions/searchUser.js");
const auditLog = require("../util/functions/auditLog.js");
const { applyRegen } = require("../util/functions/pvpTickets.js");
const pvpEventModel = require("../models/pvpEventSchema.js");

module.exports = {
    name: "pvpadmin",
    aliases: [],
    usage: [
        "grant <user> <event name> <amount>"
    ],
    args: 4,
    category: "Admin",
    description: "Owner-only PvP event admin tools.",
    async execute(message, args) {
        if (message.author.id !== OWNER_ID) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, this command is owner-only.",
                desc: "Only the bot owner can use `cd-pvpadmin`.",
                author: message.author
            }).sendMessage();
        }

        const subcmd = args[0].toLowerCase();
        switch (subcmd) {
            case "grant":
                return grantTickets(message, args.slice(1));
            default:
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, unknown pvpadmin subcommand.",
                    desc: "Available: `grant`",
                    author: message.author
                }).displayClosest(subcmd).sendMessage();
        }
    }
};

/**
 * cd-pvpadmin grant <user> <event name...> <amount>
 *
 * The amount is the LAST argument; the event name is everything between the user
 * and the amount (so it can have spaces).
 */
async function grantTickets(message, args) {
    if (args.length < 3) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, grant syntax invalid.",
            desc: "Use: `cd-pvpadmin grant <user> <event name> <amount>`",
            author: message.author
        }).sendMessage();
    }

    // Parse: user, event-name (multi-word, in middle), amount (last)
    const amountStr = args[args.length - 1];
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount === 0) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, amount must be a non-zero number.",
            desc: "Positive numbers add tickets, negative numbers subtract.",
            author: message.author
        }).displayClosest(amountStr).sendMessage();
    }

    const userArg = args[0];
    const eventNameParts = args.slice(1, -1);

    // Resolve target user
    let targetUser = null;
    if (message.mentions.users.first()) {
        targetUser = message.mentions.users.first();
        if (targetUser.bot) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, can't grant tickets to a bot.",
                author: message.author
            }).sendMessage();
        }
    }
    else {
        const userResponse = await searchUser(message, userArg.toLowerCase(), undefined, { strict: true });
        if (!Array.isArray(userResponse)) return;
        targetUser = userResponse[0].user;
    }

    if (!targetUser) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, target user not found.",
            author: message.author
        }).sendMessage();
    }

    // Resolve event
    const events = await pvpEventModel.find({ isActive: true });
    if (events.length === 0) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, no active PvP events.",
            desc: "Tickets can only be granted for events that are currently live.",
            author: message.author
        }).sendMessage();
    }

    const query = eventNameParts.map(p => p.toLowerCase());
    await new Promise(resolve => resolve(search(message, query, events, "event")))
        .then(async (response) => {
            if (!Array.isArray(response)) return;
            const [pvpEvent, currentMessage] = response;

            // Build / update the user's entry.
            // First, settle any pending regen so we don't wipe in-progress regen
            // when bumping their ticket count. Then apply the grant, capped at ticketCap.
            // Only the two ticket fields are written, and only while they still hold
            // what we read (compare-and-set): the player may be mid-match, and a
            // whole-entry $set would wipe their score/record changes, while a blind
            // ticket $set would undo a ticket they just spent. On a miss, re-read
            // and recompute (a few tries — a match spends at most one ticket).
            const entryPath = `entries.${targetUser.id}`;
            let entries = pvpEvent.entries || {};
            let before, newTotal, applied = false;
            for (let attempt = 1; attempt <= 3 && !applied; attempt++) {
                if (attempt > 1) {
                    const fresh = await pvpEventModel.findOne(
                        { pvpEventID: pvpEvent.pvpEventID, isActive: true },
                        { [entryPath]: 1 }
                    ).lean();
                    if (!fresh) break;
                    entries = fresh.entries || {};
                }
                const stored = entries[targetUser.id];
                const existing = stored ? { ...stored } : newEntry(pvpEvent);
                applyRegen(existing, pvpEvent.ticketCap, pvpEvent.ticketRegenMinutes);
                before = existing.tickets;
                // Cap at ticketCap on the upper end, floor at 0 on the lower end.
                newTotal = Math.min(pvpEvent.ticketCap, Math.max(0, before + amount));
                existing.tickets = newTotal;
                // Don't reset lastTicketUse — applyRegen already set it correctly.

                let filter, update;
                if (stored) {
                    filter = {
                        pvpEventID: pvpEvent.pvpEventID,
                        isActive: true,
                        [`${entryPath}.tickets`]: stored.tickets ?? null,
                        [`${entryPath}.lastTicketUse`]: stored.lastTicketUse ?? null
                    };
                    update = { "$set": {
                        [`${entryPath}.tickets`]: newTotal,
                        [`${entryPath}.lastTicketUse`]: existing.lastTicketUse ?? null
                    }};
                }
                else {
                    // No entry yet — safe to write it whole, unless one appears meanwhile
                    filter = { pvpEventID: pvpEvent.pvpEventID, isActive: true, [entryPath]: { $exists: false } };
                    update = { "$set": { [entryPath]: existing } };
                }
                const result = await pvpEventModel.updateOne(filter, update);
                applied = result.matchedCount > 0;
            }

            if (!applied) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, ticket grant failed.",
                    desc: `${targetUser.username}'s entry kept changing (or "${pvpEvent.name}" just ended). Try again in a moment.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            auditLog(message, { command: "pvpadmin", target: targetUser, details: { sub: "grant", pvpEventID: pvpEvent.pvpEventID, amount, ticketsBefore: before, ticketsAfter: newTotal } });
            const cappedNote = (before + amount > pvpEvent.ticketCap) ? ` _(capped at ${pvpEvent.ticketCap})_` : "";
            return new SuccessMessage({
                channel: message.channel,
                title: `Updated ${targetUser.username}'s tickets in "${pvpEvent.name}".`,
                desc: `**${before}** → **${newTotal}** (${amount > 0 ? "+" : ""}${amount})${cappedNote}`,
                author: message.author
            }).sendMessage({ currentMessage });
        })
        .catch(error => { throw error; });
}

/** Build a fresh entry for a player who hasn't participated yet. */
function newEntry(pvpEvent) {
    return {
        tickets: pvpEvent.ticketCap,
        lastTicketUse: new Date().toISOString(),
        lastMatchEnd: null,
        score: 0,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        snapshots: {}
    };
}
