"use strict";

const { Schema, model } = require("mongoose");

const trackingSchema = new Schema({
    date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"

    // Command usage counts: { "daily": 142, "openpack": 87, ... }
    commands: { type: Object, default: {} },

    // Unique users who ran at least one command today
    activeUsers: { type: [String], default: [] },

    // New players created today
    newPlayers: { type: Number, default: 0 },

    // Economy flow
    economy: {
        type: Object,
        default: {
            moneyEarned: 0,    // total money gained by players (daily, sell, rewards, etc.)
            moneySpent: 0,     // total money spent by players (packs, buycar, offers, pvp entry)
            trophiesEarned: 0,
            trophiesSpent: 0,
            fuseTokensEarned: 0,
            fuseTokensSpent: 0
        }
    },

    // Pack opens: { "packName": count, ... }
    packsOpened: { type: Object, default: {} },

    // Cars sold count
    carsSold: { type: Number, default: 0 },

    // Cars bought from dealership/BM
    carsBought: { type: Object, default: { dealership: 0, blackmarket: 0 } },

    // Event/championship participation: total rounds won
    eventsPlayed: { type: Number, default: 0 },
    championshipsPlayed: { type: Number, default: 0 },

    // PvP attacks
    pvp: {
        type: Object,
        default: {
            attacks: 0,
            wins: 0,
            losses: 0,
            draws: 0
        }
    },

    // Code redemptions
    codesRedeemed: { type: Number, default: 0 },

    // Offer purchases
    offersBought: { type: Number, default: 0 },

    // Hi-Lo games played
    hiloGames: { type: Number, default: 0 },

    // Exchanges completed
    exchanges: { type: Number, default: 0 },

    // Errors caught during command execution
    commandErrors: { type: Number, default: 0 },

    // Peak hour activity: { "14": 32, "15": 45, ... } (hour -> command count)
    hourlyActivity: { type: Object, default: {} }
}, { minimize: false });

const trackingModel = model("Tracking", trackingSchema);
module.exports = trackingModel;
