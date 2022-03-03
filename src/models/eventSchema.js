"use strict";

const { Schema, model } = require("mongoose");

const eventSchema = new Schema({
    eventID: String,
    name: String,
    isActive: { type: Boolean, default: false },
    isVIP: { type: Boolean, default: false },
    timeLeft: { type: String, default: "unlimited" },
    deadline: { type: String, default: "unknown" },
    background: { type: String, default: "https://cdn.discordapp.com/attachments/716917404868935691/801310401425440768/unknown.png" },
    roster: Array,
}, { minimize: false });

const eventModel = model("Events", eventSchema);
module.exports = eventModel;