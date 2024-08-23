"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const { cardPlacement, failedToLoadImageLink, dealershipChannelID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const serverStatModel = require("../../models/serverStatSchema.js");

async function regenDealership() {
    const catalog = [];
    for (let i = 0; i < 8; i++) {
        const randNum = Math.floor(Math.random() * 100);
        let price, stock = 1000, crStart, crEnd;
        let currentFile = carFiles[Math.floor(Math.random() * carFiles.length)];
        let currentCar = require(`../../cars/${currentFile}`);

        if (randNum < 33) {
            crStart = i < 4 ? 1 : 400;
            crEnd = i < 4 ? 99 : 499;
            if (i >= 4) {
                price = 30000 + (Math.floor(Math.random() * 22000));
            }
            else {
                price = 4000 + (Math.floor(Math.random() * 5000));
            }
        }
        else if (randNum < 66) {
            crStart = i < 4 ? 100 : 500;
            crEnd = i < 4 ? 199 : 599;
            if (i >= 4) {
                price = 75000 + (Math.floor(Math.random() * 96000));
                stock = 50;
            }
            else {
                price = 6000 + (Math.floor(Math.random() * 8000));
            }
        }
        else if (randNum < 91) {
            crStart = i < 4 ? 300 : 600;
            crEnd = i < 4 ? 399 : 699;
            if (i >= 4) {
                price = 96000 + (Math.floor(Math.random() * 96000));
                stock = 50;
            }
            else {
                price = 16000 + (Math.floor(Math.random() * 24000));
            }
        }
        else {
            crStart = i < 4 ? 400 : 750;
            crEnd = i < 4 ? 499 : 899;
            if (i >= 4) {
                price = 222000 + (Math.floor(Math.random() * 200000));
                stock = 50;
            }
            else {
                price = 30000 + (Math.floor(Math.random() * 22000));
            }
        }

        while (currentCar["reference"] || catalog.find(car => currentFile.includes(car.carID)) || currentCar["isPrize"] || currentCar["cr"] > crEnd || currentCar["cr"] < crStart) {
            currentFile = carFiles[Math.floor(Math.random() * carFiles.length)];
            currentCar = require(`../../cars/${currentFile}`);
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

    await serverStatModel.updateOne({}, { dealershipCatalog: catalog });

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
        content: "**The dealership has refreshed!**",
        files: [attachment]
    });
}

module.exports = regenDealership;