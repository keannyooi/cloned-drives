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
	name: "filter",
	usage: "<criteria>",
	args: 1,
	isExternal: true,
	adminOnly: false,
	description: "Sets up a filter for car lists.",
	async execute(message, args) {
		const db = message.client.db;
		const criteria = args[0].toLowerCase().replace("type", "Type").replace("count", "Count").replace("year", "Year").replace("pos", "Pos").replace("prize", "Prize");
		var filter = await db.get(`acc${message.author.id}.filter`) || {};
		var infoScreen, searchResults;

		if (!args[1] && criteria !== "view" && criteria !== "isPrize") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, arguments provided insufficient.")
				.setDescription("What are you trying to filter?")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		switch (criteria) {
			case "make":
			case "country":
			case "tags":
			case "tyreType":
				let argument = args.slice(1, args.length).join(" ").toLowerCase();
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					if (Array.isArray(currentCar[criteria])) {
						return currentCar[criteria].some(tag => tag.toLowerCase() === argument);
					}
					else {
						return currentCar[criteria].toLowerCase() === argument;
					}
				});
				if (searchResults.length > 0) {
					if (!filter[criteria]) {
						filter[criteria] = [argument];
					}
					else if (filter[criteria] && !filter[criteria].some(criteria => criteria === argument)) {
						filter[criteria].push(argument);
					}
				}
				else {
					const errorMessage = new Discord.MessageEmbed()
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
					.setTitle(`Successfully added \`${criteria}\` criterias!`)
					.addField("Current List", filter[criteria].join(", "))
					.setTimestamp();
				break;
			case "modelYear":
			case "seatCount":
				const start = parseInt(args[1]);
				var end = start;
				if (args[2] && !isNaN(args[2])) {
					end = parseInt(args[2]);
				}

				if (isNaN(start)) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, criteria provided is not a number.")
						.setDescription(`\`${criteria.replace("c", "C")}\` criterias must be a number, i.e: \`1969\`, \`2001\`, etc.`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				else if (end < start) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, order is wrong.")
						.setDescription("Check if you got the order right: Smaller number first, bigger number later.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				filter[criteria] = { start: start, end: end };

				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully changed ${criteria.replace("c", "C")} criterias!`)
					.addFields(
						{ name: "Start", value: start, inline: true },
						{ name: "End", value: end, inline: true }
					)
					.setTimestamp();
				break;
			case "driveType":
			case "bodyType":
			case "enginePos":
			case "fuelType":
			case "gc":
				let arg = args.slice(1, args.length).join(", ").toLowerCase();
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					return currentCar[criteria].toLowerCase() === arg;
				});
				if (searchResults.length > 0) {
					filter[criteria] = arg;
				}
				else {
					const errorMessage = new Discord.MessageEmbed()
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
					.setTitle(`Successfully changed the \`${criteria}\` criteria!`)
					.addField("Current Criteria", filter[criteria])
					.setTimestamp();
				break;
			case "isPrize":
				filter[criteria] = true;
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully enabled the \`${criteria}\` criteria!`)
					.setTimestamp();
				break;
			case "disable":
			case "remove":
				const criteria2 = args[1].toLowerCase().replace("type", "Type").replace("count", "Count").replace("year", "Year").replace("pos", "Pos");
				switch (criteria2) {
					case "all":
						await db.delete(`acc${message.author.id}.filter`);
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Successfully reset all filters!")
							.setTimestamp();
						return message.channel.send(infoScreen);
					case "make":
					case "country":
					case "tyreType":
					case "tags":
						if (!args[2]) {
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, filter not provided.")
								.setDescription("Please provide one. Just please.")
								.setTimestamp();
							return message.channel.send(errorMessage);
						}
						if (args[2].toLowerCase() === "all") {
							delete filter[criteria2];
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully removed all filters in the ${criteria2} category!`)
								.setTimestamp();
						}
						else if (filter[criteria2].some(criteria => criteria === args[2].toLowerCase())) {
							filter[criteria2].splice(filter[criteria2].indexOf(args[2].toLowerCase()), 1);
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully updated \`${criteria2}\` criterias!`)
								.setTimestamp();
							if (filter[criteria2].length === 0) {
								delete filter[criteria2];
							}
							else {
								infoScreen.addField("Current List", filter[criteria2].toString())
							}
						}
						else {
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, 404 filter not found.")
								.setDescription("Try rechecking the filter list using `cd-filter view`.")
								.setTimestamp();
							return message.channel.send(errorMessage);
						}
						break;
					case "modelYear":
					case "seatCount":
					case "enginePos":
					case "driveType":
					case "bodyType":
					case "fuelType":
					case "isPrize":
					case "gc":
						delete filter[criteria2];
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully reset \`${criteria2}\` filters!`)
							.setTimestamp();
						break;
					default:
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, criteria selected not found.")
							.setDescription(`Here is a list of filter criterias. 
                                    \`make\` - Filter by make/manufacturer. 
									\`year\` - Filter by model year range.
									\`country\` - Filter by country origin. 
                                    \`drivetype\` - Filter by drive type. 
									\`tyretype\` - Filter by tyre type.
									\`gc\` - Filter by ground clearance.
									\`bodytype\` - Filter by body type.  
									\`seatcount\` - Filter by seat count.
									\`enginepos\` - Filter by engine position.
									\`fueltype\` - Filter by fuel type.
									\`isprize\` - Filter prize cars.
									\`tag\` - Filter by tag.`)
							.setTimestamp();
						return message.channel.send(errorScreen);
				}
				break;
			case "view":
				infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Current Filter")
					.setTimestamp();
				if (!filter || Object.keys(filter).length === 0) {
					infoScreen.setDescription("There are currently no activated filters.");
				}
				else {
					for (const [key, value] of Object.entries(filter)) {
						switch (typeof value) {
							case "object":
								if (Array.isArray(value)) {
									infoScreen.addField(key, value.join(", "), true);
								}
								else {
									infoScreen.addField(key, `${value.start} ~ ${value.end}`, true);
								}
								break;
							case "string":
							case "boolean":
								infoScreen.addField(key, value, true);
								break;
							default:
								break;
						}
					}
				}
				break;
			default:
				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, filter criteria not found.")
					.setDescription(`Here is a list of filter criterias. 
                                    \`make\` - Filter by make/manufacturer. 
									\`modelyear\` - Filter by model year range.
									\`country\` - Filter by country origin. 
                                    \`drivetype\` - Filter by drive type. 
									\`tyretype\` - Filter by tyre type.
									\`gc\` - Filter by ground clearance.
									\`bodytype\` - Filter by body type.  
									\`seatcount\` - Filter by seat count.
									\`enginepos\` - Filter by engine position.
									\`fueltype\` - Filter by fuel type.
									\`isprize\` - Filter prize cars.
									\`tag\` - Filter by tag.  
                                    \`disable/remove\` - Removes current (or all) filter(s).`)
					.setTimestamp();
				return message.channel.send(errorScreen);
		}
		if (Object.keys(filter).length === 0) {
			await db.delete(`acc${message.author.id}.filter`);
		}
		else {
			await db.set(`acc${message.author.id}.filter`, filter);
		}
		return message.channel.send(infoScreen);
	}
}