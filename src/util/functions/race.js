"use strict";

const bot = require("../../config/config.js");
const { createCanvas } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage, BotError } = require("../classes/classes.js");
const { driveHierarchy, gcHierarchy, failedToLoadImageLink } = require("../consts/consts.js");
const { evalScore, trackPens } = require("./raceScore.js");
const { renderHudCanvas } = require("./generateHud.js");
const { getScaledImage } = require("./imageCache.js");

const RACE_WIDTH = 674;
const RACE_HEIGHT = 379;

/**
 * Load the track background (pre-scaled to the race canvas, via imageCache)
 * with a timeout — rejects if it takes too long so the catch block can handle
 * it. A timed-out download still lands in the cache for the next race.
 */
function loadImageWithTimeout(src, ms = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Image load timeout: ${src}`)), ms);
        getScaledImage(src, RACE_WIDTH, RACE_HEIGHT)
            .then(img => { clearTimeout(timer); resolve(img); })
            .catch(err => { clearTimeout(timer); reject(err); });
    });
}

// Scoring (Race Formula v2.0) lives in raceScore.js — the one copy every
// generator, script and checker shares. This file renders and explains it.

async function race(message, player, opponent, currentTrack, disablegraphics, silentResult) {
    message.channel.sendTyping();
    // Strict: throws on a weather/surface combo with no weatherVars entry.
    const pens = trackPens(currentTrack);
    const { tyrePen } = pens;
    let attachment;
    
    if (!disablegraphics && !silentResult) {
        try {
            const canvas = createCanvas(RACE_WIDTH, RACE_HEIGHT);
            const context = canvas.getContext("2d");
            // HUDs are composed via renderHudCanvas so the printed stats are the
            // EXACT values this race runs on — including driver-boosted player
            // stats (Race Week) and the opponent's tuned stats.
            const [background, playerHud, opponentHud] = await Promise.all([
                loadImageWithTimeout(currentTrack["background"]),
                renderHudCanvas(player),
                renderHudCanvas(opponent),
            ]);

            context.drawImage(background, 0, 0, canvas.width, canvas.height);
            context.drawImage(bot.graphics.raceTemp, 0, 0, canvas.width, canvas.height);
            context.drawImage(playerHud, 35, 69, 186, 113);
            context.drawImage(opponentHud, 457, 198, 186, 112);
            attachment = new AttachmentBuilder(await canvas.encode("jpeg"), { name: "thing.jpeg" });
        }
        catch (error) {
            attachment = new AttachmentBuilder(failedToLoadImageLink, { name: "thing.jpeg" });
        }
    }

    const result = evalScore(player, opponent, currentTrack, { pens });
    const raceInfo = compare(player, opponent, (result > 0));
    let resultMessage;
    if (isNaN(result)) {
        resultMessage = new ErrorMessage({
            channel: message.channel,
            title: `Erroneous result detected. Don't worry, I've already reported this to the devs and this race won't affect anything.`,
            desc: `__Selected Track: ${currentTrack["trackName"]}__`,
            author: message.author
        });

        const errorReport = new BotError({
            guild: message.guild,
            channel: message.channel,
            message,
            stack: "Erroneous race result detected, click on link for more info.",
        });
        await errorReport.sendReport();
    }
    else if (result > 0) {
        resultMessage = new SuccessMessage({
            channel: message.channel,
            title: `You won by ${result} point(s)! (insert crab rave here)`,
            desc: `__Selected Track: ${currentTrack["trackName"]}__`,
            author: message.author,
            fields: [{ name: "The winning car had the following advantages", value: raceInfo }]
        });
    }
    else if (result === 0) {
        resultMessage = new InfoMessage({
            channel: message.channel,
            title: "You tied with the opponent? How?",
            desc: `__Selected Track: ${currentTrack["trackName"]}__`,
            author: message.author,
        });
    }
    else {
        resultMessage = new ErrorMessage({
            channel: message.channel,
            title: `You lost by ${Math.abs(result)} point(s). (insert sad violin noises)`,
            desc: `__Selected Track: ${currentTrack["trackName"]}__`,
            author: message.author,
            fields: [{ name: "The winning car had the following advantages", value: raceInfo }]
        });
    }

    // PvP runs many races back-to-back and only wants the final summary embed,
    // not per-race spam. When silentResult is true, skip posting the result
    // message and just return the score.
    if (!silentResult) {
        await resultMessage.sendMessage({ attachment, preserve: true });
    }
    return result;

    function compare(player, opponent, playerWon) {
        const comparison = {
            "topSpeed": player.topSpeed - opponent.topSpeed,
            "0to60": opponent.accel - player.accel,
            "handling": player.handling - opponent.handling,
            "weight": opponent.weight - player.weight,
            "mra": player.mra - opponent.mra,
            "ola": opponent.ola - player.ola,
            "gc": gcHierarchy.indexOf(opponent.gc) - gcHierarchy.indexOf(player.gc),
            "driveType": driveHierarchy.indexOf(opponent.driveType) - driveHierarchy.indexOf(player.driveType),
            "tyreType": (tyrePen[opponent.tyreType] - tyrePen[player.tyreType]) ?? 0,
            "abs": player.abs - opponent.abs,
            "tcs": player.tcs - opponent.tcs
        };
        let response = "";

        for (let [key, value] of Object.entries(comparison)) {
            const compareValue = currentTrack["specsDistr"][key];
            if (!playerWon) {
                value -= value * 2;
            }

            if (compareValue !== undefined && compareValue > 0 && value > 0) {
                switch (key) {
                    case "topSpeed":
                        response += "Higher top speed, ";
                        break;
                    case "0to60":
                        response += "Lower 0-60, ";
                        break;
                    case "handling":
                        response += "Better handling, ";
                        break;
                    case "weight":
                        response += "Lower mass, ";
                        break;
                    case "mra":
                        response += "Better mid-range acceleration, ";
                        break;
                    case "ola":
                        response += "Better off-the-line acceleration, ";
                        break;
                    default:
                        break;
                }
            }
            else if (value > 0) {
                switch (key) {
                    case "gc":
                        if (currentTrack["humps"] > 0) {
                            response += "Higher ground clearance, ";
                        }
                        else if (currentTrack["speedbumps"] > 0 && (opponent.gc === "Low" || player.gc === "Low")) {
                            response += "Higher ground clearance, ";
                        }
                        break;
                    case "driveType":
                        if (!["Asphalt", "Drag", "Track"].includes(currentTrack["surface"]) || currentTrack["weather"] === "Rainy") {
                            response += "Better drive system for the surface conditions, ";
                        }
                        break;
                    case "tyreType":
                        if (currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") {
                            response += "Better tyres for the surface conditions, ";
                        }
                        break;
                    case "abs":
                        if ((currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") && currentTrack["specsDistr"]["handling"] > 0) {
                            response += "ABS, ";
                        }
                        break;
                    case "tcs":
                        if (currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") {
                            response += "Traction Control, ";
                        }
                        break;
                    default:
                        break;
                }
            }

            //special cases
            if (currentTrack["trackName"].includes("MPH") && key === "topSpeed") {
                let [, endMPH] = currentTrack["trackName"].split("-");
                endMPH = parseInt(endMPH);

                if (comparison["topSpeed"] - (playerWon ? 0 : comparison["topSpeed"] * 2) > 0 && opponent.topSpeed < endMPH && player.topSpeed < endMPH) {
                    response = "Higher top speed, ";
                    break;
                }
            }
        }

        if (response === "") {
            return "Sorry, we have no idea how you won/lost.";
        }
        else {
            return response.slice(0, -2);
        }
    }
}

module.exports = race;
