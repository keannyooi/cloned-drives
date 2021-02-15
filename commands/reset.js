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
    name: "reset",
    aliases: ["rs"],
    usage: "<username>",
    args: 1,
	isExternal: false,
    adminOnly: true,
    description: "Resets someone's stats.",
    execute(message, args) {
		const starterCars = ["abarth 124 spider (2017).json", "range rover classic 5-door (1984).json", "honda prelude type sh (1997).json", "chevrolet impala ss 427 (1967).json", "volkswagen beetle 2.5 (2012).json"];
		const filter = response => {
            return response.author.id === message.author.id;
        };
		const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        if (message.mentions.users.first()) {
			if (!message.mentions.users.first().bot) {
				noneAndQuitTheGame(message.mentions.users.first());
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
									.setTimestamp();
								return currentMessage.edit(errorMessage);
							}
							else {
								noneAndQuitTheGame(userList[parseInt(collected.first().content) - 1], currentMessage);
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
				noneAndQuitTheGame(userList[0]);
			}
			else {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, 404 user not found.")
					.setDescription("It looks like this user isn't in this server.")
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
		}

		async function noneAndQuitTheGame(user, currentMessage) { //dont ask
			const confirmationMessage = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`Are you sure you want to reset ${user.username}'s data?`)
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
				.setDescription("React with ✅ to proceed or ❎ to cancel.")
				.setTimestamp();
			let reactionMessage;
			if (currentMessage) {
				reactionMessage = await currentMessage.edit(confirmationMessage);
			}
			else {
				reactionMessage = await message.channel.send(confirmationMessage);
			}

			reactionMessage.react("✅");
			reactionMessage.react("❎");
			reactionMessage.awaitReactions(emojiFilter, {
				max: 1,
				time: 10000,
				errors: ["time"]
			})
				.then(async collected => {
					reactionMessage.reactions.removeAll();
					switch (collected.first().emoji.name) {
						case "✅":
							await message.client.db.set(`acc${user.id}`, { money: 0, fuseTokens: 0, trophies: 0, garage: [], decks: [], campaignProgress: { chapter: 0, part: 1, race: 1 }, unclaimedRewards: { money: 0, fuseTokens: 0, trophies: 0, cars: [], packs: [] } });
							var i = 0;
							while (i < 5) {
								var carFile = starterCars[i];
								await message.client.db.push(`acc${user.id}.garage`, { carFile: carFile,
																"000": 1,
																"333": 0,
																"666": 0,
																"996": 0,
																"969": 0,
																"699": 0
																});
								i++;
							}
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
							let infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully reset ${user.username}'s data!`)
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
								.setTimestamp();
							return reactionMessage.edit(infoScreen);
						case "❎":
							reactionMessage.reactions.removeAll();
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
							let cancelMessage = new Discord.MessageEmbed()
								.setColor("#34aeeb")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Action cancelled.")
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
								.setTimestamp();
							return reactionMessage.edit(cancelMessage);
						default:
							break;
					}
				})
				.catch(error => {
					console.error(error);
					reactionMessage.reactions.removeAll();
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
					let cancelMessage = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Action cancelled automatically.")
						.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
						.setTimestamp();
					return reactionMessage.edit(cancelMessage);
				});
		}
    }
}