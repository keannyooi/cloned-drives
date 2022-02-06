"use strict";

const { MessageActionRow } = require("discord.js");
const Canvas = require("canvas");
const { rarityCheck, carNameGen, getButtons, paginate, calcTotal, unbritish } = require("./primary.js");
const { ErrorMessage, InfoMessage } = require("./classes.js");
const { defaultWaitTime, defaultChoiceTime, defaultPageLimit } = require("./consts.js");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const bot = require("../../config.js");

// assisting functions (these won't be exported to other files)

async function processResults(message, searchResults, listGen, type, currentMessage) {
    const filter = (response) => response.author.id === message.author.id;
    const size = Array.isArray(searchResults) ? searchResults.length : searchResults.size;

    if (size > 1) {
        const list = listGen();
        if (list.length > 4096) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Due to Discord's embed limitations, the bot isn't able to show the full list of search results.",
                desc: "Try again with a more specific keyword.",
                author: message.author
            });
            return errorMessage.sendMessage({ currentMessage });
        }

        const infoScreen = new InfoMessage({
            channel: message.channel,
            title: "Multiple results found, please type one of the following.",
            desc: list,
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to decide.`
        });
        currentMessage = await infoScreen.sendMessage({ currentMessage, preserve: true });

        try {
            const collected = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: defaultWaitTime,
                errors: ["time"]
            });

            let selection = collected.first().content;
            if (!message.channel.type.includes("DM")) {
                collected.first().delete();
            }
            if (isNaN(selection) || parseInt(selection) > size || parseInt(selection) < 1) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, invalid integer provided.",
                    desc: `Your response was not a number between \`1\` and \`${size}\`.`,
                    author: message.author
                }).displayClosest(selection);
                return errorMessage.sendMessage({ currentMessage });
            }
            else {
                let result;
                if (Array.isArray(searchResults)) {
                    result = searchResults[parseInt(selection) - 1];
                }
                else {
                    result = searchResults.get(Array.from(searchResults.keys())[parseInt(selection) - 1]);
                }
                return [result, currentMessage];
            }
        }
        catch (error) {
            console.log(error);
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Act quicker next time.`,
                author: message.author
            });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
    else if (size > 0) {
        if (Array.isArray(searchResults)) {
            searchResults.push(currentMessage);
            return searchResults;
        }
        else {
            return [Array.from(searchResults)[0][1], currentMessage];
        }
    }
    else {
        throw ((query, searchList) => {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, query provided yielded no results.",
                desc: "Well that sucks.",
                author: message.author
            }).displayClosest(query, type !== "id" ? searchList : null);
            return errorMessage.sendMessage({ currentMessage });
        });
    }
}

//main functions (these will be exported to other files)

async function assignIndex(deck, currentRound, graphics) {
    const raceCommand = require("./race.js");
    const wait = message.channel.send("**Loading deck screen, this may take a while... (please wait)**");
    const filter = response => {
        return response.author.id === message.author.id;
    };
    let opponentList = "", trackList = "";

    for (let i = 0; i < 5; i++) {
        let car = require(`../cars/${currentRound["hand"][i]}`);
        let track = require(`../tracksets/${currentRound["tracksets"][i]}`);
        let make = car["make"];
        if (typeof make === "object") {
            make = car["make"][0];
        }
        let rarity = rarityCheck(car);
        opponentList += `${i + 1} - (${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${currentRound["tunes"][i]}]\n`;
        trackList += `${i + 1} - ${track.trackName}\n`;
    }
    let deckScreen = new Discord.MessageEmbed()
        .setColor("#34aeeb")
        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
        .setTitle("Assign the cards in your deck to their respective indexes, from left to right.")
        .setDescription("Make sure the indexes are seperated with a space, for example `1 2 3 4 5`.")
        .addFields({ name: "Opponents", value: opponentList, inline: true }, { name: "Tracksets", value: trackList, inline: true })
        .setTimestamp();
    if (graphics) {
        let attachment;
        try {
            const opponentPlacement = [{ x: 55, y: 63 }, { x: 195, y: 63 }, { x: 335, y: 63 }, { x: 475, y: 63 }, { x: 616, y: 63 }];
            const handPlacement = [{ x: 96, y: 301 }, { x: 236, y: 301 }, { x: 377, y: 301 }, { x: 517, y: 301 }, { x: 657, y: 301 }];
            const canvas = Canvas.createCanvas(794, 390);
            const ctx = canvas.getContext("2d");
            const track1 = require(`../tracksets/${currentRound["tracksets"][0]}`);
            const [foreground, background] = await Promise.all([
                await Canvas.loadImage("https://cdn.discordapp.com/attachments/715771423779455077/848829168234135552/deck_thing.png"),
                await Canvas.loadImage(track1["background"])
            ]);
            ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
            ctx.drawImage(foreground, 0, 0, canvas.width, canvas.height);
            for (let i = 0; i < 5; i++) {
                let playerCar = require(`../cars/${deck["hand"][i]}`);
                let opponentCar = require(`../cars/${currentRound["hand"][i]}`);
                let [playerHud, opponentHud] = await Promise.all([
                    Canvas.loadImage(playerCar[`racehud${deck["tunes"][i]}`]),
                    Canvas.loadImage(opponentCar[`racehud${currentRound["tunes"][i]}`])
                ]);
                ctx.drawImage(playerHud, handPlacement[i].x, handPlacement[i].y, 126, 76);
                ctx.drawImage(opponentHud, opponentPlacement[i].x, opponentPlacement[i].y, 126, 76);
            }
            attachment = new Discord.MessageAttachment(canvas.toBuffer(), "deck.png");
        }
        catch (error) {
            console.log(error);
            let errorPic = "https://cdn.discordapp.com/attachments/716917404868935691/786411449341837322/unknown.png";
            attachment = new Discord.MessageAttachment(errorPic, "deck.png");
        }
        deckScreen.attachFiles(attachment);
        deckScreen.setImage("attachment://deck.png");
    }
    (await wait).delete();
    let result = 0;
    await message.channel.send(deckScreen);
    await message.channel.awaitMessages(filter, {
        max: 1,
        time: 180000,
        errors: ["time"]
    })
        .then(async (collected) => {
            let indexes = collected.first().content.split(" ");
            if (message.channel.type === "text") {
                collected.first().delete();
            }
            if (indexes.length < 5) {
                result = "kekw";
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, indexes provided incomplete.")
                    .setDescription("Where should the other cards go?")
                    .addField("Indexes Received", `\`${indexes}\` (less than 5 indexes detected)`)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
            else if (indexes.find(i => isNaN(i) || i < 1 || i > 5) !== undefined) {
                result = "kekw";
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, indexes provided invalid.")
                    .setDescription("All indexes provided must be a number between `1 ~ 5`.")
                    .addField("Indexes Received", `\`${indexes}\` (at least 1 index either not a number or not within the range of 1 and 5)`)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
            else if ((new Set(indexes).size !== indexes.length)) {
                result = "kekw";
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, duplicate index values detected.")
                    .setDescription("You may not assign 2 cards into the same spot.")
                    .addField("Indexes Received", `\`${indexes}\` (at least 2 indexes found to be the same)`)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
            for (let i = 0; i < 5; i++) {
                let player = createCar({
                    carFile: deck["hand"][parseInt(indexes[i] - 1)],
                    gearingUpgrade: parseInt(deck["tunes"][parseInt(indexes[i] - 1)][0]),
                    engineUpgrade: parseInt(deck["tunes"][parseInt(indexes[i] - 1)][1]),
                    chassisUpgrade: parseInt(deck["tunes"][parseInt(indexes[i] - 1)][2])
                });
                let opponent = createCar({
                    carFile: currentRound["hand"][i],
                    gearingUpgrade: parseInt(currentRound["tunes"][i][0]),
                    engineUpgrade: parseInt(currentRound["tunes"][i][1]),
                    chassisUpgrade: parseInt(currentRound["tunes"][i][2])
                });
                let track = require(`../tracksets/${currentRound["tracksets"][i]}`);
                result += await raceCommand.race(player, opponent, track);
            }
        })
        .catch(error => {
            console.log(error);
            result = "kekw";
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const cancelMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Action cancelled automatically.")
                .setTimestamp();
            return message.channel.send(cancelMessage);
        });
    if (result !== "kekw") {
        result = Math.round((result + Number.EPSILON) * 100) / 100;
        if (result > 0) {
            const winMessage = new Discord.MessageEmbed()
                .setColor("#03fc24")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`You won by ${result} points!`)
                .setDescription("Winner winner chicken dinner!")
                .setTimestamp();
            message.channel.send(winMessage);
        }
        else if (result === 0) {
            const tieMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("You tied with the oppoenent!")
                .setDescription("That is indeed very unlikely to happen.")
                .setTimestamp();
            message.channel.send(tieMessage);
        }
        else {
            const loseMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`You lost by ${Math.abs(result)} points.`)
                .setDescription("*(evil morty theme song plays in the background)*")
                .setTimestamp();
            message.channel.send(loseMessage);
        }
    }
    return result;

    function createCar(currentCar) {
        const car = require(`../cars/${currentCar.carFile}`);
        let make = car["make"];
        if (typeof make === "object") {
            make = car["make"][0];
        }
        const carModule = {
            rq: car["rq"],
            topSpeed: car["topSpeed"],
            accel: car["0to60"],
            handling: car["handling"],
            driveType: car["driveType"],
            tyreType: car["tyreType"],
            weight: car["weight"],
            gc: car["gc"],
            tcs: car["tcs"],
            abs: car["abs"],
            mra: car["mra"],
            ola: car["ola"],
            racehud: car[`racehud${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`]
        };
        if (currentCar.gearingUpgrade > 0) {
            carModule.topSpeed = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}TopSpeed`];
            carModule.accel = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}0to60`];
            carModule.handling = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Handling`];
        }
        if (carModule.topSpeed < 100) {
            carModule.mra = 0;
        }
        if (carModule.topSpeed < 30) {
            carModule.ola = 0;
        }
        return carModule;
    }
}

async function searchUser(message, username, currentMessage) {
    const playerList = await bot.homeGuild.members.fetch();
    const searchResults = playerList.filter(member => {
        return member.nickname?.toLowerCase().includes(username) || member.user.username.toLowerCase().includes(username);
    });
    
    return processResults(message, searchResults, () => {
        let list = "", i = 1;
        searchResults.map(player => {
            list += `${i} - ${player.user.tag}\n`;
            i++;
        });
        return list;
    }, null, currentMessage)
        .catch(throwError => {
            const list = [];
            playerList.forEach(player => {
                list.push(player.user.tag);
            });
            return throwError(username, list);
        });
}

//args list: message, query, garage, amount, searchByID, restrictedMode, currentMessage
async function searchGarage(args) {
    let matchList = [];
    const searchResults = args.garage.filter(s => {
        let matchFound, isSufficient;
        if (args.searchByID) {
            matchFound = s.carID === args.query[0];
        }
        else {
            let currentCar = require(`../cars/${s.carID}.json`);
            let name = carNameGen({ currentCar, removePrizeTag: true }).toLowerCase().split(" ");
            matchFound = args.query.every(part => name.includes(part));
            if (matchFound) matchList.push(s);
        }
        if (args.restrictedMode) {
            isSufficient = (s.upgrades["000"] + s.upgrades["333"] + s.upgrades["666"]) >= args.amount;
        }
        else {
            isSufficient = calcTotal(s) >= args.amount;
        }

        return matchFound && isSufficient;
    });

    return processResults(args.message, searchResults, () => {
        let list = "", i = 1;
        searchResults.map(car => {
            let currentCar = require(`../cars/${car.carID}.json`);
            list += `${i} - ${carNameGen({ currentCar })}\n`;
            i++;
        });
        return list;
    }, null, args.currentMessage)
        .catch(throwError => {
            if (matchList.length > 0) {
                let list = "";
                for (let i = 0; i < matchList.length; i++) {
                    let currentCar = require(`../cars/${matchList[i].carID}.json`), newLine = "";
                    newLine = carNameGen({ currentCar, rarity: rarityCheck(currentCar) });
                    if (!currentCar["isPrize"]) {
                        let upgList = "";
                        for (let [key, value] of Object.entries(matchList[i].upgrades)) {
                            if (value !== 0) upgList += `${value}x ${key}, `;
                        }
                        newLine += ` \`(${upgList.slice(0, -2)}, not enough to perform action)\``;
                    }
                    if (list.length + newLine.length > 1024) { //discord embed field value limit
                        list += "...etc";
                        break;
                    }
                    else {
                        list += `${newLine}\n`;
                    }
                }

                const errorMessage = new ErrorMessage({
                    channel: args.message.channel,
                    title: `Error, ${args.amount} non-maxed, non-prize car(s) of the same tune required to perform this action.`,
                    author: args.message.author,
                    fields: [{ name: "Cars Found", value: list }]
                });
                return errorMessage.sendMessage({ currentMessage: args.currentMessage });
            }
            else {
                let list = [];
                if (args.searchByID) {
                    list = args.garage.map(car => car.carID);
                }
                else {
                    list = args.garage.map(car => {
                        let currentCar = require(`../cars/${car.carID}.json`);
                        return carNameGen({ currentCar, removePrizeTag: true }).toLowerCase();
                    });
                }
                return throwError(args.query.join(" "), list);
            }
        });
}

