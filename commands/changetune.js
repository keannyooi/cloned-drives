const Discord = require("discord.js-light");

module.exports = {
	name: "changetune",
	usage: "<username goes here> <car name goes here> <upgrade pattern>",
	args: true,
	adminOnly: true,
	description: "Changes a tune of a car in someone's garage.",
	async execute(message, args) {
		const db = message.client.db;

		if (!args[1] || !args[2]) {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, arguments provided insufficient.")
				.setDescription("Correct syntax: `cd-changetune <username goes here> <car name goes here> <upgrade pattern>`")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		var carName = args[1].toLowerCase();
		const upgrade = args[args.length - 1].toLowerCase();
		const searchResults = [];
		const waitTime = 60000;
		const filter = response => {
			return response.author.id === message.author.id;
		};

		var user, member;
		if (args.length) {
			var userName = args[0].toLowerCase();

			message.guild.members.cache.forEach(User => {
            	if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                	console.log("found!");
                	user = User.user;
					member = message.guild.member(User);
            	}
        	});
		}

		if (!user) {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, 404 user not found.")
				.setDescription("It looks like this user isn't in this server.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
		else if (user.bot) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, user requested is a bot.")
                .setDescription("Bots can't play Cloned Drives.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
		const playerData = await db.get(`acc${user.id}`);
		const garage = playerData.garage;

		for (i = 2; i < args.length - 1; i++) {
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
				searchResults[searched] = garage[counter]
				searched++;
			}
			counter++;
		}

		if (searched > 0) {
			var currentCar = searchResults[0].carFile;
			if (searched > 1) {
				var carList = "";
				for (i = 1; i <= searchResults.length; i++) {
					const car = require(`./cars/${searchResults[i - 1].carFile}`);
					carList += `${i} - ` + car["make"] + " " + car["model"] + " (" + car["modelYear"] + `) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
				}

				const infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Multiple cars found, please type one of the following.")
					.setDescription(carList)
					.setTimestamp();

				message.channel.send(infoScreen).then(() => {
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
								return message.channel.send(errorMessage);
							}
							else {
								currentCar = searchResults[parseInt(collected.first()) - 1];
								changeTune(currentCar);
							}
						});
				});
			}
			else {
				changeTune(searchResults[0]);
			}
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like that person doesn't have that car.")
				.setDescription("oof")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		async function changeTune(currentCar) {
			const car = require(`./cars/${currentCar.carFile}`);
			const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]})`;
			var racehud;

			switch (upgrade) {
				case "333":
					currentCar.gearingUpgrade = 3;
					currentCar.engineUpgrade = 3;
					currentCar.chassisUpgrade = 3;
					racehud = car["racehud1Star"];
					break;
				case "666":
					currentCar.gearingUpgrade = 6;
					currentCar.engineUpgrade = 6;
					currentCar.chassisUpgrade = 6;
					racehud = car["racehud2Star"];
					break;
				case "996":
					currentCar.gearingUpgrade = 9;
					currentCar.engineUpgrade = 9;
					currentCar.chassisUpgrade = 6;
					racehud = car["racehudMaxed996"];
					break;
				case "969":
					currentCar.gearingUpgrade = 9;
					currentCar.engineUpgrade = 6;
					currentCar.chassisUpgrade = 9;
					racehud = car["racehudMaxed969"];
					break;
				case "699":
					currentCar.gearingUpgrade = 6;
					currentCar.engineUpgrade = 9;
					currentCar.chassisUpgrade = 9;
					racehud = car["racehudMaxed699"];
					break;
				case "stock":
					currentCar.gearingUpgrade = 0;
					currentCar.engineUpgrade = 0;
					currentCar.chassisUpgrade = 0;
					racehud = car["racehudStock"];
					break;
				default:
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setTitle("Error, the tuning stage you requested is not supported.")
						.setDescription("In order to make the tuning system less complex, the tuning stages are limited to `stock`, `333`, `666`, `996`, `969` and `699`.")
						.setTimestamp();
					return message.channel.send(errorScreen);
			}

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
							playerData.decks[i].hand[x].gearingUpgrade = correctCar.gearingUpgrade;
							playerData.decks[i].hand[x].engineUpgrade = correctCar.engineUpgrade;
							playerData.decks[i].hand[x].chassisUpgrade = correctCar.chassisUpgrade;
						}
						x++;
					}
					i++;
				}
				y++;
			}

			await db.set(`acc${user.id}`, playerData);

			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`Successfully changed tune for ${member.displayName}'s ${currentName}!`)
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
				.setDescription("Current upgrade status:")
				.addFields(
					{ name: "Gearing Upgrade", value: currentCar.gearingUpgrade, inline: true },
					{ name: "Engine Upgrade", value: currentCar.engineUpgrade, inline: true },
					{ name: "Chassis Upgrade", value: currentCar.chassisUpgrade, inline: true }
				)
				.setImage(racehud)
				.setTimestamp();
			return message.channel.send(infoScreen);
		}
	}
}