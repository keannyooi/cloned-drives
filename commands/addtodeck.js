/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");

module.exports = {
    name: "addtodeck",
    usage: "<deck name goes here> | <index> | <car name goes here>",
    args: 3,
	isExternal: true,
    adminOnly: true,
    description: 'Adds (or replaces) a car to a specified slot in a specifed deck. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const deckName = args[0].toLowerCase();
        if (isNaN(args[1]) || args[1] > 5 || args[1] < 1) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, index provided is invalid or not a number.")
                .setDescription("Indexes must be a number and must be between 1 to 5.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

		const filter = response => {
            return response.author.id === message.author.id;
        };
        const searchResults = playerData.decks.filter(deck => {
			let currentName = deck.name.toLowerCase();
			return currentName.includes(deckName);
		});

        if (searchResults.length > 1) {
            let deckList = "";
            for (i = 1; i <= searchResults.length; i++) {
                deckList += `${i} - ${searchResults[i - 1].name} \n`;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple decks found, please type one of the following.")
                .setDescription(deckList)
                .setTimestamp();
            const currentMessage = await message.channel.send(infoScreen);
            message.channel.awaitMessages(filter, {
                max: 1,
                time: 30000,
                errors: ["time"]
            })
                .then(collected => {
					collected.first().delete();
                    if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, invalid integer provided.")
                            .setDescription("It looks like your response was either not a number or not part of the selection.")
                            .setTimestamp();
                        return currentMessage.edit(errorMessage);
                    }
                    else {
                        checkCar(earchResults[parseInt(collected.first()) - 1], currentMessage);
                    }
                })
                .catch(() => {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return currentMessage.edit(cancelMessage);
            	});
        }
		else if (searchResults.length > 0) {
			checkCar(searchResults[0]);
		}
        else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 deck not found.")
                .setDescription(`It looks like you don't have a deck named \`${deckName}\`.`)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function checkCar(currentDeck, currentMessage) {
            const garage = playerData.garage.filter(function (garageCar) {
                let upgrade = `${garageCar.gearingUpgrade}${garageCar.gearingUpgrade}${garageCar.gearingUpgrade}`
                let find = currentDeck.hand.find(function (deckCar) {
                    let currentUpgrade = `${deckCar.gearingUpgrade}${deckCar.gearingUpgrade}${deckCar.gearingUpgrade}`
                    return deckCar.carFile === garageCar.carFile && upgrade === currentUpgrade;
                });
                return find === undefined;
            });

            let carName = args.slice(2, args.length).map(i => i.toLowerCase());
            let searchResults = garage.filter(function (garageCar) {
                if (carName.every(part => garageCar.carFile.includes(part))) {
					let dupe = garageCar;
					for (let i = 0; i < currentDeck.hand.length; i++) {
						if (currentDeck.hand[i].carFile === dupe.carFile) {
							dupe[`${currentDeck.hand[i].gearingUpgrade}${currentDeck.hand[i].engineUpgrade}${currentDeck.hand[i].chassisUpgrade}`] -= 1;
						}
					}
					if (dupe["000"] + dupe["333"] + dupe["666"] + dupe["996"] + dupe["969"] + dupe["699"] <= 0) {
						return false;
					}
					else {
						return true;
					}
				}
				else {
					return false;
				}
            });

            if (searchResults.length > 1) {
                let carList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    let car = require(`./cars/${searchResults[i - 1].carFile}`);
					let make = car["make"];
					if (typeof make === "object") {
						make = car["make"][0];
					}
                    carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]}\n`;
                }

                if (carList.length > 2048) {
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
                    .setTitle("Multiple cars found, please type one of the following.")
                    .setDescription(carList);
                if (currentMessage) {
                    currentMessage.edit(infoScreen);
                }
                else {
                    message.channel.send(infoScreen);
                }
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: 30000,
                    errors: ["time"]
                })
                    .then(collected => {
						collected.first().delete();
                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {                         
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            selectUpgrade(searchResults[parseInt(collected.first()) - 1], currentDeck, currentMessage);
                        }
                    })
                    .catch(() => {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        return currentMessage.edit(cancelMessage);
                    })
            }
            else if (searchResults.length > 0) {
                if (currentMessage) {
                    selectUpgrade(searchResults[0], currentDeck, currentMessage);
                }
                else {
                    selectUpgrade(searchResults[0], currentDeck);
                }
            }
            else {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, car requested not found.")
                    .setDescription("Well that sucks. Perhaps you already have this car inside this deck?")
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(errorMessage);
                }
                else {
                    return message.channel.send(errorMessage);
                }
            }
        }

		async function selectUpgrade(currentCar, currentDeck, currentMessage) {
			let isOne = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && currentCar[m] >= 1);
			if (isOne.length === 1) {
				addCar(currentCar, isOne[0], currentDeck, currentMessage);
			}
			else {
				let upgradeList = "Type in any tune that is displayed here.\n";
				for (let upg of isOne) {
					upgradeList += `\`${upg}\`, `;
				}

				let infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Change from which tune?")
					.setDescription(upgradeList.slice(0, -2))
					.setTimestamp();
				let upgradeMessage;
				if (currentMessage) {
					upgradeMessage = await currentMessage.edit(infoScreen);
				}
				else {
					upgradeMessage = await message.channel.send(infoScreen);
				}

				message.channel.awaitMessages(filter, {
					max: 1,
					time: 60000,
					errors: ["time"]
				})
					.then(collected => {
						collected.first().delete();
						if (isOne.find(m => m === collected.first().content) === undefined) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, invalid selection provided.")
								.setDescription("It looks like your response was not part of the selection.")
								.setTimestamp();
							return upgradeMessage.edit(errorMessage);
						}
						else {
							addCar(currentCar, collected.first().content, currentDeck, currentMessage);
						}
					})
					.catch(() => {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const cancelMessage = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Action cancelled automatically.")
							.setTimestamp();
						return upgradeMessage.edit(cancelMessage);
					});
			}
		}

        async function addCar(currentCar, upgrade, currentDeck, currentMessage) {
			const index = Math.ceil(parseInt(args[1]));
            const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;
            const racehud = car[`racehud${upgrade}`];

            currentDeck.hand[index - 1] = { carFile: currentCar.carFile, gearingUpgrade: parseInt(upgrade[0]), engineUpgrade: parseInt(upgrade[1]), chassisUpgrade: parseInt(upgrade[2]) };
            await db.set(`acc${message.author.id}.decks`, playerData.decks);

			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully added your ${currentName} to slot ${index} of deck ${currentDeck.name}!`)
                .setImage(racehud)
                .setTimestamp();
            if (currentMessage) {
                return currentMessage.edit(infoScreen);
            }
            else {
                return message.channel.send(infoScreen);
            }
        }
    }
}