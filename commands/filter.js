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
		const criteria = args[0].toLowerCase().replace("type", "Type").replace("count", "Count").replace("year", "Year").replace("pos", "Pos").replace("style", "Style").replace("prize", "Prize").replace("stock", "Stock").replace("upgrade", "Upgrade").replace("max", "Max").replace("owned", "Owned");
		let filter = await db.get(`acc${message.author.id}.filter`) || {};
		let infoScreen, searchResults;

		if (!args[1] && criteria !== "view") {
			let desc = `In fact, the \`${criteria}\` criteria doesn't exist. Here is a list of available filter criterias. 
						\`rq\` - Filter by RQ. Provide the start of the RQ range desired and the end after that.
                        \`make\` - Filter by make/manufacturer. Provide a manufacturer name after that.
						\`year\` - Filter by model year range. Provide the start of the model year range desired and the end after that.
						\`country\` - Filter by country origin. Provide a country code after that.
                        \`drivetype\` - Filter by drive type. Provide a drive type (\`FWD\`, \`RWD\`, etc.) after that.
						\`tyretype\` - Filter by tyre type. Provide one kind of tyre (\`standard\`, \`performance\`, etc.) after that.
						\`gc\` - Filter by ground clearance. Provide a ground clearance (\`low\`, \`medium\` or \`high\`) after that.
						\`bodystyle\` - Filter by body type. Provide a drive type (\`sedan\`, \`coupe\`, etc.) after that.
						\`seatcount\` - Filter by seat count. Provide the start of the seat count range desired and the end after that.
						\`enginepos\` - Filter by engine position. Provide an engine position (\`front\`, \`middle\`, etc.) after that.
						\`fueltype\` - Filter by fuel type. Provide a fuel type (\`petrol\`, \`electric\`, etc.) after that.
						\`isprize\` - Filter prize cars. Provide a boolean (\`true\` or \`false\`) after that.
						\`isstock\` - Filter stock cars. Provide a boolean (\`true\` or \`false\`) after that.
						\`isupgraded\` - Filter upgraded cars. Provide a boolean (\`true\` or \`false\`) after that.
						\`ismaxed\` - Filter maxed cars. Provide a boolean (\`true\` or \`false\`) after that.
						\`isowned\` - Filter cars that you own. Provide a boolean (\`true\` or \`false\`) after that.
						\`tags\` - Filter by tag. Provide the name of a car after that.
						\`search\` - Filter by a certain keyword inside a car's name. Provide a keyword that is found in a in-game car's name after that.`
			switch (criteria) {
				case "make":
				case "Country":
				case "tags":
				case "tyreType":
				case "driveType":
				case "bodyStyle":
				case "enginePos":
				case "fuelType":
				case "gc":
				case "search":
					desc = "For this criteria, key in **exactly** what you want to filter.";
					break;
				case "modelYear":
				case "seatCount":
				case "rq":
					desc = "For this criteria, key in the bottom end of the range, then the upper end. If you only want to filter the exact number, only type in said number.";
					break;
				case "isPrize":
				case "isStock":
				case "isUpgraded":
				case "isMaxed":
				case "isOwned":
					desc = "For this criteria, key in either `true` or `false`.";
					break;
				case "remove":
				case "disable":
					desc = "For this criteria, key in the criteria that you want to remove, then the arguments if necessary. If you want to reset all filters, just type `all`.";
					break;
				default:
					break;
			}
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			let errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, arguments provided insufficient.")
				.setDescription(desc)
				.addField("Criteria Received", `\`${criteria}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		switch (criteria) {
			case "make":
			case "Country":
			case "tags":
			case "tyreType":
				let argument = args.slice(1, args.length).join(" ").toLowerCase();
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					if (Array.isArray(currentCar[criteria])) {
						return currentCar[criteria.replace("C", "c")].some(tag => tag.toLowerCase() === argument);
					}
					else {
						return currentCar[criteria.replace("C", "c")].toLowerCase() === argument;
					}
				});
				if (searchResults.length > 0) {
					if (!filter[criteria.replace("C", "c")]) {
						filter[criteria.replace("C", "c")] = [argument];
					}
					else if (filter[criteria.replace("C", "c")] && !filter[criteria.replace("C", "c")].some(criteria => criteria === argument)) {
						filter[criteria.replace("C", "c")].push(argument);
					}
				}
				else {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, argument provided either does not exist in the game or is already part of the filter criteria.")
						.setDescription("Make sure the argument you provided is as of in the game.")
						.addField("Argument Received", `\`${argument}\` (argument provided does not exist in-game)`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}

				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully added \`${criteria.replace("C", "c")}\` criterias!`)
					.addField("Current List", filter[criteria.replace("C", "c")].join(", "))
					.setTimestamp();
				break;
			case "modelYear":
			case "seatCount":
			case "rq":
				const start = parseInt(args[1]);
				let end = start;
				if (args[2] && !isNaN(args[2])) {
					end = parseInt(args[2]);
				}

				if (isNaN(start)) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, criteria provided is not a number.")
						.setDescription(`\`${criteria.replace("c", "C")}\` criterias must be a number, i.e: \`1969\`, \`2001\`, etc.`)
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
						.addField("Argument Received", `\`${start}\` ~ \`${end}\` (try flipping the order)`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				filter[criteria] = { start: start, end: end };

				infoScreen = new Discord.MessageEmbed()
					.setColor("#03fc24")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`Successfully changed \`${criteria.replace("c", "C")}\` criterias!`)
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
				let arg = args[1].toLowerCase();
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					return currentCar[criteria].toLowerCase() === arg;
				});
				if (searchResults.length > 0) {
					filter[criteria] = arg;
				}
				else {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, argument provided either does not exist in the game or is already part of the filter criteria.")
						.setDescription("Make sure the argument you provided is as of in the game.")
						.addField("Argument Received", `\`${arg}\``)
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
			case "isStock":
			case "isUpgraded":
			case "isMaxed":
			case "isOwned":
				if (args[1].toLowerCase() === "true" || args[1].toLowerCase() === "false") {
					filter[criteria] = JSON.parse(args[1].toLowerCase());
					infoScreen = new Discord.MessageEmbed()
						.setColor("#03fc24")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`Successfully set the \`${criteria}\` criteria to \`${args[1]}\`!`)
						.setTimestamp();
				}
				else {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, argument provided is not a boolean.")
						.setDescription("Booleans only have 2 states, true or false.")
						.addField("Argument Received", `\`${args[1].toLowerCase()}\` (not a boolean)`)
						.setTimestamp();
					return message.channel.send(errorMessage);
				}
				break;
			case "search":
				let arg1 = args[1].toLowerCase();
				searchResults = carFiles.filter(function (carFile) {
					let currentCar = require(`./cars/${carFile}`);
					let make = currentCar["make"];
					if (typeof make === "object") {
						make = currentCar["make"][0];
					}
					let name = `${make} ${currentCar["model"]}`;
					return name.toLowerCase().includes(arg1);
				});
				if (searchResults.length > 0) {
					filter[criteria] = arg1;
				}
				else {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					let errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, argument provided either does not exist in the game or is already part of the filter criteria.")
						.setDescription("Make sure the argument you provided is as of in the game.")
						.addField("Argument Received", `\`${arg1}\``)
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
				const criteria2 = args[1].toLowerCase().replace("type", "Type").replace("count", "Count").replace("style", "Style").replace("year", "Year").replace("pos", "Pos").replace("prize", "Prize").replace("stock", "Stock").replace("upgrade", "Upgrade").replace("max", "Max").replace("owned", "Owned");
				switch (criteria2) {
					case "all":
						await db.delete(`acc${message.author.id}.filter`);
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Successfully reset all filters!")
							.setTimestamp();
						return message.channel.send(infoScreen);
					case "make":
					case "Country":
					case "tyreType":
					case "tags":
						if (!args[2]) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, filter not provided.")
								.setDescription("Please provide one. Just please.")
								.setTimestamp();
							return message.channel.send(errorMessage);
						}
						if (args[2].toLowerCase() === "all") {
							delete filter[criteria2.replace("C", "c")];
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully removed all filters in the ${criteria2.replace("C", "c")} category!`)
								.setTimestamp();
						}
						else if (filter[criteria2.replace("C", "c")].some(criteria => criteria === args[2].toLowerCase())) {
							filter[criteria2.replace("C", "c")].splice(filter[criteria2.replace("C", "c")].indexOf(args[2].toLowerCase()), 1);
							infoScreen = new Discord.MessageEmbed()
								.setColor("#03fc24")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle(`Successfully updated \`${criteria2.replace("C", "c")}\` criterias!`)
								.setTimestamp();
							if (filter[criteria2.replace("C", "c")].length === 0) {
								delete filter[criteria2.replace("C", "c")];
							}
							else {
								infoScreen.addField("Current List", filter[criteria2.replace("C", "c")].toString())
							}
						}
						else {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
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
					case "bodyStyle":
					case "fuelType":
					case "isPrize":
					case "isStock":
					case "isUpgraded":
					case "isMaxed":
					case "isOwned":
					case "gc":
					case "rq":
					case "search":
						delete filter[criteria2];
						infoScreen = new Discord.MessageEmbed()
							.setColor("#03fc24")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle(`Successfully reset \`${criteria2}\` filters!`)
							.setTimestamp();
						break;
					default:
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const errorScreen = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, criteria selected not found.")
							.setDescription(`Here is a list of filter criterias. 
									\`rq\` - Filter by RQ.
                                    \`make\` - Filter by make/manufacturer. Provide the manufacturer name that you want to remove, or type \`all\` to remove all criterias in this category.
									\`year\` - Filter by model year range.
									\`country\` - Filter by country origin. Provide the country code that you want to remove, or type \`all\` to remove all criterias in this category.
                                    \`drivetype\` - Filter by drive type. 
									\`tyretype\` - Filter by tyre type. Provide the type of tyre that you want to remove, or type \`all\` to remove all criterias in this category.
									\`gc\` - Filter by ground clearance.
									\`bodystyle\` - Filter by body type.  
									\`seatcount\` - Filter by seat count.
									\`enginepos\` - Filter by engine position.
									\`fueltype\` - Filter by fuel type.
									\`isprize\` - Filter prize cars.
									\`isstock\` - Filter stock cars.
									\`isupgraded\` - Filter upgraded cars.
									\`ismaxed\` - Filter maxed cars.
									\`isowned\` - Filter cars that you own.
									\`tags\` - Filter by tag. Provide the tag that you want to remove, or type \`all\` to remove all criterias in this category.
									\`search\` - Filter by keyword in car name.
									\`all\` - Remove all filters.`)
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
				break;
		}
		if (Object.keys(filter).length === 0) {
			await db.delete(`acc${message.author.id}.filter`);
		}
		else {
			await db.set(`acc${message.author.id}.filter`, filter);
		}
		message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
		return message.channel.send(infoScreen);
	}
}