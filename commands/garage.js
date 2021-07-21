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
	name: "garage",
	aliases: ["g"],
	usage: "(all optional) <username goes here> | <page number>",
	args: 0,
	category: "Configuration",
	description: "Shows your (or other people's) garage.",
	async execute(message, args) {
		const db = message.client.db;
		let user = message.author;
		let sort = "rq";

		if (!args.length || (args[0] === "-s" && args[1])) {
			if (args[0] === "-s" && args[1]) {
				sort = args[1].toLowerCase();
			}
			loop(user, 1, sort);
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
				if (args[args.length - 2] === "-s" && args[args.length - 1]) {
					sort = args[args.length - 1].toLowerCase();
				}

				if (message.mentions.users.first()) {
					if (!message.mentions.users.first().bot) {
						loop(message.mentions.users.first(), page, sort);
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
					userName = args[0].toLowerCase();
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
											.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
											.setTimestamp();
										return currentMessage.edit(errorMessage);
									}
									else {
										loop(userList[parseInt(collected.first().content) - 1], page, sort, currentMessage);
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
						loop(userList[0], page, sort);
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
				if (args[args.length - 2] === "-s" && args[args.length - 1]) {
					sort = args[args.length - 1].toLowerCase();
				}
				loop(user, parseInt(args[0]), sort);
			}
		}

		async function loop(user, page, sort, currentMessage) {
			const pageLimit = 10;
			const filter = (button) => {
				return button.clicker.user.id === message.author.id;
			};
			let garage = await db.get(`acc${user.id}.garage`);
			let reactionIndex = 0;

			switch (sort) {
				case "rq":
				case "handling":
				case "weight":
				case "mra":
				case "ola":
				case "mostowned":
					break;
				case "topspeed":
					sort = "topSpeed";
					break;
				case "accel":
					sort = "0to60";
					break;
				default:
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, sorting criteria not found.")
						.setDescription(`Here is a list of sorting criterias. 
                                         \`-s topspeed\` - Sort by top speed. 
                                         \`-s accel\` - Sort by acceleration. 
                                         \`-s handling\` - Sort by handling. 
                                         \`-s weight\` - Sort by weight. 
                                         \`-s mra\` - Sort by mid-range acceleraion. 
                                         \`-s ola\` - Sort by off-the-line acceleration.
										 \`-s mostowned\` - Sort by how many copies of the car owned.`)
						.setTimestamp();
					return message.channel.send(errorScreen);
			}

			const playerData = await db.get(`acc${message.author.id}`);
			const carFilter = playerData.filter;
			if (carFilter !== undefined && playerData.settings.filtergarage === true) {
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

				if (sort === "mostowned") {
					let amountA = a["000"] + a["333"] + a["666"] + a["996"] + a["969"] + a["699"];
					let amountB = b["000"] + b["333"] + b["666"] + b["996"] + b["969"] + b["699"];
					if (amountA === amountB) {
						let nameA1 = `${carA["make"]} ${carA["model"]}`.toLowerCase();
						let nameB1 = `${carA["make"]} ${carA["model"]}`.toLowerCase();
						if (typeof carA["make"] === "object") {
							nameA1 = `${carA["make"][0]} ${carA["model"]}`.toLowerCase();
						}
						if (typeof carB["make"] === "object") {
							nameB1 = `${carB["make"][0]} ${carB["model"]}`.toLowerCase();
						}

						if (nameA1 < nameB1) {
							return -1;
						}
						else if (nameA1 > nameB1) {
							return 1;
						}
						else {
							return 0;
						}
					}
					else {
						if (playerData.settings.sortingorder === "descending") {
							if (amountA > amountB) {
								return -1;
							}
							else {
								return 1;
							}
						}
						else {
							if (amountA < amountB) {
								return -1;
							}
							else {
								return 1;
							}
						}
					}
				}
				else {
					let critA = carA[sort], critB = carB[sort];
					if (sort === "topSpeed" || sort === "0to60" || sort === "handling") {
						let checkOrder = ["333", "666", "699", "969", "996"];

						for (let i = 0; i < checkOrder.length; i++) {
							if (a[checkOrder[i]] > 0) {
								critA = carA[`${checkOrder[i]}${sort.charAt(0).toUpperCase() + sort.slice(1)}`];
							}
							if (b[checkOrder[i]] > 0) {
								critB = carB[`${checkOrder[i]}${sort.charAt(0).toUpperCase() + sort.slice(1)}`];
							}
						}
					}

					if (critA === critB) {
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
						if (playerData.settings.sortingorder === "descending") {
							if (sort === "0to60" || sort === "weight" || sort === "ola") {
								if (critA < critB) {
									return -1;
								}
								else {
									return 1;
								}
							}
							else {
								if (critA > critB) {
									return -1;
								}
								else {
									return 1;
								}
							}
						}
						else {
							if (sort === "0to60" || sort === "weight" || sort === "ola") {
								if (critA > critB) {
									return -1;
								}
								else {
									return 1;
								}
							}
							else {
								if (critA < critB) {
									return -1;
								}
								else {
									return 1;
								}
							}
						}
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

			let firstPage = new disbut.MessageButton()
				.setStyle("red")
				.setLabel("<<")
				.setID("first_page");
			let prevPage = new disbut.MessageButton()
				.setStyle("blurple")
				.setLabel("<")
				.setID("prev_page");
			let nextPage = new disbut.MessageButton()
				.setStyle("blurple")
				.setLabel(">")
				.setID("next_page");
			let lastPage = new disbut.MessageButton()
				.setStyle("red")
				.setLabel(">>")
				.setID("last_page");

			let infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`${user.username}'s Garage`)
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
				.setDescription(`Current Sorting Criteria: \`${sort}\`, Filter Activated: \`${(carFilter !== undefined && playerData.settings.filtergarage === true)}\``)
				.addField("Car", lists.garageList, true)
				.addField("Amount", lists.amountList, true)
				.setFooter(`Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`)
				.setTimestamp();
			if (sort !== "rq") {
				infoScreen.addField("Values", lists.valueList, true);
			}

			switch (reactionIndex) {
				case 0:
					firstPage.setDisabled();
					prevPage.setDisabled();
					nextPage.setDisabled();
					lastPage.setDisabled();
					break;
				case 1:
					firstPage.setDisabled();
					prevPage.setDisabled();
					break;
				case 2:
					nextPage.setDisabled();
					lastPage.setDisabled();
					break;
				case 3:
					break;
				default:
					break;
			}
			let row = new disbut.MessageActionRow().addComponents(firstPage, prevPage, nextPage, lastPage);

			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			let garageMessage;
			if (currentMessage) {
				garageMessage = await currentMessage.edit({ embed: infoScreen, component: row });
			}
			else {
				garageMessage = await message.channel.send({ embed: infoScreen, component: row });
			}

			const collector = garageMessage.createButtonCollector(filter, { time: 60000 });
			collector.on("collect", async button => {
				switch (button.id) {
					case "first_page":
						page = 1;
						break;
					case "prev_page":
						page -= 1;
						break;
					case "next_page":
						page += 1;
						break;
					case "last_page":
						page = totalPages;
						break;
					default:
						break;
				}
				lists = garageDisplay(page, garage);

				firstPage = new disbut.MessageButton()
					.setStyle("red")
					.setLabel("<<")
					.setID("first_page");
				prevPage = new disbut.MessageButton()
					.setStyle("blurple")
					.setLabel("<")
					.setID("prev_page");
				nextPage = new disbut.MessageButton()
					.setStyle("blurple")
					.setLabel(">")
					.setID("next_page");
				lastPage = new disbut.MessageButton()
					.setStyle("red")
					.setLabel(">>")
					.setID("last_page");

				infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`${user.username}'s Garage`)
					.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
					.setDescription(`Current Sorting Criteria: \`${sort}\`, Filter Activated: \`${(carFilter !== undefined && playerData.settings.filtergarage === true)}\``)
					.addField("Car", lists.garageList, true)
					.addField("Amount", lists.amountList, true)
					.setFooter(`Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`)
					.setTimestamp();
				if (sort !== "rq") {
					infoScreen.addField("Values", lists.valueList, true);
				}

				switch (reactionIndex) {
					case 0:
						firstPage.setDisabled();
						prevPage.setDisabled();
						nextPage.setDisabled();
						lastPage.setDisabled();
						break;
					case 1:
						firstPage.setDisabled();
						prevPage.setDisabled();
						break;
					case 2:
						nextPage.setDisabled();
						lastPage.setDisabled();
						break;
					case 3:
						break;
					default:
						break;
				}
				row = new disbut.MessageActionRow().addComponents(firstPage, prevPage, nextPage, lastPage);
				await garageMessage.edit({ embed: infoScreen, component: row });
				await button.reply.defer();
			});

			collector.on("end", () => {
				garageMessage.edit({ embed: infoScreen, component: null });
			});

			function garageDisplay(page, garage) {
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
				let garageList = "", amountList = "", valueList = "";

				for (i = startsWith; i < endsWith; i++) {
					garageList += `**${i + 1 - ((page - 1) * 10)}.** `;
					amountList += `**${i + 1 - ((page - 1) * 10)}.** `;
					valueList += `**${i + 1 - ((page - 1) * 10)}.** `;
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
						garageList += ` 🏆`;
					}
					garageList += "\n";
					amountList = amountList.slice(0, -2);
					amountList += "\n";

					if (sort === "mostowned") {
						valueList += `\`${garage[i]["000"] + garage[i]["333"] + garage[i]["666"] + garage[i]["996"] + garage[i]["969"] + garage[i]["699"]}\`\n`;
					}
					else if (sort !== "rq") {
						let thonk = "";
						if (sort === "topSpeed" || sort === "0to60" || sort === "handling") {
							for (let [key, value] of Object.entries(garage[i])) {
								if (!isNaN(value)) {
									if (value > 0 && thonk.includes(key) === false) {
										let clarkson = currentCar[sort];
										if (key !== "000") {
											clarkson = currentCar[`${key}${sort.charAt(0).toUpperCase() + sort.slice(1)}`];
										}
										if (!thonk.includes(clarkson)) {
											thonk += `${clarkson}, `;
										}
									}
								}
							}
							thonk = thonk.slice(0, -2);
						}
						else {
							thonk = currentCar[sort];
						}
						valueList += `\`${thonk}\`\n`;
					}
				}
				return { garageList: garageList, amountList: amountList, valueList: valueList };
			}
		}

		function rarityCheck(currentCar) {
			if (currentCar["rq"] > 79) { //leggie
				return message.client.emojis.cache.get("857512942471479337");
			}
			else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
				return message.client.emojis.cache.get("726025468230238268");
			}
			else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
				return message.client.emojis.cache.get("726025431937187850");
			}
			else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
				return message.client.emojis.cache.get("857513197937623042");
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