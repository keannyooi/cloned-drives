"use strict";

const bot = require("../config/config.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "leaderboards",
    aliases: ["lb", "leader", "leaderboard", "lead"],
    usage: ["<criteria>", "<criteria> <page number>"],
    args: 1,
    category: "Testing",
    description: "Shows the leaderboards.",
    async execute(message, args) {
        const { settings } = await profileModel.findOne({ userID: message.author.id });
        let { leaderboards } = await serverStatModel.findOne({});
        let emoji, page, criteria;
        let compareValue = args[0].toLowerCase().replace("tokens", "Tokens").replace("streak", "Streak");
        if (!args[1]) {
            page = 1;
        }
        else {
            page = parseInt(args[1]);
        }

        switch (compareValue) {
            case "money":
                criteria = "Money";
                emoji = bot.emojis.cache.get("726017235826770021");
                break;
            case "fuseTokens":
                criteria = "Fuse Tokens";
                emoji = bot.emojis.cache.get("726018658635218955");
                break;
            case "trophies":
                criteria = "Trophies";
                emoji = bot.emojis.cache.get("775636479145148418");
                break;
            case "rrStreak":
                criteria = "Random Race Win Streak";
                emoji = "⏫";
                break;
            case "dailyStreak":
                criteria = "Daily Streak";
                emoji = "⏫";
                break;
            default:
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, criteria requested unavailable.",
                    desc: "Choose between `money`, `fusetokens`, `trophies`, `rrstreak` and `dailystreak`.",
                    author: message.author
                }).displayClosest(compareValue);
                return errorMessage.sendMessage();
        }

        const totalPages = Math.ceil(leaderboards.length / (settings.listamount || defaultPageLimit));
        if (page < 0 || totalPages < page) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested invalid.",
                desc: `The leaderboard ends at page ${totalPages}.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        leaderboards.sort(function (a, b) {
            if (a[compareValue] === b[compareValue]) {
                return a.name > b.name ? 1 : -1;
            }
            else {
                return b[compareValue] - a[compareValue];
            }
        });

        try {
            listUpdate(leaderboards, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let lbList = "", valueList = "";
            let currentPlacement = leaderboards.findIndex(place => place.user === message.author.tag) + 1;
            for (let i = 0; i < section.length; i++) {
                lbList += `**${((page - 1) * 10) + i + 1}.** \`${section[i].user}\`\n`;
                valueList += `**${((page - 1) * 10) + i + 1}.** ${emoji}${section[i][compareValue]}\n`;
            }
            if (lbList.length > 1024) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "This page has too many characters and thus cannot be shown due to Discord's embed limitations.",
                    desc: "This isn't normal, check if there's a raid going on.",
                    author: message.author,
                    fields: [{ name: `Amount of Characters in Page ${page}`, value: `\`${lbList.length}\` (> 1024)` }]
                });
                return errorMessage;
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Cloned Drives Leaderboards (Selected Criteria: \`${criteria}\`)`,
                desc: `The leaderboards refreshes every day at 11:59p.m. UTC.
                Your current placement: **${currentPlacement}/${bot.homeGuild.memberCount}**`,
                author: message.author,
                fields: [
                    { name: "Placement", value: lbList, inline: true },
                    { name: criteria, value: valueList, inline: true }
                ],
                footer: `Showing page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            return infoMessage;
        }
    }
}