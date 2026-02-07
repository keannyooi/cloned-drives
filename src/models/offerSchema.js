"use strict";

const { Schema, model } = require("mongoose");

const offerSchema = new Schema({
    offerID: String,
    name: String,
    stock: Number,
    price: { type: Number, default: 100000 },
    isActive: { type: Boolean, default: false },
    deadline: { type: String, default: "unlimited" },
    offer: { type: Object, default: {} },
    purchasedPlayers: { type: Object, default: {} }
}, { minimize: false });

offerSchema.index({ isActive: 1 });
offerSchema.index({ offerID: 1 });

const offerModel = model("Offers", offerSchema);
module.exports = offerModel;