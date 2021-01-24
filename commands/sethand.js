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
    usage: "<car name goes here> | <selected upgrade>",
    args: 2,
	isExternal: true,
    adminOnly: false,
    description: "Sets your hand for quick race, random race and event gamemodes.",
    async execute(message, args) {
		console.time("e");
        const db = message.client.db;
        const garage = await db.get(`acc${message.author.id}.garage`);
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        let carName = args.slice(0, args.length - 1).map(i => i.toLowerCase());
		let upgrade = args[args.length - 1];
		const searchResults = new Set(garage);
        searchResults.forEach(function (garageCar) {
            if (carName.every(part => garageCar.carFile.includes(part)) === false || garageCar[upgrade] === 0) {
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
                    errors: ['time']
                })
                    .then(collected => {
						collected.first().delete();
                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.size) {
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            setHand(redirect[parseInt(collected.first()) - 1], upgrade, currentMessage);
                        }
                    })
                    .catch(() => {
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
            setHand(Array.from(searchResults)[0], upgrade);
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, car requested not found in requested tune.")
                .setDescription("Well that sucks.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function setHand(currentCar, upgrade, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;
            let racehud = car[`racehud${upgrade}`];;

            if (!racehud) {
                const errorScreen = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, the tuning stage you requested is not supported.")
                    .setDescription("There is a possiblity that the maxed tune your car has isn't available. If that's the case, report it to the devs.")
                    .setTimestamp();
				if (currentMessage) {
					return currentMessage.edit(errorScreen);
				}
				else {
					return message.channel.send(errorScreen);
				}
            }

            await db.set(`acc${message.author.id}.hand`, { carFile: currentCar.carFile, gearingUpgrade: parseInt(upgrade[0]), engineUpgrade: parseInt(upgrade[1]), chassisUpgrade: parseInt(upgrade[2]) });
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#03fc24")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully set your ${currentName} as your quick race, random race and event hand!`)
                .setImage(racehud)
                .setTimestamp();
			console.timeEnd("e");
            if (currentMessage) {
				return currentMessage.edit(infoScreen);
			}
			else {
				return message.channel.send(infoScreen);
			};
        }
    }
}