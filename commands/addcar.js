const Discord = require("discord.js-light");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));

module.exports = {
    name: "addcar",
    usage: "<username> <car name goes here>",
    args: true,
    adminOnly: true,
    description: "Adds a car into your garage. (data transferring)",
    execute(message, args) {
		const db = message.client.db;
        var carName = args[1].toLowerCase();
        const searchResults = [];
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

		if (!args[1]) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, arguments provided insufficient.")
                .setDescription("Correct syntax: `cd-addcar <username> <car name goes here>`")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

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

        for (i = 2; i < args.length; i++) {
            carName += (" " + args[i].toLowerCase());
        }
        var counter = 0;
        var searched = 0;
        while (counter < carFiles.length) {
            var currentCar = require(`./cars/${carFiles[counter]}`);
            var currentName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
            if (currentName.includes(carName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = currentCar;
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentCar = searchResults[0];
            if (searched > 1) {
                var carList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    carList += `${i} - ` + searchResults[i - 1]["make"] + " " + searchResults[i - 1]["model"] + " (" + searchResults[i - 1]["modelYear"] + ")\n";
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple cars found, please type one of the following.")
                    .setDescription(carList)
                    .setTimestamp();

                message.channel.send(infoScreen).then(() => {
                    message.channel.awaitMessages(filter, {
                        max: 1,
                        time: waitTime,
                        errors: ['time']
                    })
                        .then(collected => {
                            if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Error, invalid integer provided.")
                                    .setDescription("It looks like your response was either not a number or not part of the selection.")
                                    .setTimestamp();
                                return message.channel.send(errorMessage);
                            }
                            else {
                                currentCar = searchResults[parseInt(collected.first()) - 1];
                                addCar(currentCar);
                            }
                        })
                        .catch(() => {
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled automatically.")
                                .setTimestamp();
                            return message.channel.send(cancelMessage);
                        });
                });
            }
            else {
                addCar(currentCar);
            }
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

        async function addCar(currentCar) {
            const currentName = `${currentCar["make"]} ${currentCar["model"]} (${currentCar["modelYear"]})`;

            await db.push(`acc${user.id}.garage`, { carFile: `${currentName.toLowerCase()}.json`, gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 });
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully added 1 ${currentName} to ${member.displayName}'s garage.`)
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setImage(currentCar["card"])
                .setTimestamp();
            return message.channel.send(infoScreen);
        }
    }
}