/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "sethand",
	aliases: ["sh"],
    usage: "<car name goes here>",
    args: 1,
	isExternal: true,
    adminOnly: false,
    description: "Sets your hand for quick race, random race and event gamemodes.",
    async execute(message, args) {
        const db = message.client.db;
        const garage = await db.get(`acc${message.author.id}.garage`);
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

		if (args[0].toLowerCase() === "random") {
			let randomCar = garage[Math.floor(Math.random() * garage.length)];
			let randomTune = Object.keys(randomCar).filter(h => !isNaN(randomCar[h]) && randomCar[h] > 0);
			setHand(randomCar, randomTune[Math.floor(Math.random() * randomTune.length)]);
		}
		else {
			let carName, tune;
			if (args[args.length - 1] === "000" || args[args.length - 1] === "333" || args[args.length - 1] === "666" || args[args.length - 1] === "996" || args[args.length - 1] === "969" || args[args.length - 1] === "699") {
				carName = args.slice(0, args.length - 1).map(i => i.toLowerCase());
				tune = args[args.length - 1];
			}
			else {
				carName = args.map(i => i.toLowerCase());
			}
			
			const searchResults = new Set(garage);
			searchResults.forEach(function (garageCar) {
				if (carName.every(part => garageCar.carFile.includes(part)) === false || garageCar["000"] + garageCar["333"] + garageCar["666"] + garageCar["996"] + garageCar["969"] + garageCar["699"] === 0) {
					searchResults.delete(garageCar);
				}
			});

			if (searchResults.size > 1) {
				let carList = "";
				let redirect = [];
				let i = 1;
				searchResults.forEach(function (garageCar) {
					const car = require(`./cars/${garageCar.carFile}`);
					let make = car["make"];
					if (typeof make === "object") {
						make = car["make"][0];
					}
					carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
					redirect[i - 1] = garageCar;
					i++;
				});

				if (carList.length > 2048) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, too many search results.")
						.setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
						.addField("Total Characters in List", `\`${carList.length}\` > \`2048\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				const infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Multiple cars found, please type one of the following.")
					.setDescription(carList);

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
							if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.size || parseInt(collected.first().content) < 1) {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
								const errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, invalid integer provided.")
									.setDescription("It looks like your response was either not a number or not part of the selection.")
									.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.size})`)
									.setTimestamp();
								return currentMessage.edit(errorMessage);
							}
							else {
								if (tune === undefined) {
									selectUpgrade(redirect[parseInt(collected.first().content) - 1], currentMessage);
								}
								else if (!redirect[parseInt(collected.first().content) - 1][tune]) {
									throwError(redirect[parseInt(collected.first().content) - 1], currentMessage);
								}
								else {
									setHand(redirect[parseInt(collected.first().content) - 1], tune, currentMessage);
								}
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
			else if (searchResults.size > 0) {
				if (tune === undefined) {
					selectUpgrade(Array.from(searchResults)[0]);
				}
				else if (!Array.from(searchResults)[0][tune]) {
					throwError(Array.from(searchResults)[0]);
				}
				else {
					setHand(Array.from(searchResults)[0], tune);
				}
			}
			else {
				let matches = stringSimilarity.findBestMatch(carName.join(" "), garage.map(i => i.carFile.slice(0, -5)));
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, car requested not found.")
					.setDescription("It looks like you don't own that car.")
					.addField("Keywords Received", `\`${carName.join(" ")}\``, true)
					.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
		}

		function throwError(currentCar, currentMessage) {
			let count = Object.keys(currentCar).filter(m => !isNaN(currentCar[`${m}`]) && currentCar[`${m}`] >= 1);
			let upgradeList = "";
			for (i = 0; i < count.length; i++) {
				upgradeList += `\`${count[i]}\`x${currentCar[count[i]]}, `;
			}
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you don't have this car in the requested tune.")
				.addField("Current Tunes", upgradeList.slice(0, -2))
				.setTimestamp();
			if (currentMessage) {
				return currentMessage.edit(errorMessage);
			}
			else {
				return message.channel.send(errorMessage);
			}
		}

		async function selectUpgrade(currentCar, currentMessage) {
			let isOne = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && currentCar[m] >= 1);
			if (isOne.length === 1) {
				setHand(currentCar, isOne[0], currentMessage);
			}
			else {
				let upgradeList = "Type in any tune that is displayed here.\n";
				for (i = 0; i < isOne.length; i++) {
					upgradeList += `\`${isOne[i]}\`, `;
				}

				let infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Which tune to select?")
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
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, invalid selection provided.")
								.setDescription("It looks like your response was not part of the selection.")
								.setTimestamp();
							return upgradeMessage.edit(errorMessage);
						}
						else {
							setHand(currentCar, collected.first().content, upgradeMessage);
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

        async function setHand(currentCar, upgrade, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
			let rarity = rarityCheck(car);
            const currentName = `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;
            const racehud = car[`racehud${upgrade}`];

            await db.set(`acc${message.author.id}.hand`, { carFile: currentCar.carFile, gearingUpgrade: parseInt(upgrade[0]), engineUpgrade: parseInt(upgrade[1]), chassisUpgrade: parseInt(upgrade[2]) });
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#03fc24")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully set your ${currentName} as your quick race, random race and event hand!`)
                .setImage(racehud)
                .setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            if (currentMessage) {
				return currentMessage.edit(infoScreen);
			}
			else {
				return message.channel.send(infoScreen);
			};
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