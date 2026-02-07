"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getPack } = require("../util/functions/dataManager.js");
const packBattleModel = require("../models/packBattleSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createpackbattle",
    aliases: ["newpackbattle", "cpb"],
    usage: ["<pack ID> <battle name>"],
    args: 2,
    category: "Events",
    description: "Creates a new pack battle for a given pack.",
    async execute(message, args) {
        const packID = args[0].toLowerCase();
        const battleName = args.slice(1).join(" ");

        // Validate pack exists
        const pack = getPack(packID);
        if (!pack) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, pack not found.",
                desc: `No pack found with ID \`${packID}\`. Use pack file IDs like \`p00001\`.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Check for duplicate name
        const existing = await packBattleModel.find();
        if (existing.find(b => b.name.toLowerCase() === battleName.toLowerCase())) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, pack battle name already taken.",
                desc: "Check existing pack battles using `cd-packbattle`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Check no active battle already uses this pack
        const activeWithPack = existing.find(b => b.packID === packID && b.isActive);
        if (activeWithPack) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, an active pack battle already uses this pack.",
                desc: `The **${activeWithPack.name}** battle is already tracking this pack. End it first or use a different pack.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const { totalPackBattles } = await serverStatModel.findOne({});
        await packBattleModel.create({
            battleID: `pb${totalPackBattles + 1}`,
            name: battleName,
            packID
        });
        await serverStatModel.updateOne({}, { "$inc": { totalPackBattles: 1 } });

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully created a new pack battle: ${battleName}!`,
            desc: `Tracking pack: **${pack["packName"]}** (\`${packID}\`)\nUse \`cd-editpackbattle\` to add milestones and placement rewards, then \`cd-startpackbattle\` to activate.`,
            author: message.author
        });
        return successMessage.sendMessage();
    }
};
