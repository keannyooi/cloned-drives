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
const { ErrorMessage, InfoMessage, rarityCheck, carName } = require("../sharedstuff.js");

module.exports = {
	name: "carinfo",
	aliases: ["cinfo"],
	usage: "<car name goes here>",
	args: 1,
	category: "Info",
	description: "Shows info about a specified car.",
	execute(message, args) {
		const waitTime = 60000;
		const filter = response => {
			return response.author.id === message.author.id;
		};

		if (args[0].toLowerCase() === "random") {
			displayInfo(carFiles[Math.floor(Math.random() * carFiles.length)]);
		}
		else {
			let carName = args.map(i => i.toLowerCase());
			const searchResults = carFiles.filter(function (carFile) {
				return carName.every(part => carFile.includes(part));
			});

			if (searchResults.length > 1) {
				let carList = "";
				for (i = 1; i <= searchResults.length; i++) {
					let car = require(`./cars/${searchResults[i - 1]}`);
					let make = car["make"];
					if (typeof make === "object") {
						make = car["make"][0];
					}
					carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
				}

				if (carList.length > 2048) {
					const errorMessage = new ErrorMessage(
						"too many search results.",
						"Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword."
					)
					return message.channel.send(errorMessage.create(message, true).addField("Total Characters in List", `\`${carList.length}\` > \`2048\``));
				}

				const infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Multiple cars found, please type one of the following.")
					.setDescription(carList)
					.setTimestamp();

				message.channel.send(infoScreen).then(currentMessage => {
					message.channel.awaitMessages(filter, {
						max: 1,
						time: waitTime,
						errors: ["time"]
					})
						.then(collected => {
							collected.first().delete();
							if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
								const errorMessage = new ErrorMessage(
									"invalid integer provided.",
									"It looks like your response was either not a number or not part of the selection.",
									collected.first().content
								)
								return currentMessage.edit(errorMessage.create(message, true));
							}
							else {
								displayInfo(searchResults[parseInt(collected.first().content) - 1], currentMessage);
							}
						})
						.catch(() => {
							const infoMessage = new InfoMessage(
								"Action cancelled automatically.",
								"I can only wait for your response for 1 minute.",
								collected.first().content
							)
							return currentMessage.edit(infoMessage.create(message, true));
						});
				});
			}
			else if (searchResults.length > 0) {
				displayInfo(searchResults[0]);
			}
			else {
				const errorMessage = new ErrorMessage(
					"car requested not found.",
					"Well that sucks.",
					carName.join(" "),
					carFiles.map(i => i.slice(0, -5))
				)
				return message.channel.send(errorMessage.create(message, true));
			}
		}

		async function displayInfo(car, currentMessage) {
			const playerData = await message.client.db.get(`acc${message.author.id}`);
			let garage = playerData.garage;
			let currentCar = require(`./cars/${car}`);
			const rarity = rarityCheck(message, currentCar["rq"]);

			let tags = "None", description = "None", mra = "N/A", ola = "N/A", topSpeed, accel = "N/A", weight;
			if (currentCar["tags"].length > 0) {
				tags = currentCar["tags"].join(", ");
			}
			if (currentCar["description"].length > 0) {
				description = currentCar["description"];
			}
			if (currentCar["topSpeed"] >= 100) {
				mra = currentCar["mra"];
			}
			if (currentCar["topSpeed"] >= 60) {
				if (playerData.settings.unitpreference === "metric") {
					accel = `${currentCar["0to60"]} (${(currentCar["0to60"] * 1.036).toFixed(1)})`;
				}
				else {
					accel = currentCar["0to60"];
				}
			}
			if (currentCar["topSpeed"] >= 30) {
				ola = currentCar["ola"];
			}

			if (playerData.settings.unitpreference === "metric") {
				topSpeed = `${currentCar["topSpeed"]}MPH (${Math.round(currentCar["topSpeed"] * 1.60934)}KM/H)`;
				weight = `${currentCar["weight"]}kg`;
			}
			else if (playerData.settings.unitpreference === "imperial") {
				topSpeed = `${currentCar["topSpeed"]}MPH`;
				weight = `${currentCar["weight"]}kg (${Math.round(currentCar["weight"] * 2.20462262185)}lbs)`;
			}
			else {
				topSpeed = `${currentCar["topSpeed"]}MPH`;
				weight = `${currentCar["weight"]}kg`;
			}

			const infoMessage = new InfoMessage(
				carName(message, currentCar, rarity),
				"Stats of requested car:",
				true
			)
				.create(message, true)
				.addFields(
					{ name: "Top Speed", value: topSpeed, inline: true },
					{ name: "0-60MPH (0-100KM/H)", value: accel, inline: true },
					{ name: "Handling", value: currentCar["handling"], inline: true },
					{ name: "Drive Type", value: currentCar["driveType"], inline: true },
					{ name: "Tyre Type", value: currentCar["tyreType"], inline: true },
					{ name: "Weight", value: weight, inline: true },
					{ name: "Ground Clearance", value: currentCar["gc"], inline: true },
					{ name: "Seat Count", value: currentCar["seatCount"], inline: true },
					{ name: "Body Style", value: currentCar["bodyStyle"], inline: true },
					{ name: "Engine Position", value: currentCar["enginePos"], inline: true },
					{ name: "Fuel Type", value: currentCar["fuelType"], inline: true },
					{ name: "TCS Enabled?", value: currentCar["tcs"], inline: true },
					{ name: "ABS Enabled?", value: currentCar["abs"], inline: true },
					{ name: "Tags", value: tags, inline: true },
					{ name: "Black Market Collection", value: currentCar["bmCollection"] || "None", inline: true },
					{ name: "Mid-Range Acceleration (MRA)", value: mra, inline: true },
					{ name: "Off-the-Line Acceleration (OLA)", value: ola, inline: true },
					{ name: "Description", value: description }
				)
				.setImage(currentCar["card"]);

			// let hasCar = garage.find(c => c.carFile === car);
			// if (hasCar !== undefined) {
			// 	let str = "";
			// 	for (let [key, value] of Object.entries(hasCar)) {
			// 		if (!isNaN(value)) {
			// 			if (value > 0) {
			// 				str += `${value}x ${key}, `;
			// 			}
			// 		}
			// 	}
			// 	infoMessage.setFooter(`✅ You own ${str.slice(0, -2)} of this car!`);
			// }
			if (currentMessage) {
				return currentMessage.edit(infoMessage);
			}
			else {
				return message.channel.send(infoMessage);
			}
		}
	}
}