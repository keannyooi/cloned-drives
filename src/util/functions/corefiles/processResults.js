"use strict";

const { ActionRowBuilder } = require("discord.js");
const { InfoMessage, ErrorMessage } = require("../../classes/classes.js");
const { defaultWaitTime } = require("../../consts/consts.js");

async function processResults(message, searchResults, listGen, type, currentMessage) {
    // Helper to send error messages
    const sendErrorMessage = async (title, desc, fields = []) => {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title,
            desc,
            author: message.author,
            fields,
        });
        return errorMessage.sendMessage({ currentMessage });
    };

    // If too many results
    if (searchResults.length > 25) {
        return sendErrorMessage(
            "Too Many Search Results",
            "Due to Discord's dropdown menu limitations, the bot can't show the full list of search results. Try again with a more specific keyword.",
            [{ name: "Number of Items in List", value: `\`${searchResults.length} (> 25)\`` }]
        );
    }

    // If multiple results are found
    if (searchResults.length > 1) {
        const row = new ActionRowBuilder().addComponents(listGen());
        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: "Multiple results found, please choose one of the following.",
            author: message.author,
            footer: `You have ${defaultWaitTime / 1000} seconds to decide.`,
        });
        currentMessage = await infoMessage.sendMessage({ currentMessage, buttons: [row], preserve: true });

        try {
            const selection = await message.channel.awaitMessageComponent({
                filter: (button) => button.user.id === message.author.id && button.customId === "search",
                max: 1,
                time: defaultWaitTime,
                errors: ["time"],
            });
            await selection.deferUpdate();
            await currentMessage.removeButtons();
            return [searchResults[parseInt(selection.values[0]) - 1], currentMessage];
        } catch (error) {
            console.error("Error during component interaction:", error);
            return sendErrorMessage(
                "Action Cancelled Automatically",
                `No response received within ${defaultWaitTime / 1000} seconds. Please act quicker next time.`
            );
        }
    }

    // If exactly one result is found
    if (searchResults.length === 1) {
        return [searchResults[0], currentMessage];
    }

    // If no results found
    return sendErrorMessage(
        "No Results Found",
        "Your query did not yield any results. Please refine your search and try again."
    );
}

module.exports = processResults;