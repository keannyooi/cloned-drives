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
	usage: "<event name> | <criteria> | <value>",
	args: 2,
	isExternal: false,
	adminOnly: true,
	description: "Edits an event.",
	async execute(message, args) {
		const db = message.client.db;
		const events = await db.get("events");
		let criteria = args[1].toLowerCase();
		let infoScreen;
		let keyword = args[0].toLowerCase();
		const filter = response => {
            return response.author.id === message.author.id;
        };

		const searchResults = events.filter(function(event) {
			return event.name.toLowerCase().includes(keyword);
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
						if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
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
							let currentEvent = searchResults[parseInt(collected.first()) - 1];
							editEvent(currentEvent, criteria, currentMessage);
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
			editEvent(searchResults[0], criteria);
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, 404 event not found.")
				.setDescription("Try checking again using `cd-events`.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		async function editEvent(currentEvent, criteria, currentMessage) {
			let index;
			if (criteria.startsWith("add") || criteria.startsWith("remove") || criteria.startsWith("set")) {
				if (isNaN(args[2]) || args[2] < 1 || args[2] > currentEvent.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, roster index provided not a number.")
						.setDescription("Roster indexes must be a number.")
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
					let oldName = currentEvent.name;
					let eventName = args.slice(2, args.length).join(" ");
					currentEvent.name = eventName;

					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully changed the event name from ${oldName} to ${eventName}!`)
						.setTimestamp();
					break;
				case "isactive":
					let value = args[2].toLowerCase();
					if (value !== "true" && value !== "false") {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, argument provided is not a boolean.")
							.setDescription("Booleans only have 2 states, true or false.")
							.setTimestamp();
						if (currentMessage) {
							return currentMessage.edit(errorScreen);
						}
						else {
							return message.channel.send(errorScreen);
						}
					}

					currentEvent.isActive = JSON.parse(value);
					if (currentEvent.isActive === true) {
						message.client.channels.cache.get("798776756952629298").send(`**The ${currentEvent.name} event has officially started!**`); 
					}     
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully set ${currentEvent.name}'s active status to \`${value}\`!`)
						.setTimestamp();
					break;
				case "background": {
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
						.setTitle("Successfully set the event's background image!")
						.setImage(imageLink)
						.setTimestamp();
					break;
				}
				case "setcar":
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
									currentEvent.roster[index - 1].car = redirect[parseInt(collected.first().content) - 1];
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
						currentEvent.roster[index - 1].car = Array.from(searchResults)[0];
					}
					else {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, car requested not found.")
							.setDescription("Well that sucks.")
							.setTimestamp();
						return message.channel.send(errorMessage);
					}

					currentEvent.roster[index - 1].gearingUpgrade = currentEvent.roster[index - 1].engineUpgrade = currentEvent.roster[index - 1].chassisUpgrade = 0;
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
					let req = args[3].toLowerCase().replace("type", "Type").replace("style", "Style").replace("count", "Count").replace("year", "Year").replace("pos", "Pos").replace("prize", "Prize").replace("stock", "Stock").replace("upgrade", "Upgrade").replace("max", "Max");
					switch (req) {
						case "make":
						case "Country":
						case "tags":
						case "tyreType":
							let argument = args.slice(4, args.length).join(" ").toLowerCase();
							let reqSearchResults = carFiles.filter(function(carFile) {
								let currentCar = require(`./cars/${carFile}`);
								if (Array.isArray(currentCar[req])) {
									return currentCar[req.replace("C", "c")].some(tag => tag.toLowerCase() === argument);
								}
								else {
									return currentCar[req.replace("C", "c")].toLowerCase() === argument;
								}
							});
							if (reqSearchResults.length > 0) {
								currentEvent.roster[index - 1].requirements[req.replace("C", "c")] = argument;
							}
							else {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								let errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, argument provided either does not exist in the game or is already part of the filter criteria.")
									.setDescription("Make sure the manufacturer name you provided is as of in the game.")
									.setTimestamp();
								return message.channel.send(errorMessage);
							}

							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully added a \`${req.replace("C", "c")}\` criteria to roster position ${index}!`)
								.setDescription(`Value: \`${argument}\``)
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
								currentEvent.roster[index - 1].requirements[req] = arg;
							}
							else {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								let errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, argument provided either does not exist in the game or is already part of the filter criteria.")
									.setDescription("Make sure the manufacturer name you provided is as of in the game.")
									.setTimestamp();
								return message.channel.send(errorMessage);
							}

							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully added a \`${req}\` criteria to roster position ${index}!`)
								.setDescription(`Value: \`${arg}\``)
								.setTimestamp();
							break;
						case "isPrize":
							if (args[4].toLowerCase() === "true" || args[4].toLowerCase() === "false") {
								currentEvent.roster[index - 1].requirements[req] = JSON.parse(args[4].toLowerCase());
								infoScreen = new Discord.MessageEmbed()
									.setColor("#03fc24")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle(`Successfully added a \`${req}\` criteria to roster position ${i}!`)
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
											\`tag\` - Filter by tag.`)
								.setTimestamp();
							return message.channel.send(errorScreen);
					}
					break;
				case "removereq":
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
					}
					break;
				case "settrack":
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
								if (isNaN(collected.first().content) || parseInt(collected.first()) > tSearchResults.length) {
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
					let rewardType = args[3].toLowerCase();
					switch (rewardType) {
						case "money":
						case "fusetokens":
						case "trophies":
							let amount = args[4];
							if (isNaN(amount) || parseInt(amount) < 0) {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								const errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, amount provided is either not a number or less than 0.")
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
										if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults1.size) {
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
										if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
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
				case "regenrounds":
					let randomizeType = args[2].toLowerCase();
					let carFile = [], tracks = [];
					switch (randomizeType) {
						case "asphalt":
							let f = tracksets.filter(track => {
								return track.includes("(rainy)") || !track.includes("(");
							});
							for (i = 0; i < currentEvent.roster.length; i++) {
								carFile[i] = carFiles[Math.floor(Math.random() * carFiles.length)];
								tracks[i] = f[Math.floor(Math.random() * f.length)];
							}
							break;
						case "dirt":
							let f1 = carFiles.filter(car => {
								let c = require(`./cars/${car}`);
								return c["tyreType"] === "Standard" || c["tyreType"] === "All-Surface" || c["tyreType"] === "Off-Road";
							});
							let f2 = tracksets.filter(track => {
								return track.includes("(muddy)") || track.includes("(dirt)") || track.includes("(gravel)") || track.includes("(rainy gravel)");
							});
							for (i = 0; i < currentEvent.roster.length; i++) {
								carFile[i] = f1[Math.floor(Math.random() * f1.length)];
								tracks[i] = f2[Math.floor(Math.random() * f2.length)];
							}
							break;
						case "snow":
							let f3 = carFiles.filter(car => {
								let c = require(`./cars/${car}`);
								return c["tyreType"] === "Standard" || c["tyreType"] === "All-Surface" || c["tyreType"] === "Off-Road";
							});
							let f4 = tracksets.filter(track => {
								return track.includes("(snowy)") || track.includes("(ice)");
							});
							for (i = 0; i < currentEvent.roster.length; i++) {
								carFile[i] = f3[Math.floor(Math.random() * f3.length)];
								tracks[i] = f4[Math.floor(Math.random() * f4.length)];
							}
							break;
						default:
							break;
					}

					carFile.sort(function (a, b) {
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

					for (x = 0; x < currentEvent.roster.length; x++) {
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
								let car = require(`./cars/${carFile[x]}`);
								while (!car[`${maxedTunes[i]}TopSpeed`]) {
									i = Math.floor(Math.random() * maxedTunes.length);
								}
								upgradePattern = Array.from(maxedTunes[i].toString(), (val) => Number(val));
								break;
							default:
								break;
						}
						currentEvent.roster[x] = ({
							car: carFile[x],
							gearingUpgrade: upgradePattern[0],
							engineUpgrade: upgradePattern[1],
							chassisUpgrade: upgradePattern[2],
							trackset: tracks[x],
							requirements: currentEvent.roster[x].requirements,
							reward: currentEvent.roster[x].reward
						});
					}

					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully regenerated opponents and tracksets for the ${currentEvent.name} event!`)
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
									\`isactive\` - Whether the event is playable or not.
									\`background\` - The event's background image (image links only). 
									\`setcar\` - Sets the opponent's car.
									\`setreward\` - Sets the reward of a round.
									\`settune\` - Sets the tune for the opponent's car.
									\`addreq\` - Adds a requirement to a round.
									\`removereq\` - Removes a requirement from a round.
									\`regenrounds\` - Regenrates opponents and tracksets for every single round of an event.`)
						.setTimestamp();
					return message.channel.send(errorScreen);
			}

			await db.set("events", events);
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