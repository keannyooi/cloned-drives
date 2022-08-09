"use strict";

const { MessageSelectMenu } = require("discord.js");
const { trophyEmojiID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const processResults = require("./corefiles/processResults.js");

const listGen = {
    "car": item => {
        let currentCar = require(`../../cars/${item}`);
        return currentCar["reference"] ? "jowhdgeuwrljoehfujbek" : carNameGen({ currentCar, removePrizeTag: true }); //this may be the dirtiest hack of all time but eh, it works
    },
    "carWithBM": item => {
        let currentCar = require(`../../cars/${item}`);
        return carNameGen({ currentCar, removePrizeTag: true });
    },
    "dealership": item => {
        let currentCar = require(`../../cars/${item.carID}`);
        return carNameGen({ currentCar, removePrizeTag: true });
    },
    "pack": item => {
        let details = require(`../../packs/${item}`);
        return details["packName"];
    },
    "track": item => {
        let details = require(`../../tracks/${item}`);
        return details["trackName"];
    },
    "id": item => typeof item === "string" ? item.replace(".json", "") : item.id,
    "event": item => item.name
};

async function search(message, query, searchList, type, currentMessage) {
    const searchResults = searchList.filter(s => {
        let test = listGen[type](s).replace(/[()"]/g, "").toLocaleLowerCase("en").split(" ");
        return query.every(part => test.includes(part.replace(/[()"]/g, "")));
    });
    return processResults(message, searchResults, () => {
        const options = [];
        for (let i = 0; i < searchResults.length; i++) {
            let isPrize = type === "car" ? require(`../../cars/${searchResults[i]}`) : {}
            options.push({
                label: listGen[type](searchResults[i]),
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
            return throwError(query.join(" "), searchList.map(i => listGen[type](i).toLowerCase()));
        });
}

module.exports = search;