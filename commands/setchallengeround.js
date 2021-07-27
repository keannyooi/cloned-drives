/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const disbut = require("discord-buttons");

module.exports = {
	name: "setchallengeround",
	aliases: ["scr"],
	usage: "<player name> <round>",
	args: 2,
	category: "Community Management",
	description: "Sets a player's round progress in the challenge to whatever.",
	execute(message, args) {
		const db = message.client.db;
		const filter = response => {
			return response.author.id === message.author.id;
		};

		if (message.mentions.users.first()) {
			if (!message.mentions.users.first().bot) {
				editStuff(message.mentions.users.first());
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
							collected.first().delete();
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
								editStuff(userList[parseInt(collected.first().content) - 1], currentMessage);
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
				editStuff(userList[0]);
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

		async function editStuff(user, currentMessage) {
			const challenge = await db.get("challenge");
			const settings = await db.get(`acc${message.author.id}.settings`);
			const buttonFilter = (button) => {
				return button.clicker.user.id === message.author.id;
			};
			let round = args[1];
			if (isNaN(round) || Math.ceil(parseInt(round)) < 1 || Math.ceil(parseInt(round)) > challenge.roster.length) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, round requested is either not a number or inapplicable.")
					.setDescription("Round numbers should be a number bigger than 0 and smaller or equal to the challenge's amount of rounds.")
					.addField("Amount of rounds that this challenge has", challenge.roster.length)
					.setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(errorMessage);
				}
				else {
					return message.channel.send(errorMessage);
				}
			}
			round = Math.ceil(parseInt(round));

			let yse, nop;
			if (settings.buttonstyle === "classic") {
				yse = new disbut.MessageButton()
					.setStyle("grey")
					.setEmoji("✅")
					.setID("yse");
				nop = new disbut.MessageButton()
					.setStyle("grey")
					.setEmoji("❎")
					.setID("nop");
			}
			else {
				yse = new disbut.MessageButton()
					.setStyle("green")
					.setLabel("Yes!")
					.setID("yse");
				nop = new disbut.MessageButton()
					.setStyle("red")
					.setLabel("No!")
					.setID("nop");
			}
			let row = new disbut.MessageActionRow().addComponents(yse, nop);

			const confirmationMessage = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`Are you sure you want to set ${user.username}'s progress on ${challenge.name} to round ${round}?`)
				.setTimestamp();

			let reactionMessage, processed = false;
			if (currentMessage) {
				reactionMessage = await currentMessage.edit({ embed: confirmationMessage, component: row });
			}
			else {
				reactionMessage = await message.channel.send({ embed: confirmationMessage, component: row });
			}

			const collector = reactionMessage.createButtonCollector(buttonFilter, { time: 10000 });
			collector.on("collect", async button => {
				if (!processed) {
					processed = true;
					switch (button.id) {
						case "yse":
							if (round === 1) {
								delete challenge.players[`acc${user.id}`];
							}
							else {
								challenge.players[`acc${user.id}`] = round - 1;
							}
							await db.set("challenge", challenge);
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
							const infoScreen = new Discord.MessageEmbed()
								.setColor("#34aeeb")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully set ${user.username}'s progress on ${challenge.name} to round ${round}!`)
								.setTimestamp();
							return reactionMessage.edit({ embed: infoScreen, component: null });
						case "nop":
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
							const cancelMessage = new Discord.MessageEmbed()
								.setColor("#34aeeb")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Action cancelled.")
								.setTimestamp();
							return reactionMessage.edit({ embed: cancelMessage, component: null });
						default:
							break;
					}
				}
			});
			collector.on("end", () => {
				if (!processed) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
					const cancelMessage = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Action cancelled automatically.")
						.setTimestamp();
					return reactionMessage.edit({ embed: cancelMessage, component: null });
				}
			});
		}
	}
}