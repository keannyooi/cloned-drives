"use strict";

const { ErrorMessage } = require("../classes/classes.js");
const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js")
const processResults = require("./corefiles/processResults.js");

async function searchGarage(args) {
    let { message, query, garage, amount, searchByID, restrictedMode, currentMessage } = args;
    let matchList = [];
    const searchResults = garage.filter(car => {
        let matchFound, isSufficient;
        if (searchByID) {
            matchFound = car.carID === query[0];
        }
        else {
            let currentCar = require(`../../cars/${car.carID}.json`);
            let name = carNameGen({ currentCar, removePrizeTag: true }).replace(/[()"]/g, "").toLowerCase().split(" ");
            matchFound = query.every(part => name.includes(part.replace(/[()"]/g, "")));
            if (matchFound) {
                matchList.push(car);
            }
        }
        if (restrictedMode) {
            isSufficient = (car.upgrades["000"] + car.upgrades["333"] + car.upgrades["666"]) >= amount;
        }
        else {
            isSufficient = calcTotal(car) >= amount;
        }

        return matchFound && isSufficient;
    });

    return processResults(message, searchResults, () => {
        let list = "", i = 1;
        searchResults.map(car => {
            let currentCar = require(`../../cars/${car.carID}.json`);
            list += `${i} - ${carNameGen({ currentCar })}\n`;
            i++;
        });
        return list;
    }, null, currentMessage)
        .catch(throwError => {
            console.log(throwError);
            if (matchList.length > 0) {
                let list = "";
                for (let i = 0; i < matchList.length; i++) {
                    let currentCar = require(`../../cars/${matchList[i].carID}.json`), newLine = "";
                    newLine = carNameGen({ currentCar, rarity: true });
                    if (!currentCar["isPrize"]) {
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
                        let currentCar = require(`../../cars/${car.carID}.json`);
                        return carNameGen({ currentCar, removePrizeTag: true }).toLowerCase();
                    });
                }
                return throwError(query.join(" "), list);
            }
        });
}

module.exports = searchGarage;