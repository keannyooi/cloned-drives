"use strict";

const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const editFilter = require("../util/functions/editFilter.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "filter",
    usage: [
        "<make / country / drivetype / tyretype / gc / bodystyle / enginepos / fueltype / tags / collection / search> <corresponding value>",
        "<cr / modelyear / seatcount> <starting value> [ending value]",
        "<isprize / isstock / isupgraded / ismaxed / isowned> <true / false>",
        "<remove / disable> <make / country / tags / collection / tyretype> <corresponding value>",
        "<remove / disable> <make / country / tags / collection / tyretype> all",
        "<remove / disable> <cr / modelyear / seatcount / drivetype / tyretype / gc / bodystyle / enginepos / fueltype / abs / tcs / isprize / isstock / isupgraded / ismaxed / isowned / search>",
        "<remove / disable> all"
    ],
    args: 0,
    category: "Configuration",
    description: "Sets up a filter for garages and car lists.",
    async execute(message, args) {
        let { filter, rrStats, settings } = await profileModel.findOne({ userID: message.author.id });
        let infoMessage;

        if (!args[0]) {
            const fields = [];
            for (let [key, value] of Object.entries(filter)) {
                switch (typeof value) {
                    case "object":
                        if (Array.isArray(value)) {
                            value = value.join(settings.filterlogic ? " or " : " and ");
                        }
                        else {
                            value = `${value.start} ~ ${value.end}`;
                        }
                        break;
                    case "string":
                    case "boolean":
                        break;
                    default:
                        break;
                }
                fields.push({ name: key, value: `\`${value}\``, inline: true });
            }

            infoMessage = new InfoMessage({
                channel: message.channel,
                title: "Current Filter",
                desc: fields.length > 0 ? null : "There are currently no activated filters.",
                author: message.author,
                fields
            });
        }
        else {
            if (!args[1]) {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, arguments provided incomplete.",
                    desc: "Please refer to the help section by typing `cd-help filter`.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            if (args[0].toLowerCase() === "applyreqs") {
                switch (args[1].toLowerCase()) {
                    case "rr":
                    case "randomrace":
                        args[1] = rrStats.reqs;
                        break;
                    default:
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, filter application category provided doesn't exist.",
                            desc: `Here is a list of available filter application category. 
                                    \`rr/randomrace\` - Applies random race crtierias to your filter.`,
                            author: message.author
                        }).displayClosest(args[1].toLowerCase());
                        return errorMessage.sendMessage();
                }
            }

            const response = editFilter(message, filter, args);
            if (!Array.isArray(response)) return;
            ([filter, infoMessage] = response);
            await profileModel.updateOne({ userID: message.author.id }, { filter });
        }
        return infoMessage.sendMessage();
    }
};