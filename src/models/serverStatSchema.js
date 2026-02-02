"use strict";

const { Schema, model } = require("mongoose");

const serverStatSchema = new Schema({
    totalEvents: Number,
	totalChampionships: Number,
    totalOffers: Number,
    totalCalendars: { type: Number, default: 0 },
    dealershipCatalog: Array,
    bmCatalog: Array,
    lastBMRefresh: String
}, { minimize: false });

const serverStatModel = model("System", serverStatSchema, "system");
module.exports = serverStatModel;
