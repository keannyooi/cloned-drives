"use strict";

const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const { rarityCheck, carNameGen, unbritish } = require("./sharedfiles/primary.js");
const { InfoMessage } = require("./sharedfiles/classes.js");
const { search } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "carinfo",
    aliases: ["cinfo"],
    usage: ["<car name>", "<car id with a slash (-) at the front>"],
    args: 1,
    category: "Info",
    description: "Shows info about a specified car.",
    execute(message, args) {
        let query = args.map(i => i.toLowerCase()), searchBy = "car";
        if (args[0].toLowerCase() === "random") {
            return displayInfo(carFiles[Math.floor(Math.random() * carFiles.length)]);
        }
        else if (args[0].toLowerCase().startsWith("-c")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        new Promise(resolve => resolve(search(message, query, carFiles, searchBy)))
            .then(async (hmm) => {
                if (!Array.isArray(hmm)) return;
                let [result, currentMessage] = hmm;
                await displayInfo(result, currentMessage);
            });

        async function displayInfo(car, currentMessage) {
            const playerData = await profileModel.findOne({ userID: message.author.id });
            let currentCar = require(`./cars/${car}`);
            const rarity = rarityCheck(currentCar);
            let tags = "None", description = "None", mra = "N/A", ola = "N/A";
            let topSpeed = `${currentCar["topSpeed"]}MPH`, accel = "N/A", weight = `${currentCar["weight"]}kg`;

            if (currentCar["tags"].length > 0) {
                tags = currentCar["tags"].join(", ");
            }
            if (currentCar["description"].length > 0) {
                description = currentCar["description"];
            }
            if (currentCar["topSpeed"] >= 100) {
                mra = currentCar["mra"].toString();
            }
            if (currentCar["topSpeed"] >= 60) {
                if (playerData.settings.unitpreference === "metric") {
                    accel = `${currentCar["0to60"]} (${unbritish(currentCar["0to60"], "0to60")})`;
                }
                else {
                    accel = currentCar["0to60"].toString();
                }
            }
            if (currentCar["topSpeed"] >= 30) {
                ola = currentCar["ola"].toString();
            }
            if (playerData.settings.unitpreference === "metric") {
                topSpeed += ` (${unbritish(currentCar["topSpeed"], "topSpeed")}KM/H)`;
            }
            else if (playerData.settings.unitpreference === "imperial") {
                weight += ` (${unbritish(currentCar["weight"], "weight")}lbs)`;
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: carNameGen(currentCar, rarity),
                desc: `Car ID: \`${car.slice(0, 6)}\``,
                author: message.author,
                image: currentCar["card"],
                fields: [
                    { name: "Top Speed", value: topSpeed, inline: true },
                    { name: "0-60MPH (0-100KM/H)", value: accel, inline: true },
                    { name: "Handling", value: currentCar["handling"].toString(), inline: true },
                    { name: "Drive Type", value: currentCar["driveType"], inline: true },
                    { name: "Tyre Type", value: currentCar["tyreType"], inline: true },
                    { name: "Weight", value: weight, inline: true },
                    { name: "Ground Clearance", value: currentCar["gc"], inline: true },
                    { name: "Seat Count", value: currentCar["seatCount"].toString(), inline: true },
                    { name: "Body Style", value: currentCar["bodyStyle"], inline: true },
                    { name: "Engine Position", value: currentCar["enginePos"], inline: true },
                    { name: "Fuel Type", value: currentCar["fuelType"], inline: true },
                    { name: "TCS Enabled?", value: currentCar["tcs"].toString(), inline: true },
                    { name: "ABS Enabled?", value: currentCar["abs"].toString(), inline: true },
                    { name: "Tags", value: tags, inline: true },
                    { name: "Collection", value: currentCar["collection"] || "None", inline: true },
                    { name: "Mid-Range Acceleration (MRA)", value: mra, inline: true },
                    { name: "Off-the-Line Acceleration (OLA)", value: ola, inline: true },
                    { name: "Description", value: description }
                ]
            });

            let hasCar = playerData.garage.find(c => car.includes(c.carID));
            if (hasCar !== undefined) {
                let str = "";
                for (let [key, value] of Object.entries(hasCar.upgrades)) {
                    if (value > 0) {
                        str += `${value}x ${key}, `;
                    }
                }
                infoMessage.setFooter(`✅ You own ${str.slice(0, -2)} of this car!`);
            }
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};