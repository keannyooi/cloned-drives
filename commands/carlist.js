"use strict";

const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const { ErrorMessage, InfoMessage } = require("./sharedfiles/classes.js");
const { carNameGen, rarityCheck, calcTotal } = require("./sharedfiles/primary.js");
const { sortCars, filterCheck, listUpdate } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "carlist",
    aliases: ["allcars"],
    usage: "(all optional) <page number> | -s <sorting criteria>",
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
                title: "Error, page number requested invalid.",
                desc: `The car list ends at page ${totalPages}.`,
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }

        const playerData = await profileModel.findOne({ userID: message.author.id });
        const filterEnabled = playerData.filter !== undefined && playerData.settings.filtercarlist === true;
        if (filterEnabled) {
            list.filter(c => filterCheck(c, playerData.filter));
        }
        const ownedCars = list.filter(function (carID) {
            return playerData.garage.some(part => carID.includes(part.carID));
        });

        if (args[args.length - 2] === "-s") {
            sort = args[args.length - 1].toLowerCase();
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
                    return errorMessage.sendMessage();
            }
        }

        const totalPages = Math.ceil(list.length / 10);
        if (page < 1 || totalPages < page) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested invalid.",
                desc: `The car list ends at page ${totalPages}.`,
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }
        list = sortCars(list, sort, playerData.settings.sortorder, playerData.garage);

        try {
            listUpdate(list, page, listDisplay, playerData.settings.buttonstyle);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages, currentMessage) {
            let carList = "", valueList = "";
            for (let i = 0; i < section.length; i++) {
                carList += `**${i + 1}.** `;
                valueList += `**${i + 1}.** `;

                let currentCar = require(`./cars/${section[i]}`);
                let rarity = rarityCheck(currentCar, playerData.settings.shortenedlists);
                carList += `${carNameGen({ currentCar, rarity, shortenedLists: playerData.settings.shortenedlists })}`;
                if (playerData.garage.some(car => section[i].includes(car.carID))) {
                    carList += " ✅\n";
                }
                else {
                    carList += "\n";
                }

                if (sort === "mostowned") {
                    let findCar = playerData.garage.find(c => c.carID.includes(section[i].slice(0, 6)));
                    valueList += `\`${findCar ? calcTotal(findCar) : 0}\`\n`;
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
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `List of All Cars in Cloned Drives (${ownedCars.length}/${list.length} Cars Owned)`,
                desc: `Current Sorting Criteria: \`${sort}\`, Filter Activated: \`${(filterEnabled)}\``,
                author: message.author,
                thumbnail: message.author.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [{ name: "Car", value: carList, inline: true }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            if (sort !== "rq") {
                infoMessage.addFields([{ name: "Value", value: valueList, inline: true }]);
            }
            return infoMessage;
        }
    }
};