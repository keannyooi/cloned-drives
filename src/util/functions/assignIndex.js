// this function hasn't been fixed yet, pls wait...
"use strict";

const Canvas = require("canvas");

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

module.exports = assignIndex;