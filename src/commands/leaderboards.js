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
        if (args.length === 0) {
            return sendError(
                message,
                "Missing arguments.",
                "Please provide a valid leaderboard criteria and optionally a page number."
            );
        }

        // Parse arguments
        const criteriaArg = isNaN(args[0]) ? args[0] : args[1];
        const pageArg = isNaN(args[0]) ? args[1] : args[0];
        const page = pageArg ? parseInt(pageArg, 10) : 1;

        // Validate page number
        if (isNaN(page) || page < 1) {
            return sendError(
                message,
                "Invalid page number.",
                "Please specify a valid page number greater than 0."
            );
        }

        // Determine leaderboard criteria
        const criteriaMap = {
            money: {
                field: "money",
                emoji: bot.emojis.cache.get("726017235826770021"),
                label: "Money",
            },
            fusetokens: {
                field: "fuseTokens",
                emoji: bot.emojis.cache.get("726018658635218955"),
                label: "Fuse Tokens",
            },
            trophies: {
                field: "trophies",
                emoji: bot.emojis.cache.get("775636479145148418"),
                label: "Trophies",
            },
            rrstreak: {
                field: "rrStats.highestStreak",
                emoji: "⏫",
                label: "Random Race Win Streak",
            },
        };

        const criteria = criteriaMap[criteriaArg?.toLowerCase()];
        if (!criteria) {
            return sendError(
                message,
                "Invalid criteria.",
                "Choose between `money`, `fusetokens`, `trophies`, `rrstreak`."
            );
        }

        const batchSize = 100; // Limit the number of records processed at once
        const lb = [];
        const totalPlayers = await profileModel.countDocuments();

        // Fetch data in batches to limit memory usage
        for (let skip = 0; skip < totalPlayers; skip += batchSize) {
            const batch = await profileModel
                .find({}, { userID: 1, [criteria.field]: 1 }) // Fetch only required fields
                .skip(skip)
                .limit(batchSize)
                .lean();

            batch.forEach((playerData) => {
                const member = bot.homeGuild.members.cache.get(playerData.userID);
                const value = getValue(playerData, criteria.field);
                if (member && !member.user.bot && value !== null) {
                    lb.push({ name: member.user.tag, value });
                }
            });
        }

        // Sort leaderboard data
        lb.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

        // Pagination
        const itemsPerPage = defaultPageLimit || 10;
        const totalPages = Math.ceil(lb.length / itemsPerPage);
        if (page > totalPages) {
            return sendError(
                message,
                "Page out of range.",
                `The leaderboard ends at page ${totalPages}.`
            );
        }

        const startIdx = (page - 1) * itemsPerPage;
        const pageData = lb.slice(startIdx, startIdx + itemsPerPage);
        const placementList = pageData
            .map((entry, idx) => `**${startIdx + idx + 1}.** \`${entry.name}\``)
            .join("\n");
        const valueList = pageData.map((entry) => `${criteria.emoji}${entry.value}`).join("\n");
        const userPlacement = lb.findIndex((entry) => entry.name === message.author.tag) + 1;

        // Send leaderboard message
        return new InfoMessage({
            channel: message.channel,
            title: `Cloned Drives Leaderboards (${criteria.label})`,
            desc: `Your current placement: ${userPlacement || "N/A"}/${lb.length}`,
            author: message.author,
            fields: [
                { name: "Placement", value: placementList || "No data available.", inline: true },
                { name: criteria.label, value: valueList || "No data available.", inline: true },
            ],
            footer: `Page ${page}/${totalPages}. Use the buttons below to navigate.`,
        }).sendMessage();

        // Helper: Get value from nested field
        function getValue(obj, field) {
            return field.split(".").reduce((o, key) => (o ? o[key] : null), obj);
        }

        // Helper: Send error message
        function sendError(message, title, description) {
            return new ErrorMessage({
                channel: message.channel,
                title,
                desc: description,
                author: message.author,
            }).sendMessage();
        }
    },
};
