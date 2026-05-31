"use strict";

/**
 * cd-createpvp — create a new PvP event.
 *
 *   cd-createpvp <name>                       → blank event with default ticket / cooldown / regen settings
 *   cd-createpvp template <template name>     → fully pre-filled from a pe*.json file in src/pvpevents/
 *
 * Defaults for blank events:
 *   - duration: "unlimited"
 *   - ticketCap: 5
 *   - ticketRegenMinutes: 30
 *   - matchCooldownSeconds: 30
 *   - reqs: {}, tracksets: [], ghostDecks: {}, rewards: []
 *
 * After creation, edit with `cd-editpvp` and start with `cd-startpvp`.
 */

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getAllPvpEventTemplates } = require("../util/functions/dataManager.js");
const search = require("../util/functions/search.js");
const pvpEventModel = require("../models/pvpEventSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createpvp",
    aliases: ["newpvp", "newpvpevent", "createpvpevent"],
    usage: [
        "<name>",
        "template <template name>"
    ],
    args: 1,
    category: "Events",
    description: "Creates a new PvP event with the name of your choice, or from a template.",
    async execute(message, args) {
        const events = await pvpEventModel.find();
        const stats = await serverStatModel.findOne({});
        const totalPvpEvents = stats?.totalPvpEvents ?? 0;

        // ─── Template mode ────────────────────────────────────────────────
        if (args[0].toLowerCase() === "template") {
            const templateList = getAllPvpEventTemplates();
            if (templateList.length === 0) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, no PvP event templates found.",
                    desc: "Add template JSON files to the `src/pvpevents/` folder and restart the bot.",
                    author: message.author
                }).sendMessage();
            }

            const query = args.slice(1).map(i => i.toLowerCase());
            if (query.length === 0) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, template name required.",
                    desc: "Use: `cd-createpvp template <template name>`",
                    author: message.author
                }).sendMessage();
            }

            await new Promise(resolve => resolve(search(message, query, templateList, "pvpEventTemplate")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    await createFromTemplate(response[0], response[1]);
                })
                .catch(error => { throw error; });
            return;
        }

        // ─── Blank mode ───────────────────────────────────────────────────
        const eventName = args.join(" ");
        if (events.findIndex(e => e.name === eventName) > -1) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, PvP event name already taken.",
                desc: `A PvP event named **${eventName}** already exists. Use \`cd-pvp\` to see active events.`,
                author: message.author
            }).sendMessage();
        }

        await pvpEventModel.create({
            pvpEventID: `pvpe${totalPvpEvents + 1}`,
            name: eventName
            // All other fields use their schema defaults
        });
        await serverStatModel.updateOne({}, { "$inc": { totalPvpEvents: 1 } });

        return new SuccessMessage({
            channel: message.channel,
            title: `Created PvP event "${eventName}"!`,
            desc: [
                "Next steps:",
                "1. `cd-editpvp <name> trackset add <t1> <t2> <t3> <t4> <t5>` — add at least one trackset",
                "2. `cd-editpvp <name> ghost add <trackset index> ...` — add ghost decks for each trackset",
                "3. `cd-editpvp <name> reward add ...` — set up reward tiers",
                "4. `cd-editpvp <name> reqs ...` — (optional) set car restrictions",
                "5. `cd-editpvp <name> duration <days>` — set duration",
                "6. `cd-startpvp <name>` — go live!"
            ].join("\n"),
            author: message.author
        }).sendMessage();

        // ─── Helpers ──────────────────────────────────────────────────────
        async function createFromTemplate(template, currentMessage) {
            const templateName = template.name || "Unnamed Template";
            if (events.findIndex(e => e.name === templateName) > -1) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, PvP event name already taken.",
                    desc: `A PvP event named **${templateName}** already exists. Rename the template or change the existing event's name first.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            const newEvent = {
                pvpEventID: `pvpe${totalPvpEvents + 1}`,
                name: templateName
            };

            // Copy every supported field from the template, falling back to defaults if absent
            if (template.duration !== undefined) newEvent.deadline = template.duration;
            if (template.ticketCap !== undefined) newEvent.ticketCap = template.ticketCap;
            if (template.ticketRegenMinutes !== undefined) newEvent.ticketRegenMinutes = template.ticketRegenMinutes;
            if (template.matchCooldownSeconds !== undefined) newEvent.matchCooldownSeconds = template.matchCooldownSeconds;
            if (template.deckCrCap !== undefined) newEvent.deckCrCap = template.deckCrCap;
            if (template.cancelPenalty !== undefined) newEvent.cancelPenalty = template.cancelPenalty;
            if (template.reqs) newEvent.reqs = { ...template.reqs };
            if (Array.isArray(template.tracksets)) newEvent.tracksets = JSON.parse(JSON.stringify(template.tracksets));
            if (template.ghostDecks) newEvent.ghostDecks = JSON.parse(JSON.stringify(template.ghostDecks));
            if (Array.isArray(template.rewards)) newEvent.rewards = JSON.parse(JSON.stringify(template.rewards));

            await pvpEventModel.create(newEvent);
            await serverStatModel.updateOne({}, { "$inc": { totalPvpEvents: 1 } });

            const filled = [];
            if (newEvent.deadline) filled.push(`Duration: ${newEvent.deadline}`);
            if (newEvent.ticketCap) filled.push(`Ticket Cap: ${newEvent.ticketCap}`);
            if (newEvent.ticketRegenMinutes) filled.push(`Regen: ${newEvent.ticketRegenMinutes} min`);
            if (newEvent.matchCooldownSeconds) filled.push(`Cooldown: ${newEvent.matchCooldownSeconds}s`);
            if (newEvent.deckCrCap) filled.push(`Deck CR Cap: ${newEvent.deckCrCap}`);
            if (newEvent.reqs && Object.keys(newEvent.reqs).length) filled.push(`Reqs: ${Object.keys(newEvent.reqs).length} field(s)`);
            if (newEvent.tracksets) filled.push(`Tracksets: ${newEvent.tracksets.length}`);
            if (newEvent.ghostDecks) {
                const ghostCount = Object.values(newEvent.ghostDecks).reduce((s, arr) => s + (arr?.length || 0), 0);
                filled.push(`Ghost decks: ${ghostCount}`);
            }
            if (newEvent.rewards) filled.push(`Reward tiers: ${newEvent.rewards.length}`);

            return new SuccessMessage({
                channel: message.channel,
                title: `Created PvP event "${templateName}" from template!`,
                desc: filled.length > 0
                    ? `**Pre-filled from template:**\n${filled.join("\n")}\n\nYou can still edit anything with \`cd-editpvp\`, then start with \`cd-startpvp\`.`
                    : "Created with defaults. Configure with `cd-editpvp` before starting.",
                author: message.author
            }).sendMessage({ currentMessage });
        }
    }
};

