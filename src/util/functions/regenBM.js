"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const { cardPlacement, failedToLoadImageLink, dealershipChannelID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const serverStatModel = require("../../models/serverStatSchema.js");

async function regenBM() {
    const catalog = [];
    for (let i = 0; i < 8; i++) {
        const randNum = Math.floor(Math.random() * 100);
        let price, stock, crStart, crEnd;
        let bmCars = carFiles.filter(file => {
            let car = require(`../../cars/${file}`);
            return car["reference"] !== undefined;
        })

        let currentFile = bmCars[Math.floor(Math.random() * bmCars.length)];
        let currentCar = require(`../../cars/${currentFile}`);
        let bmReference = require(`../../cars/${currentCar["reference"]}`);

        if (randNum < 33) {
            crStart = i < 4 ? 1 : 250;
            crEnd = i < 4 ? 99 : 399;
            if (i >= 4) {
                price = 200 + (Math.floor(Math.random() * 100));
                stock = 40;
            }
            else {
                price = 25 + (Math.floor(Math.random() * 10));
                stock = 40;
            }
        }
        else if (randNum < 60) {
            crStart = i < 4 ? 250 : 550;
            crEnd = i < 4 ? 399 : 699;
            if (i >= 4) {
                price = 400 + (Math.floor(Math.random() * 200));
                stock = 40;
            }
            else {
                price = 50 + (Math.floor(Math.random() * 25));
                stock = 40;
            }
        }
        else if (randNum < 85) {
            crStart = i < 4 ? 250 : 550;
            crEnd = i < 4 ? 399 : 699;
            if (i >= 4) {
                price = 400 + (Math.floor(Math.random() * 200));
                stock = 40;
            }
            else {
                price = 100 + (Math.floor(Math.random() * 50));
                stock = 40;
            }
        }
        else if (randNum < 93) {
            crStart = i < 4 ? 400 : 700;
            crEnd = i < 4 ? 549 : 849;
            if (i >= 4) {
                price = 800 + (Math.floor(Math.random() * 400));
                stock = 20;
            }
            else {
                price = 200 + (Math.floor(Math.random() * 100));
                stock = 25;
            }
        }
        else {
            crStart = 850;
            crEnd = 999;
            price = 1600 + (Math.floor(Math.random() * 800));
            stock = 10;
        }

        while (!currentCar["reference"] || catalog.find(car => currentFile.includes(car.carID)) || bmReference["isPrize"] || bmReference["cr"] > crEnd || bmReference["cr"] < crStart || !currentCar["active"]) {
            currentFile = bmCars[Math.floor(Math.random() * bmCars.length)];
            currentCar = require(`../../cars/${currentFile}`);
            bmReference = require(`../../cars/${currentCar["reference"]}`);
            console.log(crStart, crEnd, bmReference["cr"]);
        }
        catalog.push({ carID: currentFile.slice(0, 6), price, stock });
    }

    catalog.sort(function (a, b) {
        if (a.price === b.price) {
            const carA = require(`../../cars/${a.carID}`);
            const carB = require(`../../cars/${b.carID}`);
            return carNameGen({ currentCar: carA }) > carNameGen({ currentCar: carB }) ? 1 : -1;
        }
        else {
            return a.price - b.price;
        }
    });

    await serverStatModel.updateOne({}, { bmCatalog: catalog, lastBMRefresh: DateTime.now().toISO() });

    const canvas = createCanvas(694, 249);
    const context = canvas.getContext("2d");
    let attachment, promises, cucked = false;
    try {
        context.drawImage(bot.graphics.dealerTemp, 0, 0, canvas.width, canvas.height);
        const cards = catalog.map(car => {
            let currentCar = require(`../../cars/${car.carID}`);
            return loadImage(currentCar["racehud"]);
        });
        promises = await Promise.all(cards);

        for (let i = 0; i < catalog.length; i++) {
            context.drawImage(promises[i], cardPlacement[i].x, cardPlacement[i].y, 167, 103);
        }
    }
    catch (error) {
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