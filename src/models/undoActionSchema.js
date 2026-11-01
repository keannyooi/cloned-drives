"use strict";

const { Schema, model } = require("mongoose");

// One row per action cd-undo can reverse. Written by util/functions/undoActions.js.
// Kept apart from the profile: a bulk sale can list 7,000+ cars, and profiles
// are read on every command.
const undoActionSchema = new Schema({
    // Who ran it (the only one who can undo it) and whose garage it changed.
    // They differ only for cd-changetune, an admin acting on another player.
    actorID: { type: String, required: true },
    targetID: { type: String, required: true },
    targetName: { type: String, default: "" },
    kind: { type: String, required: true, enum: ["sell", "upgrade", "changetune"] },
    // Short text for cd-undo and cd-undo list.
    summary: { type: String, default: "" },

    // sell: [{ carID, tune, n }], largest first, so the preview can read just
    // the first few. carCount and modelCount save reading the rest.
    cars: { type: Array, default: [] },
    carCount: { type: Number, default: 0 },
    modelCount: { type: Number, default: 0 },
    // sell: what the sale emptied. hand { carID, upgrade }, decks [{ deck, index, carID, upgrade }]
    hand: { type: Object, default: null },
    decks: { type: Array, default: [] },

    // upgrade + changetune
    carID: { type: String, default: "" },
    from: { type: String, default: "" },
    to: { type: String, default: "" },

    // The amount that moved: the sale total, or the upgrade cost.
    money: { type: Number, default: 0 },

    createdAt: { type: Date, default: Date.now },
    // Pushed out 7 days while an undo runs and put back when it ends, so one that
    // dies half way keeps its record. To reopen such a row by hand, set expiresAt
    // back as well as clearing undoneAt, or it stays undoable for those 7 days.
    expiresAt: { type: Date, required: true },
    undoneAt: { type: Date, default: null },
    // upgrade only: set by race() once the player has raced this car since the upgrade.
    racedAt: { type: Date, default: null }
});

undoActionSchema.index({ actorID: 1, undoneAt: 1, createdAt: -1 });
// TTL deletion runs about once a minute at best, so code checks the time too.
undoActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const undoActionModel = model("UndoActions", undoActionSchema);
module.exports = undoActionModel;
