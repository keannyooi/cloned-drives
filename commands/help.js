/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const { prefix } = require("../config.json");

module.exports = {
    name: "help",
    usage: "<command name goes here>",
    args: 0,
	isExternal: true,
    adminOnly: false,
    description: "...wait, what are you doing here?",
    execute(message, args) {
        const { commands } = message.client;
        const pageLimit = 10;
        const commandArray = [];
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
        };
        var data = "";

        var i = 0;
        commands.forEach(function(value) {
            commandArray[i] = value;
            i++;
        });

        if (!args.length || !isNaN(args[0])) {
            var page = 1;
			if (args[0]) {
				page = args[0];
			}

            const totalPages = Math.ceil(commandArray.length / pageLimit);
            commandDisplay(page);

            var listMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Welcome to the Help Section!")
                .setDescription("Here's a list of all the commands available.\n" + data)
                .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
                .setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            message.channel.send(listMessage).then(infoMessage => {
                console.log(reactionIndex);
                switch (reactionIndex) {
                    case 0:
                        break;
                    case 1:
                        infoMessage.react("➡️");
                        break;
                    case 2:
                        infoMessage.react("⬅️");
                        break;
                    case 3:
                        infoMessage.react("⬅️");
                        infoMessage.react("➡️");
                        break;
                    default:
                        break;
                }

                const collector = infoMessage.createReactionCollector(emojiFilter, { time: 60000 });
                collector.on("collect", reaction => {
                    if (reaction.emoji.name === "⬅️") {
                        page -= 1;
                    }
                    else if (reaction.emoji.name === "➡️") {
                        page += 1;
                    }
                    commandDisplay(page);
                    infoMessage.reactions.removeAll();

                    listMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Welcome to the Help Section!")
                        .setDescription("Here's a list of all the commands available.\n" + data)
                        .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
                        .setTimestamp();
                    infoMessage.edit(listMessage);

                    switch (reactionIndex) {
                        case 0:
                            break;
                        case 1:
                            infoMessage.react("➡️");
                            break;
                        case 2:
                            infoMessage.react("⬅️");
                            break;
                        case 3:
                            infoMessage.react("⬅️");
                            infoMessage.react("➡️");
                            break;
                        default:
                            break;
                    }
                });

                collector.on("end", () => {
                    console.log("end of collection");
                });
            });
        }
        else {
            const name = args[0].toLowerCase();
            const command = commands.get(name) || commands.find(c => c.aliases && c.aliases.includes(name));

            if (!command) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, 404 command not found.")
                    .setDescription("It looks like this command doesn't exist. Try referring to the command list.")
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }

            var aliases = "";
            if (command.aliases) {
                command.aliases.forEach(alias => {
                    aliases += alias + ", ";
                });
            }
            else {
                aliases = "None";
            }
			
			var cooldown = 5;
			if (command.cooldown) {
				cooldown = command.cooldown;
			}

            var syntax = "";
            if (command.args === 0) {
                syntax = `\`${prefix}${command.name}\``;
            }
            else {
                syntax = `\`${prefix}${command.name} ${command.usage}\``;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`${prefix}${command.name}`)
                .setDescription("Info about this command:")
                .addFields(
                    { name: "Aliases", value: aliases.slice(0, -2), inline: true },
                    { name: "Admin-only command?", value: command.adminOnly, inline: true },
					{ name: "Cooldown", value: `${cooldown} seconds`, inline: true },
                    { name: "Syntax", value: syntax },
                    { name: "Description", value: command.description }
                )
                .setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(infoScreen);
        }

        function commandDisplay(page) {
            var startsWith, endsWith;

            if (commandArray.length - pageLimit <= 0) {
                startsWith = 0;
                endsWith = commandArray.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (commandArray.length - (pageLimit * page) <= 0) {
                startsWith = pageLimit * (page - 1);
                endsWith = commandArray.length;
                reactionIndex = 2;
            }
            else {
                startsWith = pageLimit * (page - 1);
                endsWith = startsWith + pageLimit;
                reactionIndex = 3;
            }

            var i = startsWith;
            data = "";

            for (i = startsWith; i < endsWith; i++) {
                data += `${i + 1} - \`${commandArray[i].name}\``;
                if (commandArray[i].adminOnly) {
                    data += " ️️🛠️";
                }
                if (commandArray[i].isExternal) {
                    data += " 🛂";
                }
                data += "\n";
            }
            data += (`\n
                    🛠️ = Admin-only command, 🛂 = Can be used outside the Cloned Drives server.
                    Use \`${prefix}help <command name>\` to learn more about a specific command.`);
        }
    }
}