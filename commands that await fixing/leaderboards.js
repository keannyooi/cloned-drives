"use strict";

const bot = require("../config/config.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "leaderboards",
    aliases: ["lb", "leader", "leaderboard", "lead"],
    usage: ["<criteria>", "<> [page number]"],
    args: 1,
    category: "Testing",
    description: "Shows the leaderboards.",
    async execute(message, args) {
        const { settings } = await profileModel.findOne({ userID: message.author.id });
        const lb = [];
        let emoji, page, criteria;
        if (!args[1]) {
            page = 1;
        }
        else {
            page = parseInt(args[1]);
        }

        switch (args[0].toLowerCase()) {
            case "money":
                criteria = "Money";
                emoji = bot.emojis.cache.get("726017235826770021");
                for await (let playerData of profileModel.find().lean()) {
                    console.log(playerData.userID);
                    const id = playerData.userID;
                    if (bot.homeGuild.member(id) && !bot.users.cache.find(user => user.id === id).bot) {
                        lb.push({ name: bot.homeGuild.members.cache.get(id).tag, value: playerData.money });
                    }
                }
                break;
            case "fusetokens":
                criteria = "Fuse Tokens";
                emoji = bot.emojis.cache.get("726018658635218955");
                for await (let playerData of profileModel.find().lean()) {
                    const id = playerData.userID;
                    if (bot.homeGuild.member(id) && !bot.users.cache.find(user => user.id === id).bot) {
                        lb.push({ name: bot.homeGuild.members.cache.get(id).tag, value: playerData.fuseTokens });
                    }
                }
                break;
            case "trophies":
                criteria = "Trophies";
                emoji = bot.emojis.cache.get("775636479145148418");
                for await (let playerData of profileModel.find().lean()) {
                    const id = playerData.userID;
                    if (bot.homeGuild.member(id) && !bot.users.cache.find(user => user.id === id).bot) {
                        lb.push({ name: bot.homeGuild.members.cache.get(id).tag, value: playerData.trophies });
                    }
                }
                break;
            case "rrstreak":
                criteria = "Random Race Win Streak";
                emoji = "⏫";
                for await (let playerData of profileModel.find().lean()) {
                    const id = playerData.userID;
                    if (bot.homeGuild.member(id) && !bot.users.cache.find(user => user.id === id).bot) {
                        lb.push({ name: bot.homeGuild.members.cache.get(id).tag, value: playerData.rrStats.highestStreak });
                    }
                }
                break;
            default:
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, criteria requested unavailable.",
                    desc: "Choose between `money`, `fusetokens`, `trophies`, `rrstreak` and `dailystreak`.",
                    author: message.author
                }).displayClosest();
                return errorMessage.sendMessage();
        }

        const totalPages = Math.ceil(lb.length / (settings.listamount || defaultPageLimit));
        if (page < 0 || totalPages < page) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested invalid.",
                desc: `The leaderboard ends at page ${totalPages}.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        lb.sort(function (a, b) {
            if (a.value === b.value) {
                return a.name > b.name ? 1 : -1;
            }
            else {
                return b.value - a.value;
            }
        });

        try {
            listUpdate(lb, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let lbList = "", valueList = "";
            let currentPlacement = lb.findIndex(place => place.name === message.author.tag);
            for (let i = 0; i < section.length; i++) {
                lbList += `**${i + 1}.** \`${lb[i].name}\`\n`;
                valueList += `**${i + 1}.** ${emoji}${lb[i].value}\n`;
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
                title: `Cloned Drives Leaderboards (Selected Criteria: \`${criteria})\``,
                desc: `Your current placement: ${currentPlacement}/${bot.homeGuild.memberCount}`,
                author: message.author,
                fields: [
                    { name: "Placement", value: lbList, inline: true },
                    { name: criteria, value: valueList, inline: true }
                ],
                footer: `Showing places ${page} to ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            return infoMessage;
        }
    }
}