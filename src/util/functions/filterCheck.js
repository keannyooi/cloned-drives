"use strict";

const { getCar } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js");
const { modifiedBase, isBMCar, isPrizeLike, hasType } = require("./cardType.js");

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
    let currentCar = getCar(carObject.carID), bmReference = modifiedBase(currentCar);

    for (const [key, value] of Object.entries(filter)) {
        switch (typeof value) {
            case "object":
                if (key === "cardType") {
                    // A card has exactly one base type, so multi-value cardType
                    // filters are always OR ("abm or ibm") regardless of filterlogic.
                    // Checked on the card ITSELF, never its reference (an ABM card's
                    // base car is usually Normal).
                    if (!value.some(t => hasType(currentCar, t))) {
                        passed = false;
                    }
                }
                else if (key === "collection") {
                    if (!isBMCar(currentCar)) {
                        passed = false;
                    }
                    else {
                        let checkArray = currentCar[key].map(tag => tag.toLowerCase());
                        if (applyOrLogic) {
                            if (value.some(tag => checkArray.findIndex(tag2 => tag.toLowerCase() === tag2) > -1) === false) {
                                passed = false;
                            }
                        }
                        else {
                            if (value.every(tag => checkArray.findIndex(tag2 => tag.toLowerCase() === tag2) > -1) === false) {
                                passed = false;
                            }
                        }
                    }
                }
                else if (Array.isArray(value)) {
                    let checkArray = (key === "hiddenTag" ? currentCar[key] : bmReference[key]);
                    if (!Array.isArray(checkArray)) {
                        checkArray = [checkArray];
                    }
                    checkArray = checkArray.map(tag => tag ? tag.toLowerCase() : ""); // Check if tag is defined

                    if (applyOrLogic) {
                        if (value.some(tag => checkArray.findIndex(tag2 => tag.toLowerCase() === tag2) > -1) === false) {
                            passed = false;
                        }
                    }
                    else {
                        if (value.every(tag => checkArray.findIndex(tag2 => tag.toLowerCase() === tag2) > -1) === false) {
                            passed = false;
                        }
                    }
                }
                else if (key === "modelYear" || key === "seatCount" || key === "cr") {
        if (value.start !== undefined && value.start !== null && value.end !== undefined && value.end !== null) {
            // Implement "or" logic for modelYear or rq range
            if (key === "modelYear") {
                if (!(bmReference[key] >= value.start && bmReference[key] <= value.end)) {
                    passed = false;
                }
            }
if (key === "seatCount") {
    if (!(bmReference[key] >= value.start && bmReference[key] <= value.end)) {
        passed = false;
    }
}
            if (key === "cr") {
                if (!(bmReference[key] >= value.start && bmReference[key] <= value.end)) {
                    passed = false;
                }
            }
        } else {
            // Handle invalid filter value here
            throw new Error("Invalid filter for " + key + ". Please provide valid start and end values.");
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
                        if (isPrizeLike(currentCar) !== value) {
                            passed = false;
                        }
                        break;
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
                        if (isBMCar(currentCar) !== value) {
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
