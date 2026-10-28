"use strict";

const bot = require("../../config/config.js");
const auditLogModel = require("../../models/auditLogSchema.js");

/**
 * Records a staff action against a player in the auditlogs collection.
 *
 * Fire-and-forget: callers don't await it, and it never throws or rejects —
 * a failed log is printed and the command carries on. The returned promise
 * resolves true/false for the one caller that wants the row on disk before a
 * destructive write (cd-reset garage/all snapshots).
 *
 * @param message  the staff member's command message
 * @param command  command name, e.g. "addmoney"
 * @param target   the Discord User acted on
 * @param details  command-specific fields (amounts, new balance, rewards...)
 */
function auditLog(message, { command, target, details = {} }) {
    try {
        const entry = {
            adminID: message.author.id,
            adminTag: message.author.tag,
            command,
            targetID: target?.id ?? "",
            targetTag: target?.tag ?? target?.username ?? "",
            details,
            channelID: message.channel?.id ?? "",
            messageID: message.id ?? "",
            dev: !!bot.devMode
        };
        return auditLogModel.create(entry).then(
            () => true,
            (error) => {
                console.error(`[audit] failed to log ${command} by ${entry.adminID} on ${entry.targetID}:`, error);
                return false;
            }
        );
    }
    catch (error) {
        console.error(`[audit] failed to log ${command}:`, error);
        return Promise.resolve(false);
    }
}

module.exports = auditLog;
