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
    name: "carinfo",
    aliases: ["cinfo"],
    usage: "<car name goes here>",
    args: 1,
	isExternal: true,
    adminOnly: false,
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
								displayInfo(searchResults[parseInt(collected.first().content) - 1], currentMessage);
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
				displayInfo(searchResults[0]);
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
		}

        async function displayInfo(car, currentMessage) {
			let garage = await message.client.db.get(`acc${message.author.id}.garage`);
			let currentCar = require(`./cars/${car}`);

            let rarity;
            if (currentCar["rq"] > 79) { //leggie
                rarity = message.client.emojis.cache.get("726025494138454097");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                rarity = message.client.emojis.cache.get("726025468230238268");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                rarity = message.client.emojis.cache.get("726025431937187850");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                rarity = message.client.emojis.cache.get("726025394104434759");
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                rarity = message.client.emojis.cache.get("726025302656024586");
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                rarity = message.client.emojis.cache.get("726025273421725756");
            }
            else { //common
                rarity = message.client.emojis.cache.get("726020544264273928");
            }

            let tags = "", description, mra, ola, accel;
            if (currentCar["tags"].length > 0) {
                tags = currentCar["tags"].join(", ");
            }
            else {
                tags = "None";
            }
            if (currentCar["description"].length > 0) {
                description = currentCar["description"];
            }
            else {
                description = "None";
            }
            if (currentCar["topSpeed"] >= 100) {
                mra = currentCar["mra"];
            }
            else {
                mra = "N/A";
            }
            if (currentCar["topSpeed"] >= 60) {
                ola = currentCar["ola"];
                accel = currentCar["0to60"]
            }
            else {
                ola = accel = "N/A";
            }

			let make = currentCar["make"];
			if (typeof make === "object") {
				make = currentCar["make"][0];
			}
            let currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`(${rarity} ${currentCar["rq"]}) ` + currentName)
                .setDescription("Stats of requested car:")
                .addFields(
                    { name: "Top Speed (MPH)", value: currentCar["topSpeed"], inline: true },
                    { name: "0-60MPH", value: accel, inline: true },
                    { name: "Handling", value: currentCar["handling"], inline: true },
                    { name: "Drive Type", value: currentCar["driveType"], inline: true },
                    { name: "Tyre Type", value: currentCar["tyreType"], inline: true },
                    { name: "Weight (kg)", value: currentCar["weight"], inline: true },
                    { name: "Ground Clearance", value: currentCar["gc"], inline: true },
                    { name: "Seat Count", value: currentCar["seatCount"], inline: true },
                    { name: "Body Style", value: currentCar["bodyStyle"], inline: true },
                    { name: "Engine Position", value: currentCar["enginePos"], inline: true },
                    { name: "Fuel Type", value: currentCar["fuelType"], inline: true },
                    { name: "TCS Enabled?", value: currentCar["tcs"], inline: true },
                    { name: "ABS Enabled?", value: currentCar["abs"], inline: true },
                    { name: "Tags", value: tags, inline: true },
                    { name: "Prize Car?", value: currentCar["isPrize"], inline: true },
					{ name: "Mid-Range Acceleration (MRA)", value: mra, inline: true },
                    { name: "Off-the-Line Acceleration (OLA)", value: ola, inline: true },
                    { name: "Description", value: description }
                )
                .setImage(currentCar["card"])
                .setTimestamp();

			let hasCar = garage.find(c => c.carFile === car);
			if (hasCar !== undefined) {
				let str = "";
				for (let [key, value] of Object.entries(hasCar)) {
					if (!isNaN(value)) {
						if (value > 0) {
							str += `${value}x ${key}, `;
						}
					}
				}
				infoScreen.setFooter(`✅ You own ${str.slice(0, -2)} of this car!`);
			}
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