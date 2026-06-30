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
const { AttachmentBuilder } = require("discord.js");
const { loadImage, createCanvas } = require("@napi-rs/canvas");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID, glofEmojiID, packEmojiID } = require("../consts/consts.js");
const { getCar, getTrack, getPack } = require("./dataManager.js");
const reqDisplay = require("./reqDisplay.js");

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

        let [moneyImage, fuseImage, trophyImage, carImage, packImage] = await Promise.all([
            loadImage(bot.emojis.cache.get(moneyEmojiID).url),
            loadImage(bot.emojis.cache.get(fuseEmojiID).url),
            loadImage(bot.emojis.cache.get(trophyEmojiID).url),
            loadImage(bot.emojis.cache.get(glofEmojiID).url),
            loadImage(bot.emojis.cache.get(packEmojiID).url)
        ]);

        context.fillStyle = "#ffffff";

        for (let i = 0; i < event.roster.length; i++) {
            let baseX = Math.floor(i / 5) * 903;
            let baseY = (i % 5) * 299;

            context.font = 'bold 41px "Roboto Condensed"';
            context.textAlign = "left";
            context.drawImage(bot.graphics.eventTemp, baseX, baseY);
            context.drawImage(hudImages[i], baseX + 13, baseY + 59, 374, 224);
            context.drawImage(mapImages[i], baseX + 482, baseY + 190, 98, 98);
            context.fillText(i + 1, baseX + 130, baseY + 41);
            context.fillText(event.roster[i].upgrade, baseX + 31, baseY + 277);

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
                    case "car":
                        image = carImage;
                        value = value.carID;
                        let car = getCar(value);
                        if (car["cr"] > 849) context.fillStyle = "#ffb80d";
                        else if (car["cr"] > 699) context.fillStyle = "#9e3fff";
                        else if (car["cr"] > 549) context.fillStyle = "#ff3639";
                        else if (car["cr"] > 399) context.fillStyle = "#ffd737";
                        else if (car["cr"] > 249) context.fillStyle = "#37cdff";
                        else if (car["cr"] > 99) context.fillStyle = "#78ff53";
                        else context.fillStyle = "#aaaaaa";
                        break;
                    case "pack":
                        image = packImage;
                        let pack = getPack(value);
                        if (pack["packName"].toLowerCase().includes("elite")) {
                            context.fillStyle = "#ff3639";
                        } else if (pack["packName"].toLowerCase().includes("booster")) {
                            context.fillStyle = "#78ff53";
                        } else {
                            context.fillStyle = "#ffd737";
                        }
                        break;
                    default:
                        break;
                }

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
