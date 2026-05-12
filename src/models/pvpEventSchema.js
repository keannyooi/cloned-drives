"use strict";

/**
 * PVP EVENT SCHEMA
 * ================
 * Time-limited PvP competitions inspired by Top Drives events.
 *
 * Lifecycle (mirrors regular events):
 *   create → edit → start (sets ISO deadline, isActive=true) →
 *   players play with tickets → expire (auto-end) or manual end
 *
 * See docs/pvp-events-guide.md (TODO) for the player-facing flow.
 */

const { Schema, model } = require("mongoose");

const pvpEventSchema = new Schema({
    pvpEventID: String,                                  // "pvpe1", "pvpe2", ...
    name: String,
    isActive: { type: Boolean, default: false },

    // "Xd" before start (e.g. "7d"), ISO datetime once started, or "unlimited"
    deadline: { type: String, default: "unlimited" },

    // Car requirements — same shape as event reqs (cr range, make, country, tags, etc.)
    reqs: { type: Object, default: {} },

    // Multiple pre-defined tracksets (5 tracks each, in fixed order).
    // Each match randomly picks one of these.
    // Shape: [["t00007","t00163","t00063","t00100","t00124"], [...], ...]
    tracksets: { type: Array, default: [] },

    // Admin-defined "ghost" decks per trackset, used as fallback opponents
    // when there aren't enough real player snapshots for that trackset.
    // Shape: { "0": [{name, deck:[5 carIDs], upgrades:[5 tunes]}, ...], "1": [...], ... }
    ghostDecks: { type: Object, default: {} },

    // Tickets configuration (per-event overrides)
    ticketCap: { type: Number, default: 5 },
    ticketRegenMinutes: { type: Number, default: 30 },
    matchCooldownSeconds: { type: Number, default: 30 },

    // Optional deck-level CR cap. If > 0, the SUM of all 5 cars' CRs in a player's
    // deck (and every ghost deck) must not exceed this value. 0 = no cap.
    // This is an additional constraint on top of per-car `reqs.cr` range.
    deckCrCap: { type: Number, default: 0 },

    // Reward tier list — fully admin-configurable mix of absolute ranks and percentages.
    // Each player gets ONLY the highest tier they qualify for (no stacking).
    // Shape: [
    //   { rank: 1, money: 1000000, trophies: 100 },
    //   { rank: 2, ... },
    //   { topPercent: 10, money: 100000 },
    //   { topPercent: 50, fuseTokens: 50 },
    //   { topPercent: 100, money: 10000 }
    // ]
    rewards: { type: Array, default: [] },

    // Per-player participation tracking.
    // Shape: {
    //   [userID]: {
    //     tickets: 5,
    //     lastTicketUse: ISOString,         // for regen calculation
    //     lastMatchEnd: ISOString,           // for cooldown
    //     score: 42,                          // leaderboard total
    //     matchesPlayed: 7,
    //     wins: 4, losses: 2, draws: 1,
    //     // Per-trackset snapshot — only updates when player faces THIS trackset
    //     snapshots: {
    //       "0": { deck: [5 carIDs], upgrades: [5 tunes], updatedAt: ISO },
    //       "2": { deck: [...], upgrades: [...], updatedAt: ISO }
    //       // (missing "1" key means player hasn't been served trackset 1 yet)
    //     }
    //   }
    // }
    entries: { type: Object, default: {} }
}, { minimize: false });

pvpEventSchema.index({ isActive: 1 });
pvpEventSchema.index({ pvpEventID: 1 });

const pvpEventModel = model("PvpEvents", pvpEventSchema);
module.exports = pvpEventModel;
