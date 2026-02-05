"use strict";

const { Schema, model } = require("mongoose");

const codeSchema = new Schema({
    code: { type: String, required: true, unique: true },
    rewards: {
        type: Object,
        default: {}
        // Supported keys:
        // money: Number
        // trophies: Number
        // fuseTokens: Number
        // cars: [{ carID: String, upgrade: String }]
        // packs: [String]  (pack IDs, e.g. "p00001")
    },
    maxRedemptions: { type: Number, default: 0 }, // 0 = unlimited
    redeemedBy: { type: Array, default: [] },     // Array of user IDs
    isActive: { type: Boolean, default: false },
    deadline: { type: String, default: "unlimited" },
    createdBy: { type: String, default: "" }
}, { minimize: false });

const codeModel = model("Codes", codeSchema);
module.exports = codeModel;
