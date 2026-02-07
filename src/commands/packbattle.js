"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit, moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCar, getPack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const { computeDenseRanking } = require("../util/functions/packBattleManager.js");
const listUpdate = require("../util/functions/listUpdate.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const packBattleModel = require("../models/packBattleSchema.js");

module.exports = {
    name: "packbattle",
    aliases: ["pb", "packbattles"],
    usage: ["", "<battle name>", "<battle name> leaderboard <packsopened/highestcr>", "<battle name> milestones"],
    args: 0,
    category: "Gameplay",
    description: "View active pack battles, your stats, leaderboards, and milestone progress.",
    async execute(message, args) {
        const { settings } = await profileModel.findOne({ userID: message.author.id });

        // No args: list all active battles
        if (!args.length) {
            const battles = await packBattleModel.find({ isActive: true });

            if (battles.length === 0) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: "Pack Battles",
                    desc: "There are no active pack battles right now.",
                    author: message.author,
                    footer: "Check back later!"
                });
                return infoMessage.sendMessage();
            }

            let battleList = "";
            for (const battle of battles) {
                const pack = getPack(battle.packID);
                const packName = pack ? pack["packName"] : battle.packID;
                const participants = Object.keys(battle.playerStats || {}).length;

                let timeInfo = "`unlimited`";
                if (battle.deadline !== "unlimited") {
                    const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(battle.deadline));
                    if (interval.invalid === null) {
                        timeInfo = timeDisplay(interval);
                    } else {
                        timeInfo = "`ending soon`";
                    }
                }

                const myStats = battle.playerStats[message.author.id];
                const myPacks = myStats ? myStats.packsOpened : 0;

                battleList += `**${battle.name}** — ${packName}\n${timeInfo} | ${participants} participants | You: ${myPacks} packs\n\n`;
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Active Pack Battles (${battles.length})`,
                desc: battleList.trim(),
                author: message.author,
                footer: "Use cd-packbattle <name> for details."
            });
            return infoMessage.sendMessage();
        }

        // Check for subcommand in last arg(s)
        let subcommand = null;
        let lbType = null;
        let page = 1;
        let queryArgs = [...args];

        // Check if last arg is a page number
        if (!isNaN(queryArgs[queryArgs.length - 1]) && queryArgs.length > 1) {
            page = parseInt(queryArgs.pop());
        }

        // Check for subcommands: "leaderboard <type>" or "milestones"
        if (queryArgs.length >= 2) {
            const lastArg = queryArgs[queryArgs.length - 1].toLowerCase();
            const secondLastArg = queryArgs[queryArgs.length - 2].toLowerCase();

            if (lastArg === "milestones") {
                subcommand = "milestones";
                queryArgs.pop();
            } else if (secondLastArg === "leaderboard" || secondLastArg === "lb") {
                const lbMap = { "packsopened": "packsOpened", "highestcr": "highestPackPullCR" };
                if (lbMap[lastArg]) {
                    subcommand = "leaderboard";
                    lbType = lbMap[lastArg];
                    queryArgs.pop(); // remove type
                    queryArgs.pop(); // remove "leaderboard"
                } else {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, invalid leaderboard type.",
                        desc: "Valid types: `packsopened`, `highestcr`",
                        author: message.author
                    }).displayClosest(lastArg);
                    return errorMessage.sendMessage();
                }
            } else if (lastArg === "leaderboard" || lastArg === "lb") {
                // Default to packsOpened if no type specified
                subcommand = "leaderboard";
                lbType = "packsOpened";
                queryArgs.pop();
            }
        } else if (queryArgs.length === 1) {
            const lastArg = queryArgs[0].toLowerCase();
            if (lastArg === "milestones" || lastArg === "leaderboard" || lastArg === "lb") {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, please specify a battle name.",
                    desc: "Usage: `cd-packbattle <name> milestones` or `cd-packbattle <name> leaderboard <type>`",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
        }

        // Search for the battle
        const battles = await packBattleModel.find({ isActive: true });
        let query = queryArgs.map(i => i.toLowerCase());

        await new Promise(resolve => resolve(search(message, query, battles, "packbattle")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [battle, currentMessage] = response;

                switch (subcommand) {
                    case "leaderboard":
                        await viewLeaderboard(battle, lbType, page, currentMessage);
                        break;
                    case "milestones":
                        await viewMilestones(battle, currentMessage);
                        break;
                    default:
                        await viewStats(battle, currentMessage);
                        break;
                }
            })
            .catch(error => {
                throw error;
            });

        // ======================================================================
        // PERSONAL STATS VIEW
        // ======================================================================
        async function viewStats(battle, currentMessage) {
            const pack = getPack(battle.packID);
            const packName = pack ? pack["packName"] : battle.packID;
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);

            const stats = battle.playerStats[message.author.id];
            const participants = Object.keys(battle.playerStats || {}).length;

            let timeInfo = "`unlimited`";
            if (battle.deadline !== "unlimited") {
                const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(battle.deadline));
                if (interval.invalid === null) {
                    timeInfo = timeDisplay(interval);
                } else {
                    timeInfo = "`ending soon`";
                }
            }

            if (!stats) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `${battle.name} — Your Stats`,
                    desc: `**Pack:** ${packName}\n**Time Remaining:** ${timeInfo}\n**Participants:** ${participants}\n\nYou haven't opened any packs in this battle yet! Open the **${packName}** pack to participate.`,
                    author: message.author,
                    footer: "cd-packbattle <name> leaderboard <type> | cd-packbattle <name> milestones"
                });
                return infoMessage.sendMessage({ currentMessage });
            }

            // Compute player's rank on both leaderboards
            const entries = Object.entries(battle.playerStats || {});
            const packsRanked = computeDenseRanking(
                entries.map(([uid, s]) => ({ userID: uid, value: s.packsOpened || 0 }))
                    .filter(e => e.value > 0)
                    .sort((a, b) => b.value - a.value)
            );
            const crRanked = computeDenseRanking(
                entries.map(([uid, s]) => ({ userID: uid, value: s.highestPackPullCR || 0 }))
                    .filter(e => e.value > 0)
                    .sort((a, b) => b.value - a.value)
            );

            const packsRank = packsRanked.find(e => e.userID === message.author.id);
            const crRank = crRanked.find(e => e.userID === message.author.id);

            const milestonesEarned = (stats.milestonesEarned || []).length;
            const totalMilestones = battle.milestones.length;

            // Build rarity breakdown string
            const rarityOrder = ["mystic", "legendary", "exotic", "epic", "rare", "uncommon", "common", "standard"];
            let rarityStr = rarityOrder
                .filter(r => (stats.rarityCounts[r] || 0) > 0)
                .map(r => `${r.charAt(0).toUpperCase() + r.slice(1)}: ${stats.rarityCounts[r]}`)
                .join(", ");
            if (!rarityStr) rarityStr = "None yet";

            const fields = [
                { name: "Packs Opened", value: `${stats.packsOpened.toLocaleString("en")} (Rank #${packsRank ? packsRank.rank : "—"})`, inline: true },
                { name: "Best Pack Pull CR", value: `${stats.highestPackPullCR.toLocaleString("en")} (Rank #${crRank ? crRank.rank : "—"})`, inline: true },
                { name: "Best Single Car CR", value: stats.highestSinglePullCR.toLocaleString("en"), inline: true },
                { name: "Total CR Pulled", value: stats.totalCRPulled.toLocaleString("en"), inline: true },
                { name: "Dry Streak", value: `${stats.dryStreak} pack(s) since legendary+`, inline: true },
                { name: "Milestones", value: `${milestonesEarned}/${totalMilestones} earned`, inline: true },
                { name: "Rarity Breakdown", value: rarityStr }
            ];

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `${battle.name} — Your Stats`,
                desc: `**Pack:** ${packName}\n**Time Remaining:** ${timeInfo}\n**Participants:** ${participants}`,
                author: message.author,
                fields,
                footer: "cd-packbattle <name> leaderboard <type> | cd-packbattle <name> milestones"
            });
            return infoMessage.sendMessage({ currentMessage });
        }

        // ======================================================================
        // LEADERBOARD VIEW (paginated)
        // ======================================================================
        async function viewLeaderboard(battle, lbType, page, currentMessage) {
            const lbLabel = lbType === "packsOpened" ? "Packs Opened" : "Highest Pack Pull CR";
            const entries = Object.entries(battle.playerStats || {});

            const sorted = entries
                .map(([uid, s]) => ({ userID: uid, value: s[lbType] || 0 }))
                .filter(e => e.value > 0)
                .sort((a, b) => b.value - a.value);

            const ranked = computeDenseRanking(sorted);

            if (ranked.length === 0) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `${battle.name} — ${lbLabel} Leaderboard`,
                    desc: "No participants yet!",
                    author: message.author
                });
                return infoMessage.sendMessage({ currentMessage });
            }

            const totalPages = Math.ceil(ranked.length / (settings.listamount || defaultPageLimit));
            if (page < 1 || page > totalPages) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `The leaderboard ends at page ${totalPages}.`,
                    author: message.author
                }).displayClosest(page);
                return errorMessage.sendMessage({ currentMessage });
            }

            try {
                await listUpdate(ranked, page, totalPages, lbDisplay, settings, currentMessage);
            } catch (error) {
                throw error;
            }

            function lbDisplay(section, page, totalPages) {
                let placementList = "";
                let valueList = "";

                for (const entry of section) {
                    const member = bot.homeGuild.members.cache.get(entry.userID);
                    const displayName = member ? member.user.tag : entry.userID;
                    placementList += `**#${entry.rank}** \`${displayName}\`\n`;
                    valueList += `${entry.value.toLocaleString("en")}\n`;
                }

                // Find requesting user's rank
                const userEntry = ranked.find(e => e.userID === message.author.id);
                const userRankStr = userEntry ? `Your rank: #${userEntry.rank}/${ranked.length}` : "You haven't participated yet.";

                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `${battle.name} — ${lbLabel} Leaderboard`,
                    desc: userRankStr,
                    author: message.author,
                    fields: [
                        { name: "Placement", value: placementList || "No data.", inline: true },
                        { name: lbLabel, value: valueList || "No data.", inline: true }
                    ],
                    footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate.`
                });
                return infoMessage;
            }
        }

        // ======================================================================
        // MILESTONES VIEW
        // ======================================================================
        async function viewMilestones(battle, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);

            const stats = battle.playerStats[message.author.id];
            const today = DateTime.now().toFormat("yyyy-MM-dd");

            if (battle.milestones.length === 0) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `${battle.name} — Milestones`,
                    desc: "This battle has no milestones configured.",
                    author: message.author
                });
                return infoMessage.sendMessage({ currentMessage });
            }

            const fields = [];
            for (const m of battle.milestones) {
                // Determine earned key
                const earnedKey = m.resetType === "daily"
                    ? `${m.milestoneID}-${today}`
                    : `${m.milestoneID}`;
                const earned = stats ? (stats.milestonesEarned || []).includes(earnedKey) : false;

                // Determine current progress
                let currentValue = 0;
                if (stats) {
                    if (m.resetType === "daily") {
                        if (m.stat === "totalCRPulled") currentValue = stats.dailyCRPulled || 0;
                        else if (m.stat === "highestSinglePullCR") currentValue = stats.dailyHighestSinglePullCR || 0;
                    } else {
                        currentValue = stats[m.stat] || 0;
                    }
                }

                const progress = Math.min(currentValue, m.threshold);
                const progressBar = `${progress.toLocaleString("en")}/${m.threshold.toLocaleString("en")}`;

                // Build reward string (supports money, trophies, fuseTokens, car, pack)
                let rewardStr;
                if (m.reward.car) {
                    const carData = getCar(m.reward.car.carID);
                    rewardStr = carData
                        ? carNameGen({ currentCar: carData, rarity: true, upgrade: m.reward.car.upgrade })
                        : `${m.reward.car.carID} [${m.reward.car.upgrade}]`;
                } else if (m.reward.pack) {
                    const packData = getPack(m.reward.pack);
                    rewardStr = packData ? packData["packName"] : m.reward.pack;
                } else {
                    rewardStr = Object.entries(m.reward).map(([k, v]) => {
                        const emoji = k === "money" ? moneyEmoji : k === "fuseTokens" ? fuseEmoji : trophyEmoji;
                        return `${emoji}${v.toLocaleString("en")}`;
                    }).join(", ");
                }

                const resetTag = m.resetType === "daily" ? " (Daily)" : "";

                if (m.isSecret && !earned) {
                    // Secret milestone — show hint only
                    fields.push({
                        name: `??? ${resetTag} 🔒`,
                        value: m.hint ? `*${m.hint}*\n${progressBar}` : `*Hidden milestone*\n${progressBar}`,
                        inline: true
                    });
                } else {
                    fields.push({
                        name: `${m.stat} >= ${m.threshold.toLocaleString("en")}${resetTag} ${earned ? "✅" : ""}`,
                        value: `${progressBar}\nReward: ${rewardStr}`,
                        inline: true
                    });
                }
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `${battle.name} — Milestones`,
                desc: `Track your progress toward milestone rewards!`,
                author: message.author,
                fields,
                footer: "Milestone rewards are added to your unclaimed rewards automatically."
            });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};
