"use strict";

/**
 * PVP EVENT RESULT SCHEMA
 * ========================
 * Archive of a completed PvP event — created by endPvpEvent() at expiry/manual end.
 * Mirrors eventResultSchema's pattern.
 */

const { Schema, model } = require("mongoose");

const pvpEventResultSchema = new Schema({
    pvpEventID: String,
    eventName: String,
    endedAt: { type: Date, default: Date.now },
    endedBy: { type: String, default: "system" },
    wasActive: { type: Boolean, default: false },

    // Stats
    totalParticipants: { type: Number, default: 0 },
    totalMatchesPlayed: { type: Number, default: 0 },

    // Final leaderboard at time of ending — sorted, ranks assigned.
    // Shape: [
    //   { userID, score, matchesPlayed, wins, losses, draws, finalRank, rewardTier }
    // ]
    finalLeaderboard: { type: Array, default: [] },

    // Reward distribution log
    // Shape: [{ userID, tier, rewards: {...}, success: bool, error?: string }]
    rewardDistribution: { type: Array, default: [] },

    // Full event config snapshot (so we can audit what the rules were)
    eventConfig: {
        type: Object,
        default: {}
        // { reqs, tracksets, ghostDecks, rewards, ticketCap, ticketRegenMinutes, matchCooldownSeconds, deadline }
    },

    // Snapshot of every entry at end-of-event (for forensic / replay)
    finalEntries: { type: Object, default: {} }
}, { minimize: false });

pvpEventResultSchema.index({ pvpEventID: 1 });
pvpEventResultSchema.index({ endedAt: -1 });

const pvpEventResultModel = model("PvpEventResult", pvpEventResultSchema);
module.exports = pvpEventResultModel;
