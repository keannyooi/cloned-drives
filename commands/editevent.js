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

module.exports = {
	name: "editevent",
	usage: "<event name> | <criteria> | (situationally optional) <value>",
	args: 2,
	isExternal: false,
	adminOnly: false,
	description: "Edits an event.",
	async execute(message, args) {
		const db = message.client.db;
		const events = await db.get("events");
		let infoScreen;
		let keyword = args[0].toLowerCase();
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

		const searchResults = Object.values(events).filter(event => {
			if (typeof event === "object") {
				return event.name.toLowerCase().includes(keyword);
			}
			else {
				return false;
			}
		});

		if (searchResults.length > 1) {
			let eventList = "";
			for (i = 1; i <= searchResults.length; i++) {
				eventList += `${i} - ${searchResults[i - 1].name} \n`;
			}

			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Multiple events found, please type one of the following.")
				.setDescription(eventList)
				.setTimestamp();

			message.channel.send(infoScreen).then(currentMessage => {
				message.channel.awaitMessages(filter, {
					max: 1,
					time: 30000,
					errors: ["time"]
				})
					.then(collected => {
						collected.first().delete();
						if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length || parseInt(collected.first().content) < 1) {
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
							editEvent(searchResults[parseInt(collected.first()) - 1], currentMessage);
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
			editEvent(searchResults[0]);
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, 404 event not found.")
				.setDescription("Try checking again using `cd-events`.")
				.addField("Keywords Received", `\`${keyword}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		async function editEvent(currentEvent, currentMessage) {
			let isError = false;
			let index, criteria = args[1].toLowerCase();
			if (criteria.startsWith("add") || criteria.startsWith("remove") || criteria.startsWith("set")) {
				if (isNaN(args[2]) || args[2] < 1 || args[2] > currentEvent.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, roster index provided is either not a number or inapplicable.")
						.setDescription(`For this event, roster indexes must be a number between 1 and ${currentEvent.roster.length}.`)
						.setTimestamp();
					if (currentMessage) {
						return currentMessage.edit(errorScreen);
					}
					else {
						return message.channel.send(errorScreen);
					}
				}
				else {
					index = parseInt(args[2]);
				}
			}

			switch (criteria) {
				case "name":
					if (!args[2]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, arguments provided incomplete.")
							.setDescription("What are you trying to name the event as?")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					let oldName = currentEvent.name;
					let eventName = args.slice(2, args.length).join(" ");
					currentEvent.name = eventName;

					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully changed the event name from ${oldName} to ${eventName}!`)
						.setTimestamp();
					break;
				case "duration":
					if (currentEvent.isActive) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, this attribute cannot be edited while the event is live.")
							.setDescription("If you edit this value while an event is live, it would break the bot. So don't.")
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
							.setDescription("How long, in days, are you trying to make the event last?")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					let duration = args[2];
					if ((duration !== "unlimited" && isNaN(duration)) || parseInt(duration) < 1) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, duration provided is invalid.")
							.setDescription("The duration in days must be a positive number. If you want an event to last forever, just type `unlimited`.")
							.addField("Duration Value Received", `\`${duration}\` (either not a number or not a positive integer)`)
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					currentEvent.timeLeft = parseInt(duration);
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully changed the duration of the ${currentEvent.name} to \`${duration} day(s)\`!`)
						.setTimestamp();
					break;
				case "background": {
					if (!args[2]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, arguments provided incomplete.")
							.setDescription("Where is your image link?")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					let imageLink = args[2];
					if (imageLink.search(/\b(https:|http:)/) < 0 || imageLink.search(/(.jpeg|.jpg|.png|.gif)\b/) < 0) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, link provided is not an image.")
							.setDescription("This function supports `.jpeg`, `.jpg`, `.png` and `.gif` links only.")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					currentEvent.background = imageLink;
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully set the ${currentEvent.name} event's background image!`)
						.setImage(imageLink)
						.setTimestamp();
					break;
				}
				case "setcar":
					if (!args[2] || !args[3]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, arguments provided incomplete.")
							.setDescription("Which car are you trying to find and where should it go?")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					let carName = args.slice(3, args.length).map(i => i.toLowerCase());
					let searchResults = new Set(carFiles);
					searchResults.forEach(function(car) {
						if (carName.every(part => car.includes(part)) === false) {
							searchResults.delete(car);
						}
					});

					if (searchResults.size > 1) {
						let carList = "";
						let redirect = [];
						let i = 1;
						searchResults.forEach(function(thing) {
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

						let currentMessage1;
						if (currentMessage) {
							currentMessage1 = await currentMessage.edit(infoScreen);
						}
						else {
							currentMessage1 = await message.channel.send(infoScreen);
						}
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
									return currentMessage1.edit(errorMessage);
								}
								else {
									currentEvent.roster[index - 1].car = redirect[parseInt(collected.first().content) - 1];
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
								return currentMessage1.edit(cancelMessage);
							});
					}
					else if (searchResults.size > 0) {
						currentEvent.roster[index - 1].car = Array.from(searchResults)[0];
					}
					else {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, car requested not found.")
							.setDescription("Well that sucks.")
							.addField("Keywords Received", `\`${carName.join(" ")}\``)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					let cardThing = require(`./cars/${currentEvent.roster[index - 1].car}`);
					let make = cardThing["make"];
					if (typeof make === "object") {
						make = cardThing["make"][0];
					}
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully set the car of roster position ${index} to ${make} ${cardThing["model"]} (${cardThing["modelYear"]})!`)
						.setImage(cardThing["card"])
						.setTimestamp();
					break;
				case "settune":
					if (!args[2] || !args[3]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, arguments provided incomplete.")
							.setDescription("Which car are you tuning and what tune?")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					let upgrade = args[3];
					let currentCar = require(`./cars/${currentEvent.roster[index - 1].car}`);
					if (!currentCar[`racehud${upgrade}`] || currentCar[`racehud${upgrade}`].length === 0) {
						const maxedTunes = [996, 969, 699].filter(function (tune) {
							return currentCar[`${tune}TopSpeed`];
						});

						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setTitle("Error, the tuning stage you requested is unavailable.")
							.setDescription("In order to make the tuning system less complex, the tuning stages are limited to `333`, `666`, `996`, `969` and `699`.")
							.addField("Your car's available maxed tunes", maxedTunes.join(", "))
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					currentEvent.roster[index - 1].gearingUpgrade = parseInt(upgrade[0]);
					currentEvent.roster[index - 1].engineUpgrade = parseInt(upgrade[1]);
					currentEvent.roster[index - 1].chassisUpgrade = parseInt(upgrade[2]);
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully set the car tune of roster position ${index} to ${upgrade}!`)
						.setImage(currentCar[`racehud${upgrade}`])
						.setTimestamp();
					break;
				case "addreq":
					if (!args[2] || !args[3]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, arguments provided incomplete.")
							.setDescription("Which round and what requirement?")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					let req = args[3].toLowerCase().replace("type", "Type").replace("style", "Style").replace("count", "Count").replace("year", "Year").replace("pos", "Pos").replace("prize", "Prize").replace("stock", "Stock").replace("upgrade", "Upgrade").replace("max", "Max");
					switch (req) {
						case "make":
						case "Country":
						case "tags":
						case "tyreType":
						case "search":
							let argument = args.slice(4, args.length).join(" ").toLowerCase();
							let reqSearchResults = carFiles.filter(function(carFile) {
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
								if (currentEvent.roster[index - 1].requirements[req.replace("C", "c")] === undefined) {
									currentEvent.roster[index - 1].requirements[req.replace("C", "c")] = [argument];
								}
								else if (currentEvent.roster[index - 1].requirements[req.replace("C", "c")].some(r => r === argument) === false) {
									currentEvent.roster[index - 1].requirements[req.replace("C", "c")].push(argument);
								}
								else {
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									let errorMessage = new Discord.MessageEmbed()
										.setColor("#fc0303")
										.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
										.setTitle("Error, argument provided is already part of the filter criteria.")
										.setDescription("Check the filter criteria in said round again.")
										.setTimestamp();
									return message.channel.send(errorMessage);
								}
							}
							else {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								let errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, argument provided does not exist in the game.")
									.setDescription("Make sure the argument you provided is as of in the game.")
									.setTimestamp();
								return message.channel.send(errorMessage);
							}

							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully added a \`${req.replace("C", "c")}\` criteria to roster position ${index}!`)
								.setDescription(`Value: \`${currentEvent.roster[index - 1].requirements[req.replace("C", "c")].join(", ")}\``)
								.setTimestamp();
							break;
						case "modelYear":
						case "seatCount":
						case "rq":
							const start = parseInt(args[4]);
							let end = start;
							if (args[5] && !isNaN(args[5])) {
								end = parseInt(args[5]);
							}

							if (isNaN(start)) {
								let errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, criteria provided is not a number.")
									.setDescription(`\`${req}\` criterias must be a number, i.e: \`1969\`, \`2001\`, etc.`)
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
									.setTimestamp();
								return message.channel.send(errorMessage);
							}
							currentEvent.roster[index - 1].requirements[req] = { start: start, end: end };

							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully added a \`${req}\` criteria to roster position ${index}!`)
								.addFields(
									{ name: "Start", value: start, inline: true },
									{ name: "End", value: end, inline: true }
								)
								.setTimestamp();
							break;
						case "driveType":
						case "bodyStyle":
						case "enginePos":
						case "fuelType":
						case "gc":
							let arg = args[4].toLowerCase();
							let reqSearchResults2 = carFiles.filter(function(carFile) {
								let currentCar = require(`./cars/${carFile}`);
								if (Array.isArray(currentCar[req])) {
									return currentCar[req].some(tag => tag.toLowerCase() === arg);
								}
								else {
									return currentCar[req].toLowerCase() === arg;
								}
							});
							if (reqSearchResults2.length > 0) {
								if (currentEvent.roster[index - 1].requirements[req] === undefined) {
									currentEvent.roster[index - 1].requirements[req] = [arg];
								}
								else if (currentEvent.roster[index - 1].requirements[req].some(r => r === arg) === false) {
									currentEvent.roster[index - 1].requirements[req].push(arg);
								}
								else {
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									let errorMessage = new Discord.MessageEmbed()
										.setColor("#fc0303")
										.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
										.setTitle("Error, argument provided is already part of the filter criteria.")
										.setDescription("Check the filter criteria in said round again.")
										.setTimestamp();
									return message.channel.send(errorMessage);
								}
							}
							else {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								let errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, argument provided does not exist in the game.")
									.setDescription("Make sure the argument you provided is as of in the game.")
									.setTimestamp();
								return message.channel.send(errorMessage);
							}

							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully added a \`${req}\` criteria to roster position ${index}!`)
								.setDescription(`Value: \`${currentEvent.roster[index - 1].requirements[req].join(", ")}\``)
								.setTimestamp();
							break;
						case "isPrize":
							if (args[4].toLowerCase() === "true" || args[4].toLowerCase() === "false") {
								currentEvent.roster[index - 1].requirements[req] = JSON.parse(args[4].toLowerCase());
								infoScreen = new Discord.MessageEmbed()
									.setColor("#03fc24")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle(`Successfully added a \`${req}\` criteria to roster position ${index}!`)
									.setDescription(`Value: \`${args[4].toLowerCase()}\``)
									.setTimestamp();
							}
							else {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								let errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, argument provided is not a boolean.")
									.setDescription("Booleans only have 2 states, true or false.")
									.setTimestamp();
								return message.channel.send(errorMessage);
							}
							break;
						case "car":
							let carName = args.slice(4, args.length).map(i => i.toLowerCase());
							let searchResults = new Set(carFiles);
							searchResults.forEach(function(car) {
								if (carName.every(part => car.includes(part)) === false) {
									searchResults.delete(car);
								}
							});

							if (searchResults.size > 1) {
								let carList = "";
								let redirect = [];
								let i = 1;
								searchResults.forEach(function(thing) {
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
										if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.size || parseInt(collected.first().content) < 1) {
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
											currentEvent.roster[index - 1].requirements[req] = redirect[parseInt(collected.first().content) - 1];
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
							else if (searchResults.size > 0) {
								currentEvent.roster[index - 1].requirements[req] = Array.from(searchResults)[0];
							}
							else {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								const errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, car requested not found.")
									.setDescription("Well that sucks.")
									.addField("Keywords Received", `\`${carName.join(" ")}\``)
									.setTimestamp();
								return message.channel.send(errorMessage);
							}
							
							let cardThing = require(`./cars/${currentEvent.roster[index - 1].requirements[req]}`);
							let make = cardThing["make"];
							if (typeof make === "object") {
								make = cardThing["make"][0];
							}
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully added a \`${req}\` criteria to roster position ${index}!`)
								.setDescription(`${make} ${cardThing["model"]} (${cardThing["modelYear"]})`)
								.setImage(cardThing["card"])
								.setTimestamp();
							break;
						default:
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorScreen = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, requirement criteria not found.")
								.setDescription(`Here is a list of requirement criterias. 
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
											\`search\` - Filter by keyword in car name.`)
								.setTimestamp();
							return message.channel.send(errorScreen);
					}
					break;
				case "removereq":
					if (!args[3]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						let errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, requirement criteria not provided.")
							.setDescription("Provide one, please.")
							.setTimestamp();
						return message.channel.send(errorMessage);
					}
					let rReq = args[3].toLowerCase();
					let hasReq = false;
					for (let [key, value] of Object.entries(currentEvent.roster[index - 1].requirements)) {
						if (key.toLowerCase().includes(rReq) || rReq === "all") {
							hasReq = true;
							delete currentEvent.roster[index - 1].requirements[key];
							if (rReq !== "all") {
								break;
							}
						}
					}

					if (!hasReq) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, requirement criteria not found.")
							.setDescription(`Here is a list of requirement criterias. 
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
											\`search\` - Filter by keyword in car name.  
											\`all\` - Removes all filters.`)
							.setTimestamp();
						return message.channel.send(errorScreen);
					}
					else {
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully removed the \`${rReq}\` criteria from roster position ${index}!`)
							.setTimestamp();
						if (rReq === "all") {
							infoScreen.setTitle(`Successfully removed all criterias from roster position ${index}!`)
						}
					}
					break;
				case "settrack":
					if (!args[2] || !args[3]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, arguments provided incomplete.")
							.setDescription("Which track are you trying to find and where should it go?")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					let trackName = args.slice(3, args.length).map(i => i.toLowerCase());
					const tSearchResults = tracksets.filter(function (trackset) {
						return trackName.every(part => trackset.includes(part));
					});

					if (tSearchResults.length > 1) {
						let trackList = "";
						for (x = 1; x <= tSearchResults.length; x++) {
							const track = require(`./tracksets/${tSearchResults[x - 1]}`);
							trackList += `${x} - ${track["trackName"]}\n`;
						}

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
							.setDescription(trackList)
							.setTimestamp();

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
								if (isNaN(collected.first().content) || parseInt(collected.first().content) > tSearchResults.length || parseInt(collected.first().content) < 1) {
									isError = true;
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									const errorMessage = new Discord.MessageEmbed()
										.setColor("#fc0303")
										.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
										.setTitle("Error, invalid integer provided.")
										.setDescription("It looks like your response was either not a number or not part of the selection.")
										.addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${tSearchResults.length})`)
										.setTimestamp();
									return currentMessage.edit(errorMessage);
								}
								else {
									currentEvent.roster[index - 1].trackset = tSearchResults[parseInt(collected.first()) - 1];
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
					else if (tSearchResults.length > 0) {
						currentEvent.roster[index - 1].trackset = tSearchResults[0];
					}
					else {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, track requested not found.")
							.setDescription("Well that sucks.")
							.addField("Keywords Received", `\`${trackName.join(" ")}\``)
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					let currentTrack = require(`./tracksets/${currentEvent.roster[index - 1].trackset}`);
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully set the track of roster position ${index} to ${currentTrack["trackName"]}!`)
						.setImage(currentTrack["background"])
						.setTimestamp();
					break;
				case "setreward":
					if (!args[2]|| !args[3]) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						let errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, reward criteria not provided.")
							.setDescription("Provide one, please.")
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					let rewardType = args[3].toLowerCase();
					switch (rewardType) {
						case "money":
						case "fusetokens":
						case "trophies":
							let amount = args[4];
							if (isNaN(amount) || parseInt(amount) < 0 || (parseInt(amount) === 0 && rewardType !== "trophies")) {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								const errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, amount provided is either not a number or less than 1.")
									.setDescription("This amount should always be a positive number, i.e: `4`, `20`, etc. 0 is only for deleting the reward for trophies.")
									.setTimestamp();
								return message.channel.send(errorMessage);
							}
							
							let emoji;
							if (rewardType === "money") {
								emoji = message.client.emojis.cache.get("726017235826770021");
								if (currentEvent.roster[index - 1].reward.trophies) {
									currentEvent.roster[index - 1].reward = { money: parseInt(amount), trophies: currentEvent.roster[index - 1].reward.trophies };
								}
								else {
									currentEvent.roster[index - 1].reward = { money: parseInt(amount) };
								}
							}
							else if (rewardType === "fusetokens") {
								emoji = message.client.emojis.cache.get("726018658635218955");
								if (currentEvent.roster[index - 1].reward.trophies) {
									currentEvent.roster[index - 1].reward = { fuseTokens: parseInt(amount), trophies: currentEvent.roster[index - 1].reward.trophies };
								}
								else {
									currentEvent.roster[index - 1].reward = { fuseTokens: parseInt(amount) };
								};
							}
							else {
								emoji = message.client.emojis.cache.get("775636479145148418");
								if (parseInt(amount) === 0) {
									delete currentEvent.roster[index - 1].reward.trophies;
								}
								else {
									currentEvent.roster[index - 1].reward.trophies = parseInt(amount);
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
							let carName = args.slice(4, args.length).map(i => i.toLowerCase());
							let searchResults1 = new Set(carFiles);
							searchResults1.forEach(function(car) {
								if (carName.every(part => car.includes(part)) === false) {
									searchResults1.delete(car);
								}
							});

							if (searchResults1.size > 1) {
								let carList = "";
								let redirect = [];
								let i = 1;
								searchResults1.forEach(function(thing) {
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
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								const errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, car requested not found.")
									.setDescription("Well that sucks.")
									.addField("Keywords Received", `\`${carName.join(" ")}\``)
									.setTimestamp();
								return message.channel.send(errorMessage);
							}

							if (currentEvent.roster[index - 1].reward.trophies) {
								currentEvent.roster[index - 1].reward = { car: carFile, trophies: currentEvent.roster[index - 1].reward.trophies };
							}
							else {
								currentEvent.roster[index - 1].reward = { car: carFile };
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
							let packName = args.slice(4, args.length).map(i => i.toLowerCase());
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
											packFile = searchResults[parseInt(collected.first()) - 1];
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

							if (currentEvent.roster[index - 1].reward.trophies) {
								currentEvent.roster[index - 1].reward = { pack: packFile, trophies: currentEvent.roster[index - 1].reward.trophies };
							}
							else {
								currentEvent.roster[index - 1].reward = { pack: packFile };
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
											\`money\` - Awards the player money.
											\`fusetokens\` - Awards the player fuse tokens.
											\`trophies\` - Awards the player trophies.
											\`car\` - Awards the player a car.
											\`pack\` - Awards the player a pack.`)
								.setTimestamp();
							return message.channel.send(errorScreen);
					}
					break;
				case "regentracks":
					if (!args[2])  {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						let errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, track regeneration criteria not provided.")
							.setDescription("Provide one, please.")
							.setTimestamp();
						return message.channel.send(errorMessage);
					}
					
					let randomizeType = args[2].toLowerCase(), f;
					switch (randomizeType) {
						case "asphalt":
							f = tracksets.filter(track => {
								return track.includes("(rainy)") || !track.includes("(");
							});
							break;
						case "dirt":
							f = tracksets.filter(track => {
								return track.includes("(muddy)") || track.includes("(dirt)") || track.includes("(gravel)") || track.includes("(rainy gravel)");
							});
							break;
						case "snow":
							f = tracksets.filter(track => {
								return track.includes("(snowy)") || track.includes("(ice)");
							});
							break;
						default:
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorScreen = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, track regeneration criteria not found.")
								.setDescription(`Here is a list of track regeneration criterias. 
											\`asphalt\` - Generates asphalt tracksets.
											\`dirt\` - Generates dirt tracksets.
											\`snow\` - Generates snow tracksets.`)
								.setTimestamp();
							return message.channel.send(errorScreen);
					}
					for (i = 0; i < currentEvent.roster.length; i++) {
						currentEvent.roster[i].trackset = f[Math.floor(Math.random() * f.length)];
					}

					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully regenerated tracksets for the ${currentEvent.name} event!`)
						.setTimestamp();
					break;
				case "regenopponents":
					let regenSelect = carFiles;
					const carFilter = await db.get(`acc${message.author.id}.filter`);
					if (carFilter !== null) {
						for (const [key, value] of Object.entries(carFilter)) {
							switch (typeof value) {
								case "object":
									if (Array.isArray(value)) {
										regenSelect = regenSelect.filter(function (carFile) {
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
										regenSelect = regenSelect.filter(function (carFile) {
											let currentCar = require(`./cars/${carFile}`);
											return currentCar[key] >= value.start && currentCar[key.replace("count", "Count").replace("y", "Y")] <= value.end;
										});
									}
									break;
								case "string":
									regenSelect = regenSelect.filter(function (carFile) {
										let currentCar = require(`./cars/${carFile}`);
										return currentCar[key].toLowerCase() === value;
									});
									break;
								case "boolean":
									if (key === "isPrize") {
										regenSelect = regenSelect.filter(function (carFile) {
											let currentCar = require(`./cars/${carFile}`);
											return currentCar[key] === value;
										});
									}
									break;
								default:
									break;
							}
						}
					}
					if (regenSelect.length < 1) {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, it looks like there are no cars available with your filter settings.")
							.setDescription("Check your filter settings using `cd-filter view`.")
							.setTimestamp();
						return message.channel.send(errorScreen);
					}

					const opponents = [];
					for (let x = 0; x < currentEvent.roster.length; x++) {
						opponents[x] = regenSelect[Math.floor(Math.random() * regenSelect.length)];
					}
					opponents.sort(function (a, b) {
						const carA = require(`./cars/${a}`);
						const carB = require(`./cars/${b}`);

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
								return 1;
							}
							else {
								return -1;
							}
						}
					});

					for (let x = 0; x < currentEvent.roster.length; x++) {
						let upgradeIndex = Math.floor(Math.random() * 4);
						let upgradePattern = [0, 0, 0];
						switch (upgradeIndex) {
							case 0:
								break;
							case 1:
								upgradePattern = [3, 3, 3];
								break;
							case 2:
								upgradePattern = [6, 6, 6];
								break;
							case 3:
								let maxedTunes = [996, 969, 699];
								let i = Math.floor(Math.random() * maxedTunes.length);
								let car = require(`./cars/${opponents[x]}`);
								while (!car[`${maxedTunes[i]}TopSpeed`]) {
									i = Math.floor(Math.random() * maxedTunes.length);
								}
								upgradePattern = Array.from(maxedTunes[i].toString(), (val) => Number(val));
								break;
							default:
								break;
						}
						currentEvent.roster[x].car = opponents[x];
						currentEvent.roster[x].gearingUpgrade = upgradePattern[0];
						currentEvent.roster[x].engineUpgrade = upgradePattern[1];
						currentEvent.roster[x].chassisUpgrade = upgradePattern[2];
					}

					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully regenerated opponents for the ${currentEvent.name} event!`)
						.setTimestamp();
					break;
				default:
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, event editing criteria not found.")
						.setDescription(`Here is a list of event editing criterias. 
                                    \`name\` - The name of the event. 
									\`duration\` - How long an event is going to last for. 
									\`background\` - The event's background image (image links only). 
									\`setcar\` - Sets the opponent's car.
									\`setreward\` - Sets the reward of a round.
									\`settune\` - Sets the tune for the opponent's car.
									\`addreq\` - Adds a requirement to a round.
									\`removereq\` - Removes a requirement from a round.
									\`regentracks\` - Regenerates tracksets for every single round of an event.
									\`regenopponents\` - Regenerates opponents for every single round of an event.`)
						.setTimestamp();
					return message.channel.send(errorScreen);
			}

			if (!isError) {
				await db.set(`events.evnt${currentEvent.id}`, currentEvent);
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
}