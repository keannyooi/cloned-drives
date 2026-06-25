"use strict";

const { Schema, model } = require("mongoose");

const serverStatSchema = new Schema({
    totalEvents: Number,
	totalChampionships: Number,
    totalOffers: Number,
    totalCalendars: { type: Number, default: 0 },
    totalPackBattles: { type: Number, default: 0 },
    totalPvpEvents: { type: Number, default: 0 },
    dealershipCatalog: Array,
    bmCatalog: Array,
    lastBMRefresh: String,
    // Per-template spawn state for auto-generated events:
    // templateID → { lastSpawn, counter, lastCarPick, lastPackPick, currentEventID }
    autoEventState: { type: Object, default: {} }
}, { minimize: false });

const serverStatModel = model("System", serverStatSchema, "system");
module.exports = serverStatModel;
