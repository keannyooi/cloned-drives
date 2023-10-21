"use strict";

const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js");

function filterCheck(args) {
    let { car, filter, garage, applyOrLogic } = args;
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
    let currentCar = require(`../../cars/${carObject.carID}`), bmReference = currentCar;
    if (currentCar["reference"]) {
        bmReference = require(`../../cars/${currentCar["reference"]}`);
    }

    for (const [key, value] of Object.entries(filter)) {
        switch (typeof value) {
            case "object":
                if (key === "collection") {
                    if (!currentCar["reference"]) {
                        passed = false;
                    }
                    else {
                        let checkArray = currentCar[key].map(tag => tag.toLowerCase());
                        if (applyOrLogic) {
                            if (value.some(tag => checkArray.findIndex(tag2 => tag === tag2) > -1) === false) {
                                passed = false;
                            }
                        }
                        else {
                            if (value.every(tag => checkArray.findIndex(tag2 => tag === tag2) > -1) === false) {
                                passed = false;
                            }
                        }
                    }
                }
                else if (Array.isArray(value)) {
                    let checkArray = bmReference[key];
                    if (!Array.isArray(checkArray)) {
                        checkArray = [checkArray];
                    }
                    checkArray = checkArray.map(tag => tag ? tag.toLowerCase() : ""); // Check if tag is defined

                    if (applyOrLogic) {
                        if (value.some(tag => checkArray.findIndex(tag2 => tag === tag2) > -1) === false) {
                            passed = false;
                        }
                    }
                    else {
                        if (value.every(tag => checkArray.findIndex(tag2 => tag === tag2) > -1) === false) {
                            passed = false;
                        }
                    }
                }
                else if (key === "modelYear") {
                    if (value.start && value.end) {
                        // Implement "or" logic for modelYear range
                        if (!(bmReference[key] >= value.start && bmReference[key] <= value.end)) {
                            passed = false;
                        }
                    } else {
                        // Handle invalid filter value here
                    }
                }
                break;
            case "string":
                if (key === "search") {
                    if (!carNameGen({ currentCar: bmReference }).toLowerCase().includes(value.toLowerCase())) {
                        passed = false;
                    }
                }
                else if (Array.isArray(bmReference[key])) {
                    if (bmReference[key].findIndex(element => typeof element === 'string' && element.toLowerCase() === value.toLowerCase()) === -1) {
                        passed = false;
                    }
                }
                else {
                    if (typeof bmReference[key] === 'string' && typeof value === 'string' &&
                        bmReference[key].toLowerCase() !== value.toLowerCase()) {
                        passed = false;
                    }
                }
                break;
            case "boolean":
                switch (key) {
                    case "isPrize":
                    case "abs":
                    case "tcs":
                        if (bmReference[key] !== value) {
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
                    case "isBM":
                        if ((currentCar["reference"] !== undefined) !== value) {
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
