"use strict";

const carSave = {
    "000": 1,
    "333": 0,
    "666": 0,
    "996": 0,
    "969": 0,
    "699": 0,
}
const starterGarage = [
    { carID: "c00552", upgrades: carSave },
    { carID: "c01032", upgrades: carSave },
    { carID: "c01134", upgrades: carSave },
    { carID: "c00943", upgrades: carSave },
    { carID: "c00335", upgrades: carSave }
];

const defaultWaitTime = 60000;
const defaultChoiceTime = 10000;
const defaultQTETime = 5000;

const pageLimit = 10;

module.exports = {
    carSave,
    starterGarage,
    defaultWaitTime,
    defaultQTETime,
    defaultChoiceTime,
    pageLimit
}