
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
    args: 1,
	isExternal: true,
    adminOnly: false,
    cooldown: 10,
    description: "Does a quick race where you can choose the trackset and the opponent car. Great for testing out cars.",
    async execute(message, args) {
        const db = message.client.db;
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };
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

        var trackset = args.map(i => i.toLowerCase());
        var searchResults = tracksets.filter(function (track) {
            return trackset.every(part => track.includes(part));
        });

		var currentTrack;
        if (searchResults.length > 1) {
            var trackList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let track = require(`./tracksets/${searchResults[i - 1]}`);
                trackList += `${i} - ` + track["trackName"] + "\n";
            }

            if (trackList.length > 2048) {
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, too many search results.")
                    .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                    .setTimestamp();
                return message.channel.send(errorMessage);
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
                            currentTrack = require(`./tracksets/${searchResults[parseInt(collected.first()) - 1]}`);
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
        else if (searchResults.length > 0) {
			currentTrack = require(`./tracksets/${searchResults[0]}`);
            chooseOpponent();
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
			let handCar = require(`./cars/${player.carFile}`);
			let make = handCar["make"];
			if (typeof make === "object") {
				make = handCar["make"][0];
			}
			let handName = `${make} ${handCar["model"]} (${handCar["modelYear"]})`;
            const chooseScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`${currentTrack["trackName"]} has been chosen!`)
                .setDescription(`Choose a car to race with by typing out the name of the car.
				Your Hand: ${handName}`)
                .setImage(currentTrack["background"])
                .setTimestamp();
            let currentMessage2;
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
                    let carName = collected.first().content.split(" ").map(i => i.toLowerCase());

                    searchResults = carFiles.filter(function (car) {
                        return carName.every(part => car.includes(part));
                    });

                    collected.first().delete();
                    if (searchResults.length > 1) {
                        var carList = "";
                        for (i = 1; i <= searchResults.length; i++) {
                            const car = require(`./cars/${searchResults[i - 1]}`);
							let make = car["make"];
							if (typeof make === "object") {
								make = car["make"][0];
							}
                            carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`
                        }

                        if (carList.length > 2048) {
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, too many search results.")
                                .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
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
                                        let currentCar = searchResults[parseInt(collected.first()) - 1];
                                        collected.first().delete();
                                        upgrade(currentCar, currentMessage2);
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
                    else if (searchResults.length > 0) {
                        upgrade(searchResults[0], currentMessage2);
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
            const car = require(`./cars/${currentCar}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const chooseScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`${make} ${car["model"]} (${car["modelYear"]}) selected!`)
                .setDescription("Select a tune your opponent's car (that is, any tune that is either `000`, `333`, `666`, `996`, `969` or `699`).")
                .setImage(car["card"])
                .setTimestamp();

            var currentMessage = await currentMessage2.edit(chooseScreen);
            message.channel.awaitMessages(filter, {
                max: 1,
                time: waitTime,
                errors: ['time']
            })
                .then(collected => {
					collected.first().delete();
					let upgrade = collected.first().content.toLowerCase();
					if (!car[`racehud${upgrade}`] || car[`racehud${upgrade}`] === "") {
						const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, the tuning stage you requested is not supported.")
                            .setDescription("There is a possiblity that the maxed tune your car has isn't available. If that's the case, report it to the devs.")
                            .setTimestamp();
                        return currentMessage.edit(errorScreen);
					}

                    const playerList = createList(player);
                    const opponentList = createList({ carFile: currentCar, gearingUpgrade: upgrade[0], engineUpgrade: upgrade[1], chassisUpgrade: upgrade[2] });
                    const playerCar = createCar(player);
                    const opponentCar = createCar({ carFile: currentCar, gearingUpgrade: upgrade[0], engineUpgrade: upgrade[1], chassisUpgrade: upgrade[2] });
                    const intermission = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Ready to Play!")
                        .setDescription(`Selected Trackset: ${currentTrack["trackName"]}`)
                        .addFields(
                            { name: "Your Hand", value: playerList, inline: true },
                            { name: "Opponent's Hand", value: opponentList, inline: true }
                        )
                        .setTimestamp();
                    currentMessage.edit(intermission);
                    return raceCommand.race(message, playerCar, opponentCar, currentTrack);
                });

            function createList(currentCar) {
                const car = require(`./cars/${currentCar.carFile}`);
                const rarity = rarityCheck(car);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
                let carSpecs = `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]\n`;

                if (currentCar.gearingUpgrade > 0) {
                    carSpecs += `Top Speed: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}TopSpeed`]}MPH\n`;
                    carSpecs += `0-60MPH: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}0to60`]} sec\n`;
                    carSpecs += `Handling: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Handling`]}\n`;
                }
                else {
                    carSpecs += `Top Speed: ${car["topSpeed"]}MPH\n`;
                    carSpecs += `0-60MPH: ${car["0to60"]} sec\n`;
                    carSpecs += `Handling: ${car["handling"]}\n`;
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

            function createCar(currentCar) {
                const car = require(`./cars/${currentCar.carFile}`);
                const carModule = {
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

            function rarityCheck(currentCar) {
                if (currentCar["rq"] > 79) { //leggie
                    return message.client.emojis.cache.get("726025494138454097");
                }
                else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                    return message.client.emojis.cache.get("726025468230238268");
                }
                else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                    return message.client.emojis.cache.get("726025431937187850");
                }
                else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                    return message.client.emojis.cache.get("726025394104434759");
                }
                else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                    return message.client.emojis.cache.get("726025302656024586");
                }
                else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                    return message.client.emojis.cache.get("726025273421725756");
                }
                else { //common
                    return message.client.emojis.cache.get("726020544264273928");
                }
            }
        }
    }
}