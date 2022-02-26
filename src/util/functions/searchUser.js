"use strict";

const bot = require("../../config/config.js");
const processResults = require("./corefiles/processResults.js");

async function searchUser(message, username, currentMessage) {
    const playerList = await bot.homeGuild.members.fetch();
    const searchResults = playerList.filter(member => {
        return member.nickname?.toLowerCase().includes(username) || member.user.username.toLowerCase().includes(username);
    });
    
    return processResults(message, searchResults, () => {
        let list = "", i = 1;
        searchResults.map(player => {
            list += `${i} - ${player.user.tag}\n`;
            i++;
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