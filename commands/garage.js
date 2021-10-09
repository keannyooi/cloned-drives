"use strict";

const { ErrorMessage, InfoMessage } = require("./sharedfiles/classes.js");
const { listInit, carNameGen, rarityCheck } = require("./sharedfiles/primary.js");
const { searchUser, sortCars, filterCheck, listUpdate } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "garage",
    aliases: ["g"],
    usage: "(all optional) <username goes here> | <page number>",
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
                        loop(message.mentions.users.first(), page, sort);
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
                            await loop(result.user, page, sort, currentMessage);
                        });
                }
            }
            else {
                if (args[args.length - 2] === "-s" && args[args.length - 1]) {
                    sort = args[args.length - 1].toLowerCase();
                }
                loop(user, parseInt(args[0]), sort);
            }
        }

        async function loop(user, page, sort, currentMessage) {
            const trophyEmoji = bot.emojis.cache.get("775636479145148418");
            const playerData = await profileModel.findOne({ userID: message.author.id });
            let garage = playerData.garage;
            if (Object.keys(playerData.filter).length > 0 && playerData.settings.filtergarage === true) {
                garage.filter(car => {
                    console.log(car);
                    return filterCheck(car, playerData.filter);
                });
            }

            switch (sort) {
                case "rq":
                case "handling":
                case "weight":
                case "mra":
                case "ola":
                case "mostowned":
                    break;
                case "topspeed":
                    sort = "topSpeed";
                    break;
                case "accel":
                    sort = "0to60";
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, sorting criteria not found.",
                        desc: `Here is a list of sorting criterias. 
                        \`-s topspeed\` - Sort by top speed. 
                        \`-s accel\` - Sort by acceleration. 
                        \`-s handling\` - Sort by handling. 
                        \`-s weight\` - Sort by weight. 
                        \`-s mra\` - Sort by mid-range acceleraion. 
                        \`-s ola\` - Sort by off-the-line acceleration.
                        \`-s mostowned\` - Sort by how many copies of the car owned.`,
                        author: message.author
                    }).displayClosest(sort);
                    return errorMessage.sendMessage({ currentMessage });
            }

            const totalPages = Math.ceil(garage.length / 10);
            garage = sortCars(garage, sort, playerData.settings.sortorder);
            if (page < 1 || totalPages < page) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `${user.username}'s garage ends at page ${totalPages}.`,
                    author: message.author
                }).displayClosest(page);
                return errorMessage.sendMessage({ currentMessage });
            }

            let { startsWith, endsWith, reactionIndex } = listInit(garage, page);
            let listMessage = listDisplay(startsWith, endsWith, totalPages);
            listUpdate(listMessage, listDisplay, reactionIndex, playerData.settings.buttonstyle, currentMessage);

            function listDisplay(startsWith, endsWith, totalPages) {
                let garageList = "", amountList = "", valueList = "";
                for (let i = startsWith; i < endsWith; i++) {
                    garageList += `**${i - ((page - 1) * 10) + 1}.** `;
                    amountList += `**${i - ((page - 1) * 10) + 1}.** `;
                    valueList += `**${i - ((page - 1) * 10) + 1}.** `;

                    let car = garage[i];
                    let currentCar = require(`./cars/${car.carID}.json`);
                    let rarity = rarityCheck(currentCar, playerData.settings.shortenedlists);
                    garageList += carNameGen(currentCar, rarity);

                    for (let [upgrade, value] of Object.entries(car.upgrades)) {
                        if (value > 0) {
                            amountList += `${upgrade} x${value}, `;
                        }
                    }
                    if (currentCar["isPrize"]) {
                        garage += playerData.settings.shortenedlists ? ` 🏆` : ` ${trophyEmoji}`;
                    }

                    garageList += "\n";
                    amountList = amountList.slice(0, -2);
                    amountList += "\n";
                    if (sort === "mostowned") {
                        valueList += `\`${Object.values(car.upgrades).reduce((total, i) => total += i)}\`\n`;
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
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }

                let infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `${user.username}'s Garage`,
                    desc: `Current Sorting Criteria: \`${sort}\`, Filter Activated: \`${(playerData.filter !== undefined && playerData.settings.filtergarage === true)}\``,
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