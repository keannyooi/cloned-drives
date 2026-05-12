"use strict";

/**
 * cd-pvp                — list all PvP events (active + drafts)
 * cd-pvp <event name>   — show full details of one event
 *
 * The list view shows: name, time remaining, tickets, rank.
 * The detail view shows: status, settings, reqs, tracksets, ghost decks,
 *                        rewards, and the viewer's standing if entered.
 */

const { DateTime } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { getTrack } = require("../util/functions/dataManager.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const listRewards = require("../util/functions/listRewards.js");
const search = require("../util/functions/search.js");
const pvpEventModel = require("../models/pvpEventSchema.js");
const {
    applyRegen,
    secondsUntilNextTicket,
    formatDuration,
    buildLeaderboard
} = require("../util/functions/pvpTickets.js");

const FIELD_CHAR_LIMIT = 1024;

module.exports = {
    name: "pvp",
    aliases: ["pvpevents"],
    usage: ["", "<event name>"],
    args: 0,
    category: "Gameplay",
    description: "Lists PvP events, or shows full details of one if a name is provided.",
    async execute(message, args) {
        const allEvents = await pvpEventModel.find();

        if (allEvents.length === 0) {
            return new InfoMessage({
                channel: message.channel,
                title: "No PvP events found.",
                desc: "Admins can create one with `cd-createpvp`.",
                author: message.author
            }).sendMessage();
        }

        if (args.length === 0) {
            return showList(message, allEvents);
        }

        // Detail view — fuzzy-match the named event
        const query = args.map(a => a.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, allEvents, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                const [pvpEvent, currentMessage] = response;
                await showDetails(message, pvpEvent, currentMessage);
            })
            .catch(error => { throw error; });
    }
};

// ============================================================================
// LIST VIEW
// ============================================================================

async function showList(message, allEvents) {
    const activeEvents = allEvents.filter(e => e.isActive);
    const draftEvents = allEvents.filter(e => !e.isActive);

    activeEvents.sort((a, b) => {
        if (a.deadline === "unlimited" && b.deadline === "unlimited") return 0;
        if (a.deadline === "unlimited") return 1;
        if (b.deadline === "unlimited") return -1;
        return DateTime.fromISO(a.deadline).toMillis() - DateTime.fromISO(b.deadline).toMillis();
    });
    draftEvents.sort((a, b) => a.name.localeCompare(b.name));

    const userID = message.author.id;
    const fields = [];

    if (activeEvents.length > 0) {
        // One field per active event — Discord caps embed fields at 25 and 1024 chars each.
        // This keeps long lists readable instead of silently truncating mid-event.
        const cap = 24; // leave 1 slot for drafts field
        const shown = activeEvents.slice(0, cap);
        for (const event of shown) {
            fields.push({
                name: `🏁 ${event.name}`,
                value: truncate(buildActiveEventBlock(event, userID, /*headless*/ true), FIELD_CHAR_LIMIT),
                inline: false
            });
        }
        if (activeEvents.length > cap) {
            fields.push({
                name: `+ ${activeEvents.length - cap} more`,
                value: `Use \`cd-pvp <name>\` to see details on a specific event.`,
                inline: false
            });
        }
    }
    else {
        fields.push({ name: "Active Events (0)", value: "_None right now — check back soon._" });
    }

    if (draftEvents.length > 0) {
        const draftLines = draftEvents.map(d => `• **${d.name}** _(${d.pvpEventID})_`).join("\n");
        fields.push({ name: `Drafts (${draftEvents.length})`, value: truncate(draftLines, FIELD_CHAR_LIMIT) });
    }

    return new InfoMessage({
        channel: message.channel,
        title: `Cloned Drives PvP Events`,
        author: message.author,
        fields,
        footer: "cd-pvp <name> for details • cd-pvpplay <name> to play • cd-pvpleaderboard <name> for standings"
    }).sendMessage();
}

