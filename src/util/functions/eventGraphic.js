"use strict";

/**
 * EVENT BOARD GRAPHIC
 * ===================
 * Builds the "event board" image shared by cd-startevent and the auto-event
 * announcer: one 903×299 cell per round showing the opponent HUD, track map,
 * round number, tune, rewards (icon + value, colour-coded by rarity) and reqs.
 * Returning the AttachmentBuilder from one place keeps admin events and
 * auto-generated events rendering identically.
 */

const bot = require("../../config/config.js");
const { existsSync } = require("fs");
const path = require("path");
const { AttachmentBuilder } = require("discord.js");
const { loadImage, createCanvas } = require("@napi-rs/canvas");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID, raceWeekEmojiIDs } = require("../consts/consts.js");
const { getCar, getTrack, getPack, getDriver } = require("./dataManager.js");
const reqDisplay = require("./reqDisplay.js");

// ─── Cell layout (tweak here — all positions relative to the cell origin) ────
const ROUND_NUM_X = 185;    // round number, drawn after the template's "Round" label
const ROUND_NUM_Y = 41;
const MAP_X = 512;          // track map (was 482 — shifted right for the tune slot)
const MAP_Y = 190;
const MAP_SIZE = 98;
const TUNE_X = 428;         // tune icon slot, left of the track map
const TUNE_Y = 207;
const TUNE_SIZE = 64;

// Local tune icons — src/assets/images/tunes/<upgrade>.png (e.g. 000.png,
// 333.png, 666.png, 699.png, 969.png, 996.png, 999.png). Missing icons fall
// back to plain text in the same slot, so new tunes work before art exists.
const TUNE_ICON_DIR = path.join(__dirname, "../../assets/images/tunes");
const tuneIconCache = new Map();
async function loadTuneIcon(upgrade) {
    if (tuneIconCache.has(upgrade)) return tuneIconCache.get(upgrade);
    let icon = null;
    const file = path.join(TUNE_ICON_DIR, `${upgrade}.png`);
    if (existsSync(file)) {
        try {
            icon = await loadImage(file);
        } catch (error) {
            console.log(`[eventGraphic] failed to load tune icon ${file}: ${error.message}`);
        }
    }
    tuneIconCache.set(upgrade, icon);
    return icon;
}

function adjustSize(image) {
    const scale = Math.min(65 / image.width, 64 / image.height);
    return { w: image.width * scale, h: image.height * scale };
}

/**
 * @param {Object} event - an event document (needs a `roster` array; each round
 *   carries carID, upgrade, track, reqs, rewards).
 * @returns {Promise<AttachmentBuilder|null>} the board as "event.jpeg", or null
 *   if it couldn't render (callers post text-only) — never throws.
 */
