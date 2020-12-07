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
	name: "changetune",
	aliases: ["ct"],
	usage: "<username goes here> <car name goes here> <upgrade pattern>",
	args: 3,
	adminOnly: true,
	description: "Changes a tune of a car in someone's garage.",
	async execute(message, args) {
		const db = message.client.db;

		var upgrade = args[args.length - 1].split("");
		if (args[args.length - 1].toLowerCase() === "stock") {
			upgrade = [0, 0, 0];
		}
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

		var carName = args.slice(1, args.length - 1);
		carName = carName.map(i => i.toLowerCase());

		const searchResults = garage.filter(function (garageCar) {
			return carName.every(part => garageCar.carFile.includes(part));
		});

		if (searchResults.length > 1) {
			var carList = "";
			for (i = 1; i <= searchResults.length; i++) {
				const car = require(`./cars/${searchResults[i - 1].carFile}`);
				carList += `${i} - ${car["make"]} ${car["model"]} (${car["modelYear"]}) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
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
							changeTune(searchResults[parseInt(collected.first()) - 1], currentMessage);
						}
					});
			});
		}
		else if (searchResults.length > 0) {
			changeTune(searchResults[0]);
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

		async function changeTune(currentCar, currentMessage) {
			const car = require(`./cars/${currentCar.carFile}`);
			const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]})`;

			currentCar.gearingUpgrade = parseInt(upgrade[0]);
			currentCar.engineUpgrade = parseInt(upgrade[1]);
			currentCar.chassisUpgrade = parseInt(upgrade[2]);

			var racehud = car[`racehud${upgrade[0]}${upgrade[1]}${upgrade[2]}`];;
			if (!racehud) {
				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setTitle("Error, the tuning stage you requested is not supported.")
					.setDescription("In order to make the tuning system less complex, the tuning stages are limited to `stock`, `333`, `666`, `996`, `969` and `699`.")
					.setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(errorScreen);
				}
				else {
					return message.channel.send(errorScreen);
				}
			}

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
			if (currentMessage) {
				return currentMessage.edit(infoScreen);
			}
			else {
				return message.channel.send(infoScreen);
			}
		}
	}
}