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
	name: "upgrade",
	aliases: ["tune", "u"],
	usage: "<car name goes here> <upgrade pattern>",
	args: true,
	adminOnly: false,
	description: "Upgrades a car in your garage.",
	async execute(message, args) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		const garage = playerData.garage;
		const upgrade = args[args.length - 1];

		if (!args[1]) {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, arguments provided insufficient.")
				.setDescription("Correct syntax: `cd-upgrade <car name goes here> <upgrade pattern>`")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		var carName = args[0].toLowerCase();
		const searchResults = [];
		const waitTime = 60000;
		const filter = response => {
			return response.author.id === message.author.id;
		};

		for (i = 1; i < args.length - 1; i++) {
			carName += (" " + args[i].toLowerCase());
		}

		var counter = 0;
		var searched = 0;
		while (counter < garage.length) {
			var currentCar = require(`./cars/${garage[counter].carFile}`);
			var currentName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
			if (currentName.includes(carName)) {
				console.log("found!");
				console.log(currentName)
				searchResults[searched] = garage[counter];
				searched++;
			}
			counter++;
		}

		if (searched > 0) {
			var currentCar = searchResults[0].carFile;
			if (searched > 1) {
				var carList = "";
				for (i = 1; i <= searchResults.length; i++) {
					currentCar = searchResults[i - 1].carFile;
					const car = require(`./cars/${currentCar}`);
					carList += `${i} - ` + car["make"] + " " + car["model"] + " (" + car["modelYear"] + `) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
				}

				const infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Multiple cars found, please type one of the following.")
					.setDescription(carList)
					.setTimestamp();

				message.channel.send(infoScreen).then(currentMessage => {
					message.channel.awaitMessages(filter, {
						max: 1,
						time: waitTime,
						errors: ['time']
					})
						.then(collected => {
							if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
								const errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, invalid integer provided.")
									.setDescription("It looks like your response was either not a number or not part of the selection.")
									.setTimestamp();
								return currentMessage.edit(errorMessage);
							}
							else {
								currentCar = searchResults[parseInt(collected.first()) - 1];
								upgradeCar(currentCar, currentMessage);
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
				upgradeCar(searchResults[0]);
			}
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you don't have that car.")
				.setDescription("Check if you got the order right: `cd-upgrade <car name goes here> <upgrade pattern>`")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		function error(currentCar, currentMessage) {
			var isMaxed;
			if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 24) {
				isMaxed = "Maxed";
			}
			else {
				isMaxed = "Not Maxed";
			}
			const errorScreen = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you attempted tuning your car in the wrong order.")
				.setDescription("Correct order: `333` -> `666` -> `996`, `969` or `699`.")
				.addField("Your car's current upgrade status", `${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade} (${isMaxed})`)
				.setTimestamp();
			if (currentMessage) {
				return currentMessage.edit(errorScreen);
			}
			else {
				return message.channel.send(errorScreen);
			}
		}

		function error2(currentCar, currentMessage) {
			const maxedTunes = [996, 969, 699];
			var tunes = "";
			for (i = 0; i < maxedTunes.length; i++) {
				console.log(maxedTunes[i]);
				if (currentCar[`${maxedTunes[i]}MaxedTopSpeed`]) {
					tunes += `${maxedTunes[i]}, `;
				}
			}

			const errorScreen = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you attempted tuning your car in an unavailable tune.")
				.setDescription("Try asking the devs if you really want to tune the car like that.")
				.addField("Your car's available tunes", tunes.slice(0, -2))
				.setTimestamp();
			if (currentMessage) {
				return currentMessage.edit(errorScreen);
			}
			else {
				return message.channel.send(errorScreen);
			}
		}

		async function upgradeCar(currentCar, currentMessage) {
			const car = require(`./cars/${currentCar.carFile}`);
			const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]})`;
			const money = playerData.money;
			const fuseTokens = playerData.fuseTokens;
			const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
			const fuseEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "fuse");
			var racehud;
			var moneyLimit = 0;
			var fuseTokenLimit = 0;
			console.log(moneyLimit);

			switch (upgrade) {
				case "333":
					if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade > 9) {
						return error(currentCar, currentMessage);
					}
					else {
						currentCar.gearingUpgrade = 3;
						currentCar.engineUpgrade = 3;
						currentCar.chassisUpgrade = 3;
						racehud = car["racehud1Star"];

						definePrice(car["rq"], upgrade);
					}
					break;
				case "666":
					if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade > 18) {
						return error(currentCar, currentMessage);
					}
					else {
						definePrice(car["rq"], upgrade);
						if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 0) {
							definePrice(car["rq"], "333");
						}

						currentCar.gearingUpgrade = 6;
						currentCar.engineUpgrade = 6;
						currentCar.chassisUpgrade = 6;
						racehud = car["racehud2Star"];
					}
					break;
				case "996":
					if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 24) {
						return error(currentCar, currentMessage);
					}
					else if (!car["996MaxedTopSpeed"]) {
						return error2(car, currentMessage);
					}
					else {
						definePrice(car["rq"], upgrade);
						if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade < 18) {
							definePrice(car["rq"], "666");
							if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 0) {
								definePrice(car["rq"], "333");
							}
						}

						currentCar.gearingUpgrade = 9;
						currentCar.engineUpgrade = 9;
						currentCar.chassisUpgrade = 6;
						racehud = car["racehudMaxed996"];
					}
					break;
				case "969":
					if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 24) {
						return error(currentCar, currentMessage);
					}
					else if (!car["969MaxedTopSpeed"]) {
						return error2(car, currentMessage);
					}
					else {
						definePrice(car["rq"], upgrade);
						if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade < 18) {
							definePrice(car["rq"], "666");
							if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 0) {
								definePrice(car["rq"], "333");
							}
						}

						currentCar.gearingUpgrade = 9;
						currentCar.engineUpgrade = 6;
						currentCar.chassisUpgrade = 9;
						racehud = car["racehudMaxed969"];
					}
					break;
				case "699":
					if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 24) {
						return error(currentCar, currentMessage);
					}
					else if (!car["699MaxedTopSpeed"]) {
						return error2(car, currentMessage);
					}
					else {
						definePrice(car["rq"], upgrade);
						if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade < 18) {
							definePrice(car["rq"], "666");
							if (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade === 0) {
								definePrice(car["rq"], "333");
							}
						}

						currentCar.gearingUpgrade = 6;
						currentCar.engineUpgrade = 9;
						currentCar.chassisUpgrade = 9;
						racehud = car["racehudMaxed699"];
					}
					break;
				default:
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setTitle("Error, the tuning stage you requested is not supported.")
						.setDescription("In order to make the tuning system less complex, the tuning stages are limited to `333`, `666`, `996`, `969` and `699`.")
						.setTimestamp();
					if (currentMessage) {
						return currentMessage.edit(errorScreen);
					}
					else {
						return message.channel.send(errorScreen);
					}
			}

			if (money >= moneyLimit && fuseTokens >= fuseTokenLimit) {
				playerData.money -= moneyLimit;
				playerData.fuseTokens -= fuseTokenLimit;
				const currentBalance = playerData.money;
				const currentFuseTokens = playerData.fuseTokens;

				var y = 0;
				while (y < playerData.garage.length) {
					if (playerData.hand) {
						if (playerData.hand.carFile === playerData.garage[y].carFile) {
							playerData.hand.gearingUpgrade = playerData.garage[y].gearingUpgrade;
							playerData.hand.engineUpgrade = playerData.garage[y].engineUpgrade;
							playerData.hand.chassisUpgrade = playerData.garage[y].chassisUpgrade;
						}
					}
					var i = 0, x = 0;
					while (i < playerData.decks.length) {
						while (x < playerData.decks[i].hand.length) {
							if (playerData.decks[i].hand[x].carFile === playerData.garage[y].carFile) {
								playerData.decks[i].hand[x].gearingUpgrade = playerData.garage[y].gearingUpgrade;
								playerData.decks[i].hand[x].engineUpgrade = playerData.garage[y].engineUpgrade;
								playerData.decks[i].hand[x].chassisUpgrade = playerData.garage[y].chassisUpgrade;
							}
							x++;
						}
						i++;
					}
					y++;
				}

				await db.set(`acc${message.author.id}`, playerData);

				const infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully upgraded ${message.author.tag}'s ${currentName}!`)
					.setDescription("Current upgrade status:")
					.addFields(
						{ name: "Gearing Upgrade", value: currentCar.gearingUpgrade, inline: true },
						{ name: "Engine Upgrade", value: currentCar.engineUpgrade, inline: true },
						{ name: "Chassis Upgrade", value: currentCar.chassisUpgrade, inline: true },
						{ name: "Your Money Balance", value: `${moneyEmoji}${currentBalance}`, inline: true },
						{ name: "Your Fuse Tokens", value: `${fuseEmoji}${currentFuseTokens}`, inline: true }
					)
					.setImage(racehud)
					.setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(infoScreen);
				}
				else {
					return message.channel.send(infoScreen);
				}
			}
			else {
				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, it looks like you don't have enough money and/or fuse tokens.")
					.setDescription(`You currently have ${moneyEmoji}${money}, ${fuseEmoji}${fuseTokens}`)
					.addFields(
						{ name: "Required Amount of Money", value: `${moneyEmoji}${moneyLimit}`, inline: true },
						{ name: "Required Amount of Fuse Tokens", value: `${fuseEmoji}${fuseTokenLimit}`, inline: true },
					)
					.setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(errorScreen);
				}
				else {
					return message.channel.send(errorScreen);
				}
			}

			function definePrice(rq, upgrade) {
				if (rq > 79) { //leggie
					console.log(upgrade);
					switch (upgrade) {
						case "333":
							moneyLimit += 22500;
							break;
						case "666":
							moneyLimit += 24750;
							fuseTokenLimit += 5000;
							break;
						case "996":
							moneyLimit += 27000;
							fuseTokenLimit += 5000;
							break;
						case "969":
							moneyLimit += 27000;
							fuseTokenLimit += 5000;
							break;
						case "699":
							moneyLimit += 27000;
							fuseTokenLimit += 5000;
							break;
						default:
							break;
					}
				}
				else if (rq > 64 && rq <= 79) { //epic
					switch (upgrade) {
						case "333":
							moneyLimit += 18000;
							break;
						case "666":
							moneyLimit += 20250;
							fuseTokenLimit += 2000;
							break;
						case "996":
							moneyLimit += 22500;
							fuseTokenLimit += 2000;
							break;
						case "969":
							moneyLimit += 22500;
							fuseTokenLimit += 2000;
							break;
						case "699":
							moneyLimit += 22500;
							fuseTokenLimit += 2000;
							break;
						default:
							break;
					}
				}
				else if (rq > 49 && rq <= 64) { //ultra
					switch (upgrade) {
						case "333":
							moneyLimit += 13500;
							break;
						case "666":
							moneyLimit += 15750;
							fuseTokenLimit += 850;
							break;
						case "996":
							moneyLimit += 18000;
							fuseTokenLimit += 850;
							break;
						case "969":
							moneyLimit += 18000;
							fuseTokenLimit += 850;
							break;
						case "699":
							moneyLimit += 18000;
							fuseTokenLimit += 850;
							break;
						default:
							break;
					}
				}
				else if (rq > 39 && rq <= 49) { //super
					switch (upgrade) {
						case "333":
							moneyLimit += 9000;
							break;
						case "666":
							moneyLimit += 11250;
							fuseTokenLimit += 300;
							break;
						case "996":
							moneyLimit += 13500;
							fuseTokenLimit += 300;
							break;
						case "969":
							moneyLimit += 13500;
							fuseTokenLimit += 300;
							break;
						case "699":
							moneyLimit += 13500;
							fuseTokenLimit += 300;
							break;
						default:
							break;
					}
				}
				else if (rq > 29 && rq <= 39) { //rare
					switch (upgrade) {
						case "333":
							moneyLimit += 6000;
							break;
						case "666":
							moneyLimit += 7000;
							fuseTokenLimit += 90;
							break;
						case "996":
							moneyLimit += 8000;
							fuseTokenLimit += 90;
							break;
						case "969":
							moneyLimit += 8000;
							fuseTokenLimit += 90;
							break;
						case "699":
							moneyLimit += 8000;
							fuseTokenLimit += 90;
							break;
						default:
							break;
					}
				}
				else if (rq > 19 && rq <= 29) { //uncommon
					switch (upgrade) {
						case "333":
							moneyLimit += 4000;
							break;
						case "666":
							moneyLimit += 5000;
							fuseTokenLimit += 30;
							break;
						case "996":
							moneyLimit += 6000;
							fuseTokenLimit += 30;
							break;
						case "969":
							moneyLimit += 6000;
							fuseTokenLimit += 30;
							break;
						case "699":
							moneyLimit += 6000;
							fuseTokenLimit += 30;
							break;
						default:
							break;
					}
				}
				else { //common
					switch (upgrade) {
						case "333":
							moneyLimit += 2000;
							break;
						case "666":
							moneyLimit += 3000;
							fuseTokenLimit += 30;
							break;
						case "996":
							moneyLimit += 4000;
							fuseTokenLimit += 30;
							break;
						case "969":
							moneyLimit += 4000;
							fuseTokenLimit += 30;
							break;
						case "699":
							moneyLimit += 4000;
							fuseTokenLimit += 30;
							break;
						default:
							break;
					}
				}
			}
		}
	}
}