async function search(message, query, searchList, type, currentMessage) {
    const searchResults = searchList.filter(s => {
        let test = listGen(s, type).toLowerCase().split(" ");
        return query.every(part => test.includes(part));
    });
    return processResults(message, searchResults, () => {
        let list = "";
        for (let i = 1; i <= searchResults.length; i++) {
            let hmm = listGen(searchResults[i - 1], type, true);
            list += `${i} - ${hmm}\n`;
        }
        return list;
    }, type, currentMessage)
        .catch(throwError => {
            return throwError(query.join(" "), searchList.map(i => listGen(i, type, true).toLowerCase()));
        });

    function listGen(item, type, includeBrackets) {
        switch (type) {
            case "car":
                let currentCar = require(`../cars/${item}`);
                let a = carNameGen({ currentCar });
                if (!includeBrackets) {
                    a = a.replace("(", "").replace(")", "");
                }
                return a;
            case "pack":
            case "track":
                let details = require(`../${type}s/${item}`);
                return details[`${type}Name`];
            case "id":
                return typeof item === "string" ? item.replace(".json", "") : item.id;
            default:
                return item.name;
        }
    }
}

function sortCars(list, sort, order, garage) {
    return list.sort(function (a, b) {
        let carA = require(`../cars/${typeof a === "string" ? a : a.carID}`);
        let carB = require(`../cars/${typeof b === "string" ? b : b.carID}`);

        let critA = carA[sort], critB = carB[sort];
        if (sort === "topSpeed" || sort === "0to60" || sort === "handling") {
            let checkOrder = ["333", "666", "699", "969", "996"];
            let format = sort.charAt(0).toUpperCase() + sort.slice(1);
            for (let upg of checkOrder) {
                if (a[upg] > 0) {
                    critA = carA[`${upg}${format}`];
                }
                if (b[upg] > 0) {
                    critB = carB[`${upg}${format}`];
                }
            }
        }
        else if (sort === "mostowned") {
            let upgA, upgB;
            if (garage) {
                upgA = garage.find(c => a.includes(c.carID));
                upgB = garage.find(c => b.includes(c.carID));
            }

            if (upgA === 0 && upgB === 0) {
                critA = critB = 0;
            }
            else {
                critA = calcTotal(upgA ?? a);
                critB = calcTotal(upgB ?? b);
            }

        }

        if (critA === critB) {
            return carNameGen({ currentCar: carA }) > carNameGen({ currentCar: carB }) ? 1 : -1;
        }
        else {
            let someBool = (sort === "0to60" || sort === "weight" || sort === "ola");
            if ((order === "ascending") ? !someBool : someBool) { //basically a logical XOR gate
                return critA - critB;
            }
            else {
                return critB - critA;
            }
        }
    });
}

