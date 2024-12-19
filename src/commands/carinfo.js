"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith('.json'));
const { InfoMessage } = require("../util/classes/classes.js");
const search = require("../util/functions/search.js");
const carNameGen = require("../util/functions/carNameGen.js");
const unbritish = require("../util/functions/unbritish.js");
const generateHud = require("../util/functions/generateHud.js");
const getFlag = require("../util/functions/getFlag.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "carinfo",
    aliases: ["cinfo","catinfo"],
    usage: ["<car name>", "-<car ID>"],
    args: 1,
    category: "Info",
    description: "Shows info about a specified car.",
    async execute(message, args) {
        let query = args.map(i => i.toLowerCase()), searchBy = "carWithBM";
        if (args[0].toLowerCase() === "random") {
            return displayInfo(carFiles[Math.floor(Math.random() * carFiles.length)]);
        }
        else if (args[0].toLowerCase().startsWith("-c")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        await new Promise(resolve => resolve(search(message, query, carFiles, searchBy)))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await displayInfo(...response);
            })
            .catch(error => {
                throw error;
            });

        async function displayInfo(carFile, currentMessage) {
            const { garage, settings } = await profileModel.findOne({ userID: message.author.id });
            let description = "None", mra = "N/A", ola = "N/A", collection = "N/A";
            let currentCar = require(`../cars/${carFile}`), bmReference = currentCar;
            if (currentCar["reference"]) {
                bmReference = require(`../cars/${currentCar["reference"]}`);
                collection = currentCar["collection"].join(", ")
            }
            let topSpeed = `${bmReference.topSpeed}MPH`, accel = "N/A", weight = `${bmReference.weight.toLocaleString("en")}kg`;
            let bodyStyle = Array.isArray(bmReference["bodyStyle"]) ? bmReference["bodyStyle"].join(", ") : bmReference["bodyStyle"];

            if (currentCar["description"].length > 0) {
                description = currentCar["description"];
            }
            if (bmReference.topSpeed >= 100) {
                mra = bmReference.mra.toString();
            }
            if (bmReference.topSpeed >= 60) {
                if (settings.unitpreference === "metric") {
                    accel = `${bmReference["0to60"]} (${unbritish(bmReference["0to60"], "0to60")})`;
                }
                else {
                    accel = bmReference["0to60"].toString();
                }
            }
            if (bmReference.topSpeed >= 30) {
                ola = bmReference.ola.toString();
            }
            if (settings.unitpreference === "metric") {
                topSpeed += ` (${unbritish(bmReference.topSpeed, "topSpeed")}KM/H)`;
            }
            else if (settings.unitpreference === "imperial") {
                weight += ` (${unbritish(bmReference.weight, "weight")}lbs)`;
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: carNameGen({ currentCar, rarity: true }),
                desc: `Car ID: \`${carFile.slice(0, 6)}\``,
                author: message.author,
                image: currentCar["racehud"],
                thumbnail: getFlag(currentCar["country"]),
                fields: [
                    { name: "Top Speed", value: topSpeed, inline: true },
                    { name: "0-60MPH (0-100KM/H)", value: accel, inline: true },
                    { name: "Handling", value: bmReference.handling.toString(), inline: true },
                    { name: "Drive Type", value: bmReference.driveType, inline: true },
                    { name: "Tyre Type", value: bmReference.tyreType, inline: true },
                    { name: "Weight", value: weight, inline: true },
                    { name: "Ground Clearance", value: bmReference.gc, inline: true },
                    { name: "Seat Count", value: bmReference.seatCount.toString(), inline: true },
                    { name: "Body Style", value: bodyStyle, inline: true },
                    { name: "Engine Position", value: bmReference.enginePos, inline: true },
                    { name: "Fuel Type", value: bmReference.fuelType, inline: true },
                    { name: "TCS Enabled?", value: bmReference.tcs.toString(), inline: true },
                    { name: "ABS Enabled?", value: bmReference.abs.toString(), inline: true },
                    { name: "Tags", value: bmReference.tags.join(", ") || "None", inline: true },
                    { name: "Collection", value: collection || "None", inline: true },
                    { name: "Mid-Range Acceleration (MRA)", value: mra, inline: true },
                    { name: "Off-the-Line Acceleration (OLA)", value: ola, inline: true },
                    { name: "Creator", value: currentCar.creator ?? "None", inline: true },
                    { name: "Description", value: description }
                ]
            });

            let hasCar = garage.find(c => carFile.includes(c.carID));
            if (hasCar !== undefined) {
                let str = "";
                for (let [key, value] of Object.entries(hasCar.upgrades)) {
                    if (value > 0) {
                        str += `${value}x ${key}, `;
                    }
                }
                infoMessage.editEmbed({ footer: `✅ You own ${str.slice(0, -2)} of this car!` });
            }
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};