"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime } = require("../util/consts/consts.js");
const { getPack } = require("../util/functions/dataManager.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const packBattleModel = require("../models/packBattleSchema.js");

module.exports = {
    name: "startpackbattle",
    aliases: ["launchpackbattle", "spb"],
    usage: ["<battle name>"],
    args: 1,
    category: "Events",
    description: "Starts an inactive pack battle.",
    async execute(message, args) {
        const battles = await packBattleModel.find({ isActive: false });
        let query = args.map(i => i.toLowerCase());

        await new Promise(resolve => resolve(search(message, query, battles, "packbattle")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await startBattle(...response);
            })
            .catch(error => {
                throw error;
            });

        async function startBattle(battle, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const pack = getPack(battle.packID);
            const packName = pack ? pack["packName"] : battle.packID;

            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to start the ${battle.name} pack battle?`,
                desc: `Pack: **${packName}** (\`${battle.packID}\`)\nMilestones: **${battle.milestones.length}**\nPlacement Rewards: **${battle.placementRewards.length}**\nDuration: **${battle.deadline === "unlimited" ? "Unlimited" : battle.deadline}**\n\nYou have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                battle.isActive = true;

                // Convert "Xd" duration string to ISO deadline
                if (battle.deadline !== "unlimited" && battle.deadline.length < 9) {
                    battle.deadline = DateTime.now().plus({ days: parseInt(battle.deadline) }).toISO();
                }

                await packBattleModel.updateOne({ battleID: battle.battleID }, battle);

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the ${battle.name} pack battle!`,
                    author: message.author,
                });

                await currentEventsChannel.send({
                    content: `**The ${battle.name} pack battle has officially started!** Open the **${packName}** pack to participate!`
                });

                await successMessage.sendMessage({ currentMessage });

                // Send DM notifications in background (non-blocking)
                sendNotifications(battle.name, packName).catch(err => {
                    console.error("[PackBattle DMs] Error sending notifications:", err);
                });

                async function sendNotifications(battleName, packName) {
                    const BATCH_SIZE = 50;
                    let processedCount = 0;
                    const startTime = Date.now();

                    console.log(`[PackBattle DMs] Starting background notifications for "${battleName}"...`);

                    const cursor = profileModel.find({ "settings.sendeventnotifs": true }).cursor();

                    let batch = [];
                    for await (const profile of cursor) {
                        batch.push(profile);

                        if (batch.length >= BATCH_SIZE) {
                            await processBatch(batch, battleName, packName);
                            batch = [];
                            processedCount += BATCH_SIZE;
                            console.log(`[PackBattle DMs] Processed ${processedCount} notifications...`);
                        }
                    }

                    // Process remaining users
                    if (batch.length > 0) {
                        await processBatch(batch, battleName, packName);
                        processedCount += batch.length;
                    }

                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`[PackBattle DMs] Completed ${processedCount} notifications in ${elapsed}s.`);

                    async function processBatch(userBatch, battleName, packName) {
                        await Promise.all(userBatch.map(async ({ userID }) => {
                            try {
                                const user = await bot.homeGuild.members.fetch(userID);
                                await user.send(`**Notification: The ${battleName} pack battle has officially started!** Open the **${packName}** pack to participate!`);
                            } catch (err) {
                                console.log(`Unable to send notification to user ${userID}`);
                            }
                        }));
                    }
                }
            }
        }
    }
};
