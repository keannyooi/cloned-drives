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
	usage: "<car name goes here> | <original upgrade> | <upgrade pattern>",
	args: 3,
	isExternal: true,
	adminOnly: false,
	description: "Upgrades a car in your garage.",
	async execute(message, args) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		const garage = playerData.garage;

		const waitTime = 60000;
		const filter = response => {
			return response.author.id === message.author.id;
		};

		let carName = args.slice(0, args.length - 2).map(i => i.toLowerCase());
		let origUpgrade = args[args.length - 2], upgrade = args[args.length - 1];
		if (parseInt(origUpgrade[0]) + parseInt(origUpgrade[1]) + parseInt(origUpgrade[2]) >= parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) {
			let errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you tried tuning your car in the wrong order.")
				.setDescription("Correct tuning order: `000` => `333` => `666` => `996`, `969` or `699`.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		const searchResults = garage.filter(function (garageCar) {
			return carName.every(part => garageCar.carFile.includes(part)) && garageCar[origUpgrade] > 0;
		});

		if (searchResults.length > 1) {
			let carList = "";
			for (i = 1; i <= searchResults.length; i++) {
				const car = require(`./cars/${searchResults[i - 1].carFile}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
				carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
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
						collected.first().delete();
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
							upgradeCar(searchResults[parseInt(collected.first()) - 1], origUpgrade, upgrade, currentMessage);
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
			upgradeCar(searchResults[0], origUpgrade, upgrade);
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you don't have that car in the original tune requested.")
				.setDescription("Check if you got the order right: `cd-upgrade <car name goes here> | <original upgrade> | <upgrade pattern>`")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		async function upgradeCar(currentCar, origUpgrade, upgrade, currentMessage) {
			const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
			const currentName = `${make} ${car["model"]} (${car["modelYear"]})`;
			const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
			const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
			const racehud = car[`racehud${upgrade}`];
			var moneyLimit = 0;
			var fuseTokenLimit = 0;

			if (!car[`${upgrade}TopSpeed`]) {
				const maxedTunes = [996, 969, 699].filter(function (tune) {
					return car[`racehud${tune}`];
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

			definePrice(car["rq"], upgrade, origUpgrade);

			if (playerData.money >= moneyLimit && playerData.fuseTokens >= fuseTokenLimit) {
				playerData.money -= moneyLimit;
				playerData.fuseTokens -= fuseTokenLimit;

				currentCar[upgrade]++;
				currentCar[origUpgrade]--;

				if (playerData.hand) {
					if (playerData.hand.carFile === currentCar.carFile) {
                   		delete playerData.hand;
                	}
				}
				await db.set(`acc${message.author.id}`, playerData);

				const infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully upgraded ${message.author.tag}'s ${currentName}!`)
					.setDescription("Current upgrade status:")
					.addFields(
						{ name: "Gearing Upgrade", value: `\`${origUpgrade[0]} => ${upgrade[0]}\``, inline: true },
						{ name: "Engine Upgrade", value: `\`${origUpgrade[1]} => ${upgrade[1]}\``, inline: true },
						{ name: "Chassis Upgrade", value: `\`${origUpgrade[2]} => ${upgrade[2]}\``, inline: true },
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
				let a = parseInt(upgradeIndex[0]) + parseInt(upgradeIndex[1]) + parseInt(upgradeIndex[2]);
				let b = parseInt(origUpgrade[0]) + parseInt(origUpgrade[1]) + parseInt(origUpgrade[2]);
				if (rq > 79) { //leggie
					moneyLimit = 4500 * (a - b);
					if (a >= 18 && b >= 9) {
						fuseTokenLimit = 1200 * (a - b) / 3;
					}
					else {
						fuseTokenLimit = 1200 * (a - b - 9) / 3;
					}
				}
				else if (rq > 64 && rq <= 79) { //epic
					moneyLimit = 3750 * (a - b);
					if (a >= 18 && b >= 9) {
						fuseTokenLimit = 700 * (a - b) / 3;
					}
					else {
						fuseTokenLimit = 700 * (a - b - 9) / 3;
					}
				}
				else if (rq > 49 && rq <= 64) { //ultra
					moneyLimit = 3000 * (a - b);
					if (a >= 18 && b >= 9) {
						fuseTokenLimit = 275 * (a - b) / 3;
					}
					else {
						fuseTokenLimit = 275 * (a - b - 9) / 3;
					}
				}
				else if (rq > 39 && rq <= 49) { //super
					moneyLimit = 2250 * (a - b);
					if (a >= 18 && b >= 9) {
						fuseTokenLimit = 100 * (a - b) / 3;
					}
					else {
						fuseTokenLimit = 100 * (a - b - 9) / 3;
					}
				}
				else if (rq > 29 && rq <= 39) { //rare
					moneyLimit = 1500 * (a - b);
					if (a >= 18 && b >= 9) {
						fuseTokenLimit = 35 * (a - b) / 3;
					}
					else {
						fuseTokenLimit = 35 * (a - b - 9) / 3;
					}
				}
				else if (rq > 19 && rq <= 29) { //uncommon
					moneyLimit = 750 * (a - b);
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 10 * (a - b) / 3;
					}
					else {
						fuseTokenLimit = 10 * (a - b - 9) / 3;
					}
				}
				else { //common
					moneyLimit = 500 * (a - b);
					if (upgradeIndex >= 18 && origUpgrade >= 9) {
						fuseTokenLimit = 10 * (a - b) / 3;
					}
					else {
						fuseTokenLimit = 10 * (a - b - 9) / 3;
					}
				}
			}
		}
	}
}