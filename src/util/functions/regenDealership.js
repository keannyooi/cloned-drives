"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("canvas");
const { MessageAttachment } = require("discord.js");
const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const { cardPlacement, failedToLoadImageLink, dealershipChannelID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const serverStatModel = require("../../models/serverStatSchema.js");

async function regenDealership() {
    const catalog = [];
    for (let i = 0; i < 8; i++) {
        const randNum = Math.floor(Math.random() * 100);
        let price, stock = 1000, rqStart, rqEnd;
        let currentFile = carFiles[Math.floor(Math.random() * carFiles.length)];
        let currentCar = require(`../../cars/${currentFile}`);

        if (randNum < 33) {
            rqStart = i < 4 ? 1 : 40;
            rqEnd = i < 4 ? 19 : 49;
            if (i >= 4) {
                price = 24000 + (Math.floor(Math.random() * 12000));
            }
            else {
                price = 500 + (Math.floor(Math.random() * 500));
            }
        }
        else if (randNum < 66) {
            rqStart = i < 4 ? 20 : 50;
            rqEnd = i < 4 ? 29 : 64;
            if (i >= 4) {
                price = 96000 + (Math.floor(Math.random() * 96000));
                stock = 25;
            }
            else {
                price = 2000 + (Math.floor(Math.random() * 2000));
            }
        }
        else if (randNum < 91) {
            rqStart = i < 4 ? 30 : 50;
            rqEnd = i < 4 ? 39 : 64;
            if (i >= 4) {
                price = 96000 + (Math.floor(Math.random() * 96000));
                stock = 25;
            }
            else {
                price = 8000 + (Math.floor(Math.random() * 4000));
            }
        }
        else {
            rqStart = i < 4 ? 40 : 65;
            rqEnd = i < 4 ? 49 : 79;
            if (i >= 4) {
                price = 384000 + (Math.floor(Math.random() * 100000));
                stock = 5;
            }
            else {
                price = 24000 + (Math.floor(Math.random() * 12000));
            }
        }

        while (currentCar["reference"] || catalog.find(car => currentFile.includes(car.carID)) || currentCar["isPrize"] || currentCar["rq"] > rqEnd || currentCar["rq"] < rqStart) {
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
            return loadImage(currentCar["card"]);
        });
        promises = await Promise.all(cards);

        for (let i = 0; i < catalog.length; i++) {
            ctx.drawImage(promises[i], cardPlacement[i].x, cardPlacement[i].y, 167, 103);
        }
    }
    catch (error) {
        console.log(error);
        attachment = new MessageAttachment(failedToLoadImageLink, "dealership.png");
        cucked = true;
    }
    if (!cucked) {
        attachment = new MessageAttachment(canvas.toBuffer(), "dealership.png");
    }

    const dealershipChannel = await bot.homeGuild.channels.fetch(dealershipChannelID);
    return dealershipChannel.send({
        content: "**The dealership has refreshed!**",
        files: [attachment]
    });
}

module.exports = regenDealership;