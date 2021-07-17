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
    name: "reset",
    aliases: ["rs", "noneandquitthegame"],
    usage: "<username>",
    args: 1,
	category: "Admin",
    description: "Resets your stats.",
    async execute(message, args) {
		const starterCars = ["honda s2000 (1999).json", "peugeot 405 mi16 (1989).json", "range rover county (1989).json", "nissan leaf (2010).json", "de tomaso mangusta (1967).json"];
		const filter = response => {
            return response.author.id === message.author.id;
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
					.addField("Keywords Received", `\`${userName}\``)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
		}

		async function noneAndQuitTheGame(user, currentMessage) {
			let yse = new disbut.MessageButton()
                .setStyle("green")
                .setLabel("Yes!")
                .setID("yse");
            let nop = new disbut.MessageButton()
                .setStyle("red")
                .setLabel("No!")
                .setID("nop");
            let row = new disbut.MessageActionRow().addComponents(yse, nop);
			const confirmationMessage = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`Are you sure you want to reset ${user.username}'s data? (WARNING: THIS ACTION IS IRREVERSIBLE)`)
				.setTimestamp();

			let reactionMessage, processed = false;
			if (currentMessage) {
				reactionMessage = await currentMessage.edit({ embed: confirmationMessage, component: row });
			}
			else {
				reactionMessage = await message.channel.send({ embed: confirmationMessage, component: row });
			}

			message.client.once("clickButton", async (button) => {
                if (button.clicker.id === message.author.id && button.message.id === reactionMessage.id) {
                    yse.setDisabled();
                    nop.setDisabled();
                    row = new disbut.MessageActionRow().addComponents(yse, nop);
                    processed = true;
                    switch (button.id) {
                        case "yse":
							await button.reply.defer();
                            await message.client.db.set(`acc${user.id}`, { money: 0,
								fuseTokens: 0,
								trophies: 0,
								garage: [],
								decks: [],
								campaignProgress: { chapter: 0, part: 1, race: 1 },
								unclaimedRewards: { money: 0, fuseTokens: 0, trophies: 0, cars: [], packs: [] },
								settings: { enablegraphics: true, senddailynotifs: false, filtercarlist: true, filtergarage: true, showbmcars: false }
							});
							let i = 0;
							while (i < 5) {
								let carFile = starterCars[i];
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
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully reset ${user.username}'s data!`)
								.setTimestamp();
                            return reactionMessage.edit({ embed: infoScreen, component: row });
                        case "nop":
                            await button.reply.defer();
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return reactionMessage.edit({ embed: cancelMessage, component: row });
                        default:
                            break;
                    }
                }
            });

            setTimeout(() => {
                if (!processed) {
                    yse.setDisabled();
                    nop.setDisabled();
                    row = new disbut.MessageActionRow().addComponents(yse, nop);

					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return reactionMessage.edit({ embed: cancelMessage, component: row });
                }
            }, 10000);
		}
    }
}