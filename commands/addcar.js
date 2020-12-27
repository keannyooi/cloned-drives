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
    name: "addcar",
    usage: "<username> | (optional) <amount> | <car name goes here>",
    args: 2,
	isExternal: false,
    adminOnly: true,
    description: "Adds a car into your garage. (data transferring)",
    execute(message, args) {
        const db = message.client.db;
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        var user, member;
        if (args.length) {
            var userName = args[0].toLowerCase();

            message.guild.members.cache.forEach(User => {
                if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                    console.log("found!");
                    user = User.user;
                    member = message.guild.member(User);
                }
            });
        }

        if (!user) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 user not found.")
                .setDescription("It looks like this user isn't in this server.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (user.bot) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, user requested is a bot.")
                .setDescription("Bots can't play Cloned Drives.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        var carName;
        var amount = 1;
        if (isNaN(args[1]) || !args[2]) {
            carName = args.slice(1, args.length).map(i => i.toLowerCase());
        }
        else {
            amount = args[1];
            carName = args.slice(2, args.length).map(i => i.toLowerCase());
        }

        if (amount > 10) {
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, you may not add that many cars at once.")
                .setDescription("The maximum amount of cars that you can add at once is limited to 10 in order to prevent something like this (https://discordapp.com/channels/711769157078876305/750304321832222811/781217938069782599).")
                .setTimestamp();
            return message.channel.send(errorScreen);
        }

        const searchResults = carFiles.filter(function (carFile) {
            return carName.every(part => carFile.includes(part));
        });

        if (searchResults.length > 1) {
            var carList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let car = require(`./cars/${searchResults[i - 1]}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
                carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
            }

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
                .setDescription(carList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: waitTime,
                    errors: ['time']
                })
                    .then(collected => {
                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
                            collected.first().delete();
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            currentCar = searchResults[parseInt(collected.first()) - 1];
                            collected.first().delete();
                            addCar(currentCar, currentMessage);
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
        else if (searchResults.length > 0) {
            addCar(searchResults[0]);
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, car requested not found.")
                .setDescription("Well that sucks.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function addCar(car, currentMessage) {
            let currentCar = require(`./cars/${car}`);
			let make = currentCar["make"];
			if (typeof make === "object") {
				make = currentCar["make"][0];
			}
            const currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;

            let i = 0;
            while (i < amount) {
                await db.push(`acc${user.id}.garage`, { carFile: `${currentName.toLowerCase()}.json`, gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 });
                i++;
            }
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully added ${amount} ${currentName} to ${member.displayName}'s garage.`)
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setImage(currentCar["card"])
                .setTimestamp();
            if (currentMessage) {
                return currentMessage.edit(infoScreen);
            }
            else {
                return message.channel.send(infoScreen);
            }
        }
    }
}