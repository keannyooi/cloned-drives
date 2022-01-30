"use strict";

const { Schema, model } = require("mongoose");
const { DateTime } = require("luxon");
const { starterGarage } = require("../commands/sharedfiles/consts.js");

const profileSchema = new Schema({
    userID: { type: String, require: true, unique: true },
    money: { type: Number, default: 0 },
    fuseTokens: { type: Number, default: 0 },
    trophies: { type: Number, default: 0 },
    garage: { type: Array, default: starterGarage },
    decks: { type: Array, default: [] },
    hand: {
        type: Object,
        default: {
            carID: "",
            upgrade: "000"
        }
    },
    rrStats: {
        type: Object,
        default: {
            streak: 0,
            highestStreak: 0,
            opponent: {
                carID: "",
                upgrade: "000"
            },
            trackID: "",
            reqs: {}
        }
    },
    dailyStats: {
        type: Object,
        default: {
            lastDaily: DateTime.fromISO("2021-09-10"),
            streak: 0,
            highestStreak: 0,
            notifReceived: true
        }
    },
    campaignProgress: {
        type: Object,
        default: {
            chapter: 0,
            stage: 1,
            race: 1
        }
    },
    unclaimedRewards: {
        type: Object,
        default: {
            money: 0,
            fuseTokens: 0,
            trophies: 0,
            cars: [],
            packs: []
        }
    },
    cooldowns: { type: Object, default: {} },
    filter: { type: Object, default: {} },
    settings: { type: Object, default: {} },
}, { minimize: false });

const profileModel = model("Profiles", profileSchema);
module.exports = profileModel;