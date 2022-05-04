"use strict";

const { InfoMessage, ErrorMessage } = require("../../classes/classes.js");
const { defaultWaitTime } = require("../../consts/consts.js");

async function processResults(message, searchResults, listGen, type, currentMessage) {
    const filter = (response) => response.author.id === message.author.id;
    const size = Array.isArray(searchResults) ? searchResults.length : searchResults.size;

    if (size > 1) {
        const list = listGen();
        if (list.length > 4096) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Due to Discord's embed limitations, the bot isn't able to show the full list of search results.",
                desc: "Try again with a more specific keyword.",
                author: message.author
            });
            return errorMessage.sendMessage({ currentMessage });
        }

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: "Multiple results found, please type one of the following.",
            desc: list,
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to decide.`
        });
        currentMessage = await infoMessage.sendMessage({ currentMessage, preserve: true });

        try {
            const collected = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: defaultWaitTime,
                errors: ["time"]
            });

            let selection = collected.first().content;
            if (!message.channel.type.includes("DM")) {
                collected.first().delete();
            }
            if (isNaN(selection) || parseInt(selection) > size || parseInt(selection) < 1) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, invalid integer provided.",
                    desc: `Your response was not a number between \`1\` and \`${size}\`.`,
                    author: message.author
                }).displayClosest(selection);
                return errorMessage.sendMessage({ currentMessage });
            }
            else {
                let result;
                if (Array.isArray(searchResults)) {
                    result = searchResults[parseInt(selection) - 1];
                }
                else {
                    result = searchResults.get(Array.from(searchResults.keys())[parseInt(selection) - 1]);
                }
                return [result, currentMessage];
            }
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
    else if (size > 0) {
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
            }).displayClosest(query, type !== "id" ? searchList : null);
            return errorMessage.sendMessage({ currentMessage });
        });
    }
}

module.exports = processResults;