async function listUpdate(list, page, totalPages, listDisplay, settings, currentMessage) {
    const pageLimit = settings.listamount || defaultPageLimit;
    const filter = button => button.user.id === embed.authorID;
    let section = paginate(list, page, settings.listamount);
    let { firstPage, prevPage, nextPage, lastPage } = getButtons("menu", settings.buttonstyle);
    let embed = listDisplay(section, page, totalPages);

    if (list.length <= pageLimit) {
        firstPage.setDisabled(true);
        prevPage.setDisabled(true);
        nextPage.setDisabled(true);
        lastPage.setDisabled(true);
    }
    else if (list.length <= page * pageLimit) {
        firstPage.setDisabled(false);
        prevPage.setDisabled(false);
        nextPage.setDisabled(true);
        lastPage.setDisabled(true);
    }
    else if (page === 1) {
        firstPage.setDisabled(true);
        prevPage.setDisabled(true);
        nextPage.setDisabled(false);
        lastPage.setDisabled(false);
    }
    else {
        firstPage.setDisabled(false);
        prevPage.setDisabled(false);
        nextPage.setDisabled(false);
        lastPage.setDisabled(false);
    }

    let row = new MessageActionRow({ components: [firstPage, prevPage, nextPage, lastPage] });
    let listMessage = await embed.sendMessage({ buttons: [row], currentMessage });

    const collector = listMessage.message.createMessageComponentCollector({ filter, time: defaultWaitTime });
    collector.on("collect", async (button) => {
        try {
            switch (button.customId) {
                case "first_page":
                    page = 1;
                    break;
                case "prev_page":
                    page -= 1;
                    break;
                case "next_page":
                    page += 1;
                    break;
                case "last_page":
                    page = totalPages;
                    break;
                default:
                    break;
            }
    
            section = paginate(list, page, settings.listamount);
            if (list.length <= pageLimit) {
                firstPage.setDisabled(true);
                prevPage.setDisabled(true);
                nextPage.setDisabled(true);
                lastPage.setDisabled(true);
            }
            else if (list.length <= page * pageLimit) {
                firstPage.setDisabled(false);
                prevPage.setDisabled(false);
                nextPage.setDisabled(true);
                lastPage.setDisabled(true);
            }
            else if (page === 1) {
                firstPage.setDisabled(true);
                prevPage.setDisabled(true);
                nextPage.setDisabled(false);
                lastPage.setDisabled(false);
            }
            else {
                firstPage.setDisabled(false);
                prevPage.setDisabled(false);
                nextPage.setDisabled(false);
                lastPage.setDisabled(false);
            }
    
            row = new MessageActionRow({ components: [firstPage, prevPage, nextPage, lastPage] });
            embed = listDisplay(section, page, totalPages, currentMessage);
            listMessage = await embed.sendMessage({ buttons: [row], currentMessage: listMessage });
            await button.deferUpdate();
        }
        catch (error) {
            console.log("mmm error found");
        }
    });
    collector.on("end", () => {
        return listMessage.removeButtons();
    });
}

