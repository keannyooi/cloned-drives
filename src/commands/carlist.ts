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

module.exports = {
	name: "carlist",
	aliases: ["allcars"],
	usage: "(all optional) <page number> | -s <sorting criteria>",
	args: 0,
	category: "Info",
	description: "Shows all the cars that are available in Cloned Drives in list form.",
	async execute(message, args) {
		const db = message.client.db;
		const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
		const pageLimit = 10;
		const filter = (button) => {
			return button.clicker.user.id === message.author.id;
		};
		var list = carFiles;
		var carList = "", valueList = "";
		var reactionIndex = 0;
		var sortBy = "rq";
		var page;

		if (!args.length || (args[0] === "-s" && args[1])) {
			page = 1;
		}
		else if (!isNaN(args[0])) {
			page = parseInt(args[0]);
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorScreen = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, invalid integer provided.")
				.setDescription("It looks like the page number you requested is not a number.")
				.addField("Page Number Received", `\`${args[0]}\` (not a number)`)
				.setTimestamp();
			return message.channel.send(errorScreen);
		}

		const playerData = await db.get(`acc${message.author.id}`);
		const garage = playerData.garage;
		const carFilter = playerData.filter;
		if (carFilter !== undefined && playerData.settings.filtercarlist === true) {
			for (const [key, value] of Object.entries(carFilter)) {
				switch (typeof value) {
					case "object":
						if (Array.isArray(value)) {
							list = list.filter(function (carFile) {
								let currentCar = require(`./cars/${carFile}`);
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
							list = list.filter(function (carFile) {
								let currentCar = require(`./cars/${carFile}`);
								return currentCar[key] >= value.start && currentCar[key.replace("count", "Count").replace("y", "Y")] <= value.end;
							});
						}
						break;
					case "string":
						if (key === "search") {
							list = list.filter(function (carFile) {
								let currentCar = require(`./cars/${carFile}`);
								let make = currentCar["make"];
								if (typeof make === "object") {
									make = currentCar["make"][0];
								}
								let name = `${make} ${currentCar["model"]}`;
								return name.toLowerCase().includes(value);
							});
						}
						else {
							list = list.filter(function (carFile) {
								let currentCar = require(`./cars/${carFile}`);
								return currentCar[key].toLowerCase() === value;
							});
						}
						break;
					case "boolean":
						if (key === "isPrize") {
							list = list.filter(function (carFile) {
								let currentCar = require(`./cars/${carFile}`);
								return currentCar[key] === value;
							});
						}
						else if (key === "isOwned") {
							list = list.filter(function (carFile) {
								return garage.some(car => carFile.includes(car.carFile)) === value;
							});
						}
						break
					default:
						break;
				}
			}
		}
		const ownedCars = list.filter(function (carFile) {
			return garage.some(part => carFile.includes(part.carFile));
		});

		const totalCars = list.length;
		const totalPages = Math.ceil(totalCars / pageLimit);

		if (args[args.length - 2] === "-s") {
			switch (args[args.length - 1].toLowerCase()) {
				case "rq":
					break;
				case "topspeed":
					sortBy = "topSpeed";
					break;
				case "accel":
					sortBy = "0to60";
					break;
				case "handling":
				case "weight":
				case "mra":
				case "ola":
				case "mostowned":
					sortBy = args[args.length - 1].toLowerCase();
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
		}

		list.sort(function (a, b) {
			const carA = require(`./cars/${a}`);
			const carB = require(`./cars/${b}`);
			if (sortBy === "mostowned") {
				const garA = garage.find(o => o.carFile === a);
				const garB = garage.find(o => o.carFile === b);
				let amountA = 0, amountB = 0;
				if (garA !== undefined) {
					amountA = garA["000"] + garA["333"] + garA["666"] + garA["996"] + garA["969"] + garA["699"];
				}
				if (garB !== undefined) {
					amountB = garB["000"] + garB["333"] + garB["666"] + garB["996"] + garB["969"] + garB["699"];
				}

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
				let critA = carA[sortBy], critB = carB[sortBy];
				if (sortBy === "topSpeed" || sortBy === "0to60" || sortBy === "handling") {
					let checkOrder = ["333", "666", "699", "969", "996"];

					for (let i = 0; i < checkOrder.length; i++) {
						if (a[checkOrder[i]] > 0) {
							critA = carA[`${checkOrder[i]}${sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}`];
						}
						if (b[checkOrder[i]] > 0) {
							critB = carB[`${checkOrder[i]}${sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}`];
						}
					}
				}

				if (carA[sortBy] === carB[sortBy]) {
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
						if (sortBy === "0to60" || sortBy === "weight" || sortBy === "ola") {
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
						if (sortBy === "0to60" || sortBy === "weight" || sortBy === "ola") {
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
				.setDescription(`The car list ends at page ${totalPages}.`)
				.addField("Page Number Received", `\`${page}\` (not within the range of 1 and ${totalPages})`)
				.setTimestamp();
			return message.channel.send(errorScreen);
		}
		carDisplay(page);
		if (carList.length > 1024) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorScreen = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Due to Discord's embed limitations, this page has too many characters and thus cannot be shown.")
				.setDescription("Try turning `Shortened Lists` on in `cd-settings`.")
				.addField("Total Characters in List", `\`${carList.length}\` > \`1024\``)
				.setTimestamp();
			return message.channel.send(errorScreen);
		}

		let firstPage, prevPage, nextPage, lastPage;
		if (playerData.settings.buttonstyle === "classic") {
			firstPage = new disbut.MessageButton()
				.setStyle("grey")
				.setEmoji("⏪")
				.setID("first_page");
			prevPage = new disbut.MessageButton()
				.setStyle("grey")
				.setEmoji("⬅️")
				.setID("prev_page");
			nextPage = new disbut.MessageButton()
				.setStyle("grey")
				.setEmoji("➡️")
				.setID("next_page");
			lastPage = new disbut.MessageButton()
				.setStyle("grey")
				.setEmoji("⏩")
				.setID("last_page");
		}
		else {
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
		}

		let infoScreen = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle(`List of All Cars in Cloned Drives (${ownedCars.length}/${totalCars} Cars Owned)`)
			.setDescription(`Current Sorting Criteria: \`${sortBy}\`, Filter Activated: \`${(carFilter !== undefined && playerData.settings.filtercarlist === true)}\``)
			.addField("Car", carList, true)
			.setFooter(`Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`)
			.setTimestamp();
		if (sortBy !== "rq") {
			infoScreen.addField("Value", valueList, true)
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
		await message.channel.send({ embed: infoScreen, component: row }).then(listMessage => {
			const collector = listMessage.createButtonCollector(filter, { time: 60000 });
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
				carDisplay(page);
				if (carList.length > 1024) {
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Due to Discord's embed limitations, this page has too many characters and thus cannot be shown.")
						.setDescription("Try turning `Shortened Lists` on in `cd-settings`.")
						.addField("Total Characters in List", `\`${carList.length}\` > \`1024\``)
						.setTimestamp();
					return listMessage.edit(errorScreen);
				}

				if (playerData.settings.buttonstyle === "classic") {
					firstPage = new disbut.MessageButton()
						.setStyle("grey")
						.setEmoji("⏪")
						.setID("first_page");
					prevPage = new disbut.MessageButton()
						.setStyle("grey")
						.setEmoji("⬅️")
						.setID("prev_page");
					nextPage = new disbut.MessageButton()
						.setStyle("grey")
						.setEmoji("➡️")
						.setID("next_page");
					lastPage = new disbut.MessageButton()
						.setStyle("grey")
						.setEmoji("⏩")
						.setID("last_page");
				}
				else {
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
				}

				infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`List of All Cars in Cloned Drives (${ownedCars.length}/${totalCars} Cars Owned)`)
					.setDescription(`Current Sorting Criteria: \`${sortBy}\`, Filter Activated: \`${(carFilter !== undefined && playerData.settings.filtercarlist === true)}\``)
					.addField("Car", carList, true)
					.setFooter(`Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`)
					.setTimestamp();
				if (sortBy !== "rq") {
					infoScreen.addField("Value", valueList, true)
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
				await listMessage.edit({ embed: infoScreen, component: row });
				await button.reply.defer();
			});

			collector.on("end", () => {
				listMessage.edit({ embed: infoScreen, component: null });
			});
		});

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

		function carDisplay(page) {
			let startsWith, endsWith;

			if (list.length - pageLimit <= 0) {
				startsWith = 0;
				endsWith = list.length;
				reactionIndex = 0;
			}
			else if (page * pageLimit === pageLimit) {
				startsWith = 0;
				endsWith = pageLimit;
				reactionIndex = 1;
			}
			else if (list.length - (pageLimit * page) <= 0) {
				startsWith = pageLimit * (page - 1);
				endsWith = list.length;
				reactionIndex = 2;
			}
			else {
				startsWith = pageLimit * (page - 1);
				endsWith = startsWith + pageLimit;
				reactionIndex = 3;
			}
			carList = valueList = "";

			for (i = startsWith; i < endsWith; i++) {
				carList += `${i + 1 - ((page - 1) * 10)}. `;
				valueList += `${i + 1 - ((page - 1) * 10)}. `;
				const currentCar = require(`./cars/${list[i]}`);
				let rarity;
				if (playerData.settings.shortenedlists) {
					rarity = "RQ";
				}
				else {
					rarity = rarityCheck(currentCar);
				}

				let make = currentCar["make"];
				if (typeof make === "object") {
					make = currentCar["make"][0];
				}
				carList += `(${rarity} ${currentCar["rq"]}) ${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
				if (currentCar["isPrize"]) {
					if (playerData.settings.shortenedlists) {
						carList += ` 🏆`;
					}
					else {
						carList += ` ${trophyEmoji}`;
					}
				}
				if (sortBy === "mostowned") {
					let count = garage.find(o => o.carFile === list[i]);
					let countNumber = 0;
					if (count !== undefined) {
						countNumber = count["000"] + count["333"] + count["666"] + count["996"] + count["969"] + count["699"];
					}
					valueList += `\`${countNumber}\`\n`;
				}
				else if (sortBy !== "rq") {
					valueList += `\`${currentCar[sortBy]}\`\n`;
				}
				if (garage.some(car => list[i].includes(car.carFile))) {
					carList += " ✅\n";
				}
				else {
					carList += "\n";
				}
			}
		}
	}
}