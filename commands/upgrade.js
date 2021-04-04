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
	usage: "<car name goes here> | <upgrade pattern>",
	args: 2,
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

		let carName = args.slice(0, args.length - 1).map(i => i.toLowerCase());
		let upgrade = args[args.length - 1];

		const searchResults = garage.filter(function (garageCar) {
			return carName.every(part => garageCar.carFile.includes(part)) && garageCar["000"] + garageCar["333"] + garageCar["666"] + garageCar["996"]  + garageCar["969"]  + garageCar["699"] > 0;
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
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
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
								.setTimestamp();
							return currentMessage.edit(errorMessage);
						}
						else {
							selectUpgrade(searchResults[parseInt(collected.first().content) - 1], upgrade, currentMessage);
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
			});
		}
		else if (searchResults.length > 0) {
			selectUpgrade(searchResults[0], upgrade);
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you don't have a car that is compatible with your tune request.")
				.setDescription("Check if you got the order right: `cd-upgrade <car name goes here> | <upgrade pattern>`")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		async function selectUpgrade(currentCar, upgrade, currentMessage) {
			let upgradeIndex = parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2]);
			let isOne = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && currentCar[m] >= 1 && parseInt(m[0]) + parseInt(m[1]) + parseInt(m[2]) < upgradeIndex);
			if (isOne.length === 1) {
				upgradeCar(currentCar, isOne[0], upgrade, currentMessage);
			}
			else if (isOne.length === 0) {
				let count = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && currentCar[m] >= 1);
				let upgradeList = "";
				for (i = 0; i < count.length; i++) {
					upgradeList += `\`${count[i]}\`x${currentCar[count[i]]}, `;
				}
				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setTitle("Error, it looks like you attempted tuning your car in the wrong order.")
					.setDescription("Correct tuning order: `000` => `333` => `666` => `996`, `969` or `699`.")
					.addField("Current upgrades for your car", upgradeList.slice(0, -2))
					.setTimestamp();
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				if (currentMessage) {
					return currentMessage.edit(errorScreen);
				}
				else {
					return message.channel.send(errorScreen);
				}
			}
			else {
				let upgradeList = "Type in any tune that is displayed here.\n";
				for (let upg of isOne) {
					upgradeList += `\`${upg}\`, `;
				}

				let infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Upgrade car from which tune?")
					.setDescription(upgradeList.slice(0, -2))
					.setTimestamp();
				let upgradeMessage;
				if (currentMessage && message.channel.type === "text") {
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
						if (message.channel.type === "text") {
							collected.first().delete();
						}
						if (isOne.find(m => m === collected.first().content) === undefined) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, invalid selection provided.")
								.setDescription("It looks like your response was not part of the selection.")
								.setTimestamp();
							if (message.channel.type === "text") {
								return upgradeMessage.edit(errorMessage);
							}
							else {
								return message.channel.send(errorMessage);
							}
						}
						else {
							upgradeCar(currentCar, collected.first().content, upgrade, upgradeMessage);
						}
					})
					.catch(error => {
						console.log(error);
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
						const cancelMessage = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Action cancelled automatically.")
							.setTimestamp();
						if (message.channel.type === "text") {
							return upgradeMessage.edit(cancelMessage);
						}
						else {
							return message.channel.send(cancelMessage);
						}
					});
			}
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

			if (car[`racehud${upgrade}`] === "" || !car[`racehud${upgrade}`]) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const maxedTunes = [996, 969, 699].filter(function (tune) {
					return car[`racehud${tune}`];
				});

				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setTitle("Error, the tuning stage you requested is unavailable.")
					.setDescription("In order to make the tuning system less complex, the tuning stages are limited to `333`, `666`, `996`, `969` and `699`.")
					.addField("Your car's available maxed tunes", maxedTunes.join(", "))
					.setTimestamp();
				if (currentMessage && message.channel.type === "text") {
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
                   		playerData.hand.gearingUpgrade = parseInt(upgrade[0]);
						playerData.hand.engineUpgrade = parseInt(upgrade[1]);
						playerData.hand.chassisUpgrade = parseInt(upgrade[2]);
                	}
				}
				for (i = 0; i < playerData.decks.length; i++) {
					let edit = playerData.decks[i].hand.findIndex(car => car.carFile === currentCar.carFile && `${car.gearingUpgrade}${car.engineUpgrade}${car.chassisUpgrade}` === origUpgrade);
					if (edit >= 0) {
						playerData.decks[i].hand[edit].gearingUpgrade = parseInt(upgrade[0]);
						playerData.decks[i].hand[edit].engineUpgrade = parseInt(upgrade[1]);
						playerData.decks[i].hand[edit].chassisUpgrade = parseInt(upgrade[2]);
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
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				if (currentMessage && message.channel.type === "text") {
					return currentMessage.edit(infoScreen);
				}
				else {
					return message.channel.send(infoScreen);
				}
			}
			else {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
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
				if (currentMessage && message.channel.type === "text") {
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