function filterCheck(car, filter, garage) {
    let passed = true, carObject = garage ? {
        carID: car,
        upgrades: garage.find(c => car.includes(c.carID))?.upgrades ?? {
            "000": 0,
            "333": 0,
            "666": 0,
            "996": 0,
            "969": 0,
            "699": 0,
        }
    } : car;
    let currentCar = require(`../cars/${carObject.carID}`);

    for (const [key, value] of Object.entries(filter)) {
        switch (typeof value) {
            case "object":
                if (Array.isArray(value)) {
                    let checkArray = currentCar[key];
                    if (!Array.isArray(checkArray)) {
                        checkArray = [checkArray];
                    }
                    checkArray = checkArray.map(tag => tag.toLowerCase());

                    if (value.every(tag => checkArray.includes(tag)) === false) {
                        passed = false;
                    }
                }
                else {
                    if (currentCar[key] < value.start || currentCar[key] > value.end) {
                        passed = false;
                    }
                }
                break;
            case "string":
                if (key === "search") {
                    if (!carNameGen({ currentCar }).toLowerCase().includes(value)) {
                        passed = false;
                    }
                }
                else {
                    if (currentCar[key].toLowerCase() !== value) {
                        passed = false;
                    }
                }
                break;
            case "boolean":
                switch (key) {
                    case "isPrize":
                        if (currentCar[key] !== value) {
                            passed = false;
                        }
                        break;
                    case "isStock":
                        if ((carObject.upgrades["000"] > 0) !== value) {
                            passed = false;
                        }
                        break;
                    case "isMaxed":
                        if ((carObject.upgrades["996"] + carObject.upgrades["969"] + carObject.upgrades["699"] > 0) !== value) {
                            passed = false;
                        }
                        break;
                    case "isOwned":
                        if ((calcTotal(carObject) > 0) !== value) {
                            passed = false;
                        }
                        break;
                    default:
                        break;
                }
                break;
            default:
                break;
        }
    }
    return passed;
}

