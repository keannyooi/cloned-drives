"use strict";

const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js");

function filterCheck(car, filter, garage) {
    let passed = true, carObject = garage ? {
        carID: car,
        upgrades: garage.find(c => car.includes(c.carID))?.upgrades ?? {
            "000": 0,
            "333": 0,
            "666": 0,
            "996": 0,
            "969": 0,
            "699": 0,
        }
    } : car;
    let currentCar = require(`../../cars/${carObject.carID}`);

    for (const [key, value] of Object.entries(filter)) {
        switch (typeof value) {
            case "object":
                if (Array.isArray(value)) {
                    let checkArray = currentCar[key];
                    if (!Array.isArray(checkArray)) {
                        checkArray = [checkArray];
                    }
                    checkArray = checkArray.map(tag => tag.toLowerCase());

                    if (value.every(tag => checkArray.findIndex(tag2 => tag === tag2) > -1) === false) {
                        passed = false;
                    }
                }
                else {
                    if (currentCar[key] < value.start || currentCar[key] > value.end) {
                        passed = false;
                    }
                }
                break;
            case "string":
                if (key === "search") {
                    if (!carNameGen({ currentCar }).toLowerCase().includes(value)) {
                        passed = false;
                    }
                }
                else if (Array.isArray(currentCar[key])) {
                    if (currentCar[key].findIndex(element => element.toLowerCase() === value) === -1) {
                        passed = false;
                    }
                } 
                else {
                    if (currentCar[key].toLowerCase() !== value) {
                        passed = false;
                    }
                }
                break;
            case "boolean":
                switch (key) {
                    case "isPrize":
                        if (currentCar[key] !== value) {
                            passed = false;
                        }
                        break;
                    case "isStock":
                        if ((carObject.upgrades["000"] > 0) !== value) {
                            passed = false;
                        }
                        break;
                    case "isMaxed":
                        if ((carObject.upgrades["996"] + carObject.upgrades["969"] + carObject.upgrades["699"] > 0) !== value) {
                            passed = false;
                        }
                        break;
                    case "isOwned":
                        if ((calcTotal(carObject) > 0) !== value) {
                            passed = false;
                        }
                        break;
                    default:
                        break;
                }
                break;
            default:
                break;
        }
    }
    return passed;
}

module.exports = filterCheck;