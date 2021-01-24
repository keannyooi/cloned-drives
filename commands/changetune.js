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
	usage: "<username goes here> | <car name goes here> | <original upgrade> | <upgrade pattern>",
	args: 4,
	isExternal: false,
	adminOnly: true,
	description: "Changes a tune of a car in someone's garage.",
	async execute(message, args) {
		const db = message.client.db;
		var user, member;
        if (args.length) {
            let userName = args[0].toLowerCase();

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
                .setDescription("It looks like this user isn't in this server. \nCorrect syntax: `cd-removecar <username> <car name goes here>`")
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
		const waitTime = 60000;
		const filter = response => {
			return response.author.id === message.author.id;
		};

		let carName = args.slice(1, args.length - 2).map(i => i.toLowerCase());
		let origUpgrade = args[args.length - 2], upgrade = args[args.length - 1];
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
							changeTune(searchResults[parseInt(collected.first()) - 1], origUpgrade, upgrade, currentMessage);
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
			changeTune(searchResults[0], origUpgrade, upgrade);
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you don't have that car in the original tune requested.")
				.setDescription("Check if you got the order right: `cd-upgrade <username goes here> | <car name goes here> | <original upgrade> | <upgrade pattern>`")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		async function changeTune(currentCar, origUpgrade, upgrade, currentMessage) {
			const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
			const currentName = `${make} ${car["model"]} (${car["modelYear"]})`;
			const racehud = car[`racehud${upgrade}`];

			if (!car[`racehud${upgrade}`]) {
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

			currentCar[upgrade]++;
			currentCar[origUpgrade]--;
			if (playerData.hand) {
				if (playerData.hand.carFile === currentCar.carFile) {
               		delete playerData.hand;
            	}
			}
			await db.set(`acc${user.id}`, playerData);

			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`Successfully changed tune for ${member.displayName}'s ${currentName}!`)
				.setDescription("Current upgrade status:")
				.addFields(
					{ name: "Gearing Upgrade", value: `\`${origUpgrade[0]} => ${upgrade[0]}\``, inline: true },
					{ name: "Engine Upgrade", value: `\`${origUpgrade[1]} => ${upgrade[1]}\``, inline: true },
					{ name: "Chassis Upgrade", value: `\`${origUpgrade[2]} => ${upgrade[2]}\``, inline: true }
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