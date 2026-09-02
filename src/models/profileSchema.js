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
    // Held vouchers (docs/voucher-system.md): [{ voucherID: "v00001", amount: 2 }].
    // Granted by cd-rewards claims and cd-addvoucher; spent by cd-voucher.
    vouchers: { type: Array, default: [] },
    // Bumped on EVERY write by the query hooks below — the profile cache
    // (util/functions/profileCache.js) serves the heavy arrays from memory
    // only while this matches. Never set it by hand.
    cacheStamp: { type: Number, default: 0 },
}, { minimize: false });

// ── Profile cache hooks ──────────────────────────────────────────────────────
// Every write stamps the profile; after it lands, the cache is told what
// changed. Lazy require: profileCache.js requires this file at load.
const profileCache = () => require("../util/functions/profileCache.js");
const WRITE_OPS = ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"];

profileSchema.pre(WRITE_OPS, function () {
    const stamp = profileCache().newStamp();
    this._cacheStamp = stamp;
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return;   // pipeline update — post-hook invalidates instead
    if (Object.keys(update).some(key => key.startsWith("$"))) {
        update.$set = { ...(update.$set || {}), cacheStamp: stamp };
    }
    else {
        update.cacheStamp = stamp;
    }
    this.setUpdate(update);
});

profileSchema.post(["updateOne", "updateMany", "replaceOne"], function (res) {
    const matched = !!(res && (res.matchedCount > 0 || res.upsertedCount > 0));
    profileCache().onWrite(this.getFilter(), this.getUpdate(), this._cacheStamp, matched);
});

profileSchema.post("findOneAndUpdate", function (res) {
    profileCache().onWrite(this.getFilter(), this.getUpdate(), this._cacheStamp, res != null);
});

profileSchema.post(["deleteOne", "deleteMany"], function () {
    profileCache().onDelete(this.getFilter());
});

const profileModel = model("Profiles", profileSchema);
module.exports = profileModel;
