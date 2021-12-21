"use strict";

const { ErrorMessage, InfoMessage } = require("./sharedfiles/classes.js");
const { defaultPageLimit } = require("./sharedfiles/consts.js");
const { carNameGen, rarityCheck, calcTotal, sortCheck } = require("./sharedfiles/primary.js");
const { searchUser, sortCars, filterCheck, listUpdate } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "garage",
    aliases: ["g"],
    usage: ["[username] | [page number] | -s [sorting criteria]"],
    args: 0,
    category: "Configuration",
    description: "Shows your (or other people's) garage.",
    async execute(message, args) {
        let user = message.author;
        let sort = "rq";

        if (!args.length || (args[0] === "-s" && args[1])) {
            if (args[0] === "-s" && args[1]) {
                sort = args[1].toLowerCase();
            }
            loop(user, 1, sort);
        }
        else {
            if (isNaN(args[0])) {
                let page = 1;
                let userName;
                if (isNaN(args[args.length - 1])) {
                    userName = args.map(i => i.toLowerCase());
                }
                else {
                    userName = args.slice(0, args.length - 1).map(i => i.toLowerCase());
                    page = parseInt(args[args.length - 1]);
                }
                if (args[args.length - 2] === "-s" && args[args.length - 1]) {
                    sort = args[args.length - 1].toLowerCase();

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
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, user requested is a bot.",
                            desc: "Bots can't play Cloned Drives.",
                            author: message.author
                        });
                        return errorMessage.sendMessage();
                    }
                }
                else {
                    const userSaves = await profileModel.find({});
                    const availableUsers = await message.guild.members.fetch();
                    availableUsers.filter(user => userSaves.find(f => f.userID = user.id));
                    userName = args[0].toLowerCase();
                    new Promise(resolve => resolve(searchUser(message, userName, availableUsers)))
                        .then(async (hmm) => {
                            if (!Array.isArray(hmm)) return;
                            let [result, currentMessage] = hmm;
                            try {
                                await loop(result.user, page, sort, currentMessage);
                            }
                            catch (error) {
                                throw error;
                            }
                        });
                }
            }
            else {
                if (args[args.length - 2] === "-s" && args[args.length - 1]) {
                    sort = args[args.length - 1].toLowerCase();
                }
                try {
                    await loop(user, parseInt(args[0]), sort);
                }
                catch (error) {
                    throw error;
                }
            }
        }

        async function loop(user, page, sort, currentMessage) {
            const playerData = await profileModel.findOne({ userID: user.id });
            let garage = playerData.garage;
            if (!playerData.settings.disablegaragefilter) {
                garage = garage.filter(car => filterCheck(car, playerData.filter));
            }

            sort = sortCheck(message, sort, currentMessage);
            if (typeof sort !== "string") return;

            const totalPages = Math.ceil(garage.length / (playerData.settings.listamount || defaultPageLimit));
            if (page < 1 || totalPages < page) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `${user.username}'s garage ends at page ${totalPages}.`,
                    author: message.author
                }).displayClosest(page);
                return errorMessage.sendMessage({ currentMessage });
            }
            garage = sortCars(garage, sort, playerData.settings.sortorder);

            try {
                listUpdate(garage, page, totalPages, listDisplay, playerData.settings, currentMessage);
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
                    let currentCar = require(`./cars/${car.carID}.json`);
                    let rarity = rarityCheck(currentCar);
                    garageList += carNameGen({ currentCar, rarity });

                    for (let [upgrade, value] of Object.entries(car.upgrades)) {
                        if (value > 0) {
                            amountList += `${upgrade} x${value}, `;
                        }
                    }

                    garageList += "\n";
                    amountList = amountList.slice(0, -2);
                    amountList += "\n";
                    if (sort === "mostowned") {
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
                    desc: `Current Sorting Criteria: \`${sort}\`, Filter Activated: \`${Object.keys(playerData.filter).length > 0 && !playerData.settings.disablegaragefilter}\``,
                    author: message.author,
                    thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                    fields: [
                        { name: "Car", value: garageList, inline: true },
                        { name: "Amount", value: amountList, inline: true }
                    ],
                    footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                });
                if (sort !== "rq") {
                    infoMessage.addFields([{ name: "Value", value: valueList, inline: true }]);
                }
                return infoMessage;
            }
        }
    }
};