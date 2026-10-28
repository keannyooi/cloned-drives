"use strict";

const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const { modifiedBase } = require("../util/functions/cardType.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const calcTotal = require("../util/functions/calcTotal.js");
const sortCheck = require("../util/functions/sortCheck.js");
const sortCars = require("../util/functions/sortCars.js");
const listUpdate = require("../util/functions/listUpdate.js");
const filterCheck = require("../util/functions/filterCheck.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");

module.exports = {
    name: "carlist",
    aliases: ["allcars","catlist"],
    usage: ["", "[page number]", "-s [sorting criteria]", "[page number] -s [sorting criteria]"],
    args: 0,
    category: "Info",
    description: "Shows all the cars that are available in Cloned Drives in list form.",
    async execute(message, args) {
        const carFiles = getCarFiles();
        // A copy: sortCars sorts in place, and getCarFiles() is the shared catalogue.
        let list = carFiles.slice();
        let sort = "cr";
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

        const { filter, garage, settings } = await getProfile(message.author.id);
        // carID -> first garage row (what garage.find returned), built once instead
        // of scanning the garage for every one of ~8k cars.
        const garageMap = new Map();
        for (const row of garage) {
            if (!garageMap.has(row.carID)) garageMap.set(row.carID, row);
        }
        // An empty filter passes every car, so skip the pass entirely.
        if (!settings.disablecarlistfilter && !(filter && Object.keys(filter).length === 0)) {
            list = list.filter(car => {
                const carId = car.endsWith('.json') ? car.slice(0, -5) : car.slice(0, 6);
                return filterCheck({
                    car: carId,
                    filter,
                    garageMap,
                    applyOrLogic: settings.filterlogic === "or" ? true : false,
                });
            });
        }
        let ownedCount = 0;
        for (const carFile of list) {
            const carId = carFile.endsWith('.json') ? carFile.slice(0, -5) : carFile.slice(0, 6);
            if (garageMap.has(carId)) ownedCount++;
        }

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
                author: message.author,
                fields: [{ name: "Current Filter", value: `\`${reqDisplay(filter)}\`` }]
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

                const carFile = section[i];
                const carId = carFile.endsWith('.json') ? carFile.slice(0, -5) : carFile.slice(0, 6);
                let currentCar = getCar(carId);
                let findCar = garageMap.get(carId);
                carList += carNameGen({ currentCar, rarity: true });
                carList += findCar ? " ✅\n" : "\n";
                currentCar = modifiedBase(currentCar);

                if (sort === "duplicates") {
                    valueList += `\`${calcTotal(findCar)}\`\n`;
                }
                else if (sort !== "cr") {
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
                title: `List of All Cars in Cloned Drives (${ownedCount}/${list.length} Cars Owned)`,
                desc: `Current Sorting Criteria: \`${sort}\`, Filter: \`${reqDisplay(filter, settings.filterlogic)}\``,
                author: message.author,
                thumbnail: message.author.displayAvatarURL({ extension: "png" }),
                fields: [{ name: "Car", value: carList, inline: true }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            if (sort !== "cr") {
                infoMessage.editEmbed({ fields: [{ name: "Value", value: valueList, inline: true }] });
            }
            return infoMessage;
        }
    }
};