function buildActiveEventBlock(event, userID, headless) {
    const segments = headless ? [] : [`**${event.name}**`];
    if (event.deadline === "unlimited") {
        segments.push("⏱ No deadline");
    }
    else {
        const epoch = Math.floor(DateTime.fromISO(event.deadline).toSeconds());
        const expired = DateTime.fromISO(event.deadline) < DateTime.now();
        if (expired) {
            segments.push(`🟡 Ending… _(cleanup pending — ended <t:${epoch}:R>)_`);
        }
        else {
            segments.push(`⏱ Ends <t:${epoch}:R>`);
        }
    }

    const entry = event.entries?.[userID];
    const entryCopy = entry ? { ...entry } : null;
    if (entryCopy) applyRegen(entryCopy, event.ticketCap, event.ticketRegenMinutes);

    if (entryCopy) {
        let ticketLine = `🎟 ${entryCopy.tickets}/${event.ticketCap}`;
        const seconds = secondsUntilNextTicket(entryCopy, event.ticketCap, event.ticketRegenMinutes);
        if (seconds !== null && seconds > 0) ticketLine += ` _(next in ${formatDuration(seconds)})_`;
        segments.push(ticketLine);
    }
    else {
        segments.push(`🎟 ${event.ticketCap}/${event.ticketCap} _(not entered yet)_`);
    }

    const leaderboard = buildLeaderboard(event.entries);
    const playerRow = leaderboard.find(p => p.userID === userID);
    if (playerRow) {
        segments.push(`🏆 Rank #${playerRow.rank} — ${playerRow.score} pts (${playerRow.wins}W / ${playerRow.losses}L / ${playerRow.draws}D)`);
    }
    else {
        segments.push(`🏆 Not entered yet`);
    }
    return segments.join("\n");
}

// ============================================================================
// DETAIL VIEW
// ============================================================================

