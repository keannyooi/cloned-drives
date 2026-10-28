"use strict";

const { InfoMessage } = require("../util/classes/classes.js");
const searchUser = require("../util/functions/searchUser.js");
const auditLogModel = require("../models/auditLogSchema.js");

const SHOWN = 10;

module.exports = {
    name: "auditlog",
    usage: ["[username / @mention / user ID]"],
    args: 0,
    category: "Admin",
    description: "Shows the latest staff actions on players (add/remove currency, addcar, givereward, reset), optionally for one player.",
    async execute(message, args) {
        if (!args[0]) return showLog(null);

        // A raw ID also works for players who have left the server. The
        // mention only counts when it is the argument itself, so a reply-ping
        // to another player's message doesn't override the typed name.
        const mentionID = args[0].match(/^<@!?(\d+)>$/)?.[1];
        if (mentionID) {
            const mention = message.mentions.users.get(mentionID);
            return showLog(mentionID, mention?.tag ?? mentionID);
        }
        if (/^\d{17,20}$/.test(args[0])) return showLog(args[0], args[0]);

        const response = await searchUser(message, args[0].toLowerCase(), undefined, { strict: true });
        if (!Array.isArray(response)) return;
        const [result, currentMessage] = response;
        return showLog(result.user.id, result.user.tag, currentMessage);

        async function showLog(targetID, targetLabel, currentMessage) {
            const entries = await auditLogModel
                .find(targetID ? { targetID } : {}, { "details.snapshot": 0 })
                .sort({ at: -1 })
                .limit(SHOWN)
                .lean();

            const lines = entries.map(entry => {
                const when = `<t:${Math.floor(new Date(entry.at).getTime() / 1000)}:R>`;
                const who = targetID ? "" : ` → **${entry.targetTag}**`;
                const dev = entry.dev ? " `dev`" : "";
                return `${when} \`cd-${entry.command}\` by ${entry.adminTag}${who}${dev}\n> ${summarise(entry.details)}`;
            });

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: targetID ? `Latest staff actions on ${targetLabel}` : "Latest staff actions",
                desc: lines.length ? lines.join("\n") : "No staff actions recorded yet.",
                author: message.author,
                footer: `Showing up to ${SHOWN}, newest first. Full details are in the auditlogs collection.`
            });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};

// One short line per entry; reset snapshots are left out of the query.
function summarise(details = {}) {
    const { garageRows, ...rest } = details;
    let text = JSON.stringify(rest);
    if (garageRows !== undefined) text += ` (snapshot saved: ${garageRows} garage rows)`;
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}
