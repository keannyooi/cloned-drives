"use strict";

const carNameGen = require("./carNameGen.js");
const processResults = require("./corefiles/processResults.js");

async function search(message, query, searchList, type, currentMessage) {
    const searchResults = searchList.filter(s => {
        let test = listGen(s, type).toLowerCase().replace(/[()"]/g, "").split(" ");
        return query.every(part => test.includes(part.replace(/[()"]/g, "")));
    });
    return processResults(message, searchResults, () => {
        let list = "";
        for (let i = 1; i <= searchResults.length; i++) {
            let hmm = listGen(searchResults[i - 1], type);
            list += `${i} - ${hmm}\n`;
        }
        return list;
    }, type, currentMessage)
        .catch(throwError => {
            return throwError(query.join(" "), searchList.map(i => listGen(i, type).toLowerCase()));
        });

    function listGen(item, type) {
        switch (type) {
            case "car":
                let currentCar = require(`../../cars/${item}`);
                return carNameGen({ currentCar });
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