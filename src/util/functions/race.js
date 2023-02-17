"use strict";

const bot = require("../../config/config.js");
const { createCanvas, loadImage } = require("canvas");
const { AttachmentBuilder } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage, BotError } = require("../classes/classes.js");
const { weatherVars, driveHierarchy, gcHierarchy, failedToLoadImageLink } = require("../consts/consts.js");

async function race(message, player, opponent, currentTrack, disablegraphics) {
    message.channel.sendTyping();
    const { tcsPen, absPen, drivePen, tyrePen } = weatherVars[`${currentTrack["weather"]} ${currentTrack["surface"]}`];
    let attachment;
    
    if (!disablegraphics) {
        try {
            const canvas = createCanvas(674, 379);
            const ctx = canvas.getContext("2d");
            const [background, playerHud, opponentHud] = await Promise.all([
                loadImage(currentTrack["background"]),
                loadImage(player.racehud),
                loadImage(opponent.racehud),
            ]);

            ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
            ctx.drawImage(bot.graphics.raceTemp, 0, 0, canvas.width, canvas.height);
            ctx.drawImage(playerHud, 35, 69, 186, 113);
            ctx.drawImage(opponentHud, 457, 198, 186, 112);
            attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "thing.jpg" });
        }
        catch (error) {
            attachment = new AttachmentBuilder(failedToLoadImageLink, { name: "thing.jpg" });
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
        //console.log(comparison);

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
                        if (currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") {
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
        score += (player.topSpeed - opponent.topSpeed) * (currentTrack["specsDistr"]["topSpeed"] / 100);
        score += (opponent.accel - player.accel) * 10 * (currentTrack["specsDistr"]["0to60"] / 100);
        score += (player.handling - opponent.handling) * (currentTrack["specsDistr"]["handling"] / 100);
        score += (opponent.weight - player.weight) / 50 * (currentTrack["specsDistr"]["weight"] / 100);
        score += (player.mra - opponent.mra) / 3 * (currentTrack["specsDistr"]["mra"] / 100);
        score += (opponent.ola - player.ola) * (currentTrack["specsDistr"]["ola"] / 100);

        if (player.gc.toLowerCase() === "low") {
            score -= (currentTrack["speedbumps"] * 10);
        }
        if (opponent.gc.toLowerCase() === "low") {
            score += (currentTrack["speedbumps"] * 10);
        }
        score += (gcHierarchy.indexOf(opponent.gc) - gcHierarchy.indexOf(player.gc)) * currentTrack["humps"] * 10;
        score += (driveHierarchy.indexOf(opponent.driveType) - driveHierarchy.indexOf(player.driveType)) * drivePen;
        score += ((tyrePen[opponent.tyreType]) - tyrePen[player.tyreType]);
        if (currentTrack["specsDistr"]["handling"] > 0) {
            score += (player.abs - opponent.abs) * absPen;
        }
        score += (player.tcs - opponent.tcs) * tcsPen;

        //special cases
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