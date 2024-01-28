"use strict";

const { registerFont, loadImage, createCanvas } = require("canvas");
const { AttachmentBuilder } = require("discord.js");
const tyreAbbrevs = {
    "Standard": "STD",
    "Performance": "PER",
    "Off-Road": "OFF",
    "All-Surface": "ALL",
    "Slick": "SLK",
    "Drag": "DRG"
}

async function generateHud(currentCar, upgrade) {
    registerFont("Rubik-BoldItalic.ttf", { family: "Rubik" });
    const canvas = createCanvas(500, 312);
    const ctx = canvas.getContext("2d");
    const hud = await loadImage(currentCar["racehud"]);
    ctx.drawImage(hud, 0, 0, 500, 312);

    let bmReference = currentCar["reference"] ? require(`../../cars/${currentCar["reference"]}`) : currentCar;
    let accel = upgrade !== "000" ? bmReference[`${upgrade}0to60`] : bmReference["0to60"]
    if (accel === 99.9) {
        accel = "N/A";
    }
    else {
        accel = accel.toFixed(1)
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = '17px "Rubik"';
    ctx.fillText(upgrade !== "000" ? bmReference[`${upgrade}TopSpeed`] : bmReference["topSpeed"], 45, 109);
    ctx.fillText(accel, 45, 135);
    ctx.fillText(upgrade !== "000" ? bmReference[`${upgrade}Handling`] : bmReference["handling"], 45, 161);
    ctx.fillText(bmReference["driveType"], 47, 188);
    ctx.fillText(tyreAbbrevs[bmReference["tyreType"]], 45, 214);

    let attachment = new AttachmentBuilder(canvas.toBuffer(), { name:"hud.png" });
    return attachment;
}

module.exports = generateHud;