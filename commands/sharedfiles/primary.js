"use strict";

const Discord = require("discord.js");
const bot = require("../../config.js");

function rarityCheck(car, shortenedLists) {
    if (shortenedLists) {
        return "RQ";
    }
    else if (car["collection"]) {
        return bot.emojis.cache.get("831967206446465064");
    }
    else if (car["rq"] > 79) { //leggie
        return bot.emojis.cache.get("857512942471479337");
    }
    else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
        return bot.emojis.cache.get("726025468230238268");
    }
    else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
        return bot.emojis.cache.get("726025431937187850");
    }
    else if (car["rq"] > 39 && car["rq"] <= 49) { //super
        return bot.emojis.cache.get("857513197937623042");
    }
    else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
        return bot.emojis.cache.get("726025302656024586");
    }
    else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
        return bot.emojis.cache.get("726025273421725756");
    }
    else { //common
        return bot.emojis.cache.get("726020544264273928");
    }
}

function carNameGen(currentCar, rarity, upgrade) {
    const trophyEmoji = bot.emojis.cache.get("775636479145148418");
    let make = currentCar["make"];
    if (typeof make === "object") {
        make = currentCar["make"][0];
    }
    let currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
    if (rarity) {
        currentName = `(${rarity} ${currentCar["rq"]}) ${currentName}`;
    }
    if (upgrade) {
        currentName += ` [${upgrade}]`;
    }
    if (currentCar["isPrize"]) {
        currentName += ` ${trophyEmoji}`;
    }
    return currentName;
}

function unbritish(value, type) {
    switch (type) {
        case "0to60":
        case "accel":
            return (value * 1.036).toFixed(1);
        case "weight":
            return Math.round(value * 2.20462262185).toString();
        case "topSpeed":
            return Math.round(value * 1.60934).toString();
        default:
            return;
    }
}

function getButtons(type, buttonStyle) {
    switch (type) {
        case "menu":
            let firstPage, prevPage, nextPage, lastPage;
            if (buttonStyle === "classic") {
                firstPage = new Discord.MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("⏪")
                    .setCustomId("first_page");
                prevPage = new Discord.MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("⬅️")
                    .setCustomId("prev_page");
                nextPage = new Discord.MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("➡️")
                    .setCustomId("next_page");
                lastPage = new Discord.MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("⏩")
                    .setCustomId("last_page");
            }
            else {
                firstPage = new Discord.MessageButton()
                    .setStyle("DANGER")
                    .setLabel("<<")
                    .setCustomId("first_page");
                prevPage = new Discord.MessageButton()
                    .setStyle("PRIMARY")
                    .setLabel("<")
                    .setCustomId("prev_page");
                nextPage = new Discord.MessageButton()
                    .setStyle("PRIMARY")
                    .setLabel(">")
                    .setCustomId("next_page");
                lastPage = new Discord.MessageButton()
                    .setStyle("DANGER")
                    .setLabel(">>")
                    .setCustomId("last_page");
            }
            return { firstPage: firstPage, prevPage: prevPage, nextPage: nextPage, lastPage: lastPage };
        case "choice":
            return;
        default:
            return;
    }
}

function listInit(list, page) {
    let reactionIndex = 0, pageLimit = 10, startsWith, endsWith;
    if (list.length <= pageLimit) {
        startsWith = 0;
        endsWith = list.length;
        reactionIndex = 0;
    }
    else if (page * pageLimit === pageLimit) {
        startsWith = 0;
        endsWith = pageLimit;
        reactionIndex = 1;
    }
    else if (list.length <= (pageLimit * page)) {
        startsWith = pageLimit * (page - 1);
        endsWith = list.length;
        reactionIndex = 2;
    }
    else {
        startsWith = pageLimit * (page - 1);
        endsWith = startsWith + pageLimit;
        reactionIndex = 3;
    }
    return { startsWith, endsWith, reactionIndex };
}

module.exports = {
    rarityCheck,
    carNameGen,
    unbritish,
    getButtons,
    listInit
};