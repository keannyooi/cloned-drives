"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage, BotError } = require("../classes/classes.js");
const { weatherVars, driveHierarchy, gcHierarchy, failedToLoadImageLink } = require("../consts/consts.js");

/** Load an image with a timeout — rejects if it takes too long so the catch block can handle it */
function loadImageWithTimeout(src, ms = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Image load timeout: ${src}`)), ms);
        loadImage(src)
            .then(img => { clearTimeout(timer); resolve(img); })
            .catch(err => { clearTimeout(timer); reject(err); });
    });
}

/**
 * Race Formula v2.0 - Balanced for 6-stat tune system
 * 
 * Changes from v1.0:
 * - Top Speed: ÷4.2 → ÷2 (+110% value)
 * - 0-60: ×15 → ×8 (-47% value)
 * - Handling: ×1 → ×1.2 (+20% value)
 * - Weight: ÷50 → ÷30 (+67% value)
 * - MRA: ÷10 → ÷6 (+67% value)
 * - OLA: ÷10 → ÷10 (unchanged)
 * 
 * This rebalancing ensures all three max tunes have viable niches:
 * - 996 (Drag): Wins on high TS + 0-60 tracks
 * - 969 (Balanced): Wins on mixed/balanced tracks
 * - 699 (Twisty): Wins on high handling + weight tracks
 */

async function race(message, player, opponent, currentTrack, disablegraphics) {
    message.channel.sendTyping();
    const { tcsPen, absPen, drivePen, tyrePen } = weatherVars[`${currentTrack["weather"]} ${currentTrack["surface"]}`];
    let attachment;
    
    if (!disablegraphics) {
        try {
            const canvas = createCanvas(674, 379);
            const context = canvas.getContext("2d");
            const [background, playerHud, opponentHud] = await Promise.all([
                loadImageWithTimeout(currentTrack["background"]),
                loadImageWithTimeout(player.racehud),
                loadImageWithTimeout(opponent.racehud),
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

    const result = evalScore(player, opponent);
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

    await resultMessage.sendMessage({ attachment, preserve: true });
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

    function evalScore(player, opponent) {
        let score = 0;
        
        // === REBALANCED FORMULA v2.0 ===
        
        // Top Speed: ÷2 (was ÷4.2) - Major buff to high-speed cars
        score += (player.topSpeed - opponent.topSpeed) / 2 * (currentTrack["specsDistr"]["topSpeed"] / 100);
        
        // 0-60: ×8 (was ×15) - Major nerf to launch-focused builds
        score += (opponent.accel - player.accel) * 8 * (currentTrack["specsDistr"]["0to60"] / 100);
        
        // Handling: ×1.2 (was ×1) - Slight buff to cornering ability
        score += (player.handling - opponent.handling) * 1.2 * (currentTrack["specsDistr"]["handling"] / 100);
        
        // Weight: ÷30 (was ÷50) - Buff to lightweight cars
        score += (opponent.weight - player.weight) / 30 * (currentTrack["specsDistr"]["weight"] / 100);
        
        // MRA: ÷6 (was ÷10) - Buff to high-speed acceleration
        score += (player.mra - opponent.mra) / 6 * (currentTrack["specsDistr"]["mra"] / 100);
        
        // OLA: ÷10 (unchanged) - Off-the-line acceleration
        score += (opponent.ola - player.ola) / 10 * (currentTrack["specsDistr"]["ola"] / 100);

        // Ground clearance penalties (unchanged)
        if (player.gc.toLowerCase() === "low") {
            score -= (currentTrack["speedbumps"] * 10);
        }
        if (opponent.gc.toLowerCase() === "low") {
            score += (currentTrack["speedbumps"] * 10);
        }
        score += (gcHierarchy.indexOf(opponent.gc) - gcHierarchy.indexOf(player.gc)) * currentTrack["humps"] * 10;
        
        // Surface/weather modifiers (unchanged)
        score += (driveHierarchy.indexOf(opponent.driveType) - driveHierarchy.indexOf(player.driveType)) * drivePen;
        score += ((tyrePen[opponent.tyreType]) - tyrePen[player.tyreType]);
        if (currentTrack["specsDistr"]["handling"] > 0) {
            score += (player.abs - opponent.abs) * absPen;
        }
        score += (player.tcs - opponent.tcs) * tcsPen;

        // MPH track special cases (unchanged)
        if (currentTrack["trackName"].includes("MPH")) {
            let [startMPH, endMPH] = currentTrack["trackName"].split("-");
            startMPH = parseInt(startMPH);
            endMPH = parseInt(endMPH);

            if ((opponent.topSpeed < startMPH && player.topSpeed >= startMPH) || (opponent.topSpeed < endMPH && player.topSpeed >= endMPH)) {
                score = 250;
            }
            else if ((opponent.topSpeed >= startMPH && player.topSpeed < startMPH) || (opponent.topSpeed >= endMPH && player.topSpeed < endMPH)) {
                score = -250;
            }
            else if (opponent.topSpeed < endMPH && player.topSpeed < endMPH) {
                score = player.topSpeed - opponent.topSpeed;
            }
        }

        return Math.round((score + Number.EPSILON) * 100) / 100;
    }
}

module.exports = race;