async function confirm(message, confirmationMessage, acceptedFunction, buttonStyle, currentMessage) {
    const filter = (button) => button.user.id === message.author.id;
    const { yse, nop } = getButtons("choice", buttonStyle);
    const row = new MessageActionRow({ components: [yse, nop] });
    const reactionMessage = await confirmationMessage.sendMessage({ currentMessage, buttons: [row], preserve: true });
    let processed = false;

    const collector = message.channel.createMessageComponentCollector({ filter, time: defaultChoiceTime });
    collector.on("collect", async (button) => {
        if (!processed) {
            processed = true;
            switch (button.customId) {
                case "yse":
                    try {
                        await acceptedFunction(reactionMessage);
                    }
                    catch (error) {
                        throw error;
                    }
                    break;
                case "nop":
                    confirmationMessage.editEmbed({ title: "Action cancelled." });
                    await confirmationMessage.sendMessage({ currentMessage: reactionMessage });
                    return confirmationMessage.removeButtons();
                default:
                    break;
            }
        }
    });
    collector.on("end", async () => {
        if (!processed) {
            confirmationMessage.editEmbed({
                title: "Action cancelled automatically.",
                desc: `I can only wait for you for ${defaultChoiceTime / 1000} seconds. Please act quicker next time.`
            });
            await confirmationMessage.sendMessage({ currentMessage: reactionMessage });
            return confirmationMessage.removeButtons();
        }
    });
}

