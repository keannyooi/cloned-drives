"use strict";

const { MessageButton, MessageActionRow, MessageSelectMenu, MessageAttachment } = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const { ErrorMessage, InfoMessage, BotError, SuccessMessage } = require("./classes.js");
const { defaultWaitTime, defaultPageLimit, carSave, weatherVars, driveHierarchy, gcHierarchy } = require("./consts.js");
const bot = require("../../config.js");

function rarityCheck(car) {
    if (car["collection"]) {
        return bot.emojis.cache.get("831967206446465064");
    }
    else if (car["rq"] > 79) { //leggie
        return bot.emojis.cache.get("857512942471479337");
    }
    else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
        return bot.emojis.cache.get("726025468230238268");
    }
    else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
        return bot.emojis.cache.get("726025431937187850");
    }
    else if (car["rq"] > 39 && car["rq"] <= 49) { //super
        return bot.emojis.cache.get("857513197937623042");
    }
    else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
        return bot.emojis.cache.get("726025302656024586");
    }
    else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
        return bot.emojis.cache.get("726025273421725756");
    }
    else { //common
        return bot.emojis.cache.get("726020544264273928");
    }
}

//args list: currentCar, rarity, upgrade, removePrizeTag
function carNameGen(args) {
    const trophyEmoji = bot.emojis.cache.get("775636479145148418");
    let make = args.currentCar["make"];
    if (typeof make === "object") {
        make = args.currentCar["make"][0];
    }
    let currentName = `${make} ${args.currentCar["model"]} (${args.currentCar["modelYear"]})`;
    if (args.rarity) {
        currentName = `(${args.rarity} ${args.currentCar["rq"]}) ${currentName}`;
    }
    if (args.upgrade) {
        currentName += ` [${args.upgrade}]`;
    }
    if (!args.removePrizeTag && args.currentCar["isPrize"]) {
        currentName += ` ${trophyEmoji}`;
    }
    return currentName;
}

function unbritish(value, type) {
    switch (type) {
        case "0to60":
        case "accel":
            return (value * 1.036).toFixed(1);
        case "weight":
            return Math.round(value * 2.20462262185).toString();
        case "topSpeed":
            return Math.round(value * 1.60934).toString();
        default:
            return;
    }
}

function getButtons(type, buttonStyle) {
    switch (type) {
        case "menu":
            let firstPage, prevPage, nextPage, lastPage;
            if (buttonStyle === "classic") {
                firstPage = new MessageButton({
                    emoji: "⏪",
                    style: "SECONDARY",
                    customId: "first_page"
                });
                prevPage = new MessageButton({
                    emoji: "⬅️",
                    style: "SECONDARY",
                    customId: "prev_page"
                });
                nextPage = new MessageButton({
                    emoji: "➡️",
                    style: "SECONDARY",
                    customId: "next_page"
                });
                lastPage = new MessageButton({
                    emoji: "⏩",
                    style: "SECONDARY",
                    customId: "last_page"
                });
            }
            else {
                firstPage = new MessageButton({
                    label: "<<",
                    style: "DANGER",
                    customId: "first_page"
                });
                prevPage = new MessageButton({
                    label: "<",
                    style: "PRIMARY",
                    customId: "prev_page"
                });
                nextPage = new MessageButton({
                    label: ">",
                    style: "PRIMARY",
                    customId: "next_page"
                });
                lastPage = new MessageButton({
                    label: ">>",
                    style: "DANGER",
                    customId: "last_page"
                });
            }
            return { firstPage, prevPage, nextPage, lastPage };
        case "choice":
            let yse, nop;
            if (buttonStyle === "classic") {
                yse = new MessageButton({
                    emoji: "✅",
                    style: "SECONDARY",
                    customId: "yse"
                });
                nop = new MessageButton({
                    emoji: "❎",
                    style: "SECONDARY",
                    customId: "nop"
                });
            }
            else {
                yse = new MessageButton({
                    label: "Yes!",
                    style: "SUCCESS",
                    customId: "yse"
                });
                nop = new MessageButton({
                    label: "No!",
                    style: "DANGER",
                    customId: "nop"
                });
            }
            return { yse, nop };
        case "rr":
            return;
        default:
            return;
    }
}

function paginate(list, page, pageLimit) {
    let limit = pageLimit || defaultPageLimit;
    return list.slice((page - 1) * limit, page * limit);
}

