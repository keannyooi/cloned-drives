"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("canvas");
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
            crEnd = i < 4 ? 99 : 549;
            if (i >= 4) {
                price = 24000 + (Math.floor(Math.random() * 12000));
            }
            else {
                price = 500 + (Math.floor(Math.random() * 500));
            }
        }
        else if (randNum < 66) {
            crStart = i < 4 ? 99 : 549;
            crEnd = i < 4 ? 249 : 699;
            if (i >= 4) {
                price = 96000 + (Math.floor(Math.random() * 96000));
                stock = 50;
            }
            else {
                price = 2000 + (Math.floor(Math.random() * 2000));
            }
        }
        else if (randNum < 91) {
            crStart = i < 4 ? 399 : 649;
            crEnd = i < 4 ? 549 : 799;
            if (i >= 4) {
                price = 96000 + (Math.floor(Math.random() * 96000));
                stock = 50;
            }
            else {
                price = 8000 + (Math.floor(Math.random() * 4000));
            }
        }
        else {
            crStart = i < 4 ? 440 : 699;
            crEnd = i < 4 ? 549 : 799;
            if (i >= 4) {
                price = 384000 + (Math.floor(Math.random() * 100000));
                stock = 50;
            }
            else {
                price = 24000 + (Math.floor(Math.random() * 12000));
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
    const ctx = canvas.getContext("2d");
    let attachment, promises, cucked = false;
    try {
        ctx.drawImage(bot.graphics.dealerTemp, 0, 0, canvas.width, canvas.height);
        const cards = catalog.map(car => {
            let currentCar = require(`../../cars/${car.carID}`);
            return loadImage(currentCar["racehud"]);
        });
        promises = await Promise.all(cards);

        for (let i = 0; i < catalog.length; i++) {
            ctx.drawImage(promises[i], cardPlacement[i].x, cardPlacement[i].y, 167, 103);
        }
    }
    catch (error) {
        console.log(error);
        attachment = new AttachmentBuilder(failedToLoadImageLink, { name: "dealership.jpg" });
        cucked = true;
    }
    if (!cucked) {
        attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "dealership.jpg" });
    }

    const dealershipChannel = await bot.homeGuild.channels.fetch(dealershipChannelID);
    return dealershipChannel.send({
        content: "**The dealership has refreshed!**",
        files: [attachment]
    });
}

module.exports = regenDealership;