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
    name: "garage",
	aliases: ["g"],
    usage: "(all optional) <username goes here> | <page number>",
    args: 0,
	isExternal: true,
    adminOnly: false,
    description: "Shows your (or other people's) garage.",
    async execute(message, args) {
        const db = message.client.db;
        let user = message.author;

        if (!args.length) {
			loop(user, 1);
        }
        else {
			if (isNaN(args[0])) {
				let page = 1;
				let userName;
				if (isNaN(args[args.length - 1])) {
					userName = args.map(i => i.toLowerCase());
				}
				else {
					userName = args.slice(0, args.length - 1).map(i => i.toLowerCase());
					page = parseInt(args[args.length - 1]);
				}
				if (message.mentions.users.first()) {
					if (!message.mentions.users.first().bot) {
						loop(message.mentions.users.first(), page);
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
					let filter = response => {
						return response.author.id === message.author.id;
					};
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
											.setTimestamp();
										return currentMessage.edit(errorMessage);
									}
									else {
										loop(userList[parseInt(collected.first().content) - 1], page, currentMessage);
									}
								})
								.catch(error => {
									console.log(error);
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
						loop(userList[0], page);
					}
					else {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, 404 user not found.")
							.setDescription("It looks like this user isn't in this server.")
							.addField("Keywords Received", `\`${userName.join(" ")}\``)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}
				}
            }
            else {
				loop(user, parseInt(args[0]));
            }
        }

		async function loop(user, page, currentMessage) {
			const pageLimit = 10;
			let garage = await db.get(`acc${user.id}.garage`);
			let reactionIndex = 0;
			let filter = (reaction, user) => {
				return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
			};

			const carFilter = await db.get(`acc${message.author.id}.filter`);
			if (carFilter !== null) {
				for (const [key, value] of Object.entries(carFilter)) {
					switch (typeof value) {
						case "object":
							if (Array.isArray(value)) {
								garage = garage.filter(function (car) {
									let currentCar = require(`./cars/${car.carFile}`);
									if (Array.isArray(currentCar[key])) {
										let obj = {};
										currentCar[key].forEach((tag, index) => obj[tag.toLowerCase()] = index);
										return value.every(tagFilter => { return obj[tagFilter] !== undefined });
									}
									else {
										return value.includes(currentCar[key].toLowerCase());
									}
								});
							}
							else {
								garage = garage.filter(function (car) {
									let currentCar = require(`./cars/${car.carFile}`);
									return currentCar[key] >= value.start && currentCar[key] <= value.end;
								});
							}
							break;
						case "string":
							if (key === "search") {
								garage = garage.filter(function (car) {
									let currentCar = require(`./cars/${car.carFile}`);
									let make = currentCar["make"];
									if (typeof make === "object") {
										make = currentCar["make"][0];
									}
									let name = `${make} ${currentCar["model"]}`;
									return name.toLowerCase().includes(value);
								});
							}
							else {
								garage = garage.filter(function (car) {
									let currentCar = require(`./cars/${car.carFile}`);
									return currentCar[key].toLowerCase() === value;
								});
							}
							break;
						case "boolean":
							garage = garage.filter(function (car) {
								let currentCar = require(`./cars/${car.carFile}`);
								switch (key) {
									case "isPrize":
										return currentCar[key] === value;
									case "isStock": 
										return (car["000"] > 0) === value;
									case "isUpgraded":
										return (car["333"] + car["666"] + car["996"] + car["969"] + car["699"] > 0) === value;
									case "isMaxed":
										return (car["996"] + car["969"] + car["699"] > 0) === value;
									case "isOwned":
										return true;
									default:
										break;
								}
							});
							break;
						default:
							break;
					}
				}
			}

			const totalPages = Math.ceil(garage.length / pageLimit);
			garage.sort(function (a, b) {
				const carA = require(`./cars/${a.carFile}`);
				const carB = require(`./cars/${b.carFile}`);

				if (carA["rq"] === carB["rq"]) {
					let nameA = `${carA["make"]} ${carA["model"]}`.toLowerCase();
					let nameB = `${carA["make"]} ${carA["model"]}`.toLowerCase();
					if (typeof carA["make"] === "object") {
						nameA = `${carA["make"][0]} ${carA["model"]}`.toLowerCase();
					}
					if (typeof carB["make"] === "object") {
						nameB = `${carB["make"][0]} ${carB["model"]}`.toLowerCase();
					}

					if (nameA < nameB) {
						return -1;
					}
					else if (nameA > nameB) {
						return 1;
					}
					else {
						return 0;
					}
				}
				else {
					if (carA["rq"] > carB["rq"]) {
						return -1;
					}
					else {
						return 1;
					}
				}
			});

			if (page < 1 || totalPages < page) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, page number requested invalid.")
					.setDescription(`This garage ends at page ${totalPages}.`)
					.addField("Page Number Received", `\`${page}\` (either not a number, smaller than 1 or bigger than ${totalPages})`)
					.setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(errorScreen);
				}
				else {
					return message.channel.send(errorScreen);
				}
			}
			let lists = garageDisplay(page, garage);

			let infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`${user.username}'s Garage`)
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
				.setDescription(`Filter Activated: \`${carFilter !== null}\``)
				.addField("Car", lists.garageList, true)
				.addField("Amount", lists.amountList, true)
				.setTimestamp();
			if (message.channel.type === "text") {
				infoScreen.setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`);
			}
			else {
				infoScreen.setFooter(`Page ${page} of ${totalPages} - Arrow navigation is disabled in DMs, please use cd-garage <user or blank if it's you> <page number> to view a different page.`);
			}

			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			let garageMessage;
			if (currentMessage) {
				garageMessage = await currentMessage.edit(infoScreen);
			}
			else {
				garageMessage = await message.channel.send(infoScreen);
			}

			if (message.channel.type === "text") {
				switch (reactionIndex) {
					case 0:
						break;
					case 1:
						garageMessage.react("➡️");
						break;
					case 2:
						garageMessage.react("⬅️");
						break;
					case 3:
						garageMessage.react("⬅️");
						garageMessage.react("➡️");
						break;
					default:
						break;
				}

				const collector = garageMessage.createReactionCollector(filter, { time: 60000 });
				collector.on("collect", reaction => {
					if (reaction.emoji.name === "⬅️") {
						page -= 1;
					}
					else if (reaction.emoji.name === "➡️") {
						page += 1;
					}
					lists = garageDisplay(page, garage);
					garageMessage.reactions.removeAll();

					let infoScreen = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`${user.username}'s Garage`)
						.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
						.setDescription(`Filter Activated: \`${carFilter !== null}\``)
						.addField("Car", lists.garageList, true)
						.addField("Amount", lists.amountList, true)
						.setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
						.setTimestamp();
					garageMessage.edit(infoScreen);

					switch (reactionIndex) {
						case 0:
							break;
						case 1:
							garageMessage.react("➡️");
							break;
						case 2:
							garageMessage.react("⬅️");
							break;
						case 3:
							garageMessage.react("⬅️");
							garageMessage.react("➡️");
							break;
						default:
							break;
					}
				});

				collector.on("end", () => {
					console.log("end of collection");
					garageMessage.reactions.removeAll();
				});
			}

			function garageDisplay(page, garage) {
				const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
				const pageLimit = 10;
				let startsWith, endsWith;

				if (garage.length - pageLimit <= 0) {
					startsWith = 0;
					endsWith = garage.length;
					reactionIndex = 0;
				}
				else if (page * pageLimit === pageLimit) {
					startsWith = 0;
					endsWith = pageLimit;
					reactionIndex = 1;
				}
				else if (garage.length - (pageLimit * page) <= 0) {
					startsWith = pageLimit * (page - 1);
					endsWith = garage.length;
					reactionIndex = 2;
				}
				else {
					startsWith = pageLimit * (page - 1);
					endsWith = startsWith + pageLimit;
					reactionIndex = 3;
				}
				let garageList = "", amountList = "";

				for (i = startsWith; i < endsWith; i++) {
					garageList += `${i + 1 - ((page - 1) * 10)}. `;
					amountList += `${i + 1 - ((page - 1) * 10)}. `;
					//console.log(garage[i]);
					let currentCar = require(`./cars/${garage[i].carFile}`);
					let make = currentCar["make"];
					if (typeof make === "object") {
						make = currentCar["make"][0];
					}
					const rarity = rarityCheck(currentCar);

					garageList += `(${rarity} ${currentCar["rq"]}) ${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
					for (const [key, value] of Object.entries(garage[i])) {
						if (!isNaN(value) && value > 0) {
							amountList += `${key} x${value}, `;
						}
					}
					if (currentCar["isPrize"]) {
						garageList += ` ${trophyEmoji}`;
					}
					garageList += "\n";
					amountList = amountList.slice(0, -2);
					amountList += "\n";
				}
				return { garageList: garageList, amountList: amountList };
			}
		}

        function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return message.client.emojis.cache.get("726025494138454097");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.client.emojis.cache.get("726025468230238268");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return message.client.emojis.cache.get("726025431937187850");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.client.emojis.cache.get("726025394104434759");
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                return message.client.emojis.cache.get("726025302656024586");
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                return message.client.emojis.cache.get("726025273421725756");
            }
            else { //common
                return message.client.emojis.cache.get("726020544264273928");
            }
        }
    }
}