"use strict";

const { InfoMessage } = require("../util/classes/classes.js");
const { cacheStats, invalidate } = require("../util/functions/profileCache.js");
const imageCache = require("../util/functions/imageCache.js");

module.exports = {
    name: "cachestats",
    aliases: ["cache"],
    usage: ["", "clear"],
    args: 0,
    category: "Admin",
    description: "Shows the profile and race-image caches' hit rates since the last restart (see util/functions/profileCache.js, imageCache.js). `clear` empties both.",
    async execute(message, args) {
        if (args[0] && args[0].toLowerCase() === "clear") {
            invalidate();
            imageCache.clear();
        }
        const stats = cacheStats();
        const reads = stats.hits + stats.misses;
        const hitRate = reads === 0 ? "—" : `${Math.round((stats.hits / reads) * 100)}%`;
        const images = imageCache.imageCacheStats();
        const imageReads = images.hits + images.misses + images.shared;
        const imageHitRate = imageReads === 0 ? "—" : `${Math.round(((images.hits + images.shared) / imageReads) * 100)}%`;
        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: args[0] && args[0].toLowerCase() === "clear" ? "Caches cleared." : "Profile Cache",
            desc: "Heavy profile arrays (garage, discovered cars, decks) served from memory when the profile's write stamp still matches.",
            author: message.author,
            fields: [
                { name: "Hit rate", value: hitRate, inline: true },
                { name: "Hits / Misses", value: `${stats.hits} / ${stats.misses}`, inline: true },
                { name: "Cached players", value: `${stats.entries}`, inline: true },
                { name: "Write-throughs", value: `${stats.writeThroughs}`, inline: true },
                { name: "Invalidations", value: `${stats.invalidations}`, inline: true },
                { name: "Race images", value: `${imageHitRate} hit rate — ${images.hits} hits / ${images.misses} downloads / ${images.shared} shared, ${images.failures} failed\n${images.entries} cached, ${images.usedMB.toFixed(1)} / ${images.budgetMB} MB, ${images.evictions} evicted` },
                { name: "Bot memory (RSS)", value: `${Math.round(process.memoryUsage().rss / 1048576)} MB`, inline: true }
            ]
        });
        return infoMessage.sendMessage();
    }
};
