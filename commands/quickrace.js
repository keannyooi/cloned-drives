
/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const tracksets = fs.readdirSync("./commands/tracksets").filter(file => file.endsWith('.json'));

module.exports = {
    name: "quickrace",
    aliases: ["qr"],
    usage: "<track name goes here>",
    args: true,
    adminOnly: false,
    cooldown: 10,
    description: "Does a quick race where you can choose the trackset and the opponent car. Great for testing out cars.",
    async execute(message, args) {
        const db = message.client.db;
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };
        var searchResults = [];
        const raceCommand = require("./sharedfiles/race.js");
        const player = await db.get(`acc${message.author.id}.hand`);
        if (!player) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, it looks like your hand is empty.")
                .setDescription("Use `cd-sethand` to set your hand!")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        var trackset = args[0].toLowerCase();
        for (i = 1; i < args.length; i++) {
            trackset += (" " + args[i].toLowerCase());
        }

        var counter = 0;
        var searched = 0;
        while (counter < tracksets.length) {
            var currentTrack = require(`./tracksets/${tracksets[counter]}`);
            var currentName = currentTrack["trackName"].toLowerCase();
            if (currentName.includes(trackset)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = currentTrack;
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentTrack = searchResults[0];
            if (searched > 1) {
                var trackList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    trackList += `${i} - ` + searchResults[i - 1]["trackName"] + "\n";
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple tracksets found, please type one of the following.")
                    .setDescription(trackList)
                    .setTimestamp();

                message.channel.send(infoScreen).then(currentMessage => {
                    message.channel.awaitMessages(filter, {
                        max: 1,
                        time: waitTime,
                        errors: ['time']
                    })
                        .then(collected => {
                            if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
                                collected.first().delete();
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Error, invalid integer provided.")
                                    .setDescription("It looks like your response was either not a number or not part of the selection.")
                                    .setTimestamp();
                                return currentMessage.edit(errorMessage);
                            }
                            else {
                                currentTrack = searchResults[parseInt(collected.first()) - 1];
                                chooseOpponent(currentMessage);
                                collected.first().delete();
                            }
                        })
                        .catch(() => {
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled automatically.")
                                .setTimestamp();
                            return currentMessage.edit(cancelMessage);
                        });
                });
            }
            else {
                chooseOpponent();
            }
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, track requested not found.")
                .setDescription("Well that sucks.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function chooseOpponent(currentMessage) {
            searchResults = [];
            const chooseScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`${currentTrack["trackName"]} has been chosen!`)
                .setDescription("Choose a car to race with by typing out the name of the car.")
                .setTimestamp();
            var currentMessage2;
            if (currentMessage) {
                currentMessage2 = await currentMessage.edit(chooseScreen);
            }
            else {
                currentMessage2 = await message.channel.send(chooseScreen);
            }

            message.channel.awaitMessages(filter, {
                max: 1,
                time: waitTime,
                errors: ['time']
            })
                .then(collected => {
                    var counter = 0;
                    var searched = 0;
                    while (counter < carFiles.length) {
                        var currentCar = require(`./cars/${carFiles[counter]}`);
                        var currentName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
                        if (currentName.includes(collected.first().content.toLowerCase())) {
                            console.log("found!");
                            console.log(currentName)
                            searchResults[searched] = { carFile: carFiles[counter], gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 };
                            searched++;
                        }
                        counter++;
                    }

                    collected.first().delete();
                    if (searched > 0) {
                        var currentCar = searchResults[0];
                        console.log(searchResults);
                        if (searched > 1) {
                            var carList = "";
                            for (i = 1; i <= searchResults.length; i++) {
                                console.log(searched);
                                const car = require(`./cars/${searchResults[i - 1].carFile}`);
                                carList += `${i} - ` + car["make"] + " " + car["model"] + " (" + car["modelYear"] + ")\n"
                            }

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Multiple cars found, please type one of the following.")
                                .setDescription(carList)
                                .setTimestamp();

                            currentMessage2.edit(infoScreen).then(() => {
                                message.channel.awaitMessages(filter, {
                                    max: 1,
                                    time: waitTime,
                                    errors: ['time']
                                })
                                    .then(collected => {
                                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
                                            collected.first().delete();
                                            const errorMessage = new Discord.MessageEmbed()
                                                .setColor("#fc0303")
                                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                                .setTitle("Error, invalid integer provided.")
                                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                                .setTimestamp();
                                            return currentMessage2.edit(errorMessage);
                                        }
                                        else {
                                            currentCar = searchResults[parseInt(collected.first()) - 1];
                                            collected.first().delete();
                                            return upgrade(currentCar, currentMessage2);
                                        }
                                    })
                                    .catch(() => {
                                        const cancelMessage = new Discord.MessageEmbed()
                                            .setColor("#34aeeb")
                                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                            .setTitle("Action cancelled automatically.")
                                            .setTimestamp();
                                        return currentMessage2.edit(cancelMessage);
                                    });
                            });
                        }
                        else {
                            return upgrade(currentCar, currentMessage2);
                        }
                    }
                    else {
                        const errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, car requested not found.")
                            .setDescription("Well that sucks. Try going against another car!")
                            .setTimestamp();
                        return currentMessage.edit(errorMessage);
                    }
                })
                .catch(error => {
                    console.log(error);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return currentMessage.edit(cancelMessage);
                });
        }

        async function upgrade(currentCar, currentMessage2) {
            const car = require(`./cars/${currentCar.carFile}`);
            const chooseScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`${car["make"]} ${car["model"]} (${car["modelYear"]}) selected!`)
                .setDescription("Select a tune your opponent's car (that is, any tune that is either `stock`, `333`, `666`, `996`, `969` or `699`).")
                .setImage(car["card"])
                .setTimestamp();

            var currentMessage = await currentMessage2.edit(chooseScreen);
            message.channel.awaitMessages(filter, {
                max: 1,
                time: waitTime,
                errors: ['time']
            })
                .then(collected => {
                    switch (collected.first().content.toLowerCase()) {
                        case "996":
                            if (car["racehudMaxed996"] === "") {
                                collected.first().delete();
                                const errorScreen = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Error, the tuning stage you requested is not supported.")
                                    .setDescription("There is a possiblity that the maxed tune your car has isn't available. If that's the case, report it to the devs.")
                                    .setTimestamp();
                                return currentMessage.edit(errorScreen);
                            }
                            else {
                                collected.first().delete();
                                currentCar.gearingUpgrade = 9;
                                currentCar.engineUpgrade = 9;
                                currentCar.chassisUpgrade = 6;
                            }
                            break;
                        case "969":
                            if (car["racehudMaxed969"] === "") {
                                collected.first().delete();
                                const errorScreen = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Error, the tuning stage you requested is not supported.")
                                    .setDescription("There is a possiblity that the maxed tune your car has isn't available. If that's the case, report it to the devs.")
                                    .setTimestamp();
                                return currentMessage.edit(errorScreen);
                            }
                            else {
                                collected.first().delete();
                                currentCar.gearingUpgrade = 9;
                                currentCar.engineUpgrade = 6;
                                currentCar.chassisUpgrade = 9;
                            }
                            break;
                        case "699":
                            if (car["racehudMaxed699"] === "") {
                                collected.first().delete();
                                const errorScreen = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Error, the tuning stage you requested is not supported.")
                                    .setDescription("There is a possiblity that the maxed tune your car has isn't available. If that's the case, report it to the devs.")
                                    .setTimestamp();
                                return currentMessage.edit(errorScreen);
                            }
                            else {
                                collected.first().delete();
                                currentCar.gearingUpgrade = 6;
                                currentCar.engineUpgrade = 9;
                                currentCar.chassisUpgrade = 9;
                            }
                            break;
                        case "666":
                            collected.first().delete();
                            currentCar.gearingUpgrade = 6;
                            currentCar.engineUpgrade = 6;
                            currentCar.chassisUpgrade = 6;
                            break;
                        case "333":
                            collected.first().delete();
                            currentCar.gearingUpgrade = 3;
                            currentCar.engineUpgrade = 3;
                            currentCar.chassisUpgrade = 3;
                            break;
                        case "stock":
                            collected.first().delete();
                            break;
                        default:
                            collected.first().delete();
                            const errorScreen = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, the tuning stage you requested is not supported.")
                                .setDescription("In order to make the tuning system less complex, the tuning stages are limited to `stock`, `333`, `666`, `996`, `969` and `699`. There is also a possiblity that the maxed tune you requested for the opponent car has isn't available. If that's the case, report it to the devs.")
                                .setTimestamp();
                            return currentMessage.edit(errorScreen);
                    }

                    const playerList = createList(player);
                    const opponentList = createList(currentCar);
                    const playerCar = createCar(player);
                    const opponentCar = createCar(currentCar);
                    const intermission = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Ready to Play? (React with ✅ to proceed or ❎ to cancel.)")
                        .setDescription(`Selected Trackset: ${currentTrack["trackName"]}`)
                        .addFields(
                            { name: "Your Hand", value: playerList, inline: true },
                            { name: "Opponent's Hand", value: opponentList, inline: true }
                        )
                        .setTimestamp();

                    currentMessage.edit(intermission).then(() => {
                        currentMessage.react("✅");
                        currentMessage.react("❎");
                        currentMessage.awaitReactions(emojiFilter, {
                            max: 1,
                            time: 10000,
                            errors: ["time"]
                        })
                            .then(collected => {
                                currentMessage.reactions.removeAll();
                                if (collected.first().emoji.name === "✅") {
                                    raceCommand.race(message, playerCar, opponentCar, currentTrack);
                                }
                                else if (collected.first().emoji.name === "❎") {
                                    const cancelMessage = new Discord.MessageEmbed()
                                        .setColor("#34aeeb")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                        .setTitle("Action cancelled.")
                                        .setTimestamp();
                                    return currentMessage.edit(cancelMessage);
                                }
                            })
                            .catch(error => {
                                console.error(error);
                                currentMessage.reactions.removeAll();
                                const cancelMessage = new Discord.MessageEmbed()
                                    .setColor("#34aeeb")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Action cancelled automatically.")
                                    .setTimestamp();
                                return currentMessage.edit(cancelMessage);
                            });
                    })
                        .catch(() => {
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled automatically.")
                                .setTimestamp();
                            return currentMessage.edit(cancelMessage);
                        });
                });

            function createList(currentCar) {
                const car = require(`./cars/${currentCar.carFile}`);
                const rarity = rarityCheck(car);
                var carSpecs = `(${rarity} ${car["rq"]}) ${car["make"]} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]\n`;

                switch (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) {
                    case 0:
                        carSpecs += `Top Speed: ${car["topSpeed"]}MPH\n`;
                        carSpecs += `0-60MPH: ${car["0to60"]} sec\n`;
                        carSpecs += `Handling: ${car["handling"]}\n`;
                        break;
                    case 9:
                        carSpecs += `Top Speed: ${car["1StarTopSpeed"]}MPH\n`;
                        carSpecs += `0-60MPH: ${car["1Star0to60"]} sec\n`;
                        carSpecs += `Handling: ${car["1StarHandling"]}\n`;
                        break;
                    case 18:
                        carSpecs += `Top Speed: ${car["2StarTopSpeed"]}MPH\n`;
                        carSpecs += `0-60MPH: ${car["2Star0to60"]} sec\n`;
                        carSpecs += `Handling: ${car["2StarHandling"]}\n`;
                        break;
                    case 24:
                        carSpecs += `Top Speed: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedTopSpeed`]}MPH\n`;
                        carSpecs += `0-60MPH: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Maxed0to60`]} sec\n`;
                        carSpecs += `Handling: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedHandling`]}\n`;
                        break;
                    default:
                        break;
                }
                carSpecs += `Drive Type: ${car["driveType"]}\n`;
                carSpecs += `${car["tyreType"]} Tyres\n`;
                carSpecs += `Weight: ${car["weight"]}kg\n`;
                carSpecs += `Ground Clearance: ${car["gc"]}\n`;
                carSpecs += `TCS: ${car["tcs"]}, ABS: ${car["abs"]}\n`;
                carSpecs += `MRA: ${car["mra"]}\n`;
                carSpecs += `OLA: ${car["ola"]}\n`;

                return carSpecs;
            }

            function getRacehud(currentCar, upgrade) {
                switch (upgrade) {
                    case "000":
                        return currentCar["racehudStock"];
                    case "333":
                        return currentCar["racehud1Star"];
                    case "666":
                        return currentCar["racehud2Star"];
                    case "996":
                        return currentCar["racehudMaxed996"];
                    case "969":
                        return currentCar["racehudMaxed969"];
                    case "699":
                        return currentCar["racehudMaxed699"];
                    default:
                        return;
                }
            }

            function createCar(currentCar) {
                const car = require(`./cars/${currentCar.carFile}`);
                var carModule = {
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
                    racehud: getRacehud(car, `${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`)
                };

                switch (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) {
                    case 0:
                        break;
                    case 9:
                        carModule.topSpeed = car["1StarTopSpeed"];
                        carModule.accel = car["1Star0to60"];
                        carModule.handling = car["1StarHandling"];
                        break;
                    case 18:
                        carModule.topSpeed = car["2StarTopSpeed"];
                        carModule.accel = car["2Star0to60"];
                        carModule.handling = car["2StarHandling"];
                        break;
                    case 24:
                        carModule.topSpeed = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedTopSpeed`];
                        carModule.accel = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Maxed0to60`];
                        carModule.handling = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedHandling`];
                    default:
                        break;
                }
                if (carModule.topSpeed < 100) {
                    carModule.mra = 0;
                }
                if (carModule.topSpeed < 60) {
                    carModule.ola = 0;
                }

                return carModule;
            }

            function rarityCheck(currentCar) {
                if (currentCar["rq"] > 79) { //leggie
                    return message.guild.emojis.cache.find(emoji => emoji.name === "legendary");
                }
                else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                    return message.guild.emojis.cache.find(emoji => emoji.name === "epic");
                }
                else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                    return message.guild.emojis.cache.find(emoji => emoji.name === "ultrarare");
                }
                else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                    return message.guild.emojis.cache.find(emoji => emoji.name === "superrare");
                }
                else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                    return message.guild.emojis.cache.find(emoji => emoji.name === "rare");
                }
                else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                    return message.guild.emojis.cache.find(emoji => emoji.name === "uncommon");
                }
                else { //common
                    return message.guild.emojis.cache.find(emoji => emoji.name === "common");
                }
            }
        }
    }
}