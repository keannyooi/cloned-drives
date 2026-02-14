"use strict";

const { Schema, model } = require("mongoose");

const packBattleResultSchema = new Schema({
    battleID: String,
    battleName: String,
    packID: String,
    endedAt: { type: Date, default: Date.now },
    endedBy: String,
    participants: Number,

    // Full player stats at time of ending
    playerStats: { type: Object, default: {} },

    // Final leaderboard snapshot
    finalSnapshot: { type: Object, default: null },

    // Placement reward config that was set on the battle
    placementRewards: { type: Array, default: [] },

    // Every reward that was actually pushed to players
    distributedRewards: {
        type: Array,
        default: []
        // Each: { userID, rank, leaderboard, reward }
    },

    // Rewards that failed to distribute
    failedRewards: {
        type: Array,
        default: []
        // Each: { userID, rank, leaderboard, reward, reason }
    },

    // Milestone config that was set on the battle
    milestones: { type: Array, default: [] }
}, { minimize: false });

packBattleResultSchema.index({ battleID: 1 });
packBattleResultSchema.index({ endedAt: -1 });

const packBattleResultModel = model("PackBattleResult", packBattleResultSchema);
module.exports = packBattleResultModel;