function openPack(message, currentPack, currentMessage) {
    const cardFilter = currentPack["filter"];
    let rand, check, rqStart, rqEnd, pulledCards = "";
    let currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
    const addedCars = [];

    for (let i = 0; i < currentPack["repetition"] * 5; i++) {
        rand = Math.floor(Math.random() * 1000) / 10;
        check = 0;
        for (let rarity of Object.keys(currentPack["packSequence"][Math.floor(i / currentPack["repetition"])])) {
            check += currentPack["packSequence"][Math.floor(i / currentPack["repetition"])][rarity];
            if (check > rand) {
                switch (rarity) {
                    case "common":
                        rqStart = 1;
                        rqEnd = 19;
                        break;
                    case "uncommon":
                        rqStart = 20;
                        rqEnd = 29;
                        break;
                    case "rare":
                        rqStart = 30;
                        rqEnd = 39;
                        break;
                    case "superRare":
                        rqStart = 40;
                        rqEnd = 49;
                        break;
                    case "ultraRare":
                        rqStart = 50;
                        rqEnd = 64;
                        break;
                    case "epic":
                        rqStart = 65;
                        rqEnd = 79;
                        break;
                    case "legendary":
                        rqStart = 80;
                        rqEnd = 999;
                        break;
                    default:
                        break;
                }
                break;
            }
        }

        let carFile = carFiles[Math.floor(Math.random() * carFiles.length)], timeoutCounter = 0;
        currentCard = require(`../cars/${carFile}`);
        while ((currentCard["rq"] < rqStart || currentCard["rq"] > rqEnd || filterCard(currentCard, cardFilter) === false) && timeoutCounter < 10000) {
            carFile = carFiles[Math.floor(Math.random() * carFiles.length)];
            currentCard = require(`../cars/${carFile}`);
            timeoutCounter++;
        }

        if (timeoutCounter >= 10000) {
            const errorScreen = new ErrorMessage({
                channel: message.channel,
                title: "Error, pack generation timed out likely due to no cars in generation pool.",
                desc: "Don't worry, your money is refunded. (provided that you bought the pack)",
                author: message.author,
                footer: "Disclaimer: There is an *extremely* rare chance of this error to pop up even though nothing went wrong."
            });
            return errorScreen.sendMessage({ currentMessage });
        }
        addedCars.push({ carID: carFile.slice(0, 6), upgrade: "000"});
    }

    addedCars.sort(function (a, b) {
        const carA = require(`../cars/${a.carID}.json`);
        const carB = require(`../cars/${b.carID}.json`);
        if (carA["rq"] === carB["rq"]) {
            let nameA = carNameGen({ currentCar: carA });
            let nameB = carNameGen({ currentCar: carB });

            return nameA > nameB ? 1 : -1;
        }
        else {
            return carA["rq"] - carB["rq"];
        }
    });

    for (let i = 0; i < addedCars.length; i++) {
        let currentCar = require(`../cars/${addedCars[i].carID}.json`);
        pulledCards += carNameGen({ currentCar: currentCar, rarity: rarityCheck(currentCar) });

        if ((i + 1) % 5 !== 0) {
            pulledCards += ` **[[Card]](${currentCar["card"]})**`;
            pulledCards += "\n";
        }
        else {
            const packScreen = new InfoMessage({
                channel: message.channel,
                title: `Opening ${currentPack["packName"]}...`,
                desc: "Click on the image to see the cards better.",
                author: message.author,
                image: currentCar["card"],
                thumbnail: currentPack["pack"],
                fields: [{ name: "Cards Pulled", value: pulledCards }]
            });
            i === 4 ? packScreen.sendMessage({ currentMessage }) : packScreen.sendMessage();
            pulledCards = "";
        }
    }
    return addedCars;

    function filterCard(currentCard, filter) {
        let passed = true;
        if (currentCard["isPrize"] === false) {
            for (let criteria in filter) {
                if (filter[criteria] !== "None") {
                    switch (criteria) {
                        case "make":
                        case "tags":
                            if (Array.isArray(currentCard[criteria])) {
                                if (currentCard[criteria].some(m => m === filter[criteria]) === false) passed = false;
                            }
                            else {
                                if (currentCard[criteria] !== filter[criteria]) passed = false;
                            }
                            break;
                        case "modelYear":
                        case "seatCount":
                            if (currentCard[criteria] < filter[criteria]["start"] || currentCard[criteria] > filter[criteria]["end"]) passed = false;
                            break;
                        default:
                            if (currentCard[criteria] !== filter[criteria]) passed = false;
                            break;
                    }
                }
            }
        }
        else {
            passed = false;
        }
        return passed;
    }
}

