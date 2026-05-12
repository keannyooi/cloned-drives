"use strict";

/**
 * cd-startpvp <name> — start an inactive PvP event.
 *
 * Strict pre-flight checks before starting:
 *   1. duration must be set (e.g. "7d") — not "unlimited"
 *   2. tracksets: at least 1 trackset, each with exactly 5 tracks
 *   3. ghostDecks: every trackset must have at least 1 ghost deck
 *   4. rewards: at least 1 reward tier defined
 *
 * Once validated:
 *   - Converts deadline from "Xd" → ISO datetime
 *   - Sets isActive=true
 *   - Posts an announcement to #current-events
 */

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { SuccessMessage, ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime } = require("../util/consts/consts.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const carNameGen = require("../util/functions/carNameGen.js");
const { parseDuration } = require("../util/functions/pvpTickets.js");
const profileModel = require("../models/profileSchema.js");
const pvpEventModel = require("../models/pvpEventSchema.js");

module.exports = {
    name: "startpvp",
    aliases: ["launchpvp", "startpvpevent"],
    usage: ["<event name>"],
    args: 1,
    category: "Events",
    description: "Starts an inactive PvP event after validating it has tracksets, ghost decks, rewards, and a duration.",
    async execute(message, args) {
        const events = await pvpEventModel.find({ isActive: false });
        if (events.length === 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no inactive PvP events available.",
                desc: "Create one with `cd-createpvp` first.",
                author: message.author
            }).sendMessage();
        }

        const query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await startPvpEvent(...response);
            })
            .catch(error => { throw error; });

        async function startPvpEvent(pvpEvent, currentMessage) {
            // Pre-flight validation — refuse to start if anything is missing
            const issues = validatePvpEvent(pvpEvent);
            if (issues.length > 0) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this PvP event isn't ready to start.",
                    desc: `**Issues found:**\n• ${issues.join("\n• ")}\n\nFix these with \`cd-editpvp\` before retrying.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            const playerData = await profileModel.findOne({ userID: message.author.id });
            const ghostCount = Object.values(pvpEvent.ghostDecks).reduce((s, arr) => s + (arr?.length || 0), 0);

            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Start the PvP event "${pvpEvent.name}"?`,
                desc: `Once started, the event runs for ${pvpEvent.deadline}. You have ${defaultChoiceTime / 1000} seconds to confirm.`,
                author: message.author,
                fields: [
                    { name: "Tracksets", value: String(pvpEvent.tracksets.length), inline: true },
                    { name: "Ghost Decks", value: String(ghostCount), inline: true },
                    { name: "Reward Tiers", value: String(pvpEvent.rewards.length), inline: true },
                    { name: "Ticket Cap", value: String(pvpEvent.ticketCap), inline: true },
                    { name: "Regen", value: `${pvpEvent.ticketRegenMinutes} min`, inline: true },
                    { name: "Cooldown", value: `${pvpEvent.matchCooldownSeconds}s`, inline: true },
                    { name: "Deck CR Cap", value: pvpEvent.deckCrCap > 0 ? String(pvpEvent.deckCrCap) : "_none_", inline: true }
                ]
            });

            await confirm(message, confirmationMessage, async (currentMessage2) => {
                // Convert "<n><unit>" → ISO timestamp (supports m/h/d/w)
                const parsed = parseDuration(pvpEvent.deadline);
                pvpEvent.deadline = DateTime.now().plus({ [parsed.luxonKey]: parsed.amount }).toISO();
                pvpEvent.isActive = true;

                await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, {
                    deadline: pvpEvent.deadline,
                    isActive: true
                });

                // Public announcement
                try {
                    const channel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                    const announcement = new InfoMessage({
                        channel,
                        title: `🏁 New PvP Event: ${pvpEvent.name}`,
                        desc: `Compete by spending tickets to race other players' decks across pre-set tracksets.\n\nUse \`cd-pvp\` to see your standing and \`cd-pvpplay ${pvpEvent.name}\` to enter a match!`,
                        author: bot.user,
                        fields: [
                            { name: "Reqs", value: reqDisplay(pvpEvent.reqs) || "_none_", inline: false },
                            { name: "Tracksets", value: String(pvpEvent.tracksets.length), inline: true },
                            { name: "Ticket Cap", value: String(pvpEvent.ticketCap), inline: true },
                            { name: "Ends", value: `<t:${Math.floor(DateTime.fromISO(pvpEvent.deadline).toSeconds())}:R>`, inline: true }
                        ]
                    });
                    await announcement.sendMessage();
                } catch (err) {
                    console.error(`Failed to post PvP event announcement: ${err.message}`);
                }

                return new SuccessMessage({
                    channel: message.channel,
                    title: `Started PvP event "${pvpEvent.name}"!`,
                    desc: `The event is now live and ends <t:${Math.floor(DateTime.fromISO(pvpEvent.deadline).toSeconds())}:R>.`,
                    author: message.author
                }).sendMessage({ currentMessage: currentMessage2 });
            }, playerData?.settings?.buttonstyle, currentMessage);
        }
    }
};

