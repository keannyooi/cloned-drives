/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const moment = require("moment");

module.exports = {
    name: "statistics",
    aliases: ["stats"],
    usage: "(optional) <username>",
    args: 0,
	category: "Info",
    description: "Shows someone's stats.",
    execute(message, args) {
		const db = message.client.db;
        if (args.length) {
			if (message.mentions.users.first()) {
				if (!message.mentions.users.first().bot) {
					displayData(message.mentions.users.first());
				}
				else {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, user requested is a bot.")
						.setDescription("Bots can't play Cloned Drives.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
			}
			else {
				let userName = args[0].toLowerCase();
				const filter = response => {
					return response.author.id === message.author.id;
				};

				if (message.channel.type !== "text") {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, this feature cannot be executed on DMs.")
						.setDescription("Due to Discord DM limitations, this feature cannot be executed here. Sorry for your inconvenience.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				
				let userList = [];
				message.guild.members.cache.forEach(User => {
					if ((User.displayName.toLowerCase().includes(userName) || User.user.username.toLowerCase().includes(userName)) && !User.user.bot) {
						userList.push(User.user);
					}
				});

				if (userList.length > 1) {
					let textList = "";
					for (i = 1; i <= userList.length; i++) {
						textList += `${i} - ${userList[i - 1].tag}\n`;
					}

					if (textList.length > 2048) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, too many search results.")
							.setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
							.addField("Total Characters in List", `\`${textList.length}\` > \`2048\``)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					const infoScreen = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Multiple users found, please type one of the following.")
						.setDescription(textList)
						.setTimestamp();

					message.channel.send(infoScreen).then(currentMessage => {
						message.channel.awaitMessages(filter, {
							max: 1,
							time: 30000,
							errors: ["time"]
						})
							.then(collected => {
								if (message.channel.type === "text") {
									collected.first().delete();
								}
								if (isNaN(collected.first().content) || parseInt(collected.first().content) > userList.length || parseInt(collected.first().content) < 1) {
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									const errorMessage = new Discord.MessageEmbed()
										.setColor("#fc0303")
										.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
										.setTitle("Error, invalid integer provided.")
										.setDescription("It looks like your response was either not a number or not part of the selection.")
										.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${userList.length})`)
										.setTimestamp();
									return currentMessage.edit(errorMessage);
								}
								else {
									displayData(userList[parseInt(collected.first().content) - 1], currentMessage);
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
				else if (userList.length > 0) {
					displayData(userList[0]);
				}
				else {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, 404 user not found.")
						.setDescription("It looks like this user isn't in this server.")
						.addField("Keywords Received", `\`${userName}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
			}
        }
        else {
            displayData(message.author);
		}

		async function displayData(user, currentMessage) {
			const userData = await db.get(`acc${user.id}`);
			console.log(userData);
			const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
			const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
			const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
			const garage = userData.garage;

			if (userData.money === null) {
				userData.money = 0;
			}
			if (userData.fuseTokens === null) {
				userData.fuseTokens = 0;
			}
			if (userData.trophies === null) {
				userData.trophies = 0;
			}

			let totalCars = 0, maxedCarAmount = 0;
			for (i = 0; i < garage.length; i++) {
				totalCars += (garage[i]["000"] + garage[i]["333"] + garage[i]["666"] + garage[i]["996"] + garage[i]["969"] + garage[i]["699"]);
				maxedCarAmount += (garage[i]["996"] + garage[i]["969"] + garage[i]["699"]);
			}
			const MCpercentage = maxedCarAmount / totalCars * 100;

			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`Stats of ${user.username}`)
				.setDescription(`Account created in ${moment(user.createdAt).format("MMMM Do YYYY, h:mm:ss a")}`)
				.addFields(
					{ name: "Money Balance", value: `${moneyEmoji}${userData.money}`, inline: true },
					{ name: "Fuse Tokens", value: `${fuseEmoji}${userData.fuseTokens}`, inline: true },
					{ name: "Trophies", value: `${trophyEmoji}${userData.trophies}`, inline: true },
					{ name: "Total Cars in Garage", value: totalCars, inline: true },
					{ name: "Total Maxed Cars in Garage", value: maxedCarAmount, inline: true },
					{ name: "Maxed Car Percentage", value: `${MCpercentage.toFixed(2)}%`, inline: true },
				)
				.setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			if (currentMessage) {
				return currentMessage.edit(infoScreen);
			}
			else {
				return message.channel.send(infoScreen);
			}
		}
    }
}