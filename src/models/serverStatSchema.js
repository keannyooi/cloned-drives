"use strict";

const { Schema, model } = require("mongoose");

const serverStatSchema = new Schema({
    totalEvents: Number,
    totalOffers: Number,
    dealershipStats: Object
}, { minimize: false });

const serverStatModel = model("System", serverStatSchema, "system");
module.exports = serverStatModel;