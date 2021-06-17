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
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "addcar",
    usage: "<username> | (optional) <amount> | <car name goes here>",
    args: 2,
	isExternal: false,
    adminOnly: true,
    description: "Adds a car into your garage. (data transferring)",
    execute(message, args) {
        const db = message.client.db;
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        if (message.mentions.users.first()) {
			if (!message.mentions.users.first().bot) {
				let user = message.mentions.users.first();
				getCar(user);
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
					.addField("Keywords Received", `\`${userName}\``)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
		}

		async function getCar(user, currentMessage) {
			let carName;
			let amount = 1;
			if (isNaN(args[1]) || !args[2]) {
				carName = args.slice(1, args.length).map(i => i.toLowerCase());
			}
			else {
				amount = Math.ceil(parseInt(args[1]));
				carName = args.slice(2, args.length).map(i => i.toLowerCase());
			}

			if (amount < 1 || amount > 10) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, amount provided invalid.")
					.setDescription("You may not add more than 10 cars at once.")
					.addField("Amount Received", `\`${amount}\` (either smaller than 1 or bigger than 10)`)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}

			const searchResults = new Set(carFiles);
			searchResults.forEach(function (carFile) {
				if (carName.every(part => carFile.includes(part)) === false) {
					searchResults.delete(carFile);
				}
			});
			if (searchResults.size > 1) {
				let carList = "";
				let redirect = [];
				let i = 1;
				searchResults.forEach(function (carFile) {
					const car = require(`./cars/${carFile}`);
					let make = car["make"];
					if (typeof make === "object") {
						make = car["make"][0];
					}
					carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
					redirect[i - 1] = carFile;
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

				let currentMessage2;
				if (currentMessage) {
					currentMessage2 = await currentMessage.edit(infoScreen);
				}
				else {
					currentMessage2 = await message.channel.send(infoScreen);
				}
				message.channel.awaitMessages(filter, {
					max: 1,
					time: waitTime,
					errors: ['time']
				})
					.then(collected => {
						collected.first().delete();
						if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.size || parseInt(collected.first().content) < 1) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, invalid integer provided.")
								.setDescription("It looks like your response was either not a number or not part of the selection.")
								.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.size})`)
								.setTimestamp();
							return currentMessage2.edit(errorMessage);
						}
						else {
							addCar(redirect[parseInt(collected.first()) - 1], amount, user, currentMessage2);
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
			else if (searchResults.size > 0) {
				addCar(Array.from(searchResults)[0], amount, user);
			}
			else {
				let matches = stringSimilarity.findBestMatch(carName.join(" "), carFiles.map(i => i.slice(0, -5)));
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, car requested not found.")
					.setDescription("Well that sucks.")
					.addField("Keywords Received", `\`${carName.join(" ")}\``, true)
					.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
		}

        async function addCar(car, amount, user, currentMessage) {
			const garage = await db.get(`acc${user.id}.garage`);
            let currentCar = require(`./cars/${car}`);
			let make = currentCar["make"];
			if (typeof make === "object") {
				make = currentCar["make"][0];
			}
            const currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
			let isInGarage = garage.findIndex(garageCar => {
    			return garageCar.carFile === car;
  			});
			if (isInGarage !== -1) {
				garage[isInGarage]["000"] += amount;
			}
            else {
				garage.push({
					carFile: `${currentName.toLowerCase()}.json`,
					"000": amount,
					"333": 0,
					"666": 0,
					"996": 0,
					"969": 0,
					"699": 0,
				});
			}
			await db.set(`acc${user.id}.garage`, garage);
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully added ${amount} ${currentName} to ${user.username}'s garage!`)
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setImage(currentCar["card"])
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