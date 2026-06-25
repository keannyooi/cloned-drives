"use strict";

const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getAutoEventTemplate, getAutoEventTemplateFiles } = require("../util/functions/dataManager.js");
const { spawnFromTemplate } = require("../util/functions/autoEvents.js");
const serverStatModel = require("../models/serverStatSchema.js");

/**
 * cd-autoevent — admin console for the auto-event system.
 * Templates live in src/autoevents/*.json; the daily cron spawns them on
 * schedule. This command exists to inspect state and force spawns (testing,
 * or "I want it live NOW").
 */
module.exports = {
    name: "autoevent",
    aliases: ["ae"],
    usage: ["list", "spawn <template ID>"],
    args: 1,
    category: "Admin",
    description: "Lists auto-event templates and their spawn state, or force-spawns one immediately.",
    async execute(message, args) {
        const sub = args[0].toLowerCase();

        if (sub === "list") {
            const files = getAutoEventTemplateFiles();
            if (files.length === 0) {
                return new InfoMessage({
                    channel: message.channel,
                    title: "No auto-event templates found.",
                    desc: "Add template files to `src/autoevents/` (see `_master.json` there for all options) and restart the bot.",
                    author: message.author
                }).sendMessage();
            }
            const stat = await serverStatModel.findOne({});
            const state = stat.autoEventState || {};
            let list = "";
            for (const file of files) {
                const id = file.slice(0, -5);
                const t = getAutoEventTemplate(id);
                const s = state[id] || {};
                list += `**${id}** — ${t.name} ${t.enabled === true ? "🟢" : "🔴 disabled"}\n`
                    + `    generator \`${t.generator}\` | ${t.spawnDay ? `every ${t.spawnDay}` : `every ${t.cadenceDays || 14}d`} | runs ${t.durationDays || 14}d | ${t.rounds || 20} rounds\n`
                    + `    spawned ${s.counter || 0}× | last: ${s.lastSpawn ? s.lastSpawn.slice(0, 10) : "never"} | current: ${s.currentEventID || "none"}\n`;
            }
            return new InfoMessage({
                channel: message.channel,
                title: "Auto-Event Templates",
                desc: list,
                author: message.author,
                footer: "cd-ae spawn <template ID> force-spawns immediately (generation takes a few seconds)."
            }).sendMessage();
        }

        if (sub === "spawn") {
            const templateID = (args[1] || "").toLowerCase();
            const template = getAutoEventTemplate(templateID);
            if (!template) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, that template doesn't exist.",
                    desc: `Known templates: \`${getAutoEventTemplateFiles().map(f => f.slice(0, -5)).join("`, `") || "none"}\``,
                    author: message.author
                }).sendMessage();
            }

            const waitMessage = new InfoMessage({
                channel: message.channel,
                title: `Generating "${template.name}"...`,
                desc: "Verifying every round is beatable — this takes a few seconds.",
                author: message.author
            });
            await waitMessage.sendMessage();

            try {
                const { eventID, name, debug } = await spawnFromTemplate(templateID);
                return new SuccessMessage({
                    channel: message.channel,
                    title: `Spawned ${name}!`,
                    desc: `Event ID: \`${eventID}\`${debug.themeName ? ` | Theme: **${debug.themeName}**` : ""} | Universe: ${debug.universeSize} cars\n`
                        + `Solver ramp: \`${debug.solverRamp.join(", ")}\``
                        + (debug.warnings.length ? `\n⚠️ ${debug.warnings.join("\n⚠️ ")}` : ""),
                    author: message.author
                }).sendMessage();
            } catch (error) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, spawn failed.",
                    desc: `\`${error.message}\``,
                    author: message.author
                }).sendMessage();
            }
        }

        return new ErrorMessage({
            channel: message.channel,
            title: "Error, unknown subcommand.",
            desc: "Use `cd-ae list` or `cd-ae spawn <template ID>`.",
            author: message.author
        }).sendMessage();
    }
};
