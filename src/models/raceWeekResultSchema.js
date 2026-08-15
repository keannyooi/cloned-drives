"use strict";

const { Schema, model } = require("mongoose");

const raceWeekResultSchema = new Schema({
    // Luxon UTC ISO week key, e.g. "2026-W29"
    weekKey: { type: String, unique: true },
    archivedAt: String, // ISO timestamp string

    // The week's prize map snapshot (rung string -> prize object)
    // e.g. { "10": { pack: "pXXXXX" }, "25": { money: 800000 }, "50": { car: { carID } }, ... }
    prizes: { type: Object, default: {} },

    // Final leaderboard snapshot (hall of fame)
    standings: {
        type: Array,
        default: []
        // Each: { userID, username, weeklyWins, weeklyLosses, weeklyMargin, rank }
    },

    // High-level summary
    totals: {
        type: Object,
        default: {}
        // Stores: { participants, totalWins }
    }
}, { minimize: false });

raceWeekResultSchema.index({ archivedAt: -1 });

const raceWeekResultModel = model("RaceWeekResult", raceWeekResultSchema);
module.exports = raceWeekResultModel;
