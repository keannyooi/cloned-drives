"use strict";

const { Schema, model } = require("mongoose");

const eventSchema = new Schema({
    eventID: String,
    name: String,
    isActive: { type: Boolean, default: false },
    isVIP: { type: Boolean, default: false },
    deadline: { type: String, default: "unlimited" },
    roster: Array,
    playerProgress: { type: Object, default: {} },
    // "standard" = admin-made; auto-generated events carry their generator name
    // (e.g. "provinggrounds"). Also the future home for a "calendar" type.
    eventType: { type: String, default: "standard" },
    // One-time fee charged on a player's first race of this event (0 = free).
    entryFee: { type: Number, default: 0 },
    paidPlayers: { type: Object, default: {} }
}, { minimize: false });

eventSchema.index({ isActive: 1 });
eventSchema.index({ eventID: 1 });
// Defense-in-depth backstop for the eventID race (the real fix is atomic number
// reservation in createevent.js / autoEvents.js). Left commented because enabling
// unique on a collection that ALREADY contains duplicate eventIDs will make the
// index build fail on startup. Before uncommenting, verify there are no existing
// dupes, e.g. in mongosh:
//   db.events.aggregate([{$group:{_id:"$eventID",n:{$sum:1}}},{$match:{n:{$gt:1}}}])
// eventSchema.index({ eventID: 1 }, { unique: true });

const eventModel = model("Events", eventSchema);
module.exports = eventModel;