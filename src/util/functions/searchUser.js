"use strict";

const { MessageSelectMenu } = require("discord.js");
const bot = require("../../config/config.js");
const processResults = require("./corefiles/processResults.js");

async function searchUser(message, username, currentMessage) {
    const playerList = await bot.homeGuild.members.fetch();
    const searchResults = playerList.filter(member => {
        return member.nickname?.toLowerCase().includes(username) || member.user.username.toLowerCase().includes(username);
    });
    
    return processResults(message, searchResults, () => {
        const options = [];
        for (let i = 0; i < searchResults.length; i++) {
            options.push({
                label: searchResults[i].user.tag,
                value: `${i + 1}`
            });
        }

        let list = new MessageSelectMenu({
            customId: "search",
            placeholder: "Select a user...",
            options
        });
        return list;
    }, null, currentMessage)
        .catch(throwError => {
            const list = [];
            playerList.forEach(player => {
                list.push(player.user.tag);
            });
            return throwError(username, list);
        });
}

module.exports = searchUser;