async function selectUpgrade(message, currentCar, amount, currentMessage, targetUpgrade) {
    const filter = (button) => button.user.id === message.author.id && button.customId === "upgrade_select";
    const getCard = require(`../cars/${currentCar.carID}.json`);
    let isOne = Object.keys(currentCar.upgrades).filter(m => {
        if (targetUpgrade && ((m.includes("6") && m.includes("9")) || Number(targetUpgrade) <= Number(m))) return false;
        return currentCar.upgrades[m] >= amount;
    });

    if (isOne.length === 1) {
        return [isOne[0]];
    }
    else if (isOne.length > 1) {
        const options = [];
        for (let upg of isOne) {
            options.push({
                label: upg === "000" ? "Stock upgrade" : `${upg} upgrade`,
                value: upg
            });
        }
        const dropdownList = new MessageSelectMenu({
            customId: "upgrade_select",
            placeholder: "Select a tune...",
            options,
        });
        const row = new MessageActionRow({ components: [dropdownList] });

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: `Choose one of the ${isOne.length} available tunes below.`,
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to consider.`,
            image: getCard["card"]
        });
        currentMessage = await infoMessage.sendMessage({ currentMessage, buttons: [row] });

        try {
            const selection = await message.channel.awaitMessageComponent({
                filter,
                max: 1,
                time: defaultWaitTime,
                errors: ["time"]
            });
            await selection.deferUpdate();
            await currentMessage.removeButtons();
            return [selection.values[0], currentMessage];
        }
        catch (error) {
            const cancelMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Please act quicker next time.`,
                author: message.author
            });
            await cancelMessage.sendMessage({ currentMessage });
            return cancelMessage.removeButtons();
        }
    }
    else {
        const cancelMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, no compatible upgrades found for target upgrade.",
            desc: "Correct tuning order: `000` => `333` => `666` => `996`, `969` or `699`.",
            author: message.author
        }).displayClosest(targetUpgrade);
        return cancelMessage.sendMessage({ currentMessage });
    }
}

function calcTotal(car) {
    if (typeof car !== "object") return 0;
    return Object.values(car.upgrades).reduce((total, amount) => total + amount);
}

function addCars(garage, cars) {
    for (let i = 0; i < cars.length; i++) {
        let isInGarage = garage.findIndex(garageCar => garageCar.carID === cars[i]);
        if (isInGarage !== -1) {
            garage[isInGarage].upgrades["000"] += 1;
        }
        else {
            garage.push({
                carID: cars[i].slice(0, 6),
                upgrades: carSave
            });
        }
    }
    return garage;
}

function updateHands(playerData, carID, origUpg, newUpg) {
    if (playerData.hand?.carID === carID && playerData.hand?.upgrade === origUpg) {
        if (newUpg === "remove") {
            playerData.hand = { carID: "", upgrade: "000" };
        }
        else {
            playerData.hand.upgrade = newUpg;
        }
    }
    for (let i = 0; i < playerData.decks.length; i++) {
        let x = playerData.decks[i].hand.findIndex(c => c.carID === carID && c.upgrade === origUpg);
        if (x > -1) {
            if (newUpg === "remove") {
                playerData.decks[i].hand[x] = "";
                playerData.decks[i].tunes[x] = "000";
            }
            else {
                playerData.decks[i].tunes[x] = newUpg;
            }
        }
    }
    return playerData;
}

function sortCheck(message, sort, currentMessage) {
    switch (sort) {
        case "rq":
        case "handling":
        case "weight":
        case "mra":
        case "ola":
        case "mostowned":
            return sort;
        case "topspeed":
            return "topSpeed";
        case "accel":
            return "0to60";
        default:
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, sorting criteria not found.",
                desc: `Here is a list of sorting criterias. 
                \`-s topspeed\` - Sort by top speed. 
                \`-s accel\` - Sort by acceleration. 
                \`-s handling\` - Sort by handling. 
                \`-s weight\` - Sort by weight. 
                \`-s mra\` - Sort by mid-range acceleraion. 
                \`-s ola\` - Sort by off-the-line acceleration.
                \`-s mostowned\` - Sort by how many copies of the car owned.`,
                author: message.author
            }).displayClosest(sort);
            return errorMessage.sendMessage({ currentMessage });
    }
}

function getFlag(code) {
    switch (code) {
        case "YU":
            return "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Flag_of_Yugoslavia_%281946-1992%29.svg/1000px-Flag_of_Yugoslavia_%281946-1992%29.svg.png";
        default:
            return `https://getflags.net/img1000/${code.toLowerCase()}.png`;
    }
}

