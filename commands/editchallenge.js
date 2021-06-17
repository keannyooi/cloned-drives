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
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const tracksets = fs.readdirSync("./commands/tracksets").filter(file => file.endsWith(".json"));
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));
const stringSimilarity = require("string-similarity");
const { DateTime } = require("luxon");

module.exports = {
	name: "editchallenge",
	usage: "<criteria> | <value>",
	args: 1,
	isExternal: false,
	adminOnly: false,
	description: "Edits the challenge.",
	async execute(message, args) {
		const db = message.client.db;
		const challenge = await db.get("challenge");
		const filter = response => {
			return response.author.id === message.author.id;
		};

		if (!message.member.roles.cache.has("802043346951340064")) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, you don't have access to this command.")
				.setDescription("This command is only accessible if you have the Community Management role.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		let criteria = args[0].toLowerCase();
		let infoScreen, isError = false;
		switch (criteria) {
			case "name":
				let oldName = challenge.name;
				let challengeName = args.slice(1, args.length).join(" ");
				challenge.name = challengeName;

				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully changed the challenge name from ${oldName} to ${challengeName}!`)
					.setTimestamp();
				break;
			case "duration":
				if (challenge.isActive) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, this attribute cannot be edited while the event is live.")
						.setDescription("If you edit this value while the challenge is live, it would break the bot. If you want to extend the time of the challenge, use `cd-editchallenge extend <time in hours>`.")
						.setTimestamp();
					return message.channel.send(errorScreen);
				}

				if (!args[1]) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription("You are expected to provide the number of days after the criteria, or `unlimited` if you want the challenge to go on forever.")
						.setTimestamp();
					return message.channel.send(errorScreen);
				}

				let duration = args[1];
				if ((duration !== "unlimited" && isNaN(duration)) || parseInt(duration) < 1) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, duration provided is invalid.")
						.setDescription("The duration in days must be a positive number. If you want the challenge to last forever, just type `unlimited`.")
						.addField("Number Received", `\`${args[1]}\` (either not a positive number or not \`unlimited\`)`)
						.setTimestamp();
					return message.channel.send(errorScreen);
				}

				challenge.timeLeft = parseInt(duration);
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully changed the duration of the ${challenge.name} to \`${duration} day(s)\`!`)
					.setTimestamp();
				break;
			case "extend":
				if (!challenge.isActive) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, this attribute can only be edited while a challenge is live.")
						.setDescription("This command is only intended for the unlikely scenario of bot-related delays.")
						.setTimestamp();
					if (currentMessage) {
						return currentMessage.edit(errorScreen);
					}
					else {
						return message.channel.send(errorScreen);
					}
				}

				if (!args[2]) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription("You are expected to provide the extended duration in hours after the criteria.")
						.setTimestamp();
					if (currentMessage) {
						return currentMessage.edit(errorScreen);
					}
					else {
						return message.channel.send(errorScreen);
					}
				}

				let time = args[2];
				if (isNaN(time) || parseInt(time) < 1) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, duration provided is invalid.")
						.setDescription("The extended duration in hours must be a positive number.")
						.addField("Duration Value Received", `\`${time}\` (not a positive number)`)
						.setTimestamp();
					if (currentMessage) {
						return currentMessage.edit(errorScreen);
					}
					else {
						return message.channel.send(errorScreen);
					}
				}

				let origDate = DateTime.fromISO(challenge.deadline);
				challenge.deadline = origDate.plus({ hours: time }).toISO();
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully extended the duration of the ${challenge.name} challenge by \`${time} hour(s)\`!`)
					.setTimestamp();
				break;
			case "rounds":
				if (!args[1]) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription("You are expected to provide the amount of rounds in an event after the criteria, which is restricted to 1 ~ 10 rounds.")
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				else if (isNaN(args[1]) || args[1] < 1 || args[1] > 10) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round amount provided is not supported.")
						.setDescription("The number of rounds in a challenge is restricted to 1 ~ 10 rounds, just like events.")
						.addField("Number Received", `\`${args[1]}\` (either not a number or not within the range of \`1\` ~ \`10\`)`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				const rounds = parseInt(args[1]);
				let roster = [];
				for (let i = 0; i < rounds; i++) {
					const hand = [], tunes = [], tracks = [];
					for (let x = 0; x < 5; x++) {
						hand[x] = carFiles[Math.floor(Math.random() * carFiles.length)];
						tracks[x] = tracksets[Math.floor(Math.random() * tracksets.length)];

						const upgradeIndex = Math.floor(Math.random() * 6);
						switch (upgradeIndex) {
							case 0:
								tunes[x] = "000";
								break;
							case 1:
								tunes[x] = "333";
								break;
							case 2:
								tunes[x] = "666";
								break;
							case 3:
								tunes[x] = "996";
								break;
							case 4:
								tunes[x] = "969";
								break;
							case 5:
								tunes[x] = "699";
								break;
							default:
								break;
						}
					}
					roster[i] = {
						hand: hand,
						tunes: tunes,
						tracksets: tracks,
						requirements: [],
						rewards: {}
					}
				}

				challenge.roster = roster;
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully changed the amount of rounds of the ${challenge.name} to \`${challenge.roster.length}\`!`)
					.setTimestamp();
				break;
			case "setcar":
				if (!args[1] || !args[2] || !args[3]) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription("You are expected to provide the round number, the position in the deck and the name of the car you want to add after the criteria.")
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				else if (isNaN(args[1]) || isNaN(args[2])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number and/or deck position provided not a number.")
						.setDescription("These arguments are expected to be a number.")
						.setTimestamp();
					if (isNaN(args[1])) {
						errorScreen.addField("Round Number Received", `\`${args[1]}\` (not a number)`, true);
					}
					if (isNaN(args[2])) {
						errorScreen.addField("Deck Position Received", `\`${args[2]}\` (not a number)`, true);
					}
					return message.channel.send(errorScreen);
				}

				let rosterIndex = parseInt(args[1]), deckPos = parseInt(args[2]);
				if (rosterIndex < 1 || rosterIndex > challenge.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided is invalid.")
						.setDescription(`For the current challenge configuration, round numbers must be a number between 1 and ${challenge.roster.length}.`)
						.addField("Round Number Received", `\`${rosterIndex}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				if (deckPos < 1 || deckPos > 5) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, deck position index provided is invalid.")
						.setDescription("Deck position indexes must be a number between 1 to 5.")
						.addField("Deck Position Received", `\`${deckPos}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				let carName = args.slice(3, args.length).map(i => i.toLowerCase());
				let searchResults = new Set(carFiles);
				searchResults.forEach(function (car) {
					if (carName.every(part => car.includes(part)) === false) {
						searchResults.delete(car);
					}
				});

				if (searchResults.size > 1) {
					let carList = "";
					let redirect = [];
					let i = 1;
					searchResults.forEach(function (thing) {
						const car = require(`./cars/${thing}`);
						let make = car["make"];
						if (typeof make === "object") {
							make = car["make"][0];
						}
						carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
						redirect[i - 1] = thing;
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

					await message.channel.send(infoScreen).then(async currentMessage => {
						await message.channel.awaitMessages(filter, {
							max: 1,
							time: 60000,
							errors: ["time"]
						})
							.then(collected => {
								collected.first().delete();
								if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.size || parseInt(collected.first().content) < 1) {
									isError = true;
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									const errorMessage = new Discord.MessageEmbed()
										.setColor("#fc0303")
										.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
										.setTitle("Error, invalid integer provided.")
										.setDescription("It looks like your response was either not a number or not part of the selection.")
										.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.size})`)
										.setTimestamp();
									return currentMessage.edit(errorMessage);
								}
								else {
									challenge.roster[rosterIndex - 1].hand[deckPos - 1] = redirect[parseInt(collected.first().content) - 1];
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
				else if (searchResults.size > 0) {
					challenge.roster[rosterIndex - 1].hand[deckPos - 1] = Array.from(searchResults)[0];
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

				let cardThing = require(`./cars/${challenge.roster[rosterIndex - 1].hand[deckPos - 1]}`);
				let make = cardThing["make"];
				if (typeof make === "object") {
					make = cardThing["make"][0];
				}
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully set the car of deck position ${deckPos}, roster position ${rosterIndex} to ${make} ${cardThing["model"]} (${cardThing["modelYear"]})!`)
					.setImage(cardThing["card"])
					.setTimestamp();
				break;
			case "settune":
				if (!args[1] || !args[2] || !args[3]) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription("You are expected to provide the round number, the position in the deck and the tune of your choice after the criteria.")
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				else if (isNaN(args[1]) || isNaN(args[2])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number and/or deck position provided not a number.")
						.setDescription("These arguments are expected to be a number.")
						.setTimestamp();
					if (isNaN(args[1])) {
						errorScreen.addField("Round Number Received", `\`${args[1]}\` (not a number)`, true);
					}
					if (isNaN(args[2])) {
						errorScreen.addField("Deck Position Received", `\`${args[2]}\` (not a number)`, true);
					}
					return message.channel.send(errorScreen);
				}

				let rosterIndex1 = parseInt(args[1]), deckPos1 = parseInt(args[2]);
				if (rosterIndex1 < 1 || rosterIndex1 > challenge.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided is invalid.")
						.setDescription(`For the current challenge configuration, round numbers must be a number between 1 and ${challenge.roster.length}.`)
						.addField("Deck Position Received", `\`${rosterIndex1}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				if (deckPos1 < 1 || deckPos1 > 5) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, deck position index provided is invalid.")
						.setDescription("Deck position indexes must be a number between 1 to 5.")
						.addField("Deck Position Received", `\`${deckPos1}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				let upgrade = args[3];
				let currentCar = require(`./cars/${challenge.roster[rosterIndex1 - 1].hand[deckPos1 - 1]}`);
				if (!currentCar[`racehud${upgrade}`] || currentCar[`racehud${upgrade}`].length === 0) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setTitle("Error, the tuning stage you requested is unavailable.")
						.setDescription("In order to make the tuning system less complex, the tuning stages are limited to `333`, `666`, `996`, `969` and `699`.")
						.addField("Tune Received", `\`${upgrade}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				challenge.roster[rosterIndex1 - 1].tunes[deckPos1 - 1] = upgrade;
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully set the car tune of deck position ${deckPos1}, roster position ${rosterIndex1} to ${upgrade}!`)
					.setImage(currentCar[`racehud${upgrade}`])
					.setTimestamp();
				break;
			case "addreq":
				if (!args[1] || !args[2] || !args[3] || (args[2].toLowerCase() !== "rqlimit" && !args[4])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription(`You are expected to provide the round number, the requirement of your choice, the necessary arguments for said requirement and the amount of cars that is required to fit within the requirement after the criteria. Here is a list of requirement criterias.
						\`rq\` - Filter by RQ. Provide the start of the RQ range desired and the end after that.
						\`make\` - Filter by make/manufacturer. Provide a manufacturer name after that.
						\`modelyear\` - Filter by model year range. Provide the start of the model year range desired and the end after that.
						\`country\` - Filter by country origin. Provide a country code after that.
						\`drivetype\` - Filter by drive type. Provide a drive type (\`FWD\`, \`RWD\`, etc.) after that.
						\`tyretype\` - Filter by tyre type. Provide one kind of tyre (\`standard\`, \`performance\`, etc.) after that.
						\`gc\` - Filter by ground clearance. Provide a ground clearance (\`low\`, \`medium\` or \`high\`) after that.
						\`bodystyle\` - Filter by body type. Provide a drive type (\`sedan\`, \`coupe\`, etc.) after that.
						\`seatcount\` - Filter by seat count. Provide the start of the seat count range desired and the end after that.
						\`enginepos\` - Filter by engine position. Provide a engine position (\`front\`, \`middle\`, etc.) after that.
						\`fueltype\` - Filter by fuel type. Provide a fuel type (\`petrol\`, \`electric\`, etc.) after that.
						\`isprize\` - Filter prize cars.  Provide a boolean (\`true\` or \`false\`) after that.
						\`tag\` - Filter by tag. Provide a tag after that.
						\`car\` - Filter by exact car. Provide the name of a car after that.
						\`search\` - Filter by keyword in car name. Provide a keyword that is found in a in-game car's name after that.
						\`rqlimit\` - Edits the RQ limit of a round.`)
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				else if (isNaN(args[1]) || isNaN(args[args.length - 1])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number and/or requirement amount provided not a number.")
						.setDescription("These arguments are expected to be a number.")
						.setTimestamp();
					if (isNaN(args[1])) {
						errorScreen.addField("Round Number Received", `\`${args[1]}\` (not a number)`, true);
					}
					if (isNaN(args[2])) {
						errorScreen.addField("Deck Position Received", `\`${args[2]}\` (not a number)`, true);
					}
					return message.channel.send(errorScreen);
				}

				let rosterIndex2 = parseInt(args[1]);
				if (rosterIndex2 < 1 || rosterIndex2 > challenge.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided is invalid.")
						.setDescription(`For the current challenge configuration, round numbers must be a number between 1 and ${challenge.roster.length}.`)
						.addField("Round Number Received", `\`${rosterIndex2}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				let req = args[2].toLowerCase().replace("type", "Type").replace("style", "Style").replace("count", "Count").replace("year", "Year").replace("pos", "Pos").replace("prize", "Prize").replace("stock", "Stock").replace("upgrade", "Upgrade").replace("max", "Max");
				if (req !== "rqlimit") {
					let reqAmount = parseInt(args[args.length - 1]);
					if (reqAmount < 1 || reqAmount > 5) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, required amount provided is invalid.")
							.setDescription("This value should be a number between 1 and 5.")
							.addField("Amount Provided", `\`${reqAmount}\` (either not a number or not within the range of 1 ~ 5)`)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}
				}

				switch (req) {
					case "make":
					case "Country":
					case "tags":
					case "tyreType":
					case "search":
						let argument = args.slice(3, args.length - 1).join(" ").toLowerCase();
						let reqSearchResults = carFiles.filter(function (carFile) {
							let currentCar = require(`./cars/${carFile}`);
							if (Array.isArray(currentCar[req])) {
								return currentCar[req.replace("C", "c")].some(tag => tag.toLowerCase() === argument);
							}
							else {
								if (req === "search") {
									let make = currentCar["make"];
									if (typeof make === "object") {
										make = currentCar["make"][0];
									}
									let name = `${make} ${currentCar["model"]}`;
									return name.toLowerCase().includes(argument);
								}
								else {
									return currentCar[req.replace("C", "c")].toLowerCase() === argument;
								}
							}
						});

						if (reqSearchResults.length > 0) {
							let isDupe = false;
							for (let i = 0; i < challenge.roster[rosterIndex2 - 1].requirements.length; i++) {
								if (challenge.roster[rosterIndex2 - 1].requirements[i][req.replace("C", "c")] === argument) {
									isDupe = true;
									challenge.roster[rosterIndex2 - 1].requirements[i].amount = reqAmount;
								}
							}
							if (!isDupe) {
								let obj = new Object();
								obj[req.replace("C", "c")] = argument;
								obj.amount = reqAmount;
								challenge.roster[rosterIndex2 - 1].requirements.push(obj);
							}
						}
						else {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							let errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, argument provided does not exist in the game.")
								.setDescription("Make sure the argument you provided is as of in the game.")
								.addField("Argument Received", `\`${argument}\` (argument does not exist in-game)`)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}

						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully added/edited a \`${req.replace("C", "c")}\` criteria to roster position ${rosterIndex2}!`)
							.setDescription(`Value: \`${reqAmount}x ${argument}\``)
							.setTimestamp();
						break;
					case "modelYear":
					case "seatCount":
					case "rq":
						const start = parseInt(args[3]);
						let end = start;
						if (args[5] && !isNaN(args[5])) {
							end = parseInt(args[4]);
						}

						if (isNaN(start) || isNaN(end)) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							let errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, criteria provided is not a number.")
								.setDescription(`\`${req}\` criterias must be a number, i.e: \`1969\`, \`2001\`, etc.`)
								.addField("Argument Received", `\`${start}\` (not a number)`)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}
						else if (end < start) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							let errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, order is wrong.")
								.setDescription("Check if you got the order right: Smaller number first, bigger number later.")
								.addField("Argument Received", `\`${start} ~ ${end}\` (try flipping the order)`)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}

						let isDupe = false;
						for (let i = 0; i < challenge.roster[rosterIndex2 - 1].requirements.length; i++) {
							if (challenge.roster[rosterIndex2 - 1].requirements[i][req] === { start: start, end: end }) {
								isDupe = true;
								challenge.roster[rosterIndex2 - 1].requirements[i].amount = reqAmount;
							}
						}
						if (!isDupe) {
							let obj = new Object();
							obj[req] = { start: start, end: end };
							obj.amount = reqAmount;
							challenge.roster[rosterIndex2 - 1].requirements.push(obj);
						}

						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully added a \`${req}\` criteria to roster position ${rosterIndex2}!`)
							.addFields(
								{ name: "Start", value: start, inline: true },
								{ name: "End", value: end, inline: true },
								{ name: "Required Amount", value: `x${reqAmount}`, inline: true }
							)
							.setTimestamp();
						break;
					case "driveType":
					case "bodyStyle":
					case "enginePos":
					case "fuelType":
					case "gc":
						let argument2 = args.slice(3, args.length - 1).join(" ").toLowerCase();
						let reqSearchResults2 = carFiles.filter(function (carFile) {
							let currentCar = require(`./cars/${carFile}`);
							if (Array.isArray(currentCar[req])) {
								return currentCar[req.replace("C", "c")].some(tag => tag.toLowerCase() === argument2);
							}
							else {
								if (req === "search") {
									let make = currentCar["make"];
									if (typeof make === "object") {
										make = currentCar["make"][0];
									}
									let name = `${make} ${currentCar["model"]}`;
									return name.toLowerCase().includes(argument2);
								}
								else {
									return currentCar[req.replace("C", "c")].toLowerCase() === argument2;
								}
							}
						});

						if (reqSearchResults2.length > 0) {
							let isDupe = false;
							for (let i = 0; i < challenge.roster[rosterIndex2 - 1].requirements.length; i++) {
								if (challenge.roster[rosterIndex2 - 1].requirements[i][req] === argument2) {
									isDupe = true;
									challenge.roster[rosterIndex2 - 1].requirements[i].amount = reqAmount;
								}
							}
							if (!isDupe) {
								let obj = new Object();
								obj[req] = argument2;
								obj.amount = reqAmount;
								challenge.roster[rosterIndex2 - 1].requirements.push(obj);
							}
						}
						else {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							let errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, argument provided does not exist in the game.")
								.setDescription("Make sure the argument you provided is as of in the game.")
								.addField("Argument Received", `\`${arg}\` (argument does not exist in-game)`)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}

						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully added/edited a \`${req}\` criteria to roster position ${rosterIndex2}!`)
							.setDescription(`Value: \`${reqAmount}x ${argument2}\``)
							.setTimestamp();
						break;
					case "isPrize":
						if (args[3].toLowerCase() === "true" || args[3].toLowerCase() === "false") {
							let arg = JSON.parse(args[3].toLowerCase());
							let isDupe = false;
							for (let i = 0; i < challenge.roster[rosterIndex2 - 1].requirements.length; i++) {
								if (challenge.roster[rosterIndex2 - 1].requirements[i].isPrize === arg) {
									isDupe = true;
									challenge.roster[rosterIndex2 - 1].requirements[i].amount = reqAmount;
								}
							}
							if (!isDupe) {
								challenge.roster[rosterIndex2 - 1].requirements.push({
									isPrize: arg,
									amount: reqAmount
								});
							}
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully added a \`${req}\` criteria to roster position ${rosterIndex2}!`)
								.setDescription(`Value: \`${reqAmount}x ${arg}\``)
								.setTimestamp();
						}
						else {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							let errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, argument provided is not a boolean.")
								.setDescription("Booleans only have 2 states, true or false.")
								.addField("Argument Received", `\`${argument}\` (not a boolean)`)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}
						break;
					case "car":
						let car;
						let carName = args.slice(3, args.length).map(i => i.toLowerCase());
						let searchResults = new Set(carFiles);
						searchResults.forEach(function (car) {
							if (carName.every(part => car.includes(part)) === false) {
								searchResults.delete(car);
							}
						});

						if (searchResults.size > 1) {
							let carList = "";
							let redirect = [];
							let i = 1;
							searchResults.forEach(function (thing) {
								const car = require(`./cars/${thing}`);
								let make = car["make"];
								if (typeof make === "object") {
									make = car["make"][0];
								}
								carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
								redirect[i - 1] = thing;
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

							await message.channel.send(infoScreen).then(async currentMessage => {
								await message.channel.awaitMessages(filter, {
									max: 1,
									time: 60000,
									errors: ["time"]
								})
									.then(collected => {
										collected.first().delete();
										if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.size || parseInt(collected.first().content) < 1) {
											isError = true;
											message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
											const errorMessage = new Discord.MessageEmbed()
												.setColor("#fc0303")
												.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
												.setTitle("Error, invalid integer provided.")
												.setDescription("It looks like your response was either not a number or not part of the selection.")
												.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.size})`)
												.setTimestamp();
											return currentMessage.edit(errorMessage);
										}
										else {
											let isDupe = false;
											car = redirect[parseInt(collected.first().content) - 1];
											for (let i = 0; i < challenge.roster[rosterIndex2 - 1].requirements.length; i++) {
												if (challenge.roster[rosterIndex2 - 1].requirements[i].car === car) {
													isDupe = true;
													challenge.roster[rosterIndex2 - 1].requirements[i].amount = reqAmount;
												}
											}
											if (!isDupe) {
												challenge.roster[rosterIndex2 - 1].requirements.push({
													car: car,
													amount: reqAmount
												});
											}
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
						else if (searchResults.size > 0) {
							let isDupe = false;
							car = Array.from(searchResults)[0];
							for (let i = 0; i < challenge.roster[rosterIndex2 - 1].requirements.length; i++) {
								if (challenge.roster[rosterIndex2 - 1].requirements[i].car === car) {
									isDupe = true;
									challenge.roster[rosterIndex2 - 1].requirements[i].amount = reqAmount;
								}
							}
							if (!isDupe) {
								challenge.roster[rosterIndex2 - 1].requirements.push({
									car: car,
									amount: reqAmount
								});
							}
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

						let cardThing = require(`./cars/${car}`);
						let make = cardThing["make"];
						if (typeof make === "object") {
							make = cardThing["make"][0];
						}
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully added a \`${req}\` criteria to roster position ${rosterIndex2}!`)
							.setDescription(`${make} ${cardThing["model"]} (${cardThing["modelYear"]})`)
							.setImage(cardThing["card"])
							.setTimestamp();
						break;
					case "rqlimit":
						if (isNaN(args[3])) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							let errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, RQ provided is not a number.")
								.setDescription("RQ limits should be a number.")
								.addField("Argument Received", `\`${args[3]}\``)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}

						challenge.roster[rosterIndex2 - 1].rqLimit = parseInt(args[3]);
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully set the RQ limit of round ${rosterIndex2} to ${args[3]}!`)
							.setTimestamp();
						break;
					default:
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, requirement criteria not found.")
							.setDescription(`Here is a list of requirement criterias.
							\`rq\` - Filter by RQ. Provide the start of the RQ range desired and the end after that.
							\`make\` - Filter by make/manufacturer. Provide a manufacturer name after that.
							\`modelyear\` - Filter by model year range. Provide the start of the model year range desired and the end after that.
							\`country\` - Filter by country origin. Provide a country code after that.
							\`drivetype\` - Filter by drive type. Provide a drive type (\`FWD\`, \`RWD\`, etc.) after that.
							\`tyretype\` - Filter by tyre type. Provide one kind of tyre (\`standard\`, \`performance\`, etc.) after that.
							\`gc\` - Filter by ground clearance. Provide a ground clearance (\`low\`, \`medium\` or \`high\`) after that.
							\`bodystyle\` - Filter by body type. Provide a drive type (\`sedan\`, \`coupe\`, etc.) after that.
							\`seatcount\` - Filter by seat count. Provide the start of the seat count range desired and the end after that.
							\`enginepos\` - Filter by engine position. Provide a engine position (\`front\`, \`middle\`, etc.) after that.
							\`fueltype\` - Filter by fuel type. Provide a fuel type (\`petrol\`, \`electric\`, etc.) after that.
							\`isprize\` - Filter prize cars.  Provide a boolean (\`true\` or \`false\`) after that.
							\`tag\` - Filter by tag. Provide a tag after that.
							\`car\` - Filter by exact car. Provide the name of a car after that.
							\`search\` - Filter by keyword in car name. Provide a keyword that is found in a in-game car's name after that.
							\`rqlimit\` - Edits the RQ limit of a round.`)
							.setTimestamp();
						return message.channel.send(errorScreen);
				}
				break;
			case "removereq":
				if (!args[1] || !args[2] || ((args[2].toLowerCase() !== "all" && args[2].toLowerCase() !== "rqlimit") && !args[3])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription("You are expected to specify what requirement that needs to be removed. If you want to remove all criterias, type `all`.")
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				else if (isNaN(args[1])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided not a number.")
						.setDescription("Round numbers are expected to be a number.")
						.addField("Round Number Received", `\`${args[1]}\` (not a number)`, true)
						.setTimestamp();
					return message.channel.send(errorScreen);
				}

				let rosterIndex3 = parseInt(args[1]);
				if (rosterIndex3 < 1 || rosterIndex3 > challenge.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided is invalid.")
						.setDescription(`For the current challenge configuration, round numbers must be a number between 1 and ${challenge.roster.length}.`)
						.addField("Round Number Received", `\`${rosterIndex3}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				let rReq = args[2].toLowerCase();
				let rValue = args.slice(3, args.length).join(" ").toLowerCase();
				let hasReq = false;
				if (rReq === "rqlimit") {
					hasReq = true;
					challenge.roster[rosterIndex3 - 1].rqLimit = "None";
				}
				else if (rReq !== "all") {
					for (let i = 0; i < challenge.roster[rosterIndex3 - 1].requirements.length; i++) {
						let anObj = Object.keys(challenge.roster[rosterIndex3 - 1].requirements[i])[0];
						if ((anObj.toLowerCase().includes(rReq) && rValue === challenge.roster[rosterIndex3 - 1].requirements[i][anObj]) || rReq === "all") {
							hasReq = true;
							challenge.roster[rosterIndex3 - 1].requirements.splice(i, 1);
							break;
						}
					}
				}
				else {
					hasReq = true;
					challenge.roster[rosterIndex3 - 1].requirements = [];
				}

				if (!hasReq) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, requirement criteria not found.")
						.setDescription(`Here is a list of requirement criterias.
											\`rq\` - Filter by RQ.
											\`make\` - Filter by make/manufacturer.
											\`modelyear\` - Filter by model year range.
											\`country\` - Filter by country origin.
											\`drivetype\` - Filter by drive type. 
											\`tyretype\` - Filter by tyre type.
											\`gc\` - Filter by ground clearance.
											\`bodystyle\` - Filter by body type.  
											\`seatcount\` - Filter by seat count.
											\`enginepos\` - Filter by engine position.
											\`fueltype\` - Filter by fuel type.
											\`isprize\` - Filter prize cars.
											\`tag\` - Filter by tag.
											\`car\` - Filter by exact car.  
											\`all\` - Removes all requirements.
											\`search\` - Filter by keyword in car name.
											\`rqlimit\` - The RQ limit of a round.
											Do specify the value of the criterias alongside, unless you're removing all requirements.`)
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				else {
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully removed the \`${rReq}: ${rValue}\` criteria from roster position ${rosterIndex3}!`)
						.setTimestamp();
					if (rReq === "all") {
						infoScreen.setTitle(`Successfully removed all criterias from roster position ${rosterIndex3}!`)
					}
					else if (rReq === "rqlimit") {
						infoScreen.setTitle(`Successfully removed the RQ limit from roster position ${rosterIndex3}!`)
					}
				}
				break;
			case "settrack":
				if (!args[1] || !args[2] || !args[3]) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided incomplete.")
						.setDescription("You are expected to provide the round number and the name of the track after the criteria.")
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				else if (isNaN(args[1]) || isNaN(args[2])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number and/or deck position provided not a number.")
						.setDescription("These arguments are expected to be a number.")
						.setTimestamp();
					if (isNaN(args[1])) {
						errorScreen.addField("Round Number Received", `\`${args[1]}\` (not a number)`, true);
					}
					if (isNaN(args[2])) {
						errorScreen.addField("Deck Position Received", `\`${args[2]}\` (not a number)`, true);
					}
					return message.channel.send(errorScreen);
				}

				let rosterIndex4 = parseInt(args[1]), deckPos2 = parseInt(args[2]);
				if (rosterIndex4 < 1 || rosterIndex4 > challenge.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided is invalid.")
						.setDescription(`For the current challenge configuration, round numbers must be a number between 1 and ${challenge.roster.length}.`)
						.addField("Deck Position Received", `\`${rosterIndex4}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				if (deckPos2 < 1 || deckPos2 > 5) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, deck position index provided is invalid.")
						.setDescription("Deck position indexes must be a number between 1 to 5.")
						.addField("Deck Position Received", `\`${deckPos2}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				let trackName = args.slice(3, args.length).map(i => i.toLowerCase());
				let tSearchResults = new Set(tracksets);
				tSearchResults.forEach(function (track) {
					if (trackName.every(part => track.includes(part)) === false) {
						tSearchResults.delete(track);
					}
				});

				if (tSearchResults.size > 1) {
					let trackList = "";
					let redirect = [];
					let i = 1;
					tSearchResults.forEach(function (thing) {
						const track = require(`./tracksets/${thing}`);
						trackList += `${i} - ${track["trackName"]}\n`;
						redirect[i - 1] = thing;
						i++;
					});

					if (trackList.length > 2048) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, too many search results.")
							.setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
							.addField("Total Characters in List", `\`${trackList.length}\` > \`2048\``)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					const infoScreen = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Multiple tracks found, please type one of the following.")
						.setDescription(trackList);

					await message.channel.send(infoScreen).then(async currentMessage => {
						await message.channel.awaitMessages(filter, {
							max: 1,
							time: 60000,
							errors: ["time"]
						})
							.then(collected => {
								collected.first().delete();
								if (isNaN(collected.first().content) || parseInt(collected.first().content) > tSearchResults.size || parseInt(collected.first().content) < 1) {
									isError = true;
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									const errorMessage = new Discord.MessageEmbed()
										.setColor("#fc0303")
										.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
										.setTitle("Error, invalid integer provided.")
										.setDescription("It looks like your response was either not a number or not part of the selection.")
										.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${tSearchResults.size})`)
										.setTimestamp();
									return currentMessage.edit(errorMessage);
								}
								else {
									challenge.roster[rosterIndex4 - 1].tracksets[deckPos2 - 1] = redirect[parseInt(collected.first().content) - 1];
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
				else if (tSearchResults.size > 0) {
					challenge.roster[rosterIndex4 - 1].tracksets[deckPos2 - 1] = Array.from(tSearchResults)[0];
				}
				else {
					let matches = stringSimilarity.findBestMatch(trackName.join(" "), tracksets.map(i => i.slice(0, -5)));
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, track requested not found.")
						.setDescription("Well that sucks.")
						.addField("Keywords Received", `\`${trackName.join(" ")}\``, true)
						.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				let trackThing = require(`./tracksets/${challenge.roster[rosterIndex4 - 1].tracksets[deckPos2 - 1]}`);
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully set the trackset of deck position ${deckPos2}, roster position ${rosterIndex4} to ${trackThing["trackName"]})!`)
					.setImage(trackThing["map"])
					.setTimestamp();
				break;
			case "setreward":
				if (!args[1] || !args[2]) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, requirements provided incomplete.")
						.setDescription(`You are expected to provide the round number, the requirement of your choice and the necessary arguments for said requirement after the criteria. Here is a list of reward criterias. 
						\`money\` - Awards the player money. Provide the amount of money after that.
						\`fusetokens\` - Awards the player fuse tokens. Provide the amount of fuse tokens after that.
						\`trophies\` - Awards the player trophies. Provide the amount of trophies after that.
						\`car\` - Awards the player a car. Provide the name of a car after that.
						\`pack\` - Awards the player a pack. Provide the name of a pack after that.`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				else if (isNaN(args[1])) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided not a number.")
						.setDescription("Round numbers are expected to be a number.")
						.addField("Round Number Received", `\`${args[1]}\` (not a number)`, true)
						.setTimestamp();
					return message.channel.send(errorScreen);
				}

				let index = args[1], rewardType = args[2].toLowerCase();
				if (index < 1 || index > challenge.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, round number provided is invalid.")
						.setDescription(`For the current challenge configuration, round numbers must be a number between 1 and ${challenge.roster.length}.`)
						.addField("Round Number Received", `\`${index}\``)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				switch (rewardType) {
					case "money":
					case "fusetokens":
					case "trophies":
						let amount = args[3];
						if (isNaN(amount) || parseInt(amount) < 0 || (parseInt(amount) === 0 && rewardType !== "trophies")) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, amount provided is either not a number or less than 1.")
								.setDescription("This amount should always be a positive number, i.e: `4`, `20`, etc. 0 is only for deleting the reward for trophies.")
								.addField("Number Received", `\`${amount}\``)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}

						let emoji;
						if (rewardType === "money") {
							emoji = message.client.emojis.cache.get("726017235826770021");
							if (challenge.roster[index - 1].rewards.trophies) {
								challenge.roster[index - 1].rewards = { money: parseInt(amount), trophies: challenge.roster[index - 1].rewards.trophies };
							}
							else {
								challenge.roster[index - 1].rewards = { money: parseInt(amount) };
							}
						}
						else if (rewardType === "fusetokens") {
							emoji = message.client.emojis.cache.get("726018658635218955");
							if (challenge.roster[index - 1].rewards.trophies) {
								challenge.roster[index - 1].rewards = { fuseTokens: parseInt(amount), trophies: challenge.roster[index - 1].rewards.trophies };
							}
							else {
								challenge.roster[index - 1].rewards = { fuseTokens: parseInt(amount) };
							};
						}
						else {
							emoji = message.client.emojis.cache.get("775636479145148418");
							if (parseInt(amount) === 0) {
								delete challenge.roster[index - 1].rewards.trophies;
							}
							else {
								challenge.roster[index - 1].rewards.trophies = parseInt(amount);
							}
						}

						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully set round ${index}'s reward to ${emoji}${amount}!`)
							.setTimestamp();
						break;
					case "car":
						let carFile;
						let carName = args.slice(3, args.length).map(i => i.toLowerCase());
						let searchResults1 = new Set(carFiles);
						searchResults1.forEach(function (car) {
							if (carName.every(part => car.includes(part)) === false) {
								searchResults1.delete(car);
							}
						});

						if (searchResults1.size > 1) {
							let carList = "";
							let redirect = [];
							let i = 1;
							searchResults1.forEach(function (thing) {
								const car = require(`./cars/${thing}`);
								let make = car["make"];
								if (typeof make === "object") {
									make = car["make"][0];
								}
								carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
								redirect[i - 1] = thing;
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

							if (currentMessage) {
								await currentMessage.edit(infoScreen);
							}
							else {
								await message.channel.send(infoScreen);
							}
							await message.channel.awaitMessages(filter, {
								max: 1,
								time: 60000,
								errors: ["time"]
							})
								.then(collected => {
									collected.first().delete();
									if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults1.size || parseInt(collected.first().content) < 1) {
										isError = true;
										message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
										const errorMessage = new Discord.MessageEmbed()
											.setColor("#fc0303")
											.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
											.setTitle("Error, invalid integer provided.")
											.setDescription("It looks like your response was either not a number or not part of the selection.")
											.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults1.size})`)
											.setTimestamp();
										return currentMessage.edit(errorMessage);
									}
									else {
										carFile = redirect[parseInt(collected.first()) - 1];
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
						}
						else if (searchResults1.size > 0) {
							carFile = Array.from(searchResults1)[0];
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

						if (challenge.roster[index - 1].rewards.trophies) {
							challenge.roster[index - 1].rewards = { car: carFile, trophies: challenge.roster[index - 1].rewards.trophies };
						}
						else {
							challenge.roster[index - 1].rewards = { car: carFile };
						}

						let cardThing = require(`./cars/${carFile}`);
						let make = cardThing["make"];
						if (typeof make === "object") {
							make = cardThing["make"][0];
						}
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully set round ${index}'s reward to ${make} ${cardThing["model"]} (${cardThing["modelYear"]})!`)
							.setImage(cardThing["card"])
							.setTimestamp();
						break;
					case "pack":
						let packName = args.slice(3, args.length).map(i => i.toLowerCase());
						let packFile;
						let searchResults = packFiles.filter(function (pack) {
							return packName.every(part => pack.includes(part));
						});

						if (searchResults.length > 1) {
							let packList = "";
							for (i = 1; i <= searchResults.length; i++) {
								let currentPack = require(`./packs/${searchResults[i - 1]}`);
								packList += `${i} - ` + currentPack["packName"] + "\n";
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
											isError = true;
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
							let matches = stringSimilarity.findBestMatch(packName.join(" "), packFiles.map(i => i.slice(0, -5)));
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, pack requested not found.")
								.setDescription("Well that sucks.")
								.addField("Keywords Received", `\`${packName.join(" ")}\``, true)
								.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
								.setTimestamp();
							return message.channel.send(errorMessage);
						}

						if (challenge.roster[index - 1].rewards.trophies) {
							challenge.roster[index - 1].rewards = { pack: packFile, trophies: challenge.roster[index - 1].rewards.trophies };
						}
						else {
							challenge.roster[index - 1].rewards = { pack: packFile };
						}

						let currentPack = require(`./packs/${packFile}`);
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully set round ${index}'s reward to ${currentPack["packName"]}!`)
							.setImage(currentPack["pack"])
							.setTimestamp();
						break;
					default:
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, reward criteria not found.")
							.setDescription(`Here is a list of reward criterias. 
							\`money\` - Awards the player money. Provide the amount of money after that.
							\`fusetokens\` - Awards the player fuse tokens. Provide the amount of fuse tokens after that.
							\`trophies\` - Awards the player trophies. Provide the amount of trophies after that.
							\`car\` - Awards the player a car. Provide the name of a car after that.
							\`pack\` - Awards the player a pack. Provide the name of a pack after that.`)
							.setTimestamp();
						return message.channel.send(errorScreen);
				}
				break;
			default:
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, offer editing criteria not found.")
					.setDescription(`Here is a list of challenge editing criterias. 
					\`name\` - The name of the challenge. 
					\`duration\` - How long a challenge is going to last for (in days).
					\`extend\` - How long a challenge is going to be extended by (in hours). 
					\`setcar\` - Sets one car of the opponent's deck.
					\`setreward\` - Sets the reward of a round.
					\`settune\` - Sets the tune for one car of the opponent's deck.
					\`addreq\` - Adds a requirement to a round.
					\`removereq\` - Removes a requirement from a round.`)
					.setTimestamp();
				return message.channel.send(errorScreen);
		}

		if (!isError) {
			await db.set("challenge", challenge);
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			return message.channel.send(infoScreen);
		}
	}
}