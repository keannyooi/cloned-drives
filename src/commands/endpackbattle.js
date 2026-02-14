"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime } = require("../util/consts/consts.js");
const { getPack } = require("../util/functions/dataManager.js");
const { distributePlacementRewards, computeDenseRanking } = require("../util/functions/packBattleManager.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const packBattleModel = require("../models/packBattleSchema.js");
const packBattleResultModel = require("../models/packBattleResultSchema.js");

module.exports = {
    name: "endpackbattle",
    aliases: ["epb2", "stoppackbattle"],
    usage: ["<battle name>"],
    args: 1,
    category: "Events",
    description: "Ends an active pack battle, distributes placement rewards, and removes it.",
    async execute(message, args) {
        const battles = await packBattleModel.find({ isActive: true });
        let query = args.map(i => i.toLowerCase());

        await new Promise(resolve => resolve(search(message, query, battles, "packbattle")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await endBattle(...response);
            })
            .catch(error => {
                throw error;
            });

        async function endBattle(battle, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const pack = getPack(battle.packID);
            const packName = pack ? pack["packName"] : battle.packID;
            const participants = Object.keys(battle.playerStats || {}).length;

            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to end the ${battle.name} pack battle?`,
                desc: `This will distribute placement rewards and **permanently delete** the battle.\n\n**Pack:** ${packName}\n**Participants:** ${participants}\n**Placement Rewards:** ${battle.placementRewards.length}\n\nYou have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);

                // Distribute placement rewards (takes final snapshot internally)
                const { battle: freshBattle, finalSnapshot, distributedRewards, failedRewards } = await distributePlacementRewards(battle);

                // Use freshBattle stats for results (has latest data)
                const freshEntries = Object.entries((freshBattle || battle).playerStats || {});
                let resultsDesc = `**${battle.name}** has ended! ${participants} player(s) participated.\n\n`;

                if (freshEntries.length > 0) {
                    // Packs Opened top 3
                    const packsRanked = computeDenseRanking(
                        freshEntries.map(([uid, s]) => ({ userID: uid, value: s.packsOpened || 0 }))
                            .filter(e => e.value > 0)
                            .sort((a, b) => b.value - a.value)
                    );

                    if (packsRanked.length > 0) {
                        resultsDesc += "**Packs Opened — Top 3:**\n";
                        const top3Packs = packsRanked.slice(0, 3);
                        for (const entry of top3Packs) {
                            const member = bot.homeGuild.members.cache.get(entry.userID);
                            const name = member ? member.user.tag : entry.userID;
                            resultsDesc += `#${entry.rank} — \`${name}\` (${entry.value.toLocaleString("en")})\n`;
                        }
                        resultsDesc += "\n";
                    }

                    // Highest Pack Pull CR top 3
                    const crRanked = computeDenseRanking(
                        freshEntries.map(([uid, s]) => ({ userID: uid, value: s.highestPackPullCR || 0 }))
                            .filter(e => e.value > 0)
                            .sort((a, b) => b.value - a.value)
                    );

                    if (crRanked.length > 0) {
                        resultsDesc += "**Highest Pack Pull CR — Top 3:**\n";
                        const top3CR = crRanked.slice(0, 3);
                        for (const entry of top3CR) {
                            const member = bot.homeGuild.members.cache.get(entry.userID);
                            const name = member ? member.user.tag : entry.userID;
                            resultsDesc += `#${entry.rank} — \`${name}\` (${entry.value.toLocaleString("en")})\n`;
                        }
                    }
                }

                // Save results to database before deleting the battle
                try {
                    await packBattleResultModel.create({
                        battleID: battle.battleID,
                        battleName: battle.name,
                        packID: battle.packID,
                        endedAt: new Date(),
                        endedBy: message.author.id,
                        participants,
                        playerStats: (freshBattle || battle).playerStats || {},
                        finalSnapshot: finalSnapshot || null,
                        placementRewards: battle.placementRewards || [],
                        distributedRewards: distributedRewards || [],
                        failedRewards: failedRewards || [],
                        milestones: battle.milestones || []
                    });
                } catch (err) {
                    console.error(`Failed to save pack battle results: ${err.message}`);
                }

                // Delete the battle document
                await packBattleModel.deleteOne({ battleID: battle.battleID });

                let successDesc = "Placement rewards have been distributed to qualifying players' unclaimed rewards.";
                if (failedRewards && failedRewards.length > 0) {
                    successDesc += `\n\n⚠️ **${failedRewards.length} reward(s) failed to distribute:**\n`;
                    for (const fail of failedRewards) {
                        const member = bot.homeGuild.members.cache.get(fail.userID);
                        const name = member ? member.user.tag : fail.userID;
                        successDesc += `- \`${name}\` (Rank #${fail.rank}, ${fail.leaderboard}): ${fail.reason}\n`;
                    }
                }

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully ended the ${battle.name} pack battle!`,
                    desc: successDesc,
                    author: message.author
                });

                await currentEventsChannel.send({
                    content: `**The ${battle.name} pack battle has ended!**\n\n${resultsDesc.trim()}`
                });

                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};
