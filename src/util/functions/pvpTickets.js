"use strict";

/**
 * PVP TICKET HELPERS
 * ==================
 * Shared utilities for ticket regeneration, used by cd-pvp, cd-pvpplay, and cd-pvpadmin.
 *
 * Regen rules (per the design):
 *   - Players start with full ticket cap on first entry
 *   - Tickets regen at `ticketRegenMinutes` per ticket
 *   - Regen "pauses" while at cap (no progress accumulates uselessly)
 *   - Partial regen progress is preserved across calls (we advance lastTicketUse
 *     by `actualAdded * ticketRegenMinutes`, not by raw elapsed time)
 */

const { DateTime } = require("luxon");

/**
 * Build a fresh entry for a player who hasn't participated in this event yet.
 * Starts at full ticket cap. lastTicketUse is null (no use yet → no regen needed).
 */
function newEntry(pvpEvent) {
    return {
        tickets: pvpEvent.ticketCap,
        lastTicketUse: null,
        lastMatchEnd: null,
        score: 0,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        snapshots: {}
    };
}

/**
 * Apply ticket regen to an entry IN PLACE based on elapsed time since lastTicketUse.
 * Does NOT save to the DB — caller is responsible.
 *
 * Returns the entry (mutated) for convenience.
 */
function applyRegen(entry, ticketCap, ticketRegenMinutes) {
    if (!entry) return entry;
    if (entry.tickets >= ticketCap) {
        // At cap — no regen needed, clear the timer
        entry.lastTicketUse = null;
        return entry;
    }
    if (!entry.lastTicketUse) return entry; // no anchor → no regen possible

    const lastUse = DateTime.fromISO(entry.lastTicketUse);
    if (!lastUse.isValid) return entry;

    const minutesElapsed = DateTime.now().diff(lastUse, "minutes").minutes;
    if (minutesElapsed < ticketRegenMinutes) return entry; // not enough time for even 1

    const ticketsToAdd = Math.floor(minutesElapsed / ticketRegenMinutes);
    const newTickets = Math.min(ticketCap, entry.tickets + ticketsToAdd);
    const actualAdded = newTickets - entry.tickets;

    entry.tickets = newTickets;
    if (entry.tickets >= ticketCap) {
        entry.lastTicketUse = null; // capped → clear timer
    }
    else {
        // Advance lastTicketUse by exactly the time we "consumed" — preserves partial progress
        entry.lastTicketUse = lastUse.plus({ minutes: actualAdded * ticketRegenMinutes }).toISO();
    }

    return entry;
}

/**
 * Seconds until the next ticket regenerates (for display).
 * Returns null if at cap or no anchor is set.
 */
function secondsUntilNextTicket(entry, ticketCap, ticketRegenMinutes) {
    if (!entry || entry.tickets >= ticketCap) return null;
    if (!entry.lastTicketUse) return null;

    const lastUse = DateTime.fromISO(entry.lastTicketUse);
    if (!lastUse.isValid) return null;

    const nextRegenAt = lastUse.plus({ minutes: ticketRegenMinutes });
    const seconds = nextRegenAt.diff(DateTime.now(), "seconds").seconds;
    return Math.max(0, Math.floor(seconds));
}

/**
 * Spend one ticket — assumes caller has already called applyRegen.
 * Returns the updated entry, or throws if no tickets available.
 */
function spendTicket(entry) {
    if (!entry || entry.tickets <= 0) throw new Error("No tickets available.");
    entry.tickets -= 1;
    // If lastTicketUse wasn't set (e.g. just spent from cap), anchor regen to now
    if (!entry.lastTicketUse) entry.lastTicketUse = DateTime.now().toISO();
    return entry;
}

/**
 * Format seconds into a compact "Xm Ys" / "Xh Ym" string for display.
 */
function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return "";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

/**
 * Given an event, build a sorted leaderboard array.
 * Sort: score DESC, matchesPlayed ASC (tiebreaker), userID ASC (final tiebreaker).
 * Each entry includes a `rank` 1-based.
 */
function buildLeaderboard(entries) {
    const list = [];
    for (const [userID, entry] of Object.entries(entries || {})) {
        list.push({
            userID,
            tickets: entry.tickets || 0,
            score: entry.score || 0,
            matchesPlayed: entry.matchesPlayed || 0,
            wins: entry.wins || 0,
            losses: entry.losses || 0,
            draws: entry.draws || 0
        });
    }
    list.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
        return a.userID.localeCompare(b.userID);
    });
    list.forEach((p, i) => { p.rank = i + 1; });
    return list;
}

/**
 * Parse a duration string like "1h", "30m", "7d", "2w".
 * Returns { raw, amount, unit, luxonKey, label } or null if invalid.
 *
 * Used by:
 *   - cd-editpvp duration  (storage form: "<n><unit>")
 *   - cd-startpvp           (ISO conversion when launching)
 *
 * Supports minutes (m), hours (h), days (d), weeks (w).
 */
function parseDuration(str) {
    if (!str || typeof str !== "string") return null;
    const m = str.trim().match(/^(\d+)\s*([mhdw])$/i);
    if (!m) return null;
    const amount = parseInt(m[1], 10);
    if (amount < 1) return null;
    const unit = m[2].toLowerCase();
    const map = {
        m: { luxonKey: "minutes", label: "minute" },
        h: { luxonKey: "hours",   label: "hour"   },
        d: { luxonKey: "days",    label: "day"    },
        w: { luxonKey: "weeks",   label: "week"   }
    };
    return { raw: `${amount}${unit}`, amount, unit, luxonKey: map[unit].luxonKey, label: map[unit].label };
}

/** Sanity-bound the parsed duration. Returns an error string or null if OK. */
function validateDurationBounds(parsed) {
    if (!parsed) return null;
    const maxByUnit = { m: 10080 /* 7 days */, h: 720 /* 30 days */, d: 365, w: 52 };
    if (parsed.amount > maxByUnit[parsed.unit]) {
        return `${parsed.label} duration capped at ${maxByUnit[parsed.unit]}.`;
    }
    return null;
}

module.exports = {
    newEntry,
    applyRegen,
    secondsUntilNextTicket,
    spendTicket,
    formatDuration,
    buildLeaderboard,
    parseDuration,
    validateDurationBounds
};