async function generateEventGraphic(event) {
    const canvas = createCanvas(903 * Math.ceil(event.roster.length / 5), 299 * (event.roster.length <= 5 ? event.roster.length : 5));
    const context = canvas.getContext("2d");

    try {
        // Load HUD + map images in batches to reduce the memory spike on big rosters
        const batchSize = 5;
        let hudImages = [];
        let mapImages = [];

        for (let i = 0; i < event.roster.length; i += batchSize) {
            const batch = event.roster.slice(i, i + batchSize);

            const hudBatch = await Promise.all(batch.map(item => loadImage(getCar(item.carID).racehud)));
            const mapBatch = await Promise.all(batch.map(item => loadImage(getTrack(item.track).map)));

            hudImages.push(...hudBatch);
            mapImages.push(...mapBatch);
        }

        let [moneyImage, fuseImage, trophyImage, carImage, packImage, driverImage] = await Promise.all([
            loadImage(bot.emojis.cache.get(moneyEmojiID).url),
            loadImage(bot.emojis.cache.get(fuseEmojiID).url),
            loadImage(bot.emojis.cache.get(trophyEmojiID).url),
            // Dedicated reward-type icons (shared with cd-rrprizes) rather than
            // the old glof/pack stand-ins — drivers get their own too.
            loadImage(bot.emojis.cache.get(raceWeekEmojiIDs.car).url),
            loadImage(bot.emojis.cache.get(raceWeekEmojiIDs.pack).url),
            loadImage(bot.emojis.cache.get(raceWeekEmojiIDs.driver).url)
        ]);

        context.fillStyle = "#ffffff";

        for (let i = 0; i < event.roster.length; i++) {
            let baseX = Math.floor(i / 5) * 903;
            let baseY = (i % 5) * 299;

            context.font = 'bold 41px "Roboto Condensed"';
            context.textAlign = "left";
            context.drawImage(bot.graphics.eventTemp, baseX, baseY);
            context.drawImage(hudImages[i], baseX + 13, baseY + 59, 374, 224);
            context.drawImage(mapImages[i], baseX + MAP_X, baseY + MAP_Y, MAP_SIZE, MAP_SIZE);
            // Round number — clearly placed after the template's "Round" label
            context.fillText(i + 1, baseX + ROUND_NUM_X, baseY + ROUND_NUM_Y);

            // Tune slot (left of the track map) — icon if present, text fallback.
            // Replaces the old text at the card's bottom-left, which overlapped
            // the HUD art.
            const tuneIcon = await loadTuneIcon(event.roster[i].upgrade);
            if (tuneIcon) {
                context.drawImage(tuneIcon, baseX + TUNE_X, baseY + TUNE_Y, TUNE_SIZE, TUNE_SIZE);
            }
            else {
                context.textAlign = "center";
                context.font = 'bold 30px "Roboto Condensed"';
                context.fillText(event.roster[i].upgrade, baseX + TUNE_X + TUNE_SIZE / 2, baseY + TUNE_Y + TUNE_SIZE / 2 + 11);
                context.textAlign = "left";
            }

            let x = 0;
            context.font = 'bold 38px "Roboto Condensed"';
            for (let [key, value] of Object.entries(event.roster[i].rewards)) {
                let image;
                switch (key) {
                    case "money":
                        image = moneyImage;
                        value = value.toLocaleString("en");
                        break;
                    case "fuseTokens":
                        image = fuseImage;
                        value = value.toLocaleString("en");
                        break;
                    case "trophies":
                        image = trophyImage;
                        value = value.toLocaleString("en");
                        break;
                    case "car": {
                        image = carImage;
                        value = value.carID;
                        let car = getCar(value);
                        const cr = (car && typeof car["cr"] === "number") ? car["cr"] : 0;
                        if (cr > 999) context.fillStyle = "#ff4dd8";        // mystic tier — was lumped in with 850+
                        else if (cr > 849) context.fillStyle = "#ffb80d";
                        else if (cr > 699) context.fillStyle = "#9e3fff";
                        else if (cr > 549) context.fillStyle = "#ff3639";
                        else if (cr > 399) context.fillStyle = "#ffd737";
                        else if (cr > 249) context.fillStyle = "#37cdff";
                        else if (cr > 99) context.fillStyle = "#78ff53";
                        else context.fillStyle = "#aaaaaa";
                        break;
                    }
                    case "pack": {
                        image = packImage;
                        let pack = getPack(value);
                        // The explicit tier field wins; name inference is the fallback
                        // (name-only checks mis-colored tiered packs).
                        const tier = pack["tier"]
                            ? String(pack["tier"]).toLowerCase()
                            : (pack["packName"].toLowerCase().includes("elite") ? "elite"
                                : pack["packName"].toLowerCase().includes("booster") ? "booster"
                                    : "standard");
                        if (tier === "elite") context.fillStyle = "#ff3639";
                        else if (tier === "booster") context.fillStyle = "#78ff53";
                        else context.fillStyle = "#ffd737";
                        break;
                    }
                    case "driver": {
                        // Race Week driver reward — its own icon + display name
                        image = driverImage;
                        const driver = getDriver(value);
                        value = driver
                            ? `${driver.name}${driver.variant ? ` (${driver.variant})` : ""}`
                            : value;
                        context.fillStyle = "#37cdff";
                        break;
                    }
                    default:
                        break;
                }

                // Unknown reward types must not crash the whole board render.
                if (!image) continue;

                let { w, h } = adjustSize(image);
                context.drawImage(image, baseX + 676 + ((65 - w) / 2), baseY + 58 + (x * 77) + ((64 - h) / 2), w, h);
                context.fillText(value, baseX + 754, baseY + 103 + (x * 77));
                context.fillStyle = "#ffffff";
                x++;
            }

            context.textAlign = "center";
            context.font = 'bold 30px "Roboto Condensed"';
            let reqString = "";
            let words = reqDisplay(event.roster[i].reqs).split(" "), line = "", rowY = 0;
            for (let x = 0; x < words.length; x++) {
                reqString = line + words[x] + " ";
                let metrics = context.measureText(reqString);
                if (metrics.width > 234 && x > 0) {
                    context.fillText(line, baseX + 533, baseY + 77 + rowY);
                    line = words[x] + " ";
                    rowY += 25;
                } else {
                    line = reqString;
                }
            }
            context.fillText(line, baseX + 533, baseY + 77 + rowY);
        }
    } catch (error) {
        // Return null rather than a fallback attachment: the fallback image is a
        // remote URL, so during the very network blip that breaks the board it
        // would ALSO fail to send and take the whole message down with it. Callers
        // post text-only when this is null.
        console.log("[eventGraphic] failed to render board:", error.message);
        return null;
    }

    return new AttachmentBuilder(await canvas.encode("jpeg"), { name: "event.jpeg" });
}

module.exports = generateEventGraphic;
