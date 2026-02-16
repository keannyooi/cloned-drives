"use strict";

const { Schema, model } = require("mongoose");

const pvpSeasonResultSchema = new Schema({
    seasonID: Number,
    seasonName: String,
    endedAt: { type: Date, default: Date.now },
    endedBy: { type: String, default: "system" },
    wasDryRun: { type: Boolean, default: false },

    // High-level summary
    totalPlayersProcessed: { type: Number, default: 0 },
    totalRewardsDistributed: { type: Number, default: 0 },
    totalPrizeCarsAwarded: { type: Number, default: 0 },
    totalRatingsReset: { type: Number, default: 0 },
    totalDefensesCleared: { type: Number, default: 0 },

    // Per-league detailed results
    // Each: { playersProcessed, rewardsDistributed, prizeCarsAwarded, ratingsReset, defensesCleared, topPlayers: [{ userID, rank, rating }] }
    leagueResults: { type: Object, default: {} },

    // Every reward that was actually pushed to players
    distributedRewards: {
        type: Array,
        default: []
        // Each: { userID, league, type ("money"|"trophies"|"prizeCar"), amount, origin }
    },

    // Rewards that failed to distribute
    failedRewards: {
        type: Array,
        default: []
        // Each: { userID, league, type, amount, origin, reason }
    },

    // Season config snapshot for reference
    seasonConfig: {
        type: Object,
        default: {}
        // Stores: prizeCars, prizeCarSlots, ratingRewards, trackPool name, filter, etc.
    }
}, { minimize: false });

pvpSeasonResultSchema.index({ seasonID: 1 });
pvpSeasonResultSchema.index({ endedAt: -1 });

const pvpSeasonResultModel = model("PvPSeasonResult", pvpSeasonResultSchema);
module.exports = pvpSeasonResultModel;
