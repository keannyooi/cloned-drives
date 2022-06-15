"use strict";

const { MessageActionRow } = require("discord.js");
const { InfoMessage, ErrorMessage } = require("../../classes/classes.js");
const { defaultWaitTime } = require("../../consts/consts.js");

async function processResults(message, searchResults, listGen, type, currentMessage) {
    const filter = (button) => button.user.id === message.author.id && button.customId === "search";
    if (searchResults.length > 25) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Due to Discord's dropdown menu limitations, the bot isn't able to show the full list of search results.",
            desc: "Try again with a more specific keyword.",
            author: message.author,
            fields: [{ name: "Number of Items in List", value: `\`${searchResults.length} (> 25)\`` }]
        });
        return errorMessage.sendMessage({ currentMessage });
    }
    else if (searchResults.length > 1) {
        const row = new MessageActionRow({ components: [listGen()] });
        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: "Multiple results found, please choose one of the following.",
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to decide.`
        });
        currentMessage = await infoMessage.sendMessage({ currentMessage, buttons: [row], preserve: true });

        try {
            const selection = await message.channel.awaitMessageComponent({
                filter,
                max: 1,
                time: defaultWaitTime,
                errors: ["time"]
            });
            await selection.deferUpdate();
            await currentMessage.removeButtons();
            return [searchResults[parseInt(selection.values[0]) - 1], currentMessage];
        }
        catch (error) {
            console.log(error);
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Act quicker next time.`,
                author: message.author
            });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
    else if (searchResults.length > 0) {
        if (Array.isArray(searchResults)) {
            searchResults.push(currentMessage);
            return searchResults;
        }
        else {
            return [Array.from(searchResults)[0][1], currentMessage];
        }
    }
    else {
        throw ((query, searchList) => {
            if (searchList.length === 0) {
                searchList.push("(none found)");
            }
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, query provided yielded no results.",
                desc: "Well that sucks.",
                author: message.author
            }).displayClosest(query.length > 1024 ? "i think you might be just spamming" : query, type !== "id" ? searchList : null);
            return errorMessage.sendMessage({ currentMessage });
        });
    }
}

module.exports = processResults;