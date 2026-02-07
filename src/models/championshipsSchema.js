"use strict";

const { Schema, model } = require("mongoose");

const championshipsSchema = new Schema({
    championshipID: String,
    name: String,
    isActive: { type: Boolean, default: false },
    isVIP: { type: Boolean, default: false },
    deadline: { type: String, default: "unlimited" },
    roster: Array,
    playerProgress: { type: Object, default: {} }
}, { minimize: false });

championshipsSchema.index({ isActive: 1 });
championshipsSchema.index({ championshipID: 1 });

const championshipsModel = model("Championships", championshipsSchema);
module.exports = championshipsModel;