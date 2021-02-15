/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");

module.exports = {
    name: "sethand",
	aliases: ["sh"],
    usage: "<car name goes here>",
    args: 1,
	isExternal: true,
    adminOnly: false,
    description: "Sets your hand for quick race, random race and event gamemodes.",
    async execute(message, args) {
        const db = message.client.db;
        const garage = await db.get(`acc${message.author.id}.garage`);
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        let carName = args.map(i => i.toLowerCase());
		const searchResults = new Set(garage);
        searchResults.forEach(function (garageCar) {
            if (carName.every(part => garageCar.carFile.includes(part)) === false || garageCar["000"] + garageCar["333"] + garageCar["666"] + garageCar["996"] + garageCar["969"] + garageCar["699"] === 0) {
				searchResults.delete(garageCar);
			}
        });

        if (searchResults.size > 1) {
            let carList = "";
			let redirect = [];
			let i = 1;
           	searchResults.forEach(function (garageCar) {
                const car = require(`./cars/${garageCar.carFile}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
                carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
				redirect[i - 1] = garageCar;
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

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: waitTime,
                    errors: ["time"]
                })
                    .then(collected => {
						if (message.channel.type === "text") {
							collected.first().delete();
						}
                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.size || parseInt(collected.first().content) < 1) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            selectUpgrade(redirect[parseInt(collected.first().content) - 1], currentMessage);
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
            selectUpgrade(Array.from(searchResults)[0]);
        }
        else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 car not found.")
                .setDescription("Well that sucks.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

		async function selectUpgrade(currentCar, currentMessage) {
			let isOne = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && currentCar[m] >= 1);
			if (isOne.length === 1) {
				setHand(currentCar, isOne[0], currentMessage);
			}
			else {
				let upgradeList = "Type in any tune that is displayed here.\n";
				for (i = 0; i < isOne.length; i++) {
					upgradeList += `\`${isOne[i]}\`, `;
				}

				let infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Which tune to select?")
					.setDescription(upgradeList.slice(0, -2))
					.setTimestamp();
				let upgradeMessage;
				if (currentMessage && message.channel.type === "text") {
					upgradeMessage = await currentMessage.edit(infoScreen);
				}
				else {
					upgradeMessage = await message.channel.send(infoScreen);
				}

				message.channel.awaitMessages(filter, {
					max: 1,
					time: 60000,
					errors: ["time"]
				})
					.then(collected => {
						if (message.channel.type === "text") {
							collected.first().delete();
						}
						if (isOne.find(m => m === collected.first().content) === undefined) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, invalid selection provided.")
								.setDescription("It looks like your response was not part of the selection.")
								.setTimestamp();
							return upgradeMessage.edit(errorMessage);
						}
						else {
							setHand(currentCar, collected.first().content, upgradeMessage);
						}
					})
					.catch(() => {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const cancelMessage = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Action cancelled automatically.")
							.setTimestamp();
						return upgradeMessage.edit(cancelMessage);
					});
			}
		}

        async function setHand(currentCar, upgrade, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;
            let racehud = car[`racehud${upgrade}`];

            await db.set(`acc${message.author.id}.hand`, { carFile: currentCar.carFile, gearingUpgrade: parseInt(upgrade[0]), engineUpgrade: parseInt(upgrade[1]), chassisUpgrade: parseInt(upgrade[2]) });
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#03fc24")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully set your ${currentName} as your quick race, random race and event hand!`)
                .setImage(racehud)
                .setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            if (currentMessage) {
				return currentMessage.edit(infoScreen);
			}
			else {
				return message.channel.send(infoScreen);
			};
        }
    }
}