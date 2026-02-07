"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { ErrorMessage, SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getPack, getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const packBattleModel = require("../models/packBattleSchema.js");

module.exports = {
    name: "editpackbattle",
    aliases: ["epb"],
    usage: [
        "<battle name> name <new name>",
        "<battle name> duration <days>",
        "<battle name> extend <hours>",
        "<battle name> addmilestone <stat> <threshold> <resetType> <rewardType> <amount>",
        "<battle name> removemilestone <milestoneID>",
        "<battle name> secretmilestone <milestoneID> <hint text>",
        "<battle name> addplacement <leaderboard> <minRank> <maxRank> <rewardType> <amount>",
        "<battle name> removeplacement <index>",
        "<battle name> viewconfig"
    ],
    args: 2,
    category: "Events",
    description: "Edits a pack battle's settings.",
    async execute(message, args) {
        const battles = await packBattleModel.find();
        let query = [args[0].toLowerCase()];
        await new Promise(resolve => resolve(search(message, query, battles, "packbattle")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await editBattle(...response);
            })
            .catch(error => {
                throw error;
            });

        async function editBattle(battle, currentMessage) {
            let successMessage;
            const criteria = args[1].toLowerCase();

            // Helper to display reward objects (supports money, trophies, fuseTokens, car, pack)
            function formatRewardDisplay(reward) {
                if (reward.car) {
                    const carData = getCar(reward.car.carID);
                    if (carData) return carNameGen({ currentCar: carData, rarity: true, upgrade: reward.car.upgrade });
                    return `${reward.car.carID} [${reward.car.upgrade}]`;
                }
                if (reward.pack) {
                    const packData = getPack(reward.pack);
                    if (packData) return packData["packName"];
                    return reward.pack;
                }
                return Object.entries(reward).map(([k, v]) => `${k}: ${v.toLocaleString("en")}`).join(", ");
            }

            switch (criteria) {
                case "name": {
                    if (!args[2]) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, no name provided.",
                            desc: "Please provide a new name for the pack battle.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    const oldName = battle.name;
                    battle.name = args.slice(2).join(" ");
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully renamed pack battle from ${oldName} to ${battle.name}!`,
                        author: message.author
                    });
                    break;
                }
                case "duration": {
                    if (battle.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, cannot change duration while battle is active.",
                            desc: "Use `extend` instead to extend an active battle's deadline.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    const duration = args[2];
                    if ((duration !== "unlimited" && isNaN(duration)) || parseInt(duration) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided invalid.",
                            desc: "The duration in days must be a positive number, or `unlimited`.",
                            author: message.author
                        }).displayClosest(duration);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    battle.deadline = duration === "unlimited" ? "unlimited" : `${duration}d`;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set the duration of ${battle.name} to \`${duration === "unlimited" ? "unlimited" : duration + " day(s)"}\`!`,
                        author: message.author
                    });
                    break;
                }
                case "extend": {
                    if (!battle.isActive || battle.deadline === "unlimited") {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, can only extend active timed battles.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    const time = args[2];
                    if (isNaN(time) || parseInt(time) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided invalid.",
                            desc: "The extended duration in hours must be a positive number.",
                            author: message.author
                        }).displayClosest(time);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    battle.deadline = DateTime.fromISO(battle.deadline).plus({ hours: parseInt(time) }).toISO();
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully extended ${battle.name} by \`${time} hour(s)\`!`,
                        author: message.author
                    });
                    break;
                }
                case "addmilestone": {
                    // addmilestone <stat> <threshold> <resetType> <rewardType> <amount/carID> [upgrade]
                    if (!args[6]) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, arguments incomplete.",
                            desc: "Syntax: `addmilestone <stat> <threshold> <resetType> <rewardType> <amount>`\n\nStats: `highestSinglePullCR`, `totalCRPulled`\nReset types: `cumulative`, `daily`\nReward types: `money`, `fusetokens`, `trophies`, `car`, `pack`\n\nCar syntax: `addmilestone <stat> <threshold> <resetType> car <carID> [upgrade]`\nPack syntax: `addmilestone <stat> <threshold> <resetType> pack <packID>`",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    const stat = args[2].toLowerCase();
                    const threshold = parseInt(args[3]);
                    const resetType = args[4].toLowerCase();
                    const rewardType = args[5].toLowerCase();

                    if (!["highestsinglepullcr", "totalcrpulled"].includes(stat)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid stat.",
                            desc: "Valid stats: `highestSinglePullCR`, `totalCRPulled`",
                            author: message.author
                        }).displayClosest(stat);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    if (isNaN(threshold) || threshold < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, threshold must be a positive number.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    if (!["cumulative", "daily"].includes(resetType)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid reset type.",
                            desc: "Valid reset types: `cumulative`, `daily`",
                            author: message.author
                        }).displayClosest(resetType);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    if (!["money", "fusetokens", "trophies", "car", "pack"].includes(rewardType)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid reward type.",
                            desc: "Valid reward types: `money`, `fusetokens`, `trophies`, `car`, `pack`",
                            author: message.author
                        }).displayClosest(rewardType);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    // Map stat name to camelCase
                    const statMap = { "highestsinglepullcr": "highestSinglePullCR", "totalcrpulled": "totalCRPulled" };
                    let reward = {};
                    let rewardDisplay = "";

                    if (rewardType === "car") {
                        const carID = args[6];
                        const upgrade = args[7] || "000";
                        const carData = getCar(carID);
                        if (!carData) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, car not found.",
                                desc: `Car ID \`${carID}\` does not exist.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        reward = { car: { carID: carID.slice(0, 6), upgrade } };
                        rewardDisplay = `${carNameGen({ currentCar: carData, rarity: true, upgrade })}`;
                    } else if (rewardType === "pack") {
                        const packID = args[6];
                        const packData = getPack(packID);
                        if (!packData) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, pack not found.",
                                desc: `Pack ID \`${packID}\` does not exist.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        reward = { pack: packID.slice(0, 6) };
                        rewardDisplay = `${packData["packName"]}`;
                    } else {
                        const amount = parseInt(args[6]);
                        if (isNaN(amount) || amount < 1) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, reward amount must be a positive number.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        const rewardKey = rewardType === "fusetokens" ? "fuseTokens" : rewardType;
                        reward[rewardKey] = amount;
                        const emoji = bot.emojis.cache.get(rewardKey === "money" ? moneyEmojiID : rewardKey === "fuseTokens" ? fuseEmojiID : trophyEmojiID);
                        rewardDisplay = `${emoji}${amount.toLocaleString("en")}`;
                    }

                    const milestoneID = (battle.milestones.length > 0)
                        ? Math.max(...battle.milestones.map(m => m.milestoneID)) + 1
                        : 1;

                    battle.milestones.push({
                        milestoneID,
                        stat: statMap[stat],
                        threshold,
                        reward,
                        resetType,
                        isSecret: false,
                        hint: ""
                    });

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully added milestone #${milestoneID}!`,
                        desc: `**Stat:** ${statMap[stat]}\n**Threshold:** ${threshold.toLocaleString("en")}\n**Reset:** ${resetType}\n**Reward:** ${rewardDisplay}`,
                        author: message.author
                    });
                    break;
                }
                case "removemilestone": {
                    const id = parseInt(args[2]);
                    if (isNaN(id)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, milestone ID must be a number.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    const idx = battle.milestones.findIndex(m => m.milestoneID === id);
                    if (idx === -1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, milestone not found.",
                            desc: `No milestone with ID \`${id}\`. Use \`viewconfig\` to see all milestones.`,
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    battle.milestones.splice(idx, 1);
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully removed milestone #${id}!`,
                        author: message.author
                    });
                    break;
                }
                case "secretmilestone": {
                    const id = parseInt(args[2]);
                    const hint = args.slice(3).join(" ") || "";
                    if (isNaN(id)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, milestone ID must be a number.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    const milestone = battle.milestones.find(m => m.milestoneID === id);
                    if (!milestone) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, milestone not found.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    milestone.isSecret = !milestone.isSecret;
                    milestone.hint = hint;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Milestone #${id} is now ${milestone.isSecret ? "secret" : "visible"}!`,
                        desc: milestone.isSecret && hint ? `Hint: "${hint}"` : "",
                        author: message.author
                    });
                    break;
                }
                case "addplacement": {
                    // addplacement <leaderboard> <minRank> <maxRank> <rewardType> <amount/carID> [upgrade]
                    if (!args[6]) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, arguments incomplete.",
                            desc: "Syntax: `addplacement <leaderboard> <minRank> <maxRank> <rewardType> <amount>`\n\nLeaderboards: `packsopened`, `highestcr`\nReward types: `money`, `fusetokens`, `trophies`, `car`, `pack`\n\nCar syntax: `addplacement <lb> <min> <max> car <carID> [upgrade]`\nPack syntax: `addplacement <lb> <min> <max> pack <packID>`",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    const lb = args[2].toLowerCase();
                    const minRank = parseInt(args[3]);
                    const maxRank = parseInt(args[4]);
                    const plRewardType = args[5].toLowerCase();

                    const lbMap = { "packsopened": "packsOpened", "highestcr": "highestPackPullCR" };
                    if (!lbMap[lb]) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid leaderboard.",
                            desc: "Valid leaderboards: `packsopened`, `highestcr`",
                            author: message.author
                        }).displayClosest(lb);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    if (isNaN(minRank) || isNaN(maxRank) || minRank < 1 || maxRank < minRank) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid rank range.",
                            desc: "minRank must be >= 1 and maxRank must be >= minRank.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    if (!["money", "fusetokens", "trophies", "car", "pack"].includes(plRewardType)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid reward type.",
                            desc: "Valid reward types: `money`, `fusetokens`, `trophies`, `car`, `pack`",
                            author: message.author
                        }).displayClosest(plRewardType);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let plReward = {};
                    let plRewardDisplay = "";

                    if (plRewardType === "car") {
                        const carID = args[6];
                        const upgrade = args[7] || "000";
                        const carData = getCar(carID);
                        if (!carData) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, car not found.",
                                desc: `Car ID \`${carID}\` does not exist.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        plReward = { car: { carID: carID.slice(0, 6), upgrade } };
                        plRewardDisplay = `${carNameGen({ currentCar: carData, rarity: true, upgrade })}`;
                    } else if (plRewardType === "pack") {
                        const packID = args[6];
                        const packData = getPack(packID);
                        if (!packData) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, pack not found.",
                                desc: `Pack ID \`${packID}\` does not exist.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        plReward = { pack: packID.slice(0, 6) };
                        plRewardDisplay = `${packData["packName"]}`;
                    } else {
                        const plAmount = parseInt(args[6]);
                        if (isNaN(plAmount) || plAmount < 1) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, reward amount must be a positive number.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        const plRewardKey = plRewardType === "fusetokens" ? "fuseTokens" : plRewardType;
                        plReward[plRewardKey] = plAmount;
                        const plEmoji = bot.emojis.cache.get(plRewardKey === "money" ? moneyEmojiID : plRewardKey === "fuseTokens" ? fuseEmojiID : trophyEmojiID);
                        plRewardDisplay = `${plEmoji}${plAmount.toLocaleString("en")}`;
                    }

                    battle.placementRewards.push({
                        leaderboard: lbMap[lb],
                        minRank,
                        maxRank,
                        reward: plReward
                    });

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully added placement reward!`,
                        desc: `**Leaderboard:** ${lbMap[lb]}\n**Ranks:** #${minRank}${minRank !== maxRank ? `-${maxRank}` : ""}\n**Reward:** ${plRewardDisplay}`,
                        author: message.author
                    });
                    break;
                }
                case "removeplacement": {
                    const idx = parseInt(args[2]) - 1;
                    if (isNaN(idx) || idx < 0 || idx >= battle.placementRewards.length) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid placement index.",
                            desc: `Valid indexes: 1 to ${battle.placementRewards.length}. Use \`viewconfig\` to see all.`,
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    battle.placementRewards.splice(idx, 1);
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully removed placement reward #${idx + 1}!`,
                        author: message.author
                    });
                    break;
                }
                case "viewconfig": {
                    const pack = getPack(battle.packID);
                    const packName = pack ? pack["packName"] : battle.packID;

                    let milestoneList = "None";
                    if (battle.milestones.length > 0) {
                        milestoneList = battle.milestones.map(m => {
                            const secretTag = m.isSecret ? " (SECRET)" : "";
                            const rewardStr = formatRewardDisplay(m.reward);
                            return `**#${m.milestoneID}${secretTag}** — ${m.stat} >= ${m.threshold.toLocaleString("en")} (${m.resetType}) → ${rewardStr}`;
                        }).join("\n");
                    }

                    let placementList = "None";
                    if (battle.placementRewards.length > 0) {
                        placementList = battle.placementRewards.map((p, i) => {
                            const rewardStr = formatRewardDisplay(p.reward);
                            return `**#${i + 1}** — ${p.leaderboard} ranks ${p.minRank}-${p.maxRank} → ${rewardStr}`;
                        }).join("\n");
                    }

                    const participants = Object.keys(battle.playerStats || {}).length;

                    const infoMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Pack Battle Config: ${battle.name}`,
                        desc: `**Status:** ${battle.isActive ? "Active" : "Inactive"}\n**Pack:** ${packName} (\`${battle.packID}\`)\n**Deadline:** ${battle.deadline}\n**Participants:** ${participants}\n**Snapshots:** ${(battle.snapshots || []).length}`,
                        author: message.author,
                        fields: [
                            { name: "Milestones", value: milestoneList },
                            { name: "Placement Rewards", value: placementList }
                        ]
                    });
                    return infoMessage.sendMessage({ currentMessage });
                }
                default: {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, editing criteria not found.",
                        desc: `Available criteria:
                        \`name\` - Rename the battle.
                        \`duration\` - Set duration in days (before start).
                        \`extend\` - Extend deadline in hours (while active).
                        \`addmilestone\` - Add a milestone.
                        \`removemilestone\` - Remove a milestone.
                        \`secretmilestone\` - Toggle a milestone as secret.
                        \`addplacement\` - Add a placement reward.
                        \`removeplacement\` - Remove a placement reward.
                        \`viewconfig\` - View current configuration.`,
                        author: message.author
                    }).displayClosest(criteria);
                    return errorMessage.sendMessage({ currentMessage });
                }
            }

            await packBattleModel.updateOne({ battleID: battle.battleID }, battle);
            return successMessage.sendMessage({ currentMessage });
        }
    }
};
