"use strict";

const { InfoMessage } = require("../util/classes/classes.js");
const { cacheStats, invalidate } = require("../util/functions/profileCache.js");

module.exports = {
    name: "cachestats",
    aliases: ["cache"],
    usage: ["", "clear"],
    args: 0,
    category: "Admin",
    description: "Shows the profile cache's hit rate since the last restart (see util/functions/profileCache.js). `clear` empties it.",
    async execute(message, args) {
        if (args[0] && args[0].toLowerCase() === "clear") {
            invalidate();
        }
        const stats = cacheStats();
        const reads = stats.hits + stats.misses;
        const hitRate = reads === 0 ? "—" : `${Math.round((stats.hits / reads) * 100)}%`;
        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: args[0] && args[0].toLowerCase() === "clear" ? "Profile cache cleared." : "Profile Cache",
            desc: "Heavy profile arrays (garage, discovered cars, decks) served from memory when the profile's write stamp still matches.",
            author: message.author,
            fields: [
                { name: "Hit rate", value: hitRate, inline: true },
                { name: "Hits / Misses", value: `${stats.hits} / ${stats.misses}`, inline: true },
                { name: "Cached players", value: `${stats.entries}`, inline: true },
                { name: "Write-throughs", value: `${stats.writeThroughs}`, inline: true },
                { name: "Invalidations", value: `${stats.invalidations}`, inline: true }
            ]
        });
        return infoMessage.sendMessage();
    }
};
