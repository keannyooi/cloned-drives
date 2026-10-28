"use strict";

const { StringSelectMenuBuilder } = require("discord.js");
const bot = require("../../config/config.js");
const processResults = require("./corefiles/processResults.js");

/**
 * Finds a home-guild member by nickname / tag substring.
 *
 * options.strict (staff commands that change someone's data): a user ID or
 * an exact username / tag / display name / nickname resolves straight away;
 * otherwise the substring matches are offered in the picker even when only
 * one matches, so a typo can't silently land on the wrong player.
 */
async function searchUser(message, username, currentMessage, { strict = false } = {}) {
    // ❌ REMOVED: guild.members.fetch()
    // ✅ Use cache only to avoid gateway member chunking
    const playerList = bot.homeGuild.members.cache;

    // Normalize username once
    const search = username.toLowerCase();

    let searchResults;
    if (strict) {
        searchResults = /^\d{17,20}$/.test(search) && playerList.has(search)
            ? [playerList.get(search)]
            : [...playerList.filter(member =>
                member.user.username.toLowerCase() === search ||
                member.user.tag.toLowerCase() === search ||
                member.user.globalName?.toLowerCase() === search ||
                member.nickname?.toLowerCase() === search
            ).values()];
    }

    if (!searchResults || searchResults.length === 0) {
        // Filter cached members safely
        searchResults = playerList.filter(member =>
            member.nickname?.toLowerCase().includes(search) ||
            member.user.tag.toLowerCase().includes(search)
        );

        // Convert Collection → Array
        searchResults = [...searchResults.values()];
    }
    else {
        strict = false; // exact hit: no confirmation needed
    }

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
        currentMessage,
        undefined,
        strict
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
