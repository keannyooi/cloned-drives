"use strict";

const { MessageSelectMenu } = require("discord.js");
const { trophyEmojiID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const processResults = require("./corefiles/processResults.js");

async function search(message, query, searchList, type, currentMessage) {
    const searchResults = searchList.filter(s => {
        let test = listGen(s, type).replace(/[()"]/g, "").toLocaleLowerCase("en").split(" ");
        return query.every(part => test.includes(part.replace(/[()"]/g, "")));
    });
    return processResults(message, searchResults, () => {
        const options = [];
        for (let i = 0; i < searchResults.length; i++) {
            let isPrize = type === "car" ? require(`../../cars/${searchResults[i]}`) : {}
            options.push({
                label: listGen(searchResults[i], type),
                value: `${i + 1}`,
                emoji: isPrize["isPrize"] ? { id: trophyEmojiID }  : null
            });
        }

        let list = new MessageSelectMenu({
            customId: "search",
            placeholder: "Select something...",
            options
        });
        return list;
    }, type, currentMessage)
        .catch(throwError => {
            return throwError(query.join(" "), searchList.map(i => listGen(i, type).toLowerCase()));
        });

    function listGen(item, type) {
        switch (type) {
            case "car":
                let currentCar = require(`../../cars/${item}`);
                return carNameGen({ currentCar, removePrizeTag: true });
            case "dealership":
                let car = require(`../../cars/${item.carID}`);
                return carNameGen({ currentCar: car, removePrizeTag: true });
            case "pack":
            case "track":
                let details = require(`../../${type}s/${item}`);
                return details[`${type}Name`];
            case "id":
                return typeof item === "string" ? item.replace(".json", "") : item.id;
            default:
                return item.name;
        }
    }
}

module.exports = search;