const Discord = require("discord.js-light");
const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));

module.exports = {
    name: "openpack",
    usage: "<pack name goes here>",
    args: true,
    adminOnly: false,
    description: "Opens a pack. (EXPERIMENTAL)",
    execute(message, args) {
		const openPackCommand = require("./sharedfiles/openpack.js");
        var packName = args[0].toLowerCase();
        const searchResults = [];

        for (i = 1; i < args.length; i++) {
            packName += (" " + args[i].toLowerCase());
        }
        var counter = 0;
        var searched = 0;
        while (counter < packFiles.length) {
            var currentPack = require(`./packs/${packFiles[counter]}`);
            var currentName = currentPack["packName"].toLowerCase();
            if (currentName.includes(packName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = currentPack;
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentPack = searchResults[0];
            if (searched > 1) {
                var packList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    carList += `${i} - ` + searchResults[i - 1]["packName"] + "\n";
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple packs found, please type one of the following.")
                    .setDescription(packList)
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
                                currentPack = searchResults[parseInt(collected.first()) - 1];
                                openPackCommand.openPack(message, currentPack);
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
                openPackCommand.openPack(message, currentPack);
            }
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, pack requested not found.")
                .setDescription("Well that sucks.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
    }
}