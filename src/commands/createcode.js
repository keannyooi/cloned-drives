"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const codeModel = require("../models/codeSchema.js");

module.exports = {
    name: "createcode",
    aliases: ["newcode"],
    usage: ["<code>"],
    args: 1,
    category: "Admin",
    description: "Creates a new redeemable code. Code names are case-insensitive and cannot contain spaces.",
    async execute(message, args) {
        const codeName = args[0].toUpperCase();

        if (codeName.length < 2 || codeName.length > 30) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, code name must be between 2 and 30 characters.",
                desc: "Try something shorter or longer depending on the case.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        if (!/^[A-Z0-9_-]+$/.test(codeName)) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, code name contains invalid characters.",
                desc: "Codes can only contain letters, numbers, hyphens and underscores (no spaces).",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const existing = await codeModel.findOne({ code: codeName });
        if (existing) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, a code with this name already exists.",
                desc: `The code \`${codeName}\` is already taken. Try a different name.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        await codeModel.create({
            code: codeName,
            createdBy: message.author.tag
        });

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully created the code \`${codeName}\`!`,
            desc: "You can now configure its rewards and settings using `cd-editcode`.",
            author: message.author
        });
        return successMessage.sendMessage();
    }
};
