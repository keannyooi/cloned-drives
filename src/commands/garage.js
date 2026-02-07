"use strict";

const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const { calcTune } = require("../util/functions/calcTune.js");
const searchUser = require("../util/functions/searchUser.js");
const carNameGen = require("../util/functions/carNameGen.js");
const calcTotal = require("../util/functions/calcTotal.js");
const sortCheck = require("../util/functions/sortCheck.js");
const sortCars = require("../util/functions/sortCars.js");
const listUpdate = require("../util/functions/listUpdate.js");
const filterCheck = require("../util/functions/filterCheck.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

// Map sort keys to calcTune result keys
const tunableStats = {
    "topSpeed": "topSpeed",
    "0to60": "accel",
    "handling": "handling",
    "weight": "weight",
    "mra": "mra",
    "ola": "ola"
};

module.exports = {
    name: "garage",
    aliases: ["g","cathouse"],
    usage: ["[user]", "[user] [page number]", "[user] -s [sorting criteria]", "[user] [page number] -s [sorting criteria]"],
    args: 0,
    category: "Configuration",
    description: "Shows your (or other people's) garage.",
    async execute(message, args) {
        let user = message.author, page = 1, sort = "cr";
        if (args[args.length - 2] === "-s" && args[args.length - 1]) {
            sort = args[args.length - 1].toLowerCase();
            args = args.slice(0, args.length - 2);
        }
        if (args[0] && isNaN(args[0])) {
            let userName;
            if (isNaN(args[args.length - 1])) {
                userName = args.join(" ").toLowerCase();
            }
            else {
                userName = args.slice(0, args.length - 1).join(" ").toLowerCase();
                page = parseInt(args[args.length - 1]);
            }

            if (message.mentions.users.first()) {
                if (!message.mentions.users.first().bot) {
                    try {
                        await loop(message.mentions.users.first(), page, sort);
                    }
                    catch (error) {
                        throw error;
                    }
                }
                else {
                    return botUserError(message);
                }
            }
            else {
                await new Promise(resolve => resolve(searchUser(message, userName)))
                    .then(async response => {
                        if (!Array.isArray(response)) return;
                        let [result, currentMessage] = response;
                        await loop(result.user, page, sort, currentMessage);
                    })
                    .catch(error => {
                        throw error;
                    });
            }
        }
        else {
            if (args[0]) {
                page = parseInt(args[0]);
            }
            try {
                await loop(user, page, sort);
            }
            catch (error) {
                throw error;
            }
        }

        async function loop(user, page, sort, currentMessage) {
            // H-06: Parallel fetch when viewing someone else's garage, single fetch when viewing own
            let garage, settings, filter;
            if (user.id === message.author.id) {
                const profile = await profileModel.findOne({ userID: user.id });
                garage = profile.garage;
                settings = profile.settings;
                filter = profile.filter;
            } else {
                const [targetProfile, authorProfile] = await Promise.all([
                    profileModel.findOne({ userID: user.id }),
                    profileModel.findOne({ userID: message.author.id })
                ]);
                garage = targetProfile.garage;
                settings = authorProfile.settings;
                filter = authorProfile.filter;
            }
            let filteredGarage = settings.disablegaragefilter ? garage : garage.filter(car => filterCheck({
                car,
                filter,
                applyOrLogic: settings.filterlogic === "or" ? true : false,
            }));

            sort = sortCheck(message, sort, currentMessage);
            if (typeof sort !== "string") return;

            const totalPages = Math.ceil(filteredGarage.length / (settings.listamount || defaultPageLimit));
            if (page < 1 || totalPages < page) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `${user.username}'s garage ends at page ${totalPages}.`,
                    author: message.author,
                    fields: [{ name: "Current Filter", value: `\`${reqDisplay(filter)}\`` }]
                }).displayClosest(page);
                return errorMessage.sendMessage({ currentMessage });
            }
            filteredGarage = sortCars(filteredGarage, sort, settings.sortorder);

            try {
                await listUpdate(filteredGarage, page, totalPages, listDisplay, settings, currentMessage);
            }
            catch (error) {
                throw error;
            }

            function listDisplay(section, page, totalPages) {
                let garageList = "", amountList = "", valueList = "";
                for (let i = 0; i < section.length; i++) {
                    garageList += `**${i + 1}.** `;
                    amountList += `**${i + 1}.** `;
                    valueList += `**${i + 1}.** `;

                    let car = section[i];
                    let currentCar = getCar(car.carID);
                    garageList += carNameGen({ currentCar, rarity: true });

                    for (let [upgrade, value] of Object.entries(car.upgrades)) {
                        if (value > 0) {
                            amountList += `${upgrade} x${value}, `;
                        }
                    }

                    garageList += "\n";
                    amountList = amountList.slice(0, -2);
                    amountList += "\n";
                    if (sort === "duplicates") {
                        valueList += `\`${calcTotal(car)}\`\n`;
                    }
                    else if (sort !== "cr") {
                        let values = "";
                        // Get base reference for BM cars
                        let bmReference = currentCar;
                        if (currentCar["reference"]) {
                            bmReference = getCar(currentCar["reference"]);
                        }
                        
                        // Check if this is a tunable stat
                        if (tunableStats[sort]) {
                            const tuneKey = tunableStats[sort];
                            for (let [upgrade, value] of Object.entries(car.upgrades)) {
                                if (value > 0) {
                                    const tunedStats = calcTune(bmReference, upgrade);
                                    const listValue = tunedStats[tuneKey];
                                    if (!values.includes(listValue.toString())) {
                                        values += `${listValue}, `;
                                    }
                                }
                            }
                            values = values.slice(0, -2);
                        }
                        else {
                            // Non-tunable stat (driveType, gc, etc.)
                            values = bmReference[sort];
                        }
                        valueList += `\`${values}\`\n`;
                    }
                }
                if (garageList.length > 1024) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "This page has too many characters and thus cannot be shown due to Discord's embed limitations.",
                        desc: "Try turning on `Shortened Lists` in `cd-settings`.",
                        author: message.author,
                        fields: [{ name: `Amount of Characters in Page ${page}`, value: `\`${garageList.length}\` (> 1024)` }]
                    });
                    return errorMessage;
                }

                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `${user.username}'s Garage`,
                    desc: `Current Sorting Criteria: \`${sort}\`, Filter: \`${reqDisplay(filter, settings.filterlogic)}\``,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                    fields: [
                        { name: "Car", value: garageList, inline: true },
                        { name: "Amount", value: amountList, inline: true }
                    ],
                    footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                });
                if (sort !== "cr") {
                    infoMessage.editEmbed({ fields: [{ name: "Value", value: valueList, inline: true }] });
                }
                return infoMessage;
            }
        }
    }
};
