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
const cardPlacement = [
    { x: 7, y: 3 },
    { x: 178, y: 3 },
    { x: 349, y: 3 },
    { x: 520, y: 3 },
    { x: 7, y: 143 },
    { x: 178, y: 143 },
    { x: 349, y: 143 },
    { x: 520, y: 143 }
];

const defaultWaitTime = 60000;
const defaultChoiceTime = 10000;
const defaultQTETime = 5000;

const defaultPageLimit = 10;

const driveHierarchy = ["AWD", "4WD", "FWD", "RWD"];
const gcHierarchy = ["High", "Medium", "Low"];
const weatherVars = {
    "Sunny Drag": {
        drivePen: 0,
        absPen: 0,
        tcsPen: 1,
        tyrePen: {
            "Standard": 0,
            "Performance": 0,
            "All-Surface": 0,
            "Off-Road": 0,
            "Slick": 0,
            "Drag": -11.5
        }
    },
	    "Rainy Drag": {
        drivePen: 2,
        absPen: 0,
        tcsPen: 1,
        tyrePen: {
            "Standard": 0,
            "Performance": 0,
            "All-Surface": 0,
            "Off-Road": 0,
            "Slick": 0,
            "Drag": 250
        }
    },
    "Sunny Track": {
        drivePen: 0,
        absPen: 0,
        tcsPen: 0,
        tyrePen: {
            "Standard": 0,
            "Performance": 0,
            "All-Surface": 0,
            "Off-Road": 0,
            "Slick": -16,
            "Drag": 10
        }
    },
    "Rainy Track": {
        drivePen: 4,
        absPen: 1,
        tcsPen: 1,
        tyrePen: {
            "Standard": 0,
            "Performance": 11,
            "All-Surface": 5,
            "Off-Road": 50,
            "Slick": 40,
            "Drag": 250
        }
    },
    "Sunny Asphalt": {
        drivePen: 0,
        absPen: 0,
        tcsPen: 0,
        tyrePen: {
            "Standard": 0,
            "Performance": 0,
            "All-Surface": 0,
            "Off-Road": 0,
            "Slick": 0,
            "Drag": 10
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
            "Off-Road": 40,
            "Slick": 50,
            "Drag": 250
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
            "Off-Road": -4.5,
            "Slick": 40,
            "Drag": 500
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
            "Off-Road": -7.5,
            "Slick": 42.5,
            "Drag": 500
        }
    },
    "Sunny Sand": {
        drivePen: 5.5,
        absPen: -1.25,
        tcsPen: -1.25,
        tyrePen: {
            "Standard": 0,
            "Performance": 50.5,
            "All-Surface": -15.5,
            "Off-Road": -20.5,
            "Slick": 80.5,
            "Drag": 500
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
            "Slick": 65,
            "Drag": 500
        }
    },
    "Rainy Dirt": {
        drivePen: 8.5,
        absPen: 2.5,
        tcsPen: 2.5,
        tyrePen: {
            "Standard": 0,
            "Performance": 30,
            "All-Surface": -40,
            "Off-Road": -60,
            "Slick": 130,
            "Drag": 500
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
            "Slick": 425,
            "Drag": 700
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
            "Slick": 875,
            "Drag": 900
        }
    }
};

const adminRoleID = "711790752853655563";
const eventMakerRoleID = "917685033995751435";
const testerRoleID = "915846116656959538";
const sandboxRoleID = "1102267061796880384";

const bugReportsChannelID = "750304569422250064";
const currentEventsChannelID = "955467202138620014";
const currentOffersChannelID = "969786587191849011";
const dealershipChannelID = "995938671209500702";

const moneyEmojiID = "1162881967738601502";
const fuseEmojiID = "1162882165109964892";
const trophyEmojiID = "1162882347499262094";
const glofEmojiID = "967031943222923335";
const packEmojiID = "966972920687652885";
const blackMarketEmojiID = "1162936880048898059";
const bossEmojiID = "1162881924453371935";
const mysticEmojiID = "1162882081005764668";
const legendaryEmojiID = "1162882065017081897";
const epicEmojiID = "1162882032347644025";
const exoticEmojiID = "1162882048512491631";
const standardEmojiID = "1162882111448039434";
const rareEmojiID = "1162882097657155614";
const uncommonEmojiID = "1162882129273815140";
const commonEmojiID = "1162882014668668958";

const failedToLoadImageLink = "https://file.garden/ZSrBMiDRyR84aPJp/unknown.png";

module.exports = {
    carSave,
    starterGarage,
    cardPlacement,
    defaultWaitTime,
    defaultQTETime,
    defaultChoiceTime,
    defaultPageLimit,
    weatherVars,
    driveHierarchy,
    gcHierarchy,
    adminRoleID,
    eventMakerRoleID,
    testerRoleID,
	sandboxRoleID,
    moneyEmojiID,
    bugReportsChannelID,
    currentEventsChannelID,
    currentOffersChannelID,
    dealershipChannelID,
    fuseEmojiID,
    trophyEmojiID,
    glofEmojiID,
    packEmojiID,
    blackMarketEmojiID,
	bossEmojiID,
    mysticEmojiID,
    legendaryEmojiID,
    epicEmojiID,
    exoticEmojiID,
    standardEmojiID,
    rareEmojiID,
    uncommonEmojiID,
    commonEmojiID,
    failedToLoadImageLink
};
