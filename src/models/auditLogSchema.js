"use strict";

const { Schema, model } = require("mongoose");

// One row per staff action that changes a player's data (cd-addmoney,
// cd-givereward, cd-reset, ...). Written by util/functions/auditLog.js —
// fire-and-forget, so a failed log never blocks the command it records.
const auditLogSchema = new Schema({
    at: { type: Date, default: Date.now },
    adminID: { type: String, default: "" },
    adminTag: { type: String, default: "" },
    command: { type: String, default: "" },
    targetID: { type: String, default: "" },
    targetTag: { type: String, default: "" },
    // Command-specific: amounts, new balances, rewards pushed, and for
    // cd-reset garage/all a snapshot of what was wiped.
    details: { type: Schema.Types.Mixed, default: {} },
    // Where it was run, to find the bot's reply in Discord.
    channelID: { type: String, default: "" },
    messageID: { type: String, default: "" },
    // The dev bot shares this database; its test runs are flagged.
    dev: { type: Boolean, default: false }
}, { minimize: false });

auditLogSchema.index({ targetID: 1, at: -1 });
auditLogSchema.index({ at: -1 });

const auditLogModel = model("AuditLogs", auditLogSchema);
module.exports = auditLogModel;
