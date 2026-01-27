"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { getCarFiles, getCar } = require("./dataManager.js");
const { cardPlacement, failedToLoadImageLink, dealershipChannelID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const serverStatModel = require("../../models/serverStatSchema.js");

function getSaleValue(cr) {
    if (cr > 949) return 640000;
    if (cr > 899) return 400000;
    if (cr > 849) return 300000;
    if (cr > 799) return 180000;
    if (cr > 749) return 120000;
    if (cr > 699) return 80000;
    if (cr > 599) return 72000;
    if (cr > 499) return 40000;
    if (cr > 399) return 30000;
    if (cr > 299) return 16000;
    if (cr > 199) return 12000;
    if (cr > 99) return 6000;
    return 4000;
}

function getRandomCRRange(i) {
    if (i < 4) {
        const ranges = [
            [1, 99],
            [100, 199],
            [200, 299],
            [300, 399],
            [400, 499]
        ];
        return ranges[Math.floor(Math.random() * ranges.length)];
    } else {
        const ranges = [
            [400, 499],
            [500, 599],
            [600, 699],
            [700, 749],
            [750, 899],
            [900, 999]
        ];
        return ranges[Math.floor(Math.random() * ranges.length)];
    }
}

function scaleStockByCR(cr) {
    const minCR = 1;
    const maxCR = 999;
    const maxStock = 999;
    const minStock = 50;
    return Math.floor(maxStock - ((cr - minCR) / (maxCR - minCR)) * (maxStock - minStock));
}

async function regenDealership() {
    const catalog = [];
    const carFiles = getCarFiles();

    for (let i = 0; i < 8; i++) {
        let currentFile, currentCar, crStart, crEnd, price;

        // Get a valid car file
        let valid = false;
        while (!valid) {
            currentFile = carFiles[Math.floor(Math.random() * carFiles.length)];
            currentCar = getCar(currentFile);
            const [tempStart, tempEnd] = getRandomCRRange(i);
            const cr = currentCar["cr"];

            if (
                !currentCar["reference"] &&
                !currentCar["isPrize"] &&
                !catalog.find(car => currentFile.includes(car.carID)) &&
                cr >= tempStart && cr <= tempEnd
            ) {
                crStart = tempStart;
                crEnd = tempEnd;
                valid = true;
            }
        }

        const cr = currentCar["cr"];
        const baseValue = getSaleValue(cr);
        const markup = 1.2 + Math.random() * 0.25; // 20–45% markup
        price = Math.floor(baseValue * markup);

        const stock = scaleStockByCR(cr);

        catalog.push({ carID: currentFile.slice(0, 6), price, stock });
    }

    catalog.sort((a, b) => {
        if (a.price === b.price) {
            const carA = getCar(a.carID);
            const carB = getCar(b.carID);
            return carNameGen({ currentCar: carA }) > carNameGen({ currentCar: carB }) ? 1 : -1;
        }
        return a.price - b.price;
    });

    await serverStatModel.updateOne({}, { dealershipCatalog: catalog });

    const canvas = createCanvas(694, 249);
    const context = canvas.getContext("2d");
    let attachment, promises, cucked = false;

    try {
        context.drawImage(bot.graphics.dealerTemp, 0, 0, canvas.width, canvas.height);
        const cards = catalog.map(car => {
            let currentCar = getCar(car.carID);
            return loadImage(currentCar["racehud"]);
        });
        promises = await Promise.all(cards);

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
        content: "**The dealership has refreshed!**",
        files: [attachment]
    });
}

module.exports = regenDealership;
