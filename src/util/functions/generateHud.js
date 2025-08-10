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
};

// Path to default HUD image for fallback
const DEFAULT_HUD_PATH = require.resolve("../../assets/images/default_hud.jpeg");

/**
 * Loads an image with a timeout. Falls back to a default HUD image if loading fails or times out.
 * @param {string} imagePath - URL or path to the image.
 * @param {number} timeout - Timeout duration in milliseconds.
 * @returns {Promise<Image>} - Loaded image.
 */
async function loadImageWithFallback(imagePath, timeout = 2000) {
    return new Promise((resolve) => {
        let didTimeout = false;

        const timer = setTimeout(() => {
            didTimeout = true;
            console.warn(`Image load timeout for ${imagePath}. Using fallback.`);
            resolve(loadImage(DEFAULT_HUD_PATH));
        }, timeout);

        loadImage(imagePath)
            .then(image => {
                if (!didTimeout) {
                    clearTimeout(timer);
                    resolve(image);
                }
            })
            .catch(err => {
                console.warn(`Image load error for ${imagePath}:`, err.message);
                resolve(loadImage(DEFAULT_HUD_PATH));
            });
    });
}

/**
 * Generates a race HUD image for a car.
 * @param {Object} currentCar - The car object to generate the HUD for.
 * @param {string} upgrade - The upgrade level (e.g., "323", "000").
 * @returns {Promise<AttachmentBuilder>} - Discord image attachment.
 */
async function generateHud(currentCar, upgrade) {
    const canvas = createCanvas(500, 312);
    const context = canvas.getContext("2d");
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = "bold italic 17px Rubik";

    // Load HUD background image with fallback
    const hud = await loadImageWithFallback(currentCar["racehud"]);
    context.drawImage(hud, 0, 0, 500, 312);

    // Load base model reference or fallback to currentCar
    const bmReference = currentCar["reference"] 
        ? require(`../../cars/${currentCar["reference"]}`) 
        : currentCar;

    // Extract stats
    let topSpeed = bmReference["topSpeed"];
    let accel = bmReference["0to60"];
    let handling = bmReference["handling"];

    // Use upgraded stats if specified
    if (upgrade !== "000") {
        topSpeed = bmReference[`${upgrade}TopSpeed`] ?? topSpeed;
        accel = bmReference[`${upgrade}0to60`] ?? accel;
        handling = bmReference[`${upgrade}Handling`] ?? handling;
    }

    // Format acceleration
    accel = accel === 99.9 ? "N/A" : accel.toFixed(1);

    // Draw text on HUD
    context.fillText(topSpeed.toString(), 28, 109);
    context.fillText(accel, 28, 135);
    context.fillText(handling.toString(), 28, 161);
    context.fillText(bmReference["driveType"], 28, 188);
    context.fillText(tyreAbbrevs[bmReference["tyreType"]] || "???", 28, 214);

    // Return the image as a Discord attachment
    return new AttachmentBuilder(await canvas.encode("jpeg"), { name: "hud.jpeg" });
}

module.exports = generateHud;
