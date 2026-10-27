"use strict";

const { createCanvas } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { calcTune } = require("./calcTune.js");
const { modifiedBase } = require("./cardType.js");
const { getScaledImage } = require("./imageCache.js");

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

// The size every HUD is drawn at — the image cache stores art pre-scaled to it.
const HUD_WIDTH = 500;
const HUD_HEIGHT = 312;

/**
 * Loads HUD art (pre-scaled, via imageCache) with a timeout. Falls back to the
 * default HUD image if loading fails or times out. A timed-out download keeps
 * going in the background and lands in the cache for next time.
 * @param {string} imagePath - URL or path to the image.
 * @param {number} timeout - Timeout duration in milliseconds.
 * @returns {Promise<Canvas>} - HUD_WIDTH×HUD_HEIGHT image (shared, read-only).
 */
async function loadImageWithFallback(imagePath, timeout = 2000) {
    const fallback = () => getScaledImage(DEFAULT_HUD_PATH, HUD_WIDTH, HUD_HEIGHT);
    return new Promise((resolve) => {
        let didTimeout = false;

        const timer = setTimeout(() => {
            didTimeout = true;
            console.warn(`Image load timeout for ${imagePath}. Using fallback.`);
            resolve(fallback());
        }, timeout);

        getScaledImage(imagePath, HUD_WIDTH, HUD_HEIGHT)
            .then(image => {
                if (!didTimeout) {
                    clearTimeout(timer);
                    resolve(image);
                }
            })
            .catch(err => {
                if (didTimeout) return;
                clearTimeout(timer);
                console.warn(`Image load error for ${imagePath}:`, err.message);
                resolve(fallback());
            });
    });
}

/**
 * Renders a 500x312 HUD canvas: the racehud art with the GIVEN stat values
 * printed on. Values are taken as-is (no tune recomputation), so callers can
 * pass driver-boosted race modules and the printed numbers match what the
 * race engine actually uses.
 * @param {Object} spec - { racehud, topSpeed, accel, handling, driveType, tyreType }
 * @returns {Promise<Canvas>} - the composed canvas (draw it or encode it).
 */
async function renderHudCanvas(spec) {
    const canvas = createCanvas(HUD_WIDTH, HUD_HEIGHT);
    const context = canvas.getContext("2d");
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = "bold italic 17px Rubik";

    const hud = await loadImageWithFallback(spec["racehud"]);
    context.drawImage(hud, 0, 0, HUD_WIDTH, HUD_HEIGHT);

    const accelDisplay = spec.accel === 99.9 ? "N/A" : Number(spec.accel).toFixed(1);
    context.fillText(String(spec.topSpeed), 28, 109);
    context.fillText(accelDisplay, 28, 135);
    context.fillText(String(spec.handling), 28, 161);
    context.fillText(spec["driveType"], 28, 188);
    context.fillText(tyreAbbrevs[spec["tyreType"]] || "???", 28, 214);
    return canvas;
}

/**
 * Generates a race HUD image for a car.
 * @param {Object} currentCar - The car object to generate the HUD for.
 * @param {string} upgrade - The upgrade level (e.g., "333", "000", "996").
 * @returns {Promise<AttachmentBuilder>} - Discord image attachment.
 */
async function generateHud(currentCar, upgrade) {
    // Load base model reference or fallback to currentCar
    const bmReference = modifiedBase(currentCar);

    // Calculate tuned stats using the new system
    const tunedStats = calcTune(bmReference, upgrade || "000");

    const canvas = await renderHudCanvas({
        racehud: currentCar["racehud"],
        topSpeed: tunedStats.topSpeed,
        accel: tunedStats.accel,
        handling: tunedStats.handling,
        driveType: bmReference["driveType"],
        tyreType: bmReference["tyreType"]
    });

    // Return the image as a Discord attachment
    return new AttachmentBuilder(await canvas.encode("jpeg"), { name: "hud.jpeg" });
}

module.exports = generateHud;
module.exports.renderHudCanvas = renderHudCanvas;
