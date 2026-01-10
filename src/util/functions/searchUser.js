"use strict";

const { StringSelectMenuBuilder } = require("discord.js");
const bot = require("../../config/config.js");
const processResults = require("./corefiles/processResults.js");

async function searchUser(message, username, currentMessage) {
    // ❌ REMOVED: guild.members.fetch()
    // ✅ Use cache only to avoid gateway member chunking
    const playerList = bot.homeGuild.members.cache;

    // Normalize username once
    const search = username.toLowerCase();

    // Filter cached members safely
    let searchResults = playerList.filter(member =>
        member.nickname?.toLowerCase().includes(search) ||
        member.user.tag.toLowerCase().includes(search)
    );

    // Convert Collection → Array
    searchResults = [...searchResults.values()];

    return processResults(
        message,
        searchResults,
        () => {
            const options = searchResults.map((member, index) => ({
                label: member.user.tag,
                value: String(index + 1)
            }));

            return new StringSelectMenuBuilder()
                .setCustomId("search")
                .setPlaceholder("Select a user...")
                .addOptions(...options);
        },
        null,
        currentMessage
    ).catch(throwError => {
        console.error(throwError);

        // Fallback list from cache (safe)
        const list = [];
        playerList.forEach(member => {
            list.push(member.user.tag);
        });

        return throwError(username, list);
    });
}

module.exports = searchUser;