async function race(message, player, opponent, currentTrack, disablegraphics) {
    const wait = message.channel.send("**Loading race, please wait... (may take a while)**");
    try {
        let description = `__Selected Track: ${currentTrack["trackName"]}__`;
        let attachment;
        if (!disablegraphics) {
            try {
                const canvas = createCanvas(674, 379);
                const ctx = canvas.getContext("2d");
                const [background, playerHud, opponentHud, map] = await Promise.all([
                    loadImage(currentTrack["background"]),
                    loadImage(player.racehud),
                    loadImage(opponent.racehud),
                    loadImage(currentTrack["map"])
                ]);

                ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
                ctx.drawImage(bot.graphics.raceTemp, 0, 0, canvas.width, canvas.height);
                ctx.drawImage(playerHud, 35, 69, 186, 113);
                ctx.drawImage(opponentHud, 457, 198, 186, 112);
                ctx.drawImage(map, 258, 228, 142, 142);
                attachment = new MessageAttachment(canvas.toBuffer(), "thing.png");
            }
            catch (error) {
                console.log(error);
                let errorPic = "https://cdn.discordapp.com/attachments/716917404868935691/786411449341837322/unknown.png";
                attachment = new MessageAttachment(errorPic, "thing.png");
            }
        }

        const { tcsPen, absPen, drivePen, tyrePen } = weatherVars[`${currentTrack["weather"]} ${currentTrack["surface"]}`];
        const result = evalScore(player, opponent);
        const raceInfo = compare(player, opponent, (result > 0));
        let resultMessage;
        if (result > 0) {
            resultMessage = new SuccessMessage({
                channel: message.channel,
                title: `You won by ${result} point(s)! (insert crab rave here)`,
                desc: description + `\nThe winning car had the following advantages: ${raceInfo}`,
                author: message.author,
            });
        }
        else if (result === 0) {
            resultMessage = new InfoMessage({
                channel: message.channel,
                title: "You tied with the opponent? How?",
                desc: description,
                author: message.author,
            });
        }
        else {
            resultMessage = new ErrorMessage({
                channel: message.channel,
                title: `You lost by ${result} point(s). (insert sad violin noises)`,
                desc: description + `\nThe winning car had the following advantages: ${raceInfo}`,
                author: message.author,
            });
        }

        resultMessage.sendMessage({ attachment });
        (await wait).delete();
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
            console.log(comparison);

            for (let [key, value] of Object.entries(comparison)) {
                const compareValue = currentTrack["specsDistr"][key];
                if (!playerWon) {
                    if (value > 0) {
                        value -= value * 2;
                    }
                    else {
                        value = Math.abs(value);
                    }
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
                let [startMPH, endMPH] = currentTrack["trackName"].slice(4, currentTrack["trackName"].length).split("-");
                startMPH = parseInt(startMPH);
                endMPH = parseInt(endMPH);

                if (opponent.topSpeed < startMPH && player.topSpeed >= startMPH) {
                    score = 250;
                }
                else if (opponent.topSpeed >= startMPH && player.topSpeed < startMPH) {
                    score = -250;
                }
                else if (opponent.topSpeed < startMPH && player.topSpeed < startMPH) {
                    if (opponent.topSpeed < player.topSpeed) {
                        score = 50;
                    }
                    else if (opponent.topSpeed > player.topSpeed) {
                        score = -50;
                    }
                    else {
                        score = 0;
                    }
                }
                else if (opponent.topSpeed < endMPH && player.topSpeed >= endMPH) {
                    score = 250;
                }
                else if (opponent.topSpeed >= endMPH && player.topSpeed < endMPH) {
                    score = -250;
                }
                else if (opponent.topSpeed < endMPH && player.topSpeed < endMPH) {
                    if (opponent.topSpeed < player.topSpeed) {
                        score = 50;
                    }
                    else if (opponent.topSpeed > player.topSpeed) {
                        score = -50;
                    }
                    else {
                        score = 0;
                    }
                }
            }

            return Math.round((score + Number.EPSILON) * 100) / 100;
        }
    }
    catch (error) {
        (await wait).delete();
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, failed to load race.",
            desc: `Something must have gone wrong. Don't worry, I've reported this issue to the devs.\n\`${error.stack}\``,
            author: message.author,
        });
        await errorMessage.sendMessage();

        const errorReport = new BotError({
            guild: message.guild,
            channel: message.channel,
            message,
            stack: error.stack,
        });
        return errorReport.sendReport();
    }
}

module.exports = {
    rarityCheck,
    carNameGen,
    unbritish,
    getButtons,
    paginate,
    selectUpgrade,
    calcTotal,
    addCars,
    updateHands,
    sortCheck,
    getFlag,
    race
};