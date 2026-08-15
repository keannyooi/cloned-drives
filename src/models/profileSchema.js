"use strict";

const { Schema, model } = require("mongoose");
const { starterGarage } = require("../util/consts/consts.js");

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
    // Race Week (replaces cd-rr's use of rrStats; rrStats kept for legacy data).
    // Default applies only at doc creation — old profiles rely on lazy init in code.
    raceWeekStats: {
        type: Object,
        default: {
            weeklyWins: 0,
            weeklyLosses: 0,
            weeklyMargin: 0,
            claimedThresholds: [],
            dailySkips: 0,
            lastPlayedDay: "",
            opponent: {
                carID: "",
                upgrade: "000"
            },
            trackID: "",
            reqs: {},
            activeDriver: "d00000",
            ownedDrivers: ["d00000"],
            // { "<driverID>": { dupes: N, level: N } } — level 1 (owned) needs
            // no entry; an entry appears on a driver's first duplicate.
            driverXP: {},
            // Unique carIDs raced this week (showcase event ring; reset weekly).
            usedCars: [],
            packShards: 0,
            recentLosses: [],
            activeEvent: null,
            bestWeek: 0,
            legacyHighestStreak: 0
        }
    },
    dailyStats: {
        type: Object,
        default: {
            lastDaily: "2021-09-10T00:00:00.000+08:00",
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
    unclaimedRewards: { type: Array, default: [] },
    cooldowns: { type: Object, default: {} },
    filter: { type: Object, default: {} },
    settings: { type: Object, default: {} },
    // Tracks every unique carID ever pulled from packs — used for the NEW indicator.
    // Initialized from the player's garage on first pack opening.
    discoveredCars: { type: Array, default: [] },
}, { minimize: false });

const profileModel = model("Profiles", profileSchema);
module.exports = profileModel;
