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
	usage: "<criteria> <idk>",
	args: 1,
	adminOnly: true,
	description: "Sets up a filter for car lists. (WIP)",
	async execute(message, args) {
		const db = message.client.db;
		const criteria = args[0].toLowerCase();
		var filter = await db.get(`acc${message.author.id}.filter`);
		if (!filter && criteria !== ("remove" || "disable")) {
			filter = {
				make: [],
				startYear: 1800,
				endYear: 2030,
				country: [],
				drivetype: "None",
				tyretype: "None",
				gc: "None",
				bodytype: "None",
				seatcount: 0,
				fueltype: "None",
				tags: []
			};
		}
		var infoScreen, searchResults;

		switch (criteria) {
			case "make":
			case "country":
				if (!args[1]) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided insufficient.")
						.setDescription(`Please specify the ${criteria} that you want to add.`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				let argument = args.slice(1, args.length);
				argument = argument.toString().toLowerCase().replace(",", " ");
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					return currentCar[criteria].toLowerCase() === make;
				});
				if (searchResults.length > 0 && !filter[criteria].some(criteria => criteria === argument)) {
					filter[criteria].push(argument);
				}
				else {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, argument provided either does not exist in the game or is already part of the filter criteria.")
						.setDescription("Make sure the manufacturer name you provided is as of in the game.")
						.setTimestamp();
					if (filter[criteria].length > 0) {
						errorMessage.addField("Current Manufacturer List", filter[criteria].toString());
					}
					return message.channel.send(errorMessage);
				}

				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully added \`${criteria}\` criterias!`)
					.addField("Current List", filter[criteria].toString())
					.setTimestamp();
				break;
			case "year":
				if (!args[1]) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided insufficient.")
						.setDescription("Please specify the model year range")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				const startYear = args[1];
				var endYear = 2030;
				if (!isNaN(args[2])) {
					endYear = args[2];
				}

				if (isNaN(startYear)) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, model year criterias is not a number.")
						.setDescription("Model year criterias must be a number, i.e: `1969`, `2001`, etc.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				else if (endYear > startYear) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, unable to time travel.")
						.setDescription("Check if you got the order right: Starting year first, ending year later.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				filter.startYear = startYear;
				filter.endYear = endYear;

				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Successfully changed model year criterias!")
					.addFields(
						{ name: "Starting Year", value: startYear, inline: true },
						{ name: "Ending Year", value: endYear, inline: true }
					)
					.setTimestamp();
				break;
			case "drivetype":
			case "tyretype":
			case "bodytype":
			case "fueltype":
			case "gc":
				if (!args[1]) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided insufficient.")
						.setDescription(`Please specify the \`${criteria}\` criteria that you want to add.`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				let arg = args[1].toString().toLowerCase().replace(",", " ").replace("type", "Type");
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
						.addField("Current Criteria", filter[criteria])
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
			case "seatcount":
				if (!args[1]) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided insufficient.")
						.setDescription("Please specify the seat count.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				else if (isNaN(args[1]) || parseInt(args[1]) < 1 || parseInt(args[1]) > 9) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, seat count provided is either not a number or outside the boundary.")
						.setDescription("Seat count filters range between 1 and 9.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				filter.seatcount = parseInt(args[1]);
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Successfully changed the seat count criteria!")
					.setDescription(`Current seat count filter: \`${filter.seatcount}\``)
					.setTimestamp();
				break;
			case "tags":
				if (!args[1]) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided insufficient.")
						.setDescription("Please specify the tags that you want to add.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				let tag = args.slice(1, args.length);
				tag = tag.toString().toLowerCase().replace(",", " ");
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					return currentCar["tags"].some(t => t === tag);
				});
				if (searchResults.length > 0 && !filter.tags.some(criteria => criteria === tag)) {
					filter.tags.push(tag);
				}
				else {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, tag provided either does not exist in the game or is already part of the filter criteria.")
						.setTimestamp();
					if (filter.tags.length > 0) {
						errorMessage.addField("Current Tag List", filter.tags.toString());
					}
					return message.channel.send(errorMessage);
				}

				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Successfully added tag criterias!")
					.addField("Current Tag List", filter.tags.toString())
					.setTimestamp();
				break;
			case "disable":
			case "remove":
				if (!args[1]) {
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, arguments provided insufficient.")
						.setDescription("Please specify the criteria that you want to remove.")
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

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
						if (args[2].toLowerCase() === "all") {
							filter[criteria] = [];
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully removed all filters in the ${args[1].toLowerCase()} category!`)
								.setTimestamp();
						}
						else if (filter[criteria].some(criteria => criteria === args[2].toLowerCase())) {
							filter[criteria].splice(filter[criteria].indexOf(args[2].toLowerCase()), 1);
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully updated \`${args[1].toLowerCase()}\` criterias!`)
								.addField("Current List", filter.country.toString())
								.setTimestamp();
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
					case "year":
						filter.startYear = 1800;
						filter.endYear = 2030;
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Successfully reset model year filters!")
							.setTimestamp();
						break;
					case "drivetype":
					case "tyretype":
					case "bodytype":
					case "fueltype":
					case "gc":
						filter[criteria] = "None";
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully reset \`${criteria}\` year filters!`)
							.setTimestamp();
						break;
					case "seatcount":
						filter.seatCount = 0;
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Successfully reset the seat count filter!")
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
									\`fueltype\` - Filter by fuel type.
									\`tag\` - Filter by tag.`)
							.setTimestamp();
						return message.channel.send(errorScreen);
				}
				await db.set(`acc${message.author.id}.filter`, filter);
				break;
			case "view":
				let make = filter.make.toString().replace(",", ", ");
				let country = filter.country.toString().replace(",", ", ");
				let tags = filter.tags.toString().replace(",", ", ");
				if (make === "") {
					make = "None";
				}
				if (country === "") {
					country = "None";
				}
				if (tags === "") {
					tags = "None";
				}
				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Current Filter")
					.addFields(
						{ name: "Makes/Manufacturers", value: make, inline: true },
						{ name: "Model Year Range", value: `${filter.startYear} ~ ${filter.endYear}`, inline: true },
						{ name: "Countries", value: country, inline: true },
						{ name: "Drive Type", value: `${filter.drivetype}`, inline: true },
						{ name: "Tyre Type", value: `${filter.tyretype}`, inline: true },
						{ name: "Ground Clearance", value: `${filter.gc}`, inline: true },
						{ name: "Body Type", value: `${filter.bodytype}`, inline: true },
						{ name: "Seat Count", value: filter.seatcount, inline: true },
						{ name: "Fuel Type", value: `${filter.fueltype}`, inline: true },
						{ name: "Tags", value: tags, inline: false },
					)
					.setTimestamp();
				break;
			default:
				const errorScreen = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, filter criteria not found.")
					.setDescription(`Here is a list of filter criterias. 
                                    \`make\` - Filter by make/manufacturer. 
									\`year\` - Filter by model year range.
									\`country\` - Filter by country origin. 
                                    \`drivetype\` - Filter by drive type. 
									\`tyretype\` - Filter by tyre type.
									\`gc\` - Filter by ground clearance.
									\`bodytype\` - Filter by body type.  
									\`seatcount\` - Filter by seat count.
									\`fueltype\` - Filter by fuel type.
									\`tag\` - Filter by tag.  
                                    \`disable/remove\` - Removes current (or all) filter(s).`)
					.setTimestamp();
				return message.channel.send(errorScreen);
		}
		await db.set(`acc${message.author.id}.filter`, filter);
		return message.channel.send(infoScreen);
	}
}