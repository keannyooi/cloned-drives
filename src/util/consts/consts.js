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

const adminRoleID = "711790752853655563";
const eventMakerRoleID = "917685033995751435";
const testerRoleID = "915846116656959538";

const bugReportsChannelID = "750304569422250064";
const currentEventsChannelID = "955467202138620014";
const currentOffersChannelID = "969786587191849011";
const dealershipChannelID = "995938671209500702";

const moneyEmojiID = "726017235826770021";
const fuseEmojiID = "726018658635218955";
const trophyEmojiID = "775636479145148418";
const glofEmojiID = "967031943222923335";
const packEmojiID = "966972757415972884";
const blackMarketEmojiID = "831967206446465064";
const legendaryEmojiID = "857512942471479337";
const epicEmojiID = "726025468230238268";
const ultraRareEmojiID = "726025431937187850";
const superRareEmojiID = "857513197937623042";
const rareEmojiID = "726025302656024586";
const uncommonEmojiID = "726025273421725756";
const commonEmojiID = "726020544264273928";

const failedToLoadImageLink = "https://media.discordapp.net/attachments/716917404868935691/801370166826238002/unknown.png";

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
    legendaryEmojiID,
    epicEmojiID,
    ultraRareEmojiID,
    superRareEmojiID,
    rareEmojiID,
    uncommonEmojiID,
    commonEmojiID,
    failedToLoadImageLink
};