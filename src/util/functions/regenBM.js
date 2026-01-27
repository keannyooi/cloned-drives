"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { getCarFiles, getCar } = require("./dataManager.js");
const { cardPlacement, failedToLoadImageLink, dealershipChannelID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const serverStatModel = require("../../models/serverStatSchema.js");

async function regenBM() {
    const catalog = [];
    const carFiles = getCarFiles();
    const bmCars = carFiles.filter(file => {
        let car = getCar(file);
        return car["reference"] !== undefined;
    });

for (let i = 0; i < 8; i++) {
    const randNum = Math.floor(Math.random() * 100);
    let price, stock, crStart, crEnd;

    if (randNum < 20) {
        // Low CR cars
        crStart = i < 4 ? 1 : 100;
        crEnd = i < 4 ? 99 : 249;
        price = i >= 4 ? 75 + Math.floor(Math.random() * 25) : 25 + Math.floor(Math.random() * 10);
        stock = 40;
    } else if (randNum < 40) {
        // Mid-low CR
        crStart = i < 4 ? 100 : 250;
        crEnd = i < 4 ? 249 : 399;
        price = i >= 4 ? 200 + Math.floor(Math.random() * 100) : 50 + Math.floor(Math.random() * 25);
        stock = 40;
    } else if (randNum < 60) {
        // Mid CR
        crStart = i < 4 ? 250 : 550;
        crEnd = i < 4 ? 399 : 699;
        price = i >= 4 ? 400 + Math.floor(Math.random() * 150) : 100 + Math.floor(Math.random() * 50);
        stock = 40;
    } else if (randNum < 80) {
        // High-mid CR
        crStart = i < 4 ? 400 : 700;
        crEnd = i < 4 ? 549 : 849;
        price = i >= 4 ? 700 + Math.floor(Math.random() * 300) : 200 + Math.floor(Math.random() * 100);
        stock = i >= 4 ? 25 : 30;
    } else {
        // High-end cars
        crStart = 850;
        crEnd = 999; // fixed from 1000
        price = 1600 + Math.floor(Math.random() * 600);
        stock = 10;
    }
        // Pick initial random car from bmCars
        let currentFile = bmCars[Math.floor(Math.random() * bmCars.length)];
        let currentCar = getCar(currentFile);
        let bmReference = getCar(currentCar["reference"]);

        // Prevent infinite loops by limiting attempts
        let attempts = 0;
        const maxAttempts = 2500;

        while (
            (!currentCar["reference"] ||
            catalog.some(car => currentFile.slice(0, 6) === car.carID) || // Check duplicates precisely
            bmReference["isPrize"] ||
            bmReference["cr"] > crEnd ||
            bmReference["cr"] < crStart ||
            !currentCar["active"]) &&
            attempts < maxAttempts
        ) {
            currentFile = bmCars[Math.floor(Math.random() * bmCars.length)];
            currentCar = getCar(currentFile);
            bmReference = getCar(currentCar["reference"]);
            attempts++;
            // Optionally log attempts for debugging:
            // console.log(`Attempt ${attempts}: CR ${bmReference["cr"]} Range [${crStart},${crEnd}]`);
        }

        if (attempts >= maxAttempts) {
            console.warn(`⚠️ Could not find suitable BM car for slot ${i} after ${maxAttempts} attempts. Skipping.`);
            continue; // Skip this iteration if no suitable car found
        }

        catalog.push({ carID: currentFile.slice(0, 6), price, stock });
    }

    // Sort catalog by price then by name
    catalog.sort(function (a, b) {
        if (a.price === b.price) {
            const carA = getCar(a.carID);
            const carB = getCar(b.carID);
            return carNameGen({ currentCar: carA }) > carNameGen({ currentCar: carB }) ? 1 : -1;
        } else {
            return a.price - b.price;
        }
    });

    // Update database with new catalog and timestamp
    await serverStatModel.updateOne({}, { bmCatalog: catalog, lastBMRefresh: DateTime.now().toISO() });

    // Create image canvas and draw cards
    const canvas = createCanvas(694, 249);
    const context = canvas.getContext("2d");
    let attachment, cucked = false;

    try {
        context.drawImage(bot.graphics.dealerTemp, 0, 0, canvas.width, canvas.height);

        const cards = catalog.map(car => {
            let currentCar = getCar(car.carID);
            return loadImage(currentCar["racehud"]);
        });
        const promises = await Promise.all(cards);

        for (let i = 0; i < catalog.length; i++) {
            context.drawImage(promises[i], cardPlacement[i].x, cardPlacement[i].y, 167, 103);
        }
    } catch (error) {
        console.log(error);
        attachment = new AttachmentBuilder(failedToLoadImageLink, { name: "dealership.jpeg" });
        cucked = true;
    }

    if (!cucked) {
        attachment = new AttachmentBuilder(await canvas.encode("jpeg"), { name: "dealership.jpeg" });
    }

    const dealershipChannel = await bot.homeGuild.channels.fetch(dealershipChannelID);
    return dealershipChannel.send({
        content: "**The black market has refreshed!**",
        files: [attachment]
    });
}

module.exports = regenBM;
