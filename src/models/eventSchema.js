"use strict";

const { Schema, model } = require("mongoose");

const eventSchema = new Schema({
    eventID: String,
    name: String,
    isActive: { type: Boolean, default: false },
    isVIP: { type: Boolean, default: false },
    deadline: { type: String, default: "unlimited" },
    roster: Array,
}, { minimize: false });

const eventModel = model("Events", eventSchema);
module.exports = eventModel;