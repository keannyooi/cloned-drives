"use strict";

const { MessageButton, MessageActionRow, MessageSelectMenu } = require("discord.js");
const { ErrorMessage, InfoMessage } = require("./classes.js");
const { defaultWaitTime, defaultPageLimit, carSave } = require("./consts.js");
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

//args list: currentCar, rarity, upgrade, shortenedLists
function carNameGen(args) {
    const trophyEmoji = bot.emojis.cache.get("775636479145148418");
    let make = args.currentCar["make"];
    if (typeof make === "object") {
        make = args.currentCar["make"][0];
    }
    let currentName = `${make} ${args.currentCar["model"]} (${args.currentCar["modelYear"]})`;
    if (args.rarity) {
        currentName = `(${args.rarity} ${args.currentCar["rq"]}) ${currentName}`;
    }
    if (args.upgrade) {
        currentName += ` [${args.upgrade}]`;
    }
    if (!args.removePrizeTag && args.currentCar["isPrize"]) {
        currentName += args.shortenedLists ? ` 🏆` : ` ${trophyEmoji}`;
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

function paginate(list, page, pageLimit) {
    let limit = pageLimit || defaultPageLimit;
    return list.slice((page - 1) * limit, page * limit);
}

async function selectUpgrade(message, currentCar, amount, currentMessage, targetUpgrade) {
    const filter = (button) => button.user.id === message.author.id && button.customId === "upgrade_select";
    let isOne = Object.keys(currentCar.upgrades).filter(m => {
        if (targetUpgrade && ((m.includes("6") && m.includes("9")) || Number(targetUpgrade) <= Number(m))) return false;
        return currentCar.upgrades[m] >= amount;
    });

    if (isOne.length === 1) {
        return [isOne[0]];
    }
    else if (isOne.length > 1) {
        const options = [];
        for (let upg of isOne) {
            options.push({
                label: upg === "000" ? "Stock upgrade" : `${upg} upgrade`,
                value: upg
            });
        }
        const dropdownList = new MessageSelectMenu({
            customId: "upgrade_select",
            placeholder: "Select a tune...",
            options,
        });
        const row = new MessageActionRow({ components: [dropdownList] });

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: `Choose one of the ${isOne.length} available tunes below.`,
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to consider.`
        });
        currentMessage = await infoMessage.sendMessage({ currentMessage, buttons: [row] });

        const selection = await message.channel.awaitMessageComponent({
            filter,
            max: 1,
            time: defaultWaitTime,
            errors: ["time"]
        });
        try {
            await selection.deferUpdate();
            await currentMessage.removeButtons();
        }
        catch (error) {
            const cancelMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Please act quicker next time.`,
                author: message.author
            });
            await cancelMessage.sendMessage({ currentMessage });
            return cancelMessage.removeButtons();
        }
        return [selection.values[0], currentMessage];
    }
    else {
        const cancelMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, no compatible upgrades found for target upgrade.",
            desc: "Correct tuning order: `000` => `333` => `666` => `996`, `969` or `699`.",
            author: message.author
        }).displayClosest(targetUpgrade);
        return cancelMessage.sendMessage({ currentMessage });
    }
}

function calcTotal(car) {
    if (typeof car !== "object") return 0;
    return Object.values(car.upgrades).reduce((total, amount) => total + amount);
}

function addCars(garage, cars) {
    for (let i = 0; i < cars.length; i++) {
        let isInGarage = garage.findIndex(garageCar => garageCar.carID === cars[i]);
        if (isInGarage !== -1) {
            garage[isInGarage].upgrades["000"] += 1;
        }
        else {
            garage.push({
                carID: cars[i].slice(0, 6),
                upgrades: carSave
            });
        }
    }
    return garage;
}

function updateHands(playerData, carID, origUpg, newUpg) {
    if (playerData.hand?.carID === carID && playerData.hand?.upgrade === origUpg) {
        if (newUpg === "remove") {
            playerData.hand = { carID: "", upgrade: "000" };
        }
        else {
            playerData.hand.upgrade = newUpg;
        }
    }
    for (let i = 0; i < playerData.decks.length; i++) {
        let x = playerData.decks[i].hand.findIndex(c => c.carID === carID && c.upgrade === origUpg);
        if (x > -1) {
            if (newUpg === "remove") {
                playerData.decks[i].hand[x] = "";
                playerData.decks[i].tunes[x] = "000";
            }
            else {
                playerData.decks[i].tunes[x] = newUpg;
            }
        }
    }
    return playerData;
}

function sortCheck(message, sort, currentMessage) {
    switch (sort) {
        case "rq":
        case "handling":
        case "weight":
        case "mra":
        case "ola":
        case "mostowned":
            return sort;
        case "topspeed":
            return "topSpeed";
        case "accel":
            return "0to60";
        default:
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, sorting criteria not found.",
                desc: `Here is a list of sorting criterias. 
                \`-s topspeed\` - Sort by top speed. 
                \`-s accel\` - Sort by acceleration. 
                \`-s handling\` - Sort by handling. 
                \`-s weight\` - Sort by weight. 
                \`-s mra\` - Sort by mid-range acceleraion. 
                \`-s ola\` - Sort by off-the-line acceleration.
                \`-s mostowned\` - Sort by how many copies of the car owned.`,
                author: message.author
            }).displayClosest(sort);
            return errorMessage.sendMessage({ currentMessage });
    }
}

function getFlag(code) {
    switch (code) {
        case "YU":
            return "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Flag_of_Yugoslavia_%281946-1992%29.svg/1000px-Flag_of_Yugoslavia_%281946-1992%29.svg.png";
        default:
            return `https://getflags.net/img1000/${code.toLowerCase()}.png`;
    }
}

module.exports = {
    rarityCheck,
    carNameGen,
    unbritish,
    getButtons,
    paginate,
    selectUpgrade,
    calcTotal,
    addCars,
    updateHands,
    sortCheck,
    getFlag
};