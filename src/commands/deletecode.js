"use strict";

const { SuccessMessage, ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const confirm = require("../util/functions/confirm.js");
const codeModel = require("../models/codeSchema.js");

module.exports = {
    name: "deletecode",
    aliases: ["removecode"],
    usage: ["<code>"],
    args: 1,
    category: "Admin",
    description: "Permanently deletes a redeemable code.",
    async execute(message, args) {
        const codeName = args[0].toUpperCase();
        const codeData = await codeModel.findOne({ code: codeName });

        if (!codeData) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, code not found.",
                desc: `No code with the name \`${codeName}\` exists. Use \`cd-codes\` to view all codes.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const confirmationMessage = new InfoMessage({
            channel: message.channel,
            title: `Are you sure you want to delete the code \`${codeName}\`?`,
            desc: `This code has been redeemed by **${codeData.redeemedBy.length}** player(s). This action cannot be undone.`,
            author: message.author
        });

        await confirm(message, confirmationMessage, async (reactionMessage) => {
            await codeModel.deleteOne({ code: codeName });

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully deleted code \`${codeName}\`!`,
                author: message.author
            });
            return successMessage.sendMessage({ currentMessage: reactionMessage });
        });
    }
};
