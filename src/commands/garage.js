"use strict";

const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
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

module.exports = {
    name: "garage",
    aliases: ["g"],
    usage: ["[user]", "[user] [page number]", "[user] -s [sorting criteria]", "[user] [page number] -s [sorting criteria]"],
    args: 0,
    category: "Configuration",
    description: "Shows your (or other people's) garage.",
    async execute(message, args) {
        let user = message.author, page = 1, sort = "rq";
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
            const { garage } = await profileModel.findOne({ userID: user.id });
            const { settings, filter } = await profileModel.findOne({ userID: message.author.id });
            let filteredGarage = settings.disablegaragefilter ? garage : garage.filter(car => filterCheck({ car, filter, applyOrLogic: settings.filterlogic === "or" ? true : false }));

            sort = sortCheck(message, sort, currentMessage);
            if (typeof sort !== "string") return;

            const totalPages = Math.ceil(filteredGarage.length / (settings.listamount || defaultPageLimit));
            if (page < 1 || totalPages < page) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `${user.username}'s garage ends at page ${totalPages}.`,
                    author: message.author
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
                    let currentCar = require(`../cars/${car.carID}.json`);
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
                    else if (sort !== "rq") {
                        let values = "";
                        if (sort === "topSpeed" || sort === "0to60" || sort === "handling") {
                            for (let [upgrade, value] of Object.entries(car.upgrades)) {
                                let listValue = currentCar[sort];
                                if (upgrade !== "000") {
                                    listValue = currentCar[`${upgrade}${sort.charAt(0).toUpperCase() + sort.slice(1)}`];
                                }
                                if (!values.includes(listValue) && value > 0) {
                                    values += `${listValue}, `;
                                }
                            }
                            values = values.slice(0, -2);
                        }
                        else {
                            values = currentCar[sort];
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
                    desc: `Current Sorting Criteria: \`${sort}\`, Filter: \`${reqDisplay(filter)}\``,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                    fields: [
                        { name: "Car", value: garageList, inline: true },
                        { name: "Amount", value: amountList, inline: true }
                    ],
                    footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                });
                if (sort !== "rq") {
                    infoMessage.editEmbed({ fields: [{ name: "Value", value: valueList, inline: true }] });
                }
                return infoMessage;
            }
        }
    }
};