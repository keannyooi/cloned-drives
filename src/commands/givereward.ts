/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));

module.exports = {
    name: "givereward",
    usage: "<username> <pack or offer> <pack/offer name>",
    args: 3,
	category: "Admin",
    description: "Gifts someone a pack or offer. Those who are given a pack/offer via this command can claim them through cd-rewards.",
    execute(message, args) {
		const db = message.client.db;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        if (message.mentions.users.first()) {
			if (!message.mentions.users.first().bot) {
				addStuff(message.mentions.users.first());
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
								addStuff(userList[parseInt(collected.first().content) - 1], currentMessage);
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
				addStuff(userList[0]);
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

		async function addStuff(user, currentMessage) {
			const unclaimedRewards = await db.get(`acc${user.id}.unclaimedRewards`);
			let infoScreen;
			switch (args[1].toLowerCase()) {
				case "pack":
					let packName = args.slice(2, args.length).map(i => i.toLowerCase());
					let packFile;
					let searchResults = packFiles.filter(function (pack) {
						return packName.every(part => pack.includes(part));
					});

					if (searchResults.length > 1) {
						let packList = "";
						for (i = 1; i <= searchResults.length; i++) {
							let currentPack = require(`./packs/${searchResults[i - 1]}`);
							packList += `${i} - ${currentPack["packName"]}\n`;
						}

						const infoScreen = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Multiple packs found, please type one of the following.")
							.setDescription(packList)
							.setTimestamp();

						await message.channel.send(infoScreen).then(async currentMessage => {
							await message.channel.awaitMessages(filter, {
								max: 1,
								time: 60000,
								errors: ["time"]
							})
								.then(collected => {
									collected.first().delete();
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
										packFile = searchResults[parseInt(collected.first().content) - 1];
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
						packFile = searchResults[0];
					}
					else {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, pack requested not found.")
							.setDescription("Well that sucks.")
							.addField("Keywords Received", `\`${packName.join(" ")}\``)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					unclaimedRewards.packs.push(packFile);
					let currentPack = require(`./packs/${packFile}`);
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully gifted 1 ${currentPack["packName"]} to ${user.username}!`)
						.setImage(currentPack["pack"])
						.setTimestamp();
					break;
				case "offer":
					const offers = await db.get("limitedOffers");
					let offerName = args.slice(2, args.length).map(i => i.toLowerCase());
					let searchResults1 = offers.filter(function (offer) {
						return offerName.every(part => offer.name.toLowerCase().includes(part));
					});
					let giveOffer;

					if (searchResults1.length > 1) {
						let offerList = "";
						for (i = 1; i <= searchResults1.length; i++) {
							offerList += `${i} - ${searchResults1[i - 1].name}\n`;
						}

						const infoScreen = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Multiple offers found, please type one of the following.")
							.setDescription(offerList)
							.setTimestamp();

						await message.channel.send(infoScreen).then(async currentMessage => {
							await message.channel.awaitMessages(filter, {
								max: 1,
								time: 60000,
								errors: ["time"]
							})
								.then(collected => {
									collected.first().delete();
									if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults1.length || parseInt(collected.first().content) < 1) {
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
										giveOffer = searchResults1[parseInt(collected.first().content) - 1];
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
					else if (searchResults1.length > 0) {
						giveOffer = searchResults1[0];
					}
					else {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, offer requested not found.")
							.setDescription("Well that sucks.")
							.addField("Keywords Received", `\`${offerName.join(" ")}\``)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					for (let [key, value] of Object.entries(giveOffer.offer)) {
						switch (key) {
							case "money":
							case "fuseTokens":
							case "trophies":
								unclaimedRewards[key] += value;
								break;
							case "car":
								let isInRewards = unclaimedRewards.cars.findIndex(car => {
									return car.carFile === value;
								});
								if (isInRewards !== -1) {
									unclaimedRewards.cars[isInRewards].amount++;
								}
								else {
									unclaimedRewards.cars.push({
										carFile: value,
										amount: 1
									});
								};
								break;
							case "pack":
								unclaimedRewards.packs.push(value);
								break;
							default:
								break;
						}
					}

					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully gifted 1 ${giveOffer.name} to ${user.username}!`)
						.setTimestamp();
					break;
				default:
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Error, I don't know what you want to gift to ${user.username}.`)
						.setDescription("You can either gift a `pack` or an `offer`. Choose either one.")
						.addField("Received Gift Type", `\`${args[1].toLowerCase()}\``)
						.setTimestamp();
					if (currentMessage) {
						return currentMessage.edit(errorMessage);
					}
					else {
						return message.channel.send(errorMessage);
					}
			}

			await db.set(`acc${user.id}.unclaimedRewards`, unclaimedRewards);
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			return message.channel.send(infoScreen);
		}
    }
}