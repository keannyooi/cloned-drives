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
	adminOnly: false,
	description: "Sets up a filter for car lists. (WIP)",
	async execute(message, args) {
		const db = message.client.db;
		const criteria = args[0].toLowerCase();
		var filter = await db.get(`acc${message.author.id}.filter`) || {};
		var infoScreen, searchResults;

		console.log(filter);

		if (!args[1] && criteria !== "view") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, arguments provided insufficient.")
				.setDescription("Please specify the filter criteria that you want to add.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		switch (criteria) {
			case "make":
			case "country":
			case "tags":
				let argument = args.slice(1, args.length).join(", ").toLowerCase();
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					if (Array.isArray(currentCar[criteria])) {
						return currentCar[criteria].some(tag => tag === argument);
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
			case "modelyear":
			case "seatcount":
				const start = parseInt(args[1]);
				var end;
				if (criteria === "modelyear") end = 2030;
				else end = 9;
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
			case "drivetype":
			case "tyretype":
			case "bodytype":
			case "enginepos":
			case "fueltype":
			case "gc":
				let arg = args.slice(1, args.length).join(", ").toLowerCase();
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					return currentCar[criteria.replace("type", "Type").replace("pos", "Pos")].toLowerCase() === arg;
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
			case "disable":
			case "remove":
				switch (args[1].toLowerCase()) {
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
							delete filter[args[1].toLowerCase()];
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully removed all filters in the ${args[1].toLowerCase()} category!`)
								.setTimestamp();
						}
						else if (filter[args[1].toLowerCase()].some(criteria => criteria === args[2].toLowerCase())) {
							filter[args[1].toLowerCase()].splice(filter[args[1].toLowerCase()].indexOf(args[2].toLowerCase()), 1);
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully updated \`${args[1].toLowerCase()}\` criterias!`)
								.setTimestamp();
							if (filter[args[1].toLowerCase()].length === 0) {
								delete filter[args[1].toLowerCase()];
							}
							else {
								infoScreen.addField("Current List", filter[args[1].toLowerCase()].toString())
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
					case "modelyear":
					case "seatcount":
					case "enginepos":
					case "drivetype":
					case "tyretype":
					case "bodytype":
					case "fueltype":
					case "gc":
						delete filter[args[1].toLowerCase()];
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully reset \`${args[1].toLowerCase()}\` filters!`)
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
									\`tag\` - Filter by tag.`)
							.setTimestamp();
						return message.channel.send(errorScreen);
				}
				break;
			case "view":
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Current Filter")
					.setTimestamp();
				if (!filter || filter === {}) {
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
									\`tag\` - Filter by tag.  
                                    \`disable/remove\` - Removes current (or all) filter(s).`)
					.setTimestamp();
				return message.channel.send(errorScreen);
		}
		if (filter === {}) {
			await db.delete(`acc${message.author.id}.filter`);
		}
		else {
			await db.set(`acc${message.author.id}.filter`, filter);
		}
		return message.channel.send(infoScreen);
	}
}