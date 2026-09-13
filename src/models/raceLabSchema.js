"use strict";

const { Schema, model } = require("mongoose");

/**
 * RACE LAB — player verdicts on sandbox races (cd-testrace).
 * One document per matchup (track variant + both cars + both tunes). Each
 * player's latest vote is kept under votes[userID]; counts are denormalised
 * for quick reads. This is the golden-suite feed for the race engine rework
 * (docs/race-engine-rework.md §7) — nothing in the game reads it.
 */
const raceLabSchema = new Schema({
    key: { type: String, required: true, unique: true, index: true },   // "rt00001:dry|c01694|000|c03134|000"
    isDev: { type: Boolean, default: false, index: true },

    trackID: { type: String, default: "" },
    trackName: { type: String, default: "" },
    equivalentTrackID: { type: String, default: "" },
    carA: { type: String, default: "" },
    tuneA: { type: String, default: "000" },
    carB: { type: String, default: "" },
    tuneB: { type: String, default: "000" },
    nameA: { type: String, default: "" },
    nameB: { type: String, default: "" },

    // verdicts at the time of the last vote (positive = A)
    newPoints: { type: Number, default: 0 },
    newMarginSeconds: { type: Number, default: 0 },
    oldPoints: { type: Number, default: null },

    votes: { type: Object, default: {} },      // { userID: { verdict: "right"|"wrong", at: ISO } }
    rightCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },

    createdAt: { type: String, default: "" },
    updatedAt: { type: String, default: "" }
}, { minimize: false });

module.exports = model("RaceLab", raceLabSchema);
