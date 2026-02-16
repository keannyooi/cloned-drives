"use strict";

const { Schema, model } = require("mongoose");

const eventResultSchema = new Schema({
    eventID: String,
    eventName: String,
    endedAt: { type: Date, default: Date.now },
    endedBy: { type: String, default: "system" },
    wasActive: { type: Boolean, default: false },

    // Total rounds in the event
    totalRounds: { type: Number, default: 0 },

    // Player count stats
    totalParticipants: { type: Number, default: 0 },
    totalCompletions: { type: Number, default: 0 },

    // Full player progress at time of ending
    // Each: { userID: roundReached (e.g. 6 means completed 5 rounds, on round 6) }
    playerProgress: { type: Object, default: {} },

    // Full event roster snapshot (cars, tracks, reqs, rewards per round)
    roster: { type: Array, default: [] },

    // Event config snapshot
    eventConfig: {
        type: Object,
        default: {}
        // Stores: isVIP, deadline, etc.
    }
}, { minimize: false });

eventResultSchema.index({ eventID: 1 });
eventResultSchema.index({ endedAt: -1 });

const eventResultModel = model("EventResult", eventResultSchema);
module.exports = eventResultModel;