async function showDetails(message, pvpEvent, currentMessage) {
    const fields = [];

    // ── Status ────────────────────────────────────────────────────────
    let status;
    if (pvpEvent.isActive) {
        if (pvpEvent.deadline === "unlimited") {
            status = "🟢 **Active** — no deadline";
        }
        else {
            const epoch = Math.floor(DateTime.fromISO(pvpEvent.deadline).toSeconds());
            const expired = DateTime.fromISO(pvpEvent.deadline) < DateTime.now();
            status = expired
                ? `🟡 **Ending…** — deadline passed <t:${epoch}:R>, awaiting scheduler cleanup (runs every 3 min). Use \`cd-endpvp ${pvpEvent.name}\` to finalize now.`
                : `🟢 **Active** — ends <t:${epoch}:R>`;
        }
    }
    else {
        const dur = pvpEvent.deadline === "unlimited" ? "_duration not set_" : `\`${pvpEvent.deadline}\``;
        status = `⚪ **Draft** — duration: ${dur}`;
    }
    fields.push({ name: "Status", value: status, inline: false });

    // ── Settings (tickets, regen, cooldown, deck cap) ─────────────────
    const settingsLines = [
        `🎟 Ticket cap: **${pvpEvent.ticketCap}**`,
        `♻️ Regen rate: **${pvpEvent.ticketRegenMinutes} min** per ticket`,
        `⏳ Match cooldown: **${pvpEvent.matchCooldownSeconds}s**`
    ];
    if (pvpEvent.deckCrCap > 0) {
        settingsLines.push(`💎 Deck CR cap: **${pvpEvent.deckCrCap}** _(sum of all 5 cars' CR)_`);
    }
    fields.push({ name: "Settings", value: settingsLines.join("\n"), inline: false });

    // ── Reqs ───────────────────────────────────────────────────────────
    const reqsValue = (pvpEvent.reqs && Object.keys(pvpEvent.reqs).length > 0)
        ? truncate(reqDisplay(pvpEvent.reqs) || "_invalid_", FIELD_CHAR_LIMIT)
        : "_No restrictions — any car allowed._";
    fields.push({ name: "Car Requirements", value: reqsValue, inline: false });

    // ── Tracksets + ghost names interleaved ───────────────────────────
    const ghosts = pvpEvent.ghostDecks || {};
    if (Array.isArray(pvpEvent.tracksets) && pvpEvent.tracksets.length > 0) {
        let tsLines = "";
        for (let i = 0; i < pvpEvent.tracksets.length; i++) {
            const ts = pvpEvent.tracksets[i];
            const trackNames = ts.map(tid => getTrack(tid)?.trackName || `\`${tid}\``);
            const ghostList = (ghosts[String(i)] || []).map(g => g.name);
            const ghostText = ghostList.length > 0 ? `_Ghosts:_ ${ghostList.join(", ")}` : `⚠️ _No ghosts_`;
            tsLines += `**${i + 1}.** ${trackNames.join(" → ")}\n${ghostText}\n\n`;
        }
        fields.push({
            name: `Tracksets (${pvpEvent.tracksets.length})`,
            value: truncate(tsLines.trim(), FIELD_CHAR_LIMIT),
            inline: false
        });
    }
    else {
        fields.push({
            name: "Tracksets (0)",
            value: "⚠️ _No tracksets defined yet — add some with `cd-editpvp <name> trackset add`._",
            inline: false
        });
    }

    // ── Reward tiers ───────────────────────────────────────────────────
    if (Array.isArray(pvpEvent.rewards) && pvpEvent.rewards.length > 0) {
        let rewardLines = "";
        for (const tier of pvpEvent.rewards) {
            let label;
            if (tier.rank !== undefined) {
                label = `${medalForRank(tier.rank)} Rank ${tier.rank}`;
            }
            else if (Array.isArray(tier.rankRange)) {
                const [s, e] = tier.rankRange;
                label = `🎯 Ranks ${s}-${e}`;
            }
            else {
                label = `🎖 Top ${tier.topPercent}%`;
            }
            rewardLines += `**${label}** — ${listRewards(stripTierMeta(tier))}\n`;
        }
        fields.push({
            name: `Reward Tiers (${pvpEvent.rewards.length})`,
            value: truncate(rewardLines.trim(), FIELD_CHAR_LIMIT),
            inline: false
        });
    }
    else {
        fields.push({
            name: "Reward Tiers (0)",
            value: "⚠️ _No reward tiers defined yet — add with `cd-editpvp <name> reward add`._",
            inline: false
        });
    }

    // ── Viewer's standing (only for active events with an entry) ──────
    if (pvpEvent.isActive) {
        const userID = message.author.id;
        const entry = pvpEvent.entries?.[userID];
        const leaderboard = buildLeaderboard(pvpEvent.entries);
        const totalParticipants = leaderboard.length;

        if (entry) {
            const entryCopy = { ...entry };
            applyRegen(entryCopy, pvpEvent.ticketCap, pvpEvent.ticketRegenMinutes);
            const playerRow = leaderboard.find(p => p.userID === userID);
            const ticketSeconds = secondsUntilNextTicket(entryCopy, pvpEvent.ticketCap, pvpEvent.ticketRegenMinutes);
            const ticketLine = `🎟 ${entryCopy.tickets}/${pvpEvent.ticketCap}` +
                (ticketSeconds !== null && ticketSeconds > 0 ? ` _(next in ${formatDuration(ticketSeconds)})_` : "");
            fields.push({
                name: "Your Standing",
                value: [
                    ticketLine,
                    `🏆 Rank #${playerRow.rank} of ${totalParticipants}`,
                    `📊 ${playerRow.score} pts • ${playerRow.matchesPlayed} matches • ${playerRow.wins}W / ${playerRow.losses}L / ${playerRow.draws}D`,
                    `📸 Snapshots saved: ${Object.keys(entryCopy.snapshots || {}).length} of ${pvpEvent.tracksets.length} trackset(s)`
                ].join("\n"),
                inline: false
            });
        }
        else {
            fields.push({
                name: "Your Standing",
                value: `_Not entered yet._ Run \`cd-pvpplay ${pvpEvent.name}\` to play your first match.`,
                inline: false
            });
        }
    }

    return new InfoMessage({
        channel: message.channel,
        title: `${pvpEvent.name} — PvP Event Details`,
        desc: `Event ID: \`${pvpEvent.pvpEventID}\``,
        author: message.author,
        fields,
        footer: pvpEvent.isActive
            ? "cd-pvpplay <name> to play • cd-pvpleaderboard <name> for full standings"
            : "Draft — use cd-startpvp <name> to launch (admin)"
    }).sendMessage({ currentMessage });
}

// ============================================================================
// HELPERS
// ============================================================================

function medalForRank(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return "🏅";
}

/** Strip rank/rankRange/topPercent meta from a tier — only the actual reward fields stay. */
function stripTierMeta(tier) {
    const out = {};
    for (const [k, v] of Object.entries(tier)) {
        if (k === "rank" || k === "rankRange" || k === "topPercent") continue;
        out[k] = v;
    }
    return out;
}

function truncate(str, max) {
    if (!str || str.length <= max) return str;
    return str.slice(0, max - 4) + "…";
}
