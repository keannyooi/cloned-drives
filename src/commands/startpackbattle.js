"use strict";

const { DateTime, Interval } = require("luxon");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime } = require("../util/consts/consts.js");
const { getPack } = require("../util/functions/dataManager.js");
const { activatePackBattle, nextRaceWeekStart } = require("../util/functions/packBattleManager.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const profileModel = require("../models/profileSchema.js");
const packBattleModel = require("../models/packBattleSchema.js");

module.exports = {
    name: "startpackbattle",
    aliases: ["launchpackbattle", "spb"],
    usage: ["<battle name>", "<battle name> raceweek", "<battle name> cancel"],
    args: 1,
    category: "Events",
    description: "Starts an inactive pack battle now, or schedules it to start with the next Race Week rollover (Monday 00:00 UTC). `cancel` drops the schedule.",
    async execute(message, args) {
        // A trailing keyword picks the mode; the words before it name the battle.
        const last = args[args.length - 1].toLowerCase();
        const mode = args.length > 1 && last === "raceweek" ? "schedule"
            : args.length > 1 && (last === "cancel" || last === "unschedule") ? "cancel"
            : "start";
        const nameArgs = mode === "start" ? args : args.slice(0, -1);

        const packNameOf = battle => {
            const pack = getPack(battle.packID);
            return pack ? pack["packName"] : battle.packID;
        };
        const durationText = battle => battle.deadline === "unlimited" ? "Unlimited" : battle.deadline;
        const utcText = dt => `${dt.toUTC().toFormat("ccc d LLL, HH:mm")} UTC`;

        const battles = mode === "cancel"
            ? await packBattleModel.find({ isActive: false, scheduledStart: { $type: "string" } })
            : await packBattleModel.find({ isActive: false });
        let query = nameArgs.map(i => i.toLowerCase());

        await new Promise(resolve => resolve(search(message, query, battles, "packbattle")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                if (mode === "schedule") await scheduleBattle(...response);
                else if (mode === "cancel") await cancelSchedule(...response);
                else await startBattle(...response);
            })
            .catch(error => {
                throw error;
            });

        async function startBattle(battle, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
            const scheduledNote = battle.scheduledStart
                ? `\n\nIt is scheduled for ${utcText(DateTime.fromISO(battle.scheduledStart))}; starting it now replaces that.`
                : "";

            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to start the ${battle.name} pack battle?`,
                desc: `Pack: **${packNameOf(battle)}** (\`${battle.packID}\`)\nMilestones: **${battle.milestones.length}**\nPlacement Rewards: **${battle.placementRewards.length}**\nDuration: **${durationText(battle)}**${scheduledNote}\n\nYou have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                // Activates, announces in the events channel and DMs players
                const started = await activatePackBattle(battle);
                if (!started) {
                    return new ErrorMessage({
                        channel: message.channel,
                        title: `Error, ${battle.name} has already started.`,
                        author: message.author
                    }).sendMessage({ currentMessage });
                }
                return new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the ${battle.name} pack battle!`,
                    author: message.author,
                }).sendMessage({ currentMessage });
            }
        }

        async function scheduleBattle(battle, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
            const startAt = nextRaceWeekStart();
            const days = parseInt(battle.deadline);
            const endText = battle.deadline !== "unlimited" && !isNaN(days)
                ? `, ending ${utcText(startAt.plus({ days }))}`
                : "";

            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Schedule ${battle.name} to start with the Race Week rollover?`,
                desc: `Starts: **${utcText(startAt)}** (in ${timeDisplay(Interval.fromDateTimes(DateTime.now(), startAt))})\nPack: **${packNameOf(battle)}** (\`${battle.packID}\`)\nDuration: **${durationText(battle)}**${endText}\n\nWhen it starts, it announces itself in the events channel and DMs players, just like a manual start.\n\nYou have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                const result = await packBattleModel.updateOne(
                    { battleID: battle.battleID, isActive: false },
                    { $set: { scheduledStart: startAt.toISO() } }
                );
                if (result.matchedCount === 0) {
                    return new ErrorMessage({
                        channel: message.channel,
                        title: `Error, ${battle.name} has already started.`,
                        author: message.author
                    }).sendMessage({ currentMessage });
                }
                return new SuccessMessage({
                    channel: message.channel,
                    title: `${battle.name} will start with the Race Week rollover!`,
                    desc: `**${utcText(startAt)}**${endText}.\nChanged your mind? \`cd-startpackbattle ${battle.name} cancel\``,
                    author: message.author
                }).sendMessage({ currentMessage });
            }
        }

        async function cancelSchedule(battle, currentMessage) {
            await packBattleModel.updateOne(
                { battleID: battle.battleID, isActive: false },
                { $set: { scheduledStart: null } }
            );
            return new SuccessMessage({
                channel: message.channel,
                title: `${battle.name} is no longer scheduled.`,
                desc: "It stays inactive until you start it by hand or schedule it again.",
                author: message.author
            }).sendMessage({ currentMessage });
        }
    }
};
