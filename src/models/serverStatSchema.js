"use strict";

const { Schema, model } = require("mongoose");

const serverStatSchema = new Schema({
    totalEvents: Number,
	totalChampionships: Number,
    totalOffers: Number,
    totalCalendars: { type: Number, default: 0 },
    totalPackBattles: { type: Number, default: 0 },
    totalPvpEvents: { type: Number, default: 0 },
    // Submission ID counters, keyed "<scope>_<type>" — live_bm, live_art,
    // dev_bm, dev_art. Incremented atomically so concurrent submissions can
    // never collide, and separated per type so IDs read SBM1 / SAW1 rather
    // than sharing one gappy sequence. devMode has its own scope because it
    // shares this database and must never consume a real submission number.
    submissionCounters: { type: Object, default: {} },
    dealershipCatalog: Array,
    bmCatalog: Array,
    lastBMRefresh: String,
    // Per-template spawn state for auto-generated events:
    // templateID → { lastSpawn, counter, lastCarPick, lastPackPick, currentEventID }
    autoEventState: { type: Object, default: {} },
    // Race Week global state: weekKey = luxon UTC ISO week ("kkkk-'W'WW"),
    // prizes maps threshold rung ("10".."1000") → prize spec ({pack}|{money}|{car:{carID}}|{driver});
    // the 1000 rung may carry BOTH car and driver keys (exclusive car + secret driver).
    raceWeekState: { type: Object, default: { weekKey: "", lastRollover: "", prizes: {} } },
    // Global mint ledger for serialised drivers (rarity system v3):
    // driverID → number of serials claimed so far (1-based serials are the
    // post-$inc counter values; claimed atomically in raceWeekManager).
    driverSerials: { type: Object, default: {} }
}, { minimize: false });

const serverStatModel = model("System", serverStatSchema, "system");
module.exports = serverStatModel;
