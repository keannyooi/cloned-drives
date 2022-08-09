"use strict";

const { SuccessMessage, ErrorMessage, BotError } = require("../util/classes/classes.js");
const regenBM = require("../util/functions/regenBM.js");

module.exports = {
    name: "refreshbm",
    aliases: ["rfbm", "refreshbm"],
    usage: [],
    args: 0,
    category: "Admin",
    description: "Refreshes the black market catalog immediately.",
    async execute(message) {
        try {
            await regenBM();
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: "Successfully refreshed the black market!",
                author: message.author
            });
            return successMessage.sendMessage();
        }
        catch (error) {
            console.log(error.stack);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, failed to refresh black market.",
                desc: `Something must have gone wrong. Don't worry, I've reported this issue to the devs.\n\`${error.stack}\``,
                author: message.author
            });
            await errorMessage.sendMessage();

            const errorReport = new BotError({
                guild: message.guild,
                channel: message.channel,
                message,
                stack: error.stack,
            });
            return errorReport.sendReport();
        }
    }
};