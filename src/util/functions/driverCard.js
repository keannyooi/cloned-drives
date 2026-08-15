"use strict";

/**
 * DRIVER CARD RENDERER
 * ====================
 * Stamps a serialised driver's unique mint number onto their card art at
 * render time — one image file serves all N copies, exactly like the race
 * HUDs print stats onto the shared card art (generateHud.js).
 *
 * Only called when there IS a serial to print; every other driver embed uses
 * the plain image URL, so normal cd-driverinfo calls pay no canvas cost.
 * Any failure returns null and the caller falls back to the raw URL.
 */

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");

// ─── Stamp placement (all fractions of the image's own size, so the same
// numbers work whatever resolution the card art is exported at) ─────────────
//
// Serialised cards are full-art/borderless and composed individually, so a
// single fixed position can't suit every one. Any driver JSON may override
// per card:
//     "serialStamp": { "rightFrac": 0.05, "topFrac": 0.06, "plate": true }
// `plate: true` draws a soft dark rounded panel behind the number — use it
// when the art under the stamp is busy or light.
const STAMP = {
    // Anchor point, measured from the card's top-right corner. The default
    // sits level with the CD logo, opposite it.
    rightFrac: 0.045,     // distance from the right edge
    topFrac: 0.06,        // distance from the top edge
    // Font height is a fraction of card WIDTH. Cards are 16:9, so this is
    // tuned against that — on squarer art the number renders smaller relative
    // to the card, and a per-card serialStamp.fontFrac can correct it.
    fontFrac: 0.026,
    strokeFrac: 0.006,    // outline thickness — keeps it legible on any photo
    font: "Rubik",        // registered in config.js (Rubik-BoldItalic)
    fill: "#ffffff",
    stroke: "rgba(0, 0, 0, 0.85)",
    plate: false,
    plateFill: "rgba(0, 0, 0, 0.55)"
};

function loadImageWithTimeout(src, ms = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Image load timeout: ${src}`)), ms);
        loadImage(src)
            .then(image => { clearTimeout(timer); resolve(image); })
            .catch(error => { clearTimeout(timer); reject(error); });
    });
}

/**
 * @param {Object} driver - loaded driver definition (needs `image`, `serialCap`)
 * @param {number} serial - the owner's 1-based mint number
 * @returns {Promise<AttachmentBuilder|null>} "drivercard.png", or null when it
 *   couldn't render (no art, bad URL, canvas failure) — caller falls back.
 */
async function renderDriverCard(driver, serial) {
    // loadImage takes remote URLs and local paths alike, so bundled card art
    // works too — any non-empty string is fair game.
    if (!driver || typeof driver.image !== "string" || driver.image.trim() === "") return null;
    if (typeof serial !== "number") return null;

    try {
        const art = await loadImageWithTimeout(driver.image);
        const canvas = createCanvas(art.width, art.height);
        const context = canvas.getContext("2d");
        context.drawImage(art, 0, 0);

        // Per-card overrides (full-art serialised cards each want their own spot)
        const cfg = { ...STAMP, ...(driver.serialStamp || {}) };

        const cap = typeof driver.serialCap === "number" ? driver.serialCap : "?";
        const text = `#${serial} / ${cap}`;
        const fontSize = Math.round(art.width * cfg.fontFrac);

        context.font = `${fontSize}px "${cfg.font}"`;
        context.textAlign = "right";
        context.textBaseline = "top";
        context.lineJoin = "round";

        const x = art.width - (art.width * cfg.rightFrac);
        const y = art.height * cfg.topFrac;

        if (cfg.plate) {
            const padX = fontSize * 0.45;
            const padY = fontSize * 0.28;
            const textWidth = context.measureText(text).width;
            const boxX = x + padX - textWidth - (padX * 2);
            const boxW = textWidth + (padX * 2);
            const boxH = fontSize + (padY * 2);
            const radius = boxH * 0.28;
            context.fillStyle = cfg.plateFill;
            context.beginPath();
            context.roundRect(boxX, y - padY, boxW, boxH, radius);
            context.fill();
        }

        context.lineWidth = Math.max(2, Math.round(art.width * cfg.strokeFrac));
        context.strokeStyle = cfg.stroke;
        context.fillStyle = cfg.fill;
        context.strokeText(text, x, y);
        context.fillText(text, x, y);

        return new AttachmentBuilder(await canvas.encode("png"), { name: "drivercard.png" });
    }
    catch (error) {
        console.log(`[driverCard] render failed for ${driver.driverID} (#${serial}): ${error.message}`);
        return null;
    }
}

module.exports = renderDriverCard;
