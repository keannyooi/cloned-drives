"use strict";

const carSave = {
    "000": 1,
    "333": 0,
    "666": 0,
    "996": 0,
    "969": 0,
    "699": 0,
};
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

const defaultPageLimit = 10;

const driveHierarchy = ["4WD", "FWD", "RWD"];
const gcHierarchy = ["High", "Medium", "Low"];
const weatherVars = {
    "Sunny Asphalt": {
        drivePen: 0,
        absPen: 0,
        tcsPen: 0,
        tyrePen: {
            "Standard": 0,
            "Performance": 0,
            "All-Surface": 0,
            "Off-Road": 0,
            "Slick": 0
        }
    },
    "Rainy Asphalt": {
        drivePen: 4,
        absPen: 1,
        tcsPen: 1,
        tyrePen: {
            "Standard": 0,
            "Performance": 11,
            "All-Surface": 5,
            "Off-Road": 25,
            "Slick": 50
        }
    },
    "Sunny Gravel": {
        drivePen: 2,
        absPen: 0,
        tcsPen: 0,
        tyrePen: {
            "Standard": 0,
            "Performance": 17.5,
            "All-Surface": -4,
            "Off-Road": -2.5,
            "Slick": 40
        }
    },
    "Rainy Gravel": {
        drivePen: 5.5,
        absPen: 1.25,
        tcsPen: 1.25,
        tyrePen: {
            "Standard": 0,
            "Performance": 17.5,
            "All-Surface": -5.5,
            "Off-Road": -4.5,
            "Slick": 42.5
        }
    },
    "Sunny Dirt": {
        drivePen: 7,
        absPen: 1.75,
        tcsPen: 1.75,
        tyrePen: {
            "Standard": 0,
            "Performance": 20,
            "All-Surface": -25,
            "Off-Road": -33,
            "Slick": 65
        }
    },
    "Rainy Dirt": {
        drivePen: 8.5,
        absPen: 2.5,
        tcsPen: 2.5,
        tyrePen: {
            "Standard": 0,
            "Performance": 25,
            "All-Surface": -40,
            "Off-Road": -60,
            "Slick": 130
        }
    },
    "Sunny Snow": {
        drivePen: 12,
        absPen: 3,
        tcsPen: 3,
        tyrePen: {
            "Standard": 0,
            "Performance": 75,
            "All-Surface": -20,
            "Off-Road": -45,
            "Slick": 425
        }
    },
    "Sunny Ice": {
        drivePen: 17,
        absPen: 4.25,
        tcsPen: 4.25,
        tyrePen: {
            "Standard": 0,
            "Performance": 125,
            "All-Surface": -65,
            "Off-Road": -100,
            "Slick": 875
        }
    }
};

module.exports = {
    carSave,
    starterGarage,
    defaultWaitTime,
    defaultQTETime,
    defaultChoiceTime,
    defaultPageLimit,
    weatherVars,
    driveHierarchy,
    gcHierarchy
};