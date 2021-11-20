"use strict";

const { MessageButton } = require("discord.js");
const { ErrorMessage, InfoMessage } = require("./classes.js");
const { defaultWaitTime, pageLimit } = require("./consts.js");
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

function carNameGen(currentCar, rarity, upgrade, shortenedlists) {
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
        currentName += shortenedlists ? ` 🏆` : ` ${trophyEmoji}`;
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
                firstPage = new MessageButton({
                    emoji: "⏪",
                    style: "SECONDARY",
                    customId: "first_page"
                });
                prevPage = new MessageButton({
                    emoji: "⬅️",
                    style: "SECONDARY",
                    customId: "prev_page"
                });
                nextPage = new MessageButton({
                    emoji: "➡️",
                    style: "SECONDARY",
                    customId: "next_page"
                });
                lastPage = new MessageButton({
                    emoji: "⏩",
                    style: "SECONDARY",
                    customId: "last_page"
                });
            }
            else {
                firstPage = new MessageButton({
                    label: "<<",
                    style: "DANGER",
                    customId: "first_page"
                });
                prevPage = new MessageButton({
                    label: "<",
                    style: "PRIMARY",
                    customId: "prev_page"
                });
                nextPage = new MessageButton({
                    label: ">",
                    style: "PRIMARY",
                    customId: "next_page"
                });
                lastPage = new MessageButton({
                    label: ">>",
                    style: "DANGER",
                    customId: "last_page"
                });
            }
            return { firstPage, prevPage, nextPage, lastPage };
        case "choice":
            let yse, nop;
            if (buttonStyle === "classic") {
                yse = new MessageButton({
                    emoji: "✅",
                    style: "SECONDARY",
                    customId: "yse"
                });
                nop = new MessageButton({
                    emoji: "❎",
                    style: "SECONDARY",
                    customId: "nop"
                });
            }
            else {
                yse = new MessageButton({
                    label: "Yes!",
                    style: "SUCCESS",
                    customId: "yse"
                });
                nop = new MessageButton({
                    label: "No!",
                    style: "DANGER",
                    customId: "nop"
                });
            }
            return { yse, nop };
        case "rr":
            return;
        default:
            return;
    }
}

function paginate(list, page) {
    return list.slice((page - 1) * pageLimit, page * pageLimit);
}

async function selectUpgrade(message, currentCar, amount, currentMessage, removeMaxed) {
    const filter = (response) => response.author.id === message.author.id;
    let isOne = Object.keys(currentCar.upgrades).filter(m => {
        if (removeMaxed && m.includes("6") && m.includes("9")) return false;
        return currentCar.upgrades[m] >= amount;
    });
    if (isOne.length > 0) {
        return isOne[0];
    }
    else if (isOne.length > 1) {
        let upgradeList = "Type in any tune that is displayed here.\n";
        for (let upg of isOne) {
            upgradeList += `\`${upg}\`, `;
        }

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: "Remove car from which tune?",
            desc: upgradeList.slice(0, -2),
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to consider.`
        });
        const upgradeMessage = await infoMessage.sendMessage({ currentMessage });

        const collected = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: defaultWaitTime,
            errors: ["time"]
        });
        try {
            collected.first().delete();
            if (isOne.find(m => m === collected.first().content) === undefined) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, invalid selection provided.",
                    desc: "It looks like your response was not part of the selection.",
                    author: message.author
                }).displayClosest(collected.first().content);
                return errorMessage.sendMessage({ currentMessage: upgradeMessage });
            }
            else {
                return collected.first().content;
            }
        }
        catch (error) {
            console.log(error);
            const cancelMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Act quicker next time.`,
                author: message.author
            });
            return cancelMessage.sendMessage({ currentMessage: upgradeMessage });
        }
    }
    else {
        const cancelMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, not enough cars to perform bulk fusing action.",
            desc: "Maxed cars cannot be fused/sold. In any case, do check how many of the car you're trying to get rid of using `cd-garage` or `cd-carinfo`.",
            author: message.author
        }).displayClosest(amount);
        return cancelMessage.sendMessage({ currentMessage });
    }
}

function calcTotal(car) {
    if (typeof car !== "object") return 0;
    return Object.values(car.upgrades).reduce((total, amount) => total + amount);
}

module.exports = {
    rarityCheck,
    carNameGen,
    unbritish,
    getButtons,
    paginate,
    selectUpgrade,
    calcTotal
};