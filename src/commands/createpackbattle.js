"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getPack, getAllPackBattleTemplates } = require("../util/functions/dataManager.js");
const search = require("../util/functions/search.js");
const packBattleModel = require("../models/packBattleSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createpackbattle",
    aliases: ["newpackbattle", "cpb"],
    usage: [
        "<pack ID> <battle name>",
        "template <template name>"
    ],
    args: 2,
    category: "Events",
    description: "Creates a new pack battle for a given pack, or from a template.",
    async execute(message, args) {
        const existing = await packBattleModel.find();

        // ─── Template mode ────────────────────────────────────────────────
        if (args[0].toLowerCase() === "template") {
            const templates = getAllPackBattleTemplates();
            if (templates.length === 0) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, no pack battle templates found.",
                    desc: "Add template JSON files to the `src/packbattles/` folder and restart the bot.",
                    author: message.author
                }).sendMessage();
            }
            const query = args.slice(1).map(i => i.toLowerCase());
            if (query.length === 0) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, template name required.",
                    desc: "Use: `cd-createpackbattle template <template name>`",
                    author: message.author
                }).sendMessage();
            }
            await new Promise(resolve => resolve(search(message, query, templates, "packBattleTemplate")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    await createFromTemplate(response[0], response[1]);
                })
                .catch(error => { throw error; });
            return;
        }

        // ─── Manual mode (original) ───────────────────────────────────────
        const packID = args[0].toLowerCase();
        const battleName = args.slice(1).join(" ");

        // Validate pack exists
        const pack = getPack(packID);
        if (!pack) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, pack not found.",
                desc: `No pack found with ID \`${packID}\`. Use pack file IDs like \`p00001\`.`,
                author: message.author
            }).sendMessage();
        }

        // Check for duplicate name
        if (existing.find(b => b.name.toLowerCase() === battleName.toLowerCase())) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, pack battle name already taken.",
                desc: "Check existing pack battles using `cd-packbattle`.",
                author: message.author
            }).sendMessage();
        }

        // Check no active battle already uses this pack
        const activeWithPack = existing.find(b => b.packID === packID && b.isActive);
        if (activeWithPack) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, an active pack battle already uses this pack.",
                desc: `The **${activeWithPack.name}** battle is already tracking this pack. End it first or use a different pack.`,
                author: message.author
            }).sendMessage();
        }

        const { totalPackBattles } = await serverStatModel.findOne({});
        await packBattleModel.create({
            battleID: `pb${totalPackBattles + 1}`,
            name: battleName,
            packID
        });
        await serverStatModel.updateOne({}, { "$inc": { totalPackBattles: 1 } });

        return new SuccessMessage({
            channel: message.channel,
            title: `Successfully created a new pack battle: ${battleName}!`,
            desc: `Tracking pack: **${pack["packName"]}** (\`${packID}\`)\nUse \`cd-editpackbattle\` to add milestones and placement rewards, then \`cd-startpackbattle\` to activate.`,
            author: message.author
        }).sendMessage();

        // ─── Helper for template path ─────────────────────────────────────
        async function createFromTemplate(template, currentMessage) {
            const battleName = template.name || "Unnamed Pack Battle";
            const packID = template.packID;

            if (!packID) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, template missing packID.",
                    desc: "The template must specify which pack the battle tracks.",
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            const pack = getPack(packID);
            if (!pack) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, template references a missing pack.",
                    desc: `Template references \`${packID}\` which doesn't exist.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            if (existing.find(b => b.name.toLowerCase() === battleName.toLowerCase())) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, pack battle name already taken.",
                    desc: `A pack battle named **${battleName}** already exists. Rename the template or end the existing battle first.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            const activeWithPack = existing.find(b => b.packID === packID && b.isActive);
            if (activeWithPack) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, an active pack battle already uses this pack.",
                    desc: `The **${activeWithPack.name}** battle is already tracking \`${packID}\`. End it first or use a different pack.`,
                    author: message.author
                }).sendMessage({ currentMessage });
            }

            // Auto-generate milestone IDs if not specified in the template
            const milestones = Array.isArray(template.milestones)
                ? template.milestones.map((m, i) => ({
                    milestoneID: m.milestoneID || `m${i + 1}`,
                    stat: m.stat,
                    threshold: m.threshold,
                    reward: m.reward,
                    resetType: m.resetType || "none",
                    isSecret: !!m.isSecret,
                    hint: m.hint || ""
                }))
                : [];

            const placementRewards = Array.isArray(template.placementRewards)
                ? template.placementRewards.map(p => ({
                    leaderboard: p.leaderboard,
                    minRank: p.minRank,
                    maxRank: p.maxRank,
                    reward: p.reward
                }))
                : [];

            const { totalPackBattles } = await serverStatModel.findOne({});
            const newDoc = {
                battleID: `pb${totalPackBattles + 1}`,
                name: battleName,
                packID,
                milestones,
                placementRewards
            };
            if (template.duration !== undefined) newDoc.deadline = template.duration;

            await packBattleModel.create(newDoc);
            await serverStatModel.updateOne({}, { "$inc": { totalPackBattles: 1 } });

            const filled = [];
            if (template.duration !== undefined) filled.push(`Duration: ${template.duration}`);
            filled.push(`Tracking: ${pack["packName"]} (\`${packID}\`)`);
            filled.push(`Milestones: ${milestones.length}`);
            filled.push(`Placement reward tiers: ${placementRewards.length}`);

            return new SuccessMessage({
                channel: message.channel,
                title: `Created pack battle "${battleName}" from template!`,
                desc: `**Pre-filled from template:**\n${filled.join("\n")}\n\nUse \`cd-editpackbattle\` to tweak anything, then \`cd-startpackbattle\` to launch.`,
                author: message.author
            }).sendMessage({ currentMessage });
        }
    }
};
