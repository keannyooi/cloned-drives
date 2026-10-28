"use strict";

/**
 * cd-endpvp <name> — manually end a PvP event.
 *
 * Whether the event is active or still in draft, this:
 *   - Builds the final leaderboard
 *   - Distributes rewards by tier (only for events that were active)
 *   - Archives the result to pvpEventResultModel
 *   - Deletes the active document
 *   - Posts a public end announcement (only for active events)
 *
 * The 3-minute scheduler (see index.js) calls the same `endPvpEvent` helper
 * automatically when an event's deadline expires.
 */

const { SuccessMessage, ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const search = require("../util/functions/search.js");
const confirm = require("../util/functions/confirm.js");
const endPvpEvent = require("../util/functions/endPvpEvent.js");
const pvpEventModel = require("../models/pvpEventSchema.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "endpvp",
    aliases: ["finishpvp", "endpvpevent"],
    usage: ["<event name>"],
    args: 1,
    category: "Events",
    description: "Manually ends a PvP event, distributing rewards and archiving results.",
    async execute(message, args) {
        // Lean: only fields are read, and it exposes the end-claim marker (not in the schema)
        const events = await pvpEventModel.find().lean();
        if (events.length === 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no PvP events to end.",
                desc: "Create one first with `cd-createpvp`.",
                author: message.author
            }).sendMessage();
        }

        const query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                const [pvpEvent, currentMessage] = response;

                // Already claimed by an end (isActive is false, but it's no draft): either
                // that end is still running, or it was interrupted and some players may
                // already hold their rewards. Ending it again here would archive it as a draft.
                if (pvpEvent[endPvpEvent.CLAIM_MARKER]) {
                    return new ErrorMessage({
                        channel: message.channel,
                        title: `Error, "${pvpEvent.name}" is already being ended.`,
                        desc: `An end of this event started <t:${Math.floor(Date.parse(pvpEvent[endPvpEvent.CLAIM_MARKER]) / 1000)}:R>. If it's been more than a few minutes it was interrupted — check the bot log and \`unclaimedRewards\` before cleaning it up by hand.`,
                        author: message.author
                    }).sendMessage({ currentMessage });
                }

                const playerData = await profileModel.findOne({ userID: message.author.id });
                const participantCount = Object.keys(pvpEvent.entries || {}).length;

                const confirmationMessage = new InfoMessage({
                    channel: message.channel,
                    title: `End the PvP event "${pvpEvent.name}"?`,
                    desc: pvpEvent.isActive
                        ? `This will distribute rewards to **${participantCount} participant(s)** and archive the event. **This is permanent.**`
                        : `This event is not currently active. Ending it will just archive the draft and delete it.`,
                    author: message.author,
                    footer: pvpEvent.isActive ? "Players will receive their tier rewards via cd-rewards." : undefined
                });

                await confirm(message, confirmationMessage, async (currentMessage2) => {
                    // endPvpEvent re-reads the event (the copy above predates this
                    // dialog) and returns null if it was ended or changed meanwhile.
                    const ended = await endPvpEvent(pvpEvent, message.author.username);
                    if (!ended) {
                        return new ErrorMessage({
                            channel: message.channel,
                            title: `Error, "${pvpEvent.name}" was not ended.`,
                            desc: pvpEvent.isActive
                                ? "It was already ended elsewhere (likely the deadline scheduler), so rewards went out once, from there."
                                : "The draft was already removed, has been started, or is being ended elsewhere. Check `cd-pvp`.",
                            author: message.author
                        }).sendMessage({ currentMessage: currentMessage2 });
                    }

                    return new SuccessMessage({
                        channel: message.channel,
                        title: `Ended PvP event "${pvpEvent.name}".`,
                        desc: pvpEvent.isActive
                            ? `Rewards distributed to ${ended.totalParticipants} participant(s). See <#current-events> for the final standings.`
                            : "Draft event removed.",
                        author: message.author
                    }).sendMessage({ currentMessage: currentMessage2 });
                }, playerData?.settings?.buttonstyle, currentMessage);
            })
            .catch(error => { throw error; });
    }
};
