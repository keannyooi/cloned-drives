"use strict";

const { Schema, model } = require("mongoose");

const packBattleSchema = new Schema({
    battleID: String,
    name: String,
    isActive: { type: Boolean, default: false },
    deadline: { type: String, default: "unlimited" },
    packID: String,

    // Custom per-card counters — evaluated against every pulled card.
    // Each: { key, type: "crPulled"|"cardsPulled", carIDs?: [String], filter?: {} }
    // filter takes cd-filter criteria (OR logic on arrays); carIDs is an exact
    // allowlist; both present = both must match. Tallies land FLAT in
    // playerStats under `key`, so milestones reference them via stat: key.
    counters: {
        type: Array,
        default: []
    },

    // Milestone definitions
    milestones: {
        type: Array,
        default: []
        // Each: { milestoneID, stat, threshold, reward, resetType, isSecret, hint }
    },

    // Placement rewards (distributed at end)
    placementRewards: {
        type: Array,
        default: []
        // Each: { leaderboard, minRank, maxRank, reward }
    },

    // Per-player stats, keyed by userID
    playerStats: { type: Object, default: {} },
    // Each userID maps to:
    // {
    //     packsOpened, highestPackPullCR, highestSinglePullCR, totalCRPulled,
    //     rarityCounts: { standard, common, uncommon, rare, epic, exotic, legendary, mystic },
    //     dryStreak, dailyCRPulled, dailyHighestSinglePullCR, lastDailyReset,
    //     milestonesEarned: []
    // }

    // Leaderboard snapshots (newest last)
    snapshots: {
        type: Array,
        default: []
        // Each: { timestamp, packsOpened: [{ userID, value, rank }], highestPackPullCR: [...] }
    }
}, { minimize: false });

packBattleSchema.index({ isActive: 1 });
packBattleSchema.index({ battleID: 1 });
packBattleSchema.index({ isActive: 1, packID: 1 });

const packBattleModel = model("PackBattle", packBattleSchema);
module.exports = packBattleModel;