/**
 * Returns an array of human-readable issue strings.
 * Empty array means the event is good to start.
 */
function validatePvpEvent(pvpEvent) {
    const issues = [];

    // 1. Duration must be a valid "<n><unit>" string (m/h/d/w)
    const parsedDuration = parseDuration(pvpEvent.deadline);
    if (!pvpEvent.deadline || pvpEvent.deadline === "unlimited" || !parsedDuration) {
        issues.push(`Duration not set — use \`cd-editpvp ${pvpEvent.name} duration <amount>\` (e.g. \`1h\`, \`7d\`)`);
    }

    // 2. Tracksets — at least 1, each with exactly 5 tracks
    if (!Array.isArray(pvpEvent.tracksets) || pvpEvent.tracksets.length === 0) {
        issues.push(`No tracksets defined — add at least 1 with \`cd-editpvp ${pvpEvent.name} trackset add ...\``);
    }
    else {
        for (let i = 0; i < pvpEvent.tracksets.length; i++) {
            const ts = pvpEvent.tracksets[i];
            if (!Array.isArray(ts) || ts.length !== 5) {
                issues.push(`Trackset ${i + 1} doesn't have exactly 5 tracks (has ${ts?.length ?? 0})`);
                continue;
            }
            for (let j = 0; j < ts.length; j++) {
                if (!getTrack(ts[j])) {
                    issues.push(`Trackset ${i + 1} slot ${j + 1}: track \`${ts[j]}\` not found`);
                }
            }
        }
    }

    // 3. Ghost decks — at least 1 per trackset, all cars valid, total CR within deckCrCap
    const ghosts = pvpEvent.ghostDecks || {};
    const cap = pvpEvent.deckCrCap || 0;
    if (Array.isArray(pvpEvent.tracksets)) {
        for (let i = 0; i < pvpEvent.tracksets.length; i++) {
            const arr = ghosts[String(i)];
            if (!Array.isArray(arr) || arr.length === 0) {
                issues.push(`No ghost decks for trackset ${i + 1} — add at least one with \`cd-editpvp ${pvpEvent.name} ghost add ${i + 1} ...\``);
                continue;
            }
            for (let j = 0; j < arr.length; j++) {
                const ghost = arr[j];
                if (!Array.isArray(ghost.deck) || ghost.deck.length !== 5) {
                    issues.push(`Ghost #${j + 1} for trackset ${i + 1} doesn't have exactly 5 cars`);
                    continue;
                }
                if (!Array.isArray(ghost.upgrades) || ghost.upgrades.length !== 5) {
                    issues.push(`Ghost #${j + 1} for trackset ${i + 1} doesn't have exactly 5 upgrade values`);
                    continue;
                }
                let totalCR = 0;
                let allCarsValid = true;
                for (let k = 0; k < 5; k++) {
                    const c = getCar(ghost.deck[k]);
                    if (!c) {
                        issues.push(`Ghost #${j + 1} for trackset ${i + 1}: car \`${ghost.deck[k]}\` not found`);
                        allCarsValid = false;
                        continue;
                    }
                    totalCR += c.cr || 0;
                }
                if (allCarsValid && cap > 0 && totalCR > cap) {
                    issues.push(`Ghost #${j + 1} "${ghost.name}" for trackset ${i + 1} exceeds deck CR cap: ${totalCR} > ${cap}`);
                }
            }
        }
    }

    // 4. Rewards — at least 1 tier
    if (!Array.isArray(pvpEvent.rewards) || pvpEvent.rewards.length === 0) {
        issues.push(`No reward tiers defined — add at least one with \`cd-editpvp ${pvpEvent.name} reward add ...\``);
    }

    return issues;
}
