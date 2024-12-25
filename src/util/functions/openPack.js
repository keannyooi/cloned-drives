"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const { InfoMessage, ErrorMessage } = require("../classes/classes.js");
const carNameGen = require("./carNameGen.js");
const filterCheck = require("./filterCheck.js");
const sortCars = require("./sortCars.js");

async function openPack(args) {
    const { message, currentPack, currentMessage, test } = args;
    const cardFilter = currentPack["filter"];
    let pulledCards = "";
    let addedCars = [];

    // Generate the filtered pool of cars
    const filteredCars = carFiles.filter(carFile => filterCard(carFile, cardFilter));

    // Validate the filtered pool
    if (filteredCars.length === 0) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error: No cars available in the filtered pool.",
            desc: "Adjust your filter or choose a different pack.",
            author: message.author
        });
        return errorMessage.sendMessage({ currentMessage });
    }

    if (filteredCars.length < currentPack["repetition"] * 5) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error: Insufficient cars in the filtered pool for this pack.",
            desc: "Consider reducing repetitions or adjusting the filter.",
            author: message.author
        });
        return errorMessage.sendMessage({ currentMessage });
    }

    for (let i = 0; i < currentPack["repetition"] * 5; i++) {
        let rand = Math.floor(Math.random() * 1000) / 10;
        let check = 0, crStart, crEnd;

        // Determine rarity range
        for (let rarity of Object.keys(currentPack["packSequence"][Math.floor(i / currentPack["repetition"])])) {
            check += currentPack["packSequence"][Math.floor(i / currentPack["repetition"])][rarity];
            if (check > rand) {
                switch (rarity) {
                    case "standard":
                        crStart = 1;
                        crEnd = 99;
                        break;
                    case "common":
                        crStart = 100;
                        crEnd = 249;
                        break;
                    case "uncommon":
                        crStart = 250;
                        crEnd = 399;
                        break;
                    case "rare":
                        crStart = 400;
                        crEnd = 549;
                        break;
                    case "epic":
                        crStart = 550;
                        crEnd = 699;
                        break;
                    case "exotic":
                        crStart = 700;
                        crEnd = 849;
                        break;
                    case "legendary":
                        crStart = 850;
                        crEnd = 999;
                        break;
                    case "mystic":
                        crStart = 1000;
                        crEnd = 9999;
                        break;
                    default:
                        break;
                }
                break;
            }
        }

        // Select a random car from the filtered pool that matches the CR range
        let carFile, currentCard;
        let validCars = filteredCars.filter(file => {
            currentCard = require(`../../cars/${file}`);
            return currentCard["cr"] >= crStart && currentCard["cr"] <= crEnd;
        });

        if (validCars.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error: No cars matching criteria within the filtered pool.",
                desc: "Consider adjusting the filter or pack settings.",
                author: message.author
            });
            return errorMessage.sendMessage({ currentMessage });
        }

        carFile = validCars[Math.floor(Math.random() * validCars.length)];
        currentCard = require(`../../cars/${carFile}`);

        addedCars.push({ carID: carFile.slice(0, 6), upgrade: "000" });
    }

    addedCars = sortCars(addedCars, "cr", "ascending");

    for (let i = 0; i < addedCars.length; i++) {
        let currentCar = require(`../../cars/${addedCars[i].carID}.json`);
        pulledCards += carNameGen({ currentCar, rarity: true });

        if ((i + 1) % 5 !== 0) {
            pulledCards += ` **[[Card]](${currentCar["racehud"]})**\n`;
        } else {
            const packScreen = new InfoMessage({
                channel: message.channel,
                title: `Opening ${currentPack["packName"]}...`,
                desc: "Click on the image to see the cards better.",
                author: message.author,
                image: currentCar["racehud"],
                thumbnail: currentPack["pack"],
                fields: [{ name: "Cards Pulled", value: pulledCards }],
                footer: test ? "This is a test pack, meaning that these cars won't be added into your garage and you won't be charged with money." : null
            });
            await packScreen.sendMessage({ currentMessage: i === 4 ? currentMessage : null, preserve: true });
            pulledCards = "";
        }
    }
    return addedCars;

    function filterCard(carFile, filter) {
        let currentCard = require(`../../cars/${carFile}`);
        if (currentCard["reference"] || currentCard["isPrize"] === true) return false;
        let passed = true;

        for (let criteria in filter) {
            if (filter[criteria] !== "None") {
                switch (criteria) {
                    case "make":
                    case "tags":
                    case "creator":
                    case "bodyStyle":
                        if (Array.isArray(currentCard[criteria])) {
                            if (currentCard[criteria].some(m => m && m.toLowerCase() === filter[criteria].toLowerCase()) === false) passed = false;
                        } else if (currentCard[criteria] && currentCard[criteria].toLowerCase() !== filter[criteria].toLowerCase()) {
                            passed = false;
                        }
                        break;
                    case "modelYear":
                    case "seatCount":
                        if (!currentCard[criteria] || currentCard[criteria] < filter[criteria]["start"] || currentCard[criteria] > filter[criteria]["end"]) {
                            passed = false;
                        }
                        break;
                    default:
                        if (currentCard[criteria] && typeof currentCard[criteria] === 'string' &&
                            filter[criteria] && typeof filter[criteria] === 'string' &&
                            currentCard[criteria].toLowerCase() !== filter[criteria].toLowerCase()) {
                            passed = false;
                        }
                        break;
                }
            }
        }
        return passed;
    }
}

module.exports = openPack;
