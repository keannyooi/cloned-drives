"use strict";

const { SuccessMessage, ErrorMessage, BotError } = require("../util/classes/classes.js");
const regenDealership = require("../util/functions/regenDealership.js");

module.exports = {
    name: "refreshdealership",
    aliases: ["rfdeal", "refreshdeal", "rfdealership"],
    usage: [],
    args: 0,
    category: "Admin",
    description: "Refreshes the dealership catalog immediately.",
    async execute(message) {
        try {
            await regenDealership();
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: "Successfully refreshed the dealership!",
                author: message.author
            });
            return successMessage.sendMessage();
        }
        catch (error) {
            console.log(error.stack);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, failed to refresh dealership.",
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