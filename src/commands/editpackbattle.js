"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { ErrorMessage, SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getPack, getCar, getDriver, getAllDrivers } = require("../util/functions/dataManager.js");
const { rarityOf, driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const { MILESTONE_STATS, rewardProblems } = require("../util/functions/packBattleManager.js");
const packBattleModel = require("../models/packBattleSchema.js");

// Stats a milestone can watch: the built-ins plus this battle's own counters.
// Dailies need a per-day count — the two built-in dailies, or a crPulled /
// cardsPulled counter (those keep a _today mirror; uniqueCars ones don't).
function milestoneStats(battle) {
    const counters = (battle.counters || []).filter(counter => counter && counter.key);
    return {
        all: [...MILESTONE_STATS, ...counters.map(counter => counter.key)],
        daily: ["totalCRPulled", "highestSinglePullCR",
            ...counters.filter(counter => counter.type !== "uniqueCars").map(counter => counter.key)]
    };
}

// Template battles number their milestones "m1", "m2"…; ones built up with
// addmilestone use 1, 2…. A new ID follows whichever style the battle has.
function nextMilestoneID(battle) {
    const ids = battle.milestones.map(m => String(m.milestoneID));
    const highest = Math.max(0, ...ids.map(id => parseInt(id.replace(/^m/i, ""))).filter(n => !isNaN(n)));
    return ids.some(id => /^m\d+$/i.test(id)) ? `m${highest + 1}` : highest + 1;
}

// Accepts "m6", "6" or "#m6" for either ID style.
function findMilestone(battle, raw) {
    const wanted = String(raw || "").toLowerCase().replace(/^#/, "");
    if (!wanted) return undefined;
    return battle.milestones.find(m => String(m.milestoneID).toLowerCase() === wanted)
        || battle.milestones.find(m => String(m.milestoneID).toLowerCase().replace(/^m/, "") === wanted.replace(/^m/, ""));
}

// Discord caps an embed field at 1024 characters — spread long lists over
// as many fields as they need.
function chunkFields(name, lines) {
    const fields = [];
    let current = "";
    for (const line of lines) {
        const piece = line.length > 1024 ? `${line.slice(0, 1021)}...` : line;
        if (current && current.length + 1 + piece.length > 1024) {
            fields.push({ name: fields.length === 0 ? name : `${name} (cont.)`, value: current });
            current = piece;
        }
        else current = current ? `${current}\n${piece}` : piece;
    }
    fields.push({ name: fields.length === 0 ? name : `${name} (cont.)`, value: current || "None" });
    return fields;
}

module.exports = {
    name: "editpackbattle",
    aliases: ["epb"],
    usage: [
        "<battle name> name <new name>",
        "<battle name> duration <days>",
        "<battle name> extend <hours>",
        "<battle name> addmilestone <stat or counter> <threshold> <resetType> <rewardType> <amount>",
        "<battle name> addmilestone <stat or counter> <threshold> <resetType> car <carID> [upgrade]",
        "<battle name> addmilestone <stat or counter> <threshold> <resetType> driver <driver ID or name>",
        "<battle name> removemilestone <milestoneID>",
        "<battle name> secretmilestone <milestoneID> [hint text]",
        "<battle name> hint <milestoneID> <hint text or clear>",
        "<battle name> addplacement <leaderboard> <minRank> <maxRank> <rewardType> <amount>",
        "<battle name> addplacement <leaderboard> <minRank> <maxRank> driver <driver ID or name>",
        "<battle name> removeplacement <index>",
        "<battle name> viewconfig"
    ],
    args: 2,
    category: "Events",
    description: "Edits a pack battle's settings.",
    async execute(message, args) {
        const battles = await packBattleModel.find();
        // Multi-word battle names: greedily match the LONGEST args-prefix against
        // a battle name, so "Operation: Wild Horse viewconfig" parses with the
        // subcommand in the right slot. Falls back to the original single-token
        // fuzzy search when no exact name matches.
        let exactBattle = null;
        for (let k = args.length - 1; k >= 1; k--) {
            const candidate = args.slice(0, k).join(" ").toLowerCase();
            const hit = battles.find(b => b.name.toLowerCase() === candidate);
            if (hit) { exactBattle = hit; args.splice(1, k - 1); break; }
        }
        if (exactBattle) {
            await editBattle(exactBattle, undefined);
        }
        else {
            let query = [args[0].toLowerCase()];
            await new Promise(resolve => resolve(search(message, query, battles, "packbattle")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    await editBattle(...response);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function editBattle(battle, currentMessage) {
            let successMessage;
            const criteria = args[1].toLowerCase();

            // Helper to display reward objects — every part shows, so a
            // car + money + trophies placement reads in full
            function formatRewardDisplay(reward) {
                return Object.entries(reward || {}).map(([k, v]) => {
                    if (k === "car") {
                        const carData = getCar(v.carID);
                        if (carData) return carNameGen({ currentCar: carData, rarity: true, upgrade: v.upgrade });
                        return `${v.carID} [${v.upgrade}]`;
                    }
                    if (k === "pack") {
                        const packData = getPack(v);
                        return packData ? packData["packName"] : v;
                    }
                    if (k === "driver") {
                        const driver = getDriver(v);
                        return driver ? `Driver: ${driverDisplayName(driver)}` : `driver: ${v}`;
                    }
                    return `${k}: ${v.toLocaleString("en")}`;
                }).join(", ");
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
                    const { all: statChoices, daily: dailyChoices } = milestoneStats(battle);
                    const statList = statChoices.map(choice => `\`${choice}\``).join(", ");
                    if (!args[6]) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, arguments incomplete.",
                            desc: `Syntax: \`addmilestone <stat> <threshold> <resetType> <rewardType> <amount>\`\n\nStats: ${statList}\nReset types: \`cumulative\`, \`daily\`\nReward types: \`money\`, \`fusetokens\`, \`trophies\`, \`car\`, \`pack\`, \`driver\`\n\nCar syntax: \`addmilestone <stat> <threshold> <resetType> car <carID> [upgrade]\`\nPack syntax: \`addmilestone <stat> <threshold> <resetType> pack <packID>\``,
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    // A built-in stat or one of this battle's counters, any casing
                    const stat = statChoices.find(choice => choice.toLowerCase() === args[2].toLowerCase());
                    const threshold = parseInt(args[3]);
                    const resetType = args[4].toLowerCase();
                    const rewardType = args[5].toLowerCase();

                    if (!stat) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid stat.",
                            desc: `Valid stats for this battle: ${statList}`,
                            author: message.author
                        }).displayClosest(args[2], statChoices);
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

                    if (resetType === "daily" && !dailyChoices.includes(stat)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: `Error, ${stat} can't be a daily milestone.`,
                            desc: `Daily milestones need a count that restarts each day: ${dailyChoices.map(choice => `\`${choice}\``).join(", ")}.`,
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    if (!["money", "fusetokens", "trophies", "car", "pack", "driver"].includes(rewardType)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid reward type.",
                            desc: "Valid reward types: `money`, `fusetokens`, `trophies`, `car`, `pack`, `driver`",
                            author: message.author
                        }).displayClosest(rewardType);
                        return errorMessage.sendMessage({ currentMessage });
                    }

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
                        rewardDisplay = packData["packName"];
                    } else if (rewardType === "driver") {
                        const driverQuery = args.slice(6).join(" ").toLowerCase();
                        let rewardDriver = getDriver(driverQuery);
                        if (!rewardDriver) {
                            const matches = getAllDrivers().filter(entry =>
                                driverDisplayName(entry).toLowerCase().includes(driverQuery));
                            if (matches.length === 1) rewardDriver = matches[0];
                        }
                        if (!rewardDriver) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, driver not found (or name not unique).",
                                desc: "Provide a driver ID (`d00038`) or a unique name fragment — `cd-driverlist` shows the roster.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        if (rarityOf(rewardDriver) === "serialised") {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, serialised drivers can't be pack battle rewards.",
                                desc: "Serials mint from a capped global ledger — the Driver Scout is their only source.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        reward = { driver: rewardDriver.driverID };
                        rewardDisplay = `Driver: ${driverDisplayName(rewardDriver)}`;
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

                    // Same checks the template loader runs (catches a bad tune)
                    const problems = rewardProblems(reward, "The reward");
                    if (problems.length > 0) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, reward invalid.",
                            desc: problems.join("\n"),
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    const milestoneID = nextMilestoneID(battle);

                    battle.milestones.push({
                        milestoneID,
                        stat,
                        threshold,
                        reward,
                        resetType,
                        isSecret: false,
                        hint: ""
                    });

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully added milestone #${milestoneID}!`,
                        desc: `**Stat:** ${stat}\n**Threshold:** ${threshold.toLocaleString("en")}\n**Reset:** ${resetType}\n**Reward:** ${rewardDisplay}`
                            + (battle.isActive ? `\n\nPlayers who already qualify get it on their next pack. Add a description with \`hint ${milestoneID} <text>\`.` : `\n\nAdd a description with \`hint ${milestoneID} <text>\`.`),
                        author: message.author
                    });
                    break;
                }
                case "removemilestone": {
                    const milestone = findMilestone(battle, args[2]);
                    if (!milestone) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, milestone not found.",
                            desc: `No milestone with ID \`${args[2] || ""}\`. Use \`viewconfig\` to see all milestones.`,
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    battle.milestones.splice(battle.milestones.indexOf(milestone), 1);
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully removed milestone #${milestone.milestoneID}!`,
                        author: message.author
                    });
                    break;
                }
                case "secretmilestone": {
                    const hint = args.slice(3).join(" ") || "";
                    const milestone = findMilestone(battle, args[2]);
                    if (!milestone) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, milestone not found.",
                            desc: `No milestone with ID \`${args[2] || ""}\`. Use \`viewconfig\` to see all milestones.`,
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    milestone.isSecret = !milestone.isSecret;
                    // Keep the existing hint unless a new one is given
                    if (hint) milestone.hint = hint;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Milestone #${milestone.milestoneID} is now ${milestone.isSecret ? "secret" : "visible"}!`,
                        desc: milestone.hint ? `Hint: "${milestone.hint}"` : "",
                        author: message.author
                    });
                    break;
                }
                case "hint": {
                    // hint <milestoneID> <text> — the description players see
                    // under the milestone ("clear" removes it)
                    const milestone = findMilestone(battle, args[2]);
                    const hint = args.slice(3).join(" ");
                    if (!milestone || !hint) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: !milestone ? "Error, milestone not found." : "Error, no hint text given.",
                            desc: "Syntax: `hint <milestoneID> <text>` (or `clear`). Use `viewconfig` to see milestone IDs.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    milestone.hint = hint.toLowerCase() === "clear" ? "" : hint;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: milestone.hint ? `Updated the hint on milestone #${milestone.milestoneID}!` : `Cleared the hint on milestone #${milestone.milestoneID}!`,
                        desc: milestone.hint ? `"${milestone.hint}"` : "",
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

                    if (!["money", "fusetokens", "trophies", "car", "pack", "driver"].includes(plRewardType)) {
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
                        plRewardDisplay = packData["packName"];
                    } else if (plRewardType === "driver") {
                        const driverQuery = args.slice(6).join(" ").toLowerCase();
                        let rewardDriver = getDriver(driverQuery);
                        if (!rewardDriver) {
                            const matches = getAllDrivers().filter(entry =>
                                driverDisplayName(entry).toLowerCase().includes(driverQuery));
                            if (matches.length === 1) rewardDriver = matches[0];
                        }
                        if (!rewardDriver) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, driver not found (or name not unique).",
                                desc: "Provide a driver ID (`d00038`) or a unique name fragment — `cd-driverlist` shows the roster.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        if (rarityOf(rewardDriver) === "serialised") {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, serialised drivers can't be pack battle rewards.",
                                desc: "Serials mint from a capped global ledger — the Driver Scout is their only source.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        plReward = { driver: rewardDriver.driverID };
                        plRewardDisplay = `Driver: ${driverDisplayName(rewardDriver)}`;
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

                    const plProblems = rewardProblems(plReward, "The reward");
                    if (plProblems.length > 0) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, reward invalid.",
                            desc: plProblems.join("\n"),
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
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

                    const milestoneLines = battle.milestones.map(m => {
                        const secretTag = m.isSecret ? " (SECRET)" : "";
                        const rewardStr = formatRewardDisplay(m.reward);
                        const condition = Array.isArray(m.requires) && m.requires.length > 0
                            ? m.requires.map(req => `${req.stat} >= ${Number(req.threshold).toLocaleString("en")}`).join(" AND ")
                            : `${m.stat} >= ${Number(m.threshold).toLocaleString("en")}`;
                        return `**#${m.milestoneID}${secretTag}** — ${condition} (${m.resetType}) → ${rewardStr}`;
                    });

                    const placementLines = battle.placementRewards.map((p, i) => {
                        const rewardStr = formatRewardDisplay(p.reward);
                        return `**#${i + 1}** — ${p.leaderboard} ranks ${p.minRank}-${p.maxRank} → ${rewardStr}`;
                    });

                    const counterLines = (battle.counters || []).filter(counter => counter && counter.key).map(counter => {
                        const scope = [
                            counter.filter && Object.keys(counter.filter).length > 0 ? `filter ${JSON.stringify(counter.filter)}` : "",
                            Array.isArray(counter.carIDs) && counter.carIDs.length > 0 ? `${counter.carIDs.length} listed cars` : ""
                        ].filter(Boolean).join(" + ") || "every card";
                        return `\`${counter.key}\` — ${counter.type}, ${scope}`;
                    });

                    const participants = Object.keys(battle.playerStats || {}).length;

                    const infoMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Pack Battle Config: ${battle.name}`,
                        desc: `**Status:** ${battle.isActive ? "Active" : battle.scheduledStart ? `Scheduled — starts ${DateTime.fromISO(battle.scheduledStart).toUTC().toFormat("ccc d LLL, HH:mm")} UTC` : "Inactive"}\n**Pack:** ${packName} (\`${battle.packID}\`)\n**Deadline:** ${battle.deadline}\n**Participants:** ${participants}\n**Snapshots:** ${(battle.snapshots || []).length}`,
                        author: message.author,
                        fields: [
                            ...(counterLines.length > 0 ? chunkFields("Counters", counterLines) : []),
                            ...chunkFields("Milestones", milestoneLines),
                            ...chunkFields("Placement Rewards", placementLines)
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
                        \`hint\` - Set the description players see under a milestone.
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
