"use strict";

const { loadImage, createCanvas } = require("@napi-rs/canvas");
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
    const canvas = createCanvas(500, 312);
    const context = canvas.getContext("2d");
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = "bold italic 17px Rubik";

    const hud = await loadImage(currentCar["racehud"]);
    context.drawImage(hud, 0, 0, 500, 312);

    let bmReference = currentCar["reference"] ? require(`../../cars/${currentCar["reference"]}`) : currentCar;
    let topSpeed = bmReference["topSpeed"], accel = bmReference["0to60"], handling = bmReference["handling"]
    if (upgrade !== "000") {
        topSpeed = bmReference[`${upgrade}TopSpeed`];
        accel = bmReference[`${upgrade}0to60`];
        handling = bmReference[`${upgrade}Handling`];
    }
    accel = accel === 99.9 ? "N/A" : accel.toFixed(1);
    
    context.fillText(topSpeed.toString(), 28, 109);
    context.fillText(accel, 28, 135);
    context.fillText(handling.toString(), 28, 161);
    context.fillText(bmReference["driveType"], 28, 188);
    context.fillText(tyreAbbrevs[bmReference["tyreType"]], 28, 214);

    let attachment = new AttachmentBuilder(await canvas.encode("jpeg"), { name:"hud.jpeg" });
    return attachment;
}

module.exports = generateHud;