function createCar(currentCar, unitPreference) {
    const car = require(`../cars/${currentCar.carID}.json`);
    const rarity = rarityCheck(car);
    const carModule = {
        rq: car["rq"],
        topSpeed: car["topSpeed"],
        accel: car["0to60"],
        handling: car["handling"],
        driveType: car["driveType"],
        tyreType: car["tyreType"],
        weight: car["weight"],
        enginePos: car["enginePos"],
        gc: car["gc"],
        tcs: car["tcs"],
        abs: car["abs"],
        mra: car["mra"],
        ola: car["ola"],
        racehud: car[`racehud${currentCar.upgrade}`]
    };
    if (currentCar.upgrade !== "000") {
        carModule.topSpeed = car[`${currentCar.upgrade}TopSpeed`];
        carModule.accel = car[`${currentCar.upgrade}0to60`];
        carModule.handling = car[`${currentCar.upgrade}Handling`];
    }

    let carSpecs = carNameGen({ currentCar: car, rarity, upgrade: currentCar.upgrade });
    if (unitPreference === "metric") {
        carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH (${unbritish(carModule.topSpeed, "topSpeed")}KM/H)\n`;
    }
    else {
        carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH\n`;
    }
    if (carModule.topSpeed < 60) {
        carModule.accel = 99.9;
        carSpecs += "0-60MPH: N/A\n";
    }
    else {
        if (unitPreference === "metric") {
            carSpecs += `0-60MPH: ${carModule.accel} sec (0-100KM/H: ${unbritish(carModule.accel, "0to60")} sec)\n`;
        }
        else {
            carSpecs += `0-60MPH: ${carModule.accel} sec\n`;
        }
    }

    carSpecs += `Handling: ${carModule.handling}
    ${carModule.enginePos} Engine, ${carModule.driveType}
    ${carModule.tyreType} Tyres\n`;
    if (unitPreference === "imperial") {
        carSpecs += `Weight: ${carModule.weight}kg (${unbritish(carModule.weight, "weight")}lbs)\n`;
    }
    else {
        carSpecs += `Weight: ${carModule.weight}kg\n`;
    }

    carSpecs += `Ground Clearance: ${carModule.gc}
    TCS: ${carModule.tcs}, ABS: ${carModule.abs}\n`;
    if (carModule.topSpeed < 100) {
        carModule.mra = 0;
        carSpecs += "MRA: N/A\n";
    }
    else {
        carSpecs += `MRA: ${carModule.mra}\n`;
    }
    if (carModule.topSpeed < 30) {
        carModule.ola = 0;
        carSpecs += "OLA: N/A\n";
    }
    else {
        carSpecs += `OLA: ${carModule.ola}\n`;
    }

    return [carModule, carSpecs];
}

module.exports = {
    assignIndex,
    search,
    searchUser,
    searchGarage,
    sortCars,
    listUpdate,
    filterCheck,
    confirm,
    openPack,
    createCar
};