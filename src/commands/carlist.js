"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith('.json'));
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const calcTotal = require("../util/functions/calcTotal.js");
const sortCheck = require("../util/functions/sortCheck.js");
const sortCars = require("../util/functions/sortCars.js");
const listUpdate = require("../util/functions/listUpdate.js");
const filterCheck = require("../util/functions/filterCheck.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "carlist",
    aliases: ["allcars"],
    usage: ["", "[page number]", "-s [sorting criteria]", "[page number] -s [sorting criteria]"],
    args: 0,
    category: "Info",
    description: "Shows all the cars that are available in Cloned Drives in list form.",
    async execute(message, args) {
        let list = carFiles;
        let sort = "rq";
        let page;
        if (!args.length || (args[0] === "-s" && args[1])) {
            page = 1;
        }
        else if (!isNaN(args[0])) {
            page = parseInt(args[0]);
        }
        else {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested not a number.",
                desc: "One does not simply go to page `NaN` of a book.",
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }

        const { filter, garage, settings } = await profileModel.findOne({ userID: message.author.id });
        if (!settings.disablecarlistfilter) {
            list = list.filter(car => filterCheck(car.slice(0, 6), filter, garage));
        }
        const ownedCars = list.filter(function (carID) {
            return garage.some(part => carID.includes(part.carID));
        });

        if (args[args.length - 2] === "-s") {
            sort = sortCheck(message, args[args.length - 1].toLowerCase());
            if (typeof sort !== "string") return;
        }

        const totalPages = Math.ceil(list.length / (settings.listamount || defaultPageLimit));
        if (page < 1 || totalPages < page) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested invalid.",
                desc: `The car list ends at page ${totalPages}.`,
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }
        list = sortCars(list, sort, settings.sortorder, garage);

        try {
            await listUpdate(list, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let carList = "", valueList = "";
            for (let i = 0; i < section.length; i++) {
                carList += `**${i + 1}.** `;
                valueList += `**${i + 1}.** `;

                let currentCar = require(`../cars/${section[i]}`);
                let findCar = garage.find(c => c.carID === section[i].slice(0, 6));
                carList += carNameGen({ currentCar, rarity: true });
                carList += findCar ? " ✅\n" : "\n";

                if (sort === "duplicates") {
                    valueList += `\`${calcTotal(findCar)}\`\n`;
                }
                else if (sort !== "rq") {
                    valueList += `\`${currentCar[sort]}\`\n`;
                }
            }
            if (carList.length > 1024) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "This page has too many characters and thus cannot be shown due to Discord's embed limitations.",
                    desc: "Try turning on `Shortened Lists` in `cd-settings`.",
                    author: message.author,
                    fields: [{ name: `Amount of Characters in Page ${page}`, value: `\`${carList.length}\` (> 1024)` }]
                });
                return errorMessage;
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `List of All Cars in Cloned Drives (${ownedCars.length}/${list.length} Cars Owned)`,
                desc: `Current Sorting Criteria: \`${sort}\`, Filter Activated: \`${Object.keys(filter).length > 0 && !settings.disablecarlistfilter}\``,
                author: message.author,
                thumbnail: message.author.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [{ name: "Car", value: carList, inline: true }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            if (sort !== "rq") {
                infoMessage.editEmbed({ fields: [{ name: "Value", value: valueList, inline: true }] });
            }
            return infoMessage;
        }
    }
};