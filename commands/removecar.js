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
    name: "removecar",
    aliases: ["rmvcar"],
    usage: "<username> | (optional) <amount> | <car name goes here>",
    args: 2,
	isExternal: false,
    adminOnly: true,
    description: "Removes one or more cars from someone's garage. (data transferring)",
    execute(message, args) {
        const db = message.client.db;
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        if (message.mentions.users.first()) {
			if (message.mentions.users.first()) {
				if (!message.mentions.users.first().bot) {
					getCar(message.mentions.users.first());
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
								getCar(userList[parseInt(collected.first().content) - 1], currentMessage);
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
				getCar(userList[0]);
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

		async function getCar(user, currentMessage) {
			const playerData = await db.get(`acc${user.id}`);
			const garage = playerData.garage;
			let garageLength = 0;

			for (let car of garage) {
				garageLength += car["000"] + car["333"] + car["666"] + car["996"] + car["969"] + car["699"];
			}
			if (garageLength <= 5) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("HOLD ON RIGHT THERE!")
					.setDescription("This player only has 5 cars left. Please spare him and stop removing cars from his possession!")
					.setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(errorMessage);
				}
				else {
					return message.channel.send(errorMessage);
				}
			}

			let carName;
			let amount = 1;
			if (args[1].toLowerCase() === "all" && args[1]) {
				carName = args.slice(2, args.length).map(i => i.toLowerCase());
			}
			else if (isNaN(args[1]) || !args[2]) {
				carName = args.slice(1, args.length).map(i => i.toLowerCase());
			}
			else {
				amount = Math.ceil(parseInt(args[1]));
				carName = args.slice(2, args.length).map(i => i.toLowerCase());
			}

			const searchResults = garage.filter(function (garageCar) {
				return carName.every(part => garageCar.carFile.includes(part));
			});
			let searchResults1 = [];

			if (args[1].toLowerCase() === "all" || amount > 1) {
				for (let car of searchResults) {
					if (car["000"] >= amount || car["333"] >= amount || car["666"] >= amount || car["996"] >= amount || car["969"] >= amount || car["699"] >= amount) {
						searchResults1.push(car);
					}
				}
			}
			else {
				searchResults1 = searchResults;
			}
			if (searchResults1.length > 1) {
				let carList = "";
				for (i = 1; i <= searchResults1.length; i++) {
					let car = require(`./cars/${searchResults1[i - 1].carFile}`);
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

				let currentMessage2;
				if (currentMessage) {
					currentMessage2 = await currentMessage.edit(infoScreen);
				}
				else {
					currentMessage2 = await message.channel.send(infoScreen);
				}

				message.channel.awaitMessages(filter, {
					max: 1,
					time: 30000,
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
							return currentMessage2.edit(errorMessage);
						}
						else {
							currentCar = searchResults1[parseInt(collected.first().content) - 1];
							selectUpgrade(user, playerData, currentCar, amount, currentMessage2);
						}
					})
					.catch(() => {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const cancelMessage = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Action cancelled automatically.")
							.setTimestamp();
						return currentMessage2.edit(cancelMessage);
					});
			}
			else if (searchResults1.length > 0) {
				selectUpgrade(user, playerData, searchResults1[0], amount);
			}
			else {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, it looks like you don't have enough cars to perform this action.")
					.setDescription("If you are bulk fusing cars, take note that you can't bulk fuse upgraded cars. Besides, you can't fuse maxed cars and prize cars.")
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
		}

		async function selectUpgrade(user, playerData, currentCar, amount, currentMessage) {
			let isOne = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && currentCar[m] >= amount);
			if (isOne.length === 1) {
				removeCar(user, playerData, currentCar, amount, isOne[0], currentMessage);
			}
			else {
				let upgradeList = "Type in any tune that is displayed here.\n";
				for (let upg of isOne) {
					upgradeList += `\`${upg}\`, `;
				}
				
				let infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Remove car from which tune?")
					.setDescription(upgradeList.slice(0, -2))
					.setTimestamp();
				let upgradeMessage;
				if (currentMessage) {
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
						collected.first().delete();
						if (isOne.find(m => m === collected.first().content) === undefined) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, invalid selection provided.")
								.setDescription("It looks like your response was not part of the selection.")
								.setTimestamp();
							return upgradeMessage.edit(errorMessage);
						}
						else {
							removeCar(user, playerData, currentCar, amount, collected.first().content, upgradeMessage);
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

        async function removeCar(user, playerData, currentCar, amount, upgrade, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;

			if (args[1].toLowerCase() === "all") {
				amount = currentCar[upgrade];
			}
            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove ${amount} of ${user.username}'s ${currentName} from their garage?`)
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setImage(car["card"])
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
                            if (playerData.hand) {
								if (playerData.hand.carFile === currentCar.carFile) {
                   					delete playerData.hand;
                				}
							}
							for (i = 0; i < playerData.decks.length; i++) {
								for (x = 0; x < playerData.decks[i].hand.length; x++) {
									let car = playerData.decks[i].hand[x];
									if (car.carFile === currentCar.carFile && `${car.gearingUpgrade}${car.engineUpgrade}${car.chassisUpgrade}` === upgrade) {
										playerData.decks[i].hand[x] = "None";
									}
								}
							}

							let remove = playerData.garage.find(garageCar => {
								return garageCar.carFile === currentCar.carFile;
							});
							remove[upgrade] -= amount;
							if (remove["000"] + remove["333"] + remove["666"] + remove["996"] + remove["969"] + remove["699"] === 0) {
								playerData.garage.splice(playerData.garage.indexOf(currentCar), 1);
                        	}
                            await db.set(`acc${user.id}`, playerData);
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed ${amount} of ${user.username}'s ${currentName}!`)
                                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(infoScreen);
                        case "❎":
                            reactionMessage.reactions.removeAll();
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setDescription(`${user.username}'s ${currentName} stays in their garage.`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(cancelMessage);
                        default:
                            break;
                    }
                })
                .catch(error => {
                    console.error(error);
                    reactionMessage.reactions.removeAll();
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                        .setDescription(`${user.username}'s ${currentName} stays in their garage.`)
                        .setImage(car["card"])
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
        }
    }
}