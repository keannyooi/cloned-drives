
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
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "quickrace",
    aliases: ["qr"],
    usage: "<track name goes here>",
    args: 1,
	category: "Gameplay",
    cooldown: 10,
    description: "Does a quick race where you can choose the trackset and the opponent car. Great for testing out cars.",
    async execute(message, args) {
        const db = message.client.db;
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const raceCommand = require("./sharedfiles/race.js");
        const playerData = await db.get(`acc${message.author.id}`);
        const player = playerData.hand;
        if (!player) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, it looks like your hand is empty.")
                .setDescription("Use `cd-sethand` to set your hand!")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        let trackset = args.map(i => i.toLowerCase());
        let searchResults = tracksets.filter(function (track) {
            return trackset.every(part => track.includes(part));
        });

		let currentTrack;
        if (searchResults.length > 1) {
            let trackList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let track = require(`./tracksets/${searchResults[i - 1]}`);
                trackList += `${i} - ` + track["trackName"] + "\n";
            }

            if (trackList.length > 2048) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, too many search results.")
                    .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
					.addField("Total Characters in List", `\`${trackList.length}\` > \`2048\``)
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
						if (message.channel.type === "text") {
							collected.first().delete();
						}
                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
								.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                                .setTimestamp();
							if (message.channel.type === "text") {
								return currentMessage.edit(errorMessage);
							}
							else {
								return message.channel.send(errorMessage);
							}
                        }
                        else {
                            currentTrack = require(`./tracksets/${searchResults[parseInt(collected.first().content) - 1]}`);
                            chooseOpponent(currentMessage);
                        }
                    })
                    .catch(() => {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        if (message.channel.type === "text") {
							return currentMessage.edit(cancelMessage);
						}
						else {
							return message.channel.send(cancelMessage);
						}
                    });
            });
        }
        else if (searchResults.length > 0) {
			currentTrack = require(`./tracksets/${searchResults[0]}`);
            chooseOpponent();
        }
        else {
            let matches = stringSimilarity.findBestMatch(trackset.join(" "), tracksets.map(i => i.slice(0, -5)));
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, track requested not found.")
                .setDescription("Well that sucks.")
				.addField("Keywords Received", `\`${trackset.join(" ")}\`, true`)
                .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
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
            if (currentMessage && message.channel.type === "text") {
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
                .then(async collected => {
                    let carName = collected.first().content.split(" ").map(i => i.toLowerCase());
                    searchResults = carFiles.filter(function (car) {
                        return carName.every(part => car.includes(part));
                    });

                    if (message.channel.type === "text") {
						collected.first().delete();
					}
                    if (searchResults.length > 1) {
                        let carList = "";
                        for (i = 1; i <= searchResults.length; i++) {
                            const car = require(`./cars/${searchResults[i - 1]}`);
							let make = car["make"];
							if (typeof make === "object") {
								make = car["make"][0];
							}
                            carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`
                        }

                        if (carList.length > 2048) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, too many search results.")
                                .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
								.addField("Total Characters in List", `\`${carList.length}\` > \`2048\``)
                                .setTimestamp();
							if (message.channel.type === "text") {
								return currentMessage2.edit(errorMessage);
							}
							else {
								return message.channel.send(errorMessage);
							}
                        }

                        const infoScreen = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Multiple cars found, please type one of the following.")
                            .setDescription(carList)
                            .setTimestamp();

						if (message.channel.type === "text") {
							currentMessage2 = await currentMessage2.edit(infoScreen);
						}
						else {
							currentMessage2 = await message.channel.send(infoScreen);
						}
                        message.channel.awaitMessages(filter, {
                            max: 1,
                            time: waitTime,
                            errors: ["time"]
                        })
                            .then(collected => {
								if (message.channel.type === "text") {
									collected.first().delete();
								}
                                if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                    const errorMessage = new Discord.MessageEmbed()
                                        .setColor("#fc0303")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                        .setTitle("Error, invalid integer provided.")
                                        .setDescription("It looks like your response was either not a number or not part of the selection.")
										.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                                        .setTimestamp();
									if (message.channel.type === "text") {
										return currentMessage2.edit(errorMessage);
									}
									else {
										return message.channel.send(errorMessage);
									}
                                }
                                else {
                                    upgrade(searchResults[parseInt(collected.first().content) - 1], currentMessage2);
                                }
                            })
                            .catch(() => {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const cancelMessage = new Discord.MessageEmbed()
                                    .setColor("#34aeeb")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Action cancelled automatically.")
                                    .setTimestamp();
                                if (message.channel.type === "text") {
									return currentMessage2.edit(cancelMessage);
								}
								else {
									return message.channel.send(cancelMessage);
								}
                            });
                    }
                    else if (searchResults.length > 0) {
                        upgrade(searchResults[0], currentMessage2);
                    }
                    else {
                        let matches = stringSimilarity.findBestMatch(carName.join(" "), carFiles.map(i => i.slice(0, -5)));
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, car requested not found.")
                            .setDescription("Well that sucks. Try going against another car!")
							.addField("Keywords Received", `\`${carName.join(" ")}\``, true)
					        .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                            .setTimestamp();
                        if (message.channel.type === "text") {
							return currentMessage2.edit(errorMessage);
						}
						else {
							return message.channel.send(errorMessage);
						}
                    }
                })
                .catch(error => {
                    console.log(error);
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    if (message.channel.type === "text") {
						return currentMessage2.edit(cancelMessage);
					}
					else {
						return message.channel.send(cancelMessage);
					}
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

            let currentMessage;
			if (message.channel.type === "text") {
                currentMessage = await currentMessage2.edit(chooseScreen);
            }
            else {
                currentMessage = await message.channel.send(chooseScreen);
            }
            message.channel.awaitMessages(filter, {
                max: 1,
                time: waitTime,
                errors: ['time']
            })
                .then(collected => {
					if (message.channel.type === "text") {
						collected.first().delete();
					}
					let upgrade = collected.first().content.toLowerCase();
					if (!car[`racehud${upgrade}`] || car[`racehud${upgrade}`] === "") {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, the tuning stage you requested is not supported.")
                            .setDescription("In order to make the tuning system less complex, the tuning stages are limited to `000`, `333`, `666`, `996`, `969` and `699`.")
                            .addField("Value Received", `\`${collected.first().content}\``)
                            .setTimestamp();
						if (message.channel.type === "text") {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

                    const [playerCar, playerList] = createCar(player);
                    const [opponentCar, opponentList] = createCar({ carFile: currentCar, gearingUpgrade: upgrade[0], engineUpgrade: upgrade[1], chassisUpgrade: upgrade[2] });
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
					if (message.channel.type === "text") {
						currentMessage.edit(intermission);
					}
					else {
						message.channel.send(intermission);
					}
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    return raceCommand.race(message, playerCar, opponentCar, currentTrack, playerData.settings.enablegraphics);
                });

            function createCar(currentCar) {
                const car = require(`./cars/${currentCar.carFile}`);
				const rarity = rarityCheck(car);
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
                    enginePos: car["enginePos"],
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
    
                let carSpecs = `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]\n`;
                if (playerData.settings.unitpreference === "metric") {
                    let kph = Math.round(carModule.topSpeed * 1.60934);
                    carSpecs += `Top Speed: ${carModule.topSpeed}MPH (${kph}KM/H)\n`;
                }
                else {
                    carSpecs += `Top Speed: ${carModule.topSpeed}MPH\n`;
                }
                if (carModule.topSpeed < 60) {
                    carModule.accel = 99.9;
                    carSpecs += "0-60MPH: N/A\n";
                }
                else {
                    if (playerData.settings.unitpreference === "metric") {
                        let convertedAccel = (carModule.accel * 1.036).toFixed(1);
                        carSpecs += `0-60MPH: ${carModule.accel} sec (0-100KM/H: ${convertedAccel} sec)\n`;
                    }
                    else {
                        carSpecs += `0-60MPH: ${carModule.accel} sec\n`;
                    }
                }
                carSpecs += `Handling: ${carModule.handling}\n`;
                carSpecs += `${carModule.enginePos} Engine, ${carModule.driveType}\n`;
                carSpecs += `${carModule.tyreType} Tyres\n`;
                if (playerData.settings.unitpreference === "imperial") {
                    let pounds = Math.round(carModule.weight * 2.20462262185);
                    carSpecs += `Weight: ${carModule.weight}kg (${pounds}lbs)\n`;
                }
                else {
                    carSpecs += `Weight: ${carModule.weight}kg\n`;
                }
                carSpecs += `Ground Clearance: ${carModule.gc}\n`;
                carSpecs += `TCS: ${carModule.tcs}, ABS: ${carModule.abs}\n`;

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

            function rarityCheck(currentCar) {
                if (currentCar["rq"] > 79) { //leggie
                    return message.client.emojis.cache.get("857512942471479337");
                }
                else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                    return message.client.emojis.cache.get("726025468230238268");
                }
                else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                    return message.client.emojis.cache.get("726025431937187850");
                }
                else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                    return message.client.emojis.cache.get("857513197937623042");
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