"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime } = require("../util/consts/consts.js");
const { getPack } = require("../util/functions/dataManager.js");
const { endPackBattle, computeDenseRanking } = require("../util/functions/packBattleManager.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const packBattleModel = require("../models/packBattleSchema.js");

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
            const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
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

                // Claim, pay placements (final snapshot taken inside), archive
                // and delete: one shared path with the timed auto-end. Null
                // means the timer (or another confirm) already ended it and
                // paid, so nothing more is paid, archived or announced here.
                const ended = await endPackBattle(battle, message.author.id);
                if (!ended) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: `Error, the ${battle.name} pack battle has already ended.`,
                        desc: "Its placement rewards are paid by whichever end got there first (the timer or another confirm). Nothing more was paid.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                const { battle: freshBattle, failedRewards } = ended;

                // Use freshBattle stats for results (the battle as it was claimed)
                const freshEntries = Object.entries((freshBattle || battle).playerStats || {});
                let resultsDesc = `**${battle.name}** has ended! ${freshEntries.length} player(s) participated.\n\n`;

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

                let successDesc = "Placement rewards have been distributed to qualifying players' unclaimed rewards.";
                if (failedRewards && failedRewards.length > 0) {
                    successDesc += `\n\n⚠️ **${failedRewards.length} reward(s) failed to distribute:**\n`;
                    // Capped so a mass failure (database outage) can't overflow
                    // the embed; the archive's failedRewards has the full list.
                    for (const fail of failedRewards.slice(0, 15)) {
                        const member = bot.homeGuild.members.cache.get(fail.userID);
                        const name = member ? member.user.tag : fail.userID;
                        successDesc += `- \`${name}\` (Rank #${fail.rank}, ${fail.leaderboard}): ${String(fail.reason).slice(0, 120)}\n`;
                    }
                    if (failedRewards.length > 15) {
                        successDesc += `…and ${failedRewards.length - 15} more (full list in the battle's packbattleresults archive).\n`;
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
