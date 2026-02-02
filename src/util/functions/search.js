"use strict";

const { StringSelectMenuBuilder } = require("discord.js");
const { trophyEmojiID } = require("../consts/consts.js");
const { getCar, getTrack, getPack } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const processResults = require("./corefiles/processResults.js");

const listGen = {
    "car": item => {
        let currentCar = getCar(item);
        return currentCar["reference"] ? "jowhdgeuwrljoehfujbek" : carNameGen({ currentCar, removePrizeTag: true }); //this may be the dirtiest hack of all time but eh, it works
    },
    "carWithBM": item => {
        let currentCar = getCar(item);
        return carNameGen({ currentCar, removePrizeTag: true });
    },
    "dealership": item => {
        let currentCar = getCar(item.carID);
        return carNameGen({ currentCar, removePrizeTag: true });
    },
    "pack": item => {
        let details = getPack(item);
        return details["packName"];
    },
    "track": item => {
        let details = getTrack(item);
        return details["trackName"];
    },
    "id": item => typeof item === "string" ? item.replace(".json", "") : item.id,
    "event": item => item.name,
	"championships": item => item.name,
    "offer": item => item.name,
    "calendar": item => item.name
};

async function search(message, query, searchList, type, currentMessage) {
    // Check if listGen[type] is a function
    if (typeof listGen[type] !== 'function') {
        throw new Error(`Invalid search type: ${type}`);
    }

    const searchResults = searchList.filter(s => {
        //console.log(listGen[type](s)); // Add this line to output the value before listGen function call
        let test = listGen[type](s).replace(/[()"]/g, "").toLocaleLowerCase("en").split(" ");
		return query.every(part => test.includes(part.replace(/[()"']/g, '')));
    });
    
    return processResults(message, searchResults, () => {
        const options = [];
        for (let i = 0; i < searchResults.length; i++) {
            let isPrize = (type === "car" || type === "carWithBM") ? getCar(searchResults[i]) : {};
            options.push({
                label: listGen[type](searchResults[i]),
                value: `${i + 1}`
            });
            if (isPrize["isPrize"] === true) {
                options[i].emoji = `<trophies:${trophyEmojiID}>`;
            }
        }

        let list = new StringSelectMenuBuilder()
            .setCustomId("search")
            .setPlaceholder("Select something...")
            .addOptions(...options);
        return list;
    }, type, currentMessage)
    .catch(throwError => {
        return throwError(query.join(" "), searchList.map(i => listGen[type](i).toLowerCase()));
    });
}

module.exports = search;
