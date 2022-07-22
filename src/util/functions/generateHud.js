"use strict";

const { registerFont, loadImage, createCanvas } = require("canvas");
const { MessageAttachment } = require("discord.js");
const tyreAbbrevs = {
    "Standard": "STD",
    "Performance": "PER",
    "Off-Road": "OFF",
    "All-Surface": "ALL",
    "Slick": "SLK"
}

async function generateHud(currentCar, upgrade) {
    registerFont("RobotoCondensed-Regular.ttf", { family: "Roboto Condensed" });
    const canvas = createCanvas(500, 304);
    const ctx = canvas.getContext("2d");
    const hud = await loadImage(currentCar["racehud"]);
    ctx.drawImage(hud, 0, 0, 500, 304);

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = '55px "Roboto Condensed"';
    ctx.fillText(upgrade !== "000" ? currentCar[`${upgrade}TopSpeed`] : currentCar["topSpeed"], 492, 50);
    ctx.fillText(upgrade !== "000" ? currentCar[`${upgrade}0to60`] : currentCar["0to60"], 492, 111);
    ctx.fillText(upgrade !== "000" ? currentCar[`${upgrade}Handling`] : currentCar["handling"], 492, 173);
    ctx.fillText(currentCar["driveType"], 492, 237);
    ctx.fillText(tyreAbbrevs[currentCar["tyreType"]], 492, 292);

    let attachment = new MessageAttachment(canvas.toBuffer(), "hud.png");
    return attachment;
}

module.exports = generateHud;