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
	args: 2,
	isExternal: true,
	adminOnly: false,
	description: "Upgrades a car in your garage.",
	async execute(message, args) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		const garage = playerData.garage;
		var upgrade = args[args.length - 1].split("");
		if (args[args.length - 1].toLowerCase() === "stock") {
			upgrade = [0, 0, 0];
		}

		const waitTime = 60000;
		const filter = response => {
			return response.author.id === message.author.id;
		};

		var carName = args.slice(0, args.length - 1);
		carName = carName.map(i => i.toLowerCase());

		const searchResults = garage.filter(function (garageCar) {
			return carName.every(part => garageCar.carFile.includes(part));
		});

		if (searchResults.length > 1) {
			var carList = "";
			for (i = 1; i <= searchResults.length; i++) {
				const car = require(`./cars/${searchResults[i - 1].carFile}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
				carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]}) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
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
							collected.first().delete();
							upgradeCar(searchResults[parseInt(collected.first()) - 1], currentMessage);
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
			upgradeCar(searchResults[0]);
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

		async function upgradeCar(currentCar, currentMessage) {
			const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
			const currentName = `${make} ${car["model"]} (${car["modelYear"]})`;
			const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
			const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
			const racehud = car[`racehud${upgrade[0]}${upgrade[1]}${upgrade[2]}`];
			var moneyLimit = 0;
			var fuseTokenLimit = 0;

			if (!car[`${upgrade[0]}${upgrade[1]}${upgrade[2]}TopSpeed`]) {
				const maxedTunes = [996, 969, 699].filter(function (tune) {
					return car[`${tune}TopSpeed`];
				});

				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setTitle("Error, the tuning stage you requested is unavailable.")
					.setDescription("In order to make the tuning system less complex, the tuning stages are limited to `333`, `666`, `996`, `969` and `699`.")
					.addField("Your car's available maxed tunes", maxedTunes.join(", "))
					.setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(errorScreen);
				}
				else {
					return message.channel.send(errorScreen);
				}
			}

			const upgradeIndex = parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2]);
			const origUpgrade = currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade;
			if (upgradeIndex - origUpgrade <= 0) {
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

			definePrice(car["rq"], upgradeIndex, origUpgrade);

			if (playerData.money >= moneyLimit && playerData.fuseTokens >= fuseTokenLimit) {
				playerData.money -= moneyLimit;
				playerData.fuseTokens -= fuseTokenLimit;

				currentCar.gearingUpgrade = parseInt(upgrade[0]);
				currentCar.engineUpgrade = parseInt(upgrade[1]);
				currentCar.chassisUpgrade = parseInt(upgrade[2]);

				if (playerData.hand) {
					if (playerData.hand.carFile === currentCar.carFile) {
						playerData.hand.gearingUpgrade = currentCar.gearingUpgrade;
						playerData.hand.engineUpgrade = currentCar.engineUpgrade;
						playerData.hand.chassisUpgrade = currentCar.chassisUpgrade;
					}
				}
				var i = 0;
				while (i < playerData.decks.length) {
					const hasCar = playerData.decks[i].hand.find(function (car) {
						return car.carFile === currentCar.carFile;
					});
					if (hasCar) {
						const index = playerData.decks[i].hand.indexOf(hasCar);
						playerData.decks[i].hand[index].gearingUpgrade = currentCar.gearingUpgrade;
						playerData.decks[i].hand[index].engineUpgrade = currentCar.engineUpgrade;
						playerData.decks[i].hand[index].chassisUpgrade = currentCar.chassisUpgrade;
					}
					i++;
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
						{ name: "Your Money Balance", value: `${moneyEmoji}${playerData.money}`, inline: true },
						{ name: "Your Fuse Tokens", value: `${fuseEmoji}${playerData.fuseTokens}`, inline: true }
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
					.setDescription(`You currently have ${moneyEmoji}${playerData.money}, ${fuseEmoji}${playerData.fuseTokens}`)
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

			function definePrice(rq, upgradeIndex, origUpgrade) {
				console.log(upgradeIndex - origUpgrade);

				if (rq > 79) { //leggie
					moneyLimit = 4500 * (upgradeIndex - origUpgrade) / 3;
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 1200 * (upgradeIndex - origUpgrade) / 3;
					}
					else {
						fuseTokenLimit = 1200 * (upgradeIndex - origUpgrade - 9) / 3;
					}
				}
				else if (rq > 64 && rq <= 79) { //epic
					moneyLimit = 3750 * (upgradeIndex - origUpgrade) / 3;
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 700 * (upgradeIndex - origUpgrade) / 3;
					}
					else {
						fuseTokenLimit = 700 * (upgradeIndex - origUpgrade - 9) / 3;
					}
				}
				else if (rq > 49 && rq <= 64) { //ultra
					moneyLimit = 3000 * (upgradeIndex - origUpgrade) / 3;
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 275 * (upgradeIndex - origUpgrade) / 3;
					}
					else {
						fuseTokenLimit = 275 * (upgradeIndex - origUpgrade - 9) / 3;
					}
				}
				else if (rq > 39 && rq <= 49) { //super
					moneyLimit = 2250 * (upgradeIndex - origUpgrade) / 3;
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 100 * (upgradeIndex - origUpgrade) / 3;
					}
					else {
						fuseTokenLimit = 100 * (upgradeIndex - origUpgrade - 9) / 3;
					}
				}
				else if (rq > 29 && rq <= 39) { //rare
					moneyLimit = 1500 * (upgradeIndex - origUpgrade) / 3;
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 35 * (upgradeIndex - origUpgrade) / 3;
					}
					else {
						fuseTokenLimit = 35 * (upgradeIndex - origUpgrade - 9) / 3;
					}
				}
				else if (rq > 19 && rq <= 29) { //uncommon
					moneyLimit = 750 * (upgradeIndex - origUpgrade) / 3;
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 10 * (upgradeIndex - origUpgrade) / 3;
					}
					else {
						fuseTokenLimit = 10 * (upgradeIndex - origUpgrade - 9) / 3;
					}
					console.log(moneyLimit);
				}
				else { //common
					moneyLimit = 500 * (upgradeIndex - origUpgrade) / 3;
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 10 * (upgradeIndex - origUpgrade) / 3;
					}
					else {
						fuseTokenLimit = 10 * (upgradeIndex - origUpgrade - 9) / 3;
					}
				}
			}
		}
	}
}