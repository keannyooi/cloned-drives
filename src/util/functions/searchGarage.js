"use strict";

const { StringSelectMenuBuilder } = require("discord.js");
const { ErrorMessage } = require("../classes/classes.js");
const { trophyEmojiID } = require("../consts/consts.js");
const { getCar } = require("./dataManager.js");
const { isSellProtected, isPrizeLike } = require("./cardType.js");
const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js")
const processResults = require("./corefiles/processResults.js");
const { _match } = require("./search.js");

async function searchGarage(args) {
    let { message, query, garage, amount, searchByID, restrictedMode, currentMessage } = args;
    let matchList = [];

    // Bare carIDs now work here like everywhere else; the legacy -c prefix
    // (which sets searchByID upstream) is unchanged.
    if (!searchByID && query.length === 1 && /^c\d{5}$/.test(String(query[0]).toLowerCase())) {
        searchByID = true;
        query = [String(query[0]).toLowerCase()];
    }

    // Same forgiving matcher as the global search: punctuation-blind, partial
    // words allowed, ranked so the best match tops the picker. matchList keeps
    // every NAME match regardless of copy count — the insufficient-copies
    // fallback below depends on it.
    const queryParts = query.map(_match.normalize).filter(Boolean);
    const scored = [];
    for (const car of garage) {
        const currentCar = getCar(car.carID);
        if (restrictedMode && isSellProtected(currentCar)) continue;

        let matchFound, score = 0;
        if (searchByID) {
            matchFound = car.carID === query[0];
            score = 1;
        }
        else {
            const name = carNameGen({ currentCar, removePrizeTag: true, removeBMTag: true });
            score = queryParts.length > 0 ? _match.scoreItem(name, queryParts) : 0;
            matchFound = score > 0;
            if (matchFound) matchList.push(car);
        }
        if (!matchFound) continue;

        const isSufficient = restrictedMode
            ? (car.upgrades["000"] + car.upgrades["333"] + car.upgrades["666"]) >= amount
            : calcTotal(car) >= amount;
        if (isSufficient) {
            scored.push({ car, score, name: carNameGen({ currentCar, removePrizeTag: true }) });
        }
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const totalMatches = scored.length;
    const searchResults = scored.slice(0, 25).map(entry => entry.car);

    return processResults(message, searchResults, () => {
        const options = [];
        for (let i = 0; i < searchResults.length; i++) {
            let currentCar = getCar(searchResults[i].carID);
            options.push({
                label: carNameGen({ currentCar, removePrizeTag: true }),
                value: `${i + 1}`
            });
            if (isPrizeLike(currentCar)) {
                options.emoji = `<trophies:${trophyEmojiID}>`;
            }
        }

        let list = new StringSelectMenuBuilder()
            .setCustomId("search")
            .setPlaceholder("Select a car...")
            .addOptions(...options);
        return list;
    }, null, currentMessage, totalMatches)
        .catch(throwError => {
            if (typeof throwError !== "function") throw throwError;
            if (matchList.length > 0) {
                let list = "";
                for (let i = 0; i < matchList.length; i++) {
                    let currentCar = getCar(matchList[i].carID), newLine = "";
                    newLine = carNameGen({ currentCar, rarity: true });
                    if (!isPrizeLike(currentCar)) {
                        let upgList = "";
                        for (let [key, value] of Object.entries(matchList[i].upgrades)) {
                            if (value !== 0) upgList += `${value}x ${key}, `;
                        }
                        newLine += ` \`(${upgList.slice(0, -2)}, not enough to perform action)\``;
                    }
                    if (list.length + newLine.length > 1024) { //discord embed field value limit
                        list += "...etc";
                        break;
                    }
                    else {
                        list += `${newLine}\n`;
                    }
                }

                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: `Error, ${amount} non-maxed, non-prize car(s) of the same tune required to perform this action.`,
                    author: message.author,
                    fields: [{ name: "Cars Found", value: list }]
                });
                return errorMessage.sendMessage({ currentMessage: currentMessage });
            }
            else {
                let list = [];
                if (searchByID) {
                    list = garage.map(car => car.carID);
                }
                else {
                    list = garage.map(car => {
                        let currentCar = getCar(car.carID);
                        return carNameGen({ currentCar, removePrizeTag: true }).toLowerCase();
                    });
                }
                return throwError(query.join(" "), list);
            }
        });
}

module.exports = searchGarage;
